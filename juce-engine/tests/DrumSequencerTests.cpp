#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include "../Source/DrumMachine/DrumMachineProcessor.h"
#include "../Source/DrumMachine/DrumSequencer.h"

using namespace map2::drummachine;

TEST_CASE("DrumSequencer exposes 128 patterns with 16-step defaults", "[drums][sequencer]") {
    DrumSequencer sequencer;

    REQUIRE(sequencer.getPatternLength(0) == 16);
    REQUIRE(sequencer.getPatternLength(127) == 16);
    REQUIRE(sequencer.getPattern(0).variations.size() == DrumSequencer::kVariationCount);
    REQUIRE(sequencer.getPattern(0).variations[0].size() == DrumSequencer::kInstrumentCount);
    REQUIRE(sequencer.getStep(0, 0, 0).velocity == 0);
    REQUIRE(sequencer.setPatternLength(0, 64));
    REQUIRE(sequencer.getPatternLength(0) == 64);
}

TEST_CASE("DrumSequencer advances position using the configured tempo", "[drums][sequencer]") {
    DrumSequencer sequencer;
    sequencer.prepare(48000.0, 256);
    REQUIRE(sequencer.setTempo(120.0));

    sequencer.play();
    sequencer.processBlock(1);
    auto position = sequencer.getPosition();
    REQUIRE(position.isPlaying);
    REQUIRE(position.stepIndex == 0);
    REQUIRE(position.barCount == 1);

    sequencer.processBlock(6000);
    position = sequencer.getPosition();
    REQUIRE(position.stepIndex == 1);
    REQUIRE(position.barCount == 1);
}

TEST_CASE("DrumSequencer pause preserves position and stop resets transport state", "[drums][sequencer]") {
    DrumSequencer sequencer;
    sequencer.prepare(48000.0, 256);
    REQUIRE(sequencer.setTempo(120.0));

    sequencer.play();
    sequencer.processBlock(6000);
    const auto advanced = sequencer.getPosition();
    REQUIRE(advanced.stepIndex == 1);
    REQUIRE(advanced.isPlaying);

    sequencer.pause();
    REQUIRE_FALSE(sequencer.isPlaying());
    REQUIRE(sequencer.getPosition().stepIndex == 1);

    sequencer.stop();
    const auto reset = sequencer.getPosition();
    REQUIRE_FALSE(reset.isPlaying);
    REQUIRE(reset.stepIndex == 0);
    REQUIRE(reset.barCount == 1);
}

TEST_CASE("DrumSequencer triggers drum machine pads at step boundaries", "[drums][sequencer]") {
    DrumMachineProcessor processor;
    processor.prepare(48000.0, 8192, 2);

    DrumSequencer sequencer;
    sequencer.setDrumMachine(&processor);
    sequencer.prepare(48000.0, 8192);
    REQUIRE(sequencer.setStep(0, 0, 0, 96));
    REQUIRE(sequencer.setStep(0, 1, 1, 88));

    juce::MidiBuffer midi;
    juce::AudioBuffer<float> audio(2, 8192);
    audio.clear();

    sequencer.play();
    sequencer.processBlock(64);
    processor.processBlock(audio, midi);
    REQUIRE(processor.getPadActiveVoices(0) == 1);
    REQUIRE(processor.getPadActiveVoices(1) == 0);

    audio.clear();
    sequencer.processBlock(6000);
    processor.processBlock(audio, midi);
    REQUIRE(processor.getPadActiveVoices(1) == 1);
}

TEST_CASE("DrumSequencer tap tempo averages recent taps and resets after gaps", "[drums][sequencer]") {
    DrumSequencer sequencer;
    using clock = std::chrono::steady_clock;

    const auto t0 = clock::now();
    REQUIRE(sequencer.tapTempo(t0) == Catch::Approx(120.0));
    REQUIRE(sequencer.tapTempo(t0 + std::chrono::milliseconds(500)) == Catch::Approx(120.0));
    REQUIRE(sequencer.tapTempo(t0 + std::chrono::milliseconds(1000)) == Catch::Approx(120.0));

    REQUIRE(sequencer.tapTempo(t0 + std::chrono::milliseconds(3505)) == Catch::Approx(120.0));
    REQUIRE(sequencer.tapTempo(t0 + std::chrono::milliseconds(4105)) == Catch::Approx(100.0));
}

