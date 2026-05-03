#!/usr/bin/env python3
"""
T2492-1 — Build the Mixxx controller lookup index for the device-pack
auto-generator.

Walks `device-packs/_mixx-imports/res/controllers/` and parses every
`.hid.xml` + `.bulk.xml` file (those declare USB VID:PID in the
`<info><devices><product>` block). The 144 `.midi.xml` files are
skipped because Mixxx's MIDI XMLs don't carry VID:PID — operators
will need name-string lookup or "generate from scratch" for those
devices, per the locked T2492 Q4=A decision (VID:PID exact match
only).

Output: `device-packs/_lookup-index/mixxx-controllers.json`.

Usage:
  python3 scripts/build_mixxx_lookup_index.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
MIXXX_DIR = REPO_ROOT / "device-packs" / "_mixx-imports" / "res" / "controllers"
MIXXX_MANIFEST = REPO_ROOT / "device-packs" / "_mixx-imports" / "MANIFEST.yaml"
INDEX_DIR = REPO_ROOT / "device-packs" / "_lookup-index"
INDEX_OUT = INDEX_DIR / "mixxx-controllers.json"


def _read_manifest_commit() -> str:
    if not MIXXX_MANIFEST.is_file():
        return "unknown"
    for line in MIXXX_MANIFEST.read_text().splitlines():
        line = line.strip()
        if line.startswith("upstream_commit:"):
            return line.split(":", 1)[1].strip()
    return "unknown"


def _normalize_hex(value: str | None) -> str | None:
    if value is None:
        return None
    raw = value.strip()
    if not raw:
        return None
    if raw.lower().startswith("0x"):
        try:
            return f"0x{int(raw, 16):04x}"
        except ValueError:
            return None
    try:
        return f"0x{int(raw, 16):04x}"
    except ValueError:
        return None


def _parse_xml(path: Path) -> list[dict[str, Any]]:
    """Parse one HID/bulk XML; return zero or more index entries."""
    try:
        tree = ET.parse(path)
    except ET.ParseError:
        return []

    root = tree.getroot()
    info = root.find("info")
    if info is None:
        return []

    name = (info.findtext("name") or path.stem).strip()
    devices = info.find("devices")
    if devices is None:
        return []

    entries: list[dict[str, Any]] = []
    for product in devices.findall("product"):
        vid = _normalize_hex(product.get("vendor_id"))
        pid = _normalize_hex(product.get("product_id"))
        if vid is None or pid is None:
            continue

        scriptfiles_el = root.find(".//scriptfiles")
        scripts: list[str] = []
        if scriptfiles_el is not None:
            for fn in scriptfiles_el.findall("file"):
                filename = fn.get("filename")
                if filename:
                    scripts.append(filename)

        entries.append({
            "vid": vid,
            "pid": pid,
            "device_name": name,
            "mapping_file": str(path.relative_to(REPO_ROOT)),
            "script_files": scripts,
            "protocol": product.get("protocol", "hid"),
            "interface_number": product.get("interface_number"),
            "usage_page": product.get("usage_page"),
            "usage": product.get("usage"),
        })

    return entries


def main() -> int:
    if not MIXXX_DIR.is_dir():
        print(f"Mixxx mirror missing at {MIXXX_DIR}", file=sys.stderr)
        return 1

    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    upstream_commit = _read_manifest_commit()

    entries: list[dict[str, Any]] = []
    midi_xml_count = 0
    hid_bulk_xml_count = 0

    for xml in sorted(MIXXX_DIR.iterdir()):
        if xml.suffix != ".xml":
            continue
        if xml.name.endswith(".midi.xml"):
            midi_xml_count += 1
            continue  # Mixxx MIDI XMLs don't carry VID:PID — Q4=A scope.
        if not (xml.name.endswith(".hid.xml") or xml.name.endswith(".bulk.xml")):
            continue
        hid_bulk_xml_count += 1
        entries.extend(_parse_xml(xml))

    entries.sort(key=lambda e: (e["vid"], e["pid"], e["device_name"]))

    out = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "mixxx_upstream_commit": upstream_commit,
        "stats": {
            "midi_xml_skipped": midi_xml_count,
            "hid_bulk_xml_parsed": hid_bulk_xml_count,
            "vid_pid_entries": len(entries),
        },
        "entries": entries,
    }

    INDEX_OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(f"Wrote {INDEX_OUT}")
    print(f"  Skipped {midi_xml_count} .midi.xml files (Q4=A: no VID:PID).")
    print(f"  Parsed {hid_bulk_xml_count} .hid.xml + .bulk.xml files.")
    print(f"  Indexed {len(entries)} VID:PID entries.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
