import asyncio
from datetime import timedelta
from types import SimpleNamespace

from app import database as database_module
from app.database import Snapshot, SnapshotRevision
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
from app.services.audio_state_authority import AudioStateAuthorityError
from app.services.publish_readiness_service import PublishReadinessService
from app.services.snapshot_service import SnapshotActivationPreflightError
from app.utils.time import utc_now


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'publish-readiness.db'}")


class _FakeSnapshotService:
    def __init__(self, detail, *, preflight_error=None):
        self._detail = detail
        self._preflight_error = preflight_error

    async def get_snapshot(self, snapshot_id: int):
        if self._detail and int(self._detail["id"]) == int(snapshot_id):
            return self._detail
        return None

    async def _validate_snapshot_activation_preflight(self, detail):
        if self._preflight_error is not None:
            raise self._preflight_error
        return None


class _FakeAuthorityService:
    def __init__(self, committed=None, observations=None):
        self._committed = committed
        self._observations = observations or []

    async def get_committed_state(self):
        if self._committed is None:
            raise AudioStateAuthorityError("No committed state")
        return SimpleNamespace(value=self._committed)

    async def list_observations(self, *, state_version=None):
        return SimpleNamespace(observations=list(self._observations))


class _FakeRuntimeStateService:
    def __init__(self, *, live_state=None, activation_events=None):
        self._live_state = live_state or {"state": "stopped"}
        self._activation_events = activation_events or []

    async def get_live_state(self):
        return dict(self._live_state)

    async def list_activation_events(self, *, limit=8):
        return list(self._activation_events[:limit])


def _detail(snapshot_id: int, *, revision_number: int | None = 7):
    return {
        "id": snapshot_id,
        "name": f"Snapshot {snapshot_id}",
        "revision_number": revision_number,
        "controls": {"monitoring_output_index": 2},
        "routing": {"mode": "series", "series_order": ["ch_a", "ch_b"]},
        "paths": [
            {"id": "ch_a", "label": "A"},
            {"id": "ch_b", "label": "B"},
        ],
        "chains": [],
    }


def _committed_state(
    snapshot_id: int,
    *,
    revision_number: int = 7,
    sync_status: str = "synced",
    path_status: str = "active",
    preferred_nodes: list[str] | None = None,
    engine_state: str = "live",
):
    resolved_preferred_nodes = preferred_nodes or ["node-local", "rack-2"]
    return AuthoritativeAudioState(
        state_version=12,
        leader_epoch=3,
        committed_at=utc_now().isoformat(),
        origin_node_id="node-local",
        source_snapshot=AudioStateSnapshotRef(
            snapshot_id=snapshot_id,
            snapshot_revision_id=revision_number,
            name=f"Snapshot {snapshot_id}",
        ),
        desired=CompiledSnapshotIntent(
            snapshot_id=snapshot_id,
            snapshot_revision_id=revision_number,
            compiled_at=utc_now().isoformat(),
            io=AudioStateDesiredIO(requested_input_device="In", requested_output_device="Out", monitoring_output_index=2),
            routing=AudioStateRouting(mode="series", active_path_ids=["ch_a"], path_order=["ch_a", "ch_b"]),
            deployment=AudioStateDeployment(
                placement_mode="cluster_deployed" if resolved_preferred_nodes else "local_only",
                preferred_nodes=resolved_preferred_nodes,
            ),
            chains=[],
        ),
        observed_summary=AudioStateObservedIOSummary(effective_input_device="In", effective_output_device="Out"),
        cluster=AudioStateClusterStatus(
            sync_status=sync_status,
            applied_node_ids=resolved_preferred_nodes if sync_status == "synced" else ["node-local"],
            degraded_node_ids=[],
        ),
        engine=AudioStateEngineSummary(display_state=engine_state, is_warning=False, is_offline=engine_state == "offline"),
        paths=[
            AudioStatePathRecord(
                path_id="ch_a",
                label="A",
                owner_node_id="node-local",
                status=path_status,
                status_reason=None if path_status == "active" else "Channel A did not confirm.",
            ),
            AudioStatePathRecord(
                path_id="ch_b",
                label="B",
                owner_node_id="rack-2",
                status=path_status,
                status_reason=None if path_status == "active" else "Channel B did not confirm.",
            ),
        ],
        derived=AudioStateDerivedStatus(
            active_channel_count=2 if path_status == "active" else 0,
            total_channel_count=2,
            inactive_messages=[] if path_status == "active" else ["Channel A did not confirm.", "Channel B did not confirm."],
        ),
    )


