#!/usr/bin/env python3
"""Try two hypotheses for unwedging EP 0x01 between LED writes.

H1: re-send the LED channel primer before every LED write.
H2: heavily drain BOTH input endpoints (pads AND buttons) before LED write.
H3: combination of both.

Each phase attempts LED writes with a different unwedge strategy. If ANY
strategy allows 3 back-to-back LED writes, we've found the pattern.
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
    EP_CONTROL_OUT,
    LED_CHANNEL_PRIMER,
    LED_DATA_SIZE,
)
from app.services.maschine.mk1_usb_transport import MaschineMK1UsbTransport  # noqa: E402


def drain_all(t: MaschineMK1UsbTransport, ms: int) -> tuple[int, int]:
    end = time.monotonic() + ms / 1000.0
    pads_b = btn_b = 0
    while time.monotonic() < end:
        d = t.read_pads(timeout_ms=1)
        if d:
            pads_b += len(d)
        d = t.read_buttons_encoders(timeout_ms=1)
        if d:
            btn_b += len(d)
    return pads_b, btn_b


def try_led_write(t, leds, tag):
    try:
        t.write_leds(leds)
        print(f"    [{tag}] LED OK", flush=True)
        return True
    except Exception as e:
        print(f"    [{tag}] LED FAIL: {e}", flush=True)
        return False


def led_on():
    return [255] * LED_DATA_SIZE


def led_off():
    return [0] * LED_DATA_SIZE


def main() -> int:
    t = MaschineMK1UsbTransport(allow_kernel_detach=True)
    t.open()
    print("init...", flush=True)
    t.initialize_device()
    print("init done\n", flush=True)

    print("=== H0 baseline: two back-to-back writes, no drain, no reprime ===", flush=True)
    ok1 = try_led_write(t, led_on(), "H0.1")
    time.sleep(2)
    ok2 = try_led_write(t, led_off(), "H0.2")
    print(f"  H0 result: {'PASS' if ok1 and ok2 else 'FAIL'}\n", flush=True)

    # Regardless of above, continue to next hypotheses if we can
    print("=== H1: reprime before every LED write ===", flush=True)
    try:
        t._write(EP_CONTROL_OUT, LED_CHANNEL_PRIMER)
        print("    reprime ok", flush=True)
    except Exception as e:
        print(f"    reprime FAIL: {e}", flush=True)
    ok3 = try_led_write(t, led_on(), "H1.1")
    time.sleep(2)
    try:
        t._write(EP_CONTROL_OUT, LED_CHANNEL_PRIMER)
        print("    reprime ok", flush=True)
    except Exception as e:
        print(f"    reprime FAIL: {e}", flush=True)
    ok4 = try_led_write(t, led_off(), "H1.2")
    print(f"  H1 result: {'PASS' if ok3 and ok4 else 'FAIL'}\n", flush=True)

    print("=== H2: drain both input EPs before LED write ===", flush=True)
    p, b = drain_all(t, 500)
    print(f"    drained pads={p} btns={b}", flush=True)
    ok5 = try_led_write(t, led_on(), "H2.1")
    time.sleep(2)
    p, b = drain_all(t, 500)
    print(f"    drained pads={p} btns={b}", flush=True)
    ok6 = try_led_write(t, led_off(), "H2.2")
    print(f"  H2 result: {'PASS' if ok5 and ok6 else 'FAIL'}\n", flush=True)

    print("=== H3: drain + reprime ===", flush=True)
    p, b = drain_all(t, 500)
    print(f"    drained pads={p} btns={b}", flush=True)
    try:
        t._write(EP_CONTROL_OUT, LED_CHANNEL_PRIMER)
    except Exception:
        pass
    ok7 = try_led_write(t, led_on(), "H3.1")
    time.sleep(2)
    p, b = drain_all(t, 500)
    print(f"    drained pads={p} btns={b}", flush=True)
    try:
        t._write(EP_CONTROL_OUT, LED_CHANNEL_PRIMER)
    except Exception:
        pass
    ok8 = try_led_write(t, led_off(), "H3.2")
    print(f"  H3 result: {'PASS' if ok7 and ok8 else 'FAIL'}\n", flush=True)

    t.close()
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
