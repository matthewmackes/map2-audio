"""T2459-G1 — Hardware Store route tests.

Covers the new endpoints introduced for the Hardware Store integration:

  - GET  /api/devices/connected
  - GET  /api/devices/recently-disconnected
  - GET  /api/devices/known
  - POST /api/devices/pin
  - POST /api/devices/unpin
  - GET  /api/devices/diagnostics
  - GET  /api/devices/packs/sources

The existing /packs, /profiles, /resolve, /mappings routes are covered
by ``tests/test_devices_routes.py`` (T2459-A3).
"""

from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import devices as devices_routes
from app.services.controllers import bench_state, profile_registry
from app.services.controllers.profile_registry import (
    DevicePack,
    DeviceProfile,
    ProfileRegistry,
)


@pytest.fixture
def fresh_pin_file(tmp_path: Path):
    """Force the bench-state singleton onto a tmp pin file so tests
    don't pollute ``~/.map2/hardware_store_pins.json``.
    """
    pin_path = tmp_path / "pins.json"
    bench_state.reset_bench_state_for_tests(pin_file=pin_path)
    yield pin_path
    bench_state.reset_bench_state_for_tests(pin_file=None)


@pytest.fixture
def stub_registry(monkeypatch):
    """Replace get_profile_registry() with a small in-memory registry
    holding two real profiles (an audio + MIDI for the UA-1000).
    """
    audio = DeviceProfile(
        pack_id="edirol-ua",
        model="ua-1000",
        kind="audio",
        path=Path("/tmp/edirol-ua/ua-1000.audio.yaml"),
        document={
            "identity": {
                "hardware_id": "usb:0582:00ed",
                "alsa_card_regex": "EDIROL.*UA-?1000",
            },
        },
    )
    midi = DeviceProfile(
        pack_id="edirol-ua",
        model="ua-1000",
        kind="midi",
        path=Path("/tmp/edirol-ua/ua-1000.midi.yaml"),
        document={
            "identity": {
                "hardware_id": "usb:0582:00ed",
                "alsa_client_pattern": "EDIROL UA-1000",
            },
        },
    )
    pack = DevicePack(
        pack_id="edirol-ua",
        path=Path("/tmp/edirol-ua"),
        manifest={"vendor": {"name": "EDIROL / Roland"}, "models": ["ua-1000"]},
        profiles=(audio, midi),
        degraded_files=(),
    )

    class _Reg:
        def packs(self):
            return (pack,)

        def get_pack(self, pack_id):
            return pack if pack_id == "edirol-ua" else None

        def profiles(self, kind=None):
            if kind is None:
                return (audio, midi)
            return tuple(p for p in (audio, midi) if p.kind == kind)

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


# ---------------------------------------------------------------------------
# /connected — happy path with detector mocked
# ---------------------------------------------------------------------------


def test_connected_with_no_devices(monkeypatch, client):
    """No connected devices: snapshot has 0 records, route returns 200
    with count=0 and the four sources still listed in attempted.
    """
    # Patch detector module-level readers to return empty
    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    r = client.get("/api/devices/connected")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 0
    assert body["snapshot"]["records"] == []
    assert set(body["snapshot"]["sources_attempted"]) == {
        "usb", "alsa_seq", "alsa_card", "pipewire",
    }


def test_connected_with_ua1000_present(monkeypatch, client):
    """USB sees Roland VID/PID + ALSA card sees EDIROL → audio profile
    matches via two sources; MIDI profile via one (USB)."""
    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices",
                        lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients",
                        lambda: ["EDIROL UA-1000 MIDI 1"])
    monkeypatch.setattr(cd, "_read_alsa_card_names",
                        lambda: ["EDIROL UA-1000"])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    r = client.get("/api/devices/connected")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    keys = {rec["profile_key"] for rec in body["snapshot"]["records"]}
    assert keys == {"edirol-ua/ua-1000.audio", "edirol-ua/ua-1000.midi"}


