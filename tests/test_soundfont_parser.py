import struct

from app.services.soundfont_parser import parse_soundfont_presets, summarize_soundfont


def _phdr_record(name: str, preset: int, bank: int) -> bytes:
    encoded = name.encode("latin-1")[:20]
    encoded = encoded + (b"\x00" * (20 - len(encoded)))
    return struct.pack("<20sHHHIII", encoded, preset, bank, 0, 0, 0, 0)


def _build_minimal_sf2() -> bytes:
    phdr = b"".join(
        [
            _phdr_record("Concert Grand", 0, 0),
            _phdr_record("Warm Pad", 89, 1),
            _phdr_record("EOP", 0, 0),
        ]
    )
    phdr_chunk = b"phdr" + struct.pack("<I", len(phdr)) + phdr
    pdta_payload = b"pdta" + phdr_chunk
    list_chunk = b"LIST" + struct.pack("<I", len(pdta_payload)) + pdta_payload
    riff_size = 4 + len(list_chunk)
    return b"RIFF" + struct.pack("<I", riff_size) + b"sfbk" + list_chunk


def test_parse_soundfont_presets_reads_bank_program_headers(tmp_path):
    soundfont = tmp_path / "test.sf2"
    soundfont.write_bytes(_build_minimal_sf2())

    presets = parse_soundfont_presets(str(soundfont))

    assert presets == [
        {
            "name": "Concert Grand",
            "bank": 0,
            "program": 0,
            "library": 0,
            "genre": 0,
            "morphology": 0,
        },
        {
            "name": "Warm Pad",
            "bank": 1,
            "program": 89,
            "library": 0,
            "genre": 0,
            "morphology": 0,
        },
    ]


def test_summarize_soundfont_reports_banks_and_preview(tmp_path):
    soundfont = tmp_path / "preview.sf3"
    soundfont.write_bytes(_build_minimal_sf2())

    summary = summarize_soundfont(str(soundfont))

    assert summary["preset_count"] == 2
    assert summary["banks"] == [0, 1]
    assert summary["programs_preview"][0]["name"] == "Concert Grand"
