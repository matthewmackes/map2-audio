#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <atomic>
#include <cmath>
#include <cstdlib>
#include <new>
#include <thread>

#include "../Source/DrumMachine/DrumMachineProcessor.h"
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_core/juce_core.h>

using namespace map2::drummachine;

namespace {

std::atomic<int> gTrackedAllocations{0};
thread_local bool gTrackAllocationsForCurrentThread = false;

struct ScopedAllocationTracking {
    ScopedAllocationTracking() {
        gTrackedAllocations.store(0, std::memory_order_relaxed);
        gTrackAllocationsForCurrentThread = true;
    }

    ~ScopedAllocationTracking() {
        gTrackAllocationsForCurrentThread = false;
    }
};

struct ScopedTempDir {
    ScopedTempDir() {
        dir = juce::File::getSpecialLocation(juce::File::tempDirectory)
                  .getChildFile("map2-drum-processor-tests-" + juce::Uuid().toString());
        dir.createDirectory();
    }

    ~ScopedTempDir() {
        dir.deleteRecursively();
    }

    juce::File dir;
};

juce::File makeTempWavFile(const juce::File& dir, const juce::String& name, float cycles) {
    juce::WavAudioFormat wav;
    auto file = dir.getChildFile(name);
    file.deleteFile();
    auto stream = std::unique_ptr<juce::FileOutputStream>(file.createOutputStream());
    REQUIRE(stream != nullptr);

    std::unique_ptr<juce::AudioFormatWriter> writer(
        wav.createWriterFor(stream.get(), 44100.0, 1, 16, {}, 0));
    REQUIRE(writer != nullptr);
    stream.release();

    juce::AudioBuffer<float> buffer(1, 2048);
    buffer.clear();
    for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
        const float phase = static_cast<float>(sample) / static_cast<float>(buffer.getNumSamples() - 1);
        const float envelope = 1.0f - phase;
        const float sine = std::sin(phase * juce::MathConstants<float>::twoPi * cycles);
        buffer.setSample(0, sample, 0.25f * envelope * sine);
    }
    REQUIRE(writer->writeFromAudioSampleBuffer(buffer, 0, buffer.getNumSamples()));
    writer.reset();
    return file;
}

juce::File makeTempWavFile(const juce::File& dir, const juce::String& name) {
    return makeTempWavFile(dir, name, 8.0f);
}

juce::File makeTempSfzFile(
    const juce::File& dir,
    const juce::String& name,
    const juce::String& sampleName,
    int midiNote) {
    auto sfzFile = dir.getChildFile(name);
    REQUIRE(sfzFile.replaceWithText(
        "<region> sample=" + sampleName + " key=" + juce::String(midiNote) + "\n"));
    return sfzFile;
}

struct RenderResult {
    juce::AudioBuffer<float> audio;
    DrumMachineProcessor::Metering metering;
};

RenderResult renderTriggeredPads(
    DrumMachineProcessor& processor,
    const std::vector<int>& padIndices,
    int velocity = 127,
    int blockSize = 512,
    int blockCount = 4) {
    juce::AudioBuffer<float> fullBuffer(2, blockSize * blockCount);
    fullBuffer.clear();

    for (const int padIndex : padIndices) {
        REQUIRE(processor.triggerNote(padIndex, velocity));
    }

    for (int block = 0; block < blockCount; ++block) {
        juce::AudioBuffer<float> blockBuffer(2, blockSize);
        blockBuffer.clear();
        juce::MidiBuffer midi;
        processor.processBlock(blockBuffer, midi);

        for (int channel = 0; channel < blockBuffer.getNumChannels(); ++channel) {
            fullBuffer.copyFrom(channel, block * blockSize, blockBuffer, channel, 0, blockSize);
        }
    }

    return {std::move(fullBuffer), processor.getMetering()};
}

float bufferPeak(const juce::AudioBuffer<float>& buffer, int channel) {
    return buffer.getMagnitude(channel, 0, buffer.getNumSamples());
}

float stereoPeak(const juce::AudioBuffer<float>& buffer) {
    return std::max(bufferPeak(buffer, 0), bufferPeak(buffer, 1));
}

}  // namespace

void* operator new(std::size_t size) {
    if (auto* ptr = std::malloc(size)) {
        if (gTrackAllocationsForCurrentThread) {
            gTrackedAllocations.fetch_add(1, std::memory_order_relaxed);
        }
        return ptr;
    }
    throw std::bad_alloc();
}

