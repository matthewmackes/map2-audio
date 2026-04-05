#include <catch2/catch_test_macros.hpp>

#include "../Source/Brain/PerformanceBrainProcessor.h"

using namespace map2::brain;

namespace {

juce::AudioBuffer<float> renderBlock(
    PerformanceBrainProcessor& processor,
    juce::MidiBuffer& midi,
    int sampleCount = 128) {
    juce::AudioBuffer<float> buffer(2, sampleCount);
    buffer.clear();
    processor.processBlock(buffer, midi);
    return buffer;
}

}  // namespace

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

    juce::MidiBuffer midi;
    midi.addEvent(juce::MidiMessage::noteOn(1, 60, (juce::uint8) 100), 0);

    auto buffer = renderBlock(processor, midi);

    REQUIRE(processor.getActiveVoiceCount() >= 1);
    REQUIRE(processor.getPeakVoiceCount() >= 1);
    REQUIRE(buffer.getMagnitude(0, 0, buffer.getNumSamples()) > 0.0f);
}

TEST_CASE("PerformanceBrainProcessor tracks keyboard polyphony and note-off release", "[brain][processor]") {
    PerformanceBrainProcessor processor;
    processor.prepareToPlay(48000.0, 128);

    juce::MidiBuffer noteOns;
    noteOns.addEvent(juce::MidiMessage::noteOn(1, 60, (juce::uint8) 100), 0);
    noteOns.addEvent(juce::MidiMessage::noteOn(1, 64, (juce::uint8) 100), 8);
    noteOns.addEvent(juce::MidiMessage::noteOn(1, 67, (juce::uint8) 100), 16);

    auto activeBuffer = renderBlock(processor, noteOns);

    REQUIRE(processor.getActiveVoiceCount() == 3);
    REQUIRE(processor.getPeakVoiceCount() == 3);
    REQUIRE(activeBuffer.getMagnitude(0, 0, activeBuffer.getNumSamples()) > 0.0f);

    juce::MidiBuffer noteOffs;
    noteOffs.addEvent(juce::MidiMessage::noteOff(1, 64), 0);
    noteOffs.addEvent(juce::MidiMessage::noteOff(1, 67), 8);

    renderBlock(processor, noteOffs);

    REQUIRE(processor.getActiveVoiceCount() == 1);
    REQUIRE(processor.getPeakVoiceCount() == 3);
}

TEST_CASE("PerformanceBrainProcessor keeps trigger notes out of sustained keyboard polyphony", "[brain][processor]") {
    PerformanceBrainProcessor processor;
    processor.prepareToPlay(48000.0, 128);

    juce::MidiBuffer keyboardMidi;
    keyboardMidi.addEvent(juce::MidiMessage::noteOn(1, 60, (juce::uint8) 100), 0);
    auto keyboardBuffer = renderBlock(processor, keyboardMidi);

    REQUIRE(processor.getActiveVoiceCount() == 1);
    REQUIRE(keyboardBuffer.getMagnitude(0, 0, keyboardBuffer.getNumSamples()) > 0.0f);

    juce::MidiBuffer triggerMidi;
    triggerMidi.addEvent(juce::MidiMessage::noteOn(1, 36, (juce::uint8) 100), 0);
    auto blendedBuffer = renderBlock(processor, triggerMidi);

    REQUIRE(processor.getActiveVoiceCount() == 1);
    REQUIRE(processor.getPeakVoiceCount() == 1);
    REQUIRE(blendedBuffer.getMagnitude(0, 0, blendedBuffer.getNumSamples()) > 0.0f);

    juce::MidiBuffer clearKeyboard;
    clearKeyboard.addEvent(juce::MidiMessage::noteOff(1, 60), 0);
    renderBlock(processor, clearKeyboard);

    juce::MidiBuffer triggerOnlyMidi;
    triggerOnlyMidi.addEvent(juce::MidiMessage::noteOn(1, 36, (juce::uint8) 100), 0);
    auto triggerOnlyBuffer = renderBlock(processor, triggerOnlyMidi);

    REQUIRE(processor.getActiveVoiceCount() == 0);
    REQUIRE(processor.getPeakVoiceCount() == 1);
    REQUIRE(triggerOnlyBuffer.getMagnitude(0, 0, triggerOnlyBuffer.getNumSamples()) > 0.0f);
}

TEST_CASE("PerformanceBrainProcessor clears active notes when transport stops", "[brain][processor]") {
    PerformanceBrainProcessor processor;
    processor.prepareToPlay(48000.0, 128);
    processor.setTransportState({true, 124, 3, 0, 0});

    juce::MidiBuffer noteOnMidi;
    noteOnMidi.addEvent(juce::MidiMessage::noteOn(1, 60, (juce::uint8) 100), 0);
    renderBlock(processor, noteOnMidi);

    REQUIRE(processor.getActiveVoiceCount() == 1);

    processor.setTransportState({false, 124, 0, 0, 0});

    juce::MidiBuffer emptyMidi;
    auto stoppedBuffer = renderBlock(processor, emptyMidi);

    REQUIRE(processor.getActiveVoiceCount() == 0);
    REQUIRE(stoppedBuffer.getMagnitude(0, 0, stoppedBuffer.getNumSamples()) == 0.0f);
}
