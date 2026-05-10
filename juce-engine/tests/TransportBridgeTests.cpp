// =============================================================================
// T2503 Set 7 — TransportBridge / MidiClockOut / MidiClockIn / MtcLtcBridge
//                + DawDeviceManager unit tests
// =============================================================================

#include <catch2/catch_test_macros.hpp>

#include "Daw/DawDeviceManager.h"
#include "Daw/ModeSwitchCoordinator.h"
#include "Daw/TransportBridge.h"

#include <vector>

using namespace map2::daw;

TEST_CASE("TransportBridge — defaults + setters", "[t2503][daw][transport]") {
    TransportBridge t;
    REQUIRE(t.bpm() == 120.0);
    REQUIRE(t.sampleRate() == 48000);
    REQUIRE(t.positionSamples() == 0);
    REQUIRE(t.syncSource() == SyncSource::Internal);

    t.setBpm(140.0);
    REQUIRE(t.bpm() == 140.0);
    t.setBpm(10.0);              // out of range
    REQUIRE(t.bpm() == 140.0);   // unchanged

    t.setPositionSamples(48000);
    REQUIRE(t.positionSamples() == 48000);
    REQUIRE(t.positionSeconds() == 1.0);

    t.advancePosition(48000);
    REQUIRE(t.positionSamples() == 96000);
    REQUIRE(t.positionSeconds() == 2.0);
}

TEST_CASE("TransportBridge — positionBeats math", "[t2503][daw][transport]") {
    TransportBridge t;
    t.setBpm(120.0);
    t.setPositionSamples(24000);  // 0.5s at 48k → 1 beat at 120bpm
    REQUIRE(t.positionBeats() == 1.0);
}

TEST_CASE("MidiClockOut — emits 24 ticks per beat", "[t2503][daw][midi-clock-out]") {
    TransportBridge bridge;
    bridge.setBpm(120.0);
    bridge.setSampleRate(48000);
    MidiClockOut clk(&bridge);

    int ticks = 0;
    auto emit = [&]() { ++ticks; };

    // One beat at 120bpm @ 48k = 24000 samples; should yield 24 ticks.
    clk.run(24000, emit);
    REQUIRE(ticks == 24);
}

TEST_CASE("MidiClockOut — accumulates across blocks",
          "[t2503][daw][midi-clock-out]") {
    TransportBridge bridge;
    bridge.setBpm(120.0);
    bridge.setSampleRate(48000);
    MidiClockOut clk(&bridge);

    int ticks = 0;
    auto emit = [&]() { ++ticks; };

    // 24 blocks of 1000 samples = 24000 samples = 1 beat = 24 ticks.
    for (int i = 0; i < 24; ++i) clk.run(1000, emit);
    REQUIRE(ticks == 24);
}

