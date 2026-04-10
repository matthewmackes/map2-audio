from __future__ import annotations

import asyncio

from app.services.mcu_surface.service import McuSurfaceService


class _FakePublisher:
    def __init__(self) -> None:
        self.messages: list[tuple[tuple[str, ...], dict[str, object]]] = []

    async def publish_message(self, message: dict[str, object], *, topics) -> None:
        self.messages.append((tuple(topics), dict(message)))


class _FakeMidiHub:
    def __init__(self) -> None:
        self.subscribers: dict[str, object] = {}
        self.sent: list[dict[str, object]] = []

    def subscribe(self, subscriber_id: str, callback) -> None:
        self.subscribers[subscriber_id] = callback

    def send(self, *, source_port: str, destination_port: str, data: bytes, metadata=None) -> bool:
        self.sent.append(
            {
                "source_port": source_port,
                "destination_port": destination_port,
                "data": bytes(data),
                "metadata": dict(metadata or {}),
            }
        )
        return True


def test_mcu_surface_service_emits_parsed_events_and_tracks_identity() -> None:
    publisher = _FakePublisher()
    midi_hub = _FakeMidiHub()
    service = McuSurfaceService(midi_hub=midi_hub, publisher=publisher)

    reply = bytes([0xF0, 0x7E, 0x10, 0x06, 0x02, 0x00, 0x00, 0x66, 0x14, 0x00, 0x01, 0x00, 0x01, 0x02, 0x03, 0x04, 0xF7])
    result = asyncio.run(
        service.handle_inbound_message(
            reply,
            source_port="Mackie MCU Pro",
            metadata={"profile_id": "mackie_mcu_pro"},
        )
    )

    assert result["status"] == "completed"
    assert result["event"]["event_type"] == "identity_response"
    snapshot = service.get_state_snapshot()
    assert snapshot["identity"]["version"] == "1.2.3.4"
    assert snapshot["daemon_status"]["state"] in {"idle", "reconnecting", "connected"}
    assert publisher.messages[-1][0] == ("mcu_surface:event", "mcu_surface")


def test_mcu_surface_service_sends_device_query_scribble_strip_and_meter_bridge() -> None:
    midi_hub = _FakeMidiHub()
    service = McuSurfaceService(midi_hub=midi_hub)

    assert service.query_device(destination_port="Mackie MCU Pro Out") is True
    assert service.push_scribble_strip(destination_port="Mackie MCU Pro Out", labels=["Bass", "Lead"]) is True
    assert service.push_fader_positions(destination_port="Mackie MCU Pro Out", normalized_values=[0.0, 0.5, 1.0]) is True
    assert service.push_meter_bridge(destination_port="Mackie MCU Pro Out", levels=[1, 2, 3, 4, 5, 6, 7, 8]) is True

    assert len(midi_hub.sent) == 6
    assert midi_hub.sent[0]["metadata"]["message_type"] == "device_query"
    assert midi_hub.sent[1]["metadata"]["message_type"] == "scribble_strip"
    assert midi_hub.sent[2]["metadata"]["message_type"] == "motor_fader"
    assert midi_hub.sent[5]["metadata"]["message_type"] == "meter_bridge"
    assert midi_hub.sent[0]["data"] == bytes([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7])


def test_mcu_surface_service_rejects_non_mcu_sources() -> None:
    service = McuSurfaceService(midi_hub=_FakeMidiHub())

    result = asyncio.run(
        service.handle_inbound_message(
            bytes([0x90, 0x5A, 0x7F]),
            source_port="Ground Control Pro",
            metadata={"profile_id": "ground_control_pro"},
        )
    )

    assert result == {"status": "skipped", "reason": "non_mcu_source"}
