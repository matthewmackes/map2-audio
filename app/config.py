"""
Centralized Configuration System for MAP2 Audio Platform

Features:
- JSON file persistence with automatic backup
- Environment variable overrides (MAP2_* prefix)
- Type-safe accessors with validation
- Observer pattern for change notifications
- Schema definition with defaults and descriptions
- Multiple config sections with dot notation access
- Singleton pattern for global access
- Database integration for session-specific settings
"""

import json
import logging
import os
import copy
from pathlib import Path
from typing import Any, Dict, Optional, List, Callable, TypeVar, Generic, Set
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)

T = TypeVar('T')


# ============================================================================
# Configuration Schema Definition
# ============================================================================

@dataclass
class ConfigOption:
    """Definition of a single configuration option."""
    key: str
    default: Any
    description: str
    value_type: type
    env_var: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    choices: Optional[List[Any]] = None
    sensitive: bool = False  # Don't log sensitive values
    restart_required: bool = False  # Requires restart to apply
    locked: bool = False  # Locked settings cannot be changed at runtime (systemd service only)


class ConfigSection(Enum):
    """Configuration sections."""
    APP = "app"
    AUDIO = "audio"
    MIDI = "midi"
    LCD = "lcd"
    BACKEND = "backend"
    DATABASE = "database"
    AUTOMATION = "automation"
    PLUGINS = "plugins"
    WEBSOCKET = "websocket"
    MONITORING = "monitoring"
    BACKUP = "backup"
    STORAGE = "storage"
    AVB = "avb"  # AVB/TSN network audio transport
    SPDIF = "spdif"  # Digital S/PDIF transport configuration
    CLOCK_SYNC = "clock_sync"  # Cross-transport sample-rate/clock profile mapping


