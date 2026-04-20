"""
AVB/TSN Network Audio Transport API Routes

Provides REST endpoints for:
- PTP synchronization status
- TSN qdisc configuration (Phase 2)
- AVB stream management (Phase 5)

All endpoints return available=false gracefully when AVB is disabled or hardware unavailable.
"""

import asyncio
import inspect
import json
import logging
import subprocess
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pathlib import Path
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse

from app.config import config_get
from app.services.avb import is_avb_available, get_avb_readiness
from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity
from app.services.clock_sync import get_clock_sync_profile
from app.services.avb.ptp_monitor import get_ptp_monitor
from app.services.avb.tsn_qdisc import get_tsn_qdisc_manager

logger = logging.getLogger(__name__)

_acmp_srp_reservations: Dict[str, Dict[str, Optional[str]]] = {}
_ALLOWED_FAILOVER_POLICIES = {"none", "prefer_primary", "round_robin", "manual"}
_ALLOWED_ROUTER_CONNECTION_ROLES = {"effects_loop_send", "effects_loop_return", "general_route"}
_AVDECC_SAMPLE_RATE_TO_CODE = {
    8000: 0x01,
    16000: 0x02,
    32000: 0x03,
    44100: 0x04,
    48000: 0x05,
    88200: 0x06,
    96000: 0x07,
    176400: 0x08,
    192000: 0x09,
}
_AVDECC_SAMPLE_RATE_FROM_CODE = {code: rate for rate, code in _AVDECC_SAMPLE_RATE_TO_CODE.items()}
_AVDECC_ALLOWED_BITS_PER_SAMPLE = {8, 16, 20, 24, 32}
_AVDECC_STREAM_FORMAT_PREFIX = 0x0200000000000000
_STREAM_OWNERSHIP_FIELDS = (
    "owner_node_id",
    "peer_node_id",
    "owner_endpoint_id",
    "peer_endpoint_id",
    "talker_node_id",
    "listener_node_id",
    "talker_endpoint_id",
    "listener_endpoint_id",
)
_REPO_ROOT = Path(__file__).resolve().parents[3]


class AVBSetupRequest(BaseModel):
    """Request payload for AVB/TSN platform setup."""

    interface: str = ""
    dry_run: bool = False
    auto_yes: bool = True


class AVBPTPSetupRequest(BaseModel):
    """Request payload for AVB/PTP setup."""

    interface: str = ""
    domain: int = 0
    priority: int = 128
    dry_run: bool = False
    auto_yes: bool = True


