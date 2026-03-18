#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tmp/fonts/blexmono-v3.4.0"
OUTPUT_DIR = ROOT / "web/public/fonts/blexmono-nerd/v3.4.0"
PYFTSUBSET = shutil.which("pyftsubset")

SOURCE_RELEASE = {
    "vendor": "Nerd Fonts",
    "release": "v3.4.0",
    "published_at": "2025-04-24T18:23:06Z",
    "asset": "IBMPlexMono.zip",
    "asset_url": "https://github.com/ryanoasis/nerd-fonts/releases/download/v3.4.0/IBMPlexMono.zip",
}

TEXT_UNICODES = ",".join(
    [
        "U+0000-00FF",
        "U+0100-017F",
        "U+0180-024F",
        "U+0259",
        "U+1E00-1EFF",
        "U+2000-206F",
        "U+20A0-20CF",
        "U+2100-214F",
        "U+2190-21FF",
        "U+2200-22FF",
        "U+2300-23FF",
        "U+2460-24FF",
        "U+2500-259F",
        "U+25A0-25FF",
        "U+2600-26FF",
        "U+2700-27BF",
        "U+2B00-2BFF",
    ]
)

GLYPH_UNICODES = ",".join(
    [
        "U+E0A0",
        "U+E0B0-E0B3",
        "U+E0B6-E0B7",
        "U+EA6C",
        "U+EA6D",
        "U+EA76",
        "U+EA78",
        "U+EA80",
        "U+EA83",
        "U+EAB2",
        "U+EAF1",
        "U+EB03",
        "U+EB14",
        "U+EB15",
        "U+EB2C",
        "U+EB4E",
        "U+EB50",
        "U+EB51",
        "U+EB83",
        "U+EBA5-EBA7",
        "U+EBB1",
        "U+EBCE",
        "U+EC19",
        "U+EC1B",
        "U+F017",
        "U+F026-F028",
        "U+F071",
        "U+F0C1",
        "U+F1EB",
        "U+F233",
        "U+F2DB",
        "U+F418",
        "U+F422",
        "U+F437",
        "U+F43A",
        "U+F44C",
        "U+F498",
        "U+F529",
    ]
)

STYLES = [
    ("Regular", 400, "normal"),
    ("Italic", 400, "italic"),
    ("Medium", 500, "normal"),
    ("MediumItalic", 500, "italic"),
    ("SemiBold", 600, "normal"),
    ("SemiBoldItalic", 600, "italic"),
    ("Bold", 700, "normal"),
    ("BoldItalic", 700, "italic"),
]


def run_subset(source: Path, output: Path, unicodes: str) -> None:
    if not PYFTSUBSET:
        raise SystemExit("pyftsubset is required but was not found in PATH")

    command = [
        PYFTSUBSET,
        str(source),
        f"--output-file={output}",
        "--flavor=woff2",
        f"--unicodes={unicodes}",
        "--layout-features=*",
        "--glyph-names",
        "--symbol-cmap",
        "--legacy-cmap",
        "--notdef-glyph",
        "--notdef-outline",
        "--recommended-glyphs",
        "--name-legacy",
        "--drop-tables+=FFTM",
        "--desubroutinize",
    ]
    subprocess.run(command, check=True)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "family": "BlexMono Nerd Font",
        "source_release": SOURCE_RELEASE,
        "strategy": {
            "format": "woff2",
            "subsets": {
                "text": TEXT_UNICODES,
                "glyph": GLYPH_UNICODES,
            },
        },
        "files": [],
    }

    for style_name, weight, font_style in STYLES:
        source = SOURCE_DIR / f"BlexMonoNerdFont-{style_name}.ttf"
        if not source.exists():
            raise FileNotFoundError(source)

        text_output = OUTPUT_DIR / f"blexmono-nerd-text-{weight}-{font_style}.woff2"
        glyph_output = OUTPUT_DIR / f"blexmono-nerd-glyph-{weight}-{font_style}.woff2"

        run_subset(source, text_output, TEXT_UNICODES)
        run_subset(source, glyph_output, GLYPH_UNICODES)

        manifest["files"].append(
            {
                "source": source.name,
                "weight": weight,
                "style": font_style,
                "text_subset": text_output.name,
                "glyph_subset": glyph_output.name,
            }
        )

    for source_name in ("LICENSE.txt", "README.md"):
        source_file = SOURCE_DIR / source_name
        if source_file.exists():
            shutil.copy2(source_file, OUTPUT_DIR / source_name)

    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
