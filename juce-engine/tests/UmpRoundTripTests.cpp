// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// LibremidiAdapter UMP test seam — pushUmpMessage() routes a raw UMP
// packet through classifyUmpMessageType() into the correct shm ring with
// the kSlotFlagIsUmp discriminator set.
//
// Worklist: T2459-H5 Slice 13.

#include <catch2/catch_test_macros.hpp>

#include "ControllerHost/EventRing/ShmEventRing.h"
#include "ControllerHost/Midi/LibremidiAdapter.h"

#include <atomic>
#include <string>

using map2::controller_host::LibremidiAdapter;
using map2::controller_host::MidiBackend;
using map2::controller_host::ShmEventRing;
using map2::controller_host::kMaxPayloadBytes;
using map2::controller_host::kSlotFlagIsUmp;

namespace {

std::string uniqueShmName (const char* base)
{
    static std::atomic<std::uint64_t> counter { 0 };
    const auto n = counter.fetch_add (1, std::memory_order_relaxed);
    return std::string (base) + ".ump-test-" + std::to_string (::getpid()) + "-" + std::to_string (n);
}

} // namespace

TEST_CASE ("LibremidiAdapter::pushUmpMessage routes MT=4 channel-voice UMP to RT ring", "[H5][adapter][ump]")
{
    ShmEventRing rtRing;
    ShmEventRing controlRing;
    REQUIRE (rtRing.open (uniqueShmName ("/map2-test.ump.rt"), 16, ShmEventRing::Mode::CreateOwned));
    REQUIRE (controlRing.open (uniqueShmName ("/map2-test.ump.control"), 16, ShmEventRing::Mode::CreateOwned));

    LibremidiAdapter adapter (MidiBackend::None);
    adapter.setEventRings (&rtRing, &controlRing);

    // MIDI 2.0 channel-voice: MT=4, group=0, status=0x90 (note on),
    // channel=0, note=60, attribute type=0, velocity=0x8000, attr=0
    // — packed as two 32-bit big-endian-on-wire words; we feed raw bytes.
    const std::uint8_t ump64[8] = {
        0x40, 0x90, 0x3C, 0x00,
        0x80, 0x00, 0x00, 0x00,
    };
    adapter.pushUmpMessage (ump64, sizeof (ump64));

    std::uint64_t ts = 0;
    std::uint16_t flags = 0u;
    std::uint8_t buf[kMaxPayloadBytes] {};
    const std::size_t n = rtRing.popWithFlags (&ts, &flags, buf, sizeof (buf));
    REQUIRE (n == 8);
    REQUIRE ((flags & kSlotFlagIsUmp) == kSlotFlagIsUmp);
    REQUIRE (buf[0] == 0x40);
    REQUIRE (buf[1] == 0x90);
    REQUIRE (buf[2] == 0x3C);

    // Control ring stays empty.
    REQUIRE (controlRing.popWithFlags (&ts, &flags, buf, sizeof (buf)) == 0);
}

TEST_CASE ("LibremidiAdapter::pushUmpMessage routes MT=3 SysEx7 UMP to control ring", "[H5][adapter][ump]")
{
    ShmEventRing rtRing;
    ShmEventRing controlRing;
    REQUIRE (rtRing.open (uniqueShmName ("/map2-test.ump.rt"), 16, ShmEventRing::Mode::CreateOwned));
    REQUIRE (controlRing.open (uniqueShmName ("/map2-test.ump.control"), 16, ShmEventRing::Mode::CreateOwned));

    LibremidiAdapter adapter (MidiBackend::None);
    adapter.setEventRings (&rtRing, &controlRing);

    // MT=3 (SysEx7) "complete in one packet" 64-bit form, group=0,
    // status=0x0 (complete), 4 bytes of SysEx data: F0 7E 7F F7 (universal
    // identity request bookends — the bytes themselves don't matter for
    // the routing decision, only the MT nibble does).
    const std::uint8_t ump64[8] = {
        0x30, 0x04, 0x7E, 0x7F,
        0x00, 0x00, 0x00, 0x00,
    };
    adapter.pushUmpMessage (ump64, sizeof (ump64));

    std::uint64_t ts = 0;
    std::uint16_t flags = 0u;
    std::uint8_t buf[kMaxPayloadBytes] {};
    const std::size_t n = controlRing.popWithFlags (&ts, &flags, buf, sizeof (buf));
    REQUIRE (n == 8);
    REQUIRE ((flags & kSlotFlagIsUmp) == kSlotFlagIsUmp);
    REQUIRE (buf[0] == 0x30);

    REQUIRE (rtRing.popWithFlags (&ts, &flags, buf, sizeof (buf)) == 0);
}

TEST_CASE ("LibremidiAdapter::pushUmpMessage rejects malformed lengths", "[H5][adapter][ump]")
{
    ShmEventRing rtRing;
    ShmEventRing controlRing;
    REQUIRE (rtRing.open (uniqueShmName ("/map2-test.ump.rt"), 16, ShmEventRing::Mode::CreateOwned));
    REQUIRE (controlRing.open (uniqueShmName ("/map2-test.ump.control"), 16, ShmEventRing::Mode::CreateOwned));

    LibremidiAdapter adapter (MidiBackend::None);
    adapter.setEventRings (&rtRing, &controlRing);

    const std::uint8_t too_short[3] = { 0x40, 0x90, 0x3C };
    const std::uint8_t too_long[20] = {};
    const std::uint8_t half_word[5] = { 0x40, 0x90, 0x3C, 0x00, 0x00 };

    adapter.pushUmpMessage (too_short, sizeof (too_short));
    adapter.pushUmpMessage (too_long, sizeof (too_long));
    adapter.pushUmpMessage (half_word, sizeof (half_word));
    adapter.pushUmpMessage (nullptr, 4);

    std::uint64_t ts = 0;
    std::uint16_t flags = 0u;
    std::uint8_t buf[kMaxPayloadBytes] {};
    REQUIRE (rtRing.popWithFlags (&ts, &flags, buf, sizeof (buf)) == 0);
    REQUIRE (controlRing.popWithFlags (&ts, &flags, buf, sizeof (buf)) == 0);
}
