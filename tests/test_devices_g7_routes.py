"""T2459-G7 — bindings route tests.

End-to-end through FastAPI TestClient: POST bindings → 200 + token →
POST undo → 200 + revision. Uses a tmp pack tree so the live
device-packs/ stays untouched.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
import yaml
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import devices as devices_routes
from app.services.controllers import bindings_writer
from app.services.controllers.profile_registry import ProfileRegistry


REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_DIR = REPO_ROOT / "device-packs" / "_schema"


@pytest.fixture
def pack_tree(tmp_path: Path) -> Path:
    packs = tmp_path / "device-packs"
    packs.mkdir()
    shutil.copytree(SCHEMA_DIR, packs / "_schema")

    vendor = packs / "fixture-co"
    vendor.mkdir()
    (vendor / "pack.yaml").write_text(yaml.safe_dump({
        "schema_version": 1,
        "pack_id": "fixture-co",
        "vendor": {"name": "Fixture Co"},
        "description": "G7 route fixture pack.",
        "license": "AGPL-3.0-only",
        "models": ["midi-1"],
    }), encoding="utf-8")

    profiles_dir = vendor / "profiles"
    profiles_dir.mkdir()
    (profiles_dir / "midi-1.midi.yaml").write_text(yaml.safe_dump({
        "schema_version": 1,
        "identity": {
            "manufacturer": "Fixture Co", "model": "midi-1",
            "hardware_id": "usb:dead:beef",
            "alsa_client_pattern": "Fixture MIDI",
        },
        "controls": [
            {"status": 176, "midino": 7, "channel": 1, "target": "audio.master.volume", "action": "set"},
        ],
        "outputs": [],
    }, sort_keys=False), encoding="utf-8")
    return packs


@pytest.fixture
def app(pack_tree, monkeypatch):
    """Wire a FastAPI app whose registry is rooted at our tmp tree."""
    bindings_writer.reset_bindings_writer_for_tests()

    reg = ProfileRegistry(packs_root=pack_tree)
    reg.load_packs()
    monkeypatch.setattr(devices_routes, "get_profile_registry", lambda: reg)

    a = FastAPI()
    a.include_router(devices_routes.router)
    return a


@pytest.fixture
def client(app):
    return TestClient(app)


def test_post_bindings_writes_yaml_and_returns_token(client, pack_tree):
    r = client.post(
        "/api/devices/profiles/fixture-co/midi-1/midi/bindings",
        json={
            "controls": [
                {"status": 176, "midino": 99, "channel": 1, "target": "audio.chain.1.volume", "action": "set"},
            ],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["revision"]
    assert body["undo_token"]
    assert body["bytes_written"] > 0

    profile_path = pack_tree / "fixture-co" / "profiles" / "midi-1.midi.yaml"
    on_disk = yaml.safe_load(profile_path.read_text(encoding="utf-8"))
    assert on_disk["controls"][0]["midino"] == 99


def test_post_bindings_then_undo_restores_yaml(client, pack_tree):
    profile_path = pack_tree / "fixture-co" / "profiles" / "midi-1.midi.yaml"
    original = profile_path.read_text(encoding="utf-8")

    r = client.post(
        "/api/devices/profiles/fixture-co/midi-1/midi/bindings",
        json={
            "controls": [
                {"status": 176, "midino": 1, "channel": 1, "target": "audio.master.volume", "action": "set"},
            ],
        },
    )
    assert r.status_code == 200
    token = r.json()["undo_token"]
    assert profile_path.read_text(encoding="utf-8") != original

    r2 = client.post(
        "/api/devices/profiles/fixture-co/midi-1/midi/bindings/undo",
        json={"undo_token": token},
    )
    assert r2.status_code == 200
    assert r2.json()["revision"]
    assert profile_path.read_text(encoding="utf-8") == original


def test_post_bindings_rejects_audio_kind(client):
    r = client.post(
        "/api/devices/profiles/fixture-co/midi-1/audio/bindings",
        json={"controls": []},
    )
    # The route's pre-check returns 400 with the locked Q20 envelope
    # before the registry lookup.
    assert r.status_code == 400
    body = r.json()
    assert body["detail"]["code"] == "invalid_kind"
    assert body["detail"]["source"] == "bindings_writer"


def test_post_bindings_unknown_pack_returns_404(client):
    r = client.post(
        "/api/devices/profiles/does-not-exist/foo/midi/bindings",
        json={"controls": []},
    )
    assert r.status_code == 404
    body = r.json()
    assert body["detail"]["code"] == "pack_not_found"


def test_post_bindings_empty_payload_400(client):
    r = client.post(
        "/api/devices/profiles/fixture-co/midi-1/midi/bindings",
        json={},
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "empty_payload"


def test_post_bindings_invalid_schema_400(client):
    r = client.post(
        "/api/devices/profiles/fixture-co/midi-1/midi/bindings",
        json={"controls": [{"definitely_invalid": True}]},
    )
    assert r.status_code == 400
    body = r.json()
    assert body["detail"]["code"] == "binding_write_failed"


def test_undo_with_unknown_token_returns_410(client):
    r = client.post(
        "/api/devices/profiles/fixture-co/midi-1/midi/bindings/undo",
        json={"undo_token": "expired-or-fake"},
    )
    assert r.status_code == 410
    assert r.json()["detail"]["code"] == "undo_token_unknown"
