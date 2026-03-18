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

bool SynthForgeProcessor::loadPartSfz(int partIndex, const std::string& sfzPath) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }
    return parts_[static_cast<size_t>(partIndex)].loadSfz(sfzPath);
}

bool SynthForgeProcessor::loadPartSoundFont(
    int partIndex,
    const std::string& soundfontPath,
    int bank,
    int program,
    const std::string& presetName) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }
    return parts_[static_cast<size_t>(partIndex)].loadSoundFont(soundfontPath, bank, program, presetName);
}

SampleLoadStatus SynthForgeProcessor::getPartSampleStatus(int partIndex) const {
    if (!isValidPartIndex(partIndex)) {
        SampleLoadStatus status;
        status.partIndex = partIndex;
        status.lastError = "part_index must be in range 0..15";
        return status;
    }
    return parts_[static_cast<size_t>(partIndex)].getSampleStatus();
}

bool SynthForgeProcessor::reloadPartSfzIfChanged(int partIndex) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }
    return parts_[static_cast<size_t>(partIndex)].reloadSfzIfChanged();
}

bool SynthForgeProcessor::setPartSamplerBackend(int partIndex, const std::string& backend) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }
    return parts_[static_cast<size_t>(partIndex)].setSamplerBackend(samplerBackendFromString(backend));
}

std::string SynthForgeProcessor::getPartSamplerBackend(int partIndex) const {
    if (!isValidPartIndex(partIndex)) {
        return samplerBackendToString(SamplerBackend::Native);
    }
    return samplerBackendToString(parts_[static_cast<size_t>(partIndex)].getSamplerBackend());
}

bool SynthForgeProcessor::setPartStreamingConfig(int partIndex, const StreamingConfig& config) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }
    return parts_[static_cast<size_t>(partIndex)].setStreamingConfig(config);
}

StreamingConfig SynthForgeProcessor::getPartStreamingConfig(int partIndex) const {
    if (!isValidPartIndex(partIndex)) {
        return {};
    }
    return parts_[static_cast<size_t>(partIndex)].getStreamingConfig();
}

bool SynthForgeProcessor::setPartHotReload(int partIndex, bool enabled, int intervalMs) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }
    return parts_[static_cast<size_t>(partIndex)].setHotReloadEnabled(enabled, intervalMs);
}

HotReloadStatus SynthForgeProcessor::getPartHotReloadStatus(int partIndex) const {
    if (!isValidPartIndex(partIndex)) {
        return {};
    }
    return parts_[static_cast<size_t>(partIndex)].getHotReloadStatus();
}

bool SynthForgeProcessor::loadPartScalaTuning(int partIndex, const std::string& scalaPath, int rootKey, float referenceHz) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }
    return parts_[static_cast<size_t>(partIndex)].loadScalaTuning(scalaPath, rootKey, referenceHz);
}

ScalaTuningConfig SynthForgeProcessor::getPartScalaTuning(int partIndex) const {
    if (!isValidPartIndex(partIndex)) {
        return {};
    }
    return parts_[static_cast<size_t>(partIndex)].getScalaTuning();
}

bool SynthForgeProcessor::setPartMpeConfig(int partIndex, const MpeConfig& config) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }
    parts_[static_cast<size_t>(partIndex)].setMpeConfig(config);
    return true;
}

MpeConfig SynthForgeProcessor::getPartMpeConfig(int partIndex) const {
    if (!isValidPartIndex(partIndex)) {
        return {};
    }
    return parts_[static_cast<size_t>(partIndex)].getMpeConfig();
}

bool SynthForgeProcessor::setPartModMatrixRoutes(int partIndex, const std::vector<ModMatrixRoute>& routes) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }
    return parts_[static_cast<size_t>(partIndex)].setModMatrixRoutes(routes);
}

std::vector<ModMatrixRoute> SynthForgeProcessor::getPartModMatrixRoutes(int partIndex) const {
    if (!isValidPartIndex(partIndex)) {
        return {};
    }
    return parts_[static_cast<size_t>(partIndex)].getModMatrixRoutes();
}

