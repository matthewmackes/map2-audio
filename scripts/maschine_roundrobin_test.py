#!/usr/bin/env python3
"""Cabl-style round-robin LED test.

cabl's tick() cycles: sendFrame(0) / sendFrame(1) -> read(pads) -> sendLeds()
and never writes two LED packets back-to-back without a frame + read in
between. This test mirrors that exact pattern to verify the LED channel
stays drivable across multiple updates.

Phases (each phase = one tick iteration):
  tick 0: frame 0+1 (white), read pads, LEDs all off
  tick 1: frame 0+1 (black), read pads, LEDs slots 0..15 at 255
  tick 2: frame 0+1 (white), read pads, LEDs slots 16..31 at 255
  tick 3: frame 0+1 (black), read pads, LEDs slots 32..47 at 255
  tick 4: frame 0+1 (white), read pads, LEDs slots 48..61 at 255
  tick 5: frame 0+1 (black), read pads, LEDs all 62 at 255
  (4 second dwell between ticks)
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
    LED_DATA_SIZE,
)
from app.services.maschine.mk1_usb_transport import MaschineMK1UsbTransport  # noqa: E402


# cabl ground state: 0xFF = black (panel dark), 0x00 = white (panel bright)
BLACK = b"\xff" * DISPLAY_FRAMEBUFFER_SIZE
WHITE = bytes(DISPLAY_FRAMEBUFFER_SIZE)


def tick(t: MaschineMK1UsbTransport, label: str, frame: bytes, leds: list[int], dwell: float) -> None:
    print(f"--- {label} ---", flush=True)
    try:
        t.write_display_frame(0, frame)
        t.write_display_frame(1, frame)
        print("  frames written", flush=True)
    except Exception as e:
        print(f"  frame write FAILED: {e}", flush=True)
        return
    # read/drain pads
    drained = 0
    for _ in range(4):
        d = t.read_pads(timeout_ms=2)
        if d:
            drained += len(d)
    print(f"  pads drained {drained} bytes", flush=True)
    try:
        t.write_leds(leds)
        print(f"  LED write OK ({sum(1 for v in leds if v)} slots lit)", flush=True)
    except Exception as e:
        print(f"  LED write FAILED: {e}", flush=True)
        return
    time.sleep(dwell)


def main() -> int:
    t = MaschineMK1UsbTransport(allow_kernel_detach=True)
    t.open()
    print("init...", flush=True)
    t.initialize_device()
    print("init done\n", flush=True)

    tick(t, "tick 0: WHITE frame, LEDs off", WHITE, [0] * LED_DATA_SIZE, 3.0)

    leds = [0] * LED_DATA_SIZE
    for i in range(0, 16):
        leds[i] = 255
    tick(t, "tick 1: BLACK frame, slots 0..15 lit", BLACK, leds, 4.0)

    leds = [0] * LED_DATA_SIZE
    for i in range(16, 32):
        leds[i] = 255
    tick(t, "tick 2: WHITE frame, slots 16..31 lit", WHITE, leds, 4.0)

    leds = [0] * LED_DATA_SIZE
    for i in range(32, 48):
        leds[i] = 255
    tick(t, "tick 3: BLACK frame, slots 32..47 lit", BLACK, leds, 4.0)

    leds = [0] * LED_DATA_SIZE
    for i in range(48, 62):
        leds[i] = 255
    tick(t, "tick 4: WHITE frame, slots 48..61 lit", WHITE, leds, 4.0)

    tick(t, "tick 5: BLACK frame, ALL 62 lit", BLACK, [255] * LED_DATA_SIZE, 4.0)

    tick(t, "tick 6: BLACK frame, LEDs off", BLACK, [0] * LED_DATA_SIZE, 0.5)
    t.close()
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
