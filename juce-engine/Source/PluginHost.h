#pragma once

/**
 * MAP2 Audio Engine - Plugin Host
 * LV2 plugin discovery and instance management using lilv
 */

#include "Common.h"
#include <lilv/lilv.h>

namespace map2 {

class PluginHost {
public:
    PluginHost();
    ~PluginHost();
    
    // Initialization
    bool initialize(const std::string& lv2Path = "");
    void shutdown();
    bool isInitialized() const { return initialized_; }
    
    // Plugin discovery
    std::vector<PluginInfo> discoverPlugins() const;
    std::optional<PluginInfo> getPluginInfo(const std::string& uri) const;
    
    // Plugin instantiation
    InstanceId loadPlugin(const std::string& uri, double sampleRate, int blockSize);
    bool unloadPlugin(InstanceId instanceId);
    
    // Plugin access
    PluginInstance* getInstance(InstanceId instanceId);
    const PluginInstance* getInstance(InstanceId instanceId) const;
    std::vector<PluginInstance> getLoadedPlugins() const;
    
    // Parameter control (RT-safe)
    bool setParameter(InstanceId instanceId, int paramIndex, float value);
    bool setParameterByName(InstanceId instanceId, const std::string& name, float value);
    float getParameter(InstanceId instanceId, int paramIndex) const;
    float getParameterByName(InstanceId instanceId, const std::string& name) const;
    
    // Bypass
    bool setBypass(InstanceId instanceId, bool bypass);
    bool isBypassed(InstanceId instanceId) const;
    
    // Audio processing
    void process(InstanceId instanceId,
                 const float* const* inputs, int numInputs,
                 float** outputs, int numOutputs,
                 int numSamples);
    
    // LV2 world access (for advanced usage)
    LilvWorld* getWorld() { return world_; }
    
private:
    // Internal plugin data
    struct InternalPlugin {
        InstanceId id;
        const LilvPlugin* lilvPlugin;
        LilvInstance* instance;
        PluginInfo info;
        PluginState state;
        bool bypassed;
        
        // Port buffers
        std::vector<float> controlInputs;
        std::vector<float> controlOutputs;
        std::vector<float*> audioInputPtrs;
        std::vector<float*> audioOutputPtrs;
        
        // Parameter mapping
        std::map<std::string, int> paramNameToIndex;
        std::map<int, std::string> paramIndexToName;
    };
    
    bool initialized_ = false;
    LilvWorld* world_ = nullptr;
    const LilvPlugins* plugins_ = nullptr;
    
    std::map<InstanceId, std::unique_ptr<InternalPlugin>> instances_;
    std::atomic<InstanceId> nextInstanceId_{1};
    
    mutable std::mutex instanceMutex_;
    
    // Helpers
    PluginInfo extractPluginInfo(const LilvPlugin* plugin) const;
    bool connectPorts(InternalPlugin* plugin, double sampleRate, int blockSize);
};

} // namespace map2
