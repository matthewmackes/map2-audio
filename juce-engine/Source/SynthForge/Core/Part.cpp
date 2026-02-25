#include "SynthForge/Core/Part.h"

#include <algorithm>
#include <cmath>
#include <memory>
#include <utility>

namespace map2::synthforge {

namespace {

int clampMidiChannel(int channel) {
    return std::clamp(channel, 0, 16);
}

}  // namespace

Part::Part() : Part(0) {}

Part::Part(int partIndex) {
    audioFormatManager_.registerBasicFormats();

    for (int i = 0; i < kVoicesPerPart; ++i) {
        synthesiser_.addVoice(new SynthVoice(voiceParameters_));
    }
    synthesiser_.addSound(new SynthSound());
    setPartIndex(partIndex);
    setSampleStatus(makeDefaultSampleStatus(partIndex_.load(std::memory_order_relaxed)));

    setParameter("osc1.waveform", 0.0f);
    setParameter("osc1.level", 0.75f);
    setParameter("osc1.coarse", 0.0f);
    setParameter("filter1.cutoff", 12000.0f);
    setParameter("filter1.resonance", 0.15f);
    setParameter("amp.attack", 10.0f);
    setParameter("amp.decay", 120.0f);
    setParameter("amp.sustain", 0.8f);
    setParameter("amp.release", 250.0f);
}

void Part::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_.store(sampleRate, std::memory_order_relaxed);

    renderBuffer_.setSize(std::max(2, numChannels), std::max(1, samplesPerBlock), false, false, true);
    renderBuffer_.clear();

    synthesiser_.setCurrentPlaybackSampleRate(sampleRate);
    for (int i = 0; i < synthesiser_.getNumVoices(); ++i) {
        if (auto* voice = dynamic_cast<SynthVoice*>(synthesiser_.getVoice(i))) {
            voice->setCurrentSampleRate(sampleRate);
        }
    }

    if (auto sampler = std::atomic_load_explicit(&samplerProgram_, std::memory_order_acquire)) {
        sampler->synthesiser.setCurrentPlaybackSampleRate(sampleRate);
    }

    prepared_.store(true, std::memory_order_release);
}

void Part::setPartIndex(int partIndex) {
    partIndex_.store(std::clamp(partIndex, 0, kNumParts - 1), std::memory_order_relaxed);
}

void Part::setConfig(const PartConfig& config) {
    setPartIndex(config.partIndex);
    setMidiChannel(config.midiChannel);
    outputBus_.store(config.outputBus, std::memory_order_relaxed);
    level_.store(clamp(config.level, 0.0f, 1.0f), std::memory_order_relaxed);
    pan_.store(clamp(config.pan, -1.0f, 1.0f), std::memory_order_relaxed);
    mute_.store(config.mute, std::memory_order_relaxed);
    solo_.store(config.solo, std::memory_order_relaxed);
}

PartConfig Part::getConfig() const {
    PartConfig config;
    config.partIndex = partIndex_.load(std::memory_order_relaxed);
    config.midiChannel = midiChannel_.load(std::memory_order_relaxed);
    config.outputBus = outputBus_.load(std::memory_order_relaxed);
    config.level = level_.load(std::memory_order_relaxed);
    config.pan = pan_.load(std::memory_order_relaxed);
    config.mute = mute_.load(std::memory_order_relaxed);
    config.solo = solo_.load(std::memory_order_relaxed);
    return config;
}

void Part::setMidiChannel(int midiChannel) {
    midiChannel_.store(clampMidiChannel(midiChannel), std::memory_order_relaxed);
}

void Part::processMidi(const juce::MidiBuffer& midiBuffer) {
    for (const auto metadata : midiBuffer) {
        const juce::MidiMessage message = metadata.getMessage();

        if (message.isNoteOn()) {
            voices_.noteOn(message.getNoteNumber());
            continue;
        }

        if (message.isNoteOff()) {
            voices_.noteOff(message.getNoteNumber());
            continue;
        }

        if (message.isAllNotesOff() || message.isAllSoundOff()) {
            voices_.allNotesOff();
            continue;
        }

        if (message.isController()) {
            const int controller = message.getControllerNumber();
            const int value = message.getControllerValue();

            if (controller == 7) {
                level_.store(clamp(static_cast<float>(value) / 127.0f, 0.0f, 1.0f), std::memory_order_relaxed);
            } else if (controller == 10) {
                const float pan = (static_cast<float>(value) / 63.5f) - 1.0f;
                pan_.store(clamp(pan, -1.0f, 1.0f), std::memory_order_relaxed);
            }
        }
    }
}

