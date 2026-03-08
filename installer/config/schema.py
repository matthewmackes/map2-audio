"""
installer/config/schema.py
==========================
Pydantic v2 data models for the MAP2 installer configuration.

Anaconda/Kickstart analogy:
  In Fedora's Anaconda, a Kickstart file is the canonical description of
  everything that will happen during installation (language, timezone, storage,
  packages, users, etc.).  Here we do the same thing in Python with Pydantic:
  every screen's choices are validated and stored in a single InstallerConfig
  object that can be serialised to YAML (kickstart.py) and replayed headlessly.

Design decisions:
  - Pydantic v2 used for strict typing + automatic validation error messages.
  - Each sub-model maps 1:1 to a stage screen so screens only need to import
    the relevant sub-model, not the whole config graph.
  - Optional fields default to None so unattended installs can skip screens
    that the mode doesn't need (e.g. management mode skips audio settings).
  - Validators enforce enterprise-grade constraints inline with helpful messages
    that surface directly in the TUI.
"""

from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ─────────────────────────────────────────────────────────────────────────────
# Enumerations
# ─────────────────────────────────────────────────────────────────────────────

class InstallMode(str, Enum):
    """
    MAP2 operating modes (mirrors map2-mode.sh).

    audio       – Pure audio processing node (lowest latency, most isolated)
    all_in_one  – Audio engine + web frontend + management on one machine
    management  – Cluster management / orchestration only (no audio engine)
    custom      – User selects individual components
    """
    AUDIO = "audio"
    ALL_IN_ONE = "all-in-one"
    MANAGEMENT = "management"
    CUSTOM = "custom"


class BufferSize(int, Enum):
    """
    Standard JACK/PipeWire buffer sizes in samples.
    Smaller = lower latency but higher CPU load and dropout risk.
    64 samples @ 48 kHz = 1.33 ms (target for MAP2 pro mode).
    """
    S32   = 32
    S64   = 64
    S128  = 128
    S256  = 256
    S512  = 512
    S1024 = 1024


class SampleRate(int, Enum):
    """Standard professional audio sample rates."""
    SR44100 = 44100
    SR48000 = 48000
    SR88200 = 88200
    SR96000 = 96000


class SchedPolicy(str, Enum):
    """
    Linux real-time scheduling policies.
    FIFO = First-In-First-Out (hard RT, preferred for audio callbacks).
    RR   = Round-Robin (soft RT, slightly fairer under load).
    """
    FIFO = "FIFO"
    RR   = "RR"


# ─────────────────────────────────────────────────────────────────────────────
# Sub-models (one per installer stage)
# ─────────────────────────────────────────────────────────────────────────────

class LocaleConfig(BaseModel):
    """Stage 00/01: Language and timezone."""
    language: str = Field(default="en_US.UTF-8", description="System locale (LANG)")
    timezone: str = Field(default="UTC", description="Timezone (timedatectl format)")
    keymap:   str = Field(default="us",  description="Console keymap")


class NetworkConfig(BaseModel):
    """Stage 02: Network configuration."""
    hostname:        str  = Field(default="map2-audio", description="System hostname")
    configure_avb:   bool = Field(default=False, description="Set up AVB/TSN network interface")
    avb_interface:   Optional[str] = Field(default=None, description="NIC for AVB (e.g. enp0s25)")
    proxy_url:       Optional[str] = Field(default=None, description="HTTP proxy (if any)")
    # Validated at runtime — schema just holds the value
    connectivity_ok: bool = Field(default=False, description="Live ping test result (set by screen)")


class StorageConfig(BaseModel):
    """Stage 03: Storage and installation paths."""
    install_dir: Path = Field(
        default=Path("/home/mm/map2-audio"),
        description="Repository / install root",
    )
    venv_dir:    Path = Field(
        default=Path("/home/mm/map2-audio/.venv"),
        description="Python virtual environment path",
    )
    log_dir:     Path = Field(
        default=Path("/var/log/map2"),
        description="Runtime log directory",
    )
    installer_log: Path = Field(
        default=Path("/var/log/map2-installer.log"),
        description="Installer log file (written during install stage)",
    )


