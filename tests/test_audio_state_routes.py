from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.models.audio_state import AudioStateDesiredIO, AudioStateRouting, AuthoritativeAudioState, CompiledSnapshotIntent
from app.routes import audio_state as audio_state_routes
from app.services.audio_state_authority import AudioStateAuthorityError


class _FakeConfig:
    def __init__(self) -> None:
        self._values = {
            "audio_state.etcd_namespace": "/map2/audio-state/v1",
            "audio_state.authority_backend": "etcd",
        }

    def get(self, key: str, default=None):
        return self._values.get(key, default)


class _MissingCommittedService:
    async def get_committed_state(self):
        raise AudioStateAuthorityError("No committed authoritative audio state exists in etcd")


class _DesiredOnlyService:
    def __init__(self) -> None:
        self.requested = None

    async def put_desired_state(self, desired):
        self.requested = desired
        return type("DesiredEnvelope", (), {"revision": 17})()

    async def put_committed_state(self, committed):
        return type("CommittedEnvelope", (), {"namespace": "/map2/audio-state/v1", "key": "/map2/audio-state/v1/committed", "revision": 23})()


class _ActivateService:
    def __init__(self, *, committed_extensions=None, desired_extensions=None) -> None:
        self.desired = None
        self.committed = None
        self._committed_extensions = committed_extensions or {}
        self._desired_extensions = desired_extensions

    async def next_state_version(self):
        return 12

    async def get_committed_state(self):
        committed = AuthoritativeAudioState(
            state_version=11,
            leader_epoch=3,
            committed_at="2026-04-05T16:00:00",
            origin_node_id="node-a",
            desired=CompiledSnapshotIntent(
                snapshot_id=6,
                snapshot_revision_id=2,
                compiled_at="2026-04-05T15:59:59",
                io=AudioStateDesiredIO(requested_input_device="In", requested_output_device="Out"),
                routing=AudioStateRouting(mode="series", active_path_ids=["a"], path_order=["a"]),
                chains=[],
                extensions=self._desired_extensions or self._committed_extensions,
            ),
            extensions=self._committed_extensions,
        )
        return type(
            "CommittedEnvelope",
            (),
            {
                "namespace": "/map2/audio-state/v1",
                "key": "/map2/audio-state/v1/committed",
                "revision": 30,
                "value": committed,
            },
        )()

    async def get_desired_state(self):
        if self._desired_extensions is None:
            raise AudioStateAuthorityError("No desired audio state exists in etcd")
        desired = CompiledSnapshotIntent(
            snapshot_id=6,
            snapshot_revision_id=2,
            compiled_at="2026-04-05T15:59:59",
            io=AudioStateDesiredIO(requested_input_device="In", requested_output_device="Out"),
            routing=AudioStateRouting(mode="series", active_path_ids=["a"], path_order=["a"]),
            chains=[],
            extensions=self._desired_extensions,
        )
        return type(
            "DesiredEnvelope",
            (),
            {
                "namespace": "/map2/audio-state/v1",
                "key": "/map2/audio-state/v1/desired",
                "revision": 29,
                "value": desired,
            },
        )()

    async def put_desired_state(self, desired):
        self.desired = desired
        return type("DesiredEnvelope", (), {"revision": 31})()

    async def put_committed_state(self, committed):
        self.committed = committed
        return type(
            "CommittedEnvelope",
            (),
            {
                "namespace": "/map2/audio-state/v1",
                "key": "/map2/audio-state/v1/committed",
                "revision": 32,
                "value": committed,
            },
        )()


class _BrainAuthoritySyncService:
    def __init__(self) -> None:
        self.calls = []

    async def sync_instance(self, *, instance_id=None, plugin_position=None, triggered_by="ui"):
        self.calls.append(
            {
                "instance_id": instance_id,
                "plugin_position": plugin_position,
                "triggered_by": triggered_by,
            }
        )
        committed = AuthoritativeAudioState(
            state_version=18,
            leader_epoch=4,
            committed_at="2026-04-05T18:10:00",
            origin_node_id="node-a",
            desired=CompiledSnapshotIntent(
                snapshot_id=11,
                snapshot_revision_id=3,
                compiled_at="2026-04-05T18:10:00",
                io=AudioStateDesiredIO(requested_input_device="In", requested_output_device="Out"),
                routing=AudioStateRouting(mode="series", active_path_ids=["a"], path_order=["a"]),
                chains=[],
            ),
            extensions={
                "performance_brain": {
                    "instances": {
                        "instance-17__position-3": {
                            "instance_id": "17",
                            "plugin_position": 3,
                        }
                    }
                }
            },
        )
        return type(
            "CommittedEnvelope",
            (),
            {
                "namespace": "/map2/audio-state/v1",
                "key": "/map2/audio-state/v1/committed",
                "revision": 33,
                "value": committed,
            },
        )()


