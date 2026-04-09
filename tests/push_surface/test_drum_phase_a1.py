from __future__ import annotations

from itertools import count

import pytest

import app.services.push_surface.drum_runtime as drum_runtime_module
from app.services.push_surface.drum_registry import DrumMachineInstanceDescriptor
from app.services.push_surface.drum_runtime import DrumMachineRuntimeFacade, PushDrumSessionService


def _instance(instance_id: str, *, is_live: bool, node_id: str = "node-local") -> DrumMachineInstanceDescriptor:
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


class _FakeDrumService:
    def __init__(self) -> None:
        self.transport_updates: list[dict[str, object]] = []
        self.transport_publish_count = 0
        self.position_publish_count = 0

    def get_state(self) -> dict[str, object]:
        return {"transport": False}

    def get_transport(self) -> dict[str, object]:
        is_playing = bool(self.transport_updates[-1]["is_playing"]) if self.transport_updates else False
        return {"is_playing": is_playing, "bpm": 120}

    def get_midi_mapping(self) -> dict[str, object]:
        return {
            "global_midi_channel": 9,
            "pads": [
                {"pad": pad, "notes": [36 + pad], "midi_channel": 5 if pad == 3 else 9}
                for pad in range(16)
            ],
        }

    def update_transport(self, patch: dict[str, object]) -> dict[str, object]:
        self.transport_updates.append(dict(patch))
        return {"is_playing": bool(patch.get("is_playing", False)), "bpm": 120}

    async def publish_transport_update(self) -> None:
        self.transport_publish_count += 1

    async def publish_position_update(self) -> None:
        self.position_publish_count += 1


class _FakeAudioEngine:
    def __init__(self) -> None:
        self.calls: list[tuple[str, int, int, int]] = []

    async def inject_midi_note_on(self, channel: int, note: int, velocity: int) -> bool:
        self.calls.append(("on", channel, note, velocity))
        return True

    async def inject_midi_note_off(self, channel: int, note: int, velocity: int) -> bool:
        self.calls.append(("off", channel, note, velocity))
        return True


class _FakeTransportService:
    def __init__(self) -> None:
        self.actions: list[str] = []

    async def dispatch(self, action: str) -> dict[str, object]:
        self.actions.append(action)
        return {"ok": True, "action": action, "owner": "midi_recorder"}


def _fake_projection(self) -> dict[str, object]:
    return {"instance": self.descriptor.to_dict(), "pad_count": 16}


def _activation_recorder(calls: list[str]):
    async def _activate(self, descriptor: DrumMachineInstanceDescriptor) -> bool:
        calls.append(descriptor.instance_id)
        return True

    return _activate


def _time_source(start: float = 1_000.0):
    values = count()

    def _now() -> float:
        return start + next(values)

    return _now


@pytest.mark.asyncio
async def test_phase_a1_simulator_covers_banking_confirmation_and_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PushDrumSessionService()
    registry = _FakeRegistry(
        [
            _instance("inst-live", is_live=True, node_id="node-local"),
            _instance("inst-next", is_live=False, node_id="node-local"),
            _instance("inst-remote", is_live=False, node_id="node-remote"),
        ]
    )
    activations: list[str] = []
    now = {"value": 100.0}

    monkeypatch.setattr(drum_runtime_module, "get_drum_instance_registry", lambda: registry)
    monkeypatch.setattr(drum_runtime_module, "_local_node_id", lambda: "node-local")
    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "get_projection", _fake_projection)
    monkeypatch.setattr(PushDrumSessionService, "_activate_instance", _activation_recorder(activations))
    monkeypatch.setattr(PushDrumSessionService, "_now", staticmethod(lambda: now["value"]))

    initial = await service.get_surface_state("fp-a1")
    rejected = await service.dispatch_command("fp-a1", "select_instance", {"bank_index": 1})
    reject_result = await service.dispatch_command(
        "fp-a1",
        "reject_pending_confirmation",
        {"action_id": rejected["session"]["pending_confirmation"]["action_id"]},
    )
    pending_remote = await service.dispatch_command("fp-a1", "select_instance", {"instance_id": "inst-remote"})
    accepted = await service.dispatch_command(
        "fp-a1",
        "accept_pending_confirmation",
        {"action_id": pending_remote["session"]["pending_confirmation"]["action_id"]},
    )

    now["value"] = 130.0
    expiring = await service.dispatch_command("fp-a1", "select_instance", {"instance_id": "inst-next"})
    assert expiring["session"]["pending_confirmation"] is not None
    now["value"] = 146.0
    expired = await service.get_surface_state("fp-a1")

    assert initial["session"]["selected_instance_id"] == "inst-live"
    assert rejected["session"]["pending_confirmation"]["target_instance_id"] == "inst-next"
    assert reject_result["session"]["selected_instance_id"] == "inst-live"
    assert reject_result["session"]["last_confirmation_resolution"]["status"] == "rejected"
    assert pending_remote["session"]["pending_confirmation"]["reason"] == "remote_instance"
    assert accepted["session"]["selected_instance_id"] == "inst-remote"
    assert accepted["session"]["last_confirmation_resolution"]["status"] == "accepted"
    assert activations == ["inst-remote"]
    assert expired["session"]["pending_confirmation"] is None
    assert expired["session"]["last_confirmation_resolution"]["status"] == "expired"


