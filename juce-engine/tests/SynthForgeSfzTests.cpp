#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include "../Source/SynthForge/Sampler/GroupedSampler.h"
#include "../Source/SynthForge/Sampler/SfzLoader.h"

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_core/juce_core.h>

#include <vector>

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

std::vector<int> activeSeqPositions(const GroupedSamplerSynthesiser& synth) {
    std::vector<int> positions;
    for (int i = 0; i < synth.getNumVoices(); ++i) {
        auto* voice = synth.getVoice(i);
        if (voice == nullptr || !voice->isVoiceActive()) {
            continue;
        }

        auto currentSound = voice->getCurrentlyPlayingSound();
        auto* groupedSound = dynamic_cast<GroupedSamplerSound*>(currentSound.get());
        if (groupedSound != nullptr) {
            positions.push_back(groupedSound->getSeqPosition());
        }
    }
    return positions;
}

std::vector<float> activeRandomLows(const GroupedSamplerSynthesiser& synth) {
    std::vector<float> lows;
    for (int i = 0; i < synth.getNumVoices(); ++i) {
        auto* voice = synth.getVoice(i);
        if (voice == nullptr || !voice->isVoiceActive()) {
            continue;
        }

        auto currentSound = voice->getCurrentlyPlayingSound();
        auto* groupedSound = dynamic_cast<GroupedSamplerSound*>(currentSound.get());
        if (groupedSound != nullptr) {
            lows.push_back(groupedSound->getLoRand());
        }
    }
    return lows;
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

TEST_CASE("SfzLoader parses round-robin opcodes", "[synthforge][sfz][round-robin]") {
    ScopedTempDir tempDir;
    REQUIRE(tempDir.dir.isDirectory());

    makeTempWavFile(tempDir.dir, "hat.wav");

    auto sfzFile = tempDir.dir.getChildFile("kit.sfz");
    REQUIRE(sfzFile.replaceWithText(
        "<region> sample=hat.wav key=42 seq_length=4 seq_position=3\n"));

    const auto document = SfzLoader::load(sfzFile);
    REQUIRE(document.ok());
    REQUIRE(document.regions.size() == 1);
    REQUIRE(document.regions.front().seqLength == 4);
    REQUIRE(document.regions.front().seqPosition == 3);
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

    synth.addSound(new GroupedSamplerSound("closed", *closedReader, closedNotes, 42, 0.0, 0.01, 1.0, 1, 0, 0, 0, 0.0f, 1.0f, false));
    synth.addSound(new GroupedSamplerSound("open", *openReader, openNotes, 46, 0.0, 0.01, 1.0, 2, 1, 0, 0, 0.0f, 1.0f, false));

    synth.noteOn(1, 42, 1.0f);
    REQUIRE(countActiveVoicesWithGroup(synth, 1) == 1);
    REQUIRE(countActiveVoicesWithGroup(synth, 2) == 0);

    synth.noteOn(1, 46, 1.0f);
    REQUIRE(countActiveVoicesWithGroup(synth, 1) == 0);
    REQUIRE(countActiveVoicesWithGroup(synth, 2) == 1);
}

TEST_CASE("GroupedSamplerSynthesiser alternates round-robin regions per key",
          "[synthforge][sfz][round-robin]") {
    ScopedTempDir tempDir;
    REQUIRE(tempDir.dir.isDirectory());

    auto firstFile = makeTempWavFile(tempDir.dir, "rr1.wav");
    auto secondFile = makeTempWavFile(tempDir.dir, "rr2.wav");

    juce::AudioFormatManager formats;
    formats.registerBasicFormats();
    auto firstReader = createReader(formats, firstFile);
    auto secondReader = createReader(formats, secondFile);
    REQUIRE(firstReader != nullptr);
    REQUIRE(secondReader != nullptr);

    GroupedSamplerSynthesiser synth;
    synth.setCurrentPlaybackSampleRate(44100.0);
    synth.addVoice(new juce::SamplerVoice());
    synth.addVoice(new juce::SamplerVoice());

    juce::BigInteger notes;
    notes.setBit(42);

    synth.addSound(new GroupedSamplerSound("rr1", *firstReader, notes, 42, 0.0, 0.0, 1.0, 0, 0, 2, 1, 0.0f, 1.0f, false));
    synth.addSound(new GroupedSamplerSound("rr2", *secondReader, notes, 42, 0.0, 0.0, 1.0, 0, 0, 2, 2, 0.0f, 1.0f, false));

    synth.noteOn(1, 42, 1.0f);
    REQUIRE(activeSeqPositions(synth) == std::vector<int>{1});
    synth.allNotesOff(1, false);

    synth.noteOn(1, 42, 1.0f);
    REQUIRE(activeSeqPositions(synth) == std::vector<int>{2});
    synth.allNotesOff(1, false);

    synth.noteOn(1, 42, 1.0f);
    REQUIRE(activeSeqPositions(synth) == std::vector<int>{1});
}

TEST_CASE("SfzLoader parses random range opcodes", "[synthforge][sfz][random]") {
    ScopedTempDir tempDir;
    REQUIRE(tempDir.dir.isDirectory());

    makeTempWavFile(tempDir.dir, "hat.wav");

    auto sfzFile = tempDir.dir.getChildFile("kit.sfz");
    REQUIRE(sfzFile.replaceWithText(
        "<region> sample=hat.wav key=42 lorand=0.25 hirand=0.75\n"));

    const auto document = SfzLoader::load(sfzFile);
    REQUIRE(document.ok());
    REQUIRE(document.regions.size() == 1);
    REQUIRE(document.regions.front().hasRandomRange);
    REQUIRE(document.regions.front().loRand == Catch::Approx(0.25f));
    REQUIRE(document.regions.front().hiRand == Catch::Approx(0.75f));
}

TEST_CASE("GroupedSamplerSynthesiser selects random layers from lorand and hirand",
          "[synthforge][sfz][random]") {
    ScopedTempDir tempDir;
    REQUIRE(tempDir.dir.isDirectory());

    auto firstFile = makeTempWavFile(tempDir.dir, "rand1.wav");
    auto secondFile = makeTempWavFile(tempDir.dir, "rand2.wav");

    juce::AudioFormatManager formats;
    formats.registerBasicFormats();
    auto firstReader = createReader(formats, firstFile);
    auto secondReader = createReader(formats, secondFile);
    REQUIRE(firstReader != nullptr);
    REQUIRE(secondReader != nullptr);

    GroupedSamplerSynthesiser synth;
    synth.setCurrentPlaybackSampleRate(44100.0);
    synth.addVoice(new juce::SamplerVoice());
    synth.addVoice(new juce::SamplerVoice());

    juce::BigInteger notes;
    notes.setBit(42);

    synth.addSound(new GroupedSamplerSound("rand1", *firstReader, notes, 42, 0.0, 0.0, 1.0, 0, 0, 0, 0, 0.0f, 0.5f, true));
    synth.addSound(new GroupedSamplerSound("rand2", *secondReader, notes, 42, 0.0, 0.0, 1.0, 0, 0, 0, 0, 0.5f, 1.0f, true));

    synth.setNextRandomValueForTesting(0.25f);
    synth.noteOn(1, 42, 1.0f);
    REQUIRE(activeRandomLows(synth) == std::vector<float>{0.0f});
    synth.allNotesOff(1, false);

    synth.setNextRandomValueForTesting(0.75f);
    synth.noteOn(1, 42, 1.0f);
    REQUIRE(activeRandomLows(synth) == std::vector<float>{0.5f});
}
