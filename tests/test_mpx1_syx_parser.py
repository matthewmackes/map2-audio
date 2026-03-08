"""
Tests for the MPX-1 binary SysEx parser (T037).
"""

from __future__ import annotations

import struct
from pathlib import Path

import pytest

from app.services.mpx1_syx_parser import MPX1SyxParser, SyxProgram, deduplicate_programs


_LEXICON_ID = 0x06


def _build_syx_frame(
    name: str = "Test Program",
    program_number: int = 0,
    extra_data: bytes = b"\x00" * 20,
    name_offset: int = 2,
) -> bytes:
    """Build a minimal valid Lexicon-style SysEx frame for test purposes."""
    # Header: F0 <mfr_id=06> <model=00> <program_number>
    header = bytes([0xF0, _LEXICON_ID, 0x00, program_number & 0x7F])
    # Padding before name
    pre = bytes([0x00] * name_offset)
    # Name padded/truncated to 12 bytes
    name_bytes = name.encode("ascii", errors="replace")[:12].ljust(12, b" ")
    payload = pre + name_bytes + extra_data
    return header + payload + bytes([0xF7])


def _build_bank(programs: list[tuple[str, int]]) -> bytes:
    """Build multiple SysEx frames concatenated."""
    frames = b""
    for name, prog_num in programs:
        frames += _build_syx_frame(name=name, program_number=prog_num)
    return frames


# ---------------------------------------------------------------------------
# Frame splitting
# ---------------------------------------------------------------------------

class TestFrameSplitting:
    def test_single_frame(self) -> None:
        parser = MPX1SyxParser()
        frame = _build_syx_frame()
        programs = parser.parse_bytes(frame)
        assert len(programs) == 1

    def test_multiple_frames(self) -> None:
        parser = MPX1SyxParser()
        data = _build_bank([("Vocal Hall", 0), ("Plate Rev", 1), ("Delay Echo", 2)])
        programs = parser.parse_bytes(data)
        assert len(programs) == 3

    def test_skips_non_lexicon_frames(self) -> None:
        parser = MPX1SyxParser()
        # A generic SysEx frame with manufacturer ID 0x41 (Roland)
        foreign = bytes([0xF0, 0x41, 0x00, 0x00] + [0x00] * 20 + [0xF7])
        data = foreign + _build_syx_frame("My Reverb", 0)
        programs = parser.parse_bytes(data)
        # Only the Lexicon frame should be parsed
        assert len(programs) == 1

    def test_skips_frames_too_short(self) -> None:
        parser = MPX1SyxParser()
        tiny = bytes([0xF0, _LEXICON_ID, 0x00, 0x00, 0xF7])  # Only 5 bytes → too short
        programs = parser.parse_bytes(tiny)
        assert len(programs) == 0


# ---------------------------------------------------------------------------
# Name extraction
# ---------------------------------------------------------------------------

class TestNameExtraction:
    def test_name_extracted_correctly(self) -> None:
        parser = MPX1SyxParser()
        frame = _build_syx_frame(name="Vocal Hall  ", name_offset=2)
        programs = parser.parse_bytes(frame)
        assert len(programs) == 1
        assert programs[0].name == "Vocal Hall"

    def test_name_stripped_of_trailing_spaces(self) -> None:
        parser = MPX1SyxParser()
        # Use name_offset=2 (parser's preferred offset) so "Room" lands at offset 2
        frame = _build_syx_frame(name="Room      ", name_offset=2)
        programs = parser.parse_bytes(frame)
        assert programs[0].name == "Room"

    def test_non_printable_name_falls_back(self) -> None:
        """If extracted bytes are not printable ASCII, name should be a fallback."""
        parser = MPX1SyxParser()
        # Build a frame with garbage in the name field
        header = bytes([0xF0, _LEXICON_ID, 0x00, 0x05])
        payload = bytes([0x01, 0x02, 0x80, 0xFF] * 10)  # Non-ASCII
        frame = header + payload + bytes([0xF7])
        programs = parser.parse_bytes(frame)
        if programs:
            # Name should be a fallback string, not raise
            assert isinstance(programs[0].name, str)


# ---------------------------------------------------------------------------
# Program number extraction
# ---------------------------------------------------------------------------

