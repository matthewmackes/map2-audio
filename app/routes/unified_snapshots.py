"""Unified snapshot API routes."""

from __future__ import annotations

import httpx
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Body, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.database import get_session
from app.services.publish_readiness_service import PublishReadinessService
from app.services.snapshot_service import SnapshotActivationPreflightError, SnapshotService, UNSET

logger = logging.getLogger(__name__)
router = APIRouter(tags=["snapshots"])


def _normalize_pagination_value(value: Any, default: int) -> int:
    return value if isinstance(value, int) else default


class SnapshotPluginInput(BaseModel):
    uri: str
    name: Optional[str] = None
    position: Optional[int] = None
    bypass: bool = False
    parameters: dict[str, float] = Field(default_factory=dict)
    loader_state: dict[str, Any] = Field(default_factory=dict)
    is_placeholder: bool = False


class SnapshotLoopInsertionInput(BaseModel):
    insertion_id: Optional[str] = None
    loop_id: Optional[str] = None
    slot_index: int = 0
    enabled: bool = True
    mode: str = "serial_insert"
    blend_pct: float = 100.0
    send_gain_db: float = 0.0
    return_gain_db: float = 0.0
    crossfade_ms: int = 12
    band_split_hz: list[float] = Field(default_factory=list)


class SnapshotChainInput(BaseModel):
    id: Optional[int] = None
    name: str
    plugins: list[SnapshotPluginInput] = Field(default_factory=list)
    loop_insertions: list[SnapshotLoopInsertionInput] = Field(default_factory=list)
    effects_loops: list[dict[str, Any]] = Field(default_factory=list)


class SnapshotChannelInput(BaseModel):
    id: Optional[int] = None
    channel_key: Optional[str] = None
    chain_id: Optional[int] = None
    label: Optional[str] = None
    color: Optional[str] = None
    muted: bool = False
    solo: bool = False
    dry_wet_mix: float = 100.0


class SnapshotRoutingInput(BaseModel):
    mode: str = "parallel_blend"
    active_channel_key: Optional[str] = None
    blend_positions: dict[str, float] = Field(default_factory=dict)
    morph_position: float = 0.5
    morph_source_channel_key: Optional[str] = None
    morph_target_channel_key: Optional[str] = None
    series_order: list[str] = Field(default_factory=list)


