/**
 * MAP2 Audio Engine - Plugin Graph Implementation
 * Signal chain routing and processing
 */

#include "PluginGraph.h"
#include <algorithm>
#include <cstring>
#include <cmath>

namespace map2 {

PluginGraph::PluginGraph(PluginHost& host)
    : host_(host) {
    // Pre-allocate inter-plugin buffers (stereo)
    interBuffers_.resize(4);  // 2 input + 2 output scratch buffers
    for (auto& buf : interBuffers_) {
        buf.resize(bufferSize_);
    }
}

PluginGraph::~PluginGraph() = default;

bool PluginGraph::addPlugin(InstanceId instanceId, int position) {
    // Verify plugin exists
    auto plugins = host_.getLoadedPlugins();
    bool found = false;
    for (const auto& p : plugins) {
        if (p.id == instanceId) {
            found = true;
            break;
        }
    }
    
    if (!found) return false;
    
    // Check if already in chain
    auto it = std::find(chain_.begin(), chain_.end(), instanceId);
    if (it != chain_.end()) return false;
    
    if (position < 0 || position >= static_cast<int>(chain_.size())) {
        chain_.push_back(instanceId);
    } else {
        chain_.insert(chain_.begin() + position, instanceId);
    }
    
    return true;
}

bool PluginGraph::removePlugin(InstanceId instanceId) {
    auto it = std::find(chain_.begin(), chain_.end(), instanceId);
    if (it == chain_.end()) return false;
    
    chain_.erase(it);
    
    std::lock_guard<std::mutex> lock(vuMutex_);
    pluginVuLevels_.erase(instanceId);
    
    return true;
}

bool PluginGraph::movePlugin(InstanceId instanceId, int newPosition) {
    auto it = std::find(chain_.begin(), chain_.end(), instanceId);
    if (it == chain_.end()) return false;
    
    chain_.erase(it);
    
    if (newPosition < 0 || newPosition >= static_cast<int>(chain_.size())) {
        chain_.push_back(instanceId);
    } else {
        chain_.insert(chain_.begin() + newPosition, instanceId);
    }
    
    return true;
}

bool PluginGraph::reorderPlugins(const std::vector<InstanceId>& order) {
    // Verify all plugins in order are in chain
    for (InstanceId id : order) {
        if (std::find(chain_.begin(), chain_.end(), id) == chain_.end()) {
            return false;
        }
    }
    
    chain_ = order;
    return true;
}

std::vector<InstanceId> PluginGraph::getChainOrder() const {
    return chain_;
}

int PluginGraph::getPluginPosition(InstanceId instanceId) const {
    auto it = std::find(chain_.begin(), chain_.end(), instanceId);
    if (it == chain_.end()) return -1;
    return static_cast<int>(std::distance(chain_.begin(), it));
}

void PluginGraph::ensureBufferSize(int numSamples) {
    if (numSamples > static_cast<int>(interBuffers_[0].size())) {
        for (auto& buf : interBuffers_) {
            buf.resize(numSamples);
        }
    }
}

void PluginGraph::process(const float* const* inputs, int numInputChannels,
                          float** outputs, int numOutputChannels,
                          int numSamples) {
    ensureBufferSize(numSamples);
    
    // Update master input VU
    if (numInputChannels >= 1 && inputs[0]) {
        std::lock_guard<std::mutex> lock(vuMutex_);
        masterInputVu_.inputLeft = calculatePeak(inputs[0], numSamples);
        if (numInputChannels >= 2 && inputs[1]) {
            masterInputVu_.inputRight = calculatePeak(inputs[1], numSamples);
        } else {
            masterInputVu_.inputRight = masterInputVu_.inputLeft;
        }
    }
    
    if (chain_.empty()) {
        // No plugins: pass through
        int channelsToCopy = std::min(numInputChannels, numOutputChannels);
        for (int ch = 0; ch < channelsToCopy; ch++) {
            if (inputs[ch] && outputs[ch]) {
                std::memcpy(outputs[ch], inputs[ch], numSamples * sizeof(float));
            }
        }
        
        // Clear remaining output channels
        for (int ch = channelsToCopy; ch < numOutputChannels; ch++) {
            if (outputs[ch]) {
                std::memset(outputs[ch], 0, numSamples * sizeof(float));
            }
        }
        
        return;
    }
    
    // Process chain
    const float* currentInputs[2] = {inputs[0], numInputChannels > 1 ? inputs[1] : inputs[0]};
    float* currentOutputs[2] = {interBuffers_[0].data(), interBuffers_[1].data()};
    
    for (size_t i = 0; i < chain_.size(); i++) {
        InstanceId instanceId = chain_[i];
        
        bool isLast = (i == chain_.size() - 1);
        
        if (isLast) {
            // Last plugin outputs to final output
            currentOutputs[0] = outputs[0];
            currentOutputs[1] = numOutputChannels > 1 ? outputs[1] : outputs[0];
        }
        
        // Process plugin
        host_.process(instanceId, currentInputs, 2, currentOutputs, 2, numSamples);
        
        // Update VU for this plugin
        {
            std::lock_guard<std::mutex> lock(vuMutex_);
            VuLevels& vu = pluginVuLevels_[instanceId];
            vu.inputLeft = calculatePeak(currentInputs[0], numSamples);
            vu.inputRight = calculatePeak(currentInputs[1], numSamples);
            vu.outputLeft = calculatePeak(currentOutputs[0], numSamples);
            vu.outputRight = calculatePeak(currentOutputs[1], numSamples);
        }
        
        if (!isLast) {
            // Swap buffers for next plugin
            currentInputs[0] = currentOutputs[0];
            currentInputs[1] = currentOutputs[1];
            currentOutputs[0] = interBuffers_[2].data();
            currentOutputs[1] = interBuffers_[3].data();
            
            // Alternate buffer pairs
            if (i % 2 == 0) {
                currentOutputs[0] = interBuffers_[2].data();
                currentOutputs[1] = interBuffers_[3].data();
            } else {
                currentOutputs[0] = interBuffers_[0].data();
                currentOutputs[1] = interBuffers_[1].data();
            }
        }
    }
    
    // Update master output VU
    if (numOutputChannels >= 1 && outputs[0]) {
        std::lock_guard<std::mutex> lock(vuMutex_);
        masterOutputVu_.outputLeft = calculatePeak(outputs[0], numSamples);
        if (numOutputChannels >= 2 && outputs[1]) {
            masterOutputVu_.outputRight = calculatePeak(outputs[1], numSamples);
        } else {
            masterOutputVu_.outputRight = masterOutputVu_.outputLeft;
        }
    }
}

float PluginGraph::calculatePeak(const float* buffer, int numSamples) {
    float peak = 0.0f;
    for (int i = 0; i < numSamples; i++) {
        float abs = std::fabs(buffer[i]);
        if (abs > peak) peak = abs;
    }
    return peak;
}

void PluginGraph::updateVuLevels(const float* left, const float* right, int numSamples, VuLevels& vu) {
    vu.inputLeft = calculatePeak(left, numSamples);
    vu.inputRight = right ? calculatePeak(right, numSamples) : vu.inputLeft;
}

std::map<InstanceId, VuLevels> PluginGraph::getPluginVuLevels() const {
    std::lock_guard<std::mutex> lock(vuMutex_);
    return pluginVuLevels_;
}

VuLevels PluginGraph::getMasterVuLevels() const {
    std::lock_guard<std::mutex> lock(vuMutex_);
    VuLevels combined;
    combined.inputLeft = masterInputVu_.inputLeft;
    combined.inputRight = masterInputVu_.inputRight;
    combined.outputLeft = masterOutputVu_.outputLeft;
    combined.outputRight = masterOutputVu_.outputRight;
    return combined;
}

void PluginGraph::setBufferSize(int size) {
    bufferSize_ = size;
    for (auto& buf : interBuffers_) {
        buf.resize(size);
    }
}

void PluginGraph::setSampleRate(double rate) {
    sampleRate_ = rate;
}

} // namespace map2
