"""
Tests for IntelFX binary SysEx parser.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.intelfx_syx_parser import IntelFXSyxParser, deduplicate_programs


def _build_intelfx_frame(
    *,
    name: str = "Test Program",
    program_number: int = 0,
    device_id: int = 0x00,
    msg_type: int = 0x03,
    extra_data: bytes = b"\x00\x01\x02\x03",
) -> bytes:
    """Build a minimal valid Rocktron IntelFX SysEx frame for tests."""
    program = max(0, min(255, int(program_number)))
    prog_hi = (program >> 7) & 0x7F
    prog_lo = program & 0x7F
    name_bytes = name.encode("ascii", errors="replace")[:16].ljust(16, b" ")

    body = bytes(
        [
            0xF0,
            0x00,
            0x01,
            0x56,
            device_id & 0x7F,
            msg_type & 0x7F,
            prog_hi,
            prog_lo,
        ]
    ) + name_bytes + extra_data

    checksum = 0
    for byte in body[1:]:
        checksum ^= byte
    checksum &= 0x7F
    return body + bytes([checksum, 0xF7])


def test_parse_single_frame_extracts_name_and_program() -> None:
    parser = IntelFXSyxParser()
    frame = _build_intelfx_frame(name="Clean Chorus", program_number=42)
    programs = parser.parse_bytes(frame)
    assert len(programs) == 1
    assert programs[0].name == "Clean Chorus"
    assert programs[0].program_number == 42


def test_parse_multiple_frames() -> None:
    parser = IntelFXSyxParser()
    data = (
        _build_intelfx_frame(name="A", program_number=1)
        + _build_intelfx_frame(name="B", program_number=2)
        + _build_intelfx_frame(name="C", program_number=3)
    )
    programs = parser.parse_bytes(data)
    assert [program.name for program in programs] == ["A", "B", "C"]
    assert [program.program_number for program in programs] == [1, 2, 3]


def test_skips_non_rocktron_frames() -> None:
    parser = IntelFXSyxParser()
    # Roland-like foreign manufacturer ID
    foreign = bytes([0xF0, 0x41, 0x00, 0x00] + [0x00] * 24 + [0x00, 0xF7])
    data = foreign + _build_intelfx_frame(name="Rocktron", program_number=10)
    programs = parser.parse_bytes(data)
    assert len(programs) == 1
    assert programs[0].name == "Rocktron"


def test_program_number_high_low_byte_decode() -> None:
    parser = IntelFXSyxParser()
    frame = _build_intelfx_frame(name="HiLo", program_number=200)
    programs = parser.parse_bytes(frame)
    assert len(programs) == 1
    assert programs[0].program_number == 200


def test_auto_tagging_and_dedup() -> None:
    parser = IntelFXSyxParser()
    tags = parser.auto_tag_from_name("Plate Plate Reverb Delay")
    assert "plate" in tags
    assert "reverb" in tags
    assert "delay" in tags
    assert tags.count("plate") == 1


def test_verify_checksum_true_then_false_after_mutation() -> None:
    parser = IntelFXSyxParser()
    frame = _build_intelfx_frame(name="Checksum", program_number=7)
    assert parser.verify_checksum(frame) is True

    mutated = bytearray(frame)
    mutated[10] ^= 0x01  # corrupt one byte in payload
    assert parser.verify_checksum(bytes(mutated)) is False


def test_deduplicate_programs_uses_checksum() -> None:
    parser = IntelFXSyxParser()
    frame = _build_intelfx_frame(name="Dup", program_number=11)
    programs = parser.parse_bytes(frame + frame)
    assert len(programs) == 2
    deduped = deduplicate_programs(programs)
    assert len(deduped) == 1


def test_parse_file_sets_source_file(tmp_path: Path) -> None:
    parser = IntelFXSyxParser()
    frame = _build_intelfx_frame(name="FromFile", program_number=5)
    syx_path = tmp_path / "bank.syx"
    syx_path.write_bytes(frame)

    programs = parser.parse_file(syx_path)
    assert len(programs) == 1
    assert programs[0].source_file == str(syx_path)


@pytest.mark.parametrize(
    "program_number",
    [0, 1, 2, 7, 15, 31, 63, 64, 65, 96, 127, 128, 129, 192, 200, 223, 254, 255],
)
def test_program_number_decode_matrix(program_number: int) -> None:
    parser = IntelFXSyxParser()
    frame = _build_intelfx_frame(name=f"P{program_number:03d}", program_number=program_number)
    programs = parser.parse_bytes(frame)
    assert len(programs) == 1
    assert programs[0].program_number == program_number


@pytest.mark.parametrize(
    ("name", "expected_tag"),
    [
        ("Metal Gate", "gate"),
        ("Tape Echo", "echo"),
        ("Wide Chorus", "chorus"),
        ("Deep Flange", "flanger"),
        ("Classic Phase", "phaser"),
        ("Hall Reverb", "reverb"),
        ("Plate Verb", "plate"),
        ("Ambient Shimmer", "ambient"),
        ("Octave Lead", "pitch"),
        ("Studio Wah", "wah"),
        ("Tremolo Pulse", "tremolo"),
        ("Compressor Glue", "compressor"),
        ("Noise Hush", "hush"),
        ("Bass Crunch", "bass"),
        ("Vocal Room", "vocal"),
    ],
)
def test_auto_tag_matrix(name: str, expected_tag: str) -> None:
    parser = IntelFXSyxParser()
    tags = parser.auto_tag_from_name(name)
    assert expected_tag in tags


@pytest.mark.parametrize(
    ("program_number", "override_program"),
    [
        (0, 12),
        (1, 77),
        (7, 4),
        (15, 99),
        (63, 127),
        (127, 3),
        (128, 5),
        (255, 200),
    ],
)
def test_to_library_entry_override_matrix(program_number: int, override_program: int) -> None:
    parser = IntelFXSyxParser()
    frame = _build_intelfx_frame(name="Override", program_number=program_number)
    programs = parser.parse_bytes(frame)
    entry = programs[0].to_library_entry(override_program=override_program)
    assert entry["program"] == override_program
    assert entry["name"]
    assert isinstance(entry["tags"], list)
