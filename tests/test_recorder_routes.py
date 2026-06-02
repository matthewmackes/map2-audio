"""T2508-4 — Multi-Track Recorder HTTP route tests.

Mounts the recorder router on a bare FastAPI app and asserts the
operator-facing surface: route shapes, request validation, error
envelope status codes, and the lifecycle threading the
``RecorderService`` singleton.

Routes under test (all under /api/v1/recorder/sessions):
    POST   /sessions                 — arm
    POST   /sessions/{id}/roll       — start_rolling
    POST   /sessions/{id}/stop       — stop
    DELETE /sessions/{id}            — disarm
    GET    /sessions/{id}            — get_session_status
    GET    /sessions                 — list_sessions

RT-irrelevant — every test runs on the asyncio loop. Tests inject a
fixture ``RecorderService`` with deterministic id factory + clock
via FastAPI's dependency_overrides so they don't share state.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.recorder import _get_service, router
from app.services.recorder_service import (
    RecorderService,
    RecorderSessionStatus,
    RecorderVerb,
)


# ---------------------------------------------------------------------------
# Test harness
# ---------------------------------------------------------------------------


def _build_client() -> tuple[
    TestClient,
    RecorderService,
    list[tuple[RecorderVerb, str]],
    list[RecorderSessionStatus],
]:
    """Build a fresh FastAPI app + recorder service per test."""
    verbs: list[tuple[RecorderVerb, str]] = []
    broadcasts: list[RecorderSessionStatus] = []

    async def transport(verb: RecorderVerb, session_id: str) -> None:
        verbs.append((verb, session_id))

    async def broadcaster(status: RecorderSessionStatus) -> None:
        broadcasts.append(status)

    id_iter = iter(["sess-1", "sess-2", "sess-3"])
    clock_iter = iter([f"2026-05-11T18:00:{n:02d}+00:00" for n in range(20)])

    service = RecorderService(
        transport=transport,
        broadcaster=broadcaster,
        local_node_id="map2-prod-01",
        session_id_factory=lambda: next(id_iter),
        clock=lambda: next(clock_iter),
    )

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[_get_service] = lambda: service

    return TestClient(app), service, verbs, broadcasts


# ---------------------------------------------------------------------------
# POST /sessions — arm
# ---------------------------------------------------------------------------


def test_arm_session_returns_201_with_full_status_payload() -> None:
    client, _svc, verbs, _broadcasts = _build_client()
    resp = client.post(
        "/api/v1/recorder/sessions",
        json={
            "snapshot_id": 42,
            "tap_matrix": {
                "chain-rhythm": {"pre_fx": True, "post_fx": True},
                "chain-lead": {"pre_fx": False, "post_fx": True},
            },
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["session_id"] == "sess-1"
    assert body["snapshot_id"] == 42
    assert body["state"] == "armed"
    assert body["armed"] is True
    assert body["rolling"] is False
    assert body["tap_matrix"] == {
        "chain-rhythm": {"pre_fx": True, "post_fx": True},
        "chain-lead": {"pre_fx": False, "post_fx": True},
    }
    assert body["participating_nodes"] == ["map2-prod-01"]
    assert verbs == [(RecorderVerb.ARM, "sess-1")]


def test_arm_session_accepts_empty_tap_matrix() -> None:
    """No taps = status-only session (operator can roll/stop, but the
    engine installs zero capture nodes)."""
    client, _svc, _verbs, _broadcasts = _build_client()
    resp = client.post(
        "/api/v1/recorder/sessions",
        json={"snapshot_id": 1, "tap_matrix": {}},
    )
    assert resp.status_code == 201
    assert resp.json()["tap_matrix"] == {}


def test_arm_session_rejects_negative_snapshot_id_at_400() -> None:
    """Pydantic catches it as a validation error → 422 (FastAPI default).
    This pin documents the contract — operators / clients see 422 on
    schema-level rejects, 400 on service-level (the float case below
    is handled at the service)."""
    client, _svc, _verbs, _broadcasts = _build_client()
    resp = client.post(
        "/api/v1/recorder/sessions",
        json={"snapshot_id": -1, "tap_matrix": {}},
    )
    assert resp.status_code == 422


def test_arm_session_rejects_missing_snapshot_id_at_422() -> None:
    client, _svc, _verbs, _broadcasts = _build_client()
    resp = client.post(
        "/api/v1/recorder/sessions",
        json={"tap_matrix": {}},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /sessions/{id}/roll
# ---------------------------------------------------------------------------


def test_roll_transitions_to_rolling() -> None:
    client, _svc, verbs, _broadcasts = _build_client()
    client.post("/api/v1/recorder/sessions", json={"snapshot_id": 1, "tap_matrix": {}})
    resp = client.post("/api/v1/recorder/sessions/sess-1/roll")
    assert resp.status_code == 200
    assert resp.json()["state"] == "rolling"
    assert resp.json()["rolling"] is True
    assert [v[0] for v in verbs] == [RecorderVerb.ARM, RecorderVerb.ROLL]


def test_roll_on_unknown_session_returns_404() -> None:
    client, _svc, _verbs, _broadcasts = _build_client()
    resp = client.post("/api/v1/recorder/sessions/sess-nope/roll")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"]


def test_roll_on_stopped_session_returns_409() -> None:
    """Rolling a stopped session is a state-machine violation."""
    client, _svc, _verbs, _broadcasts = _build_client()
    client.post("/api/v1/recorder/sessions", json={"snapshot_id": 1, "tap_matrix": {}})
    client.post("/api/v1/recorder/sessions/sess-1/stop")
    resp = client.post("/api/v1/recorder/sessions/sess-1/roll")
    assert resp.status_code == 409
    assert "stopped" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# POST /sessions/{id}/stop
# ---------------------------------------------------------------------------


def test_stop_transitions_rolling_to_stopped() -> None:
    client, _svc, verbs, _broadcasts = _build_client()
    client.post("/api/v1/recorder/sessions", json={"snapshot_id": 1, "tap_matrix": {}})
    client.post("/api/v1/recorder/sessions/sess-1/roll")
    resp = client.post("/api/v1/recorder/sessions/sess-1/stop")
    assert resp.status_code == 200
    assert resp.json()["state"] == "stopped"
    assert resp.json()["rolling"] is False
    assert [v[0] for v in verbs] == [
        RecorderVerb.ARM,
        RecorderVerb.ROLL,
        RecorderVerb.STOP,
    ]


def test_stop_on_unknown_session_returns_404() -> None:
    client, _svc, _verbs, _broadcasts = _build_client()
    resp = client.post("/api/v1/recorder/sessions/sess-nope/stop")
    assert resp.status_code == 404


def test_stop_is_idempotent() -> None:
    """Stopping an already-stopped session returns 200 and no new verbs."""
    client, _svc, verbs, _broadcasts = _build_client()
    client.post("/api/v1/recorder/sessions", json={"snapshot_id": 1, "tap_matrix": {}})
    client.post("/api/v1/recorder/sessions/sess-1/stop")
    verbs.clear()
    resp = client.post("/api/v1/recorder/sessions/sess-1/stop")
    assert resp.status_code == 200
    assert resp.json()["state"] == "stopped"
    assert verbs == []


# ---------------------------------------------------------------------------
# POST /sessions/{id}/seal — T2510-5 read-only terminal state
# ---------------------------------------------------------------------------


def test_seal_transitions_stopped_to_sealed() -> None:
    client, _svc, verbs, _broadcasts = _build_client()
    client.post("/api/v1/recorder/sessions", json={"snapshot_id": 1, "tap_matrix": {}})
    client.post("/api/v1/recorder/sessions/sess-1/roll")
    client.post("/api/v1/recorder/sessions/sess-1/stop")
    verbs.clear()
    resp = client.post("/api/v1/recorder/sessions/sess-1/seal")
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "sealed"
    assert body["sealed"] is True
    assert body["sealed_at"] is not None
    assert body["armed"] is False
    assert body["rolling"] is False
    # Seal is metadata-only — no engine verb emitted.
    assert verbs == []


def test_seal_on_unknown_session_returns_404() -> None:
    client, _svc, _verbs, _broadcasts = _build_client()
    resp = client.post("/api/v1/recorder/sessions/sess-nope/seal")
    assert resp.status_code == 404


def test_seal_on_non_stopped_session_returns_409() -> None:
    """Sealing a still-armed session is a state-machine violation."""
    client, _svc, _verbs, _broadcasts = _build_client()
    client.post("/api/v1/recorder/sessions", json={"snapshot_id": 1, "tap_matrix": {}})
    resp = client.post("/api/v1/recorder/sessions/sess-1/seal")
    assert resp.status_code == 409


def test_seal_is_idempotent() -> None:
    client, _svc, _verbs, _broadcasts = _build_client()
    client.post("/api/v1/recorder/sessions", json={"snapshot_id": 1, "tap_matrix": {}})
    client.post("/api/v1/recorder/sessions/sess-1/stop")
    client.post("/api/v1/recorder/sessions/sess-1/seal")
    resp = client.post("/api/v1/recorder/sessions/sess-1/seal")
    assert resp.status_code == 200
    assert resp.json()["state"] == "sealed"


def test_sealed_session_is_read_only_across_routes() -> None:
    """Roll / stop / re-arm / disarm against a sealed session all 409
    (re-arm shares the id; disarm honours read-only)."""
    client, _svc, _verbs, _broadcasts = _build_client()
    client.post("/api/v1/recorder/sessions", json={"snapshot_id": 1, "tap_matrix": {}})
    client.post("/api/v1/recorder/sessions/sess-1/stop")
    client.post("/api/v1/recorder/sessions/sess-1/seal")

    assert client.post("/api/v1/recorder/sessions/sess-1/roll").status_code == 409
    assert client.post("/api/v1/recorder/sessions/sess-1/stop").status_code == 409
    assert client.delete("/api/v1/recorder/sessions/sess-1").status_code == 409
    # The sealed record survives the rejected disarm.
    get_resp = client.get("/api/v1/recorder/sessions/sess-1")
    assert get_resp.status_code == 200
    assert get_resp.json()["state"] == "sealed"


# ---------------------------------------------------------------------------
# DELETE /sessions/{id} — disarm
# ---------------------------------------------------------------------------


def test_disarm_returns_204_and_drops_session() -> None:
    client, _svc, verbs, _broadcasts = _build_client()
    client.post("/api/v1/recorder/sessions", json={"snapshot_id": 1, "tap_matrix": {}})
    resp = client.delete("/api/v1/recorder/sessions/sess-1")
    assert resp.status_code == 204
    assert resp.content == b""
    assert (RecorderVerb.DISARM, "sess-1") in verbs
    # Subsequent GET returns 404 — session is gone.
    get_resp = client.get("/api/v1/recorder/sessions/sess-1")
    assert get_resp.status_code == 404


def test_disarm_unknown_session_is_silent_no_op_204() -> None:
    """Disarming a session that never existed returns 204 — the engine
    state we care about is "no taps installed", which is already true."""
    client, _svc, verbs, _broadcasts = _build_client()
    resp = client.delete("/api/v1/recorder/sessions/sess-nope")
    assert resp.status_code == 204
    assert verbs == []


# ---------------------------------------------------------------------------
# GET /sessions/{id}
# ---------------------------------------------------------------------------


def test_get_session_status_returns_200_with_canonical_payload() -> None:
    client, _svc, _verbs, _broadcasts = _build_client()
    client.post(
        "/api/v1/recorder/sessions",
        json={
            "snapshot_id": 99,
            "tap_matrix": {"chain-a": {"pre_fx": True, "post_fx": False}},
        },
    )
    resp = client.get("/api/v1/recorder/sessions/sess-1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] == "sess-1"
    assert body["snapshot_id"] == 99
    assert body["state"] == "armed"
    assert body["tap_matrix"] == {"chain-a": {"pre_fx": True, "post_fx": False}}


def test_get_unknown_session_returns_404() -> None:
    client, _svc, _verbs, _broadcasts = _build_client()
    resp = client.get("/api/v1/recorder/sessions/sess-nope")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /sessions — list
# ---------------------------------------------------------------------------


def test_list_sessions_empty_state_returns_zero_count() -> None:
    client, _svc, _verbs, _broadcasts = _build_client()
    resp = client.get("/api/v1/recorder/sessions")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 0
    assert body["sessions"] == []


def test_list_sessions_with_multiple_in_flight() -> None:
    client, _svc, _verbs, _broadcasts = _build_client()
    client.post("/api/v1/recorder/sessions", json={"snapshot_id": 1, "tap_matrix": {}})
    client.post("/api/v1/recorder/sessions", json={"snapshot_id": 2, "tap_matrix": {}})
    client.post("/api/v1/recorder/sessions/sess-1/roll")
    resp = client.get("/api/v1/recorder/sessions")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2
    ids = {s["session_id"] for s in body["sessions"]}
    assert ids == {"sess-1", "sess-2"}
    by_id = {s["session_id"]: s for s in body["sessions"]}
    assert by_id["sess-1"]["state"] == "rolling"
    assert by_id["sess-2"]["state"] == "armed"


def test_list_sessions_filters_disarmed_records() -> None:
    client, _svc, _verbs, _broadcasts = _build_client()
    client.post("/api/v1/recorder/sessions", json={"snapshot_id": 1, "tap_matrix": {}})
    client.post("/api/v1/recorder/sessions", json={"snapshot_id": 2, "tap_matrix": {}})
    client.delete("/api/v1/recorder/sessions/sess-1")
    resp = client.get("/api/v1/recorder/sessions")
    body = resp.json()
    assert body["count"] == 1
    assert body["sessions"][0]["session_id"] == "sess-2"


# ---------------------------------------------------------------------------
# Operation IDs (API contract standards)
# ---------------------------------------------------------------------------


def test_route_operation_ids_are_unique_and_canonical() -> None:
    """Per API contract standards, operation_ids must be unique +
    namespaced. The recorder router uses the `recorder_<action>` shape."""
    app = FastAPI()
    app.include_router(router)
    op_ids = [r.operation_id for r in app.routes if hasattr(r, "operation_id")]
    expected = {
        "recorder_arm_session",
        "recorder_start_rolling",
        "recorder_stop_session",
        "recorder_seal_session",
        "recorder_disarm_session",
        "recorder_get_session_status",
        "recorder_list_sessions",
    }
    assert expected.issubset(set(op_ids))
    # No duplicates.
    assert len(op_ids) == len(set(op_ids))