def _observation(node_id: str, *, state_version: int = 12):
    return AudioStateObservationEnvelope(
        namespace="/map2/audio-state/v1",
        key=f"/map2/audio-state/v1/observed/{node_id}",
        revision=9,
        ttl_seconds=15,
        value=AudioStateObservation(
            node_id=node_id,
            observed_state_version=state_version,
            applied=True,
            effective_input_device="In",
            effective_output_device="Out",
            runtime_paths=[
                AudioStatePathRecord(path_id="ch_a", label="A", owner_node_id=node_id, status="active"),
                AudioStatePathRecord(path_id="ch_b", label="B", owner_node_id=node_id, status="active"),
            ],
            engine=AudioStateEngineSummary(display_state="live", is_warning=False, is_offline=False),
            runtime_metrics={},
            observed_at=utc_now().isoformat(),
        ),
    )


def test_publish_readiness_service_reports_live_confirmed_happy_path(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=11, name="Snapshot 11"))
            session.add(
                SnapshotRevision(
                    snapshot_id=11,
                    revision_number=7,
                    snapshot_revision="rev-11",
                    summary="summary",
                    summary_metadata={},
                    payload={},
                    document={},
                )
            )
            await session.flush()
            service = PublishReadinessService(
                session,
                snapshot_service=_FakeSnapshotService(_detail(11)),
                authority_service=_FakeAuthorityService(
                    _committed_state(11),
                    [_observation("node-local"), _observation("rack-2")],
                ),
                runtime_state_service=_FakeRuntimeStateService(live_state={"state": "live", "snapshot_id": 11}),
            )
            return await service.get_publish_readiness(11)

    readiness = asyncio.run(_run())

    assert readiness.status.value == "live_confirmed"
    assert readiness.draft_revision_id is not None
    assert readiness.requested_revision_id == 7
    assert readiness.confirmed_revision_id == 7
    assert readiness.blockers == []
    assert readiness.warnings == []


def test_publish_readiness_service_keeps_local_publish_confirmed_after_observation_lease_expires(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=19, name="Snapshot 19"))
            session.add(
                SnapshotRevision(
                    snapshot_id=19,
                    revision_number=9,
                    snapshot_revision="rev-19",
                    summary="summary",
                    summary_metadata={},
                    payload={},
                    document={},
                )
            )
            await session.flush()
            service = PublishReadinessService(
                session,
                snapshot_service=_FakeSnapshotService(_detail(19, revision_number=9)),
                authority_service=_FakeAuthorityService(
                    _committed_state(19, revision_number=9, preferred_nodes=["node-local"]),
                    [],
                ),
                runtime_state_service=_FakeRuntimeStateService(
                    live_state={"state": "live", "snapshot_id": 19, "node_id": "node-local"},
                    activation_events=[
                        {
                            "snapshot_id": 19,
                            "outcome": "success",
                            "confirmed_live_at": utc_now().isoformat(),
                            "runtime_metrics": {
                                "authority_publication": {
                                    "status": "confirmed",
                                }
                            },
                        }
                    ],
                ),
            )
            return await service.get_publish_readiness(19)

    readiness = asyncio.run(_run())

    assert readiness.status.value == "live_confirmed"
    assert readiness.requested_revision_id == 9
    assert readiness.confirmed_revision_id == 9
    assert readiness.blockers == []
    assert readiness.warnings == []


