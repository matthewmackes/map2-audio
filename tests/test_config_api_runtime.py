from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import config_api


class _FakeConfigManager:
    def get_all(self):
        return {"midi": {"enabled": True}}

    def get(self, key):
        if key == "midi.enabled":
            return True
        return None


class _FakeReloader:
    def __init__(self):
        self.calls = []

    async def apply_runtime_change(self, key, value, scope="cluster", broadcast=True):
        self.calls.append(
            {
                "key": key,
                "value": value,
                "scope": scope,
                "broadcast": broadcast,
            }
        )
        return True


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(config_api.router)
    return TestClient(app)


def test_get_runtime_config_returns_shared_manager(monkeypatch):
    monkeypatch.setattr(config_api, "get_runtime_config_manager", lambda: _FakeConfigManager())
    client = _build_client()

    response = client.get("/api/cluster/config/runtime")

    assert response.status_code == 200
    assert response.json()["config"] == {"midi": {"enabled": True}}


def test_put_runtime_config_applies_cluster_scope(monkeypatch):
    fake_reloader = _FakeReloader()
    monkeypatch.setattr(config_api, "_get_runtime_reloader", lambda: fake_reloader)
    client = _build_client()

    response = client.put(
        "/api/cluster/config/runtime",
        json={"key": "midi.enabled", "value": False, "scope": "role:AUDIO-NODE"},
    )

    assert response.status_code == 200
    assert fake_reloader.calls == [
        {
            "key": "midi.enabled",
            "value": False,
            "scope": "role:AUDIO-NODE",
            "broadcast": True,
        }
    ]


def test_put_runtime_config_rejects_invalid_scope():
    client = _build_client()

    response = client.put(
        "/api/cluster/config/runtime",
        json={"key": "midi.enabled", "value": False, "scope": "everywhere"},
    )

    assert response.status_code == 400
    assert "scope must be" in response.json()["detail"]