class SoftwareConfig(BaseModel):
    """Stage 04: Component / software selection."""
    install_lv2_plugins:  bool = Field(default=True,  description="Install LV2/VST3 plugin suite")
    install_avb:          bool = Field(default=False, description="Enable AVB/IEEE-1722 networking")
    install_nam:          bool = Field(default=True,  description="Install Neural Amp Modeler (NAM)")
    install_frontend:     bool = Field(default=True,  description="Build React web frontend")
    install_juce_engine:  bool = Field(default=True,  description="Build JUCE C++ audio engine")
    install_lcd:          bool = Field(default=False, description="Install LCD display support")
    install_cluster_mgr:  bool = Field(default=False, description="Install cluster management service")
    extra_packages:       List[str] = Field(default_factory=list, description="Additional dnf packages")


class AudioConfig(BaseModel):
    """
    Stage 05: Audio interface and latency configuration.

    The buffer_size is the single most important latency lever:
      latency_ms = (buffer_size / sample_rate) * 1000
    At 64 samples / 48000 Hz = 1.333 ms per period.

    PipeWire uses 'quantum' for the same concept.
    """
    audio_interface:  str         = Field(default="auto", description="ALSA device or 'auto'")
    buffer_size:      BufferSize  = Field(default=BufferSize.S64)
    sample_rate:      SampleRate  = Field(default=SampleRate.SR48000)
    audio_group_user: str         = Field(default="mm", description="User to add to audio/jackuser groups")

    @property
    def latency_ms(self) -> float:
        """Computed one-way latency in milliseconds."""
        return round((self.buffer_size.value / self.sample_rate.value) * 1000, 3)

    @property
    def pipewire_latency_env(self) -> str:
        """Value for PIPEWIRE_LATENCY env var."""
        return f"{self.buffer_size.value}/{self.sample_rate.value}"


class RealTimeConfig(BaseModel):
    """
    Stage 06: Linux real-time / low-latency kernel configuration.

    Anaconda analogy: Like Anaconda's storage module validating mount points
    before formatting, we validate CPU core ranges before writing GRUB cmdline —
    a mistake here requires a reboot to fix.

    Key concepts taught to users:
      - isolcpus: Remove cores from the general scheduler so ONLY our audio
        thread runs there. Without this, OS housekeeping tasks share the core
        and cause 'xruns' (audio dropouts).
      - nohz_full: Disable periodic timer interrupts on isolated cores.
        Each timer tick adds ~10 µs of jitter.
      - threadirqs: Force hardware IRQs to be handled by kernel threads,
        allowing us to set their priority and affinity.
      - preempt=full: Make the kernel fully preemptible — a running kernel
        task can be interrupted if a higher-priority task wakes up.
    """
    isolated_cores:   str  = Field(default="4,5",  description="CPU cores isolated for audio (isolcpus=)")
    housekeeping_cores: str = Field(default="0-3", description="CPU cores for OS tasks")
    audio_rtprio:     int  = Field(default=80,  ge=1, le=99, description="SCHED_FIFO priority for audio callback")
    midi_rtprio:      int  = Field(default=80,  ge=1, le=99, description="SCHED_FIFO priority for MIDI thread")
    irq_rtprio:       int  = Field(default=50,  ge=1, le=99, description="SCHED_FIFO priority for USB IRQ thread")
    sched_policy:     SchedPolicy = Field(default=SchedPolicy.FIFO)
    enable_rtkit:     bool = Field(default=True,  description="Enable rtkit-daemon for RT elevation")
    write_grub:       bool = Field(default=True,  description="Write isolcpus/nohz_full to GRUB cmdline")
    preempt_model:    str  = Field(default="full", description="Kernel preemption model (full/voluntary/none)")
    max_cstate:       int  = Field(default=1,  ge=0, le=9,  description="Intel C-state limit (1=disable deep sleep)")

    @field_validator("isolated_cores", "housekeeping_cores")
    @classmethod
    def validate_core_range(cls, v: str) -> str:
        """
        Validate CPU core range strings like '4,5' or '0-3'.
        Empty string means "don't isolate" — valid for management mode.
        Invalid non-empty ranges written to GRUB will silently be ignored by
        the kernel, leaving audio on non-isolated cores — a subtle but serious bug.
        """
        import re
        if v == "":
            return v  # Empty = don't write isolcpus (management mode)
        if not re.match(r'^(\d+(-\d+)?)(,\d+(-\d+)?)*$', v):
            raise ValueError(
                f"Invalid CPU core range '{v}'. "
                "Use comma-separated integers or ranges like '4,5' or '0-3,6'."
            )
        return v

    @property
    def grub_cmdline_additions(self) -> str:
        """Generate the GRUB_CMDLINE_LINUX additions for RT audio."""
        return (
            f"isolcpus={self.isolated_cores} "
            f"nohz_full={self.isolated_cores} "
            f"rcu_nocbs={self.isolated_cores} "
            f"threadirqs "
            f"intel_idle.max_cstate={self.max_cstate} "
            f"processor.max_cstate={self.max_cstate} "
            f"preempt={self.preempt_model}"
        )


