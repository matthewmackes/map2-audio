from __future__ import annotations

import copy
from datetime import datetime, timezone
from typing import Any

from app.models.audio_state import AudioStateEnvelope, AudioStateObservation, AuthoritativeAudioState, CompiledSnapshotIntent
from app.services.audio_state_authority import AudioStateAuthorityError, AudioStateAuthorityService
from app.services.performance_brain_service import PerformanceBrainService, get_performance_brain_service
from app.services.snapshot_runtime_state_service import resolve_local_node_id

_BRAIN_EXTENSION_KEY = "performance_brain"


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _normalize_extensions(extensions: dict[str, Any] | None) -> dict[str, Any]:
    return copy.deepcopy(extensions) if isinstance(extensions, dict) else {}


def _upsert_brain_projection(extensions: dict[str, Any] | None, projection: dict[str, Any]) -> dict[str, Any]:
    next_extensions = _normalize_extensions(extensions)
    brain_extension = next_extensions.get(_BRAIN_EXTENSION_KEY)
    if not isinstance(brain_extension, dict):
        brain_extension = {}
    instances = brain_extension.get("instances")
    if not isinstance(instances, dict):
        instances = {}
    instances[projection["runtime_instance_id"]] = projection
    brain_extension["instances"] = instances
    next_extensions[_BRAIN_EXTENSION_KEY] = brain_extension
    return next_extensions


def _brain_instances_from_extensions(extensions: dict[str, Any] | None) -> dict[str, Any]:
    next_extensions = _normalize_extensions(extensions)
    brain_extension = next_extensions.get(_BRAIN_EXTENSION_KEY)
    if not isinstance(brain_extension, dict):
        return {}
    instances = brain_extension.get("instances")
    return copy.deepcopy(instances) if isinstance(instances, dict) else {}


def _projection_scope(projection: dict[str, Any]) -> tuple[str | None, int | None]:
    instance_id = projection.get("instance_id")
    plugin_position = projection.get("plugin_position")
    normalized_instance_id = None if instance_id is None else str(instance_id)
    normalized_plugin_position = plugin_position if isinstance(plugin_position, int) else None
    return normalized_instance_id, normalized_plugin_position


def build_brain_authority_projection(
    state: dict[str, Any],
    *,
    instance_id: str | int | None = None,
    plugin_position: int | None = None,
    triggered_by: str = "ui",
    synced_at_iso: str | None = None,
) -> dict[str, Any]:
    return {
        "runtime_instance_id": state["instance_id"],
        "instance_id": None if instance_id is None else str(instance_id),
        "plugin_position": plugin_position,
        "triggered_by": triggered_by,
        "synced_at_iso": synced_at_iso or _utcnow_iso(),
        "snapshot_integration": copy.deepcopy(state.get("snapshot_integration") or {}),
        "state": copy.deepcopy(state),
    }


