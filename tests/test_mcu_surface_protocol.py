from __future__ import annotations

from app.services.mcu_surface.protocol import (
    build_device_query,
    build_fader_pitch_bend,
    build_meter_bridge_sysex,
    build_scribble_strip_sysex,
    is_mcu_port_name,
    MCU_JOG_WHEEL_CONTROLLER,
    parse_identity_response,
    parse_mcu_message,
)


def test_mcu_protocol_builds_device_query_and_parses_identity_reply() -> None:
    assert build_device_query() == bytes([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7])

    reply = bytes([0xF0, 0x7E, 0x10, 0x06, 0x02, 0x00, 0x00, 0x66, 0x14, 0x00, 0x01, 0x00, 0x01, 0x02, 0x03, 0x04, 0xF7])
    parsed = parse_identity_response(reply)

    assert parsed is not None
    assert parsed["event_type"] == "identity_response"
    assert parsed["device_id"] == 0x10
    assert parsed["manufacturer_id"] == (0x00, 0x00, 0x66)
    assert parsed["family_code"] == (0x14, 0x00)
    assert parsed["model_code"] == (0x01, 0x00)
    assert parsed["version"] == "1.2.3.4"


def test_mcu_protocol_parses_faders_vpots_and_buttons() -> None:
    fader = parse_mcu_message(bytes([0xE0, 0x00, 0x40]))
    assert fader == {
        "event_type": "fader",
        "channel": 1,
        "fader_index": 0,
        "absolute": 8192,
        "normalized": 0.500031,
    }

    vpot = parse_mcu_message(bytes([0xB0, 0x12, 0x41]))
    assert vpot == {
        "event_type": "vpot",
        "channel": 1,
        "vpot_index": 2,
        "controller": 0x12,
        "value": 0x41,
        "delta": -63,
    }

    jog = parse_mcu_message(bytes([0xB0, MCU_JOG_WHEEL_CONTROLLER, 0x01]))
    assert jog == {
        "event_type": "jog_wheel",
        "channel": 1,
        "controller": MCU_JOG_WHEEL_CONTROLLER,
        "value": 1,
        "delta": 1,
    }

    button = parse_mcu_message(bytes([0x90, 0x5A, 0x7F]))
    assert button == {
        "event_type": "button",
        "channel": 1,
        "note": 0x5A,
        "velocity": 0x7F,
        "pressed": True,
    }


def test_mcu_protocol_formats_scribble_strip_and_meter_payloads() -> None:
    scribble = build_scribble_strip_sysex(["Bass", "Lead", "Rev", "Del", "Mod", "Comp", "Gate", "Out"])
    fader = build_fader_pitch_bend(1, 0x1234)
    assert scribble[:6] == bytes([0xF0, 0x00, 0x00, 0x66, 0x14, 0x12])
    assert scribble[-1] == 0xF7
    assert len(scribble) == 64
    assert b"Bass   Lead   Rev    " in scribble

    meter = build_meter_bridge_sysex([0, 1, 2, 3, 4, 5, 16, -1])
    assert meter == bytes([0xF0, 0x00, 0x00, 0x66, 0x14, 0x20, 0, 1, 2, 3, 4, 5, 15, 0, 0xF7])
    assert fader == bytes([0xE1, 0x34, 0x24])


def test_mcu_protocol_detects_mcu_port_names() -> None:
    assert is_mcu_port_name("Mackie MCU Pro") is True
    assert is_mcu_port_name("Mackie Control Universal") is True
    assert is_mcu_port_name("Ground Control Pro") is False
