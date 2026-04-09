from __future__ import annotations

import pytest

import app.services.push_surface.drum_runtime as drum_runtime_module
from app.services.push_surface.drum_registry import DrumMachineInstanceDescriptor
from app.services.push_surface.drum_runtime import PushDrumSessionService


def _instance(instance_id: str, *, is_live: bool, node_id: str = "node-a") -> DrumMachineInstanceDescriptor:
    return DrumMachineInstanceDescriptor(
        instance_id=instance_id,
        node_id=node_id,
        node_label=node_id,
        snapshot_id=1,
        snapshot_name="Snapshot",
        chain_id=1,
        chain_name="Chain",
        plugin_id=1,
        plugin_uri="map2://juce/drums",
        plugin_name="Drums",
        plugin_position=0,
        display_name=f"{node_id} / {instance_id}",
        is_live=is_live,
        is_audible=is_live,
        source="snapshot",
        capability_flags=("transport", "pads"),
        last_seen_at="2026-04-09T12:00:00+00:00",
    )


class _FakeRegistry:
    def __init__(self, instances: list[DrumMachineInstanceDescriptor]) -> None:
        self.instances = instances

    async def list_instances(self) -> list[DrumMachineInstanceDescriptor]:
        return list(self.instances)

    async def get_instance(self, instance_id: str) -> DrumMachineInstanceDescriptor | None:
        return next((item for item in self.instances if item.instance_id == instance_id), None)


def _fake_projection(self) -> dict[str, object]:
    return {"instance": self.descriptor.to_dict(), "pad_count": 16}


@pytest.mark.asyncio
async def test_runtime_auto_binds_to_live_instance_when_present(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PushDrumSessionService()
    registry = _FakeRegistry([
        _instance("inst-offline", is_live=False),
        _instance("inst-live", is_live=True, node_id="node-live"),
    ])

    monkeypatch.setattr(drum_runtime_module, "get_drum_instance_registry", lambda: registry)
    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "get_projection", _fake_projection)

    state = await service.get_surface_state("fp-1")

    assert state["session"]["selected_instance_id"] == "inst-live"
    assert state["session"]["bank_index"] == 1
    assert state["banked_instance_id"] == "inst-live"
    assert state["selected_instance_index"] == 1
    assert state["selected_projection"]["instance"]["instance_id"] == "inst-live"


@pytest.mark.asyncio
async def test_runtime_clears_stale_selection_and_stays_unbound_when_nothing_is_live(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PushDrumSessionService()
    session = service._get_session("fp-2")
    session.selected_instance_id = "stale-instance"
    session.bank_index = 4

    registry = _FakeRegistry([
        _instance("inst-a", is_live=False),
        _instance("inst-b", is_live=False, node_id="node-b"),
    ])

    monkeypatch.setattr(drum_runtime_module, "get_drum_instance_registry", lambda: registry)

    state = await service.get_surface_state("fp-2")

    assert state["session"]["selected_instance_id"] is None
    assert state["session"]["bank_index"] == 1
    assert state["banked_instance_id"] == "inst-b"
    assert state["selected_instance_index"] is None
    assert state["selected_projection"] is None


@pytest.mark.asyncio
async def test_select_instance_supports_bank_index_and_bank_delta(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PushDrumSessionService()
    registry = _FakeRegistry([
        _instance("inst-a", is_live=True),
        _instance("inst-b", is_live=False, node_id="node-b"),
        _instance("inst-c", is_live=False, node_id="node-c"),
    ])

    monkeypatch.setattr(drum_runtime_module, "get_drum_instance_registry", lambda: registry)
    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "get_projection", _fake_projection)

    first = await service.dispatch_command("fp-3", "select_instance", {"bank_index": 2})
    second = await service.dispatch_command("fp-3", "select_instance", {"bank_delta": -1})

    assert first["session"]["selected_instance_id"] == "inst-c"
    assert first["session"]["bank_index"] == 2
    assert second["session"]["selected_instance_id"] == "inst-b"
    assert second["session"]["bank_index"] == 1
