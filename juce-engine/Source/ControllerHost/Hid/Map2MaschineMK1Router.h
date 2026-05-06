// T2459-H4 slice 15 — Maschine MK1 host-side bulk-frame router.
//
// Header-only router that consumes MaschineBulkFrame IPC envelopes
// (slice 13 schema) from the daemon and dispatches them to the
// device transport. Two kinds are routed:
//   - "led"     → write to EP_CONTROL_OUT (0x01)
//   - "display" → write to EP_DISPLAY_OUT (0x08)
//
// The transport is abstracted behind an injectable interface so the
// router can be unit-tested without libusb. The production
// implementation will plug a libusb-backed transport into
// `Map2MaschineMK1Router::setTransport()`; the test target uses a
// stub transport that records the calls.
//
// The router also exposes a `handleHidInputBuffer(...)` entry point
// that takes a raw HID buffer + report tag, dispatches to the slice-14
// decoders, and translates the resulting events into
// `MaschineHidEvent` IPC envelopes via an injectable publisher.

#pragma once

#include <array>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

#include "ControllerHost/Hid/Map2MaschineMK1.h"

namespace map2 {
namespace controller_host {
namespace maschine_mk1 {

// ---------------------------------------------------------------------------
// Transport abstraction — the production wiring (slice 17 HIL) plugs
// a libusb writer here; the test target plugs a recorder.
// ---------------------------------------------------------------------------

struct BulkWriteRequest
{
    std::uint8_t           endpoint = 0;   // kEpControlOut | kEpDisplayOut
    std::vector<std::uint8_t> bytes;       // raw bytes to write
};

using BulkWriter = std::function<bool(const BulkWriteRequest&)>;

struct HidEventOut
{
    std::string               kind;        // "pad" | "button" | "encoder"
    std::int64_t              timestampNs = 0;
    std::vector<std::uint8_t> bytes;
};

using HidEventPublisher = std::function<void(const HidEventOut&)>;

// Diagnostics counters operator surfaces poll. Mirrors the daemon's
// MaschineMK1HostClientTransport.diagnostics_snapshot so the operator
// UI shows symmetric numbers on both sides.
struct RouterDiagnostics
{
    std::uint64_t led_writes_total      = 0;
    std::uint64_t led_writes_succeeded  = 0;
    std::uint64_t display_writes_total  = 0;
    std::uint64_t display_writes_succeeded = 0;
    std::uint64_t init_requests_handled = 0;
    std::uint64_t hid_pad_events        = 0;
    std::uint64_t hid_button_events     = 0;
    std::uint64_t hid_encoder_events    = 0;
    std::uint64_t hid_dropped_unknown_tag = 0;
};

class Map2MaschineMK1Router
{
public:
    // Inject the transport + publisher. Both are optional; if absent,
    // routes are counted but no write/publish happens (used by tests
    // that only care about diagnostics or by a slice-15 stub mode).
    void setBulkWriter(BulkWriter writer)
    {
        bulkWriter_ = std::move(writer);
    }

    void setHidEventPublisher(HidEventPublisher publisher)
    {
        hidPublisher_ = std::move(publisher);
    }

    // ---------------------------------------------------------------
    // Bulk frame handling — daemon → host inbound MaschineBulkFrame.
    // ---------------------------------------------------------------

    // Returns true iff the frame was successfully dispatched to the
    // transport. False if (a) the kind is unrecognized or
    // (b) the writer returned false. In stub mode (no writer wired
    // up), returns false but still increments the "total" counter.
    bool handleBulkFrame(const std::string& kind,
                         const std::uint8_t* bytes,
                         std::size_t         len)
    {
        std::uint8_t endpoint = 0;
        if (kind == "led")
        {
            ++diagnostics_.led_writes_total;
            endpoint = kEpControlOut;
        }
        else if (kind == "display")
        {
            ++diagnostics_.display_writes_total;
            endpoint = kEpDisplayOut;
        }
        else
        {
            return false;
        }

        if (! bulkWriter_)
            return false;

        BulkWriteRequest req;
        req.endpoint = endpoint;
        req.bytes.assign(bytes, bytes + len);
        const bool ok = bulkWriter_(req);
        if (ok)
        {
            if (kind == "led")
                ++diagnostics_.led_writes_succeeded;
            else
                ++diagnostics_.display_writes_succeeded;
        }
        return ok;
    }

