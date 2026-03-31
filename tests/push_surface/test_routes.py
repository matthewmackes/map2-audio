from __future__ import annotations

from dataclasses import asdict

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import push_surface as push_surface_routes
from app.services.push_surface.config import PushSurfaceConfig


class _FakeRuntimeConfigManager:
    def __init__(self) -> None:
        self.values: dict[str, object] = {}
        self.saved = 0

    def get(self, key: str, default=None):
        return self.values.get(key, default)

    def set(self, key: str, value, save: bool = True):
        self.values[key] = value
        return True

    def save(self) -> bool:
        self.saved += 1
        return True


class _FakePushSurfaceManager:
    def __init__(self) -> None:
        self.running = False
        self.config = PushSurfaceConfig(enabled=False, bank_size=8)
        self.apply_config_calls: list[dict[str, object]] = []
        self.test_pattern_calls = 0
        self.export_calls = 0
        self.capability_dump_calls = 0
        self.active_device = None
        self.refresh_state_calls = 0

    async def get_health(self) -> dict[str, object]:
        return {
            "running": self.running,
            "midi_events_in": 11,
            "midi_events_out": 7,
            "last_capability_dump": {"supports_leds": True} if self.capability_dump_calls else None,
            "last_diagnostics_export": "/tmp/push-diag" if self.export_calls else None,
        }

    async def get_state_snapshot(self) -> dict[str, object]:
        return {
            "running": self.running,
            "active_page": "home",
            "state": {
                "diagnostics": {
                    "raw_events": ["90 24 7f"],
                    "decoded_events": ['{"event_type":"pad_press"}'],
                    "midi_events_in": 11,
                    "midi_events_out": 7,
                }
            },
        }

    async def apply_config(self, config: PushSurfaceConfig) -> None:
        self.config = PushSurfaceConfig(**asdict(config))
        self.apply_config_calls.append(asdict(config))

    async def start(self) -> None:
        self.running = True

    async def stop(self) -> None:
        self.running = False

    async def send_test_pattern(self) -> int:
        self.test_pattern_calls += 1
        return 8

    async def export_diagnostics_bundle(self) -> str:
        self.export_calls += 1
        return "/tmp/push-diag"

    async def dump_capabilities(self):
        self.capability_dump_calls += 1
        return {"supports_leds": True}

    async def refresh_state(self) -> None:
        self.refresh_state_calls += 1


class _FakePushSurfaceLabsStore:
    def __init__(self) -> None:
        self.state = {
            "schema_version": 1,
            "assignments": [
                {"id": "a1", "label": "Tap Tempo CC", "assignment_type": "cc"},
                {"id": "a2", "label": "Preset PC", "assignment_type": "pc"},
                {"id": "a3", "label": "Macro Note", "assignment_type": "note"},
            ],
            "welcome_routines": [
                {"id": "map2-blue-cross", "name": "MAP2 Blue Cross Welcome"},
            ],
            "selected_welcome_routine_id": "map2-blue-cross",
        }

    def load_state(self):
        return self.state

    def save_state(self, editor_state):
        self.state = dict(editor_state)
        return self.state

    def quick_assignments(self, state):
        assignments = list(state["assignments"])
        return sorted(assignments, key=lambda item: (0 if item["assignment_type"] in {"cc", "pc"} else 1, item["label"]))

    def selected_welcome_routine(self, state):
        selected_id = state.get("selected_welcome_routine_id")
        for routine in state.get("welcome_routines", []):
            if routine.get("id") == selected_id:
                return routine
        return None


def _build_client(monkeypatch, *, manager: _FakePushSurfaceManager, runtime_config: _FakeRuntimeConfigManager, labs_store: _FakePushSurfaceLabsStore | None = None) -> TestClient:
    app = FastAPI()
    app.include_router(push_surface_routes.router)
    monkeypatch.setattr(push_surface_routes, "get_push_surface_manager", lambda: manager)
    monkeypatch.setattr(push_surface_routes, "get_runtime_config_manager", lambda: runtime_config)
    monkeypatch.setattr(push_surface_routes, "get_push_surface_labs_store", lambda: labs_store or _FakePushSurfaceLabsStore())
    monkeypatch.setattr(
        push_surface_routes.PushSurfaceConfig,
        "load",
        classmethod(lambda cls, path=None: PushSurfaceConfig(**asdict(manager.config))),
    )
    monkeypatch.setattr(push_surface_routes, "_save_config", lambda _config: "/tmp/push-surface.json")
    return TestClient(app)


