from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.models.audio_state import (
    AudioStateDesiredIO,
    AudioStateRouting,
    AudioStateSnapshotRef,
    AuthoritativeAudioState,
    CompiledSnapshotIntent,
)
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


class _CommittedAuthorityService:
    def __init__(self, *, snapshot_id: int | None = None) -> None:
        self.snapshot_id = snapshot_id

    async def get_committed_state(self):
        committed = AuthoritativeAudioState(
            state_version=11,
            leader_epoch=3,
            committed_at="2026-04-05T16:00:00",
            origin_node_id="node-a",
            source_snapshot=(
                AudioStateSnapshotRef(
                    snapshot_id=self.snapshot_id,
                    snapshot_revision_id=2,
                    name=f"Snapshot {self.snapshot_id}",
                )
                if self.snapshot_id is not None
                else None
            ),
            desired=CompiledSnapshotIntent(
                snapshot_id=6,
                snapshot_revision_id=2,
                compiled_at="2026-04-05T15:59:59",
                io=AudioStateDesiredIO(requested_input_device="In", requested_output_device="Out"),
                routing=AudioStateRouting(mode="series", active_path_ids=["a"], path_order=["a"]),
                chains=[],
                extensions={},
            ),
            extensions={},
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


class _SequencerAuthoritySyncService:
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
                "sequencer": {
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


def test_activate_snapshot_route_delegates_to_canonical_activation_and_returns_committed_state(monkeypatch) -> None:
    client = _build_client(monkeypatch)
    fake_authority = _CommittedAuthorityService(snapshot_id=7)
    monkeypatch.setattr(audio_state_routes, "_service", lambda: fake_authority)

    activation_calls = []

    class _FakeSnapshotService:
        def __init__(self, _session) -> None:
            class _Activation:
                async def activate_snapshot(_self, snapshot_id: int, *, triggered_by: str = "ui"):
                    activation_calls.append({"snapshot_id": snapshot_id, "triggered_by": triggered_by})
                    return {"snapshot_id": snapshot_id, "snapshot_revision": f"rev-{snapshot_id}"}

            self.state_authority_activation = _Activation()

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
    assert payload["revision"] == 30
    assert payload["value"]["state_version"] == 11
    assert payload["value"]["source_snapshot"]["snapshot_id"] == 7
    assert activation_calls == [{"snapshot_id": 7, "triggered_by": "ui-test"}]


def test_activate_snapshot_route_returns_404_when_canonical_activation_finds_no_snapshot(monkeypatch) -> None:
    client = _build_client(monkeypatch)
    fake_authority = _CommittedAuthorityService(snapshot_id=9)
    monkeypatch.setattr(audio_state_routes, "_service", lambda: fake_authority)

    class _FakeSnapshotService:
        def __init__(self, _session) -> None:
            class _Activation:
                async def activate_snapshot(_self, snapshot_id: int, *, triggered_by: str = "ui"):
                    return None

            self.state_authority_activation = _Activation()

    @asynccontextmanager
    async def _fake_session():
        yield object()

    monkeypatch.setattr(audio_state_routes, "SnapshotService", _FakeSnapshotService)
    monkeypatch.setattr(audio_state_routes, "get_session", _fake_session)

    response = client.post(
        "/api/audio/state/snapshots/9/activate",
        json={"triggered_by": "ui-test", "leader_epoch": 5},
    )

    assert response.status_code == 404


def test_activate_snapshot_route_fails_when_authority_does_not_confirm_same_snapshot(monkeypatch) -> None:
    client = _build_client(monkeypatch)
    fake_authority = _CommittedAuthorityService(snapshot_id=99)
    monkeypatch.setattr(audio_state_routes, "_service", lambda: fake_authority)

    class _FakeSnapshotService:
        def __init__(self, _session) -> None:
            class _Activation:
                async def activate_snapshot(_self, snapshot_id: int, *, triggered_by: str = "ui"):
                    return {"snapshot_id": snapshot_id, "snapshot_revision": f"rev-{snapshot_id}"}

            self.state_authority_activation = _Activation()

    @asynccontextmanager
    async def _fake_session():
        yield object()

    monkeypatch.setattr(audio_state_routes, "SnapshotService", _FakeSnapshotService)
    monkeypatch.setattr(audio_state_routes, "get_session", _fake_session)

    response = client.post(
        "/api/audio/state/snapshots/9/activate",
        json={"triggered_by": "ui-test", "leader_epoch": 5},
    )

    assert response.status_code == 409
    assert "did not confirm" in response.json()["detail"]


def test_sync_sequencer_into_audio_state_route_forwards_scope(monkeypatch) -> None:
    client = _build_client(monkeypatch)
    fake_service = _SequencerAuthoritySyncService()
    monkeypatch.setattr(audio_state_routes, "_brain_authority_service", lambda: fake_service)

    response = client.post("/api/audio/state/sequencer/sync?instance_id=17&plugin_position=3&triggered_by=ui-test")

    assert response.status_code == 200
    payload = response.json()
    assert payload["revision"] == 33
    assert payload["value"]["extensions"]["sequencer"]["instances"]["instance-17__position-3"]["instance_id"] == "17"
    assert fake_service.calls == [
        {
            "instance_id": "17",
            "plugin_position": 3,
            "triggered_by": "ui-test",
        }
    ]