    // Boot-time init request — daemon → host. Production transport
    // sends the init packet sequence (interface alt setting + LED
    // primer). The router itself just counts + delegates; the actual
    // bytes come from a caller-supplied factory in production.
    bool handleInitRequest(const std::vector<std::vector<std::uint8_t>>& packets)
    {
        ++diagnostics_.init_requests_handled;
        if (! bulkWriter_)
            return false;
        bool allOk = true;
        for (const auto& pkt : packets)
        {
            BulkWriteRequest req;
            req.endpoint = kEpControlOut;
            req.bytes    = pkt;
            if (! bulkWriter_(req))
                allOk = false;
        }
        return allOk;
    }

    // ---------------------------------------------------------------
    // HID input handling — raw HID buffer → MaschineHidEvent envelopes.
    // ---------------------------------------------------------------

    // Pad reports come from EP_PADS_IN; tag is implicit (the entire
    // 64-byte buffer is a pad report). One MaschineHidEvent is
    // emitted per PadEvent the slice-14 decoder produces.
    std::size_t handlePadInput(const std::uint8_t* raw,
                                std::size_t          len,
                                std::int64_t         timestampNs)
    {
        const auto events = decodePadReport(raw, len, padTracked_);
        for (const auto& e : events)
        {
            ++diagnostics_.hid_pad_events;
            if (hidPublisher_)
            {
                HidEventOut out;
                out.kind        = "pad";
                out.timestampNs = timestampNs;
                // Wire shape: [pad_index, pressure_high, pressure_low, pressed_flag]
                out.bytes = {
                    static_cast<std::uint8_t>(e.pad & 0xFF),
                    static_cast<std::uint8_t>((e.pressure >> 8) & 0xFF),
                    static_cast<std::uint8_t>(e.pressure & 0xFF),
                    static_cast<std::uint8_t>(e.pressed ? 1 : 0),
                };
                hidPublisher_(out);
            }
        }
        return events.size();
    }

    // Buttons + encoders share EP_BUTTONS_IN and arrive tagged. The
    // first byte selects the decoder.
    std::size_t handleButtonsEncodersInput(const std::uint8_t* raw,
                                           std::size_t          len,
                                           std::int64_t         timestampNs)
    {
        if (len < 1)
        {
            return 0;
        }
        const std::uint8_t tag = raw[0];
        if (tag == kReportTagButtons)
        {
            const auto changes = decodeButtonReport(raw, len, buttonState_);
            for (const auto& c : changes)
            {
                ++diagnostics_.hid_button_events;
                if (hidPublisher_)
                {
                    HidEventOut out;
                    out.kind        = "button";
                    out.timestampNs = timestampNs;
                    out.bytes = {
                        static_cast<std::uint8_t>(c.button & 0xFF),
                        static_cast<std::uint8_t>(c.pressed ? 1 : 0),
                    };
                    hidPublisher_(out);
                }
            }
            return changes.size();
        }
        if (tag == kReportTagEncoders)
        {
            const auto deltas = decodeEncoderReport(raw, len, encoderState_);
            for (const auto& d : deltas)
            {
                ++diagnostics_.hid_encoder_events;
                if (hidPublisher_)
                {
                    HidEventOut out;
                    out.kind        = "encoder";
                    out.timestampNs = timestampNs;
                    // Sign-encoded direction: pack 0 / 1 (negative flag) +
                    // absolute delta as +1.
                    out.bytes = {
                        static_cast<std::uint8_t>(d.encoder & 0xFF),
                        static_cast<std::uint8_t>(d.direction > 0 ? 1 : 0),
                    };
                    hidPublisher_(out);
                }
            }
            return deltas.size();
        }
        ++diagnostics_.hid_dropped_unknown_tag;
        return 0;
    }

    const RouterDiagnostics& diagnostics() const noexcept { return diagnostics_; }

    void resetDiagnostics() noexcept
    {
        diagnostics_ = RouterDiagnostics{};
    }

private:
    BulkWriter         bulkWriter_;
    HidEventPublisher  hidPublisher_;
    RouterDiagnostics  diagnostics_;

    std::array<bool, kPadCount>      padTracked_{};
    std::array<bool, kNumButtons>    buttonState_{};
    EncoderState                     encoderState_{};
};

}  // namespace maschine_mk1
}  // namespace controller_host
}  // namespace map2