void Part::processAudio(juce::AudioBuffer<float>& mixBuffer, const juce::MidiBuffer& midiBuffer, bool soloActive) {
    if (!prepared_.load(std::memory_order_acquire)) {
        return;
    }

    if (mute_.load(std::memory_order_relaxed)) {
        return;
    }

    if (soloActive && !solo_.load(std::memory_order_relaxed)) {
        return;
    }

    const int numSamples = mixBuffer.getNumSamples();
    const int channels = std::max(2, mixBuffer.getNumChannels());
    if (renderBuffer_.getNumSamples() < numSamples || renderBuffer_.getNumChannels() < channels) {
        renderBuffer_.setSize(channels, numSamples, false, false, true);
    }
    renderBuffer_.clear();

    bool renderedSampler = false;
    if (samplerEnabled_.load(std::memory_order_acquire)) {
        if (auto sampler = std::atomic_load_explicit(&samplerProgram_, std::memory_order_acquire)) {
            if (sampler->synthesiser.getNumSounds() > 0) {
                sampler->synthesiser.renderNextBlock(renderBuffer_, midiBuffer, 0, numSamples);
                renderedSampler = true;
            }
        }
    }

    if (!renderedSampler) {
        synthesiser_.renderNextBlock(renderBuffer_, midiBuffer, 0, numSamples);
    }

    const float level = clamp(level_.load(std::memory_order_relaxed), 0.0f, 1.0f);
    const float pan = clamp(pan_.load(std::memory_order_relaxed), -1.0f, 1.0f);
    const float panNorm = (pan + 1.0f) * 0.5f;
    const float leftGain = std::cos(panNorm * juce::MathConstants<float>::halfPi) * level;
    const float rightGain = std::sin(panNorm * juce::MathConstants<float>::halfPi) * level;

    mixBuffer.addFrom(0, 0, renderBuffer_, 0, 0, numSamples, leftGain);
    if (mixBuffer.getNumChannels() > 1) {
        mixBuffer.addFrom(1, 0, renderBuffer_, 1, 0, numSamples, rightGain);
    }
}

bool Part::loadSfz(const std::string& sfzPath) {
    SampleLoadStatus status = getSampleStatus();
    status.partIndex = partIndex_.load(std::memory_order_relaxed);
    status.sfzPath = sfzPath;
    status.lastError.clear();
    status.warnings.clear();

    if (sfzPath.empty()) {
        status.lastError = "SFZ path must not be empty";
        setSampleStatus(status);
        return false;
    }

    const juce::File sfzFile(juce::String::fromUTF8(sfzPath.c_str()));
    const SfzDocument document = SfzLoader::load(sfzFile);
    status.warnings = document.warnings;

    if (!document.ok()) {
        status.lastError = document.error.empty() ? "SFZ parse/load failed" : document.error;
        setSampleStatus(status);
        return false;
    }

    auto samplerProgram = std::make_shared<SamplerProgram>();
    for (int i = 0; i < kVoicesPerPart; ++i) {
        samplerProgram->synthesiser.addVoice(new juce::SamplerVoice());
    }
    samplerProgram->synthesiser.setCurrentPlaybackSampleRate(sampleRate_.load(std::memory_order_relaxed));

    int loadedSounds = 0;
    for (const auto& region : document.regions) {
        if (region.loVelocity != 0 || region.hiVelocity != 127) {
            status.warnings.push_back(
                "Velocity layers are currently approximated (region loaded without velocity split)");
        }

        std::unique_ptr<juce::AudioFormatReader> reader(audioFormatManager_.createReaderFor(region.sampleFile));
        if (!reader) {
            status.warnings.push_back(
                "Failed to open sample: " + region.sampleFile.getFullPathName().toStdString());
            continue;
        }

        juce::BigInteger notes;
        for (int note = region.loKey; note <= region.hiKey; ++note) {
            notes.setBit(note);
        }

        auto* sound = new juce::SamplerSound(
            region.sampleFile.getFileNameWithoutExtension(),
            *reader,
            notes,
            region.rootKey,
            std::max(0.0f, region.attackSeconds),
            std::max(0.0f, region.releaseSeconds),
            600.0);

        samplerProgram->synthesiser.addSound(sound);
        ++loadedSounds;
    }

    if (loadedSounds == 0) {
        status.lastError = "No region samples could be loaded from SFZ";
        setSampleStatus(status);
        return false;
    }

    samplerProgram->regionCount = static_cast<int>(document.regions.size());
    samplerProgram->loadedSampleCount = loadedSounds;

    std::atomic_store_explicit(&samplerProgram_, std::move(samplerProgram), std::memory_order_release);
    samplerEnabled_.store(true, std::memory_order_release);

    status.loaded = true;
    status.samplerMode = true;
    status.sfzPath = sfzFile.getFullPathName().toStdString();
    status.regionCount = static_cast<int>(document.regions.size());
    status.loadedSampleCount = loadedSounds;
    status.lastError.clear();
    setSampleStatus(status);
    return true;
}

