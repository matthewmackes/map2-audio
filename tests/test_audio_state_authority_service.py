from app.models.audio_state import (
    AudioStateClusterStatus,
    AudioStateDesiredIO,
    AudioStateDeployment,
    AudioStateDerivedStatus,
    AudioStateEngineSummary,
    AudioStateObservation,
    AudioStateObservationEnvelope,
    AudioStateObservedIOSummary,
    AudioStatePathRecord,
    AudioStateRouting,
    AudioStateSnapshotRef,
    AuthoritativeAudioState,
    CompiledSnapshotIntent,
)
from app.services.audio_state_authority import AudioStateAuthorityService, AudioStateEtcdConfig


def _build_service() -> AudioStateAuthorityService:
    return AudioStateAuthorityService(
        AudioStateEtcdConfig(
            endpoints=("http://127.0.0.1:2379",),
            namespace="/map2/audio-state/v1",
            connect_timeout_s=1.0,
            request_timeout_s=1.0,
            verify_tls=True,
            observation_ttl_s=15,
        )
    )


def _build_current_state() -> AuthoritativeAudioState:
    return AuthoritativeAudioState(
        state_version=8,
        leader_epoch=2,
        committed_at="2026-04-03T12:00:00",
        origin_node_id="local-node",
        source_snapshot=AudioStateSnapshotRef(snapshot_id=42, snapshot_revision_id=7, name="Rig20260402b"),
        desired=CompiledSnapshotIntent(
            snapshot_id=42,
            snapshot_revision_id=7,
            compiled_at="2026-04-03T11:59:59",
            intent_version=1,
            io=AudioStateDesiredIO(
                requested_input_device="Stage Input",
                requested_output_device="House Left/Right",
                monitoring_output_index=None,
            ),
            routing=AudioStateRouting(
                mode="series",
                active_path_ids=["ch_a"],
                path_order=["ch_a", "ch_b"],
            ),
            deployment=AudioStateDeployment(
                placement_mode="local_only",
                preferred_nodes=[],
            ),
            chains=[],
        ),
        observed_summary=AudioStateObservedIOSummary(),
        cluster=AudioStateClusterStatus(sync_status="pending_apply", applied_node_ids=[], degraded_node_ids=[]),
        engine=AudioStateEngineSummary(display_state="stopped", is_warning=False, is_offline=False),
        paths=[
            AudioStatePathRecord(
                path_id="ch_a",
                label="A",
                snapshot_chain_id=201,
                runtime_chain_id=None,
                owner_node_id="local-node",
                status="pending",
                status_reason="Awaiting node observation after desired-state publish",
            ),
            AudioStatePathRecord(
                path_id="ch_b",
                label="B",
                snapshot_chain_id=202,
                runtime_chain_id=None,
                owner_node_id="local-node",
                status="pending",
                status_reason="Awaiting node observation after desired-state publish",
            ),
        ],
        derived=AudioStateDerivedStatus(
            active_channel_count=0,
            total_channel_count=2,
            inactive_messages=["Channel A pending apply.", "Channel B pending apply."],
        ),
    )


def _build_observation(*, path_b_status: str) -> AudioStateObservationEnvelope:
    return AudioStateObservationEnvelope(
        namespace="/map2/audio-state/v1",
        key="/map2/audio-state/v1/observed/local-node",
        revision=11,
        ttl_seconds=15,
        value=AudioStateObservation(
            node_id="local-node",
            observed_state_version=8,
            applied=True,
            effective_input_device="Rack In 1-2",
            effective_output_device="AVB 7-8",
            runtime_paths=[
                AudioStatePathRecord(
                    path_id="ch_a",
                    label="A",
                    snapshot_chain_id=201,
                    runtime_chain_id=301,
                    owner_node_id="local-node",
                    status="active",
                    status_reason=None,
                ),
                AudioStatePathRecord(
                    path_id="ch_b",
                    label="B",
                    snapshot_chain_id=202,
                    runtime_chain_id=None if path_b_status != "active" else 302,
                    owner_node_id="local-node",
                    status=path_b_status,
                    status_reason="Channel B is not loaded." if path_b_status == "not_loaded" else None,
                ),
            ],
            engine=AudioStateEngineSummary(display_state="live", is_warning=False, is_offline=False),
            runtime_metrics={},
            observed_at="2026-04-03T12:00:02",
        ),
    )


def test_merge_observations_marks_state_synced_when_expected_node_applies_cleanly() -> None:
    service = _build_service()
    merged = service._merge_observations_into_committed_state(
        _build_current_state(),
        [_build_observation(path_b_status="active")],
    )

    assert merged.cluster.sync_status == "synced"
    assert merged.cluster.applied_node_ids == ["local-node"]
    assert merged.cluster.degraded_node_ids == []
    assert merged.observed_summary.effective_input_device == "Rack In 1-2"
    assert merged.observed_summary.effective_output_device == "AVB 7-8"
    assert merged.derived.active_channel_count == 2
    assert merged.derived.inactive_messages == []
    assert [path.status for path in merged.paths] == ["active", "active"]


def test_merge_observations_marks_state_degraded_when_runtime_path_is_not_loaded() -> None:
    service = _build_service()
    merged = service._merge_observations_into_committed_state(
        _build_current_state(),
        [_build_observation(path_b_status="not_loaded")],
    )

    assert merged.cluster.sync_status == "degraded"
    assert merged.cluster.applied_node_ids == ["local-node"]
    assert merged.cluster.degraded_node_ids == ["local-node"]
    assert merged.derived.active_channel_count == 1
    assert merged.derived.inactive_messages == ["Channel B is not loaded."]
    assert [path.status for path in merged.paths] == ["active", "not_loaded"]
