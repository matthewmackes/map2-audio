// =============================================================================
// T2503 Set 8 — Deck-pattern unit tests (Mixxx-derived re-implementations)
// =============================================================================

#include <catch2/catch_test_macros.hpp>

#include "Daw/Deck/BeatGrid.h"
#include "Daw/Deck/ClipLauncher.h"
#include "Daw/Deck/CueModel.h"
#include "Daw/Deck/SlipMode.h"
#include "Daw/Deck/SyncEngine.h"

using namespace map2::daw::deck;

// ---- CueModel ----

TEST_CASE("CueModel — first press locks main cue at current position",
          "[t2503][daw][deck][cue]") {
    CueModel m;
    REQUIRE_FALSE(m.mainCue().has_value());
    auto pos = m.pressMainCue(48000);
    REQUIRE(pos == 48000);
    REQUIRE(m.mainCue().value() == 48000);
}

TEST_CASE("CueModel — Mixxx mode releases back to cue",
          "[t2503][daw][deck][cue]") {
    CueModel m;
    m.setMainCue(24000);
    auto onPress = m.pressMainCue(96000);   // jump to cue
    REQUIRE(onPress == 24000);
    auto onRelease = m.releaseMainCue(192000);  // fallback ignored
    REQUIRE(onRelease == 24000);             // releases back to cue
}

TEST_CASE("CueModel — hot-cue set + trigger + clear",
          "[t2503][daw][deck][cue]") {
    CueModel m;
    REQUIRE_FALSE(m.triggerHotCue(0).has_value());
    m.setHotCue(0, 48000, 0xFF0000);
    auto t = m.triggerHotCue(0);
    REQUIRE(t.has_value());
    REQUIRE(t.value() == 48000);
    REQUIRE(m.hotCues()[0].color == 0xFF0000u);
    m.clearHotCue(0);
    REQUIRE_FALSE(m.triggerHotCue(0).has_value());
}

TEST_CASE("CueModel — out-of-range hot-cue indices are no-ops",
          "[t2503][daw][deck][cue]") {
    CueModel m;
    m.setHotCue(-1, 1000);
    m.setHotCue(99, 1000);
    REQUIRE_FALSE(m.triggerHotCue(-1).has_value());
    REQUIRE_FALSE(m.triggerHotCue(99).has_value());
}

// ---- BeatGrid ----

TEST_CASE("BeatGrid — samplesPerBeat at 120bpm/48k = 24000",
          "[t2503][daw][deck][beatgrid]") {
    BeatGrid g(0, 120.0, 48000);
    REQUIRE(g.samplesPerBeat() == 24000.0);
    REQUIRE(g.isValid());
}

TEST_CASE("BeatGrid — round-trip beat ↔ sample math",
          "[t2503][daw][deck][beatgrid]") {
    BeatGrid g(0, 120.0, 48000);
    REQUIRE(g.beatToPosition(0.0) == 0);
    REQUIRE(g.beatToPosition(1.0) == 24000);
    REQUIRE(g.beatToPosition(4.0) == 96000);
    REQUIRE(g.positionToBeat(48000) == 2.0);
}

TEST_CASE("BeatGrid — snapToBeat snaps to nearest beat",
          "[t2503][daw][deck][beatgrid]") {
    BeatGrid g(0, 120.0, 48000);
    REQUIRE(g.snapToBeat(11999) == 0);            // <0.5 beat → 0
    REQUIRE(g.snapToBeat(12000) == 24000);        // exactly 0.5 → up
    REQUIRE(g.snapToBeat(36000) == 48000);        // 1.5 → 2
}

TEST_CASE("BeatGrid — nextBeatPosition is the ceiling",
          "[t2503][daw][deck][beatgrid]") {
    BeatGrid g(0, 120.0, 48000);
    REQUIRE(g.nextBeatPosition(0) == 0);
    REQUIRE(g.nextBeatPosition(1) == 24000);
    REQUIRE(g.nextBeatPosition(24000) == 24000);  // exactly on the beat
    REQUIRE(g.nextBeatPosition(24001) == 48000);
}

TEST_CASE("BeatGrid — non-zero anchor offsets correctly",
          "[t2503][daw][deck][beatgrid]") {
    BeatGrid g(48000, 120.0, 48000);              // anchor at sample 48000
    REQUIRE(g.beatToPosition(0.0) == 48000);
    REQUIRE(g.beatToPosition(1.0) == 72000);
    REQUIRE(g.positionToBeat(48000) == 0.0);
    REQUIRE(g.positionToBeat(72000) == 1.0);
}

// ---- SyncEngine ----

TEST_CASE("SyncEngine — unsynced deck returns rate 1.0",
          "[t2503][daw][deck][sync]") {
    SyncEngine s;
    s.setMaster(120.0, 0, 48000);
    s.registerDeck(1, BeatGrid(0, 100.0, 48000), SyncMode::None);
    REQUIRE(s.rateForDeck(1) == 1.0);
}

