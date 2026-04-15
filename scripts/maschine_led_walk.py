#!/usr/bin/env python3
"""Walk the Maschine MK1 LED array in timed phases.

Non-interactive. Lights slots in documented groups with 4-second dwells so
the user can report exactly what they observed in each phase.

Phases:
  P0  all 62 at 255 for 3 s                           (everything we can drive)
  P1  slots 0..15 only (cabl pad indices) for 4 s     (should be the 16 pads)
  P2  slots 16..24 at 255 for 4 s                     (row: Mute..Shift)
  P3  slots 25..32 at 255 for 4 s                     (Erase..Loop, Rec/Play)
  P4  slots 33..40 at 255 for 4 s                     (Group A-H)
  P5  slots 41..48 at 255 for 4 s                     (AutoWrite..Control)
  P6  slots 49..57 at 255 for 4 s                     (DisplayButtons + NoteRepeat)
  P7  slot 58 at 255 for 4 s                          (DisplayBacklight)
  P8  each of 16 pads individually for 1 s            (identifies pad index)
  P9  all off

Each phase prints a banner so you can read it in the terminal after.
"""
from __future__ import annotations

import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app.services.maschine.mk1_protocol import (  # noqa: E402
    LED_DATA_SIZE,
    Led,
)
from app.services.maschine.mk1_usb_transport import (  # noqa: E402
    MaschineMK1UsbTransport,
)


def pulse(t: MaschineMK1UsbTransport, slots: list[int], label: str, dwell_s: float) -> None:
    leds = [0] * LED_DATA_SIZE
    for s in slots:
        leds[s] = 255
    print(f"--- {label}: lighting slots {slots} for {dwell_s}s ---", flush=True)
    t.write_leds(leds)
    time.sleep(dwell_s)


def main() -> int:
    t = MaschineMK1UsbTransport(allow_kernel_detach=True)
    t.open()
    print("init...", flush=True)
    t.initialize_device()
    print("init done\n", flush=True)

    pulse(t, list(range(LED_DATA_SIZE)), "P0 ALL 62 slots", 3.0)
    pulse(t, list(range(0, 16)), "P1 slots 0..15 (expect 16 pads)", 4.0)
    pulse(t, list(range(16, 25)), "P2 slots 16..24 (Mute..Shift row)", 4.0)
    pulse(t, list(range(25, 33)), "P3 slots 25..32 (Erase..Loop)", 4.0)
    pulse(t, list(range(33, 41)), "P4 slots 33..40 (Groups H..A)", 4.0)
    pulse(t, list(range(41, 49)), "P5 slots 41..48 (AutoWrite..Control)", 4.0)
    pulse(t, list(range(49, 58)), "P6 slots 49..57 (DisplayButtons + NoteRepeat)", 4.0)
    pulse(t, [58], "P7 slot 58 (DisplayBacklight)", 4.0)

    print("\n--- P8 walking individual pads ---", flush=True)
    for pad_num in range(1, 17):
        slot = int(getattr(Led, f"Pad{pad_num}"))
        leds = [0] * LED_DATA_SIZE
        leds[slot] = 255
        print(f"  pad {pad_num} -> slot {slot}", flush=True)
        t.write_leds(leds)
        time.sleep(1.0)

    print("\nall off", flush=True)
    t.write_leds([0] * LED_DATA_SIZE)
    time.sleep(0.5)
    t.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
