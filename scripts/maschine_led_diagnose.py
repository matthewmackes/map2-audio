#!/usr/bin/env python3
"""Single-replug diagnostic: find why EP 0x01 LED group 1 times out.

Walks through hypotheses in order, STOPS on first success, and prints the
exact variant that worked. Requires a freshly-replugged Maschine MK1 so
every variant starts from a clean device state.

If a variant FAILS, the device's EP 0x01 will be wedged for the rest of
this run — that's expected, we fall through to "cannot continue" and
report which variant was the last-good step.

Variants (ordered cheapest → weirdest):

    V0  baseline: primer + g0 + g1 (known to fail, proves setup)
    V1  primer + g0 + 5 ms sleep + g1
    V2  primer + g0 + read(0x81, 1 ms) + g1
    V3  primer + g0 + read(0x84, 1 ms) + g1
    V4  primer + g1 + g0 (reversed order)
    V5  primer + g1 alone (no g0 at all)
    V6  primer + g0 padded to 64 bytes + g1 padded to 64 bytes
    V7  primer + g0 padded to 512 bytes + g1 padded to 512 bytes
    V8  ctypes libusb direct, primer + g0 + g1 back-to-back

Every variant re-sends the primer; the primer on a cold device is known
to succeed, so if primer itself fails we know we're already wedged.
"""

from __future__ import annotations

import ctypes
import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app.services.maschine.mk1_protocol import (  # noqa: E402
    EP_BUTTONS_IN,
    EP_CONTROL_OUT,
    EP_PADS_IN,
    INTERFACE_ALT_SETTING,
    INTERFACE_NUMBER,
    LED_CHANNEL_PRIMER,
    LED_DATA_SIZE,
    LED_PAD_INDEX,
    Led,
    PRODUCT_ID,
    VENDOR_ID,
    build_led_packets,
)


def _make_led_state() -> list[int]:
    leds = [0] * LED_DATA_SIZE
    for i in LED_PAD_INDEX:
        leds[i] = 200
    # Put a visible witness in BOTH groups so we can see which side won
    leds[Led.Play] = 255               # index 29 → group 0
    leds[Led.TransportLeft] = 255      # index 31 → group 1
    leds[Led.GroupA] = 255             # index 40 → group 1
    leds[Led.DisplayBacklight] = 0x5C  # index 58 → group 1
    return leds


def _find_device():
    import usb.core  # type: ignore

    dev = usb.core.find(idVendor=VENDOR_ID, idProduct=PRODUCT_ID)
    if dev is None:
        print("ERROR: Maschine MK1 not found on USB bus")
        sys.exit(3)
    return dev


def _open(dev) -> None:
    import usb.core  # type: ignore

    try:
        if dev.is_kernel_driver_active(INTERFACE_NUMBER):
            dev.detach_kernel_driver(INTERFACE_NUMBER)
    except (NotImplementedError, AttributeError):
        pass
    except usb.core.USBError as exc:
        print(f"  kernel detach warn: {exc}")

    dev.set_configuration()
    import usb.util  # type: ignore
    usb.util.claim_interface(dev, INTERFACE_NUMBER)
    dev.set_interface_altsetting(
        interface=INTERFACE_NUMBER, alternate_setting=INTERFACE_ALT_SETTING
    )


def _close(dev) -> None:
    import usb.util  # type: ignore
    try:
        usb.util.release_interface(dev, INTERFACE_NUMBER)
    except Exception:
        pass
    try:
        usb.util.dispose_resources(dev)
    except Exception:
        pass


def _write(dev, ep: int, payload: bytes, timeout_ms: int = 500) -> None:
    dev.write(ep, payload, timeout=timeout_ms)


def _try_read(dev, ep: int, length: int, timeout_ms: int) -> bytes | None:
    import usb.core  # type: ignore
    try:
        data = dev.read(ep, length, timeout=timeout_ms)
        return bytes(data)
    except usb.core.USBTimeoutError:  # type: ignore[attr-defined]
        return None
    except usb.core.USBError as exc:  # type: ignore[attr-defined]
        if getattr(exc, "errno", None) == 110:
            return None
        raise