# Configuration schema with all options
CONFIG_SCHEMA: Dict[str, ConfigOption] = {
    # Application settings
    "app.name": ConfigOption(
        key="app.name",
        default="Mackes Audio Platform V2",
        description="Application display name",
        value_type=str,
    ),
    "app.version": ConfigOption(
        key="app.version",
        default="1.0.0-beta",
        description="Application version",
        value_type=str,
    ),
    "app.debug": ConfigOption(
        key="app.debug",
        default=False,
        description="Enable debug mode",
        value_type=bool,
        env_var="MAP2_DEBUG",
    ),
    "app.log_level": ConfigOption(
        key="app.log_level",
        default="INFO",
        description="Logging level",
        value_type=str,
        env_var="MAP2_LOG_LEVEL",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
    ),

    # Audio settings
    "audio.engine": ConfigOption(
        key="audio.engine",
        default="juce",
        description="Audio engine to use: 'juce' (recommended) or 'python' (deprecated)",
        value_type=str,
        env_var="MAP2_AUDIO_ENGINE",
        choices=["juce", "python"],
        restart_required=True,
    ),
    "audio.allow_python_io": ConfigOption(
        key="audio.allow_python_io",
        default=False,
        description="Allow deprecated Python audio I/O (NOT recommended for production)",
        value_type=bool,
        env_var="MAP2_ALLOW_PYTHON_IO",
        restart_required=True,
    ),
    "audio.sample_rate": ConfigOption(
        key="audio.sample_rate",
        default=48000,
        description="Audio sample rate in Hz (LOCKED for Tier A performance - set in systemd service only)",
        value_type=int,
        env_var="MAP2_SAMPLE_RATE",
        choices=[44100, 48000, 88200, 96000, 192000],
        restart_required=True,
        locked=True,  # Tier A: prevent runtime changes, must restart service
    ),
    "audio.buffer_size": ConfigOption(
        key="audio.buffer_size",
        default=64,
        description="Audio buffer size in samples (LOCKED at 64 for <3ms latency - set in systemd service only)",
        value_type=int,
        env_var="MAP2_BUFFER_SIZE",
        choices=[64, 128, 256, 512, 1024, 2048],
        restart_required=True,
        locked=True,  # Tier A: 64 samples @ 48kHz = 1.33ms - prevent runtime changes
    ),
    "audio.channels": ConfigOption(
        key="audio.channels",
        default=2,
        description="Number of audio channels",
        value_type=int,
        min_value=1,
        max_value=32,
        restart_required=True,
    ),
    "audio.device": ConfigOption(
        key="audio.device",
        default=None,
        description="Audio device name (None for PipeWire/system default via JACK)",
        value_type=str,
        env_var="MAP2_AUDIO_DEVICE",
        restart_required=True,
    ),
    "audio.backend": ConfigOption(
        key="audio.backend",
        default="pipewire",
        description="Audio backend (LOCKED at 'pipewire' for Tier A stability - set in systemd service only)",
        value_type=str,
        env_var="MAP2_AUDIO_BACKEND",
        choices=["pipewire", "jack", "alsa"],
        restart_required=True,
        locked=True,  # Tier A: prevent runtime backend switching
    ),
    "audio.pipewire_use_jack": ConfigOption(
        key="audio.pipewire_use_jack",
        default=True,
        description="Use PipeWire's JACK compatibility layer (recommended)",
        value_type=bool,
        env_var="MAP2_PIPEWIRE_USE_JACK",
        restart_required=True,
    ),
    "audio.latency_compensation": ConfigOption(
        key="audio.latency_compensation",
        default=0.0,
        description="Additional latency compensation in ms",
        value_type=float,
        min_value=-100.0,
        max_value=100.0,
    ),
    "audio.sync_profile": ConfigOption(
        key="audio.sync_profile",
        default="legacy_fixed_48k",
        description="Named audio synchronization profile identifier",
        value_type=str,
    ),
    "audio.clock_master": ConfigOption(
        key="audio.clock_master",
        default="internal",
        description="Clock authority for transport mapping (internal, spdif, avb, hybrid)",
        value_type=str,
        choices=["internal", "spdif", "avb", "hybrid"],
    ),
    "audio.bits_per_sample": ConfigOption(
        key="audio.bits_per_sample",
        default=24,
        description="Default PCM bit depth for digital transport mapping",
        value_type=int,
        choices=[16, 20, 24, 32],
    ),
    "audio.allowed_rates_hz": ConfigOption(
        key="audio.allowed_rates_hz",
        default=[48000],
        description="Allowed sample-rate set for profile-driven PipeWire mapping",
        value_type=list,
    ),

    # MIDI settings
    "midi.enabled": ConfigOption(
        key="midi.enabled",
        default=True,
        description="Enable MIDI functionality",
        value_type=bool,
        env_var="MAP2_MIDI_ENABLED",
    ),
    "midi.learn_timeout": ConfigOption(
        key="midi.learn_timeout",
        default=10.0,
        description="MIDI learn mode timeout in seconds",
        value_type=float,
        min_value=1.0,
        max_value=60.0,
    ),
    "midi.cc14_enabled": ConfigOption(
        key="midi.cc14_enabled",
        default=True,
        description="Enable 14-bit CC (high resolution) support",
        value_type=bool,
    ),
    "midi.default_curve": ConfigOption(
        key="midi.default_curve",
        default="linear",
        description="Default MIDI response curve",
        value_type=str,
        choices=["linear", "logarithmic", "exponential", "s_curve"],
    ),

    # LCD settings
    "lcd.enabled": ConfigOption(
        key="lcd.enabled",
        default=False,
        description="Enable LCD display support",
        value_type=bool,
        env_var="MAP2_ENABLE_LCD",
    ),
    "lcd.addresses": ConfigOption(
        key="lcd.addresses",
        default=[0x27, 0x3F],
        description="I2C addresses for LCD displays",
        value_type=list,
    ),
    "lcd.simulation": ConfigOption(
        key="lcd.simulation",
        default=False,
        description="Use LCD simulation mode",
        value_type=bool,
        env_var="MAP2_LCD_SIMULATION",
    ),

    # Backend settings
    "backend.host": ConfigOption(
        key="backend.host",
        default="0.0.0.0",
        description="Backend API host address",
        value_type=str,
        env_var="MAP2_HOST",
    ),
    "backend.port": ConfigOption(
        key="backend.port",
        default=8080,
        description="Backend API port",
        value_type=int,
        env_var="MAP2_PORT",
        min_value=1,
        max_value=65535,
    ),
    "backend.workers": ConfigOption(
        key="backend.workers",
        default=2,
        description="Number of worker processes",
        value_type=int,
        min_value=1,
        max_value=16,
    ),
    "backend.cors_origins": ConfigOption(
        key="backend.cors_origins",
        default=["*"],
        description="Allowed CORS origins",
        value_type=list,
    ),

    # Database settings
    "database.path": ConfigOption(
        key="database.path",
        default="data/map2.db",
        description="Database file path",
        value_type=str,
        env_var="MAP2_DATABASE_PATH",
    ),
    "database.wal_mode": ConfigOption(
        key="database.wal_mode",
        default=True,
        description="Enable SQLite WAL mode for reliability",
        value_type=bool,
    ),
    "database.checkpoint_interval": ConfigOption(
        key="database.checkpoint_interval",
        default=300,
        description="WAL checkpoint interval in seconds",
        value_type=int,
        min_value=60,
        max_value=3600,
    ),

    # Automation settings
    "automation.lfo_resolution_ms": ConfigOption(
        key="automation.lfo_resolution_ms",
        default=10.0,
        description="LFO update resolution in milliseconds",
        value_type=float,
        min_value=1.0,
        max_value=100.0,
    ),
    "automation.envelope_attack_default": ConfigOption(
        key="automation.envelope_attack_default",
        default=10.0,
        description="Default envelope follower attack time in ms",
        value_type=float,
        min_value=0.1,
        max_value=1000.0,
    ),
    "automation.envelope_release_default": ConfigOption(
        key="automation.envelope_release_default",
        default=100.0,
        description="Default envelope follower release time in ms",
        value_type=float,
        min_value=1.0,
        max_value=5000.0,
    ),

    # Plugin settings
    "plugins.cache_ttl": ConfigOption(
        key="plugins.cache_ttl",
        default=300,
        description="Plugin cache TTL in seconds",
        value_type=int,
        min_value=60,
        max_value=3600,
    ),
    "plugins.scan_on_startup": ConfigOption(
        key="plugins.scan_on_startup",
        default=True,
        description="Scan for plugins on application startup",
        value_type=bool,
    ),
    "plugins.extra_lv2_paths": ConfigOption(
        key="plugins.extra_lv2_paths",
        default=[],
        description="Additional LV2 plugin paths to scan",
        value_type=list,
    ),

    # WebSocket settings
    "websocket.ping_interval": ConfigOption(
        key="websocket.ping_interval",
        default=30000,
        description="WebSocket ping interval in milliseconds",
        value_type=int,
        min_value=5000,
        max_value=120000,
    ),
    "websocket.rt_coalesce_ms": ConfigOption(
        key="websocket.rt_coalesce_ms",
        default=2.0,
        description="Real-time parameter coalesce window in ms",
        value_type=float,
        min_value=0.5,
        max_value=50.0,
    ),

    # Monitoring settings
    "monitoring.enabled": ConfigOption(
        key="monitoring.enabled",
        default=True,
        description="Enable system monitoring",
        value_type=bool,
    ),
    "monitoring.metrics_interval": ConfigOption(
        key="monitoring.metrics_interval",
        default=10,
        description="Metrics collection interval in seconds",
        value_type=int,
        min_value=1,
        max_value=60,
    ),
    "monitoring.health_check_interval": ConfigOption(
        key="monitoring.health_check_interval",
        default=5,
        description="Health check interval in seconds",
        value_type=int,
        min_value=1,
        max_value=60,
    ),

    # Backup settings
    "backup.auto_backup_enabled": ConfigOption(
        key="backup.auto_backup_enabled",
        default=True,
        description="Enable automatic session backups",
        value_type=bool,
    ),
    "backup.auto_backup_interval": ConfigOption(
        key="backup.auto_backup_interval",
        default=300,
        description="Auto-backup interval in seconds",
        value_type=int,
        min_value=60,
        max_value=3600,
    ),
    "backup.max_backups": ConfigOption(
        key="backup.max_backups",
        default=50,
        description="Maximum number of backup versions to keep",
        value_type=int,
        min_value=5,
        max_value=500,
    ),
    "backup.backup_dir": ConfigOption(
        key="backup.backup_dir",
        default="~/.map2/backups",
        description="Backup directory path",
        value_type=str,
    ),

    # Storage settings - unified NAM and IR file locations
    "storage.nam_user_dir": ConfigOption(
        key="storage.nam_user_dir",
        default="~/.local/share/map2/nam",
        description="User NAM models directory",
        value_type=str,
        env_var="MAP2_NAM_DIR",
    ),
    "storage.ir_user_dir": ConfigOption(
        key="storage.ir_user_dir",
        default="~/.local/share/map2/ir",
        description="User IR files directory",
        value_type=str,
        env_var="MAP2_IR_DIR",
    ),
    "storage.nam_system_dir": ConfigOption(
        key="storage.nam_system_dir",
        default="/var/lib/map2/nam",
        description="System NAM models directory",
        value_type=str,
    ),
    "storage.ir_system_dir": ConfigOption(
        key="storage.ir_system_dir",
        default="/var/lib/map2/ir",
        description="System IR files directory",
        value_type=str,
    ),
    "storage.extra_nam_paths": ConfigOption(
        key="storage.extra_nam_paths",
        default=["~/NAM", "~/NAM/models", "~/nam", "~/.local/share/NAM", "/usr/share/map2/nam", "~/Documents/NAM", "~/Downloads/NAM"],
        description="Additional NAM discovery paths",
        value_type=list,
    ),
    "storage.extra_ir_paths": ConfigOption(
        key="storage.extra_ir_paths",
        default=["~/Impulses", "~/IRs", "/usr/share/map2/ir", "/usr/share/impulses"],
        description="Additional IR discovery paths",
        value_type=list,
    ),

    # AVB/TSN Network Audio Transport settings
    "avb.enabled": ConfigOption(
        key="avb.enabled",
        default=False,
        description="Enable AVB/TSN network audio transport (requires compatible NIC)",
        value_type=bool,
        env_var="MAP2_AVB_ENABLED",
        restart_required=True,
    ),
    "avb.interface": ConfigOption(
        key="avb.interface",
        default="",
        description="Network interface for AVB/TSN (e.g., enp3s0, eth0)",
        value_type=str,
        env_var="MAP2_AVB_INTERFACE",
        restart_required=True,
    ),
    "avb.ptp_domain": ConfigOption(
        key="avb.ptp_domain",
        default=0,
        description="PTP domain number (0-255)",
        value_type=int,
        min_value=0,
        max_value=255,
        restart_required=True,
    ),
    "avb.ptp_priority1": ConfigOption(
        key="avb.ptp_priority1",
        default=128,
        description="PTP priority1 for grandmaster election (lower = higher priority)",
        value_type=int,
        min_value=0,
        max_value=255,
        restart_required=True,
    ),
    "avb.auto_connect": ConfigOption(
        key="avb.auto_connect",
        default=False,
        description="Automatically connect to discovered AVB streams on startup",
        value_type=bool,
    ),
    "avb.avdecc_enabled": ConfigOption(
        key="avb.avdecc_enabled",
        default=False,
        description="Enable AVDECC (IEEE 1722.1) discovery/control for third-party AVB devices",
        value_type=bool,
        env_var="MAP2_AVDECC_ENABLED",
        restart_required=True,
    ),
    "avb.max_streams": ConfigOption(
        key="avb.max_streams",
        default=8,
        description="Maximum number of concurrent AVB streams",
        value_type=int,
        min_value=1,
        max_value=32,
    ),
    "avb.default_buffer_depth": ConfigOption(
        key="avb.default_buffer_depth",
        default=8,
        description="Ring buffer depth in periods (higher = more latency but safer)",
        value_type=int,
        min_value=2,
        max_value=16,
    ),
    "avb.presentation_offset_us": ConfigOption(
        key="avb.presentation_offset_us",
        default=2000,
        description="Presentation time offset in microseconds",
        value_type=int,
        min_value=500,
        max_value=10000,
    ),
    "avb.failover_policy": ConfigOption(
        key="avb.failover_policy",
        default="none",
        description="Stream interface failover policy (none, prefer_primary, round_robin, manual)",
        value_type=str,
        choices=["none", "prefer_primary", "round_robin", "manual"],
        env_var="MAP2_AVB_FAILOVER_POLICY",
    ),
    "avb.failover_interfaces": ConfigOption(
        key="avb.failover_interfaces",
        default=[],
        description="Ordered interface candidates for AVB stream failover",
        value_type=list,
        env_var="MAP2_AVB_FAILOVER_INTERFACES",
    ),
    "avb.srp.enabled": ConfigOption(
        key="avb.srp.enabled",
        default=True,
        description="Enable SRP/MSRP admission control for AVB connection paths",
        value_type=bool,
        env_var="MAP2_AVB_SRP_ENABLED",
    ),
    "avb.srp.required": ConfigOption(
        key="avb.srp.required",
        default=True,
        description="Fail closed when SRP admission cannot be acquired",
        value_type=bool,
        env_var="MAP2_AVB_SRP_REQUIRED",
    ),
    "avb.srp.daemon": ConfigOption(
        key="avb.srp.daemon",
        default="auto",
        description="SRP daemon selection (auto-detect mrpd/msrpd)",
        value_type=str,
        choices=["auto", "mrpd", "msrpd"],
        env_var="MAP2_AVB_SRP_DAEMON",
        restart_required=True,
    ),
    "avb.srp.control_socket": ConfigOption(
        key="avb.srp.control_socket",
        default="",
        description="SRP daemon control socket override (daemon defaults when empty)",
        value_type=str,
        env_var="MAP2_AVB_SRP_CONTROL_SOCKET",
    ),
    "avb.srp.timeout_ms": ConfigOption(
        key="avb.srp.timeout_ms",
        default=2000,
        description="Timeout in milliseconds for SRP daemon admission requests",
        value_type=int,
        min_value=100,
        max_value=15000,
    ),
    "avb.srp.vlan_id": ConfigOption(
        key="avb.srp.vlan_id",
        default=2,
        description="Default VLAN ID for SRP reservations",
        value_type=int,
        min_value=1,
        max_value=4094,
    ),
    "avb.srp.class": ConfigOption(
        key="avb.srp.class",
        default="A",
        description="Default SR traffic class for SRP reservations",
        value_type=str,
        choices=["A", "B"],
    ),
    "spdif.enabled": ConfigOption(
        key="spdif.enabled",
        default=False,
        description="Enable S/PDIF transport mapping for external digital processors",
        value_type=bool,
    ),
    "spdif.device": ConfigOption(
        key="spdif.device",
        default="Lexicon MPX1",
        description="S/PDIF device label used for route/ops documentation",
        value_type=str,
    ),
    "spdif.sample_rate_hz": ConfigOption(
        key="spdif.sample_rate_hz",
        default=48000,
        description="Target S/PDIF sample rate for profile-driven mapping",
        value_type=int,
        choices=[44100, 48000, 88200, 96000],
    ),
    "spdif.bits_per_sample": ConfigOption(
        key="spdif.bits_per_sample",
        default=24,
        description="Target S/PDIF bits per sample",
        value_type=int,
        choices=[16, 20, 24, 32],
    ),
    "spdif.allow_resampler": ConfigOption(
        key="spdif.allow_resampler",
        default=False,
        description="Allow asynchronous sample-rate conversion on S/PDIF path",
        value_type=bool,
    ),
    "spdif.require_hard_lock": ConfigOption(
        key="spdif.require_hard_lock",
        default=True,
        description="Require strict lock and fail closed on S/PDIF rate mismatch",
        value_type=bool,
    ),
    "spdif.transport_mode": ConfigOption(
        key="spdif.transport_mode",
        default="send_return",
        description="S/PDIF usage mode (send_return, send_only, return_only)",
        value_type=str,
        choices=["send_return", "send_only", "return_only"],
    ),
    "spdif.remarks": ConfigOption(
        key="spdif.remarks",
        default=[],
        description="Operator/AI notes for S/PDIF routing and lock behavior",
        value_type=list,
    ),
    "clock_sync.selected_profile": ConfigOption(
        key="clock_sync.selected_profile",
        default="legacy_fixed_48k",
        description="Canonical cross-transport synchronization profile identifier",
        value_type=str,
    ),
    "clock_sync.profile_version": ConfigOption(
        key="clock_sync.profile_version",
        default="",
        description="Version stamp for the profile catalog used to apply settings",
        value_type=str,
    ),
    "clock_sync.clock_master": ConfigOption(
        key="clock_sync.clock_master",
        default="internal",
        description="Resolved clock master after profile application",
        value_type=str,
        choices=["internal", "spdif", "avb", "hybrid"],
    ),
    "clock_sync.engine_rate_hz": ConfigOption(
        key="clock_sync.engine_rate_hz",
        default=48000,
        description="Resolved MAP2 engine sample rate from selected profile",
        value_type=int,
    ),
    "clock_sync.avb_stream_rate_hz": ConfigOption(
        key="clock_sync.avb_stream_rate_hz",
        default=48000,
        description="Resolved AVB stream sample rate from selected profile",
        value_type=int,
    ),
    "clock_sync.spdif_rate_hz": ConfigOption(
        key="clock_sync.spdif_rate_hz",
        default=48000,
        description="Resolved S/PDIF rate from selected profile",
        value_type=int,
    ),
    "clock_sync.bits_per_sample": ConfigOption(
        key="clock_sync.bits_per_sample",
        default=24,
        description="Resolved digital transport bit depth from selected profile",
        value_type=int,
    ),
    "clock_sync.buffer_size_samples": ConfigOption(
        key="clock_sync.buffer_size_samples",
        default=64,
        description="Resolved buffer quantum for synchronized profile mapping",
        value_type=int,
    ),
    "clock_sync.allowed_rates_hz": ConfigOption(
        key="clock_sync.allowed_rates_hz",
        default=[48000],
        description="Resolved allowed sample-rate list from selected profile",
        value_type=list,
    ),
    "clock_sync.require_hard_lock": ConfigOption(
        key="clock_sync.require_hard_lock",
        default=True,
        description="Whether selected profile fails closed on transport mismatch",
        value_type=bool,
    ),
    "clock_sync.allow_resampler": ConfigOption(
        key="clock_sync.allow_resampler",
        default=False,
        description="Whether selected profile allows asynchronous resampling",
        value_type=bool,
    ),
    "clock_sync.remarks": ConfigOption(
        key="clock_sync.remarks",
        default=[],
        description="Operator/AI remarks explaining current synchronization strategy",
        value_type=list,
    ),

    # ── Tesira Forte AVB ─────────────────────────────────────────────────────
    "tesira.enabled": ConfigOption(
        key="tesira.enabled",
        default=False,
        description="Enable Biamp Tesira Forte AVB integration (up to 5 units)",
        value_type=bool,
        env_var="MAP2_TESIRA_ENABLED",
        restart_required=True,
    ),
    "tesira.devices": ConfigOption(
        key="tesira.devices",
        default=[],
        description=(
            "List of Tesira device connection configs. "
            "Each entry: {host, port=23, name='', enabled=true, metering_tags=[]}"
        ),
        value_type=list,
        env_var="MAP2_TESIRA_DEVICES",
    ),
    "tesira.metering_interval_ms": ConfigOption(
        key="tesira.metering_interval_ms",
        default=100,
        description="TTP subscription push interval for level metering (ms)",
        value_type=int,
        min_value=50,
        max_value=1000,
    ),
    "tesira.ptp_slave_mode": ConfigOption(
        key="tesira.ptp_slave_mode",
        default=True,
        description=(
            "Automatically demote MAP2 ptp4l to SLAVE when any Tesira unit "
            "reports itself as PTP MASTER"
        ),
        value_type=bool,
    ),
}


