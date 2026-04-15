#!/usr/bin/env python3
"""Light the 'Unused' slots (30, 59, 60, 61) one at a time.

cabl marks these as Unused — meaning cabl never drives them. But on this
hardware they may actually control real LEDs (e.g., the Group A-H buttons).
Walking them individually tells us what each one drives physically.
"""
from __future__ import annotations

import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app.services.maschine.mk1_protocol import LED_DATA_SIZE  # noqa: E402
from app.services.maschine.mk1_usb_transport import MaschineMK1UsbTransport  # noqa: E402


def main() -> int:
    t = MaschineMK1UsbTransport(allow_kernel_detach=True)
    t.open()
    t.initialize_device()
    print("init done\n", flush=True)

    targets = [30, 59, 60, 61]
    for slot in targets:
        leds = [0] * LED_DATA_SIZE
        leds[slot] = 255
        print(f"  slot {slot:02d} at 255 — observe 3s", flush=True)
        t.write_leds(leds)
        time.sleep(3.0)

    print("\nall off", flush=True)
    t.write_leds([0] * LED_DATA_SIZE)
    t.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
