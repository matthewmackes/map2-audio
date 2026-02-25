#include "SynthForge/SynthForgeProcessor.h"

#include <algorithm>
#include <utility>

namespace map2::synthforge {

SynthForgeProcessor::SynthForgeProcessor() {
    for (int i = 0; i < kNumParts; ++i) {
        parts_[static_cast<size_t>(i)].setPartIndex(i);
        parts_[static_cast<size_t>(i)].setMidiChannel(i + 1);
    }
    initializeFactoryPatches();
}

void SynthForgeProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_.store(sampleRate, std::memory_order_relaxed);
    samplesPerBlock_.store(std::max(1, samplesPerBlock), std::memory_order_relaxed);
    numChannels_.store(std::max(1, numChannels), std::memory_order_relaxed);

    const int reserveBytes = std::max(1024, samplesPerBlock * 12);
    for (auto& buffer : partMidiBuffers_) {
        buffer.clear();
        buffer.ensureSize(reserveBytes);
    }

    for (auto& part : parts_) {
        part.resetVoices();
        part.prepare(sampleRate, samplesPerBlock, numChannels);
    }

    prepared_.store(true, std::memory_order_release);
}

void SynthForgeProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiBuffer) {
    if (!prepared_.load(std::memory_order_acquire)) {
        return;
    }

    std::array<int, kNumParts> partChannels{};
    for (int i = 0; i < kNumParts; ++i) {
        partChannels[static_cast<size_t>(i)] = parts_[static_cast<size_t>(i)].getMidiChannel();
    }

    midiRouter_.routeMidi(midiBuffer, partMidiBuffers_, partChannels);

    bool soloActive = false;
    for (const auto& part : parts_) {
        if (part.isSolo()) {
            soloActive = true;
            break;
        }
    }

    for (int i = 0; i < kNumParts; ++i) {
        parts_[static_cast<size_t>(i)].processMidi(partMidiBuffers_[static_cast<size_t>(i)]);
        parts_[static_cast<size_t>(i)].processAudio(buffer, partMidiBuffers_[static_cast<size_t>(i)], soloActive);
    }
}

std::vector<PartConfig> SynthForgeProcessor::getPartsConfig() const {
    std::vector<PartConfig> configs;
    configs.reserve(kNumParts);
    for (const auto& part : parts_) {
        configs.push_back(part.getConfig());
    }
    return configs;
}

bool SynthForgeProcessor::setPartConfig(int partIndex, const PartConfig& config) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }

    PartConfig updated = config;
    updated.partIndex = partIndex;
    parts_[static_cast<size_t>(partIndex)].setConfig(updated);
    return true;
}

bool SynthForgeProcessor::setPartChannel(int partIndex, int midiChannel) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }
    parts_[static_cast<size_t>(partIndex)].setMidiChannel(midiChannel);
    return true;
}

int SynthForgeProcessor::getPartChannel(int partIndex) const {
    if (!isValidPartIndex(partIndex)) {
        return -1;
    }
    return parts_[static_cast<size_t>(partIndex)].getMidiChannel();
}

std::map<std::string, float> SynthForgeProcessor::getPartParameters(int partIndex) const {
    if (!isValidPartIndex(partIndex)) {
        return {};
    }
    return parts_[static_cast<size_t>(partIndex)].getParameters();
}

bool SynthForgeProcessor::setPartParameter(int partIndex, const std::string& parameter, float value) {
    if (!isValidPartIndex(partIndex) || parameter.empty()) {
        return false;
    }
    parts_[static_cast<size_t>(partIndex)].setParameter(parameter, value);
    return true;
}

std::vector<PatchInfo> SynthForgeProcessor::getPatches(const std::string& categoryFilter) const {
    std::vector<PatchInfo> patches;

    std::lock_guard<std::mutex> guard(patchMutex_);
    for (const auto& [key, patch] : patchBank_) {
        juce::ignoreUnused(key);
        if (!categoryFilter.empty() && patch.info.category != categoryFilter) {
            continue;
        }
        patches.push_back(patch.info);
    }

    std::sort(
        patches.begin(),
        patches.end(),
        [](const PatchInfo& lhs, const PatchInfo& rhs) {
            if (lhs.bank != rhs.bank) {
                return lhs.bank < rhs.bank;
            }
            return lhs.program < rhs.program;
        });
    return patches;
}

