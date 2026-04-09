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
            "discovery": {
                "configured_selection": {
                    "preferred_profile": None,
                    "input_port_id": None,
                    "output_port_id": None,
                    "input_port_name": None,
                    "output_port_name": None,
                },
                "ports": [{"port_id": "push-in", "name": "Push In", "direction": "input"}],
                "matched_device": {
                    "device_id": "push2:push",
                    "input_port_id": "push-in",
                    "output_port_id": "push-out",
                    "input_port_name": "Push In",
                    "output_port_name": "Push Out",
                    "profile": {"profile_id": "push2"},
                },
                "active_device": None,
            },
            "state": {
                "diagnostics": {
                    "raw_events": ["90 24 7f"],
                    "decoded_events": ['{"event_type":"pad_press"}'],
                    "midi_events_in": 11,
                    "midi_events_out": 7,
                }
            },
        }

    async def get_discovery_snapshot(self) -> dict[str, object]:
        return {
            "configured_selection": {
                "preferred_profile": None,
                "input_port_id": None,
                "output_port_id": None,
                "input_port_name": None,
                "output_port_name": None,
            },
            "ports": [{"port_id": "push-in", "name": "Push In", "direction": "input"}],
            "matched_device": {
                "device_id": "push2:push",
                "input_port_id": "push-in",
                "output_port_id": "push-out",
                "input_port_name": "Push In",
                "output_port_name": "Push Out",
                "profile": {"profile_id": "push2"},
            },
            "active_device": None,
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


class _FakeDrumInstance:
    def to_dict(self):
        return {
            "instance_id": "inst-1",
            "node_id": "local",
            "node_label": "Local",
            "snapshot_id": 42,
            "snapshot_name": "Drum Snapshot",
            "chain_id": 7,
            "chain_name": "Main",
            "plugin_id": 9,
            "plugin_uri": "map2://juce/drums",
            "plugin_name": "Drums",
            "plugin_position": 0,
            "display_name": "Drum Snapshot / Main",
            "is_live": True,
            "is_audible": True,
            "source": "snapshot",
            "capability_flags": ["transport", "pads"],
            "last_seen_at": "2026-03-31T20:00:00+00:00",
        }


class _FakeDrumRegistry:
    async def list_instances(self):
        return [_FakeDrumInstance()]


class _FakeAssignment:
    def __init__(self, role: str, descriptor) -> None:
        self.role = role
        self.descriptor = descriptor

    def to_dict(self):
        return {
            "fingerprint": "fp-1",
            "role": self.role,
            "input_port_name": self.descriptor.input_port_name,
            "output_port_name": self.descriptor.output_port_name,
        }


class _FakeAssignmentService:
    def __init__(self) -> None:
        self.assignments = []

    def list_assignments(self):
        return self.assignments

    def assign_role(self, descriptor, role):
        assignment = _FakeAssignment(role, descriptor)
        self.assignments = [assignment]
        return assignment

    def resolve_device(self, _descriptor):
        return {
            "fingerprint": "fp-1",
            "status": "assigned",
            "assignment": {
                "fingerprint": "fp-1",
                "role": "push_drum_machine",
            },
        }


class _FakePushDrumSessionService:
    def get_pending_confirmation_summary(self):
        return {
            "pending_confirmation": {
                "action_id": "push-confirm-demo",
                "action_type": "instance_switch",
                "reason": "remote_instance",
                "device_fingerprint": "fp-1",
                "device_identity": "fp-1",
                "target_instance_id": "inst-1",
                "target_display_name": "Remote / Drum Snapshot",
                "target_node_id": "node-remote",
                "target_node_label": "Remote",
                "created_at": 1000.0,
                "expires_at": 1015.0,
                "timeout_ms": 15000,
                "accept_command": "accept_pending_confirmation",
                "reject_command": "reject_pending_confirmation",
            },
            "pending_count": 1,
        }

    async def get_surface_state(self, device_fingerprint: str):
        return {
            "session": {
                "device_fingerprint": device_fingerprint,
                "selected_instance_id": "inst-1",
                "bank_index": 0,
                "last_command": None,
                "pending_confirmation": None,
                "last_confirmation_resolution": None,
            },
            "available_instances": [{"instance_id": "inst-1"}],
            "selected_projection": {"instance": {"instance_id": "inst-1"}},
        }

    async def dispatch_command(self, device_fingerprint: str, command: str, payload: dict[str, object] | None = None):
        action_id = str((payload or {}).get("action_id") or "push-confirm-demo")
        return {
            "status": "ok",
            "session": {
                "device_fingerprint": device_fingerprint,
                "selected_instance_id": payload.get("instance_id") if payload else "inst-1",
                "bank_index": 0,
                "last_command": command,
                "pending_confirmation": {
                    "action_id": action_id,
                    "action_type": "instance_switch",
                    "reason": "remote_instance",
                    "device_fingerprint": device_fingerprint,
                    "target_instance_id": payload.get("instance_id", "inst-1") if payload else "inst-1",
                    "target_display_name": "Remote / Drum Snapshot",
                    "target_node_id": "node-remote",
                    "target_node_label": "Remote",
                    "created_at": 1000.0,
                    "expires_at": 1015.0,
                    "timeout_ms": 15000,
                    "accept_command": "accept_pending_confirmation",
                    "reject_command": "reject_pending_confirmation",
                }
                if command == "select_instance"
                else None,
                "last_confirmation_resolution": {
                    "action_id": action_id,
                    "action_type": "instance_switch",
                    "status": "accepted" if command == "accept_pending_confirmation" else "rejected",
                    "reason": "remote_instance",
                    "device_fingerprint": device_fingerprint,
                    "target_instance_id": payload.get("instance_id", "inst-1") if payload else "inst-1",
                    "resolved_at": 1005.0,
                }
                if command in {"accept_pending_confirmation", "reject_pending_confirmation"}
                else None,
            },
            "available_instances": [{"instance_id": "inst-1"}],
            "selected_projection": {"instance": {"instance_id": payload.get("instance_id", "inst-1") if payload else "inst-1"}},
        }


def _build_client(monkeypatch, *, manager: _FakePushSurfaceManager, runtime_config: _FakeRuntimeConfigManager, labs_store: _FakePushSurfaceLabsStore | None = None) -> TestClient:
    app = FastAPI()
    app.include_router(push_surface_routes.router)
    assignment_service = _FakeAssignmentService()
    monkeypatch.setattr(push_surface_routes, "get_push_surface_manager", lambda: manager)
    monkeypatch.setattr(push_surface_routes, "get_runtime_config_manager", lambda: runtime_config)
    monkeypatch.setattr(push_surface_routes, "get_push_surface_labs_store", lambda: labs_store or _FakePushSurfaceLabsStore())
    monkeypatch.setattr(push_surface_routes, "get_drum_instance_registry", lambda: _FakeDrumRegistry())
    monkeypatch.setattr(push_surface_routes, "get_push_device_assignment_service", lambda: assignment_service)
    monkeypatch.setattr(push_surface_routes, "get_push_drum_session_service", lambda: _FakePushDrumSessionService())
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
    discovery_response = client.get("/api/push-surface/discovery")
    config_response = client.get("/api/push-surface/config")

    assert health_response.status_code == 200
    assert health_response.json()["health"]["midi_events_in"] == 11
    assert state_response.status_code == 200
    assert state_response.json()["snapshot"]["state"]["diagnostics"]["raw_events"] == ["90 24 7f"]
    assert discovery_response.status_code == 200
    assert discovery_response.json()["discovery"]["matched_device"]["device_id"] == "push2:push"
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


def test_push_surface_drum_registry_assignment_and_session_routes(monkeypatch):
    manager = _FakePushSurfaceManager()
    runtime_config = _FakeRuntimeConfigManager()
    client = _build_client(monkeypatch, manager=manager, runtime_config=runtime_config)

    instances = client.get("/api/push-surface/drum-instances")
    assign = client.post(
        "/api/push-surface/device-assignments",
        json={
            "input_port_name": "Push 1 In",
            "output_port_name": "Push 1 Out",
            "profile_id": "push1",
            "role": "push_drum_machine",
        },
    )
    resolve = client.post(
        "/api/push-surface/device-assignments/resolve",
        json={
            "input_port_name": "Push 1 In",
            "output_port_name": "Push 1 Out",
            "profile_id": "push1",
        },
    )
    session = client.get("/api/push-surface/drum-session/state", params={"device_fingerprint": "fp-1"})
    command = client.post(
        "/api/push-surface/drum-session/command",
        json={
            "device_fingerprint": "fp-1",
            "command": "select_instance",
            "payload": {"instance_id": "inst-1"},
        },
    )

    assert instances.status_code == 200
    assert instances.json()["instances"][0]["instance_id"] == "inst-1"
    assert assign.status_code == 200
    assert assign.json()["assignment"]["role"] == "push_drum_machine"
    assert resolve.status_code == 200
    assert resolve.json()["status"] == "assigned"
    assert session.status_code == 200
    assert session.json()["session"]["device_fingerprint"] == "fp-1"
    assert command.status_code == 200
    assert command.json()["session"]["last_command"] == "select_instance"
    assert command.json()["session"]["pending_confirmation"]["accept_command"] == "accept_pending_confirmation"


def test_push_surface_pending_confirmation_summary_route(monkeypatch):
    manager = _FakePushSurfaceManager()
    runtime_config = _FakeRuntimeConfigManager()
    client = _build_client(monkeypatch, manager=manager, runtime_config=runtime_config)

    response = client.get("/api/push-surface/pending-confirmation")

    assert response.status_code == 200
    assert response.json()["pending_confirmation"]["device_identity"] == "fp-1"
    assert response.json()["pending_count"] == 1


def test_push_surface_drum_session_accepts_pending_confirmation_commands(monkeypatch):
    manager = _FakePushSurfaceManager()
    runtime_config = _FakeRuntimeConfigManager()
    client = _build_client(monkeypatch, manager=manager, runtime_config=runtime_config)

    command = client.post(
        "/api/push-surface/drum-session/command",
        json={
            "device_fingerprint": "fp-1",
            "command": "accept_pending_confirmation",
            "payload": {"action_id": "push-confirm-123", "instance_id": "inst-1"},
        },
    )

    assert command.status_code == 200
    assert command.json()["session"]["last_command"] == "accept_pending_confirmation"
    assert command.json()["session"]["last_confirmation_resolution"]["status"] == "accepted"


def test_push_surface_drum_session_accepts_transport_commands(monkeypatch):
    manager = _FakePushSurfaceManager()
    runtime_config = _FakeRuntimeConfigManager()
    client = _build_client(monkeypatch, manager=manager, runtime_config=runtime_config)

    command = client.post(
        "/api/push-surface/drum-session/command",
        json={
            "device_fingerprint": "fp-1",
            "command": "play",
            "payload": {},
        },
    )

    assert command.status_code == 200
    assert command.json()["session"]["last_command"] == "play"