def _send_primer(dev) -> bool:
    try:
        _write(dev, EP_CONTROL_OUT, LED_CHANNEL_PRIMER)
        return True
    except Exception as exc:
        print(f"    primer failed: {type(exc).__name__}: {exc}")
        return False


def _send(dev, ep: int, payload: bytes, label: str) -> bool:
    try:
        _write(dev, ep, payload)
        print(f"    {label}: OK ({len(payload)}B)")
        return True
    except Exception as exc:
        print(f"    {label}: FAIL ({type(exc).__name__}: {exc})")
        return False


def _pad_to(payload: bytes, size: int) -> bytes:
    if len(payload) >= size:
        return payload
    return payload + bytes(size - len(payload))


def variant(name: str, description: str):
    def decorator(fn):
        fn._name = name
        fn._desc = description
        return fn
    return decorator


VARIANTS = []


def _register(fn):
    VARIANTS.append(fn)
    return fn


@_register
@variant("V0", "baseline: primer + g0 + g1 (known-fail control)")
def v0(dev, g0: bytes, g1: bytes) -> bool:
    if not _send_primer(dev):
        return False
    if not _send(dev, EP_CONTROL_OUT, g0, "g0"):
        return False
    return _send(dev, EP_CONTROL_OUT, g1, "g1")


@_register
@variant("V1", "primer + g0 + 5ms sleep + g1")
def v1(dev, g0: bytes, g1: bytes) -> bool:
    if not _send_primer(dev):
        return False
    if not _send(dev, EP_CONTROL_OUT, g0, "g0"):
        return False
    time.sleep(0.005)
    return _send(dev, EP_CONTROL_OUT, g1, "g1")


@_register
@variant("V2", "primer + g0 + read(0x81) + g1")
def v2(dev, g0: bytes, g1: bytes) -> bool:
    if not _send_primer(dev):
        return False
    if not _send(dev, EP_CONTROL_OUT, g0, "g0"):
        return False
    r = _try_read(dev, EP_BUTTONS_IN, 64, 2)
    print(f"    read 0x81: {len(r) if r else 0}B")
    return _send(dev, EP_CONTROL_OUT, g1, "g1")


@_register
@variant("V3", "primer + g0 + read(0x84) + g1")
def v3(dev, g0: bytes, g1: bytes) -> bool:
    if not _send_primer(dev):
        return False
    if not _send(dev, EP_CONTROL_OUT, g0, "g0"):
        return False
    r = _try_read(dev, EP_PADS_IN, 64, 2)
    print(f"    read 0x84: {len(r) if r else 0}B")
    return _send(dev, EP_CONTROL_OUT, g1, "g1")


@_register
@variant("V4", "primer + g1 + g0 (reversed)")
def v4(dev, g0: bytes, g1: bytes) -> bool:
    if not _send_primer(dev):
        return False
    if not _send(dev, EP_CONTROL_OUT, g1, "g1"):
        return False
    return _send(dev, EP_CONTROL_OUT, g0, "g0")


@_register
@variant("V5", "primer + g1 alone")
def v5(dev, g0: bytes, g1: bytes) -> bool:
    if not _send_primer(dev):
        return False
    return _send(dev, EP_CONTROL_OUT, g1, "g1-alone")


@_register
@variant("V6", "primer + g0 padded to 64B + g1 padded to 64B")
def v6(dev, g0: bytes, g1: bytes) -> bool:
    if not _send_primer(dev):
        return False
    if not _send(dev, EP_CONTROL_OUT, _pad_to(g0, 64), "g0-64"):
        return False
    return _send(dev, EP_CONTROL_OUT, _pad_to(g1, 64), "g1-64")


@_register
@variant("V7", "primer + g0 padded to 512B + g1 padded to 512B")
def v7(dev, g0: bytes, g1: bytes) -> bool:
    if not _send_primer(dev):
        return False
    if not _send(dev, EP_CONTROL_OUT, _pad_to(g0, 512), "g0-512"):
        return False
    return _send(dev, EP_CONTROL_OUT, _pad_to(g1, 512), "g1-512")


