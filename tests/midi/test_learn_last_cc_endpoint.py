"""T2483 loop 18 / iter 173 — backend tests for the new
GET /api/midi/bindings/learn/last-cc route (T2483-5).

Pattern: exercise the route handler directly + manipulate the
midi_learn_manager singleton (since the manager is a module-level
singleton; no DB needed).
"""

from __future__ import annotations

import asyncio

import pytest

from app.services.midi_learn import midi_learn_manager
from app.services.midi.routes import LastCcResponse, get_last_observed_cc


@pytest.fixture(autouse=True)
def _reset_last_cc():
    """Clear the manager's last-cc state before + after each test."""
    midi_learn_manager._last_cc = None
    yield
    midi_learn_manager._last_cc = None


def test_route_response_model():
    """Verify the route exposes the right Pydantic shape."""
    from app.services.midi.routes import router
    from typing import Optional

    last_cc_route = next(
        r
        for r in router.routes
        if getattr(r, "path", "") == "/api/midi/bindings/learn/last-cc"
    )
    # response_model is Optional[LastCcResponse] which collapses to a Union.
    assert last_cc_route.response_model is Optional[LastCcResponse]


def test_returns_none_when_no_cc_observed():
    """Fresh manager: get_last_cc returns None; route returns None."""
    response = asyncio.run(get_last_observed_cc())
    assert response is None


def test_returns_most_recent_cc_after_process_midi_cc():
    """After process_midi_cc, the route returns the captured shape."""
    midi_learn_manager.process_midi_cc(cc_number=74, cc_value=100, channel=1)
    response = asyncio.run(get_last_observed_cc())
    assert response is not None
    assert response.cc == 74
    assert response.channel == 1
    assert response.value == 100
    assert response.observed_at > 0


def test_overwrites_with_each_new_cc():
    """The 'last' CC is always the most recent."""
    midi_learn_manager.process_midi_cc(cc_number=7, cc_value=64, channel=0)
    midi_learn_manager.process_midi_cc(cc_number=11, cc_value=100, channel=2)
    response = asyncio.run(get_last_observed_cc())
    assert response is not None
    assert response.cc == 11
    assert response.channel == 2
    assert response.value == 100


def test_omni_channel_serializes_as_null():
    """channel=None (omni) round-trips as None in the response."""
    midi_learn_manager.process_midi_cc(cc_number=1, cc_value=64, channel=None)
    response = asyncio.run(get_last_observed_cc())
    assert response is not None
    assert response.channel is None
