"""T2512-WS — Looper WS bridge tests.

Covers the bridge that ships LooperStatus mutations onto
``LOOPER_STATUS_TOPIC`` via ``ws_manager.broadcast_json``:
  - Frame envelope shape (``{type: 'looper_status', payload: ...}``).
  - ``broadcast_looper_status`` posts to the correct topic.
  - ``init_looper_ws_bridge`` installs a sync scheduling closure as
    the service's broadcaster.
  - Broadcast failures inside ``ws_manager`` are logged + swallowed.
"""

from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from app.services import looper_ws_bridge
from app.services.looper_service import (
    LOOPER_STATUS_TOPIC,
    LooperService,
    LooperStatus,
    TrackState,
    TrackStatus,
)


def _make_status() -> LooperStatus:
    empty = [
        TrackStatus(
            track=i, state=TrackState.EMPTY,
            state_label=TrackState.EMPTY.label,
            loop_length_frames=0, playhead_frames=0, layer_count=0,
            level_db=0.0, muted=False, soloed=False,
            reverse=False, half_speed=False, locked=False,
        )
        for i in range(4)
    ]
    return LooperStatus(
        tracks=empty,
        active_track_count=0,
        sync_master=False,
        master_level_db=0.0,
    )


# ---------------------------------------------------------------------------
# Frame shape
# ---------------------------------------------------------------------------


async def test_broadcast_frame_has_type_and_payload_envelope() -> None:
    captured: list[tuple[dict, str | None]] = []

    async def fake_broadcast(data: dict, topic: str | None = None) -> None:
        captured.append((data, topic))

    status = _make_status()
    with patch.object(
        looper_ws_bridge.ws_manager,
        "broadcast_json",
        side_effect=fake_broadcast,
    ):
        await looper_ws_bridge.broadcast_looper_status(status)

    assert len(captured) == 1
    data, topic = captured[0]
    assert topic == LOOPER_STATUS_TOPIC
    assert data["type"] == "looper_status"
    assert data["payload"] == status.to_payload()


async def test_broadcast_failure_is_logged_and_swallowed() -> None:
    async def boom(_data, topic=None):
        raise RuntimeError("WS down")

    with patch.object(
        looper_ws_bridge.ws_manager,
        "broadcast_json",
        side_effect=boom,
    ):
        # Should not raise.
        await looper_ws_bridge.broadcast_looper_status(_make_status())


# ---------------------------------------------------------------------------
# Bridge wiring
# ---------------------------------------------------------------------------


async def test_init_bridge_replaces_broadcaster_with_sync_scheduler() -> None:
    """``init_looper_ws_bridge`` installs a sync closure on the service.
    Triggering a mutating verb afterward should schedule the async
    broadcast on the captured event loop without raising."""
    service = LooperService()  # no engine; uses fallback empty status
    captured: list = []

    async def fake_broadcast(data: dict, topic: str | None = None) -> None:
        captured.append((data, topic))

    loop = asyncio.get_event_loop()
    with patch.object(
        looper_ws_bridge.ws_manager,
        "broadcast_json",
        side_effect=fake_broadcast,
    ):
        looper_ws_bridge.init_looper_ws_bridge(service=service, loop=loop)
        service.record(0)
        # Yield to let the scheduled coroutine run.
        await asyncio.sleep(0)
        # The future is scheduled on the same loop we're awaiting on —
        # one more event-loop hop ensures it has run.
        await asyncio.sleep(0)

    assert len(captured) == 1
    data, topic = captured[0]
    assert topic == LOOPER_STATUS_TOPIC
    assert data["type"] == "looper_status"


async def test_init_bridge_does_not_broadcast_on_get_status() -> None:
    service = LooperService()
    captured: list = []

    async def fake_broadcast(data: dict, topic: str | None = None) -> None:
        captured.append((data, topic))

    loop = asyncio.get_event_loop()
    with patch.object(
        looper_ws_bridge.ws_manager,
        "broadcast_json",
        side_effect=fake_broadcast,
    ):
        looper_ws_bridge.init_looper_ws_bridge(service=service, loop=loop)
        # Pure reads — no broadcast.
        service.get_status()
        await asyncio.sleep(0)
        await asyncio.sleep(0)

    assert captured == []
