"""Generic MIDI helpers shared by Push profiles, parser, and renderer."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from app.services.push_surface.models.capabilities import MappingConfidence


class MidiControlType(str, Enum):
    """Normalized MIDI message families."""

    NOTE = "note"
    CONTROL_CHANGE = "control_change"
    PITCH_BEND = "pitch_bend"
    CHANNEL_PRESSURE = "channel_pressure"
    POLY_AFTERTOUCH = "poly_aftertouch"


class ControlKind(str, Enum):
    """Logical control categories used by profiles."""

    PAD = "pad"
    BUTTON = "button"
    ENCODER = "encoder"
    ENCODER_TOUCH = "encoder_touch"
    TOUCHSTRIP = "touchstrip"
    PEDAL = "pedal"


class EncoderMode(str, Enum):
    """Relative/absolute encoder decoding modes."""

    ABSOLUTE = "absolute"
    RELATIVE_SIGNED_BIT = "relative_signed_bit"
    RELATIVE_TWOS_COMPLEMENT = "relative_twos_complement"


@dataclass(frozen=True)
class MidiControlBinding:
    """One logical control bound to one MIDI address."""

    logical_name: str
    control_kind: ControlKind
    midi_type: MidiControlType
    number: int
    led_midi_type: MidiControlType | None = None
    led_number: int | None = None
    grid_x: int | None = None
    grid_y: int | None = None
    encoder_index: int | None = None
    default_page_behavior: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    confidence: MappingConfidence = MappingConfidence.UNVERIFIED


def grid_control_id(x: int, y: int) -> str:
    """Return the canonical grid control identifier for x/y coordinates."""

    return f"grid_{int(x)}_{int(y)}"


def decode_status(data: bytes) -> tuple[int, int]:
    """Split a status byte into message-type nibble and channel."""

    if not data:
        return 0, 0
    status = int(data[0]) & 0xFF
    return status & 0xF0, status & 0x0F


def decode_relative_delta(value: int, mode: EncoderMode) -> int:
    """Convert a raw encoder value into a signed delta."""

    normalized = int(value) & 0x7F
    if mode == EncoderMode.ABSOLUTE:
        return normalized
    if mode == EncoderMode.RELATIVE_SIGNED_BIT:
        if normalized == 64:
            return 0
        return normalized - 64
    if normalized == 0:
        return 0
    if normalized <= 63:
        return normalized
    return normalized - 128


def build_note_message(note: int, velocity: int, *, channel: int = 0, note_on: bool = True) -> bytes:
    """Encode a note-on/note-off message."""

    status = 0x90 if note_on else 0x80
    return bytes(
        (
            status | (int(channel) & 0x0F),
            int(note) & 0x7F,
            int(velocity) & 0x7F,
        )
    )


def build_control_change(control: int, value: int, *, channel: int = 0) -> bytes:
    """Encode a control-change message."""

    return bytes(
        (
            0xB0 | (int(channel) & 0x0F),
            int(control) & 0x7F,
            int(value) & 0x7F,
        )
    )


def build_pitch_bend(value: int, *, channel: int = 0) -> bytes:
    """Encode a pitch-bend message with a 14-bit value."""

    normalized = max(0, min(int(value), 0x3FFF))
    return bytes(
        (
            0xE0 | (int(channel) & 0x0F),
            normalized & 0x7F,
            (normalized >> 7) & 0x7F,
        )
    )
