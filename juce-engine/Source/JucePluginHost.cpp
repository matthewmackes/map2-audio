/**
 * MAP2 Audio Engine - JUCE Plugin Host Implementation
 */

#include "JucePluginHost.h"
#include <sstream>
#include <thread>
#include <fstream>
#include <cstdlib>
#include <iostream>
#include <algorithm>
#include <cctype>
#include <string_view>

namespace {

constexpr std::string_view kMap2NativePrefix = "map2://juce/";

bool isMap2NativeUri(const std::string& pluginId) {
    return pluginId.compare(0, kMap2NativePrefix.size(), kMap2NativePrefix) == 0;
}

std::string titleCaseFromSlug(std::string slug) {
    std::replace(slug.begin(), slug.end(), '-', ' ');
    std::replace(slug.begin(), slug.end(), '_', ' ');

    bool upperNext = true;
    for (char& c : slug) {
        if (std::isspace(static_cast<unsigned char>(c))) {
            upperNext = true;
            continue;
        }
        c = upperNext
            ? static_cast<char>(std::toupper(static_cast<unsigned char>(c)))
            : static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        upperNext = false;
    }
    return slug;
}

std::string buildNativeDisplayName(const std::string& uri) {
    if (!isMap2NativeUri(uri)) {
        return "MAP2 Native";
    }

    std::string slug(uri.substr(kMap2NativePrefix.size()));
    const auto slash = slug.find('/');
    if (slash != std::string::npos && slash + 1 < slug.size()) {
        slug = slug.substr(slash + 1);
    }
    if (slug.empty()) {
        slug = "native";
    }
    return titleCaseFromSlug(slug);
}

map2::PluginInfo buildNativePluginInfo(const std::string& uri) {
    map2::PluginInfo info;
    info.uri = uri;
    info.name = buildNativeDisplayName(uri);
    info.author = "MAP2 Audio";
    info.brand = "MAP2";
    info.version = "1.0";
    info.license = "AGPL-3.0-only";
    info.audioInputs = 2;
    info.audioOutputs = 2;
    info.hasMidiInput = true;
    info.hasMidiOutput = false;
    info.format = map2::PluginFormat::Hardware;
    info.formatName = "JUCE Native";

    if (isMap2NativeUri(uri)) {
        std::string category(uri.substr(kMap2NativePrefix.size()));
        const auto slash = category.find('/');
        if (slash != std::string::npos) {
            category = category.substr(0, slash);
        }
        info.category = category.empty() ? "native" : category;
    } else {
        info.category = "native";
    }

    return info;
}

class NativeUriPassthroughProcessor final : public juce::AudioProcessor {
public:
    explicit NativeUriPassthroughProcessor(const juce::String& displayName)
        : juce::AudioProcessor(
            BusesProperties()
                .withInput("Input", juce::AudioChannelSet::stereo(), true)
                .withOutput("Output", juce::AudioChannelSet::stereo(), true))
        , name_(displayName.isNotEmpty() ? displayName : juce::String("MAP2 Native"))
    {}

    const juce::String getName() const override { return name_; }
    void prepareToPlay(double, int) override {}
    void releaseResources() override {}
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override {}
    double getTailLengthSeconds() const override { return 0.0; }

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override {
        const auto& input = layouts.getMainInputChannelSet();
        const auto& output = layouts.getMainOutputChannelSet();
        return !input.isDisabled() && input == output;
    }

    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }

    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock&) override {}
    void setStateInformation(const void*, int) override {}

private:
    juce::String name_;
};

} // namespace