def test_get_push_surface_health_state_and_config(monkeypatch):
    manager = _FakePushSurfaceManager()
    runtime_config = _FakeRuntimeConfigManager()
    runtime_config.values["push_surface.enabled"] = True
    client = _build_client(monkeypatch, manager=manager, runtime_config=runtime_config)

    health_response = client.get("/api/push-surface/health")
    state_response = client.get("/api/push-surface/state")
    config_response = client.get("/api/push-surface/config")

    assert health_response.status_code == 200
    assert health_response.json()["health"]["midi_events_in"] == 11
    assert state_response.status_code == 200
    assert state_response.json()["snapshot"]["state"]["diagnostics"]["raw_events"] == ["90 24 7f"]
    assert config_response.status_code == 200
    assert config_response.json()["runtime_config"]["enabled"] is True
    assert config_response.json()["config"]["bank_size"] == 8


def test_put_push_surface_config_updates_manager_and_shared_runtime_config(monkeypatch):
    manager = _FakePushSurfaceManager()
    runtime_config = _FakeRuntimeConfigManager()
    client = _build_client(monkeypatch, manager=manager, runtime_config=runtime_config)

    response = client.put(
        "/api/push-surface/config",
        json={
            "enabled": True,
            "bank_size": 6,
            "default_bridge": "rest",
            "safe_mode": False,
        },
    )

    assert response.status_code == 200
    assert manager.apply_config_calls[-1]["enabled"] is True
    assert manager.apply_config_calls[-1]["bank_size"] == 6
    assert manager.apply_config_calls[-1]["default_bridge"] == "rest"
    assert runtime_config.values["push_surface.enabled"] is True
    assert runtime_config.values["push_surface.bank_size"] == 6
    assert runtime_config.saved == 1
    assert response.json()["saved_path"] == "/tmp/push-surface.json"


def test_push_surface_lifecycle_and_diagnostics_routes(monkeypatch):
    manager = _FakePushSurfaceManager()
    runtime_config = _FakeRuntimeConfigManager()
    client = _build_client(monkeypatch, manager=manager, runtime_config=runtime_config)

    start_response = client.post("/api/push-surface/start", json={"persist_enabled": True})
    test_pattern_response = client.post("/api/push-surface/diagnostics/test-pattern")
    export_response = client.post("/api/push-surface/diagnostics/export")
    dump_response = client.post("/api/push-surface/diagnostics/dump-capabilities")
    diagnostics_response = client.get("/api/push-surface/diagnostics")

    assert start_response.status_code == 200
    assert start_response.json()["running"] is True
    assert runtime_config.values["push_surface.enabled"] is True
    assert test_pattern_response.json() == {"status": "ok", "emitted_messages": 8}
    assert export_response.json() == {"status": "ok", "export_path": "/tmp/push-diag"}
    assert dump_response.json() == {"status": "ok", "capabilities": {"supports_leds": True}}
    assert diagnostics_response.status_code == 200
    assert diagnostics_response.json()["diagnostics"]["decoded_events"] == ['{"event_type":"pad_press"}']

    stop_response = client.post("/api/push-surface/stop", json={"persist_enabled": True})

    assert stop_response.status_code == 200
    assert stop_response.json()["running"] is False
    assert runtime_config.values["push_surface.enabled"] is False


def test_push_surface_labs_editor_state_routes(monkeypatch):
    manager = _FakePushSurfaceManager()
    runtime_config = _FakeRuntimeConfigManager()
    labs_store = _FakePushSurfaceLabsStore()
    client = _build_client(monkeypatch, manager=manager, runtime_config=runtime_config, labs_store=labs_store)

    get_response = client.get("/api/push-surface/labs/editor-state")
    put_response = client.put(
        "/api/push-surface/labs/editor-state",
        json={
            "editor_state": {
                "schema_version": 1,
                "assignments": [{"id": "b1", "label": "Cluster CC", "assignment_type": "cc"}],
                "welcome_routines": [{"id": "alt", "name": "Alt Welcome"}],
                "selected_welcome_routine_id": "alt",
            }
        },
    )

    assert get_response.status_code == 200
    payload = get_response.json()
    assert [item["assignment_type"] for item in payload["quick_assignments"][:2]] == ["pc", "cc"]
    assert payload["quick_assignments"][2]["assignment_type"] == "note"
    assert payload["selected_welcome_routine"]["id"] == "map2-blue-cross"

    assert put_response.status_code == 200
    assert put_response.json()["selected_welcome_routine"]["id"] == "alt"
    assert put_response.json()["editor_state"]["assignments"] == [{"id": "b1", "label": "Cluster CC", "assignment_type": "cc"}]
    assert manager.refresh_state_calls == 0
