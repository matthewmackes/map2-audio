import pytest

from app.models.audio_state import (
    AudioStateClusterStatus,
    AudioStateDerivedStatus,
    AudioStateDesiredEnvelope,
    AudioStateDesiredIO,
    AudioStateEngineSummary,
    AudioStateEnvelope,
    AudioStateObservedIOSummary,
    AudioStateRouting,
    AuthoritativeAudioState,
    CompiledSnapshotIntent,
)
from app.services.audio_state_authority import AudioStateAuthorityError
from app.services.performance_brain_authority_sync import PerformanceBrainAuthoritySyncService
from app.services.performance_brain_service import BrainStateUpdateModel, PerformanceBrainService


class _FakeAuthorityService:
    def __init__(self, committed: AudioStateEnvelope, desired: AudioStateDesiredEnvelope | None = None) -> None:
        self.committed = committed
        self.desired = desired
        self.desired_updates = []
        self.committed_updates = []
        self.observations = []

    async def get_committed_state(self) -> AudioStateEnvelope:
        return self.committed

    async def get_desired_state(self) -> AudioStateDesiredEnvelope:
        if self.desired is None:
            raise AudioStateAuthorityError("No desired audio state exists in etcd")
        return self.desired

    async def put_desired_state(self, desired: CompiledSnapshotIntent) -> AudioStateDesiredEnvelope:
        self.desired_updates.append(desired)
        self.desired = AudioStateDesiredEnvelope(
            namespace=self.committed.namespace,
            key=f"{self.committed.namespace}/desired",
            revision=41,
            value=desired,
        )
        return self.desired

    async def next_state_version(self) -> int:
        return int(self.committed.value.state_version) + 1

    async def put_committed_state(self, committed: AuthoritativeAudioState) -> AudioStateEnvelope:
        self.committed_updates.append(committed)
        self.committed = AudioStateEnvelope(
            namespace=self.committed.namespace,
            key=self.committed.key,
            revision=42,
            value=committed,
        )
        return self.committed

    async def put_observation(self, observation):
        self.observations.append(observation)
        return observation


def _build_committed_envelope() -> AudioStateEnvelope:
    desired = CompiledSnapshotIntent(
        snapshot_id=11,
        snapshot_revision_id=3,
        compiled_at="2026-04-05T18:00:00",
        io=AudioStateDesiredIO(requested_input_device="In", requested_output_device="Out"),
        routing=AudioStateRouting(mode="series", active_path_ids=["path-a"], path_order=["path-a"]),
        chains=[],
    )
    committed = AuthoritativeAudioState(
        state_version=4,
        leader_epoch=2,
        committed_at="2026-04-05T18:00:00",
        origin_node_id="node-a",
        desired=desired,
        observed_summary=AudioStateObservedIOSummary(effective_input_device="In", effective_output_device="Out"),
        cluster=AudioStateClusterStatus(sync_status="synced", applied_node_ids=["node-a"], degraded_node_ids=[]),
        engine=AudioStateEngineSummary(display_state="live", is_warning=False, is_offline=False),
        paths=[],
        derived=AudioStateDerivedStatus(active_channel_count=1, total_channel_count=1, inactive_messages=[]),
    )
    return AudioStateEnvelope(
        namespace="/map2/audio-state/v1",
        key="/map2/audio-state/v1/committed",
        revision=40,
        value=committed,
    )


@pytest.mark.asyncio
async def test_sync_instance_serializes_brain_state_into_authority_extensions(tmp_path):
    brain_service = PerformanceBrainService(root_path=tmp_path / "brain-authority")
    brain_service.update_state(
        BrainStateUpdateModel(set_name="Authority Brain", active_slot=4),
        instance_id="17",
        plugin_position=3,
    )
    authority_service = _FakeAuthorityService(_build_committed_envelope())
    sync_service = PerformanceBrainAuthoritySyncService(
        authority_service=authority_service,
        brain_service=brain_service,
        node_id="node-local",
    )

    result = await sync_service.sync_instance(instance_id="17", plugin_position=3, triggered_by="test-suite")

    assert result.value.state_version == 5
    assert authority_service.desired_updates
    assert authority_service.committed_updates
    assert authority_service.observations

    desired_projection = authority_service.desired_updates[-1].extensions["performance_brain"]["instances"]["instance-17__position-3"]
    committed_projection = result.value.extensions["performance_brain"]["instances"]["instance-17__position-3"]
    observed_projection = authority_service.observations[-1].extensions["performance_brain"]["instances"]["instance-17__position-3"]

    assert desired_projection["instance_id"] == "17"
    assert desired_projection["plugin_position"] == 3
    assert desired_projection["triggered_by"] == "test-suite"
    assert desired_projection["state"]["set_name"] == "Authority Brain"
    assert desired_projection["state"]["active_slot"] == 4
    assert committed_projection["snapshot_integration"]["committed_state_id"] == "brain:committed:instance-17__position-3"
    assert observed_projection["snapshot_integration"]["observed_state_id"] == "brain:observed:instance-17__position-3"
    assert authority_service.observations[-1].observed_state_version == 5
    assert authority_service.observations[-1].runtime_metrics["performance_brain"]["instance_count"] == 1


