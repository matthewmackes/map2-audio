#include <catch2/catch_test_macros.hpp>

#include "../Source/Brain/PerformanceBrainProcessor.h"

using namespace map2::brain;

TEST_CASE("PerformanceBrainProcessor seeds 16 mixed workflow slots", "[brain][processor]") {
    PerformanceBrainProcessor processor;

    const auto firstSlot = processor.getSlotState(0);
    const auto keyboardSlot = processor.getSlotState(8);
    const auto hybridSlot = processor.getSlotState(12);

    REQUIRE(firstSlot.mode == PerformanceBrainProcessor::SlotMode::Drum);
    REQUIRE(firstSlot.triggerNote == 36);
    REQUIRE(keyboardSlot.mode == PerformanceBrainProcessor::SlotMode::Chromatic);
    REQUIRE(hybridSlot.mode == PerformanceBrainProcessor::SlotMode::Hybrid);
}

TEST_CASE("PerformanceBrainProcessor keeps per-instance transport state isolated", "[brain][processor]") {
    PerformanceBrainProcessor left;
    PerformanceBrainProcessor right;

    left.setTransportState({true, 132, 7, 2, 18});
    right.setTransportState({false, 96, 1, 0, 0});

    REQUIRE(left.getTransportState().isPlaying);
    REQUIRE(left.getTransportState().bpm == 132);
    REQUIRE(left.getTransportState().pattern == 7);
    REQUIRE(right.getTransportState().isPlaying == false);
    REQUIRE(right.getTransportState().bpm == 96);
    REQUIRE(right.getTransportState().pattern == 1);
}

TEST_CASE("PerformanceBrainProcessor renders note-driven output and tracks voices", "[brain][processor]") {
    PerformanceBrainProcessor processor;
    processor.prepareToPlay(48000.0, 128);

    juce::AudioBuffer<float> buffer(2, 128);
    buffer.clear();
    juce::MidiBuffer midi;
    midi.addEvent(juce::MidiMessage::noteOn(1, 60, (juce::uint8) 100), 0);

    processor.processBlock(buffer, midi);

    REQUIRE(processor.getActiveVoiceCount() >= 1);
    REQUIRE(processor.getPeakVoiceCount() >= 1);
    REQUIRE(buffer.getMagnitude(0, 0, buffer.getNumSamples()) > 0.0f);
}