bool SynthForgeProcessor::loadPatch(int partIndex, int bank, int program) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }

    std::lock_guard<std::mutex> guard(patchMutex_);
    const auto it = patchBank_.find(std::make_pair(bank, program));
    if (it == patchBank_.end()) {
        return false;
    }

    PartConfig config = it->second.config;
    config.partIndex = partIndex;
    parts_[static_cast<size_t>(partIndex)].setConfig(config);

    for (const auto& [name, value] : it->second.parameters) {
        parts_[static_cast<size_t>(partIndex)].setParameter(name, value);
    }
    return true;
}

bool SynthForgeProcessor::savePatch(int partIndex, int bank, int program, const std::string& name) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }

    PatchState patch;
    patch.info.bank = bank;
    patch.info.program = program;
    patch.info.name = name.empty() ? "User Patch" : name;
    patch.info.category = "user";
    patch.info.author = "MAP2 User";
    patch.info.description = "Saved from SynthForge phase 1 scaffold";
    patch.config = parts_[static_cast<size_t>(partIndex)].getConfig();
    patch.parameters = parts_[static_cast<size_t>(partIndex)].getParameters();

    std::lock_guard<std::mutex> guard(patchMutex_);
    patchBank_[std::make_pair(bank, program)] = patch;
    return true;
}

VoiceMetrics SynthForgeProcessor::getVoiceMetrics() const {
    VoiceMetrics metrics;

    for (int i = 0; i < kNumParts; ++i) {
        const auto& part = parts_[static_cast<size_t>(i)];
        const int active = part.getActiveVoices();
        metrics.voicesPerPart[static_cast<size_t>(i)] = active;
        metrics.activeVoices += active;
        metrics.peakVoices = std::max(metrics.peakVoices, part.getPeakVoices());
    }

    metrics.cpuPercent = 0.0f;
    return metrics;
}

Metering SynthForgeProcessor::getMetering() const {
    Metering metering;
    metering.voiceMetrics = getVoiceMetrics();

    for (int i = 0; i < kNumParts; ++i) {
        const PartConfig config = parts_[static_cast<size_t>(i)].getConfig();
        metering.partLevels[static_cast<size_t>(i)] = config.mute ? 0.0f : config.level;
    }

    return metering;
}

bool SynthForgeProcessor::isValidPartIndex(int partIndex) {
    return partIndex >= 0 && partIndex < kNumParts;
}

void SynthForgeProcessor::initializeFactoryPatches() {
    PatchState patchA;
    patchA.info.bank = 0;
    patchA.info.program = 0;
    patchA.info.name = "Init Multi";
    patchA.info.category = "factory";
    patchA.info.author = "MAP2 Audio";
    patchA.info.description = "Default initialization patch";
    patchA.config.partIndex = 0;
    patchA.config.midiChannel = 1;
    patchA.config.outputBus = OutputBus::Main;
    patchA.config.level = 1.0f;
    patchA.config.pan = 0.0f;
    patchA.parameters = {
        {"osc1.level", 0.75f},
        {"filter1.cutoff", 0.6f},
        {"amp.attack", 0.01f},
    };

    PatchState patchB;
    patchB.info.bank = 0;
    patchB.info.program = 1;
    patchB.info.name = "Warm Pad Seed";
    patchB.info.category = "factory";
    patchB.info.author = "MAP2 Audio";
    patchB.info.description = "Seed patch for Phase 2 subtractive synthesis";
    patchB.config.partIndex = 0;
    patchB.config.midiChannel = 2;
    patchB.config.outputBus = OutputBus::Main;
    patchB.config.level = 0.85f;
    patchB.config.pan = 0.0f;
    patchB.parameters = {
        {"osc1.level", 0.6f},
        {"osc2.level", 0.4f},
        {"filter1.cutoff", 0.45f},
        {"env1.release", 0.5f},
    };

    std::lock_guard<std::mutex> guard(patchMutex_);
    patchBank_[std::make_pair(0, 0)] = patchA;
    patchBank_[std::make_pair(0, 1)] = patchB;
}

}  // namespace map2::synthforge
