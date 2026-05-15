"""
Centralized path management for MAP2 storage locations.

This module provides unified access to all NAM and IR file storage paths,
eliminating fragmented path definitions across the codebase.

Two complementary APIs live here:

- ``StoragePaths`` — the original NAM/IR asset-path helpers.
- ``Map2Paths`` — the T2431-C platform path authority. Owns all four
  authority planes (host / service / user / runtime) per
  ``docs/architecture/CONFIGURATION_AUTHORITY_MODEL.md`` and exposes every
  canonical path the rest of the codebase is expected to consume. Hardcoded
  ``/etc/map2``, ``/var/lib/map2``, and ``~/.map2`` literals in application
  code are being migrated to this authority.

Usage:
    from app.paths import Map2Paths, StoragePaths

    # New code — platform paths
    host_dir = Map2Paths.host_config_dir()
    cluster_db = Map2Paths.cluster_db_path()
    midi_routes = Map2Paths.user_file('midi_routes.json')

    # Asset paths (unchanged)
    nam_dir = StoragePaths.get_nam_user_dir()
"""

import logging
import os
from pathlib import Path
from typing import Dict, List, Optional

from app.config import get_config

logger = logging.getLogger(__name__)


# ============================================================================
# T2431-C — Map2Paths platform path authority
# T2529-A4 — extended with FHS §3 dirs (runtime / cache / log / app-install)
# ============================================================================

# Environment-variable overrides. Kept narrow on purpose — every override adds
# a drift risk per CONFIGURATION_AUTHORITY_MODEL.md, so we only expose the
# plane-root vars plus a user-plane override for developers who want to
# keep per-user data outside ~/.map2.
_ENV_HOST_ROOT = "MAP2_HOST_CONFIG_DIR"      # Host plane — /etc/map2
_ENV_SERVICE_ROOT = "MAP2_SERVICE_STATE_DIR"  # Service plane — /var/lib/map2
_ENV_USER_ROOT = "MAP2_USER_DIR"              # User plane — ~/.map2

# T2529-A4: additional FHS §3 plane roots.
_ENV_RUNTIME_ROOT = "MAP2_RUNTIME_DIR"        # /run/map2 — sockets, pidfiles
_ENV_CACHE_ROOT = "MAP2_CACHE_DIR"            # /var/cache/map2 — caches
_ENV_LOG_ROOT = "MAP2_LOG_DIR"                # /var/log/map2 — logs
_ENV_APP_INSTALL_ROOT = "MAP2_APP_INSTALL_DIR"  # /opt/map2-audio — immutable app tree

# Default plane roots, matching docs/architecture/CONFIGURATION_AUTHORITY_MODEL.md
# and the T2529 Q3 lock (FHS §3 strict split).
_DEFAULT_HOST_ROOT = Path("/etc/map2")
_DEFAULT_SERVICE_ROOT = Path("/var/lib/map2")
_DEFAULT_USER_ROOT = Path("~/.map2")
_DEFAULT_RUNTIME_ROOT = Path("/run/map2")
_DEFAULT_CACHE_ROOT = Path("/var/cache/map2")
_DEFAULT_LOG_ROOT = Path("/var/log/map2")
_DEFAULT_APP_INSTALL_ROOT = Path("/opt/map2-audio")


def _resolve_root(env_var: str, default: Path) -> Path:
    """Resolve a plane root, honoring the env override then falling back."""
    raw = os.environ.get(env_var)
    if raw:
        return Path(raw).expanduser()
    return default.expanduser()


