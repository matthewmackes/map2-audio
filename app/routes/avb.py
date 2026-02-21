"""
AVB/TSN Network Audio Transport API Routes

Provides REST endpoints for:
- PTP synchronization status
- TSN qdisc configuration (Phase 2)
- AVB stream management (Phase 5)

All endpoints return available=false gracefully when AVB is disabled or hardware unavailable.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse

from app.config import config_get
from app.services.avb import is_avb_available
from app.services.avb.ptp_monitor import get_ptp_monitor
from app.services.avb.tsn_qdisc import get_tsn_qdisc_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/avb", tags=["AVB/TSN"])
_acmp_srp_reservations: Dict[str, Dict[str, Optional[str]]] = {}
_ALLOWED_FAILOVER_POLICIES = {"none", "prefer_primary", "round_robin", "manual"}


def _srp_enabled() -> bool:
    return bool(config_get("avb.srp.enabled", True))


def _srp_required() -> bool:
    return _srp_enabled() and bool(config_get("avb.srp.required", True))


def _extract_host_from_node_address(node_address: Optional[str]) -> str:
    """Best-effort host extraction for endpoint-to-host display."""
    if not node_address:
        return ""

    try:
        parsed = urlparse(node_address)
        host = (parsed.hostname or "").strip()
        if host:
            return host
    except Exception:
        pass

    return node_address.strip().split("/", 1)[0].split("@")[-1].split(":")[0].strip()


def _parse_since_timestamp(since: Optional[str]) -> Optional[datetime]:
    if since is None:
        return None
    value = since.strip()
    if not value:
        return None
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is not None:
            return parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid since timestamp format: {since}. Use ISO 8601.",
        ) from exc


def _normalize_admission_decision(decision: Optional[str]) -> Optional[str]:
    if decision is None:
        return None
    value = decision.strip().lower()
    if not value:
        return None
    allowed = {"allowed", "denied", "bypass", "error"}
    if value not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid decision filter: {decision}. Allowed: {', '.join(sorted(allowed))}.",
        )
    return value


def _build_connection_failure_detail(
    *,
    code: str,
    message: str,
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    detail: Dict[str, Any] = {
        "code": code,
        "message": message,
    }
    if payload is None:
        return detail

    srp_release = payload.get("srp_release")
    if srp_release is not None:
        detail["srp_release"] = srp_release

    srp_release_warning = payload.get("srp_release_warning")
    if srp_release_warning is not None:
        detail["srp_release_warning"] = srp_release_warning

    return detail


_SRP_RELEASE_REMEDIATION = (
    "Verify SRP daemon health via GET /api/avb/srp/status.",
    "Check admission logs via GET /api/avb/srp/admissions.",
)


def _build_srp_release_payload(
    release_result: Any,
    *,
    reservation_id: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any]

    to_dict = getattr(release_result, "to_dict", None)
    if callable(to_dict):
        try:
            payload = dict(to_dict() or {})
        except Exception:
            payload = {}
    else:
        payload = {}

    if "success" not in payload:
        payload["success"] = bool(getattr(release_result, "success", False))
    if "reason_code" not in payload:
        payload["reason_code"] = getattr(release_result, "reason_code", None)
    if "reason" not in payload:
        payload["reason"] = getattr(release_result, "reason", None)

    daemon_type = getattr(release_result, "daemon_type", None)
    if daemon_type is not None and "daemon_type" not in payload:
        payload["daemon_type"] = daemon_type

    raw_response = getattr(release_result, "raw_response", None)
    if raw_response is not None and "raw_response" not in payload:
        payload["raw_response"] = raw_response

    if reservation_id is not None and "reservation_id" not in payload:
        payload["reservation_id"] = reservation_id

    return payload


def _build_srp_release_warning(
    *,
    reason: str,
    reservation_id: str,
    detail: Any,
) -> Dict[str, Any]:
    return {
        "code": "SRP_RELEASE_FAILED",
        "reason": reason,
        "reservation_id": reservation_id,
        "detail": str(detail),
        "remediation": list(_SRP_RELEASE_REMEDIATION),
    }


def _raise_srp_denied(
    result: Any,
    *,
    code: str = "SRP_ADMISSION_DENIED",
    reason_code: Optional[str] = None,
    reason: Optional[str] = None,
) -> None:
    raise HTTPException(
        status_code=409,
        detail={
            "code": code,
            "admission_id": getattr(result, "admission_id", None),
            "reason_code": reason_code or getattr(result, "reason_code", "SRP_DENIED"),
            "reason": reason or getattr(result, "reason", "SRP admission denied"),
            "remediation": list(getattr(result, "remediation", []) or []),
            "daemon_type": getattr(result, "daemon_type", "none"),
            "endpoint": getattr(result, "endpoint", None),
        },
    )


def _is_avdecc_enabled() -> bool:
    """
    Check AVDECC feature flag with backward-compatible key fallback.

    Canonical key: avb.avdecc_enabled
    Legacy keys kept for existing config files:
    - avdecc.enabled
    - avb.discovery.avdecc_enabled
    """
    canonical = config_get("avb.avdecc_enabled", None)
    if canonical is not None:
        return bool(canonical)

    legacy = config_get("avdecc.enabled", None)
    if legacy is not None:
        return bool(legacy)

    return bool(config_get("avb.discovery.avdecc_enabled", False))


def _resolve_entity_capability_enum():
    """Resolve AVDECC EntityCapability enum from bindings when available."""
    try:
        from app.services.juce_engine_service import juce_engine

        avdecc_cls = getattr(juce_engine, "Avdecc", None)
        if avdecc_cls is None:
            return None
        return getattr(avdecc_cls, "EntityCapability", None)
    except Exception:
        return None


def _entity_supports_gptp(entity: Any) -> bool:
    """Best-effort gPTP capability check for AVDECC entities."""
    gptp_supported = getattr(entity, "gptp_supported", None)
    if gptp_supported is not None:
        return bool(gptp_supported)

    has_capability = getattr(entity, "hasCapability", None)
    if not callable(has_capability):
        return False

    enum_container = getattr(entity, "EntityCapability", None)
    if enum_container is None:
        enum_container = _resolve_entity_capability_enum()
    if enum_container is None:
        return False

    gptp_capability = getattr(enum_container, "GPTP_SUPPORTED", None)
    if gptp_capability is None:
        return False

    try:
        return bool(has_capability(gptp_capability))
    except Exception:
        return False


def _status_to_dict(status: Any) -> Dict[str, Any]:
    """Best-effort conversion for status payload objects."""
    if isinstance(status, dict):
        return dict(status)

    to_dict = getattr(status, "to_dict", None)
    if callable(to_dict):
        try:
            data = to_dict()
            if isinstance(data, dict):
                return dict(data)
        except Exception:
            return {}
    return {}


def _stream_interface_name(stream: Dict[str, Any]) -> str:
    """Resolve stream interface from payload, falling back to global config."""
    config = stream.get("config") if isinstance(stream.get("config"), dict) else {}
    interface = str(config.get("interface", "")).strip()
    if interface:
        return interface
    return str(config_get("avb.interface", "") or "").strip()


def _build_stream_health(
    stream: Dict[str, Any],
    *,
    ptp_status: Dict[str, Any],
    tsn_status: Dict[str, Any],
) -> Dict[str, Any]:
    """Compose stream health from lifecycle state + transport sync snapshots."""
    stream_state = str(stream.get("state", "") or "").lower()
    stream_error = stream.get("error")
    interface = _stream_interface_name(stream)

    ptp_available = bool(ptp_status.get("available"))
    tsn_available = bool(tsn_status.get("available"))
    tsn_interface = str(tsn_status.get("interface", "") or "").strip()
    interface_matches = not interface or not tsn_interface or interface == tsn_interface

    issues: List[str] = []
    if not ptp_available:
        issues.append("PTP_UNAVAILABLE")
    if not tsn_available:
        issues.append("TSN_UNAVAILABLE")
    if not interface_matches:
        issues.append("TSN_INTERFACE_MISMATCH")
    if stream_state == "error" or stream_error:
        issues.append("STREAM_ERROR")

    ready = ptp_available and tsn_available and interface_matches and stream_state != "error"

    return {
        "ready": ready,
        "issues": issues,
        "interface": interface,
        "ptp": {
            "available": ptp_available,
            "state": ptp_status.get("state"),
            "offset_ns": ptp_status.get("offset_ns"),
            "mean_path_delay_ns": ptp_status.get("mean_path_delay_ns"),
            "last_update": ptp_status.get("last_update"),
            "error": ptp_status.get("error"),
        },
        "tsn": {
            "available": tsn_available,
            "interface": tsn_status.get("interface"),
            "mqprio_configured": bool(tsn_status.get("mqprio_configured")),
            "cbs_configured": bool(tsn_status.get("cbs_configured")),
            "etf_configured": bool(tsn_status.get("etf_configured")),
            "vlan_configured": bool(tsn_status.get("vlan_configured")),
            "error": tsn_status.get("error"),
        },
    }


async def _collect_transport_health_snapshots(streams: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Collect one PTP snapshot and TSN snapshots keyed by interface."""
    try:
        ptp_raw = await get_ptp_monitor().get_status()
        ptp_status = _status_to_dict(ptp_raw)
    except Exception as exc:
        ptp_status = {"available": False, "error": str(exc)}

    if "available" not in ptp_status:
        ptp_status["available"] = False

    interfaces = {
        _stream_interface_name(stream)
        for stream in streams
        if isinstance(stream, dict)
    }
    interfaces = {iface for iface in interfaces if iface}
    if not interfaces:
        fallback_interface = str(config_get("avb.interface", "") or "").strip()
        if fallback_interface:
            interfaces.add(fallback_interface)

    tsn_by_interface: Dict[str, Dict[str, Any]] = {}
    if interfaces:
        tasks = [
            get_tsn_qdisc_manager().get_status(interface=interface)
            for interface in sorted(interfaces)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for interface, result in zip(sorted(interfaces), results):
            if isinstance(result, Exception):
                tsn_by_interface[interface] = {"available": False, "interface": interface, "error": str(result)}
                continue

            payload = _status_to_dict(result)
            if "available" not in payload:
                payload["available"] = False
            payload.setdefault("interface", interface)
            tsn_by_interface[interface] = payload
    else:
        tsn_by_interface[""] = {"available": False, "error": "No AVB interface configured"}

    return {
        "ptp": ptp_status,
        "tsn_by_interface": tsn_by_interface,
    }


def _coerce_positive_int(raw: Any, default: int) -> int:
    """Convert values to positive integers, preserving default on invalid input."""
    try:
        value = int(raw)
    except Exception:
        return default
    return value if value > 0 else default


def _normalize_string_list(raw: Any) -> List[str]:
    """Normalize list-ish payloads into unique non-empty strings preserving order."""
    if isinstance(raw, (list, tuple, set)):
        source = list(raw)
    elif isinstance(raw, str):
        text = raw.strip()
        if text.startswith("[") and text.endswith("]"):
            try:
                decoded = json.loads(text)
                if isinstance(decoded, list):
                    source = decoded
                else:
                    source = [part for part in text.split(",")]
            except Exception:
                source = [part for part in text.split(",")]
        else:
            source = [part for part in text.split(",")]
    else:
        return []

    normalized: List[str] = []
    for item in source:
        value = str(item or "").strip()
        if value and value not in normalized:
            normalized.append(value)
    return normalized


def _sanitize_failover_policy(raw: Any) -> str:
    """Coerce configured failover policy into canonical value with safe fallback."""
    value = str(raw or "").strip().lower()
    if value in _ALLOWED_FAILOVER_POLICIES:
        return value
    return "none"


def _parse_failover_policy(raw: Any, *, default: str) -> str:
    """Parse request failover policy and fail-fast on invalid values."""
    value = str(raw or "").strip().lower()
    if not value:
        return default
    if value not in _ALLOWED_FAILOVER_POLICIES:
        allowed = ", ".join(sorted(_ALLOWED_FAILOVER_POLICIES))
        raise HTTPException(status_code=400, detail=f"failover_policy must be one of: {allowed}")
    return value


def _parse_failover_interfaces(raw: Any) -> List[str]:
    """Parse request/global failover interfaces into normalized unique list."""
    if raw is None:
        return []
    if not isinstance(raw, (list, tuple, set, str)):
        raise HTTPException(
            status_code=400,
            detail="failover_interfaces must be a list, CSV string, or JSON array string",
        )
    return _normalize_string_list(raw)


def _build_config_compatibility_matrix() -> Dict[str, Any]:
    """Build compatibility profile summary for operational validation."""
    enabled = bool(config_get("avb.enabled", False))
    srp_enabled = _srp_enabled()
    srp_required = _srp_required()
    avdecc_enabled = _is_avdecc_enabled()
    failover_policy = _sanitize_failover_policy(config_get("avb.failover_policy", "none"))
    failover_interfaces = _normalize_string_list(config_get("avb.failover_interfaces", []))
    interface = str(config_get("avb.interface", "") or "").strip()

    active_profile = "default"
    if srp_required and avdecc_enabled:
        active_profile = "strict_srp_avdecc"
    elif srp_required:
        active_profile = "strict_srp"
    elif avdecc_enabled:
        active_profile = "avdecc_enabled"

    profiles: List[Dict[str, Any]] = [
        {
            "profile": "default",
            "description": "Baseline MAP2-only AVB operation with optional SRP enforcement.",
            "flags": {
                "srp_required": False,
                "avdecc_enabled": False,
            },
        },
        {
            "profile": "strict_srp",
            "description": "Enforces SRP reservation IDs for admission-controlled stream setup.",
            "flags": {
                "srp_required": True,
                "avdecc_enabled": False,
            },
        },
        {
            "profile": "avdecc_enabled",
            "description": "Enables third-party AVDECC endpoint discovery and connection APIs.",
            "flags": {
                "srp_required": False,
                "avdecc_enabled": True,
            },
        },
        {
            "profile": "strict_srp_avdecc",
            "description": "Combines strict SRP admission enforcement with AVDECC interoperability.",
            "flags": {
                "srp_required": True,
                "avdecc_enabled": True,
            },
        },
    ]

    return {
        "active_profile": active_profile,
        "enabled": enabled,
        "interface": interface,
        "failover": {
            "policy": failover_policy,
            "interfaces": failover_interfaces,
        },
        "flags": {
            "srp_enabled": srp_enabled,
            "srp_required": srp_required,
            "avdecc_enabled": avdecc_enabled,
        },
        "profiles": profiles,
    }


def _extract_stream_config(stream: Dict[str, Any]) -> Dict[str, Any]:
    config = stream.get("config")
    return dict(config) if isinstance(config, dict) else {}


def _build_effective_stream_config(stream: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build operator-visible runtime config after stream + global fallback resolution.

    This exposes the exact values used by diagnostics and health synthesis.
    """
    stream_config = _extract_stream_config(stream)
    global_interface = str(config_get("avb.interface", "") or "").strip()
    global_presentation_offset = _coerce_positive_int(config_get("avb.presentation_offset_us", 2000), 2000)
    global_buffer_size = _coerce_positive_int(config_get("audio.buffer_size", 256), 256)
    global_failover_policy = _sanitize_failover_policy(config_get("avb.failover_policy", "none"))
    global_failover_interfaces = _normalize_string_list(config_get("avb.failover_interfaces", []))

    interface = str(stream_config.get("interface", "") or "").strip() or global_interface
    channels = _coerce_positive_int(stream_config.get("channels", 2), 2)
    sample_rate = _coerce_positive_int(stream_config.get("sample_rate", 48000), 48000)
    buffer_size = _coerce_positive_int(stream_config.get("buffer_size", global_buffer_size), global_buffer_size)
    presentation_offset_us = _coerce_positive_int(
        stream_config.get("presentation_offset_us", global_presentation_offset),
        global_presentation_offset,
    )
    priority = _coerce_positive_int(stream_config.get("priority", 3), 3)
    dest_mac = stream_config.get("dest_mac")
    if dest_mac is not None:
        dest_mac = str(dest_mac).strip() or None

    stream_failover_policy = str(stream_config.get("failover_policy", "") or "").strip()
    if stream_failover_policy:
        failover_policy = _sanitize_failover_policy(stream_failover_policy)
    else:
        failover_policy = global_failover_policy
    failover_interfaces = _normalize_string_list(
        stream_config.get("failover_interfaces", global_failover_interfaces)
    )
    interface_candidates = [iface for iface in failover_interfaces if iface]
    if interface and interface not in interface_candidates:
        interface_candidates.insert(0, interface)

    return {
        "stream_id": str(stream.get("stream_id", "") or ""),
        "direction": str(stream.get("direction", "") or "").lower(),
        "interface": interface,
        "channels": channels,
        "sample_rate": sample_rate,
        "buffer_size": buffer_size,
        "presentation_offset_us": presentation_offset_us,
        "priority": priority,
        "dest_mac": dest_mac,
        "failover_policy": failover_policy or "none",
        "interface_candidates": interface_candidates,
    }


def _build_ptp_lock_state(ptp_status: Dict[str, Any]) -> Dict[str, Any]:
    """Derive explicit lock-state diagnostics from ptp monitor payload."""
    state = str(ptp_status.get("state", "") or "").strip()
    normalized_state = state.upper()
    available = bool(ptp_status.get("available"))
    error = ptp_status.get("error")
    lock_states = {"MASTER", "SLAVE", "PASSIVE", "UNCALIBRATED", "LOCKED", "SYNCED"}
    locked = available and not error and normalized_state in lock_states

    reason: Optional[str] = None
    if not available:
        reason = "PTP_UNAVAILABLE"
    elif error:
        reason = str(error)
    elif not normalized_state:
        reason = "PTP_STATE_UNKNOWN"
    elif normalized_state not in lock_states:
        reason = f"PTP_STATE_{normalized_state}"

    return {
        "locked": locked,
        "state": ptp_status.get("state"),
        "reason": reason,
        "offset_ns": ptp_status.get("offset_ns"),
        "mean_path_delay_ns": ptp_status.get("mean_path_delay_ns"),
        "last_update": ptp_status.get("last_update"),
    }


def _resolve_srp_binding(
    stream: Dict[str, Any],
    *,
    avb_service: Any,
) -> Optional[Dict[str, Any]]:
    payload_binding = stream.get("srp_binding")
    if isinstance(payload_binding, dict):
        return dict(payload_binding)

    stream_id = str(stream.get("stream_id", "") or "").strip()
    if not stream_id:
        return None

    get_binding = getattr(avb_service, "get_srp_binding", None)
    if callable(get_binding):
        binding = get_binding(stream_id)
        if isinstance(binding, dict):
            return dict(binding)
    return None


def _build_stream_diagnostics(
    stream: Dict[str, Any],
    *,
    avb_service: Any,
    ptp_status: Dict[str, Any],
    tsn_status: Dict[str, Any],
) -> Dict[str, Any]:
    srp_binding = _resolve_srp_binding(stream, avb_service=avb_service) or {}
    reservation_id = str(srp_binding.get("reservation_id") or "").strip() or None
    admission_id = str(srp_binding.get("admission_id") or "").strip() or None
    metadata = srp_binding.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}

    return {
        "effective_config": _build_effective_stream_config(stream),
        "ptp_lock": _build_ptp_lock_state(ptp_status),
        "tsn_qdisc": {
            "available": bool(tsn_status.get("available")),
            "interface": tsn_status.get("interface"),
            "mqprio_configured": bool(tsn_status.get("mqprio_configured")),
            "cbs_configured": bool(tsn_status.get("cbs_configured")),
            "etf_configured": bool(tsn_status.get("etf_configured")),
            "vlan_configured": bool(tsn_status.get("vlan_configured")),
            "error": tsn_status.get("error"),
        },
        "srp": {
            "enabled": _srp_enabled(),
            "required": _srp_required(),
            "bound": reservation_id is not None,
            "reservation_id": reservation_id,
            "admission_id": admission_id,
            "metadata": dict(metadata),
        },
    }


def _require_positive_int_field(
    payload: Dict[str, Any],
    key: str,
    *,
    default: int,
) -> int:
    """Parse request field as a positive integer or raise HTTP 400."""
    raw_value = payload.get(key, default)
    try:
        parsed = int(raw_value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"{key} must be a positive integer") from exc
    if parsed <= 0:
        raise HTTPException(status_code=400, detail=f"{key} must be a positive integer")
    return parsed


def _resolve_stream_interface(config_payload: Dict[str, Any]) -> str:
    """Resolve stream interface from request or global config, failing closed when missing."""
    interface = str(config_payload.get("interface", "") or "").strip()
    if interface:
        return interface
    fallback_interface = str(config_get("avb.interface", "") or "").strip()
    if fallback_interface:
        return fallback_interface
    raise HTTPException(
        status_code=400,
        detail="interface is required (set request.interface or avb.interface config)",
    )


@router.get("/ptp/status")
async def get_ptp_status() -> Dict[str, Any]:
    """
    Get PTP (IEEE 802.1AS gPTP) synchronization status.

    Returns:
        PTPStatus dict with:
        - available: bool (false if AVB disabled or ptp4l not running)
        - state: str (MASTER, SLAVE, LISTENING, etc.) if available
        - offset_ns: float (clock offset in nanoseconds) if available
        - mean_path_delay_ns: float (network delay) if available
        - grandmaster_id: str (GM clock identity) if available
        - error: str (error message) if unavailable

    This endpoint always returns 200 OK, even when AVB is unavailable.
    Check the 'available' field to determine if PTP is active.
    """
    try:
        # Check if AVB is enabled in config
        if not config_get("avb.enabled", False):
            return {
                "available": False,
                "error": "AVB not enabled in configuration"
            }

        # Check if AVB hardware is available
        if not is_avb_available():
            return {
                "available": False,
                "error": "AVB hardware not available (no TSN NIC or ptp4l not installed)"
            }

        # Get PTP status from monitor
        ptp_monitor = get_ptp_monitor()
        status = await ptp_monitor.get_status()

        return status.to_dict()

    except Exception as e:
        logger.error(f"Error getting PTP status: {e}", exc_info=True)
        return {
            "available": False,
            "error": f"Internal error: {str(e)}"
        }


@router.get("/status")
async def get_avb_status() -> Dict[str, Any]:
    """
    Get overall AVB/TSN system status.

    Returns:
        - enabled: bool (from config)
        - available: bool (hardware + software check)
        - interface: str (configured interface)
        - ptp: PTPStatus (from /ptp/status)
        - reason: str (why unavailable, if applicable)
    """
    try:
        enabled = config_get("avb.enabled", False)
        interface = config_get("avb.interface", "")
        available = is_avb_available()

        # Get PTP status
        ptp_status = await get_ptp_status()

        # Determine reason if not available
        reason = None
        if not enabled:
            reason = "AVB disabled in configuration"
        elif not interface:
            reason = "No AVB interface configured"
        elif not available:
            reason = "AVB hardware not available"

        return {
            "enabled": enabled,
            "available": available,
            "interface": interface,
            "ptp": ptp_status,
            "reason": reason,
            "compatibility": _build_config_compatibility_matrix(),
            "config": {
                "ptp_domain": config_get("avb.ptp_domain", 0),
                "ptp_priority1": config_get("avb.ptp_priority1", 128),
                "auto_connect": config_get("avb.auto_connect", False),
                "max_streams": config_get("avb.max_streams", 8),
            }
        }

    except Exception as e:
        logger.error(f"Error getting AVB status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config/compatibility")
async def get_avb_config_compatibility() -> Dict[str, Any]:
    """Get compatibility profile matrix for AVB runtime configuration."""
    try:
        return _build_config_compatibility_matrix()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AVB compatibility matrix: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/srp/status")
async def get_srp_status() -> Dict[str, Any]:
    """Get SRP/MSRP daemon admission-control status."""
    try:
        from app.services.avb.srp_admission import get_srp_admission_service

        service = get_srp_admission_service()
        return await service.get_status()
    except Exception as e:
        logger.error(f"Error getting SRP status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/srp/admissions")
async def get_srp_admissions(
    decision: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 100,
    endpoint: Optional[str] = None,
    offset: int = 0,
) -> Dict[str, Any]:
    """Query persistent SRP admission audit log entries."""
    try:
        from app.services.avb.srp_log_store import SrpAdmissionLogStore

        normalized_decision = _normalize_admission_decision(decision)
        since_dt = _parse_since_timestamp(since)
        store = SrpAdmissionLogStore()
        rows = await store.list_admissions(
            decision=normalized_decision,
            since=since_dt,
            limit=limit,
            endpoint=endpoint,
            offset=offset,
        )
        return {
            "count": len(rows),
            "filters": {
                "decision": normalized_decision,
                "since": since_dt.isoformat() if since_dt else None,
                "limit": max(1, min(int(limit), 500)),
                "endpoint": endpoint,
                "offset": max(0, int(offset)),
            },
            "admissions": rows,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing SRP admissions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/srp/admissions/{admission_id}")
async def get_srp_admission(admission_id: str) -> Dict[str, Any]:
    """Get one SRP admission audit entry by admission_id."""
    try:
        from app.services.avb.srp_log_store import SrpAdmissionLogStore

        store = SrpAdmissionLogStore()
        row = await store.get_admission(admission_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Admission record not found")
        return row
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting SRP admission record: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tsn/status")
async def get_tsn_status() -> Dict[str, Any]:
    """
    Get TSN (Traffic Control qdisc) configuration status.

    Returns:
        TsnStatus dict with:
        - available: bool (false if not configured)
        - interface: str (network interface)
        - mqprio_configured: bool (multi-queue priority qdisc)
        - cbs_configured: bool (Credit-Based Shaper)
        - etf_configured: bool (Earliest TxTime First)
        - vlan_configured: bool (VLAN 2 interface)
        - num_traffic_classes: int (number of TCs)
        - cbs_idleslope: int (CBS idle slope in bps)
        - queue_stats: dict (per-queue statistics)

    This endpoint always returns 200 OK, even when TSN is not configured.
    Check the 'available' field to determine if qdiscs are active.
    """
    try:
        # Check if AVB is enabled in config
        if not config_get("avb.enabled", False):
            return {
                "available": False,
                "error": "AVB not enabled in configuration"
            }

        # Get TSN qdisc status
        tsn_manager = get_tsn_qdisc_manager()
        status = await tsn_manager.get_status()

        return status.to_dict()

    except Exception as e:
        logger.error(f"Error getting TSN status: {e}", exc_info=True)
        return {
            "available": False,
            "error": f"Internal error: {str(e)}"
        }


@router.get("/tsn/calculate_cbs")
async def calculate_cbs_parameters(
    sample_rate: int = 48000,
    channels: int = 2,
    bit_depth: int = 24,
    link_speed_mbps: int = 1000
) -> Dict[str, Any]:
    """
    Calculate CBS (Credit-Based Shaper) parameters for given audio specs.

    Query parameters:
        - sample_rate: Audio sample rate in Hz (default: 48000)
        - channels: Number of audio channels (default: 2)
        - bit_depth: Bits per sample (default: 24)
        - link_speed_mbps: Link speed in Mbps (default: 1000)

    Returns:
        CBS parameters: idleslope, sendslope, hicredit, locredit, estimated_bandwidth_mbps
    """
    try:
        from app.services.avb.tsn_qdisc import TsnQdiscManager

        params = TsnQdiscManager.calculate_cbs_parameters(
            sample_rate=sample_rate,
            channels=channels,
            bit_depth=bit_depth,
            link_speed_mbps=link_speed_mbps
        )

        return {
            "input": {
                "sample_rate": sample_rate,
                "channels": channels,
                "bit_depth": bit_depth,
                "link_speed_mbps": link_speed_mbps
            },
            "cbs_parameters": params
        }

    except Exception as e:
        logger.error(f"Error calculating CBS parameters: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Stream Management Endpoints
# ============================================================================

@router.get("/streams")
async def get_streams() -> Dict[str, Any]:
    """
    Get all AVB streams.

    Returns:
        List of stream information dicts
    """
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            return {
                "available": False,
                "streams": [],
                "error": "AVB not available"
            }

        streams = avb_service.get_all_streams()
        snapshots = await _collect_transport_health_snapshots(streams)
        ptp_status = snapshots["ptp"]
        tsn_by_interface = snapshots["tsn_by_interface"]

        enriched_streams: List[Dict[str, Any]] = []
        for stream in streams:
            if not isinstance(stream, dict):
                continue
            stream_payload = dict(stream)
            stream_interface = _stream_interface_name(stream_payload)
            tsn_status = tsn_by_interface.get(stream_interface)
            if tsn_status is None:
                tsn_status = {"available": False, "interface": stream_interface, "error": "TSN status unavailable"}
            stream_payload["health"] = _build_stream_health(
                stream_payload,
                ptp_status=ptp_status,
                tsn_status=tsn_status,
            )
            stream_payload["diagnostics"] = _build_stream_diagnostics(
                stream_payload,
                avb_service=avb_service,
                ptp_status=ptp_status,
                tsn_status=tsn_status,
            )
            enriched_streams.append(stream_payload)

        return {
            "available": True,
            "streams": enriched_streams
        }

    except Exception as e:
        logger.error(f"Error getting AVB streams: {e}", exc_info=True)
        return {
            "available": False,
            "streams": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/streams/{stream_id}")
async def get_stream(stream_id: str) -> Dict[str, Any]:
    """Get specific AVB stream information"""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        stream = avb_service.get_stream(stream_id)

        if stream is None:
            raise HTTPException(status_code=404, detail="Stream not found")

        if not isinstance(stream, dict):
            raise HTTPException(status_code=500, detail="Invalid stream payload")

        snapshots = await _collect_transport_health_snapshots([stream])
        ptp_status = snapshots["ptp"]
        stream_interface = _stream_interface_name(stream)
        tsn_status = snapshots["tsn_by_interface"].get(stream_interface)
        if tsn_status is None:
            tsn_status = {"available": False, "interface": stream_interface, "error": "TSN status unavailable"}

        stream_payload = dict(stream)
        stream_payload["health"] = _build_stream_health(
            stream_payload,
            ptp_status=ptp_status,
            tsn_status=tsn_status,
        )
        stream_payload["diagnostics"] = _build_stream_diagnostics(
            stream_payload,
            avb_service=avb_service,
            ptp_status=ptp_status,
            tsn_status=tsn_status,
        )
        return stream_payload

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/streams/{stream_id}/diagnostics")
async def get_stream_diagnostics(stream_id: str) -> Dict[str, Any]:
    """Get one stream with consolidated runtime diagnostics."""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        stream = avb_service.get_stream(stream_id)
        if stream is None:
            raise HTTPException(status_code=404, detail="Stream not found")
        if not isinstance(stream, dict):
            raise HTTPException(status_code=500, detail="Invalid stream payload")

        snapshots = await _collect_transport_health_snapshots([stream])
        ptp_status = snapshots["ptp"]
        stream_interface = _stream_interface_name(stream)
        tsn_status = snapshots["tsn_by_interface"].get(stream_interface)
        if tsn_status is None:
            tsn_status = {"available": False, "interface": stream_interface, "error": "TSN status unavailable"}

        stream_payload = dict(stream)
        health = _build_stream_health(
            stream_payload,
            ptp_status=ptp_status,
            tsn_status=tsn_status,
        )
        diagnostics = _build_stream_diagnostics(
            stream_payload,
            avb_service=avb_service,
            ptp_status=ptp_status,
            tsn_status=tsn_status,
        )

        return {
            "stream_id": stream_payload.get("stream_id"),
            "state": stream_payload.get("state"),
            "health": health,
            "diagnostics": diagnostics,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AVB stream diagnostics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/streams")
async def create_stream(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create new AVB stream.

    Body:
        {
            "stream_id": "stream-001",
            "direction": "talker" or "listener",
            "channels": 2,
            "sample_rate": 48000,
            "buffer_size": 256,
            "interface": "enp3s0",
            "dest_mac": "01:AA:BB:CC:DD:EE"  // for talkers only
        }
    """
    try:
        from app.services.avb.avb_service import get_avb_service, AvbStreamConfig, StreamDirection

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        stream_id = config.get("stream_id")
        if not isinstance(stream_id, str) or not stream_id.strip():
            raise HTTPException(status_code=400, detail="stream_id is required")

        direction_raw = config.get("direction")
        if not isinstance(direction_raw, str):
            raise HTTPException(status_code=400, detail="direction must be 'talker' or 'listener'")
        try:
            direction = StreamDirection(direction_raw)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="direction must be 'talker' or 'listener'") from exc

        srp_payload = config.get("srp")
        srp_reservation_id = None
        srp_admission_id = None
        srp_metadata: Dict[str, Any] = {}

        if srp_payload is not None:
            if not isinstance(srp_payload, dict):
                raise HTTPException(status_code=400, detail="srp must be an object when provided")

            srp_reservation_raw = srp_payload.get("reservation_id")
            if srp_reservation_raw is not None:
                if not isinstance(srp_reservation_raw, str) or not srp_reservation_raw.strip():
                    raise HTTPException(status_code=400, detail="srp.reservation_id must be a non-empty string")
                srp_reservation_id = srp_reservation_raw.strip()

            srp_admission_raw = srp_payload.get("admission_id")
            if srp_admission_raw is not None:
                if not isinstance(srp_admission_raw, str) or not srp_admission_raw.strip():
                    raise HTTPException(status_code=400, detail="srp.admission_id must be a non-empty string")
                srp_admission_id = srp_admission_raw.strip()

            for key in (
                "talker_id",
                "listener_id",
                "endpoint",
                "class",
                "vlan_id",
                "daemon_type",
                "daemon_socket",
            ):
                if key in srp_payload:
                    srp_metadata[key] = srp_payload.get(key)

            if _srp_required() and srp_reservation_id is None:
                raise HTTPException(
                    status_code=400,
                    detail="Strict SRP mode requires srp.reservation_id when SRP metadata is provided",
                )

        channels = _require_positive_int_field(config, "channels", default=2)
        sample_rate = _require_positive_int_field(config, "sample_rate", default=48000)
        buffer_size = _require_positive_int_field(config, "buffer_size", default=256)
        presentation_offset_us = _require_positive_int_field(config, "presentation_offset_us", default=2000)

        try:
            priority = int(config.get("priority", 3))
        except Exception as exc:
            raise HTTPException(status_code=400, detail="priority must be an integer between 0 and 7") from exc
        if priority < 0 or priority > 7:
            raise HTTPException(status_code=400, detail="priority must be an integer between 0 and 7")

        interface = _resolve_stream_interface(config)
        global_failover_policy = _sanitize_failover_policy(config_get("avb.failover_policy", "none"))
        failover_policy = _parse_failover_policy(
            config.get("failover_policy"),
            default=global_failover_policy,
        )
        failover_raw = config.get("failover_interfaces", config_get("avb.failover_interfaces", []))
        failover_interfaces = _parse_failover_interfaces(failover_raw)
        if interface and interface not in failover_interfaces:
            failover_interfaces.insert(0, interface)

        # Parse config
        stream_config = AvbStreamConfig(
            stream_id=stream_id,
            direction=direction,
            channels=channels,
            sample_rate=sample_rate,
            buffer_size=buffer_size,
            interface=interface,
            dest_mac=config.get("dest_mac"),
            presentation_offset_us=presentation_offset_us,
            priority=priority,
            failover_policy=failover_policy,
            failover_interfaces=failover_interfaces,
            srp_reservation_id=srp_reservation_id,
            srp_admission_id=srp_admission_id,
            srp_metadata=srp_metadata,
        )

        result = await avb_service.create_stream(stream_config)

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return result

    except HTTPException:
        raise
    except (TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid stream config: {e}")
    except Exception as e:
        logger.error(f"Error creating AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/streams/{stream_id}")
async def delete_stream(stream_id: str) -> Dict[str, Any]:
    """Delete AVB stream"""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        binding = avb_service.get_srp_binding(stream_id)
        result = await avb_service.delete_stream(stream_id)

        if "error" in result:
            if result["code"] == "NOT_FOUND":
                raise HTTPException(status_code=404, detail=result["error"])
            raise HTTPException(status_code=400, detail=result["error"])

        if binding and binding.get("reservation_id"):
            reservation_id = str(binding["reservation_id"])
            try:
                from app.services.avb.srp_admission import get_srp_admission_service

                release_result = await get_srp_admission_service().release(
                    reservation_id=reservation_id,
                    endpoint="streams.delete",
                    stream_id=stream_id,
                )
                avb_service.clear_srp_reservation(stream_id)
                result["srp_release"] = _build_srp_release_payload(
                    release_result,
                    reservation_id=reservation_id,
                )
            except Exception as exc:
                logger.warning("SRP release failed during stream delete %s: %s", stream_id, exc)
                result["srp_release_warning"] = _build_srp_release_warning(
                    reason="Stream delete succeeded but SRP reservation release failed",
                    reservation_id=reservation_id,
                    detail=exc,
                )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/streams/{stream_id}/start")
async def start_stream(stream_id: str) -> Dict[str, Any]:
    """Start AVB stream"""
    created_binding = False
    start_succeeded = False
    rollback_handled = False
    srp_binding: Optional[Dict[str, Any]] = None
    avb_service = None
    admission: Any = None

    try:
        from app.services.avb.avb_service import get_avb_service
        from app.services.avb.srp_admission import SrpAdmissionRequest, get_srp_admission_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        stream = avb_service.get_stream(stream_id)
        if stream is None:
            raise HTTPException(status_code=404, detail="Stream not found")

        srp_binding = avb_service.get_srp_binding(stream_id)
        admission_payload: Optional[Dict[str, Any]] = None

        if _srp_enabled() and not srp_binding:
            admission = await get_srp_admission_service().admit(
                SrpAdmissionRequest(
                    endpoint="streams.start",
                    stream_id=stream_id,
                    talker_id=stream_id if stream.get("direction") == "talker" else None,
                    listener_id=stream_id if stream.get("direction") == "listener" else None,
                    request_metadata={
                        "direction": stream.get("direction"),
                        "channels": stream.get("config", {}).get("channels"),
                        "sample_rate": stream.get("config", {}).get("sample_rate"),
                    },
                )
            )
            admission_payload = admission.to_dict()
            if admission.decision == "denied":
                _raise_srp_denied(admission)
            if admission.decision == "allowed":
                if not admission.reservation_id:
                    _raise_srp_denied(
                        admission,
                        code="SRP_ADMISSION_INVALID",
                        reason_code="SRP_INVALID_ADMISSION",
                        reason="SRP admission acknowledged without reservation_id",
                    )

                bound = avb_service.bind_srp_reservation(
                    stream_id,
                    admission.reservation_id,
                    admission_id=admission.admission_id,
                    metadata={
                        "endpoint": admission.endpoint,
                        "daemon_type": admission.daemon_type,
                        "daemon_socket": admission.daemon_socket,
                        "reason_code": admission.reason_code,
                    },
                )
                if not bound:
                    raise HTTPException(status_code=500, detail="Failed to bind SRP reservation to stream")
                created_binding = True
                srp_binding = avb_service.get_srp_binding(stream_id)

        result = await avb_service.start_stream(stream_id)

        if "error" in result:
            if created_binding and srp_binding and srp_binding.get("reservation_id"):
                reservation_id = str(srp_binding["reservation_id"])
                try:
                    release_result = await get_srp_admission_service().release(
                        reservation_id=reservation_id,
                        endpoint="streams.start.rollback",
                        stream_id=stream_id,
                    )
                    avb_service.clear_srp_reservation(stream_id)
                    result["srp_release"] = _build_srp_release_payload(
                        release_result,
                        reservation_id=reservation_id,
                    )
                    rollback_handled = True
                except Exception as release_exc:
                    logger.warning(
                        "SRP release failed during stream start rollback %s: %s",
                        stream_id,
                        release_exc,
                    )
                    result["srp_release_warning"] = _build_srp_release_warning(
                        reason="Stream start failed and SRP rollback release also failed",
                        reservation_id=reservation_id,
                        detail=release_exc,
                    )
                    rollback_handled = True
            if result["code"] == "NOT_FOUND":
                raise HTTPException(status_code=404, detail=result["error"])
            raise HTTPException(status_code=400, detail=result["error"])

        start_succeeded = True

        if srp_binding:
            result["srp"] = srp_binding
        if admission_payload:
            result["srp_admission"] = admission_payload

        return result

    except HTTPException:
        if avb_service is not None:
            rollback_reservation: Optional[str] = None
            if created_binding and srp_binding and srp_binding.get("reservation_id"):
                rollback_reservation = str(srp_binding["reservation_id"])
            elif admission is not None and getattr(admission, "decision", None) == "allowed":
                reservation_id = getattr(admission, "reservation_id", None)
                if reservation_id:
                    rollback_reservation = str(reservation_id)

            if rollback_reservation and not start_succeeded and not rollback_handled:
                try:
                    from app.services.avb.srp_admission import get_srp_admission_service

                    await get_srp_admission_service().release(
                        reservation_id=rollback_reservation,
                        endpoint="streams.start.exception",
                        stream_id=stream_id,
                    )
                    if created_binding:
                        avb_service.clear_srp_reservation(stream_id)
                except Exception as release_exc:
                    logger.warning(
                        "SRP release failed during stream start HTTPException %s: %s",
                        stream_id,
                        release_exc,
                    )
        raise
    except Exception as e:
        if avb_service is not None:
            rollback_reservation: Optional[str] = None
            if created_binding and srp_binding and srp_binding.get("reservation_id"):
                rollback_reservation = str(srp_binding["reservation_id"])
            elif admission is not None and getattr(admission, "decision", None) == "allowed":
                reservation_id = getattr(admission, "reservation_id", None)
                if reservation_id:
                    rollback_reservation = str(reservation_id)

            if rollback_reservation and not start_succeeded and not rollback_handled:
                try:
                    from app.services.avb.srp_admission import get_srp_admission_service

                    await get_srp_admission_service().release(
                        reservation_id=rollback_reservation,
                        endpoint="streams.start.exception",
                        stream_id=stream_id,
                    )
                    if created_binding:
                        avb_service.clear_srp_reservation(stream_id)
                except Exception as release_exc:
                    logger.warning(
                        "SRP release failed during stream start exception %s: %s",
                        stream_id,
                        release_exc,
                    )
        logger.error(f"Error starting AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/streams/{stream_id}/stop")
async def stop_stream(stream_id: str) -> Dict[str, Any]:
    """Stop AVB stream"""
    try:
        from app.services.avb.avb_service import get_avb_service
        from app.services.avb.srp_admission import get_srp_admission_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        srp_binding = avb_service.get_srp_binding(stream_id)
        result = await avb_service.stop_stream(stream_id)

        if "error" in result:
            if result["code"] == "NOT_FOUND":
                raise HTTPException(status_code=404, detail=result["error"])
            raise HTTPException(status_code=400, detail=result["error"])

        if srp_binding and srp_binding.get("reservation_id"):
            reservation_id = str(srp_binding["reservation_id"])
            try:
                release_result = await get_srp_admission_service().release(
                    reservation_id=reservation_id,
                    endpoint="streams.stop",
                    stream_id=stream_id,
                )
                avb_service.clear_srp_reservation(stream_id)
                result["srp_release"] = _build_srp_release_payload(
                    release_result,
                    reservation_id=reservation_id,
                )
            except Exception as release_exc:
                logger.warning("SRP release failed during stream stop %s: %s", stream_id, release_exc)
                result["srp_release_warning"] = _build_srp_release_warning(
                    reason="Stream stop succeeded but SRP reservation release failed",
                    reservation_id=reservation_id,
                    detail=release_exc,
                )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/streams/{stream_id}/stats")
async def get_stream_stats(stream_id: str) -> Dict[str, Any]:
    """Get AVB stream statistics"""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        stats = avb_service.get_stream_stats(stream_id)

        if stats is None:
            raise HTTPException(status_code=404, detail="Stream not found")

        return stats

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AVB stream stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/streams/{stream_id}/stats/reset")
async def reset_stream_stats(stream_id: str) -> Dict[str, Any]:
    """Reset AVB stream statistics"""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        if avb_service.get_stream(stream_id) is None:
            raise HTTPException(status_code=404, detail="Stream not found")

        success = avb_service.reset_stream_stats(stream_id)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to reset stream stats")

        return {"status": "reset", "stream_id": stream_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting AVB stream stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/devices")
async def get_avb_devices() -> Dict[str, Any]:
    """
    Get AVB device inventory exposed by JUCE engine.

    Returns:
        - available: AVB runtime availability
        - count: number of AVB device names
        - device_names: JUCE-selectable AVB device names
        - discovered_count: number of discovered endpoint cache entries
        - discovered_devices: normalized discovered endpoint metadata
    """
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()
        device_names = avb_service.get_device_names()
        discovered_devices = avb_service.get_discovered_devices()

        return {
            "available": avb_service.is_available(),
            "count": len(device_names),
            "device_names": device_names,
            "discovered_count": len(discovered_devices),
            "discovered_devices": discovered_devices,
        }
    except Exception as e:
        logger.error(f"Error getting AVB device inventory: {e}", exc_info=True)
        return {
            "available": False,
            "count": 0,
            "device_names": [],
            "discovered_count": 0,
            "discovered_devices": [],
            "error": f"Internal error: {str(e)}",
        }


# ============================================================================
# Discovery Endpoints
# ============================================================================

@router.get("/discovery")
async def get_avb_discovery() -> Dict[str, Any]:
    """
    Get AVB device discovery summary.

    Returns:
        Discovery summary with:
        - enabled: bool (AVB discovery enabled)
        - total_discovered: int (number of discovered AVB nodes)
        - talker_nodes: int (nodes with talker streams)
        - listener_nodes: int (nodes with listener streams)
        - nodes: list of discovered AvbNode objects

    This endpoint always returns 200 OK, even when AVB discovery is disabled.
    Check the 'enabled' field to determine if discovery is active.
    """
    try:
        from app.services.avb.avb_discovery import get_avb_discovery_service

        discovery = get_avb_discovery_service()
        return discovery.get_discovery_summary()

    except Exception as e:
        logger.error(f"Error getting AVB discovery summary: {e}", exc_info=True)
        return {
            "enabled": False,
            "total_discovered": 0,
            "talker_nodes": 0,
            "listener_nodes": 0,
            "nodes": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/discovery/nodes")
async def get_discovered_nodes() -> Dict[str, Any]:
    """
    Get list of discovered AVB nodes.

    Returns:
        List of discovered AvbNode objects (online only)
    """
    try:
        from app.services.avb.avb_discovery import get_avb_discovery_service

        discovery = get_avb_discovery_service()

        if not discovery.is_enabled():
            return {
                "enabled": False,
                "nodes": [],
                "error": "AVB discovery not enabled"
            }

        nodes = discovery.get_discovered_nodes()

        return {
            "enabled": True,
            "nodes": [n.to_dict() for n in nodes]
        }

    except Exception as e:
        logger.error(f"Error getting discovered AVB nodes: {e}", exc_info=True)
        return {
            "enabled": False,
            "nodes": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/discovery/nodes/{node_id}")
async def get_discovered_node(node_id: str) -> Dict[str, Any]:
    """Get specific discovered AVB node by ID"""
    try:
        from app.services.avb.avb_discovery import get_avb_discovery_service

        discovery = get_avb_discovery_service()

        if not discovery.is_enabled():
            raise HTTPException(status_code=503, detail="AVB discovery not enabled")

        node = discovery.get_discovered_node(node_id)

        if node is None:
            raise HTTPException(status_code=404, detail="Node not found")

        return node.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting discovered AVB node: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AVDECC (IEEE 1722.1) Endpoints
# ============================================================================

@router.get("/avdecc/entities")
async def get_avdecc_entities() -> Dict[str, Any]:
    """
    Get discovered AVDECC entities (third-party AVB devices).

    Returns:
        List of discovered AVDECC entities with capabilities.
    """
    try:
        if not _is_avdecc_enabled():
            return {
                "enabled": False,
                "entities": [],
                "error": "AVDECC not enabled in configuration"
            }

        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router or not router.avdecc_entity:
            return {
                "enabled": False,
                "entities": [],
                "error": "AVDECC entity not initialized"
            }

        # Get discovered entities from AVDECC
        entities = await asyncio.to_thread(
            router.avdecc_entity.getDiscoveredEntities
        )

        entities_list = [
            {
                "entity_id": format(e.entity_id, '016x'),
                "entity_model_id": format(e.entity_model_id, '016x'),
                "entity_name": e.entity_name,
                "firmware_version": e.firmware_version,
                "mac_address": ":".join(f"{b:02x}" for b in e.mac_address),
                "capabilities": {
                    "talker_streams": e.talker_stream_sources,
                    "listener_streams": e.listener_stream_sinks,
                    "is_audio_talker": e.isAudioTalker(),
                    "is_audio_listener": e.isAudioListener(),
                    "gptp_supported": _entity_supports_gptp(e)
                },
                "ptp": {
                    "grandmaster_id": format(e.gptp_grandmaster_id, '016x'),
                    "domain": e.gptp_domain_number
                },
                "available": e.available,
                "last_seen": e.last_seen.isoformat()
            }
            for e in entities
        ]

        return {
            "enabled": True,
            "entities": entities_list
        }

    except Exception as e:
        logger.error(f"Error getting AVDECC entities: {e}", exc_info=True)
        return {
            "enabled": False,
            "entities": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/avdecc/entities/{entity_id}")
async def get_avdecc_entity(entity_id: str) -> Dict[str, Any]:
    """Get specific AVDECC entity by ID"""
    try:
        if not _is_avdecc_enabled():
            raise HTTPException(status_code=503, detail="AVDECC not enabled")

        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router or not router.avdecc_entity:
            raise HTTPException(status_code=503, detail="AVDECC entity not initialized")

        # Parse entity ID from hex string
        entity_id_int = int(entity_id, 16)

        # Find entity
        entity = await asyncio.to_thread(
            router.avdecc_entity.findEntity,
            entity_id_int
        )

        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")

        return {
            "entity_id": format(entity.entity_id, '016x'),
            "entity_model_id": format(entity.entity_model_id, '016x'),
            "entity_name": entity.entity_name,
            "firmware_version": entity.firmware_version,
            "mac_address": ":".join(f"{b:02x}" for b in entity.mac_address),
            "capabilities": {
                "talker_streams": entity.talker_stream_sources,
                "listener_streams": entity.listener_stream_sinks,
                "is_audio_talker": entity.isAudioTalker(),
                "is_audio_listener": entity.isAudioListener()
            },
            "available": entity.available
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AVDECC entity: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/avdecc/stats")
async def get_avdecc_stats() -> Dict[str, Any]:
    """Get AVDECC protocol statistics"""
    try:
        if not _is_avdecc_enabled():
            return {
                "enabled": False,
                "error": "AVDECC not enabled"
            }

        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router or not router.avdecc_entity:
            return {
                "enabled": False,
                "error": "AVDECC entity not initialized"
            }

        stats = await asyncio.to_thread(router.avdecc_entity.getStats)

        return {
            "enabled": True,
            "adp": {
                "messages_sent": stats.adp_messages_sent,
                "messages_received": stats.adp_messages_received
            },
            "acmp": {
                "messages_sent": stats.acmp_messages_sent,
                "messages_received": stats.acmp_messages_received
            },
            "aecp": {
                "messages_sent": stats.aecp_messages_sent,
                "messages_received": stats.aecp_messages_received
            },
            "entities_discovered": stats.entities_discovered,
            "connections_active": stats.connections_active
        }

    except Exception as e:
        logger.error(f"Error getting AVDECC stats: {e}", exc_info=True)
        return {
            "enabled": False,
            "error": f"Internal error: {str(e)}"
        }


# ============================================================================
# Routing Matrix Endpoints
# ============================================================================

@router.get("/router/endpoints")
async def get_router_endpoints(direction: Optional[str] = None) -> Dict[str, Any]:
    """
    Get all audio endpoints (talkers and listeners).

    Query params:
        direction: Optional filter ("talker" or "listener")

    Returns:
        List of AudioEndpoint objects
    """
    try:
        from app.services.avb.avb_router import get_avb_router, StreamDirection

        router = get_avb_router()

        if not router:
            return {
                "endpoints": [],
                "error": "Router not initialized"
            }

        # Parse direction filter
        dir_filter = None
        if direction:
            dir_filter = StreamDirection(direction.lower())

        endpoints = router.get_endpoints(dir_filter)

        endpoints_list = [
            {
                "endpoint_id": ep.endpoint_id(),
                "entity_id": ep.entity_id,
                "unique_id": ep.unique_id,
                "direction": ep.direction.value,
                "device_type": ep.device_type,
                "device_name": ep.device_name,
                "channels": ep.channels,
                "sample_rate": ep.sample_rate,
                "format": ep.format,
                "mac_address": ep.mac_address,
                "node_address": ep.node_address,
                "host": _extract_host_from_node_address(ep.node_address),
                "available": ep.available,
                "last_seen": ep.last_seen.isoformat()
            }
            for ep in endpoints
        ]

        return {
            "endpoints": endpoints_list,
            "count": len(endpoints_list)
        }

    except Exception as e:
        logger.error(f"Error getting router endpoints: {e}", exc_info=True)
        return {
            "endpoints": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/router/connections")
async def get_router_connections() -> Dict[str, Any]:
    """
    Get all active stream connections.

    Returns:
        List of StreamConnection objects
    """
    try:
        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router:
            return {
                "connections": [],
                "error": "Router not initialized"
            }

        connections = router.get_connections()

        connections_list = [
            {
                "connection_id": conn.connection_id(),
                "talker": {
                    "endpoint_id": conn.talker.endpoint_id(),
                    "device_name": conn.talker.device_name,
                    "channels": conn.talker.channels,
                    "sample_rate": conn.talker.sample_rate
                },
                "listener": {
                    "endpoint_id": conn.listener.endpoint_id(),
                    "device_name": conn.listener.device_name,
                    "channels": conn.listener.channels,
                    "sample_rate": conn.listener.sample_rate
                },
                "state": conn.state.value,
                "established_time": conn.established_time.isoformat() if conn.established_time else None,
                "error_message": conn.error_message,
                "srp_reservation_id": conn.srp_reservation_id,
                "srp_admission_id": conn.srp_admission_id,
            }
            for conn in connections
        ]

        return {
            "connections": connections_list,
            "count": len(connections_list)
        }

    except Exception as e:
        logger.error(f"Error getting router connections: {e}", exc_info=True)
        return {
            "connections": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/router/matrix")
async def get_routing_matrix() -> Dict[str, Any]:
    """
    Get routing matrix showing all possible connections.

    Returns:
        Dict[talker_id, Dict[listener_id, ConnectionState or None]]
    """
    try:
        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router:
            return {
                "matrix": {},
                "error": "Router not initialized"
            }

        matrix = router.get_routing_matrix()

        # Convert enum values to strings
        matrix_serializable = {
            talker_id: {
                listener_id: state.value if state else None
                for listener_id, state in listeners.items()
            }
            for talker_id, listeners in matrix.items()
        }

        return {
            "matrix": matrix_serializable,
            "talker_count": len(matrix),
            "listener_count": len(next(iter(matrix.values()), {}))
        }

    except Exception as e:
        logger.error(f"Error getting routing matrix: {e}", exc_info=True)
        return {
            "matrix": {},
            "error": f"Internal error: {str(e)}"
        }


@router.post("/router/connect")
async def connect_streams(connection_request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Connect talker to listener.

    Body:
        {
            "talker_id": "001122fffe334455:0",
            "listener_id": "667788fffe99aabb:1"
        }

    Returns:
        Connection result
    """
    talker_id: Optional[str] = None
    listener_id: Optional[str] = None
    admission: Any = None
    route_reservation_id: Optional[str] = None
    connection_succeeded = False

    try:
        from app.services.avb.avb_router import get_avb_router
        from app.services.avb.srp_admission import SrpAdmissionRequest, get_srp_admission_service

        router = get_avb_router()

        if not router:
            raise HTTPException(status_code=503, detail="Router not initialized")

        talker_id = connection_request.get("talker_id")
        listener_id = connection_request.get("listener_id")

        if not talker_id or not listener_id:
            raise HTTPException(status_code=400, detail="Missing talker_id or listener_id")

        talker = router.endpoints.get(talker_id) if hasattr(router, "endpoints") else None
        listener = router.endpoints.get(listener_id) if hasattr(router, "endpoints") else None
        if talker is None or listener is None:
            missing: List[str] = []
            if talker is None:
                missing.append(f"talker_id={talker_id}")
            if listener is None:
                missing.append(f"listener_id={listener_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Endpoint not found: {', '.join(missing)}",
            )

        if _srp_enabled():
            admission = await get_srp_admission_service().admit(
                SrpAdmissionRequest(
                    endpoint="router.connect",
                    stream_id=f"{talker_id}->{listener_id}",
                    talker_id=talker_id,
                    listener_id=listener_id,
                    talker_mac=getattr(talker, "mac_address", None),
                    listener_mac=getattr(listener, "mac_address", None),
                    request_metadata={
                        "talker_device_type": getattr(talker, "device_type", None),
                        "listener_device_type": getattr(listener, "device_type", None),
                    },
                )
            )
            if admission.decision == "denied":
                _raise_srp_denied(admission)
            if admission.decision == "allowed" and not admission.reservation_id:
                _raise_srp_denied(
                    admission,
                    code="SRP_ADMISSION_INVALID",
                    reason_code="SRP_INVALID_ADMISSION",
                    reason="SRP admission acknowledged without reservation_id",
                )

        if admission is not None:
            if admission.decision == "allowed":
                route_reservation_id = admission.reservation_id
            else:
                # Preserve bypass decision from route-level admission and avoid duplicate
                # internal SRP admission attempts.
                route_reservation_id = ""

        connect_fn = getattr(router, "connect")
        connect_result: Any

        supports_connect_details = False
        try:
            import inspect

            supports_connect_details = "return_details" in inspect.signature(connect_fn).parameters
        except (TypeError, ValueError):
            supports_connect_details = False

        if supports_connect_details:
            connect_result = await connect_fn(
                talker_id,
                listener_id,
                reservation_id=route_reservation_id,
                admission_id=admission.admission_id if admission and admission.decision == "allowed" else None,
                return_details=True,
            )
        else:
            connect_result = await connect_fn(
                talker_id,
                listener_id,
                reservation_id=route_reservation_id,
                admission_id=admission.admission_id if admission and admission.decision == "allowed" else None,
            )

        if isinstance(connect_result, dict):
            success = bool(connect_result.get("success", False))
            connect_payload = connect_result
        else:
            success = bool(connect_result)
            connect_payload = {}

        if not success:
            if connect_payload:
                raise HTTPException(
                    status_code=500,
                    detail=_build_connection_failure_detail(
                        code="ROUTER_CONNECT_FAILED",
                        message=str(connect_payload.get("reason") or "Connection failed"),
                        payload=connect_payload,
                    ),
                )
            raise HTTPException(status_code=500, detail="Connection failed")

        connection_succeeded = True

        response = {
            "success": True,
            "connection_id": f"{talker_id}→{listener_id}",
            "message": "Stream connected successfully",
        }
        if admission:
            response["srp_admission"] = admission.to_dict()

        return response

    except HTTPException:
        raise
    except Exception as e:
        if (
            admission is not None
            and getattr(admission, "decision", None) == "allowed"
            and route_reservation_id
            and talker_id
            and listener_id
            and not connection_succeeded
        ):
            try:
                from app.services.avb.srp_admission import get_srp_admission_service

                await get_srp_admission_service().release(
                    reservation_id=route_reservation_id,
                    endpoint="router.connect.exception",
                    stream_id=f"{talker_id}->{listener_id}",
                    talker_id=talker_id,
                    listener_id=listener_id,
                )
            except Exception as release_exc:
                logger.warning(
                    "SRP rollback release failed after router.connect exception %s->%s: %s",
                    talker_id,
                    listener_id,
                    release_exc,
                )
        logger.error(f"Error connecting streams: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/router/disconnect")
async def disconnect_streams(disconnection_request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Disconnect talker from listener.

    Body:
        {
            "talker_id": "001122fffe334455:0",
            "listener_id": "667788fffe99aabb:1"
        }

    Returns:
        Disconnection result
    """
    try:
        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router:
            raise HTTPException(status_code=503, detail="Router not initialized")

        talker_id = disconnection_request.get("talker_id")
        listener_id = disconnection_request.get("listener_id")

        if not talker_id or not listener_id:
            raise HTTPException(status_code=400, detail="Missing talker_id or listener_id")

        disconnect_fn = getattr(router, "disconnect")
        disconnect_result: Any

        supports_disconnect_details = False
        try:
            import inspect

            supports_disconnect_details = "return_details" in inspect.signature(disconnect_fn).parameters
        except (TypeError, ValueError):
            supports_disconnect_details = False

        if supports_disconnect_details:
            disconnect_result = await disconnect_fn(talker_id, listener_id, return_details=True)
        else:
            disconnect_result = await disconnect_fn(talker_id, listener_id)

        if isinstance(disconnect_result, dict):
            success = bool(disconnect_result.get("success", False))
            disconnect_payload = disconnect_result
        else:
            success = bool(disconnect_result)
            disconnect_payload = {}

        if not success:
            raise HTTPException(status_code=404, detail="Connection not found or disconnect failed")

        response: Dict[str, Any] = {
            "success": True,
            "message": "Stream disconnected successfully"
        }
        if disconnect_payload.get("srp_release") is not None:
            response["srp_release"] = disconnect_payload["srp_release"]
        if disconnect_payload.get("srp_release_warning") is not None:
            response["srp_release_warning"] = disconnect_payload["srp_release_warning"]

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting streams: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/router/stats")
async def get_router_stats() -> Dict[str, Any]:
    """Get routing matrix statistics"""
    try:
        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router:
            return {
                "error": "Router not initialized"
            }

        stats = router.get_stats()

        return stats

    except Exception as e:
        logger.error(f"Error getting router stats: {e}", exc_info=True)
        return {
            "error": f"Internal error: {str(e)}"
        }


# ============================================================================
# AVDECC Entity Model Endpoints (Phase 10)
# ============================================================================

@router.get("/avdecc/entities/{entity_id}/model")
async def get_entity_model(entity_id: str) -> Dict[str, Any]:
    """
    Get complete AVDECC entity model (descriptor tree).

    Returns enumerated entity model with all descriptors:
    - Entity descriptor (name, capabilities, etc.)
    - Configuration descriptors
    - Stream Input/Output descriptors
    - AVB Interface descriptors
    - Clock Source descriptors
    - Audio Unit descriptors

    Args:
        entity_id: Entity ID in hex format (e.g., "001b21fffe0102ab")

    Returns:
        Dict with:
        - entity_id: str (entity ID in hex)
        - model: dict (complete descriptor tree) if enumerated
        - complete: bool (true if enumeration finished successfully)
        - missing: list of missing descriptor types (if incomplete)
        - cached: bool (true if served from cache)
        - error: str (error message if unavailable)

    Raises:
        HTTPException 503: If AVDECC not available
        HTTPException 404: If entity not found or not enumerated
    """
    try:
        # Check if AVDECC is enabled
        if not _is_avdecc_enabled():
            raise HTTPException(
                status_code=503,
                detail="AVDECC not enabled in configuration"
            )

        # Check if AVDECC is available
        if not is_avb_available():
            raise HTTPException(
                status_code=503,
                detail="AVDECC hardware not available"
            )

        # Parse entity ID from hex
        try:
            entity_id_int = int(entity_id, 16)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid entity ID format: {entity_id} (expected hex)"
            )

        # Resolve low-level C++ engine from JUCE service singleton.
        from app.services.juce_engine_service import get_audio_engine, JUCE_AVAILABLE, juce_engine

        engine_service = get_audio_engine()
        if not engine_service:
            raise HTTPException(
                status_code=503,
                detail="Audio engine not available"
            )

        engine = getattr(engine_service, "_engine", None)
        if engine is None:
            raise HTTPException(
                status_code=503,
                detail="Audio engine not initialized"
            )

        # Check if AVDECC is available (compile-time check)
        if JUCE_AVAILABLE and juce_engine and hasattr(juce_engine, "is_avdecc_available"):
            if not juce_engine.is_avdecc_available():
                raise HTTPException(
                    status_code=503,
                    detail="AVDECC not compiled (USE_AVDECC=OFF)"
                )

        if not hasattr(engine, "get_avdecc_entity_model") or not hasattr(engine, "get_avdecc_entities"):
            raise HTTPException(
                status_code=503,
                detail="AVDECC entity model API not available in engine build"
            )

        # Get entity model via engine method (Phase 10 integration complete)
        model_json = await asyncio.to_thread(
            engine.get_avdecc_entity_model,
            entity_id_int
        )

        if model_json is None:
            # Entity not found or not enumerated yet
            # Check if entity exists in discovered list
            entities = await asyncio.to_thread(engine.get_avdecc_entities)

            # Return detailed error
            raise HTTPException(
                status_code=404,
                detail=f"Entity {entity_id} not found or not enumerated. "
                       f"Found {len(entities)} total entities."
            )

        # Derive metadata from model payload and cache state.
        complete = bool(model_json.get("complete", True))
        missing = model_json.get("missing") or model_json.get("missing_descriptors") or []
        if not isinstance(missing, list):
            missing = []
        if not complete and not missing:
            missing = ["descriptor-tree-incomplete"]

        cached = False
        try:
            entities = await asyncio.to_thread(engine.get_avdecc_entities)
            entity_info = next(
                (
                    e for e in entities
                    if int(str(e.get("entity_id", "0")), 16) == entity_id_int
                ),
                None,
            )
            if entity_info:
                entity_model_id_hex = str(entity_info.get("entity_model_id", "0"))
                firmware_version = str(entity_info.get("firmware_version", ""))
                entity_model_id_int = int(entity_model_id_hex, 16)
                if firmware_version:
                    from app.services.avb.aem_cache import get_aem_cache

                    cache = get_aem_cache()
                    cached_model = await asyncio.to_thread(
                        cache.get,
                        entity_model_id_int,
                        firmware_version,
                    )
                    cached = cached_model is not None
        except Exception:
            cached = False

        # Return model with metadata
        return {
            "entity_id": entity_id,
            "model": model_json,
            "complete": complete,
            "missing": missing,
            "cached": cached,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting entity model: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/avdecc/cache/stats")
async def get_aem_cache_stats() -> Dict[str, Any]:
    """
    Get AEM (Entity Model) cache statistics.

    Returns cache performance metrics including hit rate, entry count, etc.

    Returns:
        Dict with cache statistics:
        - hit_count: int
        - miss_count: int
        - total_requests: int
        - hit_rate_percent: float
        - entry_count: int
        - max_entries: int
        - cache_full: bool
        - enumeration_time_avg_ms: float
        - last_cleanup: datetime
        - cleanup_age_days: int
    """
    try:
        from app.services.avb.aem_cache import get_aem_cache

        cache = get_aem_cache()
        stats = await asyncio.to_thread(cache.get_stats)

        return stats

    except Exception as e:
        logger.error(f"Error getting AEM cache stats: {e}", exc_info=True)
        return {
            "error": f"Internal error: {str(e)}"
        }


# ============================================================================
# AVDECC Stream Connection Management (Phase 11 - ACMP)
# ============================================================================

class StreamConnectionRequest(BaseModel):
    """Request to connect an AVTP stream between talker and listener."""
    talker_entity_id: str  # Hex string (e.g., "001b21fffe123456")
    talker_stream_index: int  # 0-based stream index
    listener_entity_id: str  # Hex string
    listener_stream_index: int  # 0-based stream index


def _get_engine():
    """Resolve the low-level C++ engine instance."""
    from app.services.juce_engine_service import get_audio_engine

    engine_service = get_audio_engine()
    if not engine_service:
        raise HTTPException(status_code=503, detail="Audio engine not available")

    engine = getattr(engine_service, "_engine", None)
    if engine is None:
        raise HTTPException(status_code=503, detail="Audio engine not initialized")

    return engine


def _check_acmp_available(engine):
    """Verify AVDECC and ACMP methods are available on the engine."""
    if not _is_avdecc_enabled():
        raise HTTPException(status_code=503, detail="AVDECC not enabled in configuration")

    for method in ("connect_stream", "disconnect_stream", "get_active_connections"):
        if not hasattr(engine, method):
            raise HTTPException(
                status_code=503,
                detail=f"ACMP not available in engine build (missing {method})"
            )


@router.post("/avdecc/connections")
async def connect_stream(req: StreamConnectionRequest) -> Dict[str, Any]:
    """
    Connect an AVTP stream from talker to listener via ACMP.

    Sends ACMP CONNECT_TX_COMMAND and waits for response (up to 2s).
    On success, adds the connection to the active connections list.

    Args:
        req: StreamConnectionRequest with talker/listener entity IDs and stream indices

    Returns:
        Connection details including stream destination MAC and VLAN ID
    """
    engine = _get_engine()
    _check_acmp_available(engine)
    from app.services.avb.srp_admission import SrpAdmissionRequest, get_srp_admission_service

    try:
        talker_id = int(req.talker_entity_id, 16)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid talker entity ID: {req.talker_entity_id}")

    try:
        listener_id = int(req.listener_entity_id, 16)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid listener entity ID: {req.listener_entity_id}")

    admission: Any = None
    connection_succeeded = False

    async def _release_acmp_reservation(endpoint: str) -> Optional[Dict[str, Any]]:
        if not (admission and admission.decision == "allowed" and admission.reservation_id):
            return None
        reservation_id = str(admission.reservation_id)
        try:
            release_result = await get_srp_admission_service().release(
                reservation_id=reservation_id,
                endpoint=endpoint,
                stream_id=(
                    f"{req.talker_entity_id}:{req.talker_stream_index}"
                    f"->{req.listener_entity_id}:{req.listener_stream_index}"
                ),
                talker_id=req.talker_entity_id,
                listener_id=req.listener_entity_id,
            )
            release_payload = _build_srp_release_payload(
                release_result,
                reservation_id=reservation_id,
            )
            if not bool(getattr(release_result, "success", False)):
                return {
                    "srp_release": release_payload,
                    "srp_release_warning": _build_srp_release_warning(
                        reason="ACMP connect failed and SRP rollback release failed",
                        reservation_id=reservation_id,
                        detail=(
                            f"{getattr(release_result, 'reason_code', None)}:"
                            f" {getattr(release_result, 'reason', None)}"
                        ),
                    ),
                }
            return {"srp_release": release_payload}
        except Exception as release_exc:
            logger.warning(
                "SRP release failed during ACMP connect rollback %s:%s->%s:%s: %s",
                req.talker_entity_id,
                req.talker_stream_index,
                req.listener_entity_id,
                req.listener_stream_index,
                release_exc,
            )
            return {
                "srp_release_warning": _build_srp_release_warning(
                    reason="ACMP connect failed and SRP rollback release failed",
                    reservation_id=reservation_id,
                    detail=release_exc,
                )
            }

    try:
        if _srp_enabled():
            admission = await get_srp_admission_service().admit(
                SrpAdmissionRequest(
                    endpoint="avdecc.connections",
                    stream_id=(
                        f"{req.talker_entity_id}:{req.talker_stream_index}"
                        f"->{req.listener_entity_id}:{req.listener_stream_index}"
                    ),
                    talker_id=req.talker_entity_id,
                    listener_id=req.listener_entity_id,
                    request_metadata={
                        "talker_stream_index": req.talker_stream_index,
                        "listener_stream_index": req.listener_stream_index,
                    },
                )
            )
            if admission.decision == "denied":
                _raise_srp_denied(admission)
            if admission.decision == "allowed" and not admission.reservation_id:
                _raise_srp_denied(
                    admission,
                    code="SRP_ADMISSION_INVALID",
                    reason_code="SRP_INVALID_ADMISSION",
                    reason="SRP admission acknowledged without reservation_id",
                )

        success = await asyncio.to_thread(
            engine.connect_stream,
            talker_id,
            req.talker_stream_index,
            listener_id,
            req.listener_stream_index
        )

        if not success:
            rollback_payload = await _release_acmp_reservation(endpoint="avdecc.connections.rollback")
            raise HTTPException(
                status_code=500,
                detail=_build_connection_failure_detail(
                    code="ACMP_CONNECTION_FAILED",
                    message="ACMP connection failed (timeout or rejected by remote entity)",
                    payload=rollback_payload,
                ),
            )

        connection_succeeded = True

        connection_id = (
            f"{req.talker_entity_id}:{req.talker_stream_index}"
            f":{req.listener_entity_id}:{req.listener_stream_index}"
        )

        response: Dict[str, Any] = {
            "status": "connected",
            "connection_id": connection_id,
            "talker_entity_id": req.talker_entity_id,
            "talker_stream_index": req.talker_stream_index,
            "listener_entity_id": req.listener_entity_id,
            "listener_stream_index": req.listener_stream_index,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        if admission and admission.decision == "allowed" and admission.reservation_id:
            _acmp_srp_reservations[connection_id] = {
                "reservation_id": admission.reservation_id,
                "admission_id": admission.admission_id,
            }
            response["srp_admission"] = admission.to_dict()

        return response
    except HTTPException:
        raise
    except Exception as e:
        rollback_payload: Optional[Dict[str, Any]] = None
        if not connection_succeeded:
            rollback_payload = await _release_acmp_reservation(endpoint="avdecc.connections.rollback")
        logger.error(f"ACMP connect_stream failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=_build_connection_failure_detail(
                code="ACMP_CONNECTION_FAILED",
                message=f"ACMP connection failed: {e}",
                payload=rollback_payload,
            ),
        )


@router.delete("/avdecc/connections/{connection_id}")
async def disconnect_stream(connection_id: str) -> Dict[str, Any]:
    """
    Disconnect an AVTP stream via ACMP DISCONNECT_TX.

    Connection ID format: "{talker_id}:{talker_idx}:{listener_id}:{listener_idx}"

    Args:
        connection_id: Composite connection identifier

    Returns:
        Disconnect confirmation
    """
    engine = _get_engine()
    _check_acmp_available(engine)
    from app.services.avb.srp_admission import get_srp_admission_service

    parts = connection_id.split(":")
    if len(parts) != 4:
        raise HTTPException(
            status_code=400,
            detail="Invalid connection_id format. Expected: talker_id:talker_idx:listener_id:listener_idx"
        )

    try:
        talker_id = int(parts[0], 16)
        talker_idx = int(parts[1])
        listener_id = int(parts[2], 16)
        listener_idx = int(parts[3])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid hex/integer in connection_id")

    try:
        success = await asyncio.to_thread(
            engine.disconnect_stream,
            talker_id,
            talker_idx,
            listener_id,
            listener_idx
        )
    except Exception as e:
        logger.error(f"ACMP disconnect_stream failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"ACMP disconnect failed: {e}")

    if not success:
        raise HTTPException(status_code=404, detail="Connection not found or disconnect failed")

    response: Dict[str, Any] = {
        "status": "disconnected",
        "connection_id": connection_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    binding = _acmp_srp_reservations.pop(connection_id, None)
    if binding and binding.get("reservation_id"):
        reservation_id = str(binding["reservation_id"])
        try:
            release_result = await get_srp_admission_service().release(
                reservation_id=reservation_id,
                endpoint="avdecc.disconnect",
                stream_id=connection_id,
                talker_id=parts[0],
                listener_id=parts[2],
            )
            response["srp_release"] = _build_srp_release_payload(
                release_result,
                reservation_id=reservation_id,
            )
        except Exception as release_exc:
            logger.warning(
                "SRP release failed during ACMP disconnect %s: %s",
                connection_id,
                release_exc,
            )
            response["srp_release_warning"] = _build_srp_release_warning(
                reason="ACMP disconnect succeeded but SRP reservation release failed",
                reservation_id=reservation_id,
                detail=release_exc,
            )

    return response


@router.get("/avdecc/connections")
async def get_active_connections() -> List[Dict[str, Any]]:
    """
    List all active ACMP stream connections.

    Returns:
        List of active connections with talker/listener info and stream details
    """
    engine = _get_engine()
    _check_acmp_available(engine)

    try:
        connections = await asyncio.to_thread(engine.get_active_connections)
    except Exception as e:
        logger.error(f"get_active_connections failed: {e}", exc_info=True)
        return []

    return connections
