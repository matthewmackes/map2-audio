"""Persistent Labs editor state for Push control mappings and welcome routines."""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path
from typing import Any

from app.utils.singleton import Singleton


def _default_store_path() -> Path:
    return Path(os.getenv("MAP2_PUSH_SURFACE_LABS_STORE", Path.home() / ".map2" / "push_surface_labs.json"))


def _grid_cross_outline() -> dict[str, dict[str, Any]]:
    lights: dict[str, dict[str, Any]] = {}
    for y in range(8):
        for x in range(8):
            color = "OFF"
            pulse = False
            if x in {0, 7} or y in {0, 7}:
                color = "DIM"
            if x == 3 or x == 4 or y == 3 or y == 4:
                color = "BLUE"
                pulse = True
            lights[f"grid_{x}_{y}"] = {"color": color, "pulse": pulse}
    return lights


DEFAULT_WELCOME_ROUTINES: list[dict[str, Any]] = [
    {
        "id": "map2-blue-cross",
        "name": "MAP2 Blue Cross Welcome",
        "description": "Blue cross plus outline logo greeting with node stats and home-page handoff.",
        "category": "welcome",
        "is_example": False,
        "run_on_connect": True,
        "duration_ms": 7000,
        "handoff_page": "home",
        "steps": [
            {
                "id": "intro-cross",
                "duration_ms": 2000,
                "pad_lights": _grid_cross_outline(),
                "display": {
                    "title": "WELCOME",
                    "lines": (
                        "{node_name}",
                        "{firmware_profile}",
                        "Score {node_score}/10",
                        "{cluster_status}",
                    ),
                },
            },
            {
                "id": "snapshot-status",
                "duration_ms": 2500,
                "pad_lights": _grid_cross_outline(),
                "button_lights": {
                    "page_home": {"color": "WHITE", "pulse": True},
                    "page_parameters": {"color": "BLUE"},
                    "page_presets": {"color": "CYAN"},
                },
                "display": {
                    "title": "MAP2 READY",
                    "lines": (
                        "Preset {current_preset}",
                        "Snapshot {current_snapshot}",
                        "CPU {cpu_load}",
                        "Press any control",
                    ),
                },
            },
            {
                "id": "handoff",
                "duration_ms": 2500,
                "pad_lights": _grid_cross_outline(),
                "display": {
                    "title": "HOME",
                    "lines": (
                        "Opening surface home",
                        "Profile {firmware_profile}",
                        "Role {cluster_status}",
                        "Welcome to MAP2",
                    ),
                },
            },
        ],
    },
    {
        "id": "diagonal-sweep",
        "name": "Diagonal Sweep",
        "description": "Blue diagonal chase across the 8x8 grid.",
        "category": "animation",
        "is_example": True,
        "run_on_connect": False,
        "duration_ms": 3000,
        "handoff_page": "home",
        "steps": [
            {
                "id": f"diag-{index}",
                "duration_ms": 300,
                "pad_lights": {
                    f"grid_{x}_{y}": {
                        "color": "BLUE" if x + y == index else "DIM",
                        "pulse": x + y == index,
                    }
                    for y in range(8)
                    for x in range(8)
                },
                "display": {"title": "DIAGONAL", "lines": (f"Step {index + 1}",)},
            }
            for index in range(8)
        ],
    },
    {
        "id": "cluster-heartbeat",
        "name": "Cluster Heartbeat",
        "description": "Pulsing center-heart pattern for cluster-ready systems.",
        "category": "status",
        "is_example": True,
        "run_on_connect": False,
        "duration_ms": 2800,
        "handoff_page": "home",
        "steps": [
            {
                "id": "cluster-heartbeat-a",
                "duration_ms": 700,
                "pad_lights": {
                    f"grid_{x}_{y}": {"color": "BLUE" if 2 <= x <= 5 and 2 <= y <= 5 else "OFF", "pulse": True}
                    for y in range(8)
                    for x in range(8)
                },
                "display": {"title": "CLUSTER", "lines": ("Role {cluster_status}",)},
            },
            {
                "id": "cluster-heartbeat-b",
                "duration_ms": 700,
                "pad_lights": {
                    f"grid_{x}_{y}": {"color": "CYAN" if 1 <= x <= 6 and 1 <= y <= 6 else "OFF", "pulse": False}
                    for y in range(8)
                    for x in range(8)
                },
                "display": {"title": "CLUSTER", "lines": ("Node {node_name}",)},
            },
            {
                "id": "cluster-heartbeat-c",
                "duration_ms": 700,
                "pad_lights": {
                    f"grid_{x}_{y}": {"color": "WHITE" if x in {3, 4} or y in {3, 4} else "DIM", "pulse": True}
                    for y in range(8)
                    for x in range(8)
                },
                "display": {"title": "CLUSTER", "lines": ("Score {node_score}/10",)},
            },
            {
                "id": "cluster-heartbeat-d",
                "duration_ms": 700,
                "pad_lights": _grid_cross_outline(),
                "display": {"title": "CLUSTER", "lines": ("Ready",)},
            },
        ],
    },
    {
        "id": "touchstrip-breath",
        "name": "Touchstrip Breath",
        "description": "Soft blue-to-cyan welcome focused on touchstrip and encoder page.",
        "category": "animation",
        "is_example": True,
        "run_on_connect": False,
        "duration_ms": 2400,
        "handoff_page": "parameters",
        "steps": [
            {"id": "touch-a", "duration_ms": 800, "button_lights": {"page_parameters": {"color": "BLUE", "pulse": True}}, "display": {"title": "PARAMETERS", "lines": ("Touchstrip breath",)}},
            {"id": "touch-b", "duration_ms": 800, "button_lights": {"page_parameters": {"color": "CYAN", "pulse": True}}, "display": {"title": "PARAMETERS", "lines": ("Macro focus",)}},
            {"id": "touch-c", "duration_ms": 800, "button_lights": {"page_parameters": {"color": "WHITE", "pulse": True}}, "display": {"title": "PARAMETERS", "lines": ("Ready",)}},
        ],
    },
    {
        "id": "preset-ladder",
        "name": "Preset Ladder",
        "description": "Scrolling top-to-bottom preset lane wake-up.",
        "category": "preset",
        "is_example": True,
        "run_on_connect": False,
        "duration_ms": 3200,
        "handoff_page": "presets",
        "steps": [
            {
                "id": f"preset-row-{row}",
                "duration_ms": 400,
                "pad_lights": {
                    f"grid_{x}_{y}": {"color": "CYAN" if y == row else "DIM", "pulse": y == row}
                    for y in range(8)
                    for x in range(8)
                },
                "display": {"title": "PRESETS", "lines": (f"Bank row {row + 1}", "{current_preset}")},
            }
            for row in range(8)
        ],
    },
    {
        "id": "xrun-alert",
        "name": "XRUN Alert Demo",
        "description": "Critical warning burst for xrun monitoring demonstrations.",
        "category": "status",
        "is_example": True,
        "run_on_connect": False,
        "duration_ms": 1800,
        "handoff_page": "diagnostics",
        "steps": [
            {"id": "xrun-a", "duration_ms": 600, "pad_lights": {f"grid_{x}_{y}": {"color": "RED", "blink": True} for y in range(8) for x in range(8)}, "display": {"title": "XRUN", "lines": ("Investigate latency",)}},
            {"id": "xrun-b", "duration_ms": 600, "pad_lights": {f"grid_{x}_{y}": {"color": "OFF"} for y in range(8) for x in range(8)}, "display": {"title": "XRUN", "lines": ("CPU {cpu_load}",)}},
            {"id": "xrun-c", "duration_ms": 600, "pad_lights": {f"grid_{x}_{y}": {"color": "AMBER", "pulse": True} for y in range(8) for x in range(8)}, "display": {"title": "XRUN", "lines": ("Score {node_score}/10",)}},
        ],
    },
    {
        "id": "encoder-chase",
        "name": "Encoder Chase",
        "description": "Walk the top encoder row for knob-centric diagnostics.",
        "category": "animation",
        "is_example": True,
        "run_on_connect": False,
        "duration_ms": 2400,
        "handoff_page": "parameters",
        "steps": [
            {
                "id": f"encoder-{index}",
                "duration_ms": 300,
                "button_lights": {
                    f"encoder_touch_{touch}": {"color": "BLUE" if touch == index else "OFF"}
                    for touch in range(8)
                },
                "display": {"title": "ENCODERS", "lines": (f"Focus ENC {index + 1}",)},
            }
            for index in range(8)
        ],
    },
    {
        "id": "routing-matrix-glow",
        "name": "Routing Matrix Glow",
        "description": "Matrix-style routing preview for AVB or path routing.",
        "category": "routing",
        "is_example": True,
        "run_on_connect": False,
        "duration_ms": 2100,
        "handoff_page": "routing",
        "steps": [
            {
                "id": "routing-a",
                "duration_ms": 700,
                "pad_lights": {
                    f"grid_{x}_{y}": {"color": "CYAN" if x == y else "DIM"}
                    for y in range(8)
                    for x in range(8)
                },
                "display": {"title": "ROUTING", "lines": ("Matrix preview",)},
            },
            {
                "id": "routing-b",
                "duration_ms": 700,
                "pad_lights": {
                    f"grid_{x}_{y}": {"color": "BLUE" if x + y == 7 else "DIM"}
                    for y in range(8)
                    for x in range(8)
                },
                "display": {"title": "ROUTING", "lines": ("Safe mode on",)},
            },
            {
                "id": "routing-c",
                "duration_ms": 700,
                "pad_lights": _grid_cross_outline(),
                "display": {"title": "ROUTING", "lines": ("Ready",)},
            },
        ],
    },
    {
        "id": "cluster-role-banner",
        "name": "Cluster Role Banner",
        "description": "Role-aware banner for management or audio nodes.",
        "category": "status",
        "is_example": True,
        "run_on_connect": False,
        "duration_ms": 2000,
        "handoff_page": "cluster",
        "steps": [
            {"id": "cluster-role-a", "duration_ms": 1000, "pad_lights": _grid_cross_outline(), "display": {"title": "ROLE", "lines": ("{cluster_status}", "{node_name}")}},
            {"id": "cluster-role-b", "duration_ms": 1000, "pad_lights": _grid_cross_outline(), "display": {"title": "ROLE", "lines": ("Firmware {firmware_profile}",)}},
        ],
    },
    {
        "id": "snapshot-scorecard",
        "name": "Snapshot Scorecard",
        "description": "Snapshot-centric scorecard for recall workflows.",
        "category": "preset",
        "is_example": True,
        "run_on_connect": False,
        "duration_ms": 2600,
        "handoff_page": "presets",
        "steps": [
            {"id": "snapshot-a", "duration_ms": 1300, "pad_lights": _grid_cross_outline(), "display": {"title": "SNAPSHOT", "lines": ("{current_snapshot}", "{current_preset}")}},
            {"id": "snapshot-b", "duration_ms": 1300, "pad_lights": _grid_cross_outline(), "display": {"title": "SNAPSHOT", "lines": ("Score {node_score}/10", "CPU {cpu_load}")}},
        ],
    },
]


