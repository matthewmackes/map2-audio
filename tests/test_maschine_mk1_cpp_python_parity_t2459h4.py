"""T2459-H4 slice 14 — C++/Python HID-parser parity test.

Pins ``juce-engine/Source/ControllerHost/Hid/Map2MaschineMK1.h``'s
constants against ``app/services/maschine/mk1_protocol.py`` so a
future commit can't drift one side without flipping this test.

Coverage strategy:
  - Read the C++ header textually.
  - Extract the named-constant values via regex.
  - Compare against the Python module's symbols of the same name.
  - Pin the encoder wire→logical map.
  - Pin the report-tag bytes.

If the Catch2 build target is reachable, the broader behavioral
parity is covered there. This Python test is the "schema-pin" guard
that runs in CI without needing the C++ build chain.
"""

from __future__ import annotations

import pathlib
import re

from app.services.maschine import mk1_protocol as py


CPP_HEADER = (
    pathlib.Path(__file__).resolve().parent.parent
    / "juce-engine"
    / "Source"
    / "ControllerHost"
    / "Hid"
    / "Map2MaschineMK1.h"
)


def _cpp_const(name: str, header_text: str) -> int:
    """Pull a `inline constexpr ... NAME = VALUE;` out of the header."""
    pattern = (
        r"inline\s+constexpr\s+(?:[\w:]+\s+)?"
        + re.escape(name)
        + r"\s*=\s*([^;]+);"
    )
    m = re.search(pattern, header_text)
    assert m is not None, f"{name} not found in Map2MaschineMK1.h"
    raw = m.group(1).strip()
    # Numeric literal: handle hex, decimal, possibly with suffix.
    if raw.startswith("0x") or raw.startswith("0X"):
        return int(raw, 16)
    return int(raw, 10)


def _cpp_array_literal(name: str, header_text: str) -> list[int]:
    """Pull `inline constexpr std::array<int, N> NAME = { a, b, ... };`."""
    pattern = (
        r"inline\s+constexpr\s+std::array<[^>]+>\s*"
        + re.escape(name)
        + r"\s*=\s*\{([^}]+)\}\s*;"
    )
    m = re.search(pattern, header_text)
    assert m is not None, f"array {name} not found in Map2MaschineMK1.h"
    body = m.group(1)
    return [int(x.strip(), 10) for x in body.split(",") if x.strip()]


def test_cpp_header_exists():
    assert CPP_HEADER.exists(), f"missing C++ header: {CPP_HEADER}"


def test_usb_identifiers_match():
    text = CPP_HEADER.read_text()
    assert _cpp_const("kVendorId", text) == py.VENDOR_ID
    assert _cpp_const("kProductId", text) == py.PRODUCT_ID
    assert _cpp_const("kEpControlOut", text) == py.EP_CONTROL_OUT
    assert _cpp_const("kEpDisplayOut", text) == py.EP_DISPLAY_OUT
    assert _cpp_const("kEpButtonsIn", text) == py.EP_BUTTONS_IN
    assert _cpp_const("kEpPadsIn", text) == py.EP_PADS_IN
    assert _cpp_const("kInterfaceNumber", text) == py.INTERFACE_NUMBER
    assert _cpp_const("kInterfaceAltSetting", text) == py.INTERFACE_ALT_SETTING


def test_pad_constants_match():
    text = CPP_HEADER.read_text()
    assert _cpp_const("kPadCount", text) == py.PAD_COUNT
    assert _cpp_const("kPadPressureMax", text) == py.PAD_PRESSURE_MAX
    assert _cpp_const("kPadThreshold", text) == py.PAD_THRESHOLD
    assert _cpp_const("kPadDataSize", text) == py.PAD_DATA_SIZE


def test_button_constants_match():
    text = CPP_HEADER.read_text()
    assert _cpp_const("kButtonsDataSize", text) == py.BUTTONS_DATA_SIZE
    assert _cpp_const("kNumButtons", text) == py.N_BUTTONS
    assert _cpp_const("kReportTagButtons", text) == py.REPORT_TAG_BUTTONS
    assert _cpp_const("kReportTagEncoders", text) == py.REPORT_TAG_ENCODERS
    assert _cpp_const("kReportTagMidi", text) == py.REPORT_TAG_MIDI


def test_encoder_constants_match():
    text = CPP_HEADER.read_text()
    assert _cpp_const("kNumEncoders", text) == py.N_ENCODERS


def test_encoder_wire_to_logical_map_matches():
    text = CPP_HEADER.read_text()
    cpp_arr = _cpp_array_literal("kEncoderWireToLogical", text)
    assert tuple(cpp_arr) == py.ENCODER_WIRE_TO_LOGICAL


def test_button_shift_index_matches_python_enum():
    """The Python reference uses Button.Shift; the C++ header
    hard-codes the same numeric index. Pin them together."""
    text = CPP_HEADER.read_text()
    from app.services.maschine.mk1_protocol import Button

    assert _cpp_const("kButtonShiftIndex", text) == int(Button.Shift)


def test_cpp_header_exposes_decoder_function_names():
    """Greppable pin: the three decoder function names must be present
    so a future rename doesn't silently break the slice-15 host
    integration."""
    text = CPP_HEADER.read_text()
    for fn in ("decodePadReport", "decodeButtonReport", "decodeEncoderReport", "isShiftHeld"):
        assert fn in text, f"missing C++ decoder: {fn}"


def test_cmake_lists_includes_maschine_mk1_test_target():
    """CMakeLists.txt must wire Map2MaschineMK1Tests.cpp into
    controller_host_tests so the Catch2 cases land in CI."""
    cmake_path = (
        pathlib.Path(__file__).resolve().parent.parent
        / "juce-engine"
        / "CMakeLists.txt"
    )
    assert cmake_path.exists()
    text = cmake_path.read_text()
    assert "Map2MaschineMK1Tests.cpp" in text, (
        "Map2MaschineMK1Tests.cpp not wired into controller_host_tests"
    )


def test_cpp_header_namespace_pin():
    """The header is in namespace map2::controller_host::maschine_mk1.
    Slice 15 will include it; pin the namespace path."""
    text = CPP_HEADER.read_text()
    assert "namespace map2 {" in text
    assert "namespace controller_host {" in text
    assert "namespace maschine_mk1 {" in text
