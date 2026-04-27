"""T2459-G2 — WS /api/devices/ws route tests.

Uses FastAPI TestClient's WebSocket support to verify the connection
contract: clients receive ``devices.snapshot`` immediately on connect,
then live events as the bus publishes them.
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import devices as devices_routes
from app.services.controllers import bench_state, connection_event_bus
from app.services.controllers.connection_event_bus import (
    ConnectionEventBus,
    EVT_CONNECTED,
    EVT_SNAPSHOT,
)
from app.services.controllers.profile_registry import (
    DeviceProfile,
)


@pytest.fixture
def fresh_pin_file(tmp_path):
    pin_path = tmp_path / "pins.json"
    bench_state.reset_bench_state_for_tests(pin_file=pin_path)
    yield pin_path
    bench_state.reset_bench_state_for_tests(pin_file=None)


@pytest.fixture
def stub_bus(monkeypatch):
    """Replace get_connection_event_bus() with a fresh bus instance.

    Auto-loop is *not* started — tests drive _tick() manually so the
    behaviour is deterministic.
    """
    profile = DeviceProfile(
        pack_id="edirol-ua", model="ua-1000", kind="audio",
        path=Path("/tmp/edirol-ua/ua-1000.audio.yaml"),
        document={"identity": {"hardware_id": "usb:0582:00ed"}},
    )

    class _Reg:
        def packs(self): return ()
        def get_pack(self, pack_id): return None
        def profiles(self, kind=None):
            return (profile,) if kind in (None, "audio") else ()

    bus = ConnectionEventBus(
        poll_interval_s=10.0,  # no auto-tick during the test
        registry_provider=lambda: _Reg(),
    )
    monkeypatch.setattr(devices_routes, "get_connection_event_bus", lambda: bus)
    return bus


@pytest.fixture
def app(fresh_pin_file, stub_bus):
    a = FastAPI()
    a.include_router(devices_routes.router)
    return a


@pytest.fixture
def client(app):
    return TestClient(app)


# ---------------------------------------------------------------------------
# 1. WS connect → snapshot frame arrives immediately
# ---------------------------------------------------------------------------


def test_ws_initial_snapshot_arrives(client, stub_bus):
    with client.websocket_connect("/api/devices/ws") as ws:
        msg = ws.receive_json()
        assert msg["type"] == EVT_SNAPSHOT
        assert "connected_keys" in msg["data"]
        assert "pinned_keys" in msg["data"]


# ---------------------------------------------------------------------------
# 2. WS receives device.connected after a tick
# ---------------------------------------------------------------------------


def test_ws_receives_connected_event(monkeypatch, client, stub_bus):
    """Connect a WS client, run a manual tick that fires the
    detector against a present USB device, and verify the WS
    sees the connected event.
    """
    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices",
                        lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    with client.websocket_connect("/api/devices/ws") as ws:
        # Drain initial snapshot.
        snap = ws.receive_json()
        assert snap["type"] == EVT_SNAPSHOT

        # Drive a tick on the bus directly.
        async def _do_tick():
            await stub_bus._tick()
        asyncio.run(_do_tick())

        evt = ws.receive_json()
        assert evt["type"] == EVT_CONNECTED
        assert evt["data"]["profile_key"] == "edirol-ua/ua-1000.audio"


# ---------------------------------------------------------------------------
# 3. WS unregisters cleanly on close
# ---------------------------------------------------------------------------


def test_ws_unregisters_on_close(client, stub_bus):
    with client.websocket_connect("/api/devices/ws") as ws:
        _ = ws.receive_json()
        assert stub_bus.subscriber_count() == 1
    # After context exit, subscriber should be gone.
    # TestClient's WS context closes synchronously.
    # Note: small grace because the route's `finally` runs on the
    # server thread.
    for _ in range(20):
        if stub_bus.subscriber_count() == 0:
            break
        time.sleep(0.05)
    assert stub_bus.subscriber_count() == 0


# ---------------------------------------------------------------------------
# 4. Two simultaneous WS clients both receive the same event
# ---------------------------------------------------------------------------


def test_ws_two_clients_both_see_event(monkeypatch, client, stub_bus):
    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices",
                        lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    with client.websocket_connect("/api/devices/ws") as ws1:
        _ = ws1.receive_json()
        with client.websocket_connect("/api/devices/ws") as ws2:
            _ = ws2.receive_json()

            asyncio.run(stub_bus._tick())

            e1 = ws1.receive_json()
            e2 = ws2.receive_json()
            assert e1["type"] == EVT_CONNECTED
            assert e2["type"] == EVT_CONNECTED
            assert e1["data"]["profile_key"] == e2["data"]["profile_key"]
