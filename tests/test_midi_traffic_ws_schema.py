"""Run-14c cycle 2 — midi:traffic WS schema contract."""

from __future__ import annotations

import time

import pytest

from app.services.midi_hub._traffic_ws_schema import (
    SCHEMA_VERSION,
    TRAFFIC_FRAME_TYPE,
    DecodedMidiMessage,
    MidiTrafficFrame,
    MidiTrafficPayload,
    build_traffic_frame,
    validate_traffic_frame,
)


def test_constants() -> None:
    assert TRAFFIC_FRAME_TYPE == "midi:traffic"
    assert SCHEMA_VERSION == 1


# ---------------------------------------------------------------------------
# DecodedMidiMessage
# ---------------------------------------------------------------------------


def test_decoded_message_accepts_note_on() -> None:
    msg = DecodedMidiMessage(message_type="note_on", channel=0, data1=60, data2=127)
    assert msg.message_type == "note_on"


def test_decoded_message_channel_must_be_0_to_15() -> None:
    with pytest.raises(ValueError):
        DecodedMidiMessage(message_type="cc", channel=16, data1=0, data2=0)
    with pytest.raises(ValueError):
        DecodedMidiMessage(message_type="cc", channel=-1, data1=0, data2=0)


def test_decoded_message_data_bytes_must_be_0_to_255() -> None:
    """data1 / data2 can be the full byte range — the parser does not
    enforce MIDI's 7-bit limit since SysEx and system messages use more."""
    msg = DecodedMidiMessage(message_type="system", channel=0, data1=255, data2=255)
    assert msg.data1 == 255


def test_decoded_message_open_string_message_type() -> None:
    """Open type — future parser extensions don't require a schema bump."""
    msg = DecodedMidiMessage(message_type="future_extension", channel=0, data1=0, data2=0)
    assert msg.message_type == "future_extension"


# ---------------------------------------------------------------------------
# MidiTrafficPayload — both inbound + outbound shapes
# ---------------------------------------------------------------------------


def _outbound_payload() -> MidiTrafficPayload:
    return MidiTrafficPayload(
        timestamp_ns=time.time_ns(),
        source_port="from-USB-Commander",
        destination_port="to-Engine-Bridge",
        direction="outbound",
        route_id="route-42",
        raw_hex="903c7f",
        decoded=DecodedMidiMessage(message_type="note_on", channel=0, data1=60, data2=127),
    )


def _inbound_payload() -> MidiTrafficPayload:
    """Mirrors InboundMidiTrafficBridge._publish's shape."""
    return MidiTrafficPayload(
        timestamp_ns=time.time_ns(),
        source_port="USB-Commander",
        # destination_port omitted; defaults to ""
        direction="inbound",
        # route_id omitted; defaults to None
        raw_hex="b007ff",
        decoded=DecodedMidiMessage(message_type="cc", channel=0, data1=7, data2=255),
    )


def test_inbound_payload_defaults() -> None:
    p = _inbound_payload()
    assert p.direction == "inbound"
    assert p.destination_port == ""
    assert p.route_id is None


def test_outbound_payload_carries_route_id() -> None:
    p = _outbound_payload()
    assert p.direction == "outbound"
    assert p.route_id == "route-42"


def test_payload_rejects_unknown_direction() -> None:
    with pytest.raises(ValueError):
        MidiTrafficPayload(
            timestamp_ns=0,
            source_port="x",
            direction="sideways",  # type: ignore[arg-type]
            raw_hex="",
            decoded=DecodedMidiMessage(message_type="cc", channel=0, data1=0, data2=0),
        )


# ---------------------------------------------------------------------------
# Frame envelope
# ---------------------------------------------------------------------------


def test_frame_envelope_locks_topic() -> None:
    frame = MidiTrafficFrame(data=_inbound_payload())
    assert frame.type == TRAFFIC_FRAME_TYPE
    assert frame.schema_version == SCHEMA_VERSION


def test_frame_rejects_wrong_topic() -> None:
    with pytest.raises(ValueError):
        MidiTrafficFrame(
            type="midi:route_changed",  # type: ignore[arg-type]
            data=_inbound_payload(),
        )


def test_legacy_frame_without_schema_version_validates() -> None:
    """Existing emitters at MidiRouter._emit_traffic_event +
    InboundMidiTrafficBridge._publish don't carry a schema_version
    field — the canonical model defaults it to 1 so the legacy shape
    validates without a code change."""
    legacy_frame = {
        "type": "midi:traffic",
        "data": {
            "timestamp_ns": int(time.time_ns()),
            "source_port": "Commander",
            "destination_port": "",
            "direction": "inbound",
            "route_id": None,
            "raw_hex": "b007ff",
            "decoded": {
                "message_type": "cc",
                "channel": 0,
                "data1": 7,
                "data2": 255,
            },
        },
    }
    parsed = validate_traffic_frame(legacy_frame)
    assert parsed.schema_version == 1
    assert parsed.data.direction == "inbound"


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------


def test_build_traffic_frame_round_trips_outbound() -> None:
    payload_dict = _outbound_payload().model_dump()
    frame = build_traffic_frame(payload_dict)
    parsed = validate_traffic_frame(frame)
    assert parsed.type == TRAFFIC_FRAME_TYPE
    assert parsed.data.direction == "outbound"
    assert parsed.data.route_id == "route-42"


def test_build_traffic_frame_raises_on_missing_decoded() -> None:
    """Better to fail loud than silently emit a frame the supervisor
    can't decode."""
    with pytest.raises(ValueError):
        build_traffic_frame({
            "timestamp_ns": 0,
            "source_port": "x",
            "direction": "inbound",
            "raw_hex": "",
            # no `decoded`
        })


def test_build_traffic_frame_emits_default_schema_version() -> None:
    payload_dict = _outbound_payload().model_dump()
    frame = build_traffic_frame(payload_dict)
    assert frame["schema_version"] == 1