def test_publish_readiness_service_maps_preflight_issues_to_typed_blockers(tmp_path):
    _init_temp_db(tmp_path)
    preflight_error = SnapshotActivationPreflightError(
        ["Cannot go live: Channel A - plugin IR Loader is not installed on this node."],
        issues=[
            {
                "code": "missing_plugin",
                "channel_label": "A",
                "plugin_name": "IR Loader",
                "plugin_uri": "plugin://ir-loader",
                "message": "Cannot go live: Channel A - plugin IR Loader is not installed on this node.",
            }
        ],
        repair_actions=[
            {
                "action": "install_plugin",
                "message": "Install or redeploy plugin IR Loader on this node.",
                "channel_label": "A",
            }
        ],
    )

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=12, name="Snapshot 12"))
            await session.flush()
            service = PublishReadinessService(
                session,
                snapshot_service=_FakeSnapshotService(_detail(12, revision_number=None), preflight_error=preflight_error),
                authority_service=_FakeAuthorityService(None, []),
                runtime_state_service=_FakeRuntimeStateService(),
            )
            return await service.get_publish_readiness(12)

    readiness = asyncio.run(_run())

    assert readiness.status.value == "blocked"
    assert {blocker.code.value for blocker in readiness.blockers} == {"plugin_missing", "unsaved_draft"}
    assert readiness.available_repairs[0].id == "install_plugin"
    plugins_requirement = next(item for item in readiness.requirements if item.id == "plugins_installed")
    assert plugins_requirement.status.value == "needs_attention"


def test_publish_readiness_service_does_not_show_confirmation_waiting_when_draft_revision_is_missing(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=18, name="Snapshot 18"))
            await session.flush()
            service = PublishReadinessService(
                session,
                snapshot_service=_FakeSnapshotService(_detail(18, revision_number=None)),
                authority_service=_FakeAuthorityService(
                    _committed_state(18, revision_number=7, preferred_nodes=["node-local"], sync_status="pending_apply"),
                    [],
                ),
                runtime_state_service=_FakeRuntimeStateService(
                    activation_events=[
                        {
                            "snapshot_id": 18,
                            "requested_at": (utc_now() - timedelta(seconds=20)).isoformat(),
                            "runtime_metrics": {
                                "activation_progress": {
                                    "current_phase": "APPLYING",
                                }
                            },
                        }
                    ]
                ),
            )
            return await service.get_publish_readiness(18)

    readiness = asyncio.run(_run())

    assert readiness.status.value == "blocked"
    assert {blocker.code.value for blocker in readiness.blockers} == {"unsaved_draft"}
    assert readiness.requested_revision_id is None
    assert readiness.confirmed_revision_id is None
    assert readiness.warnings == []
    target_requirement = next(item for item in readiness.requirements if item.id == "target_node_reachable")
    assert target_requirement.label == "Local runtime is responding"
    assert target_requirement.status.value == "ready"
    assert target_requirement.operator_message == "The local runtime on this machine is responding."


def test_publish_readiness_service_escalates_missing_node_observation_to_stale_blocker(tmp_path):
    _init_temp_db(tmp_path)
    requested_at = (utc_now() - timedelta(seconds=5)).isoformat()

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=13, name="Snapshot 13"))
            session.add(
                SnapshotRevision(
                    snapshot_id=13,
                    revision_number=3,
                    snapshot_revision="rev-13",
                    summary="summary",
                    summary_metadata={},
                    payload={},
                    document={},
                )
            )
            await session.flush()
            service = PublishReadinessService(
                session,
                snapshot_service=_FakeSnapshotService(_detail(13, revision_number=3)),
                authority_service=_FakeAuthorityService(_committed_state(13, revision_number=3, sync_status="partial_apply"), [_observation("node-local")]),
                runtime_state_service=_FakeRuntimeStateService(
                    activation_events=[
                        {
                            "snapshot_id": 13,
                            "requested_at": requested_at,
                            "runtime_metrics": {
                                "activation_progress": {
                                    "current_phase": "APPLYING",
                                }
                            },
                        }
                    ]
                ),
            )
            return await service.get_publish_readiness(13)

    readiness = asyncio.run(_run())

    assert readiness.status.value == "blocked"
    stale = next(blocker for blocker in readiness.blockers if blocker.code.value == "observation_stale")
    assert stale.related_node_ids == ["rack-2"]
    assert any(repair.id == "retry_publish" for repair in readiness.available_repairs)


