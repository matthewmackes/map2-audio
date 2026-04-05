"""
Performance Brain API routes.

The routed workspace and compact plugin surface both use this typed contract.
Legacy drum and sampler routes stay live during the shadow migration phase.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.services.drum_kit_service import get_drum_kit_service
from app.services.drum_machine_service import get_drum_machine_service
from app.services.drum_sequencer_service import get_drum_sequencer_service
from app.services.juce_engine_service import get_audio_engine
from app.services.performance_brain_authority_sync import PerformanceBrainAuthoritySyncService
from app.services.performance_brain_service import (
    BrainInputsStateModel,
    BrainInputsUpdateModel,
    BrainLayersUpdateModel,
    BrainLibraryStateModel,
    BrainMixerStateModel,
    BrainMixerUpdateModel,
    BrainSampleEditorStateModel,
    BrainSampleEditorUpdateModel,
    BrainSequenceModel,
    BrainSequenceUpdateModel,
    BrainSlotModel,
    BrainSlotUpdateModel,
    BrainSongStateModel,
    BrainSongUpdateModel,
    BrainStateModel,
    BrainStateUpdateModel,
    BrainTransportStateModel,
    BrainTransportUpdateModel,
    BrainDiagnosticsModel,
    BRAIN_RUNTIME_TOPIC,
    BrainRuntimeResource,
    get_performance_brain_service,
)
from app.services.websocket_manager import ws_manager


router = APIRouter()
logger = logging.getLogger(__name__)


def _service():
    return get_performance_brain_service()


def _brain_authority_service() -> PerformanceBrainAuthoritySyncService:
    return PerformanceBrainAuthoritySyncService()


async def _restore_authority_projection(
    *,
    instance_id: str | None = None,
    plugin_position: int | None = None,
) -> None:
    try:
        await _brain_authority_service().restore_instance(
            instance_id=instance_id,
            plugin_position=plugin_position,
        )
    except Exception as exc:
        logger.warning("Performance Brain authority restore failed for %s/%s: %s", instance_id, plugin_position, exc)


def _restore_authority_projection_blocking(
    *,
    instance_id: str | None = None,
    plugin_position: int | None = None,
) -> None:
    asyncio.run(
        _restore_authority_projection(
            instance_id=instance_id,
            plugin_position=plugin_position,
        )
    )


async def _sync_authority_projection(
    *,
    instance_id: str | None = None,
    plugin_position: int | None = None,
    triggered_by: str = "brain-route",
) -> None:
    try:
        await _brain_authority_service().sync_instance(
            instance_id=instance_id,
            plugin_position=plugin_position,
            triggered_by=triggered_by,
        )
    except Exception as exc:
        logger.warning("Performance Brain authority sync failed for %s/%s: %s", instance_id, plugin_position, exc)


def _sync_authority_projection_blocking(
    *,
    instance_id: str | None = None,
    plugin_position: int | None = None,
    triggered_by: str = "brain-route",
) -> None:
    asyncio.run(
        _sync_authority_projection(
            instance_id=instance_id,
            plugin_position=plugin_position,
            triggered_by=triggered_by,
        )
    )


async def _broadcast_runtime_update(
    resource: BrainRuntimeResource,
    *,
    instance_id: str | None = None,
    plugin_position: int | None = None,
) -> None:
    try:
        payload = _service().get_runtime_event(
            resource,
            instance_id=instance_id,
            plugin_position=plugin_position,
        )
        await ws_manager.broadcast_json(
            {
                "type": "brain_runtime_update",
                "topic": BRAIN_RUNTIME_TOPIC,
                "data": payload,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            topic=BRAIN_RUNTIME_TOPIC,
        )
    except Exception as exc:
        logger.debug("Performance Brain runtime broadcast failed: %s", exc)


def _publish_runtime_update(
    resource: BrainRuntimeResource,
    *,
    instance_id: str | None = None,
    plugin_position: int | None = None,
) -> None:
    asyncio.run(
        _broadcast_runtime_update(
            resource,
            instance_id=instance_id,
            plugin_position=plugin_position,
        )
    )


def _collect_drum_import_pattern_ids(
    *,
    drum_state: dict[str, Any],
    song: list[dict[str, Any]],
    song_transport: dict[str, Any],
) -> list[int]:
    pattern_ids: set[int] = set()
    for value in (
        drum_state.get("pattern"),
        song_transport.get("active_pattern"),
        song_transport.get("pending_pattern"),
    ):
        if value is None:
            continue
        pattern_id = int(value)
        if pattern_id >= 0:
            pattern_ids.add(pattern_id)
    for entry in song:
        value = entry.get("pattern_id", entry.get("pattern"))
        if value is None:
            continue
        pattern_id = int(value)
        if pattern_id >= 0:
            pattern_ids.add(pattern_id)
    return sorted(pattern_ids)


@router.get("/api/engine/brain/state", response_model=BrainStateModel)
def get_brain_state(
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    return _service().get_state(instance_id=instance_id, plugin_position=plugin_position)


@router.post("/api/engine/brain/state", response_model=BrainStateModel)
def update_brain_state(
    patch: BrainStateUpdateModel,
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    state = _service().update_state(patch, instance_id=instance_id, plugin_position=plugin_position)
    _sync_authority_projection_blocking(
        instance_id=instance_id,
        plugin_position=plugin_position,
        triggered_by="brain-route:state",
    )
    _publish_runtime_update("state", instance_id=instance_id, plugin_position=plugin_position)
    return state


@router.get("/api/engine/brain/transport", response_model=BrainTransportStateModel)
def get_brain_transport(
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    return _service().get_transport(instance_id=instance_id, plugin_position=plugin_position)


@router.post("/api/engine/brain/transport", response_model=BrainTransportStateModel)
def update_brain_transport(
    patch: BrainTransportUpdateModel,
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    transport = _service().update_transport(patch, instance_id=instance_id, plugin_position=plugin_position)
    _sync_authority_projection_blocking(
        instance_id=instance_id,
        plugin_position=plugin_position,
        triggered_by="brain-route:transport",
    )
    _publish_runtime_update("transport", instance_id=instance_id, plugin_position=plugin_position)
    return transport


@router.get("/api/engine/brain/slots", response_model=list[BrainSlotModel])
def list_brain_slots(
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> list[dict[str, Any]]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    return _service().get_slots(instance_id=instance_id, plugin_position=plugin_position)


@router.patch("/api/engine/brain/slots/{slot_id}", response_model=BrainSlotModel)
def update_brain_slot(
    slot_id: int,
    patch: BrainSlotUpdateModel,
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    if slot_id < 0 or slot_id > 15:
        raise HTTPException(status_code=400, detail="slot_id must be in range 0..15")
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    slot = _service().update_slot(
        slot_id,
        patch,
        instance_id=instance_id,
        plugin_position=plugin_position,
    )
    _sync_authority_projection_blocking(
        instance_id=instance_id,
        plugin_position=plugin_position,
        triggered_by="brain-route:slot",
    )
    _publish_runtime_update("slot", instance_id=instance_id, plugin_position=plugin_position)
    return slot


@router.get("/api/engine/brain/layers")
def get_brain_layers(
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    return _service().get_layers(instance_id=instance_id, plugin_position=plugin_position)


@router.post("/api/engine/brain/layers")
def update_brain_layers(
    patch: BrainLayersUpdateModel,
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    layers = _service().update_layers(patch, instance_id=instance_id, plugin_position=plugin_position)
    _sync_authority_projection_blocking(
        instance_id=instance_id,
        plugin_position=plugin_position,
        triggered_by="brain-route:layers",
    )
    _publish_runtime_update("layers", instance_id=instance_id, plugin_position=plugin_position)
    return layers


@router.get("/api/engine/brain/sequence", response_model=BrainSequenceModel)
def get_brain_sequence(
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    return _service().get_sequence(instance_id=instance_id, plugin_position=plugin_position)


@router.post("/api/engine/brain/sequence", response_model=BrainSequenceModel)
def update_brain_sequence(
    patch: BrainSequenceUpdateModel,
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    sequence = _service().update_sequence(patch, instance_id=instance_id, plugin_position=plugin_position)
    _sync_authority_projection_blocking(
        instance_id=instance_id,
        plugin_position=plugin_position,
        triggered_by="brain-route:sequence",
    )
    _publish_runtime_update("sequence", instance_id=instance_id, plugin_position=plugin_position)
    return sequence


@router.get("/api/engine/brain/song", response_model=BrainSongStateModel)
def get_brain_song(
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    return _service().get_song(instance_id=instance_id, plugin_position=plugin_position)


@router.post("/api/engine/brain/song", response_model=BrainSongStateModel)
def update_brain_song(
    patch: BrainSongUpdateModel,
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    song = _service().update_song(patch, instance_id=instance_id, plugin_position=plugin_position)
    _sync_authority_projection_blocking(
        instance_id=instance_id,
        plugin_position=plugin_position,
        triggered_by="brain-route:song",
    )
    _publish_runtime_update("song", instance_id=instance_id, plugin_position=plugin_position)
    return song


@router.get("/api/engine/brain/mixer", response_model=BrainMixerStateModel)
def get_brain_mixer(
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    return _service().get_mixer(instance_id=instance_id, plugin_position=plugin_position)


@router.post("/api/engine/brain/mixer", response_model=BrainMixerStateModel)
def update_brain_mixer(
    patch: BrainMixerUpdateModel,
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    mixer = _service().update_mixer(patch, instance_id=instance_id, plugin_position=plugin_position)
    _sync_authority_projection_blocking(
        instance_id=instance_id,
        plugin_position=plugin_position,
        triggered_by="brain-route:mixer",
    )
    _publish_runtime_update("mixer", instance_id=instance_id, plugin_position=plugin_position)
    return mixer


@router.get("/api/engine/brain/inputs", response_model=BrainInputsStateModel)
def get_brain_inputs(
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    return _service().get_inputs(instance_id=instance_id, plugin_position=plugin_position)


@router.post("/api/engine/brain/inputs", response_model=BrainInputsStateModel)
def update_brain_inputs(
    patch: BrainInputsUpdateModel,
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    inputs = _service().update_inputs(patch, instance_id=instance_id, plugin_position=plugin_position)
    _sync_authority_projection_blocking(
        instance_id=instance_id,
        plugin_position=plugin_position,
        triggered_by="brain-route:inputs",
    )
    _publish_runtime_update("inputs", instance_id=instance_id, plugin_position=plugin_position)
    return inputs


@router.get("/api/engine/brain/library", response_model=BrainLibraryStateModel)
def get_brain_library(
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    return _service().get_library(instance_id=instance_id, plugin_position=plugin_position)


@router.get("/api/engine/brain/sample-editor", response_model=BrainSampleEditorStateModel)
def get_brain_sample_editor(
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
    slot_id: int | None = Query(default=None, ge=0, le=15),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    return _service().get_sample_editor(
        instance_id=instance_id,
        plugin_position=plugin_position,
        slot_id=slot_id,
    )


@router.post("/api/engine/brain/sample-editor", response_model=BrainSampleEditorStateModel)
def update_brain_sample_editor(
    patch: BrainSampleEditorUpdateModel,
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    sample_editor = _service().update_sample_editor(
        patch,
        instance_id=instance_id,
        plugin_position=plugin_position,
    )
    _sync_authority_projection_blocking(
        instance_id=instance_id,
        plugin_position=plugin_position,
        triggered_by="brain-route:sample-editor",
    )
    _publish_runtime_update("sample_editor", instance_id=instance_id, plugin_position=plugin_position)
    return sample_editor


@router.get("/api/engine/brain/diagnostics", response_model=BrainDiagnosticsModel)
def get_brain_diagnostics(
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    _restore_authority_projection_blocking(instance_id=instance_id, plugin_position=plugin_position)
    return _service().get_diagnostics(instance_id=instance_id, plugin_position=plugin_position)


@router.post("/api/engine/brain/import/drums", response_model=BrainStateModel)
def import_brain_from_drums(
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    drum_service = get_drum_machine_service()
    sequencer_service = get_drum_sequencer_service()
    kit_service = get_drum_kit_service()
    drum_state = drum_service.get_state()
    song = sequencer_service.get_song()
    song_transport = drum_service.get_song_transport()
    pattern_ids = _collect_drum_import_pattern_ids(
        drum_state=drum_state,
        song=song,
        song_transport=song_transport,
    )
    state = _service().import_from_drums(
        drum_state=drum_state,
        pad_controls=drum_service.get_pad_controls(),
        bus_mixers=drum_service.get_bus_mixers(),
        master_fx=drum_service.get_master_fx(),
        midi_mapping=drum_service.get_midi_mapping(),
        velocity_curves=drum_service.get_velocity_curves(),
        zones=drum_service.get_midi_zones(),
        active_kit=kit_service.get_active_kit(),
        song=song,
        song_loop=sequencer_service.get_song_loop(),
        song_transport=song_transport,
        midi_output_config=drum_service.get_midi_output_config(),
        patterns=[sequencer_service.get_pattern(pattern_id) for pattern_id in pattern_ids],
        instance_id=instance_id,
        plugin_position=plugin_position,
    )
    _sync_authority_projection_blocking(
        instance_id=instance_id,
        plugin_position=plugin_position,
        triggered_by="brain-route:import-drums",
    )
    _publish_runtime_update("state", instance_id=instance_id, plugin_position=plugin_position)
    return state


@router.post("/api/engine/brain/import/synthforge", response_model=BrainStateModel)
async def import_brain_from_synthforge(
    instance_id: str | None = Query(default=None),
    plugin_position: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    engine = get_audio_engine()
    try:
        parts = await engine.get_synthforge_parts_config()
        voice_metrics = await engine.get_synthforge_voice_metrics()
        sample_statuses, parameters = await asyncio.gather(
            asyncio.gather(*(engine.get_synthforge_part_sample_status(index) for index in range(16))),
            asyncio.gather(*(engine.get_synthforge_part_parameters(index) for index in range(16))),
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"SynthForge import unavailable: {exc}") from exc

    state = _service().import_from_synthforge(
        parts=list(parts),
        sample_statuses=list(sample_statuses),
        parameters=list(parameters),
        voice_metrics=dict(voice_metrics),
        instance_id=instance_id,
        plugin_position=plugin_position,
    )
    await _sync_authority_projection(
        instance_id=instance_id,
        plugin_position=plugin_position,
        triggered_by="brain-route:import-synthforge",
    )
    await _broadcast_runtime_update("state", instance_id=instance_id, plugin_position=plugin_position)
    return state
