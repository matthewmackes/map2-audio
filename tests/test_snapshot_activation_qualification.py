import asyncio
from types import SimpleNamespace

from sqlalchemy import select

from app import database as database_module
from app.services import audio_state_authority as audio_state_authority_module
from app.services import snapshot_runtime_service
from app.services import snapshot_service as snapshot_service_module
from app.services import snapshot_runtime_state_service as runtime_state_service_module
from app.services.chain_service import ChainService
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService
from app.services.snapshot_service import SnapshotService
from app.services.snapshot_tempo_service import reset_snapshot_tempo_service


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    reset_snapshot_tempo_service()
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'snapshot-activation-qualification.db'}")


class _FakeSnapshotPluginLoader:
    def get_plugin_by_uri(self, uri: str):
        if uri.startswith("urn:test:"):
            return {"uri": uri, "name": uri.rsplit(":", 1)[-1]}
        return None


def _detail_payload(name: str) -> dict:
    return {
        "channels": [{"channel_key": "channel-a", "label": "A", "chain_id": 1}],
        "chains": [{"id": 1, "name": f"{name} Chain", "plugins": [{"uri": "urn:test:plugin", "position": 0}]}],
        "routing": {"mode": "series", "active_channel_key": "channel-a", "series_order": ["channel-a"]},
    }


async def _fake_apply(_snapshot_data):
    return 0, 0


async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
    result = await self.session.execute(
        select(database_module.Chain).filter(database_module.Chain.id == chain_id)
    )
    chain = result.scalar_one_or_none()
    if chain is not None:
        chain.is_active = True
    return True


def _patch_activation_environment(monkeypatch, authority_capture):
    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(runtime_state_service_module, "resolve_local_node_id", lambda: "LOCAL-NODE")
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)
    monkeypatch.setattr(
        audio_state_authority_module,
        "AudioStateAuthorityService",
        lambda *args, **kwargs: authority_capture,
    )


class _RetryAuthorityCapture:
    def __init__(self) -> None:
        self.desired_writes: list[object] = []
        self.committed_writes: list[object] = []
        self.observations: list[object] = []
        self.commit_attempts = 0
        self.reconciliations = 0

    async def get_committed_state(self):
        raise audio_state_authority_module.AudioStateAuthorityError("No committed authoritative audio state exists in etcd")

    async def get_desired_state(self):
        raise audio_state_authority_module.AudioStateAuthorityError("No desired audio state exists in etcd")

    async def put_desired_state(self, desired):
        self.desired_writes.append(desired)
        return SimpleNamespace(value=desired)

    async def next_state_version(self):
        return 100 + self.commit_attempts + 1

    async def put_committed_state(self, state):
        self.commit_attempts += 1
        if self.commit_attempts == 1:
            raise RuntimeError("committed authority write failed on first attempt")
        self.committed_writes.append(state)
        return SimpleNamespace(value=state)

    async def put_observation(self, observation):
        self.observations.append(observation)
        return SimpleNamespace(value=observation)

    async def reconcile_committed_state(self):
        self.reconciliations += 1
        return True


class _AlwaysHealthyAuthorityCapture:
    def __init__(self) -> None:
        self.desired_writes: list[object] = []
        self.committed_writes: list[object] = []
        self.observations: list[object] = []
        self.state_version = 200
        self.reconciliations = 0

    async def get_committed_state(self):
        raise audio_state_authority_module.AudioStateAuthorityError("No committed authoritative audio state exists in etcd")

    async def get_desired_state(self):
        raise audio_state_authority_module.AudioStateAuthorityError("No desired audio state exists in etcd")

    async def put_desired_state(self, desired):
        self.desired_writes.append(desired)
        return SimpleNamespace(value=desired)

    async def next_state_version(self):
        self.state_version += 1
        return self.state_version

    async def put_committed_state(self, state):
        self.committed_writes.append(state)
        return SimpleNamespace(value=state)

    async def put_observation(self, observation):
        self.observations.append(observation)
        return SimpleNamespace(value=observation)

    async def reconcile_committed_state(self):
        self.reconciliations += 1
        return True


