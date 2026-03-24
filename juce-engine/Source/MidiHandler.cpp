/**
 * MAP2 Audio Engine - Enhanced MIDI Handler Implementation
 *
 * Features:
 * - ALSA MIDI input/output
 * - CC mapping with curves (linear, logarithmic, exponential, s-curve)
 * - Command triggers for chain switching (Program Change)
 * - MIDI learn mode
 * - Full MIDI output for controller feedback
 * - Per-chain mapping scope
 */

#include "MidiHandler.h"
#include <alsa/asoundlib.h>
#include <iostream>
#include <algorithm>
#include <cstring>

namespace map2 {

MidiHandler::MidiHandler() = default;

MidiHandler::~MidiHandler() {
    shutdown();
}

bool MidiHandler::initialize() {
    if (initialized_) return true;

    snd_seq_t* seq = nullptr;
    int err = snd_seq_open(&seq, "default", SND_SEQ_OPEN_DUPLEX, 0);
    if (err < 0) {
        std::cerr << "Failed to open ALSA sequencer: " << snd_strerror(err) << std::endl;
        return false;
    }

    alsaSeq_ = seq;
    snd_seq_set_client_name(seq, "MAP2 Audio Engine");

    // Create input port
    inputPort_ = snd_seq_create_simple_port(seq, "MIDI In",
        SND_SEQ_PORT_CAP_WRITE | SND_SEQ_PORT_CAP_SUBS_WRITE,
        SND_SEQ_PORT_TYPE_APPLICATION);

    if (inputPort_ < 0) {
        std::cerr << "Failed to create MIDI input port" << std::endl;
        snd_seq_close(seq);
        alsaSeq_ = nullptr;
        return false;
    }

    // Create output port
    outputPort_ = snd_seq_create_simple_port(seq, "MIDI Out",
        SND_SEQ_PORT_CAP_READ | SND_SEQ_PORT_CAP_SUBS_READ,
        SND_SEQ_PORT_TYPE_APPLICATION);

    if (outputPort_ < 0) {
        std::cerr << "Failed to create MIDI output port" << std::endl;
    }

    // Start MIDI thread
    threadRunning_ = true;
    midiThread_ = std::thread(&MidiHandler::midiThreadFunc, this);

    initialized_ = true;
    std::cout << "MIDI Handler initialized with enhanced features" << std::endl;

    return true;
}

void MidiHandler::shutdown() {
    if (!initialized_) return;

    threadRunning_ = false;
    if (midiThread_.joinable()) {
        midiThread_.join();
    }

    if (alsaSeq_) {
        snd_seq_close(static_cast<snd_seq_t*>(alsaSeq_));
        alsaSeq_ = nullptr;
    }

    inputPort_ = -1;
    outputPort_ = -1;
    initialized_ = false;
    currentInputDevice_.clear();
    currentOutputDevice_.clear();
}

void MidiHandler::prepare(double sampleRate, int blockSize) {
    sampleRate_ = sampleRate;
    blockSize_ = blockSize;

    // Calculate smoothing coefficient for ~10ms ramp time
    float smoothingCoeff = calculateSmoothingCoeff(10.0f);

    std::lock_guard<std::mutex> lock(mappingMutex_);
    for (auto& mapping : ccMappings_) {
        mapping.smoothingCoeff = smoothingCoeff;
    }
}

float MidiHandler::calculateSmoothingCoeff(float rampTimeMs) {
    // One-pole filter coefficient for given ramp time
    float rampTimeSamples = (rampTimeMs / 1000.0f) * static_cast<float>(sampleRate_);
    return std::exp(-1.0f / rampTimeSamples);
}

// ========================================
// Device Management
// ========================================

std::vector<std::string> MidiHandler::getInputDevices() const {
    std::vector<std::string> devices;

    if (!alsaSeq_) return devices;

    snd_seq_t* seq = static_cast<snd_seq_t*>(alsaSeq_);
    snd_seq_client_info_t* cinfo;
    snd_seq_port_info_t* pinfo;

    snd_seq_client_info_alloca(&cinfo);
    snd_seq_port_info_alloca(&pinfo);

    snd_seq_client_info_set_client(cinfo, -1);
    while (snd_seq_query_next_client(seq, cinfo) >= 0) {
        int client = snd_seq_client_info_get_client(cinfo);

        snd_seq_port_info_set_client(pinfo, client);
        snd_seq_port_info_set_port(pinfo, -1);

        while (snd_seq_query_next_port(seq, pinfo) >= 0) {
            unsigned int cap = snd_seq_port_info_get_capability(pinfo);

            if ((cap & SND_SEQ_PORT_CAP_READ) && (cap & SND_SEQ_PORT_CAP_SUBS_READ)) {
                std::string name = snd_seq_client_info_get_name(cinfo);
                name += ":";
                name += snd_seq_port_info_get_name(pinfo);
                devices.push_back(name);
            }
        }
    }

    return devices;
}

std::vector<std::string> MidiHandler::getOutputDevices() const {
    std::vector<std::string> devices;

    if (!alsaSeq_) return devices;

    snd_seq_t* seq = static_cast<snd_seq_t*>(alsaSeq_);
    snd_seq_client_info_t* cinfo;
    snd_seq_port_info_t* pinfo;

    snd_seq_client_info_alloca(&cinfo);
    snd_seq_port_info_alloca(&pinfo);

    snd_seq_client_info_set_client(cinfo, -1);
    while (snd_seq_query_next_client(seq, cinfo) >= 0) {
        int client = snd_seq_client_info_get_client(cinfo);

        snd_seq_port_info_set_client(pinfo, client);
        snd_seq_port_info_set_port(pinfo, -1);

        while (snd_seq_query_next_port(seq, pinfo) >= 0) {
            unsigned int cap = snd_seq_port_info_get_capability(pinfo);

            if ((cap & SND_SEQ_PORT_CAP_WRITE) && (cap & SND_SEQ_PORT_CAP_SUBS_WRITE)) {
                std::string name = snd_seq_client_info_get_name(cinfo);
                name += ":";
                name += snd_seq_port_info_get_name(pinfo);
                devices.push_back(name);
            }
        }
    }

    return devices;
}

bool MidiHandler::openInputDevice(int deviceIndex) {
    auto devices = getInputDevices();
    if (deviceIndex >= 0 && deviceIndex < static_cast<int>(devices.size())) {
        return openInputDevice(devices[deviceIndex]);
    }
    return false;
}

bool MidiHandler::openInputDevice(const std::string& deviceName) {
    if (!alsaSeq_ || inputPort_ < 0) {
        std::cerr << "MIDI Handler not initialized" << std::endl;
        return false;
    }

    // Close existing connections first
    closeInputDevice();

    snd_seq_t* seq = static_cast<snd_seq_t*>(alsaSeq_);
    snd_seq_client_info_t* cinfo;
    snd_seq_port_info_t* pinfo;

    snd_seq_client_info_alloca(&cinfo);
    snd_seq_port_info_alloca(&pinfo);

    // Parse device name (format: "ClientName:PortName")
    // Search for matching client and port
    snd_seq_client_info_set_client(cinfo, -1);
    while (snd_seq_query_next_client(seq, cinfo) >= 0) {
        int client = snd_seq_client_info_get_client(cinfo);
        std::string clientName = snd_seq_client_info_get_name(cinfo);

        snd_seq_port_info_set_client(pinfo, client);
        snd_seq_port_info_set_port(pinfo, -1);

        while (snd_seq_query_next_port(seq, pinfo) >= 0) {
            unsigned int cap = snd_seq_port_info_get_capability(pinfo);

            // Check if port can send to us (READ capability)
            if (!(cap & SND_SEQ_PORT_CAP_READ) || !(cap & SND_SEQ_PORT_CAP_SUBS_READ)) {
                continue;
            }

            int port = snd_seq_port_info_get_port(pinfo);
            std::string portName = snd_seq_port_info_get_name(pinfo);

            // Build full name: "ClientName:PortName"
            std::string fullName = clientName + ":" + portName;

            // Check if this matches the requested device
            if (fullName == deviceName) {
                // Create subscription from this device to our input port
                snd_seq_addr_t sender;
                sender.client = client;
                sender.port = port;

                snd_seq_addr_t dest;
                dest.client = snd_seq_client_id(seq);
                dest.port = inputPort_;

                snd_seq_port_subscribe_t* subs;
                snd_seq_port_subscribe_alloca(&subs);
                snd_seq_port_subscribe_set_sender(subs, &sender);
                snd_seq_port_subscribe_set_dest(subs, &dest);

                int err = snd_seq_subscribe_port(seq, subs);
                if (err < 0) {
                    std::cerr << "Failed to subscribe to MIDI input device: "
                              << snd_strerror(err) << std::endl;
                    return false;
                }

                // Store connection
                AlsaConnection conn;
                conn.client = client;
                conn.port = port;
                inputConnections_.push_back(conn);

                currentInputDevice_ = deviceName;
                std::cout << "Connected MIDI input: " << deviceName << std::endl;
                return true;
            }
        }
    }

    std::cerr << "MIDI input device not found: " << deviceName << std::endl;
    return false;
}

bool MidiHandler::openOutputDevice(int deviceIndex) {
    auto devices = getOutputDevices();
    if (deviceIndex >= 0 && deviceIndex < static_cast<int>(devices.size())) {
        return openOutputDevice(devices[deviceIndex]);
    }
    return false;
}

bool MidiHandler::openOutputDevice(const std::string& deviceName) {
    if (!alsaSeq_ || outputPort_ < 0) {
        std::cerr << "MIDI Handler not initialized" << std::endl;
        return false;
    }

    // Close existing connections first
    closeOutputDevice();

    snd_seq_t* seq = static_cast<snd_seq_t*>(alsaSeq_);
    snd_seq_client_info_t* cinfo;
    snd_seq_port_info_t* pinfo;

    snd_seq_client_info_alloca(&cinfo);
    snd_seq_port_info_alloca(&pinfo);

    // Parse device name (format: "ClientName:PortName")
    // Search for matching client and port
    snd_seq_client_info_set_client(cinfo, -1);
    while (snd_seq_query_next_client(seq, cinfo) >= 0) {
        int client = snd_seq_client_info_get_client(cinfo);
        std::string clientName = snd_seq_client_info_get_name(cinfo);

        snd_seq_port_info_set_client(pinfo, client);
        snd_seq_port_info_set_port(pinfo, -1);

        while (snd_seq_query_next_port(seq, pinfo) >= 0) {
            unsigned int cap = snd_seq_port_info_get_capability(pinfo);

            // Check if port can receive from us (WRITE capability)
            if (!(cap & SND_SEQ_PORT_CAP_WRITE) || !(cap & SND_SEQ_PORT_CAP_SUBS_WRITE)) {
                continue;
            }

            int port = snd_seq_port_info_get_port(pinfo);
            std::string portName = snd_seq_port_info_get_name(pinfo);

            // Build full name: "ClientName:PortName"
            std::string fullName = clientName + ":" + portName;

            // Check if this matches the requested device
            if (fullName == deviceName) {
                // Create subscription from our output port to this device
                snd_seq_addr_t sender;
                sender.client = snd_seq_client_id(seq);
                sender.port = outputPort_;

                snd_seq_addr_t dest;
                dest.client = client;
                dest.port = port;

                snd_seq_port_subscribe_t* subs;
                snd_seq_port_subscribe_alloca(&subs);
                snd_seq_port_subscribe_set_sender(subs, &sender);
                snd_seq_port_subscribe_set_dest(subs, &dest);

                int err = snd_seq_subscribe_port(seq, subs);
                if (err < 0) {
                    std::cerr << "Failed to subscribe to MIDI output device: "
                              << snd_strerror(err) << std::endl;
                    return false;
                }

                // Store connection
                AlsaConnection conn;
                conn.client = client;
                conn.port = port;
                outputConnections_.push_back(conn);

                currentOutputDevice_ = deviceName;
                std::cout << "Connected MIDI output: " << deviceName << std::endl;
                return true;
            }
        }
    }

    std::cerr << "MIDI output device not found: " << deviceName << std::endl;
    return false;
}

void MidiHandler::closeInputDevice() {
    if (!alsaSeq_ || inputPort_ < 0) return;

    snd_seq_t* seq = static_cast<snd_seq_t*>(alsaSeq_);

    // Unsubscribe all input connections
    for (const auto& conn : inputConnections_) {
        snd_seq_addr_t sender;
        sender.client = conn.client;
        sender.port = conn.port;

        snd_seq_addr_t dest;
        dest.client = snd_seq_client_id(seq);
        dest.port = inputPort_;

        snd_seq_port_subscribe_t* subs;
        snd_seq_port_subscribe_alloca(&subs);
        snd_seq_port_subscribe_set_sender(subs, &sender);
        snd_seq_port_subscribe_set_dest(subs, &dest);

        snd_seq_unsubscribe_port(seq, subs);
    }

    inputConnections_.clear();
    currentInputDevice_.clear();
}

void MidiHandler::closeOutputDevice() {
    if (!alsaSeq_ || outputPort_ < 0) return;

    snd_seq_t* seq = static_cast<snd_seq_t*>(alsaSeq_);

    // Unsubscribe all output connections
    for (const auto& conn : outputConnections_) {
        snd_seq_addr_t sender;
        sender.client = snd_seq_client_id(seq);
        sender.port = outputPort_;

        snd_seq_addr_t dest;
        dest.client = conn.client;
        dest.port = conn.port;

        snd_seq_port_subscribe_t* subs;
        snd_seq_port_subscribe_alloca(&subs);
        snd_seq_port_subscribe_set_sender(subs, &sender);
        snd_seq_port_subscribe_set_dest(subs, &dest);

        snd_seq_unsubscribe_port(seq, subs);
    }

    outputConnections_.clear();
    currentOutputDevice_.clear();
}

void MidiHandler::closeAllDevices() {
    closeInputDevice();
    closeOutputDevice();
}

std::string MidiHandler::getCurrentInputDevice() const {
    return currentInputDevice_;
}

std::string MidiHandler::getCurrentOutputDevice() const {
    return currentOutputDevice_;
}

// ========================================
// CC Mappings (Enhanced)
// ========================================

int MidiHandler::addCCMapping(const MidiCCMapping& mapping) {
    std::lock_guard<std::mutex> lock(mappingMutex_);

    MidiCCMapping newMapping = mapping;
    newMapping.id = nextMappingId_++;
    newMapping.smoothingCoeff = calculateSmoothingCoeff(10.0f);
    newMapping.currentValue = newMapping.minValue;
    newMapping.targetValue = newMapping.minValue;

    ccMappings_.push_back(newMapping);
    return newMapping.id;
}

bool MidiHandler::updateCCMapping(int mappingId, const MidiCCMapping& mapping) {
    std::lock_guard<std::mutex> lock(mappingMutex_);

    for (auto& m : ccMappings_) {
        if (m.id == mappingId) {
            int id = m.id;
            float currentVal = m.currentValue;
            float smoothCoeff = m.smoothingCoeff;

            m = mapping;
            m.id = id;
            m.currentValue = currentVal;
            m.smoothingCoeff = smoothCoeff;
            return true;
        }
    }
    return false;
}

bool MidiHandler::removeCCMapping(int mappingId) {
    std::lock_guard<std::mutex> lock(mappingMutex_);

    auto it = std::remove_if(ccMappings_.begin(), ccMappings_.end(),
        [mappingId](const MidiCCMapping& m) { return m.id == mappingId; });

    if (it != ccMappings_.end()) {
        ccMappings_.erase(it, ccMappings_.end());
        return true;
    }
    return false;
}

bool MidiHandler::removeCCMappingByCC(int channel, int ccNumber) {
    std::lock_guard<std::mutex> lock(mappingMutex_);

    auto it = std::remove_if(ccMappings_.begin(), ccMappings_.end(),
        [channel, ccNumber](const MidiCCMapping& m) {
            return (m.channel == channel || m.channel == 0) && m.ccNumber == ccNumber;
        });

    if (it != ccMappings_.end()) {
        ccMappings_.erase(it, ccMappings_.end());
        return true;
    }
    return false;
}

MidiCCMapping* MidiHandler::getCCMapping(int mappingId) {
    std::lock_guard<std::mutex> lock(mappingMutex_);

    for (auto& m : ccMappings_) {
        if (m.id == mappingId) {
            return &m;
        }
    }
    return nullptr;
}

std::vector<MidiCCMapping> MidiHandler::getAllCCMappings() const {
    std::lock_guard<std::mutex> lock(mappingMutex_);
    return ccMappings_;
}

std::vector<MidiCCMapping> MidiHandler::getMappingsForChain(int /*chainId*/) const {
    // For now, return all mappings - chain filtering handled by Python layer
    std::lock_guard<std::mutex> lock(mappingMutex_);
    return ccMappings_;
}

void MidiHandler::clearCCMappings() {
    std::lock_guard<std::mutex> lock(mappingMutex_);
    ccMappings_.clear();
}

void MidiHandler::setAllCCMappings(const std::vector<MidiCCMapping>& mappings) {
    std::lock_guard<std::mutex> lock(mappingMutex_);
    ccMappings_ = mappings;

    float smoothCoeff = calculateSmoothingCoeff(10.0f);
    for (auto& m : ccMappings_) {
        m.smoothingCoeff = smoothCoeff;
        if (m.id == 0) {
            m.id = nextMappingId_++;
        }
    }
}

void MidiHandler::setActiveChain(int chainId) {
    activeChainId_ = chainId;
}

// ========================================
// Command Triggers
// ========================================

int MidiHandler::addCommandTrigger(const MidiCommandTrigger& trigger) {
    std::lock_guard<std::mutex> lock(commandMutex_);

    MidiCommandTrigger newTrigger = trigger;
    newTrigger.id = nextCommandId_++;
    commandTriggers_.push_back(newTrigger);
    return newTrigger.id;
}

bool MidiHandler::updateCommandTrigger(int triggerId, const MidiCommandTrigger& trigger) {
    std::lock_guard<std::mutex> lock(commandMutex_);

    for (auto& t : commandTriggers_) {
        if (t.id == triggerId) {
            int id = t.id;
            t = trigger;
            t.id = id;
            return true;
        }
    }
    return false;
}

bool MidiHandler::removeCommandTrigger(int triggerId) {
    std::lock_guard<std::mutex> lock(commandMutex_);

    auto it = std::remove_if(commandTriggers_.begin(), commandTriggers_.end(),
        [triggerId](const MidiCommandTrigger& t) { return t.id == triggerId; });

    if (it != commandTriggers_.end()) {
        commandTriggers_.erase(it, commandTriggers_.end());
        return true;
    }
    return false;
}

std::vector<MidiCommandTrigger> MidiHandler::getAllCommandTriggers() const {
    std::lock_guard<std::mutex> lock(commandMutex_);
    return commandTriggers_;
}

void MidiHandler::clearCommandTriggers() {
    std::lock_guard<std::mutex> lock(commandMutex_);
    commandTriggers_.clear();
}

void MidiHandler::setAllCommandTriggers(const std::vector<MidiCommandTrigger>& triggers) {
    std::lock_guard<std::mutex> lock(commandMutex_);
    commandTriggers_ = triggers;

    for (auto& t : commandTriggers_) {
        if (t.id == 0) {
            t.id = nextCommandId_++;
        }
    }
}

// ========================================
// MIDI Learn
// ========================================

void MidiHandler::startMidiLearn(int chainId, InstanceId pluginId, const std::string& paramSymbol,
                                  int paramIndex, float minVal, float maxVal, CurveType curve) {
    learnTarget_.chainId = chainId;
    learnTarget_.pluginId = pluginId;
    learnTarget_.parameterSymbol = paramSymbol;
    learnTarget_.parameterIndex = paramIndex;
    learnTarget_.minValue = minVal;
    learnTarget_.maxValue = maxVal;
    learnTarget_.curve = curve;
    learnTarget_.isActive = true;
    learning_ = true;
}

void MidiHandler::startMidiLearn(std::function<void(int channel, int cc)> callback) {
    learnCallback_ = callback;
    learnTarget_.isActive = true;
    learning_ = true;
}

void MidiHandler::stopMidiLearn() {
    learning_ = false;
    learnTarget_.isActive = false;
    learnCallback_ = nullptr;
}

MidiLearnTarget MidiHandler::getLearnTarget() const {
    return learnTarget_;
}

// ========================================
// Chain-to-Program Mapping
// ========================================

void MidiHandler::setChainProgramMapping(int chainId, int programNumber) {
    std::lock_guard<std::mutex> lock(chainProgramMutex_);

    // Remove old mapping if exists
    for (auto it = programToChain_.begin(); it != programToChain_.end(); ) {
        if (it->second == chainId) {
            it = programToChain_.erase(it);
        } else {
            ++it;
        }
    }

    chainToProgram_[chainId] = programNumber;
    programToChain_[programNumber] = chainId;
}

int MidiHandler::getChainForProgram(int programNumber) const {
    std::lock_guard<std::mutex> lock(chainProgramMutex_);

    auto it = programToChain_.find(programNumber);
    if (it != programToChain_.end()) {
        return it->second;
    }
    return -1;
}

int MidiHandler::getProgramForChain(int chainId) const {
    std::lock_guard<std::mutex> lock(chainProgramMutex_);

    auto it = chainToProgram_.find(chainId);
    if (it != chainToProgram_.end()) {
        return it->second;
    }
    return -1;
}

void MidiHandler::clearChainProgramMappings() {
    std::lock_guard<std::mutex> lock(chainProgramMutex_);
    chainToProgram_.clear();
    programToChain_.clear();
}

// ========================================
// MIDI Thread
// ========================================

void MidiHandler::midiThreadFunc() {
    if (!alsaSeq_) return;

    snd_seq_t* seq = static_cast<snd_seq_t*>(alsaSeq_);

    int npfds = snd_seq_poll_descriptors_count(seq, POLLIN);
    std::vector<pollfd> pfds(npfds);
    snd_seq_poll_descriptors(seq, pfds.data(), npfds, POLLIN);

    while (threadRunning_) {
        int ret = poll(pfds.data(), npfds, 100);  // 100ms timeout
        if (ret < 0) break;
        if (ret == 0) continue;  // Timeout

        snd_seq_event_t* ev = nullptr;
        while (snd_seq_event_input(seq, &ev) >= 0) {
            if (!ev) continue;

            MidiMessage msg;
            msg.timestamp = 0;

            switch (ev->type) {
                case SND_SEQ_EVENT_NOTEON:
                    msg.type = MidiMessageType::NoteOn;
                    msg.channel = ev->data.note.channel;
                    msg.data1 = ev->data.note.note;
                    msg.data2 = ev->data.note.velocity;
                    break;

                case SND_SEQ_EVENT_NOTEOFF:
                    msg.type = MidiMessageType::NoteOff;
                    msg.channel = ev->data.note.channel;
                    msg.data1 = ev->data.note.note;
                    msg.data2 = ev->data.note.velocity;
                    break;

                case SND_SEQ_EVENT_CONTROLLER:
                    msg.type = MidiMessageType::ControlChange;
                    msg.channel = ev->data.control.channel;
                    msg.data1 = ev->data.control.param;
                    msg.data2 = ev->data.control.value;
                    break;

                case SND_SEQ_EVENT_PGMCHANGE:
                    msg.type = MidiMessageType::ProgramChange;
                    msg.channel = ev->data.control.channel;
                    msg.data1 = ev->data.control.value;
                    msg.data2 = 0;
                    break;

                case SND_SEQ_EVENT_PITCHBEND:
                    msg.type = MidiMessageType::PitchBend;
                    msg.channel = ev->data.control.channel;
                    msg.data1 = ev->data.control.value & 0x7F;
                    msg.data2 = (ev->data.control.value >> 7) & 0x7F;
                    break;

                case SND_SEQ_EVENT_CHANPRESS:
                    msg.type = MidiMessageType::ChannelPressure;
                    msg.channel = ev->data.control.channel;
                    msg.data1 = ev->data.control.value;
                    msg.data2 = 0;
                    break;

                default:
                    msg.type = MidiMessageType::Other;
                    continue;
            }

            handleMidiEvent(msg);
        }
    }
}

void MidiHandler::handleMidiEvent(const MidiMessage& msg) {
    if (!enabled_) return;

    // Update last received values for monitoring
    lastChannel_ = msg.channel;
    if (msg.type == MidiMessageType::ControlChange) {
        lastCC_ = msg.data1;
        lastValue_ = msg.data2;
    }

    // Call monitor callback for real-time activity display
    if (monitorCallback_) {
        monitorCallback_(msg);
    }

    // MIDI Learn mode - capture CC
    if (learning_ && msg.type == MidiMessageType::ControlChange) {
        if (learnCallback_) {
            learnCallback_(msg.channel, msg.data1);
        }
        if (learnCompleteCallback_) {
            learnCompleteCallback_(msg.channel, msg.data1);
        }
        return;  // Don't process normally during learn
    }

    // Handle message by type
    switch (msg.type) {
        case MidiMessageType::ControlChange:
            handleCC(msg.channel, msg.data1, msg.data2);
            break;

        case MidiMessageType::ProgramChange:
            handleProgramChange(msg.channel, msg.data1);
            break;

        case MidiMessageType::NoteOn:
            handleNoteOn(msg.channel, msg.data1, msg.data2);
            break;

        default:
            break;
    }

    // Legacy general callback
    if (midiCallback_) {
        midiCallback_(msg);
    }
}

void MidiHandler::handleCC(int channel, int cc, int value) {
    std::lock_guard<std::mutex> lock(mappingMutex_);

    for (auto& mapping : ccMappings_) {
        if (!mapping.active) continue;

        // Check channel match (0 = omni)
        bool channelMatch = (mapping.channel == 0) || (mapping.channel == channel + 1);
        if (!channelMatch) continue;

        // Check CC number match
        if (mapping.ccNumber != cc) continue;

        // Calculate new value with curve
        float newValue = ccToValue(value, mapping.minValue, mapping.maxValue, mapping.curve, mapping.invert);

        // Set target for smoothing
        mapping.targetValue = newValue;

        // Immediate callback with curved value
        if (paramCallback_) {
            paramCallback_(mapping.targetPlugin, mapping.parameterSymbol, mapping.parameterIndex, newValue);
        }

        // Legacy callback
        if (ccMappingCallback_) {
            ccMappingCallback_(mapping.targetPlugin, mapping.parameterSymbol, newValue);
        }
    }
}

void MidiHandler::handleProgramChange(int channel, int program) {
    // Check if this program number is mapped to a chain
    int chainId = getChainForProgram(program);

    if (chainId >= 0) {
        // Trigger chain switch
        if (chainSwitchCallback_) {
            chainSwitchCallback_(program, chainId);
        }
    }

    // Check command triggers
    std::lock_guard<std::mutex> lock(commandMutex_);
    for (const auto& trigger : commandTriggers_) {
        if (!trigger.active) continue;
        if (trigger.triggerType != MidiMessageType::ProgramChange) continue;

        bool channelMatch = (trigger.channel == 0) || (trigger.channel == channel + 1);
        if (!channelMatch) continue;

        if (trigger.data1 != program) continue;

        if (commandCallback_) {
            commandCallback_(trigger);
        }
    }
}

void MidiHandler::handleNoteOn(int channel, int note, int velocity) {
    // Check command triggers for Note On
    std::lock_guard<std::mutex> lock(commandMutex_);

    for (const auto& trigger : commandTriggers_) {
        if (!trigger.active) continue;
        if (trigger.triggerType != MidiMessageType::NoteOn) continue;

        bool channelMatch = (trigger.channel == 0) || (trigger.channel == channel + 1);
        if (!channelMatch) continue;

        if (trigger.data1 != note) continue;

        // Check velocity threshold
        if (trigger.data2Threshold > 0 && velocity < trigger.data2Threshold) continue;

        if (commandCallback_) {
            commandCallback_(trigger);
        }
    }
}

void MidiHandler::processSmoothing(int numSamples, std::function<void(InstanceId, int, float)> handler) {
    std::lock_guard<std::mutex> lock(mappingMutex_);

    for (auto& mapping : ccMappings_) {
        if (!mapping.active) continue;

        // Apply one-pole smoothing
        float diff = mapping.targetValue - mapping.currentValue;
        if (std::abs(diff) > 0.0001f) {
            for (int i = 0; i < numSamples; ++i) {
                mapping.currentValue = mapping.currentValue * mapping.smoothingCoeff +
                                       mapping.targetValue * (1.0f - mapping.smoothingCoeff);
            }

            if (handler) {
                handler(mapping.targetPlugin, mapping.parameterIndex, mapping.currentValue);
            }
        }
    }
}

// ========================================
// MIDI Output
// ========================================

bool MidiHandler::sendMessage(const MidiMessage& msg) {
    if (!alsaSeq_ || outputPort_ < 0) return false;

    snd_seq_t* seq = static_cast<snd_seq_t*>(alsaSeq_);
    snd_seq_event_t ev;
    snd_seq_ev_clear(&ev);
    snd_seq_ev_set_source(&ev, outputPort_);
    snd_seq_ev_set_subs(&ev);
    snd_seq_ev_set_direct(&ev);

    switch (msg.type) {
        case MidiMessageType::NoteOn:
            snd_seq_ev_set_noteon(&ev, msg.channel, msg.data1, msg.data2);
            break;
        case MidiMessageType::NoteOff:
            snd_seq_ev_set_noteoff(&ev, msg.channel, msg.data1, msg.data2);
            break;
        case MidiMessageType::ControlChange:
            snd_seq_ev_set_controller(&ev, msg.channel, msg.data1, msg.data2);
            break;
        case MidiMessageType::ProgramChange:
            snd_seq_ev_set_pgmchange(&ev, msg.channel, msg.data1);
            break;
        case MidiMessageType::Clock:
            snd_seq_ev_set_fixed(&ev);
            ev.type = SND_SEQ_EVENT_CLOCK;
            break;
        case MidiMessageType::Start:
            snd_seq_ev_set_fixed(&ev);
            ev.type = SND_SEQ_EVENT_START;
            break;
        case MidiMessageType::Stop:
            snd_seq_ev_set_fixed(&ev);
            ev.type = SND_SEQ_EVENT_STOP;
            break;
        case MidiMessageType::Continue:
            snd_seq_ev_set_fixed(&ev);
            ev.type = SND_SEQ_EVENT_CONTINUE;
            break;
        default:
            return false;
    }

    snd_seq_event_output(seq, &ev);
    snd_seq_drain_output(seq);

    return true;
}

bool MidiHandler::sendCC(int channel, int ccNumber, int value) {
    MidiMessage msg;
    msg.type = MidiMessageType::ControlChange;
    msg.channel = channel;
    msg.data1 = ccNumber;
    msg.data2 = std::max(0, std::min(127, value));
    msg.timestamp = 0;
    return sendMessage(msg);
}

bool MidiHandler::sendProgramChange(int channel, int program) {
    MidiMessage msg;
    msg.type = MidiMessageType::ProgramChange;
    msg.channel = channel;
    msg.data1 = std::max(0, std::min(127, program));
    msg.data2 = 0;
    msg.timestamp = 0;
    return sendMessage(msg);
}

bool MidiHandler::sendNoteOn(int channel, int note, int velocity) {
    MidiMessage msg;
    msg.type = MidiMessageType::NoteOn;
    msg.channel = channel;
    msg.data1 = std::max(0, std::min(127, note));
    msg.data2 = std::max(0, std::min(127, velocity));
    msg.timestamp = 0;
    return sendMessage(msg);
}

bool MidiHandler::sendNoteOff(int channel, int note, int velocity) {
    MidiMessage msg;
    msg.type = MidiMessageType::NoteOff;
    msg.channel = channel;
    msg.data1 = std::max(0, std::min(127, note));
    msg.data2 = std::max(0, std::min(127, velocity));
    msg.timestamp = 0;
    return sendMessage(msg);
}

void MidiHandler::sendParameterFeedback(int channel, int cc, float normalizedValue) {
    int ccValue = static_cast<int>(std::max(0.0f, std::min(1.0f, normalizedValue)) * 127.0f);
    sendCC(channel, cc, ccValue);
}

void MidiHandler::syncAllMappingsToController() {
    std::lock_guard<std::mutex> lock(mappingMutex_);

    for (const auto& mapping : ccMappings_) {
        if (!mapping.active || !mapping.feedbackEnabled) continue;

        // Calculate normalized value from current value
        float range = mapping.maxValue - mapping.minValue;
        float normalized = (range > 0.0001f) ?
            (mapping.currentValue - mapping.minValue) / range : 0.0f;

        int feedbackCC = (mapping.feedbackCC >= 0) ? mapping.feedbackCC : mapping.ccNumber;
        int ccChannel = (mapping.channel > 0) ? mapping.channel - 1 : 0;

        sendParameterFeedback(ccChannel, feedbackCC, normalized);
    }
}

// ========================================
// Status
// ========================================

MidiStatus MidiHandler::getStatus() const {
    MidiStatus status;
    status.enabled = enabled_;
    status.inputOpen = (inputPort_ >= 0);
    status.outputOpen = (outputPort_ >= 0);
    status.inputDevice = currentInputDevice_;
    status.outputDevice = currentOutputDevice_;
    status.learning = learning_;
    status.lastChannel = lastChannel_;
    status.lastCC = lastCC_;
    status.lastValue = lastValue_;

    {
        std::lock_guard<std::mutex> lock(mappingMutex_);
        status.mappingsCount = static_cast<int>(ccMappings_.size());
    }
    {
        std::lock_guard<std::mutex> lock(commandMutex_);
        status.commandsCount = static_cast<int>(commandTriggers_.size());
    }

    return status;
}

void MidiHandler::processMidiBuffer(const uint8_t* data, size_t length) {
    // Parse raw MIDI bytes (for direct buffer input)
    size_t i = 0;
    while (i < length) {
        uint8_t status = data[i];
        MidiMessage msg;
        msg.timestamp = 0;

        int channel = status & 0x0F;
        int type = status & 0xF0;

        switch (type) {
            case 0x90:  // Note On
                if (i + 2 < length) {
                    msg.type = MidiMessageType::NoteOn;
                    msg.channel = channel;
                    msg.data1 = data[i + 1];
                    msg.data2 = data[i + 2];
                    handleMidiEvent(msg);
                    i += 3;
                } else {
                    i = length;
                }
                break;

            case 0x80:  // Note Off
                if (i + 2 < length) {
                    msg.type = MidiMessageType::NoteOff;
                    msg.channel = channel;
                    msg.data1 = data[i + 1];
                    msg.data2 = data[i + 2];
                    handleMidiEvent(msg);
                    i += 3;
                } else {
                    i = length;
                }
                break;

            case 0xB0:  // Control Change
                if (i + 2 < length) {
                    msg.type = MidiMessageType::ControlChange;
                    msg.channel = channel;
                    msg.data1 = data[i + 1];
                    msg.data2 = data[i + 2];
                    handleMidiEvent(msg);
                    i += 3;
                } else {
                    i = length;
                }
                break;

            case 0xC0:  // Program Change
                if (i + 1 < length) {
                    msg.type = MidiMessageType::ProgramChange;
                    msg.channel = channel;
                    msg.data1 = data[i + 1];
                    msg.data2 = 0;
                    handleMidiEvent(msg);
                    i += 2;
                } else {
                    i = length;
                }
                break;

            case 0xE0:  // Pitch Bend
                if (i + 2 < length) {
                    msg.type = MidiMessageType::PitchBend;
                    msg.channel = channel;
                    msg.data1 = data[i + 1];
                    msg.data2 = data[i + 2];
                    handleMidiEvent(msg);
                    i += 3;
                } else {
                    i = length;
                }
                break;

            default:
                i++;
                break;
        }
    }
}

} // namespace map2
