#pragma once

/**
 * MAP2 Audio Engine - Enhanced MIDI Handler
 *
 * Features:
 * - ALSA MIDI input/output with optional JUCE fallback
 * - CC mapping with curves (linear, logarithmic, exponential, s-curve)
 * - Command triggers for chain switching (Program Change)
 * - MIDI learn mode
 * - Full MIDI output for controller feedback
 * - Per-chain mapping scope
 */

#include "Common.h"
#include <functional>
#include <thread>
#include <atomic>
#include <mutex>
#include <unordered_map>
#include <cmath>

namespace map2 {

// MIDI message types
enum class MidiMessageType {
    NoteOn,
    NoteOff,
    ControlChange,
    ProgramChange,
    PitchBend,
    ChannelPressure,
    Clock,
    Start,
    Stop,
    Continue,
    Other
};

// Curve types for CC value mapping
enum class CurveType {
    Linear,
    Logarithmic,
    Exponential,
    SCurve
};

// Convert curve type from string
inline CurveType curveTypeFromString(const std::string& str) {
    if (str == "logarithmic") return CurveType::Logarithmic;
    if (str == "exponential") return CurveType::Exponential;
    if (str == "s_curve") return CurveType::SCurve;
    return CurveType::Linear;
}

// MIDI message structure
struct MidiMessage {
    MidiMessageType type;
    int channel;
    int data1;  // Note number, CC number, or Program number
    int data2;  // Velocity, CC value, or 0 for Program Change
    double timestamp;
};

// Enhanced CC mapping for parameter control
struct MidiCCMapping {
    int id;                      // Database ID for sync
    int channel;                 // 0 = omni (any channel), 1-16 = specific
    int ccNumber;                // 0-127
    InstanceId targetPlugin;     // Plugin instance ID
    std::string parameterSymbol; // Parameter symbol for name-based access
    int parameterIndex;          // Parameter index
    float minValue;              // Minimum output value
    float maxValue;              // Maximum output value
    CurveType curve;             // Value curve type
    bool invert;                 // Invert the CC value
    bool active;                 // Is mapping enabled
    bool feedbackEnabled;        // Send value back to controller
    int feedbackCC;              // CC to send for feedback (-1 = same as input CC)

    // Smoothing state (for click-free parameter changes)
    float currentValue;
    float targetValue;
    float smoothingCoeff;        // Calculated from sample rate

    MidiCCMapping()
        : id(0), channel(0), ccNumber(0), targetPlugin(0), parameterIndex(0),
          minValue(0.0f), maxValue(1.0f), curve(CurveType::Linear),
          invert(false), active(true), feedbackEnabled(true), feedbackCC(-1),
          currentValue(0.0f), targetValue(0.0f), smoothingCoeff(0.99f) {}
};

// Action types for MIDI command triggers
enum class CommandActionType {
    ActivateChain,
    ToggleChain,
    TogglePlugin,
    SetRouting,
    NextPreset,
    PreviousPreset
};

// Command trigger for chain/routing control
struct MidiCommandTrigger {
    int id;                          // Database ID
    MidiMessageType triggerType;     // ProgramChange, NoteOn, ControlChange
    int channel;                     // 0 = omni
    int data1;                       // PC number, Note number, or CC number
    int data2Threshold;              // For velocity/value gates (0 = any)
    CommandActionType action;        // What to do when triggered
    int targetChainId;               // Chain ID for chain actions
    std::string targetPluginUri;     // Plugin URI for plugin actions
    int targetPluginPosition;        // Chain position for duplicate-safe plugin actions (-1 = unset)
    bool active;                     // Is trigger enabled

    MidiCommandTrigger()
        : id(0), triggerType(MidiMessageType::ProgramChange), channel(0),
          data1(0), data2Threshold(0), action(CommandActionType::ActivateChain),
          targetChainId(0), targetPluginPosition(-1), active(true) {}
};

// MIDI learn target
struct MidiLearnTarget {
    int chainId;
    InstanceId pluginId;
    std::string parameterSymbol;
    int parameterIndex;
    float minValue;
    float maxValue;
    CurveType curve;
    bool isActive;

    MidiLearnTarget()
        : chainId(0), pluginId(0), parameterIndex(0),
          minValue(0.0f), maxValue(1.0f), curve(CurveType::Linear),
          isActive(false) {}
};

// MIDI status structure
struct MidiStatus {
    bool enabled;
    bool inputOpen;
    bool outputOpen;
    std::string inputDevice;
    std::string outputDevice;
    int mappingsCount;
    int commandsCount;
    bool learning;
    int lastChannel;
    int lastCC;
    int lastValue;
};

class MidiHandler {
public:
    MidiHandler();
    ~MidiHandler();