# ---------------------------------------------------------------------------
# /known + /pin + /unpin
# ---------------------------------------------------------------------------


def test_pin_unpin_round_trip(client):
    profile_key = "edirol-ua/ua-1000.audio"

    r = client.post("/api/devices/pin", json={"profile_key": profile_key})
    assert r.status_code == 200
    body = r.json()
    assert body["pinned"] is True
    assert body["newly_added"] is True

    # Idempotent: second call says newly_added=False
    r = client.post("/api/devices/pin", json={"profile_key": profile_key})
    assert r.json()["newly_added"] is False

    # Pinned device shows up in /known even with no recent sighting
    r = client.get("/api/devices/known")
    rows = r.json()["known"]
    assert any(row["profile_key"] == profile_key and row["is_pinned"] for row in rows)

    # Unpin removes
    r = client.post("/api/devices/unpin", json={"profile_key": profile_key})
    assert r.json()["newly_removed"] is True

    r = client.get("/api/devices/known")
    rows = r.json()["known"]
    assert not any(row["profile_key"] == profile_key for row in rows)


def test_known_includes_recent_sighting(monkeypatch, client):
    """A profile seen by the detector must appear in /known even if
    not pinned, until the 24-hour retention window lapses.
    """
    from app.services.controllers import connection_detector as cd
    monkeypatch.setattr(cd, "_read_usb_devices",
                        lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])

    # Trigger one detection to populate sightings
    client.get("/api/devices/connected")

    r = client.get("/api/devices/known")
    rows = r.json()["known"]
    keys = {row["profile_key"] for row in rows}
    assert "edirol-ua/ua-1000.audio" in keys
    assert "edirol-ua/ua-1000.midi" in keys


# ---------------------------------------------------------------------------
# /recently-disconnected
# ---------------------------------------------------------------------------


def test_recently_disconnected_after_unplug(monkeypatch, client):
    """Connect → disconnect: profile key surfaces in
    /recently-disconnected for 30 seconds."""
    from app.services.controllers import connection_detector as cd

    # Phase 1: device present
    monkeypatch.setattr(cd, "_read_usb_devices",
                        lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}])
    monkeypatch.setattr(cd, "_read_alsa_seq_clients", lambda: [])
    monkeypatch.setattr(cd, "_read_alsa_card_names", lambda: [])
    monkeypatch.setattr(cd, "_read_pipewire_nodes", lambda: [])
    client.get("/api/devices/connected")

    # Phase 2: device removed
    monkeypatch.setattr(cd, "_read_usb_devices", lambda: [])

    r = client.get("/api/devices/recently-disconnected")
    assert r.status_code == 200
    body = r.json()
    keys = {row["profile_key"] for row in body["recently_disconnected"]}
    assert "edirol-ua/ua-1000.audio" in keys
    assert "edirol-ua/ua-1000.midi" in keys


# ---------------------------------------------------------------------------
# /diagnostics
# ---------------------------------------------------------------------------


def test_diagnostics_clean_returns_empty(client):
    r = client.get("/api/devices/diagnostics")
    assert r.status_code == 200
    body = r.json()
    # No degraded packs, no controller-host crash → empty list
    assert isinstance(body["diagnostics"], list)
    assert body["counts_by_severity"]["error"] == 0


def test_diagnostics_degraded_pack_surfaces(monkeypatch, stub_registry, client):
    """Inject a degraded pack into the registry and confirm it surfaces."""
    bad_pack = DevicePack(
        pack_id="brokenco",
        path=Path("/tmp/brokenco"),
        manifest={"vendor": {"name": "BrokenCo"}, "models": ["mystery"]},
        profiles=(),
        degraded_files=(Path("/tmp/brokenco/profiles/mystery.midi.yaml"),),
    )

    class _Reg:
        def packs(self):
            return (bad_pack,)
        def get_pack(self, pack_id):
            return bad_pack if pack_id == "brokenco" else None
        def profiles(self, kind=None):
            return ()

    monkeypatch.setattr(devices_routes, "get_profile_registry", lambda: _Reg())

    r = client.get("/api/devices/diagnostics")
    assert r.status_code == 200
    body = r.json()
    rows = body["diagnostics"]
    assert any(
        row["source"] == "profile_registry"
        and row["code"] == "pack_degraded"
        and row["pack_id"] == "brokenco"
        for row in rows
    )
    assert body["counts_by_severity"]["error"] >= 1


