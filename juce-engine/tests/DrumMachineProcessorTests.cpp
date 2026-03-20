#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include "../Source/DrumMachine/DrumMachineProcessor.h"

using namespace map2::drummachine;

TEST_CASE("DrumMachineProcessor exposes GM defaults and fixed bus mapping", "[drums][processor]") {
    DrumMachineProcessor processor;

    REQUIRE(processor.getPadConfig(0).midiNote == 36);
    REQUIRE(processor.getPadConfig(1).midiNote == 38);
    REQUIRE(processor.getPadConfig(15).midiNote == 48);
    REQUIRE(processor.getPadMidiNotes(0) == std::vector<int>{36});
    REQUIRE(processor.getPadMidiNotes(1) == std::vector<int>{38});
    REQUIRE(processor.getPadConfig(0).bus == DrumMachineProcessor::BusId::Kick);
    REQUIRE(processor.getPadConfig(1).bus == DrumMachineProcessor::BusId::Snare);
    REQUIRE(processor.getPadConfig(2).bus == DrumMachineProcessor::BusId::HiHat);
    REQUIRE(processor.getPadConfig(5).bus == DrumMachineProcessor::BusId::Toms);
    REQUIRE(processor.getPadConfig(8).bus == DrumMachineProcessor::BusId::Cymbals);
    REQUIRE(processor.getPadConfig(11).bus == DrumMachineProcessor::BusId::Percussion);
    REQUIRE(processor.getPadConfig(13).bus == DrumMachineProcessor::BusId::Overhead);
    REQUIRE(processor.getPadConfig(15).bus == DrumMachineProcessor::BusId::Room);
}

TEST_CASE("DrumMachineProcessor maps velocity curves per pad", "[drums][processor]") {
    DrumMachineProcessor processor;

    REQUIRE(processor.mapVelocityForPad(0, 0.5f) == Catch::Approx(0.5f));

    REQUIRE(processor.setPadVelocityCurve(0, DrumMachineProcessor::VelocityCurve::Exponential));
    REQUIRE(processor.mapVelocityForPad(0, 0.5f) == Catch::Approx(0.25f));

    REQUIRE(processor.setPadVelocityCurve(0, DrumMachineProcessor::VelocityCurve::SCurve));
    REQUIRE(processor.mapVelocityForPad(0, 0.5f) == Catch::Approx(0.5f));

    REQUIRE(processor.setPadVelocityCurve(0, DrumMachineProcessor::VelocityCurve::Fixed, 0.73f));
    REQUIRE(processor.mapVelocityForPad(0, 0.12f) == Catch::Approx(0.73f));
}

TEST_CASE("DrumMachineProcessor routes midi note-ons to the matching pad", "[drums][processor]") {
    DrumMachineProcessor processor;
    processor.prepare(44100.0, 64, 2);

    juce::AudioBuffer<float> buffer(2, 64);
    buffer.clear();

    juce::MidiBuffer midi;
    midi.addEvent(juce::MidiMessage::noteOn(10, 36, static_cast<juce::uint8>(100)), 0);
    processor.processBlock(buffer, midi);

    REQUIRE(processor.getPadActiveVoices(0) == 1);
    REQUIRE(processor.getPadActiveVoices(1) == 0);
}

TEST_CASE("DrumMachineProcessor supports multiple notes per pad without note fan-out", "[drums][processor]") {
    DrumMachineProcessor processor;
    processor.prepare(44100.0, 64, 2);

    REQUIRE(processor.addPadMidiNote(0, 35));
    REQUIRE(processor.getPadMidiNotes(0) == std::vector<int>{35, 36});

    juce::AudioBuffer<float> buffer(2, 64);
    buffer.clear();

    juce::MidiBuffer extraKickNote;
    extraKickNote.addEvent(juce::MidiMessage::noteOn(10, 35, static_cast<juce::uint8>(100)), 0);
    processor.processBlock(buffer, extraKickNote);
    REQUIRE(processor.getPadActiveVoices(0) == 1);

    REQUIRE(processor.addPadMidiNote(1, 35));
    REQUIRE(processor.getPadMidiNotes(0) == std::vector<int>{36});
    REQUIRE(processor.getPadMidiNotes(1) == std::vector<int>{35, 38});

    juce::AudioBuffer<float> remappedBuffer(2, 64);
    remappedBuffer.clear();
    juce::MidiBuffer remappedNote;
    remappedNote.addEvent(juce::MidiMessage::noteOn(10, 35, static_cast<juce::uint8>(100)), 0);
    processor.processBlock(remappedBuffer, remappedNote);
    REQUIRE(processor.getPadActiveVoices(0) == 1);
    REQUIRE(processor.getPadActiveVoices(1) == 1);
}

TEST_CASE("DrumMachineProcessor respects per-pad midi channel filters", "[drums][processor]") {
    DrumMachineProcessor processor;
    processor.prepare(44100.0, 64, 2);
    REQUIRE(processor.setPadMidiChannel(0, 9));

    juce::AudioBuffer<float> buffer(2, 64);
    buffer.clear();

    juce::MidiBuffer wrongChannel;
    wrongChannel.addEvent(juce::MidiMessage::noteOn(10, 36, static_cast<juce::uint8>(100)), 0);
    processor.processBlock(buffer, wrongChannel);
    REQUIRE(processor.getPadActiveVoices(0) == 0);

    juce::MidiBuffer matchingChannel;
    matchingChannel.addEvent(juce::MidiMessage::noteOn(9, 36, static_cast<juce::uint8>(100)), 0);
    processor.processBlock(buffer, matchingChannel);
    REQUIRE(processor.getPadActiveVoices(0) == 1);
}

TEST_CASE("DrumMachineProcessor respects the global midi channel filter", "[drums][processor]") {
    DrumMachineProcessor processor;
    processor.prepare(44100.0, 64, 2);
    REQUIRE(processor.setGlobalMidiChannel(9));

    juce::AudioBuffer<float> buffer(2, 64);
    buffer.clear();

    juce::MidiBuffer wrongChannel;
    wrongChannel.addEvent(juce::MidiMessage::noteOn(10, 36, static_cast<juce::uint8>(100)), 0);
    processor.processBlock(buffer, wrongChannel);
    REQUIRE(processor.getPadActiveVoices(0) == 0);

    juce::MidiBuffer matchingChannel;
    matchingChannel.addEvent(juce::MidiMessage::noteOn(9, 36, static_cast<juce::uint8>(100)), 0);
    processor.processBlock(buffer, matchingChannel);
    REQUIRE(processor.getPadActiveVoices(0) == 1);
}
