"""T2461-A9 — /api/devices/snapshot-keys endpoint tests."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import devices as devices_routes
from app.services.controllers import bench_state
from app.services.controllers.profile_registry import (
    DevicePack,
    DeviceProfile,
)


@pytest.fixture
def fresh_pin_file(tmp_path):
    pin_path = tmp_path / "pins.json"
    bench_state.reset_bench_state_for_tests(pin_file=pin_path)
    yield pin_path
    bench_state.reset_bench_state_for_tests(pin_file=None)


@pytest.fixture
def stub_registry(monkeypatch):
    audio = DeviceProfile(
        pack_id="edirol-ua", model="ua-1000", kind="audio",
        path=Path("/tmp/x.yaml"),
        document={"identity": {"hardware_id": "usb:0582:00ed"}},
    )
    pack = DevicePack(
        pack_id="edirol-ua", path=Path("/tmp/edirol-ua"),
        manifest={"vendor": {"name": "EDIROL"}, "models": ["ua-1000"]},
        profiles=(audio,),
    )

    class _Reg:
        def packs(self): return (pack,)
        def get_pack(self, pack_id): return pack if pack_id == "edirol-ua" else None
        def profiles(self, kind=None):
            if kind in (None, "audio"):
                return (audio,)
            return ()

    monkeypatch.setattr(devices_routes, "get_profile_registry", lambda: _Reg())
    return _Reg()


@pytest.fixture
def app(stub_registry, fresh_pin_file):
    a = FastAPI()
    a.include_router(devices_routes.router)
    return a


@pytest.fixture
def client(app):
    return TestClient(app)


def test_snapshot_keys_empty_bench(monkeypatch, client):
    """No devices detected: connected/recent/pinned all empty."""
    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    r = client.get("/api/devices/snapshot-keys")
    assert r.status_code == 200
    body = r.json()
    assert body["connected"] == []
    assert body["recently_disconnected"] == []
    assert body["pinned"] == []
    assert isinstance(body["snapshot_at"], (int, float))


def test_snapshot_keys_includes_connected_profile(monkeypatch, client):
    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices",
                        lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    r = client.get("/api/devices/snapshot-keys")
    body = r.json()
    assert "edirol-ua/ua-1000.audio" in body["connected"]


def test_snapshot_keys_includes_pinned_set(monkeypatch, client):
    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    bench_state.get_bench_state_tracker().pin("hotone/jogg.audio")

    r = client.get("/api/devices/snapshot-keys")
    body = r.json()
    assert "hotone/jogg.audio" in body["pinned"]
