"""
installer/config/defaults.py
=============================
Per-mode default configurations for MAP2 installer stages.

Anaconda analogy:
  Anaconda ships with default package groups per installation variant
  (Server, Workstation, Minimal).  We do the same: each MAP2 mode has
  a predefined set of software components and recommended RT settings.

Users can override any default in the TUI or via a Kickstart YAML file.
"""

from __future__ import annotations

from .schema import (
    AudioConfig, BufferSize, InstallMode, InstallerConfig,
    RealTimeConfig, SampleRate, SoftwareConfig,
)

# ─────────────────────────────────────────────────────────────────────────────
# Mode-specific software defaults
# ─────────────────────────────────────────────────────────────────────────────

MODE_SOFTWARE_DEFAULTS: dict[InstallMode, SoftwareConfig] = {
    InstallMode.AUDIO: SoftwareConfig(
        install_lv2_plugins=True,
        install_avb=False,
        install_nam=True,
        install_frontend=False,   # No web UI needed on a headless audio node
        install_juce_engine=True,
        install_lcd=False,
        install_cluster_mgr=False,
    ),
    InstallMode.ALL_IN_ONE: SoftwareConfig(
        install_lv2_plugins=True,
        install_avb=True,
        install_nam=True,
        install_frontend=True,
        install_juce_engine=True,
        install_lcd=False,
        install_cluster_mgr=True,
    ),
    InstallMode.MANAGEMENT: SoftwareConfig(
        install_lv2_plugins=False,
        install_avb=True,         # Management node still needs AVB visibility
        install_nam=False,
        install_frontend=True,    # Web dashboard is the management UI
        install_juce_engine=False,
        install_lcd=False,
        install_cluster_mgr=True,
    ),
    InstallMode.CUSTOM: SoftwareConfig(),  # All False — user selects everything
}

# ─────────────────────────────────────────────────────────────────────────────
# RT defaults per mode
# ─────────────────────────────────────────────────────────────────────────────

MODE_RT_DEFAULTS: dict[InstallMode, RealTimeConfig] = {
    InstallMode.AUDIO: RealTimeConfig(
        # For dedicated audio nodes isolate two cores — the JUCE callback
        # thread runs on core 4 and the MIDI/IO thread on core 5.
        isolated_cores="4,5",
        housekeeping_cores="0-3",
        audio_rtprio=80,
        midi_rtprio=80,
        irq_rtprio=50,
        write_grub=True,
        max_cstate=1,         # Disable deep C-states — they add 100µs+ wakeup latency
    ),
    InstallMode.ALL_IN_ONE: RealTimeConfig(
        # All-in-one has web server + cluster manager competing for cores;
        # we still isolate 4,5 for audio but the system is less optimal.
        isolated_cores="4,5",
        housekeeping_cores="0-3",
        audio_rtprio=80,
        midi_rtprio=70,
        irq_rtprio=50,
        write_grub=True,
        max_cstate=1,
    ),
    InstallMode.MANAGEMENT: RealTimeConfig(
        # Management nodes don't run audio — no RT isolation needed.
        isolated_cores="",          # Empty = don't touch GRUB
        housekeeping_cores="0-7",
        audio_rtprio=20,
        midi_rtprio=20,
        irq_rtprio=20,
        write_grub=False,           # Don't isolate CPUs on management nodes
        max_cstate=9,               # Allow deep sleep — saves power on mgmt nodes
    ),
    InstallMode.CUSTOM: RealTimeConfig(),
}

# ─────────────────────────────────────────────────────────────────────────────
# Audio defaults per mode
# ─────────────────────────────────────────────────────────────────────────────

MODE_AUDIO_DEFAULTS: dict[InstallMode, AudioConfig] = {
    InstallMode.AUDIO: AudioConfig(
        # Target: sub-3ms round-trip (1.33 ms one-way at 64/48000)
        buffer_size=BufferSize.S64,
        sample_rate=SampleRate.SR48000,
    ),
    InstallMode.ALL_IN_ONE: AudioConfig(
        # Slightly larger buffer for stability with more background load
        buffer_size=BufferSize.S128,
        sample_rate=SampleRate.SR48000,
    ),
    InstallMode.MANAGEMENT: AudioConfig(
        buffer_size=BufferSize.S512,
        sample_rate=SampleRate.SR48000,
    ),
    InstallMode.CUSTOM: AudioConfig(),
}

