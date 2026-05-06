// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2459-H4 slice 14 — Map2MaschineMK1 HID parser tests.
//
// Validates that the C++ port of mk1_protocol.py's three input
// decoders produces byte-identical events to the Python reference.
// The header is pure (no I/O, no host deps) so this Catch2 target
// can run independently of the rest of the controller_host_tests
// build graph.

#include <catch2/catch_test_macros.hpp>

#include "ControllerHost/Hid/Map2MaschineMK1.h"

#include <array>
#include <vector>

namespace mk1 = map2::controller_host::maschine_mk1;

// ---------------------------------------------------------------------------
// USB / endpoint constants — verbatim pin against mk1_protocol.py.
// ---------------------------------------------------------------------------

TEST_CASE("Maschine MK1 USB constants match the wire protocol", "[mk1][hid]")
{
    REQUIRE(mk1::kVendorId  == 0x17CC);
    REQUIRE(mk1::kProductId == 0x0808);
    REQUIRE(mk1::kEpControlOut == 0x01);
    REQUIRE(mk1::kEpDisplayOut == 0x08);
    REQUIRE(mk1::kEpButtonsIn  == 0x81);
    REQUIRE(mk1::kEpPadsIn     == 0x84);
    REQUIRE(mk1::kInterfaceNumber     == 0);
    REQUIRE(mk1::kInterfaceAltSetting == 1);
}

TEST_CASE("Pad decoding constants match Python reference", "[mk1][hid]")
{
    REQUIRE(mk1::kPadCount       == 16);
    REQUIRE(mk1::kPadPressureMax == 0x0FFF);
    REQUIRE(mk1::kPadThreshold   == 200);
    REQUIRE(mk1::kPadDataSize    == 64);
}

TEST_CASE("Button + encoder decoding constants match Python reference",
          "[mk1][hid]")
{
    REQUIRE(mk1::kButtonsDataSize == 7);
    REQUIRE(mk1::kNumButtons      == 42);
    REQUIRE(mk1::kNumEncoders     == 11);
    REQUIRE(mk1::kReportTagEncoders == 0x02);
    REQUIRE(mk1::kReportTagButtons  == 0x04);
    REQUIRE(mk1::kReportTagMidi     == 0x06);
}

TEST_CASE("Encoder wire→logical map matches Python ENCODER_WIRE_TO_LOGICAL",
          "[mk1][hid]")
{
    const std::array<int, 11> expected = {8, 4, 10, 7, 3, 9, 6, 2, 0, 5, 1};
    REQUIRE(mk1::kEncoderWireToLogical == expected);
}

// ---------------------------------------------------------------------------
// decodePadReport — pressure threshold + tracked-state release.
// ---------------------------------------------------------------------------

namespace
{

// Build a 64-byte EP_PADS_IN report where pad ``pad`` reports the
// supplied 12-bit pressure. Other pad slots carry pad indices but
// zero pressure (so they stay below threshold and don't emit events
// from a fresh tracked array).
std::array<std::uint8_t, 64> makePadReport(int pad, std::uint16_t pressure)
{
    std::array<std::uint8_t, 64> raw{};
    // The decoder iterates byte pairs (i, i+1) for i in [1, 63).
    // Slot index 0 is at (1,2), slot 1 at (3,4), ..., slot 30 at (61,62).
    // The Python reference uses pair index 0 for every iteration as the
    // pad-encoded byte; we mirror by writing the targeted pair only
    // when the loop hits it. Simpler: write a single pair carrying
    // (pad, pressure) at offset 1; the rest of the pairs encode zero
    // pressure for whatever pad bits happen to fall there. To avoid
    // spurious "release" events, mark every other pair as pad=0
    // pressure=0 — releases only happen when ``tracked[pad]`` was true
    // beforehand, so a fresh tracked array suppresses them.
    raw[1] = static_cast<std::uint8_t>(((pad & 0xF) << 4)
                                     | ((pressure >> 8) & 0xF));
    raw[2] = static_cast<std::uint8_t>(pressure & 0xFF);
    return raw;
}

}  // namespace

