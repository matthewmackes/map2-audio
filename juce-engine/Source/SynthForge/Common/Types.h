#pragma once

/**
 * SynthForge - Shared type definitions
 * Phase 1 scope: part configuration, patch metadata, and metrics surfaces.
 */

#include "Common.h"

#include <array>
#include <map>
#include <string>
#include <vector>

namespace map2::synthforge {

constexpr int kNumParts = 16;
constexpr int kNumOutputBuses = 9;
constexpr int kOmniMidiChannel = 0;

enum class OutputBus {
    Main = 0,
    Aux1,
    Aux2,
    Aux3,
    Aux4,
    Aux5,
    Aux6,
    Aux7,
    Aux8,
};

inline std::string outputBusToString(OutputBus bus) {
    switch (bus) {
        case OutputBus::Main: return "main";
        case OutputBus::Aux1: return "aux_1";
        case OutputBus::Aux2: return "aux_2";
        case OutputBus::Aux3: return "aux_3";
        case OutputBus::Aux4: return "aux_4";
        case OutputBus::Aux5: return "aux_5";
        case OutputBus::Aux6: return "aux_6";
        case OutputBus::Aux7: return "aux_7";
        case OutputBus::Aux8: return "aux_8";
    }
    return "main";
}

inline OutputBus outputBusFromString(const std::string& bus) {
    if (bus == "aux_1") return OutputBus::Aux1;
    if (bus == "aux_2") return OutputBus::Aux2;
    if (bus == "aux_3") return OutputBus::Aux3;
    if (bus == "aux_4") return OutputBus::Aux4;
    if (bus == "aux_5") return OutputBus::Aux5;
    if (bus == "aux_6") return OutputBus::Aux6;
    if (bus == "aux_7") return OutputBus::Aux7;
    if (bus == "aux_8") return OutputBus::Aux8;
    return OutputBus::Main;
}

struct PartConfig {
    int partIndex = 0;
    int midiChannel = 1;  // 1-16, 0=OMNI
    OutputBus outputBus = OutputBus::Main;
    float level = 1.0f;
    float pan = 0.0f;  // -1..1
    bool mute = false;
    bool solo = false;
};

struct PatchInfo {
    int bank = 0;
    int program = 0;
    std::string name;
    std::string category;
    std::string author;
    std::string description;
};

struct VoiceMetrics {
    int activeVoices = 0;
    int peakVoices = 0;
    std::array<int, kNumParts> voicesPerPart{};
    float cpuPercent = 0.0f;
};

struct Metering {
    VoiceMetrics voiceMetrics;
    std::array<float, kNumParts> partLevels{};
};

struct SampleLoadStatus {
    bool loaded = false;
    bool samplerMode = false;
    int partIndex = 0;
    int regionCount = 0;
    int loadedSampleCount = 0;
    std::string sfzPath;
    std::string soundfontPath;
    std::string soundfontFormat;
    int activeBank = 0;
    int activeProgram = 0;
    std::string activePresetName;
    std::string engine = "native";
    bool engineAvailable = false;
    std::string lastError;
    std::vector<std::string> warnings;
};

enum class SamplerBackend {
    Native = 0,
    Sfizz = 1,
};

inline std::string samplerBackendToString(SamplerBackend backend) {
    switch (backend) {
        case SamplerBackend::Native: return "native";
        case SamplerBackend::Sfizz: return "sfizz";
    }
    return "native";
}

inline SamplerBackend samplerBackendFromString(const std::string& backend) {
    if (backend == "sfizz") {
        return SamplerBackend::Sfizz;
    }
    return SamplerBackend::Native;
}

enum class InterpolationMode {
    Linear = 0,
    Hermite = 1,
    Sinc = 2,
};

inline std::string interpolationModeToString(InterpolationMode mode) {
    switch (mode) {
        case InterpolationMode::Linear: return "linear";
        case InterpolationMode::Hermite: return "hermite";
        case InterpolationMode::Sinc: return "sinc";
    }
    return "hermite";
}

inline InterpolationMode interpolationModeFromString(const std::string& mode) {
    if (mode == "linear") return InterpolationMode::Linear;
    if (mode == "sinc") return InterpolationMode::Sinc;
    return InterpolationMode::Hermite;
}

struct StreamingConfig {
    bool enabled = true;
    uint32_t preloadSize = 128 * 1024;
    int maxVoices = 64;
    InterpolationMode interpolation = InterpolationMode::Hermite;
    int qualityLive = 5;
    int qualityFreewheeling = 8;
    int memoryLimitMb = 256;
};

struct ScalaTuningConfig {
    bool enabled = false;
    std::string scalaPath;
    int rootKey = 60;
    float referenceFrequencyHz = 440.0f;
};

struct MpeConfig {
    bool enabled = false;
    int lowerZoneChannels = 0;
    int upperZoneChannels = 0;
    int pitchBendRangeSemitones = 48;
};

struct ModMatrixRoute {
    std::string source;
    std::string destination;
    float amount = 0.0f; // -1..1
    bool bipolar = false;
    bool enabled = true;
};

struct HotReloadStatus {
    bool enabled = false;
    int intervalMs = 1000;
    bool pendingReload = false;
    bool reloaded = false;
    uint64_t generation = 0;
    std::string lastReloadIso;
    std::string lastError;
};

struct FreezeRenderStatus {
    bool freezeEnabled = false;
    bool frozenSignalReady = false;
    int freezeSamples = 0;
    std::string renderPath;
    std::string lastError;
};

struct SamplerAnalyzerFrame {
    float peakLeft = 0.0f;
    float peakRight = 0.0f;
    float rmsLeft = 0.0f;
    float rmsRight = 0.0f;
    int midiEvents = 0;
    int activeVoices = 0;
};

struct SfzBackendStatus {
    std::string backend = "native";
    bool sfizzAvailable = false;
    bool sfizzLoaded = false;
    int regionCount = 0;
    int groupCount = 0;
    int preloadedSamples = 0;
    std::vector<std::string> unknownOpcodes;
    std::vector<std::string> unsupportedOpcodes;
};

}  // namespace map2::synthforge
