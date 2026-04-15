#!/usr/bin/env python3
"""Test the cabl two-packet LED scheme with the drain thread running.

Our single 64-byte packet [0x0C, 0x00] + 62 bytes only reaches slots 0-30
(the device interprets byte 1 as 'offset', and with the max transfer length
cap, only the first 31 bytes get written into the LED array). cabl's scheme:
  packet A: [0x0C, 0x00] + slots 0..30   (31 bytes data, 33 total)
  packet B: [0x0C, 0x1E] + slots 31..61  (31 bytes data, 33 total)

With the background pad-drain thread running, the second write should no
longer wedge EP 0x01. This test explicitly sends both packets for a range
of test patterns to prove every slot is addressable.
"""
from __future__ import annotations

import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app.services.maschine.mk1_protocol import (  # noqa: E402
    EP_CONTROL_OUT,
    LED_DATA_SIZE,
)
from app.services.maschine.mk1_usb_transport import MaschineMK1UsbTransport  # noqa: E402


def write_two_packet(t: MaschineMK1UsbTransport, state: list[int]) -> None:
    """Write LEDs using cabl's two-packet scheme, drain thread handles backpressure."""
    buf = bytearray(LED_DATA_SIZE)
    for i, v in enumerate(state[:LED_DATA_SIZE]):
        buf[i] = max(0, min(255, int(v)))
    g0 = bytes([0x0C, 0x00]) + bytes(buf[0:31])
    g1 = bytes([0x0C, 0x1E]) + bytes(buf[31:62])
    t._write(EP_CONTROL_OUT, g0)
    t._write(EP_CONTROL_OUT, g1)


def phase(t, label, state, dwell):
    print(f"--- {label} ---", flush=True)
    try:
        write_two_packet(t, state)
        print("  two-packet write OK", flush=True)
    except Exception as e:
        print(f"  FAIL: {e}", flush=True)
        return False
    time.sleep(dwell)
    return True


def main() -> int:
    t = MaschineMK1UsbTransport(allow_kernel_detach=True)
    t.open()
    print("init...", flush=True)
    t.initialize_device()
    print("init done\n", flush=True)

    off = [0] * LED_DATA_SIZE
    phase(t, "off", off, 0.5)

    # P1: only slots 0..30 (first half) - confirm pads/vertical/transport lights
    s = [0] * LED_DATA_SIZE
    for i in range(0, 31):
        s[i] = 255
    phase(t, "P1: slots 0..30 ON (first half)", s, 3.5)

    # P2: only slots 31..61 (second half) - A-H, left-of-LCD row, top-of-LCD row, backlight
    s = [0] * LED_DATA_SIZE
    for i in range(31, 62):
        s[i] = 255
    phase(t, "P2: slots 31..61 ON (second half) — A-H / LCD-side buttons / top-LCD row / backlight", s, 5.0)

    # P3: all on
    phase(t, "P3: ALL 62 slots ON", [255] * LED_DATA_SIZE, 4.0)

    # P4: all off
    phase(t, "P4: all off", off, 0.5)

    t.close()
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
