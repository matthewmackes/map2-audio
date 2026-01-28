/**
 * MAP2 Audio Engine - JUCE Plugin Host Implementation
 */

#include "JucePluginHost.h"
#include <sstream>

namespace map2 {

JucePluginHost::JucePluginHost() {
    // Register all available plugin formats
    formatManager_.addDefaultFormats();

#if JUCE_PLUGINHOST_LV2
    // LV2 format is not in default formats, needs explicit addition if available
    // Note: JUCE's LV2 support may require additional setup
#endif

#if JUCE_PLUGINHOST_LADSPA
    // LADSPA is Linux-specific
#endif
}

JucePluginHost::~JucePluginHost() {
    shutdown();
}

bool JucePluginHost::initialize(const std::string& searchPaths) {
    if (initialized_) {
        shutdown();
    }

    // Parse search paths
    searchPaths_.clear();
    if (!searchPaths.empty()) {
        std::stringstream ss(searchPaths);
        std::string path;
        while (std::getline(ss, path, ':')) {
            if (!path.empty()) {
                searchPaths_.push_back(path);
            }
        }
    }

    // Add default search paths if none provided
    if (searchPaths_.empty()) {
#if JUCE_LINUX
        searchPaths_.push_back("/usr/lib/vst3");
        searchPaths_.push_back("/usr/local/lib/vst3");
        searchPaths_.push_back("~/.vst3");
        searchPaths_.push_back("/usr/lib/lv2");
        searchPaths_.push_back("/usr/local/lib/lv2");
        searchPaths_.push_back("~/.lv2");
#elif JUCE_MAC
        searchPaths_.push_back("~/Library/Audio/Plug-Ins/VST3");
        searchPaths_.push_back("/Library/Audio/Plug-Ins/VST3");
        searchPaths_.push_back("~/Library/Audio/Plug-Ins/Components");
        searchPaths_.push_back("/Library/Audio/Plug-Ins/Components");
#elif JUCE_WINDOWS
        searchPaths_.push_back("C:\\Program Files\\Common Files\\VST3");
        searchPaths_.push_back("C:\\Program Files (x86)\\Common Files\\VST3");
#endif
    }

    initialized_ = true;
    return true;
}

void JucePluginHost::shutdown() {
    if (!initialized_) return;

    std::lock_guard<std::mutex> lock(mutex_);

    // Unload all plugins
    instances_.clear();
    initialized_ = false;
}

void JucePluginHost::scanForPlugins(bool rescanAll,
    std::function<void(float, const std::string&)> progressCallback) {

    if (!initialized_) return;

    if (rescanAll) {
        knownPlugins_.clear();
    }

    // Scan each format
    for (auto* format : formatManager_.getFormats()) {
        juce::PluginDirectoryScanner scanner(
            knownPlugins_,
            *format,
            format->getDefaultLocationsToSearch(),
            true,   // Recursive
            juce::File()  // No dead-mans pedal file
        );

        juce::String nextPlugin;
        while (scanner.scanNextFile(true, nextPlugin)) {
            if (progressCallback) {
                float progress = scanner.getProgress();
                progressCallback(progress, nextPlugin.toStdString());
            }
        }
    }
}

std::vector<PluginInfo> JucePluginHost::discoverPlugins(PluginFormat format) const {
    std::vector<PluginInfo> plugins;

    for (const auto& desc : knownPlugins_.getTypes()) {
        // Filter by format if requested
        if (format != PluginFormat::All) {
            PluginFormat pluginFormat = formatFromString(desc.pluginFormatName);
            if (pluginFormat != format) {
                continue;
            }
        }

        plugins.push_back(extractPluginInfo(desc));
    }

    return plugins;
}

std::optional<PluginInfo> JucePluginHost::getPluginInfo(const std::string& pluginId) const {
    // Search by unique ID or name
    for (const auto& desc : knownPlugins_.getTypes()) {
        if (desc.fileOrIdentifier.toStdString() == pluginId ||
            desc.name.toStdString() == pluginId ||
            desc.createIdentifierString().toStdString() == pluginId) {
            return extractPluginInfo(desc);
        }
    }
    return std::nullopt;
}

bool JucePluginHost::isPluginAvailable(const std::string& pluginId) const {
    return getPluginInfo(pluginId).has_value();
}

InstanceId JucePluginHost::loadPlugin(const std::string& pluginId,
                                      double sampleRate,
                                      int blockSize) {
    if (!initialized_) return INVALID_INSTANCE_ID;

    // Find the plugin description
    const juce::PluginDescription* desc = nullptr;
    for (const auto& d : knownPlugins_.getTypes()) {
        if (d.fileOrIdentifier.toStdString() == pluginId ||
            d.name.toStdString() == pluginId ||
            d.createIdentifierString().toStdString() == pluginId) {
            desc = &d;
            break;
        }
    }

    if (desc == nullptr) {
        return INVALID_INSTANCE_ID;
    }

    // Create the plugin instance
    juce::String errorMessage;
    auto instance = formatManager_.createPluginInstance(
        *desc, sampleRate, blockSize, errorMessage);

    if (instance == nullptr) {
        return INVALID_INSTANCE_ID;
    }

    // Prepare the plugin for playback
    instance->prepareToPlay(sampleRate, blockSize);
    instance->setNonRealtime(false);

    // Create entry
    auto entry = std::make_unique<PluginEntry>();
    entry->id = nextInstanceId_++;
    entry->instance = std::move(instance);
    entry->info = extractPluginInfo(*desc);
    entry->format = formatFromString(desc->pluginFormatName);
    entry->sampleRate = sampleRate;
    entry->blockSize = blockSize;

    // Build parameter name mapping
    buildParameterMap(*entry);

    InstanceId id = entry->id;

    {
        std::lock_guard<std::mutex> lock(mutex_);
        instances_[id] = std::move(entry);
    }

    return id;
}

bool JucePluginHost::unloadPlugin(InstanceId instanceId) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = instances_.find(instanceId);
    if (it == instances_.end()) {
        return false;
    }

