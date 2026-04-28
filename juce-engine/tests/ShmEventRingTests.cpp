// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// ShmEventRing — SPSC lock-free shm ring tests.
// Worklist: T2459-H1
//
// Acceptance bullet for H1: 1M-sample test, < 100 µs producer→consumer
// latency at p99. The stress test below measures and reports the
// distribution; we assert against the locked threshold.

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include "ControllerHost/EventRing/ShmEventRing.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstring>
#include <thread>
#include <vector>

using map2::controller_host::ShmEventRing;
using map2::controller_host::RingClass;
using map2::controller_host::classifyMidiStatus;
using map2::controller_host::monotonicNanos;
using map2::controller_host::kMaxPayloadBytes;

namespace {

// Each ring instance needs a unique shm name so concurrent test runs
// (e.g. ctest -j) don't trip over each other.
static std::string uniqueShmName (const char* base)
{
    static std::atomic<std::uint64_t> counter { 0 };
    const auto n = counter.fetch_add (1, std::memory_order_relaxed);
    return std::string (base) + ".test-" + std::to_string (::getpid()) + "-" + std::to_string (n);
}

} // namespace

TEST_CASE ("classifyMidiStatus routes RT and control byte families correctly", "[H1][ring]")
{
    // RT family.
    REQUIRE (classifyMidiStatus (0x80) == RingClass::Rt); // note off ch 0
    REQUIRE (classifyMidiStatus (0x9F) == RingClass::Rt); // note on ch 15
    REQUIRE (classifyMidiStatus (0xB0) == RingClass::Rt); // CC
    REQUIRE (classifyMidiStatus (0xBF) == RingClass::Rt);
    REQUIRE (classifyMidiStatus (0xE5) == RingClass::Rt); // pitch bend
    REQUIRE (classifyMidiStatus (0xF8) == RingClass::Rt); // clock tick
    REQUIRE (classifyMidiStatus (0xFA) == RingClass::Rt); // start
    REQUIRE (classifyMidiStatus (0xFB) == RingClass::Rt); // continue
    REQUIRE (classifyMidiStatus (0xFC) == RingClass::Rt); // stop

    // Control family.
    REQUIRE (classifyMidiStatus (0xC0) == RingClass::Control); // PC
    REQUIRE (classifyMidiStatus (0xCF) == RingClass::Control);
    REQUIRE (classifyMidiStatus (0xD7) == RingClass::Control); // channel pressure
    REQUIRE (classifyMidiStatus (0xF0) == RingClass::Control); // SysEx start
    REQUIRE (classifyMidiStatus (0xF1) == RingClass::Control); // MTC
    REQUIRE (classifyMidiStatus (0xF2) == RingClass::Control); // song pos
    REQUIRE (classifyMidiStatus (0xF3) == RingClass::Control); // song select
    REQUIRE (classifyMidiStatus (0xF6) == RingClass::Control); // tune req
    REQUIRE (classifyMidiStatus (0xF7) == RingClass::Control); // SysEx end
    REQUIRE (classifyMidiStatus (0xFE) == RingClass::Control); // active sensing
    REQUIRE (classifyMidiStatus (0xFF) == RingClass::Control); // reset

    // Data bytes (no status bit set) → control.
    REQUIRE (classifyMidiStatus (0x00) == RingClass::Control);
    REQUIRE (classifyMidiStatus (0x7F) == RingClass::Control);
}

TEST_CASE ("ShmEventRing rejects non-power-of-two capacity in CreateOwned mode", "[H1][ring]")
{
    ShmEventRing ring;
    REQUIRE_FALSE (ring.open (uniqueShmName ("/map2-test.bad-cap"), 100, ShmEventRing::Mode::CreateOwned));
    REQUIRE (ring.errorMessage().find ("power of two") != std::string::npos);
}

TEST_CASE ("ShmEventRing round-trips a single message through one shm region", "[H1][ring]")
{
    const auto name = uniqueShmName ("/map2-test.round-trip");
    ShmEventRing producer;
    REQUIRE (producer.open (name, 64, ShmEventRing::Mode::CreateOwned));
    REQUIRE (producer.capacity() == 64);

    ShmEventRing consumer;
    REQUIRE (consumer.open (name, 0, ShmEventRing::Mode::OpenExisting));
    REQUIRE (consumer.capacity() == 64);

    const std::uint8_t msg[3] = { 0x90, 0x3C, 0x7F };
    REQUIRE (producer.push (12345ull, msg, sizeof (msg)));

    std::uint64_t ts = 0;
    std::uint8_t  buf[kMaxPayloadBytes] {};
    const std::size_t got = consumer.pop (&ts, buf, sizeof (buf));
    REQUIRE (got == 3);
    REQUIRE (ts == 12345ull);
    REQUIRE (buf[0] == 0x90);
    REQUIRE (buf[1] == 0x3C);
    REQUIRE (buf[2] == 0x7F);

    // Empty after drain.
    REQUIRE (consumer.pop (&ts, buf, sizeof (buf)) == 0);
}

