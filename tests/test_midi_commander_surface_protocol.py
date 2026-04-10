from __future__ import annotations

from app.services.midi_commander_surface.protocol import (
    BANK_DOWN_CC,
    BANK_UP_CC,
    detect_midi_commander_variant,
    is_midi_commander_port_name,
    parse_midi_commander_message,
)


def test_midi_commander_protocol_detects_ports_and_variant() -> None:
    assert is_midi_commander_port_name("MeloAudio MIDI Commander") is True
    assert is_midi_commander_port_name("TSMIDI Foot Controller") is True
    assert is_midi_commander_port_name("Launch Control XL") is False
    assert detect_midi_commander_variant("MIDI Commander", {"profile_id": "meloaudio_midi_commander"}) == "midi_commander"


def test_midi_commander_protocol_parses_button_expression_and_bank_messages() -> None:
    assert parse_midi_commander_message(bytes([0xB0, 80, 127])) == {
        "event_type": "button",
        "message_type": "control_change",
        "channel": 1,
        "controller": 80,
        "value": 127,
        "pressed": True,
        "control_id": "1",
    }
    assert parse_midi_commander_message(bytes([0xC0, 0x01])) == {
        "event_type": "button",
        "message_type": "program_change",
        "channel": 1,
        "program": 1,
        "control_id": "B",
        "value": 127,
    }
    assert parse_midi_commander_message(bytes([0xB0, 0x07, 0x45])) == {
        "event_type": "expression",
        "message_type": "control_change",
        "channel": 1,
        "controller": 7,
        "value": 0x45,
        "pedal_id": "EXP1",
        "control_id": "EXP1",
    }
    assert parse_midi_commander_message(bytes([0xB0, BANK_UP_CC, 127]))["direction"] == "up"
    assert parse_midi_commander_message(bytes([0xB0, BANK_DOWN_CC, 127]))["direction"] == "down"