def test_diagnostics_severity_filter(monkeypatch, client):
    """Filter by severity returns only matching rows."""
    bad_pack = DevicePack(
        pack_id="brokenco",
        path=Path("/tmp/brokenco"),
        manifest={"vendor": {"name": "BrokenCo"}, "models": ["mystery"]},
        profiles=(),
        degraded_files=(Path("/tmp/brokenco/x.yaml"),),
    )
    class _Reg:
        def packs(self): return (bad_pack,)
        def get_pack(self, pack_id): return None
        def profiles(self, kind=None): return ()
    monkeypatch.setattr(devices_routes, "get_profile_registry", lambda: _Reg())

    r = client.get("/api/devices/diagnostics?severity=warning")
    body = r.json()
    # Pack degradation is "error" severity, so warning filter returns empty.
    assert body["count"] == 0

    r = client.get("/api/devices/diagnostics?severity=error")
    assert r.json()["count"] >= 1


# ---------------------------------------------------------------------------
# /packs/sources
# ---------------------------------------------------------------------------


def test_packs_sources_classifies_shipped(monkeypatch, client):
    """Stub registry lives at /tmp/edirol-ua → classified as 'shipped'
    (no _mixx-imports or .map2 markers).
    """
    r = client.get("/api/devices/packs/sources")
    assert r.status_code == 200
    body = r.json()
    sources = {row["pack_id"]: row for row in body["sources"]}
    assert sources["edirol-ua"]["source"] == "shipped"
    assert sources["edirol-ua"]["vendor"] == "EDIROL / Roland"


def test_packs_sources_classifies_imported(monkeypatch, client):
    """Pack at a path containing _mixx-imports gets classified imported."""
    pack = DevicePack(
        pack_id="_mixx-imports",
        path=Path("/repo/device-packs/_mixx-imports"),
        manifest={"vendor": {"name": "Mixxx (upstream)"}, "models": []},
        profiles=(),
        degraded_files=(),
    )
    class _Reg:
        def packs(self): return (pack,)
        def get_pack(self, pack_id): return pack if pack_id == "_mixx-imports" else None
        def profiles(self, kind=None): return ()
    monkeypatch.setattr(devices_routes, "get_profile_registry", lambda: _Reg())

    r = client.get("/api/devices/packs/sources")
    body = r.json()
    sources = {row["pack_id"]: row for row in body["sources"]}
    assert sources["_mixx-imports"]["source"] == "imported"


def test_packs_sources_classifies_user(monkeypatch, client):
    """Pack at ~/.map2/device-packs-user/X gets classified user."""
    pack = DevicePack(
        pack_id="my-custom-pack",
        path=Path("/home/operator/.map2/device-packs-user/my-custom-pack"),
        manifest={"vendor": {"name": "Operator"}, "models": []},
        profiles=(),
        degraded_files=(),
    )
    class _Reg:
        def packs(self): return (pack,)
        def get_pack(self, pack_id): return pack if pack_id == "my-custom-pack" else None
        def profiles(self, kind=None): return ()
    monkeypatch.setattr(devices_routes, "get_profile_registry", lambda: _Reg())

    r = client.get("/api/devices/packs/sources")
    body = r.json()
    sources = {row["pack_id"]: row for row in body["sources"]}
    assert sources["my-custom-pack"]["source"] == "user"