TEST_CASE("DrumSequencer swing delays offbeats relative to straight timing", "[drums][sequencer]") {
    DrumSequencer straight;
    straight.prepare(48000.0, 256);
    REQUIRE(straight.setTempo(120.0));
    straight.play();
    straight.processBlock(1);
    straight.processBlock(6000);
    const auto straightPosition = straight.getPosition();

    DrumSequencer swung;
    swung.prepare(48000.0, 256);
    REQUIRE(swung.setTempo(120.0));
    swung.setSwing(100.0f);
    swung.play();
    swung.processBlock(1);
    swung.processBlock(6000);
    const auto swungPosition = swung.getPosition();

    REQUIRE(straightPosition.stepIndex == 1);
    REQUIRE(swungPosition.stepIndex == 0);
}

TEST_CASE("DrumSequencer manages song entries and reordering", "[drums][sequencer]") {
    DrumSequencer sequencer;

    REQUIRE(sequencer.addSongEntry(4, 2));
    REQUIRE(sequencer.addSongEntry(9, 3));
    REQUIRE(sequencer.addSongEntry(7, 1, 1));

    auto song = sequencer.getSong();
    REQUIRE(song.size() == 3);
    REQUIRE(song[0].patternIndex == 4);
    REQUIRE(song[1].patternIndex == 7);
    REQUIRE(song[2].patternIndex == 9);

    REQUIRE(sequencer.reorderSongEntries({2, 0, 1}));
    song = sequencer.getSong();
    REQUIRE(song[0].patternIndex == 9);
    REQUIRE(song[1].patternIndex == 4);
    REQUIRE(song[2].patternIndex == 7);

    REQUIRE(sequencer.removeSongEntry(1));
    song = sequencer.getSong();
    REQUIRE(song.size() == 2);
    REQUIRE(song[0].patternIndex == 9);
    REQUIRE(song[1].patternIndex == 7);

    sequencer.clearSong();
    REQUIRE(sequencer.getSong().empty());
}

TEST_CASE("DrumSequencer advances through song entries and stops at the end when loop is disabled", "[drums][sequencer]") {
    DrumSequencer sequencer;
    sequencer.prepare(48000.0, 256);
    REQUIRE(sequencer.setTempo(300.0));
    REQUIRE(sequencer.setPatternLength(2, 1));
    REQUIRE(sequencer.setPatternLength(5, 1));
    REQUIRE(sequencer.addSongEntry(2, 2));
    REQUIRE(sequencer.addSongEntry(5, 1));

    sequencer.play();
    sequencer.processBlock(1);

    auto position = sequencer.getPosition();
    REQUIRE(position.patternIndex == 2);
    REQUIRE(position.stepIndex == 0);
    REQUIRE(position.barCount == 1);
    REQUIRE(position.isPlaying);

    sequencer.processBlock(2400);
    position = sequencer.getPosition();
    REQUIRE(position.patternIndex == 2);
    REQUIRE(position.barCount == 2);
    REQUIRE(position.isPlaying);

    sequencer.processBlock(2400);
    position = sequencer.getPosition();
    REQUIRE(position.patternIndex == 5);
    REQUIRE(position.barCount == 3);
    REQUIRE(position.isPlaying);

    sequencer.processBlock(2400);
    position = sequencer.getPosition();
    REQUIRE(position.patternIndex == 2);
    REQUIRE(position.stepIndex == 0);
    REQUIRE(position.barCount == 1);
    REQUIRE_FALSE(position.isPlaying);
}

TEST_CASE("DrumSequencer loops back to the first song entry when song loop is enabled", "[drums][sequencer]") {
    DrumSequencer sequencer;
    sequencer.prepare(48000.0, 256);
    REQUIRE(sequencer.setTempo(300.0));
    REQUIRE(sequencer.setPatternLength(1, 1));
    REQUIRE(sequencer.setPatternLength(3, 1));
    REQUIRE(sequencer.addSongEntry(1, 1));
    REQUIRE(sequencer.addSongEntry(3, 1));
    sequencer.setSongLoop(true);

    sequencer.play();
    sequencer.processBlock(1);
    sequencer.processBlock(2400);
    auto position = sequencer.getPosition();
    REQUIRE(position.patternIndex == 3);
    REQUIRE(position.barCount == 2);
    REQUIRE(position.isPlaying);

    sequencer.processBlock(2400);
    position = sequencer.getPosition();
    REQUIRE(position.patternIndex == 1);
    REQUIRE(position.barCount == 1);
    REQUIRE(position.isPlaying);
    REQUIRE(sequencer.getSongLoop());
}

