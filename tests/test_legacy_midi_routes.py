import asyncio
from datetime import datetime, timezone

from app.routes import midi as midi_routes


def test_create_route_uses_timezone_aware_timestamp():
    midi_routes._midi_routes.clear()
    midi_routes._midi_route_id = 0

    payload = asyncio.run(
        midi_routes.create_route(
            midi_routes.MIDIRouteRequest(
                input_port="In 1",
                output_port="Out 1",
                channel=1,
                enabled=True,
            )
        )
    )

    timestamp = datetime.fromisoformat(payload["route"]["created_at"])
    assert timestamp.tzinfo is not None
    assert timestamp.utcoffset() == timezone.utc.utcoffset(timestamp)


def test_log_midi_message_uses_timezone_aware_timestamp():
    midi_routes._midi_monitor_buffer.clear()

    midi_routes.log_midi_message("cc", 1, {"value": 64})
    payload = midi_routes._midi_monitor_buffer[-1]

    timestamp = datetime.fromisoformat(payload["timestamp"])
    assert timestamp.tzinfo is not None
    assert timestamp.utcoffset() == timezone.utc.utcoffset(timestamp)
