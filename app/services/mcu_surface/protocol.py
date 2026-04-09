from __future__ import annotations

from typing import Any

MCU_MANUFACTURER_ID = bytes([0x00, 0x00, 0x66])
MCU_DEVICE_FAMILY = 0x14
MCU_LCD_COMMAND = 0x12
MCU_METER_COMMAND = 0x20
MCU_CHANNEL_STRIP_COUNT = 8
MCU_LCD_CHARS_PER_STRIP = 7
MCU_LCD_TOTAL_CHARS = MCU_CHANNEL_STRIP_COUNT * MCU_LCD_CHARS_PER_STRIP


def build_device_query() -> bytes:
    return bytes([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7])


def is_mcu_port_name(name: str) -> bool:
    normalized = str(name or "").strip().lower()
    return any(token in normalized for token in ("mackie mcu", "mcu pro", "mackie control", "control universal"))


def parse_identity_response(data: bytes) -> dict[str, Any] | None:
    payload = bytes(data or b"")
    if len(payload) < 15:
        return None
    if payload[:5] != bytes([0xF0, 0x7E, payload[2], 0x06, 0x02]) or payload[-1] != 0xF7:
        return None
    manufacturer = payload[5:8]
    if manufacturer != MCU_MANUFACTURER_ID:
        return None
    return {
        "event_type": "identity_response",
        "device_id": payload[2] & 0x7F,
        "manufacturer_id": tuple(manufacturer),
        "family_code": (payload[8], payload[9]),
        "model_code": (payload[10], payload[11]),
        "version": f"{payload[12]}.{payload[13]}.{payload[14]}.{payload[15]}" if len(payload) >= 16 else None,
    }


def _decode_pitch_bend(value_lsb: int, value_msb: int) -> int:
    return ((value_msb & 0x7F) << 7) | (value_lsb & 0x7F)


def _decode_relative_twos_complement(value: int) -> int:
    candidate = value & 0x7F
    if candidate == 0x40:
        return 0
    if candidate <= 0x3F:
        return candidate
    return candidate - 0x80


def parse_mcu_message(data: bytes) -> dict[str, Any] | None:
    payload = bytes(data or b"")
    if not payload:
        return None

    identity = parse_identity_response(payload)
    if identity is not None:
        return identity

    status = payload[0] & 0xF0
    channel = (payload[0] & 0x0F) + 1

    if status == 0xE0 and len(payload) >= 3:
        absolute = _decode_pitch_bend(payload[1], payload[2])
        return {
            "event_type": "fader",
            "channel": channel,
            "fader_index": channel - 1,
            "absolute": absolute,
            "normalized": round(absolute / 16383.0, 6),
        }

    if status == 0xB0 and len(payload) >= 3:
        controller = payload[1] & 0x7F
        value = payload[2] & 0x7F
        if 0x10 <= controller <= 0x17:
            return {
                "event_type": "vpot",
                "channel": channel,
                "vpot_index": controller - 0x10,
                "controller": controller,
                "value": value,
                "delta": _decode_relative_twos_complement(value),
            }
        return {
            "event_type": "control_change",
            "channel": channel,
            "controller": controller,
            "value": value,
        }

    if status in {0x90, 0x80} and len(payload) >= 3:
        note = payload[1] & 0x7F
        velocity = payload[2] & 0x7F
        pressed = status == 0x90 and velocity > 0
        return {
            "event_type": "button",
            "channel": channel,
            "note": note,
            "velocity": velocity,
            "pressed": pressed,
        }

    return None


def _normalize_scribble_text(label: str) -> str:
    normalized = "".join(char if 32 <= ord(char) <= 126 else " " for char in str(label or ""))
    return normalized[:MCU_LCD_CHARS_PER_STRIP].ljust(MCU_LCD_CHARS_PER_STRIP)


def build_scribble_strip_sysex(labels: list[str], *, offset: int = 0) -> bytes:
    start_offset = max(0, min(0x37, int(offset)))
    strips = list(labels[:MCU_CHANNEL_STRIP_COUNT])
    if len(strips) < MCU_CHANNEL_STRIP_COUNT:
        strips.extend([""] * (MCU_CHANNEL_STRIP_COUNT - len(strips)))
    text = "".join(_normalize_scribble_text(label) for label in strips)
    payload = text.encode("ascii", errors="ignore")
    return bytes([0xF0, *MCU_MANUFACTURER_ID, MCU_DEVICE_FAMILY, MCU_LCD_COMMAND, start_offset, *payload, 0xF7])


def build_meter_bridge_sysex(levels: list[int]) -> bytes:
    values = [max(0, min(0x0F, int(level))) for level in levels[:MCU_CHANNEL_STRIP_COUNT]]
    if len(values) < MCU_CHANNEL_STRIP_COUNT:
        values.extend([0] * (MCU_CHANNEL_STRIP_COUNT - len(values)))
    return bytes([0xF0, *MCU_MANUFACTURER_ID, MCU_DEVICE_FAMILY, MCU_METER_COMMAND, *values, 0xF7])
