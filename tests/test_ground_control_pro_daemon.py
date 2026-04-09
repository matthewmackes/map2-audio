from __future__ import annotations

import pytest

from app.services.ground_control_pro.daemon import GroundControlProDaemon


class _Emitter:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, object]]] = []

    async def __call__(self, topic: str, payload: dict[str, object]) -> None:
        self.events.append((topic, dict(payload)))


async def _null_snapshot() -> None:
    return None


@pytest.mark.asyncio
async def test_ground_control_pro_daemon_repushes_live_snapshot_on_reconnect() -> None:
    emitter = _Emitter()
    repush_calls: list[str] = []
    ports = [
        {
            "ground_control_inputs": [],
            "ground_control_outputs": [],
        },
        {
            "ground_control_inputs": [{"index": 0, "name": "Ground Control Pro In"}],
            "ground_control_outputs": [{"index": 1, "name": "Ground Control Pro Out"}],
        },
    ]

    async def _get_ports() -> dict[str, object]:
        return ports.pop(0)

    async def _repush() -> dict[str, object]:
        repush_calls.append("repush")
        return {"status": "completed", "status_label": "Live snapshot preset 7 re-pushed."}

    daemon = GroundControlProDaemon(
        get_ports=_get_ports,
        get_live_snapshot=_null_snapshot,
        repush_live_snapshot=_repush,
        emit=emitter,
        poll_interval_s=1.0,
    )

    await daemon.tick()
    assert daemon.snapshot()["state"] == "reconnecting"
    assert repush_calls == []

    await daemon.tick()
    snapshot = daemon.snapshot()
    assert snapshot["state"] == "connected"
    assert snapshot["available"] is True
    assert snapshot["reconnect_count"] == 1
    assert snapshot["last_repush_at"] is not None
    assert snapshot["notification"]["title"] == "Ground Control Pro state restored"
    assert snapshot["notification"]["subtitle"] == "Live snapshot preset 7 re-pushed."
    assert repush_calls == ["repush"]
    assert [event[1]["state"] for event in emitter.events] == ["reconnecting", "repushing", "connected"]


@pytest.mark.asyncio
async def test_ground_control_pro_daemon_marks_disconnect_after_previous_availability() -> None:
    emitter = _Emitter()
    ports = [
        {
            "ground_control_inputs": [{"index": 0, "name": "Ground Control Pro In"}],
            "ground_control_outputs": [{"index": 1, "name": "Ground Control Pro Out"}],
        },
        {
            "ground_control_inputs": [],
            "ground_control_outputs": [],
        },
    ]

    async def _get_ports() -> dict[str, object]:
        return ports.pop(0)

    daemon = GroundControlProDaemon(
        get_ports=_get_ports,
        get_live_snapshot=_null_snapshot,
        repush_live_snapshot=lambda: {"status": "skipped"},
        emit=emitter,
        poll_interval_s=1.0,
    )

    await daemon.tick()
    assert daemon.snapshot()["state"] == "connected"

    await daemon.tick()
    snapshot = daemon.snapshot()
    assert snapshot["state"] == "reconnecting"
    assert snapshot["available"] is False
    assert snapshot["notification"]["title"] == "Ground Control Pro disconnected"