# ─────────────────────────────────────────────────────────────────────────────
# Helper: build a default config for a given mode
# ─────────────────────────────────────────────────────────────────────────────

def config_for_mode(mode: InstallMode) -> InstallerConfig:
    """
    Return a pre-populated InstallerConfig for the given mode.

    Called by the Mode screen after the user selects a mode, so the
    subsequent screens start with sensible values already filled in.
    Users can still override anything.
    """
    cfg = InstallerConfig(mode=mode)
    cfg.software = MODE_SOFTWARE_DEFAULTS.get(mode, SoftwareConfig())
    cfg.realtime = MODE_RT_DEFAULTS.get(mode, RealTimeConfig())
    cfg.audio    = MODE_AUDIO_DEFAULTS.get(mode, AudioConfig())
    return cfg


# ─────────────────────────────────────────────────────────────────────────────
# Mode descriptions (shown in TUI mode picker)
# ─────────────────────────────────────────────────────────────────────────────

MODE_DESCRIPTIONS: dict[InstallMode, dict] = {
    InstallMode.AUDIO: {
        "label":    "Audio Processing Node",
        "summary":  "Dedicated real-time audio engine. No web UI. Lowest latency.",
        "detail":   (
            "Installs JUCE engine, LV2 plugins, NAM, PipeWire RT config, and CPU "
            "isolation for cores 4,5.  Target: <1.5 ms one-way latency.\n\n"
            "PRO TIP: Use this mode for stage or studio hardware that only runs "
            "MAP2 — nothing else competes for the isolated CPU cores.\n\n"
            "COMMON PITFALL: Don't run a web browser or other GUI apps on this "
            "host — they will cause xruns (audio dropouts) by waking up the "
            "non-isolated cores and triggering cache thrashing."
        ),
        "icon": "🎵",
    },
    InstallMode.ALL_IN_ONE: {
        "label":    "All-In-One Station",
        "summary":  "Audio engine + web UI + cluster manager on one machine.",
        "detail":   (
            "Full MAP2 stack on a single host.  Good for development, rehearsal "
            "rooms, or small venues where one machine does everything.\n\n"
            "PRO TIP: Use a machine with ≥8 cores so the web server and audio "
            "engine don't compete.  A buffer size of 128 samples (2.67 ms) is "
            "safer than 64 in this mode due to background load.\n\n"
            "COMMON PITFALL: Avoid running Docker or VMs on this host — their "
            "kernel threads can bypass CPU isolation and cause dropouts."
        ),
        "icon": "🖥️",
    },
    InstallMode.MANAGEMENT: {
        "label":    "Management / Orchestration Node",
        "summary":  "Cluster manager + web UI only. No audio engine.",
        "detail":   (
            "Installs the MAP2 web dashboard, cluster manager, and AVB network "
            "monitoring tools.  No JUCE engine or RT configuration.\n\n"
            "PRO TIP: Management nodes can be VMs or low-power hardware — they "
            "don't need real-time scheduling.\n\n"
            "COMMON PITFALL: Management nodes still need network connectivity to "
            "all audio nodes.  Make sure firewall rules allow port 8080."
        ),
        "icon": "🖧",
    },
    InstallMode.CUSTOM: {
        "label":    "Custom / Advanced",
        "summary":  "Select individual components. For experts only.",
        "detail":   (
            "Start from a blank slate and choose exactly which components to "
            "install.  All software and RT options are off by default.\n\n"
            "PRO TIP: Use this mode when integrating MAP2 into an existing "
            "system or when you only need specific subsystems.\n\n"
            "COMMON PITFALL: Missing dependencies between components won't be "
            "caught automatically — ensure JUCE engine is installed if LV2 "
            "plugins are selected."
        ),
        "icon": "⚙️",
    },
}