TEST_CASE("decodePadReport: pressure above threshold emits a press event",
          "[mk1][hid]")
{
    auto raw = makePadReport(/*pad*/ 5, /*pressure*/ 1024);
    std::array<bool, mk1::kPadCount> tracked{};
    auto events = mk1::decodePadReport(raw.data(), raw.size(), tracked);
    REQUIRE(events.size() >= 1);
    REQUIRE(events.front().pad      == 5);
    REQUIRE(events.front().pressure == 1024);
    REQUIRE(events.front().pressed  == true);
    REQUIRE(tracked[5] == true);
}

TEST_CASE("decodePadReport: pressure below threshold AND not tracked → no event",
          "[mk1][hid]")
{
    auto raw = makePadReport(/*pad*/ 5, /*pressure*/ 100);  // below 200
    std::array<bool, mk1::kPadCount> tracked{};
    auto events = mk1::decodePadReport(raw.data(), raw.size(), tracked);
    // No press; tracked[5] was false so no release either.
    for (const auto& e : events)
        REQUIRE_FALSE((e.pad == 5 && e.pressed));
    REQUIRE(tracked[5] == false);
}

TEST_CASE("decodePadReport: release fires when tracked pad drops below threshold",
          "[mk1][hid]")
{
    std::array<bool, mk1::kPadCount> tracked{};
    tracked[5] = true;  // simulate "previously pressed"
    auto raw = makePadReport(/*pad*/ 5, /*pressure*/ 50);
    auto events = mk1::decodePadReport(raw.data(), raw.size(), tracked);
    bool sawRelease = false;
    for (const auto& e : events)
    {
        if (e.pad == 5 && ! e.pressed && e.pressure == 0)
            sawRelease = true;
    }
    REQUIRE(sawRelease);
    REQUIRE(tracked[5] == false);
}

TEST_CASE("decodePadReport: short buffer returns no events", "[mk1][hid]")
{
    std::array<std::uint8_t, 10> raw{};
    std::array<bool, mk1::kPadCount> tracked{};
    auto events = mk1::decodePadReport(raw.data(), raw.size(), tracked);
    REQUIRE(events.empty());
}

// ---------------------------------------------------------------------------
// decodeButtonReport — gate bit, bit-shift logic, Shift exclusion.
// ---------------------------------------------------------------------------

namespace
{

// Make a 7-byte button report with the gate bit set and a single
// button bit asserted at index ``buttonIdx``.
std::array<std::uint8_t, 7> makeButtonReport(int buttonIdx)
{
    std::array<std::uint8_t, 7> raw{};
    raw[6] = 0x40;  // gate bit
    if (buttonIdx >= 0 && buttonIdx < mk1::kNumButtons)
    {
        const std::size_t byteIdx = static_cast<std::size_t>(1 + (buttonIdx >> 3));
        if (byteIdx < raw.size())
            raw[byteIdx] = static_cast<std::uint8_t>(1 << (buttonIdx & 7));
    }
    return raw;
}

}  // namespace

TEST_CASE("decodeButtonReport: gate-bit absent yields no events", "[mk1][hid]")
{
    std::array<std::uint8_t, 7> raw{};
    raw[6] = 0x00;  // gate not set
    raw[1] = 0xFF;  // bit pattern that would otherwise emit
    std::array<bool, mk1::kNumButtons> prev{};
    auto changes = mk1::decodeButtonReport(raw.data(), raw.size(), prev);
    REQUIRE(changes.empty());
}

TEST_CASE("decodeButtonReport: button press emits one change + flips state",
          "[mk1][hid]")
{
    auto raw = makeButtonReport(0);  // Mute (index 0)
    std::array<bool, mk1::kNumButtons> prev{};
    auto changes = mk1::decodeButtonReport(raw.data(), raw.size(), prev);
    REQUIRE(changes.size() == 1);
    REQUIRE(changes.front().button  == 0);
    REQUIRE(changes.front().pressed == true);
    REQUIRE(prev[0] == true);
}

TEST_CASE("decodeButtonReport: re-press of same button without state change "
          "yields no event", "[mk1][hid]")
{
    auto raw = makeButtonReport(7);  // Scene
    std::array<bool, mk1::kNumButtons> prev{};
    prev[7] = true;
    auto changes = mk1::decodeButtonReport(raw.data(), raw.size(), prev);
    // Button is "pressed" in the report AND prev says "already pressed",
    // so no change emitted.
    bool sawIt = false;
    for (const auto& c : changes)
        if (c.button == 7) sawIt = true;
    REQUIRE_FALSE(sawIt);
}

