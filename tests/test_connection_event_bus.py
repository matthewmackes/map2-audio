"""T2459-G2 — connection event bus tests.

Exercises the diff loop, subscriber lifecycle, and crash/degraded-pack
edge-event detection. The detection sources are stubbed via
monkey-patches at the module level so the bus runs identically on a
CI host with no USB / no PipeWire.
"""

from __future__ import annotations

import asyncio
import dataclasses
from pathlib import Path

import pytest

from app.services.controllers import bench_state, connection_event_bus
from app.services.controllers.connection_event_bus import (
    EVT_CONNECTED,
    EVT_DISCONNECTED,
    EVT_HEARTBEAT,
    EVT_PACK_DEGRADED,
    ConnectionEventBus,
)
from app.services.controllers.profile_registry import (
    DevicePack,
    DeviceProfile,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def fresh_pin_file(tmp_path):
    pin_path = tmp_path / "pins.json"
    bench_state.reset_bench_state_for_tests(pin_file=pin_path)
    yield pin_path
    bench_state.reset_bench_state_for_tests(pin_file=None)


def _make_audio_profile(pack_id="edirol-ua", model="ua-1000"):
    return DeviceProfile(
        pack_id=pack_id, model=model, kind="audio",
        path=Path(f"/tmp/{pack_id}/{model}.audio.yaml"),
        document={"identity": {"hardware_id": "usb:0582:00ed"}},
    )


@dataclasses.dataclass
class _StubRegistry:
    profile_list: list[DeviceProfile]
    pack_list: list[DevicePack]
    def profiles(self, kind=None):
        if kind is None:
            return tuple(self.profile_list)
        return tuple(p for p in self.profile_list if p.kind == kind)
    def packs(self):
        return tuple(self.pack_list)
    def get_pack(self, pack_id):
        return next((p for p in self.pack_list if p.pack_id == pack_id), None)


def _make_registry(profiles, packs=None):
    return _StubRegistry(
        profile_list=profiles,
        pack_list=packs or [],
    )


async def _drain(queue: asyncio.Queue, count: int, timeout: float = 1.0):
    """Drain `count` events from the queue with a timeout per event."""
    out = []
    for _ in range(count):
        evt = await asyncio.wait_for(queue.get(), timeout=timeout)
        out.append(evt)
    return out


# ---------------------------------------------------------------------------
# 1. register/unregister round trip
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_unregister_subscriber(fresh_pin_file):
    bus = ConnectionEventBus(poll_interval_s=10.0)  # no auto-loop in this test
    queue = await bus.register_client("c1")
    assert bus.subscriber_count() == 1
    await bus.unregister_client("c1")
    assert bus.subscriber_count() == 0


# ---------------------------------------------------------------------------
# 2. tick emits device.connected for new keys
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tick_emits_connected_event(monkeypatch, fresh_pin_file):
    profile = _make_audio_profile()
    reg = _make_registry([profile])
    bus = ConnectionEventBus(poll_interval_s=10.0, registry_provider=lambda: reg)

    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices",
                        lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    queue = await bus.register_client("c1")
    await bus._tick()

    events = await _drain(queue, 1)
    assert events[0]["type"] == EVT_CONNECTED
    assert events[0]["data"]["profile_key"] == "edirol-ua/ua-1000.audio"


# ---------------------------------------------------------------------------
# 3. tick emits device.disconnected on transition
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tick_emits_disconnected_event(monkeypatch, fresh_pin_file):
    profile = _make_audio_profile()
    reg = _make_registry([profile])
    bus = ConnectionEventBus(poll_interval_s=10.0, registry_provider=lambda: reg)
    queue = await bus.register_client("c1")

    from app.services.controllers import connection_detector as cd
    # Phase 1: present
    monkeypatch.setattr(cd, "_read_usb_devices",
                        lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])
    await bus._tick()  # connected
    # Phase 2: gone
    monkeypatch.setattr(cd, "_read_usb_devices", lambda: [])
    await bus._tick()  # disconnected

    # Drain: 1 connected + 1 disconnected
    events = await _drain(queue, 2)
    types = [e["type"] for e in events]
    assert types == [EVT_CONNECTED, EVT_DISCONNECTED]
    assert events[1]["data"]["profile_key"] == "edirol-ua/ua-1000.audio"


# ---------------------------------------------------------------------------
# 4. no-change tick produces no events
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tick_no_change_no_events(monkeypatch, fresh_pin_file):
    profile = _make_audio_profile()
    reg = _make_registry([profile])
    bus = ConnectionEventBus(poll_interval_s=10.0, registry_provider=lambda: reg)
    queue = await bus.register_client("c1")

    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices",
                        lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    await bus._tick()  # connected
    # Drain the connect event
    await asyncio.wait_for(queue.get(), timeout=1.0)
    await bus._tick()  # no change
    # Queue should be empty
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(queue.get(), timeout=0.1)


