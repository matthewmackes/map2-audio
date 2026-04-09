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
                "pad_bank_index": 0,
                "pad_velocity_mode_enabled": False,
                "pad_velocity_source_pad": None,
                "repeat_enabled": False,
                "repeat_rate": None,
                "quantize_enabled": False,
                "quantize_grid": None,
                "quantize_strength": 100,
                "fixed_length_enabled": False,
                "fixed_length_preset": None,
                "step_grid_page": 0,
                "selected_step_index": None,
                "selected_step_instrument": None,
                "loop_selector_enabled": False,
                "loop_selector_page": 0,
                "loop_start_step": None,
                "loop_end_step": None,
                "last_command": None,
                "pending_confirmation": None,
                "last_confirmation_resolution": None,
            },
            "available_instances": [{"instance_id": "inst-1"}],
            "selected_projection": {"instance": {"instance_id": "inst-1"}},
            "drum_projection": {
                "instance": {"instance_id": "inst-1"},
                "transport": {"is_playing": False, "bpm": 120, "pattern_id": 0, "step": 0, "bar": 1, "beat": 1},
                "pads": [{"physical_pad": 0, "logical_pad": 0, "name": "Kick", "mute": False, "solo": False, "armed": True, "source": "sample", "color": "green", "bus_assignment": 0, "volume": 100.0}],
                "current_bank": {"index": 0, "start_pad": 0, "end_pad": 15},
                "modes": {
                    "pad_velocity_mode": {"enabled": False, "source_pad": None},
                    "repeat": {"enabled": False, "rate": None},
                    "quantize": {"enabled": False, "grid": None, "strength": 100},
                    "fixed_length": {"enabled": False, "preset": None},
                    "step_grid": {"page": 0, "selected_step_index": None, "selected_step_instrument": None},
                    "loop_selector": {"enabled": False, "page": 0, "start_step": None, "end_step": None},
                },
                "step_grid": {
                    "pattern_id": 0,
                    "selected_pad": 0,
                    "page": 0,
                    "page_start_step": 0,
                    "page_end_step": 15,
                    "selected_step_index": None,
                    "selected_step_instrument": None,
                    "selected_step": None,
                    "steps": [],
                },
                "browser": {
                    "favorites": [],
                    "recent": [],
                    "quick_shortcuts": [],
                    "last_browse_payload": {},
                },
                "confirmation": None,
                "display": {
                    "transport_safe": False,
                    "fallback": "led_only",
                    "title": "Pattern 001",
                    "lines": ["No kit loaded", "Kick", "Step 01", "LED fallback"],
                },
            },
            "surface_modes": {
                "pad_velocity_mode": {
                    "enabled": False,
                    "source_pad": None,
                    "velocity_levels": [8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 127],
                },
                "repeat": {
                    "enabled": False,
                    "rate": None,
                    "available_rates": ["1/4", "1/8", "1/16", "1/32", "triplet"],
                },
                "quantize": {
                    "enabled": False,
                    "grid": None,
                    "strength": 100,
                    "available_grids": ["1/4", "1/8", "1/16", "1/32"],
                },
                "pad_bank": {
                    "index": 0,
                    "count": 4,
                    "pads_per_bank": 16,
                    "logical_pad_start": 0,
                    "logical_pad_end": 15,
                },
                "fixed_length": {
                    "enabled": False,
                    "preset": None,
                    "bars": None,
                    "beats": None,
                    "steps": None,
                    "available_presets": ["1/2", "1", "2", "4", "8", "16", "32"],
                },
                "loop_selector": {
                    "enabled": False,
                    "page": 0,
                    "start_step": None,
                    "end_step": None,
                    "length_steps": None,
                },
            },
            "pad_grid": [{"physical_pad": pad, "logical_pad": pad, "velocity": None} for pad in range(16)],
        }

    async def dispatch_command(self, device_fingerprint: str, command: str, payload: dict[str, object] | None = None):
        action_id = str((payload or {}).get("action_id") or "push-confirm-demo")
        return {
            "status": "ok",
            "session": {
                "device_fingerprint": device_fingerprint,
                "selected_instance_id": payload.get("instance_id") if payload else "inst-1",
                "bank_index": 0,
                "pad_bank_index": int((payload or {}).get("bank_index", 0)) if command == "set_64_pad_bank" else 0,
                "pad_velocity_mode_enabled": bool((payload or {}).get("enabled")) if command == "set_pad_velocity_mode" else False,
                "pad_velocity_source_pad": (payload or {}).get("pad") if command == "set_pad_velocity_mode" else None,
                "repeat_enabled": bool((payload or {}).get("enabled")) if command == "set_repeat" else False,
                "repeat_rate": (payload or {}).get("rate") if command == "set_repeat" else None,
                "quantize_enabled": bool((payload or {}).get("enabled")) if command == "set_quantize" else False,
                "quantize_grid": (payload or {}).get("grid") if command == "set_quantize" else None,
                "quantize_strength": int((payload or {}).get("strength", 100)) if command == "set_quantize" else 100,
                "fixed_length_enabled": bool((payload or {}).get("enabled")) if command == "set_fixed_length" else False,
                "fixed_length_preset": (payload or {}).get("preset") if command == "set_fixed_length" else None,
                "step_grid_page": int((payload or {}).get("page", 0)) if command in {"set_step", "set_step_automation"} else 0,
                "selected_step_index": int((payload or {}).get("step", ((payload or {}).get("page", 0) * 16) + (payload or {}).get("pad", 0))) if command in {"set_step", "set_step_automation", "clear_step"} else None,
                "selected_step_instrument": int((payload or {}).get("instrument", 0)) if command in {"set_step", "set_step_automation", "clear_step"} else None,
                "loop_selector_enabled": bool((payload or {}).get("enabled")) if command == "set_loop_selector" else False,
                "loop_selector_page": int((payload or {}).get("page", 0)) if command == "set_loop_selector" else 0,
                "loop_start_step": 16 if command == "set_loop_selector" else None,
                "loop_end_step": 23 if command == "set_loop_selector" else None,
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
            "drum_projection": {
                "instance": {"instance_id": payload.get("instance_id", "inst-1") if payload else "inst-1"},
                "transport": {"is_playing": command == "play", "bpm": 120, "pattern_id": 0, "step": 0, "bar": 1, "beat": 1},
                "pads": [{"physical_pad": 0, "logical_pad": 0, "name": "Kick", "mute": False, "solo": False, "armed": True, "source": "sample", "color": "green", "bus_assignment": 0, "volume": 100.0}],
                "current_bank": {"index": int((payload or {}).get("bank_index", 0)) if command == "set_64_pad_bank" else 0, "start_pad": 0, "end_pad": 15},
                "modes": {
                    "pad_velocity_mode": {
                        "enabled": bool((payload or {}).get("enabled")) if command == "set_pad_velocity_mode" else False,
                        "source_pad": (payload or {}).get("pad") if command == "set_pad_velocity_mode" else None,
                    },
                    "repeat": {
                        "enabled": bool((payload or {}).get("enabled")) if command == "set_repeat" else False,
                        "rate": (payload or {}).get("rate") if command == "set_repeat" else None,
                    },
                    "quantize": {
                        "enabled": bool((payload or {}).get("enabled")) if command == "set_quantize" else False,
                        "grid": (payload or {}).get("grid") if command == "set_quantize" else None,
                        "strength": int((payload or {}).get("strength", 100)) if command == "set_quantize" else 100,
                    },
                    "fixed_length": {
                        "enabled": bool((payload or {}).get("enabled")) if command == "set_fixed_length" else False,
                        "preset": (payload or {}).get("preset") if command == "set_fixed_length" else None,
                    },
                    "step_grid": {
                        "page": int((payload or {}).get("page", 0)) if command in {"set_step", "set_step_automation"} else 0,
                        "selected_step_index": int((payload or {}).get("step", ((payload or {}).get("page", 0) * 16) + (payload or {}).get("pad", 0))) if command in {"set_step", "set_step_automation", "clear_step"} else None,
                        "selected_step_instrument": int((payload or {}).get("instrument", 0)) if command in {"set_step", "set_step_automation", "clear_step"} else None,
                    },
                    "loop_selector": {
                        "enabled": bool((payload or {}).get("enabled")) if command == "set_loop_selector" else False,
                        "page": int((payload or {}).get("page", 0)) if command == "set_loop_selector" else 0,
                        "start_step": 16 if command == "set_loop_selector" else None,
                        "end_step": 23 if command == "set_loop_selector" else None,
                    },
                },
                "step_grid": {
                    "pattern_id": 0,
                    "selected_pad": int((payload or {}).get("instrument", 0)) if command in {"set_step", "set_step_automation", "clear_step"} else 0,
                    "page": int((payload or {}).get("page", 0)) if command in {"set_step", "set_step_automation"} else 0,
                    "page_start_step": (int((payload or {}).get("page", 0)) * 16) if command in {"set_step", "set_step_automation"} else 0,
                    "page_end_step": ((int((payload or {}).get("page", 0)) * 16) + 15) if command in {"set_step", "set_step_automation"} else 15,
                    "selected_step_index": int((payload or {}).get("step", ((payload or {}).get("page", 0) * 16) + (payload or {}).get("pad", 0))) if command in {"set_step", "set_step_automation", "clear_step"} else None,
                    "selected_step_instrument": int((payload or {}).get("instrument", 0)) if command in {"set_step", "set_step_automation", "clear_step"} else None,
                    "selected_step": {
                        "step": int((payload or {}).get("step", ((payload or {}).get("page", 0) * 16) + (payload or {}).get("pad", 0))),
                        "active": command != "clear_step",
                        "velocity": int((payload or {}).get("velocity", 100)),
                        "probability": float((payload or {}).get("probability", 1.0)),
                        "micro_timing": int((payload or {}).get("micro_timing", 0)),
                        "pitch": (payload or {}).get("pitch"),
                        "length": (payload or {}).get("length"),
                        "ratchet_count": 1,
                        "is_playhead": False,
                        "selected": True,
                    }
                    if command in {"set_step", "set_step_automation", "clear_step"}
                    else None,
                    "steps": [
                        {
                            "step": ((int((payload or {}).get("page", 0)) * 16) + index) if command in {"set_step", "set_step_automation"} else index,
                            "active": index == int((payload or {}).get("pad", 0)) if command == "set_step" else False,
                            "velocity": int((payload or {}).get("velocity", 100)) if index == int((payload or {}).get("pad", -1)) and command in {"set_step", "set_step_automation"} else 0,
                            "probability": float((payload or {}).get("probability", 1.0)),
                            "micro_timing": int((payload or {}).get("micro_timing", 0)),
                            "pitch": (payload or {}).get("pitch"),
                            "length": (payload or {}).get("length"),
                            "ratchet_count": 1,
                            "is_playhead": False,
                            "selected": index == int((payload or {}).get("pad", 0)) if command in {"set_step", "set_step_automation", "clear_step"} else False,
                        }
                        for index in range(16)
                    ],
                },
                "browser": {
                    "favorites": [],
                    "recent": [],
                    "quick_shortcuts": [],
                    "last_browse_payload": {},
                },
                "confirmation": {
                    "action_id": action_id,
                }
                if command == "select_instance"
                else None,
                "display": {
                    "transport_safe": False,
                    "fallback": "led_only",
                    "title": "Pattern 001",
                    "lines": ["No kit loaded", "Kick", "Step 01", "LED fallback"],
                },
            },
            "surface_modes": {
                "pad_velocity_mode": {
                    "enabled": bool((payload or {}).get("enabled")) if command == "set_pad_velocity_mode" else False,
                    "source_pad": (payload or {}).get("pad") if command == "set_pad_velocity_mode" else None,
                    "velocity_levels": [8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 127],
                },
                "repeat": {
                    "enabled": bool((payload or {}).get("enabled")) if command == "set_repeat" else False,
                    "rate": (payload or {}).get("rate") if command == "set_repeat" else None,
                    "available_rates": ["1/4", "1/8", "1/16", "1/32", "triplet"],
                },
                "quantize": {
                    "enabled": bool((payload or {}).get("enabled")) if command == "set_quantize" else False,
                    "grid": (payload or {}).get("grid") if command == "set_quantize" else None,
                    "strength": int((payload or {}).get("strength", 100)) if command == "set_quantize" else 100,
                    "available_grids": ["1/4", "1/8", "1/16", "1/32"],
                },
                "pad_bank": {
                    "index": int((payload or {}).get("bank_index", 0)) if command == "set_64_pad_bank" else 0,
                    "count": 4,
                    "pads_per_bank": 16,
                    "logical_pad_start": 0,
                    "logical_pad_end": 15,
                },
                "fixed_length": {
                    "enabled": bool((payload or {}).get("enabled")) if command == "set_fixed_length" else False,
                    "preset": (payload or {}).get("preset") if command == "set_fixed_length" else None,
                    "bars": 4 if command == "set_fixed_length" and (payload or {}).get("preset") == "4" else None,
                    "beats": 16 if command == "set_fixed_length" and (payload or {}).get("preset") == "4" else None,
                    "steps": 64 if command == "set_fixed_length" and (payload or {}).get("preset") == "4" else None,
                    "available_presets": ["1/2", "1", "2", "4", "8", "16", "32"],
                },
                "loop_selector": {
                    "enabled": bool((payload or {}).get("enabled")) if command == "set_loop_selector" else False,
                    "page": int((payload or {}).get("page", 0)) if command == "set_loop_selector" else 0,
                    "start_step": 16 if command == "set_loop_selector" else None,
                    "end_step": 23 if command == "set_loop_selector" else None,
                    "length_steps": 8 if command == "set_loop_selector" else None,
                },
            },
            "pad_grid": [{"physical_pad": pad, "logical_pad": pad, "velocity": None} for pad in range(16)],
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
    assert session.json()["drum_projection"]["display"]["fallback"] == "led_only"
    assert command.status_code == 200
    assert command.json()["session"]["last_command"] == "select_instance"
    assert command.json()["session"]["pending_confirmation"]["accept_command"] == "accept_pending_confirmation"
    assert command.json()["drum_projection"]["confirmation"]["action_id"] == "push-confirm-demo"


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


def test_push_surface_drum_session_accepts_phase_a2_mode_commands(monkeypatch):
    manager = _FakePushSurfaceManager()
    runtime_config = _FakeRuntimeConfigManager()
    client = _build_client(monkeypatch, manager=manager, runtime_config=runtime_config)

    velocity_mode = client.post(
        "/api/push-surface/drum-session/command",
        json={
            "device_fingerprint": "fp-1",
            "command": "set_pad_velocity_mode",
            "payload": {"enabled": True, "pad": 18},
        },
    )
    pad_bank = client.post(
        "/api/push-surface/drum-session/command",
        json={
            "device_fingerprint": "fp-1",
            "command": "set_64_pad_bank",
            "payload": {"bank_index": 2},
        },
    )
    fixed_length = client.post(
        "/api/push-surface/drum-session/command",
        json={
            "device_fingerprint": "fp-1",
            "command": "set_fixed_length",
            "payload": {"enabled": True, "preset": "4"},
        },
    )
    repeat = client.post(
        "/api/push-surface/drum-session/command",
        json={
            "device_fingerprint": "fp-1",
            "command": "set_repeat",
            "payload": {"enabled": True, "rate": "1/16"},
        },
    )
    quantize = client.post(
        "/api/push-surface/drum-session/command",
        json={
            "device_fingerprint": "fp-1",
            "command": "set_quantize",
            "payload": {"enabled": True, "grid": "1/8", "strength": 60},
        },
    )
    loop_selector = client.post(
        "/api/push-surface/drum-session/command",
        json={
            "device_fingerprint": "fp-1",
            "command": "set_loop_selector",
            "payload": {"enabled": True, "page": 1, "start_pad": 0, "end_pad": 7},
        },
    )

    assert velocity_mode.status_code == 200
    assert velocity_mode.json()["session"]["pad_velocity_mode_enabled"] is True
    assert velocity_mode.json()["surface_modes"]["pad_velocity_mode"]["source_pad"] == 18
    assert pad_bank.status_code == 200
    assert pad_bank.json()["session"]["pad_bank_index"] == 2
    assert fixed_length.status_code == 200
    assert fixed_length.json()["session"]["fixed_length_preset"] == "4"
    assert repeat.status_code == 200
    assert repeat.json()["session"]["repeat_rate"] == "1/16"
    assert quantize.status_code == 200
    assert quantize.json()["surface_modes"]["quantize"]["strength"] == 60
    assert loop_selector.status_code == 200
    assert loop_selector.json()["session"]["loop_start_step"] == 16
    assert quantize.json()["drum_projection"]["modes"]["quantize"]["strength"] == 60
    assert fixed_length.json()["drum_projection"]["modes"]["fixed_length"]["preset"] == "4"


def test_push_surface_drum_session_accepts_step_grid_and_automation_commands(monkeypatch):
    manager = _FakePushSurfaceManager()
    runtime_config = _FakeRuntimeConfigManager()
    client = _build_client(monkeypatch, manager=manager, runtime_config=runtime_config)

    set_step = client.post(
        "/api/push-surface/drum-session/command",
        json={
            "device_fingerprint": "fp-1",
            "command": "set_step",
            "payload": {"instrument": 4, "page": 1, "pad": 3, "velocity": 96},
        },
    )
    set_automation = client.post(
        "/api/push-surface/drum-session/command",
        json={
            "device_fingerprint": "fp-1",
            "command": "set_step_automation",
            "payload": {"instrument": 4, "step": 19, "velocity": 108, "pitch": 5.0, "length": 2.5, "probability": 0.4},
        },
    )
    clear_step = client.post(
        "/api/push-surface/drum-session/command",
        json={
            "device_fingerprint": "fp-1",
            "command": "clear_step",
            "payload": {"instrument": 4, "step": 19},
        },
    )

    assert set_step.status_code == 200
    assert set_step.json()["session"]["step_grid_page"] == 1
    assert set_step.json()["session"]["selected_step_index"] == 19
    assert set_step.json()["drum_projection"]["step_grid"]["selected_step"]["active"] is True
    assert set_automation.status_code == 200
    assert set_automation.json()["drum_projection"]["step_grid"]["selected_step"]["pitch"] == 5.0
    assert set_automation.json()["drum_projection"]["step_grid"]["selected_step"]["length"] == 2.5
    assert set_automation.json()["drum_projection"]["step_grid"]["selected_step"]["probability"] == 0.4
    assert clear_step.status_code == 200
    assert clear_step.json()["drum_projection"]["step_grid"]["selected_step"]["active"] is False