@_register
@variant("V16", "primer + g0 + clear_halt(0x01) + g1 (prophylactic clear)")
def v16(dev, g0: bytes, g1: bytes) -> bool:
    """Clear a phantom stall before the second write."""
    if not _send_primer(dev):
        return False
    if not _send(dev, EP_CONTROL_OUT, g0, "g0"):
        return False
    try:
        dev.clear_halt(EP_CONTROL_OUT)
        print("    clear_halt(0x01) OK")
    except Exception as exc:
        print(f"    clear_halt failed: {exc}")
    return _send(dev, EP_CONTROL_OUT, g1, "g1")


@_register
@variant("V17", "primer + g0 + reset_endpoint_via_sysfs(0x01) + g1")
def v17(dev, g0: bytes, g1: bytes) -> bool:
    """Use sysfs reset_ep control to fully reset endpoint 0x01 between writes."""
    if not _send_primer(dev):
        return False
    if not _send(dev, EP_CONTROL_OUT, g0, "g0"):
        return False
    # There's no direct pyusb wrapper — rely on clear_halt and a small sleep
    try:
        dev.clear_halt(EP_CONTROL_OUT)
    except Exception:
        pass
    time.sleep(0.01)
    return _send(dev, EP_CONTROL_OUT, g1, "g1")


@_register
@variant("V13", "cabl-exact init (display init both + black frames + primer + g0 + g1)")
def v13(dev, g0: bytes, g1: bytes) -> bool:
    """Full cabl init order — research agent's top suspect."""
    from app.services.maschine.mk1_protocol import (
        EP_DISPLAY_OUT, DISPLAY_FRAMEBUFFER_SIZE,
        build_display_init_packets, build_display_frame_packets,
    )
    black = bytes(DISPLAY_FRAMEBUFFER_SIZE)
    for d in (0, 1):
        for pkt, delay in build_display_init_packets(d):
            _write(dev, EP_DISPLAY_OUT, pkt)
            if delay:
                time.sleep(delay / 1000.0)
    print("    display init both OK")
    for d in (0, 1):
        for pkt in build_display_frame_packets(d, black):
            _write(dev, EP_DISPLAY_OUT, pkt)
    print("    black frames OK")
    if not _send_primer(dev):
        return False
    if not _send(dev, EP_CONTROL_OUT, g0, "g0"):
        return False
    return _send(dev, EP_CONTROL_OUT, g1, "g1")


@_register
@variant("V14", "primer + g0 + g1 + clear_halt(0x01) retry g1")
def v14(dev, g0: bytes, g1: bytes) -> bool:
    """If g1 times out, clear_halt and retry — tests stall recovery."""
    import usb.util  # type: ignore
    if not _send_primer(dev):
        return False
    if not _send(dev, EP_CONTROL_OUT, g0, "g0"):
        return False
    try:
        _write(dev, EP_CONTROL_OUT, g1)
        print("    g1 first try: OK")
        return True
    except Exception as exc:
        print(f"    g1 first try: FAIL ({type(exc).__name__})")
    try:
        dev.clear_halt(EP_CONTROL_OUT)
        print("    clear_halt(0x01) OK")
    except Exception as exc:
        print(f"    clear_halt failed: {exc}")
        return False
    return _send(dev, EP_CONTROL_OUT, g1, "g1 retry")


@_register
@variant("V15", "explicit set_configuration(1) + re-alt + primer + g0 + g1")
def v15(dev, g0: bytes, g1: bytes) -> bool:
    """Re-set configuration explicitly after claim, matching cabl driver init."""
    import usb.util  # type: ignore
    try:
        usb.util.release_interface(dev, INTERFACE_NUMBER)
    except Exception:
        pass
    try:
        dev.set_configuration(1)
        usb.util.claim_interface(dev, INTERFACE_NUMBER)
        dev.set_interface_altsetting(interface=INTERFACE_NUMBER, alternate_setting=INTERFACE_ALT_SETTING)
        print("    set_configuration(1) + re-claim + re-alt OK")
    except Exception as exc:
        print(f"    re-setup failed: {exc}")
        return False
    if not _send_primer(dev):
        return False
    if not _send(dev, EP_CONTROL_OUT, g0, "g0"):
        return False
    return _send(dev, EP_CONTROL_OUT, g1, "g1")


