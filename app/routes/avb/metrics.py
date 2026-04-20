"""AVB/TSN status, setup, SRP, and TSN metric routes."""

from .common import *

router = APIRouter()

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


for _route in router.routes:
    if hasattr(_route, "endpoint"):
        _route.endpoint.__module__ = "app.routes.avb"


__all__ = [name for name in globals() if not name.startswith("__")]


# ============================================================================
# Stream Management Endpoints
# ============================================================================
