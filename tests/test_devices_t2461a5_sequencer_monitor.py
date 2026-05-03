"""T2461-A5 — Sequencer monitor candidates route tests."""

from __future__ import annotations

import json
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
        document={
            "identity": {"hardware_id": "usb:0582:00ed"},
            "loopback_ports": {"playback": "system:playback_1",
                                "capture": "system:capture_1"},
        },
    )
    audio_no_loop = DeviceProfile(
        pack_id="hotone", model="jogg", kind="audio",
        path=Path("/tmp/y.yaml"),
        document={"identity": {"hardware_id": "usb:1f38:0001"}},
    )
    pack_ua = DevicePack(
        pack_id="edirol-ua", path=Path("/tmp/edirol-ua"),
        manifest={"vendor": {"name": "EDIROL / Roland"}, "models": ["ua-1000"]},
        profiles=(audio,),
    )
    pack_jogg = DevicePack(
        pack_id="hotone", path=Path("/tmp/hotone"),
        manifest={"vendor": {"name": "Hotone"}, "models": ["jogg"]},
        profiles=(audio_no_loop,),
    )

    class _Reg:
        def packs(self): return (pack_ua, pack_jogg)
        def get_pack(self, pack_id):
            for p in (pack_ua, pack_jogg):
                if p.pack_id == pack_id:
                    return p
            return None
        def profiles(self, kind=None):
            both = (audio, audio_no_loop)
            if kind in (None, "audio"):
                return both
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


def test_brain_monitor_candidates_only_includes_connected(monkeypatch, client):
    """Nothing connected → empty candidates."""
    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    r = client.get("/api/devices/sequencer-monitor-candidates")
    assert r.status_code == 200
    body = r.json()
    assert body["candidates"] == []


def test_brain_monitor_candidates_only_includes_loopback_ports(monkeypatch, client):
    """Both connected, but only the UA-1000 declares loopback_ports."""
    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices", lambda: [
        {"vid": "0582", "pid": "00ed", "path": "/sys/foo"},
        {"vid": "1f38", "pid": "0001", "path": "/sys/bar"},
    ])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    r = client.get("/api/devices/sequencer-monitor-candidates")
    body = r.json()
    assert body["count"] == 1
    assert body["candidates"][0]["profile_key"] == "edirol-ua/ua-1000.audio"
    assert body["candidates"][0]["loopback_ports"]["playback"] == "system:playback_1"


def test_brain_monitor_candidates_carries_latest_measurement(monkeypatch, client, tmp_path):
    """Latest evidence under docs/fit-for-purpose-evidence/<date>/<pack>/<model>/
    surfaces as latest_measurement."""
    from app.services.controllers import connection_detector as cd
    monkeypatch.setenv("MAP2_SERVICE_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setattr(cd, "_read_usb_devices",
                        lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    # Patch the route's __file__ resolution so it walks our tmp tree.
    real_resolve = Path.resolve
    def fake_resolve(self, *args, **kwargs):
        result = real_resolve(self, *args, **kwargs)
        if "app/routes/devices.py" in str(result):
            class _Shim:
                def __init__(self, base):
                    self._base = base
                @property
                def parents(self):
                    return [self._base, self._base, self._base]
            return _Shim(tmp_path)   # type: ignore[return-value]
        return result
    monkeypatch.setattr(Path, "resolve", fake_resolve)

    target_dir = tmp_path / "docs" / "fit-for-purpose-evidence" / "20260427" / "edirol-ua" / "ua-1000"
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / "loopback-120000.json").write_text(json.dumps({
        "timestamp": "2026-04-27T12:00:00+00:00",
        "method": "synthetic",
        "mean_rtt_ms": 4.2,
        "p95_rtt_ms": 4.6,
        "jitter_p95_ms": 0.2,
    }), encoding="utf-8")

    r = client.get("/api/devices/sequencer-monitor-candidates")
    body = r.json()
    assert body["count"] == 1
    cand = body["candidates"][0]
    assert cand["latest_measurement"]["mean_rtt_ms"] == 4.2
    assert cand["latest_measurement"]["jitter_p95_ms"] == 0.2
