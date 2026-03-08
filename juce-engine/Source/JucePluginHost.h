#pragma once

/**
 * MAP2 Audio Engine - JUCE Plugin Host
 * Multi-format plugin hosting using JUCE AudioPluginFormatManager
 * Supports VST3, AudioUnit, LV2, LADSPA
 */

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"

namespace map2 {

// PluginFormat is defined in Common.h

/**
 * JucePluginHost - Multi-format plugin hosting
 *
 * Provides:
 * - Plugin discovery and scanning
 * - Multi-format support (VST3, AU, LV2, LADSPA)
 * - Plugin instantiation and lifetime management
 * - State save/restore
 * - Per-plugin CPU and latency tracking
 */
class JucePluginHost {
public:
    JucePluginHost();
    ~JucePluginHost();

    // Prevent copying
    JucePluginHost(const JucePluginHost&) = delete;
    JucePluginHost& operator=(const JucePluginHost&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Initialize the plugin host
     * @param searchPaths Colon-separated list of plugin search paths
     * @return true if successful
     */
    bool initialize(const std::string& searchPaths = "");
    void shutdown();
    bool isInitialized() const { return initialized_; }

    // ========================================
    // Plugin discovery
    // ========================================

    /**
     * Scan for plugins (can be slow)
     * @param rescanAll If true, rescan even known plugins
     * @param progressCallback Optional callback for progress updates
     */
    void scanForPlugins(bool rescanAll = false,
                       std::function<void(float progress, const std::string& pluginName)> progressCallback = nullptr);

    /**
     * Fix #5: Async plugin scanning - non-blocking, calls completion when done
     * @param progressCallback Optional callback for progress updates
     * @param completionCallback Called when scanning is complete
     */
    void scanForPluginsAsync(
        std::function<void(float progress, const std::string& pluginName)> progressCallback = nullptr,
        std::function<void()> completionCallback = nullptr);

    /**
     * Get list of discovered plugins
     * @param format Filter by format (All for no filter)
     */
    std::vector<PluginInfo> discoverPlugins(PluginFormat format = PluginFormat::All) const;

    /**
     * Get detailed info for a specific plugin
     * @param pluginId Plugin identifier (format-specific URI or path)
     */
    std::optional<PluginInfo> getPluginInfo(const std::string& pluginId) const;

    /**
     * Check if a plugin is available
     */
    bool isPluginAvailable(const std::string& pluginId) const;

    // ========================================
    // Plugin instantiation
    // ========================================

    /**
     * Load and instantiate a plugin
     * @param pluginId Plugin identifier
     * @param sampleRate Sample rate for processing
     * @param blockSize Maximum block size
     * @return Instance ID, or INVALID_INSTANCE_ID on failure
     */
    InstanceId loadPlugin(const std::string& pluginId,
                         double sampleRate,
                         int blockSize);

    /**
     * Unload a plugin instance
     */
    bool unloadPlugin(InstanceId instanceId);

    /**
     * Get plugin instance
     */
    juce::AudioPluginInstance* getInstance(InstanceId instanceId);
    const juce::AudioPluginInstance* getInstance(InstanceId instanceId) const;

    /**
     * Get all loaded plugin instances
     */
    std::vector<PluginInstance> getLoadedPlugins() const;

    /**
     * Get plugin format for an instance
     */
    PluginFormat getPluginFormat(InstanceId instanceId) const;

    // ========================================
    // Parameter control
    // ========================================

    /**
     * Set parameter value
     * @param instanceId Plugin instance
     * @param paramIndex Parameter index
     * @param value Normalized value (0.0 - 1.0)
     */
    bool setParameter(InstanceId instanceId, int paramIndex, float value);

    /**
     * Set parameter by name/symbol
     */
    bool setParameterByName(InstanceId instanceId, const std::string& name, float value);

    /**
     * Get parameter value
     */
    float getParameter(InstanceId instanceId, int paramIndex) const;
    float getParameterByName(InstanceId instanceId, const std::string& name) const;

    /**
     * Get all parameter values for a plugin
     */
    std::map<std::string, float> getAllParameters(InstanceId instanceId) const;

    // ========================================
    // Bypass control
    // ========================================

    bool setBypass(InstanceId instanceId, bool bypass);
    bool isBypassed(InstanceId instanceId) const;

    // ========================================
    // State management
    // ========================================

    /**
     * Get plugin state as binary data
     */
    std::vector<uint8_t> getPluginState(InstanceId instanceId) const;

    /**
     * Restore plugin state from binary data
     */
    bool setPluginState(InstanceId instanceId, const std::vector<uint8_t>& state);

    // ========================================
    // Latency and CPU tracking
    // ========================================

    /**
     * Get plugin's reported latency in samples
     */
    int getPluginLatency(InstanceId instanceId) const;

    /**
     * Get plugin CPU usage (call after processing)
     */
    double getPluginCpuUsage(InstanceId instanceId) const;

    /**
     * Mark start of plugin processing (for CPU measurement)
     */
    void beginPluginProcessing(InstanceId instanceId);

    /**
     * Mark end of plugin processing (for CPU measurement)
     */
    void endPluginProcessing(InstanceId instanceId);

    // ========================================
    // Hardware plugin registration
    // ========================================

    /**
     * Register an external hardware effect as a managed plugin.
     * Unlike loadPlugin(), this does not use the format scanner —
     * the caller provides a fully constructed AudioProcessor.
     * @param processor Owned AudioProcessor (e.g., LexiconHardwareProcessor)
     * @param info Metadata for the hardware effect
     * @return Instance ID, or INVALID_INSTANCE_ID on failure
     */
    InstanceId registerHardwarePlugin(std::unique_ptr<juce::AudioProcessor> processor,
                                      const PluginInfo& info);

    /**
     * Get an AudioProcessor by instance ID.
     * Works for both regular plugins and hardware plugins.
     */
    juce::AudioProcessor* getProcessor(InstanceId instanceId);
    const juce::AudioProcessor* getProcessor(InstanceId instanceId) const;

    /**
     * Check if an instance is a hardware plugin
     */
    bool isHardwarePlugin(InstanceId instanceId) const;

    // ========================================
    // Audio processing
    // ========================================

    /**
     * Process audio through a plugin
     * @param instanceId Plugin instance
     * @param buffer Audio buffer (modified in place)
     * @param midiMessages MIDI messages (modified in place)
     */
    void process(InstanceId instanceId,
                juce::AudioBuffer<float>& buffer,
                juce::MidiBuffer& midiMessages);

    // ========================================
    // Direct JUCE access
    // ========================================

    juce::AudioPluginFormatManager& getFormatManager() { return formatManager_; }
    juce::KnownPluginList& getKnownPlugins() { return knownPlugins_; }

private:
    // Internal plugin entry
    struct PluginEntry {
        InstanceId id = INVALID_INSTANCE_ID;
        std::unique_ptr<juce::AudioPluginInstance> instance;
        PluginInfo info;
        PluginFormat format = PluginFormat::Unknown;
        bool bypassed = false;

        // CPU measurement
        std::chrono::high_resolution_clock::time_point processStartTime;
        std::atomic<double> cpuUsage{0.0};
        double sampleRate = 48000.0;
        int blockSize = 256;

        // Parameter name to index mapping
        std::map<std::string, int> paramNameToIndex;
    };

    bool initialized_ = false;
    juce::AudioPluginFormatManager formatManager_;
    juce::KnownPluginList knownPlugins_;

    std::map<InstanceId, std::unique_ptr<PluginEntry>> instances_;
    std::atomic<InstanceId> nextInstanceId_{1};
    mutable std::mutex mutex_;

    std::vector<std::string> searchPaths_;

    // Hardware plugins (AudioProcessor, not AudioPluginInstance)
    struct HardwarePluginEntry {
        InstanceId id = INVALID_INSTANCE_ID;
        std::unique_ptr<juce::AudioProcessor> processor;
        PluginInfo info;
        bool bypassed = false;
    };
    std::map<InstanceId, std::unique_ptr<HardwarePluginEntry>> hardwareInstances_;

    // Helper methods
    PluginInfo extractPluginInfo(const juce::PluginDescription& desc) const;
    PluginFormat formatFromString(const juce::String& formatName) const;
    void buildParameterMap(PluginEntry& entry);

    // Fix #5: Plugin cache management
    void loadPluginCache();
    void savePluginCache();
};

} // namespace map2
