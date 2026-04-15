#!/usr/bin/env python3
"""Test whether heavy pad-input drain lets us do multiple LED writes.

Hypothesis: the device stops accepting EP 0x01 OUT writes if its pad
input buffer (EP 0x84 IN) has data the host hasn't read. By draining
heavily between LED writes we should be able to chain them.
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


def drain(t: MaschineMK1UsbTransport, ms: int) -> int:
    end = time.monotonic() + ms / 1000.0
    bytes_seen = 0
    while time.monotonic() < end:
        d = t.read_pads(timeout_ms=1)
        if d:
            bytes_seen += len(d)
        d = t.read_buttons_encoders(timeout_ms=1)
        if d:
            bytes_seen += len(d)
    return bytes_seen


def led_write(t: MaschineMK1UsbTransport, leds: list[int], label: str) -> bool:
    try:
        t.write_leds(leds)
        print(f"  LED write OK ({label})", flush=True)
        return True
    except Exception as e:
        print(f"  LED write FAIL ({label}): {e}", flush=True)
        return False


def main() -> int:
    t = MaschineMK1UsbTransport(allow_kernel_detach=True)
    t.open()
    print("init...", flush=True)
    t.initialize_device()
    print("init done", flush=True)

    print(f"\n== Test 1: no drain, second LED write should fail ==", flush=True)
    led_write(t, [255] * LED_DATA_SIZE, "ALL ON")
    time.sleep(2.0)
    led_write(t, [0] * LED_DATA_SIZE, "ALL OFF (immediate)")

    print(f"\n== Test 2: after long drain ==", flush=True)
    b = drain(t, 1000)
    print(f"  drained {b} bytes over 1s", flush=True)
    led_write(t, [255] * LED_DATA_SIZE, "ALL ON after drain")

    b = drain(t, 1000)
    print(f"  drained {b} bytes over 1s", flush=True)
    led_write(t, [0] * LED_DATA_SIZE, "ALL OFF after drain")

    t.close()
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
