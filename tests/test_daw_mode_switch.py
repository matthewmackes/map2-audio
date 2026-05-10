"""T2503 Set 3 — DAW mode-switch FastAPI route + service-facade tests.

Covers:
1. ``GET /api/daw/mode`` always returns 200 with ``daw_mode_available`` set.
2. ``POST /api/daw/mode`` returns 503 + standard error envelope when the
   engine was built without ``-DMAP2_DAW_MODE=ON``.
3. ``POST /api/daw/mode`` round-trips a switch when the flag is on.
4. The service facade is idempotent (switching to the current mode is a no-op).
5. The ``MAP2_DAW_MODE_AVAILABLE`` env-var override flips behavior.
"""

from __future__ import annotations

import importlib

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import daw as daw_routes
from app.services import daw_service as daw_service_module
from app.services.daw_service import (
    DawService,
    EngineMode,
    TransitionState,
)


def _build_app(facade: DawService) -> FastAPI:
    """Build a fresh FastAPI app wired to the given facade.

    We rebind the module-level singleton getter so the route handler picks up
    the test instance instead of the process-wide default. ``reset_default_daw_service``
    is paired in fixtures to keep cross-test isolation.
    """
    app = FastAPI()
    app.include_router(daw_routes.router)
    daw_service_module._DEFAULT_INSTANCE = facade  # type: ignore[attr-defined]
    return app


@pytest.fixture(autouse=True)
def _reset_default_facade():
    yield
    daw_service_module.reset_default_daw_service()


def test_get_mode_returns_200_with_flag_off() -> None:
    """Flag-OFF: GET /mode reports daw_mode_available=False and live state."""
    facade = DawService(daw_mode_available=False)
    client = TestClient(_build_app(facade))

    resp = client.get("/api/daw/mode")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == EngineMode.LIVE.value
    assert body["state"] == TransitionState.RUNNING.value
    assert body["daw_mode_available"] is False
    assert body["last_error"] is None


def test_post_mode_returns_503_with_flag_off() -> None:
    """Flag-OFF: POST /mode returns 503 + standard error envelope."""
    facade = DawService(daw_mode_available=False)
    client = TestClient(_build_app(facade))

    resp = client.post("/api/daw/mode", json={"mode": "daw"})
    assert resp.status_code == 503, resp.text
    body = resp.json()
    assert "detail" in body
    error = body["detail"]["error"]
    assert error["code"] == "daw_mode_unavailable"
    assert "rebuild" in error["message"].lower()


def test_post_mode_round_trips_with_flag_on() -> None:
    """Flag-ON: POST /mode { mode: 'daw' } moves to DAW; back to live works."""
    facade = DawService(daw_mode_available=True)
    client = TestClient(_build_app(facade))

    # Initial state is live.
    body = client.get("/api/daw/mode").json()
    assert body["mode"] == EngineMode.LIVE.value
    assert body["daw_mode_available"] is True

    # Flip to DAW.
    resp = client.post("/api/daw/mode", json={"mode": "daw"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == EngineMode.DAW.value
    assert body["state"] == TransitionState.RUNNING.value
    assert body["last_error"] is None

    # Confirm via GET.
    body = client.get("/api/daw/mode").json()
    assert body["mode"] == EngineMode.DAW.value

    # Flip back to live.
    resp = client.post("/api/daw/mode", json={"mode": "live"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == EngineMode.LIVE.value


def test_post_mode_invalid_value_returns_422() -> None:
    """Invalid mode payload is rejected by Pydantic before reaching the facade."""
    facade = DawService(daw_mode_available=True)
    client = TestClient(_build_app(facade))

    resp = client.post("/api/daw/mode", json={"mode": "studio"})
    assert resp.status_code == 422, resp.text


def test_facade_request_to_current_mode_is_idempotent() -> None:
    """Direct facade test: flipping to the current mode is a no-op."""
    facade = DawService(daw_mode_available=True)
    initial = facade.status()
    assert initial.mode == EngineMode.LIVE
    after = facade.request_mode_switch(EngineMode.LIVE)
    assert after.mode == EngineMode.LIVE
    assert after.state == TransitionState.RUNNING


def test_env_var_override_flips_availability(monkeypatch: pytest.MonkeyPatch) -> None:
    """MAP2_DAW_MODE_AVAILABLE=1 unblocks the mode-switch path."""
    monkeypatch.setenv("MAP2_DAW_MODE_AVAILABLE", "1")
    importlib.reload(daw_service_module)
    facade = daw_service_module.DawService()  # picks up env override
    assert facade.daw_mode_available is True
    status = facade.request_mode_switch(daw_service_module.EngineMode.DAW)
    assert status.mode == daw_service_module.EngineMode.DAW
    # Reload again after the test so other tests see the default.
    monkeypatch.delenv("MAP2_DAW_MODE_AVAILABLE", raising=False)
    importlib.reload(daw_service_module)


def test_facade_state_after_error() -> None:
    """on_error rolls state back to RUNNING and records last_error."""
    facade = DawService(daw_mode_available=True)
    facade.on_error("simulated device acquire failure")
    status = facade.status()
    assert status.state == TransitionState.RUNNING
    assert status.last_error == "simulated device acquire failure"
    # A successful request_mode_switch clears the error.
    facade.request_mode_switch(EngineMode.DAW)
    assert facade.status().last_error is None
