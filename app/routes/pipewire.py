"""
PipeWire Audio Server API Routes

REST endpoints for PipeWire monitoring, control, and status.
Provides graph topology, latency settings, volume control, and real-time metrics.
"""

import logging
from dataclasses import asdict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import Optional

from app.services.clock_sync import get_clock_sync_profile

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pipewire", tags=["pipewire"])


# ============================================================================
# Request models
# ============================================================================

class SetQuantumRequest(BaseModel):
    quantum: int = Field(..., description="0 = auto, or 32-8192 (power of 2)")
    
    @field_validator('quantum')
    @classmethod
    def validate_quantum(cls, v: int) -> int:
        if v == 0:
            return v
        if v < 16 or v > 8192:
            raise ValueError("quantum must be 0 (auto) or between 16 and 8192")
        # Check if power of 2
        if v & (v - 1) != 0:
            raise ValueError("quantum must be a power of 2")
        return v


class SetRateRequest(BaseModel):
    rate: int = Field(..., description="0 = auto, or valid sample rate")
    
    @field_validator('rate')
    @classmethod
    def validate_rate(cls, v: int) -> int:
        if v == 0:
            return v
        valid_rates = [44100, 48000, 88200, 96000, 176400, 192000]
        if v not in valid_rates:
            raise ValueError(f"rate must be 0 (auto) or one of {valid_rates}")
        return v


class SetVolumeRequest(BaseModel):
    node_id: int
    volume: float = Field(..., ge=0.0, le=1.5, description="Volume level 0.0 to 1.5")


class SetMuteRequest(BaseModel):
    node_id: int
    mute: bool


# ============================================================================
# Snapshot / status
# ============================================================================

@router.get("/status")
async def get_pipewire_status():
    """Get full PipeWire graph snapshot — daemon, devices, nodes, streams, links, latency, alerts."""
    try:
        from app.services.pipewire_service import get_pipewire_service
        svc = get_pipewire_service()
        snapshot = await svc.get_graph_snapshot()
        return asdict(snapshot)
    except Exception as e:
        logger.error(f"PipeWire status error: {e}")
        raise HTTPException(500, detail=str(e))


@router.get("/daemon")
async def get_pipewire_daemon():
    """Check PipeWire daemon status."""
    try:
        from app.services.pipewire_service import get_pipewire_service
        svc = get_pipewire_service()
        info = await svc.check_daemon()
        return asdict(info)
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@router.get("/devices")
async def get_pipewire_devices():
    """List PipeWire audio devices."""
    try:
        from app.services.pipewire_service import get_pipewire_service
        svc = get_pipewire_service()
        devices = await svc.get_devices()
        return {"devices": [asdict(d) for d in devices]}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@router.get("/nodes")
async def get_pipewire_nodes():
    """List PipeWire sink and source nodes."""
    try:
        from app.services.pipewire_service import get_pipewire_service
        svc = get_pipewire_service()
        nodes = await svc.get_nodes()
        return {"nodes": [asdict(n) for n in nodes]}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@router.get("/streams")
async def get_pipewire_streams():
    """List active PipeWire audio streams."""
    try:
        from app.services.pipewire_service import get_pipewire_service
        svc = get_pipewire_service()
        streams = await svc.get_streams()
        return {"streams": [asdict(s) for s in streams]}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@router.get("/links")
async def get_pipewire_links():
    """List PipeWire port connections (graph links)."""
    try:
        from app.services.pipewire_service import get_pipewire_service
        svc = get_pipewire_service()
        links = await svc.get_links()
        return {"links": [asdict(l) for l in links]}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@router.get("/clients")
async def get_pipewire_clients():
    """List connected PipeWire clients."""
    try:
        from app.services.pipewire_service import get_pipewire_service
        svc = get_pipewire_service()
        clients = await svc.get_clients()
        return {"clients": clients}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


# ============================================================================
# Settings / control
# ============================================================================

@router.get("/settings")
async def get_pipewire_settings():
    """Get current PipeWire clock settings (rate, quantum, limits)."""
    try:
        from app.services.pipewire_service import get_pipewire_service
        svc = get_pipewire_service()
        settings = await svc.get_settings()
        return asdict(settings)
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@router.post("/quantum")
async def set_pipewire_quantum(req: SetQuantumRequest):
    """Set PipeWire DSP quantum (buffer period). LOCKED for Tier A performance."""
    from app.config import config_get
    target_quantum = int(config_get("audio.buffer_size", 64))
    target_rate = int(config_get("audio.sample_rate", 48000))
    profile = str(get_clock_sync_profile())

    raise HTTPException(
        status_code=403,
        detail=f"PipeWire quantum is LOCKED at {target_quantum} samples for Tier A performance (<3ms latency). "
               "Changes must be made in systemd service (map2-backend.service) and service restarted. "
               f"Current profile={profile}; enforced order: "
               f"'pw-metadata -n settings 0 clock.force-rate {target_rate}' then "
               f"'pw-metadata -n settings 0 clock.force-quantum {target_quantum}'."
    )


@router.post("/rate")
async def set_pipewire_rate(req: SetRateRequest):
    """Set PipeWire forced sample rate. LOCKED for Tier A performance."""
    from app.config import config_get
    target_quantum = int(config_get("audio.buffer_size", 64))
    target_rate = int(config_get("audio.sample_rate", 48000))
    profile = str(get_clock_sync_profile())

    raise HTTPException(
        status_code=403,
        detail=f"PipeWire sample rate is LOCKED at {target_rate} Hz for Tier A performance. "
               "Changes must be made in systemd service (map2-backend.service) and service restarted. "
               f"Current profile={profile}; enforced order: "
               f"'pw-metadata -n settings 0 clock.force-rate {target_rate}' then "
               f"'pw-metadata -n settings 0 clock.force-quantum {target_quantum}'."
    )


# ============================================================================
# Volume / mute
# ============================================================================

@router.get("/volume/{node_id}")
async def get_node_volume(node_id: int):
    """Get volume and mute state for a PipeWire node."""
    try:
        from app.services.pipewire_service import get_pipewire_service
        svc = get_pipewire_service()
        result = await svc.get_volume(node_id)
        return {"node_id": node_id, **result}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@router.post("/volume")
async def set_node_volume(req: SetVolumeRequest):
    """Set volume for a PipeWire node."""
    try:
        from app.services.pipewire_service import get_pipewire_service
        svc = get_pipewire_service()
        ok = await svc.set_volume(req.node_id, req.volume)
        if not ok:
            raise HTTPException(400, detail="Failed to set volume")
        return {"success": True, "node_id": req.node_id, "volume": req.volume}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@router.post("/mute")
async def set_node_mute(req: SetMuteRequest):
    """Set mute state for a PipeWire node."""
    try:
        from app.services.pipewire_service import get_pipewire_service
        svc = get_pipewire_service()
        ok = await svc.set_mute(req.node_id, req.mute)
        if not ok:
            raise HTTPException(400, detail="Failed to set mute")
        return {"success": True, "node_id": req.node_id, "mute": req.mute}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, detail=str(e))


# ============================================================================
# Latency
# ============================================================================

@router.get("/latency")
async def get_pipewire_latency():
    """Get current PipeWire latency breakdown."""
    try:
        from app.services.pipewire_service import get_pipewire_service
        svc = get_pipewire_service()
        settings = await svc.get_settings()
        latency = svc._compute_latency(settings)
        return {
            "settings": asdict(settings),
            **latency,
        }
    except Exception as e:
        raise HTTPException(500, detail=str(e))
