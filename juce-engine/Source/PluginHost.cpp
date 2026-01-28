/**
 * MAP2 Audio Engine - Plugin Host Implementation
 * LV2 plugin discovery and instance management using lilv
 */

#include "PluginHost.h"
#include <iostream>
#include <cstring>
#include <dlfcn.h>
#include <unordered_map>

// LV2 Feature URIs
#include <lv2/options/options.h>
#include <lv2/urid/urid.h>
#include <lv2/buf-size/buf-size.h>

namespace map2 {

PluginHost::PluginHost() = default;

PluginHost::~PluginHost() {
    shutdown();
}

bool PluginHost::initialize(const std::string& lv2Path) {
    if (initialized_) return true;
    
    world_ = lilv_world_new();
    if (!world_) {
        std::cerr << "Failed to create lilv world" << std::endl;
        return false;
    }
    
    // Set LV2 path if provided
    if (!lv2Path.empty()) {
        LilvNode* pathNode = lilv_new_file_uri(world_, nullptr, lv2Path.c_str());
        if (pathNode) {
            lilv_world_set_option(world_, LILV_OPTION_LV2_PATH, pathNode);
            lilv_node_free(pathNode);
        }
    }
    
    // Load all plugins
    lilv_world_load_all(world_);
    plugins_ = lilv_world_get_all_plugins(world_);
    
    initialized_ = true;
    std::cout << "PluginHost initialized with " << lilv_plugins_size(plugins_) << " plugins" << std::endl;
    
    return true;
}

void PluginHost::shutdown() {
    std::lock_guard<std::mutex> lock(instanceMutex_);
    
    // Unload all instances
    for (auto& [id, plugin] : instances_) {
        if (plugin->instance) {
            lilv_instance_deactivate(plugin->instance);
            lilv_instance_free(plugin->instance);
        }
    }
    instances_.clear();
    
    if (world_) {
        lilv_world_free(world_);
        world_ = nullptr;
    }
    
    plugins_ = nullptr;
    initialized_ = false;
}

std::vector<PluginInfo> PluginHost::discoverPlugins() const {
    std::vector<PluginInfo> result;
    
    if (!initialized_ || !plugins_) return result;
    
    LILV_FOREACH(plugins, i, plugins_) {
        const LilvPlugin* plugin = lilv_plugins_get(plugins_, i);
        result.push_back(extractPluginInfo(plugin));
    }
    
    return result;
}

std::optional<PluginInfo> PluginHost::getPluginInfo(const std::string& uri) const {
    if (!initialized_ || !plugins_) return std::nullopt;
    
    LilvNode* uriNode = lilv_new_uri(world_, uri.c_str());
    const LilvPlugin* plugin = lilv_plugins_get_by_uri(plugins_, uriNode);
    lilv_node_free(uriNode);
    
    if (!plugin) return std::nullopt;
    
    return extractPluginInfo(plugin);
}

PluginInfo PluginHost::extractPluginInfo(const LilvPlugin* plugin) const {
    PluginInfo info;
    
    // URI
    const LilvNode* uriNode = lilv_plugin_get_uri(plugin);
    info.uri = lilv_node_as_uri(uriNode);
    
    // Name
    LilvNode* nameNode = lilv_plugin_get_name(plugin);
    if (nameNode) {
        info.name = lilv_node_as_string(nameNode);
        lilv_node_free(nameNode);
    }
    
    // Author
    LilvNode* authorNode = lilv_plugin_get_author_name(plugin);
    if (authorNode) {
        info.author = lilv_node_as_string(authorNode);
        lilv_node_free(authorNode);
    }
    
    // Class/Category
    const LilvPluginClass* pclass = lilv_plugin_get_class(plugin);
    if (pclass) {
        const LilvNode* classLabel = lilv_plugin_class_get_label(pclass);
        if (classLabel) {
            info.category = lilv_node_as_string(classLabel);
        }
    }
    
    // Ports
    int numPorts = lilv_plugin_get_num_ports(plugin);
    info.audioInputs = 0;
    info.audioOutputs = 0;
    info.hasMidiInput = false;
    info.hasMidiOutput = false;
    
    LilvNode* audioClass = lilv_new_uri(world_, "http://lv2plug.in/ns/lv2core#AudioPort");
    LilvNode* controlClass = lilv_new_uri(world_, "http://lv2plug.in/ns/lv2core#ControlPort");
    LilvNode* inputClass = lilv_new_uri(world_, "http://lv2plug.in/ns/lv2core#InputPort");
    LilvNode* outputClass = lilv_new_uri(world_, "http://lv2plug.in/ns/lv2core#OutputPort");
    LilvNode* atomClass = lilv_new_uri(world_, "http://lv2plug.in/ns/ext/atom#AtomPort");
    
    for (int i = 0; i < numPorts; i++) {
        const LilvPort* port = lilv_plugin_get_port_by_index(plugin, i);
        
        PortInfo portInfo;
        portInfo.index = i;
        
        // Symbol
        const LilvNode* symbolNode = lilv_port_get_symbol(plugin, port);
        if (symbolNode) {
            portInfo.symbol = lilv_node_as_string(symbolNode);
        }
        
        // Name
        LilvNode* portNameNode = lilv_port_get_name(plugin, port);
        if (portNameNode) {
            portInfo.name = lilv_node_as_string(portNameNode);
            lilv_node_free(portNameNode);
        }
        
        // Type and direction
        bool isAudio = lilv_port_is_a(plugin, port, audioClass);
        bool isControl = lilv_port_is_a(plugin, port, controlClass);
        bool isAtom = lilv_port_is_a(plugin, port, atomClass);
        bool isInput = lilv_port_is_a(plugin, port, inputClass);
        bool isOutput = lilv_port_is_a(plugin, port, outputClass);
        
        if (isAudio) {
            portInfo.type = PortType::Audio;
            if (isInput) info.audioInputs++;
            else if (isOutput) info.audioOutputs++;
        } else if (isControl) {
            portInfo.type = PortType::Control;
            
            // Get parameter info for control ports
            if (isInput) {
                ParameterInfo paramInfo;
                paramInfo.index = i;
                paramInfo.symbol = portInfo.symbol;
                paramInfo.name = portInfo.name;
                
                LilvNode* defNode = nullptr;
                LilvNode* minNode = nullptr;
                LilvNode* maxNode = nullptr;
                lilv_port_get_range(plugin, port, &defNode, &minNode, &maxNode);
                
                paramInfo.defaultValue = defNode ? lilv_node_as_float(defNode) : 0.0f;
                paramInfo.minValue = minNode ? lilv_node_as_float(minNode) : 0.0f;
                paramInfo.maxValue = maxNode ? lilv_node_as_float(maxNode) : 1.0f;
                
                if (defNode) lilv_node_free(defNode);
                if (minNode) lilv_node_free(minNode);
                if (maxNode) lilv_node_free(maxNode);
                
                info.parameters.push_back(paramInfo);
            }
        } else if (isAtom) {
            portInfo.type = PortType::Atom;
            // Check for MIDI
            LilvNode* midiEvent = lilv_new_uri(world_, "http://lv2plug.in/ns/ext/midi#MidiEvent");
            if (lilv_port_supports_event(plugin, port, midiEvent)) {
                if (isInput) info.hasMidiInput = true;
                else info.hasMidiOutput = true;
            }
            lilv_node_free(midiEvent);
        }
        
        portInfo.direction = isInput ? PortDirection::Input : PortDirection::Output;
        info.ports.push_back(portInfo);
    }
    
    lilv_node_free(audioClass);
    lilv_node_free(controlClass);
    lilv_node_free(inputClass);
    lilv_node_free(outputClass);
    lilv_node_free(atomClass);
    
    return info;
}

InstanceId PluginHost::loadPlugin(const std::string& uri, double sampleRate, int blockSize) {
    if (!initialized_) return INVALID_INSTANCE_ID;
    
    LilvNode* uriNode = lilv_new_uri(world_, uri.c_str());
    const LilvPlugin* lilvPlugin = lilv_plugins_get_by_uri(plugins_, uriNode);
    lilv_node_free(uriNode);
    
    if (!lilvPlugin) {
        std::cerr << "Plugin not found: " << uri << std::endl;
        return INVALID_INSTANCE_ID;
    }
    
    // Set up LV2 features (required by many plugins)
    static LV2_Options_Option options[] = {
        { LV2_OPTIONS_INSTANCE, 0, 0, 0, 0, nullptr },  // Null terminator
    };
    
    static LV2_Feature options_feature = { LV2_OPTIONS__options, options };
    static LV2_Feature bounded_block_feature = { LV2_BUF_SIZE__boundedBlockLength, nullptr };
    static LV2_Feature fixed_block_feature = { LV2_BUF_SIZE__fixedBlockLength, nullptr };
    
    // URID map feature (simplified - many plugins need this)
    static LV2_URID_Map uridMap = {
        nullptr,
        [](LV2_URID_Map_Handle, const char* uriStr) -> LV2_URID {
            // Simple hash-based URID mapping
            static std::unordered_map<std::string, LV2_URID> uridCache;
            static LV2_URID nextUrid = 1;
            auto it = uridCache.find(uriStr);
            if (it != uridCache.end()) return it->second;
            LV2_URID id = nextUrid++;
            uridCache[uriStr] = id;
            return id;
        }
    };
    static LV2_Feature urid_map_feature = { LV2_URID__map, &uridMap };
    
    static LV2_URID_Unmap uridUnmap = {
        nullptr,
        [](LV2_URID_Unmap_Handle, LV2_URID urid) -> const char* {
            // Simple reverse lookup (not implemented for simplicity)
            (void)urid;
            return nullptr;
        }
    };
    static LV2_Feature urid_unmap_feature = { LV2_URID__unmap, &uridUnmap };
    
    static const LV2_Feature* features[] = {
        &urid_map_feature,
        &urid_unmap_feature,
        &options_feature,
        &bounded_block_feature,
        &fixed_block_feature,
        nullptr
    };
    
    // Create instance
    LilvInstance* instance = lilv_plugin_instantiate(lilvPlugin, sampleRate, features);
    if (!instance) {
        std::cerr << "Failed to instantiate plugin: " << uri << std::endl;
        return INVALID_INSTANCE_ID;
    }
    
    // Create internal plugin
    auto plugin = std::make_unique<InternalPlugin>();
    plugin->id = nextInstanceId_++;
    plugin->lilvPlugin = lilvPlugin;
    plugin->instance = instance;
    plugin->info = extractPluginInfo(lilvPlugin);
    plugin->state = PluginState::Loaded;
    plugin->bypassed = false;
    
    // Connect ports
    if (!connectPorts(plugin.get(), sampleRate, blockSize)) {
        lilv_instance_free(instance);
        return INVALID_INSTANCE_ID;
    }
    
    // Activate
    lilv_instance_activate(instance);
    plugin->state = PluginState::Active;
    
    InstanceId id = plugin->id;
    
    {
        std::lock_guard<std::mutex> lock(instanceMutex_);
        instances_[id] = std::move(plugin);
    }
    
    std::cout << "Loaded plugin: " << uri << " (instance " << id << ")" << std::endl;
    return id;
}

bool PluginHost::connectPorts(InternalPlugin* plugin, double /*sampleRate*/, int blockSize) {
    const LilvPlugin* lilvPlugin = plugin->lilvPlugin;
    LilvInstance* instance = plugin->instance;
    
    int numPorts = lilv_plugin_get_num_ports(lilvPlugin);
    
    LilvNode* audioClass = lilv_new_uri(world_, "http://lv2plug.in/ns/lv2core#AudioPort");
    LilvNode* controlClass = lilv_new_uri(world_, "http://lv2plug.in/ns/lv2core#ControlPort");
    LilvNode* inputClass = lilv_new_uri(world_, "http://lv2plug.in/ns/lv2core#InputPort");
    
    plugin->controlInputs.resize(numPorts, 0.0f);
    plugin->controlOutputs.resize(numPorts, 0.0f);
    
    int paramIndex = 0;
    for (int i = 0; i < numPorts; i++) {
        const LilvPort* port = lilv_plugin_get_port_by_index(lilvPlugin, i);
        
        bool isControl = lilv_port_is_a(lilvPlugin, port, controlClass);
        bool isInput = lilv_port_is_a(lilvPlugin, port, inputClass);
        
        if (isControl) {
            if (isInput) {
                // Get default value
                LilvNode* defNode = nullptr;
                lilv_port_get_range(lilvPlugin, port, &defNode, nullptr, nullptr);
                plugin->controlInputs[i] = defNode ? lilv_node_as_float(defNode) : 0.0f;
                if (defNode) lilv_node_free(defNode);
                
                lilv_instance_connect_port(instance, i, &plugin->controlInputs[i]);
                
                // Map parameter name to index
                const LilvNode* symbolNode = lilv_port_get_symbol(lilvPlugin, port);
                if (symbolNode) {
                    std::string symbol = lilv_node_as_string(symbolNode);
                    plugin->paramNameToIndex[symbol] = paramIndex;
                    plugin->paramIndexToName[paramIndex] = symbol;
                    paramIndex++;
                }
            } else {
                lilv_instance_connect_port(instance, i, &plugin->controlOutputs[i]);
            }
        }
    }
    
    lilv_node_free(audioClass);
    lilv_node_free(controlClass);
    lilv_node_free(inputClass);
    
    // Note: Audio ports are connected during process()
    
    return true;
}

bool PluginHost::unloadPlugin(InstanceId instanceId) {
    std::lock_guard<std::mutex> lock(instanceMutex_);
    
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return false;
    
    auto& plugin = it->second;
    if (plugin->instance) {
        lilv_instance_deactivate(plugin->instance);
        lilv_instance_free(plugin->instance);
    }
    
    instances_.erase(it);
    std::cout << "Unloaded plugin instance " << instanceId << std::endl;
    return true;
}

PluginInstance* PluginHost::getInstance(InstanceId instanceId) {
    // This would need to return a view into InternalPlugin
    // For simplicity, we'll handle this differently
    return nullptr;
}

const PluginInstance* PluginHost::getInstance(InstanceId instanceId) const {
    return nullptr;
}

std::vector<PluginInstance> PluginHost::getLoadedPlugins() const {
    std::lock_guard<std::mutex> lock(instanceMutex_);
    std::vector<PluginInstance> result;
    
    for (const auto& [id, plugin] : instances_) {
        PluginInstance inst;
        inst.id = plugin->id;
        inst.uri = plugin->info.uri;
        inst.name = plugin->info.name;
        inst.state = plugin->state;
        inst.bypassed = plugin->bypassed;
        result.push_back(inst);
    }
    
    return result;
}

bool PluginHost::setParameter(InstanceId instanceId, int paramIndex, float value) {
    std::lock_guard<std::mutex> lock(instanceMutex_);
    
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return false;
    
    auto& plugin = it->second;
    
    // Find the port index for this parameter
    auto nameIt = plugin->paramIndexToName.find(paramIndex);
    if (nameIt == plugin->paramIndexToName.end()) return false;
    
    return setParameterByName(instanceId, nameIt->second, value);
}

bool PluginHost::setParameterByName(InstanceId instanceId, const std::string& name, float value) {
    std::lock_guard<std::mutex> lock(instanceMutex_);
    
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return false;
    
    auto& plugin = it->second;
    
    // Find port index from name
    int numPorts = lilv_plugin_get_num_ports(plugin->lilvPlugin);
    
    for (int i = 0; i < numPorts; i++) {
        const LilvPort* port = lilv_plugin_get_port_by_index(plugin->lilvPlugin, i);
        const LilvNode* symbolNode = lilv_port_get_symbol(plugin->lilvPlugin, port);
        
        if (symbolNode && lilv_node_as_string(symbolNode) == name) {
            plugin->controlInputs[i] = value;
            return true;
        }
    }
    
    return false;
}

float PluginHost::getParameter(InstanceId instanceId, int paramIndex) const {
    std::lock_guard<std::mutex> lock(instanceMutex_);
    
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return 0.0f;
    
    auto& plugin = it->second;
    auto nameIt = plugin->paramIndexToName.find(paramIndex);
    if (nameIt == plugin->paramIndexToName.end()) return 0.0f;
    
    return getParameterByName(instanceId, nameIt->second);
}

float PluginHost::getParameterByName(InstanceId instanceId, const std::string& name) const {
    std::lock_guard<std::mutex> lock(instanceMutex_);
    
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return 0.0f;
    
    auto& plugin = it->second;
    
    int numPorts = lilv_plugin_get_num_ports(plugin->lilvPlugin);
    
    for (int i = 0; i < numPorts; i++) {
        const LilvPort* port = lilv_plugin_get_port_by_index(plugin->lilvPlugin, i);
        const LilvNode* symbolNode = lilv_port_get_symbol(plugin->lilvPlugin, port);
        
        if (symbolNode && lilv_node_as_string(symbolNode) == name) {
            return plugin->controlInputs[i];
        }
    }
    
    return 0.0f;
}

bool PluginHost::setBypass(InstanceId instanceId, bool bypass) {
    std::lock_guard<std::mutex> lock(instanceMutex_);
    
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return false;
    
    it->second->bypassed = bypass;
    it->second->state = bypass ? PluginState::Bypassed : PluginState::Active;
    return true;
}

bool PluginHost::isBypassed(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(instanceMutex_);
    
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return true;
    
    return it->second->bypassed;
}

void PluginHost::process(InstanceId instanceId,
                         const float* const* inputs, int numInputs,
                         float** outputs, int numOutputs,
                         int numSamples) {
    InternalPlugin* plugin = nullptr;
    
    {
        std::lock_guard<std::mutex> lock(instanceMutex_);
        auto it = instances_.find(instanceId);
        if (it == instances_.end()) return;
        plugin = it->second.get();
    }
    
    if (!plugin || !plugin->instance || plugin->bypassed) {
        // Bypass: copy input to output
        int channelsToCopy = std::min(numInputs, numOutputs);
        for (int ch = 0; ch < channelsToCopy; ch++) {
            if (inputs[ch] && outputs[ch]) {
                std::memcpy(outputs[ch], inputs[ch], numSamples * sizeof(float));
            }
        }
        return;
    }
    
    // Connect audio ports
    LilvNode* audioClass = lilv_new_uri(world_, "http://lv2plug.in/ns/lv2core#AudioPort");
    LilvNode* inputClass = lilv_new_uri(world_, "http://lv2plug.in/ns/lv2core#InputPort");
    
    int numPorts = lilv_plugin_get_num_ports(plugin->lilvPlugin);
    int inputIdx = 0, outputIdx = 0;
    
    for (int i = 0; i < numPorts; i++) {
        const LilvPort* port = lilv_plugin_get_port_by_index(plugin->lilvPlugin, i);
        
        if (lilv_port_is_a(plugin->lilvPlugin, port, audioClass)) {
            if (lilv_port_is_a(plugin->lilvPlugin, port, inputClass)) {
                if (inputIdx < numInputs) {
                    lilv_instance_connect_port(plugin->instance, i, const_cast<float*>(inputs[inputIdx++]));
                }
            } else {
                if (outputIdx < numOutputs) {
                    lilv_instance_connect_port(plugin->instance, i, outputs[outputIdx++]);
                }
            }
        }
    }
    
    lilv_node_free(audioClass);
    lilv_node_free(inputClass);
    
    // Run plugin
    lilv_instance_run(plugin->instance, numSamples);
}

} // namespace map2