# ---------------------------------------------------------------------------
# 5. pack.degraded emitted on transition
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tick_emits_pack_degraded(monkeypatch, fresh_pin_file):
    bad_pack = DevicePack(
        pack_id="brokenco",
        path=Path("/tmp/brokenco"),
        manifest={"vendor": {"name": "BrokenCo"}, "models": []},
        profiles=(),
        degraded_files=(Path("/tmp/brokenco/x.yaml"),),
    )
    reg = _make_registry([], packs=[bad_pack])
    bus = ConnectionEventBus(poll_interval_s=10.0, registry_provider=lambda: reg)
    queue = await bus.register_client("c1")

    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    await bus._tick()
    events = await _drain(queue, 1)
    assert events[0]["type"] == EVT_PACK_DEGRADED
    assert events[0]["data"]["pack_id"] == "brokenco"
    assert "/tmp/brokenco/x.yaml" in events[0]["data"]["degraded_files"]

    # Second tick: no transition, no event
    await bus._tick()
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(queue.get(), timeout=0.1)


# ---------------------------------------------------------------------------
# 6. multi-subscriber broadcast
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_multi_subscriber_broadcast(monkeypatch, fresh_pin_file):
    profile = _make_audio_profile()
    reg = _make_registry([profile])
    bus = ConnectionEventBus(poll_interval_s=10.0, registry_provider=lambda: reg)
    q1 = await bus.register_client("c1")
    q2 = await bus.register_client("c2")

    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices",
                        lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    await bus._tick()
    e1 = await asyncio.wait_for(q1.get(), timeout=1.0)
    e2 = await asyncio.wait_for(q2.get(), timeout=1.0)
    assert e1["type"] == EVT_CONNECTED
    assert e2["type"] == EVT_CONNECTED
    assert e1["data"]["profile_key"] == e2["data"]["profile_key"]


# ---------------------------------------------------------------------------
# 7. slow-subscriber gets dropped (queue full)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_slow_subscriber_dropped(monkeypatch, fresh_pin_file):
    profile = _make_audio_profile()
    reg = _make_registry([profile])
    bus = ConnectionEventBus(poll_interval_s=10.0, registry_provider=lambda: reg)

    # Force a tiny queue so we can saturate it deliberately.
    queue = await bus.register_client("slow")
    # Fill the queue past its 512 capacity by directly publishing.
    for _ in range(1000):
        try:
            queue.put_nowait({"type": "junk"})
        except asyncio.QueueFull:
            break
    # Capacity now exhausted. Trigger a publish; the bus should drop
    # the subscriber.
    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices",
                        lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])
    await bus._tick()

    assert bus.subscriber_count() == 0


# ---------------------------------------------------------------------------
# 8. start/stop lifecycle works without a real registry
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_stop_lifecycle(monkeypatch, fresh_pin_file):
    reg = _make_registry([])
    bus = ConnectionEventBus(poll_interval_s=0.05, registry_provider=lambda: reg)

    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    await bus.start()
    # Let the loop tick a few times.
    await asyncio.sleep(0.2)
    assert bus._task is not None
    await bus.stop()
    assert bus._task is None


# ---------------------------------------------------------------------------
# 9. initial-snapshot payload reflects last poll state
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_initial_snapshot_reflects_state(monkeypatch, fresh_pin_file):
    profile = _make_audio_profile()
    reg = _make_registry([profile])
    bus = ConnectionEventBus(poll_interval_s=10.0, registry_provider=lambda: reg)

    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices",
                        lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    await bus._tick()
    snap = bus.build_initial_snapshot()
    assert "edirol-ua/ua-1000.audio" in snap["connected_keys"]
    assert "edirol-ua/ua-1000.audio" in snap["known_keys"]


# ---------------------------------------------------------------------------
# 10. heartbeat fires after HEARTBEAT_INTERVAL_S elapses
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_heartbeat_fires_periodically(monkeypatch, fresh_pin_file):
    """Run the loop with a short heartbeat interval and confirm at
    least one heartbeat reaches subscribers."""
    reg = _make_registry([])
    bus = ConnectionEventBus(poll_interval_s=0.02, registry_provider=lambda: reg)

    # Override module-level heartbeat interval for the duration of this test.
    monkeypatch.setattr(connection_event_bus, "HEARTBEAT_INTERVAL_S", 0.05)

    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    queue = await bus.register_client("c1")
    await bus.start()
    try:
        # Wait up to 1s for a heartbeat to arrive.
        evt = await asyncio.wait_for(queue.get(), timeout=1.0)
        # Could be a heartbeat or just nothing; loop until we see one.
        for _ in range(20):
            if evt["type"] == EVT_HEARTBEAT:
                break
            evt = await asyncio.wait_for(queue.get(), timeout=1.0)
        assert evt["type"] == EVT_HEARTBEAT
    finally:
        await bus.stop()
