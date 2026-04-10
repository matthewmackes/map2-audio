from __future__ import annotations

import pytest

from app.services.midi_commander_surface.daemon import MidiCommanderSurfaceDaemon


@pytest.mark.asyncio
async def test_midi_commander_daemon_reconnects_and_repushes() -> None:
    ports: list[dict[str, str]] = []
    emitted: list[tuple[str, dict[str, object]]] = []
    repush_calls: list[bool] = []

    async def _emit(topic: str, payload: dict[str, object]) -> None:
        emitted.append((topic, dict(payload)))

    async def _repush() -> dict[str, object]:
        repush_calls.append(True)
        return {"status": "completed", "status_label": "Current snapshot mappings and manual setup guidance refreshed."}

    daemon = MidiCommanderSurfaceDaemon(
        get_ports=lambda: list(ports),
        repush_surface_state=_repush,
        emit=_emit,
    )

    await daemon.tick()
    assert daemon.snapshot()["state"] == "reconnecting"

    ports.append({"port_id": "mc-in", "name": "MIDI Commander", "direction": "duplex"})
    await daemon.tick()

    snapshot = daemon.snapshot()
    assert snapshot["state"] == "connected"
    assert snapshot["reconnect_count"] == 1
    assert repush_calls == [True]
    assert any(topic == "midi_commander_surface:daemon" for topic, _payload in emitted)
