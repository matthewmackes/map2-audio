#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include "../Source/DrumMachine/DrumMachineProcessor.h"
#include "../Source/DrumMachine/DrumSequencer.h"

using namespace map2::drummachine;

TEST_CASE("DrumSequencer exposes 128 patterns with 16-step defaults", "[drums][sequencer]") {
    DrumSequencer sequencer;

    REQUIRE(sequencer.getPatternLength(0) == 16);
    REQUIRE(sequencer.getPatternLength(127) == 16);
    REQUIRE(sequencer.getPattern(0).steps.size() == DrumSequencer::kInstrumentCount);
    REQUIRE(sequencer.getStep(0, 0, 0).velocity == 0);
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
