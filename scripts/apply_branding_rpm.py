#!/usr/bin/env python3
"""Rewrite user-visible RPM spec fields from the brand manifest.

Updates ``Summary:``, ``URL:``, and the single-line ``%description`` lead
in the canonical ``packaging/rpm/map2.spec`` (the single installer).

Idempotent and dry-run by default. Pass ``--write`` to apply.

Identifiers (``Name:``, ``%{name}``, package directories, systemd unit
basenames) are intentionally left alone — they are load-bearing keys and
renaming them is out of scope for a branding refresh.
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
SPECS = [
    REPO_ROOT / "packaging" / "rpm" / "map2.spec",
]


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


SUMMARY_RE = re.compile(r"^(Summary:\s+)(.+)$", re.M)
URL_RE = re.compile(r"^(URL:\s+)(.+)$", re.M)


def rewrite(text: str, product_name: str, tagline_summary: str, homepage: str) -> tuple[str, list[str]]:
    changes: list[str] = []

    def _sub(pat: re.Pattern[str], new_value: str, label: str) -> str:
        nonlocal text
        m = pat.search(text)
        if not m:
            return text
        old = m.group(2).strip()
        if old == new_value:
            return text
        text = pat.sub(lambda mo: f"{mo.group(1)}{new_value}", text, count=1)
        changes.append(f"{label}: {old!r} -> {new_value!r}")
        return text

    summary = f"{product_name} - {tagline_summary}"
    _sub(SUMMARY_RE, summary, "Summary")
    _sub(URL_RE, homepage, "URL")
    return text, changes


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--write", action="store_true", help="apply changes in-place")
    ap.add_argument("--summary-suffix", default="Professional real-time audio processing")
    args = ap.parse_args()

    m = load_manifest()
    product_name = m.get("productName", "Mackes Audio Platform")
    homepage = m.get("homepage", "https://github.com/matthewmackes/map2-audio")

    total = 0
    for spec in SPECS:
        if not spec.exists():
            print(f"skip   {spec}: missing")
            continue
        text = spec.read_text(encoding="utf-8")
        new_text, changes = rewrite(text, product_name, args.summary_suffix, homepage)
        if not changes:
            print(f"clean  {spec.name}")
            continue
        total += len(changes)
        action = "write " if args.write else "dry   "
        for change in changes:
            print(f"{action} {spec.name}: {change}")
        if args.write:
            spec.write_text(new_text, encoding="utf-8")

    print(f"\n{total} change(s) {'applied' if args.write else 'would apply'}")
    if total and not args.write:
        print("(re-run with --write to apply)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