@_register
@variant("V9", "primer + g0 + g1_alt_header_0C00")
def v9(dev, g0: bytes, g1: bytes) -> bool:
    """What if 0x0C 0x1E is wrong and the device only speaks 0x0C 0x00?"""
    if not _send_primer(dev):
        return False
    if not _send(dev, EP_CONTROL_OUT, g0, "g0"):
        return False
    g1_alt = bytes([0x0C, 0x00]) + g1[2:]
    return _send(dev, EP_CONTROL_OUT, g1_alt, "g1-0C00")


@_register
@variant("V10", "primer + g0 + g1_length30 (trim payload to 30 bytes)")
def v10(dev, g0: bytes, g1: bytes) -> bool:
    """What if 0x1E is a length field meaning 30 bytes, not 31?"""
    if not _send_primer(dev):
        return False
    if not _send(dev, EP_CONTROL_OUT, g0, "g0"):
        return False
    g1_trim = bytes([0x0C, 0x1E]) + g1[2:2 + 30]  # header + 30 bytes = 32 total
    return _send(dev, EP_CONTROL_OUT, g1_trim, "g1-trim30")


@_register
@variant("V11", "primer + single 64B combined g0||g1 payload with 0C00 header")
def v11(dev, g0: bytes, g1: bytes) -> bool:
    """What if the device wants ONE 64-byte LED write (0C 00 + 62 LED bytes)?"""
    if not _send_primer(dev):
        return False
    combined = bytes([0x0C, 0x00]) + g0[2:] + g1[2:]  # 2 + 31 + 31 = 64 bytes
    return _send(dev, EP_CONTROL_OUT, combined, "g0+g1-64")


@_register
@variant("V12", "primer + single 62B LED write with no header")
def v12(dev, g0: bytes, g1: bytes) -> bool:
    """What if LED writes are raw 62-byte blobs, no header at all?"""
    if not _send_primer(dev):
        return False
    payload = g0[2:] + g1[2:]  # 31 + 31 = 62
    return _send(dev, EP_CONTROL_OUT, payload, "62B-raw")


