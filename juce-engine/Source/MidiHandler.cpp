/**
 * MAP2 Audio Engine - MIDI Handler Implementation
 * ALSA MIDI input/output and CC mapping
 */

#include "MidiHandler.h"
#include <alsa/asoundlib.h>
#include <iostream>
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
    std::cout << "MIDI Handler initialized" << std::endl;
    
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
}

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

bool MidiHandler::openInputDevice(const std::string& /*deviceName*/) {
    // For simplicity, we accept connections from any device
    // In a full implementation, we would parse deviceName and connect
    return true;
}

bool MidiHandler::openOutputDevice(const std::string& /*deviceName*/) {
    return true;
}

void MidiHandler::closeAllDevices() {
    // Disconnect all subscriptions
}

bool MidiHandler::addCCMapping(const MidiCCMapping& mapping) {
    std::lock_guard<std::mutex> lock(mappingMutex_);
    
    // Check for existing mapping
    for (auto& m : ccMappings_) {
        if (m.channel == mapping.channel && m.ccNumber == mapping.ccNumber) {
            m = mapping;
            return true;
        }
    }
    
    ccMappings_.push_back(mapping);
    return true;
}

bool MidiHandler::removeCCMapping(int channel, int ccNumber) {
    std::lock_guard<std::mutex> lock(mappingMutex_);
    
    auto it = std::remove_if(ccMappings_.begin(), ccMappings_.end(),
        [channel, ccNumber](const MidiCCMapping& m) {
            return m.channel == channel && m.ccNumber == ccNumber;
        });
    
    if (it != ccMappings_.end()) {
        ccMappings_.erase(it, ccMappings_.end());
        return true;
    }
    
    return false;
}

std::vector<MidiCCMapping> MidiHandler::getCCMappings() const {
    std::lock_guard<std::mutex> lock(mappingMutex_);
    return ccMappings_;
}

void MidiHandler::clearCCMappings() {
    std::lock_guard<std::mutex> lock(mappingMutex_);
    ccMappings_.clear();
}

void MidiHandler::startMidiLearn(std::function<void(int channel, int cc)> callback) {
    learnCallback_ = callback;
    learning_ = true;
}

void MidiHandler::stopMidiLearn() {
    learning_ = false;
    learnCallback_ = nullptr;
}

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
            msg.timestamp = 0;  // TODO: proper timestamp
            
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
    
    // MIDI Learn mode
    if (learning_ && msg.type == MidiMessageType::ControlChange) {
        if (learnCallback_) {
            learnCallback_(msg.channel, msg.data1);
        }
        return;
    }
    
    // Check CC mappings
    if (msg.type == MidiMessageType::ControlChange) {
        std::lock_guard<std::mutex> lock(mappingMutex_);
        
        for (const auto& mapping : ccMappings_) {
            if (mapping.active &&
                mapping.channel == msg.channel &&
                mapping.ccNumber == msg.data1) {
                
                float value = ccToValue(msg.data2, mapping.minValue, mapping.maxValue);
                
                if (ccMappingCallback_) {
                    ccMappingCallback_(mapping.targetPlugin, mapping.parameterName, value);
                }
            }
        }
    }
    
    // General callback
    if (midiCallback_) {
        midiCallback_(msg);
    }
}

float MidiHandler::ccToValue(int ccValue, float minVal, float maxVal) {
    float normalized = static_cast<float>(ccValue) / 127.0f;
    return minVal + normalized * (maxVal - minVal);
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
                
            default:
                i++;
                break;
        }
    }
}

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
        default:
            return false;
    }
    
    snd_seq_event_output(seq, &ev);
    snd_seq_drain_output(seq);
    
    return true;
}

} // namespace map2