namespace map2 {

// Fix #5: Plugin cache file for lazy loading
static const char* PLUGIN_CACHE_FILE = "/tmp/map2_plugin_cache.xml";

static bool isTruthyEnv(const char* value) {
    if (value == nullptr) {
        return false;
    }
    std::string normalized(value);
    std::transform(
        normalized.begin(),
        normalized.end(),
        normalized.begin(),
        [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return normalized == "1" || normalized == "true" || normalized == "yes" || normalized == "on";
}

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

    // Fix #5: Try to load cached plugin list for instant startup
    loadPluginCache();

    initialized_ = true;
    return true;
}

// Fix #5: Load plugin cache from disk
void JucePluginHost::loadPluginCache() {
    juce::File cacheFile(PLUGIN_CACHE_FILE);
    if (cacheFile.existsAsFile()) {
        auto xml = juce::XmlDocument::parse(cacheFile);
        if (xml != nullptr) {
            knownPlugins_.recreateFromXml(*xml);
        }
    }
}

// Fix #5: Save plugin cache to disk
void JucePluginHost::savePluginCache() {
    auto xml = knownPlugins_.createXml();
    if (xml != nullptr) {
        juce::File cacheFile(PLUGIN_CACHE_FILE);
        xml->writeTo(cacheFile);
    }
}

void JucePluginHost::shutdown() {
    if (!initialized_) return;

    std::lock_guard<std::mutex> lock(mutex_);

    // Fix #5: Save plugin cache before shutdown
    savePluginCache();

    // Unload all plugins (regular and hardware)
    instances_.clear();
    hardwareInstances_.clear();
    initialized_ = false;
}

// Fix #5: Async plugin scanning with callback
void JucePluginHost::scanForPluginsAsync(
    std::function<void(float, const std::string&)> progressCallback,
    std::function<void()> completionCallback) {
    
    // Launch scan in background thread
    std::thread([this, progressCallback, completionCallback]() {
        scanForPlugins(false, progressCallback);
        
        // Save cache after scan
        savePluginCache();
        
        if (completionCallback) {
            completionCallback();
        }
    }).detach();
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
    if (isMap2NativeUri(pluginId)) {
        return buildNativePluginInfo(pluginId);
    }

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

    if (isMap2NativeUri(pluginId)) {
        auto info = buildNativePluginInfo(pluginId);
        auto processor = std::make_unique<NativeUriPassthroughProcessor>(info.name);
        return registerHardwarePlugin(std::move(processor), info);
    }

    // Find the plugin description
    juce::PluginDescription desc;
    bool found = false;
    for (const auto& d : knownPlugins_.getTypes()) {
        if (d.fileOrIdentifier.toStdString() == pluginId ||
            d.name.toStdString() == pluginId ||
            d.createIdentifierString().toStdString() == pluginId) {
            desc = d;
            found = true;
            break;
        }
    }

    if (!found) {
        return INVALID_INSTANCE_ID;
    }

    if (std::getenv("MAP2_PLUGIN_LOAD_DEBUG") != nullptr) {
        std::cerr << "[map2][loadPlugin] pluginId=" << pluginId
                  << " name=" << desc.name
                  << " format=" << desc.pluginFormatName
                  << " file=" << desc.fileOrIdentifier
                  << std::endl;
    }

    // Allow temporary LV2 load quarantine if operators need to isolate issues.
    const bool disableLv2Load = isTruthyEnv(std::getenv("MAP2_DISABLE_LV2_LOAD"));
    const bool looksLv2 = desc.pluginFormatName.containsIgnoreCase("LV2")
        || juce::String(pluginId).startsWithIgnoreCase("LV2-");
    if (looksLv2 && disableLv2Load) {
        return INVALID_INSTANCE_ID;
    }

    // Create the plugin instance
    juce::String errorMessage;
    auto instance = formatManager_.createPluginInstance(
        desc, sampleRate, blockSize, errorMessage);

    if (instance == nullptr) {
        return INVALID_INSTANCE_ID;
    }

    // Configure runtime details. Actual prepare happens when the processing graph
    // prepares playback; preparing at load time is plugin-format fragile.
    instance->setRateAndBufferSizeDetails(sampleRate, blockSize);
    instance->setNonRealtime(true);

    // Create entry
    auto entry = std::make_unique<PluginEntry>();
    entry->id = nextInstanceId_++;
    entry->instance = std::move(instance);
    entry->info = extractPluginInfo(desc);
    entry->format = formatFromString(desc.pluginFormatName);
    entry->sampleRate = sampleRate;
    entry->blockSize = blockSize;

    // Parameter map is populated lazily on demand to avoid format-specific
    // initialization hazards during load.

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
    if (it != instances_.end()) {
        // Release resources
        if (it->second->instance) {
            it->second->instance->releaseResources();
        }

        instances_.erase(it);
        return true;
    }

    auto hwIt = hardwareInstances_.find(instanceId);
    if (hwIt != hardwareInstances_.end()) {
        if (hwIt->second->processor) {
            hwIt->second->processor->releaseResources();
        }

        hardwareInstances_.erase(hwIt);
        return true;
    }

    return false;
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

// ========================================
// Hardware plugin registration
// ========================================

InstanceId JucePluginHost::registerHardwarePlugin(
    std::unique_ptr<juce::AudioProcessor> processor,
    const PluginInfo& info)
{
    if (processor == nullptr) return INVALID_INSTANCE_ID;

    std::lock_guard<std::mutex> lock(mutex_);

    auto entry = std::make_unique<HardwarePluginEntry>();
    entry->id = nextInstanceId_++;
    entry->processor = std::move(processor);
    entry->info = info;
    if (entry->info.format == PluginFormat::Unknown) {
        entry->info.format = PluginFormat::Hardware;
    }
    if (entry->info.formatName.empty()) {
        entry->info.formatName = "Hardware";
    }

    InstanceId id = entry->id;
    hardwareInstances_[id] = std::move(entry);
    return id;
}

juce::AudioProcessor* JucePluginHost::getProcessor(InstanceId instanceId) {
    std::lock_guard<std::mutex> lock(mutex_);

    // Check regular plugins first
    auto it = instances_.find(instanceId);
    if (it != instances_.end())
        return it->second->instance.get();

    // Check hardware plugins
    auto hwIt = hardwareInstances_.find(instanceId);
    if (hwIt != hardwareInstances_.end())
        return hwIt->second->processor.get();

    return nullptr;
}

const juce::AudioProcessor* JucePluginHost::getProcessor(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = instances_.find(instanceId);
    if (it != instances_.end())
        return it->second->instance.get();

    auto hwIt = hardwareInstances_.find(instanceId);
    if (hwIt != hardwareInstances_.end())
        return hwIt->second->processor.get();

    return nullptr;
}

bool JucePluginHost::isHardwarePlugin(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(mutex_);
    return hardwareInstances_.find(instanceId) != hardwareInstances_.end();
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
        if (entry->instance != nullptr) {
            auto& params = entry->instance->getParameters();
            for (int i = 0; i < params.size(); ++i) {
                pi.parameterValues[params[i]->getName(256).toStdString()] = params[i]->getValue();
            }
        }
        result.push_back(pi);
    }

    // Include hardware plugins
    for (const auto& [id, entry] : hardwareInstances_) {
        PluginInstance pi;
        pi.id = id;
        pi.uri = entry->info.uri;
        pi.name = entry->info.name;
        pi.state = PluginState::Active;
        pi.bypassed = entry->bypassed;
        result.push_back(pi);
    }

    return result;
}

PluginFormat JucePluginHost::getPluginFormat(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it != instances_.end())
        return it->second->format;

    auto hwIt = hardwareInstances_.find(instanceId);
    if (hwIt != hardwareInstances_.end())
        return hwIt->second->info.format;

    return PluginFormat::Unknown;
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
    if (it != instances_.end()) {
        it->second->bypassed = bypass;

        // Also set bypass parameter if the plugin has one
        if (auto* bp = it->second->instance->getBypassParameter()) {
            bp->setValue(bypass ? 1.0f : 0.0f);
        }

        return true;
    }

    auto hwIt = hardwareInstances_.find(instanceId);
    if (hwIt != hardwareInstances_.end()) {
        hwIt->second->bypassed = bypass;

        // If the processor exposes a bypass parameter, sync it.
        if (hwIt->second->processor != nullptr) {
            if (auto* bp = hwIt->second->processor->getBypassParameter()) {
                bp->setValue(bypass ? 1.0f : 0.0f);
            }
        }

        return true;
    }

    return false;
}

bool JucePluginHost::isBypassed(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it != instances_.end()) return it->second->bypassed;