TEST_CASE("SyncEngine — synced deck rate = master/deck",
          "[t2503][daw][deck][sync]") {
    SyncEngine s;
    s.setMaster(120.0, 0, 48000);
    s.registerDeck(1, BeatGrid(0, 100.0, 48000), SyncMode::FollowMaster);
    REQUIRE(s.rateForDeck(1) == 1.2);
}

TEST_CASE("SyncEngine — unknown deck returns rate 1.0",
          "[t2503][daw][deck][sync]") {
    SyncEngine s;
    s.setMaster(120.0, 0, 48000);
    REQUIRE(s.rateForDeck(99) == 1.0);
    REQUIRE_FALSE(s.hasDeck(99));
}

TEST_CASE("SyncEngine — alignedPositionForDeck returns next beat for synced",
          "[t2503][daw][deck][sync]") {
    SyncEngine s;
    s.setMaster(120.0, 0, 48000);
    s.registerDeck(1, BeatGrid(0, 120.0, 48000), SyncMode::FollowMaster);
    // position = 100 samples; next beat at 24000.
    REQUIRE(s.alignedPositionForDeck(1, 100) == 24000);
    REQUIRE(s.alignedPositionForDeck(1, 0) == 0);
}

TEST_CASE("SyncEngine — setDeckSyncMode toggles rate behavior",
          "[t2503][daw][deck][sync]") {
    SyncEngine s;
    s.setMaster(120.0, 0, 48000);
    s.registerDeck(1, BeatGrid(0, 100.0, 48000), SyncMode::None);
    REQUIRE(s.rateForDeck(1) == 1.0);
    s.setDeckSyncMode(1, SyncMode::FollowMaster);
    REQUIRE(s.rateForDeck(1) == 1.2);
}

// ---- SlipMode ----

TEST_CASE("SlipMode — engage + advance + disengage round-trip",
          "[t2503][daw][deck][slip]") {
    SlipMode slip;
    REQUIRE_FALSE(slip.isActive());
    slip.engage(48000, 1.0);
    REQUIRE(slip.isActive());
    slip.advance(24000);     // 0.5s at 1.0 rate
    REQUIRE(slip.currentSlippedPosition() == 72000);
    slip.advance(24000);     // another 0.5s
    REQUIRE(slip.currentSlippedPosition() == 96000);
    auto landed = slip.disengage();
    REQUIRE_FALSE(slip.isActive());
    REQUIRE(landed == 96000);
}

TEST_CASE("SlipMode — playback rate scaling",
          "[t2503][daw][deck][slip]") {
    SlipMode slip;
    slip.engage(0, 0.5);                  // half speed
    slip.advance(48000);
    REQUIRE(slip.currentSlippedPosition() == 24000);
}

TEST_CASE("SlipMode — engage when active is a no-op",
          "[t2503][daw][deck][slip]") {
    SlipMode slip;
    slip.engage(48000, 1.0);
    slip.engage(96000, 2.0);              // ignored
    slip.advance(48000);
    REQUIRE(slip.currentSlippedPosition() == 96000);  // 48000 + 1.0 * 48000
}

// ---- ClipLauncher ----

TEST_CASE("ClipLauncher — stopped → queued → playing on beat boundary",
          "[t2503][daw][deck][clip-launcher]") {
    ClipLauncher cl;
    REQUIRE(cl.stateOf(1) == ClipState::Stopped);
    REQUIRE(cl.press(1) == ClipState::Queued);
    cl.onBeatBoundary();
    REQUIRE(cl.stateOf(1) == ClipState::Playing);
}

TEST_CASE("ClipLauncher — playing → queued-stop → stopped on beat boundary",
          "[t2503][daw][deck][clip-launcher]") {
    ClipLauncher cl;
    cl.setState(1, ClipState::Playing);
    REQUIRE(cl.press(1) == ClipState::QueuedStop);
    cl.onBeatBoundary();
    REQUIRE(cl.stateOf(1) == ClipState::Stopped);
}

TEST_CASE("ClipLauncher — queued cancels back to stopped",
          "[t2503][daw][deck][clip-launcher]") {
    ClipLauncher cl;
    cl.press(1);                           // stopped → queued
    REQUIRE(cl.press(1) == ClipState::Stopped);  // queued → stopped (cancel)
}

TEST_CASE("ClipLauncher — counts reflect bank state",
          "[t2503][daw][deck][clip-launcher]") {
    ClipLauncher cl;
    cl.setState(0, ClipState::Playing);
    cl.setState(1, ClipState::Queued);
    cl.setState(2, ClipState::Stopped);
    cl.setState(3, ClipState::QueuedStop);
    auto c = cl.counts();
    REQUIRE(c.playing == 1);
    REQUIRE(c.queued == 1);
    REQUIRE(c.stopped == 1);
    REQUIRE(c.queuedStop == 1);
}
