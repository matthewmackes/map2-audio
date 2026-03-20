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

    REQUIRE(processor.setPadVelocityCurve(0, DrumMachineProcessor::VelocityCurve::Linear, 1.0f, 0.2f, 0.1f, 0.8f));
    REQUIRE(processor.mapVelocityForPad(0, 0.1f) == Catch::Approx(0.0f));
    REQUIRE(processor.mapVelocityForPad(0, 0.5f) == Catch::Approx(0.45f));

    const auto preview = processor.getVelocityCurvePreview(0);
    REQUIRE(preview[0] == Catch::Approx(0.0f));
    REQUIRE(preview[64] == Catch::Approx(processor.mapVelocityForPad(0, 64.0f / 127.0f)));
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

TEST_CASE("DrumMachineProcessor records the last mapped hit velocity", "[drums][processor]") {
    DrumMachineProcessor processor;
    processor.prepare(44100.0, 64, 2);
    REQUIRE(processor.setPadVelocityCurve(0, DrumMachineProcessor::VelocityCurve::Fixed, 0.66f));

    juce::AudioBuffer<float> buffer(2, 64);
    buffer.clear();

    juce::MidiBuffer midi;
    midi.addEvent(juce::MidiMessage::noteOn(1, 36, static_cast<juce::uint8>(42)), 0);
    processor.processBlock(buffer, midi);

    REQUIRE(processor.getLastMappedVelocityForPad(0) == Catch::Approx(0.66f));
}

TEST_CASE("DrumMachineProcessor routes zone notes to a shared pad with zone scaling", "[drums][processor]") {
    DrumMachineProcessor processor;
    processor.prepare(44100.0, 64, 2);

    REQUIRE(processor.setPadZone(1, DrumMachineProcessor::PadZoneKind::Rim, 40, -1, 0.5f));
    REQUIRE(processor.setPadZone(1, DrumMachineProcessor::PadZoneKind::Edge, 37, -1, 0.75f));

    const auto zones = processor.getPadZones(1);
    REQUIRE(zones.size() == 2);
    REQUIRE(zones[0].kind == DrumMachineProcessor::PadZoneKind::Rim);
    REQUIRE(zones[0].triggerNote == 40);
    REQUIRE(zones[0].keySwitchNote == -1);
    REQUIRE(zones[1].kind == DrumMachineProcessor::PadZoneKind::Edge);
    REQUIRE(zones[1].triggerNote == 37);

    juce::AudioBuffer<float> buffer(2, 64);
    buffer.clear();

    juce::MidiBuffer midi;
    midi.addEvent(juce::MidiMessage::noteOn(1, 40, static_cast<juce::uint8>(100)), 0);
    processor.processBlock(buffer, midi);

    REQUIRE(processor.getPadActiveVoices(1) == 1);
    REQUIRE(processor.getLastMappedVelocityForPad(1) == Catch::Approx((100.0f / 127.0f) * 0.5f).margin(0.02f));
}

TEST_CASE("DrumMachineProcessor preserves one-note-to-one-pad across zone remaps", "[drums][processor]") {
    DrumMachineProcessor processor;
    processor.prepare(44100.0, 64, 2);

    REQUIRE(processor.addPadMidiNote(0, 35));
    REQUIRE(processor.setPadZone(1, DrumMachineProcessor::PadZoneKind::Rim, 35, 38, 0.9f));
    REQUIRE(processor.getPadMidiNotes(0) == std::vector<int>{36});
    REQUIRE(processor.getPadMidiNotes(1) == std::vector<int>{35, 38});

    juce::AudioBuffer<float> buffer(2, 64);
    buffer.clear();

    juce::MidiBuffer midi;
    midi.addEvent(juce::MidiMessage::noteOn(1, 35, static_cast<juce::uint8>(100)), 0);
    processor.processBlock(buffer, midi);

    REQUIRE(processor.getPadActiveVoices(0) == 0);
    REQUIRE(processor.getPadActiveVoices(1) == 1);
}

TEST_CASE("DrumMachineProcessor exposes and applies drum hardware presets", "[drums][processor]") {
    DrumMachineProcessor processor;

    const auto presets = processor.getDrumMidiPresetNames();
    REQUIRE(presets.size() == 5);
    REQUIRE(presets[0] == "Roland PD-140DS / CY-18DR / VH-14D");
    REQUIRE(presets[1] == "Yamaha DTX Multi-Zone");
    REQUIRE(presets[2] == "Alesis Surge / Strike");
    REQUIRE(presets[3] == "ATV aDrums");
    REQUIRE(presets[4] == "2Box Universal");

    REQUIRE(processor.applyDrumMidiPreset("Roland PD-140DS / CY-18DR / VH-14D"));
    const auto snareZones = processor.getPadZones(1);
    REQUIRE(snareZones.size() == 3);
    REQUIRE(snareZones[0].kind == DrumMachineProcessor::PadZoneKind::Head);
    REQUIRE(snareZones[0].triggerNote == 38);
    REQUIRE(snareZones[1].kind == DrumMachineProcessor::PadZoneKind::Rim);
    REQUIRE(snareZones[1].triggerNote == 40);
    REQUIRE(snareZones[2].kind == DrumMachineProcessor::PadZoneKind::Edge);
    REQUIRE(snareZones[2].triggerNote == 37);
}
