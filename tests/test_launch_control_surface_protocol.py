from __future__ import annotations

from app.services.launch_control_surface.protocol import (
    MAP2_TEMPLATE_INDEX,
    build_led_set_sysex,
    build_map2_template_manifest,
    build_select_template_sysex,
    detect_launch_control_variant,
    is_launch_control_port_name,
    parse_launch_control_message,
)


def test_launch_control_protocol_detects_variant_and_builds_template_messages() -> None:
    assert is_launch_control_port_name("Launch Control XL") is True
    assert detect_launch_control_variant("Launch Control XL") == "launch_control_xl"
    assert detect_launch_control_variant("Launch Control") == "launch_control"

    select_xl = build_select_template_sysex(variant="launch_control_xl", template_index=MAP2_TEMPLATE_INDEX)
    select_classic = build_select_template_sysex(variant="launch_control", template_index=2)
    led = build_led_set_sysex(variant="launch_control_xl", template_index=0, led_values=[(0x18, 0x3C), (0x19, 0x0F)])

    assert select_xl == bytes([0xF0, 0x00, 0x20, 0x29, 0x02, 0x11, 0x77, 0x00, 0xF7])
    assert select_classic == bytes([0xF0, 0x00, 0x20, 0x29, 0x02, 0x0A, 0x77, 0x02, 0xF7])
    assert led == bytes([0xF0, 0x00, 0x20, 0x29, 0x02, 0x11, 0x78, 0x00, 0x18, 0x3C, 0x19, 0x0F, 0xF7])


def test_launch_control_protocol_parses_template_change_and_controller_messages() -> None:
    template_change = parse_launch_control_message(bytes([0xF0, 0x00, 0x20, 0x29, 0x02, 0x11, 0x77, 0x03, 0xF7]))
    cc = parse_launch_control_message(bytes([0xB0, 0x15, 0x40]))
    note = parse_launch_control_message(bytes([0x90, 0x29, 0x7F]))

    assert template_change == {
        "event_type": "template_changed",
        "variant": "launch_control_xl",
        "device_id": 0x11,
        "template_index": 0x03,
    }
    assert cc == {
        "event_type": "control_change",
        "channel": 1,
        "controller": 0x15,
        "value": 0x40,
    }
    assert note == {
        "event_type": "note",
        "channel": 1,
        "note": 0x29,
        "velocity": 0x7F,
        "pressed": True,
    }


def test_launch_control_protocol_exposes_map2_template_manifest() -> None:
    manifest = build_map2_template_manifest(variant="launch_control_xl")

    assert manifest["template_index"] == 0
    assert manifest["template_name"] == "MAP2 Macros"
    assert manifest["strategy"] == "components-managed-custom-modes"
    assert manifest["controls"]["knob_rows"] == 3
    assert manifest["controls"]["faders"] == 8
