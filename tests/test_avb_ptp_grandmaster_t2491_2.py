"""
T2491-2 — gPTP grandmaster change tracking (BMCA observability).

Covers `PTPMonitor._track_grandmaster_changes` invariants and the
`/api/avb/ptp/grandmaster_changes` REST surface.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.avb import counters as counters_routes
from app.services.avb.ptp_monitor import PTPMonitor, PTPStatus


@pytest.fixture
def fresh_monitor():
    monitor = PTPMonitor()
    # Reset its tracker fields to a known baseline (a singleton may
    # have been constructed earlier in the test session by another
    # suite).
    monitor.grandmaster_change_count = 0
    monitor._gm_change_history = []
    monitor._last_seen_gm_id = None
    return monitor


def test_first_observation_seeds_without_counting(fresh_monitor):
    fresh_monitor._track_grandmaster_changes(
        PTPStatus(available=True, grandmaster_id="0011aa.fffe.bbccdd"),
    )
    assert fresh_monitor.grandmaster_change_count == 0
    assert fresh_monitor._last_seen_gm_id == "0011aa.fffe.bbccdd"
    assert fresh_monitor.grandmaster_change_log() == []


def test_same_gm_id_does_not_bump(fresh_monitor):
    fresh_monitor._track_grandmaster_changes(
        PTPStatus(available=True, grandmaster_id="aa.bb.cc"),
    )
    fresh_monitor._track_grandmaster_changes(
        PTPStatus(available=True, grandmaster_id="aa.bb.cc"),
    )
    assert fresh_monitor.grandmaster_change_count == 0


def test_gm_swap_bumps_counter_and_history(fresh_monitor):
    fresh_monitor._track_grandmaster_changes(
        PTPStatus(available=True, grandmaster_id="aa.bb.cc"),
    )
    fresh_monitor._track_grandmaster_changes(
        PTPStatus(available=True, grandmaster_id="dd.ee.ff"),
    )
    assert fresh_monitor.grandmaster_change_count == 1
    history = fresh_monitor.grandmaster_change_log()
    assert len(history) == 1
    assert history[0]["old_grandmaster_id"] == "aa.bb.cc"
    assert history[0]["new_grandmaster_id"] == "dd.ee.ff"
    assert "timestamp" in history[0]


def test_history_is_bounded_to_32_entries(fresh_monitor):
    for i in range(50):
        fresh_monitor._track_grandmaster_changes(
            PTPStatus(available=True, grandmaster_id=f"id-{i:03x}"),
        )
    # First call is the seeding one (no bump).
    assert fresh_monitor.grandmaster_change_count == 49
    history = fresh_monitor.grandmaster_change_log()
    assert len(history) == 32
    # Most recent entry should be the latest transition.
    assert history[-1]["new_grandmaster_id"] == "id-031"


def test_missing_gm_id_does_not_perturb_state(fresh_monitor):
    fresh_monitor._last_seen_gm_id = "established"
    fresh_monitor._track_grandmaster_changes(
        PTPStatus(available=True, grandmaster_id=None),
    )
    assert fresh_monitor._last_seen_gm_id == "established"
    assert fresh_monitor.grandmaster_change_count == 0


def test_rest_grandmaster_changes_route(monkeypatch):
    fake_monitor = MagicMock()
    fake_monitor.grandmaster_change_count = 3
    fake_monitor._last_seen_gm_id = "current-gm-clock-id"
    fake_monitor.grandmaster_change_log.return_value = [
        {"timestamp": "2026-05-02T10:00:00Z", "old_grandmaster_id": "a", "new_grandmaster_id": "b"},
        {"timestamp": "2026-05-02T10:05:00Z", "old_grandmaster_id": "b", "new_grandmaster_id": "c"},
        {"timestamp": "2026-05-02T10:10:00Z", "old_grandmaster_id": "c", "new_grandmaster_id": "current-gm-clock-id"},
    ]

    import app.services.avb.ptp_monitor as ptp_mod

    monkeypatch.setattr(ptp_mod, "get_ptp_monitor", lambda: fake_monitor)

    app = FastAPI()
    app.include_router(counters_routes.router, prefix="/api/avb")
    client = TestClient(app)
    res = client.get("/api/avb/ptp/grandmaster_changes")
    assert res.status_code == 200
    payload = res.json()
    assert payload["available"] is True
    assert payload["change_count"] == 3
    assert payload["current_grandmaster_id"] == "current-gm-clock-id"
    assert len(payload["history"]) == 3
    assert payload["history"][-1]["new_grandmaster_id"] == "current-gm-clock-id"
