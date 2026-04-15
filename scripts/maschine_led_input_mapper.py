#!/usr/bin/env python3
"""Interactive LED + input mapper for the Maschine MK1.

For each LED slot in the 62-byte array, light it alone at full brightness,
then wait for the user to press ENTER (confirming what they see) plus any
physical button/pad press. We log:

  slot_index -> (human label from cabl, raw input bytes captured while lit)

Usage:
  python3 scripts/maschine_led_input_mapper.py [--start N] [--stop N]

The default walks slots 0..61. Use --start/--stop to re-test a subset.

Output: /tmp/mk1-led-map.json — the ground-truth LED map for this device.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app.services.maschine.mk1_protocol import (  # noqa: E402
    DISPLAY_FRAMEBUFFER_SIZE,
    LED_DATA_SIZE,
    Led,
)
from app.services.maschine.mk1_usb_transport import (  # noqa: E402
    MaschineMK1NotFound,
    MaschineMK1UsbTransport,
)


LABELS: dict[int, str] = {int(member): member.name for member in Led}


def _drain_input(transport: MaschineMK1UsbTransport, duration_s: float = 0.25) -> list[bytes]:
    """Read whatever is queued on both IN endpoints for a short window."""
    events: list[bytes] = []
    t_end = time.monotonic() + duration_s
    while time.monotonic() < t_end:
        pad = transport.read_pads(timeout_ms=5)
        if pad:
            events.append(b"PAD:" + pad)
        btn = transport.read_buttons_encoders(timeout_ms=5)
        if btn:
            events.append(b"BTN:" + btn)
    return events


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--stop", type=int, default=LED_DATA_SIZE - 1)
    parser.add_argument("--brightness", type=int, default=255)
    args = parser.parse_args()

    if not (0 <= args.start <= args.stop < LED_DATA_SIZE):
        print(f"--start/--stop must be in 0..{LED_DATA_SIZE - 1}")
        return 2

    transport = MaschineMK1UsbTransport(allow_kernel_detach=True)
    try:
        transport.open()
    except MaschineMK1NotFound as exc:
        print(f"ERROR: {exc}")
        return 3

    print("Running full init (display + LED primer)...")
    transport.initialize_device()
    print("Init complete.\n")
    print("For each slot: one physical light will come on. Press ENTER to")
    print("log what you see and capture any input that happened while lit.")
    print("Type 'q' + ENTER to quit early.\n")

    results: list[dict] = []
    prev_lit_label = ""
    try:
        for slot in range(args.start, args.stop + 1):
            leds = [0] * LED_DATA_SIZE
            leds[slot] = args.brightness
            transport.write_leds(leds)
            label = LABELS.get(slot, f"slot{slot}")
            prompt = (
                f"slot {slot:02d} ({label}): what lit up? "
                "(press matching key too, then ENTER) > "
            )
            try:
                user = input(prompt).strip()
            except EOFError:
                user = ""
            events = _drain_input(transport, duration_s=0.05)
            if user.lower() == "q":
                break
            entry = {
                "slot": slot,
                "label_cabl": label,
                "user_saw": user,
                "input_events": [ev.hex() for ev in events],
            }
            results.append(entry)
            prev_lit_label = label
    finally:
        transport.write_leds([0] * LED_DATA_SIZE)
        transport.close()

    out_path = "/tmp/mk1-led-map.json"
    with open(out_path, "w") as fh:
        json.dump({"results": results}, fh, indent=2)
    print(f"\nWrote {out_path} ({len(results)} entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
