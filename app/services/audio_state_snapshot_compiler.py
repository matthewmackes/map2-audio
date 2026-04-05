from __future__ import annotations

import copy
from datetime import datetime, timezone
from typing import Any

from app.models.audio_state import (
    AudioStateClusterStatus,
    AudioStateDerivedStatus,
    AudioStateEngineSummary,
    AudioStateObservedIOSummary,
    AudioStatePathRecord,
    AudioStatePathStatus,
    AudioStateRouting,
    AudioStateDeployment,
    AudioStateDesiredIO,
    AudioStateSnapshotRef,
    AuthoritativeAudioState,
    CompiledSnapshotIntent,
)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _normalize_extensions(extensions: dict[str, Any] | None) -> dict[str, Any]:
    return copy.deepcopy(extensions) if isinstance(extensions, dict) else {}


def _merge_extension_value(existing: Any, incoming: Any) -> Any:
    if isinstance(existing, dict) and isinstance(incoming, dict):
        merged = copy.deepcopy(existing)
        for key, value in incoming.items():
            if key in merged:
                merged[key] = _merge_extension_value(merged[key], value)
            else:
                merged[key] = copy.deepcopy(value)
        return merged
    return copy.deepcopy(incoming)


def merge_audio_state_extensions(*extension_sets: dict[str, Any] | None) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for extension_set in extension_sets:
        if not isinstance(extension_set, dict):
            continue
        merged = _merge_extension_value(merged, extension_set)
    return merged


def _coerce_snapshot_paths(detail: dict[str, Any]) -> list[dict[str, Any]]:
    paths = detail.get("paths")
    if isinstance(paths, list) and paths:
        return [path for path in paths if isinstance(path, dict)]

    channels = detail.get("channels")
    if not isinstance(channels, list):
        return []

    normalized_paths: list[dict[str, Any]] = []
    for index, channel in enumerate(channels):
        if not isinstance(channel, dict):
            continue
        channel_key = str(channel.get("channel_key") or f"ch_{index}")
        normalized_paths.append(
            {
                "id": channel_key,
                "label": channel.get("label") or channel_key,
                "color": channel.get("color"),
                "snapshot_chain_id": channel.get("chain_id"),
            }
        )
    return normalized_paths


def compile_snapshot_detail_to_intent(
    detail: dict[str, Any],
    *,
    extensions: dict[str, Any] | None = None,
) -> CompiledSnapshotIntent:
    compiled_at = _utcnow_iso()
    snapshot_id = int(detail["id"])
    snapshot_revision_id = detail.get("revision_number")
    deployments = detail.get("deployments") if isinstance(detail.get("deployments"), list) else []
    preferred_nodes = [
        str(item.get("primary_node_id")).strip()
        for item in deployments
        if isinstance(item, dict) and str(item.get("primary_node_id") or "").strip()
    ]
    placement_mode = "cluster_deployed" if preferred_nodes else "local_only"
    paths = _coerce_snapshot_paths(detail)
    routing = detail.get("routing") if isinstance(detail.get("routing"), dict) else {}
    active_path = routing.get("active_channel_key")
    series_order = routing.get("series_order") if isinstance(routing.get("series_order"), list) else []

    return CompiledSnapshotIntent(
        snapshot_id=snapshot_id,
        snapshot_revision_id=snapshot_revision_id if isinstance(snapshot_revision_id, int) else None,
        compiled_at=compiled_at,
        intent_version=1,
        io=AudioStateDesiredIO(
            requested_input_device=(detail.get("io_bindings") or {}).get("input_device") if isinstance(detail.get("io_bindings"), dict) else detail.get("input_device"),
            requested_output_device=(detail.get("io_bindings") or {}).get("output_device") if isinstance(detail.get("io_bindings"), dict) else detail.get("output_device"),
            monitoring_output_index=(
                (detail.get("controls") or {}).get("monitoring_output_index")
                if isinstance(detail.get("controls"), dict)
                else None
            ),
        ),
        routing=AudioStateRouting(
            mode=str(routing.get("mode") or "series"),
            active_path_ids=[str(active_path)] if active_path else [],
            path_order=[str(item) for item in series_order if str(item).strip()] or [str(path.get("id")) for path in paths if str(path.get("id") or "").strip()],
            morph_position=(
                float(routing.get("morph_position"))
                if isinstance(routing.get("morph_position"), (int, float))
                else None
            ),
            morph_source_path_id=(
                str(routing.get("morph_source_channel_key")).strip()
                if str(routing.get("morph_source_channel_key") or "").strip()
                else None
            ),
            morph_target_path_id=(
                str(routing.get("morph_target_channel_key")).strip()
                if str(routing.get("morph_target_channel_key") or "").strip()
                else None
            ),
        ),
        deployment=AudioStateDeployment(
            placement_mode=placement_mode,
            preferred_nodes=preferred_nodes,
        ),
        chains=[chain for chain in detail.get("chains", []) if isinstance(chain, dict)],
        extensions=_normalize_extensions(extensions),
    )


def build_initial_authoritative_audio_state(
    detail: dict[str, Any],
    *,
    origin_node_id: str,
    state_version: int,
    leader_epoch: int,
    extensions: dict[str, Any] | None = None,
) -> AuthoritativeAudioState:
    merged_extensions = _normalize_extensions(extensions)
    intent = compile_snapshot_detail_to_intent(detail, extensions=merged_extensions)
    paths = _coerce_snapshot_paths(detail)
    path_records = [
        AudioStatePathRecord(
            path_id=str(path.get("id") or ""),
            label=str(path.get("label") or path.get("id") or "Path"),
            snapshot_chain_id=path.get("snapshot_chain_id") if isinstance(path.get("snapshot_chain_id"), int) else None,
            runtime_chain_id=None,
            owner_node_id=origin_node_id,
            status=AudioStatePathStatus.PENDING,
            status_reason="Awaiting node observation after desired-state publish",
        )
        for path in paths
        if str(path.get("id") or "").strip()
    ]
    total_count = len(path_records)
    return AuthoritativeAudioState(
        state_version=state_version,
        leader_epoch=leader_epoch,
        committed_at=_utcnow_iso(),
        origin_node_id=origin_node_id,
        source_snapshot=AudioStateSnapshotRef(
            snapshot_id=int(detail["id"]),
            snapshot_revision_id=detail.get("revision_number") if isinstance(detail.get("revision_number"), int) else None,
            name=str(detail.get("name") or f"Snapshot {detail['id']}"),
        ),
        desired=intent,
        observed_summary=AudioStateObservedIOSummary(),
        cluster=AudioStateClusterStatus(sync_status="pending_apply", applied_node_ids=[], degraded_node_ids=[]),
        engine=AudioStateEngineSummary(display_state="stopped", is_warning=False, is_offline=False),
        paths=path_records,
        derived=AudioStateDerivedStatus(
            active_channel_count=0,
            total_channel_count=total_count,
            inactive_messages=[f"Channel {path.label} pending apply." for path in path_records],
        ),
        extensions=merged_extensions,
    )
