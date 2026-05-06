// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2459-H4 slice 15 — Map2MaschineMK1Router tests.
//
// Validates the host-side router that consumes MaschineBulkFrame
// envelopes from the daemon and dispatches them to the device
// transport, plus the HID input → MaschineHidEvent publisher path.

#include <catch2/catch_test_macros.hpp>

#include "ControllerHost/Hid/Map2MaschineMK1Router.h"

#include <cstdint>
#include <string>
#include <vector>

namespace mk1 = map2::controller_host::maschine_mk1;

namespace
{

struct WriteRecorder
{
    std::vector<mk1::BulkWriteRequest> writes;
    bool                                returnSuccess = true;

    mk1::BulkWriter writer()
    {
        return [this](const mk1::BulkWriteRequest& req) {
            writes.push_back(req);
            return returnSuccess;
        };
    }
};

struct EventRecorder
{
    std::vector<mk1::HidEventOut> events;

    mk1::HidEventPublisher publisher()
    {
        return [this](const mk1::HidEventOut& e) {
            events.push_back(e);
        };
    }
};

}  // namespace

// ---------------------------------------------------------------------------
// Bulk frame routing
// ---------------------------------------------------------------------------

TEST_CASE("router dispatches led frames to EP_CONTROL_OUT", "[mk1][router]")
{
    mk1::Map2MaschineMK1Router router;
    WriteRecorder rec;
    router.setBulkWriter(rec.writer());

    const std::vector<std::uint8_t> body = {0x0B, 0xFF, 0x02, 0x05, 0xAA, 0xBB};
    const bool ok = router.handleBulkFrame("led", body.data(), body.size());

    REQUIRE(ok);
    REQUIRE(rec.writes.size() == 1);
    REQUIRE(rec.writes[0].endpoint == mk1::kEpControlOut);
    REQUIRE(rec.writes[0].bytes == body);
    REQUIRE(router.diagnostics().led_writes_total      == 1);
    REQUIRE(router.diagnostics().led_writes_succeeded  == 1);
    REQUIRE(router.diagnostics().display_writes_total  == 0);
}

TEST_CASE("router dispatches display frames to EP_DISPLAY_OUT", "[mk1][router]")
{
    mk1::Map2MaschineMK1Router router;
    WriteRecorder rec;
    router.setBulkWriter(rec.writer());

    std::vector<std::uint8_t> body(1024, 0x33);
    const bool ok = router.handleBulkFrame("display", body.data(), body.size());

    REQUIRE(ok);
    REQUIRE(rec.writes.size() == 1);
    REQUIRE(rec.writes[0].endpoint == mk1::kEpDisplayOut);
    REQUIRE(rec.writes[0].bytes.size() == 1024);
    REQUIRE(router.diagnostics().display_writes_total == 1);
    REQUIRE(router.diagnostics().display_writes_succeeded == 1);
}

TEST_CASE("router rejects unknown bulk-frame kinds", "[mk1][router]")
{
    mk1::Map2MaschineMK1Router router;
    WriteRecorder rec;
    router.setBulkWriter(rec.writer());

    const std::vector<std::uint8_t> body = {0x01, 0x02};
    const bool ok = router.handleBulkFrame("midi", body.data(), body.size());

    REQUIRE_FALSE(ok);
    REQUIRE(rec.writes.empty());
    REQUIRE(router.diagnostics().led_writes_total == 0);
    REQUIRE(router.diagnostics().display_writes_total == 0);
}

TEST_CASE("router stub mode: no transport wired → counts but doesn't crash",
          "[mk1][router]")
{
    mk1::Map2MaschineMK1Router router;
    const std::vector<std::uint8_t> body = {0x01};
    const bool ok = router.handleBulkFrame("led", body.data(), body.size());
    REQUIRE_FALSE(ok);
    REQUIRE(router.diagnostics().led_writes_total      == 1);
    REQUIRE(router.diagnostics().led_writes_succeeded  == 0);
}

TEST_CASE("router records succeeded vs total when writer fails",
          "[mk1][router]")
{
    mk1::Map2MaschineMK1Router router;
    WriteRecorder rec;
    rec.returnSuccess = false;
    router.setBulkWriter(rec.writer());

    const std::vector<std::uint8_t> body = {0x01};
    REQUIRE_FALSE(router.handleBulkFrame("led", body.data(), body.size()));

    REQUIRE(router.diagnostics().led_writes_total      == 1);
    REQUIRE(router.diagnostics().led_writes_succeeded  == 0);
    // Writer was still invoked, just returned false.
    REQUIRE(rec.writes.size() == 1);
}

// ---------------------------------------------------------------------------
// Init request routing
// ---------------------------------------------------------------------------

TEST_CASE("router init request writes every supplied packet to EP_CONTROL_OUT",
          "[mk1][router]")
{
    mk1::Map2MaschineMK1Router router;
    WriteRecorder rec;
    router.setBulkWriter(rec.writer());

    const std::vector<std::vector<std::uint8_t>> packets = {
        {0x0B, 0xFF, 0x02, 0x05},   // primer
        {0x00, 0x01, 0x02, 0x03},   // dummy follow-up
    };
    REQUIRE(router.handleInitRequest(packets));
    REQUIRE(router.diagnostics().init_requests_handled == 1);
    REQUIRE(rec.writes.size() == 2);
    for (const auto& w : rec.writes)
        REQUIRE(w.endpoint == mk1::kEpControlOut);
}