    // Release resources
    if (it->second->instance) {
        it->second->instance->releaseResources();
    }

    instances_.erase(it);
    return true;
}

juce::AudioPluginInstance* JucePluginHost::getInstance(InstanceId instanceId) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return nullptr;
    return it->second->instance.get();
}

const juce::AudioPluginInstance* JucePluginHost::getInstance(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return nullptr;
    return it->second->instance.get();
}

std::vector<PluginInstance> JucePluginHost::getLoadedPlugins() const {
    std::vector<PluginInstance> result;
    std::lock_guard<std::mutex> lock(mutex_);

    for (const auto& [id, entry] : instances_) {
        PluginInstance pi;
        pi.id = id;
        pi.uri = entry->info.uri;
        pi.name = entry->info.name;
        pi.state = PluginState::Active;
        pi.bypassed = entry->bypassed;
        pi.parameterValues = getAllParameters(id);
        result.push_back(pi);
    }

    return result;
}

PluginFormat JucePluginHost::getPluginFormat(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return PluginFormat::Unknown;
    return it->second->format;
}

bool JucePluginHost::setParameter(InstanceId instanceId, int paramIndex, float value) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return false;

    auto* instance = it->second->instance.get();
    if (instance == nullptr) return false;

    auto& params = instance->getParameters();
    if (paramIndex < 0 || paramIndex >= params.size()) return false;

    params[paramIndex]->setValue(value);
    return true;
}

bool JucePluginHost::setParameterByName(InstanceId instanceId, const std::string& name, float value) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return false;

    auto paramIt = it->second->paramNameToIndex.find(name);
    if (paramIt == it->second->paramNameToIndex.end()) return false;

    return setParameter(instanceId, paramIt->second, value);
}

float JucePluginHost::getParameter(InstanceId instanceId, int paramIndex) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return 0.0f;

    auto* instance = it->second->instance.get();
    if (instance == nullptr) return 0.0f;

    auto& params = instance->getParameters();
    if (paramIndex < 0 || paramIndex >= params.size()) return 0.0f;

    return params[paramIndex]->getValue();
}

float JucePluginHost::getParameterByName(InstanceId instanceId, const std::string& name) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return 0.0f;

    auto paramIt = it->second->paramNameToIndex.find(name);
    if (paramIt == it->second->paramNameToIndex.end()) return 0.0f;

    return getParameter(instanceId, paramIt->second);
}

std::map<std::string, float> JucePluginHost::getAllParameters(InstanceId instanceId) const {
    std::map<std::string, float> result;
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return result;

    auto* instance = it->second->instance.get();
    if (instance == nullptr) return result;

    auto& params = instance->getParameters();
    for (int i = 0; i < params.size(); ++i) {
        result[params[i]->getName(256).toStdString()] = params[i]->getValue();
    }

    return result;
}

bool JucePluginHost::setBypass(InstanceId instanceId, bool bypass) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return false;

    it->second->bypassed = bypass;

    // Also set bypass parameter if the plugin has one
    if (auto* bp = it->second->instance->getBypassParameter()) {
        bp->setValue(bypass ? 1.0f : 0.0f);
    }

    return true;
}

bool JucePluginHost::isBypassed(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return false;
    return it->second->bypassed;
}

std::vector<uint8_t> JucePluginHost::getPluginState(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return {};

    auto* instance = it->second->instance.get();
    if (instance == nullptr) return {};

    juce::MemoryBlock state;
    instance->getStateInformation(state);

    return std::vector<uint8_t>(
        static_cast<const uint8_t*>(state.getData()),
        static_cast<const uint8_t*>(state.getData()) + state.getSize()
    );
}

