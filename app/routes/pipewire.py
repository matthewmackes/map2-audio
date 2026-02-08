"""
PipeWire Audio Server API Routes

REST endpoints for PipeWire monitoring, control, and status.
Provides graph topology, latency settings, volume control, and real-time metrics.
"""

import logging
from dataclasses import asdict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pipewire", tags=["pipewire"])


# ============================================================================
# Request models
# ============================================================================

class SetQuantumRequest(BaseModel):
    quantum: int  # 0 = auto, or 32-8192 (power of 2)


class SetRateRequest(BaseModel):
    rate: int  # 0 = auto, or 44100/48000/88200/96000/176400/192000


class SetVolumeRequest(BaseModel):
    node_id: int
    volume: float  # 0.0 to 1.5


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
    """Set PipeWire DSP quantum (buffer period). 0 = automatic."""
    try:
        from app.services.pipewire_service import get_pipewire_service
        svc = get_pipewire_service()
        ok = await svc.set_quantum(req.quantum)
        if not ok:
            raise HTTPException(400, detail="Failed to set quantum")
        settings = await svc.get_settings()
        return {"success": True, "quantum": req.quantum, "settings": asdict(settings)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@router.post("/rate")
async def set_pipewire_rate(req: SetRateRequest):
    """Set PipeWire forced sample rate. 0 = automatic."""
    try:
        from app.services.pipewire_service import get_pipewire_service
        svc = get_pipewire_service()
        ok = await svc.set_rate(req.rate)
        if not ok:
            raise HTTPException(400, detail="Failed to set rate")
        settings = await svc.get_settings()
        return {"success": True, "rate": req.rate, "settings": asdict(settings)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, detail=str(e))


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
