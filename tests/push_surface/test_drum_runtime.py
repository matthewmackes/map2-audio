from __future__ import annotations

from itertools import count

import pytest

import app.services.push_surface.drum_runtime as drum_runtime_module
from app.services.push_surface.drum_registry import DrumMachineInstanceDescriptor
from app.services.push_surface.drum_runtime import DrumMachineRuntimeFacade, PushDrumSessionService


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
                {"pad": pad, "notes": [36 + pad], "midi_channel": 3 if pad == 2 else 9}
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


class _FakeBrowserService:
    def __init__(self) -> None:
        self.browse_calls: list[dict[str, object]] = []
        self.load_calls: list[dict[str, object]] = []

    def browse(self, payload: dict[str, object]) -> dict[str, object]:
        self.browse_calls.append(dict(payload))
        return {"scope": "kits", "items": [{"id": "kit-a"}], "preview": {"id": "kit-a"}}

    def load(self, payload: dict[str, object]) -> dict[str, object]:
        self.load_calls.append(dict(payload))
        return {"mode": "pad", "kit_id": "kit-a", "target_pad": int(payload["pad"])}


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
        _instance("inst-a", is_live=False, node_id="node-local"),
        _instance("inst-b", is_live=False, node_id="node-local"),
        _instance("inst-c", is_live=False, node_id="node-local"),
    ])
    calls: list[str] = []

    monkeypatch.setattr(drum_runtime_module, "get_drum_instance_registry", lambda: registry)
    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "get_projection", _fake_projection)
    monkeypatch.setattr(drum_runtime_module, "_local_node_id", lambda: "node-local")
    monkeypatch.setattr(PushDrumSessionService, "_activate_instance", _activation_recorder(calls))

    first = await service.dispatch_command("fp-3", "select_instance", {"bank_index": 2})
    second = await service.dispatch_command("fp-3", "select_instance", {"bank_delta": -1})

    assert first["session"]["selected_instance_id"] == "inst-c"
    assert first["session"]["bank_index"] == 2
    assert second["session"]["selected_instance_id"] == "inst-b"
    assert second["session"]["bank_index"] == 1
    assert calls == ["inst-c", "inst-b"]


@pytest.mark.asyncio
async def test_select_instance_requires_confirmation_for_remote_target(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PushDrumSessionService()
    registry = _FakeRegistry([
        _instance("inst-local", is_live=True, node_id="node-local"),
        _instance("inst-remote", is_live=False, node_id="node-remote"),
    ])
    calls: list[str] = []

    monkeypatch.setattr(drum_runtime_module, "get_drum_instance_registry", lambda: registry)
    monkeypatch.setattr(drum_runtime_module, "_local_node_id", lambda: "node-local")
    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "get_projection", _fake_projection)
    monkeypatch.setattr(PushDrumSessionService, "_activate_instance", _activation_recorder(calls))
    monkeypatch.setattr(PushDrumSessionService, "_now", staticmethod(lambda: 1_000.0))

    state = await service.dispatch_command("fp-4", "select_instance", {"instance_id": "inst-remote"})

    assert state["session"]["selected_instance_id"] == "inst-local"
    assert state["session"]["pending_confirmation"]["action_type"] == "instance_switch"
    assert state["session"]["pending_confirmation"]["reason"] == "remote_instance"
    assert state["session"]["pending_confirmation"]["device_fingerprint"] == "fp-4"
    assert state["session"]["pending_confirmation"]["target_instance_id"] == "inst-remote"
    assert state["session"]["pending_confirmation"]["target_display_name"] == "node-remote / inst-remote"
    assert state["session"]["pending_confirmation"]["expires_at"] == 1_015.0
    assert state["session"]["last_confirmation_resolution"] is None
    assert calls == []


