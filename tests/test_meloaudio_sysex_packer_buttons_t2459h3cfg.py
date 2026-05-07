"""T2459-H3-CFG Phase 3 slice 2 — Button_Settings packer tests."""

from __future__ import annotations

import pytest

from app.services.devices.meloaudio.sysex_packer import (
    BYTES_PER_BUTTON_ROW,
    BYTES_PER_COMMAND,
    ButtonRow,
    CommandCC,
    CommandNone,
    CommandNote,
    CommandPB,
    CommandPC,
    CommandStart,
    CommandStop,
    NUM_COMMANDS_PER_BUTTON,
    encode_command,
    pack_button_row,
    pack_button_settings,
)


# ---------------------------------------------------------------------------
# Empty / no-op slot encodings
# ---------------------------------------------------------------------------


def test_command_none_encodes_to_four_zeros() -> None:
    assert encode_command(CommandNone()) == bytes(4)


def test_command_start_encodes_to_start_nibble() -> None:
    assert encode_command(CommandStart()) == bytes([0x10, 0, 0, 0])


def test_command_stop_encodes_to_stop_nibble() -> None:
    assert encode_command(CommandStop()) == bytes([0x20, 0, 0, 0])


# ---------------------------------------------------------------------------
# Program Change encoding
# ---------------------------------------------------------------------------


def test_pc_minimal_no_bank() -> None:
    out = encode_command(CommandPC(channel=1, program=42))
    assert out[0] == 0xC0   # PC nibble + channel 0
    assert out[1] == 42
    # bank_select_high_byte=False → MSB byte is 0x80 sentinel
    assert out[2] == 0x80
    assert out[3] == 0      # bank LSB = 0


def test_pc_channel_offset_is_zero_indexed_on_wire() -> None:
    """Operator says channel 16, wire status byte is 0xCF (PC nibble + 0xF)."""
    out = encode_command(CommandPC(channel=16, program=0))
    assert out[0] == 0xCF


def test_pc_with_bank_low_only() -> None:
    """Bank LSB only — common for older patch-bank-style synths."""
    out = encode_command(CommandPC(
        channel=1, program=42, bank_select=63, bank_select_high_byte=False
    ))
    assert out[2] == 0x80   # MSB sentinel
    assert out[3] == 63     # LSB


def test_pc_with_full_14bit_bank() -> None:
    """14-bit bank: bank_select=0x1234 → MSB=0x24, LSB=0x34."""
    out = encode_command(CommandPC(
        channel=1, program=0, bank_select=0x1234, bank_select_high_byte=True
    ))
    assert out[2] == 0x24
    assert out[3] == 0x34


def test_pc_rejects_program_out_of_range() -> None:
    with pytest.raises(ValueError, match="program must be 0-127"):
        encode_command(CommandPC(channel=1, program=128))


def test_pc_rejects_bank_select_out_of_range() -> None:
    with pytest.raises(ValueError, match="bank_select must be 0-16383"):
        encode_command(CommandPC(channel=1, program=0, bank_select=16384))


def test_pc_rejects_invalid_channel() -> None:
    with pytest.raises(ValueError, match="channel must be 1-16"):
        encode_command(CommandPC(channel=0, program=0))
    with pytest.raises(ValueError, match="channel must be 1-16"):
        encode_command(CommandPC(channel=17, program=0))


# ---------------------------------------------------------------------------
# Control Change encoding
# ---------------------------------------------------------------------------


def test_cc_minimal_momentary() -> None:
    out = encode_command(CommandCC(channel=1, number=80, on_value=127, off_value=0))
    assert out[0] == 0xB0
    assert out[1] == 80     # toggle bit clear → number unchanged
    assert out[2] == 127
    assert out[3] == 0


def test_cc_toggle_sets_high_bit_in_byte_1() -> None:
    out = encode_command(CommandCC(
        channel=1, number=80, on_value=127, off_value=0, toggle=True
    ))
    assert out[1] == (80 | 0x80)


