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


# ---------------------------------------------------------------------------
# T2512-CLOCK (inbound) — bpm field on the status response
# ---------------------------------------------------------------------------


def test_status_response_includes_bpm_field() -> None:
    """The HTTP response must always include the bpm key (may be null)
    so the TypeScript client can rely on its presence."""
    client, _, _ = _build_client()
    resp = client.get("/api/v1/looper/status")
    body = resp.json()
    assert "bpm" in body


# ---------------------------------------------------------------------------
# T2512-AUTO — auto-armed + auto-threshold route surface
# ---------------------------------------------------------------------------


def test_set_auto_armed_route_toggles_flag() -> None:
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/2/auto-armed", json={"value": True}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["tracks"][2]["auto_armed"] is True
    assert all(body["tracks"][i]["auto_armed"] is False for i in (0, 1, 3))


def test_set_auto_threshold_route_stores_clamped_db() -> None:
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/0/auto-threshold", json={"db": -24.0}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["tracks"][0]["auto_threshold_db"] == -24.0


def test_set_auto_threshold_rejects_out_of_range_db() -> None:
    """The Pydantic clamp on SetAutoThresholdRequest rejects values
    outside [-90, 0]."""
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/0/auto-threshold", json={"db": -200.0}
    )
    assert resp.status_code == 422


def test_set_auto_armed_invalid_track_returns_400() -> None:
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/9/auto-armed", json={"value": True}
    )
    assert resp.status_code == 400


def test_status_default_auto_state() -> None:
    client, _, _ = _build_client()
    resp = client.get("/api/v1/looper/status")
    body = resp.json()
    for track in body["tracks"]:
        assert track["auto_armed"] is False
        assert track["auto_threshold_db"] == -36.0


# ---------------------------------------------------------------------------
# T2512-FADE — stop_mode + fade_ms route surface
# ---------------------------------------------------------------------------


def test_set_stop_mode_route_accepts_fade() -> None:
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/0/stop-mode", json={"mode": "fade"}
    )
    assert resp.status_code == 200
    assert resp.json()["tracks"][0]["stop_mode"] == "fade"


def test_set_stop_mode_route_rejects_unknown_mode() -> None:
    """The Pydantic pattern rejects unknown modes before reaching the service."""
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/0/stop-mode", json={"mode": "ramp"}
    )
    assert resp.status_code == 422


def test_set_stop_mode_invalid_track_returns_400() -> None:
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/9/stop-mode", json={"mode": "fade"}
    )
    assert resp.status_code == 400


def test_set_fade_ms_route_stores_clamped_value() -> None:
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/2/fade-ms", json={"fade_ms": 1500}
    )
    assert resp.status_code == 200
    assert resp.json()["tracks"][2]["fade_ms"] == 1500


def test_set_fade_ms_rejects_out_of_range() -> None:
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/0/fade-ms", json={"fade_ms": -100}
    )
    assert resp.status_code == 422
    resp = client.patch(
        "/api/v1/looper/track/0/fade-ms", json={"fade_ms": 10000}
    )
    assert resp.status_code == 422


def test_status_default_fade_state() -> None:
    client, _, _ = _build_client()
    resp = client.get("/api/v1/looper/status")
    body = resp.json()
    for track in body["tracks"]:
        assert track["stop_mode"] == "hard"
        assert track["fade_ms"] == 250


# ---------------------------------------------------------------------------
# T2512-SYNC — per-track sync mode route surface
# ---------------------------------------------------------------------------


def test_set_sync_mode_route_accepts_master() -> None:
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/0/sync-mode", json={"mode": "master"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["tracks"][0]["sync_mode"] == "master"
    assert body["sync_master_track"] == 0
    assert body["sync_master"] is True


