"""T2508 end-to-end integration test.

Exercises the full T2508 surface (cycles 4-9) against the real
`app.main.app` instance:
  - Routes registered through the `route_modules` auto-loader.
  - `/api/v1/recorder/sessions` lifecycle: arm → list → roll → stop
    → disarm.
  - `/api/recordings` artifact registry: list empty by default.
  - Operation IDs unique across both routers.

This catches regressions where a route module is renamed, the
auto-loader misses it, or two operations collide. Each
sub-component (handlers, service, routes) has its own unit-level
suite; this test pins the wiring.
"""

from __future__ import annotations

import httpx
import pytest

from app import database as database_module
from app.services.recorder_service import (
    RecorderService,
    set_recorder_service,
)


@pytest.fixture(autouse=True)
def _isolate_recorder_singleton():
    """Each test gets a fresh RecorderService so in-flight session
    state doesn't bleed across tests."""
    set_recorder_service(
        RecorderService(
            local_node_id="map2-test",
            session_id_factory=lambda: "sess-fixed",
        )
    )
    try:
        yield
    finally:
        set_recorder_service(None)


@pytest.fixture
def _temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'recorder-integration.db'}"
    )
    yield


def _client() -> httpx.AsyncClient:
    # Importing app.main here so the fixtures above run first.
    from app.main import app

    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


# ---------------------------------------------------------------------------
# Route registration pin
# ---------------------------------------------------------------------------


async def test_app_registers_recorder_routes_under_v1_prefix(_temp_db) -> None:
    """The route_modules auto-loader picks up `recorder` and mounts
    the 6 lifecycle endpoints under /api/v1/recorder."""
    from app.main import app

    paths = {r.path for r in app.routes if hasattr(r, "path")}
    expected = {
        "/api/v1/recorder/sessions",
        "/api/v1/recorder/sessions/{session_id}/roll",
        "/api/v1/recorder/sessions/{session_id}/stop",
        "/api/v1/recorder/sessions/{session_id}",
    }
    assert expected.issubset(paths)


async def test_app_registers_recordings_routes_under_unversioned_prefix(_temp_db) -> None:
    """The route_modules auto-loader picks up `recordings` and
    mounts the 4 artifact-registry endpoints under /api/recordings."""
    from app.main import app

    paths = {r.path for r in app.routes if hasattr(r, "path")}
    expected = {
        "/api/recordings",
        "/api/recordings/{asset_hash}/metadata",
        "/api/recordings/{asset_hash}/wav",
        "/api/recordings/{asset_hash}",
    }
    assert expected.issubset(paths)


async def test_operation_ids_unique_across_recorder_and_recordings(_temp_db) -> None:
    """Recorder + recordings together must not collide with any other
    operation_id in app.main. This catches the case where a new
    route ships with a duplicate id."""
    from app.main import app

    op_ids = [
        r.operation_id
        for r in app.routes
        if hasattr(r, "operation_id") and r.operation_id is not None
    ]
    recorder_ids = {oid for oid in op_ids if oid.startswith("recorder_") or oid.startswith("recordings_")}
    assert len(recorder_ids) == len(set(recorder_ids))
    # And none collide with other operations.
    assert len(op_ids) == len(set(op_ids))


# ---------------------------------------------------------------------------
# Lifecycle smoke test
# ---------------------------------------------------------------------------


async def test_full_session_lifecycle_against_live_app(_temp_db) -> None:
    """arm → list (1) → roll → stop → disarm. Each transition uses
    the route's response payload so we exercise both the service +
    the response model."""
    async with _client() as client:
        # arm
        arm_resp = await client.post(
            "/api/v1/recorder/sessions",
            json={"snapshot_id": 42, "tap_matrix": {"chain-test": {"pre_fx": True, "post_fx": False}}},
        )
        assert arm_resp.status_code == 201
        arm_body = arm_resp.json()
        assert arm_body["state"] == "armed"
        assert arm_body["session_id"] == "sess-fixed"

        # list shows the one in-flight session
        list_resp = await client.get("/api/v1/recorder/sessions")
        assert list_resp.status_code == 200
        assert list_resp.json()["count"] == 1

        # roll
        roll_resp = await client.post("/api/v1/recorder/sessions/sess-fixed/roll")
        assert roll_resp.status_code == 200
        assert roll_resp.json()["state"] == "rolling"

        # stop
        stop_resp = await client.post("/api/v1/recorder/sessions/sess-fixed/stop")
        assert stop_resp.status_code == 200
        assert stop_resp.json()["state"] == "stopped"

        # disarm drops the session entirely
        disarm_resp = await client.delete("/api/v1/recorder/sessions/sess-fixed")
        assert disarm_resp.status_code == 204

        # list is empty again
        list_after = await client.get("/api/v1/recorder/sessions")
        assert list_after.json() == {"sessions": [], "count": 0}


async def test_recordings_registry_lists_empty_when_no_assets_seeded(_temp_db) -> None:
    """The artifact-registry route filters on asset_type=='recording'.
    With no rows seeded, the list is empty — not 500, not 404."""
    async with _client() as client:
        resp = await client.get("/api/recordings")
        assert resp.status_code == 200
        assert resp.json() == {"recordings": [], "count": 0}


async def test_invalid_state_transition_returns_409(_temp_db) -> None:
    """Stopped → roll is a state-machine violation. The route layer
    must surface the service's `invalid_state` error code as HTTP 409."""
    async with _client() as client:
        await client.post(
            "/api/v1/recorder/sessions",
            json={"snapshot_id": 1, "tap_matrix": {}},
        )
        await client.post("/api/v1/recorder/sessions/sess-fixed/stop")
        roll_after_stop = await client.post(
            "/api/v1/recorder/sessions/sess-fixed/roll"
        )
        assert roll_after_stop.status_code == 409


async def test_unknown_session_returns_404(_temp_db) -> None:
    async with _client() as client:
        for method, path in [
            ("post", "/api/v1/recorder/sessions/nope/roll"),
            ("post", "/api/v1/recorder/sessions/nope/stop"),
            ("get", "/api/v1/recorder/sessions/nope"),
        ]:
            fn = getattr(client, method)
            resp = await fn(path)
            assert resp.status_code == 404, f"{method} {path}"


async def test_delete_unknown_session_is_silent_204(_temp_db) -> None:
    """The disarm route is idempotent on unknown — operator cleanup
    flows don't break if the session is already gone."""
    async with _client() as client:
        resp = await client.delete("/api/v1/recorder/sessions/already-gone")
        assert resp.status_code == 204