class PerformanceBrainAuthoritySyncService:
    def __init__(
        self,
        authority_service: AudioStateAuthorityService | None = None,
        brain_service: PerformanceBrainService | None = None,
        node_id: str | None = None,
    ) -> None:
        self.authority_service = authority_service or AudioStateAuthorityService()
        self.brain_service = brain_service or get_performance_brain_service()
        self.node_id = node_id or resolve_local_node_id()

    async def sync_instance(
        self,
        *,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
        triggered_by: str = "ui",
    ) -> AudioStateEnvelope:
        committed_envelope = await self.authority_service.get_committed_state()
        try:
            desired_envelope = await self.authority_service.get_desired_state()
        except AudioStateAuthorityError as exc:
            if "No desired audio state exists" in str(exc):
                desired_envelope = None
            else:
                raise

        synced_at_iso = _utcnow_iso()
        brain_state = self.brain_service.get_state(instance_id=instance_id, plugin_position=plugin_position)
        projection = build_brain_authority_projection(
            brain_state,
            instance_id=instance_id,
            plugin_position=plugin_position,
            triggered_by=triggered_by,
            synced_at_iso=synced_at_iso,
        )

        desired_state = (desired_envelope.value if desired_envelope is not None else committed_envelope.value.desired).model_copy(deep=True)
        desired_state.extensions = _upsert_brain_projection(desired_state.extensions, projection)
        await self.authority_service.put_desired_state(desired_state)

        next_state_version = await self.authority_service.next_state_version()
        committed_state = committed_envelope.value.model_copy(deep=True)
        committed_state.state_version = next_state_version
        committed_state.committed_at = synced_at_iso
        committed_state.origin_node_id = self.node_id or committed_state.origin_node_id
        committed_state.desired = desired_state
        committed_state.extensions = _upsert_brain_projection(committed_state.extensions, projection)

        committed_result = await self.authority_service.put_committed_state(committed_state)

        observation = AudioStateObservation(
            node_id=self.node_id,
            observed_state_version=committed_result.value.state_version,
            applied=True,
            effective_input_device=committed_result.value.observed_summary.effective_input_device,
            effective_output_device=committed_result.value.observed_summary.effective_output_device,
            runtime_paths=[path.model_copy(deep=True) for path in committed_result.value.paths],
            engine=committed_result.value.engine.model_copy(deep=True),
            runtime_metrics={
                "performance_brain": {
                    "runtime_instance_id": projection["runtime_instance_id"],
                    "instance_count": len(
                        (
                            committed_result.value.extensions.get(_BRAIN_EXTENSION_KEY, {})
                            if isinstance(committed_result.value.extensions, dict)
                            else {}
                        ).get("instances", {})
                    ),
                }
            },
            observed_at=synced_at_iso,
            extensions=_normalize_extensions(committed_result.value.extensions),
        )
        await self.authority_service.put_observation(observation)
        return committed_result

    async def restore_instance(
        self,
        *,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        runtime_instance_id = self.brain_service.resolve_runtime_instance_id(
            instance_id=instance_id,
            plugin_position=plugin_position,
        )
        try:
            committed_envelope = await self.authority_service.get_committed_state()
        except AudioStateAuthorityError as exc:
            if "No committed authoritative audio state exists" in str(exc):
                return self.brain_service.get_state(instance_id=instance_id, plugin_position=plugin_position)
            raise

        projection = _brain_instances_from_extensions(committed_envelope.value.extensions).get(runtime_instance_id)
        if not isinstance(projection, dict):
            return self.brain_service.get_state(instance_id=instance_id, plugin_position=plugin_position)

        projected_state = projection.get("state")
        if not isinstance(projected_state, dict):
            return self.brain_service.get_state(instance_id=instance_id, plugin_position=plugin_position)

        return self.brain_service.replace_state(
            projected_state,
            instance_id=instance_id,
            plugin_position=plugin_position,
        )

    def reconcile_runtime_with_extensions(
        self,
        *,
        current_extensions: dict[str, Any] | None,
        next_extensions: dict[str, Any] | None,
    ) -> dict[str, Any]:
        if not isinstance(next_extensions, dict) or _BRAIN_EXTENSION_KEY not in next_extensions:
            return {
                "reconciled": False,
                "reason": "no_snapshot_brain_namespace",
                "restored": [],
                "reset": [],
            }

        current_instances = _brain_instances_from_extensions(current_extensions)
        next_instances = _brain_instances_from_extensions(next_extensions)
        restored: list[dict[str, Any]] = []
        reset: list[dict[str, Any]] = []

        for runtime_instance_id in sorted(next_instances):
            projection = next_instances.get(runtime_instance_id)
            if not isinstance(projection, dict):
                continue
            projected_state = projection.get("state")
            if not isinstance(projected_state, dict):
                continue
            instance_id, plugin_position = _projection_scope(projection)
            restored_state = self.brain_service.replace_state(
                projected_state,
                instance_id=instance_id,
                plugin_position=plugin_position,
            )
            restored.append(
                {
                    "runtime_instance_id": restored_state["instance_id"],
                    "instance_id": instance_id,
                    "plugin_position": plugin_position,
                }
            )

        for runtime_instance_id in sorted(set(current_instances) - set(next_instances)):
            projection = current_instances.get(runtime_instance_id)
            if not isinstance(projection, dict):
                continue
            instance_id, plugin_position = _projection_scope(projection)
            reset_state = self.brain_service.reset_state(
                instance_id=instance_id,
                plugin_position=plugin_position,
            )
            reset.append(
                {
                    "runtime_instance_id": reset_state["instance_id"],
                    "instance_id": instance_id,
                    "plugin_position": plugin_position,
                }
            )

        return {
            "reconciled": True,
            "reason": "snapshot_brain_namespace_applied",
            "restored": restored,
            "reset": reset,
        }
