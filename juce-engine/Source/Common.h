#pragma once

/**
 * MAP2 Audio Engine - Common Definitions
 * Shared types, constants, and utilities
 * Version 2.0 - Full JUCE Integration
 */

#include <string>
#include <vector>
#include <map>
#include <memory>
#include <mutex>
#include <atomic>
#include <functional>
#include <optional>
#include <cstdint>
#include <cmath>
#include <algorithm>
#include <array>

namespace map2 {

// Version
constexpr const char* ENGINE_VERSION = "2.0.0-juce";

// Audio defaults
constexpr double DEFAULT_SAMPLE_RATE = 48000.0;
constexpr int DEFAULT_BUFFER_SIZE = 256;
constexpr int MAX_CHANNELS = 8;
constexpr int MAX_PLUGINS = 64;
constexpr int MAX_SNAPSHOTS = 6;

// Metering defaults
constexpr int SPECTRUM_FFT_SIZE = 2048;
constexpr int SPECTRUM_NUM_BINS = 1024;
constexpr float LUFS_GATE_RELATIVE = -10.0f;  // -10 dB relative gate
constexpr float LUFS_GATE_ABSOLUTE = -70.0f;  // -70 LUFS absolute gate

// Plugin instance ID type
using InstanceId = int64_t;
constexpr InstanceId INVALID_INSTANCE_ID = -1;

// Plugin format types (NEW - JUCE multi-format support)
enum class PluginFormat {
    All,
    VST3,
    AudioUnit,
    LV2,
    LADSPA,
    Unknown
};

// Port types
enum class PortType {
    Audio,
    Control,
    Atom,
    CV
};

// Port direction
enum class PortDirection {
    Input,
    Output
};

// Plugin state
enum class PluginState {
    Unloaded,
    Loading,
    Loaded,
    Active,
    Bypassed,
    Error
};

// VU level data
struct VuLevels {
    float inputLeft = 0.0f;
    float inputRight = 0.0f;
    float outputLeft = 0.0f;
    float outputRight = 0.0f;
    
