"""Tests for the Configurator pack-discovery route.

GET /api/midi/configurator/packs returns lightweight metadata that the
frontend Configurator merges with its locally-registered descriptor
library. Covers the available-only filter, the include_unavailable
override, and the contract shape.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import configurator_packs


def _make_client() -> TestClient:
    app = FastAPI()
    app.include_router(configurator_packs.router)
    return TestClient(app)


def test_default_lists_only_available_packs():
    client = _make_client()
    resp = client.get("/api/midi/configurator/packs")
    assert resp.status_code == 200
    body = resp.json()
    assert "packs" in body
    assert all(p["available"] for p in body["packs"])


def test_response_includes_meloaudio_commander():
    """The repo's first registered pack must surface in the default
    response so the frontend picker can render its tile."""
    client = _make_client()
    resp = client.get("/api/midi/configurator/packs")
    body = resp.json()
    pack_ids = {p["pack_id"] for p in body["packs"]}
    assert "meloaudio_commander" in pack_ids


def test_pack_entry_carries_bespoke_route():
    """Bespoke route is the navigation contract used by the picker.
    MeloAudio's must point at /midi/devices/meloaudio-commander."""
    client = _make_client()
    body = client.get("/api/midi/configurator/packs").json()
    melo = next(p for p in body["packs"] if p["pack_id"] == "meloaudio_commander")
    assert melo["bespoke_route"] == "/midi/devices/meloaudio-commander"
    assert melo["display_name"] == "MeloAudio MIDI Commander"
    assert isinstance(melo.get("summary"), str) and len(melo["summary"]) > 0


def test_include_unavailable_query_param_returns_more_or_equal_packs():
    """When include_unavailable=true the response may grow but never
    shrink relative to the default response."""
    client = _make_client()
    default_count = len(client.get("/api/midi/configurator/packs").json()["packs"])
    inclusive_count = len(
        client.get("/api/midi/configurator/packs?include_unavailable=true").json()["packs"]
    )
    assert inclusive_count >= default_count


def test_response_shape_matches_pydantic_contract():
    """Each entry must validate against ConfiguratorPackEntry — using
    .model_validate forces the test to fail loudly on schema drift
    (renamed fields, missing required ones, etc.)."""
    client = _make_client()
    body = client.get("/api/midi/configurator/packs").json()
    for raw in body["packs"]:
        configurator_packs.ConfiguratorPackEntry.model_validate(raw)
