"""API routes for Push surface lifecycle, config, and diagnostics."""

from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field

from app.config import get_config as get_runtime_config_manager
from app.services.push_surface import PushSurfaceConfig, get_push_surface_manager
from app.services.push_surface.config import RUNTIME_CONFIG_FIELDS
from app.services.push_surface.device_assignment_service import (
    PushDeviceDescriptor,
    get_push_device_assignment_service,
)
from app.services.push_surface.drum_registry import get_drum_instance_registry
from app.services.push_surface.drum_runtime import get_push_drum_session_service
from app.services.push_surface.labs_store import get_push_surface_labs_store

router = APIRouter(prefix="/api/push-surface", tags=["push-surface"])


class PushSurfaceConfigUpdateRequest(BaseModel):
    """Partial config update for Push surface persistence and live reload."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool | None = None
    preferred_profile: str | None = None
    input_port_id: str | None = None
    output_port_id: str | None = None
    input_port_name: str | None = None
    output_port_name: str | None = None
    bank_size: int | None = Field(default=None, ge=1, le=8)
    encoder_acceleration: float | None = Field(default=None, ge=0.1, le=8.0)
    selection_behavior: str | None = None
    safe_mode: bool | None = None
    routing_write_permissions: Literal["confirm", "direct", "disabled"] | None = None
    experimental_protocol: bool | None = None
    diagnostics_directory: str | None = None
    auto_reconnect_interval_s: float | None = Field(default=None, ge=0.25, le=30.0)
    rest_base_url: str | None = None
    websocket_url: str | None = None
    default_bridge: Literal["direct", "rest", "rest_ws", "websocket"] | None = None
    category_colors: dict[str, str] | None = None


class PushSurfaceLifecycleRequest(BaseModel):
    """Lifecycle request with optional enable-state persistence."""

    persist_enabled: bool = False


class PushSurfaceLabsEditorStateRequest(BaseModel):
    """Whole-editor-state update payload for Labs Push editing."""

    editor_state: dict[str, Any]


class PushSurfaceDeviceDescriptorRequest(BaseModel):
    input_port_name: str
    output_port_name: str
    input_port_id: str | None = None
    output_port_id: str | None = None
    profile_id: str | None = None


class PushSurfaceDeviceAssignmentRequest(PushSurfaceDeviceDescriptorRequest):
    role: Literal[
        "push_drum_machine",
        "generic_push_surface",
        "midi_hub_generic_controller",
        "ignore_device",
    ]


class PushSurfaceDrumCommandRequest(BaseModel):
    device_fingerprint: str
    command: Literal[
        "select_instance",
        "confirm_instance_switch",
        "trigger_pad",
        "stop_pad",
        "set_pad_velocity_mode",
        "set_64_pad_bank",
        "set_repeat",
        "set_fixed_length",
        "set_quantize",
        "set_loop_selector",
        "set_step",
        "clear_step",
        "set_step_automation",
        "browse_pad_source",
        "load_pad_source",
        "request_surface_state",
    ]
    payload: dict[str, Any] = Field(default_factory=dict)


def _jsonable(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))


def _current_config() -> PushSurfaceConfig:
    manager = get_push_surface_manager()
    config = PushSurfaceConfig.load()
    manager_config = getattr(manager, "config", None)
    if manager_config is not None:
        config.apply_updates(asdict(manager_config))
    return config


def _save_config(config: PushSurfaceConfig) -> str:
    return str(config.save())


def _sync_runtime_config(config: PushSurfaceConfig) -> None:
    runtime_config = get_runtime_config_manager()
    for field_name, value in config.runtime_config_payload().items():
        runtime_config.set(f"push_surface.{field_name}", value, save=False)
    runtime_config.save()


def _shared_runtime_config_snapshot() -> dict[str, Any]:
    runtime_config = get_runtime_config_manager()
    defaults = PushSurfaceConfig()
    snapshot: dict[str, Any] = {}
    for field_name in RUNTIME_CONFIG_FIELDS:
        snapshot[field_name] = runtime_config.get(f"push_surface.{field_name}", getattr(defaults, field_name))
    return snapshot


def _labs_editor_payload() -> dict[str, Any]:
    manager = get_push_surface_manager()
    store = get_push_surface_labs_store()
    editor_state = store.load_state()
    return {
        "editor_state": editor_state,
        "quick_assignments": store.quick_assignments(editor_state),
        "selected_welcome_routine": store.selected_welcome_routine(editor_state),
        "active_device": _jsonable(asdict(manager.active_device)) if manager.active_device is not None else None,
        "manager_running": manager.running,
    }


def _device_descriptor_from_request(request: PushSurfaceDeviceDescriptorRequest) -> PushDeviceDescriptor:
    return PushDeviceDescriptor(
        input_port_name=request.input_port_name,
        output_port_name=request.output_port_name,
        input_port_id=request.input_port_id,
        output_port_id=request.output_port_id,
        profile_id=request.profile_id,
    )


@router.get("/health")
async def get_push_surface_health() -> dict[str, Any]:
    manager = get_push_surface_manager()
    return {
        "status": "ok",
        "health": await manager.get_health(),
    }


@router.get("/state")
async def get_push_surface_state() -> dict[str, Any]:
    manager = get_push_surface_manager()
    return {
        "status": "ok",
        "snapshot": await manager.get_state_snapshot(),
    }


@router.get("/config")
async def get_push_surface_config() -> dict[str, Any]:
    config = _current_config()
    return {
        "status": "ok",
        "config": _jsonable(asdict(config)),
        "runtime_config": _shared_runtime_config_snapshot(),
    }


@router.put("/config")
async def update_push_surface_config(request: PushSurfaceConfigUpdateRequest) -> dict[str, Any]:
    manager = get_push_surface_manager()
    config = _current_config()
    config.apply_updates(request.model_dump(exclude_none=True))
    saved_path = _save_config(config)
    _sync_runtime_config(config)
    await manager.apply_config(config)
    return {
        "status": "ok",
        "config": _jsonable(asdict(config)),
        "saved_path": saved_path,
        "running": manager.running,
    }


@router.post("/start")
async def start_push_surface(request: PushSurfaceLifecycleRequest | None = None) -> dict[str, Any]:
    manager = get_push_surface_manager()
    config = _current_config()
    if request is not None and request.persist_enabled:
        config.enabled = True
        _save_config(config)
        _sync_runtime_config(config)
    await manager.apply_config(config)
    await manager.start()
    return {
        "status": "ok",
        "running": manager.running,
        "config": _jsonable(asdict(config)),
    }


@router.post("/stop")
async def stop_push_surface(request: PushSurfaceLifecycleRequest | None = None) -> dict[str, Any]:
    manager = get_push_surface_manager()
    config = _current_config()
    await manager.stop()
    if request is not None and request.persist_enabled:
        config.enabled = False
        _save_config(config)
        _sync_runtime_config(config)
        await manager.apply_config(config)
    return {
        "status": "ok",
        "running": manager.running,
        "config": _jsonable(asdict(config)),
    }


@router.get("/diagnostics")
async def get_push_surface_diagnostics() -> dict[str, Any]:
    manager = get_push_surface_manager()
    health = await manager.get_health()
    snapshot = await manager.get_state_snapshot()
    state_payload = snapshot.get("state") if isinstance(snapshot, dict) else {}
    diagnostics = state_payload.get("diagnostics") if isinstance(state_payload, dict) else {}
    return {
        "status": "ok",
        "diagnostics": diagnostics or {},
        "last_capability_dump": health.get("last_capability_dump"),
        "last_diagnostics_export": health.get("last_diagnostics_export"),
        "running": health.get("running", False),
    }


@router.post("/diagnostics/test-pattern")
async def send_push_surface_test_pattern() -> dict[str, Any]:
    manager = get_push_surface_manager()
    emitted_messages = await manager.send_test_pattern()
    return {
        "status": "ok",
        "emitted_messages": emitted_messages,
    }


@router.post("/diagnostics/export")
async def export_push_surface_diagnostics() -> dict[str, Any]:
    manager = get_push_surface_manager()
    export_path = await manager.export_diagnostics_bundle()
    return {
        "status": "ok",
        "export_path": export_path,
    }


@router.post("/diagnostics/dump-capabilities")
async def dump_push_surface_capabilities() -> dict[str, Any]:
    manager = get_push_surface_manager()
    capability_dump = await manager.dump_capabilities()
    return {
        "status": "ok",
        "capabilities": capability_dump,
    }


@router.get("/labs/editor-state")
async def get_push_surface_labs_editor_state() -> dict[str, Any]:
    return {
        "status": "ok",
        **_labs_editor_payload(),
    }


@router.put("/labs/editor-state")
async def update_push_surface_labs_editor_state(request: PushSurfaceLabsEditorStateRequest) -> dict[str, Any]:
    store = get_push_surface_labs_store()
    editor_state = store.save_state(request.editor_state)
    manager = get_push_surface_manager()
    if manager.running:
        await manager.refresh_state()
    return {
        "status": "ok",
        "editor_state": editor_state,
        "quick_assignments": store.quick_assignments(editor_state),
        "selected_welcome_routine": store.selected_welcome_routine(editor_state),
        "active_device": _jsonable(asdict(manager.active_device)) if manager.active_device is not None else None,
        "manager_running": manager.running,
    }


@router.get("/drum-instances")
async def list_push_surface_drum_instances() -> dict[str, Any]:
    registry = get_drum_instance_registry()
    instances = [instance.to_dict() for instance in await registry.list_instances()]
    return {"status": "ok", "instances": instances}


@router.get("/device-assignments")
async def list_push_surface_device_assignments() -> dict[str, Any]:
    service = get_push_device_assignment_service()
    return {
        "status": "ok",
        "assignments": [assignment.to_dict() for assignment in service.list_assignments()],
    }


@router.post("/device-assignments")
async def assign_push_surface_device_role(request: PushSurfaceDeviceAssignmentRequest) -> dict[str, Any]:
    service = get_push_device_assignment_service()
    assignment = service.assign_role(_device_descriptor_from_request(request), request.role)
    return {
        "status": "ok",
        "assignment": assignment.to_dict(),
    }


@router.post("/device-assignments/resolve")
async def resolve_push_surface_device_assignment(request: PushSurfaceDeviceDescriptorRequest) -> dict[str, Any]:
    service = get_push_device_assignment_service()
    resolution = service.resolve_device(_device_descriptor_from_request(request))
    return {
        "status": "ok",
        **resolution,
    }


@router.get("/drum-session/state")
async def get_push_surface_drum_session_state(device_fingerprint: str = Query(..., min_length=4)) -> dict[str, Any]:
    service = get_push_drum_session_service()
    state = await service.get_surface_state(device_fingerprint)
    return {
        "status": "ok",
        **state,
    }


@router.post("/drum-session/command")
async def dispatch_push_surface_drum_command(request: PushSurfaceDrumCommandRequest) -> dict[str, Any]:
    service = get_push_drum_session_service()
    payload = await service.dispatch_command(request.device_fingerprint, request.command, request.payload)
    return payload