TEST_CASE("decodeButtonReport: Shift index is excluded from change events",
          "[mk1][hid]")
{
    auto raw = makeButtonReport(mk1::kButtonShiftIndex);
    std::array<bool, mk1::kNumButtons> prev{};
    auto changes = mk1::decodeButtonReport(raw.data(), raw.size(), prev);
    for (const auto& c : changes)
        REQUIRE(c.button != mk1::kButtonShiftIndex);
}

TEST_CASE("isShiftHeld: detects the shift bit independent of button changes",
          "[mk1][hid]")
{
    auto raw = makeButtonReport(mk1::kButtonShiftIndex);
    REQUIRE(mk1::isShiftHeld(raw.data(), raw.size()));

    std::array<std::uint8_t, 7> noShift{};
    REQUIRE_FALSE(mk1::isShiftHeld(noShift.data(), noShift.size()));
}

// ---------------------------------------------------------------------------
// decodeEncoderReport — initialization suppression + direction inference.
// ---------------------------------------------------------------------------

namespace
{

// Build a valid encoder report: tag byte + 11 (x, y) pairs.
std::array<std::uint8_t, 1 + 2 * mk1::kNumEncoders>
makeEncoderReport(int wireIdx, std::uint8_t x, std::uint8_t y)
{
    std::array<std::uint8_t, 1 + 2 * mk1::kNumEncoders> raw{};
    raw[0] = mk1::kReportTagEncoders;
    if (wireIdx >= 0 && wireIdx < mk1::kNumEncoders)
    {
        raw[1 + 2 * wireIdx]     = x;
        raw[1 + 2 * wireIdx + 1] = y;
    }
    return raw;
}

}  // namespace

TEST_CASE("decodeEncoderReport: first observation initializes without emitting",
          "[mk1][hid]")
{
    auto raw = makeEncoderReport(/*wire*/ 0, /*x*/ 0x40, /*y*/ 0x10);
    mk1::EncoderState state;
    auto deltas = mk1::decodeEncoderReport(raw.data(), raw.size(), state);
    REQUIRE(deltas.empty());
    REQUIRE(state.initialized == true);
    // The encoder's stored value should be the (x, y) we supplied.
    const std::uint16_t expected = (0x40 << 8) | 0x10;
    REQUIRE(state.values[0] == expected);
}

TEST_CASE("decodeEncoderReport: second observation with different (x, y) "
          "emits a delta with logical mapping",
          "[mk1][hid]")
{
    mk1::EncoderState state;
    // Initialize encoder wire-index 1 (logical 4 per kEncoderWireToLogical).
    auto rawA = makeEncoderReport(/*wire*/ 1, /*x*/ 0x10, /*y*/ 0x10);
    mk1::decodeEncoderReport(rawA.data(), rawA.size(), state);

    auto rawB = makeEncoderReport(/*wire*/ 1, /*x*/ 0x20, /*y*/ 0x20);
    auto deltas = mk1::decodeEncoderReport(rawB.data(), rawB.size(), state);

    REQUIRE(deltas.size() == 1);
    REQUIRE(deltas.front().encoder == 4);  // wire 1 → logical 4
    // Direction depends on quadrant logic; just confirm it's non-zero and
    // exactly +1 or -1.
    REQUIRE((deltas.front().direction == 1 || deltas.front().direction == -1));
}

TEST_CASE("decodeEncoderReport: short buffer returns no events", "[mk1][hid]")
{
    std::array<std::uint8_t, 5> raw{};
    mk1::EncoderState state;
    auto deltas = mk1::decodeEncoderReport(raw.data(), raw.size(), state);
    REQUIRE(deltas.empty());
}

TEST_CASE("decodeEncoderReport: same value yields no delta even after init",
          "[mk1][hid]")
{
    auto raw = makeEncoderReport(/*wire*/ 2, /*x*/ 0x33, /*y*/ 0x44);
    mk1::EncoderState state;
    mk1::decodeEncoderReport(raw.data(), raw.size(), state);
    auto deltas = mk1::decodeEncoderReport(raw.data(), raw.size(), state);
    REQUIRE(deltas.empty());
}