TEST_CASE ("ShmEventRing increments droppedCount when full", "[H1][ring]")
{
    const auto name = uniqueShmName ("/map2-test.overflow");
    ShmEventRing ring;
    REQUIRE (ring.open (name, 4, ShmEventRing::Mode::CreateOwned));
    const std::uint8_t msg[2] = { 0x80, 0x40 };

    for (int i = 0; i < 4; ++i)
        REQUIRE (ring.push (i, msg, sizeof (msg)));
    // Now full — fifth push should drop and bump the counter.
    REQUIRE_FALSE (ring.push (5, msg, sizeof (msg)));
    REQUIRE (ring.droppedCount() == 1);
    REQUIRE_FALSE (ring.push (6, msg, sizeof (msg)));
    REQUIRE (ring.droppedCount() == 2);
}

TEST_CASE ("ShmEventRing rejects payloads larger than kMaxPayloadBytes", "[H1][ring]")
{
    const auto name = uniqueShmName ("/map2-test.oversize");
    ShmEventRing ring;
    REQUIRE (ring.open (name, 8, ShmEventRing::Mode::CreateOwned));
    std::vector<std::uint8_t> big (kMaxPayloadBytes + 1, 0xAA);
    REQUIRE_FALSE (ring.push (1, big.data(), big.size()));
    // Length 0 also rejected.
    REQUIRE_FALSE (ring.push (1, big.data(), 0));
    // Null payload rejected even with a positive length.
    REQUIRE_FALSE (ring.push (1, nullptr, 4));
}

TEST_CASE ("ShmEventRing round-trips controllerIndex (Slice 6) and defaults to zero for legacy callers", "[H3][slice6][ring]")
{
    const auto name = uniqueShmName ("/map2-test.controller-index");
    ShmEventRing producer;
    REQUIRE (producer.open (name, 16, ShmEventRing::Mode::CreateOwned));
    ShmEventRing consumer;
    REQUIRE (consumer.open (name, 0, ShmEventRing::Mode::OpenExisting));

    const std::uint8_t a[3] = { 0xB0, 0x07, 100 };
    const std::uint8_t b[3] = { 0xB1, 0x08, 64  };
    const std::uint8_t c[3] = { 0x90, 0x3C, 127 };

    // Legacy single-arg path defaults the index to 0.
    REQUIRE (producer.push (10, a, sizeof (a)));
    // New explicit-index path tags index 7.
    REQUIRE (producer.push (20, b, sizeof (b), 7));
    // Index 65535 (boundary) round-trips through the uint16_t field.
    REQUIRE (producer.push (30, c, sizeof (c), 65535));

    std::uint64_t ts = 0;
    std::uint8_t buf[kMaxPayloadBytes] {};
    std::uint16_t idx = 0xAAAA;

    REQUIRE (consumer.pop (&ts, buf, sizeof (buf), &idx) == 3);
    REQUIRE (ts == 10);
    REQUIRE (idx == 0);
    REQUIRE (buf[0] == 0xB0);

    idx = 0xAAAA;
    REQUIRE (consumer.pop (&ts, buf, sizeof (buf), &idx) == 3);
    REQUIRE (ts == 20);
    REQUIRE (idx == 7);
    REQUIRE (buf[0] == 0xB1);

    idx = 0xAAAA;
    REQUIRE (consumer.pop (&ts, buf, sizeof (buf), &idx) == 3);
    REQUIRE (ts == 30);
    REQUIRE (idx == 65535);
    REQUIRE (buf[0] == 0x90);

    // Legacy null-out-param consumers still work.
    REQUIRE (producer.push (40, a, sizeof (a), 3));
    REQUIRE (consumer.pop (&ts, buf, sizeof (buf)) == 3);
    REQUIRE (ts == 40);
}

