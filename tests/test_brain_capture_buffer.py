"""T2461-A6 — Brain capture buffer tests."""

from __future__ import annotations

import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.services.performance_brain.brain_capture_buffer import (
    BrainCaptureBuffer,
    CAPTURE_RETENTION_S,
    reset_brain_capture_buffer_for_tests,
)


@pytest.fixture
def buffer() -> BrainCaptureBuffer:
    return reset_brain_capture_buffer_for_tests()


def test_start_capture_returns_session_id(buffer):
    sid = buffer.start_capture(slot_id=3, duration_s=5.0)
    assert isinstance(sid, str)
    assert len(sid) > 0
    assert buffer.is_active() is True


def test_start_capture_invalid_duration_raises(buffer):
    with pytest.raises(ValueError):
        buffer.start_capture(slot_id=0, duration_s=0)
    with pytest.raises(ValueError):
        buffer.start_capture(slot_id=0, duration_s=120)


def test_record_frame_only_appends_for_active_slot(buffer):
    sid = buffer.start_capture(slot_id=2, duration_s=5.0)
    # Frames for the right slot land.
    buffer.record_frame(slot_id=2, peak_db=-3.0, rms_db=-6.0, clipping=False)
    # Frames for a different slot are dropped.
    buffer.record_frame(slot_id=5, peak_db=0.5, rms_db=-1.0, clipping=True)

    session = buffer.stop_capture()
    assert session is not None
    assert len(session.frames) == 1
    assert session.frames[0].slot_id == 2


def test_record_frame_drops_outside_window(buffer):
    sid = buffer.start_capture(slot_id=0, duration_s=5.0)
    started = time.time()
    # Record a frame inside the window.
    buffer.record_frame(slot_id=0, peak_db=-10.0, rms_db=-12.0, clipping=False)
    # Record a frame far in the future (outside the window).
    buffer.record_frame(slot_id=0, peak_db=0.0, rms_db=-1.0, clipping=False, ts=started + 100.0)

    session = buffer.stop_capture()
    assert session is not None
    assert len(session.frames) == 1


def test_stop_capture_with_no_active_returns_none(buffer):
    assert buffer.stop_capture() is None


def test_get_session_returns_finalised_session(buffer):
    sid = buffer.start_capture(slot_id=1, duration_s=2.0)
    buffer.record_frame(slot_id=1, peak_db=-5.0, rms_db=-8.0, clipping=False)
    buffer.stop_capture()

    payload = buffer.session_payload(sid)
    assert payload is not None
    assert payload["session_id"] == sid
    assert payload["slot_id"] == 1
    assert payload["frame_count"] == 1


def test_session_gc_drops_after_retention(buffer, monkeypatch):
    """Sessions past CAPTURE_RETENTION_S vanish."""
    import app.services.performance_brain.brain_capture_buffer as mod
    monkeypatch.setattr(mod, "CAPTURE_RETENTION_S", 0.05)

    sid = buffer.start_capture(slot_id=0, duration_s=1.0)
    buffer.stop_capture()
    assert buffer.session_payload(sid) is not None
    time.sleep(0.1)
    # Trigger GC via another start; previous session should be gone.
    buffer.start_capture(slot_id=0, duration_s=1.0)
    assert buffer.session_payload(sid) is None


def test_starting_new_capture_replaces_active(buffer):
    sid1 = buffer.start_capture(slot_id=0, duration_s=5.0)
    buffer.record_frame(slot_id=0, peak_db=-3.0, rms_db=-6.0, clipping=False)
    sid2 = buffer.start_capture(slot_id=1, duration_s=5.0)
    assert sid1 != sid2
    # The new active session has no frames yet.
    buffer.record_frame(slot_id=1, peak_db=-1.0, rms_db=-4.0, clipping=False)
    session = buffer.stop_capture()
    assert session is not None
    assert session.session_id == sid2
    assert len(session.frames) == 1


# ---------------------------------------------------------------------------
# Route surface
# ---------------------------------------------------------------------------


@pytest.fixture
def client(buffer):
    from app.routes import brain
    a = FastAPI()
    a.include_router(brain.router)
    return TestClient(a)


def test_capture_start_then_stop_round_trip(client):
    r = client.post("/api/engine/brain/capture/start",
                     json={"slot_id": 4, "duration_s": 3.0})
    assert r.status_code == 200
    body = r.json()
    sid = body["session_id"]
    assert isinstance(sid, str)

    r = client.post("/api/engine/brain/capture/stop")
    assert r.status_code == 200
    assert r.json()["finalised"] is True


def test_capture_get_returns_payload(client):
    client.post("/api/engine/brain/capture/start",
                json={"slot_id": 0, "duration_s": 2.0})
    sid = client.post("/api/engine/brain/capture/start",
                      json={"slot_id": 7, "duration_s": 2.0}).json()["session_id"]
    client.post("/api/engine/brain/capture/stop")

    r = client.get(f"/api/engine/brain/capture/{sid}")
    body = r.json()
    assert body["found"] is True
    assert body["slot_id"] == 7


def test_capture_get_unknown_session_returns_not_found(client):
    r = client.get("/api/engine/brain/capture/does-not-exist")
    assert r.json()["found"] is False
