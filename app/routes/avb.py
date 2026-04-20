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

router = APIRouter(prefix="/api/avb", tags=["AVB/TSN"])
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
_REPO_ROOT = Path(__file__).resolve().parents[2]


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
        readiness = get_avb_readiness()

        # Check if AVB intent/config is present before probing PTP monitor.
        if not readiness.get("enabled", False):
            return {
                "available": False,
                "error": readiness.get("reason") or "AVB not enabled in configuration",
                "readiness": readiness,
            }

        if not readiness.get("configured", False):
            return {
                "available": False,
                "error": readiness.get("reason") or "AVB not configured",
                "readiness": readiness,
            }

        # Get PTP status from monitor
        ptp_monitor = get_ptp_monitor()
        status = await ptp_monitor.get_status()
        payload = status.to_dict()
        payload.setdefault("available", False)
        payload["readiness"] = readiness
        return payload

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
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()
        get_readiness = getattr(avb_service, "get_readiness", None)
        if callable(get_readiness):
            readiness = get_readiness()
        else:
            availability = False
            is_available = getattr(avb_service, "is_available", None)
            if callable(is_available):
                try:
                    availability = bool(is_available())
                except Exception:
                    availability = False
            else:
                availability = bool(is_available)
            readiness = {
                "available": availability,
                "enabled": availability,
                "configured": availability,
                "operational": availability,
                "degraded": False,
                "state": "operational" if availability else "unavailable",
                "reason": None,
            }
        enabled = bool(readiness.get("enabled", False))
        interface = str(readiness.get("interface", "") or "")
        available = bool(readiness.get("available", False))

        # Get PTP status
        ptp_status = await get_ptp_status()

        return {
            "enabled": enabled,
            "configured": bool(readiness.get("configured", False)),
            "operational": bool(readiness.get("operational", False)),
            "degraded": bool(readiness.get("degraded", False)),
            "available": available,
            "interface": interface,
            "interface_source": readiness.get("interface_source", "unknown"),
            "state": readiness.get("state", "unknown"),
            "ptp": ptp_status,
            "reason": readiness.get("reason"),
            "readiness": readiness,
            "compatibility": _build_config_compatibility_matrix(),
            "config": {
                "ptp_domain": config_get("avb.ptp_domain", 0),
                "ptp_priority1": config_get("avb.ptp_priority1", 128),
                "auto_connect": config_get("avb.auto_connect", True),
                "max_streams": config_get("avb.max_streams", 8),
                "clock_sync_profile": str(get_clock_sync_profile()),
                "clock_master": config_get("clock_sync.clock_master", config_get("audio.clock_master", "internal")),
                "engine_rate_hz": config_get("clock_sync.engine_rate_hz", config_get("audio.sample_rate", 48000)),
                "avb_stream_rate_hz": config_get("clock_sync.avb_stream_rate_hz", config_get("audio.sample_rate", 48000)),
                "spdif_rate_hz": config_get("clock_sync.spdif_rate_hz", config_get("spdif.sample_rate_hz", 48000)),
                "bits_per_sample": config_get("clock_sync.bits_per_sample", config_get("audio.bits_per_sample", 24)),
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


@router.post("/setup")
async def apply_avb_setup(request: AVBSetupRequest) -> Dict[str, Any]:
    """Run the non-interactive AVB/TSN setup flow through the backend."""
    args: list[str] = []
    interface = str(request.interface or "").strip()
    if request.auto_yes:
        args.append("--yes")
    if interface:
        args.extend(["--interface", interface])
    if request.dry_run:
        args.append("--dry-run")

    result = await _run_avb_setup_script("setup_avb.sh", *args)
    status = await get_avb_status()
    result["status"] = status
    return result


@router.post("/ptp/setup")
async def apply_avb_ptp_setup(request: AVBPTPSetupRequest) -> Dict[str, Any]:
    """Run the non-interactive AVB/PTP setup flow through the backend."""
    args: list[str] = []
    interface = str(request.interface or "").strip()
    if request.auto_yes:
        args.append("--yes")
    if interface:
        args.extend(["--interface", interface])
    args.extend(["--domain", str(int(request.domain)), "--priority", str(int(request.priority))])
    if request.dry_run:
        args.append("--dry-run")

    result = await _run_avb_setup_script("setup_avb_ptp.sh", *args)
    result["ptp"] = await get_ptp_status()
    result["tsn"] = await get_tsn_status()
    return result


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
        ownership = _parse_stream_ownership(config)
        connection_role = _parse_connection_role(config.get("connection_role"))
        loop_id = _coerce_optional_text(config.get("loop_id"))

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
            owner_node_id=ownership["owner_node_id"],
            peer_node_id=ownership["peer_node_id"],
            owner_endpoint_id=ownership["owner_endpoint_id"],
            peer_endpoint_id=ownership["peer_endpoint_id"],
            talker_node_id=ownership["talker_node_id"],
            listener_node_id=ownership["listener_node_id"],
            talker_endpoint_id=ownership["talker_endpoint_id"],
            listener_endpoint_id=ownership["listener_endpoint_id"],
            connection_role=connection_role,
            loop_id=loop_id,
        )

        result = await avb_service.create_stream(stream_config)

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        await _broadcast_avb_runtime_updates()
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

        await _broadcast_avb_runtime_updates()
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

        await _broadcast_avb_runtime_updates()
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

        await _broadcast_avb_runtime_updates()
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

        # Normalize response shape for API clients (snake_case keys)
        return {
            "frames_sent": stats.get("frames_sent", 0),
            "frames_received": stats.get("frames_received", 0),
            "send_errors": stats.get("send_errors", 0),
            "receive_errors": stats.get("receive_errors", 0),
            "underruns": stats.get("underruns", 0),
            "overruns": stats.get("overruns", 0),
            "timestamp_errors": stats.get("timestamp_errors", 0),
            "sequence_errors": stats.get("sequence_errors", 0),
            "sequence_gap_events": stats.get("sequence_gap_events", 0),
            "timestamp_skew_events": stats.get("timestamp_skew_events", 0),
            "decode_errors": stats.get("decode_errors", 0),
            "max_timestamp_skew_ns": stats.get("max_timestamp_skew_ns", 0),
            "bytes_transferred": stats.get("bytes_transferred", 0),
            "max_latency_ns": stats.get("max_latency_ns", 0),
            "min_latency_ns": stats.get("min_latency_ns", 0),
        }

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
        readiness_getter = getattr(avb_service, "get_readiness", None)
        if callable(readiness_getter):
            readiness = readiness_getter()
        else:
            available = False
            is_available = getattr(avb_service, "is_available", None)
            if callable(is_available):
                try:
                    available = bool(is_available())
                except Exception:
                    available = False
            readiness = {
                "enabled": available,
                "configured": available,
                "operational": available,
                "degraded": False,
                "available": available,
                "state": "operational" if available else "unavailable",
                "interface": None,
                "interface_source": "service_fallback",
                "reason": None if available else "AVB readiness unavailable",
                "checks": {},
            }
        device_names = list(getattr(avb_service, "get_device_names", lambda: [])() or [])
        source_node_id = _local_source_node_id()
        discovered_devices = []
        discovered_getter = getattr(avb_service, "get_discovered_devices", None)
        for raw_device in (discovered_getter() if callable(discovered_getter) else []):
            if isinstance(raw_device, dict):
                device = dict(raw_device)
            else:
                try:
                    device = dict(raw_device)
                except Exception:
                    continue
            device.setdefault("source_node_id", source_node_id)
            device.setdefault("node_id", device.get("source_node_id") or source_node_id)
            discovered_devices.append(device)

        return {
            "available": bool(readiness.get("available", False)),
            "readiness": readiness,
            "count": len(device_names),
            "device_names": device_names,
            "discovered_count": len(discovered_devices),
            "discovered_devices": discovered_devices,
            "source_node_id": source_node_id,
        }
    except Exception as e:
        logger.error(f"Error getting AVB device inventory: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
        return {
            "available": False,
            "count": 0,
            "device_names": [],
            "discovered_count": 0,
            "discovered_devices": [],
            "error": f"Internal error: {str(e)}",
        }


@router.get("/capabilities/channels")
async def get_avb_channel_capabilities() -> Dict[str, Any]:
    """Get canonical local + AVB channel capability inventory."""
    try:
        from app.services.avb.avb_service import get_avb_service
        from app.services.juce_engine_service import get_audio_engine

        audio_service = get_audio_engine()
        system_info: Dict[str, Any] = {}
        if audio_service.is_available:
            try:
                system_info = dict(audio_service.get_system_info() or {})
            except Exception as info_exc:
                logger.debug("AVB capabilities system_info lookup failed: %s", info_exc)

        avb_service = get_avb_service()
        capabilities = avb_service.get_channel_capabilities(system_info=system_info)
        return capabilities
    except Exception as e:
        logger.error(f"Error getting AVB channel capabilities: {e}", exc_info=True)
        return {
            "available": False,
            "readiness": get_avb_readiness(),
            "device": "unknown",
            "local_inputs": [],
            "local_outputs": [],
            "avb_talkers": [],
            "avb_listeners": [],
            "sample_rates": [],
            "summary": {
                "local_input_count": 0,
                "local_output_count": 0,
                "avb_talker_count": 0,
                "avb_listener_count": 0,
            },
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
        source_node_id = _local_source_node_id()
        if not _is_avdecc_enabled():
            return {
                "enabled": False,
                "entities": [],
                "error": "AVDECC not enabled in configuration",
                "source_node_id": source_node_id,
            }

        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router or not router.avdecc_entity:
            return {
                "enabled": True,
                "entities": [],
                "error": "AVDECC entity not initialized",
                "source_node_id": source_node_id,
            }

        discover_fn = _resolve_avdecc_callable(
            router.avdecc_entity,
            [
                "getDiscoveredEntities",
                "get_discovered_entities",
                "get_avdecc_entities",
                "getAvdeccEntities",
            ],
        )
        if discover_fn is None:
            return {
                "enabled": False,
                "entities": [],
                "error": "AVDECC discovery API unavailable",
                "source_node_id": source_node_id,
            }

        entities = discover_fn()
        if inspect.isawaitable(entities):
            entities = await entities
        entities_list = [_format_avdecc_entity_payload(entity, source_node_id=source_node_id) for entity in (entities or [])]

        return {
            "enabled": True,
            "entities": entities_list,
            "source_node_id": source_node_id,
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

        normalized_id = _normalize_avdecc_entity_id(entity_id)
        if normalized_id is None:
            raise HTTPException(status_code=400, detail="Invalid entity ID format")

        entity = None
        find_fn = _resolve_avdecc_callable(router.avdecc_entity, ["findEntity", "find_entity"])
        if find_fn is not None:
            entity_id_int = int(normalized_id, 16)
            entity = find_fn(entity_id_int)
            if inspect.isawaitable(entity):
                entity = await entity
            if hasattr(entity, "value"):
                try:
                    entity = entity.value()
                except Exception:
                    pass

        if not entity:
            discover_fn = _resolve_avdecc_callable(
                router.avdecc_entity,
                [
                    "getDiscoveredEntities",
                    "get_discovered_entities",
                    "get_avdecc_entities",
                    "getAvdeccEntities",
                ],
            )
            if discover_fn is None:
                raise HTTPException(status_code=503, detail="AVDECC discovery API unavailable")

            entities = discover_fn()
            if inspect.isawaitable(entities):
                entities = await entities
            for candidate in entities or []:
                candidate_id = _normalize_avdecc_entity_id(
                    _read_avdecc_field(candidate, "entity_id", "entityId", default=None)
                )
                if candidate_id == normalized_id:
                    entity = candidate
                    break

        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")

        return _format_avdecc_entity_payload(entity, source_node_id=_local_source_node_id())

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
                "enabled": True,
                "entities_discovered": 0,
                "connections_active": 0,
                "error": "AVDECC entity not initialized"
            }

        # Synthesize stats from available engine methods (no getStats binding exists)
        entities_discovered = 0
        connections_active = 0

        discover_fn = _resolve_avdecc_callable(
            router.avdecc_entity,
            ["get_avdecc_entities", "getDiscoveredEntities", "get_discovered_entities", "getAvdeccEntities"],
        )
        if discover_fn is not None:
            try:
                entities = await asyncio.to_thread(discover_fn)
                entities_discovered = len(entities) if entities else 0
            except Exception:
                pass

        connections_fn = _resolve_avdecc_callable(
            router.avdecc_entity,
            ["get_active_connections", "getActiveConnections"],
        )
        if connections_fn is not None:
            try:
                conns = await asyncio.to_thread(connections_fn)
                connections_active = len(conns) if conns else 0
            except Exception:
                pass

        return {
            "enabled": True,
            "adp": {"messages_sent": 0, "messages_received": 0},
            "acmp": {"messages_sent": 0, "messages_received": 0},
            "aecp": {"messages_sent": 0, "messages_received": 0},
            "entities_discovered": entities_discovered,
            "connections_active": connections_active
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

        source_node_id = _local_source_node_id()
        endpoints_list = [_serialize_router_endpoint(ep, source_node_id=source_node_id) for ep in endpoints]
        endpoints_list.sort(key=lambda item: str(item.get("endpoint_id", "")))

        return {
            "endpoints": endpoints_list,
            "count": len(endpoints_list),
            "source_node_id": source_node_id,
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

        source_node_id = _local_source_node_id()
        connections_list = []
        for conn in connections:
            connections_list.append(
                {
                    "connection_id": conn.connection_id(),
                    "talker": _serialize_router_endpoint(conn.talker, direction_fallback="talker", source_node_id=source_node_id),
                    "listener": _serialize_router_endpoint(conn.listener, direction_fallback="listener", source_node_id=source_node_id),
                    "state": conn.state.value,
                    "established_time": conn.established_time.isoformat() if conn.established_time else None,
                    "error_message": conn.error_message,
                    "srp_reservation_id": conn.srp_reservation_id,
                    "srp_admission_id": conn.srp_admission_id,
                    "connection_role": getattr(conn, "connection_role", "general_route"),
                    "loop_id": getattr(conn, "loop_id", None),
                }
            )

        return {
            "connections": connections_list,
            "count": len(connections_list),
            "source_node_id": source_node_id,
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


async def _broadcast_router_state_updates():
    """Publish AVB routing endpoint/connection snapshots to websocket subscribers."""
    from app.services.event_publisher import event_publisher, EventType

    try:
        endpoints_snapshot = await get_router_endpoints()
        connections_snapshot = await get_router_connections()

        await event_publisher.publish(
            topic="avb:router:endpoints",
            event_type=EventType.AVB_ENDPOINTS_UPDATED,
            data=endpoints_snapshot,
        )
        await event_publisher.publish(
            topic="avb:router:connections",
            event_type=EventType.AVB_CONNECTIONS_UPDATED,
            data=connections_snapshot,
        )
    except Exception as e:
        logger.warning(f"Failed to publish AVB router state websocket updates: {e}")


async def _broadcast_router_connection_state(
    route_id: str,
    state: str,
    error_message: Optional[str] = None,
    *,
    connection_role: Optional[str] = None,
    loop_id: Optional[str] = None,
):
    """Publish a single AVB route state change event."""
    from app.services.event_publisher import event_publisher, EventType

    try:
        await event_publisher.publish(
            topic="avb:router:connection_state",
            event_type=EventType.AVB_CONNECTION_STATE_CHANGED,
            data={
                "route_id": route_id,
                "state": state,
                "error_message": error_message,
                "connection_role": connection_role,
                "loop_id": loop_id,
            },
        )
    except Exception as e:
        logger.warning(f"Failed to publish AVB connection state websocket update: {e}")


async def _broadcast_avb_runtime_updates(
    *,
    streams: bool = True,
    ptp: bool = True,
    avdecc: bool = True,
) -> None:
    """Publish AVB runtime websocket snapshots when stream/PTP/entity state changes."""
    try:
        from app.services.avb_event_sync import get_avb_event_sync_service

        await get_avb_event_sync_service().publish_runtime_snapshots(
            streams=streams,
            ptp=ptp,
            avdecc=avdecc,
            force=False,
        )
    except Exception as e:
        logger.warning(f"Failed to publish AVB runtime websocket updates: {e}")


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
    connection_role: str = "general_route"
    loop_id: Optional[str] = None
    admission: Any = None
    route_reservation_id: Optional[str] = None
    route_id: Optional[str] = None
    connection_succeeded = False

    try:
        from app.services.avb.avb_router import get_avb_router
        from app.services.avb.srp_admission import SrpAdmissionRequest, get_srp_admission_service

        router = get_avb_router()

        if not router:
            raise HTTPException(status_code=503, detail="Router not initialized")

        talker_id = connection_request.get("talker_id")
        listener_id = connection_request.get("listener_id")
        connection_role = _parse_connection_role(connection_request.get("connection_role"))
        loop_id = _coerce_optional_text(connection_request.get("loop_id"))

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

        connect_kwargs = {
            "reservation_id": route_reservation_id,
            "admission_id": admission.admission_id if admission and admission.decision == "allowed" else None,
            "connection_role": connection_role,
            "loop_id": loop_id,
        }

        if supports_connect_details:
            connect_kwargs["return_details"] = True

        try:
            connect_result = await connect_fn(
                talker_id,
                listener_id,
                **connect_kwargs,
            )
        except TypeError:
            # Backward compatibility for mocked/legacy routers without loop metadata args.
            connect_kwargs.pop("connection_role", None)
            connect_kwargs.pop("loop_id", None)
            connect_result = await connect_fn(
                talker_id,
                listener_id,
                **connect_kwargs,
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

        route_id = f"{talker_id}→{listener_id}"
        response = {
            "success": True,
            "connection_id": route_id,
            "message": "Stream connected successfully",
            "connection_role": connection_role,
            "loop_id": loop_id,
        }
        if connect_payload.get("connection_role") is not None:
            response["connection_role"] = connect_payload.get("connection_role")
        if connect_payload.get("loop_id") is not None:
            response["loop_id"] = connect_payload.get("loop_id")
        if connect_payload.get("trace_id") is not None:
            response["trace_id"] = connect_payload["trace_id"]
        if connect_payload.get("stages") is not None:
            response["stages"] = connect_payload["stages"]
        if admission:
            response["srp_admission"] = admission.to_dict()

        if route_id:
            await _broadcast_router_connection_state(
                route_id=route_id,
                state="connected",
                connection_role=connection_role,
                loop_id=loop_id,
            )
        await _broadcast_router_state_updates()
        await _broadcast_avb_runtime_updates()

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
            "connection_id": f"{talker_id}→{listener_id}",
            "message": "Stream disconnected successfully"
        }
        if disconnect_payload.get("trace_id") is not None:
            response["trace_id"] = disconnect_payload["trace_id"]
        if disconnect_payload.get("stages") is not None:
            response["stages"] = disconnect_payload["stages"]
        if disconnect_payload.get("srp_release") is not None:
            response["srp_release"] = disconnect_payload["srp_release"]
        if disconnect_payload.get("srp_release_warning") is not None:
            response["srp_release_warning"] = disconnect_payload["srp_release_warning"]
        if disconnect_payload.get("connection_role") is not None:
            response["connection_role"] = disconnect_payload["connection_role"]
        if disconnect_payload.get("loop_id") is not None:
            response["loop_id"] = disconnect_payload["loop_id"]

        await _broadcast_router_connection_state(
            route_id=f"{talker_id}→{listener_id}",
            state="disconnected",
            connection_role=response.get("connection_role"),
            loop_id=response.get("loop_id"),
        )
        await _broadcast_router_state_updates()
        await _broadcast_avb_runtime_updates()

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

        entities = await asyncio.to_thread(engine.get_avdecc_entities)
        entity_info = next(
            (
                entity for entity in entities
                if _coerce_optional_hex_int(entity.get("entity_id")) == entity_id_int
            ),
            None,
        )

        cache = None
        entity_model_id_int: Optional[int] = None
        firmware_version = ""
        if entity_info:
            entity_model_id_int = _coerce_optional_hex_int(entity_info.get("entity_model_id"))
            firmware_version = str(entity_info.get("firmware_version", "")).strip()

        # Read-through cache (if cache key metadata is available).
        if entity_model_id_int is not None and firmware_version:
            try:
                from app.services.avb.aem_cache import get_aem_cache

                cache = get_aem_cache()
                max_age_seconds = _coerce_non_negative_int(
                    config_get("avb.avdecc.aem_cache_max_age_seconds", 86400),
                    86400,
                )
                cached_model = await asyncio.to_thread(
                    cache.get,
                    entity_model_id_int,
                    firmware_version,
                    max_age_seconds=max_age_seconds,
                    require_complete=True,
                    require_compatible=True,
                )
                if cached_model is not None:
                    cached_complete, cached_missing = _derive_model_completeness(cached_model)
                    if not _model_payload_is_compatible(
                        cached_model,
                        entity_model_id=entity_model_id_int,
                        firmware_version=firmware_version,
                    ):
                        await asyncio.to_thread(
                            cache.invalidate,
                            entity_model_id_int,
                            firmware_version,
                            "incompatible",
                        )
                    else:
                        return {
                            "entity_id": entity_id,
                            "model": cached_model,
                            "complete": cached_complete,
                            "missing": cached_missing,
                            "cached": True,
                        }
            except Exception as cache_exc:
                logger.warning(
                    "AEM cache lookup failed for entity %s: %s",
                    entity_id,
                    cache_exc,
                )

        # Cache miss or invalid cache; enumerate via engine.
        model_json = await asyncio.to_thread(engine.get_avdecc_entity_model, entity_id_int)

        if model_json is None:
            # Entity not found or not enumerated yet
            # Return detailed error
            raise HTTPException(
                status_code=404,
                detail=f"Entity {entity_id} not found or not enumerated. "
                       f"Found {len(entities)} total entities."
            )

        complete, missing = _derive_model_completeness(model_json)

        if cache is not None and entity_model_id_int is not None and firmware_version:
            try:
                if complete:
                    model_for_cache = dict(model_json)
                    model_for_cache.setdefault("entity_model_id", f"{entity_model_id_int:016x}")
                    model_for_cache.setdefault("firmware_version", firmware_version)
                    await asyncio.to_thread(
                        cache.set,
                        entity_model_id_int,
                        firmware_version,
                        model_for_cache,
                    )
                else:
                    await asyncio.to_thread(
                        cache.invalidate,
                        entity_model_id_int,
                        firmware_version,
                        "incomplete",
                    )
            except Exception as cache_exc:
                logger.warning(
                    "AEM cache writeback failed for entity %s: %s",
                    entity_id,
                    cache_exc,
                )

        # Return model with metadata
        return {
            "entity_id": entity_id,
            "model": model_json,
            "complete": complete,
            "missing": missing,
            "cached": False,
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


class StreamFormatPatchRequest(BaseModel):
    """Request to set an AVDECC stream format tuple."""
    direction: str  # talker/listener
    channels: int
    sample_rate: int
    bits_per_sample: int
    configuration_index: int = 0


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


def _stream_format_methods_available(engine: Any) -> bool:
    return hasattr(engine, "get_stream_format") and hasattr(engine, "set_stream_format")


async def _validate_and_negotiate_connection_stream_format(
    *,
    engine: Any,
    talker_entity_id: int,
    talker_stream_index: int,
    listener_entity_id: int,
    listener_stream_index: int,
) -> Dict[str, Any]:
    if not _stream_format_methods_available(engine):
        return {
            "success": True,
            "validated": False,
            "negotiated": False,
            "skipped": True,
            "reason": "engine_stream_format_api_unavailable",
        }

    async def _query(entity_id: int, stream_index: int, direction: str, stage: str) -> Dict[str, Any]:
        raw = await asyncio.to_thread(
            engine.get_stream_format,
            entity_id,
            stream_index,
            direction,
            0,
        )
        result = _normalize_engine_stream_format_result(raw, default_message=f"{stage}_failed")
        decoded = _decode_avdecc_stream_format(result.get("stream_format"))
        return {
            "result": result,
            "decoded": decoded,
            "stage": stage,
        }

    talker_query = await _query(talker_entity_id, talker_stream_index, "talker", "talker_get_stream_format")
    talker_result = talker_query["result"]
    talker_decoded = talker_query["decoded"]
    if not talker_result.get("success"):
        return {
            "success": False,
            "code": "ACMP_STREAM_FORMAT_QUERY_FAILED",
            "message": f"Talker stream format query failed: {talker_result.get('status')}",
            "stage": talker_query["stage"],
            "result": talker_result,
        }
    if talker_decoded is None:
        return {
            "success": False,
            "code": "ACMP_STREAM_FORMAT_INVALID",
            "message": "Talker stream format is missing or unsupported",
            "stage": talker_query["stage"],
            "result": talker_result,
        }

    listener_query = await _query(listener_entity_id, listener_stream_index, "listener", "listener_get_stream_format")
    listener_result = listener_query["result"]
    listener_decoded = listener_query["decoded"]
    if not listener_result.get("success"):
        return {
            "success": False,
            "code": "ACMP_STREAM_FORMAT_QUERY_FAILED",
            "message": f"Listener stream format query failed: {listener_result.get('status')}",
            "stage": listener_query["stage"],
            "result": listener_result,
        }
    if listener_decoded is None:
        return {
            "success": False,
            "code": "ACMP_STREAM_FORMAT_INVALID",
            "message": "Listener stream format is missing or unsupported",
            "stage": listener_query["stage"],
            "result": listener_result,
        }

    talker_tuple = (
        int(talker_decoded["channels"]),
        int(talker_decoded["sample_rate"]),
        int(talker_decoded["bits_per_sample"]),
    )
    listener_tuple = (
        int(listener_decoded["channels"]),
        int(listener_decoded["sample_rate"]),
        int(listener_decoded["bits_per_sample"]),
    )

    if talker_tuple == listener_tuple:
        return {
            "success": True,
            "validated": True,
            "negotiated": False,
            "talker": dict(talker_decoded),
            "listener": dict(listener_decoded),
            "stream_format": int(talker_result.get("stream_format", 0)),
        }

    set_raw = await asyncio.to_thread(
        engine.set_stream_format,
        listener_entity_id,
        listener_stream_index,
        "listener",
        int(talker_result.get("stream_format", 0)),
        0,
    )
    set_result = _normalize_engine_stream_format_result(
        set_raw,
        default_message="listener_set_stream_format_failed",
    )
    if not set_result.get("success"):
        return {
            "success": False,
            "code": "ACMP_STREAM_FORMAT_NEGOTIATION_FAILED",
            "message": f"Failed to set listener stream format: {set_result.get('status')}",
            "stage": "listener_set_stream_format",
            "result": set_result,
        }

    listener_query_after = await _query(
        listener_entity_id,
        listener_stream_index,
        "listener",
        "listener_verify_stream_format",
    )
    listener_after_result = listener_query_after["result"]
    listener_after_decoded = listener_query_after["decoded"]
    if not listener_after_result.get("success") or listener_after_decoded is None:
        return {
            "success": False,
            "code": "ACMP_STREAM_FORMAT_NEGOTIATION_FAILED",
            "message": "Failed to verify listener stream format after negotiation",
            "stage": listener_query_after["stage"],
            "result": listener_after_result,
        }

    listener_after_tuple = (
        int(listener_after_decoded["channels"]),
        int(listener_after_decoded["sample_rate"]),
        int(listener_after_decoded["bits_per_sample"]),
    )
    if listener_after_tuple != talker_tuple:
        return {
            "success": False,
            "code": "ACMP_STREAM_FORMAT_NEGOTIATION_FAILED",
            "message": "Listener stream format remains incompatible after negotiation",
            "stage": "listener_verify_stream_format",
            "result": listener_after_result,
        }

    return {
        "success": True,
        "validated": True,
        "negotiated": True,
        "talker": dict(talker_decoded),
        "listener": dict(listener_after_decoded),
        "stream_format": int(talker_result.get("stream_format", 0)),
    }


@router.patch("/avdecc/entities/{entity_id}/streams/{stream_index}/format")
async def patch_stream_format(
    entity_id: str,
    stream_index: int,
    req: StreamFormatPatchRequest,
) -> Dict[str, Any]:
    """
    Set AVDECC stream format tuple via AECP SET_STREAM_FORMAT.
    """
    engine = _get_engine()
    _check_acmp_available(engine)

    if not _stream_format_methods_available(engine):
        raise HTTPException(
            status_code=503,
            detail="Stream format API not available in engine build (missing get_stream_format/set_stream_format)",
        )

    normalized_entity_id = _normalize_avdecc_entity_id(entity_id)
    if normalized_entity_id is None:
        raise HTTPException(status_code=400, detail=f"Invalid entity ID format: {entity_id}")

    if stream_index < 0:
        raise HTTPException(status_code=400, detail="stream_index must be >= 0")
    if req.configuration_index < 0:
        raise HTTPException(status_code=400, detail="configuration_index must be >= 0")

    direction = _normalize_stream_direction(req.direction)
    stream_format = _encode_avdecc_stream_format(
        channels=int(req.channels),
        sample_rate=int(req.sample_rate),
        bits_per_sample=int(req.bits_per_sample),
    )

    entity_id_int = int(normalized_entity_id, 16)
    set_raw = await asyncio.to_thread(
        engine.set_stream_format,
        entity_id_int,
        int(stream_index),
        direction,
        int(stream_format),
        int(req.configuration_index),
    )
    set_result = _normalize_engine_stream_format_result(
        set_raw,
        default_message="set_stream_format_failed",
    )
    if not set_result.get("success"):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "STREAM_FORMAT_UPDATE_FAILED",
                "message": str(set_result.get("status") or "set_stream_format_failed"),
                "engine_result": set_result,
            },
        )

    get_raw = await asyncio.to_thread(
        engine.get_stream_format,
        entity_id_int,
        int(stream_index),
        direction,
        int(req.configuration_index),
    )
    get_result = _normalize_engine_stream_format_result(
        get_raw,
        default_message="get_stream_format_failed",
    )
    if not get_result.get("success"):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "STREAM_FORMAT_VERIFY_FAILED",
                "message": str(get_result.get("status") or "get_stream_format_failed"),
                "engine_result": get_result,
            },
        )

    applied = _decode_avdecc_stream_format(get_result.get("stream_format"))
    if applied is None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "STREAM_FORMAT_VERIFY_FAILED",
                "message": "Engine returned an undecodable stream format",
                "engine_result": get_result,
            },
        )

    requested_tuple = (int(req.channels), int(req.sample_rate), int(req.bits_per_sample))
    applied_tuple = (
        int(applied["channels"]),
        int(applied["sample_rate"]),
        int(applied["bits_per_sample"]),
    )
    if requested_tuple != applied_tuple:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "STREAM_FORMAT_MISMATCH",
                "message": "Requested stream format does not match applied format",
                "requested": {
                    "channels": requested_tuple[0],
                    "sample_rate": requested_tuple[1],
                    "bits_per_sample": requested_tuple[2],
                },
                "applied": dict(applied),
            },
        )

    return {
        "status": "updated",
        "entity_id": normalized_entity_id,
        "stream_index": int(stream_index),
        "direction": direction,
        "configuration_index": int(req.configuration_index),
        "requested": {
            "channels": requested_tuple[0],
            "sample_rate": requested_tuple[1],
            "bits_per_sample": requested_tuple[2],
            "stream_format": int(stream_format),
            "stream_format_hex": f"0x{int(stream_format):016x}",
        },
        "applied": {
            "channels": applied_tuple[0],
            "sample_rate": applied_tuple[1],
            "bits_per_sample": applied_tuple[2],
            "stream_format": int(applied["stream_format"]),
            "stream_format_hex": f"0x{int(applied['stream_format']):016x}",
        },
        "engine_status": {
            "set": set_result,
            "verify": get_result,
        },
    }


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
    format_validation: Dict[str, Any] = {
        "success": True,
        "validated": False,
        "negotiated": False,
        "skipped": True,
        "reason": "not_run",
    }

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

        format_validation = await _validate_and_negotiate_connection_stream_format(
            engine=engine,
            talker_entity_id=talker_id,
            talker_stream_index=req.talker_stream_index,
            listener_entity_id=listener_id,
            listener_stream_index=req.listener_stream_index,
        )
        if not format_validation.get("success"):
            rollback_payload = await _release_acmp_reservation(endpoint="avdecc.connections.rollback")
            detail = _build_connection_failure_detail(
                code=str(format_validation.get("code") or "ACMP_STREAM_FORMAT_NEGOTIATION_FAILED"),
                message=str(format_validation.get("message") or "Stream format validation failed"),
                payload=rollback_payload,
            )
            detail["stream_format"] = format_validation
            raise HTTPException(status_code=409, detail=detail)

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
            "stream_format_validation": format_validation,
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