bool JucePluginHost::setPluginState(InstanceId instanceId, const std::vector<uint8_t>& state) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return false;

    auto* instance = it->second->instance.get();
    if (instance == nullptr) return false;

    instance->setStateInformation(state.data(), static_cast<int>(state.size()));
    return true;
}

int JucePluginHost::getPluginLatency(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return 0;

    auto* instance = it->second->instance.get();
    if (instance == nullptr) return 0;

    return instance->getLatencySamples();
}

double JucePluginHost::getPluginCpuUsage(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return 0.0;
    return it->second->cpuUsage.load();
}

void JucePluginHost::beginPluginProcessing(InstanceId instanceId) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return;

    it->second->processStartTime = std::chrono::high_resolution_clock::now();
}

void JucePluginHost::endPluginProcessing(InstanceId instanceId) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it == instances_.end()) return;

    auto endTime = std::chrono::high_resolution_clock::now();
    double elapsed = std::chrono::duration<double>(
        endTime - it->second->processStartTime).count();

    // Calculate as percentage of available time
    double availableTime = it->second->blockSize / it->second->sampleRate;
    double usage = (elapsed / availableTime) * 100.0;

    // Smooth the reading
    double current = it->second->cpuUsage.load();
    it->second->cpuUsage.store(current * 0.9 + usage * 0.1);
}

void JucePluginHost::process(InstanceId instanceId,
                             juce::AudioBuffer<float>& buffer,
                             juce::MidiBuffer& midiMessages) {
    PluginEntry* entry = nullptr;

    {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = instances_.find(instanceId);
        if (it == instances_.end()) return;
        entry = it->second.get();
    }

    if (entry == nullptr || entry->instance == nullptr) return;

    // Handle bypass
    if (entry->bypassed) {
        // Pass through - audio buffer unchanged
        return;
    }

    // Process
    beginPluginProcessing(instanceId);
    entry->instance->processBlock(buffer, midiMessages);
    endPluginProcessing(instanceId);
}

// ========================================
// Private helpers
// ========================================

PluginInfo JucePluginHost::extractPluginInfo(const juce::PluginDescription& desc) const {
    PluginInfo info;

    info.uri = desc.createIdentifierString().toStdString();
    info.name = desc.name.toStdString();
    info.author = desc.manufacturerName.toStdString();
    info.brand = desc.manufacturerName.toStdString();
    info.category = desc.category.toStdString();
    info.version = desc.version.toStdString();
    info.license = "";  // Not available in JUCE description

    info.audioInputs = desc.numInputChannels;
    info.audioOutputs = desc.numOutputChannels;
    info.hasMidiInput = desc.isInstrument || desc.wantsMidiInput;
    info.hasMidiOutput = desc.producesMidiOutput;

    // Note: Parameter info requires loading the plugin
    // We can't get it from the description alone

    return info;
}

PluginFormat JucePluginHost::formatFromString(const juce::String& formatName) const {
    if (formatName.containsIgnoreCase("VST3")) return PluginFormat::VST3;
    if (formatName.containsIgnoreCase("AudioUnit") ||
        formatName.containsIgnoreCase("AU")) return PluginFormat::AudioUnit;
    if (formatName.containsIgnoreCase("LV2")) return PluginFormat::LV2;
    if (formatName.containsIgnoreCase("LADSPA")) return PluginFormat::LADSPA;
    return PluginFormat::Unknown;
}

void JucePluginHost::buildParameterMap(PluginEntry& entry) {
    if (entry.instance == nullptr) return;

    auto& params = entry.instance->getParameters();
    for (int i = 0; i < params.size(); ++i) {
        std::string name = params[i]->getName(256).toStdString();
        entry.paramNameToIndex[name] = i;

        // Also add parameter ID as an alias
        if (auto* paramWithID = dynamic_cast<juce::AudioProcessorParameterWithID*>(params[i])) {
            entry.paramNameToIndex[paramWithID->paramID.toStdString()] = i;
        }
    }

    // Build ParameterInfo for the plugin info
    entry.info.parameters.clear();
    for (int i = 0; i < params.size(); ++i) {
        ParameterInfo pinfo;
        pinfo.index = i;
        pinfo.name = params[i]->getName(256).toStdString();
        pinfo.symbol = pinfo.name;  // Use name as symbol
        pinfo.minValue = 0.0f;
        pinfo.maxValue = 1.0f;
        pinfo.defaultValue = params[i]->getDefaultValue();
        pinfo.isToggle = params[i]->isBoolean();
        pinfo.isInteger = params[i]->isDiscrete();
        pinfo.isLogarithmic = false;  // Not available in JUCE

        // Try to get actual range from parameter
        auto range = params[i]->getNormalisableRange();
        if (range.start != range.end) {
            pinfo.minValue = range.start;
            pinfo.maxValue = range.end;
        }

        entry.info.parameters.push_back(pinfo);
    }
}

} // namespace map2
