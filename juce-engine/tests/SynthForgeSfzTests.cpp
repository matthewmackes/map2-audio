#include <catch2/catch_test_macros.hpp>

#include "../Source/SynthForge/Sampler/GroupedSampler.h"
#include "../Source/SynthForge/Sampler/SfzLoader.h"

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_core/juce_core.h>

using namespace map2::synthforge;

namespace {

struct ScopedTempDir {
    ScopedTempDir() {
        dir = juce::File::getSpecialLocation(juce::File::tempDirectory)
                  .getChildFile("map2-sfz-tests-" + juce::Uuid().toString());
        dir.createDirectory();
    }

    ~ScopedTempDir() {
        dir.deleteRecursively();
    }

    juce::File dir;
};

juce::File makeTempWavFile(const juce::File& dir, const juce::String& name) {
    juce::WavAudioFormat wav;
    auto file = dir.getChildFile(name);
    file.deleteFile();
    auto stream = std::unique_ptr<juce::FileOutputStream>(file.createOutputStream());
    REQUIRE(stream != nullptr);

    std::unique_ptr<juce::AudioFormatWriter> writer(
        wav.createWriterFor(stream.get(), 44100.0, 1, 16, {}, 0));
    REQUIRE(writer != nullptr);
    stream.release();

    juce::AudioBuffer<float> buffer(1, 64);
    buffer.clear();
    buffer.setSample(0, 0, 0.5f);
    REQUIRE(writer->writeFromAudioSampleBuffer(buffer, 0, buffer.getNumSamples()));
    writer.reset();
    return file;
}

std::unique_ptr<juce::AudioFormatReader> createReader(juce::AudioFormatManager& formats,
                                                      const juce::File& file) {
    return std::unique_ptr<juce::AudioFormatReader>(formats.createReaderFor(file));
}

int countActiveVoicesWithGroup(const GroupedSamplerSynthesiser& synth, int group) {
    int count = 0;
    for (int i = 0; i < synth.getNumVoices(); ++i) {
        auto* voice = synth.getVoice(i);
        if (voice == nullptr || !voice->isVoiceActive()) {
            continue;
        }

        auto currentSound = voice->getCurrentlyPlayingSound();
        auto* groupedSound = dynamic_cast<GroupedSamplerSound*>(currentSound.get());
        if (groupedSound != nullptr && groupedSound->getChokeGroup() == group) {
            ++count;
        }
    }
    return count;
}

}  // namespace

TEST_CASE("SfzLoader parses choke-group opcodes", "[synthforge][sfz][group]") {
    ScopedTempDir tempDir;
    REQUIRE(tempDir.dir.isDirectory());

    makeTempWavFile(tempDir.dir, "hat.wav");

    auto sfzFile = tempDir.dir.getChildFile("kit.sfz");
    REQUIRE(sfzFile.replaceWithText(
        "<group>\n"
        "group=3 off_by=9\n"
        "<region> sample=hat.wav key=42\n"));

    const auto document = SfzLoader::load(sfzFile);
    REQUIRE(document.ok());
    REQUIRE(document.regions.size() == 1);
    REQUIRE(document.regions.front().group == 3);
    REQUIRE(document.regions.front().offBy == 9);
}

TEST_CASE("GroupedSamplerSynthesiser chokes matching active group", "[synthforge][sfz][group]") {
    ScopedTempDir tempDir;
    REQUIRE(tempDir.dir.isDirectory());

    auto closedHatFile = makeTempWavFile(tempDir.dir, "closed.wav");
    auto openHatFile = makeTempWavFile(tempDir.dir, "open.wav");

    juce::AudioFormatManager formats;
    formats.registerBasicFormats();
    auto closedReader = createReader(formats, closedHatFile);
    auto openReader = createReader(formats, openHatFile);
    REQUIRE(closedReader != nullptr);
    REQUIRE(openReader != nullptr);

    GroupedSamplerSynthesiser synth;
    synth.setCurrentPlaybackSampleRate(44100.0);
    synth.addVoice(new juce::SamplerVoice());
    synth.addVoice(new juce::SamplerVoice());

    juce::BigInteger closedNotes;
    closedNotes.setBit(42);
    juce::BigInteger openNotes;
    openNotes.setBit(46);

    synth.addSound(new GroupedSamplerSound("closed", *closedReader, closedNotes, 42, 0.0, 0.01, 1.0, 1, 0));
    synth.addSound(new GroupedSamplerSound("open", *openReader, openNotes, 46, 0.0, 0.01, 1.0, 2, 1));

    synth.noteOn(1, 42, 1.0f);
    REQUIRE(countActiveVoicesWithGroup(synth, 1) == 1);
    REQUIRE(countActiveVoicesWithGroup(synth, 2) == 0);

    synth.noteOn(1, 46, 1.0f);
    REQUIRE(countActiveVoicesWithGroup(synth, 1) == 0);
    REQUIRE(countActiveVoicesWithGroup(synth, 2) == 1);
}
