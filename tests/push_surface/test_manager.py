import asyncio

import pytest

from app.services.midi_hub.hub import MidiHub
from app.services.push_surface import manager as push_surface_manager_module
from app.services.push_surface.manager import PushSurfaceManager
from app.services.push_surface.map2_bridge import MockMap2SurfaceBridge
from app.services.push_surface.simulator import PushSurfaceSimulator


@pytest.mark.asyncio
async def test_manager_discovers_simulator_and_processes_input():
    hub = MidiHub(auto_discover_alsa=False, poll_interval_s=0.001, hotplug_interval_s=0.25)
    bridge = MockMap2SurfaceBridge()
    simulator = PushSurfaceSimulator(hub)
    manager = PushSurfaceManager(hub=hub, bridge=bridge)

    await manager.start()
    assert manager.active_device is not None

    simulator.press_button("page_presets")
    await asyncio.sleep(0.05)
    assert manager.controller.state.active_page.value == "presets"

    simulator.press_pad(0, 0)
    await asyncio.sleep(0.05)
    assert manager.controller.state.selected_preset_id == "1"

    led_messages = simulator.read_led_messages()
    assert led_messages, "expected LED feedback from the renderer"

    await manager.stop()
    hub.stop()


class _FakeLabsStore:
    def __init__(self, routine: dict):
        self._state = {
            "schema_version": 1,
            "assignments": [],
            "welcome_routines": [routine],
            "selected_welcome_routine_id": routine["id"],
        }

    def load_state(self) -> dict:
        return self._state

    def selected_welcome_routine(self, state: dict) -> dict | None:
        return state["welcome_routines"][0]


@pytest.mark.asyncio
async def test_manager_runs_welcome_routine_on_connect_and_handoffs(monkeypatch):
    hub = MidiHub(auto_discover_alsa=False, poll_interval_s=0.001, hotplug_interval_s=0.25)
    bridge = MockMap2SurfaceBridge()
    simulator = PushSurfaceSimulator(hub)
    routine = {
        "id": "welcome-parameters",
        "name": "Welcome Parameters",
        "run_on_connect": True,
        "handoff_page": "parameters",
        "steps": [
            {
                "id": "intro",
                "duration_ms": 120,
                "pad_lights": {"grid_0_0": {"color": "BLUE", "pulse": True}},
                "display": {"title": "WELCOME", "lines": ("Node {node_name}",)},
            },
        ],
    }
    monkeypatch.setattr(push_surface_manager_module, "get_push_surface_labs_store", lambda: _FakeLabsStore(routine))
    manager = PushSurfaceManager(hub=hub, bridge=bridge)

    await manager.start()
    await asyncio.sleep(0.03)
    snapshot = await manager.get_state_snapshot()
    assert snapshot["welcome_runtime"]["active"] is True
    assert snapshot["welcome_runtime"]["routine_id"] == "welcome-parameters"

    await asyncio.sleep(0.15)
    assert manager.controller.state.active_page.value == "parameters"
    final_snapshot = await manager.get_state_snapshot()
    assert final_snapshot["welcome_runtime"] is None
    assert simulator.read_led_messages(), "expected welcome routine LED output"

    await manager.stop()
    hub.stop()


@pytest.mark.asyncio
async def test_manager_skips_welcome_on_control_press_and_processes_input(monkeypatch):
    hub = MidiHub(auto_discover_alsa=False, poll_interval_s=0.001, hotplug_interval_s=0.25)
    bridge = MockMap2SurfaceBridge()
    simulator = PushSurfaceSimulator(hub)
    routine = {
        "id": "welcome-home",
        "name": "Welcome Home",
        "run_on_connect": True,
        "handoff_page": "home",
        "steps": [
            {
                "id": "long-step",
                "duration_ms": 400,
                "pad_lights": {"grid_0_0": {"color": "BLUE", "pulse": True}},
                "display": {"title": "WELCOME", "lines": ("Press any control",)},
            },
        ],
    }
    monkeypatch.setattr(push_surface_manager_module, "get_push_surface_labs_store", lambda: _FakeLabsStore(routine))
    manager = PushSurfaceManager(hub=hub, bridge=bridge)

    await manager.start()
    await asyncio.sleep(0.03)
    simulator.press_button("page_presets")
    await asyncio.sleep(0.08)

    assert manager.controller.state.active_page.value == "presets"
    snapshot = await manager.get_state_snapshot()
    assert snapshot["welcome_runtime"] is None

    await manager.stop()
    hub.stop()