def test_set_sync_mode_route_demotes_previous_master() -> None:
    client, _, _ = _build_client()
    client.patch("/api/v1/looper/track/0/sync-mode", json={"mode": "master"})
    resp = client.patch(
        "/api/v1/looper/track/2/sync-mode", json={"mode": "master"}
    )
    body = resp.json()
    assert body["tracks"][0]["sync_mode"] == "free"
    assert body["tracks"][2]["sync_mode"] == "master"
    assert body["sync_master_track"] == 2


def test_set_sync_mode_route_rejects_unknown_mode() -> None:
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/0/sync-mode", json={"mode": "follower"}
    )
    # Pydantic pattern rejects before reaching service.
    assert resp.status_code == 422


def test_set_sync_mode_invalid_track_returns_400() -> None:
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/9/sync-mode", json={"mode": "master"}
    )
    assert resp.status_code == 400


def test_status_default_sync_state() -> None:
    client, _, _ = _build_client()
    resp = client.get("/api/v1/looper/status")
    body = resp.json()
    assert body["sync_master_track"] is None
    assert body["sync_master"] is False
    for track in body["tracks"]:
        assert track["sync_mode"] == "free"


# ---------------------------------------------------------------------------
# T2512-SLICE — slice route surface
# ---------------------------------------------------------------------------