@pytest.mark.asyncio
async def test_phase_a1_simulator_stays_unbound_when_no_live_instance_exists(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PushDrumSessionService()
    registry = _FakeRegistry(
        [
            _instance("inst-a", is_live=False, node_id="node-local"),
            _instance("inst-b", is_live=False, node_id="node-remote"),
        ]
    )

    monkeypatch.setattr(drum_runtime_module, "get_drum_instance_registry", lambda: registry)

    state = await service.get_surface_state("fp-a1-unbound")

    assert state["session"]["selected_instance_id"] is None
    assert state["selected_projection"] is None
    assert state["banked_instance_id"] == "inst-a"


@pytest.mark.asyncio
async def test_phase_a1_simulator_dispatches_pad_commands(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PushDrumSessionService()
    registry = _FakeRegistry([_instance("inst-live", is_live=True, node_id="node-local")])
    fake_service = _FakeDrumService()
    fake_engine = _FakeAudioEngine()

    monkeypatch.setattr(drum_runtime_module, "get_drum_instance_registry", lambda: registry)
    monkeypatch.setattr(drum_runtime_module, "_local_node_id", lambda: "node-local")
    monkeypatch.setattr(drum_runtime_module, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(DrumMachineRuntimeFacade, "_service", lambda self: fake_service)
    monkeypatch.setattr(DrumMachineRuntimeFacade, "get_projection", _fake_projection)

    await service.get_surface_state("fp-a1-pad")
    pressed = await service.dispatch_command("fp-a1-pad", "trigger_pad", {"pad": 3, "velocity": 99, "channel": 11})
    released = await service.dispatch_command("fp-a1-pad", "stop_pad", {"pad": 3})

    assert pressed["command_result"]["channel"] == 11
    assert pressed["command_result"]["velocity"] == 99
    assert released["command_result"]["channel"] == 5
    assert fake_engine.calls == [("on", 11, 39, 99), ("off", 5, 39, 0)]


@pytest.mark.asyncio
async def test_phase_a1_simulator_dispatches_transport_commands(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PushDrumSessionService()
    registry = _FakeRegistry([_instance("inst-live", is_live=True, node_id="node-local")])
    fake_service = _FakeDrumService()
    fake_transport_service = _FakeTransportService()

    monkeypatch.setattr(drum_runtime_module, "get_drum_instance_registry", lambda: registry)
    monkeypatch.setattr(drum_runtime_module, "_local_node_id", lambda: "node-local")
    monkeypatch.setattr(drum_runtime_module, "get_transport_service", lambda: fake_transport_service)
    monkeypatch.setattr(DrumMachineRuntimeFacade, "_service", lambda self: fake_service)
    monkeypatch.setattr(DrumMachineRuntimeFacade, "get_projection", _fake_projection)

    await service.get_surface_state("fp-a1-transport")
    play = await service.dispatch_command("fp-a1-transport", "play", {})
    stop = await service.dispatch_command("fp-a1-transport", "stop", {})
    record = await service.dispatch_command("fp-a1-transport", "record", {})

    assert play["command_result"]["transport"]["is_playing"] is True
    assert stop["command_result"]["transport"]["is_playing"] is False
    assert fake_service.transport_updates == [{"is_playing": True}, {"is_playing": False}]
    assert fake_service.transport_publish_count == 2
    assert fake_service.position_publish_count == 2
    assert fake_transport_service.actions == ["record"]
    assert record["command_result"]["transport_owner_result"]["owner"] == "midi_recorder"