    auto hwIt = hardwareInstances_.find(instanceId);
    if (hwIt != hardwareInstances_.end()) return hwIt->second->bypassed;

    return false;
}

std::vector<uint8_t> JucePluginHost::getPluginState(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it != instances_.end()) {
        auto* instance = it->second->instance.get();
        if (instance == nullptr) return {};

        juce::MemoryBlock state;
        instance->getStateInformation(state);
        return std::vector<uint8_t>(
            static_cast<const uint8_t*>(state.getData()),
            static_cast<const uint8_t*>(state.getData()) + state.getSize()
        );
    }

    auto hwIt = hardwareInstances_.find(instanceId);
    if (hwIt != hardwareInstances_.end()) {
        auto* processor = hwIt->second->processor.get();
        if (processor == nullptr) return {};

        juce::MemoryBlock state;
        processor->getStateInformation(state);
        return std::vector<uint8_t>(
            static_cast<const uint8_t*>(state.getData()),
            static_cast<const uint8_t*>(state.getData()) + state.getSize()
        );
    }

    return {};
}

bool JucePluginHost::setPluginState(InstanceId instanceId, const std::vector<uint8_t>& state) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it != instances_.end()) {
        auto* instance = it->second->instance.get();
        if (instance == nullptr) return false;

        instance->setStateInformation(state.data(), static_cast<int>(state.size()));
        return true;
    }

    auto hwIt = hardwareInstances_.find(instanceId);
    if (hwIt != hardwareInstances_.end()) {
        auto* processor = hwIt->second->processor.get();
        if (processor == nullptr) return false;

        processor->setStateInformation(state.data(), static_cast<int>(state.size()));
        return true;
    }

    return false;
}