@_register
@variant("V8", "ctypes libusb direct (no pyusb), primer + g0 + g1")
def v8_ctypes(dev, g0: bytes, g1: bytes) -> bool:
    # Drop pyusb entirely — talk to libusb-1.0 via ctypes. V8 runs in its OWN
    # device-open cycle (main() detects V8 specially and skips _open/_close).
    try:
        lib = ctypes.CDLL("libusb-1.0.so.0")
    except OSError as exc:
        print(f"    ctypes: cannot load libusb: {exc}")
        return False

    lib.libusb_init.argtypes = [ctypes.c_void_p]
    lib.libusb_init.restype = ctypes.c_int
    lib.libusb_exit.argtypes = [ctypes.c_void_p]
    lib.libusb_open_device_with_vid_pid.argtypes = [
        ctypes.c_void_p, ctypes.c_uint16, ctypes.c_uint16
    ]
    lib.libusb_open_device_with_vid_pid.restype = ctypes.c_void_p
    lib.libusb_close.argtypes = [ctypes.c_void_p]
    lib.libusb_claim_interface.argtypes = [ctypes.c_void_p, ctypes.c_int]
    lib.libusb_claim_interface.restype = ctypes.c_int
    lib.libusb_release_interface.argtypes = [ctypes.c_void_p, ctypes.c_int]
    lib.libusb_set_interface_alt_setting.argtypes = [
        ctypes.c_void_p, ctypes.c_int, ctypes.c_int
    ]
    lib.libusb_set_interface_alt_setting.restype = ctypes.c_int
    lib.libusb_set_auto_detach_kernel_driver.argtypes = [ctypes.c_void_p, ctypes.c_int]
    lib.libusb_set_auto_detach_kernel_driver.restype = ctypes.c_int
    lib.libusb_bulk_transfer.argtypes = [
        ctypes.c_void_p,
        ctypes.c_ubyte,
        ctypes.POINTER(ctypes.c_ubyte),
        ctypes.c_int,
        ctypes.POINTER(ctypes.c_int),
        ctypes.c_uint,
    ]
    lib.libusb_bulk_transfer.restype = ctypes.c_int

    rc = lib.libusb_init(None)
    if rc < 0:
        print(f"    ctypes: libusb_init failed rc={rc}")
        return False

    handle = lib.libusb_open_device_with_vid_pid(None, VENDOR_ID, PRODUCT_ID)
    if not handle:
        print("    ctypes: could not open device")
        lib.libusb_exit(None)
        return False

    try:
        lib.libusb_set_auto_detach_kernel_driver(handle, 1)
        rc = lib.libusb_claim_interface(handle, INTERFACE_NUMBER)
        if rc < 0:
            print(f"    ctypes: claim_interface rc={rc}")
            return False
        rc = lib.libusb_set_interface_alt_setting(
            handle, INTERFACE_NUMBER, INTERFACE_ALT_SETTING
        )
        if rc < 0:
            print(f"    ctypes: set_interface_alt_setting rc={rc}")
            return False

        def bulk_write(ep: int, payload: bytes, label: str) -> bool:
            buf_t = ctypes.c_ubyte * len(payload)
            buf = buf_t(*payload)
            transferred = ctypes.c_int(0)
            rc = lib.libusb_bulk_transfer(
                handle, ep, buf, len(payload), ctypes.byref(transferred), 500
            )
            if rc != 0:
                print(f"    {label}: FAIL (libusb rc={rc}, sent={transferred.value})")
                return False
            print(f"    {label}: OK ({transferred.value}B)")
            return True

        ok = True
        ok &= bulk_write(EP_CONTROL_OUT, LED_CHANNEL_PRIMER, "ctypes primer")
        if not ok:
            return False
        ok &= bulk_write(EP_CONTROL_OUT, g0, "ctypes g0")
        if not ok:
            return False
        ok &= bulk_write(EP_CONTROL_OUT, g1, "ctypes g1")
        return ok
    finally:
        try:
            lib.libusb_release_interface(handle, INTERFACE_NUMBER)
        except Exception:
            pass
        try:
            lib.libusb_close(handle)
        except Exception:
            pass
        lib.libusb_exit(None)


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "variant",
        nargs="?",
        default=None,
        help="Variant name to run (V0..V8). Omit to list variants.",
    )
    args = parser.parse_args()

    if args.variant is None:
        print("Usage: maschine_led_diagnose.py <VARIANT>")
        print("Run ONE variant per cold device (unplug + replug between runs).")
        print()
        print("Available variants:")
        for fn in VARIANTS:
            print(f"  {fn._name}  {fn._desc}")
        print()
        print("Recommended order (cheapest → weirdest):")
        print("  V8 (bypass pyusb via ctypes) — if this works, it's a pyusb binding issue")
        print("  V1 (sleep)      V2,V3 (read drain)")
        print("  V6,V7 (pad out) V4 (reversed)    V5 (g1 alone)")
        return 0

    wanted = args.variant.upper()
    fn = next((v for v in VARIANTS if v._name == wanted), None)
    if fn is None:
        print(f"Unknown variant '{args.variant}'. Known: {', '.join(v._name for v in VARIANTS)}")
        return 2

    print(f"Maschine MK1 LED diagnostic — {fn._name}")
    print(f"  {fn._desc}\n")

    leds = _make_led_state()
    g0, g1 = build_led_packets(leds)
    print(f"g0: {g0.hex()}")
    print(f"g1: {g1.hex()}\n")

    dev = None
    if fn._name != "V8":
        # V8 uses its own ctypes open, not pyusb
        dev = _find_device()
        _open(dev)
        print(f"Opened via pyusb bus={dev.bus} addr={dev.address}\n")

    try:
        success = fn(dev, g0, g1)
    except Exception as exc:
        print(f"variant raised: {type(exc).__name__}: {exc}")
        success = False

    print()
    if success:
        print(f"✓ {fn._name} SUCCEEDED")
        print("Look at the device: if pads + Play + TransportLeft + GroupA + backlight are lit,")
        print("the whole LED path works. If only pads + Play are lit, only g0 went through.")
    else:
        print(f"✗ {fn._name} FAILED — EP 0x01 is now wedged. Physically unplug + replug before next run.")

    if dev is not None:
        try:
            _close(dev)
        except Exception:
            pass
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