class _ConcurrentSameSnapshotAuthorityCapture(_AlwaysHealthyAuthorityCapture):
    def __init__(self) -> None:
        super().__init__()
        self.commit_attempts = 0
        self.first_commit_started = asyncio.Event()
        self.allow_first_commit = asyncio.Event()

    async def put_committed_state(self, state):
        self.commit_attempts += 1
        if self.commit_attempts == 1:
            self.first_commit_started.set()
            await self.allow_first_commit.wait()
        self.committed_writes.append(state)
        return SimpleNamespace(value=state)


def test_activation_qualification_retry_recovers_after_degraded_authority_confirmation(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    authority_capture = _RetryAuthorityCapture()
    _patch_activation_environment(monkeypatch, authority_capture)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="RetryQualification",
                detail_payload=_detail_payload("RetryQualification"),
                apply_default_system_blocks=False,
            )
            first = await service.activate_snapshot(created["id"])
            second = await service.activate_snapshot(created["id"], triggered_by="publish_retry")
            runtime_state_service = SnapshotRuntimeStateService(session)
            live_state = await runtime_state_service.get_live_state()
            events = await runtime_state_service.list_activation_events(limit=2)
            return first, second, live_state, events

    first, second, live_state, events = asyncio.run(_run())

    assert first["status"] == "degraded"
    assert first["result_code"] == "authority_confirmation_failed"
    assert second["status"] == "success"
    assert second["result_code"] == "live_confirmed"
    assert live_state["snapshot_id"] == second["snapshot_id"]
    assert live_state["runtime_metrics"]["authority_publication"]["status"] == "confirmed"
    assert len(authority_capture.desired_writes) == 2
    assert len(authority_capture.committed_writes) == 1
    assert len(authority_capture.observations) == 1
    assert sorted(event["outcome"] for event in events) == ["degraded", "success"]


def test_activation_qualification_repeating_same_snapshot_keeps_success_contract_stable(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    authority_capture = _AlwaysHealthyAuthorityCapture()
    _patch_activation_environment(monkeypatch, authority_capture)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="IdempotentQualification",
                detail_payload=_detail_payload("IdempotentQualification"),
                apply_default_system_blocks=False,
            )
            first = await service.activate_snapshot(created["id"])
            second = await service.activate_snapshot(created["id"])
            runtime_state_service = SnapshotRuntimeStateService(session)
            live_state = await runtime_state_service.get_live_state()
            events = await runtime_state_service.list_activation_events(limit=2)
            return first, second, live_state, events

    first, second, live_state, events = asyncio.run(_run())

    assert first["status"] == "success"
    assert second["status"] == "success"
    assert live_state["snapshot_id"] == first["snapshot_id"] == second["snapshot_id"]
    assert len(authority_capture.desired_writes) == 2
    assert len(authority_capture.committed_writes) == 2
    assert len(authority_capture.observations) == 2
    for activation in (first, second):
        authority_publication = activation["runtime_live_state"]["runtime_metrics"]["authority_publication"]
        assert authority_publication["status"] == "confirmed"
        assert [entry["status"] for entry in authority_publication["publication_steps"]] == [
            "completed",
            "completed",
            "completed",
            "completed",
            "completed",
        ]
    assert [event["outcome"] for event in events] == ["success", "success"]


