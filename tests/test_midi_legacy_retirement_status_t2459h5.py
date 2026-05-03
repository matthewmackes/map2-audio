"""T2459-H5 Slice 15 — `/api/v2/midi/legacy_retirement_status` schedule surface.

Operators need an in-band signal for *when* the legacy MIDI v1
mounts will flip from `deprecated=True` to 410-Gone. The endpoint
under v2 surfaces:
  - retired flag value (matches MAP2_MIDI_LEGACY_RETIRED)
  - sunset date (HTTP-format header + ISO-8601)
  - successor prefix (so the operator UI knows where to link)
  - days remaining until sunset (computed against the system clock)
  - flag env-var name (so operators know what to flip)
"""

from __future__ import annotations

import datetime as dt

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes._midi_v1_retirement import (
    SUNSET_HEADER,
    _parse_sunset_header,
    retirement_status_router,
)


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(retirement_status_router)
    return TestClient(app)


def test_endpoint_returns_full_envelope(client, monkeypatch):
    monkeypatch.delenv("MAP2_MIDI_LEGACY_RETIRED", raising=False)
    res = client.get("/api/v2/midi/legacy_retirement_status")
    assert res.status_code == 200
    body = res.json()
    assert body["retired"] is False
    assert body["sunset"] == SUNSET_HEADER
    assert body["sunset_iso"] is not None
    assert body["successor_prefix"] == "/api/v2/midi"
    assert body["flag_env_var"] == "MAP2_MIDI_LEGACY_RETIRED"
    assert isinstance(body["days_remaining"], int)
    assert body["days_remaining"] >= 0


def test_retired_flag_is_reflected(client, monkeypatch):
    monkeypatch.setenv("MAP2_MIDI_LEGACY_RETIRED", "1")
    res = client.get("/api/v2/midi/legacy_retirement_status")
    assert res.status_code == 200
    body = res.json()
    assert body["retired"] is True
    # Once retired, the days_remaining is None — the surface no longer
    # tracks a countdown.
    assert body["days_remaining"] is None


def test_falsy_flag_values_treated_as_not_retired(client, monkeypatch):
    monkeypatch.setenv("MAP2_MIDI_LEGACY_RETIRED", "no")
    res = client.get("/api/v2/midi/legacy_retirement_status")
    assert res.json()["retired"] is False

    monkeypatch.setenv("MAP2_MIDI_LEGACY_RETIRED", "")
    res = client.get("/api/v2/midi/legacy_retirement_status")
    assert res.json()["retired"] is False


def test_sunset_iso_parses_to_2026_07_01(client, monkeypatch):
    monkeypatch.delenv("MAP2_MIDI_LEGACY_RETIRED", raising=False)
    body = client.get("/api/v2/midi/legacy_retirement_status").json()
    sunset = dt.datetime.fromisoformat(body["sunset_iso"])
    assert sunset.year == 2026
    assert sunset.month == 7
    assert sunset.day == 1


def test_sunset_header_parser_round_trips() -> None:
    parsed = _parse_sunset_header(SUNSET_HEADER)
    assert parsed is not None
    assert parsed.tzinfo is not None
    assert parsed.year == 2026
    assert parsed.month == 7
    assert parsed.day == 1


def test_sunset_header_parser_rejects_garbage() -> None:
    assert _parse_sunset_header("not-a-date") is None