@pytest.mark.asyncio
async def test_select_instance_requires_confirmation_when_replacing_live_instance(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PushDrumSessionService()
    registry = _FakeRegistry([
        _instance("inst-live", is_live=True, node_id="node-local"),
        _instance("inst-next", is_live=False, node_id="node-local"),
    ])
    calls: list[str] = []

    monkeypatch.setattr(drum_runtime_module, "get_drum_instance_registry", lambda: registry)
    monkeypatch.setattr(drum_runtime_module, "_local_node_id", lambda: "node-local")
    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "get_projection", _fake_projection)
    monkeypatch.setattr(PushDrumSessionService, "_activate_instance", _activation_recorder(calls))

    state = await service.dispatch_command("fp-5", "select_instance", {"instance_id": "inst-next"})

    assert state["session"]["pending_confirmation"]["reason"] == "replace_live_instance"
    assert state["session"]["pending_confirmation"]["target_instance_id"] == "inst-next"
    assert calls == []


@pytest.mark.asyncio
async def test_confirm_instance_switch_activates_target_and_clears_pending_confirmation(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PushDrumSessionService()
    registry = _FakeRegistry([
        _instance("inst-live", is_live=True, node_id="node-local"),
        _instance("inst-next", is_live=False, node_id="node-local"),
    ])
    calls: list[str] = []

    monkeypatch.setattr(drum_runtime_module, "get_drum_instance_registry", lambda: registry)
    monkeypatch.setattr(drum_runtime_module, "_local_node_id", lambda: "node-local")
    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "get_projection", _fake_projection)
    monkeypatch.setattr(PushDrumSessionService, "_activate_instance", _activation_recorder(calls))
    monkeypatch.setattr(PushDrumSessionService, "_now", staticmethod(_time_source()))

    pending = await service.dispatch_command("fp-6", "select_instance", {"instance_id": "inst-next"})
    action_id = pending["session"]["pending_confirmation"]["action_id"]
    confirmed = await service.dispatch_command("fp-6", "accept_pending_confirmation", {"action_id": action_id})

    assert pending["session"]["pending_confirmation"]["target_instance_id"] == "inst-next"
    assert confirmed["session"]["selected_instance_id"] == "inst-next"
    assert confirmed["session"]["pending_confirmation"] is None
    assert confirmed["session"]["last_confirmation_resolution"]["status"] == "accepted"
    assert confirmed["session"]["last_confirmation_resolution"]["action_id"] == action_id
    assert calls == ["inst-next"]


@pytest.mark.asyncio
async def test_reject_pending_confirmation_clears_pending_without_activation(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PushDrumSessionService()
    registry = _FakeRegistry([
        _instance("inst-live", is_live=True, node_id="node-local"),
        _instance("inst-next", is_live=False, node_id="node-local"),
    ])
    calls: list[str] = []

    monkeypatch.setattr(drum_runtime_module, "get_drum_instance_registry", lambda: registry)
    monkeypatch.setattr(drum_runtime_module, "_local_node_id", lambda: "node-local")
    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "get_projection", _fake_projection)
    monkeypatch.setattr(PushDrumSessionService, "_activate_instance", _activation_recorder(calls))
    monkeypatch.setattr(PushDrumSessionService, "_now", staticmethod(_time_source()))

    pending = await service.dispatch_command("fp-7", "select_instance", {"instance_id": "inst-next"})
    rejected = await service.dispatch_command(
        "fp-7",
        "reject_pending_confirmation",
        {"action_id": pending["session"]["pending_confirmation"]["action_id"]},
    )

    assert rejected["session"]["selected_instance_id"] == "inst-live"
    assert rejected["session"]["pending_confirmation"] is None
    assert rejected["session"]["last_confirmation_resolution"]["status"] == "rejected"
    assert calls == []