class SnapshotPathInput(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    label: Optional[str] = None
    color: Optional[str] = None
    muted: bool = False
    solo: bool = False
    dry_wet_mix: float = 100.0
    order_index: Optional[int] = None
    snapshot_chain_id: Optional[int] = None
    runtime_chain_id: Optional[int] = None
    plugins: list[SnapshotPluginInput] = Field(default_factory=list)
    loop_insertions: list[SnapshotLoopInsertionInput] = Field(default_factory=list)
    effects_loops: list[dict[str, Any]] = Field(default_factory=list)


class SnapshotIOBindingsInput(BaseModel):
    input_device: Optional[str] = None
    output_device: Optional[str] = None
    monitoring_output_index: Optional[int] = Field(default=None, ge=0)


class SnapshotControlsInput(BaseModel):
    midi_map: list[dict[str, Any]] = Field(default_factory=list)
    automation_lanes: list[dict[str, Any]] = Field(default_factory=list)
    expression_mappings: list[dict[str, Any]] = Field(default_factory=list)
    monitoring_output_index: Optional[int] = Field(default=None, ge=0)
    maschine_encoder_map: dict[str, Any] = Field(default_factory=dict)


class SnapshotCreateRequest(BaseModel):
    name: str
    description: str = ""
    tags: list[str] = Field(default_factory=list)
    program_number: Optional[int] = None
    tempo_bpm: float = Field(default=120.0, ge=20.0, le=300.0)
    derived_from_snapshot_id: Optional[int] = None
    output_level_reference_dbfs: Optional[float] = None
    output_level_warning_threshold_db: Optional[float] = 3.0
    input_device: Optional[str] = None
    output_device: Optional[str] = None
    is_locked: bool = False
    io_bindings: Optional[SnapshotIOBindingsInput] = None
    controls: Optional[SnapshotControlsInput] = None
    paths: Optional[list[SnapshotPathInput]] = None
    channels: list[SnapshotChannelInput] = Field(default_factory=list)
    chains: list[SnapshotChainInput] = Field(default_factory=list)
    routing: SnapshotRoutingInput = Field(default_factory=SnapshotRoutingInput)
    midi_map: list[dict[str, Any]] = Field(default_factory=list)
    snapshot_data: Optional[dict[str, Any]] = None


class SnapshotUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    program_number: Optional[int] = None
    create_revision: bool = False
    tempo_bpm: Optional[float] = Field(default=None, ge=20.0, le=300.0)
    derived_from_snapshot_id: Optional[int] = None
    output_level_reference_dbfs: Optional[float] = None
    output_level_warning_threshold_db: Optional[float] = None
    input_device: Optional[str] = None
    output_device: Optional[str] = None
    io_bindings: Optional[SnapshotIOBindingsInput] = None
    controls: Optional[SnapshotControlsInput] = None
    paths: Optional[list[SnapshotPathInput]] = None
    display_order: Optional[int] = None
    is_favorite: Optional[bool] = None
    is_locked: Optional[bool] = None
    channels: Optional[list[SnapshotChannelInput]] = None
    chains: Optional[list[SnapshotChainInput]] = None
    routing: Optional[SnapshotRoutingInput] = None
    midi_map: Optional[list[dict[str, Any]]] = None
    snapshot_data: Optional[dict[str, Any]] = None


class ProgramNumberRequest(BaseModel):
    program_number: Optional[int] = None


class PreviewSnapshotRequest(BaseModel):
    snapshot_data: dict[str, Any]


class ChainCreateRequest(BaseModel):
    name: str


class ChainRenameRequest(BaseModel):
    name: str


class PluginCreateRequest(BaseModel):
    plugin_uri: str
    plugin_name: Optional[str] = None
    loader_state: dict[str, Any] = Field(default_factory=dict)


class PluginReorderRequest(BaseModel):
    plugin_ids: list[int]


class PluginBypassRequest(BaseModel):
    bypass: bool


class PluginParametersRequest(BaseModel):
    parameters: dict[str, Any] = Field(default_factory=dict)


class RoutingUpdateRequest(BaseModel):
    mode: Optional[str] = None
    active_channel_key: Optional[str] = None
    blend_positions: Optional[dict[str, float]] = None
    morph_position: Optional[float] = None
    morph_source_channel_key: Optional[str] = None
    morph_target_channel_key: Optional[str] = None
    series_order: Optional[list[str]] = None


class MidiMapRequest(BaseModel):
    entries: list[dict[str, Any]] = Field(default_factory=list)


class CommunityShareRequest(BaseModel):
    author_name: str = "Anonymous"


class CommunityRateRequest(BaseModel):
    rating: int


class SaveAsNewRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class SnapshotTempoTapRequest(BaseModel):
    timestamp_ms: Optional[float] = None


class PublishRetryRequest(BaseModel):
    session_id: Optional[str] = None


def _detail_payload_from_request(request: SnapshotCreateRequest | SnapshotUpdateRequest) -> Any:
    if request.snapshot_data is not None:
        return request.snapshot_data

    if isinstance(request, SnapshotUpdateRequest):
        if request.paths is None and request.channels is None and request.chains is None and request.routing is None and request.midi_map is None:
            return UNSET

    if request.paths:
        channels: list[dict[str, Any]] = []
        chains: list[dict[str, Any]] = []
        for index, path in enumerate(request.paths):
            path_id = path.id or f"path-{index}"
            synthetic_chain_id = path.snapshot_chain_id or index + 1
            chains.append(
                {
                    "id": synthetic_chain_id,
                    "name": path.name or path.label or f"Path {index + 1}",
                    "plugins": [item.model_dump(exclude_none=True) for item in path.plugins],
                    "loop_insertions": [item.model_dump(exclude_none=True) for item in path.loop_insertions],
                    "effects_loops": [dict(item) for item in path.effects_loops],
                }
            )
            channels.append(
                {
                    "channel_key": path_id,
                    "label": path.label or path.name or f"Path {index + 1}",
                    "color": path.color or "#2563eb",
                    "muted": path.muted,
                    "solo": path.solo,
                    "dry_wet_mix": path.dry_wet_mix,
                    "chain_id": synthetic_chain_id,
                }
            )
        routing_payload = request.routing.model_dump(exclude_none=True) if request.routing is not None else {}
        midi_map = request.controls.midi_map if request.controls is not None else list(request.midi_map or [])
        return {
            "channels": channels,
            "chains": chains,
            "routing": routing_payload,
            "midi_map": [dict(entry) for entry in midi_map],
        }

    return {
        "channels": [item.model_dump(exclude_none=True) for item in (request.channels or [])],
        "chains": [item.model_dump(exclude_none=True) for item in (request.chains or [])],
        "routing": request.routing.model_dump(exclude_none=True) if request.routing is not None else {},
        "midi_map": list(request.midi_map or []),
    }


def _resolve_input_device(request: SnapshotCreateRequest | SnapshotUpdateRequest) -> Any:
    return request.io_bindings.input_device if request.io_bindings is not None else request.input_device


def _resolve_output_device(request: SnapshotCreateRequest | SnapshotUpdateRequest) -> Any:
    return request.io_bindings.output_device if request.io_bindings is not None else request.output_device


def _monitoring_output_index_from_request(request: SnapshotCreateRequest | SnapshotUpdateRequest) -> Any:
    if request.io_bindings is not None and "monitoring_output_index" in request.io_bindings.model_fields_set:
        return request.io_bindings.monitoring_output_index
    if request.controls is not None and "monitoring_output_index" in request.controls.model_fields_set:
        return request.controls.monitoring_output_index
    return UNSET


def _controls_payload_from_request(request: SnapshotCreateRequest | SnapshotUpdateRequest) -> Any:
    monitoring_output_index = _monitoring_output_index_from_request(request)

    if isinstance(request, SnapshotUpdateRequest) and request.controls is None:
        if monitoring_output_index is UNSET:
            return UNSET
        return {
            "monitoring_output_index": monitoring_output_index,
        }

    payload = (
        request.controls.model_dump(exclude_none=True, exclude_unset=True)
        if request.controls is not None
        else {}
    )
    if request.controls is not None and "monitoring_output_index" in request.controls.model_fields_set:
        payload["monitoring_output_index"] = request.controls.monitoring_output_index
    if monitoring_output_index is not UNSET:
        payload["monitoring_output_index"] = monitoring_output_index
    return payload or None


def _raise_not_found(entity: str) -> None:
    raise HTTPException(status_code=404, detail=f"{entity} not found")


def _translate_value_error(exc: ValueError) -> None:
    raise HTTPException(status_code=400, detail=str(exc)) from exc


def _activation_error_detail(exc: ValueError) -> Any:
    if isinstance(exc, SnapshotActivationPreflightError):
        return exc.detail_payload
    return str(exc)


async def _start_local_audio_engine() -> dict[str, Any]:
    from app.services.engine_runtime_facade import get_engine_service

    service = get_engine_service()
    if not service.is_available:
        raise HTTPException(status_code=503, detail="JUCE audio engine not available")

    initialized = bool(getattr(service, "is_running", False))
    if not initialized:
        init_success = await service.initialize()
        if not init_success:
            raise HTTPException(status_code=500, detail="Failed to initialize audio engine")

    success = await service.start_audio()
    if not success:
        raise HTTPException(status_code=500, detail="Failed to start audio")

    return {
        "success": True,
        "message": "Local audio engine started",
    }


async def _run_publish_repair_action(
    *,
    snapshot_id: int,
    repair_action_id: str,
    session: Any,
) -> dict[str, Any]:
    normalized_action = str(repair_action_id or "").strip()
    if not normalized_action:
        raise HTTPException(status_code=400, detail="repair_action_id is required")

    if normalized_action == "retry_publish":
        service = SnapshotService(session)
        payload = await service.state_authority_activation.activate_snapshot(
            snapshot_id,
            triggered_by="publish_retry",
        )
        if payload is None:
            _raise_not_found("Snapshot")
        return {
            "status": "success",
            "snapshot_id": snapshot_id,
            "repair_action_id": normalized_action,
            "result": payload,
        }

    if normalized_action == "recover_local_audio_engine":
        engine_result = await _start_local_audio_engine()
        service = SnapshotService(session)
        payload = await service.state_authority_activation.activate_snapshot(
            snapshot_id,
            triggered_by="publish_repair_local_engine",
        )
        if payload is None:
            _raise_not_found("Snapshot")
        return {
            "status": "success",
            "snapshot_id": snapshot_id,
            "repair_action_id": normalized_action,
            "engine": engine_result,
            "result": payload,
        }

    raise HTTPException(
        status_code=400,
        detail=f"Repair action '{normalized_action}' is not implemented yet",
    )


def _normalize_optional_query_string(value: Any) -> Optional[str]:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _normalize_bounded_limit(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        candidate = int(value)
    except (TypeError, ValueError):
        candidate = default
    return max(minimum, min(maximum, candidate))


async def _proxy_runtime_read(node_id: str, path: str, *, params: Optional[dict[str, Any]] = None) -> Optional[dict[str, Any]]:
    from app.services.node_discovery_service import get_node_discovery_service
    from app.services.snapshot_runtime_state_service import resolve_local_node_id

    normalized_node_id = str(node_id or "").strip()
    if not normalized_node_id or normalized_node_id in {"local", resolve_local_node_id()}:
        return None

    target = await get_node_discovery_service().resolve_known_node(normalized_node_id)
    if target is None:
        _raise_not_found("Node")
    if target.is_local:
        return None

    try:
        base_url = str(target.api_url or f"http://{target.host}:8080").rstrip("/")
        async with httpx.AsyncClient(timeout=3.0, follow_redirects=True) as client:
            response = await client.get(
                f"{base_url}{path}",
                params=params or None,
            )
            response.raise_for_status()
            payload = response.json()
            return payload if isinstance(payload, dict) else {"data": payload}
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            _raise_not_found("Node runtime state")
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to contact node {normalized_node_id}: {exc}") from exc


@router.get("/api/snapshots")
async def list_snapshots(
    tags: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    try:
        limit = _normalize_pagination_value(limit, 100)
        offset = _normalize_pagination_value(offset, 0)
        tags_value = _normalize_optional_query_string(tags)
        tag_list = [item.strip() for item in str(tags_value or "").split(",") if item.strip()]
        async with get_session() as session:
            service = SnapshotService(session)
            snapshots = await service.list_snapshots(tags=tag_list, limit=limit, offset=offset)
            available_tags = await service.list_snapshot_tags()
            return {
                "snapshots": snapshots,
                "count": len(snapshots),
                "limit": limit,
                "offset": offset,
                "available_tags": available_tags,
            }
    except Exception as exc:
        logger.error("Error listing snapshots: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/snapshots/live")
async def get_live_snapshot() -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.get_control_plane_snapshot()
            if snapshot is None:
                _raise_not_found("Live snapshot")
            return snapshot
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting live snapshot: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/templates")
async def list_templates(
    tags: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    try:
        limit = _normalize_pagination_value(limit, 100)
        offset = _normalize_pagination_value(offset, 0)
        tags_value = _normalize_optional_query_string(tags)
        tag_list = [item.strip() for item in str(tags_value or "").split(",") if item.strip()]
        async with get_session() as session:
            service = SnapshotService(session)
            templates = await service.list_templates(tags=tag_list, limit=limit, offset=offset)
            return {
                "templates": templates,
                "count": len(templates),
                "limit": limit,
                "offset": offset,
            }
    except Exception as exc:
        logger.error("Error listing templates: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/templates")
async def create_template(request: SnapshotCreateRequest) -> dict[str, Any]:
    try:
        detail_payload = _detail_payload_from_request(request)
        async with get_session() as session:
            service = SnapshotService(session)
            template = await service.create_template(
                name=request.name,
                description=request.description,
                tags=request.tags,
                input_device=request.input_device,
                output_device=request.output_device,
                controls_payload=request.controls.model_dump(exclude_none=True) if request.controls is not None else None,
                detail_payload=detail_payload if detail_payload is not UNSET else {},
                is_favorite=False,
                is_locked=request.is_locked,
            )
            return {
                "status": "success",
                "template_id": template["id"],
                "template": template,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error creating template: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/templates/community")
async def browse_community_templates(
    query: Optional[str] = Query(default=None),
    tags: Optional[str] = Query(default=None),
    author: Optional[str] = Query(default=None),
) -> dict[str, Any]:
    try:
        query_value = query if isinstance(query, str) else None
        tags_value = tags if isinstance(tags, str) else None
        author_value = author if isinstance(author, str) else None
        tag_list = [item.strip() for item in (tags_value or "").split(",") if item.strip()]
        async with get_session() as session:
            service = SnapshotService(session)
            templates = await service.browse_community_templates(query=query_value, tags=tag_list, author=author_value)
            return {
                "templates": templates,
                "count": len(templates),
            }
    except Exception as exc:
        logger.error("Error browsing community templates: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/templates/community/{community_uuid}/rate")
async def rate_community_template(community_uuid: str, request: CommunityRateRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            template = await service.rate_community_template(community_uuid, request.rating)
            if template is None:
                _raise_not_found("Community template")
            return {
                "status": "success",
                "template": template,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error rating community template %s: %s", community_uuid, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/templates/community/{community_uuid}/download")
async def download_community_template(community_uuid: str) -> Response:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            payload = await service.record_community_template_download(community_uuid)
            if payload is None:
                _raise_not_found("Community template")
            return Response(
                content=payload["content"],
                media_type="application/vnd.map2.template+zip",
                headers={
                    "Content-Disposition": f'attachment; filename="{payload["filename"]}"',
                },
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error downloading community template %s: %s", community_uuid, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/templates/{template_id}")
async def get_template(template_id: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            template = await service.get_template(template_id)
            if template is None:
                _raise_not_found("Template")
            return template
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting template %s: %s", template_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/api/templates/{template_id}")
async def update_template(template_id: int, request: SnapshotUpdateRequest) -> dict[str, Any]:
    try:
        detail_payload = _detail_payload_from_request(request)
        async with get_session() as session:
            service = SnapshotService(session)
            template = await service.update_template(
                template_id,
                name=request.name,
                description=request.description,
                tags=request.tags,
                program_number=request.program_number,
                tempo_bpm=request.tempo_bpm,
                derived_from_snapshot_id=request.derived_from_snapshot_id,
                output_level_reference_dbfs=request.output_level_reference_dbfs,
                output_level_warning_threshold_db=request.output_level_warning_threshold_db,
                input_device=request.input_device,
                output_device=request.output_device,
                controls_payload=request.controls.model_dump(exclude_none=True) if request.controls is not None else UNSET,
                is_favorite=request.is_favorite,
                is_locked=request.is_locked,
                display_order=request.display_order,
                detail_payload=detail_payload,
                create_revision=request.create_revision,
            )
            if template is None:
                _raise_not_found("Template")
            return {
                "status": "success",
                "template": template,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error updating template %s: %s", template_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/runtime/live-state")
async def get_runtime_live_state(node_id: Optional[str] = Query(None)) -> dict[str, Any]:
    from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

    try:
        normalized_node_id = _normalize_optional_query_string(node_id)
        proxied = await _proxy_runtime_read(normalized_node_id or "", "/api/runtime/live-state")
        if proxied is not None:
            return proxied

        async with get_session() as session:
            service = SnapshotRuntimeStateService(session)
            return await service.get_live_state()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting runtime live state: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/cluster/runtime/live-state")
async def get_cluster_runtime_live_state() -> dict[str, Any]:
    from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

    try:
        async with get_session() as session:
            service = SnapshotRuntimeStateService(session)
            return await service.get_cluster_live_state()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting cluster runtime live state: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/runtime/reconciliation")
async def get_runtime_reconciliation(node_id: Optional[str] = Query(None)) -> dict[str, Any]:
    from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

    try:
        normalized_node_id = _normalize_optional_query_string(node_id)
        proxied = await _proxy_runtime_read(normalized_node_id or "", "/api/runtime/reconciliation")
        if proxied is not None:
            return proxied

        async with get_session() as session:
            service = SnapshotRuntimeStateService(session)
            return await service.get_runtime_reconciliation_report()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting runtime reconciliation report: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/cluster/runtime/reconciliation")
async def get_cluster_runtime_reconciliation() -> dict[str, Any]:
    from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

    try:
        async with get_session() as session:
            service = SnapshotRuntimeStateService(session)
            return await service.get_cluster_reconciliation_report()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting cluster runtime reconciliation report: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/runtime/activation-events")
async def get_runtime_activation_events(
    limit: int = Query(100, ge=1, le=100),
    node_id: Optional[str] = Query(None),
) -> dict[str, Any]:
    from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

    try:
        normalized_limit = _normalize_bounded_limit(limit, default=100, minimum=1, maximum=100)
        normalized_node_id = _normalize_optional_query_string(node_id)
        proxied = await _proxy_runtime_read(
            normalized_node_id or "",
            "/api/runtime/activation-events",
            params={"limit": normalized_limit},
        )
        if proxied is not None:
            return proxied

        async with get_session() as session:
            service = SnapshotRuntimeStateService(session)
            events = await service.list_activation_events(limit=normalized_limit)
            return {
                "node_id": service.local_node_id,
                "count": len(events),
                "events": events,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting runtime activation events: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/snapshots/{snapshot_id}")
async def get_snapshot(snapshot_id: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.get_snapshot(snapshot_id)
            if snapshot is None:
                _raise_not_found("Snapshot")
            return snapshot
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/draft")
async def open_snapshot_draft(snapshot_id: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.get_snapshot(snapshot_id)
            if snapshot is None:
                _raise_not_found("Snapshot")
            return {
                "status": "success",
                "snapshot": snapshot,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error opening draft for snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots")
async def create_snapshot(request: SnapshotCreateRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.create_snapshot(
                name=request.name,
                description=request.description,
                tags=request.tags,
                program_number=request.program_number,
                tempo_bpm=request.tempo_bpm,
                derived_from_snapshot_id=request.derived_from_snapshot_id,
                output_level_reference_dbfs=request.output_level_reference_dbfs,
                output_level_warning_threshold_db=request.output_level_warning_threshold_db,
                input_device=_resolve_input_device(request),
                output_device=_resolve_output_device(request),
                controls_payload=_controls_payload_from_request(request),
                detail_payload=_detail_payload_from_request(request),
                is_locked=request.is_locked,
            )
            return {
                "status": "success",
                "snapshot_id": snapshot["id"],
                "message": f"Created snapshot: {snapshot['name']}",
                "snapshot": snapshot,
            }
    except ValueError as exc:
        _translate_value_error(exc)
    except Exception as exc:
        logger.error("Error creating snapshot: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/api/snapshots/{snapshot_id}")
async def update_snapshot(snapshot_id: int, request: SnapshotUpdateRequest) -> dict[str, Any]:
    try:
        detail_payload = _detail_payload_from_request(request)
        provided = request.model_fields_set
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.update_snapshot(
                snapshot_id,
                name=request.name if "name" in provided else UNSET,
                description=request.description if "description" in provided else UNSET,
                tags=request.tags if "tags" in provided else UNSET,
                program_number=request.program_number if "program_number" in provided else UNSET,
                tempo_bpm=request.tempo_bpm if "tempo_bpm" in provided else UNSET,
                derived_from_snapshot_id=request.derived_from_snapshot_id if "derived_from_snapshot_id" in provided else UNSET,
                output_level_reference_dbfs=request.output_level_reference_dbfs if "output_level_reference_dbfs" in provided else UNSET,
                output_level_warning_threshold_db=request.output_level_warning_threshold_db if "output_level_warning_threshold_db" in provided else UNSET,
                input_device=_resolve_input_device(request) if "input_device" in provided or "io_bindings" in provided else UNSET,
                output_device=_resolve_output_device(request) if "output_device" in provided or "io_bindings" in provided else UNSET,
                controls_payload=_controls_payload_from_request(request) if "controls" in provided or "io_bindings" in provided else UNSET,
                is_favorite=request.is_favorite if "is_favorite" in provided else UNSET,
                is_locked=request.is_locked if "is_locked" in provided else UNSET,
                display_order=request.display_order if "display_order" in provided else UNSET,
                detail_payload=detail_payload,
                create_revision=request.create_revision,
            )
            if snapshot is None:
                _raise_not_found("Snapshot")
            return {
                "status": "success",
                "message": f"Updated snapshot {snapshot_id}",
                "snapshot": snapshot,
            }
    except ValueError as exc:
        _translate_value_error(exc)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error updating snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/snapshots/{snapshot_id}/revisions")
async def list_snapshot_revisions(snapshot_id: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            revisions = await service.state_authority_revisions.list_revisions(snapshot_id)
            if revisions is None:
                _raise_not_found("Snapshot")
            return {
                "snapshot_id": snapshot_id,
                "count": len(revisions),
                "revisions": revisions,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error listing revisions for snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/revisions/{revision_number}/restore")
async def restore_snapshot_revision(snapshot_id: int, revision_number: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            restored = await service.state_authority_revisions.restore_revision(snapshot_id, revision_number)
            if restored is None:
                _raise_not_found("Snapshot revision")
            return {
                "status": "success",
                "snapshot_id": snapshot_id,
                "restored_revision_number": revision_number,
                "snapshot": restored,
            }
    except HTTPException:
        raise
    except ValueError as exc:
        _translate_value_error(exc)
    except Exception as exc:
        logger.error("Error restoring revision %s for snapshot %s: %s", revision_number, snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/api/snapshots/{snapshot_id}")
async def delete_snapshot(snapshot_id: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            deleted = await service.delete_snapshot(snapshot_id)
            if not deleted:
                _raise_not_found("Snapshot")
            return {
                "status": "success",
                "message": f"Deleted snapshot {snapshot_id}",
            }
    except ValueError as exc:
        if str(exc) == "Cannot delete a live snapshot.":
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        _translate_value_error(exc)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error deleting snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/activate")
async def activate_snapshot(snapshot_id: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            payload = await service.state_authority_activation.activate_snapshot(snapshot_id)
            if payload is None:
                _raise_not_found("Snapshot")
        from app.routes.chains import _invalidate_chain_list_cache
        _invalidate_chain_list_cache()
        return payload
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=_activation_error_detail(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error activating snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/snapshots/{snapshot_id}/publish-readiness")
async def get_snapshot_publish_readiness(snapshot_id: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            readiness = await PublishReadinessService(session).get_publish_readiness(snapshot_id)
            return readiness.model_dump(mode="json")
    except ValueError as exc:
        if "not found" in str(exc).lower():
            _raise_not_found("Snapshot")
        _translate_value_error(exc)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error building publish readiness for snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/publish-retry")
async def retry_snapshot_publish(
    snapshot_id: int,
    request: Optional[PublishRetryRequest] = Body(default=None),
) -> dict[str, Any]:
    try:
        async with get_session() as session:
            payload = await _run_publish_repair_action(
                snapshot_id=snapshot_id,
                repair_action_id="retry_publish",
                session=session,
            )
            if request is not None and request.session_id:
                payload["session_id"] = request.session_id
        from app.routes.chains import _invalidate_chain_list_cache
        _invalidate_chain_list_cache()
        return payload
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=_activation_error_detail(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error retrying publish for snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/repair/{repair_action_id}")
async def repair_snapshot_publish(
    snapshot_id: int,
    repair_action_id: str,
) -> dict[str, Any]:
    try:
        async with get_session() as session:
            payload = await _run_publish_repair_action(
                snapshot_id=snapshot_id,
                repair_action_id=repair_action_id,
                session=session,
            )
        if repair_action_id in {"retry_publish", "recover_local_audio_engine"}:
            from app.routes.chains import _invalidate_chain_list_cache
            _invalidate_chain_list_cache()
        return payload
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=_activation_error_detail(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Error running repair action %s for snapshot %s: %s",
            repair_action_id,
            snapshot_id,
            exc,
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/snapshots/{snapshot_id}/tempo")
async def get_snapshot_tempo(snapshot_id: int) -> dict[str, Any]:
    try:
        from app.services.snapshot_tempo_service import get_snapshot_tempo_service

        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.get_snapshot(snapshot_id)
            if snapshot is None:
                _raise_not_found("Snapshot")
            tempo_status = get_snapshot_tempo_service().get_status(
                snapshot_id=snapshot_id,
                stored_tempo_bpm=snapshot.get("tempo_bpm"),
                is_active=bool((snapshot.get("live_state") or {}).get("is_live")),
            )
            return {
                "status": "success",
                "snapshot_id": snapshot_id,
                "tempo": tempo_status,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting tempo status for snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/tempo/tap")
async def tap_snapshot_tempo(
    snapshot_id: int,
    request: Optional[SnapshotTempoTapRequest] = Body(default=None),
) -> dict[str, Any]:
    try:
        from app.services.snapshot_tempo_service import get_snapshot_tempo_service

        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.get_snapshot(snapshot_id)
            if snapshot is None:
                _raise_not_found("Snapshot")
            tempo_status = await get_snapshot_tempo_service().tap_tempo(
                snapshot_id,
                snapshot.get("tempo_bpm"),
                snapshot_data=service.to_legacy_snapshot_data(snapshot),
                timestamp_ms=request.timestamp_ms if request is not None else None,
            )
            refreshed_snapshot = await service.get_snapshot(snapshot_id)
            if refreshed_snapshot is None:
                _raise_not_found("Snapshot")
            return {
                "status": "success",
                "snapshot_id": snapshot_id,
                "tempo": tempo_status,
                "snapshot": refreshed_snapshot,
            }
    except ValueError as exc:
        _translate_value_error(exc)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error tapping tempo for snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/tempo/reset")
async def reset_snapshot_tempo(snapshot_id: int) -> dict[str, Any]:
    try:
        from app.services.snapshot_tempo_service import get_snapshot_tempo_service

        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.get_snapshot(snapshot_id)
            if snapshot is None:
                _raise_not_found("Snapshot")
            tempo_status = await get_snapshot_tempo_service().reset_tempo(
                snapshot_id,
                snapshot.get("tempo_bpm"),
                snapshot_data=service.to_legacy_snapshot_data(snapshot),
            )
            refreshed_snapshot = await service.get_snapshot(snapshot_id)
            if refreshed_snapshot is None:
                _raise_not_found("Snapshot")
            return {
                "status": "success",
                "snapshot_id": snapshot_id,
                "tempo": tempo_status,
                "snapshot": refreshed_snapshot,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error resetting tempo for snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/preview")
async def preview_snapshot(request: PreviewSnapshotRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            return await service.preview_snapshot(request.snapshot_data)
    except Exception as exc:
        logger.error("Error previewing snapshot: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/duplicate")
async def duplicate_snapshot(snapshot_id: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.duplicate_snapshot(snapshot_id)
            if snapshot is None:
                _raise_not_found("Snapshot")
            return {
                "status": "success",
                "snapshot_id": snapshot["id"],
                "message": f"Created copy: {snapshot['name']}",
                "snapshot": snapshot,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error duplicating snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/save-as-new")
async def save_snapshot_as_new(snapshot_id: int, request: SaveAsNewRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.save_snapshot_as_new(
                snapshot_id,
                name=request.name,
                description=request.description,
            )
            if snapshot is None:
                _raise_not_found("Snapshot")
            return {
                "status": "success",
                "snapshot_id": snapshot["id"],
                "message": f"Created snapshot: {snapshot['name']}",
                "snapshot": snapshot,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error saving snapshot %s as new: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/program")
async def set_program_number(snapshot_id: int, request: ProgramNumberRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.update_snapshot(snapshot_id, program_number=request.program_number)
            if snapshot is None:
                _raise_not_found("Snapshot")
            return {
                "status": "success",
                "snapshot_id": snapshot["id"],
                "program_number": snapshot["program_number"],
            }
    except ValueError as exc:
        _translate_value_error(exc)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error setting program number for snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/snapshots/by-program/{program_number}")
async def get_snapshot_by_program(program_number: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.get_snapshot_by_program(program_number)
            if snapshot is None:
                _raise_not_found("Snapshot")
            return snapshot
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error looking up snapshot by program %s: %s", program_number, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/snapshots/{snapshot_id}/preload-plan")
async def get_snapshot_preload_plan(snapshot_id: int, limit: int = Query(default=3, ge=1, le=10)) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            payload = await service.plan_preload_candidates_for_snapshot(snapshot_id, limit=limit)
            if payload is None:
                _raise_not_found("Snapshot")
            return payload
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error building preload plan for snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/program-change/{program_number}/activate")
async def activate_snapshot_by_program(program_number: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            summary = await service.get_snapshot_by_program(program_number)
            if summary is None:
                _raise_not_found("Snapshot")
            payload = await service.state_authority_activation.activate_snapshot(
                summary["id"],
                triggered_by="midi_pc",
            )
            if payload is None:
                _raise_not_found("Snapshot")
        from app.routes.chains import _invalidate_chain_list_cache
        _invalidate_chain_list_cache()
        return payload
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=_activation_error_detail(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error activating snapshot for program %s: %s", program_number, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/channels")
async def add_channel(snapshot_id: int, request: SnapshotChannelInput) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.add_channel(snapshot_id, request.model_dump(exclude_none=True))
            if snapshot is None:
                _raise_not_found("Snapshot")
            return snapshot
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error adding channel to snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/api/snapshots/{snapshot_id}/channels/{channel_id}")
async def update_channel(snapshot_id: int, channel_id: int, request: SnapshotChannelInput) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.update_channel(snapshot_id, channel_id, request.model_dump(exclude_none=True))
            if snapshot is None:
                _raise_not_found("Channel")
            return snapshot
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error updating channel %s on snapshot %s: %s", channel_id, snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/api/snapshots/{snapshot_id}/channels/{channel_id}")
async def delete_channel(snapshot_id: int, channel_id: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.remove_channel(snapshot_id, channel_id)
            if snapshot is None:
                _raise_not_found("Channel")
            return snapshot
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error deleting channel %s on snapshot %s: %s", channel_id, snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/chains")
async def add_chain(snapshot_id: int, request: ChainCreateRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.create_chain(snapshot_id, request.name)
            if snapshot is None:
                _raise_not_found("Snapshot")
            return snapshot
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error adding chain to snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/api/snapshots/{snapshot_id}/chains/{chain_id}")
async def rename_chain(snapshot_id: int, chain_id: int, request: ChainRenameRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.rename_chain(snapshot_id, chain_id, request.name)
            if snapshot is None:
                _raise_not_found("Chain")
            return snapshot
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error renaming chain %s on snapshot %s: %s", chain_id, snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/chains/{chain_id}/plugins")
async def add_plugin(snapshot_id: int, chain_id: int, request: PluginCreateRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.add_plugin(
                snapshot_id,
                chain_id,
                request.plugin_uri,
                plugin_name=request.plugin_name,
                loader_state=request.loader_state,
            )
            if snapshot is None:
                _raise_not_found("Chain")
            return snapshot
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error adding plugin to chain %s on snapshot %s: %s", chain_id, snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/api/snapshots/{snapshot_id}/chains/{chain_id}/plugins/{plugin_id}")
async def remove_plugin(snapshot_id: int, chain_id: int, plugin_id: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.remove_plugin(snapshot_id, chain_id, plugin_id)
            if snapshot is None:
                _raise_not_found("Plugin")
            return snapshot
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error removing plugin %s from chain %s on snapshot %s: %s", plugin_id, chain_id, snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/chains/{chain_id}/plugins/reorder")
async def reorder_plugins(snapshot_id: int, chain_id: int, request: PluginReorderRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.reorder_plugins(snapshot_id, chain_id, request.plugin_ids)
            if snapshot is None:
                _raise_not_found("Chain")
            return snapshot
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error reordering plugins for chain %s on snapshot %s: %s", chain_id, snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/chains/{chain_id}/plugins/{plugin_id}/bypass")
async def set_plugin_bypass(snapshot_id: int, chain_id: int, plugin_id: int, request: PluginBypassRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.set_plugin_bypass(snapshot_id, chain_id, plugin_id, request.bypass)
            if snapshot is None:
                _raise_not_found("Plugin")
            return snapshot
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error setting bypass for plugin %s on snapshot %s: %s", plugin_id, snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/api/snapshots/{snapshot_id}/chains/{chain_id}/plugins/{plugin_id}/parameters")
async def set_plugin_parameters(snapshot_id: int, chain_id: int, plugin_id: int, request: PluginParametersRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.set_plugin_parameters(snapshot_id, chain_id, plugin_id, request.parameters)
            if snapshot is None:
                _raise_not_found("Plugin")
            return snapshot
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error setting parameters for plugin %s on snapshot %s: %s", plugin_id, snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/api/snapshots/{snapshot_id}/routing")
async def update_routing(snapshot_id: int, request: RoutingUpdateRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.update_routing(snapshot_id, request.model_dump(exclude_none=True))
            if snapshot is None:
                _raise_not_found("Snapshot")
            return snapshot
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error updating routing for snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/routing/morph")
async def set_morph_position(snapshot_id: int, morph_position: float = Query(..., ge=0.0, le=1.0)) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.set_morph_position(snapshot_id, morph_position)
            if snapshot is None:
                _raise_not_found("Snapshot")
            return snapshot
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error updating morph position for snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/snapshots/{snapshot_id}/midi-map")
async def get_midi_map(snapshot_id: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.get_snapshot(snapshot_id)
            if snapshot is None:
                _raise_not_found("Snapshot")
            return {
                "snapshot_id": snapshot["id"],
                "entries": snapshot.get("midi_map", []),
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting MIDI map for snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.put("/api/snapshots/{snapshot_id}/midi-map")
async def replace_midi_map(snapshot_id: int, request: MidiMapRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.replace_midi_map(snapshot_id, request.entries)
            if snapshot is None:
                _raise_not_found("Snapshot")
            return snapshot
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error replacing MIDI map for snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/snapshots/{snapshot_id}/export")
async def export_snapshot(snapshot_id: int) -> Response:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            payload = await service.export_snapshot_bundle(snapshot_id)
            if payload is None:
                _raise_not_found("Snapshot")
            return Response(
                content=payload["content"],
                media_type="application/vnd.map2.snapshot+zip",
                headers={
                    "Content-Disposition": f'attachment; filename="{payload["filename"]}"',
                },
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error exporting snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/import")
async def import_snapshot(request: Request) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            content_type = str(request.headers.get("content-type") or "").lower()
            if "multipart/form-data" in content_type:
                form = await request.form()
                upload = form.get("file")
                if upload is None or not hasattr(upload, "read"):
                    raise HTTPException(status_code=400, detail="Snapshot import requires a file upload")
                snapshot = await service.import_snapshot(await upload.read())
            elif content_type in {"application/zip", "application/octet-stream", "application/vnd.map2.snapshot+zip"}:
                snapshot = await service.import_snapshot(await request.body())
            else:
                snapshot = await service.import_snapshot(await request.json())
            return {
                "status": "success",
                "snapshot_id": snapshot["id"],
                "snapshot": snapshot,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error importing snapshot: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/templates/{template_id}/export")
async def export_template(template_id: int) -> Response:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            payload = await service.export_template_bundle(template_id)
            if payload is None:
                _raise_not_found("Template")
            return Response(
                content=payload["content"],
                media_type="application/vnd.map2.template+zip",
                headers={
                    "Content-Disposition": f'attachment; filename="{payload["filename"]}"',
                },
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error exporting template %s: %s", template_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/templates/import")
async def import_template(request: Request) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            content_type = str(request.headers.get("content-type") or "").lower()
            if "multipart/form-data" in content_type:
                form = await request.form()
                upload = form.get("file")
                if upload is None or not hasattr(upload, "read"):
                    raise HTTPException(status_code=400, detail="Template import requires a file upload")
                template = await service.import_template(await upload.read())
            elif content_type in {"application/zip", "application/octet-stream", "application/vnd.map2.template+zip"}:
                template = await service.import_template(await request.body())
            else:
                template = await service.import_template(await request.json())
            return {
                "status": "success",
                "template_id": template["id"],
                "template": template,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error importing template: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/templates/{template_id}/share")
async def share_template(template_id: int, request: CommunityShareRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            template = await service.share_template(template_id, author_name=request.author_name)
            if template is None:
                _raise_not_found("Template")
            return {
                "status": "success",
                "template": template,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error sharing template %s: %s", template_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/share")
async def share_snapshot(snapshot_id: int, request: CommunityShareRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.share_snapshot(snapshot_id, author_name=request.author_name)
            if snapshot is None:
                _raise_not_found("Snapshot")
            return {
                "status": "success",
                "snapshot": snapshot,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error sharing snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/snapshots/community")
async def browse_community_snapshots(
    query: Optional[str] = Query(default=None),
    tags: Optional[str] = Query(default=None),
    author: Optional[str] = Query(default=None),
) -> dict[str, Any]:
    try:
        query_value = query if isinstance(query, str) else None
        tags_value = tags if isinstance(tags, str) else None
        author_value = author if isinstance(author, str) else None
        tag_list = [item.strip() for item in (tags_value or "").split(",") if item.strip()]
        async with get_session() as session:
            service = SnapshotService(session)
            snapshots = await service.browse_community_snapshots(query=query_value, tags=tag_list, author=author_value)
            return {
                "snapshots": snapshots,
                "count": len(snapshots),
            }
    except Exception as exc:
        logger.error("Error browsing community snapshots: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/community/{community_uuid}/rate")
async def rate_community_snapshot(community_uuid: str, request: CommunityRateRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.rate_community_snapshot(community_uuid, request.rating)
            if snapshot is None:
                _raise_not_found("Community snapshot")
            return {
                "status": "success",
                "snapshot": snapshot,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error rating community snapshot %s: %s", community_uuid, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/community/{community_uuid}/download")
async def download_community_snapshot(community_uuid: str) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            payload = await service.record_community_download(community_uuid)
            if payload is None:
                _raise_not_found("Community snapshot")
            return payload
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error downloading community snapshot %s: %s", community_uuid, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
