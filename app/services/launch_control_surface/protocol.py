from __future__ import annotations

from typing import Any

NOVATION_MANUFACTURER_ID = bytes([0x00, 0x20, 0x29])
LAUNCH_CONTROL_DEVICE_ID = 0x0A
LAUNCH_CONTROL_XL_DEVICE_ID = 0x11
TEMPLATE_CHANGE_COMMAND = 0x77
LED_SET_COMMAND = 0x78

MAP2_TEMPLATE_INDEX = 0x00
MAP2_TEMPLATE_NAME = "MAP2 Macros"


def is_launch_control_port_name(name: str) -> bool:
    normalized = str(name or "").strip().lower()
    return any(token in normalized for token in ("launch control", "launchcontrol", "launch control xl"))


def detect_launch_control_variant(name: str) -> str:
    normalized = str(name or "").strip().lower()
    return "launch_control_xl" if "xl" in normalized else "launch_control"


def _device_id_for_variant(variant: str) -> int:
    return LAUNCH_CONTROL_XL_DEVICE_ID if str(variant or "").strip().lower() == "launch_control_xl" else LAUNCH_CONTROL_DEVICE_ID


def build_select_template_sysex(*, variant: str, template_index: int = MAP2_TEMPLATE_INDEX) -> bytes:
    return bytes(
        [
            0xF0,
            *NOVATION_MANUFACTURER_ID,
            0x02,
            _device_id_for_variant(variant),
            TEMPLATE_CHANGE_COMMAND,
            max(0, min(0x0F, int(template_index))),
            0xF7,
        ]
    )


def build_led_set_sysex(*, variant: str, template_index: int, led_values: list[tuple[int, int]]) -> bytes:
    payload: list[int] = [
        0xF0,
        *NOVATION_MANUFACTURER_ID,
        0x02,
        _device_id_for_variant(variant),
        LED_SET_COMMAND,
        max(0, min(0x0F, int(template_index))),
    ]
    for index, value in led_values:
        payload.extend(
            [
                max(0, min(0x7F, int(index))),
                max(0, min(0x7F, int(value))),
            ]
        )
    payload.append(0xF7)
    return bytes(payload)


def build_led_note_message(*, note: int, velocity: int, channel: int = 1) -> bytes:
    return bytes(
        [
            0x90 | max(0, min(15, int(channel) - 1)),
            max(0, min(0x7F, int(note))),
            max(0, min(0x7F, int(velocity))),
        ]
    )


def parse_template_change_sysex(data: bytes) -> dict[str, Any] | None:
    payload = bytes(data or b"")
    if len(payload) != 9 or payload[0] != 0xF0 or payload[-1] != 0xF7:
        return None
    if payload[1:4] != NOVATION_MANUFACTURER_ID or payload[4] != 0x02:
        return None
    device_id = payload[5]
    if device_id not in {LAUNCH_CONTROL_DEVICE_ID, LAUNCH_CONTROL_XL_DEVICE_ID}:
        return None
    if payload[6] != TEMPLATE_CHANGE_COMMAND:
        return None
    return {
        "event_type": "template_changed",
        "variant": "launch_control_xl" if device_id == LAUNCH_CONTROL_XL_DEVICE_ID else "launch_control",
        "device_id": device_id,
        "template_index": payload[7] & 0x0F,
    }


def parse_launch_control_message(data: bytes) -> dict[str, Any] | None:
    payload = bytes(data or b"")
    sysex = parse_template_change_sysex(payload)
    if sysex is not None:
        return sysex
    status = payload[0] & 0xF0 if payload else 0
    channel = (payload[0] & 0x0F) + 1 if payload else 1
    if status == 0xB0 and len(payload) >= 3:
        return {
            "event_type": "control_change",
            "channel": channel,
            "controller": payload[1] & 0x7F,
            "value": payload[2] & 0x7F,
        }
    if status in {0x90, 0x80} and len(payload) >= 3:
        return {
            "event_type": "note",
            "channel": channel,
            "note": payload[1] & 0x7F,
            "velocity": payload[2] & 0x7F,
            "pressed": status == 0x90 and (payload[2] & 0x7F) > 0,
        }
    return None


def build_map2_template_manifest(*, variant: str) -> dict[str, Any]:
    if str(variant or "").strip().lower() == "launch_control_xl":
        controls = {
            "knob_rows": 3,
            "knobs_per_row": 8,
            "faders": 8,
            "button_rows": 2,
            "buttons_per_row": 8,
            "transport_buttons": ["device", "mute", "solo", "record_arm", "up", "down", "left", "right"],
        }
    else:
        controls = {
            "knob_rows": 2,
            "knobs_per_row": 8,
            "faders": 0,
            "button_rows": 2,
            "buttons_per_row": 8,
            "transport_buttons": [],
        }
    return {
        "template_index": MAP2_TEMPLATE_INDEX,
        "template_name": MAP2_TEMPLATE_NAME,
        "variant": variant,
        "strategy": "components-managed-custom-modes",
        "controls": controls,
        "cc_layout_note": "MAP2 reserves template slot 0 as the canonical Launch Control macro surface.",
    }
