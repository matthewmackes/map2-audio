"""Tests for the MIDI learn heuristic classifier.

T2459-D4.
"""

from __future__ import annotations

from app.services.controllers.learning_utils import (
    CapturedMessage,
    classify,
)


def _msg(*bytes_):
    return CapturedMessage(timestamp_ns=0, bytes=tuple(bytes_))


def test_empty_capture_returns_unknown() -> None:
    r = classify([])
    assert r.kind == "unknown"
    assert r.confidence == 0.0


def test_pitch_bend_classified() -> None:
    msgs = [_msg(0xE0, 0x00, v) for v in (0x00, 0x10, 0x20, 0x40)]
    r = classify(msgs)
    assert r.kind == "pitch_bend"
    assert r.confidence > 0.5
    assert r.channel == 1


def test_note_on_classified_as_button() -> None:
    msgs = [_msg(0x90, 60, 100), _msg(0x80, 60, 0), _msg(0x90, 60, 100)]
    r = classify(msgs)
    assert r.kind == "button"
    assert r.midino == 60


def test_cc_full_range_classified_as_absolute_knob() -> None:
    msgs = [_msg(0xB0, 7, v) for v in (0, 32, 64, 96, 127)]
    r = classify(msgs)
    assert r.kind == "knob_absolute"
    assert r.midino == 7


def test_cc_signed_magnitude_relative_encoder() -> None:
    msgs = [_msg(0xB0, 16, v) for v in (1, 1, 1, 127, 127, 1)]
    r = classify(msgs)
    assert r.kind == "knob_relative"
    assert "signed-magnitude" in r.notes


def test_cc_twos_complement_relative_encoder() -> None:
    msgs = [_msg(0xB0, 17, v) for v in (65, 63, 64, 65, 64, 63)]
    r = classify(msgs)
    assert r.kind == "knob_relative"
    assert "two's-complement" in r.notes


def test_cc_with_partner_at_offset_32_is_14bit_encoder() -> None:
    msgs = [
        _msg(0xB0, 5, 64), _msg(0xB0, 5, 65),
        _msg(0xB0, 37, 0), _msg(0xB0, 37, 50),   # MSB+32 = LSB partner
    ]
    r = classify(msgs)
    assert r.kind == "encoder_14bit"
    assert "14-bit pair" in r.notes


def test_cc_with_only_0_and_127_classified_as_button() -> None:
    msgs = [_msg(0xB0, 64, 127), _msg(0xB0, 64, 0), _msg(0xB0, 64, 127)]
    r = classify(msgs)
    assert r.kind == "button"
    assert r.midino == 64


def test_cc_narrow_range_returns_unknown() -> None:
    msgs = [_msg(0xB0, 8, v) for v in (40, 41, 42)]
    r = classify(msgs)
    assert r.kind == "unknown"
    # Still recovers status/midino so the operator can pick manually.
    assert r.midino == 8


def test_unrecognised_status_family_returns_unknown() -> None:
    msgs = [_msg(0xF0, 0x10, 0x20)]   # SysEx
    r = classify(msgs)
    assert r.kind == "unknown"
