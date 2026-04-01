"""Maschine MK1 backend routes and daemon websocket bridge."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field

from app.database import get_session
from app.services.maschine_service import get_maschine_service

router = APIRouter(prefix="/api/maschine", tags=["maschine"])


class MaschineRegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    daemon_version: str | None = None
    virtual_port_name: str | None = None
    hid_device: dict[str, Any] = Field(default_factory=dict)
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


@router.post("/register")
async def register_maschine_daemon(request: MaschineRegisterRequest) -> dict[str, Any]:
    service = get_maschine_service()
    state = await service.register_daemon(
        daemon_version=request.daemon_version,
        virtual_port_name=request.virtual_port_name,
        hid_device=request.hid_device,
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
