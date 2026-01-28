#pragma once

/**
 * MAP2 Audio Engine - MIDI Handler
 * ALSA MIDI input/output and CC mapping
 */

#include "Common.h"
#include <functional>
#include <thread>
#include <atomic>

namespace map2 {

// MIDI message types
enum class MidiMessageType {
    NoteOn,
    NoteOff,
    ControlChange,
    ProgramChange,
    PitchBend,
    Other
};

struct MidiMessage {
    MidiMessageType type;
    int channel;
    int data1;  // Note number or CC number
    int data2;  // Velocity or CC value
    double timestamp;
};

// CC mapping for parameter control
struct MidiCCMapping {
    int channel;
    int ccNumber;
    InstanceId targetPlugin;
    std::string parameterName;
    float minValue;
    float maxValue;
    bool active;
};

class MidiHandler {
public:
    MidiHandler();
    ~MidiHandler();
    
    // Initialization
    bool initialize();
    void shutdown();
    bool isInitialized() const { return initialized_; }
    
    // Enable/disable
    void setEnabled(bool enabled) { enabled_ = enabled; }
    bool isEnabled() const { return enabled_; }
    
    // Device management
    std::vector<std::string> getInputDevices() const;
    std::vector<std::string> getOutputDevices() const;
    bool openInputDevice(const std::string& deviceName);
    bool openOutputDevice(const std::string& deviceName);
    void closeAllDevices();
    
    // CC Mapping
    bool addCCMapping(const MidiCCMapping& mapping);
    bool removeCCMapping(int channel, int ccNumber);
    std::vector<MidiCCMapping> getCCMappings() const;
    void clearCCMappings();
    
    // MIDI Learn
    void startMidiLearn(std::function<void(int channel, int cc)> callback);
    void stopMidiLearn();
    bool isLearning() const { return learning_; }
    
    // Callbacks
    using MidiCallback = std::function<void(const MidiMessage&)>;
    using CCMappingCallback = std::function<void(InstanceId, const std::string&, float)>;
    
    void setMidiCallback(MidiCallback callback) { midiCallback_ = callback; }
    void setCCMappingCallback(CCMappingCallback callback) { ccMappingCallback_ = callback; }
    
    // Process incoming MIDI (call from audio thread or MIDI thread)
    void processMidiBuffer(const uint8_t* data, size_t length);
    
    // Send MIDI
    bool sendMessage(const MidiMessage& msg);
    
private:
    bool initialized_ = false;
    std::atomic<bool> enabled_{true};
    std::atomic<bool> learning_{false};
    
    // ALSA MIDI handles (opaque for header)
    void* alsaSeq_ = nullptr;  // snd_seq_t*
    int inputPort_ = -1;
    int outputPort_ = -1;
    
    // MIDI processing thread
    std::thread midiThread_;
    std::atomic<bool> threadRunning_{false};
    
    // CC Mappings
    mutable std::mutex mappingMutex_;
    std::vector<MidiCCMapping> ccMappings_;
    
    // Callbacks
    MidiCallback midiCallback_;
    CCMappingCallback ccMappingCallback_;
    std::function<void(int, int)> learnCallback_;
    
    // Internal
    void midiThreadFunc();
    void handleMidiEvent(const MidiMessage& msg);
    float ccToValue(int ccValue, float minVal, float maxVal);
};

} // namespace map2
