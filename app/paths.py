"""
Centralized path management for MAP2 storage locations.

This module provides unified access to all NAM and IR file storage paths,
eliminating fragmented path definitions across the codebase.

Usage:
    from app.paths import StoragePaths

    # Get primary directories
    nam_dir = StoragePaths.get_nam_user_dir()
    ir_cabinet_dir = StoragePaths.get_ir_cabinet_dir()

    # Get all search paths for scanning
    all_nam_paths = StoragePaths.get_all_nam_paths()
    all_ir_paths = StoragePaths.get_all_ir_paths()

    # Ensure directories exist on startup
    StoragePaths.ensure_directories()
"""

import logging
from pathlib import Path
from typing import List

from app.config import get_config

logger = logging.getLogger(__name__)


class StoragePaths:
    """Unified storage path management for NAM and IR files."""

    # =========================================================================
    # User Directories (primary writable locations)
    # =========================================================================

    @staticmethod
    def get_nam_user_dir() -> Path:
        """Get primary user NAM models directory.

        Default: ~/.local/share/map2/nam
        Override: MAP2_NAM_DIR environment variable or config
        """
        return Path(get_config().get("storage.nam_user_dir")).expanduser()

    @staticmethod
    def get_ir_user_dir() -> Path:
        """Get primary user IR files directory.

        Default: ~/.local/share/map2/ir
        Override: MAP2_IR_DIR environment variable or config
        """
        return Path(get_config().get("storage.ir_user_dir")).expanduser()

    @staticmethod
    def get_ir_cabinet_dir() -> Path:
        """Get cabinet IR directory.

        Returns: ~/.local/share/map2/ir/cabinets (or configured path)
        """
        return StoragePaths.get_ir_user_dir() / "cabinets"

    @staticmethod
    def get_ir_reverb_dir() -> Path:
        """Get reverb IR directory.

        Returns: ~/.local/share/map2/ir/reverbs (or configured path)
        """
        return StoragePaths.get_ir_user_dir() / "reverbs"

    @staticmethod
    def get_ir_user_upload_dir() -> Path:
        """Get user-uploaded IR directory.

        Returns: ~/.local/share/map2/ir/user (or configured path)
        """
        return StoragePaths.get_ir_user_dir() / "user"

    @staticmethod
    def get_soundfont_user_dir() -> Path:
        """Get primary user SoundFont files directory.

        Default: ~/.local/share/map2/soundfonts
        """
        try:
            return Path(get_config().get("storage.soundfont_user_dir")).expanduser()
        except (KeyError, AttributeError):
            return Path("~/.local/share/map2/soundfonts").expanduser()

    # =========================================================================
    # System Directories (service-writable locations)
    # =========================================================================

    @staticmethod
    def get_nam_system_dir() -> Path:
        """Get system NAM models directory.

        Default: /var/lib/map2/nam
        """
        return Path(get_config().get("storage.nam_system_dir"))

    @staticmethod
    def get_ir_system_dir() -> Path:
        """Get system IR files directory.

        Default: /var/lib/map2/ir
        """
        return Path(get_config().get("storage.ir_system_dir"))

    @staticmethod
    def get_ir_download_dir() -> Path:
        """Get downloaded IR library directory.

        Returns: /var/lib/map2/ir/downloads
        """
        return StoragePaths.get_ir_system_dir() / "downloads"

    @staticmethod
    def get_soundfont_system_dir() -> Path:
        """Get system SoundFont files directory.

        Default: /var/lib/map2/soundfonts
        """
        try:
            return Path(get_config().get("storage.soundfont_system_dir"))
        except (KeyError, AttributeError):
            return Path("/var/lib/map2/soundfonts")

    @staticmethod
    def get_soundfont_download_dir() -> Path:
        """Get downloaded SoundFont library directory.

        Returns: ~/.local/share/map2/soundfonts/downloads (user-writable)
        """
        return StoragePaths.get_soundfont_user_dir() / "downloads"

    # =========================================================================
    # Aggregated Search Paths
    # =========================================================================

    @staticmethod
    def get_all_nam_paths(include_nonexistent: bool = False) -> List[Path]:
        """Get all NAM search paths (user + system + discovery).

        Order of priority:
        1. User directory (highest priority)
        2. System directory
        3. Extra discovery paths from config

        Args:
            include_nonexistent: If True, include paths that don't exist yet

        Returns:
            List of Path objects for NAM model directories
        """
        paths = [
            StoragePaths.get_nam_user_dir(),
            StoragePaths.get_nam_system_dir(),
        ]

        # Add extra discovery paths from config
        for extra in get_config().get_list("storage.extra_nam_paths"):
            paths.append(Path(extra).expanduser())

        if include_nonexistent:
            return paths
        return [p for p in paths if p.exists()]

    @staticmethod
    def get_all_ir_paths(include_nonexistent: bool = False) -> List[Path]:
        """Get all IR search paths (user + system + discovery).

        Order of priority:
        1. User directory (highest priority)
        2. System directory
        3. Extra discovery paths from config

        Args:
            include_nonexistent: If True, include paths that don't exist yet

        Returns:
            List of Path objects for IR file directories
        """
        paths = [
            StoragePaths.get_ir_user_dir(),
            StoragePaths.get_ir_system_dir(),
        ]

        # Add extra discovery paths from config
        for extra in get_config().get_list("storage.extra_ir_paths"):
            paths.append(Path(extra).expanduser())

        if include_nonexistent:
            return paths
        return [p for p in paths if p.exists()]

    # =========================================================================
    # Directory Management
    # =========================================================================

    @staticmethod
    def ensure_directories() -> None:
        """Create all required user directories.

        This should be called on application startup to ensure
        the directory structure exists.
        """
        directories = [
            StoragePaths.get_nam_user_dir(),
            StoragePaths.get_ir_cabinet_dir(),
            StoragePaths.get_ir_reverb_dir(),
            StoragePaths.get_ir_user_upload_dir(),
            StoragePaths.get_soundfont_user_dir(),
            StoragePaths.get_soundfont_download_dir(),
        ]

        for directory in directories:
            try:
                directory.mkdir(parents=True, exist_ok=True)
                logger.debug(f"Ensured directory exists: {directory}")
            except (PermissionError, OSError) as e:
                logger.warning(f"Cannot create directory {directory}: {e}")

    @staticmethod
    def ensure_system_directories() -> None:
        """Create system directories (requires elevated permissions).

        This is typically called during system setup or by a service
        running with appropriate permissions.
        """
        directories = [
            StoragePaths.get_nam_system_dir(),
            StoragePaths.get_ir_system_dir(),
            StoragePaths.get_ir_download_dir(),
        ]

        for directory in directories:
            try:
                directory.mkdir(parents=True, exist_ok=True)
                logger.debug(f"Ensured system directory exists: {directory}")
            except (PermissionError, OSError) as e:
                logger.debug(f"Cannot create system directory {directory}: {e}")

    # =========================================================================
    # Path Information
    # =========================================================================

    @staticmethod
    def get_storage_info() -> dict:
        """Get information about all storage paths for diagnostics.

        Returns:
            Dictionary with path information and existence status
        """
        return {
            "nam_user_dir": {
                "path": str(StoragePaths.get_nam_user_dir()),
                "exists": StoragePaths.get_nam_user_dir().exists(),
            },
            "ir_user_dir": {
                "path": str(StoragePaths.get_ir_user_dir()),
                "exists": StoragePaths.get_ir_user_dir().exists(),
            },
            "ir_cabinet_dir": {
                "path": str(StoragePaths.get_ir_cabinet_dir()),
                "exists": StoragePaths.get_ir_cabinet_dir().exists(),
            },
            "ir_reverb_dir": {
                "path": str(StoragePaths.get_ir_reverb_dir()),
                "exists": StoragePaths.get_ir_reverb_dir().exists(),
            },
            "ir_user_upload_dir": {
                "path": str(StoragePaths.get_ir_user_upload_dir()),
                "exists": StoragePaths.get_ir_user_upload_dir().exists(),
            },
            "nam_system_dir": {
                "path": str(StoragePaths.get_nam_system_dir()),
                "exists": StoragePaths.get_nam_system_dir().exists(),
            },
            "ir_system_dir": {
                "path": str(StoragePaths.get_ir_system_dir()),
                "exists": StoragePaths.get_ir_system_dir().exists(),
            },
            "ir_download_dir": {
                "path": str(StoragePaths.get_ir_download_dir()),
                "exists": StoragePaths.get_ir_download_dir().exists(),
            },
            "all_nam_paths": [str(p) for p in StoragePaths.get_all_nam_paths()],
            "all_ir_paths": [str(p) for p in StoragePaths.get_all_ir_paths()],
        }

    # =========================================================================
    # Display Paths (for UI synchronization)
    # =========================================================================

    @staticmethod
    def get_display_paths() -> dict:
        """Get user-friendly display paths for UI components.

        These are the canonical paths that should be displayed to users
        in all UI components (web, TUI, shell scripts, documentation).

        Returns:
            Dictionary with display-ready path strings
        """
        return {
            "nam_models": str(StoragePaths.get_nam_user_dir()),
            "ir_cabinets": str(StoragePaths.get_ir_cabinet_dir()),
            "ir_reverbs": str(StoragePaths.get_ir_reverb_dir()),
            "ir_user_uploads": str(StoragePaths.get_ir_user_upload_dir()),
            "soundfonts": str(StoragePaths.get_soundfont_user_dir()),
            # Tilde-formatted versions for display
            "nam_models_display": StoragePaths._to_tilde_path(StoragePaths.get_nam_user_dir()),
            "ir_cabinets_display": StoragePaths._to_tilde_path(StoragePaths.get_ir_cabinet_dir()),
            "ir_reverbs_display": StoragePaths._to_tilde_path(StoragePaths.get_ir_reverb_dir()),
            "soundfonts_display": StoragePaths._to_tilde_path(StoragePaths.get_soundfont_user_dir()),
        }

    @staticmethod
    def _to_tilde_path(path: Path) -> str:
        """Convert absolute path to tilde-prefixed path for display.

        Args:
            path: Absolute Path object

        Returns:
            String with ~ prefix if path is under home directory
        """
        try:
            home = Path.home()
            if path.is_relative_to(home):
                return "~/" + str(path.relative_to(home))
        except (ValueError, RuntimeError):
            pass
        return str(path)

    @staticmethod
    def get_path_constants_json() -> str:
        """Export path constants as JSON for frontend consumption.

        This method should be called by an API endpoint to provide
        synchronized path information to web frontends.

        Returns:
            JSON string with all path constants
        """
        import json
        return json.dumps(StoragePaths.get_display_paths(), indent=2)
