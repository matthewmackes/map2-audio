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


def _committed_state(snapshot_id: int, *, revision_number: int = 7, sync_status: str = "synced", path_status: str = "active"):
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
            deployment=AudioStateDeployment(placement_mode="cluster_deployed", preferred_nodes=["node-local", "rack-2"]),
            chains=[],
        ),
        observed_summary=AudioStateObservedIOSummary(effective_input_device="In", effective_output_device="Out"),
        cluster=AudioStateClusterStatus(sync_status=sync_status, applied_node_ids=["node-local", "rack-2"] if sync_status == "synced" else ["node-local"], degraded_node_ids=[]),
        engine=AudioStateEngineSummary(display_state="live", is_warning=False, is_offline=False),
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