def test_publish_readiness_service_marks_diverged_when_runtime_disagrees_with_authority(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=14, name="Snapshot 14"))
            session.add(
                SnapshotRevision(
                    snapshot_id=14,
                    revision_number=4,
                    snapshot_revision="rev-14",
                    summary="summary",
                    summary_metadata={},
                    payload={},
                    document={},
                )
            )
            await session.flush()
            service = PublishReadinessService(
                session,
                snapshot_service=_FakeSnapshotService(_detail(14, revision_number=4)),
                authority_service=_FakeAuthorityService(_committed_state(14, revision_number=4), [_observation("node-local"), _observation("rack-2")]),
                runtime_state_service=_FakeRuntimeStateService(live_state={"state": "live", "snapshot_id": 99}),
            )
            return await service.get_publish_readiness(14)

    readiness = asyncio.run(_run())

    assert readiness.status.value == "diverged"
    assert any(blocker.code.value == "authority_diverged" for blocker in readiness.blockers)


def test_publish_readiness_service_clarifies_local_only_runtime_blockers(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=15, name="Snapshot 15"))
            session.add(
                SnapshotRevision(
                    snapshot_id=15,
                    revision_number=5,
                    snapshot_revision="rev-15",
                    summary="summary",
                    summary_metadata={},
                    payload={},
                    document={},
                )
            )
            await session.flush()
            service = PublishReadinessService(
                session,
                snapshot_service=_FakeSnapshotService(_detail(15, revision_number=5)),
                authority_service=_FakeAuthorityService(
                    _committed_state(
                        15,
                        revision_number=5,
                        preferred_nodes=["node-local"],
                        engine_state="stopped",
                    ),
                    [_observation("node-local")],
                ),
                runtime_state_service=_FakeRuntimeStateService(live_state={"state": "stopped"}),
            )
            return await service.get_publish_readiness(15)

    readiness = asyncio.run(_run())

    assert readiness.status.value == "blocked"
    network_requirement = next(item for item in readiness.requirements if item.id == "network_routing")
    target_requirement = next(item for item in readiness.requirements if item.id == "target_node_reachable")
    engine_requirement = next(item for item in readiness.requirements if item.id == "engine_accepted_publish")
    channels_requirement = next(item for item in readiness.requirements if item.id == "channels_confirmed_live")
    runtime_blocker = next(blocker for blocker in readiness.blockers if blocker.code.value == "engine_unavailable")

    assert network_requirement.status.value == "not_applicable"
    assert network_requirement.operator_message == "This snapshot stays on the local node on this machine. No remote-node routing is required."
    assert target_requirement.label == "Local runtime is responding"
    assert target_requirement.operator_message == "The local runtime on this machine is responding."
    assert engine_requirement.label == "Runtime can accept this publish"
    assert engine_requirement.operator_message == "The local audio engine on this machine is stopped or offline, so MAP2 cannot send this publish yet."
    assert channels_requirement.operator_message == "Waiting for the local runtime on this machine to confirm that the required channels are live."
    assert any(repair.id == "recover_local_audio_engine" for repair in readiness.available_repairs)
    assert runtime_blocker.repair_action_id == "recover_local_audio_engine"
    assert runtime_blocker.operator_message == "The local audio engine on this machine is stopped, so MAP2 cannot publish this snapshot yet."
    assert runtime_blocker.technical_detail == "Local engine state: stopped."


