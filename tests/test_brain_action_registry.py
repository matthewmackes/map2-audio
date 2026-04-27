"""T2461-A4 — Brain action registry tests."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.services.performance_brain.brain_action_registry import (
    BrainActionDescriptor,
    find_action,
    list_actions,
)


def test_list_actions_returns_catalogue():
    actions = list_actions()
    assert len(actions) > 10
    # Spot-check each kind is represented.
    kinds = {a.kind for a in actions}
    assert kinds == {"transport", "section", "slot"}


def test_list_actions_transport_first_section_then_slot():
    actions = list_actions()
    seen_section = False
    seen_slot = False
    for a in actions:
        if a.kind == "section":
            seen_section = True
        if a.kind == "slot":
            seen_slot = True
        if seen_section and a.kind == "transport":
            pytest.fail("transport action appeared after a section action")
        if seen_slot and a.kind in {"transport", "section"}:
            pytest.fail("transport/section action appeared after a slot action")


def test_list_actions_slot_count_default_16():
    actions = list_actions()
    slots = [a for a in actions if a.kind == "slot"]
    assert len(slots) == 16
    assert slots[0].id == "brain.slot.0.mute_toggle"
    assert slots[15].id == "brain.slot.15.mute_toggle"


def test_list_actions_slot_count_override():
    actions = list_actions(slot_count=8)
    slots = [a for a in actions if a.kind == "slot"]
    assert len(slots) == 8


def test_find_action_known_id_returns_descriptor():
    descriptor = find_action("brain.transport.toggle")
    assert isinstance(descriptor, BrainActionDescriptor)
    assert descriptor.value_type == "toggle"
    assert descriptor.kind == "transport"


def test_find_action_unknown_id_returns_none():
    assert find_action("brain.does.not.exist") is None


def test_descriptor_to_dict_shape():
    actions = list_actions()
    d = actions[0].to_dict()
    assert set(d.keys()) == {"id", "label", "kind", "value_type", "description"}


# ---------------------------------------------------------------------------
# Route surface
# ---------------------------------------------------------------------------


@pytest.fixture
def client():
    from app.routes import brain
    a = FastAPI()
    a.include_router(brain.router)
    return TestClient(a)


def test_route_returns_actions_payload(client):
    r = client.get("/api/engine/brain/actions")
    assert r.status_code == 200
    body = r.json()
    assert "actions" in body
    assert body["count"] == len(body["actions"])
    assert body["count"] > 10
    # Spot-check the wizard-relevant fields are present on every row.
    for row in body["actions"]:
        assert "id" in row
        assert "label" in row
        assert "kind" in row
        assert "value_type" in row
