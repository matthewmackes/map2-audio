#!/usr/bin/env python3
"""Pure LCD test — verifies display init + framebuffer write produces
visible pixels on the MK1 panels.

Phases:
  1. Init both displays (KS0713 sequence)
  2. Write black (0xFF) to both — panels should be dark
  3. Wait 3s
  4. Write white (0x00) to both — panels should be fully lit
  5. Wait 3s
  6. Write a horizontal gradient (dark left → bright right)
  7. Wait 5s
  8. Write "MAP2" text pattern (hand-drawn block letters)
  9. Wait 5s
  10. Clear to black
"""
from __future__ import annotations

import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app.services.maschine.mk1_protocol import (  # noqa: E402
    DISPLAY_FRAMEBUFFER_SIZE,
    DISPLAY_HEIGHT,
    DISPLAY_PIXEL_MAX,
    DISPLAY_WIDTH,
    FrameBuffer,
)
from app.services.maschine.mk1_usb_transport import MaschineMK1UsbTransport  # noqa: E402


def send_both(t: MaschineMK1UsbTransport, buf: bytes) -> None:
    t.write_display_frame(0, buf)
    t.write_display_frame(1, buf)


def main() -> int:
    t = MaschineMK1UsbTransport(allow_kernel_detach=True)
    t.open()

    print("1. Init displays...", flush=True)
    t.initialize_device()

    print("2. BLACK (0xFF fill) — panels dark — 3s", flush=True)
    fb_black = FrameBuffer()
    fb_black.fill_black()
    send_both(t, fb_black.buffer())
    time.sleep(3.0)

    print("3. WHITE (0x00 fill) — panels bright — 3s", flush=True)
    fb_white = FrameBuffer()
    fb_white.fill_white()
    send_both(t, fb_white.buffer())
    time.sleep(3.0)

    print("4. Gradient (dark left → bright right) — 5s", flush=True)
    fb_grad = FrameBuffer()
    for x in range(DISPLAY_WIDTH):
        brightness = int(round(x / (DISPLAY_WIDTH - 1) * DISPLAY_PIXEL_MAX))
        for y in range(DISPLAY_HEIGHT):
            fb_grad.set_pixel(x, y, brightness)
    send_both(t, fb_grad.buffer())
    time.sleep(5.0)

    print("5. Block text 'MAP2' — 5s", flush=True)
    fb_text = FrameBuffer()  # starts black (0xFF)
    # Draw "MAP2" as 8-pixel-tall block letters starting at (20, 20)
    # Each letter is ~20px wide, 5px gap between
    letters = {
        'M': [
            "##....##",
            "###..###",
            "########",
            "##.##.##",
            "##....##",
            "##....##",
            "##....##",
            "##....##",
        ],
        'A': [
            "..####..",
            ".##..##.",
            "##....##",
            "########",
            "##....##",
            "##....##",
            "##....##",
            "##....##",
        ],
        'P': [
            "######..",
            "##....##",
            "##....##",
            "######..",
            "##......",
            "##......",
            "##......",
            "##......",
        ],
        '2': [
            ".######.",
            "##....##",
            "......##",
            "....##..",
            "..##....",
            "##......",
            "########",
            "########",
        ],
    }
    x_cursor = 20
    scale = 3  # scale each pixel 3x
    for ch in "MAP2":
        glyph = letters[ch]
        for gy, row in enumerate(glyph):
            for gx, cell in enumerate(row):
                if cell == '#':
                    for sy in range(scale):
                        for sx in range(scale):
                            fb_text.set_pixel(
                                x_cursor + gx * scale + sx,
                                20 + gy * scale + sy,
                                DISPLAY_PIXEL_MAX,
                            )
        x_cursor += len(glyph[0]) * scale + 5

    send_both(t, fb_text.buffer())
    time.sleep(5.0)

    print("6. Clear to black", flush=True)
    send_both(t, fb_black.buffer())
    time.sleep(0.5)
    t.close()
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
