"""T2459-H5 Slice 16 — UMP capabilities envelope.

Verifies the honest-state surface that the operator UI consumes to
render the "UMP capable" badge. When the controller-host daemon
isn't reachable (typical dev environment), the engine-side plumbing
description still shows up in `data.engine_side` so the UI has
something to render.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import midi_ump_capabilities


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(midi_ump_capabilities.router)
    return TestClient(app)


def test_engine_side_block_is_always_present(client, monkeypatch):
    monkeypatch.setattr(
        midi_ump_capabilities, "_resolve_host_backend_status", lambda: None
    )
    res = client.get("/api/v2/midi/ump/capabilities")
    assert res.status_code == 200
    body = res.json()
    assert body["data"]["engine_side"]["classifier"]["implementation"] == "classifyUmpMessageType"
    assert body["data"]["engine_side"]["slot_discriminator"]["ump_flag_mask"] == "0x8000"
    assert body["data"]["engine_side"]["ipc"]["format_values"] == ["", "midi1", "ump"]
    assert body["data"]["engine_side"]["ipc"]["ump_packet_lengths_bytes"] == [4, 8, 12, 16]
    # Wire compatibility flag explicit.
    assert body["data"]["engine_side"]["wire_compatibility_with_midi1"] is True
    # Validated I/O is honestly false until the libremidi bump lands.
    assert body["data"]["validated_io"] is False
    assert "libremidi" in body["data"]["validated_io_blocker"]


def test_unavailable_when_daemon_not_reachable(client, monkeypatch):
    monkeypatch.setattr(
        midi_ump_capabilities, "_resolve_host_backend_status", lambda: None
    )
    res = client.get("/api/v2/midi/ump/capabilities")
    body = res.json()
    assert body["available"] is False
    assert "daemon" in body["error"].lower()
    assert body["data"]["host_side"] == {"daemon_available": False}


def test_available_when_daemon_returns_backend(client, monkeypatch):
    monkeypatch.setattr(
        midi_ump_capabilities,
        "_resolve_host_backend_status",
        lambda: {
            "daemon_available": True,
            "backend": "alsa_seq",
            "degraded": True,
        },
    )
    res = client.get("/api/v2/midi/ump/capabilities")
    body = res.json()
    assert body["available"] is True
    assert body["error"] is None
    assert body["data"]["host_side"]["backend"] == "alsa_seq"
    assert body["data"]["host_side"]["degraded"] is True


def test_resolver_handles_client_construction_failure(monkeypatch):
    """The resolver must never raise — a broken host client should
    quietly return None so the route still renders the engine-side
    plumbing description."""
    import app.services.midi_host_client as midi_host_client

    def _raise(*_args, **_kwargs):
        raise RuntimeError("simulated client init failure")

    monkeypatch.setattr(midi_host_client, "MidiHostClient", _raise)
    assert midi_ump_capabilities._resolve_host_backend_status() is None


def test_resolver_handles_is_daemon_available_failure(monkeypatch):
    """If is_daemon_available() raises, the resolver still returns None."""
    fake_client = MagicMock()
    fake_client.is_daemon_available.side_effect = RuntimeError("boom")

    import app.services.midi_host_client as midi_host_client

    monkeypatch.setattr(midi_host_client, "MidiHostClient", lambda: fake_client)
    assert midi_ump_capabilities._resolve_host_backend_status() is None


def test_classifier_buckets_match_h5_slice_13_lock(client, monkeypatch):
    monkeypatch.setattr(
        midi_ump_capabilities, "_resolve_host_backend_status", lambda: None
    )
    body = client.get("/api/v2/midi/ump/capabilities").json()
    classifier = body["data"]["engine_side"]["classifier"]
    # Slice 13 locked the RT bucket as MT 0x1, 0x2, 0x4 and the
    # control bucket as MT 0x0, 0x3, 0x5. Pin them so a future
    # accidental bucket swap surfaces here.
    assert set(classifier["rt_message_types"]) == {0x1, 0x2, 0x4}
    assert set(classifier["control_message_types"]) == {0x0, 0x3, 0x5}