    // ========================================
    // Initialization
    // ========================================

    bool initialize();
    void shutdown();
    bool isInitialized() const { return initialized_; }

    void prepare(double sampleRate, int blockSize);

    // ========================================
    // Enable/Disable
    // ========================================

    void setEnabled(bool enabled) { enabled_ = enabled; }
    bool isEnabled() const { return enabled_; }

    // ========================================
    // Device Management
    // ========================================

    std::vector<std::string> getInputDevices() const;
    std::vector<std::string> getOutputDevices() const;
    bool openInputDevice(int deviceIndex);
    bool openInputDevice(const std::string& deviceName);
    bool openOutputDevice(int deviceIndex);
    bool openOutputDevice(const std::string& deviceName);
    void closeInputDevice();
    void closeOutputDevice();
    void closeAllDevices();
    std::string getCurrentInputDevice() const;
    std::string getCurrentOutputDevice() const;

    // ========================================
    // CC Mappings (Enhanced)
    // ========================================

    int addCCMapping(const MidiCCMapping& mapping);
    bool updateCCMapping(int mappingId, const MidiCCMapping& mapping);
    bool removeCCMapping(int mappingId);
    bool removeCCMappingByCC(int channel, int ccNumber);
    MidiCCMapping* getCCMapping(int mappingId);
    std::vector<MidiCCMapping> getAllCCMappings() const;
    std::vector<MidiCCMapping> getMappingsForChain(int chainId) const;
    void clearCCMappings();

    // Bulk operations for preset/chain loading
    void setAllCCMappings(const std::vector<MidiCCMapping>& mappings);
    void setActiveChain(int chainId);
    int getActiveChainId() const { return activeChainId_; }

    // ========================================
    // Command Triggers
    // ========================================

    int addCommandTrigger(const MidiCommandTrigger& trigger);
    bool updateCommandTrigger(int triggerId, const MidiCommandTrigger& trigger);
    bool removeCommandTrigger(int triggerId);
    std::vector<MidiCommandTrigger> getAllCommandTriggers() const;
    void clearCommandTriggers();

    // Bulk operations
    void setAllCommandTriggers(const std::vector<MidiCommandTrigger>& triggers);

    // ========================================
    // MIDI Learn (Enhanced)
    // ========================================

    void startMidiLearn(int chainId, InstanceId pluginId, const std::string& paramSymbol,
                        int paramIndex, float minVal = 0.0f, float maxVal = 1.0f,
                        CurveType curve = CurveType::Linear);
    void startMidiLearn(std::function<void(int channel, int cc)> callback);  // Legacy
    void stopMidiLearn();
    bool isLearning() const { return learning_; }
    MidiLearnTarget getLearnTarget() const;

    // ========================================
    // Callbacks
    // ========================================

    // Called when CC mapping triggers parameter change
    using ParameterCallback = std::function<void(InstanceId plugin, const std::string& param, int index, float value)>;
    void setParameterCallback(ParameterCallback callback) { paramCallback_ = callback; }

    // Called when command trigger fires
    using CommandCallback = std::function<void(const MidiCommandTrigger&)>;
    void setCommandCallback(CommandCallback callback) { commandCallback_ = callback; }

    // Called when any MIDI message arrives (for monitoring)
    using MidiMonitorCallback = std::function<void(const MidiMessage&)>;
    void setMonitorCallback(MidiMonitorCallback callback) { monitorCallback_ = callback; }

    // Called when learn mode captures a CC
    using LearnCompleteCallback = std::function<void(int channel, int cc)>;
    void setLearnCompleteCallback(LearnCompleteCallback callback) { learnCompleteCallback_ = callback; }

    // Called when Program Change triggers chain switch
    using ChainSwitchCallback = std::function<void(int programNumber, int chainId)>;
    void setChainSwitchCallback(ChainSwitchCallback callback) { chainSwitchCallback_ = callback; }

    // Legacy callbacks
    using MidiCallback = std::function<void(const MidiMessage&)>;
    using CCMappingCallback = std::function<void(InstanceId, const std::string&, float)>;
    void setMidiCallback(MidiCallback callback) { midiCallback_ = callback; }
    void setCCMappingCallback(CCMappingCallback callback) { ccMappingCallback_ = callback; }

    // ========================================
    // Processing
    // ========================================

    // Process incoming MIDI (call from audio thread or MIDI thread)
    void processMidiBuffer(const uint8_t* data, size_t length);

    // Apply smoothing for mapped parameters (call per audio block)
    void processSmoothing(int numSamples, std::function<void(InstanceId, int, float)> handler);

