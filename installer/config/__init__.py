"""installer.config — configuration schema, kickstart I/O, and mode defaults."""
from .schema import InstallerConfig, InstallMode, AudioConfig, RealTimeConfig, SoftwareConfig
from .kickstart import load_kickstart, save_kickstart, generate_template, validate_kickstart_file
from .defaults import config_for_mode, MODE_DESCRIPTIONS

__all__ = [
    "InstallerConfig", "InstallMode", "AudioConfig", "RealTimeConfig", "SoftwareConfig",
    "load_kickstart", "save_kickstart", "generate_template", "validate_kickstart_file",
    "config_for_mode", "MODE_DESCRIPTIONS",
]
