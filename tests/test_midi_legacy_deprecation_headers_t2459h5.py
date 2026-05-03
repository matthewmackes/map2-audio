"""T2459-H5 Slice 17 — legacy MIDI routes carry deprecation advisory
headers at runtime even before the 410-Gone flip.

The headers match the 410-Gone path (same Sunset / Link / Deprecation
trio) so HTTP clients see the same advisory the moment they hit a
legacy mount, months before the cutover.
"""

from __future__ import annotations

import importlib

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from app.routes import _midi_v1_retirement


@pytest.fixture(autouse=True)
def _restore_module(monkeypatch):
    monkeypatch.delenv("MAP2_MIDI_LEGACY_RETIRED", raising=False)
    yield
    importlib.reload(_midi_v1_retirement)


def _build_app_with_legacy_route() -> FastAPI:
    """Mount a tiny legacy router through the wrapper so we can hit
    a real path with TestClient and inspect the response headers."""
    legacy = APIRouter(prefix="/api/midi/legacy_test", tags=["MIDI Legacy Test"])

    @legacy.get("/ping")
    async def _ping() -> dict:
        return {"ok": True}

    parent = APIRouter()
    _midi_v1_retirement.include_legacy_midi_router(parent, legacy)
    app = FastAPI()
    app.include_router(parent)
    return app


def test_legacy_response_carries_sunset_link_deprecation_headers():
    app = _build_app_with_legacy_route()
    client = TestClient(app)
    res = client.get("/api/midi/legacy_test/ping")
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    assert res.headers["Sunset"] == _midi_v1_retirement.SUNSET_HEADER
    assert res.headers["Deprecation"] == "true"
    assert "successor-version" in res.headers["Link"]
    assert _midi_v1_retirement.SUCCESSOR_PREFIX in res.headers["Link"]


def test_legacy_response_after_retirement_still_carries_advisory_headers(monkeypatch):
    """Post-flip the same headers ride along with the 410-Gone body —
    pinned here so a future change to the 410 emitter doesn't drop
    them."""
    monkeypatch.setenv("MAP2_MIDI_LEGACY_RETIRED", "1")
    importlib.reload(_midi_v1_retirement)
    app = _build_app_with_legacy_route()
    client = TestClient(app)
    res = client.get("/api/midi/legacy_test/ping")
    assert res.status_code == 410
    assert res.headers["Sunset"] == _midi_v1_retirement.SUNSET_HEADER
    assert res.headers["Deprecation"] == "true"
    assert "successor-version" in res.headers["Link"]


def test_v2_routes_do_not_get_deprecation_headers():
    """v2 surfaces are NOT wrapped with the deprecation advisory —
    only legacy mounts. Pin so the wrapper doesn't accidentally
    spread to non-legacy routers."""
    v2 = APIRouter(prefix="/api/v2/midi/test")

    @v2.get("/ping")
    async def _ping() -> dict:
        return {"ok": True}

    parent = APIRouter()
    parent.include_router(v2)  # no wrapping
    app = FastAPI()
    app.include_router(parent)

    client = TestClient(app)
    res = client.get("/api/v2/midi/test/ping")
    assert res.status_code == 200
    assert "Sunset" not in res.headers
    assert "Deprecation" not in res.headers
