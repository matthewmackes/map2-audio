#pragma once

/**
 * MAP2 Audio Engine - Plugin Graph
 * Signal chain routing and processing
 */

#include "Common.h"
#include "PluginHost.h"
#include <vector>

namespace map2 {

class PluginGraph {
public:
    PluginGraph(PluginHost& host);
    ~PluginGraph();
    
    // Chain management
    bool addPlugin(InstanceId instanceId, int position = -1);
    bool removePlugin(InstanceId instanceId);
    bool movePlugin(InstanceId instanceId, int newPosition);
    bool reorderPlugins(const std::vector<InstanceId>& order);
    
    // Chain info
    std::vector<InstanceId> getChainOrder() const;
    int getPluginPosition(InstanceId instanceId) const;
    size_t getChainSize() const { return chain_.size(); }
    
    // Audio processing
    void process(const float* const* inputs, int numInputChannels,
                 float** outputs, int numOutputChannels,
                 int numSamples);
    
    // VU levels for each plugin in chain
    std::map<InstanceId, VuLevels> getPluginVuLevels() const;
    
    // Master I/O levels
    VuLevels getMasterVuLevels() const;
    
    // Configuration
    void setBufferSize(int size);
    void setSampleRate(double rate);
    
private:
    PluginHost& host_;
    std::vector<InstanceId> chain_;
    
    // Internal buffers for inter-plugin routing
    std::vector<std::vector<float>> interBuffers_;
    int bufferSize_ = DEFAULT_BUFFER_SIZE;
    double sampleRate_ = DEFAULT_SAMPLE_RATE;
    
    // VU metering
    mutable std::mutex vuMutex_;
    std::map<InstanceId, VuLevels> pluginVuLevels_;
    VuLevels masterInputVu_;
    VuLevels masterOutputVu_;
    
    // VU calculation
    void updateVuLevels(const float* left, const float* right, int numSamples, VuLevels& vu);
    float calculatePeak(const float* buffer, int numSamples);
    
    // Buffer management
    void ensureBufferSize(int numSamples);
};

} // namespace map2
