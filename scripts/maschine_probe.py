#!/usr/bin/env python3
"""Maschine MK1 hardware probe.

Standalone diagnostic — no MAP2 backend required. Run as the user that owns
the USB device (via the uaccess udev rule) once ``snd-usb-caiaq`` is out of
the way.

Steps:
  1. Enumerate 17cc:0808
  2. Print bus / address / configuration / endpoints
  3. Open + claim interface 0 alt-setting 1
  4. Run the full display init sequence
  5. Draw a horizontal ramp on both displays (diagnostic gradient)
  6. Send the LED primer and light every pad LED at mid brightness
  7. Poll the input endpoints for 3 seconds and print anything received
  8. Clean shutdown

This proves: permissions, kernel detach, protocol correctness, and that the
physical device is responsive. If this script lights the device, the main
daemon is the only thing still wrong.
"""

from __future__ import annotations

import os
import sys
import time

# Allow running directly out of the repo without PYTHONPATH gymnastics.
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app.services.maschine.mk1_protocol import (  # noqa: E402
    DISPLAY_HEIGHT,
    DISPLAY_PIXEL_MAX,
    DISPLAY_WIDTH,
    FrameBuffer,
    Led,
    LED_PAD_INDEX,
    LED_DATA_SIZE,
    decode_button_report,
    decode_encoder_report,
    decode_pad_report,
    is_shift_held,
)
from app.services.maschine.mk1_usb_transport import (  # noqa: E402
    MaschineMK1NotFound,
    MaschineMK1UsbTransport,
)


def _print_descriptors(device) -> None:
    print(f"  bus={device.bus}  address={device.address}  speed={device.speed}")
    try:
        cfg = device.get_active_configuration()
    except Exception as exc:  # pragma: no cover - diagnostic only
        print(f"  get_active_configuration failed: {exc}")
        return
    for iface in cfg:
        print(
            f"  interface#{iface.bInterfaceNumber}"
            f" alt={iface.bAlternateSetting}"
            f" class={iface.bInterfaceClass}"
            f" endpoints={iface.bNumEndpoints}"
        )
        for ep in iface:
            direction = "IN " if (ep.bEndpointAddress & 0x80) else "OUT"
            print(
                f"    EP 0x{ep.bEndpointAddress:02x} {direction} "
                f"type={ep.bmAttributes & 0x03} max={ep.wMaxPacketSize}"
            )


def _gradient_frame() -> bytes:
    """Horizontal ramp: brightness rises left→right across the display."""
    fb = FrameBuffer()
    for x in range(DISPLAY_WIDTH):
        value = int(round(x / (DISPLAY_WIDTH - 1) * DISPLAY_PIXEL_MAX))
        for y in range(DISPLAY_HEIGHT):
            fb.set_pixel(x, y, value)
    return fb.buffer()


def main() -> int:
    print("Maschine MK1 probe starting")
    try:
        import usb.core  # type: ignore
    except ImportError:
        print("ERROR: pyusb not installed. sudo dnf install python3-pyusb")
        return 2

    device = usb.core.find(idVendor=0x17CC, idProduct=0x0808)
    if device is None:
        print("ERROR: Maschine MK1 (17cc:0808) not found on USB bus")
        return 3
    print("Found device:")
    _print_descriptors(device)
    del device  # let pyusb finalize before we claim it in the transport

    transport = MaschineMK1UsbTransport(allow_kernel_detach=True)
    try:
        transport.open()
    except MaschineMK1NotFound as exc:
        print(f"ERROR: {exc}")
        return 3
    except Exception as exc:
        print(f"ERROR opening transport: {exc}")
        print("Hint: is snd-usb-caiaq still holding the device? Try:")
        print("  sudo rmmod snd_usb_caiaq_input snd_usb_caiaq")
        return 4

    print("Transport open. Running display init...")
    transport.initialize_device()
    print("Display init complete.")

    print("Drawing gradient to both displays...")
    frame = _gradient_frame()
    transport.write_display_frame(0, frame)
    transport.write_display_frame(1, frame)

    print("Lighting all pad LEDs at mid brightness and transport LEDs bright...")
    leds = [0] * LED_DATA_SIZE
    for pad_led in LED_PAD_INDEX:
        leds[pad_led] = 128
    leds[Led.Play] = 255
    leds[Led.Rec] = 255
    leds[Led.TransportLeft] = 255
    leds[Led.TransportRight] = 255
    leds[Led.DisplayBacklight] = 0x5C
    transport.write_leds(leds)

    print("Polling pad + button endpoints for 3 seconds. Press pads and buttons now.")
    prev_pad_state = [False] * 16
    prev_button_state = [False] * 42
    prev_encoder_values = [0] * 11
    encoders_initialized = False
    t_end = time.monotonic() + 3.0
    while time.monotonic() < t_end:
        pad_raw = transport.read_pads(timeout_ms=20)
        if pad_raw:
            events = decode_pad_report(pad_raw, prev_pad_state)
            for ev in events:
                verb = "PRESS" if ev.pressed else "release"
                print(f"  PAD {verb}: pad={ev.pad:2d} pressure={ev.pressure}")
        btn_raw = transport.read_buttons_encoders(timeout_ms=5)
        if btn_raw:
            tag = btn_raw[0] if btn_raw else 0
            if tag == 0x04:
                changes = decode_button_report(btn_raw, prev_button_state)
                if changes:
                    shift = is_shift_held(btn_raw)
                    for ch in changes:
                        state = "DOWN" if ch.pressed else "up"
                        print(f"  BUTTON {state}: idx={ch.button} shift={shift}")
            elif tag == 0x02:
                deltas, encoders_initialized = decode_encoder_report(
                    btn_raw, prev_encoder_values, encoders_initialized
                )
                for d in deltas:
                    print(f"  ENCODER: idx={d.encoder} dir={'+1' if d.direction > 0 else '-1'}")

    print("Turning off all LEDs and clearing displays...")
    transport.write_leds([0] * LED_DATA_SIZE)
    blank = FrameBuffer().buffer()
    transport.write_display_frame(0, blank)
    transport.write_display_frame(1, blank)
    transport.close()
    print("Probe complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
