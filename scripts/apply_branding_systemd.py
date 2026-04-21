#!/usr/bin/env python3
"""Rewrite systemd unit Description lines from the brand manifest.

Default behavior: dry-run — print proposed changes without writing. Pass
``--write`` to apply in-place. Units are identified by scanning
``systemd/*.service`` relative to the repo root.

The rewrite strategy is minimal and reversible:
  - Split the existing Description line after the leading prefix token
    (e.g. ``MAP2 Audio Platform —``).
  - Replace that prefix with the manifest's ``copy.systemdPrefix``.
  - Leave the per-unit suffix ("Backend API", "LCD Display Service", ...) intact.

A unit whose Description does not start with any known prefix is skipped and
reported, to avoid accidental rewrites.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = REPO_ROOT / "branding" / "brand.manifest.json"
OVERRIDE = Path(os.path.expanduser("~/.map2/brand.manifest.override.json"))
SYSTEMD_DIR = REPO_ROOT / "systemd"

KNOWN_PREFIXES = (
    "MAP2 Audio Platform - ",
    "MAP2 Audio Platform — ",
    "MAP2 Audio Platform ",
    "MAP2 Audio ",
    "MAP2 ",
    "MAP — ",
    "MAP - ",
    "MAP ",
)

DESCRIPTION_RE = re.compile(r"^(Description=)(.*)$", re.M)


def _deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load_manifest() -> dict[str, Any]:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if OVERRIDE.exists():
        try:
            data = _deep_merge(data, json.loads(OVERRIDE.read_text(encoding="utf-8")))
        except Exception:
            pass
    return data


def strip_known_prefix(description: str) -> tuple[str, str] | None:
    for prefix in KNOWN_PREFIXES:
        if description.startswith(prefix):
            return prefix, description[len(prefix):]
    return None


def rewrite_text(text: str, new_prefix: str) -> tuple[str, str | None]:
    """Return (new_text, message). message==None means no change or skip."""
    m = DESCRIPTION_RE.search(text)
    if not m:
        return text, "no Description= line"
    desc = m.group(2).strip()
    stripped = strip_known_prefix(desc)
    if stripped is None:
        return text, f"description does not match known prefix: {desc!r}"
    _old_prefix, suffix = stripped
    new_desc = f"{new_prefix}{suffix}"
    if new_desc == desc:
        return text, None
    new_line = f"Description={new_desc}"
    new_text = text[: m.start()] + new_line + text[m.end():]
    return new_text, f"{desc!r} -> {new_desc!r}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--write", action="store_true", help="apply changes in-place")
    ap.add_argument("--units-dir", type=Path, default=SYSTEMD_DIR)
    args = ap.parse_args()

    manifest = load_manifest()
    prefix = (manifest.get("copy", {}) or {}).get("systemdPrefix", "MAP — ")

    changed = 0
    skipped = 0
    for unit_path in sorted(args.units_dir.glob("*.service")):
        text = unit_path.read_text(encoding="utf-8")
        new_text, msg = rewrite_text(text, prefix)
        if msg is None:
            continue
        if new_text == text:
            print(f"skip   {unit_path.name}: {msg}")
            skipped += 1
            continue
        action = "write " if args.write else "dry   "
        print(f"{action} {unit_path.name}: {msg}")
        if args.write:
            unit_path.write_text(new_text, encoding="utf-8")
        changed += 1

    print(f"\n{changed} unit(s) {'updated' if args.write else 'would update'}, {skipped} skipped")
    if not args.write and changed:
        print("(re-run with --write to apply; then: sudo systemctl daemon-reload)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
