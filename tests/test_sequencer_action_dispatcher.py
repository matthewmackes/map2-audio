"""T2461-A4 (second half) — Sequencer action dispatcher route tests."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.routes import sequencer
    a = FastAPI()
    a.include_router(sequencer.router)
    return TestClient(a)


def test_dispatch_unknown_action_returns_error(client):
    r = client.post(
        "/api/engine/sequencer/actions/dispatch",
        json={"action_id": "brain.does.not.exist"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["applied"] is False
    assert body["error"] == "unknown_action_id"


def test_dispatch_known_action_returns_descriptor(client):
    r = client.post(
        "/api/engine/sequencer/actions/dispatch",
        json={"action_id": "brain.transport.play"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["action_id"] == "brain.transport.play"
    assert body["descriptor"]["id"] == "brain.transport.play"
    assert body["descriptor"]["kind"] == "transport"


def test_dispatch_section_jump_returns_applied_status(client):
    r = client.post(
        "/api/engine/sequencer/actions/dispatch",
        json={"action_id": "brain.section.console"},
    )
    body = r.json()
    assert "applied" in body
    assert body["descriptor"]["id"] == "brain.section.console"


def test_dispatch_slot_mute_toggle_known_descriptor(client):
    r = client.post(
        "/api/engine/sequencer/actions/dispatch",
        json={"action_id": "brain.slot.3.mute_toggle"},
    )
    body = r.json()
    # We don't assert applied=True because the underlying service may
    # not have a slot 3 in the test fixture; the registry contract is
    # what we care about here.
    assert body["descriptor"]["id"] == "brain.slot.3.mute_toggle"
    assert body["descriptor"]["kind"] == "slot"
