"""Tests for the explicit MIDI v1 retirement flow (T2459-H5 slice 12).

The legacy MIDI routers can be flipped from "deprecated but live" to
"410 Gone" via the ``MAP2_MIDI_LEGACY_RETIRED`` env var. These tests pin
both states and the v2 surface invariance.
"""

from __future__ import annotations

import importlib

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import _midi_v1_retirement


LEGACY_GET_PATHS = [
    "/api/midi/hub/status",
    "/api/midi/cluster/nodes",
    "/api/midi-learn/learn/status",
    "/api/midi-commander/status",
    "/api/enriched-midi-physical-surfaces/summary",
]

V2_PATH = "/api/v2/midi/mappings"


def _build_app() -> FastAPI:
    """Reload the unified midi router so it picks up the current env flag."""
    import app.routes.midi as midi_module

    importlib.reload(_midi_v1_retirement)
    midi_module = importlib.reload(midi_module)
    app = FastAPI()
    app.include_router(midi_module.router)
    return app


@pytest.fixture(autouse=True)
def _restore_module(monkeypatch):
    # Ensure the env var is unset before each test; the test itself sets it.
    monkeypatch.delenv("MAP2_MIDI_LEGACY_RETIRED", raising=False)
    yield
    # Reload back to the default state so other test modules see the
    # standard deprecated-but-mounted behavior.
    importlib.reload(_midi_v1_retirement)
    import app.routes.midi as midi_module
    importlib.reload(midi_module)


def test_flag_default_keeps_legacy_routes_serving() -> None:
    app = _build_app()
    client = TestClient(app, raise_server_exceptions=False)
    for path in LEGACY_GET_PATHS:
        response = client.get(path)
        # Anything except 410 means the legacy handler still owns the path.
        # (Real responses are typically 200/404/500 depending on backing
        # services in the test environment.)
        assert response.status_code != 410, (
            f"{path} returned 410 with the flag unset"
        )


def test_flag_true_returns_410_with_sunset_envelope(monkeypatch) -> None:
    monkeypatch.setenv("MAP2_MIDI_LEGACY_RETIRED", "1")
    app = _build_app()
    client = TestClient(app, raise_server_exceptions=False)

    for path in LEGACY_GET_PATHS:
        response = client.get(path)
        assert response.status_code == 410, f"{path} did not return 410"
        assert response.headers.get("Sunset") == _midi_v1_retirement.SUNSET_HEADER
        assert response.headers.get("Deprecation") == "true"
        link = response.headers.get("Link", "")
        assert _midi_v1_retirement.SUCCESSOR_PREFIX in link
        assert "successor-version" in link

        body = response.json()
        assert "error" in body
        err = body["error"]
        assert err["code"] == "midi_v1_retired"
        assert err["details"] == {
            "replacement_prefix": _midi_v1_retirement.SUCCESSOR_PREFIX
        }
        assert path in err["message"]


def test_v2_surface_unaffected_when_flag_is_off() -> None:
    app = _build_app()
    paths = {route.path for route in app.routes}
    assert V2_PATH in paths


def test_v2_surface_unaffected_when_flag_is_on(monkeypatch) -> None:
    monkeypatch.setenv("MAP2_MIDI_LEGACY_RETIRED", "1")
    app = _build_app()
    paths = {route.path for route in app.routes}
    assert V2_PATH in paths

    schema = app.openapi()
    # v2 is never marked deprecated by the retirement flow.
    op = schema["paths"][V2_PATH].get("post", {}) or schema["paths"][V2_PATH].get("get", {})
    assert op.get("deprecated") in (None, False)


def test_retired_legacy_paths_are_dropped_from_openapi(monkeypatch) -> None:
    monkeypatch.setenv("MAP2_MIDI_LEGACY_RETIRED", "1")
    app = _build_app()
    schema = app.openapi()
    schema_paths = set(schema.get("paths", {}).keys())
    for path in LEGACY_GET_PATHS:
        assert path not in schema_paths, (
            f"{path} should not appear in the OpenAPI schema once retired"
        )