def test_activation_qualification_overlapping_same_snapshot_attempts_keep_history_coherent(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    authority_capture = _ConcurrentSameSnapshotAuthorityCapture()
    _patch_activation_environment(monkeypatch, authority_capture)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="ConcurrentQualification",
                detail_payload=_detail_payload("ConcurrentQualification"),
                apply_default_system_blocks=False,
            )
            snapshot_id = created["id"]
            session.add(
                database_module.SnapshotNodeLiveState(
                    node_id="LOCAL-NODE",
                    state="stopped",
                    seq=0,
                    live_snapshot_payload={},
                    runtime_metrics={},
                )
            )
            await session.flush()

        async def _activate(triggered_by: str):
            async with database_module.get_session() as session:
                return await SnapshotService(session).activate_snapshot(snapshot_id, triggered_by=triggered_by)

        first_task = asyncio.create_task(_activate("ui"))
        await authority_capture.first_commit_started.wait()
        second_task = asyncio.create_task(_activate("publish_retry"))
        await asyncio.sleep(0.05)
        assert second_task.done() is False
        authority_capture.allow_first_commit.set()

        first, second = await asyncio.gather(first_task, second_task)

        async with database_module.get_session() as session:
            runtime_state_service = SnapshotRuntimeStateService(session)
            live_state = await runtime_state_service.get_live_state()
            events = await runtime_state_service.list_activation_events(limit=2)
        return snapshot_id, first, second, live_state, events

    snapshot_id, first, second, live_state, events = asyncio.run(_run())

    assert first["status"] == "success"
    assert second["status"] == "success"
    assert live_state["snapshot_id"] == snapshot_id
    assert live_state["runtime_metrics"]["authority_publication"]["status"] == "confirmed"
    assert len(authority_capture.desired_writes) == 2
    assert len(authority_capture.committed_writes) == 2
    assert len(authority_capture.observations) == 2
    assert len({event["request_id"] for event in events}) == 2
    assert [event["outcome"] for event in events] == ["success", "success"]


def test_activation_qualification_overlapping_different_snapshots_leave_latest_snapshot_live(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    authority_capture = _ConcurrentSameSnapshotAuthorityCapture()
    _patch_activation_environment(monkeypatch, authority_capture)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            first_snapshot = await service.create_snapshot(
                name="ConcurrentFirst",
                detail_payload=_detail_payload("ConcurrentFirst"),
                apply_default_system_blocks=False,
            )
            second_snapshot = await service.create_snapshot(
                name="ConcurrentSecond",
                detail_payload=_detail_payload("ConcurrentSecond"),
                apply_default_system_blocks=False,
            )
            session.add(
                database_module.SnapshotNodeLiveState(
                    node_id="LOCAL-NODE",
                    state="stopped",
                    seq=0,
                    live_snapshot_payload={},
                    runtime_metrics={},
                )
            )
            await session.flush()

        async def _activate(snapshot_id: int, triggered_by: str):
            async with database_module.get_session() as session:
                return await SnapshotService(session).activate_snapshot(snapshot_id, triggered_by=triggered_by)

        first_task = asyncio.create_task(_activate(first_snapshot["id"], "ui"))
        await authority_capture.first_commit_started.wait()
        second_task = asyncio.create_task(_activate(second_snapshot["id"], "publish_retry"))
        await asyncio.sleep(0.05)
        assert second_task.done() is False
        authority_capture.allow_first_commit.set()

        first, second = await asyncio.gather(first_task, second_task)

        async with database_module.get_session() as session:
            runtime_state_service = SnapshotRuntimeStateService(session)
            live_state = await runtime_state_service.get_live_state()
            events = await runtime_state_service.list_activation_events(limit=2)
        return first_snapshot["id"], second_snapshot["id"], first, second, live_state, events

    first_snapshot_id, second_snapshot_id, first, second, live_state, events = asyncio.run(_run())

    assert first["status"] == "success"
    assert second["status"] == "success"
    assert first["snapshot_id"] == first_snapshot_id
    assert second["snapshot_id"] == second_snapshot_id
    assert live_state["snapshot_id"] == second_snapshot_id
    assert live_state["runtime_metrics"]["authority_publication"]["status"] == "confirmed"
    assert len(authority_capture.desired_writes) == 2
    assert len(authority_capture.committed_writes) == 2
    assert len(authority_capture.observations) == 2
    assert {event["snapshot_id"] for event in events} == {first_snapshot_id, second_snapshot_id}
    assert [event["outcome"] for event in events] == ["success", "success"]