def test_cc_off_value_passes_through_as_byte() -> None:
    """off_value isn't masked to 7-bit — upstream allows full byte
    range (0-255) for some firmware-internal use cases.
    """
    out = encode_command(CommandCC(channel=1, number=1, on_value=64, off_value=200))
    assert out[3] == 200


def test_cc_rejects_number_out_of_range() -> None:
    with pytest.raises(ValueError, match="number must be 0-127"):
        encode_command(CommandCC(channel=1, number=128, on_value=0))


def test_cc_rejects_on_value_out_of_range() -> None:
    with pytest.raises(ValueError, match="on_value must be 0-127"):
        encode_command(CommandCC(channel=1, number=0, on_value=128))


# ---------------------------------------------------------------------------
# Note encoding
# ---------------------------------------------------------------------------


def test_note_minimal() -> None:
    out = encode_command(CommandNote(channel=1, note=60, velocity=100, duration=10))
    assert out[0] == 0x90
    assert out[1] == 60
    assert out[2] == 100
    assert out[3] == 10


def test_note_toggle_sets_high_bit() -> None:
    out = encode_command(CommandNote(
        channel=1, note=60, velocity=100, duration=10, toggle=True
    ))
    assert out[1] == (60 | 0x80)


def test_note_rejects_invalid_velocity() -> None:
    with pytest.raises(ValueError, match="velocity must be 0-127"):
        encode_command(CommandNote(channel=1, note=60, velocity=128, duration=0))


def test_note_rejects_invalid_duration() -> None:
    with pytest.raises(ValueError, match="duration must be 0-127"):
        encode_command(CommandNote(channel=1, note=60, velocity=100, duration=128))


# ---------------------------------------------------------------------------
# Pitch Bend encoding
# ---------------------------------------------------------------------------


def test_pb_zero_centers_around_0x2000() -> None:
    """Pitch=0 → 0x2000 internal → LSB=0x00, MSB=0x40."""
    out = encode_command(CommandPB(channel=1, pitch=0, duration=0))
    assert out[0] == 0xE0
    assert out[1] == 0x00   # LSB of 0x2000 (no toggle)
    assert out[2] == 0x40   # MSB of 0x2000


def test_pb_max_positive() -> None:
    """+8191 → 0x3FFF → LSB=0x7F, MSB=0x7F."""
    out = encode_command(CommandPB(channel=1, pitch=8191, duration=0))
    assert out[1] == 0x7F
    assert out[2] == 0x7F


def test_pb_max_negative() -> None:
    """-8192 → 0x0000 → LSB=0x00, MSB=0x00."""
    out = encode_command(CommandPB(channel=1, pitch=-8192, duration=0))
    assert out[1] == 0x00
    assert out[2] == 0x00


def test_pb_toggle_sets_high_bit_on_lsb() -> None:
    """Toggle bit goes into the high bit of byte 1 (the LSB byte)."""
    out = encode_command(CommandPB(channel=1, pitch=0, duration=0, toggle=True))
    assert out[1] == 0x80   # LSB=0 with toggle bit


def test_pb_rejects_out_of_range() -> None:
    with pytest.raises(ValueError, match="pitch must be -8192"):
        encode_command(CommandPB(channel=1, pitch=8192, duration=0))
    with pytest.raises(ValueError, match="pitch must be -8192"):
        encode_command(CommandPB(channel=1, pitch=-8193, duration=0))


# ---------------------------------------------------------------------------
# Unknown command types raise
# ---------------------------------------------------------------------------


def test_encode_command_rejects_unknown_type() -> None:
    class NotACommand:
        pass

    with pytest.raises(TypeError, match="unknown command type"):
        encode_command(NotACommand())  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Button row packing — full 40-byte rows
# ---------------------------------------------------------------------------


def test_pack_button_row_empty_is_all_zeros() -> None:
    """A row with no commands encodes as 40 zero bytes (ten None slots)."""
    row = ButtonRow(bank_number=0, button_identifier="1", commands=[])
    out = pack_button_row(row)
    assert len(out) == BYTES_PER_BUTTON_ROW
    assert out == bytes(BYTES_PER_BUTTON_ROW)