# ============================================================================
# Configuration Manager
# ============================================================================

class ConfigManager:
    """
    Centralized configuration management with file, environment, and database support.

    Features:
    - JSON file persistence with automatic backup
    - Environment variable overrides (MAP2_* prefix)
    - Type-safe accessors with validation
    - Observer pattern for change notifications
    - Schema definition with defaults and descriptions
    """

    _instance: Optional['ConfigManager'] = None
    CONFIG_DIR = Path.home() / ".map2"
    CONFIG_FILE = Path.home() / ".map2" / "config.json"
    CONFIG_BACKUP = Path.home() / ".map2" / "config.backup.json"

    def __init__(self, config_path: Optional[Path] = None):
        """Initialize configuration manager.

        Args:
            config_path: Custom config file path (default: ~/.map2/config.json)
        """
        self.config_path = config_path or self.CONFIG_FILE
        self.config_backup_path = self.CONFIG_BACKUP
        self._config: Dict[str, Any] = {}
        self._observers: Dict[str, Set[Callable[[str, Any, Any], None]]] = {}
        self._dirty = False

        # Ensure config directory exists
        self.CONFIG_DIR.mkdir(parents=True, exist_ok=True)

        # Load configuration
        self._load()

    @classmethod
    def get_instance(cls) -> 'ConfigManager':
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load(self) -> None:
        """Load configuration from file, environment, and defaults."""
        # Start with schema defaults
        self._config = self._build_defaults()

        # Load from file
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r') as f:
                    file_config = json.load(f)
                self._merge_config(file_config)
                logger.info(f"Loaded config from {self.config_path}")
            except Exception as e:
                logger.warning(f"Failed to load config file: {e}")

        # Apply environment variable overrides
        self._apply_env_overrides()

    def _build_defaults(self) -> Dict[str, Any]:
        """Build default configuration from schema."""
        config = {}
        for key, option in CONFIG_SCHEMA.items():
            self._set_nested(config, key, option.default)
        return config

    def _set_nested(self, d: Dict, key: str, value: Any) -> None:
        """Set a nested value using dot notation."""
        keys = key.split(".")
        current = d
        for k in keys[:-1]:
            if k not in current:
                current[k] = {}
            current = current[k]
        current[keys[-1]] = value

    def _get_nested(self, d: Dict, key: str, default: Any = None) -> Any:
        """Get a nested value using dot notation."""
        keys = key.split(".")
        current = d
        for k in keys:
            if isinstance(current, dict) and k in current:
                current = current[k]
            else:
                return default
        return current

    def _merge_config(self, source: Dict[str, Any], prefix: str = "") -> None:
        """Recursively merge source config into current config."""
        for key, value in source.items():
            full_key = f"{prefix}.{key}" if prefix else key
            if isinstance(value, dict):
                self._merge_config(value, full_key)
            else:
                self._set_nested(self._config, full_key, value)

    def _apply_env_overrides(self) -> None:
        """Apply environment variable overrides."""
        for key, option in CONFIG_SCHEMA.items():
            if option.env_var:
                env_value = os.environ.get(option.env_var)
                if env_value is not None:
                    try:
                        converted = self._convert_type(env_value, option.value_type)
                        self._set_nested(self._config, key, converted)
                        if not option.sensitive:
                            logger.debug(f"Config override from env: {key}={converted}")
                    except Exception as e:
                        logger.warning(f"Failed to convert env var {option.env_var}: {e}")

    def _convert_type(self, value: str, target_type: type) -> Any:
        """Convert string value to target type."""
        if target_type == bool:
            return value.lower() in ('true', '1', 'yes', 'on')
        elif target_type == int:
            return int(value)
        elif target_type == float:
            return float(value)
        elif target_type == list:
            return json.loads(value) if value.startswith('[') else value.split(',')
        else:
            return value

    def _validate_value(self, key: str, value: Any) -> bool:
        """Validate a configuration value against its schema."""
        option = CONFIG_SCHEMA.get(key)
        if not option:
            return True  # Unknown keys are allowed

        # Type check
        if value is not None and not isinstance(value, option.value_type):
            if option.value_type in (int, float) and isinstance(value, (int, float)):
                pass  # Allow int/float conversion
            else:
                logger.warning(f"Config type mismatch: {key} expected {option.value_type}, got {type(value)}")
                return False

        # Range check
        if option.min_value is not None and value < option.min_value:
            logger.warning(f"Config value below minimum: {key}={value} (min={option.min_value})")
            return False
        if option.max_value is not None and value > option.max_value:
            logger.warning(f"Config value above maximum: {key}={value} (max={option.max_value})")
            return False

        # Choice check
        if option.choices is not None and value not in option.choices:
            logger.warning(f"Config value not in choices: {key}={value} (choices={option.choices})")
            return False

        return True

    def get(self, key: str, default: Any = None) -> Any:
        """
        Get configuration value using dot notation.

        Args:
            key: Configuration key (e.g., 'audio.sample_rate')
            default: Default value if key not found

        Returns:
            Configuration value
        """
        return self._get_nested(self._config, key, default)

    def get_int(self, key: str, default: int = 0) -> int:
        """Get configuration value as integer."""
        value = self.get(key, default)
        return int(value) if value is not None else default

    def get_float(self, key: str, default: float = 0.0) -> float:
        """Get configuration value as float."""
        value = self.get(key, default)
        return float(value) if value is not None else default

    def get_bool(self, key: str, default: bool = False) -> bool:
        """Get configuration value as boolean."""
        value = self.get(key, default)
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ('true', '1', 'yes', 'on')
        return bool(value) if value is not None else default

    def get_str(self, key: str, default: str = "") -> str:
        """Get configuration value as string."""
        value = self.get(key, default)
        return str(value) if value is not None else default

    def get_list(self, key: str, default: Optional[List] = None) -> List:
        """Get configuration value as list."""
        value = self.get(key, default or [])
        return list(value) if value is not None else (default or [])

    def set(self, key: str, value: Any, save: bool = True) -> bool:
        """
        Set configuration value.

        Args:
            key: Configuration key
            value: New value
            save: Whether to persist to file

        Returns:
            True if value was set successfully
            
        Raises:
            ValueError: If the setting is locked for Tier A performance
        """
        # Check if setting is locked (Tier A performance protection)
        if self.is_locked(key):
            raise ValueError(
                f"Configuration key '{key}' is LOCKED for Tier A professional guitar processor performance. "
                f"This setting can only be changed in the systemd service (map2-backend.service) and requires a service restart. "
                f"Locked settings ensure <3ms round-trip latency and prevent buffer size mismatches."
            )
        
        if not self._validate_value(key, value):
            return False

        old_value = self.get(key)
        self._set_nested(self._config, key, value)
        self._dirty = True

        # Notify observers
        self._notify_observers(key, old_value, value)

        if save:
            self.save()

        return True
    
    def is_locked(self, key: str) -> bool:
        """
        Check if a configuration key is locked (cannot be changed at runtime).
        
        Locked settings are critical for Tier A performance and can only be
        changed in the systemd service configuration.
        
        Args:
            key: Configuration key to check
            
        Returns:
            True if the setting is locked, False otherwise
        """
        option = CONFIG_SCHEMA.get(key)
        return option.locked if option else False

    def save(self) -> bool:
        """Save configuration to file."""
        if not self._dirty:
            return True

        try:
            # Backup existing config
            if self.config_path.exists():
                import shutil
                shutil.copy2(self.config_path, self.config_backup_path)

            # Write new config
            with open(self.config_path, 'w') as f:
                json.dump(self._config, f, indent=2)

            self._dirty = False
            logger.info(f"Configuration saved to {self.config_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to save config: {e}")
            return False

    def reload(self) -> None:
        """Reload configuration from file."""
        self._load()
        logger.info("Configuration reloaded")

    def reset_to_defaults(self) -> None:
        """Reset all configuration to defaults."""
        self._config = self._build_defaults()
        self._dirty = True
        self.save()
        logger.info("Configuration reset to defaults")

    def add_observer(self, key_pattern: str, callback: Callable[[str, Any, Any], None]) -> None:
        """
        Add observer for configuration changes.

        Args:
            key_pattern: Key pattern to observe (e.g., 'audio.*' or 'audio.sample_rate')
            callback: Callback(key, old_value, new_value)
        """
        if key_pattern not in self._observers:
            self._observers[key_pattern] = set()
        self._observers[key_pattern].add(callback)

    def remove_observer(self, key_pattern: str, callback: Callable) -> None:
        """Remove observer for configuration changes."""
        if key_pattern in self._observers:
            self._observers[key_pattern].discard(callback)

    def _notify_observers(self, key: str, old_value: Any, new_value: Any) -> None:
        """Notify all matching observers of a config change."""
        for pattern, callbacks in self._observers.items():
            if pattern == key or (pattern.endswith('.*') and key.startswith(pattern[:-2])):
                for callback in callbacks:
                    try:
                        callback(key, old_value, new_value)
                    except Exception as e:
                        logger.error(f"Observer callback error: {e}")

    def get_section(self, section: str) -> Dict[str, Any]:
        """Get all values in a configuration section."""
        return self._get_nested(self._config, section, {})

    def get_all(self) -> Dict[str, Any]:
        """Get entire configuration."""
        return copy.deepcopy(self._config)

    def get_schema(self) -> Dict[str, Dict[str, Any]]:
        """Get configuration schema for documentation/UI."""
        schema = {}
        for key, option in CONFIG_SCHEMA.items():
            schema[key] = {
                "default": option.default,
                "description": option.description,
                "type": option.value_type.__name__,
                "env_var": option.env_var,
                "min": option.min_value,
                "max": option.max_value,
                "choices": option.choices,
                "restart_required": option.restart_required,
            }
        return schema

    def get_option_info(self, key: str) -> Optional[Dict[str, Any]]:
        """Get schema information for a specific option."""
        option = CONFIG_SCHEMA.get(key)
        if option:
            return {
                "key": option.key,
                "default": option.default,
                "description": option.description,
                "type": option.value_type.__name__,
                "current": self.get(key),
            }
        return None


# ============================================================================
# Global Access Functions
# ============================================================================

def get_config() -> ConfigManager:
    """Get the global configuration manager instance."""
    return ConfigManager.get_instance()


def config_get(key: str, default: Any = None) -> Any:
    """Convenience function to get config value."""
    return get_config().get(key, default)


def config_set(key: str, value: Any) -> bool:
    """Convenience function to set config value."""
    return get_config().set(key, value)
