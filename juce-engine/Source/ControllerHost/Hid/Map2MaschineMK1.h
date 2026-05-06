// T2459-H4 slice 14 — Maschine MK1 HID input parser (C++ port).
//
// Pure header-only port of app/services/maschine/mk1_protocol.py's
// three input decoders:
//   - decode_pad_report     → decodePadReport
//   - decode_button_report  → decodeButtonReport
//   - decode_encoder_report → decodeEncoderReport
//
// The host (slice 15 wires this up) reads raw HID buffers from the
// Maschine MK1 over libusb / hidapi, calls these decoders, and emits
// `MaschineHidEvent` (slice 13 schema) records over UDS to the daemon.
//
// Behavioral parity with the Python source is byte-identical — the
// Python reference is itself a transcription of cabl's MaschineMK1.cpp,
// so this header re-uses the same constants and the same logic without
// re-deriving anything from the wire protocol.
//
// Why header-only: this module has no dependencies beyond <cstdint>,
// <vector>, and <array>. Keeping it header-only lets the parity test
// (tests/Map2MaschineMK1Tests.cpp) compile + link without dragging in
// the full host (libremidi / quickjs / etc.) and lets a small focused
// Catch2 target verify the byte-shape contract independently.

#pragma once

#include <array>
#include <cstdint>
#include <vector>

