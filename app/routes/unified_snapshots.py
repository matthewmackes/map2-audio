"""
Unified snapshot API routes.

Primary surface:
- /api/snapshots/*

Compatibility surface during cutover:
- /api/flow-snapshots/*
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel, Field

from app.database import Snapshot, get_session
from app.services.snapshot_service import SnapshotService, UNSET

logger = logging.getLogger(__name__)
router = APIRouter(tags=["snapshots"])


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


class SnapshotCreateRequest(BaseModel):
    name: str
    description: str = ""
    tags: list[str] = Field(default_factory=list)
    program_number: Optional[int] = None
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
    display_order: Optional[int] = None
    is_favorite: Optional[bool] = None
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


def _detail_payload_from_request(request: SnapshotCreateRequest | SnapshotUpdateRequest) -> Any:
    if request.snapshot_data is not None:
        return request.snapshot_data

    if isinstance(request, SnapshotUpdateRequest):
        if request.channels is None and request.chains is None and request.routing is None and request.midi_map is None:
            return UNSET

    return {
        "channels": [item.model_dump(exclude_none=True) for item in (request.channels or [])],
        "chains": [item.model_dump(exclude_none=True) for item in (request.chains or [])],
        "routing": request.routing.model_dump(exclude_none=True) if request.routing is not None else {},
        "midi_map": list(request.midi_map or []),
    }


def _raise_not_found(entity: str) -> None:
    raise HTTPException(status_code=404, detail=f"{entity} not found")


def _translate_value_error(exc: ValueError) -> None:
    raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/snapshots")
@router.get("/api/flow-snapshots")
async def list_snapshots() -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshots = await service.list_snapshots()
            active_id = next((item["id"] for item in snapshots if item.get("is_active")), None)
            return {
                "snapshots": snapshots,
                "count": len(snapshots),
                "active_id": active_id,
            }
    except Exception as exc:
        logger.error("Error listing snapshots: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/snapshots/{snapshot_id}")
@router.get("/api/flow-snapshots/{snapshot_id}")
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


@router.post("/api/snapshots")
@router.post("/api/flow-snapshots")
async def create_snapshot(request: SnapshotCreateRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.create_snapshot(
                name=request.name,
                description=request.description,
                tags=request.tags,
                program_number=request.program_number,
                detail_payload=_detail_payload_from_request(request),
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
@router.patch("/api/flow-snapshots/{snapshot_id}")
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
                is_favorite=request.is_favorite if "is_favorite" in provided else UNSET,
                display_order=request.display_order if "display_order" in provided else UNSET,
                detail_payload=detail_payload,
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


@router.delete("/api/snapshots/{snapshot_id}")
@router.delete("/api/flow-snapshots/{snapshot_id}")
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
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error deleting snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/activate")
@router.post("/api/flow-snapshots/{snapshot_id}/load")
async def activate_snapshot(snapshot_id: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            payload = await service.activate_snapshot(snapshot_id)
            if payload is None:
                _raise_not_found("Snapshot")
            return payload
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error activating snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/preview")
@router.post("/api/flow-snapshots/preview")
async def preview_snapshot(request: PreviewSnapshotRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            return await service.preview_snapshot(request.snapshot_data)
    except Exception as exc:
        logger.error("Error previewing snapshot: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/{snapshot_id}/duplicate")
@router.post("/api/flow-snapshots/{snapshot_id}/duplicate")
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


@router.post("/api/flow-snapshots/{snapshot_id}/program")
async def set_program_number_compat(snapshot_id: int, request: ProgramNumberRequest) -> dict[str, Any]:
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


@router.post("/api/flow-snapshots/reorder")
async def reorder_snapshots(snapshot_ids: list[int] = Body(...)) -> dict[str, Any]:
    try:
        async with get_session() as session:
            for order, snapshot_id in enumerate(snapshot_ids):
                result = await session.execute(
                    select(Snapshot).where(Snapshot.id == snapshot_id)
                )
                snapshot = result.scalar_one_or_none()
                if snapshot is None:
                    continue
                snapshot.display_order = order
            return {"status": "success", "message": "Reordered snapshots"}
    except Exception as exc:
        logger.error("Error reordering snapshots: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/snapshots/by-program/{program_number}")
@router.get("/api/flow-snapshots/by-program/{program_number}")
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


@router.post("/api/snapshots/program-change/{program_number}/activate")
async def activate_snapshot_by_program(program_number: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            summary = await service.get_snapshot_by_program(program_number)
            if summary is None:
                _raise_not_found("Snapshot")
            payload = await service.activate_snapshot(summary["id"], triggered_by="midi_pc")
            if payload is None:
                _raise_not_found("Snapshot")
            return payload
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
async def export_snapshot(snapshot_id: int) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            payload = await service.export_snapshot(snapshot_id)
            if payload is None:
                _raise_not_found("Snapshot")
            return payload
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error exporting snapshot %s: %s", snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/snapshots/import")
async def import_snapshot(request: dict[str, Any] = Body(...)) -> dict[str, Any]:
    try:
        async with get_session() as session:
            service = SnapshotService(session)
            snapshot = await service.import_snapshot(request)
            return {
                "status": "success",
                "snapshot_id": snapshot["id"],
                "snapshot": snapshot,
            }
    except Exception as exc:
        logger.error("Error importing snapshot: %s", exc)
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
