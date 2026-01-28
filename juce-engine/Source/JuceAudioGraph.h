#pragma once

/**
 * MAP2 Audio Engine - JUCE Audio Graph
 * Signal routing using JUCE AudioProcessorGraph with automatic PDC
 */

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "JucePluginHost.h"
#include "VuMeter.h"
#include "Common.h"

namespace map2 {

/**
 * Sidechain connection description
 */
struct SidechainConnection {
    InstanceId sourcePlugin;
    InstanceId destPlugin;
    int destBusIndex;
};

/**
 * JuceAudioGraph - Plugin signal routing with automatic PDC
 *
 * Provides:
 * - Linear plugin chain management
 * - Automatic plugin delay compensation (JUCE handles this!)
 * - Sidechain routing support
 * - Per-plugin and master VU metering
 * - Latency reporting
 */
class JuceAudioGraph {
public:
    JuceAudioGraph(JucePluginHost& host);
    ~JuceAudioGraph();

    // Prevent copying
    JuceAudioGraph(const JuceAudioGraph&) = delete;
    JuceAudioGraph& operator=(const JuceAudioGraph&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Initialize the graph
     * @param sampleRate Sample rate for processing
     * @param bufferSize Maximum buffer size
     * @param numChannels Number of audio channels
     */
    void initialize(double sampleRate, int bufferSize, int numChannels = 2);

    /**
     * Prepare for playback (call when audio starts)
     */
    void prepareToPlay(double sampleRate, int samplesPerBlock);

    /**
     * Release resources (call when audio stops)
     */
    void releaseResources();

    bool isInitialized() const { return initialized_; }

    // ========================================
    // Chain management
    // ========================================

    /**
     * Add a plugin to the chain
     * @param instanceId Plugin instance from JucePluginHost
     * @param position Position in chain (-1 for end)
     * @return true if successful
     */
    bool addPlugin(InstanceId instanceId, int position = -1);

    /**
     * Remove a plugin from the chain
     */
    bool removePlugin(InstanceId instanceId);

    /**
     * Reorder plugins in the chain
     * @param order New plugin order (all IDs must be in current chain)
     */
    bool reorderPlugins(const std::vector<InstanceId>& order);

    /**
     * Move a single plugin to a new position
     */
    bool movePlugin(InstanceId instanceId, int newPosition);

    /**
     * Get current chain order
     */
    std::vector<InstanceId> getChainOrder() const;

    /**
     * Get plugin position in chain
     * @return Position (0-based), or -1 if not found
     */
    int getPluginPosition(InstanceId instanceId) const;

    /**
     * Get number of plugins in chain
     */
    int getChainSize() const;

    /**
     * Clear all plugins from chain
     */
    void clearChain();

    // ========================================
    // Sidechain routing
    // ========================================

    /**
     * Connect a sidechain
     * @param sourcePlugin Source plugin (audio output)
     * @param destPlugin Destination plugin (sidechain input)
     * @param destSidechainBus Sidechain bus index on destination
     */
    bool connectSidechain(InstanceId sourcePlugin, InstanceId destPlugin, int destSidechainBus = 1);

    /**
     * Disconnect a sidechain
     */
    bool disconnectSidechain(InstanceId destPlugin, int destSidechainBus = 1);

    /**
     * Get all sidechain connections
     */
    std::vector<SidechainConnection> getSidechainConnections() const;

    // ========================================
    // Latency
    // ========================================

    /**
     * Get total chain latency in samples
     * (JUCE AudioProcessorGraph calculates this automatically)
     */
    int getTotalLatency() const;

    /**
     * Get latency in milliseconds
     */
    double getTotalLatencyMs() const;

    /**
     * Get per-plugin latency breakdown
     */
    std::map<InstanceId, int> getPerPluginLatency() const;

    // ========================================
    // Audio processing
    // ========================================

    /**
     * Process audio through the graph
     * @param buffer Audio buffer (modified in place)
     * @param midiBuffer MIDI messages
     */
    void process(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiBuffer);

    /**
     * Process with separate input/output (for compatibility with old API)
     */
    void process(const float* const* inputs, int numInputChannels,
                float** outputs, int numOutputChannels,
                int numSamples);

    // ========================================
    // Metering
    // ========================================

    /**
     * Get input VU levels
     */
    VuLevels getInputVu() const;

    /**
     * Get output VU levels
     */
    VuLevels getOutputVu() const;

    /**
     * Get VU levels for all plugins in chain
     */
    std::map<InstanceId, VuLevels> getPluginVuLevels() const;

    // ========================================
    // Configuration
    // ========================================

    void setSampleRate(double sampleRate);
    double getSampleRate() const { return sampleRate_; }

    void setBufferSize(int bufferSize);
    int getBufferSize() const { return bufferSize_; }

    // ========================================
    // Direct JUCE access
    // ========================================

    juce::AudioProcessorGraph& getGraph() { return *graph_; }
    const juce::AudioProcessorGraph& getGraph() const { return *graph_; }

private:
    JucePluginHost& host_;
    std::unique_ptr<juce::AudioProcessorGraph> graph_;

    bool initialized_ = false;
    double sampleRate_ = DEFAULT_SAMPLE_RATE;
    int bufferSize_ = DEFAULT_BUFFER_SIZE;
    int numChannels_ = 2;

    // Plugin chain
    std::vector<InstanceId> chain_;
    mutable std::mutex chainMutex_;

    // Node mapping
    std::map<InstanceId, juce::AudioProcessorGraph::NodeID> nodeMap_;
    juce::AudioProcessorGraph::NodeID audioInputNode_;
    juce::AudioProcessorGraph::NodeID audioOutputNode_;
    juce::AudioProcessorGraph::NodeID midiInputNode_;
    juce::AudioProcessorGraph::NodeID midiOutputNode_;

    // Sidechain connections
    std::vector<SidechainConnection> sidechainConnections_;

    // Metering
    VuMeter inputMeter_;
    VuMeter outputMeter_;
    std::map<InstanceId, std::unique_ptr<VuMeter>> pluginMeters_;
    mutable std::mutex meterMutex_;

    // Temporary buffers for processing
    juce::AudioBuffer<float> tempBuffer_;
    juce::MidiBuffer tempMidiBuffer_;

    // Helper methods
    void rebuildConnections();
    void createIONodes();
    juce::AudioProcessorGraph::NodeID addPluginNode(InstanceId instanceId);
    void removePluginNode(InstanceId instanceId);
    void updateMeters(const juce::AudioBuffer<float>& buffer, bool isInput);
};

} // namespace map2
