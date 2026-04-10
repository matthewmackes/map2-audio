from __future__ import annotations

import pytest

from app.services.mcu_surface.daemon import McuSurfaceDaemon


class _Emitter:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, object]]] = []

    async def __call__(self, topic: str, payload: dict[str, object]) -> None:
        self.events.append((topic, dict(payload)))


@pytest.mark.asyncio
async def test_mcu_surface_daemon_repushes_surface_state_on_reconnect() -> None:
    emitter = _Emitter()
    port_snapshots = [
        [],
        [{"port_id": "mcu-out", "name": "Mackie MCU Pro", "direction": "duplex"}],
    ]
    repush_calls: list[bool] = []

    async def get_ports() -> list[dict[str, object]]:
        return port_snapshots.pop(0)

    async def repush_surface_state() -> dict[str, object]:
        repush_calls.append(True)
        return {
            "status": "completed",
            "status_label": "Focused plugin bank restored to 1 destination.",
            "destination_ports": ["mcu-out"],
            "transport": {"active_owner": "midi_recorder"},
        }

    daemon = McuSurfaceDaemon(
        get_ports=get_ports,
        repush_surface_state=repush_surface_state,
        emit=emitter,
        poll_interval_s=999.0,
    )

    await daemon.tick()
    assert daemon.snapshot()["state"] == "reconnecting"

    await daemon.tick()
    snapshot = daemon.snapshot()
    assert snapshot["state"] == "connected"
    assert snapshot["reconnect_count"] == 1
    assert snapshot["last_destination_ports"] == ["mcu-out"]
    assert snapshot["last_transport_owner"] == "midi_recorder"
    assert snapshot["notification"]["title"] == "MCU surface state restored"
    assert snapshot["notification"]["subtitle"] == "Focused plugin bank restored to 1 destination."
    assert repush_calls == [True]
    assert [event[1]["state"] for event in emitter.events] == ["reconnecting", "repushing", "connected"]


@pytest.mark.asyncio
async def test_mcu_surface_daemon_marks_disconnect_after_previous_availability() -> None:
    emitter = _Emitter()
    port_snapshots = [
        [{"port_id": "mcu-out", "name": "Mackie MCU Pro", "direction": "duplex"}],
        [],
    ]

    async def get_ports() -> list[dict[str, object]]:
        return port_snapshots.pop(0)

    async def repush_surface_state() -> dict[str, object]:
        return {"status": "completed", "destination_ports": [], "transport": {"active_owner": None}}

    daemon = McuSurfaceDaemon(
        get_ports=get_ports,
        repush_surface_state=repush_surface_state,
        emit=emitter,
        poll_interval_s=999.0,
    )

    await daemon.tick()
    assert daemon.snapshot()["state"] == "connected"

    await daemon.tick()
    snapshot = daemon.snapshot()
    assert snapshot["state"] == "reconnecting"
    assert snapshot["available"] is False
    assert snapshot["notification"]["title"] == "MCU surface disconnected"
