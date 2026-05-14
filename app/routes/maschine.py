"""Maschine MK1 backend routes and daemon websocket bridge."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field

from app.config import get_config as get_runtime_config_manager
from app.database import get_session
from app.services.maschine.admin_console import get_maschine_admin_console_service
from app.services.maschine.calibration_facade import (
    get_pressure_curves as facade_get_pressure_curves,
    update_pressure_curves as facade_update_pressure_curves,
)
from app.services.maschine.calibration_store import CalibrationSchemaError
from app.services.maschine.incident_log import get_maschine_incident_log_service
from app.services.maschine_lcd_service import get_maschine_lcd_render_service
from app.services.maschine_service import get_maschine_service
from app.services.maschine.midi_map_config import (
    load_midi_map_config,
    save_midi_map_config,
    MaschineMidiMapConfig,
)
from fastapi import HTTPException

router = APIRouter(prefix="/api/maschine", tags=["maschine"])


class MaschineRegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    daemon_version: str | None = None
    virtual_port_name: str | None = None
    hid_device: dict[str, Any] = Field(default_factory=dict)
    transport: dict[str, Any] = Field(default_factory=dict)
    transport_candidates: list[dict[str, Any]] = Field(default_factory=list)
    firmware_info: dict[str, Any] = Field(default_factory=dict)
    capabilities: dict[str, Any] = Field(default_factory=dict)
    status: str | None = None


class MaschineEncoderMapRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    encoder_map: dict[str, Any] = Field(default_factory=dict)


class MaschineLcdRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    side: Literal["left", "right"]
    bitmap: dict[str, Any] = Field(default_factory=dict)


class MaschineHwTestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    test: Literal[
        "led_walk", "led_all_on", "led_all_off",
        "lcd_checkerboard", "lcd_gradient", "lcd_clear",
        "pad_readback",
    ]
    params: dict[str, Any] = Field(default_factory=dict)


class MaschineAudioGridSelectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    block_id: str


class MaschineTransportConfigRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transport_preference: Literal["auto", "hidapi", "pyusb-bulk"] | None = None
    allow_kernel_detach: bool | None = None


class MaschineAdminConsoleSelectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    delta: int = 0


def _maschine_transport_config_snapshot() -> dict[str, Any]:
    runtime_config = get_runtime_config_manager()
    return {
        "transport_preference": str(runtime_config.get("maschine.transport_preference", "auto") or "auto"),
        "allow_kernel_detach": bool(runtime_config.get("maschine.allow_kernel_detach", False)),
        "applies_on": "next-reconnect-or-daemon-start",
    }


@router.post("/register")
async def register_maschine_daemon(request: MaschineRegisterRequest) -> dict[str, Any]:
    service = get_maschine_service()
    state = await service.register_daemon(
        daemon_version=request.daemon_version,
        virtual_port_name=request.virtual_port_name,
        hid_device=request.hid_device,
        transport=request.transport,
        transport_candidates=request.transport_candidates,
        firmware_info=request.firmware_info,
        capabilities=request.capabilities,
        status=request.status,
    )
    return {
        "status": "ok",
        "state": state,
        "websocket_url": "/api/maschine/ws",
    }


@router.get("/status")
async def get_maschine_status() -> dict[str, Any]:
    return {
        "status": "ok",
        "state": get_maschine_service().get_status(),
    }


@router.get("/transport-config")
async def get_maschine_transport_config() -> dict[str, Any]:
    return {
        "status": "ok",
        "config": _maschine_transport_config_snapshot(),
        "state": get_maschine_service().get_status(),
    }


@router.put("/transport-config")
async def update_maschine_transport_config(request: MaschineTransportConfigRequest) -> dict[str, Any]:
    runtime_config = get_runtime_config_manager()
    if request.transport_preference is not None:
        runtime_config.set("maschine.transport_preference", request.transport_preference, save=False)
    if request.allow_kernel_detach is not None:
        runtime_config.set("maschine.allow_kernel_detach", bool(request.allow_kernel_detach), save=False)
    runtime_config.save()
    return {
        "status": "ok",
        "config": _maschine_transport_config_snapshot(),
        "note": "Maschine daemon picks up transport policy changes on the next reconnect or next daemon start.",
    }


@router.get("/admin-console")
async def get_maschine_admin_console() -> dict[str, Any]:
    return {
        "status": "ok",
        "admin_console": get_maschine_admin_console_service().snapshot(),
    }


@router.post("/admin-console/unlock")
async def unlock_maschine_admin_console() -> dict[str, Any]:
    return {
        "status": "ok",
        "admin_console": await get_maschine_admin_console_service().unlock(),
    }


@router.post("/admin-console/select")
async def select_maschine_admin_console_action(request: MaschineAdminConsoleSelectRequest) -> dict[str, Any]:
    return {
        "status": "ok",
        "admin_console": await get_maschine_admin_console_service().select_relative(request.delta),
    }


@router.post("/admin-console/confirm")
async def confirm_maschine_admin_console_action() -> dict[str, Any]:
    return {
        "status": "ok",
        "admin_console": await get_maschine_admin_console_service().confirm(),
    }


@router.post("/admin-console/cancel")
async def cancel_maschine_admin_console_action() -> dict[str, Any]:
    return {
        "status": "ok",
        "admin_console": await get_maschine_admin_console_service().cancel(),
    }


@router.post("/admin-console/lock")
async def lock_maschine_admin_console() -> dict[str, Any]:
    return {
        "status": "ok",
        "admin_console": await get_maschine_admin_console_service().lock(),
    }


@router.get("/encoder-map")
async def get_maschine_encoder_map() -> dict[str, Any]:
    async with get_session(read_only=True) as session:
        encoder_map = await get_maschine_service().get_encoder_map(session)
    return {
        "status": "ok",
        "encoder_map": encoder_map,
    }


@router.post("/encoder-map")
async def update_maschine_encoder_map(request: MaschineEncoderMapRequest) -> dict[str, Any]:
    async with get_session() as session:
        encoder_map = await get_maschine_service().update_encoder_map(session, request.encoder_map)
    return {
        "status": "ok",
        "encoder_map": encoder_map,
    }


@router.get("/led-state")
async def get_maschine_led_state() -> dict[str, Any]:
    return {
        "status": "ok",
        "led_state": get_maschine_service().get_led_state(),
    }


@router.get("/audio-grid")
async def get_maschine_audio_grid() -> dict[str, Any]:
    async with get_session() as session:
        audio_grid = await get_maschine_service().get_audio_grid_projection(session)
    return {
        "status": "ok",
        "audio_grid": audio_grid,
    }


@router.post("/audio-grid/select")
async def select_maschine_audio_grid_block(request: MaschineAudioGridSelectRequest) -> dict[str, Any]:
    async with get_session() as session:
        audio_grid = await get_maschine_service().select_audio_grid_block(session, request.block_id)
    return {
        "status": "ok",
        "audio_grid": audio_grid,
    }


@router.post("/audio-grid/bypass")
async def toggle_maschine_audio_grid_block_bypass(request: MaschineAudioGridSelectRequest) -> dict[str, Any]:
    async with get_session() as session:
        audio_grid = await get_maschine_service().toggle_audio_grid_block_bypass(session, request.block_id)
    return {
        "status": "ok",
        "audio_grid": audio_grid,
    }


@router.post("/lcd")
async def update_maschine_lcd(request: MaschineLcdRequest) -> dict[str, Any]:
    lcd_state = await get_maschine_service().update_lcd(side=request.side, bitmap=request.bitmap)
    return {
        "status": "ok",
        "lcd": lcd_state,
    }


@router.get("/lcd/render")
async def render_maschine_lcd(
    context: Literal["audio_grid", "stats"] = Query(default="audio_grid"),
    focus_metric: str | None = Query(default=None),
    profile_id: str | None = Query(default=None),
) -> dict[str, Any]:
    service = get_maschine_service()
    renderer = get_maschine_lcd_render_service()
    async with get_session(read_only=True) as session:
        render = await renderer.render(
            session=session,
            maschine_service=service,
            context=context,
            focus_metric=focus_metric,
            profile_id=profile_id,
        )
    lcd_state = await service.update_lcd_pair(
        left=render.get("left") or {},
        right=render.get("right") or {},
        source=f"render:{context}",
    )
    return {
        "status": "ok",
        "render": render,
        "lcd": lcd_state,
    }


@router.get("/midi-map")
async def get_maschine_midi_map() -> dict[str, Any]:
    """Return the full MIDI map config with labels and zone metadata."""
    config = load_midi_map_config()
    return {
        "status": "ok",
        "midi_map": config.to_dict(),
    }


@router.put("/midi-map")
async def update_maschine_midi_map(request: dict[str, Any]) -> dict[str, Any]:
    """Update MIDI map config and persist to disk."""
    config = MaschineMidiMapConfig.from_dict(request)
    save_midi_map_config(config)
    return {
        "status": "ok",
        "midi_map": config.to_dict(),
    }


@router.post("/midi-map/test")
async def test_maschine_midi_element(request: dict[str, Any]) -> dict[str, Any]:
    """Test a single MIDI element: send MIDI + light LED.

    Body: { "element_type": "pad"|"button"|"encoder", "index": 0, "brightness": 255 }
    """
    service = get_maschine_service()
    result = await service.run_hw_test(
        test_name="midi_element_test",
        params=request,
    )
    return {
        "status": "ok" if result.get("success", False) else "error",
        "result": result,
    }


@router.post("/midi-map/reset")
async def reset_maschine_midi_map() -> dict[str, Any]:
    """Reset MIDI map to factory defaults."""
    config = MaschineMidiMapConfig()
    save_midi_map_config(config)
    return {
        "status": "ok",
        "midi_map": config.to_dict(),
    }


@router.post("/led/set")
async def set_maschine_led(request: dict[str, Any]) -> dict[str, Any]:
    """Set a single LED slot brightness.

    Body: { "slot": 0, "brightness": 255 }
    """
    service = get_maschine_service()
    result = await service.run_hw_test(
        test_name="led_set",
        params=request,
    )
    return {
        "status": "ok" if result.get("success", False) else "error",
        "result": result,
    }


@router.post("/hw-test")
async def run_maschine_hw_test(request: MaschineHwTestRequest) -> dict[str, Any]:
    """Run a hardware diagnostic test against the physical MK1 device."""
    service = get_maschine_service()
    result = await service.run_hw_test(test_name=request.test, params=request.params)
    return {
        "status": "ok" if result.get("success", False) else "error",
        "test": request.test,
        "result": result,
    }


@router.get("/incident-log")
async def get_maschine_incident_log(limit: int = Query(default=50, ge=1, le=500)) -> dict[str, Any]:
    entries = get_maschine_incident_log_service().list_entries(limit=int(limit))
    return {
        "status": "ok",
        "entries": entries,
        "limit": int(limit),
    }


@router.get("/platform-event-overlay")
async def get_maschine_platform_event_overlay() -> dict[str, Any]:
    state = get_maschine_service().get_status()
    overlay = state.get("platform_event_overlay") or {}
    return {
        "status": "ok",
        "overlay": overlay,
    }


@router.post("/platform-event-overlay/clear")
async def clear_maschine_platform_event_overlay() -> dict[str, Any]:
    overlay = await get_maschine_service().clear_platform_event_overlay()
    return {
        "status": "ok",
        "overlay": overlay,
    }


class MaschinePressureCurvesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pressure_curves: dict[str, Any]


@router.get("/calibration/pressure-curves")
async def get_maschine_pressure_curves() -> dict[str, Any]:
    """T2522-C cycle 6 — return the active device's pressure-curve
    calibration block. Falls back to the linear default when no
    calibration file exists on disk yet."""
    payload = facade_get_pressure_curves()
    return {"status": "ok", **payload}


@router.put("/calibration/pressure-curves")
async def update_maschine_pressure_curves(
    request: MaschinePressureCurvesRequest,
) -> dict[str, Any]:
    """T2522-C cycle 6 — replace the active device's pressure-curve
    block. Validates against the calibration_store schema; partial
    payloads are rejected (see calibration_facade docstring)."""
    try:
        payload = facade_update_pressure_curves(request.pressure_curves)
    except CalibrationSchemaError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", **payload}


@router.websocket("/ws")
async def maschine_websocket(websocket: WebSocket) -> None:
    service = get_maschine_service()
    await service.connect_client(websocket)
    try:
        async with get_session(read_only=True) as session:
            await service.send_ws_message(
                websocket,
                {
                    "type": "maschine:welcome",
                    "topic": "maschine:status",
                    "data": {
                        "state": service.get_status(),
                        "encoder_map": await service.get_encoder_map(session),
                        "audio_grid": await service.get_audio_grid_projection(session),
                        "hid_history": service.get_hid_history(limit=50),
                    },
                },
            )
        await service.set_websocket_connected(True)
        while True:
            message = await websocket.receive_json()
            try:
                async with get_session() as session:
                    result = await service.handle_ws_message(session, message if isinstance(message, dict) else {})
            except ValueError as exc:
                await service.send_ws_message(
                    websocket,
                    {
                        "type": "maschine:error",
                        "error": str(exc),
                    },
                )
                continue
            if result is not None:
                await service.send_ws_message(
                    websocket,
                    {
                        "type": "maschine:ack",
                        "data": result,
                    },
                )
    except WebSocketDisconnect:
        pass
    finally:
        await service.disconnect_client(websocket)
        await service.set_websocket_connected(False)