void* operator new[](std::size_t size) {
    if (auto* ptr = std::malloc(size)) {
        if (gTrackAllocationsForCurrentThread) {
            gTrackedAllocations.fetch_add(1, std::memory_order_relaxed);
        }
        return ptr;
    }
    throw std::bad_alloc();
}

void operator delete(void* ptr) noexcept {
    std::free(ptr);
}

void operator delete[](void* ptr) noexcept {
    std::free(ptr);
}

void operator delete(void* ptr, std::size_t) noexcept {
    std::free(ptr);
}

void operator delete[](void* ptr, std::size_t) noexcept {
    std::free(ptr);
}

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
    REQUIRE(processor.setPadVelocityCurve(0, DrumMachineProcessor::VelocityCurve::Logarithmic));
    REQUIRE(processor.mapVelocityForPad(0, 0.25f) == Catch::Approx(std::sqrt(0.25f)));

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

TEST_CASE("DrumMachineProcessor applies per-pad control setters through pad config", "[drums][processor]") {
    DrumMachineProcessor processor;

    REQUIRE(processor.setPadVolume(0, 0.42f));
    REQUIRE(processor.setPadPan(0, -0.25f));
    REQUIRE(processor.setPadTune(0, 7.5f));
    REQUIRE(processor.setPadMute(0, true));
    REQUIRE(processor.setPadSolo(0, true));
    REQUIRE(processor.setPadBus(0, DrumMachineProcessor::BusId::Room));

    const auto config = processor.getPadConfig(0);
    REQUIRE(config.volume == Catch::Approx(0.42f));
    REQUIRE(config.pan == Catch::Approx(-0.25f));
    REQUIRE(config.tuneSemitones == Catch::Approx(7.5f));
    REQUIRE(config.mute);
    REQUIRE(config.solo);
    REQUIRE(config.bus == DrumMachineProcessor::BusId::Room);
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

TEST_CASE("DrumMachineProcessor exposes master volume and rejects missing SFZ assets", "[drums][processor]") {
    DrumMachineProcessor processor;

    processor.setMasterVolume(0.63f);
    REQUIRE(processor.getMasterVolume() == Catch::Approx(0.63f));

    REQUIRE_FALSE(processor.loadPadSfz(0, "/definitely/missing/kit.sfz"));
    const auto status = processor.getPadSampleStatus(0);
    REQUIRE_FALSE(status.loaded);
    REQUIRE_FALSE(status.lastError.empty());
}

TEST_CASE("DrumMachineProcessor loads pad SFZ content and reports kit status", "[drums][processor]") {
    ScopedTempDir tempDir;
    REQUIRE(tempDir.dir.isDirectory());
    const auto wavFile = makeTempWavFile(tempDir.dir, "kick.wav");
    auto sfzFile = tempDir.dir.getChildFile("kick.sfz");
    REQUIRE(sfzFile.replaceWithText("<region> sample=kick.wav key=36\n"));

    DrumMachineProcessor processor;
    processor.prepare(44100.0, 128, 2);

    REQUIRE(processor.loadPadSfz(0, sfzFile.getFullPathName().toStdString()));
    const auto status = processor.getPadSampleStatus(0);
    REQUIRE(status.loaded);
    REQUIRE(status.regionCount >= 1);
    REQUIRE(status.loadedSampleCount >= 1);
    REQUIRE(status.sfzPath == sfzFile.getFullPathName().toStdString());

    const auto statuses = processor.getKitSampleStatus();
    REQUIRE(statuses[0].loaded);
}

TEST_CASE("DrumMachineProcessor renders pad controls into stereo output", "[drums][processor]") {
    ScopedTempDir tempDir;
    REQUIRE(tempDir.dir.isDirectory());
    const auto wavFile = makeTempWavFile(tempDir.dir, "pad-controls.wav");
    const auto sfzFile = makeTempSfzFile(tempDir.dir, "pad-controls.sfz", wavFile.getFileName(), 36);

    DrumMachineProcessor processor;
    processor.prepare(44100.0, 512, 2);
    REQUIRE(processor.loadPadSfz(0, sfzFile.getFullPathName().toStdString()));

    const auto baseline = renderTriggeredPads(processor, {0});
    REQUIRE(stereoPeak(baseline.audio) > 0.01f);
    REQUIRE(baseline.metering.perPadPeak[0] > 0.01f);
    REQUIRE(baseline.metering.perBusPeak[static_cast<size_t>(DrumMachineProcessor::BusId::Kick)] > 0.01f);

    REQUIRE(processor.setPadVolume(0, 0.25f));
    const auto quieter = renderTriggeredPads(processor, {0});
    REQUIRE(stereoPeak(quieter.audio) < stereoPeak(baseline.audio) * 0.35f);

    REQUIRE(processor.setPadVolume(0, 1.0f));
    REQUIRE(processor.setPadPan(0, 1.0f));
    const auto rightPanned = renderTriggeredPads(processor, {0});
    REQUIRE(bufferPeak(rightPanned.audio, 1) > bufferPeak(rightPanned.audio, 0) * 10.0f);

    REQUIRE(processor.setPadPan(0, 0.0f));
    REQUIRE(processor.setPadMute(0, true));
    const auto muted = renderTriggeredPads(processor, {0});
    REQUIRE(stereoPeak(muted.audio) == Catch::Approx(0.0f).margin(0.0001f));
    REQUIRE(muted.metering.perPadPeak[0] == Catch::Approx(0.0f).margin(0.0001f));
}

TEST_CASE("DrumMachineProcessor applies bus routing controls and master volume in the final mix", "[drums][processor]") {
    ScopedTempDir tempDir;
    REQUIRE(tempDir.dir.isDirectory());
    const auto kickWav = makeTempWavFile(tempDir.dir, "bus-routing-kick.wav");
    const auto snareWav = makeTempWavFile(tempDir.dir, "bus-routing-snare.wav");
    const auto kickSfz = makeTempSfzFile(tempDir.dir, "bus-routing-kick.sfz", kickWav.getFileName(), 36);
    const auto snareSfz = makeTempSfzFile(tempDir.dir, "bus-routing-snare.sfz", snareWav.getFileName(), 38);

    DrumMachineProcessor processor;
    processor.prepare(44100.0, 512, 2);
    REQUIRE(processor.loadPadSfz(0, kickSfz.getFullPathName().toStdString()));
    REQUIRE(processor.loadPadSfz(1, snareSfz.getFullPathName().toStdString()));
    REQUIRE(processor.setPadBus(0, DrumMachineProcessor::BusId::Kick));
    REQUIRE(processor.setPadBus(1, DrumMachineProcessor::BusId::Snare));

    const auto baseline = renderTriggeredPads(processor, {0, 1});
    const auto kickOnly = renderTriggeredPads(processor, {0});
    REQUIRE(stereoPeak(baseline.audio) > 0.01f);
    REQUIRE(stereoPeak(kickOnly.audio) > 0.01f);

    REQUIRE(processor.setBusMute(static_cast<int>(DrumMachineProcessor::BusId::Snare), true));
    const auto snareMuted = renderTriggeredPads(processor, {0, 1});
    REQUIRE(stereoPeak(snareMuted.audio) == Catch::Approx(stereoPeak(kickOnly.audio)).margin(0.01f));
    REQUIRE(snareMuted.metering.perBusPeak[static_cast<size_t>(DrumMachineProcessor::BusId::Snare)] > 0.01f);

    REQUIRE(processor.setBusMute(static_cast<int>(DrumMachineProcessor::BusId::Snare), false));
    REQUIRE(processor.setBusSolo(static_cast<int>(DrumMachineProcessor::BusId::Snare), true));
    const auto snareSoloed = renderTriggeredPads(processor, {0, 1});
    const auto snareOnly = renderTriggeredPads(processor, {1});
    REQUIRE(stereoPeak(snareSoloed.audio) == Catch::Approx(stereoPeak(snareOnly.audio)).margin(0.01f));
    REQUIRE(snareSoloed.metering.perBusPeak[static_cast<size_t>(DrumMachineProcessor::BusId::Kick)] > 0.01f);

    REQUIRE(processor.setBusSolo(static_cast<int>(DrumMachineProcessor::BusId::Snare), false));
    processor.setMasterVolume(0.5f);
    const auto halfMaster = renderTriggeredPads(processor, {0, 1});
    REQUIRE(stereoPeak(halfMaster.audio) == Catch::Approx(stereoPeak(baseline.audio) * 0.5f).margin(0.02f));
}

TEST_CASE("DrumMachineProcessor applies bus compressor makeup gain to rendered audio", "[drums][processor]") {
    ScopedTempDir tempDir;
    REQUIRE(tempDir.dir.isDirectory());
    const auto wavFile = makeTempWavFile(tempDir.dir, "bus-comp.wav");
    const auto sfzFile = makeTempSfzFile(tempDir.dir, "bus-comp.sfz", wavFile.getFileName(), 36);

    DrumMachineProcessor processor;
    processor.prepare(44100.0, 512, 2);
    REQUIRE(processor.loadPadSfz(0, sfzFile.getFullPathName().toStdString()));
    REQUIRE(processor.setPadBus(0, DrumMachineProcessor::BusId::Kick));

    const auto baseline = renderTriggeredPads(processor, {0});
    REQUIRE(stereoPeak(baseline.audio) > 0.01f);

    DrumMachineMixer::BusCompConfig comp;
    comp.thresholdDb = 0.0f;
    comp.ratio = 1.0f;
    comp.attackMs = 0.1f;
    comp.releaseMs = 5.0f;
    comp.makeupGainDb = 12.0f;
    REQUIRE(processor.setBusComp(static_cast<int>(DrumMachineProcessor::BusId::Kick), comp));

    const auto boosted = renderTriggeredPads(processor, {0});
    REQUIRE(stereoPeak(boosted.audio) > stereoPeak(baseline.audio) * 3.0f);
    REQUIRE(boosted.metering.perBusPeak[static_cast<size_t>(DrumMachineProcessor::BusId::Kick)]
            > baseline.metering.perBusPeak[static_cast<size_t>(DrumMachineProcessor::BusId::Kick)] * 3.0f);
}

TEST_CASE("DrumMachineProcessor applies bus EQ boosts to rendered audio content", "[drums][processor]") {
    ScopedTempDir tempDir;
    REQUIRE(tempDir.dir.isDirectory());
    const auto lowWav = makeTempWavFile(tempDir.dir, "bus-eq-low.wav", 2.0f);
    const auto highWav = makeTempWavFile(tempDir.dir, "bus-eq-high.wav", 320.0f);
    const auto lowSfz = makeTempSfzFile(tempDir.dir, "bus-eq-low.sfz", lowWav.getFileName(), 36);
    const auto highSfz = makeTempSfzFile(tempDir.dir, "bus-eq-high.sfz", highWav.getFileName(), 36);

    DrumMachineProcessor processor;
    processor.prepare(44100.0, 512, 2);
    REQUIRE(processor.setPadBus(0, DrumMachineProcessor::BusId::Kick));

    REQUIRE(processor.loadPadSfz(0, lowSfz.getFullPathName().toStdString()));
    const auto lowBaseline = renderTriggeredPads(processor, {0});
    REQUIRE(stereoPeak(lowBaseline.audio) > 0.01f);

    DrumMachineMixer::BusEqConfig lowBoost;
    lowBoost.lowGainDb = 12.0f;
    REQUIRE(processor.setBusEq(static_cast<int>(DrumMachineProcessor::BusId::Kick), lowBoost));
    const auto lowBoosted = renderTriggeredPads(processor, {0});
    REQUIRE(stereoPeak(lowBoosted.audio) > stereoPeak(lowBaseline.audio) * 1.2f);

    REQUIRE(processor.loadPadSfz(0, highSfz.getFullPathName().toStdString()));
    REQUIRE(processor.setBusEq(static_cast<int>(DrumMachineProcessor::BusId::Kick), {}));
    const auto highBaseline = renderTriggeredPads(processor, {0});
    REQUIRE(stereoPeak(highBaseline.audio) > 0.01f);

    DrumMachineMixer::BusEqConfig highBoost;
    highBoost.highGainDb = 12.0f;
    REQUIRE(processor.setBusEq(static_cast<int>(DrumMachineProcessor::BusId::Kick), highBoost));
    const auto highBoosted = renderTriggeredPads(processor, {0});
    REQUIRE(stereoPeak(highBoosted.audio) > stereoPeak(highBaseline.audio) * 1.2f);
}

TEST_CASE("DrumMachineProcessor avoids internal buffer growth on steady-state process blocks", "[drums][processor]") {
    ScopedTempDir tempDir;
    REQUIRE(tempDir.dir.isDirectory());
    const auto wavFile = makeTempWavFile(tempDir.dir, "rt-safe.wav");
    const auto sfzFile = makeTempSfzFile(tempDir.dir, "rt-safe.sfz", wavFile.getFileName(), 36);

    DrumMachineProcessor processor;
    processor.prepare(44100.0, 512, 2);
    REQUIRE(processor.loadPadSfz(0, sfzFile.getFullPathName().toStdString()));

    processor.resetRtProcessDiagnostics();

    for (int iteration = 0; iteration < 8; ++iteration) {
        juce::AudioBuffer<float> buffer(2, 512);
        buffer.clear();
        juce::MidiBuffer midi;
        midi.addEvent(juce::MidiMessage::noteOn(1, 36, static_cast<juce::uint8>(100)), 0);
        processor.processBlock(buffer, midi);
    }

    const auto diagnostics = processor.getRtProcessDiagnostics();
    REQUIRE(diagnostics.partRenderBufferResizes == 0);
    REQUIRE(diagnostics.mixerScratchBufferResizes == 0);
    REQUIRE(diagnostics.partFreezeBufferAllocations == 0);
}

TEST_CASE("DrumMachineProcessor performs steady-state process blocks without global heap allocations", "[drums][processor]") {
    ScopedTempDir tempDir;
    REQUIRE(tempDir.dir.isDirectory());
    const auto wavFile = makeTempWavFile(tempDir.dir, "rt-global-noalloc.wav");
    const auto sfzFile = makeTempSfzFile(tempDir.dir, "rt-global-noalloc.sfz", wavFile.getFileName(), 36);

    DrumMachineProcessor processor;
    processor.prepare(44100.0, 512, 2);
    REQUIRE(processor.loadPadSfz(0, sfzFile.getFullPathName().toStdString()));

    juce::AudioBuffer<float> buffer(2, 512);
    juce::MidiBuffer midi;
    midi.ensureSize(1024);

    // Warm the callback path once before measuring steady-state behavior.
    midi.addEvent(juce::MidiMessage::noteOn(1, 36, static_cast<juce::uint8>(100)), 0);
    buffer.clear();
    processor.processBlock(buffer, midi);

    const int iterations = 8;
    for (int iteration = 0; iteration < iterations; ++iteration) {
        midi.clear();
        midi.addEvent(juce::MidiMessage::noteOn(1, 36, static_cast<juce::uint8>(100)), 0);
        buffer.clear();

        ScopedAllocationTracking tracking;
        processor.processBlock(buffer, midi);
        REQUIRE(gTrackedAllocations.load(std::memory_order_relaxed) == 0);
    }
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

TEST_CASE("DrumMachineProcessor learns a note and channel for a selected pad", "[drums][processor]") {
    DrumMachineProcessor processor;
    REQUIRE(processor.startMidiLearn(4, false, 10));

    juce::AudioBuffer<float> buffer(2, 32);
    buffer.clear();
    juce::MidiBuffer midi;
    midi.addEvent(juce::MidiMessage::noteOn(9, 65, static_cast<juce::uint8>(110)), 0);
    processor.processBlock(buffer, midi);

    const auto state = processor.getMidiLearnState();
    REQUIRE(state.active == false);
    REQUIRE(state.lastReceivedNote == 65);
    REQUIRE(state.lastReceivedChannel == 9);
    REQUIRE(processor.getPadMidiNotes(4) == std::vector<int>{65});
    REQUIRE(processor.getPadConfig(4).midiChannel == 9);
}

TEST_CASE("DrumMachineProcessor advances through pads in learn-all mode", "[drums][processor]") {
    DrumMachineProcessor processor;
    REQUIRE(processor.startMidiLearn(0, true, 10));

    juce::AudioBuffer<float> buffer(2, 32);
    buffer.clear();

    juce::MidiBuffer firstHit;
    firstHit.addEvent(juce::MidiMessage::noteOn(10, 36, static_cast<juce::uint8>(100)), 0);
    processor.processBlock(buffer, firstHit);

    auto state = processor.getMidiLearnState();
    REQUIRE(state.active == true);
    REQUIRE(state.learnAll == true);
    REQUIRE(state.activePadIndex == 1);
    REQUIRE(processor.getPadMidiNotes(0) == std::vector<int>{36});
    REQUIRE(processor.getPadConfig(0).midiChannel == 10);

    juce::MidiBuffer secondHit;
    secondHit.addEvent(juce::MidiMessage::noteOn(11, 38, static_cast<juce::uint8>(100)), 0);
    processor.processBlock(buffer, secondHit);

    state = processor.getMidiLearnState();
    REQUIRE(state.active == true);
    REQUIRE(state.activePadIndex == 2);
    REQUIRE(state.lastReceivedNote == 38);
    REQUIRE(state.lastReceivedChannel == 11);
    REQUIRE(processor.getPadMidiNotes(1) == std::vector<int>{38});
    REQUIRE(processor.getPadConfig(1).midiChannel == 11);
}

TEST_CASE("DrumMachineProcessor times out inactive midi learn sessions", "[drums][processor]") {
    DrumMachineProcessor processor;
    REQUIRE(processor.startMidiLearn(2, true, 1));

    std::this_thread::sleep_for(std::chrono::milliseconds(1100));
    const auto state = processor.getMidiLearnState();
    REQUIRE(state.active == false);
    REQUIRE(state.activePadIndex == -1);
}
