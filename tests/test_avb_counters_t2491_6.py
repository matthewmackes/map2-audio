"""
T2491-6 — IEEE 1722.1-2021 §7.4.46 statistics counters surface.

Covers /api/avb/streams/{id}/counters projection (input + output)
and /api/avb/interfaces/{name}/counters projection. The avb_service
+ ptp_monitor singletons are stubbed so the tests don't need a
live AVB engine or NIC.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.avb import counters as counters_routes


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(counters_routes.router, prefix="/api/avb")
    return TestClient(app)


def _stub_avb_service(monkeypatch, *, stream: dict | None, available: bool = True):
    fake_service = MagicMock()
    fake_service.is_available.return_value = available
    fake_service.get_stream.return_value = stream

    def _factory():
        return fake_service

    # Inject under the import path used by counters.get_stream_counters.
    import app.services.avb.avb_service as avb_module
    monkeypatch.setattr(avb_module, "get_avb_service", _factory)
    return fake_service


def test_listener_counters_project_late_frame_drops_into_late_timestamp(client, monkeypatch):
    """T2491-7 → T2491-6 hand-off: lateFrameDrops surfaces as the
    IEEE 1722.1 `late_timestamp` counter on STREAM_INPUT_COUNTERS."""
    stream = {
        "stream_id": "listener-1",
        "direction": "listener",
        "state": "active",
        "stats": {
            "frames_received": 100,
            "frames_sent": 0,
            "sequence_errors": 3,
            "sequence_gap_events": 5,
            "timestamp_errors": 7,
            "timestamp_skew_events": 11,
            "decode_errors": 2,
            "late_frame_drops": 17,
        },
    }
    _stub_avb_service(monkeypatch, stream=stream)

    res = client.get("/api/avb/streams/listener-1/counters")
    assert res.status_code == 200
    payload = res.json()
    assert payload["direction"] == "listener"
    assert payload["kind"] == "STREAM_INPUT_COUNTERS"
    c = payload["counters"]
    assert c["frames_rx"] == 100
    assert c["frame_rx_count"] == 100
    assert c["seq_num_mismatch"] == 3
    assert c["stream_interrupted"] == 5
    assert c["timestamp_uncertain"] == 11
    assert c["timestamp_not_valid"] == 7
    assert c["timestamp_valid"] == 93  # 100 - 7
    assert c["unsupported_format"] == 2
    assert c["late_timestamp"] == 17  # ← T2491-7 → T2491-6
    assert c["media_locked"] == 1


def test_talker_counters_use_output_shape(client, monkeypatch):
    stream = {
        "stream_id": "talker-7",
        "direction": "talker",
        "state": "active",
        "stats": {
            "frames_sent": 4242,
            "timestamp_skew_events": 9,
        },
    }
    _stub_avb_service(monkeypatch, stream=stream)

    res = client.get("/api/avb/streams/talker-7/counters")
    assert res.status_code == 200
    payload = res.json()
    assert payload["kind"] == "STREAM_OUTPUT_COUNTERS"
    c = payload["counters"]
    assert c["frames_tx"] == 4242
    assert c["timestamp_uncertain"] == 9
    assert c["stream_start"] == 1
    assert "late_timestamp" not in c  # output counters don't carry it


def test_inactive_listener_reports_media_unlocked(client, monkeypatch):
    stream = {
        "stream_id": "listener-inactive",
        "direction": "listener",
        "state": "stopped",
        "stats": {"frames_received": 0},
    }
    _stub_avb_service(monkeypatch, stream=stream)
    res = client.get("/api/avb/streams/listener-inactive/counters")
    assert res.status_code == 200
    c = res.json()["counters"]
    assert c["media_locked"] == 0


def test_unknown_stream_returns_404(client, monkeypatch):
    _stub_avb_service(monkeypatch, stream=None)
    res = client.get("/api/avb/streams/does-not-exist/counters")
    assert res.status_code == 404


def test_avb_unavailable_returns_503(client, monkeypatch):
    _stub_avb_service(monkeypatch, stream=None, available=False)
    res = client.get("/api/avb/streams/whatever/counters")
    assert res.status_code == 503


def test_interface_counters_invalid_name_rejected(client):
    # Path-traversal-flavored name should 400, not 500.
    res = client.get("/api/avb/interfaces/..%2F..%2Fetc%2Fpasswd/counters")
    # FastAPI url-decodes, but the slug guard rejects non-alphanumeric.
    assert res.status_code in (400, 404)


def test_interface_counters_unknown_interface_returns_404(client):
    res = client.get("/api/avb/interfaces/zzzdoesnotexist0/counters")
    assert res.status_code == 404


def test_interface_counters_real_loopback_succeeds(client):
    """
    On Linux, /sys/class/net/lo/ exists on every host; this exercises
    the real /sys read path (the loopback isn't AVB-relevant but it's
    the cheapest live counter source). Surfaces frames_tx/frames_rx
    keys regardless of value.
    """
    if not Path("/sys/class/net/lo").is_dir():
        pytest.skip("/sys/class/net/lo not present")
    res = client.get("/api/avb/interfaces/lo/counters")
    assert res.status_code == 200
    payload = res.json()
    assert payload["kind"] == "AVB_INTERFACE_COUNTERS"
    c = payload["counters"]
    for key in ("link_up", "link_down", "frames_tx", "frames_rx", "rx_crc_error", "gptp_gm_changed"):
        assert key in c
        assert isinstance(c[key], int)