// ---------------------------------------------------------------------------
// HID input → publisher
// ---------------------------------------------------------------------------

TEST_CASE("router pad input emits pad MaschineHidEvent records",
          "[mk1][router][hid]")
{
    mk1::Map2MaschineMK1Router router;
    EventRecorder rec;
    router.setHidEventPublisher(rec.publisher());

    // Pad index 9, pressure 1024 (above threshold)
    std::array<std::uint8_t, 64> raw{};
    raw[1] = static_cast<std::uint8_t>(((9 & 0xF) << 4) | ((1024 >> 8) & 0xF));
    raw[2] = static_cast<std::uint8_t>(1024 & 0xFF);

    const auto count = router.handlePadInput(raw.data(), raw.size(),
                                             /*ts*/ 1'700'000'000'000'000'000);
    REQUIRE(count >= 1);
    REQUIRE(rec.events.size() >= 1);
    REQUIRE(rec.events.front().kind == "pad");
    REQUIRE(rec.events.front().bytes.size() == 4);
    REQUIRE(rec.events.front().bytes[0] == 9);
    REQUIRE(rec.events.front().bytes[3] == 1);  // pressed flag
    REQUIRE(router.diagnostics().hid_pad_events >= 1);
}

TEST_CASE("router button input emits button MaschineHidEvent records",
          "[mk1][router][hid]")
{
    mk1::Map2MaschineMK1Router router;
    EventRecorder rec;
    router.setHidEventPublisher(rec.publisher());

    // Tag + 7-byte button bitmap with gate bit set + button 3 pressed.
    std::array<std::uint8_t, 8> raw{};
    raw[0] = mk1::kReportTagButtons;
    raw[1 + (3 >> 3) + 1] = 0;    // ensure other bytes zero
    raw[1 + (3 >> 3)] = static_cast<std::uint8_t>(1 << (3 & 7));
    raw[7] = 0x40;  // gate bit (offset 6 in the data block; tag+0..6)

    const auto count = router.handleButtonsEncodersInput(raw.data(), raw.size(),
                                                          /*ts*/ 0);
    REQUIRE(count == 1);
    REQUIRE(rec.events.size() == 1);
    REQUIRE(rec.events.front().kind == "button");
    REQUIRE(rec.events.front().bytes.size() == 2);
    REQUIRE(rec.events.front().bytes[0] == 3);
    REQUIRE(rec.events.front().bytes[1] == 1);
    REQUIRE(router.diagnostics().hid_button_events == 1);
}

TEST_CASE("router encoder input requires a second observation to emit",
          "[mk1][router][hid]")
{
    mk1::Map2MaschineMK1Router router;
    EventRecorder rec;
    router.setHidEventPublisher(rec.publisher());

    std::array<std::uint8_t, 1 + 2 * mk1::kNumEncoders> rawA{};
    rawA[0] = mk1::kReportTagEncoders;
    rawA[1 + 2 * 1]     = 0x10;  // wire 1 → logical 4
    rawA[1 + 2 * 1 + 1] = 0x10;
    REQUIRE(router.handleButtonsEncodersInput(rawA.data(), rawA.size(), 0) == 0);
    REQUIRE(rec.events.empty());

    auto rawB = rawA;
    rawB[1 + 2 * 1]     = 0x20;
    rawB[1 + 2 * 1 + 1] = 0x20;
    REQUIRE(router.handleButtonsEncodersInput(rawB.data(), rawB.size(), 0) == 1);
    REQUIRE(rec.events.size() == 1);
    REQUIRE(rec.events.front().kind == "encoder");
    REQUIRE(rec.events.front().bytes.size() == 2);
    REQUIRE(rec.events.front().bytes[0] == 4);  // logical index
    REQUIRE(router.diagnostics().hid_encoder_events == 1);
}

TEST_CASE("router drops unknown HID report tags + counts them",
          "[mk1][router][hid]")
{
    mk1::Map2MaschineMK1Router router;
    EventRecorder rec;
    router.setHidEventPublisher(rec.publisher());

    std::array<std::uint8_t, 8> raw{};
    raw[0] = 0x99;  // unknown tag
    REQUIRE(router.handleButtonsEncodersInput(raw.data(), raw.size(), 0) == 0);
    REQUIRE(rec.events.empty());
    REQUIRE(router.diagnostics().hid_dropped_unknown_tag == 1);
}

TEST_CASE("router resetDiagnostics zeroes every counter", "[mk1][router]")
{
    mk1::Map2MaschineMK1Router router;
    WriteRecorder rec;
    router.setBulkWriter(rec.writer());
    const std::vector<std::uint8_t> body = {0x01};
    router.handleBulkFrame("led", body.data(), body.size());
    REQUIRE(router.diagnostics().led_writes_total > 0);

    router.resetDiagnostics();
    REQUIRE(router.diagnostics().led_writes_total      == 0);
    REQUIRE(router.diagnostics().led_writes_succeeded  == 0);
    REQUIRE(router.diagnostics().hid_pad_events        == 0);
}