TEST_CASE("DrumSequencer edits and reads back per-pattern variations", "[drums][sequencer]") {
    DrumSequencer sequencer;

    REQUIRE(sequencer.setVariation(4, 2));
    REQUIRE(sequencer.setStep(4, 3, 8, 101, true));
    REQUIRE(sequencer.getVariation(4) == 2);
    REQUIRE(sequencer.getStep(4, 3, 8).velocity == 101);
    REQUIRE(sequencer.getStep(4, 3, 8).accent);

    REQUIRE(sequencer.setVariation(4, 0));
    REQUIRE(sequencer.getStep(4, 3, 8).velocity == 0);
}

TEST_CASE("DrumSequencer uses fill variation on the last beat when a fill is triggered", "[drums][sequencer]") {
    DrumSequencer sequencer;
    sequencer.prepare(48000.0, 16384);
    REQUIRE(sequencer.setTempo(300.0));
    REQUIRE(sequencer.setPatternLength(0, 16));
    REQUIRE(sequencer.setStep(0, 0, 12, 60));
    REQUIRE(sequencer.setVariation(0, 1));
    REQUIRE(sequencer.setStep(0, 0, 12, 118));
    REQUIRE(sequencer.setVariation(0, 0));
    REQUIRE(sequencer.setFillVariation(0, 1));
    REQUIRE(sequencer.setFillLengthBeats(0, 1));

    sequencer.play();
    sequencer.triggerFill();
    sequencer.processBlock(14500);

    REQUIRE(sequencer.getFillVariation(0) == 1);
    REQUIRE(sequencer.getFillLengthBeats(0) == 1);
    REQUIRE(sequencer.getPosition().isPlaying);
    REQUIRE(sequencer.getPosition().stepIndex >= 4);
}

TEST_CASE("DrumSequencer auto-fill and count-in settings are applied", "[drums][sequencer]") {
    DrumSequencer sequencer;

    sequencer.setAutoFillBars(4);
    sequencer.setCountInBars(2);

    REQUIRE(sequencer.getAutoFillBars() == 4);
    REQUIRE(sequencer.getCountInBars() == 2);
}

TEST_CASE("DrumSequencer count-in delays first pattern step until the configured bars elapse", "[drums][sequencer]") {
    DrumSequencer withoutCountIn;
    withoutCountIn.prepare(48000.0, 65536);
    REQUIRE(withoutCountIn.setTempo(120.0));
    REQUIRE(withoutCountIn.setStep(0, 0, 0, 110));
    withoutCountIn.play();
    withoutCountIn.processBlock(100000);

    DrumSequencer withCountIn;
    withCountIn.prepare(48000.0, 65536);
    REQUIRE(withCountIn.setTempo(120.0));
    REQUIRE(withCountIn.setStep(0, 0, 0, 110));
    withCountIn.setCountInBars(1);
    withCountIn.play();
    withCountIn.processBlock(100000);

    REQUIRE(withoutCountIn.getPosition().barCount > withCountIn.getPosition().barCount);
    REQUIRE(withCountIn.getCountInBars() == 1);
}

TEST_CASE("DrumSequencer clears and copies edited patterns", "[drums][sequencer]") {
    DrumSequencer sequencer;

    REQUIRE(sequencer.setPatternLength(12, 32));
    REQUIRE(sequencer.setStep(12, 4, 15, 99, true));
    REQUIRE(sequencer.copyPattern(12, 13));
    REQUIRE(sequencer.getPatternLength(13) == 32);
    REQUIRE(sequencer.getStep(13, 4, 15).velocity == 99);
    REQUIRE(sequencer.getStep(13, 4, 15).accent);

    REQUIRE(sequencer.clearPattern(13));
    REQUIRE(sequencer.getPatternLength(13) == 16);
    REQUIRE(sequencer.getStep(13, 4, 15).velocity == 0);
}
