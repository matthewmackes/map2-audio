#!/usr/bin/env python3

"""Import a Rolling Stone-derived list (user-provided CSV) into a MAP2 practice songbook pack.

Why this script exists
- Rolling Stone list pages are often paywalled/blocked for automated fetch.
- Rolling Stone rankings/curation may be a copyrighted compilation.
- MAP2 should not ship Rolling Stone's list content in the repo.

Workflow
1) You (the user) export a Rolling Stone list to CSV (manually).
2) Fill the CSV using the template at: data/drums/templates/rollingstone_songbook_template.csv
3) Run this script to generate a local songbook JSON under: data/drums/generated/

The output is a style-based practice songbook: it references MAP2 practice style IDs and section layouts.
It does NOT create song-exact MIDI transcriptions.

"""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


ALLOWED_STYLE_IDS = {
    "rock_8",
    "rock_16",
    "shuffle_blues",
    "funk_16",
    "metal_doublekick",
    "pop_4onfloor",
    "jazz_swing",
    "reggae_1drop",
}

ALLOWED_SECTION_NAMES = {
    "intro",
    "verse",
    "prechorus",
    "chorus",
    "bridge",
    "solo",
    "breakdown",
    "outro",
}


@dataclass(frozen=True)
class CsvRow:
    rank: int
    title: str
    artist: str
    year: int
    guitar_focus: bool
    style_id: str
    feel: str
    default_bpm: float
    bpm_min: float
    bpm_max: float
    time_signature: str
    variation_default: float
    sections: str
    tags: str


def _parse_bool(value: str) -> bool:
    value = (value or "").strip().lower()
    return value in {"1", "true", "yes", "y", "t"}


def _parse_sections(sections: str) -> List[Dict]:
    """Parse: intro:4,verse:8,chorus:8 into [{name,bars},..]."""
    result: List[Dict] = []
    if not sections or not sections.strip():
        raise ValueError("sections is required")

    for chunk in sections.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if ":" not in chunk:
            raise ValueError(f"Invalid sections item '{chunk}' (expected name:bars)")
        name, bars_s = chunk.split(":", 1)
        name = name.strip().lower()
        if name not in ALLOWED_SECTION_NAMES:
            raise ValueError(f"Invalid section name '{name}'")
        try:
            bars = int(bars_s.strip())
        except ValueError as e:
            raise ValueError(f"Invalid bars '{bars_s}' for section '{name}'") from e
        if bars < 1 or bars > 64:
            raise ValueError(f"Bars out of range for section '{name}': {bars}")
        result.append({"name": name, "bars": bars})

    if not result:
        raise ValueError("sections parsed to empty")

    return result


def _normalize_tags(tags: str) -> List[str]:
    parts = [p.strip() for p in re.split(r"[;|,]", tags or "") if p.strip()]
    # ensure guitar tag
    if "guitar" not in {p.lower() for p in parts}:
        parts.insert(0, "guitar")
    # de-dupe preserving order
    seen = set()
    out: List[str] = []
    for p in parts:
        key = p.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def _safe_id(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text or "entry"


def read_csv(path: Path) -> List[CsvRow]:
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        required = {
            "rank",
            "title",
            "artist",
            "year",
            "guitar_focus",
            "style_id",
            "feel",
            "default_bpm",
            "bpm_min",
            "bpm_max",
            "time_signature",
            "variation_default",
            "sections",
            "tags",
        }
        missing = required - set((reader.fieldnames or []))
        if missing:
            raise SystemExit(f"Missing required CSV columns: {sorted(missing)}")

        rows: List[CsvRow] = []
        for raw in reader:
            rows.append(
                CsvRow(
                    rank=int(raw["rank"]),
                    title=str(raw["title"]).strip(),
                    artist=str(raw["artist"]).strip(),
                    year=int(raw["year"]),
                    guitar_focus=_parse_bool(raw["guitar_focus"]),
                    style_id=str(raw["style_id"]).strip(),
                    feel=str(raw["feel"]).strip() or "straight",
                    default_bpm=float(raw["default_bpm"]),
                    bpm_min=float(raw["bpm_min"]),
                    bpm_max=float(raw["bpm_max"]),
                    time_signature=str(raw["time_signature"]).strip() or "4/4",
                    variation_default=float(raw["variation_default"]),
                    sections=str(raw["sections"]).strip(),
                    tags=str(raw["tags"]).strip(),
                )
            )

    return rows


def build_songbook(rows: List[CsvRow], *, year_min: int, year_max: int, limit: int) -> Dict:
    filtered = [r for r in rows if year_min <= r.year <= year_max and r.guitar_focus]
    filtered.sort(key=lambda r: r.rank)
    filtered = filtered[:limit]

    entries: List[Dict] = []
    for r in filtered:
        if r.style_id not in ALLOWED_STYLE_IDS:
            raise SystemExit(f"Invalid style_id '{r.style_id}' for rank {r.rank}. Allowed: {sorted(ALLOWED_STYLE_IDS)}")

        if r.bpm_min > r.bpm_max:
            raise SystemExit(f"Invalid bpm range for rank {r.rank}: {r.bpm_min}..{r.bpm_max}")

        if not (20 <= r.default_bpm <= 300):
            raise SystemExit(f"default_bpm out of range for rank {r.rank}: {r.default_bpm}")

        sections = _parse_sections(r.sections)
        tags = _normalize_tags(r.tags)

        # Local ID stable by rank
        entry_id = f"rs_{r.rank:03d}_{_safe_id(r.title)[:24]}"

        entries.append(
            {
                "id": entry_id,
                "name": f"{r.title} — {r.artist}",
                "year_range": [r.year, r.year],
                "default_bpm": r.default_bpm,
                "bpm_range": [r.bpm_min, r.bpm_max],
                "time_signature": r.time_signature,
                "feel": r.feel,
                "style_id": r.style_id,
                "variation_default": r.variation_default,
                "sections": sections,
                "tags": tags,
            }
        )

    pack = {
        "pack_id": f"rolling_stone_guitar_practice_{year_min}_{year_max}",
        "name": f"Rolling Stone Guitar Practice ({year_min}–{year_max})",
        "version": 1,
        "description": "Imported songbook mapping entries to MAP2 practice styles and section layouts. Generated from a user-provided Rolling Stone list export.",
        "license": "user-provided",
        "source": "rollingstone (user import)",
        "entries": entries,
    }

    return pack


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path, help="Path to a user-prepared CSV export")
    parser.add_argument("--output", default=Path("data/drums/generated/rollingstone_songbook.json"), type=Path)
    parser.add_argument("--year-min", default=1965, type=int)
    parser.add_argument("--year-max", default=1990, type=int)
    parser.add_argument("--limit", default=100, type=int)
    args = parser.parse_args()

    rows = read_csv(args.input)
    pack = build_songbook(rows, year_min=args.year_min, year_max=args.year_max, limit=args.limit)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(pack, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Wrote {len(pack['entries'])} entries to: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