class TestProgramNumberExtraction:
    def test_program_number_from_header(self) -> None:
        parser = MPX1SyxParser()
        frame = _build_syx_frame(name="Delay Echo", program_number=42)
        programs = parser.parse_bytes(frame)
        assert len(programs) == 1
        # Program number is byte[3] of the header (0x2A = 42)
        assert programs[0].program_number == 42

    def test_bank_programs_numbered_sequentially(self) -> None:
        parser = MPX1SyxParser()
        data = _build_bank([("A", 0), ("B", 1), ("C", 2)])
        programs = parser.parse_bytes(data)
        numbers = [p.program_number for p in programs]
        assert numbers == [0, 1, 2]


# ---------------------------------------------------------------------------
# Auto-tagging
# ---------------------------------------------------------------------------

class TestAutoTagging:
    def test_vocal_hall_gets_vocal_and_reverb_tags(self) -> None:
        parser = MPX1SyxParser()
        frame = _build_syx_frame(name="Vocal Hall  ")
        programs = parser.parse_bytes(frame)
        tags = programs[0].auto_tags
        assert "vocal" in tags
        assert "hall" in tags
        assert "reverb" in tags

    def test_plate_reverb_gets_plate_and_reverb(self) -> None:
        parser = MPX1SyxParser()
        tags = parser.auto_tag_from_name("Studio Plate A")
        assert "plate" in tags
        assert "reverb" in tags

    def test_delay_echo_tags(self) -> None:
        parser = MPX1SyxParser()
        tags = parser.auto_tag_from_name("Stereo Tape Echo")
        assert "echo" in tags or "delay" in tags

    def test_chorus_flange_tags(self) -> None:
        parser = MPX1SyxParser()
        tags = parser.auto_tag_from_name("Wide Flange Chorus")
        assert "chorus" in tags
        assert "flange" in tags

    def test_no_match_returns_empty(self) -> None:
        parser = MPX1SyxParser()
        tags = parser.auto_tag_from_name("Zzzz Qqq Xxx")
        assert tags == []

    def test_tags_are_deduplicated(self) -> None:
        parser = MPX1SyxParser()
        # "Plate Plate" should not produce two "plate" tags
        tags = parser.auto_tag_from_name("Plate Plate")
        assert tags.count("plate") == 1


# ---------------------------------------------------------------------------
# Duplicate detection
# ---------------------------------------------------------------------------

class TestDeduplication:
    def test_identical_frames_deduplicated(self) -> None:
        frame = _build_syx_frame("Same Program", 0)
        parser = MPX1SyxParser()
        programs = parser.parse_bytes(frame + frame)
        # Without dedup: 2 programs
        deduped = deduplicate_programs(programs)
        assert len(deduped) == 1

    def test_different_frames_not_deduplicated(self) -> None:
        parser = MPX1SyxParser()
        data = _build_bank([("A Rev", 0), ("B Delay", 1)])
        programs = parser.parse_bytes(data)
        deduped = deduplicate_programs(programs)
        assert len(deduped) == 2


# ---------------------------------------------------------------------------
# to_library_entry
# ---------------------------------------------------------------------------

class TestToLibraryEntry:
    def test_entry_has_required_fields(self) -> None:
        frame = _build_syx_frame("My Program  ", program_number=5)
        parser = MPX1SyxParser()
        programs = parser.parse_bytes(frame)
        assert programs
        entry = programs[0].to_library_entry()
        assert "program" in entry
        assert "name" in entry
        assert "tags" in entry
        assert "syx_blob" in entry
        assert "checksum" in entry

    def test_entry_override_program_number(self) -> None:
        frame = _build_syx_frame("My Program  ", program_number=0)
        parser = MPX1SyxParser()
        programs = parser.parse_bytes(frame)
        entry = programs[0].to_library_entry(override_program=99)
        assert entry["program"] == 99

    def test_syx_blob_is_hex_string(self) -> None:
        frame = _build_syx_frame("Hex Test    ", program_number=0)
        parser = MPX1SyxParser()
        programs = parser.parse_bytes(frame)
        blob = programs[0].to_library_entry()["syx_blob"]
        assert isinstance(blob, str)
        # Must be valid hex
        bytes.fromhex(blob)

    def test_checksum_is_stable(self) -> None:
        frame = _build_syx_frame("Stable Check", program_number=0)
        parser = MPX1SyxParser()
        programs1 = parser.parse_bytes(frame)
        programs2 = parser.parse_bytes(frame)
        assert programs1[0].checksum_hex == programs2[0].checksum_hex