namespace map2 {
namespace controller_host {
namespace maschine_mk1 {

// ---------------------------------------------------------------------------
// USB identifiers — pinned by mk1_protocol.py.
// ---------------------------------------------------------------------------

inline constexpr std::uint16_t kVendorId  = 0x17CC;
inline constexpr std::uint16_t kProductId = 0x0808;

inline constexpr std::uint8_t  kEpControlOut  = 0x01;
inline constexpr std::uint8_t  kEpDisplayOut  = 0x08;
inline constexpr std::uint8_t  kEpButtonsIn   = 0x81;
inline constexpr std::uint8_t  kEpPadsIn      = 0x84;

inline constexpr int kInterfaceNumber     = 0;
inline constexpr int kInterfaceAltSetting = 1;

// ---------------------------------------------------------------------------
// Pad decoding — mirrors decode_pad_report(...)
// ---------------------------------------------------------------------------

inline constexpr int           kPadCount        = 16;
inline constexpr std::uint16_t kPadPressureMax  = 0x0FFF;
inline constexpr std::uint16_t kPadThreshold    = 200;
inline constexpr int           kPadDataSize     = 64;

struct PadEvent
{
    int  pad      = 0;        // 0..15, raw hardware index
    int  pressure = 0;        // 0..4095
    bool pressed  = false;    // threshold-crossed
};

// Decode one bulk-in report from EP_PADS_IN. Iterates byte pairs
// (i, i+1) for i in [1, kPadDataSize-1); pad = (h>>4),
// pressure = ((h & 0xF) << 8) | l. Threshold-crosses + releases are
// emitted; ``tracked`` (16-entry array) is updated in place exactly
// like the Python reference.
inline std::vector<PadEvent> decodePadReport(
    const std::uint8_t* raw,
    std::size_t         len,
    std::array<bool, kPadCount>& tracked) noexcept
{
    std::vector<PadEvent> events;
    if (len < static_cast<std::size_t>(kPadDataSize - 1))
        return events;

    for (int i = 1; i < kPadDataSize - 1; i += 2)
    {
        const std::uint8_t h = raw[i];
        const std::uint8_t l = raw[i + 1];
        const int          pad      = (h & 0xF0) >> 4;
        const std::uint16_t pressure =
            static_cast<std::uint16_t>(((h & 0x0F) << 8) | l);

        if (pressure > kPadThreshold)
        {
            if (! tracked[pad])
                tracked[pad] = true;
            events.push_back({pad, static_cast<int>(pressure), true});
        }
        else if (tracked[pad])
        {
            tracked[pad] = false;
            events.push_back({pad, 0, false});
        }
    }
    return events;
}

// ---------------------------------------------------------------------------
// Button decoding — mirrors decode_button_report(...)
// ---------------------------------------------------------------------------

inline constexpr int kButtonsDataSize = 7;
inline constexpr int kNumButtons      = 42;
// Same Shift index Python uses (excluded from change events; consult
// `isShiftHeld()` directly). Pinned by
// tests/test_maschine_mk1_cpp_python_parity_t2459h4.py against the
// Python ``Button.Shift`` enum value.
inline constexpr int kButtonShiftIndex = 11;

inline constexpr std::uint8_t kReportTagEncoders = 0x02;
inline constexpr std::uint8_t kReportTagButtons  = 0x04;
inline constexpr std::uint8_t kReportTagMidi     = 0x06;

struct ButtonChange
{
    int  button  = 0;       // 0..41 (Shift excluded)
    bool pressed = false;
};

inline bool isShiftHeld(const std::uint8_t* raw, std::size_t len) noexcept
{
    if (len < static_cast<std::size_t>(kButtonsDataSize))
        return false;
    const int b = kButtonShiftIndex;
    return (raw[1 + (b >> 3)] & (1 << (b & 7))) != 0;
}

// Decode one 0x04-tagged report from EP_BUTTONS_IN.
// Replicates cabl processButtons + Python decode_button_report:
//   - Requires raw[6] & 0x40 set (gate bit); else returns [].
//   - Button b is pressed iff raw[1 + (b>>3)] & (1 << (b%8)).
//   - Skips Shift (kButtonShiftIndex) and any index >= kNumButtons.
//   - prevState is a 42-entry array updated in place.
inline std::vector<ButtonChange> decodeButtonReport(
    const std::uint8_t* raw,
    std::size_t         len,
    std::array<bool, kNumButtons>& prevState) noexcept
{
    std::vector<ButtonChange> changes;
    if (len < static_cast<std::size_t>(kButtonsDataSize))
        return changes;
    if ((raw[6] & 0x40) == 0)
        return changes;

    for (int byteIdx = 0; byteIdx < kButtonsDataSize; ++byteIdx)
    {
        for (int bit = 0; bit < 8; ++bit)
        {
            const int b = (byteIdx * 8) + bit;
            if (b >= kNumButtons || b == kButtonShiftIndex)
                continue;
            const std::size_t srcIdx = static_cast<std::size_t>(1 + (b >> 3));
            const std::uint8_t dataByte =
                (srcIdx < len) ? raw[srcIdx] : static_cast<std::uint8_t>(0);
            const bool pressed = (dataByte & (1 << (b & 7))) != 0;
            if (pressed != prevState[b])
            {
                prevState[b] = pressed;
                changes.push_back({b, pressed});
            }
        }
    }
    return changes;
}

// ---------------------------------------------------------------------------
// Encoder decoding — mirrors decode_encoder_report(...)
// ---------------------------------------------------------------------------

inline constexpr int kNumEncoders = 11;

// Wire index → logical index (verified vs. cabl + python). Pinned in
// tests so a future commit can't reorder these without flipping the
// parity test.
inline constexpr std::array<int, kNumEncoders> kEncoderWireToLogical = {
    8, 4, 10, 7, 3, 9, 6, 2, 0, 5, 1};

struct EncoderDelta
{
    int encoder   = 0;     // logical 0..10
    int direction = 0;     // +1 or -1
};

struct EncoderState
{
    std::array<std::uint16_t, kNumEncoders> values{};
    bool initialized = false;
};

// Decode one 0x02-tagged report from EP_BUTTONS_IN.
// Mirrors processEncoders + the Python reference. First observation
// initializes state without emitting events; subsequent observations
// infer direction from nibble-quadrant comparisons of (x, y) vs the
// previous (x, y).
inline std::vector<EncoderDelta> decodeEncoderReport(
    const std::uint8_t* raw,
    std::size_t         len,
    EncoderState&       state) noexcept
{
    std::vector<EncoderDelta> deltas;
    if (len < static_cast<std::size_t>(1 + 2 * kNumEncoders))
        return deltas;

    for (int i = 0; i < kNumEncoders; ++i)
    {
        const std::uint8_t  x   = raw[1 + 2 * i];
        const std::uint8_t  y   = raw[2 + 2 * i];
        const std::uint16_t cur = static_cast<std::uint16_t>((x << 8) | y);
        const std::uint16_t prev = state.values[i];
        if (cur == prev)
            continue;

        const std::uint8_t prevX = static_cast<std::uint8_t>((prev >> 8) & 0xFF);
        const std::uint8_t prevY = static_cast<std::uint8_t>(prev & 0xFF);

        bool valueIncreased;
        if (x > 127)
        {
            valueIncreased = (y > 127)
                ? (x < prevX && y >= prevY)
                : (x >= prevX && y >= prevY);
        }
        else
        {
            valueIncreased = (y > 127)
                ? (x < prevX && y < prevY)
                : (x >= prevX && y < prevY);
        }

        state.values[i] = cur;
        if (state.initialized)
        {
            const int logical = kEncoderWireToLogical[static_cast<std::size_t>(i)];
            deltas.push_back({logical, valueIncreased ? 1 : -1});
        }
    }
    state.initialized = true;
    return deltas;
}

}  // namespace maschine_mk1
}  // namespace controller_host
}  // namespace map2