def _build_client(monkeypatch) -> TestClient:
    app = FastAPI()
    app.include_router(audio_state_routes.router)
    monkeypatch.setattr(audio_state_routes, "get_config", lambda: _FakeConfig())
    return TestClient(app)


def test_audio_state_status_route_reads_runtime_config(monkeypatch) -> None:
    client = _build_client(monkeypatch)

    response = client.get("/api/audio/state/status")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "namespace": "/map2/audio-state/v1",
        "authority_backend": "etcd",
    }


def test_committed_audio_state_route_maps_missing_state_to_404(monkeypatch) -> None:
    client = _build_client(monkeypatch)
    monkeypatch.setattr(audio_state_routes, "_service", lambda: _MissingCommittedService())

    response = client.get("/api/audio/state/committed")

    assert response.status_code == 404
    assert "No committed authoritative audio state exists" in response.json()["detail"]


def test_put_desired_audio_state_commits_authoritative_envelope(monkeypatch) -> None:
    client = _build_client(monkeypatch)
    fake_service = _DesiredOnlyService()
    monkeypatch.setattr(audio_state_routes, "_service", lambda: fake_service)

    response = client.put(
        "/api/audio/state/desired",
        json={
            "requested_by": "ui",
            "leader_epoch": 4,
            "state_version": 9,
            "committed_at": "2026-04-03T12:00:00",
            "origin_node_id": "node-a",
            "desired": CompiledSnapshotIntent(
                snapshot_id=11,
                snapshot_revision_id=3,
                compiled_at="2026-04-03T11:59:59",
                io=AudioStateDesiredIO(requested_input_device="In", requested_output_device="Out"),
                routing=AudioStateRouting(mode="series", active_path_ids=["a"], path_order=["a"]),
                chains=[],
            ).model_dump(mode="json"),
            "paths": [],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["namespace"] == "/map2/audio-state/v1"
    assert payload["key"] == "/map2/audio-state/v1/committed"
    assert payload["revision"] == 23
    assert payload["value"]["state_version"] == 9
    assert payload["value"]["leader_epoch"] == 4
    assert fake_service.requested.snapshot_id == 11


def test_activate_snapshot_route_compiles_and_commits_authoritative_state(monkeypatch) -> None:
    client = _build_client(monkeypatch)
    fake_service = _ActivateService()
    monkeypatch.setattr(audio_state_routes, "_service", lambda: fake_service)
    monkeypatch.setattr(audio_state_routes, "resolve_local_node_id", lambda: "node-a")

    class _FakeSnapshotService:
        def __init__(self, _session) -> None:
            pass

        async def get_snapshot(self, snapshot_id: int):
            return {
                "id": snapshot_id,
                "name": "Authority Snapshot",
                "routing": {"mode": "series", "active_channel_key": "ch_a", "series_order": ["ch_a"]},
                "paths": [{"id": "ch_a", "label": "A", "snapshot_chain_id": 101}],
                "chains": [],
            }

    @asynccontextmanager
    async def _fake_session():
        yield object()

    monkeypatch.setattr(audio_state_routes, "SnapshotService", _FakeSnapshotService)
    monkeypatch.setattr(audio_state_routes, "get_session", _fake_session)

    response = client.post(
        "/api/audio/state/snapshots/7/activate",
        json={"triggered_by": "ui-test", "leader_epoch": 4},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["namespace"] == "/map2/audio-state/v1"
    assert payload["key"] == "/map2/audio-state/v1/committed"
    assert payload["revision"] == 32
    assert payload["value"]["state_version"] == 12
    assert payload["value"]["leader_epoch"] == 4
    assert payload["value"]["source_snapshot"]["snapshot_id"] == 7
    assert payload["value"]["cluster"]["sync_status"] == "pending_apply"
    assert fake_service.desired.snapshot_id == 7
    assert fake_service.committed.source_snapshot.snapshot_id == 7


def test_activate_snapshot_route_preserves_existing_authority_extensions(monkeypatch) -> None:
    client = _build_client(monkeypatch)
    fake_service = _ActivateService(
        committed_extensions={
            "performance_brain": {
                "instances": {
                    "instance-17__position-3": {
                        "runtime_instance_id": "instance-17__position-3",
                        "instance_id": "17",
                        "plugin_position": 3,
                    }
                }
            }
        }
    )
    monkeypatch.setattr(audio_state_routes, "_service", lambda: fake_service)
    monkeypatch.setattr(audio_state_routes, "resolve_local_node_id", lambda: "node-a")

    class _FakeSnapshotService:
        def __init__(self, _session) -> None:
            pass

        async def get_snapshot(self, snapshot_id: int):
            return {
                "id": snapshot_id,
                "name": "Brain Safe Snapshot",
                "routing": {"mode": "series", "active_channel_key": "ch_a", "series_order": ["ch_a"]},
                "paths": [{"id": "ch_a", "label": "A", "snapshot_chain_id": 101}],
                "chains": [],
            }

    @asynccontextmanager
    async def _fake_session():
        yield object()

    monkeypatch.setattr(audio_state_routes, "SnapshotService", _FakeSnapshotService)
    monkeypatch.setattr(audio_state_routes, "get_session", _fake_session)

    response = client.post(
        "/api/audio/state/snapshots/9/activate",
        json={"triggered_by": "ui-test", "leader_epoch": 5},
    )

    assert response.status_code == 200
    assert fake_service.desired.extensions["performance_brain"]["instances"]["instance-17__position-3"]["instance_id"] == "17"
    assert fake_service.committed.extensions["performance_brain"]["instances"]["instance-17__position-3"]["plugin_position"] == 3


def test_activate_snapshot_route_prefers_snapshot_owned_authority_extensions(monkeypatch) -> None:
    client = _build_client(monkeypatch)
    fake_service = _ActivateService(
        committed_extensions={
            "performance_brain": {
                "instances": {
                    "instance-17__position-3": {
                        "runtime_instance_id": "instance-17__position-3",
                        "instance_id": "17",
                        "plugin_position": 3,
                    }
                }
            },
            "transport": {
                "tempo": 128.0,
            },
        }
    )
    monkeypatch.setattr(audio_state_routes, "_service", lambda: fake_service)
    monkeypatch.setattr(audio_state_routes, "resolve_local_node_id", lambda: "node-a")

    class _FakeSnapshotService:
        def __init__(self, _session) -> None:
            pass

        async def get_snapshot(self, snapshot_id: int):
            return {
                "id": snapshot_id,
                "name": "Brain Override Snapshot",
                "routing": {"mode": "series", "active_channel_key": "ch_a", "series_order": ["ch_a"]},
                "paths": [{"id": "ch_a", "label": "A", "snapshot_chain_id": 101}],
                "chains": [],
                "extensions": {
                    "performance_brain": {
                        "instances": {
                            "instance-18__position-4": {
                                "runtime_instance_id": "instance-18__position-4",
                                "instance_id": "18",
                                "plugin_position": 4,
                            }
                        }
                    }
                },
            }

    @asynccontextmanager
    async def _fake_session():
        yield object()

    monkeypatch.setattr(audio_state_routes, "SnapshotService", _FakeSnapshotService)
    monkeypatch.setattr(audio_state_routes, "get_session", _fake_session)

    response = client.post(
        "/api/audio/state/snapshots/9/activate",
        json={"triggered_by": "ui-test", "leader_epoch": 5},
    )

    assert response.status_code == 200
    assert "instance-17__position-3" not in fake_service.desired.extensions["performance_brain"]["instances"]
    assert fake_service.desired.extensions["performance_brain"]["instances"]["instance-18__position-4"]["instance_id"] == "18"
    assert fake_service.committed.extensions["transport"]["tempo"] == 128.0


def test_sync_brain_into_audio_state_route_forwards_scope(monkeypatch) -> None:
    client = _build_client(monkeypatch)
    fake_service = _BrainAuthoritySyncService()
    monkeypatch.setattr(audio_state_routes, "_brain_authority_service", lambda: fake_service)

    response = client.post("/api/audio/state/brain/sync?instance_id=17&plugin_position=3&triggered_by=ui-test")

    assert response.status_code == 200
    payload = response.json()
    assert payload["revision"] == 33
    assert payload["value"]["extensions"]["performance_brain"]["instances"]["instance-17__position-3"]["instance_id"] == "17"
    assert fake_service.calls == [
        {
            "instance_id": "17",
            "plugin_position": 3,
            "triggered_by": "ui-test",
        }
    ]