async def _run_avb_setup_script(script_name: str, *args: str, timeout: int = 900) -> Dict[str, Any]:
    script_path = _REPO_ROOT / "scripts" / script_name
    if not script_path.exists():
        raise HTTPException(status_code=404, detail=f"Missing AVB setup script: {script_path}")

    command = ["bash", str(script_path), *args]

    try:
        completed = await asyncio.to_thread(
            subprocess.run,
            command,
            cwd=str(_REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail=f"{script_name} timed out after {timeout}s") from exc
    except Exception as exc:
        logger.error("Failed to execute %s: %s", script_name, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to execute {script_name}: {exc}") from exc

    return {
        "ok": completed.returncode == 0,
        "command": command,
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
    }


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


def _local_source_node_id() -> str:
    """Return the canonical local cluster node identifier for AVB payload tagging."""
    try:
        node_id = str(get_enhanced_node_identity().get_node_id() or "").strip()
        if node_id:
            return node_id
    except Exception:
        pass
    return "local"


def _coerce_non_negative_int(raw: Any, default: int) -> int:
    """Convert values to non-negative integers, preserving default on invalid input."""
    try:
        value = int(raw)
    except Exception:
        return default
    return value if value >= 0 else default


def _normalize_endpoint_direction(raw: Any, fallback: Optional[str] = None) -> str:
    """Normalize endpoint direction to canonical talker/listener values."""
    if raw is None and fallback is not None:
        raw = fallback

    value = raw
    if hasattr(raw, "value"):
        value = getattr(raw, "value")

    normalized = str(value or "").strip().lower()
    return "talker" if normalized == "talker" else "listener"


def _normalize_device_type(raw: Any) -> str:
    """Normalize endpoint device type to canonical map2/avdecc/unknown values."""
    normalized = str(raw or "").strip().lower()
    if normalized in {"map2", "avdecc"}:
        return normalized
    return "unknown"


def _read_avdecc_field(entity: Any, *names: str, default: Any = None) -> Any:
    """Read a field from object or dict-like AVDECC payloads."""
    if entity is None:
        return default

    for name in names:
        try:
            if isinstance(entity, dict):
                if name in entity and entity[name] is not None:
                    return entity[name]
            elif hasattr(entity, name):
                value = getattr(entity, name)
                if value is not None:
                    return value
        except Exception:
            continue

    return default


def _resolve_avdecc_callable(target: Any, names: List[str]) -> Optional[Any]:
    if target is None:
        return None
    for name in names:
        candidate = getattr(target, name, None)
        if callable(candidate):
            return candidate
    return None


def _normalize_avdecc_entity_id(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    try:
        if isinstance(raw, int):
            if raw < 0:
                return None
            return format(raw, "016x")
        value = str(raw).strip().lower().replace("0x", "")
        if value and len(value) <= 16 and all(ch in "0123456789abcdef" for ch in value):
            return value.zfill(16)
    except Exception:
        return None
    return None


def _normalize_avdecc_mac(raw: Any) -> str:
    if raw is None:
        return ""
    if isinstance(raw, str):
        value = raw.strip().lower().replace("-", ":")
        parts = [part for part in value.split(":") if part]
        if len(parts) == 6:
            try:
                return ":".join(f"{int(part, 16):02x}" for part in parts)
            except Exception:
                return value
        return value
    if isinstance(raw, (list, tuple)) and len(raw) == 6:
        try:
            return ":".join(f"{int(part) & 0xFF:02x}" for part in raw)
        except Exception:
            return ""
    return ""


def _normalize_stream_direction(direction: Any) -> str:
    normalized = str(direction or "").strip().lower()
    if normalized in {"talker", "output", "stream_output"}:
        return "talker"
    if normalized in {"listener", "input", "stream_input"}:
        return "listener"
    raise HTTPException(
        status_code=400,
        detail="direction must be one of: talker, listener",
    )


def _decode_avdecc_stream_format(raw_stream_format: Any) -> Optional[Dict[str, int]]:
    try:
        stream_format = int(raw_stream_format)
    except Exception:
        return None

    if stream_format <= 0:
        return None

    sample_rate_code = stream_format & 0xFFFF
    sample_rate = _AVDECC_SAMPLE_RATE_FROM_CODE.get(sample_rate_code)
    channels = (stream_format >> 32) & 0xFF
    bits_per_sample = (stream_format >> 24) & 0xFF
    if sample_rate is None or channels <= 0 or bits_per_sample <= 0:
        return None

    return {
        "channels": channels,
        "sample_rate": sample_rate,
        "bits_per_sample": bits_per_sample,
        "stream_format": stream_format,
    }


def _coerce_optional_hex_int(raw_value: Any) -> Optional[int]:
    if raw_value is None:
        return None
    if isinstance(raw_value, int):
        return raw_value if raw_value >= 0 else None

    normalized = str(raw_value).strip().lower()
    if not normalized:
        return None
    normalized = normalized.removeprefix("0x")
    try:
        parsed = int(normalized, 16)
    except ValueError:
        return None
    return parsed if parsed >= 0 else None


def _model_payload_is_compatible(
    model_json: Dict[str, Any],
    *,
    entity_model_id: int,
    firmware_version: str,
) -> bool:
    payload_model_id = _coerce_optional_hex_int(model_json.get("entity_model_id"))
    if payload_model_id is not None and payload_model_id != int(entity_model_id):
        return False

    payload_firmware = model_json.get("firmware_version")
    if payload_firmware is not None and str(payload_firmware) != str(firmware_version):
        return False

    return True


def _derive_model_completeness(model_json: Dict[str, Any]) -> tuple[bool, List[str]]:
    complete = bool(model_json.get("complete", True))
    missing = model_json.get("missing") or model_json.get("missing_descriptors") or []
    if not isinstance(missing, list):
        missing = []
    if missing and complete:
        complete = False
    if not complete and not missing:
        missing = ["descriptor-tree-incomplete"]
    return complete, missing


def _encode_avdecc_stream_format(
    *,
    channels: int,
    sample_rate: int,
    bits_per_sample: int,
) -> int:
    if channels <= 0 or channels > 0xFF:
        raise HTTPException(status_code=400, detail="channels must be between 1 and 255")

    if bits_per_sample not in _AVDECC_ALLOWED_BITS_PER_SAMPLE:
        raise HTTPException(
            status_code=400,
            detail=(
                "bits_per_sample must be one of: "
                + ", ".join(str(value) for value in sorted(_AVDECC_ALLOWED_BITS_PER_SAMPLE))
            ),
        )

    sample_rate_code = _AVDECC_SAMPLE_RATE_TO_CODE.get(sample_rate)
    if sample_rate_code is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "sample_rate must be one of: "
                + ", ".join(str(value) for value in sorted(_AVDECC_SAMPLE_RATE_TO_CODE.keys()))
            ),
        )

    return (
        _AVDECC_STREAM_FORMAT_PREFIX
        | ((channels & 0xFF) << 32)
        | ((bits_per_sample & 0xFF) << 24)
        | (sample_rate_code & 0xFFFF)
    )


def _normalize_engine_stream_format_result(
    raw: Any,
    *,
    default_message: str,
) -> Dict[str, Any]:
    if isinstance(raw, dict):
        payload = dict(raw)
        payload.setdefault("success", bool(payload.get("success")))
        payload.setdefault("status_code", 0 if payload.get("success") else 11)
        payload.setdefault("status", str(payload.get("status") or default_message))
        if "stream_format" in payload:
            try:
                payload["stream_format"] = int(payload["stream_format"])
            except Exception:
                payload["stream_format"] = 0
        else:
            payload["stream_format"] = 0
        return payload

    if isinstance(raw, int):
        return {
            "success": True,
            "status_code": 0,
            "status": "success",
            "stream_format": int(raw),
        }

    return {
        "success": False,
        "status_code": 11,
        "status": default_message,
        "stream_format": 0,
    }


def _format_avdecc_entity_payload(entity: Any, *, source_node_id: Optional[str] = None) -> Dict[str, Any]:
    entity_id_raw = _read_avdecc_field(entity, "entity_id", "entityId", default=None)
    entity_id = _normalize_avdecc_entity_id(entity_id_raw) or "0000000000000000"
    entity_model_id = _normalize_avdecc_entity_id(
        _read_avdecc_field(entity, "entity_model_id", "entityModelId", default=None)
    ) or "0000000000000000"

    capabilities = _read_avdecc_field(entity, "capabilities", default={})
    if not isinstance(capabilities, dict):
        capabilities = {}

    talker_streams = _coerce_non_negative_int(
        _read_avdecc_field(
            entity,
            "talker_stream_sources",
            "talker_streams",
            "talkerStreams",
            default=capabilities.get("talker_streams", 0),
        ),
        0,
    )
    listener_streams = _coerce_non_negative_int(
        _read_avdecc_field(
            entity,
            "listener_stream_sinks",
            "listener_streams",
            "listenerStreams",
            default=capabilities.get("listener_streams", 0),
        ),
        0,
    )

    is_audio_talker = capabilities.get("is_audio_talker")
    if is_audio_talker is None:
        method = _read_avdecc_field(entity, "isAudioTalker", default=None)
        if callable(method):
            try:
                is_audio_talker = bool(method())
            except Exception:
                is_audio_talker = talker_streams > 0
        else:
            is_audio_talker = talker_streams > 0

    is_audio_listener = capabilities.get("is_audio_listener")
    if is_audio_listener is None:
        method = _read_avdecc_field(entity, "isAudioListener", default=None)
        if callable(method):
            try:
                is_audio_listener = bool(method())
            except Exception:
                is_audio_listener = listener_streams > 0
        else:
            is_audio_listener = listener_streams > 0

    gptp_supported = capabilities.get("gptp_supported")
    if gptp_supported is None:
        try:
            gptp_supported = bool(_entity_supports_gptp(entity))
        except Exception:
            gptp_supported = False

    last_seen_raw = _read_avdecc_field(entity, "last_seen", "lastSeen", default=None)
    if hasattr(last_seen_raw, "isoformat"):
        last_seen = last_seen_raw.isoformat()
    elif isinstance(last_seen_raw, str) and last_seen_raw.strip():
        last_seen = last_seen_raw
    else:
        last_seen = datetime.now(timezone.utc).isoformat()

    return {
        "entity_id": entity_id,
        "entity_model_id": entity_model_id,
        "entity_name": str(_read_avdecc_field(entity, "entity_name", "device_name", "name", default="") or ""),
        "firmware_version": str(_read_avdecc_field(entity, "firmware_version", "firmwareVersion", default="") or ""),
        "mac_address": _normalize_avdecc_mac(_read_avdecc_field(entity, "mac_address", "macAddress", default=None)),
        "capabilities": {
            "talker_streams": talker_streams,
            "listener_streams": listener_streams,
            "is_audio_talker": bool(is_audio_talker),
            "is_audio_listener": bool(is_audio_listener),
            "gptp_supported": bool(gptp_supported),
        },
        "ptp": {
            "grandmaster_id": _normalize_avdecc_entity_id(
                _read_avdecc_field(entity, "gptp_grandmaster_id", "gptpGrandmasterId", default=None)
            ) or "0000000000000000",
            "domain": _coerce_non_negative_int(
                _read_avdecc_field(entity, "gptp_domain_number", "gptpDomainNumber", default=0),
                0,
            ),
        },
        "available": bool(_read_avdecc_field(entity, "available", default=True)),
        "last_seen": last_seen,
        "source_node_id": source_node_id or _local_source_node_id(),
    }


def _serialize_router_endpoint(
    endpoint: Any,
    *,
    direction_fallback: Optional[str] = None,
    source_node_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Serialize route endpoint payload into canonical schema with safe fallback values."""
    endpoint_id_value = getattr(endpoint, "endpoint_id", None)
    endpoint_id = str(endpoint_id_value() if callable(endpoint_id_value) else endpoint_id_value or "").strip()
    if not endpoint_id:
        endpoint_id = "unknown:0"

    entity_id, _, unique_id_raw = endpoint_id.partition(":")
    entity_id = str(getattr(endpoint, "entity_id", None) or entity_id or "0000000000000000")
    parsed_unique_id = _coerce_non_negative_int(unique_id_raw, 0)
    unique_id = _coerce_non_negative_int(getattr(endpoint, "unique_id", parsed_unique_id), parsed_unique_id)

    node_address_raw = getattr(endpoint, "node_address", None)
    node_address = str(node_address_raw).strip() if node_address_raw not in (None, "") else None

    host_raw = getattr(endpoint, "host", None)
    host = str(host_raw).strip() if host_raw not in (None, "") else _extract_host_from_node_address(node_address)
    host = host or ""

    node_id = str(getattr(endpoint, "node_id", None) or "").strip() or host or source_node_id or "local"

    last_seen = getattr(endpoint, "last_seen", None)
    if hasattr(last_seen, "isoformat"):
        last_seen_value = last_seen.isoformat()
    elif isinstance(last_seen, str) and last_seen.strip():
        last_seen_value = last_seen
    else:
        last_seen_value = datetime.now(timezone.utc).isoformat()

    return {
        "endpoint_id": endpoint_id,
        "entity_id": entity_id,
        "unique_id": unique_id,
        "node_id": node_id,
        "direction": _normalize_endpoint_direction(getattr(endpoint, "direction", None), direction_fallback),
        "device_type": _normalize_device_type(getattr(endpoint, "device_type", None)),
        "device_name": str(getattr(endpoint, "device_name", None) or endpoint_id),
        "channels": _coerce_positive_int(getattr(endpoint, "channels", 2), 2),
        "sample_rate": _coerce_positive_int(getattr(endpoint, "sample_rate", 48000), 48000),
        "format": str(getattr(endpoint, "format", None) or "24-bit PCM"),
        "mac_address": getattr(endpoint, "mac_address", None),
        "node_address": node_address,
        "host": host,
        "available": bool(getattr(endpoint, "available", True)),
        "last_seen": last_seen_value,
    }


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


def _coerce_optional_text(value: Any) -> Optional[str]:
    """Normalize optional text payload fields."""
    if value is None:
        return None
    parsed = str(value).strip()
    return parsed or None


def _parse_stream_ownership(config_payload: Dict[str, Any]) -> Dict[str, Optional[str]]:
    """
    Parse optional stream ownership payload from flat keys and/or ownership object.

    Supports:
    - ownership.owner_node_id, etc.
    - top-level owner_node_id, etc. (compatibility for internal callers)
    """
    ownership_raw = config_payload.get("ownership")
    if ownership_raw is not None and not isinstance(ownership_raw, dict):
        raise HTTPException(status_code=400, detail="ownership must be an object when provided")

    ownership_payload = ownership_raw if isinstance(ownership_raw, dict) else {}
    normalized: Dict[str, Optional[str]] = {}
    for field_name in _STREAM_OWNERSHIP_FIELDS:
        raw_value = ownership_payload.get(field_name, config_payload.get(field_name))
        normalized[field_name] = _coerce_optional_text(raw_value)
    return normalized


def _parse_connection_role(raw: Any) -> str:
    """Parse optional connection role metadata."""
    value = str(raw or "").strip().lower()
    if not value:
        return "general_route"
    if value not in _ALLOWED_ROUTER_CONNECTION_ROLES:
        allowed = ", ".join(sorted(_ALLOWED_ROUTER_CONNECTION_ROLES))
        raise HTTPException(status_code=400, detail=f"connection_role must be one of: {allowed}")
    return value


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

__all__ = [name for name in globals() if not name.startswith("__")]