    void reset() {
        inputLeft = inputRight = outputLeft = outputRight = 0.0f;
    }
};

// Plugin parameter info
struct ParameterInfo {
    int index;
    std::string symbol;
    std::string name;
    float minValue;
    float maxValue;
    float defaultValue;
    bool isToggle;
    bool isInteger;
    bool isLogarithmic;
};

// Plugin port info
struct PortInfo {
    int index;
    std::string symbol;
    std::string name;
    PortType type;
    PortDirection direction;
    bool isOptional;
};

// Plugin info
struct PluginInfo {
    std::string uri;          // Unique identifier (VST3 ID, AU ID, LV2 URI)
    std::string name;
    std::string author;
    std::string brand;
    std::string category;
    std::string license;
    std::string version;
    std::vector<ParameterInfo> parameters;
    std::vector<PortInfo> ports;
    int audioInputs = 0;
    int audioOutputs = 0;
    bool hasMidiInput = false;
    bool hasMidiOutput = false;
    PluginFormat format = PluginFormat::Unknown;  // NEW: Plugin format
    std::string formatName;                        // NEW: Human-readable format
    std::string filePath;                          // NEW: Path to plugin file
    int latencySamples = 0;                        // NEW: Reported latency
};

// Loaded plugin instance
struct PluginInstance {
    InstanceId id;
    std::string uri;
    std::string name;
    PluginState state;
    bool bypassed;
    std::map<std::string, float> parameterValues;
    VuLevels vuLevels;
};

// Snapshot data
struct Snapshot {
    int id;
    std::string name;
    std::vector<std::pair<InstanceId, std::map<std::string, float>>> pluginStates;
};

// Audio device info
struct AudioDeviceInfo {
    std::string name;
    std::string id;
    int inputChannels;
    int outputChannels;
    std::vector<double> sampleRates;
    std::vector<int> bufferSizes;
    bool isDefault;
};

// ========================================
// Advanced Metering Structures (NEW)
// ========================================

// LUFS loudness levels (ITU-R BS.1770-4)
struct LufsLevels {
    float momentary = -100.0f;    // 400ms window (LUFS)
    float shortTerm = -100.0f;    // 3s window (LUFS)
    float integrated = -100.0f;   // Gated integrated (LUFS)
    float range = 0.0f;           // Loudness Range (LU)
    float truePeak = -100.0f;     // True Peak (dBTP)
    float truePeakLeft = -100.0f;
    float truePeakRight = -100.0f;
};

// CPU monitoring metrics
struct CPUMetrics {
    double totalCpuPercent = 0.0;
    double audioCallbackPercent = 0.0;
    double peakCpuPercent = 0.0;
    double averageCpuPercent = 0.0;
    int xrunCount = 0;
    double budgetMs = 0.0;
    double currentCallbackMs = 0.0;
    double headroomPercent = 100.0;
    std::map<InstanceId, double> perPluginPercent;
};

// Sidechain connection info
struct SidechainConnection {
    InstanceId sourcePlugin;
    InstanceId destPlugin;
    int destBus;  // Typically bus 1 for sidechain
    bool active = true;
};

// Latency breakdown per plugin
struct LatencyInfo {
    InstanceId pluginId;
    int latencySamples;
    double latencyMs;
    std::string pluginName;
};

// ========================================
// Plugin Extended Info (NEW)
// ========================================

// Extended plugin info with format
struct PluginInfoExtended : PluginInfo {
    PluginFormat format = PluginFormat::Unknown;
    std::string formatName;
    std::string filePath;
    int latencySamples = 0;
    bool supportsDoublePrecision = false;
    int numSidechainBuses = 0;
    std::vector<std::string> sidechainBusNames;
};

// ========================================
// Utility Functions
// ========================================

inline float dbToLinear(float db) {
    return std::pow(10.0f, db / 20.0f);
}

inline float linearToDb(float linear) {
    if (linear <= 0.0f) return -100.0f;
    return 20.0f * std::log10(linear);
}

inline float clamp(float value, float minVal, float maxVal) {
    return std::max(minVal, std::min(maxVal, value));
}

// Convert samples to milliseconds
inline double samplesToMs(int samples, double sampleRate) {
    return (samples / sampleRate) * 1000.0;
}

// Convert milliseconds to samples
inline int msToSamples(double ms, double sampleRate) {
    return static_cast<int>((ms / 1000.0) * sampleRate);
}

// Plugin format to string
inline std::string pluginFormatToString(PluginFormat format) {
    switch (format) {
        case PluginFormat::VST3: return "VST3";
        case PluginFormat::AudioUnit: return "AudioUnit";
        case PluginFormat::LV2: return "LV2";
        case PluginFormat::LADSPA: return "LADSPA";
        case PluginFormat::All: return "All";
        default: return "Unknown";
    }
}

// String to plugin format
inline PluginFormat stringToPluginFormat(const std::string& str) {
    if (str == "VST3" || str == "vst3") return PluginFormat::VST3;
    if (str == "AudioUnit" || str == "AU" || str == "au") return PluginFormat::AudioUnit;
    if (str == "LV2" || str == "lv2") return PluginFormat::LV2;
    if (str == "LADSPA" || str == "ladspa") return PluginFormat::LADSPA;
    if (str == "All" || str == "all") return PluginFormat::All;
    return PluginFormat::Unknown;
}

// Linear interpolation
template<typename T>
inline T lerp(T a, T b, T t) {
    return a + t * (b - a);
}

// Frequency to MIDI note number
inline float frequencyToMidi(float frequency) {
    return 69.0f + 12.0f * std::log2(frequency / 440.0f);
}

// MIDI note number to frequency
inline float midiToFrequency(float midiNote) {
    return 440.0f * std::pow(2.0f, (midiNote - 69.0f) / 12.0f);
}

// Frequency to FFT bin index
inline int frequencyToBin(float frequency, double sampleRate, int fftSize) {
    return static_cast<int>((frequency * fftSize) / sampleRate);
}

// FFT bin index to frequency
inline float binToFrequency(int bin, double sampleRate, int fftSize) {
    return static_cast<float>((bin * sampleRate) / fftSize);
}

} // namespace map2
