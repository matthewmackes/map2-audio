"""
AVB/TSN Network Audio Transport API Routes

Provides REST endpoints for:
- PTP synchronization status
- TSN qdisc configuration (Phase 2)
- AVB stream management (Phase 5)

All endpoints return available=false gracefully when AVB is disabled or hardware unavailable.
"""

import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

from app.config import config_get
from app.services.avb import is_avb_available
from app.services.avb.ptp_monitor import get_ptp_monitor
from app.services.avb.tsn_qdisc import get_tsn_qdisc_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/avb", tags=["AVB/TSN"])
_acmp_srp_reservations: Dict[str, Dict[str, Optional[str]]] = {}


def _srp_enabled() -> bool:
    return bool(config_get("avb.srp.enabled", True))


def _srp_required() -> bool:
    return _srp_enabled() and bool(config_get("avb.srp.required", True))


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
        )
        return {
            "count": len(rows),
            "filters": {
                "decision": normalized_decision,
                "since": since_dt.isoformat() if since_dt else None,
                "limit": max(1, min(int(limit), 500)),
                "endpoint": endpoint,
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

        return {
            "available": True,
            "streams": streams
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

        return stream

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AVB stream: {e}", exc_info=True)
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

        # Parse config
        stream_config = AvbStreamConfig(
            stream_id=stream_id,
            direction=direction,
            channels=config.get("channels", 2),
            sample_rate=config.get("sample_rate", 48000),
            buffer_size=config.get("buffer_size", 256),
            interface=config.get("interface", ""),
            dest_mac=config.get("dest_mac"),
            presentation_offset_us=config.get("presentation_offset_us", 2000),
            priority=config.get("priority", 3),
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
            try:
                from app.services.avb.srp_admission import get_srp_admission_service

                release_result = await get_srp_admission_service().release(
                    reservation_id=str(binding["reservation_id"]),
                    endpoint="streams.delete",
                    stream_id=stream_id,
                )
                avb_service.clear_srp_reservation(stream_id)
                result["srp_release"] = release_result.to_dict()
            except Exception as exc:
                logger.warning("SRP release failed during stream delete %s: %s", stream_id, exc)

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
                release_result = await get_srp_admission_service().release(
                    reservation_id=str(srp_binding["reservation_id"]),
                    endpoint="streams.start.rollback",
                    stream_id=stream_id,
                )
                avb_service.clear_srp_reservation(stream_id)
                result["srp_release"] = release_result.to_dict()
            if result["code"] == "NOT_FOUND":
                raise HTTPException(status_code=404, detail=result["error"])
            raise HTTPException(status_code=400, detail=result["error"])

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

            if rollback_reservation:
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

            if rollback_reservation:
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
            release_result = await get_srp_admission_service().release(
                reservation_id=str(srp_binding["reservation_id"]),
                endpoint="streams.stop",
                stream_id=stream_id,
            )
            avb_service.clear_srp_reservation(stream_id)
            result["srp_release"] = release_result.to_dict()

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

        success = await router.connect(
            talker_id,
            listener_id,
            reservation_id=route_reservation_id,
            admission_id=admission.admission_id if admission and admission.decision == "allowed" else None,
        )

        if not success:
            raise HTTPException(status_code=500, detail="Connection failed")

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

        success = await router.disconnect(talker_id, listener_id)

        if not success:
            raise HTTPException(status_code=404, detail="Connection not found or disconnect failed")

        return {
            "success": True,
            "message": "Stream disconnected successfully"
        }

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

    try:
        admission = None
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
    except HTTPException:
        raise
    except Exception as e:
        try:
            if admission and admission.decision == "allowed" and admission.reservation_id:
                await get_srp_admission_service().release(
                    reservation_id=admission.reservation_id,
                    endpoint="avdecc.connections.rollback",
                    stream_id=(
                        f"{req.talker_entity_id}:{req.talker_stream_index}"
                        f"->{req.listener_entity_id}:{req.listener_stream_index}"
                    ),
                    talker_id=req.talker_entity_id,
                    listener_id=req.listener_entity_id,
                )
        except Exception:
            pass
        logger.error(f"ACMP connect_stream failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"ACMP connection failed: {e}")

    if not success:
        if admission and admission.decision == "allowed" and admission.reservation_id:
            await get_srp_admission_service().release(
                reservation_id=admission.reservation_id,
                endpoint="avdecc.connections.rollback",
                stream_id=(
                    f"{req.talker_entity_id}:{req.talker_stream_index}"
                    f"->{req.listener_entity_id}:{req.listener_stream_index}"
                ),
                talker_id=req.talker_entity_id,
                listener_id=req.listener_entity_id,
            )
        raise HTTPException(
            status_code=500,
            detail="ACMP connection failed (timeout or rejected by remote entity)"
        )

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
        release_result = await get_srp_admission_service().release(
            reservation_id=str(binding["reservation_id"]),
            endpoint="avdecc.disconnect",
            stream_id=connection_id,
            talker_id=parts[0],
            listener_id=parts[2],
        )
        response["srp_release"] = release_result.to_dict()

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
