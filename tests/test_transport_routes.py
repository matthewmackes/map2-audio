from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import transport as transport_routes
from app.services.transport_service import reset_transport_service


class _FakeOwner:
    def __init__(self, name: str) -> None:
        self.name = name
        self.actions: list[str] = []

    async def play(self):
        self.actions.append("play")
        return {"ok": True, "transport": {"playing": True}}

    async def stop(self):
        self.actions.append("stop")
        return {"ok": True, "transport": {"playing": False}}

    async def record(self):
        self.actions.append("record")
        return {"ok": True, "transport": {"recording": True}}

    async def restart(self):
        self.actions.append("restart")
        return {"ok": True, "transport": {"restarted": True}}

    async def erase(self):
        self.actions.append("erase")
        return {"ok": True, "transport": {"erased": True}}

    async def rew(self):
        self.actions.append("rew")
        return {"ok": True, "transport": {"rewound": True}}

    async def ff(self):
        self.actions.append("ff")
        return {"ok": True, "transport": {"fast_forwarded": True}}

    def get_state(self):
        return {"name": self.name, "actions": list(self.actions)}


def _build_client(monkeypatch) -> tuple[TestClient, object]:
    app = FastAPI()
    app.include_router(transport_routes.router)
    reset_transport_service()
    service = transport_routes.get_transport_service()
    fake_owner = _FakeOwner("fake")
    service.register_transport_owner("fake", fake_owner, priority=100)
    service.transfer_ownership("fake")
    return TestClient(app), fake_owner


def test_transport_routes_dispatch_and_owner_transfer(monkeypatch):
    client, fake_owner = _build_client(monkeypatch)

    state = client.get("/api/transport/state")
    assert state.status_code == 200
    assert state.json()["active_owner"] == "fake"

    play = client.post("/api/transport/play")
    assert play.status_code == 200
    assert play.json()["owner"] == "fake"
    assert play.json()["transport"]["playing"] is True

    rew = client.post("/api/transport/rew")
    assert rew.status_code == 200
    assert rew.json()["transport"]["rewound"] is True

    ff = client.post("/api/transport/ff")
    assert ff.status_code == 200
    assert ff.json()["transport"]["fast_forwarded"] is True

    erase = client.post("/api/transport/erase")
    assert erase.status_code == 200
    assert erase.json()["transport"]["erased"] is True
    assert fake_owner.actions == ["play", "rew", "ff", "erase"]

    transfer = client.post("/api/transport/owner", json={"owner": "midi_recorder"})
    assert transfer.status_code == 200
    assert transfer.json()["active_owner"] == "midi_recorder"

    missing = client.post("/api/transport/owner", json={"owner": "missing"})
    assert missing.status_code == 404

    invalid = client.post("/api/transport/warp")
    assert invalid.status_code == 400
