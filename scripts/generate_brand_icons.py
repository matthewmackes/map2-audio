#!/usr/bin/env python3
"""Generate favicon.ico + PWA raster icons from the MAP brand manifest.

The MAP icon is a trivial rounded-rect composition, so we render it directly
with PIL instead of depending on an SVG rasterizer (librsvg / cairosvg).

Outputs:
  web/public/favicon.ico    (multi-size: 16, 32, 48)
  web/public/logo192.png    (PWA 192)
  web/public/logo512.png    (PWA 512)
  web/public/map-brand-mark.svg   (icon SVG copied in for the manifest)

Reads primary/background colors from branding/brand.manifest.json.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = REPO_ROOT / "branding" / "brand.manifest.json"
OUT_DIR = REPO_ROOT / "web" / "public"


def _hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    s = hex_str.lstrip("#")
    return tuple(int(s[i : i + 2], 16) for i in (0, 2, 4))


def draw_icon(size: int, primary: tuple[int, int, int], background: tuple[int, int, int]) -> Image.Image:
    """Render the MAP 2x2 grid icon at the requested square size."""
    # 4x supersample then downscale for smooth corners.
    scale = 4
    W = size * scale
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Outer rounded square — uses the full canvas.
    outer_r = int(W * (56 / 256))
    draw.rounded_rectangle((0, 0, W, W), radius=outer_r, fill=primary + (255,))

    # Inner 2x2 negative-space squares. Geometry mirrors map-icon.svg (viewBox 256).
    # inset = 22, cell = 95, gap = 22 (139-117). In normalized coords:
    inset = W * (22 / 256)
    cell = W * (95 / 256)
    gap_mid = W * (139 / 256)
    inner_r = int(W * (14 / 256))

    cells = [
        (inset, inset),
        (gap_mid, inset),
        (inset, gap_mid),
        (gap_mid, gap_mid),
    ]
    for x, y in cells:
        draw.rounded_rectangle(
            (x, y, x + cell, y + cell),
            radius=inner_r,
            fill=background + (255,),
        )

    return img.resize((size, size), Image.LANCZOS)


def write_icon_svg(primary: str, background: str, out_path: Path) -> None:
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="MAP — Mackes Audio Platform icon">
  <title>MAP — Mackes Audio Platform</title>
  <rect x="0" y="0" width="256" height="256" rx="56" ry="56" fill="{primary}"/>
  <rect x="22" y="22" width="95" height="95" rx="14" ry="14" fill="{background}"/>
  <rect x="139" y="22" width="95" height="95" rx="14" ry="14" fill="{background}"/>
  <rect x="22" y="139" width="95" height="95" rx="14" ry="14" fill="{background}"/>
  <rect x="139" y="139" width="95" height="95" rx="14" ry="14" fill="{background}"/>
</svg>
'''
    out_path.write_text(svg, encoding="utf-8")


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    primary_hex = manifest["palette"]["primary"]
    bg_hex = manifest["palette"]["background"]
    primary = _hex_to_rgb(primary_hex)
    background = _hex_to_rgb(bg_hex)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # PWA rasters.
    for size, name in [(192, "logo192.png"), (512, "logo512.png")]:
        img = draw_icon(size, primary, background)
        img.save(OUT_DIR / name, "PNG", optimize=True)
        print(f"wrote {OUT_DIR / name}")

    # Multi-size favicon.ico.
    favicon = OUT_DIR / "favicon.ico"
    ico_sizes = [16, 32, 48, 64]
    ico_imgs = [draw_icon(s, primary, background) for s in ico_sizes]
    ico_imgs[0].save(favicon, format="ICO", sizes=[(s, s) for s in ico_sizes])
    print(f"wrote {favicon}")

    # Public-served icon SVG (for PWA manifest + HTML link).
    write_icon_svg(primary_hex, bg_hex, OUT_DIR / "map-brand-mark.svg")
    print(f"wrote {OUT_DIR / 'map-brand-mark.svg'}")

    # Replace the legacy map2-brand-mark.svg so cached manifest references keep working.
    legacy = OUT_DIR / "map2-brand-mark.svg"
    shutil.copy2(OUT_DIR / "map-brand-mark.svg", legacy)
    print(f"wrote {legacy} (alias)")


if __name__ == "__main__":
    main()
