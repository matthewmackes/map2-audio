"""T2512 — Looper HTTP route tests.

Initial focus: T2512-LOCK route surface — `PATCH /track/{id}/locked`
toggling the write-lock and `track_locked` → HTTP 409 on mutating
verbs while locked.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.looper import _get_service, router
from app.services.looper_service import LooperService, TrackState


class _FakeEngine:
    def __init__(self) -> None:
        self.record_calls: list[int] = []
        self.clear_calls: list[int] = []
        self.stop_calls: list[int] = []

    def looper_record(self, track: int) -> None:
        self.record_calls.append(track)

    def looper_clear(self, track: int) -> None:
        self.clear_calls.append(track)

    def looper_stop(self, track: int) -> None:
        self.stop_calls.append(track)

    def looper_undo(self, track: int) -> None:
        pass

    def looper_redo(self, track: int) -> None:
        pass

    def looper_set_muted(self, track: int, muted: bool) -> None:
        pass

    def looper_set_level_db(self, track: int, db: float) -> None:
        pass

    def looper_get_status(self) -> dict:
        return {
            "tracks": [
                {
                    "track": i,
                    "state": int(TrackState.EMPTY),
                    "loop_length_frames": 0,
                    "playhead_frames": 0,
                    "layer_count": 0,
                    "level_db": 0.0,
                    "muted": False,
                    "soloed": False,
                    "reverse": False,
                    "half_speed": False,
                }
                for i in range(4)
            ],
            "active_track_count": 0,
            "sync_master": False,
            "master_level_db": 0.0,
        }


def _build_client() -> tuple[TestClient, LooperService, _FakeEngine]:
    engine = _FakeEngine()
    service = LooperService(engine=engine)

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[_get_service] = lambda: service
    return TestClient(app), service, engine


def test_set_locked_route_toggles_flag() -> None:
    client, _, _ = _build_client()
    resp = client.patch("/api/v1/looper/track/2/locked", json={"value": True})
    assert resp.status_code == 200
    body = resp.json()
    assert body["tracks"][2]["locked"] is True
    assert body["tracks"][0]["locked"] is False


def test_record_on_locked_track_returns_409() -> None:
    client, _, engine = _build_client()
    client.patch("/api/v1/looper/track/1/locked", json={"value": True})
    resp = client.post("/api/v1/looper/track/1/record")
    assert resp.status_code == 409
    assert "locked" in resp.json()["detail"].lower()
    assert engine.record_calls == []  # never reached the engine


def test_clear_on_locked_track_returns_409() -> None:
    client, _, engine = _build_client()
    client.patch("/api/v1/looper/track/0/locked", json={"value": True})
    resp = client.post("/api/v1/looper/track/0/clear")
    assert resp.status_code == 409
    assert engine.clear_calls == []


def test_stop_works_on_locked_track() -> None:
    """T2512-LOCK does not gate stop; the operator can still stop a locked loop."""
    client, _, engine = _build_client()
    client.patch("/api/v1/looper/track/3/locked", json={"value": True})
    resp = client.post("/api/v1/looper/track/3/stop")
    assert resp.status_code == 200
    assert engine.stop_calls == [3]


def test_set_locked_invalid_track_returns_400() -> None:
    client, _, _ = _build_client()
    resp = client.patch("/api/v1/looper/track/9/locked", json={"value": True})
    assert resp.status_code == 400


def test_unlock_route_then_record_works() -> None:
    client, _, engine = _build_client()
    client.patch("/api/v1/looper/track/2/locked", json={"value": True})
    client.patch("/api/v1/looper/track/2/locked", json={"value": False})
    resp = client.post("/api/v1/looper/track/2/record")
    assert resp.status_code == 200
    assert engine.record_calls == [2]


def test_status_route_reports_lock_state() -> None:
    client, _, _ = _build_client()
    client.patch("/api/v1/looper/track/0/locked", json={"value": True})
    resp = client.get("/api/v1/looper/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["tracks"][0]["locked"] is True
    assert all(body["tracks"][i]["locked"] is False for i in (1, 2, 3))


# ---------------------------------------------------------------------------
# OpenAPI surface — every route carries a summary + operation_id.
# ---------------------------------------------------------------------------


def test_every_looper_route_has_summary_and_operation_id() -> None:
    """Locks the OpenAPI audit so a future hand-written route can't slip
    in without docs. Failing this test means a route is missing one of
    ``summary=`` or ``operation_id=`` on its decorator."""
    from app.routes.looper import router

    # APIRoute objects expose .name (function name), .operation_id, and
    # .summary. We require both to be non-empty for every route this
    # module owns.
    missing: list[tuple[str, list[str]]] = []
    for route in router.routes:
        gaps: list[str] = []
        if not getattr(route, "operation_id", None):
            gaps.append("operation_id")
        if not getattr(route, "summary", None):
            gaps.append("summary")
        if gaps:
            missing.append((getattr(route, "name", str(route)), gaps))
    assert missing == [], f"routes missing OpenAPI metadata: {missing}"


def test_operation_ids_are_unique_within_looper_router() -> None:
    from app.routes.looper import router

    op_ids = [
        route.operation_id
        for route in router.routes
        if getattr(route, "operation_id", None)
    ]
    assert len(op_ids) == len(set(op_ids)), (
        "duplicate operation_id values: "
        + str([op for op in op_ids if op_ids.count(op) > 1])
    )


# ---------------------------------------------------------------------------
# T2512-OS — one-shot / trigger mode route surface
# ---------------------------------------------------------------------------


def test_set_one_shot_route_toggles_flag() -> None:
    client, _, _ = _build_client()
    resp = client.patch("/api/v1/looper/track/2/one-shot", json={"value": True})
    assert resp.status_code == 200
    body = resp.json()
    assert body["tracks"][2]["one_shot"] is True
    assert all(body["tracks"][i]["one_shot"] is False for i in (0, 1, 3))


def test_set_one_shot_invalid_track_returns_400() -> None:
    client, _, _ = _build_client()
    resp = client.patch("/api/v1/looper/track/9/one-shot", json={"value": True})
    assert resp.status_code == 400


def test_one_shot_status_persists_across_record() -> None:
    """Flag must survive operator actions on the track."""
    client, _, engine = _build_client()
    client.patch("/api/v1/looper/track/0/one-shot", json={"value": True})
    client.post("/api/v1/looper/track/0/record")
    resp = client.get("/api/v1/looper/status")
    assert resp.status_code == 200
    assert resp.json()["tracks"][0]["one_shot"] is True


def test_get_status_default_reports_one_shot_false() -> None:
    client, _, _ = _build_client()
    resp = client.get("/api/v1/looper/status")
    body = resp.json()
    assert all(t["one_shot"] is False for t in body["tracks"])
