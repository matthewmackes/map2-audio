"""T2459-H4 slice 15 — Map2MaschineMK1Router header pin.

Pins the slice-15 router header against future drift. Runs in
plain-Python CI without needing the C++ build chain — like the
slice-14 parity test, this is a textual regression guard.

Coverage:
  - The header file exists at the canonical path.
  - It declares the four public methods slice-15 wires use:
    setBulkWriter, setHidEventPublisher, handleBulkFrame,
    handleInitRequest, handlePadInput, handleButtonsEncodersInput,
    diagnostics, resetDiagnostics.
  - It exposes the BulkWriteRequest, HidEventOut, RouterDiagnostics
    structs.
  - The Catch2 test target is wired into CMakeLists.
  - The kind discriminator strings ("led", "display", "pad",
    "button", "encoder") match the IPC schema (slice 13) shape.
"""

from __future__ import annotations

import pathlib


ROUTER_HEADER = (
    pathlib.Path(__file__).resolve().parent.parent
    / "juce-engine"
    / "Source"
    / "ControllerHost"
    / "Hid"
    / "Map2MaschineMK1Router.h"
)


def test_router_header_exists():
    assert ROUTER_HEADER.exists(), f"missing header: {ROUTER_HEADER}"


def test_router_class_present():
    text = ROUTER_HEADER.read_text()
    assert "class Map2MaschineMK1Router" in text


def test_router_public_methods_present():
    text = ROUTER_HEADER.read_text()
    expected = (
        "setBulkWriter",
        "setHidEventPublisher",
        "handleBulkFrame",
        "handleInitRequest",
        "handlePadInput",
        "handleButtonsEncodersInput",
        "diagnostics",
        "resetDiagnostics",
    )
    for name in expected:
        assert name in text, f"missing public method: {name}"


def test_router_supporting_structs_present():
    text = ROUTER_HEADER.read_text()
    for name in ("BulkWriteRequest", "HidEventOut", "RouterDiagnostics"):
        assert f"struct {name}" in text, f"missing supporting struct: {name}"


def test_router_kind_discriminators_match_ipc_schema():
    text = ROUTER_HEADER.read_text()
    # Slice 13 IPC schema declares MaschineBulkFrame.kind ∈ {"led","display"}
    assert '"led"' in text
    assert '"display"' in text
    # MaschineHidEvent.kind ∈ {"pad","button","encoder"}
    assert '"pad"' in text
    assert '"button"' in text
    assert '"encoder"' in text


def test_router_uses_correct_endpoint_constants():
    """Bulk writes must go to kEpControlOut (LED) and kEpDisplayOut
    (display) — not raw 0x01/0x08 numerics."""
    text = ROUTER_HEADER.read_text()
    assert "kEpControlOut" in text
    assert "kEpDisplayOut" in text


def test_router_header_namespace_pin():
    text = ROUTER_HEADER.read_text()
    assert "namespace map2 {" in text
    assert "namespace controller_host {" in text
    assert "namespace maschine_mk1 {" in text


def test_router_includes_decoder_header():
    """The router must consume the slice-14 decoders, not duplicate
    their constants."""
    text = ROUTER_HEADER.read_text()
    assert '#include "ControllerHost/Hid/Map2MaschineMK1.h"' in text


def test_router_diagnostics_carries_hid_event_counters():
    """Operator UI polls these counters; pin the names so a future
    rename forces a deliberate UI update."""
    text = ROUTER_HEADER.read_text()
    for counter in (
        "led_writes_total",
        "led_writes_succeeded",
        "display_writes_total",
        "display_writes_succeeded",
        "init_requests_handled",
        "hid_pad_events",
        "hid_button_events",
        "hid_encoder_events",
        "hid_dropped_unknown_tag",
    ):
        assert counter in text, f"missing diagnostics counter: {counter}"


def test_cmake_includes_router_test_target():
    cmake_path = (
        pathlib.Path(__file__).resolve().parent.parent
        / "juce-engine"
        / "CMakeLists.txt"
    )
    text = cmake_path.read_text()
    assert "Map2MaschineMK1RouterTests.cpp" in text


def test_pad_event_wire_shape_documented():
    """The router's pad-event publisher emits a 4-byte payload; pin
    the field count + ordering description so the daemon's
    receive-side decoder (added in a later slice) can rely on it."""
    text = ROUTER_HEADER.read_text()
    # Docstring comment includes the wire shape pin
    assert "pad_index, pressure_high, pressure_low, pressed_flag" in text
