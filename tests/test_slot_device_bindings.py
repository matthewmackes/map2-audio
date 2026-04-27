"""T2461-A2 — slot ↔ profile_key binding map tests."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import devices as devices_routes
from app.services.controllers.slot_device_bindings import (
    SlotDeviceBindings,
    reset_slot_device_bindings_for_tests,
)


@pytest.fixture
def bindings() -> SlotDeviceBindings:
    return reset_slot_device_bindings_for_tests()


# --- service ----------------------------------------------------------------


def test_bind_creates_bidirectional_lookup(bindings):
    bindings.bind(0, "edirol-ua/ua-1000.audio")
    assert bindings.profile_for_slot(0) == "edirol-ua/ua-1000.audio"
    assert bindings.slot_for_profile("edirol-ua/ua-1000.audio") == 0


def test_bind_replaces_prior_slot_binding(bindings):
    bindings.bind(0, "edirol-ua/ua-1000.audio")
    bindings.bind(0, "hotone/jogg.audio")
    # Slot 0 now points at jogg; the prior key is fully detached.
    assert bindings.profile_for_slot(0) == "hotone/jogg.audio"
    assert bindings.slot_for_profile("edirol-ua/ua-1000.audio") is None


def test_bind_replaces_prior_profile_binding(bindings):
    bindings.bind(0, "edirol-ua/ua-1000.audio")
    bindings.bind(3, "edirol-ua/ua-1000.audio")
    # The key now points at slot 3; slot 0 detaches.
    assert bindings.slot_for_profile("edirol-ua/ua-1000.audio") == 3
    assert bindings.profile_for_slot(0) is None


def test_unbind_slot_returns_true_for_known_slot(bindings):
    bindings.bind(2, "x/y.audio")
    assert bindings.unbind_slot(2) is True
    assert bindings.profile_for_slot(2) is None
    assert bindings.unbind_slot(2) is False


def test_unbind_profile_clears_partner_slot(bindings):
    bindings.bind(5, "x/y.audio")
    assert bindings.unbind_profile("x/y.audio") is True
    assert bindings.profile_for_slot(5) is None


def test_bind_rejects_negative_slot_id(bindings):
    with pytest.raises(ValueError):
        bindings.bind(-1, "x/y.audio")


def test_bind_rejects_empty_profile_key(bindings):
    with pytest.raises(ValueError):
        bindings.bind(0, "")


def test_all_bindings_returns_sorted_by_slot_id(bindings):
    bindings.bind(7, "g/h.audio")
    bindings.bind(1, "a/b.audio")
    bindings.bind(4, "c/d.audio")
    rows = bindings.all_bindings()
    assert [b.slot_id for b in rows] == [1, 4, 7]


def test_clear_drops_everything(bindings):
    bindings.bind(0, "x/y.audio")
    bindings.bind(1, "p/q.audio")
    bindings.clear()
    assert bindings.all_bindings() == ()


# --- routes -----------------------------------------------------------------


@pytest.fixture
def client(bindings):
    a = FastAPI()
    a.include_router(devices_routes.router)
    return TestClient(a)


def test_route_post_then_get_round_trip(client):
    r = client.post("/api/devices/slot-bindings",
                     json={"slot_id": 4, "profile_key": "edirol-ua/ua-1000.audio"})
    assert r.status_code == 200
    assert r.json()["slot_id"] == 4

    r = client.get("/api/devices/slot-bindings")
    body = r.json()
    assert body["count"] == 1
    assert body["bindings"][0]["slot_id"] == 4
    assert body["bindings"][0]["profile_key"] == "edirol-ua/ua-1000.audio"


def test_route_post_invalid_400(client):
    r = client.post("/api/devices/slot-bindings",
                     json={"slot_id": -1, "profile_key": "x/y.audio"})
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "invalid_binding"


def test_route_delete_by_slot(client):
    client.post("/api/devices/slot-bindings",
                json={"slot_id": 2, "profile_key": "edirol-ua/ua-1000.audio"})
    r = client.delete("/api/devices/slot-bindings/by-slot/2")
    assert r.status_code == 200
    assert r.json()["removed"] is True
    # Second delete is a no-op.
    r = client.delete("/api/devices/slot-bindings/by-slot/2")
    assert r.json()["removed"] is False


def test_route_delete_by_profile(client):
    client.post("/api/devices/slot-bindings",
                json={"slot_id": 8, "profile_key": "hotone/jogg.audio"})
    r = client.delete(
        "/api/devices/slot-bindings/by-profile",
        params={"profile_key": "hotone/jogg.audio"},
    )
    assert r.json()["removed"] is True
