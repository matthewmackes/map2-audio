"""T2459-H3-CFG Phase 3 slice 3 — SysEx framing + chunking + full sequence."""

from __future__ import annotations

import pytest

from app.services.devices.meloaudio.sysex_packer import (
    BankNaming,
    ButtonRow,
    CommandCC,
    CommanderConfig,
    GlobalSettings,
    SYSEX_CMD_ERASE_FLASH,
    SYSEX_CMD_RESET,
    SYSEX_CMD_WRITE_FLASH,
    SYSEX_END,
    SYSEX_MANUFACTURER_ID,
    SYSEX_START,
    SysExFrame,
    WRITE_FLASH_PAYLOAD_BYTES,
    build_erase_flash_frame,
    build_flash_image,
    build_full_sysex_sequence,
    build_reset_frame,
    build_write_flash_frames,
    pad_flash_image_to_chunks,
)


# ---------------------------------------------------------------------------
# Single-frame builders — ERASE / RESET
# ---------------------------------------------------------------------------


def test_erase_flash_frame_payload() -> None:
    """ERASE_FLASH = [0x7D, 52, 0x42, 0x24] (last two bytes are
    upstream's magic confirmation code).
    """
    frame = build_erase_flash_frame()
    assert frame.data_bytes == bytes([SYSEX_MANUFACTURER_ID, SYSEX_CMD_ERASE_FLASH, 0x42, 0x24])


def test_reset_frame_payload() -> None:
    """RESET is just [0x7D, 60] — no parameters."""
    frame = build_reset_frame()
    assert frame.data_bytes == bytes([SYSEX_MANUFACTURER_ID, SYSEX_CMD_RESET])


def test_sysex_frame_to_wire_adds_framing() -> None:
    """to_wire() wraps the payload in 0xF0 ... 0xF7."""
    frame = SysExFrame(data_bytes=bytes([0x01, 0x02, 0x03]))
    wire = frame.to_wire()
    assert wire[0] == SYSEX_START
    assert wire[-1] == SYSEX_END
    assert wire[1:-1] == bytes([0x01, 0x02, 0x03])


# ---------------------------------------------------------------------------
# Padding helper
# ---------------------------------------------------------------------------


def test_pad_flash_image_aligned_input_is_unchanged() -> None:
    aligned = b"X" * 32
    assert pad_flash_image_to_chunks(aligned) == aligned


def test_pad_flash_image_pads_to_16_byte_boundary() -> None:
    unaligned = b"X" * 17
    padded = pad_flash_image_to_chunks(unaligned)
    assert len(padded) == 32
    assert padded.startswith(b"X" * 17)
    assert padded[17:] == b"\x00" * 15


def test_pad_flash_image_custom_fill() -> None:
    padded = pad_flash_image_to_chunks(b"X" * 5, fill_byte=0xFF)
    assert padded == b"X" * 5 + b"\xff" * 11


def test_pad_flash_image_rejects_invalid_fill() -> None:
    with pytest.raises(ValueError):
        pad_flash_image_to_chunks(b"X", fill_byte=256)


# ---------------------------------------------------------------------------
# WRITE_FLASH chunking
# ---------------------------------------------------------------------------


def test_write_flash_rejects_unaligned_input() -> None:
    with pytest.raises(ValueError, match="multiple of 16"):
        build_write_flash_frames(b"X" * 17)


def test_write_flash_zero_bytes_is_zero_frames() -> None:
    """No flash image → no chunks → no frames. (build_full_sysex_sequence
    still emits ERASE + RESET around it.)
    """
    frames = build_write_flash_frames(b"")
    assert frames == []


def test_write_flash_one_chunk_frame_layout() -> None:
    """A 16-byte input emits exactly one frame; verify the byte layout.

    Each input byte expands to two nibble bytes. The chunk index is
    14-bit split into high/low. Header is [MANUF, WRITE_FLASH, hi, lo].
    """
    # Use a recognizable byte pattern: 0x12, 0x34, 0x56, ...
    payload = bytes([0x12 + i for i in range(WRITE_FLASH_PAYLOAD_BYTES)])
    frames = build_write_flash_frames(payload)
    assert len(frames) == 1
    body = frames[0].data_bytes
    # Header: manuf, cmd, chunk_hi=0, chunk_lo=0
    assert body[0] == SYSEX_MANUFACTURER_ID
    assert body[1] == SYSEX_CMD_WRITE_FLASH
    assert body[2] == 0   # chunk_high
    assert body[3] == 0   # chunk_low
    # Now 16 bytes of input → 32 nibble bytes
    assert len(body) == 4 + 32
    # First payload byte 0x12 → nibbles (0x1, 0x2)
    assert body[4] == 0x1
    assert body[5] == 0x2
    # Second 0x13 → (0x1, 0x3)
    assert body[6] == 0x1
    assert body[7] == 0x3