def test_pack_button_row_one_command_pads_remaining() -> None:
    row = ButtonRow(
        bank_number=0,
        button_identifier="1",
        commands=[CommandCC(channel=1, number=80, on_value=127, off_value=0)],
    )
    out = pack_button_row(row)
    assert len(out) == BYTES_PER_BUTTON_ROW
    # First 4 bytes are the CC encoding
    assert out[0] == 0xB0
    assert out[1] == 80
    assert out[2] == 127
    assert out[3] == 0
    # Remaining 36 bytes are zero-fill
    assert out[4:] == bytes(36)


def test_pack_button_row_full_ten_commands() -> None:
    """A button with all 10 slots used encodes to exactly 40 bytes,
    no padding."""
    commands: list = [
        CommandCC(channel=1, number=i, on_value=127) for i in range(10)
    ]
    row = ButtonRow(bank_number=0, button_identifier="A", commands=commands)
    out = pack_button_row(row)
    assert len(out) == BYTES_PER_BUTTON_ROW
    # Every 4-byte chunk should be a populated CC
    for i in range(10):
        offset = i * BYTES_PER_COMMAND
        assert out[offset] == 0xB0
        assert out[offset + 1] == i


def test_pack_button_row_rejects_too_many_commands() -> None:
    """11+ commands is a programming error — the firmware can't store them."""
    row = ButtonRow(
        bank_number=0,
        button_identifier="1",
        commands=[CommandNone() for _ in range(11)],
    )
    with pytest.raises(ValueError, match="too many commands"):
        pack_button_row(row)


def test_pack_button_row_mixed_command_types() -> None:
    """A realistic preset: PC + CC + Start in slots A/B/C; rest empty."""
    row = ButtonRow(
        bank_number=0,
        button_identifier="1",
        commands=[
            CommandPC(channel=1, program=5),
            CommandCC(channel=1, number=80, on_value=127, off_value=0),
            CommandStart(),
        ],
    )
    out = pack_button_row(row)
    assert len(out) == BYTES_PER_BUTTON_ROW
    assert out[0] == 0xC0   # PC slot A
    assert out[4] == 0xB0   # CC slot B
    assert out[8] == 0x10   # Start slot C
    # Slots D-J are zero
    assert out[12:] == bytes(28)


# ---------------------------------------------------------------------------
# Multiple rows — pack_button_settings
# ---------------------------------------------------------------------------


def test_pack_button_settings_concatenates_rows() -> None:
    rows = [
        ButtonRow(bank_number=0, button_identifier="1", commands=[CommandCC(1, 1, 127)]),
        ButtonRow(bank_number=0, button_identifier="2", commands=[CommandCC(1, 2, 127)]),
    ]
    out = pack_button_settings(rows)
    assert len(out) == 2 * BYTES_PER_BUTTON_ROW
    assert out[0] == 0xB0   # first row's CC
    assert out[1] == 1
    assert out[BYTES_PER_BUTTON_ROW] == 0xB0   # second row's CC
    assert out[BYTES_PER_BUTTON_ROW + 1] == 2


def test_pack_button_settings_handles_empty_list() -> None:
    assert pack_button_settings([]) == b""


def test_pack_button_settings_full_bank() -> None:
    """8 buttons (1-4 + A-D) × 40 bytes = 320 bytes per bank."""
    rows = [
        ButtonRow(bank_number=0, button_identifier=str(i), commands=[])
        for i in range(1, 5)
    ] + [
        ButtonRow(bank_number=0, button_identifier=c, commands=[])
        for c in ("A", "B", "C", "D")
    ]
    out = pack_button_settings(rows)
    assert len(out) == 8 * BYTES_PER_BUTTON_ROW
    assert len(out) == 320


# ---------------------------------------------------------------------------
# Constants sanity
# ---------------------------------------------------------------------------


def test_constants_match_firmware_expectations() -> None:
    """Lock these in — if the firmware ever changes the slot count or
    byte count, these tests fail loudly so we know to bump.
    """
    assert NUM_COMMANDS_PER_BUTTON == 10
    assert BYTES_PER_COMMAND == 4
    assert BYTES_PER_BUTTON_ROW == 40
