#!/usr/bin/env python3
"""Walk every LED slot one-at-a-time so we can verify the cabl LED map.

For each of the 62 slots, light only that slot at full brightness for
2 seconds, print the slot index + cabl label, then move to the next.
After the walk, turn everything off.

Run this with the terminal visible so you can watch both the printout
and the physical device, then report which labels did/didn't match what
physically lit up.

Duration: 62 slots * 2 s = ~2 minutes.
"""
from __future__ import annotations

import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app.services.maschine.mk1_protocol import LED_DATA_SIZE, Led  # noqa: E402
from app.services.maschine.mk1_usb_transport import MaschineMK1UsbTransport  # noqa: E402


LABELS = {int(m): m.name for m in Led}


def main() -> int:
    t = MaschineMK1UsbTransport(allow_kernel_detach=True)
    t.open()
    print("init...", flush=True)
    t.initialize_device()
    print("init done — starting slot walk (2s per slot)\n", flush=True)

    off = [0] * LED_DATA_SIZE
    t.write_leds(off)
    time.sleep(0.3)

    try:
        for slot in range(LED_DATA_SIZE):
            leds = [0] * LED_DATA_SIZE
            leds[slot] = 255
            label = LABELS.get(slot, f"slot{slot}")
            print(f"  slot {slot:02d}  {label}", flush=True)
            t.write_leds(leds)
            time.sleep(2.0)
    finally:
        t.write_leds(off)
        t.close()

    print("\ndone — all off", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