class UserConfig(BaseModel):
    """Stage 07: User account configuration."""
    username:       str  = Field(default="mm",    description="Primary system user")
    add_audio_group: bool = Field(default=True,   description="Add user to 'audio' and 'jackuser' groups")
    add_sudo:        bool = Field(default=True,   description="Add user to sudoers")
    # Password stored as hash in production; plain text only in dry-run / dev
    password_hash:   Optional[str] = Field(default=None, description="SHA-512 password hash (never plain text)")

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        import re
        if not re.match(r'^[a-z_][a-z0-9_-]{0,30}$', v):
            raise ValueError(
                "Username must start with a letter/underscore, "
                "contain only lowercase letters, digits, - or _, max 31 chars."
            )
        return v


# ─────────────────────────────────────────────────────────────────────────────
# Root installer config — the Kickstart equivalent
# ─────────────────────────────────────────────────────────────────────────────

class InstallerConfig(BaseModel):
    """
    Root configuration model — the MAP2 equivalent of a Kickstart file.

    This single object fully describes what the installer will do.
    It can be:
      1. Built interactively screen-by-screen (TUI mode)
      2. Loaded from a YAML file (--unattended mode)
      3. Generated from the current system state (--generate-ks)

    Serialise with: config.model_dump()
    Load from dict: InstallerConfig.model_validate(d)
    """
    # Metadata
    installer_version: str = Field(default="1.0.0", description="Installer schema version")
    generated_at:      Optional[str] = Field(default=None, description="ISO timestamp of generation")
    dry_run:           bool = Field(default=False, description="If True, no changes are written to disk")

    # Stage sub-configs
    mode:       InstallMode   = Field(default=InstallMode.AUDIO)
    locale:     LocaleConfig  = Field(default_factory=LocaleConfig)
    network:    NetworkConfig = Field(default_factory=NetworkConfig)
    storage:    StorageConfig = Field(default_factory=StorageConfig)
    software:   SoftwareConfig = Field(default_factory=SoftwareConfig)
    audio:      AudioConfig   = Field(default_factory=AudioConfig)
    realtime:   RealTimeConfig = Field(default_factory=RealTimeConfig)
    user:       UserConfig    = Field(default_factory=UserConfig)

    @model_validator(mode="after")
    def apply_mode_defaults(self) -> "InstallerConfig":
        """
        Apply mode-specific defaults after the model is constructed.
        This mirrors how Kickstart %pre sections can set variables that
        later sections inherit.

        management mode: no JUCE engine, no audio config needed.
        audio mode: no frontend, no cluster manager by default.
        """
        if self.mode == InstallMode.MANAGEMENT:
            self.software.install_juce_engine = False
            self.software.install_lv2_plugins = False
            self.software.install_nam = False
            self.software.install_cluster_mgr = True
        elif self.mode == InstallMode.AUDIO:
            self.software.install_frontend = False
            self.software.install_cluster_mgr = False
        return self