@pytest.mark.asyncio
async def test_pending_confirmation_expires_on_state_read(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PushDrumSessionService()
    registry = _FakeRegistry([
        _instance("inst-live", is_live=True, node_id="node-local"),
        _instance("inst-next", is_live=False, node_id="node-local"),
    ])
    now = {"value": 100.0}

    monkeypatch.setattr(drum_runtime_module, "get_drum_instance_registry", lambda: registry)
    monkeypatch.setattr(drum_runtime_module, "_local_node_id", lambda: "node-local")
    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "get_projection", _fake_projection)
    monkeypatch.setattr(PushDrumSessionService, "_activate_instance", _activation_recorder([]))
    monkeypatch.setattr(PushDrumSessionService, "_now", staticmethod(lambda: now["value"]))

    pending = await service.dispatch_command("fp-8", "select_instance", {"instance_id": "inst-next"})
    assert pending["session"]["pending_confirmation"] is not None

    now["value"] = 116.0
    expired = await service.get_surface_state("fp-8")

    assert expired["session"]["pending_confirmation"] is None
    assert expired["session"]["last_confirmation_resolution"]["status"] == "expired"
    assert expired["session"]["last_confirmation_resolution"]["reason"] == "confirmation_timeout"


@pytest.mark.asyncio
async def test_trigger_pad_preserves_velocity_and_channel(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_service = _FakeDrumService()
    fake_engine = _FakeAudioEngine()
    facade = DrumMachineRuntimeFacade(_instance("inst-live", is_live=True, node_id="node-local"))

    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "get_projection", _fake_projection)
    monkeypatch.setattr(drum_runtime_module, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "_service", lambda self: fake_service)

    result = await facade.apply_command("trigger_pad", {"pad": 2, "velocity": 91, "channel": 7})

    assert fake_engine.calls == [("on", 7, 38, 91)]
    assert result["status"] == "accepted"
    assert result["pad"] == 2
    assert result["note"] == 38
    assert result["channel"] == 7
    assert result["velocity"] == 91


@pytest.mark.asyncio
async def test_stop_pad_uses_mapped_channel_when_payload_omits_channel(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_service = _FakeDrumService()
    fake_engine = _FakeAudioEngine()
    facade = DrumMachineRuntimeFacade(_instance("inst-live", is_live=True, node_id="node-local"))

    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "get_projection", _fake_projection)
    monkeypatch.setattr(drum_runtime_module, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "_service", lambda self: fake_service)

    result = await facade.apply_command("stop_pad", {"pad": 2})

    assert fake_engine.calls == [("off", 3, 38, 0)]
    assert result["channel"] == 3
    assert result["velocity"] == 0


@pytest.mark.asyncio
async def test_transport_commands_delegate_to_drum_and_transport_services(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_service = _FakeDrumService()
    fake_transport_service = _FakeTransportService()
    facade = DrumMachineRuntimeFacade(_instance("inst-live", is_live=True, node_id="node-local"))

    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "get_projection", _fake_projection)
    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "_service", lambda self: fake_service)
    monkeypatch.setattr(drum_runtime_module, "get_transport_service", lambda: fake_transport_service)

    play = await facade.apply_command("play", {})
    stop = await facade.apply_command("stop", {})
    record = await facade.apply_command("record", {})

    assert fake_service.transport_updates == [{"is_playing": True}, {"is_playing": False}]
    assert fake_service.transport_publish_count == 2
    assert fake_service.position_publish_count == 2
    assert play["transport"]["is_playing"] is True
    assert stop["transport"]["is_playing"] is False
    assert fake_transport_service.actions == ["record"]
    assert record["transport_owner_result"]["action"] == "record"


@pytest.mark.asyncio
async def test_browse_and_load_pad_source_delegate_to_push_drum_browser(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_browser = _FakeBrowserService()
    facade = DrumMachineRuntimeFacade(_instance("inst-live", is_live=True, node_id="node-local"))

    monkeypatch.setattr(drum_runtime_module.DrumMachineRuntimeFacade, "get_projection", _fake_projection)
    monkeypatch.setattr(drum_runtime_module, "get_push_drum_browser_service", lambda: fake_browser)

    browse = await facade.apply_command("browse_pad_source", {"category": "electronic"})
    load = await facade.apply_command("load_pad_source", {"kit_id": "kit-a", "source_pad": 2, "pad": 7})

    assert fake_browser.browse_calls == [{"category": "electronic"}]
    assert fake_browser.load_calls == [{"kit_id": "kit-a", "source_pad": 2, "pad": 7}]
    assert browse["browser"]["preview"]["id"] == "kit-a"
    assert load["load_result"]["target_pad"] == 7