SampleLoadStatus Part::getSampleStatus() const {
    std::lock_guard<std::mutex> guard(sampleStatusMutex_);
    SampleLoadStatus copy = sampleStatus_;
    copy.partIndex = partIndex_.load(std::memory_order_relaxed);
    return copy;
}

void Part::resetVoices() {
    voices_.reset();
}

void Part::setParameter(const std::string& name, float value) {
    if (name == "osc1.waveform") {
        const int waveform = static_cast<int>(std::round(value));
        voiceParameters_.waveform.store(std::clamp(waveform, 0, 3), std::memory_order_relaxed);
    } else if (name == "osc1.level") {
        voiceParameters_.oscLevel.store(clamp(value, 0.0f, 1.0f), std::memory_order_relaxed);
    } else if (name == "osc1.coarse") {
        voiceParameters_.coarseSemitones.store(clamp(value, -24.0f, 24.0f), std::memory_order_relaxed);
    } else if (name == "filter1.cutoff") {
        voiceParameters_.cutoffHz.store(mapNormalizedCutoff(value), std::memory_order_relaxed);
    } else if (name == "filter1.resonance") {
        const float resonance = value <= 1.0f ? (0.1f + (value * 1.1f)) : value;
        voiceParameters_.resonance.store(clamp(resonance, 0.1f, 1.2f), std::memory_order_relaxed);
    } else if (name == "amp.attack") {
        voiceParameters_.attackMs.store(normalizeEnvelopeMs(value), std::memory_order_relaxed);
    } else if (name == "amp.decay") {
        voiceParameters_.decayMs.store(normalizeEnvelopeMs(value), std::memory_order_relaxed);
    } else if (name == "amp.sustain") {
        const float sustain = value > 1.0f ? value / 100.0f : value;
        voiceParameters_.sustain.store(clamp(sustain, 0.0f, 1.0f), std::memory_order_relaxed);
    } else if (name == "amp.release") {
        voiceParameters_.releaseMs.store(normalizeEnvelopeMs(value), std::memory_order_relaxed);
    }

    std::lock_guard<std::mutex> guard(parameterMutex_);
    parameters_[name] = value;
}

std::map<std::string, float> Part::getParameters() const {
    std::lock_guard<std::mutex> guard(parameterMutex_);
    return parameters_;
}

float Part::mapNormalizedCutoff(float value) {
    if (value <= 1.0f) {
        // Exponential-style mapping for normalized controls.
        const float normalized = clamp(value, 0.0f, 1.0f);
        const float hz = 20.0f * std::pow(1000.0f, normalized);
        return clamp(hz, 20.0f, 20000.0f);
    }
    return clamp(value, 20.0f, 20000.0f);
}

float Part::normalizeEnvelopeMs(float value) {
    if (value <= 10.0f) {
        return clamp(value * 1000.0f, 1.0f, 5000.0f);
    }
    return clamp(value, 1.0f, 5000.0f);
}

void Part::setSampleStatus(const SampleLoadStatus& status) {
    std::lock_guard<std::mutex> guard(sampleStatusMutex_);
    sampleStatus_ = status;
}

SampleLoadStatus Part::makeDefaultSampleStatus(int partIndex) {
    SampleLoadStatus status;
    status.partIndex = partIndex;
    status.loaded = false;
    status.samplerMode = false;
    status.regionCount = 0;
    status.loadedSampleCount = 0;
    return status;
}

}  // namespace map2::synthforge