bool SynthForgeProcessor::setPartFreezeEnabled(int partIndex, bool enabled) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }
    return parts_[static_cast<size_t>(partIndex)].setFreezeEnabled(enabled);
}

FreezeRenderStatus SynthForgeProcessor::getPartFreezeStatus(int partIndex) const {
    if (!isValidPartIndex(partIndex)) {
        return {};
    }
    return parts_[static_cast<size_t>(partIndex)].getFreezeRenderStatus();
}

bool SynthForgeProcessor::renderPartToFile(int partIndex, const std::string& outputPath, int durationMs) {
    if (!isValidPartIndex(partIndex)) {
        return false;
    }
    return parts_[static_cast<size_t>(partIndex)].renderPartToFile(outputPath, durationMs);
}

SamplerAnalyzerFrame SynthForgeProcessor::getPartAnalyzerFrame(int partIndex) const {
    if (!isValidPartIndex(partIndex)) {
        return {};
    }
    return parts_[static_cast<size_t>(partIndex)].getAnalyzerFrame();
}

std::vector<SamplerAnalyzerFrame> SynthForgeProcessor::getAnalyzerFrames() const {
    std::vector<SamplerAnalyzerFrame> frames;
    frames.reserve(kNumParts);
    for (int i = 0; i < kNumParts; ++i) {
        frames.push_back(parts_[static_cast<size_t>(i)].getAnalyzerFrame());
    }
    return frames;
}

SfzBackendStatus SynthForgeProcessor::getPartSfzBackendStatus(int partIndex) const {
    if (!isValidPartIndex(partIndex)) {
        return {};
    }
    return parts_[static_cast<size_t>(partIndex)].getSfzBackendStatus();
}

std::vector<SfzBackendStatus> SynthForgeProcessor::getSfzBackendStatus() const {
    std::vector<SfzBackendStatus> statuses;
    statuses.reserve(kNumParts);
    for (int i = 0; i < kNumParts; ++i) {
        statuses.push_back(parts_[static_cast<size_t>(i)].getSfzBackendStatus());
    }
    return statuses;
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
    patch.info.description = "Saved from SynthForge production sampler engine";
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
        const auto analyzer = part.getAnalyzerFrame();
        const int active = std::max(analyzer.activeVoices, part.getActiveVoices());
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
        {"osc1.waveform", 0.0f},
        {"osc1.level", 0.75f},
        {"osc1.coarse", 0.0f},
        {"filter1.cutoff", 12000.0f},
        {"filter1.resonance", 0.2f},
        {"amp.attack", 10.0f},
        {"amp.decay", 120.0f},
        {"amp.sustain", 0.8f},
        {"amp.release", 250.0f},
    };

    PatchState patchB;
    patchB.info.bank = 0;
    patchB.info.program = 1;
    patchB.info.name = "Warm Pad Seed";
    patchB.info.category = "factory";
    patchB.info.author = "MAP2 Audio";
    patchB.info.description = "Seed patch for full sfizz-backed sampler workflow";
    patchB.config.partIndex = 0;
    patchB.config.midiChannel = 2;
    patchB.config.outputBus = OutputBus::Main;
    patchB.config.level = 0.85f;
    patchB.config.pan = 0.0f;
    patchB.parameters = {
        {"osc1.waveform", 3.0f},
        {"osc1.level", 0.6f},
        {"osc1.coarse", -12.0f},
        {"filter1.cutoff", 4200.0f},
        {"filter1.resonance", 0.35f},
        {"amp.attack", 380.0f},
        {"amp.decay", 900.0f},
        {"amp.sustain", 0.72f},
        {"amp.release", 1600.0f},
    };

    std::lock_guard<std::mutex> guard(patchMutex_);
    patchBank_[std::make_pair(0, 0)] = patchA;
    patchBank_[std::make_pair(0, 1)] = patchB;
}

}  // namespace map2::synthforge
