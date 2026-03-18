from __future__ import annotations

from dataclasses import asdict, dataclass
import struct
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Tuple


PHDR_RECORD_SIZE = 38


@dataclass(frozen=True)
class SoundFontPreset:
    name: str
    bank: int
    program: int
    library: int
    genre: int
    morphology: int


def _clean_name(raw_name: bytes) -> str:
    return raw_name.split(b"\x00", 1)[0].decode("latin-1", errors="ignore").strip() or "Unnamed Preset"


def _iter_chunks(blob: bytes, offset: int = 0, limit: Optional[int] = None):
    end = len(blob) if limit is None else min(len(blob), offset + limit)
    cursor = offset

    while cursor + 8 <= end:
        chunk_id = blob[cursor:cursor + 4]
        chunk_size = struct.unpack_from("<I", blob, cursor + 4)[0]
        data_start = cursor + 8
        data_end = min(data_start + chunk_size, len(blob))
        yield chunk_id, data_start, data_end
        cursor = data_end + (chunk_size % 2)


def _find_pdta_chunk(blob: bytes) -> Optional[Tuple[int, int]]:
    if len(blob) < 12 or blob[0:4] != b"RIFF" or blob[8:12] != b"sfbk":
        return None

    for chunk_id, data_start, data_end in _iter_chunks(blob, 12):
        if chunk_id != b"LIST" or data_end - data_start < 4:
            continue
        list_type = blob[data_start:data_start + 4]
        if list_type == b"pdta":
            return data_start + 4, data_end
    return None


def _parse_presets_from_blob(blob: bytes) -> List[SoundFontPreset]:
    pdta_bounds = _find_pdta_chunk(blob)
    if pdta_bounds is None:
        raise ValueError("SoundFont preset data chunk (pdta) not found")

    pdta_start, pdta_end = pdta_bounds
    phdr_data = None
    for chunk_id, data_start, data_end in _iter_chunks(blob, pdta_start, pdta_end - pdta_start):
        if chunk_id == b"phdr":
            phdr_data = blob[data_start:data_end]
            break

    if phdr_data is None or len(phdr_data) < PHDR_RECORD_SIZE * 2:
        raise ValueError("SoundFont preset header table is missing or incomplete")

    presets: List[SoundFontPreset] = []
    record_count = len(phdr_data) // PHDR_RECORD_SIZE
    for index in range(max(0, record_count - 1)):
        record = phdr_data[index * PHDR_RECORD_SIZE:(index + 1) * PHDR_RECORD_SIZE]
        name, program, bank, _bag_index, library, genre, morphology = struct.unpack("<20sHHHIII", record)
        presets.append(
            SoundFontPreset(
                name=_clean_name(name),
                bank=int(bank),
                program=int(program),
                library=int(library),
                genre=int(genre),
                morphology=int(morphology),
            )
        )

    presets.sort(key=lambda preset: (preset.bank, preset.program, preset.name.lower()))
    return presets


@lru_cache(maxsize=256)
def _parse_cached(path: str, mtime_ns: int, size: int) -> Tuple[SoundFontPreset, ...]:
    del mtime_ns, size
    blob = Path(path).read_bytes()
    return tuple(_parse_presets_from_blob(blob))


def parse_soundfont_presets(path: str) -> List[Dict[str, int | str]]:
    file_path = Path(path).expanduser().resolve()
    if not file_path.exists() or not file_path.is_file():
        raise FileNotFoundError(f"SoundFont not found: {file_path}")

    extension = file_path.suffix.lower()
    if extension not in {".sf2", ".sf3"}:
        raise ValueError("Only .sf2 and .sf3 files are supported")

    stat_result = file_path.stat()
    presets = _parse_cached(str(file_path), int(stat_result.st_mtime_ns), int(stat_result.st_size))
    return [asdict(preset) for preset in presets]


def summarize_soundfont(path: str) -> Dict[str, object]:
    presets = parse_soundfont_presets(path)
    banks = sorted({int(preset["bank"]) for preset in presets})
    preview = presets[:8]
    return {
        "preset_count": len(presets),
        "banks": banks,
        "programs_preview": preview,
    }


def attach_soundfont_summaries(items: List[Dict[str, object]]) -> List[Dict[str, object]]:
    enriched: List[Dict[str, object]] = []
    for item in items:
        next_item = dict(item)
        path = str(item.get("path") or "")
        extension = Path(path).suffix.lower()
        if extension in {".sf2", ".sf3"}:
            try:
                next_item.update(summarize_soundfont(path))
            except (FileNotFoundError, OSError, ValueError):
                next_item.setdefault("preset_count", 0)
                next_item.setdefault("banks", [])
                next_item.setdefault("programs_preview", [])
        enriched.append(next_item)
    return enriched
