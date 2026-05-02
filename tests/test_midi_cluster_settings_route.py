"""
T2486-4 — tests for the GET / PATCH /api/midi/cluster/settings routes.

Covers:
  - default fail-closed posture (both flags False)
  - partial PATCH writes only the explicitly-set fields
  - PlatformEvent emission on operator-initiated flips
  - PlatformEvent NOT emitted on no-op writes
  - The fail-closed regression test in test_cluster_midi_foundation.py
    continues to pass alongside this suite.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import CONFIG_SCHEMA
from app.main import app


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    # Reset the two flags to their schema defaults at the start of each test
    # so individual tests are order-independent. config_get/config_set are
    # process-singleton-backed; using monkeypatch keeps the reset isolated.
    from app import config as app_config

    initial: dict[str, bool] = {
        "midi.cluster.enabled": False,
        "midi.cluster.auto_connect": False,
    }
    real_get = app_config.config_get
    real_set = app_config.config_set
    test_store: dict[str, object] = dict(initial)

    def fake_get(key: str, default: object = None) -> object:
        if key in test_store:
            return test_store[key]
        return real_get(key, default)

    def fake_set(key: str, value: object) -> None:
        if key in initial:
            test_store[key] = value
            return
        real_set(key, value)

    monkeypatch.setattr("app.routes.midi_cluster.config_get", fake_get)
    monkeypatch.setattr("app.routes.midi_cluster.config_set", fake_set)
    return TestClient(app)


def test_settings_default_is_fail_closed(client: TestClient) -> None:
    """T2486-1 baseline: both flags read False before any operator action."""
    response = client.get("/api/midi/cluster/settings")
    assert response.status_code == 200
    body = response.json()
    assert body == {"enabled": False, "auto_connect": False}


def test_settings_patch_enables_both_flags(client: TestClient) -> None:
    """The coupled-flip Modal flow: PATCH enabled=True + auto_connect=True."""
    response = client.patch(
        "/api/midi/cluster/settings",
        json={"enabled": True, "auto_connect": True},
    )
    assert response.status_code == 200
    assert response.json() == {"enabled": True, "auto_connect": True}

    # Confirm via GET that the writes persisted.
    response = client.get("/api/midi/cluster/settings")
    assert response.json() == {"enabled": True, "auto_connect": True}


def test_settings_patch_only_writes_explicitly_set_fields(client: TestClient) -> None:
    """PATCH with only `enabled` does not touch auto_connect."""
    # Set a non-default starting state.
    client.patch(
        "/api/midi/cluster/settings",
        json={"enabled": True, "auto_connect": True},
    )
    # Now flip enabled off without touching auto_connect.
    response = client.patch(
        "/api/midi/cluster/settings",
        json={"enabled": False},
    )
    assert response.status_code == 200
    assert response.json() == {"enabled": False, "auto_connect": True}


def test_settings_patch_handles_empty_payload(client: TestClient) -> None:
    """PATCH with no fields is a no-op that returns current values."""
    response = client.patch("/api/midi/cluster/settings", json={})
    assert response.status_code == 200
    assert response.json() == {"enabled": False, "auto_connect": False}


def test_fail_closed_defaults_assertion_still_holds() -> None:
    """
    Mirrors the canonical assertion in
    test_cluster_midi_foundation.py::test_cluster_midi_defaults_fail_closed.
    Co-located here so this T2486-4 suite explicitly defends the same
    posture; a future change that flips the schema default would break
    BOTH tests, surfacing the security-posture reversal loudly.
    """
    assert CONFIG_SCHEMA["midi.cluster.enabled"].default is False
    assert CONFIG_SCHEMA["midi.cluster.auto_connect"].default is False


def test_settings_patch_emits_platform_event_on_flip(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """T2486-3: operator-initiated flip emits midi.cluster.*.changed."""
    captured: list[dict[str, object]] = []

    async def fake_emit(event):  # type: ignore[no-untyped-def]
        # Accept either PlatformEvent or dict; match the bus signature.
        captured.append({
            "kind": getattr(event, "kind", None) or event.get("kind"),
            "context": dict(getattr(event, "context", None) or event.get("context") or {}),
        })
        return getattr(event, "event_id", "test-event-id")

    class FakeBus:
        async def emit(self, event):  # type: ignore[no-untyped-def]
            return await fake_emit(event)

    fake_bus = FakeBus()
    monkeypatch.setattr(
        "app.services.platform_event.bus.get_platform_event_bus",
        lambda: fake_bus,
    )

    response = client.patch(
        "/api/midi/cluster/settings",
        json={"enabled": True, "auto_connect": True},
    )
    assert response.status_code == 200

    kinds = [evt["kind"] for evt in captured]
    assert "midi.cluster.enabled.changed" in kinds
    assert "midi.cluster.auto_connect.changed" in kinds


def test_settings_patch_does_not_emit_on_noop(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """T2486-3: PATCH with no field changes emits no PlatformEvent."""
    captured: list[dict[str, object]] = []

    async def fake_emit(event):  # type: ignore[no-untyped-def]
        captured.append({"kind": getattr(event, "kind", None)})
        return "test-event-id"

    class FakeBus:
        async def emit(self, event):  # type: ignore[no-untyped-def]
            return await fake_emit(event)

    monkeypatch.setattr(
        "app.services.platform_event.bus.get_platform_event_bus",
        lambda: FakeBus(),
    )

    # Empty payload — no flips, no emits.
    client.patch("/api/midi/cluster/settings", json={})
    assert captured == []

    # Same-value flip (already False, set to False) — also no emit.
    client.patch("/api/midi/cluster/settings", json={"enabled": False})
    assert captured == []
