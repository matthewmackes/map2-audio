"""T2461-A8 — Mixxx alias resolver route tests."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
import yaml
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import devices as devices_routes
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
        "description": "Mixxx alias resolver test pack.",
        "license": "AGPL-3.0-only",
        "models": ["midi-1"],
    }), encoding="utf-8")

    (vendor / "profiles").mkdir()
    (vendor / "profiles" / "midi-1.midi.yaml").write_text(yaml.safe_dump({
        "schema_version": 1,
        "identity": {
            "manufacturer": "Fixture Co", "model": "midi-1",
            "alsa_client_pattern": "Fixture MIDI",
        },
        "controls": [],
        "outputs": [],
        # Per-pack alias overrides take priority over WELL_KNOWN.
        "mixxx_alias_table": {
            "[Channel1]": "audio.chain.1",
            "[CustomGroup]": "audio.special.path",
        },
    }, sort_keys=False), encoding="utf-8")
    return packs


@pytest.fixture
def app(pack_tree, monkeypatch):
    reg = ProfileRegistry(packs_root=pack_tree)
    reg.load_packs()
    monkeypatch.setattr(devices_routes, "get_profile_registry", lambda: reg)
    a = FastAPI()
    a.include_router(devices_routes.router)
    return a


@pytest.fixture
def client(app):
    return TestClient(app)


def test_resolve_alias_uses_pack_override(client):
    """[Channel1].volume should resolve through the pack's alias table
    to audio.chain.1.volume."""
    r = client.post(
        "/api/devices/profiles/fixture-co/midi-1/midi/resolve-alias",
        json={"group": "[Channel1]", "key": "volume"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["resolved"] is True
    assert body["target"] == "audio.chain.1.volume"
    assert body["alias_table_used"] is True


def test_resolve_alias_unmapped_pair_fails_soft(client):
    """Mixxx group+key not in alias table or WELL_KNOWN reports
    resolved=False with a reason."""
    r = client.post(
        "/api/devices/profiles/fixture-co/midi-1/midi/resolve-alias",
        json={"group": "[NotAGroup]", "key": "made_up_key"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["resolved"] is False
    assert "reason" in body


def test_resolve_alias_audio_kind_400(client):
    r = client.post(
        "/api/devices/profiles/fixture-co/midi-1/audio/resolve-alias",
        json={"group": "[Channel1]", "key": "volume"},
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "invalid_kind"


def test_resolve_alias_unknown_profile_404(client):
    r = client.post(
        "/api/devices/profiles/nope/missing/midi/resolve-alias",
        json={"group": "[Channel1]", "key": "volume"},
    )
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "profile_not_found"
