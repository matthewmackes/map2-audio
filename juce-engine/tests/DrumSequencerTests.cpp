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