    // ========================================
    // MIDI Output (Controller Feedback)
    // ========================================

    bool sendMessage(const MidiMessage& msg);
    bool sendCC(int channel, int ccNumber, int value);
    bool sendProgramChange(int channel, int program);
    bool sendNoteOn(int channel, int note, int velocity);
    bool sendNoteOff(int channel, int note, int velocity = 0);

    // Send parameter value feedback to controller
    void sendParameterFeedback(int channel, int cc, float normalizedValue);

    // Sync all active mappings to controller (on chain switch)
    void syncAllMappingsToController();

    // ========================================
    // Status
    // ========================================

    MidiStatus getStatus() const;

    // ========================================
    // Chain-to-Program Mapping
    // ========================================

    void setChainProgramMapping(int chainId, int programNumber);
    int getChainForProgram(int programNumber) const;
    int getProgramForChain(int chainId) const;
    void clearChainProgramMappings();

private:
    bool initialized_ = false;
    std::atomic<bool> enabled_{true};
    std::atomic<bool> learning_{false};

    double sampleRate_ = 48000.0;
    int blockSize_ = 256;
    int activeChainId_ = 0;

    // ALSA MIDI handles (opaque for header)
    void* alsaSeq_ = nullptr;  // snd_seq_t*
    int inputPort_ = -1;
    int outputPort_ = -1;
    std::string currentInputDevice_;
    std::string currentOutputDevice_;

    // Active connections (client:port pairs)
    struct AlsaConnection {
        int client;
        int port;
    };
    std::vector<AlsaConnection> inputConnections_;
    std::vector<AlsaConnection> outputConnections_;

    // MIDI processing thread
    std::thread midiThread_;
    std::atomic<bool> threadRunning_{false};

    // CC Mappings with chain scope
    mutable std::mutex mappingMutex_;
    std::vector<MidiCCMapping> ccMappings_;
    int nextMappingId_ = 1;

    // Command triggers
    mutable std::mutex commandMutex_;
    std::vector<MidiCommandTrigger> commandTriggers_;
    int nextCommandId_ = 1;

    // Chain-to-Program mapping
    mutable std::mutex chainProgramMutex_;
    std::unordered_map<int, int> chainToProgram_;  // chainId -> programNumber
    std::unordered_map<int, int> programToChain_;  // programNumber -> chainId

    // Learn state
    MidiLearnTarget learnTarget_;
    std::function<void(int, int)> learnCallback_;  // Legacy callback

    // Callbacks
    ParameterCallback paramCallback_;
    CommandCallback commandCallback_;
    MidiMonitorCallback monitorCallback_;
    LearnCompleteCallback learnCompleteCallback_;
    ChainSwitchCallback chainSwitchCallback_;
    MidiCallback midiCallback_;
    CCMappingCallback ccMappingCallback_;

    // Last received values for monitoring
    std::atomic<int> lastChannel_{0};
    std::atomic<int> lastCC_{0};
    std::atomic<int> lastValue_{0};

    // Internal processing
    void midiThreadFunc();
    void handleMidiEvent(const MidiMessage& msg);
    void handleCC(int channel, int cc, int value);
    void handleProgramChange(int channel, int program);
    void handleNoteOn(int channel, int note, int velocity);

    // Curve calculations
    float applyCurve(float normalizedValue, CurveType curve, bool invert);
    float ccToValue(int ccValue, float minVal, float maxVal, CurveType curve = CurveType::Linear, bool invert = false);
    float calculateSmoothingCoeff(float rampTimeMs);
};

// Curve application functions (inline for performance)
inline float MidiHandler::applyCurve(float value, CurveType curve, bool invert) {
    if (invert) {
        value = 1.0f - value;
    }

    switch (curve) {
        case CurveType::Logarithmic:
            // Logarithmic curve: more resolution at low values
            return std::log10(1.0f + value * 9.0f) / std::log10(10.0f);

        case CurveType::Exponential:
            // Exponential curve: more resolution at high values
            return (std::pow(10.0f, value) - 1.0f) / 9.0f;

        case CurveType::SCurve:
            // S-curve: smooth transition with more resolution at extremes
            return value * value * (3.0f - 2.0f * value);

        case CurveType::Linear:
        default:
            return value;
    }
}

inline float MidiHandler::ccToValue(int ccValue, float minVal, float maxVal, CurveType curve, bool invert) {
    float normalized = static_cast<float>(ccValue) / 127.0f;
    float curved = applyCurve(normalized, curve, invert);
    return minVal + curved * (maxVal - minVal);
}

} // namespace map2