class Map2Paths:
    """Platform path authority for MAP2 (T2431-C).

    One method per canonical path. Every call routes through the plane
    roots resolved from env vars (with defaults matching the authority
    model), which means: one env override flips the whole tree at once.

    Rules:
    - Host-plane paths live under ``/etc/map2`` and hold desired config.
    - Service-plane paths live under ``/var/lib/map2`` and hold durable
      service state (databases, backups, event logs).
    - User-plane paths live under ``~/.map2`` and hold per-operator state.
    - Runtime-plane truths (``/proc``, PipeWire, etcd) do not live here;
      they belong to their owning services.
    """

    # -- plane roots ---------------------------------------------------------

    @staticmethod
    def host_config_dir() -> Path:
        """Host desired configuration root — ``/etc/map2`` by default."""
        return _resolve_root(_ENV_HOST_ROOT, _DEFAULT_HOST_ROOT)

    @staticmethod
    def service_state_dir() -> Path:
        """Durable service/cluster state root — ``/var/lib/map2`` by default."""
        return _resolve_root(_ENV_SERVICE_ROOT, _DEFAULT_SERVICE_ROOT)

    @staticmethod
    def user_dir() -> Path:
        """Per-user/operator root — ``~/.map2`` by default."""
        return _resolve_root(_ENV_USER_ROOT, _DEFAULT_USER_ROOT)

    # -- T2529-A4: FHS §3 service planes (runtime / cache / log / app) ------

    @staticmethod
    def runtime_dir() -> Path:
        """Per-service runtime root — ``/run/map2`` by default.

        Hosts UDS sockets (controller-host, sonobus-transport) and PID
        files. Provisioned at boot by systemd-tmpfiles (see
        ``/usr/lib/tmpfiles.d/map2.conf``) with map2:map2 + mode 0755.
        Re-created after every reboot since ``/run`` is tmpfs.

        T2529-A5: this is what the service unit sets ``XDG_RUNTIME_DIR``
        to, replacing the per-user ``/run/user/<UID>`` that previously
        broke fresh installs on non-1000-UID operators.
        """
        return _resolve_root(_ENV_RUNTIME_ROOT, _DEFAULT_RUNTIME_ROOT)

    @staticmethod
    def cache_dir() -> Path:
        """Cache root — ``/var/cache/map2`` by default.

        Per FHS §5.5, ``/var/cache`` holds data the system can regenerate.
        MAP2 stores LV2 plugin index caches, IR thumbnail caches, NAM
        download caches here. Safe to ``rm -rf`` at any time.
        """
        return _resolve_root(_ENV_CACHE_ROOT, _DEFAULT_CACHE_ROOT)

    @staticmethod
    def log_dir() -> Path:
        """Log root — ``/var/log/map2`` by default.

        Mode 0750 (see tmpfiles.d) so non-map2 / non-root users can't read
        log files — avoids leaking process state through journald-via-syslog
        mirrors. An operator who needs log access joins the `map2` group.
        """
        return _resolve_root(_ENV_LOG_ROOT, _DEFAULT_LOG_ROOT)

    @staticmethod
    def app_install_dir() -> Path:
        """Immutable application install root — ``/opt/map2-audio`` by default.

        Per FHS §3.13, ``/opt/<package>`` holds add-on application packages
        that are kept entirely separate from the host's package manager.
        MAP2 ships the Python tree, JUCE engine binaries, device-packs,
        scripts, and the LICENSE/README under here.

        Overridable to the dev-host repo root (``/home/mm/map2-audio``)
        via ``MAP2_APP_INSTALL_DIR`` so the developer workflow can run
        tests + the engine against a working tree without a full RPM
        install.
        """
        return _resolve_root(_ENV_APP_INSTALL_ROOT, _DEFAULT_APP_INSTALL_ROOT)

    # -- runtime plane (/run/map2) ------------------------------------------

    @staticmethod
    def runtime_file(*parts: str) -> Path:
        """Join a path under the runtime dir."""
        return Map2Paths.runtime_dir().joinpath(*parts)

    @staticmethod
    def controller_host_socket_path() -> Path:
        """UDS path the controller-host daemon binds + map2-backend connects to."""
        return Map2Paths.runtime_file("controller-host.sock")

    @staticmethod
    def sonobus_transport_socket_path() -> Path:
        """UDS path the SonoBus/AOO transport daemon binds."""
        return Map2Paths.runtime_file("sonobus-transport.sock")

    # -- cache plane (/var/cache/map2) --------------------------------------

    @staticmethod
    def cache_file(*parts: str) -> Path:
        """Join a path under the cache dir."""
        return Map2Paths.cache_dir().joinpath(*parts)

    @staticmethod
    def lv2_index_cache_path() -> Path:
        """LV2 plugin scan-result cache (regenerated on every full scan)."""
        return Map2Paths.cache_file("lv2-index.json")

    @staticmethod
    def ir_thumbnail_cache_dir() -> Path:
        """IR waveform thumbnail PNG cache."""
        return Map2Paths.cache_file("ir-thumbnails")

    # -- log plane (/var/log/map2) ------------------------------------------

    @staticmethod
    def log_file(*parts: str) -> Path:
        """Join a path under the log dir."""
        return Map2Paths.log_dir().joinpath(*parts)

    @staticmethod
    def soak_evidence_dir() -> Path:
        """Soak-test evidence dir for fit-for-purpose runs."""
        return Map2Paths.log_file("soak")

    # -- app-install plane (/opt/map2-audio) --------------------------------

    @staticmethod
    def app_file(*parts: str) -> Path:
        """Join a path under the app install dir (FHS §3.13)."""
        return Map2Paths.app_install_dir().joinpath(*parts)

    @staticmethod
    def juce_engine_build_dir() -> Path:
        """JUCE engine build dir — holds map2-controller-host, map2-sonobus-transport,
        + map2_audio_engine*.so."""
        return Map2Paths.app_file("juce-engine", "build")

    @staticmethod
    def controller_host_binary_path() -> Path:
        """The libremidi + QuickJS controller host daemon binary."""
        return Map2Paths.juce_engine_build_dir() / "map2-controller-host"

    @staticmethod
    def sonobus_transport_binary_path() -> Path:
        """The AOO/SonoBus remote-audio transport daemon binary (T2521-4)."""
        return Map2Paths.juce_engine_build_dir() / "map2-sonobus-transport"

    @staticmethod
    def device_packs_dir() -> Path:
        """Device-pack root (controllers/audio profiles/midi profiles)."""
        return Map2Paths.app_file("device-packs")

    @staticmethod
    def scripts_dir() -> Path:
        """Operator CLI scripts dir — exposes cli.py, self_test.py, etc."""
        return Map2Paths.app_file("scripts")

    # -- T2529-A4: install-layout detection ----------------------------------

    @staticmethod
    def is_fhs_install() -> bool:
        """Return True if the platform is running from the FHS-packaged
        install layout (``/opt/map2-audio``), False if from the dev-host
        working tree.

        Useful for code paths that need to behave differently between
        ``dnf install map2`` and ``cd /home/mm/map2-audio && python -m ...``.
        """
        return Map2Paths.app_install_dir() == _DEFAULT_APP_INSTALL_ROOT.expanduser()

    # -- host plane (/etc/map2) ---------------------------------------------

    @staticmethod
    def host_file(*parts: str) -> Path:
        """Join a path under the host config dir."""
        return Map2Paths.host_config_dir().joinpath(*parts)

    @staticmethod
    def node_identity_path() -> Path:
        return Map2Paths.host_file("node-identity.json")

    @staticmethod
    def node_conf_path() -> Path:
        return Map2Paths.host_file("node.conf")

    @staticmethod
    def node_conf_backup_path() -> Path:
        return Map2Paths.host_file("node.conf.bak")

    @staticmethod
    def host_environment_path() -> Path:
        return Map2Paths.host_file("environment")

    @staticmethod
    def host_mode_json_path() -> Path:
        return Map2Paths.host_file("mode.json")

    @staticmethod
    def trust_dir() -> Path:
        return Map2Paths.host_file("trust")

    @staticmethod
    def trusted_nodes_path() -> Path:
        return Map2Paths.trust_dir() / "trusted-nodes.json"

    @staticmethod
    def ssl_dir() -> Path:
        return Map2Paths.host_file("ssl")

    @staticmethod
    def ssh_dir() -> Path:
        return Map2Paths.host_file("ssh")

    @staticmethod
    def ca_cert_path() -> Path:
        return Map2Paths.ssl_dir() / "ca-cert.pem"

    @staticmethod
    def node_cert_path() -> Path:
        return Map2Paths.ssl_dir() / "node-cert.pem"

    @staticmethod
    def node_key_path() -> Path:
        return Map2Paths.ssl_dir() / "node-key.pem"

    # -- service plane (/var/lib/map2) --------------------------------------

    @staticmethod
    def service_file(*parts: str) -> Path:
        """Join a path under the service state dir."""
        return Map2Paths.service_state_dir().joinpath(*parts)

    @staticmethod
    def cluster_db_path() -> Path:
        return Map2Paths.service_file("cluster.db")

    @staticmethod
    def cluster_config_database_path() -> Path:
        return Map2Paths.service_file("database", "cluster.db")

    @staticmethod
    def platform_events_db_path() -> Path:
        return Map2Paths.service_file("platform-events.db")

    @staticmethod
    def legacy_cluster_events_db_path() -> Path:
        return Map2Paths.service_file("cluster-events.db")

    @staticmethod
    def backups_dir() -> Path:
        return Map2Paths.service_file("backups")

    @staticmethod
    def config_repo_dir() -> Path:
        return Map2Paths.service_file("config-repo")

    @staticmethod
    def config_distribution_dir() -> Path:
        return Map2Paths.service_file("config")

    @staticmethod
    def config_manager_history_path() -> Path:
        return Map2Paths.service_file("config-manager-history.json")

    @staticmethod
    def ztp_marker_path() -> Path:
        return Map2Paths.service_file(".ztp-complete")

    @staticmethod
    def lifecycle_dir() -> Path:
        return Map2Paths.service_file("lifecycle")

    @staticmethod
    def nam_library_dir() -> Path:
        return Map2Paths.service_file("nam")

    @staticmethod
    def lv2_library_dir() -> Path:
        return Map2Paths.service_file("lv2")

    @staticmethod
    def ir_cabinets_library_dir() -> Path:
        return Map2Paths.service_file("irs", "cabinets")

    @staticmethod
    def ir_reverbs_library_dir() -> Path:
        return Map2Paths.service_file("irs", "reverbs")

    @staticmethod
    def recordings_library_dir() -> Path:
        # T2508-3 (phase 4 of T2504 Multi-Track Recorder). Recorded
        # WAV takes + sidecar metadata land here. Service-plane
        # authority (NOT user-plane) — recordings are first-class
        # platform artefacts that travel with snapshots via the
        # StateAuthorityAsset registry, not personal user files.
        return Map2Paths.service_file("recordings")

    @staticmethod
    def presets_dir() -> Path:
        return Map2Paths.service_file("presets")

    @staticmethod
    def presets_pre_restore_dir() -> Path:
        return Map2Paths.service_file("presets.pre-restore")

    @staticmethod
    def secrets_salt_path() -> Path:
        return Map2Paths.service_file("secrets_salt")

    # -- user plane (~/.map2) -----------------------------------------------

    @staticmethod
    def user_file(*parts: str) -> Path:
        """Join a path under the user dir (``~/.map2`` by default)."""
        return Map2Paths.user_dir().joinpath(*parts)

    @staticmethod
    def user_sessions_dir() -> Path:
        return Map2Paths.user_file("sessions")

    @staticmethod
    def user_ir_download_state_path() -> Path:
        return Map2Paths.user_file("download_state.json")

    @staticmethod
    def user_soundfont_download_state_path() -> Path:
        return Map2Paths.user_file("soundfont_download_state.json")

    # MIDI Hub user-plane files
    @staticmethod
    def midi_routes_path() -> Path:
        return Map2Paths.user_file("midi_routes.json")

    @staticmethod
    def midi_hub_event_lists_path() -> Path:
        return Map2Paths.user_file("midi_hub_event_lists.json")

    @staticmethod
    def midi_hub_macros_path() -> Path:
        return Map2Paths.user_file("midi_hub_macros.json")

    @staticmethod
    def midi_hub_message_mapper_path() -> Path:
        return Map2Paths.user_file("midi_hub_message_mapper.json")

    @staticmethod
    def midi_hub_scheduler_path() -> Path:
        return Map2Paths.user_file("midi_hub_scheduler.json")

    @staticmethod
    def midi_hub_presets_path() -> Path:
        return Map2Paths.user_file("midi_hub_presets", "presets.json")

    @staticmethod
    def midi_hub_recordings_dir() -> Path:
        return Map2Paths.user_file("midi_hub_recordings")

    @staticmethod
    def midi_hub_traffic_exports_dir() -> Path:
        return Map2Paths.user_file("midi_hub_traffic_exports")

    @staticmethod
    def midi_scripts_registry_path() -> Path:
        return Map2Paths.user_file("midi_scripts", "scripts.json")

    @staticmethod
    def midi_scripts_state_path() -> Path:
        return Map2Paths.user_file("midi_scripts", "state.json")

    # -- diagnostics ---------------------------------------------------------

    @staticmethod
    def plane_summary() -> Dict[str, Dict[str, object]]:
        """Return a per-plane summary for diagnostics / the authority doctor.

        Each entry includes the resolved root, whether the default or an
        env override is in effect, and whether the root currently exists
        on disk. Consumed by the T2431-J ``map2 authority doctor`` CLI.
        """
        roots = {
            "host": (_ENV_HOST_ROOT, _DEFAULT_HOST_ROOT, Map2Paths.host_config_dir()),
            "service": (_ENV_SERVICE_ROOT, _DEFAULT_SERVICE_ROOT, Map2Paths.service_state_dir()),
            "user": (_ENV_USER_ROOT, _DEFAULT_USER_ROOT, Map2Paths.user_dir()),
            # T2529-A4: FHS §3 service planes
            "runtime": (_ENV_RUNTIME_ROOT, _DEFAULT_RUNTIME_ROOT, Map2Paths.runtime_dir()),
            "cache": (_ENV_CACHE_ROOT, _DEFAULT_CACHE_ROOT, Map2Paths.cache_dir()),
            "log": (_ENV_LOG_ROOT, _DEFAULT_LOG_ROOT, Map2Paths.log_dir()),
            "app_install": (
                _ENV_APP_INSTALL_ROOT,
                _DEFAULT_APP_INSTALL_ROOT,
                Map2Paths.app_install_dir(),
            ),
        }
        summary: Dict[str, Dict[str, object]] = {}
        for plane, (env_var, default, resolved) in roots.items():
            env_value = os.environ.get(env_var)
            summary[plane] = {
                "root": str(resolved),
                "default": str(default.expanduser()),
                "override_env_var": env_var,
                "override_active": env_value is not None,
                "exists": resolved.exists(),
            }
        return summary

    # -- directory lifecycle -------------------------------------------------

    @staticmethod
    def ensure_user_directories() -> None:
        """Create per-user directories needed by user-plane services.

        Host and service plane directories are created by the installer /
        systemd unit with the correct ownership and permissions, not by
        application code running as the service user.
        """
        directories = [
            Map2Paths.user_dir(),
            Map2Paths.user_sessions_dir(),
            Map2Paths.midi_hub_recordings_dir(),
            Map2Paths.midi_hub_traffic_exports_dir(),
            Map2Paths.midi_hub_presets_path().parent,
            Map2Paths.midi_scripts_registry_path().parent,
        ]
        for directory in directories:
            try:
                directory.mkdir(parents=True, exist_ok=True)
            except (PermissionError, OSError) as exc:
                logger.warning("Cannot create user directory %s: %s", directory, exc)


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
            path = get_config().get("storage.soundfont_user_dir")
            if path:
                return Path(path).expanduser()
        except (KeyError, AttributeError, TypeError):
            pass
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
            path = get_config().get("storage.soundfont_system_dir")
            if path:
                return Path(path)
        except (KeyError, AttributeError, TypeError):
            pass
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