TEST_CASE ("ShmEventRing wraps around correctly with capacity-aligned indices", "[H1][ring]")
{
    const auto name = uniqueShmName ("/map2-test.wrap");
    ShmEventRing ring;
    REQUIRE (ring.open (name, 4, ShmEventRing::Mode::CreateOwned));
    const std::uint8_t msg[1] = { 0x90 };

    // Push, pop, push, pop ... 10 times — exercises wrap arithmetic well past
    // the capacity boundary.
    for (int i = 0; i < 10; ++i)
    {
        const std::uint8_t bytes[2] = { 0x90, static_cast<std::uint8_t> (i & 0x7F) };
        REQUIRE (ring.push (i, bytes, sizeof (bytes)));

        std::uint64_t ts = 0;
        std::uint8_t buf[kMaxPayloadBytes] {};
        const std::size_t got = ring.pop (&ts, buf, sizeof (buf));
        REQUIRE (got == 2);
        REQUIRE (ts == static_cast<std::uint64_t> (i));
        REQUIRE (buf[0] == 0x90);
        REQUIRE (buf[1] == (i & 0x7F));
    }
    REQUIRE (ring.droppedCount() == 0);
    (void) msg;
}

// ────────────────────────────────────────────────────────────────────
// Stress test — locked acceptance gate.
// 1M events through a real producer/consumer thread pair, measuring
// per-event producer→consumer latency. Asserts p99 < 100 µs.
// ────────────────────────────────────────────────────────────────────
TEST_CASE ("ShmEventRing 1M-event SPSC stress: p99 latency < 100 µs", "[H1][ring][stress]")
{
    constexpr std::size_t kEvents   = 1'000'000;
    constexpr std::size_t kCapacity = 1024;

    const auto name = uniqueShmName ("/map2-test.stress");
    ShmEventRing producerRing;
    REQUIRE (producerRing.open (name, kCapacity, ShmEventRing::Mode::CreateOwned));

    ShmEventRing consumerRing;
    REQUIRE (consumerRing.open (name, 0, ShmEventRing::Mode::OpenExisting));

    std::vector<std::uint64_t> latencies;
    latencies.reserve (kEvents);

    std::atomic<bool> producerDone { false };

    std::thread consumer ([&]() {
        std::uint8_t buf[kMaxPayloadBytes] {};
        std::uint64_t ts = 0;
        std::size_t consumed = 0;
        while (consumed < kEvents)
        {
            const std::size_t got = consumerRing.pop (&ts, buf, sizeof (buf));
            if (got == 0)
            {
                if (producerDone.load (std::memory_order_acquire) && consumed == 0)
                    break;
                std::this_thread::yield();
                continue;
            }
            const auto now = monotonicNanos();
            // ts is the producer's push time; (now - ts) is the
            // producer→consumer latency including the consumer's own pop
            // pipeline. That's the right number to gate against.
            latencies.push_back (now - ts);
            ++consumed;
        }
    });

    std::thread producer ([&]() {
        for (std::size_t i = 0; i < kEvents; ++i)
        {
            const std::uint8_t bytes[3] = {
                0x90,
                static_cast<std::uint8_t> (i & 0x7F),
                static_cast<std::uint8_t> ((i >> 7) & 0x7F),
            };
            // Push until the slot is accepted. The consumer is faster than
            // the producer in steady state, so retries should be rare.
            while (! producerRing.push (monotonicNanos(), bytes, sizeof (bytes)))
                std::this_thread::yield();
        }
        producerDone.store (true, std::memory_order_release);
    });

    producer.join();
    consumer.join();

    REQUIRE (latencies.size() == kEvents);
    // Drops are expected under steady-state SPSC load when the producer
    // briefly outpaces the consumer — the producer's retry-yield path
    // hits the dropped counter on first attempt and succeeds on retry.
    // The acceptance gate is p99 latency, not zero drops; the producer's
    // total event count is what matters (asserted above as kEvents).

    std::sort (latencies.begin(), latencies.end());
    const auto p50 = latencies[kEvents * 50 / 100];
    const auto p95 = latencies[kEvents * 95 / 100];
    const auto p99 = latencies[kEvents * 99 / 100];
    const auto pmax = latencies.back();

    UNSCOPED_INFO ("p50=" << p50 << "ns p95=" << p95 << "ns p99=" << p99
                   << "ns max=" << pmax << "ns drops=" << producerRing.droppedCount());

    // Locked acceptance threshold for H1: p99 < 100 µs.
    // Allow a generous ceiling under load (CI runners may hit GC/scheduler
    // hiccups); the bench HIL run confirms steady-state behaviour.
    REQUIRE (p99 < 100'000ull); // 100 µs in nanoseconds
}
