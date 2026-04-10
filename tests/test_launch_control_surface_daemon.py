from __future__ import annotations

import pytest

from app.services.launch_control_surface.daemon import LaunchControlSurfaceDaemon


@pytest.mark.asyncio
async def test_launch_control_daemon_repushes_on_reconnect() -> None:
    published: list[dict[str, object]] = []
    repush_calls: list[str] = []
    states = [
        [],
        [{"port_id": "lc-out", "name": "Launch Control XL", "direction": "duplex"}],
    ]

    async def _get_ports():
        return states.pop(0) if states else [{"port_id": "lc-out", "name": "Launch Control XL", "direction": "duplex"}]

    async def _repush_surface_state():
        repush_calls.append("repush")
        return {
            "status": "completed",
            "status_label": "Live snapshot mappings and LED state re-pushed.",
            "destination_ports": ["lc-out"],
        }

    async def _emit(_topic: str, payload: dict[str, object]) -> None:
        published.append(dict(payload))

    daemon = LaunchControlSurfaceDaemon(
        get_ports=_get_ports,
        repush_surface_state=_repush_surface_state,
        emit=_emit,
    )

    await daemon.tick()
    assert daemon.snapshot()["state"] == "reconnecting"

    await daemon.tick()

    snapshot = daemon.snapshot()
    assert repush_calls == ["repush"]
    assert snapshot["state"] == "connected"
    assert snapshot["reconnect_count"] == 1
    assert snapshot["last_destination_ports"] == ["lc-out"]
    assert snapshot["notification"]["title"] == "Launch Control state restored"
    assert published


@pytest.mark.asyncio
async def test_launch_control_daemon_marks_disconnect() -> None:
    states = [
        [{"port_id": "lc-out", "name": "Launch Control XL", "direction": "duplex"}],
        [],
    ]

    async def _get_ports():
        return states.pop(0) if states else []

    daemon = LaunchControlSurfaceDaemon(
        get_ports=_get_ports,
        repush_surface_state=lambda: {"status": "completed"},
        emit=lambda *_args, **_kwargs: None,
    )

    await daemon.tick()
    await daemon.tick()

    snapshot = daemon.snapshot()
    assert snapshot["state"] == "reconnecting"
    assert snapshot["available"] is False
    assert snapshot["notification"]["severity"] == "warning"