def test_write_flash_multiple_chunks_indexing() -> None:
    """3 chunks (48 bytes) → chunk indices 0, 1, 2 in successive frames."""
    payload = b"\x00" * 48
    frames = build_write_flash_frames(payload)
    assert len(frames) == 3
    for i, frame in enumerate(frames):
        body = frame.data_bytes
        assert body[2] == 0          # chunk_high stays at 0 for indices 0-127
        assert body[3] == i          # chunk_low advances


def test_write_flash_chunk_index_high_byte_kicks_in_at_128() -> None:
    """At chunk_idx=128 the high byte should become 1."""
    # 128 chunks * 16 bytes = 2048 bytes
    payload = b"\x00" * (129 * WRITE_FLASH_PAYLOAD_BYTES)
    frames = build_write_flash_frames(payload)
    assert len(frames) == 129
    # First frame: chunk_high=0, chunk_low=0
    assert frames[0].data_bytes[2] == 0
    assert frames[0].data_bytes[3] == 0
    # 128th frame (index 127): chunk_high=0, chunk_low=127
    assert frames[127].data_bytes[2] == 0
    assert frames[127].data_bytes[3] == 127
    # 129th frame (index 128): chunk_high=1, chunk_low=0
    assert frames[128].data_bytes[2] == 1
    assert frames[128].data_bytes[3] == 0


def test_write_flash_nibble_split_handles_full_byte_range() -> None:
    """0x00..0xFF all split correctly. Especially 0xFF → (0xF, 0xF)."""
    payload = bytes([0x00, 0xFF, 0x80, 0x7F] + [0] * 12)
    frame = build_write_flash_frames(payload)[0]
    body = frame.data_bytes
    # 0x00 → (0x0, 0x0)
    assert body[4] == 0
    assert body[5] == 0
    # 0xFF → (0xF, 0xF)
    assert body[6] == 0xF
    assert body[7] == 0xF
    # 0x80 → (0x8, 0x0)
    assert body[8] == 0x8
    assert body[9] == 0x0
    # 0x7F → (0x7, 0xF)
    assert body[10] == 0x7
    assert body[11] == 0xF


def test_write_flash_descriptions_label_each_chunk() -> None:
    """Descriptions help the SysEx writer log progress per chunk."""
    payload = b"\x00" * 32
    frames = build_write_flash_frames(payload)
    assert "chunk 0" in frames[0].description
    assert "chunk 1" in frames[1].description


# ---------------------------------------------------------------------------
# build_flash_image — full image assembly
# ---------------------------------------------------------------------------


def test_build_flash_image_concatenates_three_regions() -> None:
    """Image = global (32) + bank-table + button-rows."""
    config = CommanderConfig(
        global_settings=GlobalSettings(midi_channel=1, realtime_passthrough=False, config_name="X"),
        banks=[BankNaming(bank_number=0, large_name="A", small_info="B")],
        button_rows=[
            ButtonRow(bank_number=0, button_identifier="1", commands=[CommandCC(1, 1, 127)])
        ],
    )
    image = build_flash_image(config)
    # Global = 32 bytes, banks = 12, buttons = 40
    assert len(image) == 32 + 12 + 40


def test_build_flash_image_empty_banks_and_buttons() -> None:
    """Minimal config: just global settings, no banks, no buttons."""
    config = CommanderConfig(
        global_settings=GlobalSettings(midi_channel=1, realtime_passthrough=False, config_name="X"),
        banks=[],
        button_rows=[],
    )
    image = build_flash_image(config)
    assert len(image) == 32   # global only


# ---------------------------------------------------------------------------
# build_full_sysex_sequence — end-to-end pipeline
# ---------------------------------------------------------------------------


def test_full_sysex_sequence_starts_with_erase_ends_with_reset() -> None:
    config = CommanderConfig(
        global_settings=GlobalSettings(midi_channel=1, realtime_passthrough=False, config_name="X"),
        banks=[],
        button_rows=[],
    )
    frames = build_full_sysex_sequence(config)
    # First frame is ERASE_FLASH
    assert frames[0].data_bytes[1] == SYSEX_CMD_ERASE_FLASH
    # Last frame is RESET
    assert frames[-1].data_bytes[1] == SYSEX_CMD_RESET


def test_full_sysex_sequence_has_write_chunks_in_middle() -> None:
    """A minimal 32-byte config (just global settings) → 2 WRITE_FLASH chunks."""
    config = CommanderConfig(
        global_settings=GlobalSettings(midi_channel=1, realtime_passthrough=False, config_name="X"),
        banks=[],
        button_rows=[],
    )
    frames = build_full_sysex_sequence(config)
    # ERASE + 2 WRITE + RESET = 4 frames
    assert len(frames) == 4
    write_frames = frames[1:-1]
    for f in write_frames:
        assert f.data_bytes[1] == SYSEX_CMD_WRITE_FLASH