@pytest.mark.asyncio
async def test_sync_instance_preserves_existing_brain_extensions_in_observation(tmp_path):
    brain_service = PerformanceBrainService(root_path=tmp_path / "brain-authority")
    brain_service.update_state(
        BrainStateUpdateModel(set_name="Authority Brain A"),
        instance_id="17",
        plugin_position=3,
    )
    brain_service.update_state(
        BrainStateUpdateModel(set_name="Authority Brain B"),
        instance_id="22",
        plugin_position=5,
    )
    authority_service = _FakeAuthorityService(_build_committed_envelope())
    sync_service = PerformanceBrainAuthoritySyncService(
        authority_service=authority_service,
        brain_service=brain_service,
        node_id="node-local",
    )

    await sync_service.sync_instance(instance_id="17", plugin_position=3, triggered_by="test-suite")
    await sync_service.sync_instance(instance_id="22", plugin_position=5, triggered_by="test-suite")

    observed_instances = authority_service.observations[-1].extensions["performance_brain"]["instances"]

    assert set(observed_instances) == {"instance-17__position-3", "instance-22__position-5"}
    assert observed_instances["instance-17__position-3"]["state"]["set_name"] == "Authority Brain A"
    assert observed_instances["instance-22__position-5"]["state"]["set_name"] == "Authority Brain B"
    assert authority_service.observations[-1].runtime_metrics["performance_brain"]["instance_count"] == 2


@pytest.mark.asyncio
async def test_restore_instance_hydrates_local_brain_state_from_committed_projection(tmp_path):
    brain_service = PerformanceBrainService(root_path=tmp_path / "brain-authority")
    brain_service.update_state(
        BrainStateUpdateModel(set_name="Stale Local Brain", active_slot=2),
        instance_id="17",
        plugin_position=3,
    )
    committed_envelope = _build_committed_envelope()
    authority_service = _FakeAuthorityService(committed_envelope)

    synced_projection = await PerformanceBrainAuthoritySyncService(
        authority_service=authority_service,
        brain_service=brain_service,
        node_id="node-local",
    ).sync_instance(instance_id="17", plugin_position=3, triggered_by="seed")

    brain_service.update_state(
        BrainStateUpdateModel(set_name="Locally Drifted Again", active_slot=7),
        instance_id="17",
        plugin_position=3,
    )
    authority_service.committed = synced_projection

    restored = await PerformanceBrainAuthoritySyncService(
        authority_service=authority_service,
        brain_service=brain_service,
        node_id="node-local",
    ).restore_instance(instance_id="17", plugin_position=3)

    assert restored["set_name"] == "Stale Local Brain"
    assert restored["active_slot"] == 2
    assert brain_service.get_state(instance_id="17", plugin_position=3)["set_name"] == "Stale Local Brain"


@pytest.mark.asyncio
async def test_restore_instance_falls_back_to_local_state_without_projection(tmp_path):
    brain_service = PerformanceBrainService(root_path=tmp_path / "brain-authority")
    brain_service.update_state(
        BrainStateUpdateModel(set_name="Only Local Brain", active_slot=5),
        instance_id="99",
        plugin_position=1,
    )
    authority_service = _FakeAuthorityService(_build_committed_envelope())

    restored = await PerformanceBrainAuthoritySyncService(
        authority_service=authority_service,
        brain_service=brain_service,
        node_id="node-local",
    ).restore_instance(instance_id="99", plugin_position=1)

    assert restored["set_name"] == "Only Local Brain"
    assert restored["active_slot"] == 5


@pytest.mark.asyncio
async def test_reconcile_runtime_with_extensions_restores_snapshot_state_and_resets_missing_instances(tmp_path):
    brain_service = PerformanceBrainService(root_path=tmp_path / "brain-authority")
    brain_service.update_state(
        BrainStateUpdateModel(set_name="Local Brain A", active_slot=2),
        instance_id="17",
        plugin_position=3,
    )
    brain_service.update_state(
        BrainStateUpdateModel(set_name="Local Brain B", active_slot=5),
        instance_id="22",
        plugin_position=5,
    )

    sync_service = PerformanceBrainAuthoritySyncService(
        authority_service=_FakeAuthorityService(_build_committed_envelope()),
        brain_service=brain_service,
        node_id="node-local",
    )

    result = sync_service.reconcile_runtime_with_extensions(
        current_extensions={
            "performance_brain": {
                "instances": {
                    "instance-17__position-3": {
                        "runtime_instance_id": "instance-17__position-3",
                        "instance_id": "17",
                        "plugin_position": 3,
                        "state": brain_service.get_state(instance_id="17", plugin_position=3),
                    },
                    "instance-22__position-5": {
                        "runtime_instance_id": "instance-22__position-5",
                        "instance_id": "22",
                        "plugin_position": 5,
                        "state": brain_service.get_state(instance_id="22", plugin_position=5),
                    },
                }
            }
        },
        next_extensions={
            "performance_brain": {
                "instances": {
                    "instance-17__position-3": {
                        "runtime_instance_id": "instance-17__position-3",
                        "instance_id": "17",
                        "plugin_position": 3,
                        "state": {
                            **brain_service.get_state(instance_id="17", plugin_position=3),
                            "set_name": "Snapshot Brain A",
                            "active_slot": 7,
                        },
                    }
                }
            }
        },
    )

    assert result["reconciled"] is True
    assert result["reason"] == "snapshot_brain_namespace_applied"
    assert result["restored"] == [
        {
            "runtime_instance_id": "instance-17__position-3",
            "instance_id": "17",
            "plugin_position": 3,
        }
    ]
    assert result["reset"] == [
        {
            "runtime_instance_id": "instance-22__position-5",
            "instance_id": "22",
            "plugin_position": 5,
        }
    ]
    assert brain_service.get_state(instance_id="17", plugin_position=3)["set_name"] == "Snapshot Brain A"
    assert brain_service.get_state(instance_id="17", plugin_position=3)["active_slot"] == 7
    assert brain_service.get_state(instance_id="22", plugin_position=5)["set_name"] == "Init Performance Brain"