def test_add_slice_route_records_metadata() -> None:
    client, _, _ = _build_client()
    resp = client.post(
        "/api/v1/looper/track/0/slices",
        json={"start_frame": 0, "end_frame": 48000, "label": "intro"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["tracks"][0]["slices"] == [
        {"start_frame": 0, "end_frame": 48000, "label": "intro"},
    ]


def test_add_slice_overlap_returns_409() -> None:
    client, _, _ = _build_client()
    client.post(
        "/api/v1/looper/track/0/slices",
        json={"start_frame": 0, "end_frame": 1000, "label": "a"},
    )
    resp = client.post(
        "/api/v1/looper/track/0/slices",
        json={"start_frame": 500, "end_frame": 1500, "label": "b"},
    )
    assert resp.status_code == 409
    body = resp.json()
    assert "overlap" in body["detail"].lower()


def test_add_slice_inverted_range_returns_400() -> None:
    """Pydantic accepts both ge=0/ge=1 so the inverted check lands at
    the service layer with invalid_slice → 400."""
    client, _, _ = _build_client()
    resp = client.post(
        "/api/v1/looper/track/0/slices",
        json={"start_frame": 1000, "end_frame": 500, "label": ""},
    )
    assert resp.status_code == 400


def test_add_slice_negative_start_returns_422() -> None:
    """Pydantic ge=0 rejects negative starts before reaching service."""
    client, _, _ = _build_client()
    resp = client.post(
        "/api/v1/looper/track/0/slices",
        json={"start_frame": -10, "end_frame": 1000, "label": ""},
    )
    assert resp.status_code == 422


def test_add_slice_invalid_track_returns_400() -> None:
    client, _, _ = _build_client()
    resp = client.post(
        "/api/v1/looper/track/9/slices",
        json={"start_frame": 0, "end_frame": 1000, "label": ""},
    )
    assert resp.status_code == 400


def test_clear_slices_route_drops_everything() -> None:
    client, _, _ = _build_client()
    client.post(
        "/api/v1/looper/track/0/slices",
        json={"start_frame": 0, "end_frame": 1000, "label": "a"},
    )
    resp = client.delete("/api/v1/looper/track/0/slices")
    assert resp.status_code == 200
    body = resp.json()
    assert body["tracks"][0]["slices"] == []


def test_clear_slices_invalid_track_returns_400() -> None:
    client, _, _ = _build_client()
    resp = client.delete("/api/v1/looper/track/9/slices")
    assert resp.status_code == 400


def test_status_default_slices_empty() -> None:
    client, _, _ = _build_client()
    body = client.get("/api/v1/looper/status").json()
    for track in body["tracks"]:
        assert track["slices"] == []


# ---------------------------------------------------------------------------
# T2512-QUANT-WIRE — quantize-division route surface
# ---------------------------------------------------------------------------


def test_set_quantize_division_route_accepts_quarter() -> None:
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/0/quantize-division",
        json={"division": "quarter"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["tracks"][0]["quantize_division"] == "quarter"


def test_set_quantize_division_route_accepts_off() -> None:
    client, _, _ = _build_client()
    client.patch(
        "/api/v1/looper/track/0/quantize-division",
        json={"division": "eighth"},
    )
    resp = client.patch(
        "/api/v1/looper/track/0/quantize-division",
        json={"division": "off"},
    )
    assert resp.status_code == 200
    assert resp.json()["tracks"][0]["quantize_division"] == "off"


def test_set_quantize_division_rejects_unknown() -> None:
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/0/quantize-division",
        json={"division": "1/3"},
    )
    assert resp.status_code == 400


def test_set_quantize_division_invalid_track_returns_400() -> None:
    client, _, _ = _build_client()
    resp = client.patch(
        "/api/v1/looper/track/9/quantize-division",
        json={"division": "quarter"},
    )
    assert resp.status_code == 400


def test_status_default_quantize_off() -> None:
    client, _, _ = _build_client()
    body = client.get("/api/v1/looper/status").json()
    for track in body["tracks"]:
        assert track["quantize_division"] == "off"


# ---------------------------------------------------------------------------
# T2512-SNAP — /state export + apply
# ---------------------------------------------------------------------------


def test_get_state_returns_default_payload() -> None:
    client, _, _ = _build_client()
    resp = client.get("/api/v1/looper/state")
    assert resp.status_code == 200
    body = resp.json()
    assert body["schema_version"] == 1
    assert len(body["tracks"]) == 4
    for track in body["tracks"]:
        assert track["locked"] is False
        assert track["one_shot"] is False
        assert track["auto_armed"] is False
        assert track["auto_threshold_db"] == -36.0


def test_post_state_applies_payload_and_returns_status() -> None:
    client, _, _ = _build_client()
    payload = {
        "schema_version": 1,
        "tracks": [
            {"locked": True, "one_shot": False, "auto_armed": False,
             "auto_threshold_db": -36.0},
            {"locked": False, "one_shot": True, "auto_armed": False,
             "auto_threshold_db": -36.0},
            {"locked": False, "one_shot": False, "auto_armed": True,
             "auto_threshold_db": -24.0},
            {"locked": False, "one_shot": False, "auto_armed": False,
             "auto_threshold_db": -36.0},
        ],
        "master_level_db": 0.0,
    }
    resp = client.post("/api/v1/looper/state", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["tracks"][0]["locked"] is True
    assert body["tracks"][1]["one_shot"] is True
    assert body["tracks"][2]["auto_armed"] is True
    assert body["tracks"][2]["auto_threshold_db"] == -24.0


def test_state_route_round_trip() -> None:
    """GET /state → mutate via setters → GET /state again must reflect
    the mutations. POST /state must reverse them."""
    client, _, _ = _build_client()
    # Mutate via the existing route surface.
    client.patch("/api/v1/looper/track/0/locked", json={"value": True})
    client.patch("/api/v1/looper/track/1/one-shot", json={"value": True})

    resp = client.get("/api/v1/looper/state")
    saved = resp.json()
    assert saved["tracks"][0]["locked"] is True
    assert saved["tracks"][1]["one_shot"] is True

    # Reset back to default by reapplying a fresh payload.
    default_payload = {
        "schema_version": 1,
        "tracks": [
            {"locked": False, "one_shot": False, "auto_armed": False,
             "auto_threshold_db": -36.0}
            for _ in range(4)
        ],
        "master_level_db": 0.0,
    }
    client.post("/api/v1/looper/state", json=default_payload)

    final = client.get("/api/v1/looper/state").json()
    for track in final["tracks"]:
        assert track["locked"] is False
        assert track["one_shot"] is False