def test_full_sysex_sequence_pads_unaligned_image() -> None:
    """Even if the image isn't a multiple of 16 bytes, padding kicks in
    so every chunk is full and the firmware doesn't get a partial row.
    """
    # 4 banks × 12 = 48 bytes (aligned)
    # Add buttons to make it unaligned: 1 button × 40 = 40 bytes total
    # Global 32 + banks 48 + buttons 40 = 120 bytes (not multiple of 16)
    config = CommanderConfig(
        global_settings=GlobalSettings(midi_channel=1, realtime_passthrough=False, config_name="X"),
        banks=[BankNaming(bank_number=i) for i in range(4)],
        button_rows=[
            ButtonRow(bank_number=0, button_identifier="1", commands=[CommandCC(1, 1, 127)]),
        ],
    )
    image = build_flash_image(config)
    assert len(image) == 120
    assert len(image) % 16 == 8   # confirm unaligned
    # Now the full sequence should have padded it
    frames = build_full_sysex_sequence(config)
    write_frames = [f for f in frames if f.data_bytes[1] == SYSEX_CMD_WRITE_FLASH]
    # 120 padded to 128 = 8 chunks
    assert len(write_frames) == 8


def test_full_sysex_sequence_realistic_canonical_config() -> None:
    """A realistic MAP2-canonical config: 1 bank, 8 buttons each with
    one CC command. Verify the full sequence has expected size.
    """
    button_rows = []
    # Top 1-4 → CC 80, 81, 82, 14 (the design-intent canonical mapping)
    for i, cc_num in enumerate([80, 81, 82, 14], start=1):
        button_rows.append(ButtonRow(
            bank_number=0,
            button_identifier=str(i),
            commands=[CommandCC(channel=1, number=cc_num, on_value=127, off_value=0, toggle=True)],
        ))
    # Bottom A-D → PC 0-3
    from app.services.devices.meloaudio.sysex_packer import CommandPC
    for i, pc_num in enumerate(range(4)):
        button_rows.append(ButtonRow(
            bank_number=0,
            button_identifier="ABCD"[i],
            commands=[CommandPC(channel=1, program=pc_num)],
        ))

    config = CommanderConfig(
        global_settings=GlobalSettings(
            midi_channel=1, realtime_passthrough=False, config_name="MAP2 Canonical"
        ),
        banks=[BankNaming(bank_number=0, large_name="MAP2", small_info="Default")],
        button_rows=button_rows,
    )
    frames = build_full_sysex_sequence(config)
    # ERASE + N × WRITE + RESET; the exact N depends on payload size
    assert frames[0].data_bytes[1] == SYSEX_CMD_ERASE_FLASH
    assert frames[-1].data_bytes[1] == SYSEX_CMD_RESET
    # All middle frames are WRITE_FLASH
    for f in frames[1:-1]:
        assert f.data_bytes[1] == SYSEX_CMD_WRITE_FLASH


def test_sysex_to_wire_round_trip_no_invalid_data_bytes() -> None:
    """Critical: every byte between SYSEX_START and SYSEX_END must be
    7-bit clean (< 0x80). The nibble-split encoding guarantees this
    for the WRITE_FLASH payload; verify it holds for the full wire
    output of a realistic config.
    """
    config = CommanderConfig(
        global_settings=GlobalSettings(midi_channel=1, realtime_passthrough=False, config_name="X"),
        banks=[BankNaming(bank_number=0)],
        button_rows=[
            ButtonRow(
                bank_number=0,
                button_identifier="1",
                commands=[CommandCC(channel=1, number=80, on_value=127, off_value=200, toggle=True)],
            ),
        ],
    )
    frames = build_full_sysex_sequence(config)
    for frame in frames:
        wire = frame.to_wire()
        assert wire[0] == SYSEX_START
        assert wire[-1] == SYSEX_END
        # Every data byte (between framing) must be < 0x80
        for i, b in enumerate(wire[1:-1]):
            assert b < 0x80, (
                f"frame {frame.description}: byte {i} = 0x{b:02X} "
                f"violates SysEx 7-bit-clean rule"
            )


def test_write_flash_rejects_too_many_chunks() -> None:
    """Past 16383 chunks (256 KiB) the 14-bit chunk index overflows."""
    # We can't realistically build 256 KiB of bytes here, so just call
    # the chunker with a huge aligned image's worth of zeros.
    # 16384 chunks * 16 bytes = 262144 bytes
    overlarge = b"\x00" * (16384 * WRITE_FLASH_PAYLOAD_BYTES)
    with pytest.raises(ValueError, match="firmware addressing supports max"):
        build_write_flash_frames(overlarge)
