"""
Expression + Stage-control routes (T097/T098).

This module exposes:
- /api/v2/expression/* assignment + retime + performance-event APIs
- /api/v2/engine/* lightweight control/inspection APIs needed by Expression/Perform pages
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.expression_service import get_expression_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["expression"])


class AssignmentCreate(BaseModel):
    id: Optional[str] = None
    cc: int = Field(..., ge=0, le=127)
    channel: int = Field(0, ge=0, le=16)  # 0 = omni
    cc_min: int = Field(0, ge=0, le=127)
    cc_max: int = Field(127, ge=0, le=127)
    param_id: str
    param_label: str = ""
    out_min: float = 0.0
    out_max: float = 1.0
    curve: str = "linear"
    custom_curve: List[Dict[str, float]] = Field(default_factory=list)
    active: bool = True
    source: str = "user"


class ListenRequest(BaseModel):
    timeout_seconds: float = Field(10.0, ge=0.25, le=30.0)
    listener_id: Optional[str] = None


class ListenCancelRequest(BaseModel):
    listener_id: Optional[str] = None


class BpmBody(BaseModel):
    bpm: float = Field(..., ge=40.0, le=300.0)


class MuteBody(BaseModel):
    muted: bool


class InjectCcRequest(BaseModel):
    cc: int = Field(..., ge=0, le=127)
    channel: int = Field(..., ge=1, le=16)
    value: int = Field(..., ge=0, le=127)


class InjectPcRequest(BaseModel):
    program: int = Field(..., ge=0, le=127)
    channel: int = Field(..., ge=1, le=16)


_output_muted_state = False


# ---------------------------------------------------------------------------
# /api/v2/expression/*
# ---------------------------------------------------------------------------

@router.get("/api/v2/expression/assignments")
async def list_assignments():
    return get_expression_service().list_assignments()


@router.post("/api/v2/expression/assignments", status_code=201)
async def create_assignment(body: AssignmentCreate):
    return get_expression_service().create_assignment(body.model_dump())


@router.delete("/api/v2/expression/assignments/{assignment_id}")
async def delete_assignment(assignment_id: str):
    ok = get_expression_service().delete_assignment(assignment_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"deleted": assignment_id}


@router.post("/api/v2/expression/listen-for-cc")
async def listen_for_cc(body: ListenRequest):
    svc = get_expression_service()
    return await asyncio.to_thread(svc.listen_for_cc, body.timeout_seconds, body.listener_id)


@router.post("/api/v2/expression/listen-for-cc/cancel")
async def cancel_listen_for_cc(body: ListenCancelRequest):
    cancelled = get_expression_service().cancel_listen(body.listener_id)
    return {"cancelled": cancelled, "listener_id": body.listener_id}


@router.get("/api/v2/expression/live-state")
async def get_live_state():
    return get_expression_service().get_live_state()


@router.get("/api/v2/expression/retime-stats")
async def get_retime_stats():
    stats = get_expression_service().get_retime_stats()
    sample_count = int(stats.get("sample_count", 0) or 0)
    gate = "PASS" if (sample_count > 0 and float(stats.get("p95_ms", 0.0)) <= 5.0) else "FAIL"
    return {**stats, "gate": gate, "gate_threshold_ms": 5.0}


@router.post("/api/v2/expression/retime-reset")
async def reset_retime_stats():
    get_expression_service().clear_retime_stats()
    return {"status": "ok"}


@router.get("/api/v2/expression/performance-events")
async def get_performance_events(
    after_seq: int = Query(0, ge=0),
    limit: int = Query(128, ge=1, le=2048),
):
    return get_expression_service().get_performance_events(after_seq=after_seq, limit=limit)


@router.post("/api/v2/expression/debug/inject-cc")
async def debug_inject_cc(body: InjectCcRequest):
    get_expression_service().process_midi_cc(
        cc=body.cc,
        value=body.value,
        channel=body.channel,
        source_port="expression_debug",
    )
    return {"status": "ok"}


@router.post("/api/v2/expression/debug/inject-pc")
async def debug_inject_pc(body: InjectPcRequest):
    get_expression_service().process_midi_program_change(
        program=body.program,
        channel=body.channel,
        source_port="expression_debug",
    )
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# /api/v2/engine/*
# ---------------------------------------------------------------------------

@router.get("/api/v2/engine/parameters")
async def list_engine_parameters():
    # Keep this explicit list stable for UI contracts.
    params = [
        {"id": "engine.volume", "label": "Master Volume", "unit": "dB", "min": -60.0, "max": 0.0},
        {"id": "engine.reverb_mix", "label": "Reverb Mix", "unit": "%", "min": 0.0, "max": 1.0},
        {"id": "engine.delay_mix", "label": "Delay Mix", "unit": "%", "min": 0.0, "max": 1.0},
        {"id": "engine.chorus_mix", "label": "Chorus Mix", "unit": "%", "min": 0.0, "max": 1.0},
        {"id": "engine.wah_freq", "label": "Wah Frequency", "unit": "Hz", "min": 200.0, "max": 4000.0},
        {"id": "engine.gate_thresh", "label": "Gate Threshold", "unit": "dB", "min": -80.0, "max": 0.0},
        {"id": "engine.comp_thresh", "label": "Compressor Threshold", "unit": "dB", "min": -60.0, "max": 0.0},
        {"id": "engine.pitch_shift", "label": "Pitch Shift", "unit": "st", "min": -12.0, "max": 12.0},
        {"id": "engine.nam_level", "label": "NAM Output Level", "unit": "dB", "min": -20.0, "max": 20.0},
        {"id": "engine.cab_mix", "label": "Cabinet IR Mix", "unit": "%", "min": 0.0, "max": 1.0},
    ]
    return {"parameters": params, "count": len(params)}


@router.get("/api/v2/engine/status")
async def get_engine_status_v2():
    try:
        from app.services.juce_engine_service import get_audio_engine

        service = get_audio_engine()
        running = bool(service and service.is_running and service.is_audio_running())
        io_stats = await service.get_audio_io_stats() if running else {}
        xrun_count = int(io_stats.get("xrun_count", 0) or 0) if isinstance(io_stats, dict) else 0
        status = "ok" if running and xrun_count == 0 else ("degraded" if running else "offline")
        return {"status": status, "running": running, "xrun_count": xrun_count}
    except Exception:
        logger.debug("Failed to build /api/v2/engine/status payload", exc_info=True)
        return {"status": "offline", "running": False, "xrun_count": 0}


@router.get("/api/v2/engine/tuner")
@router.get("/api/v2/expression/engine/tuner")
async def get_tuner():
    # Placeholder until dedicated tuner implementation is available in JUCE bindings.
    return {
        "note": "--",
        "octave": 4,
        "cents": 0.0,
        "frequency_hz": 0.0,
        "in_tune": False,
        "online": False,
    }


@router.post("/api/v2/engine/output-mute")
@router.post("/api/v2/expression/engine/output-mute")
async def set_output_mute(body: MuteBody):
    global _output_muted_state
    _output_muted_state = bool(body.muted)
    return {
        "muted": _output_muted_state,
        "applied": False,
        "note": "Output mute plumbing is staged; UI state is persisted for workflow continuity.",
    }


@router.post("/api/v2/engine/bpm")
@router.post("/api/v2/expression/engine/bpm")
async def set_bpm(body: BpmBody):
    try:
        from app.services.midi_hub.clock_engine import get_midi_clock_engine

        engine = get_midi_clock_engine()
        status = engine.configure(bpm=float(body.bpm))
        return {"bpm": float(body.bpm), "applied": True, "clock": status}
    except Exception:
        logger.debug("Failed to set MIDI clock BPM", exc_info=True)
        return {"bpm": float(body.bpm), "applied": False, "note": "MIDI clock engine unavailable"}