TEST_CASE("MidiClockIn — derives bpm from tick interval, only when synced",
          "[t2503][daw][midi-clock-in]") {
    TransportBridge bridge;
    bridge.setSampleRate(48000);
    MidiClockIn in(&bridge);

    // Without midi_clock_in source, ticks are ignored.
    bridge.setSyncSource(SyncSource::Internal);
    bridge.setBpm(120.0);
    in.onTick(0);
    in.onTick(1'000'000'000);  // 1s after — would be ~2.5 bpm, ignored
    REQUIRE(bridge.bpm() == 120.0);

    // With midi_clock_in active, ticks at 24 PPQ derive bpm.
    bridge.setSyncSource(SyncSource::MidiClockIn);
    in.reset();
    // 120 bpm × 24 PPQ = 48 ticks/sec → 20.833ms per tick → 20833333 ns.
    const uint64_t intervalNs = 20'833'333;
    uint64_t now = 0;
    in.onTick(now);
    for (int i = 0; i < 32; ++i) {
        now += intervalNs;
        in.onTick(now);
    }
    REQUIRE(bridge.bpm() > 119.0);
    REQUIRE(bridge.bpm() < 121.0);
}

TEST_CASE("MtcLtcBridge — encodes 8 quarter-frame bytes",
          "[t2503][daw][mtc]") {
    TransportBridge bridge;
    bridge.setSampleRate(48000);
    bridge.setPositionSamples(48000 * 60 * 5);  // 5 minutes
    MtcLtcBridge mtc(&bridge);

    auto seq = mtc.encodeMtcSequence(30);
    REQUIRE(seq.size() == 8);
    // Frame minutes-low nibble (message type 4) should be 5 mod 16 = 5.
    REQUIRE(seq[4].messageType == 4);
    REQUIRE(seq[4].data == 5);
    // Hours-low nibble (message type 6) should be 0.
    REQUIRE(seq[6].messageType == 6);
    REQUIRE(seq[6].data == 0);
}

TEST_CASE("MtcLtcBridge — decodeMtcQuarterFrame applies position when synced",
          "[t2503][daw][mtc]") {
    TransportBridge bridge;
    bridge.setSampleRate(48000);
    bridge.setSyncSource(SyncSource::Mtc);
    MtcLtcBridge mtc(&bridge);

    // Build an 8-byte sequence for 5 minutes 0 seconds 0 frames @ 30 fps.
    // 5 minutes = 300 seconds.
    // Encode → decode round-trip via the encoder.
    bridge.setPositionSamples(48000 * 60 * 5);
    auto seq = mtc.encodeMtcSequence(30);
    bridge.setPositionSamples(0);                // reset
    for (auto& qf : seq) {
        mtc.decodeMtcQuarterFrame(qf.encoded());
    }
    // Position should be approximately back to 5 minutes — within 1s of
    // tolerance for the coarse encoder.
    const double seconds = bridge.positionSeconds();
    REQUIRE(seconds > 290.0);
    REQUIRE(seconds < 310.0);
}

TEST_CASE("MtcLtcBridge — decodeLtcFrame ignored when not LTC-synced",
          "[t2503][daw][ltc]") {
    TransportBridge bridge;
    bridge.setSampleRate(48000);
    bridge.setSyncSource(SyncSource::Internal);
    MtcLtcBridge mtc(&bridge);

    bridge.setPositionSamples(0);
    uint8_t bytes[10] = {0x00, 0x01, 0x00, 0x02, 0x00, 0x03, 0x00, 0x04, 0xFD, 0x3F};
    mtc.decodeLtcFrame(bytes, 10);
    REQUIRE(bridge.positionSamples() == 0);

    // Now switch to LTC sync and decode the same bytes.
    bridge.setSyncSource(SyncSource::Ltc);
    mtc.decodeLtcFrame(bytes, 10);
    REQUIRE(bridge.positionSamples() > 0);
}

// ---- DawDeviceManager + ModeSwitchCoordinator integration ----

TEST_CASE("DawDeviceManager — lifecycle drives the coordinator",
          "[t2503][daw][device-manager]") {
    ModeSwitchCoordinator coord;

    // For the live side we use a stub that auto-completes (mirrors
    // ModeSwitchCoordinatorTests).
    struct AutoStub : ITransitionTarget {
        ModeSwitchCoordinator* c;
        explicit AutoStub(ModeSwitchCoordinator* coord) : c(coord) {}
        void beginStop() override { c->finishStop(); }
        void beginRelease() override { c->finishRelease(); }
        void beginInitialize() override { c->finishInitialize(); }
    };
    AutoStub liveStub(&coord);
    DawDeviceManager dm(&coord);

    coord.setTargets(&liveStub, &dm);
    REQUIRE(coord.currentMode() == EngineMode::Live);
    REQUIRE_FALSE(dm.isRunning());

    REQUIRE(coord.requestSwitch(EngineMode::Daw));
    REQUIRE(coord.currentMode() == EngineMode::Daw);
    REQUIRE(coord.currentState() == TransitionState::Running);
    REQUIRE(dm.isRunning());

    REQUIRE(coord.requestSwitch(EngineMode::Live));
    REQUIRE(coord.currentMode() == EngineMode::Live);
    REQUIRE_FALSE(dm.isRunning());
}

TEST_CASE("DawDeviceManager — transport accessor is functional",
          "[t2503][daw][device-manager]") {
    ModeSwitchCoordinator coord;
    DawDeviceManager dm(&coord);
    auto& t = dm.transport();
    t.setBpm(140.0);
    REQUIRE(t.bpm() == 140.0);
}
