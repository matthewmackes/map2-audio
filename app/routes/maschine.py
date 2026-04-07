"""Maschine MK1 backend routes and daemon websocket bridge."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field

from app.config import get_config as get_runtime_config_manager
from app.database import get_session
from app.services.maschine_lcd_service import get_maschine_lcd_render_service
from app.services.maschine_service import get_maschine_service

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


class MaschineAudioGridSelectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    block_id: str


class MaschineTransportConfigRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transport_preference: Literal["auto", "hidapi", "pyusb-bulk"] | None = None
    allow_kernel_detach: bool | None = None


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
) -> dict[str, Any]:
    service = get_maschine_service()
    renderer = get_maschine_lcd_render_service()
    async with get_session(read_only=True) as session:
        render = await renderer.render(
            session=session,
            maschine_service=service,
            context=context,
            focus_metric=focus_metric,
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