int JucePluginHost::getPluginLatency(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it != instances_.end()) {
        auto* instance = it->second->instance.get();
        if (instance == nullptr) return 0;
        return instance->getLatencySamples();
    }

    auto hwIt = hardwareInstances_.find(instanceId);
    if (hwIt != hardwareInstances_.end()) {
        auto* processor = hwIt->second->processor.get();
        if (processor == nullptr) return 0;
        return processor->getLatencySamples();
    }

    return 0;
}

double JucePluginHost::getPluginCpuUsage(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = instances_.find(instanceId);
    if (it != instances_.end()) return it->second->cpuUsage.load();

    if (hardwareInstances_.find(instanceId) != hardwareInstances_.end()) {
        return 0.0;
    }

    return 0.0;
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
    juce::AudioProcessor* processor = nullptr;
    bool bypassed = false;

    {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = instances_.find(instanceId);
        if (it != instances_.end()) {
            processor = it->second->instance.get();
            bypassed = it->second->bypassed;
        } else {
            auto hwIt = hardwareInstances_.find(instanceId);
            if (hwIt == hardwareInstances_.end()) return;
            processor = hwIt->second->processor.get();
            bypassed = hwIt->second->bypassed;
        }
    }

    if (processor == nullptr) return;

    // Handle bypass
    if (bypassed) {
        // Pass through - audio buffer unchanged
        return;
    }

    // Process
    beginPluginProcessing(instanceId);
    processor->processBlock(buffer, midiMessages);
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
    // In modern JUCE, use acceptsMidi/producesMidi from description
    info.hasMidiInput = desc.isInstrument;  // Instruments always accept MIDI
    info.hasMidiOutput = desc.isInstrument; // Instruments may produce MIDI

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

        // Try to get actual range from parameter if it's a RangedAudioParameter
        if (auto* rangedParam = dynamic_cast<juce::RangedAudioParameter*>(params[i])) {
            auto range = rangedParam->getNormalisableRange();
            pinfo.minValue = range.start;
            pinfo.maxValue = range.end;
        }

        entry.info.parameters.push_back(pinfo);
    }
}

} // namespace map2
