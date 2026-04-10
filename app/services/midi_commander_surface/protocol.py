from __future__ import annotations

from typing import Any

MIDI_COMMANDER_PROFILE_ID = "meloaudio_midi_commander"
MIDI_COMMANDER_VARIANT = "midi_commander"

BUTTON_CC_BY_ID: dict[str, int] = {
    "1": 80,
    "2": 81,
    "3": 82,
    "4": 14,
}
BUTTON_PC_BY_ID: dict[str, int] = {
    "A": 0,
    "B": 1,
    "C": 2,
    "D": 3,
}
BUTTON_ID_BY_CC = {value: key for key, value in BUTTON_CC_BY_ID.items()}
BUTTON_ID_BY_PC = {value: key for key, value in BUTTON_PC_BY_ID.items()}
EXPRESSION_CC_BY_ID: dict[str, int] = {
    "EXP1": 7,
    "EXP2": 1,
}
EXPRESSION_ID_BY_CC = {value: key for key, value in EXPRESSION_CC_BY_ID.items()}
BANK_UP_CC = 85
BANK_DOWN_CC = 86


def is_midi_commander_port_name(port_name: str | None) -> bool:
    text = str(port_name or "").strip().lower()
    if not text:
        return False
    return any(pattern in text for pattern in ("midi commander", "meloaudio", "tsmidi", "ts midi"))


def detect_midi_commander_variant(port_name: str | None, metadata: dict[str, Any] | None = None) -> str:
    payload = dict(metadata or {})
    profile_id = str(payload.get("profile_id") or payload.get("device_profile_id") or "").strip().lower()
    if profile_id == MIDI_COMMANDER_PROFILE_ID:
        return MIDI_COMMANDER_VARIANT
    return MIDI_COMMANDER_VARIANT if is_midi_commander_port_name(port_name) else "unknown"


def parse_midi_commander_message(data: bytes) -> dict[str, Any] | None:
    payload = bytes(data or b"")
    if len(payload) != 2 and len(payload) != 3:
        return None

    status = payload[0]
    command = status & 0xF0
    channel = (status & 0x0F) + 1

    if command == 0xC0 and len(payload) == 2:
        program = int(payload[1] & 0x7F)
        control_id = BUTTON_ID_BY_PC.get(program)
        return {
            "event_type": "button",
            "message_type": "program_change",
            "channel": channel,
            "program": program,
            "control_id": control_id or f"pc-{program}",
            "value": 127,
        }

    if command != 0xB0 or len(payload) != 3:
        return None

    controller = int(payload[1] & 0x7F)
    value = int(payload[2] & 0x7F)

    if controller == BANK_UP_CC:
        return {
            "event_type": "bank",
            "message_type": "control_change",
            "channel": channel,
            "controller": controller,
            "value": value,
            "direction": "up",
        }
    if controller == BANK_DOWN_CC:
        return {
            "event_type": "bank",
            "message_type": "control_change",
            "channel": channel,
            "controller": controller,
            "value": value,
            "direction": "down",
        }

    if controller in EXPRESSION_ID_BY_CC:
        pedal_id = EXPRESSION_ID_BY_CC[controller]
        return {
            "event_type": "expression",
            "message_type": "control_change",
            "channel": channel,
            "controller": controller,
            "value": value,
            "pedal_id": pedal_id,
            "control_id": pedal_id,
        }

    control_id = BUTTON_ID_BY_CC.get(controller)
    if control_id is not None:
        return {
            "event_type": "button",
            "message_type": "control_change",
            "channel": channel,
            "controller": controller,
            "value": value,
            "pressed": value >= 64,
            "control_id": control_id,
        }

    return {
        "event_type": "control_change",
        "message_type": "control_change",
        "channel": channel,
        "controller": controller,
        "value": value,
        "control_id": f"cc-{controller}",
    }


def build_default_layout() -> list[dict[str, Any]]:
    controls: list[dict[str, Any]] = []
    for control_id, controller in BUTTON_CC_BY_ID.items():
        controls.append(
            {
                "control_id": control_id,
                "control_type": "button",
                "label": f"Switch {control_id}",
                "message_type": "control_change",
                "channel": 1,
                "controller": controller,
            }
        )
    for control_id, program in BUTTON_PC_BY_ID.items():
        controls.append(
            {
                "control_id": control_id,
                "control_type": "button",
                "label": f"Switch {control_id}",
                "message_type": "program_change",
                "channel": 1,
                "program": program,
            }
        )
    for pedal_id, controller in EXPRESSION_CC_BY_ID.items():
        controls.append(
            {
                "control_id": pedal_id,
                "control_type": "expression",
                "label": pedal_id,
                "message_type": "control_change",
                "channel": 1,
                "controller": controller,
            }
        )
    return controls
