from __future__ import annotations

import copy
from datetime import datetime
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
from app.utils.time import utc_now


def _utcnow_iso() -> str:
    return utc_now().isoformat()


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


def overlay_audio_state_extensions(
    base: dict[str, Any] | None,
    overlay: dict[str, Any] | None,
) -> dict[str, Any]:
    merged = merge_audio_state_extensions(base)
    if not isinstance(overlay, dict):
        return merged
    for namespace, value in overlay.items():
        merged[str(namespace)] = copy.deepcopy(value)
    return merged


def _resolve_deployment_primary_node_id(detail: dict[str, Any]) -> str | None:
    """The cluster owner that an unset (null) channel owner inherits.

    Mirrors how `compile_snapshot_detail_to_intent` derives `preferred_nodes`:
    the first deployment's `primary_node_id`. Returns `None` when no deployment
    primary is bound (local-only snapshots), in which case a null channel owner
    stays unresolved (`None`)."""
    deployments = detail.get("deployments") if isinstance(detail.get("deployments"), list) else []
    for item in deployments:
        if isinstance(item, dict):
            primary = str(item.get("primary_node_id") or "").strip()
            if primary:
                return primary
    return None


def _coerce_snapshot_paths(detail: dict[str, Any]) -> list[dict[str, Any]]:
    paths = detail.get("paths")
    if isinstance(paths, list) and paths:
        return [path for path in paths if isinstance(path, dict)]

    channels = detail.get("channels")
    if not isinstance(channels, list):
        return []

    # T2510-0 — resolve each channel's per-chain cluster owner. A null/omitted
    # `cluster_owner_node_id` inherits deployment.primary_node_id at compile time
    # (a runtime default, NOT a stored back-compat shim).
    primary_node_id = _resolve_deployment_primary_node_id(detail)

    normalized_paths: list[dict[str, Any]] = []
    for index, channel in enumerate(channels):
        if not isinstance(channel, dict):
            continue
        channel_key = str(channel.get("channel_key") or f"ch_{index}")
        explicit_owner = channel.get("cluster_owner_node_id")
        resolved_owner = (
            explicit_owner.strip()
            if isinstance(explicit_owner, str) and explicit_owner.strip()
            else primary_node_id
        )
        normalized_paths.append(
            {
                "id": channel_key,
                "label": channel.get("label") or channel_key,
                "color": channel.get("color"),
                "snapshot_chain_id": channel.get("chain_id"),
                "cluster_owner_node_id": resolved_owner,
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
    # T2506 — surface the snapshot-bound recording session, when present, so
    # the JUCE engine can install T2507 taps and the recorder service can drive
    # lifecycle. `recording` is `None` when no session is bound; both compiled
    # fields fall back to defaults in that case.
    recording_block = detail.get("recording") if isinstance(detail.get("recording"), dict) else None
    record_session_id: str | None = None
    tap_matrix: dict[str, dict[str, bool]] = {}
    if recording_block is not None:
        raw_session_id = recording_block.get("session_id")
        if isinstance(raw_session_id, str) and raw_session_id.strip():
            record_session_id = raw_session_id.strip()
        raw_matrix = recording_block.get("tap_matrix")
        if isinstance(raw_matrix, dict):
            for chain_id, taps in raw_matrix.items():
                chain_key = str(chain_id or "").strip()
                if not chain_key or not isinstance(taps, dict):
                    continue
                tap_matrix[chain_key] = {
                    "pre_fx": bool(taps.get("pre_fx", False)),
                    "post_fx": bool(taps.get("post_fx", False)),
                }

    return CompiledSnapshotIntent(
        snapshot_id=snapshot_id,
        snapshot_revision_id=snapshot_revision_id if isinstance(snapshot_revision_id, int) else None,
        compiled_at=compiled_at,
        intent_version=1,
        io=AudioStateDesiredIO(
            requested_input_device=(detail.get("io_bindings") or {}).get("input_device") if isinstance(detail.get("io_bindings"), dict) else detail.get("input_device"),
            requested_output_device=(detail.get("io_bindings") or {}).get("output_device") if isinstance(detail.get("io_bindings"), dict) else detail.get("output_device"),
            requested_input_interface_id=(
                (detail.get("io_bindings") or {}).get("input_interface_id")
                if isinstance(detail.get("io_bindings"), dict)
                else (
                    (detail.get("controls") or {}).get("input_interface_id")
                    if isinstance(detail.get("controls"), dict)
                    else None
                )
            ),
            requested_output_interface_id=(
                (detail.get("io_bindings") or {}).get("output_interface_id")
                if isinstance(detail.get("io_bindings"), dict)
                else (
                    (detail.get("controls") or {}).get("output_interface_id")
                    if isinstance(detail.get("controls"), dict)
                    else None
                )
            ),
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
        record_session_id=record_session_id,
        tap_matrix=tap_matrix,
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
