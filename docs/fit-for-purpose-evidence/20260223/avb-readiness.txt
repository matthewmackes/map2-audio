"""
Canonical AVB readiness evaluation shared across backend surfaces.

This module defines one readiness model that callers can use for:
- AVB status reporting
- AVB device inventory availability
- AVB service gating
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

_AVB_MARKER_PATH = "/etc/map2/avb-enabled"
_PTP4L_PID_PATH = "/run/ptp4l.pid"


@dataclass
class AvbReadiness:
    enabled: bool
    configured: bool
    operational: bool
    degraded: bool
    available: bool
    state: str
    interface: str
    interface_source: str
    reason: Optional[str]
    checks: Dict[str, Any]


def _is_truthy(raw_value: Optional[str]) -> bool:
    if raw_value is None:
        return False
    normalized = raw_value.strip().lower()
    return normalized in {"1", "true", "yes", "on"}


def _read_marker_metadata(path: str = _AVB_MARKER_PATH) -> Dict[str, str]:
    metadata: Dict[str, str] = {}
    if not os.path.exists(path):
        return metadata

    try:
        with open(path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, value = line.split("=", 1)
                normalized_key = key.strip().lower()
                normalized_value = value.strip()
                if normalized_key:
                    metadata[normalized_key] = normalized_value
    except Exception as exc:
        logger.debug("Failed to read AVB marker metadata from %s: %s", path, exc)

    return metadata


def _resolve_interface(
    *,
    config_interface: str,
    marker_interface: str,
    env_interface: str,
) -> Tuple[str, str]:
    interface_value = config_interface.strip()
    source = "config"

    if not interface_value:
        interface_value = marker_interface.strip()
        source = "marker" if interface_value else "none"

    if env_interface.strip():
        interface_value = env_interface.strip()
        source = "env_override"

    return interface_value, source


def _pid_file_running(pid_path: str = _PTP4L_PID_PATH) -> bool:
    if not os.path.exists(pid_path):
        return False

    try:
        with open(pid_path, "r", encoding="utf-8") as handle:
            raw_pid = handle.read().strip()
        pid = int(raw_pid)
        if pid <= 0:
            return False
        return os.path.exists(f"/proc/{pid}")
    except Exception:
        return False


def _run_is_active(service_name: str) -> bool:
    try:
        result = subprocess.run(
            ["systemctl", "is-active", service_name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=0.25,
            check=False,
        )
        return result.returncode == 0
    except Exception:
        return False


def _run_pidof(process_name: str) -> bool:
    try:
        result = subprocess.run(
            ["pidof", process_name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=0.25,
            check=False,
        )
        return result.returncode == 0
    except Exception:
        return False


def _is_ptp4l_running() -> Tuple[bool, str]:
    if _pid_file_running():
        return True, "pid_file"
    if _run_pidof("ptp4l"):
        return True, "pidof"
    if _run_is_active("map2-ptp4l.service"):
        return True, "systemd"
    return False, "not_running"


def _resolve_engine(engine: Optional[Any]) -> Optional[Any]:
    if engine is not None:
        return engine

    try:
        from app.services.juce_engine_service import get_audio_engine

        engine_service = get_audio_engine()
        return getattr(engine_service, "_engine", None)
    except Exception:
        return None


def _probe_engine_avb_ready(engine: Optional[Any]) -> Tuple[Optional[bool], str]:
    if engine is None:
        return None, "engine_unbound"

    for method_name in ("is_avb_available", "isAvbAvailable"):
        method = getattr(engine, method_name, None)
        if not callable(method):
            continue
        try:
            return bool(method()), method_name
        except Exception as exc:
            return False, f"{method_name}_error:{exc}"

    return None, "method_missing"


def get_avb_readiness(*, engine: Optional[Any] = None) -> Dict[str, Any]:
    """
    Evaluate canonical AVB readiness.

    States:
    - enabled: AVB intent is set (config, marker, or env)
    - configured: interface + binary prerequisites are present
    - operational: configured + ptp4l runtime + JUCE engine reports AVB ready
    - degraded: enabled but not operational
    """
    try:
        from app.config import config_get

        config_enabled = bool(config_get("avb.enabled", False))
        config_interface = str(config_get("avb.interface", "") or "").strip()
    except Exception as exc:
        logger.debug("Config lookup failed during AVB readiness evaluation: %s", exc)
        config_enabled = False
        config_interface = ""

    marker_present = os.path.exists(_AVB_MARKER_PATH)
    marker_metadata = _read_marker_metadata()
    marker_enabled = _is_truthy(marker_metadata.get("enabled"))
    marker_interface = str(marker_metadata.get("interface", "")).strip()

    env_enabled = _is_truthy(os.getenv("MAP2_AVB_ENABLED"))
    env_interface = str(os.getenv("MAP2_AVB_INTERFACE") or "").strip()

    enabled = config_enabled or env_enabled or marker_present or marker_enabled
    interface, interface_source = _resolve_interface(
        config_interface=config_interface,
        marker_interface=marker_interface,
        env_interface=env_interface,
    )

    interface_present = bool(interface)
    interface_exists = os.path.exists(f"/sys/class/net/{interface}") if interface_present else False
    ptp4l_binary_present = shutil.which("ptp4l") is not None
    ptp4l_running, ptp_probe = _is_ptp4l_running()

    engine_obj = _resolve_engine(engine)
    engine_avb_available, engine_probe = _probe_engine_avb_ready(engine_obj)

    configured = enabled and interface_present and interface_exists and ptp4l_binary_present
    operational = configured and ptp4l_running and bool(engine_avb_available)
    degraded = enabled and not operational

    state = "disabled"
    reason: Optional[str] = None
    if not enabled:
        reason = "AVB disabled in configuration"
    elif not interface_present:
        state = "enabled"
        reason = "No AVB interface configured"
    elif not interface_exists:
        state = "enabled"
        reason = f"Configured AVB interface not found: {interface}"
    elif not ptp4l_binary_present:
        state = "configured"
        reason = "ptp4l binary not found (linuxptp not installed)"
    elif not ptp4l_running:
        state = "configured"
        reason = "ptp4l is not running"
    elif engine_avb_available is None:
        state = "configured"
        reason = "JUCE engine AVB readiness probe unavailable"
    elif not engine_avb_available:
        state = "degraded"
        reason = "JUCE engine reports AVB unavailable"
    else:
        state = "operational"
        reason = None

    readiness = AvbReadiness(
        enabled=enabled,
        configured=configured,
        operational=operational,
        degraded=degraded,
        available=operational,
        state=state,
        interface=interface,
        interface_source=interface_source,
        reason=reason,
        checks={
            "config_enabled": config_enabled,
            "marker_present": marker_present,
            "marker_enabled": marker_enabled,
            "env_enabled": env_enabled,
            "marker_interface": marker_interface,
            "config_interface": config_interface,
            "interface_present": interface_present,
            "interface_exists": interface_exists,
            "ptp4l_binary_present": ptp4l_binary_present,
            "ptp4l_running": ptp4l_running,
            "ptp4l_probe": ptp_probe,
            "engine_bound": engine_obj is not None,
            "engine_avb_available": engine_avb_available,
            "engine_probe": engine_probe,
        },
    )

    return asdict(readiness)

