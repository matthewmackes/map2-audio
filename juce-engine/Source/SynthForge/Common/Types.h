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

}  // namespace map2::synthforge