def test_publish_readiness_service_surfaces_authority_confirmation_failure_before_generic_runtime_blockers(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=16, name="Snapshot 16"))
            session.add(
                SnapshotRevision(
                    snapshot_id=16,
                    revision_number=6,
                    snapshot_revision="rev-16",
                    summary="summary",
                    summary_metadata={},
                    payload={},
                    document={},
                )
            )
            await session.flush()
            service = PublishReadinessService(
                session,
                snapshot_service=_FakeSnapshotService(_detail(16, revision_number=6)),
                authority_service=_FakeAuthorityService(
                    _committed_state(
                        16,
                        revision_number=6,
                        sync_status="pending_apply",
                        engine_state="stopped",
                    ),
                    [_observation("node-local"), _observation("rack-2")],
                ),
                runtime_state_service=_FakeRuntimeStateService(
                    live_state={"state": "live", "snapshot_id": 16},
                    activation_events=[
                        {
                            "snapshot_id": 16,
                            "runtime_metrics": {
                                "authority_publication": {
                                    "status": "failed",
                                    "reason": "authority_confirmation_failed",
                                    "technical_detail": "committed authority write failed",
                                }
                            },
                        }
                    ],
                ),
            )
            return await service.get_publish_readiness(16)

    readiness = asyncio.run(_run())

    assert readiness.status.value == "blocked"
    authority_blocker = next(
        blocker for blocker in readiness.blockers if blocker.code.value == "authority_confirmation_failed"
    )
    assert authority_blocker.operator_message == (
        "The audio engine applied this snapshot, but control-plane authority confirmation did not complete."
    )
    assert authority_blocker.technical_detail == "committed authority write failed"
    assert authority_blocker.repair_action_id == "retry_publish"
    assert any(repair.id == "retry_publish" for repair in readiness.available_repairs)
    assert not any(blocker.code.value == "engine_unavailable" for blocker in readiness.blockers)
    assert not any(blocker.code.value == "authority_diverged" for blocker in readiness.blockers)


def test_publish_readiness_service_preserves_authority_confirmation_failure_during_stale_observation_gap(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            session.add(Snapshot(id=17, name="Snapshot 17"))
            session.add(
                SnapshotRevision(
                    snapshot_id=17,
                    revision_number=8,
                    snapshot_revision="rev-17",
                    summary="summary",
                    summary_metadata={},
                    payload={},
                    document={},
                )
            )
            await session.flush()
            service = PublishReadinessService(
                session,
                snapshot_service=_FakeSnapshotService(_detail(17, revision_number=8)),
                authority_service=_FakeAuthorityService(
                    _committed_state(
                        17,
                        revision_number=8,
                        preferred_nodes=["node-local"],
                        engine_state="live",
                    ),
                    [],
                ),
                runtime_state_service=_FakeRuntimeStateService(
                    live_state={"state": "live", "snapshot_id": 17},
                    activation_events=[
                        {
                            "snapshot_id": 17,
                            "requested_at": (utc_now() - timedelta(seconds=30)).isoformat(),
                            "runtime_metrics": {
                                "activation_progress": {
                                    "current_phase": "VERIFYING",
                                },
                                "authority_publication": {
                                    "status": "failed",
                                    "reason": "authority_confirmation_failed",
                                    "technical_detail": "observation publish failed",
                                },
                            },
                        }
                    ],
                ),
                stale_after_seconds=3.0,
            )
            return await service.get_publish_readiness(17)

    readiness = asyncio.run(_run())

    assert readiness.status.value == "blocked"
    assert not any(blocker.code.value == "observation_stale" for blocker in readiness.blockers)

    authority_blocker = next(
        blocker for blocker in readiness.blockers if blocker.code.value == "authority_confirmation_failed"
    )
    target_requirement = next(item for item in readiness.requirements if item.id == "target_node_reachable")
    engine_requirement = next(item for item in readiness.requirements if item.id == "engine_accepted_publish")
    channels_requirement = next(item for item in readiness.requirements if item.id == "channels_confirmed_live")

    assert authority_blocker.technical_detail == "observation publish failed"
    assert target_requirement.status.value == "ready"
    assert target_requirement.label == "Local runtime is responding"
    assert target_requirement.operator_message == "The local runtime on this machine is responding."
    assert engine_requirement.status.value == "needs_attention"
    assert engine_requirement.operator_message == (
        "The runtime applied this snapshot, but MAP2 could not finish control-plane authority confirmation."
    )
    assert channels_requirement.status.value == "needs_attention"
    assert channels_requirement.operator_message == (
        "MAP2 cannot confirm the required channels as live until control-plane authority confirmation finishes."
    )
    assert any(repair.id == "retry_publish" for repair in readiness.available_repairs)