DEFAULT_ASSIGNMENTS: list[dict[str, Any]] = [
    {
        "id": "qa-01",
        "control_id": "btn_01",
        "control_label": "Tap Tempo",
        "interaction": "tap",
        "assignment_type": "cc",
        "label": "Tap Tempo CC",
        "device_scope": "device:auto",
        "payload": {"midi_channel": 1, "cc": 64, "value": 127},
        "enabled": True,
        "is_example": True,
    },
    {
        "id": "qa-02",
        "control_id": "btn_19",
        "control_label": "Record",
        "interaction": "tap",
        "assignment_type": "pc",
        "label": "Snapshot Program Change",
        "device_scope": "device:auto",
        "payload": {"midi_channel": 1, "program": 5},
        "enabled": True,
        "is_example": True,
    },
]


def _default_editor_state() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "assignments": copy.deepcopy(DEFAULT_ASSIGNMENTS),
        "welcome_routines": copy.deepcopy(DEFAULT_WELCOME_ROUTINES),
        "selected_welcome_routine_id": "map2-blue-cross",
    }


class PushSurfaceLabsStore(Singleton):
    """File-backed persistence for the Labs Push editor."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or _default_store_path()

    def load_state(self) -> dict[str, Any]:
        defaults = _default_editor_state()
        if not self.path.exists():
            return defaults
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return defaults
        if not isinstance(payload, dict):
            return defaults
        merged = copy.deepcopy(defaults)
        merged.update({key: value for key, value in payload.items() if key in merged})
        if not isinstance(merged.get("assignments"), list):
            merged["assignments"] = copy.deepcopy(DEFAULT_ASSIGNMENTS)
        if not isinstance(merged.get("welcome_routines"), list):
            merged["welcome_routines"] = copy.deepcopy(DEFAULT_WELCOME_ROUTINES)
        if not merged.get("selected_welcome_routine_id"):
            merged["selected_welcome_routine_id"] = "map2-blue-cross"
        return merged

    def save_state(self, payload: dict[str, Any]) -> dict[str, Any]:
        state = self.normalize_state(payload)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
        return state

    def normalize_state(self, payload: dict[str, Any]) -> dict[str, Any]:
        defaults = _default_editor_state()
        if not isinstance(payload, dict):
            return defaults
        normalized = copy.deepcopy(defaults)
        for key in ("schema_version", "assignments", "welcome_routines", "selected_welcome_routine_id"):
            if key in payload:
                normalized[key] = copy.deepcopy(payload[key])
        if not isinstance(normalized["assignments"], list):
            normalized["assignments"] = copy.deepcopy(DEFAULT_ASSIGNMENTS)
        if not isinstance(normalized["welcome_routines"], list):
            normalized["welcome_routines"] = copy.deepcopy(DEFAULT_WELCOME_ROUTINES)
        if not isinstance(normalized["selected_welcome_routine_id"], str):
            normalized["selected_welcome_routine_id"] = "map2-blue-cross"
        return normalized

    def quick_assignments(self, state: dict[str, Any]) -> list[dict[str, Any]]:
        assignments = state.get("assignments") if isinstance(state, dict) else []
        if not isinstance(assignments, list):
            return []
        prioritized = []
        for assignment in assignments:
            if not isinstance(assignment, dict):
                continue
            assignment_type = str(assignment.get("assignment_type") or "").lower()
            priority = 0 if assignment_type in {"cc", "pc"} else 1
            prioritized.append((priority, str(assignment.get("label") or ""), assignment))
        prioritized.sort(key=lambda item: (item[0], item[1].lower()))
        return [copy.deepcopy(item[2]) for item in prioritized]

    def selected_welcome_routine(self, state: dict[str, Any]) -> dict[str, Any] | None:
        selected_id = str(state.get("selected_welcome_routine_id") or "")
        for routine in state.get("welcome_routines", []):
            if isinstance(routine, dict) and str(routine.get("id")) == selected_id:
                return copy.deepcopy(routine)
        return None


def get_push_surface_labs_store() -> PushSurfaceLabsStore:
    return PushSurfaceLabsStore.get_instance()


def reset_push_surface_labs_store() -> None:
    PushSurfaceLabsStore.reset_instance()
