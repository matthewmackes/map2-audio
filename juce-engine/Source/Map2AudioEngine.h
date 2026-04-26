#pragma once

/**
 * MAP2 Audio Engine - Main Engine Class
 * Complete audio processing system using JUCE framework
 * Version 2.0 - Full JUCE Integration
 */

#include "Common.h"
#include "JuceAudioIO.h"
#include "JucePluginHost.h"
#include "JuceAudioGraph.h"
#include "ConvolutionProcessor.h"
#include "DynamicsProcessor.h"
#include "FilterProcessor.h"
#include "SpectrumAnalyzer.h"
#include "LufsMeter.h"
#include "PhaseCorrelation.h"
#include "CPUMonitor.h"
#include "MidiHandler.h"
#include "VuMeter.h"
#include "ParameterBridge.h"
#include "SnapshotManager.h"

#ifdef HAS_NAM
#include "NAMProcessor.h"
#endif

#ifdef HAS_AVDECC
#include "AvdeccController.h"
#endif

#ifdef HAS_AVB
namespace Map2Audio {
class AvbAudioIODevice;
}
#include "TesiraAvbNode.h"
#endif

#include "ChorusProcessor.h"
#include "PhaserProcessor.h"
#include "PitchShifterProcessor.h"
#include "DelayProcessor.h"
#include "IntelliFX8VoiceChorusProcessor.h"
#include "BossXS1PolyShifterProcessor.h"
#include "ShoeGazeProcessor.h"
#include "LexiLoveProcessor.h"
#include "H3000Processor.h"
#include "Peavey5150Processor.h"
#include "TweedBassmanProcessor.h"
#include "PassionFXProcessor.h"
#include "DrumMachine/DrumMachineProcessor.h"
#include "DrumMachine/DrumSequencer.h"
#include "DrumMachine/DrumMachineGraphAdapter.h"
#include "SynthForge/SynthForgeProcessor.h"
#include "SynthForge/SynthForgeGraphAdapter.h"
#include "LexiconHardwareProcessor.h"

#include <juce_audio_basics/juce_audio_basics.h>
#include <thread>
#include <atomic>
#include <array>
#include <chrono>
#include <cstring>
#include <map>
#include <memory>
#include <mutex>
#include <vector>

namespace map2 {

class Map2AudioEngine {
public:
    enum class InputChannelMode {
        MonoLeft = 0,
        MonoRight = 1,
        Stereo = 2,
    };

    Map2AudioEngine();
    ~Map2AudioEngine();

    // Prevent copying
    Map2AudioEngine(const Map2AudioEngine&) = delete;
    Map2AudioEngine& operator=(const Map2AudioEngine&) = delete;

    // ========================================
    // Lifecycle
    // ========================================

    bool initialize(const std::string& configFile = "");
    void shutdown();
    bool isRunning() const { return initialized_; }
    std::string getVersion() const { return ENGINE_VERSION; }

    // ========================================
    // System Info
    // ========================================

    struct SystemInfo {
        std::string version;
        double sampleRate;
        int bufferSize;
        std::string audioDevice;
        float inputGainDb;
        float outputGainDb;
        std::string lv2Path;
        bool running;
        bool audioRunning;
        int pluginCount;
        bool midiEnabled;
        int totalLatencySamples;
        double totalLatencyMs;
    };
    SystemInfo getSystemInfo() const;

    // ========================================
    // Audio Control
    // ========================================

    bool startAudio();
    bool stopAudio();
    bool isAudioRunning() const { return audioRunning_; }

    // ========================================
    // AVB Stream Lifecycle (Phase 0 Contract)
    // ========================================

    struct AvbStreamRuntimeConfig {
        std::string streamId;
        std::string direction;  // "talker" | "listener"
        int channels = 2;
        int sampleRate = 48000;
        int bufferSize = 256;
        std::string interfaceName;
        std::string destMac;
        int presentationOffsetUs = 2000;
        int priority = 3;
    };

    struct AvbStreamRuntimeStats {
        uint64_t framesSent = 0;
        uint64_t framesReceived = 0;
        uint64_t sendErrors = 0;
        uint64_t receiveErrors = 0;
        uint64_t underruns = 0;
        uint64_t overruns = 0;
        uint64_t timestampErrors = 0;
        uint64_t sequenceErrors = 0;
        uint64_t sequenceGapEvents = 0;
        uint64_t timestampSkewEvents = 0;
        uint64_t decodeErrors = 0;
        int64_t maxTimestampSkewNs = 0;
        uint64_t bytesTransferred = 0;
        int64_t maxLatencyNs = 0;
        int64_t minLatencyNs = 0;
    };
#ifdef BUILD_AVB_TESTS
    enum class AvbStreamLifecycleState {
        Unknown = 0,
        Created,
        Running,
        Stopped,
        Error
    };
#endif

    struct AvbInterfaceInfo {
        std::string interfaceName;
        bool available = false;
        bool avbEnabled = false;
        bool interfaceExists = false;
        bool ptpReady = false;
        std::string error;
    };

    struct AvbDiscoveredDeviceInfo {
        std::string endpointId;
        std::string deviceName;
        std::string direction;   // "talker" | "listener"
        std::string deviceType;  // "map2" | "avdecc" | "unknown"
        std::string nodeAddress;
        std::string host;
        std::string audioFormat = "24-bit PCM";
        int channels = 2;
        int sampleRate = 48000;
        bool available = true;
    };

    bool isAvbAvailable() const;
    bool createAvbStream(const AvbStreamRuntimeConfig& config, std::string* error = nullptr);
#ifdef BUILD_AVB_TESTS
    bool createAvbStreamForTest(const std::string& streamId);
#endif
    bool startAvbStream(const std::string& streamId, std::string* error = nullptr);
    bool stopAvbStream(const std::string& streamId, std::string* error = nullptr);
    bool deleteAvbStream(const std::string& streamId, std::string* error = nullptr);
    std::optional<AvbStreamRuntimeStats> getAvbStreamStats(
        const std::string& streamId,
        std::string* error = nullptr) const;
    bool resetAvbStreamStats(const std::string& streamId, std::string* error = nullptr);
    std::vector<std::string> listAvbStreams() const;
#ifdef BUILD_AVB_TESTS
    std::optional<AvbStreamLifecycleState> getAvbStreamStateForTest(
        const std::string& streamId) const;
#endif
    std::vector<std::string> getAvbDeviceNames();
    int getAvbDeviceCount();
    AvbInterfaceInfo getAvbInterfaceInfo(const std::string& interfaceName);
    bool setAvbDiscoveredDevices(
        const std::vector<AvbDiscoveredDeviceInfo>& devices,
        std::string* error = nullptr);
    std::vector<AvbDiscoveredDeviceInfo> getAvbDiscoveredDevices() const;
    void clearAvbDiscoveredDevices();

    // ========================================
    // External Effects Loops (Tesira AVB)
    // ========================================

    struct ExternalLoopDefinition {
        std::string loopId;
        std::string name;
        int channels = 2;
        std::string topology = "serial_insert";
        std::string sendEndpointId;
        std::string returnEndpointId;
        double targetAddedLatencyMs = 0.5;
        double measuredAddedLatencyMs = 0.0;
        int compensationSamples = 0;
        bool bypass = false;
    };

    struct ExternalLoopInsertion {
        std::string insertionId;
        std::string loopId;
        int slotIndex = 0;
        bool enabled = true;
        std::string mode = "serial_insert";
        float blendPct = 100.0f;
        float sendGainDb = 0.0f;
        float returnGainDb = 0.0f;
        int crossfadeMs = 12;
        std::vector<float> bandSplitHz;
    };

    struct ExternalLoopMetrics {
        std::string loopId;
        bool active = false;
        bool bypass = false;
        int channels = 0;
        double targetAddedLatencyMs = 0.5;
        double measuredAddedLatencyMs = 0.0;
        int compensationSamples = 0;
    };

    bool setExternalLoopDefinitions(const std::vector<ExternalLoopDefinition>& loops);
    bool setChainLoopInsertions(int chainId, const std::vector<ExternalLoopInsertion>& insertions);
    bool setChainDryWetMix(int chainId, float dryWetMix);
    bool setChainGain(int chainId, float gainLinear);
    bool setChainMute(int chainId, bool muted);
    bool setChainSolo(int chainId, bool solo);
    bool setLoopBypass(const std::string& loopId, bool bypass);
    bool calibrateLoop(const std::string& loopId, int calibrationFrames = 0);
    std::vector<ExternalLoopMetrics> getLoopMetrics(const std::string& loopId = "") const;

    // ========================================
    // Configuration
    // ========================================

    void setSampleRate(double rate);
    double getSampleRate() const { return sampleRate_; }

    void setBufferSize(int size);
    int getBufferSize() const { return bufferSize_; }
    
    // Batch prepare all processors (reduces redundant initialization)
    void prepareAllProcessors(double sampleRate, int bufferSize, int numChannels);

    void setAudioDevice(const std::string& device);
    std::string getAudioDevice() const { return audioDevice_; }

    void setLv2Path(const std::string& path);
    std::string getLv2Path() const { return lv2Path_; }

    void setNumInputChannels(int channels);
    int getNumInputChannels() const { return numInputChannels_; }

    void setNumOutputChannels(int channels);
    int getNumOutputChannels() const { return numOutputChannels_; }

    void setInputChannelMode(int mode);
    int getInputChannelMode() const { return static_cast<int>(inputChannelMode_); }
    bool setInputGainDb(float db);
    float getInputGainDb() const { return inputGainDb_.load(std::memory_order_acquire); }
    bool setOutputGainDb(float db);
    float getOutputGainDb() const { return outputGainDb_.load(std::memory_order_acquire); }

    bool setMonitoringOutputIndex(int index);
    int getMonitoringOutputIndex() const;

    // ========================================
    // Plugin Management
    // ========================================

    std::vector<PluginInfo> listPlugins() const;
    std::vector<PluginInfo> listPlugins(PluginFormat format) const;
    std::optional<PluginInfo> getPluginInfo(const std::string& uri) const;

    InstanceId loadPlugin(const std::string& uri);
    bool unloadPlugin(InstanceId instanceId);

    void scanForPlugins(bool rescanAll = false);

    // ========================================
    // Chain Management
    // ========================================

    std::vector<InstanceId> getChainOrder() const;
    void clearChain();
    bool replaceChain(const std::vector<InstanceId>& order);
    bool replaceChainWithSpillover(const std::vector<InstanceId>& order);
    bool addToChain(InstanceId instanceId, int position = -1);
    bool removeFromChain(InstanceId instanceId);
    bool reorderChain(const std::vector<InstanceId>& order);
    bool prewarmPluginNode(InstanceId instanceId);
    bool applyRoutingTopology(const JuceAudioGraph::RoutingTopologySpec& spec);
    bool replaceSnapshotExpressionMappings(const std::vector<std::map<std::string, juce::var>>& entries);
    bool triggerParallelABSwitch(int groupId, int branchIndex);
    bool copyParallelBranchTap(int groupId, int branchIndex, juce::AudioBuffer<float>& dest, int numSamples) const;

    struct SpilloverChainState {
        int id = 0;
        std::vector<InstanceId> instanceIds;
        int64_t remainingSamples = 0;
        bool expired = false;
        double estimatedTailSeconds = 0.0;
    };

    std::vector<SpilloverChainState> getSpilloverChainStates() const;
    int getIndependentGraphCrossfadeCount() const;

    // ========================================
    // Lexicon MPX-1 Hardware Plugin
    // ========================================

    /**
     * Load the Lexicon MPX-1 as a hardware plugin in the graph.
     * Singleton: returns existing instance ID if already loaded.
     * @return Instance ID, or INVALID_INSTANCE_ID on failure
     */
    InstanceId loadLexiconPlugin();
    bool unloadLexiconPlugin();
    bool isLexiconLoaded() const;
    InstanceId getLexiconInstanceId() const;

    /**
     * Measure S/PDIF round-trip latency via impulse response.
     * Updates the processor's reported latency for JUCE PDC.
     */
    bool calibrateLexiconLatency();

    // ========================================
    // Sidechain Routing (NEW)
    // ========================================

    bool connectSidechain(InstanceId source, InstanceId dest, int destBus = 1);
    bool disconnectSidechain(InstanceId dest, int destBus = 1);
    std::vector<SidechainConnection> getSidechainConnections() const;

    // ========================================
    // Parameters
    // ========================================

    bool setParameter(InstanceId instanceId, int paramIndex, float value);
    bool setParameterByName(InstanceId instanceId, const std::string& name, float value);
    float getParameter(InstanceId instanceId, int paramIndex) const;
    float getParameterByName(InstanceId instanceId, const std::string& name) const;
    bool setBypass(InstanceId instanceId, bool bypass);

    // ========================================
    // State Authority Graph Documents
    // ========================================

    std::string saveGraphDocument(const std::string& seedGraphDocumentJson = "") const;
    bool loadGraphDocument(
        const std::string& graphDocumentJson,
        bool useIndependentCrossfade = false,
        int maxCrossfadeMs = 500);

    // T2454-B2: per-call adoption stats from the most-recent loadGraphDocument.
    // - pluginsTotal: total plugin slots in the requested document
    // - pluginsAdopted: slots that reused an already-loaded instance (including
    //   pre-staged ones from SnapshotPreloadOrchestrator)
    // - pluginsFreshlyLoaded: slots that required a fresh loadPlugin() call
    // The orchestrator's claim() carries the staged_instance_ids; this struct
    // tells the FSM how many of them the engine actually adopted.
    struct GraphLoadStats {
        int pluginsTotal = 0;
        int pluginsAdopted = 0;
        int pluginsFreshlyLoaded = 0;
    };
    GraphLoadStats getLastGraphLoadStats() const;

    bool clearMorphEndpoints();
    bool setMorphEndpoint(const std::string& cornerId, const std::string& graphDocumentJson);
    bool setMorphPosition(float x, float y);
    std::string getMorphStateJson() const;

    // ========================================
    // Snapshots
    // ========================================

    int getCurrentSnapshot() const;
    bool loadSnapshot(int snapshotId);
    bool saveSnapshot(int snapshotId, const std::string& name = "");
    std::vector<Snapshot> listSnapshots() const;

    // ========================================
    // MIDI
    // ========================================

    bool enableMidi(bool enable);
    bool isMidiEnabled() const;
    std::vector<std::string> getMidiDevices() const;
    bool setMidiDevice(const std::string& device);
    bool injectMidiNoteOn(int channel, int note, int velocity);
    bool injectMidiNoteOff(int channel, int note, int velocity = 0);

    // ========================================
    // VU Meters (Legacy)
    // ========================================

    VuLevels getVuLevels() const;
    std::map<InstanceId, VuLevels> getPluginVuLevels() const;

    // ========================================
    // Advanced Metering (NEW)
    // ========================================

    // Spectrum Analysis
    SpectrumAnalyzer::SpectrumData getSpectrum() const;
    std::vector<float> getSpectrumMagnitudes() const;
    std::vector<float> getSpectrumFrequencies() const;

    // LUFS Loudness
    LufsLevels getLufsLevels() const;
    void resetIntegratedLoudness();

    // Phase Correlation
    float getPhaseCorrelation() const;
    float getStereoBalance() const;
    float getStereoWidth() const;

    // ========================================
    // CPU Monitoring (NEW)
    // ========================================

    CPUMetrics getCpuMetrics() const;
    double getTotalCpu() const;
    double getPluginCpu(InstanceId instanceId) const;
    int getXRunCount() const;

    // ========================================
    // Latency (NEW)
    // ========================================

    int getTotalLatencySamples() const;
    double getTotalLatencyMs() const;
    std::map<InstanceId, int> getPerPluginLatency() const;

    // ========================================
    // Audio I/O Diagnostics (NEW)
    // ========================================

    /**
     * Get comprehensive audio I/O statistics including:
     * - Callback timing jitter (xrun detection)
     * - Budget utilization
     * - Connection health
     * - Device-reported latency
     */
    JuceAudioIO::AudioStats getAudioIOStats() const;

    /**
     * Get connection health for the audio device
     */
    JuceAudioIO::ConnectionHealth getConnectionHealth() const;

    /**
     * Get xrun history (timestamps of recent xruns)
     */
    std::vector<int64_t> getXrunHistory() const;

    /**
     * Reset xrun counter without resetting other stats
     */
    void resetXrunCounter();

    /**
     * Reset full audio I/O runtime stats (xrun/jitter/duration counters)
     */
    void resetAudioIOStats();

    /**
     * Set measured round-trip latency (from external loopback test)
     */
    void setMeasuredRoundTripLatency(double ms);

    /**
     * Get device-reported total latency in ms
     */
    double getDeviceReportedLatencyMs() const;

    struct PlatformEventRecord {
        std::string kind;
        std::string severity;
        std::string title;
        std::string message;
        uint64_t sequence = 0;
        int64_t timestampMs = 0;
        uint64_t droppedCount = 0;
    };

    std::vector<PlatformEventRecord> drainPlatformEvents(int maxEvents = 128);
    uint64_t getDroppedPlatformEventCount() const;

    // ========================================
    // Convolution (NEW - replaces Python ReevR)
    // ========================================

    bool loadCabinetIR(const std::string& path);
    bool loadReverbIR(const std::string& path);
    void unloadCabinetIR();
    void unloadReverbIR();
    void setCabinetMix(float mix);
    void setReverbMix(float mix);
    void setCabinetBypass(bool bypass);
    void setReverbBypass(bool bypass);
    ConvolutionProcessor::IRInfo getCabinetIRInfo() const;
    ConvolutionProcessor::IRInfo getReverbIRInfo() const;

    // ========================================
    // Dynamics Processing (NEW)
    // ========================================

    // Compressor
    void setCompressorThreshold(float dB);
    void setCompressorRatio(float ratio);
    void setCompressorAttack(float ms);
    void setCompressorRelease(float ms);
    void setCompressorKnee(float dB);
    void setCompressorMakeupGain(float dB);
    void setCompressorAutoMakeup(bool enabled);
    void setCompressorBypass(bool bypass);
    DynamicsProcessor::Parameters getCompressorParameters() const;
    void setCompressorParameters(const DynamicsProcessor::Parameters& params);
    DynamicsProcessor::Metering getCompressorMetering() const;

    // Limiter
    void setLimiterThreshold(float dB);
    void setLimiterRelease(float ms);
    void setLimiterBypass(bool bypass);
    DynamicsProcessor::Parameters getLimiterParameters() const;
    DynamicsProcessor::Metering getLimiterMetering() const;

    // Noise Gate
    void setGateThreshold(float dB);
    void setGateRatio(float ratio);
    void setGateAttack(float ms);
    void setGateRelease(float ms);
    void setGateBypass(bool bypass);
    DynamicsProcessor::Parameters getGateParameters() const;
    DynamicsProcessor::Metering getGateMetering() const;

    // Combined dynamics access
    DynamicsProcessor& getCompressor() { return compressor_; }
    DynamicsProcessor& getLimiter() { return limiter_; }
    DynamicsProcessor& getGate() { return gate_; }

    // ========================================
    // EQ / Filter Processing (NEW)
    // ========================================

    // Band control
    void setEQBand(int bandIndex, const FilterProcessor::BandParameters& params);
    void setEQBandFrequency(int bandIndex, float hz);
    void setEQBandGain(int bandIndex, float dB);
    void setEQBandQ(int bandIndex, float q);
    void setEQBandType(int bandIndex, FilterProcessor::FilterType type);
    void setEQBandEnabled(int bandIndex, bool enabled);
    FilterProcessor::BandParameters getEQBand(int bandIndex) const;

    // Global EQ control
    void setEQOutputGain(float dB);
    float getEQOutputGain() const;
    void setEQBypass(bool bypass);
    bool isEQBypassed() const;

    // Full parameter access
    FilterProcessor::Parameters getEQParameters() const;
    void setEQParameters(const FilterProcessor::Parameters& params);

    // Frequency response
    std::vector<float> getEQFrequencyResponse(const std::vector<float>& frequencies) const;

    // Direct access
    FilterProcessor& getEQ() { return eq_; }

    // ========================================
    // Neural Amp Modeler (NEW - RT-safe)
    // ========================================

    /**
     * Check if NAM support is available
     */
    bool isNAMAvailable() const;

    /**
     * Load a NAM model (.nam file)
     * @param path Path to .nam model file
     * @return true if loading started
     */
    bool loadNAMModel(const std::string& path);

    /**
     * Unload current NAM model
     */
    void unloadNAMModel();

    /**
     * Check if NAM model is loaded
     */
    bool isNAMModelLoaded() const;

    /**
     * Check if NAM model is currently loading
     */
    bool isNAMLoading() const;

    /**
     * Get NAM model information
     */
    NAMModelInfo getNAMModelInfo() const;

    /**
     * Set NAM input gain (dB)
     */
    void setNAMInputGain(float dB);

    /**
     * Get NAM input gain (dB)
     */
    float getNAMInputGain() const;

    /**
     * Set NAM output gain (dB)
     */
    void setNAMOutputGain(float dB);

    /**
     * Get NAM output gain (dB)
     */
    float getNAMOutputGain() const;

    /**
     * Set NAM bypass
     */
    void setNAMBypass(bool bypass);

    /**
     * Check if NAM is bypassed
     */
    bool isNAMBypassed() const;

    /**
     * Enable/disable NAM output normalization
     */
    void setNAMNormalize(bool normalize);

    /**
     * Check if NAM normalization is enabled
     */
    bool isNAMNormalized() const;

    /**
     * Get NAM input metering level (dB)
     */
    float getNAMInputLevel() const;

    /**
     * Get NAM output metering level (dB)
     */
    float getNAMOutputLevel() const;

#ifdef HAS_NAM
    /**
     * Direct NAM processor access
     */
    NAMProcessor& getNAMProcessor() { return namProcessor_; }
#endif

    // ========================================
    // Chorus Processing (NEW)
    // ========================================

    void setChorusRate(float hz);
    float getChorusRate() const;
    void setChorusDepth(float depth);
    float getChorusDepth() const;
    void setChorusCentreDelay(float ms);
    float getChorusCentreDelay() const;
    void setChorusFeedback(float feedback);
    float getChorusFeedback() const;
    void setChorusMix(float mix);
    float getChorusMix() const;
    void setChorusSpread(float spread);
    float getChorusSpread() const;
    void setChorusBypass(bool bypass);
    bool isChorusBypassed() const;
    ChorusProcessor::Parameters getChorusParameters() const;
    void setChorusParameters(const ChorusProcessor::Parameters& params);
    ChorusProcessor::Metering getChorusMetering() const;
    ChorusProcessor& getChorus() { return chorus_; }

    // ========================================
    // Phaser Processing (NEW)
    // ========================================

    void setPhaserRate(float hz);
    float getPhaserRate() const;
    void setPhaserDepth(float depth);
    float getPhaserDepth() const;
    void setPhaserCentreFrequency(float hz);
    float getPhaserCentreFrequency() const;
    void setPhaserFeedback(float feedback);
    float getPhaserFeedback() const;
    void setPhaserMix(float mix);
    float getPhaserMix() const;
    void setPhaserBypass(bool bypass);
    bool isPhaserBypassed() const;
    PhaserProcessor::Parameters getPhaserParameters() const;
    void setPhaserParameters(const PhaserProcessor::Parameters& params);
    PhaserProcessor::Metering getPhaserMetering() const;
    PhaserProcessor& getPhaser() { return phaser_; }

    // ========================================
    // Pitch Shifter / EVH--IN-STYLE Harmonizer (NEW)
    // ========================================

    void setPitchShifterPitchL(float cents);
    float getPitchShifterPitchL() const;
    void setPitchShifterPitchR(float cents);
    float getPitchShifterPitchR() const;
    void setPitchShifterDelayL(float ms);
    float getPitchShifterDelayL() const;
    void setPitchShifterDelayR(float ms);
    float getPitchShifterDelayR() const;
    void setPitchShifterFeedback(float feedback);
    float getPitchShifterFeedback() const;
    void setPitchShifterMix(float percent);
    float getPitchShifterMix() const;
    void setPitchShifterSpread(float percent);
    float getPitchShifterSpread() const;
    void setPitchShifterPreset(PitchShifterProcessor::Preset preset);
    PitchShifterProcessor::Preset getPitchShifterPreset() const;
    void setPitchShifterBypass(bool bypass);
    bool isPitchShifterBypassed() const;
    PitchShifterProcessor::Parameters getPitchShifterParameters() const;
    void setPitchShifterParameters(const PitchShifterProcessor::Parameters& params);
    PitchShifterProcessor::Metering getPitchShifterMetering() const;
    PitchShifterProcessor& getPitchShifter() { return pitchShifter_; }

    // ========================================
    // IntelliFX 8-Voice Chorus (NEW)
    // ========================================

    // Voice parameters
    void setIntelliFXVoiceLevel(int voice, float dB);
    float getIntelliFXVoiceLevel(int voice) const;
    void setIntelliFXVoicePan(int voice, float pan);
    float getIntelliFXVoicePan(int voice) const;
    void setIntelliFXVoiceDelay(int voice, float ms);
    float getIntelliFXVoiceDelay(int voice) const;
    void setIntelliFXVoiceDepth(int voice, float depth);
    float getIntelliFXVoiceDepth(int voice) const;
    void setIntelliFXVoiceRate(int voice, float rate);
    float getIntelliFXVoiceRate(int voice) const;
    IntelliFX8VoiceChorusProcessor::VoiceParameters getIntelliFXVoiceParameters(int voice) const;
    void setIntelliFXVoiceParameters(int voice, const IntelliFX8VoiceChorusProcessor::VoiceParameters& params);

    // Global mixer
    void setIntelliFXChorusLevel(float dB);
    float getIntelliFXChorusLevel() const;
    void setIntelliFXDirectLevelL(float dB);
    float getIntelliFXDirectLevelL() const;
    void setIntelliFXDirectLevelR(float dB);
    float getIntelliFXDirectLevelR() const;
    void setIntelliFXRegenL(float dB);
    float getIntelliFXRegenL() const;
    void setIntelliFXRegenR(float dB);
    float getIntelliFXRegenR() const;

    // HUSH
    void setIntelliFXHushEnabled(bool enabled);
    bool isIntelliFXHushEnabled() const;
    void setIntelliFXHushThreshold(float dB);
    float getIntelliFXHushThreshold() const;
    void setIntelliFXHushReleaseRate(float ms);
    float getIntelliFXHushReleaseRate() const;
    IntelliFX8VoiceChorusProcessor::HushParameters getIntelliFXHushParameters() const;
    void setIntelliFXHushParameters(const IntelliFX8VoiceChorusProcessor::HushParameters& params);

    // Master control
    void setIntelliFXBypass(bool bypass);
    bool isIntelliFXBypassed() const;

    // Bulk parameters
    IntelliFX8VoiceChorusProcessor::Parameters getIntelliFXParameters() const;
    void setIntelliFXParameters(const IntelliFX8VoiceChorusProcessor::Parameters& params);

    // Presets
    static int getIntelliFXNumPresets();
    static IntelliFX8VoiceChorusProcessor::PresetInfo getIntelliFXPresetInfo(int index);
    void loadIntelliFXPreset(int index);
    int getIntelliFXCurrentPreset() const;

    // Metering
    IntelliFX8VoiceChorusProcessor::Metering getIntelliFXMetering() const;

    // Direct access
    IntelliFX8VoiceChorusProcessor& getIntelliFX() { return intellifx_; }

    // ========================================
    // Stereo Delay
    // ========================================

    void setDelayTimeL(float ms);
    float getDelayTimeL() const;
    void setDelayTimeR(float ms);
    float getDelayTimeR() const;
    void setDelayFeedback(float percent);
    float getDelayFeedback() const;
    void setDelayMix(float percent);
    float getDelayMix() const;
    void setDelayTempo(float bpm);
    float getDelayTempo() const;
    void setDelayTempoSyncL(int division);
    int getDelayTempoSyncL() const;
    void setDelayTempoSyncR(int division);
    int getDelayTempoSyncR() const;
    void setDelayTap1Level(float percent);
    void setDelayTap2Level(float percent);
    void setDelayTap2Ratio(float ratio);
    void setDelayTap3Level(float percent);
    void setDelayTap3Ratio(float ratio);
    void setDelayTap4Level(float percent);
    void setDelayTap4Ratio(float ratio);
    void setDelayStereoMode(int mode);
    int getDelayStereoMode() const;
    void setDelayStereoSpread(float percent);
    float getDelayStereoSpread() const;
    void setDelayPan(float pan);
    float getDelayPan() const;
    void setDelayModRate(float hz);
    float getDelayModRate() const;
    void setDelayModDepth(float percent);
    float getDelayModDepth() const;
    void setDelayModWaveform(int waveform);
    int getDelayModWaveform() const;
    void setDelayLowCut(float hz);
    float getDelayLowCut() const;
    void setDelayHighCut(float hz);
    float getDelayHighCut() const;
    void setDelayFilterInLoop(bool enabled);
    bool getDelayFilterInLoop() const;
    void setDelayDiffusion(float percent);
    float getDelayDiffusion() const;
    void setDelayDuckThreshold(float db);
    float getDelayDuckThreshold() const;
    void setDelayDuckAmount(float percent);
    float getDelayDuckAmount() const;
    void setDelayDuckRelease(float ms);
    float getDelayDuckRelease() const;
    void setDelayOutputLevel(float db);
    float getDelayOutputLevel() const;
    void setDelaySpillover(bool enabled);
    bool hasDelaySpillover() const;
    void setDelayBypass(bool bypass);
    bool isDelayBypassed() const;
    DelayProcessor::Parameters getDelayParameters() const;
    void setDelayParameters(const DelayProcessor::Parameters& params);
    bool stageDelaySpillover();
    DelayProcessor::Metering getDelayMetering() const;
    DelayProcessor& getDelay() { return delay_; }

    // ========================================
    // Boss XS-1 Polyphonic Pitch Shifter (NEW)
    // ========================================

    void setBossXS1ShiftAmount(float semitones);
    float getBossXS1ShiftAmount() const;
    void setBossXS1Balance(float percent);
    float getBossXS1Balance() const;
    void setBossXS1DetuneMode(bool enabled);
    bool isBossXS1DetuneMode() const;
    void setBossXS1DetuneAmount(float cents);
    float getBossXS1DetuneAmount() const;
    void setBossXS1Glide(float ms);
    float getBossXS1Glide() const;
    void setBossXS1Feedback(float feedback);
    float getBossXS1Feedback() const;
    void setBossXS1PedalEnabled(bool enabled);
    bool isBossXS1PedalEnabled() const;
    void setBossXS1PedalPosition(float position);
    float getBossXS1PedalPosition() const;
    void setBossXS1PedalRange(float minSemitones, float maxSemitones);
    float getBossXS1PedalMin() const;
    float getBossXS1PedalMax() const;
    void setBossXS1Preset(BossXS1PolyShifterProcessor::Preset preset);
    BossXS1PolyShifterProcessor::Preset getBossXS1Preset() const;
    void setBossXS1Bypass(bool bypass);
    bool isBossXS1Bypassed() const;
    BossXS1PolyShifterProcessor::Parameters getBossXS1Parameters() const;
    void setBossXS1Parameters(const BossXS1PolyShifterProcessor::Parameters& params);
    float getBossXS1InputLevel() const;
    float getBossXS1OutputLevel() const;
    static const char* getBossXS1PresetName(BossXS1PolyShifterProcessor::Preset preset);
    static int getBossXS1NumPresets();
    BossXS1PolyShifterProcessor& getBossXS1() { return bossXS1_; }

    // ========================================
    // ShoeGaze Multi-Effect Processor (NEW)
    // ========================================

    // Primary controls
    void setShoeGazeAtmosphere(float percent);
    float getShoeGazeAtmosphere() const;
    void setShoeGazeDecay(float seconds);
    float getShoeGazeDecay() const;
    void setShoeGazeShimmer(float percent);
    float getShoeGazeShimmer() const;
    void setShoeGazeShimmerPitch(float semitones);
    float getShoeGazeShimmerPitch() const;
    void setShoeGazeModulation(float percent);
    float getShoeGazeModulation() const;
    void setShoeGazeModRate(float hz);
    float getShoeGazeModRate() const;
    void setShoeGazeDrive(float percent);
    float getShoeGazeDrive() const;
    void setShoeGazeDelayTime(float ms);
    float getShoeGazeDelayTime() const;
    void setShoeGazeDelayFeedback(float percent);
    float getShoeGazeDelayFeedback() const;
    void setShoeGazeDelayMod(float percent);
    float getShoeGazeDelayMod() const;
    void setShoeGazeLowCut(float hz);
    float getShoeGazeLowCut() const;
    void setShoeGazeHighCut(float hz);
    float getShoeGazeHighCut() const;
    void setShoeGazeMix(float percent);
    float getShoeGazeMix() const;
    void setShoeGazeStereoWidth(float percent);
    float getShoeGazeStereoWidth() const;

    // Advanced controls
    void setShoeGazeReverbDiffusion(float percent);
    float getShoeGazeReverbDiffusion() const;
    void setShoeGazeReverbDamping(float percent);
    float getShoeGazeReverbDamping() const;
    void setShoeGazeShimmerFeedback(float percent);
    float getShoeGazeShimmerFeedback() const;
    void setShoeGazeChorusVoices(int voices);
    int getShoeGazeChorusVoices() const;
    void setShoeGazeDucking(float percent);
    float getShoeGazeDucking() const;

    // State control
    void setShoeGazePreset(ShoeGazeProcessor::Preset preset);
    ShoeGazeProcessor::Preset getShoeGazePreset() const;
    void setShoeGazeBypass(bool bypass);
    bool isShoeGazeBypassed() const;
    void setShoeGazeSpillover(bool enabled);
    bool hasShoeGazeSpillover() const;
    bool stageShoeGazeSpillover();

    // Bulk parameters
    ShoeGazeProcessor::Parameters getShoeGazeParameters() const;
    void setShoeGazeParameters(const ShoeGazeProcessor::Parameters& params);

    // Metering
    ShoeGazeProcessor::Metering getShoeGazeMetering() const;

    // Preset info
    static ShoeGazeProcessor::PresetInfo getShoeGazePresetInfo(ShoeGazeProcessor::Preset preset);
    static int getShoeGazeNumPresets();

    // Direct access
    ShoeGazeProcessor& getShoeGaze() { return shoegaze_; }

    // ========================================
    // Lexi Love PCM 70 Reverb (NEW)
    // ========================================

    // Algorithm control
    void setLexiLoveAlgorithm(int algorithmIndex);
    void setLexiLoveAlgorithm(LexiLoveProcessor::Algorithm algorithm);
    int getLexiLoveAlgorithm() const;

    // Core parameters
    void setLexiLovePreDelay(float ms);
    float getLexiLovePreDelay() const;
    void setLexiLoveDecayTime(float seconds);
    float getLexiLoveDecayTime() const;
    void setLexiLoveDiffusion(float percent);
    float getLexiLoveDiffusion() const;
    void setLexiLoveMix(float percent);
    float getLexiLoveMix() const;
    void setLexiLoveHighCut(float hz);
    float getLexiLoveHighCut() const;
    void setLexiLoveLowCut(float hz);
    float getLexiLoveLowCut() const;

    // Multi-band decay
    void setLexiLoveLowDecayMult(float mult);
    float getLexiLoveLowDecayMult() const;
    void setLexiLoveHighDecayMult(float mult);
    float getLexiLoveHighDecayMult() const;
    void setLexiLoveLowCrossover(float hz);
    float getLexiLoveLowCrossover() const;
    void setLexiLoveHighCrossover(float hz);
    float getLexiLoveHighCrossover() const;

    // Early reflections
    void setLexiLoveEarlyLevel(float percent);
    float getLexiLoveEarlyLevel() const;
    void setLexiLoveEarlyPattern(float percent);
    float getLexiLoveEarlyPattern() const;

    // Modulation (sparkle)
    void setLexiLoveModDepth(float percent);
    float getLexiLoveModDepth() const;
    void setLexiLoveModRate(float hz);
    float getLexiLoveModRate() const;

    // State control
    void setLexiLoveBypass(bool bypass);
    bool isLexiLoveBypassed() const;
    void setLexiLoveSpillover(bool enabled);
    bool hasLexiLoveSpillover() const;
    bool stageLexiLoveSpillover();

    // Bulk parameters
    LexiLoveProcessor::Parameters getLexiLoveParameters() const;
    void setLexiLoveParameters(const LexiLoveProcessor::Parameters& params);

    // Metering
    LexiLoveProcessor::Metering getLexiLoveMetering() const;

    // Algorithm info
    static LexiLoveProcessor::AlgorithmInfo getLexiLoveAlgorithmInfo(int algorithmIndex);
    static int getLexiLoveNumAlgorithms();

    // Direct access
    LexiLoveProcessor& getLexiLove() { return lexiLove_; }

    // ========================================
    // Ultra-Harmonizer Control
    // ========================================

    // Algorithm
    void setH3000Algorithm(int algorithmIndex);
    void setH3000Algorithm(H3000Processor::Algorithm algorithm);
    int getH3000Algorithm() const;

    // Pitch
    void setH3000PitchL(float cents);
    float getH3000PitchL() const;
    void setH3000PitchR(float cents);
    float getH3000PitchR() const;

    // Delay
    void setH3000DelayL(float ms);
    float getH3000DelayL() const;
    void setH3000DelayR(float ms);
    float getH3000DelayR() const;

    // Feedback
    void setH3000Feedback(float percent);
    float getH3000Feedback() const;
    void setH3000CrossFeedback(float percent);
    float getH3000CrossFeedback() const;

    // Modulation
    void setH3000ModDepth(float percent);
    float getH3000ModDepth() const;
    void setH3000ModRate(float hz);
    float getH3000ModRate() const;

    // Filters
    void setH3000LowCut(float hz);
    float getH3000LowCut() const;
    void setH3000HighCut(float hz);
    float getH3000HighCut() const;

    // Levels
    void setH3000Mix(float percent);
    float getH3000Mix() const;
    void setH3000LevelL(float percent);
    float getH3000LevelL() const;
    void setH3000LevelR(float percent);
    float getH3000LevelR() const;

    // State
    void setH3000Bypass(bool bypass);
    bool isH3000Bypassed() const;
    void setH3000Glide(float ms);
    float getH3000Glide() const;

    // Bulk parameters
    H3000Processor::Parameters getH3000Parameters() const;
    void setH3000Parameters(const H3000Processor::Parameters& params);

    // Metering
    H3000Processor::Metering getH3000Metering() const;

    // Algorithm info
    static H3000Processor::AlgorithmInfo getH3000AlgorithmInfo(int algorithmIndex);
    static int getH3000NumAlgorithms();

    // Direct access
    H3000Processor& getH3000() { return h3000_; }

    // ========================================
    // Peavey 5150 Block Letter Amp Simulator (NEW)
    // ========================================

    // Preamp controls
    void setPeavey5150PreGain(float value);
    float getPeavey5150PreGain() const;
    void setPeavey5150PostGain(float value);
    float getPeavey5150PostGain() const;

    // Tone stack
    void setPeavey5150Low(float value);
    float getPeavey5150Low() const;
    void setPeavey5150Mid(float value);
    float getPeavey5150Mid() const;
    void setPeavey5150High(float value);
    float getPeavey5150High() const;

    // Power amp
    void setPeavey5150Presence(float value);
    float getPeavey5150Presence() const;
    void setPeavey5150Resonance(float value);
    float getPeavey5150Resonance() const;
    void setPeavey5150Bias(float value);
    float getPeavey5150Bias() const;

    // Switches
    void setPeavey5150Bright(bool on);
    bool getPeavey5150Bright() const;

    // State
    void setPeavey5150Preset(Peavey5150Processor::Preset preset);
    Peavey5150Processor::Preset getPeavey5150Preset() const;
    void setPeavey5150Bypass(bool bypass);
    bool isPeavey5150Bypassed() const;

    // Bulk parameters
    Peavey5150Processor::Parameters getPeavey5150Parameters() const;
    void setPeavey5150Parameters(const Peavey5150Processor::Parameters& params);

    // Metering
    Peavey5150Processor::Metering getPeavey5150Metering() const;

    // Preset info
    static Peavey5150Processor::PresetInfo getPeavey5150PresetInfo(Peavey5150Processor::Preset preset);
    static int getPeavey5150NumPresets();

    // Direct access
    Peavey5150Processor& getPeavey5150() { return peavey5150_; }

    // ========================================
    // Tweed Bassman 5F6-A Amplifier Simulator
    // ========================================

    // Channel
    void setTweedBassmanChannelMode(int mode);
    int getTweedBassmanChannelMode() const;
    void setTweedBassmanNormalVolume(float v);
    float getTweedBassmanNormalVolume() const;
    void setTweedBassmanBrightVolume(float v);
    float getTweedBassmanBrightVolume() const;
    void setTweedBassmanBrightCap(bool on);
    bool getTweedBassmanBrightCap() const;

    // Preamp
    void setTweedBassmanV1TubeType(int type);
    int getTweedBassmanV1TubeType() const;
    void setTweedBassmanCathodeBypass(bool on);
    bool getTweedBassmanCathodeBypass() const;
    void setTweedBassmanCathodeBias(int mode);
    int getTweedBassmanCathodeBias() const;

    // Tone
    void setTweedBassmanTreble(float v);
    float getTweedBassmanTreble() const;
    void setTweedBassmanMid(float v);
    float getTweedBassmanMid() const;
    void setTweedBassmanBass(float v);
    float getTweedBassmanBass() const;
    void setTweedBassmanRawSwitch(bool on);
    bool getTweedBassmanRawSwitch() const;

    // Master
    void setTweedBassmanMasterVolume(float v);
    float getTweedBassmanMasterVolume() const;

    // Power amp
    void setTweedBassmanPresence(float v);
    float getTweedBassmanPresence() const;
    void setTweedBassmanNFBMode(int mode);
    int getTweedBassmanNFBMode() const;
    void setTweedBassmanPowerTubeType(int type);
    int getTweedBassmanPowerTubeType() const;
    void setTweedBassmanBiasMode(int mode);
    int getTweedBassmanBiasMode() const;
    void setTweedBassmanRectifierType(int type);
    int getTweedBassmanRectifierType() const;

    // Output
    void setTweedBassmanOutputLevel(float dB);
    float getTweedBassmanOutputLevel() const;
    void setTweedBassmanCabinetEnabled(bool on);
    bool getTweedBassmanCabinetEnabled() const;
    void setTweedBassmanCabinetIR(int index);
    int getTweedBassmanCabinetIR() const;

    // State
    void setTweedBassmanPreset(TweedBassmanProcessor::Preset preset);
    TweedBassmanProcessor::Preset getTweedBassmanPreset() const;
    void setTweedBassmanBypass(bool bypass);
    bool isTweedBassmanBypassed() const;

    // Bulk parameters
    TweedBassmanProcessor::Parameters getTweedBassmanParameters() const;
    void setTweedBassmanParameters(const TweedBassmanProcessor::Parameters& params);

    // Metering
    TweedBassmanProcessor::Metering getTweedBassmanMetering() const;

    // Preset info
    static TweedBassmanProcessor::PresetInfo getTweedBassmanPresetInfo(TweedBassmanProcessor::Preset preset);
    static int getTweedBassmanNumPresets();

    // Direct access
    TweedBassmanProcessor& getTweedBassman() { return tweedBassman_; }

    // ========================================
    // PassionFX Multi-Effect Processor (Steve Vai Passion & Warfare)
    // ========================================

    // NoiseGate
    void setPassionFXGateEnabled(bool enabled);
    void setPassionFXGateThreshold(float dB);
    void setPassionFXGateRelease(float ms);

    // Compressor
    void setPassionFXCompEnabled(bool enabled);
    void setPassionFXCompThreshold(float dB);
    void setPassionFXCompRatio(float ratio);
    void setPassionFXCompAttack(float ms);
    void setPassionFXCompRelease(float ms);
    void setPassionFXCompGlassy(bool glassy);

    // Wah
    void setPassionFXWahEnabled(bool enabled);
    void setPassionFXWahMode(int mode);
    void setPassionFXWahPosition(float position);
    void setPassionFXWahQ(float q);

    // Phaser
    void setPassionFXPhaserEnabled(bool enabled);
    void setPassionFXPhaserRate(float hz);
    void setPassionFXPhaserDepth(float depth);
    void setPassionFXPhaserStages(int stages);
    void setPassionFXPhaserFeedback(float feedback);

    // Chorus
    void setPassionFXChorusEnabled(bool enabled);
    void setPassionFXChorusRate(float hz);
    void setPassionFXChorusDepth(float depth);
    void setPassionFXChorusVoices(int voices);
    void setPassionFXChorusMix(float mix);

    // PitchShifter
    void setPassionFXPitchEnabled(bool enabled);
    void setPassionFXPitchSemitones(float semitones);
    void setPassionFXPitchMix(float mix);

    // Harmonizer
    void setPassionFXHarmEnabled(bool enabled);
    void setPassionFXHarmVoice1(float semitones);
    void setPassionFXHarmVoice2(float semitones);
    void setPassionFXHarmDetune(float cents);
    void setPassionFXHarmMix(float mix);

    // Delay
    void setPassionFXDelayEnabled(bool enabled);
    void setPassionFXDelayTimeL(float ms);
    void setPassionFXDelayTimeR(float ms);
    void setPassionFXDelayFeedback(float feedback);
    void setPassionFXDelayMix(float mix);
    void setPassionFXDelayFreeze(bool freeze);
    void setPassionFXDelayPitchShiftL(float semitones);
    void setPassionFXDelayPitchShiftR(float semitones);

    // Reverb
    void setPassionFXReverbEnabled(bool enabled);
    void setPassionFXReverbType(int type);
    void setPassionFXReverbDecay(float seconds);
    void setPassionFXReverbShimmerAmount(float amount);
    void setPassionFXReverbShimmerInterval(float semitones);
    void setPassionFXReverbMix(float mix);
    void setPassionFXReverbFreeze(bool freeze);

    // EQ
    void setPassionFXEqEnabled(bool enabled);
    void setPassionFXEqLowGain(float dB);
    void setPassionFXEqMidGain(float dB);
    void setPassionFXEqHighGain(float dB);
    void setPassionFXEqTilt(float tilt);

    // Exciter
    void setPassionFXExciterEnabled(bool enabled);
    void setPassionFXExciterWarmth(float warmth);
    void setPassionFXExciterPresence(float presence);
    void setPassionFXExciterAir(float air);

    // Tremolo
    void setPassionFXTremEnabled(bool enabled);
    void setPassionFXTremRate(float hz);
    void setPassionFXTremDepth(float depth);
    void setPassionFXTremWaveform(int waveform);

    // Global
    void setPassionFXMix(float mix);
    void setPassionFXOutputLevel(float dB);

    // State
    void setPassionFXPreset(PassionFXProcessor::Preset preset);
    PassionFXProcessor::Preset getPassionFXPreset() const;
    void setPassionFXBypass(bool bypass);
    bool isPassionFXBypassed() const;

    // Bulk parameters
    PassionFXProcessor::Parameters getPassionFXParameters() const;
    void setPassionFXParameters(const PassionFXProcessor::Parameters& params);

    // Metering
    PassionFXProcessor::Metering getPassionFXMetering() const;

    // Preset info
    static PassionFXProcessor::PresetInfo getPassionFXPresetInfo(PassionFXProcessor::Preset preset);
    static int getPassionFXNumPresets();

    // Direct access
    PassionFXProcessor& getPassionFX() { return passionFX_; }

    // ========================================
    // SynthForge (Phase 1 scaffold)
    // ========================================

    std::vector<synthforge::PartConfig> getSynthForgePartsConfig() const;
    bool setSynthForgePartConfig(int partIndex, const synthforge::PartConfig& config);

    bool setSynthForgePartChannel(int partIndex, int midiChannel);
    int getSynthForgePartChannel(int partIndex) const;

    std::map<std::string, float> getSynthForgePartParameters(int partIndex) const;
    bool setSynthForgeParameter(int partIndex, const std::string& param, float value);
    bool loadSynthForgeSfz(int partIndex, const std::string& sfzPath);
    bool loadSynthForgeSoundFont(int partIndex, const std::string& soundfontPath, int bank, int program, const std::string& presetName);
    synthforge::SampleLoadStatus getSynthForgePartSampleStatus(int partIndex) const;
    bool reloadSynthForgePartSfzIfChanged(int partIndex);

    bool setSynthForgePartSamplerBackend(int partIndex, const std::string& backend);
    std::string getSynthForgePartSamplerBackend(int partIndex) const;

    bool setSynthForgePartStreamingConfig(int partIndex, const synthforge::StreamingConfig& config);
    synthforge::StreamingConfig getSynthForgePartStreamingConfig(int partIndex) const;

    bool setSynthForgePartHotReload(int partIndex, bool enabled, int intervalMs);
    synthforge::HotReloadStatus getSynthForgePartHotReloadStatus(int partIndex) const;

    bool loadSynthForgePartScalaTuning(int partIndex, const std::string& scalaPath, int rootKey, float referenceHz);
    synthforge::ScalaTuningConfig getSynthForgePartScalaTuning(int partIndex) const;

    bool setSynthForgePartMpeConfig(int partIndex, const synthforge::MpeConfig& config);
    synthforge::MpeConfig getSynthForgePartMpeConfig(int partIndex) const;

    bool setSynthForgePartModMatrixRoutes(int partIndex, const std::vector<synthforge::ModMatrixRoute>& routes);
    std::vector<synthforge::ModMatrixRoute> getSynthForgePartModMatrixRoutes(int partIndex) const;

    bool setSynthForgePartFreeze(int partIndex, bool enabled);
    synthforge::FreezeRenderStatus getSynthForgePartFreezeStatus(int partIndex) const;
    bool renderSynthForgePartToFile(int partIndex, const std::string& outputPath, int durationMs);

    synthforge::SamplerAnalyzerFrame getSynthForgePartAnalyzerFrame(int partIndex) const;
    std::vector<synthforge::SamplerAnalyzerFrame> getSynthForgeAnalyzerFrames() const;
    synthforge::SfzBackendStatus getSynthForgePartBackendStatus(int partIndex) const;
    std::vector<synthforge::SfzBackendStatus> getSynthForgeBackendStatus() const;

    std::vector<synthforge::PatchInfo> getSynthForgePatches(
        const std::string& category = "") const;
    bool loadSynthForgePatch(int partIndex, int bank, int program);
    bool saveSynthForgePatch(int partIndex, int bank, int program, const std::string& name);

    synthforge::VoiceMetrics getSynthForgeVoiceMetrics() const;
    synthforge::Metering getSynthForgeMetering() const;

    synthforge::SynthForgeProcessor& getSynthForge() { return synthForge_; }
    drummachine::DrumMachineProcessor& getDrumMachine() { return drumMachine_; }
    const drummachine::DrumMachineProcessor& getDrumMachine() const { return drumMachine_; }
    drummachine::DrumSequencer& getDrumSequencer() { return drumSequencer_; }
    const drummachine::DrumSequencer& getDrumSequencer() const { return drumSequencer_; }
    void setDrumMachineEnabled(bool enabled) {
        drumMachineEnabled_.store(enabled, std::memory_order_relaxed);
        if (drumMachineAdapter_) drumMachineAdapter_->setEnabled(enabled);
    }
    bool isDrumMachineEnabled() const { return drumMachineEnabled_.load(std::memory_order_relaxed); }

    // ========================================
    // Component Access (for advanced use)
    // ========================================

    JucePluginHost& getPluginHost() { return pluginHost_; }
    JuceAudioGraph& getAudioGraph() { return *audioGraph_; }
    const JuceAudioGraph& getAudioGraph() const { return *audioGraph_; }
    MidiHandler& getMidiHandler() { return midiHandler_; }
    ParameterBridge& getParameterBridge() { return parameterBridge_; }
    SnapshotManager& getSnapshotManager() { return *snapshotManager_; }
    SpectrumAnalyzer& getSpectrumAnalyzer() { return spectrumAnalyzer_; }
    LufsMeter& getLufsMeter() { return lufsMeter_; }
    PhaseCorrelationMeter& getPhaseCorrelation() { return phaseCorrelation_; }
    CPUMonitor& getCPUMonitor() { return cpuMonitor_; }

#ifdef HAS_AVDECC
    // AVDECC Controller accessor
    Map2Audio::Map2AvdeccController* getAvdeccController() { return avdeccController_.get(); }
    const Map2Audio::Map2AvdeccController* getAvdeccController() const { return avdeccController_.get(); }
#endif

#ifdef HAS_AVB
    // ========================================
    // Tesira AVB Node (per-channel gain/mute bridge for Biamp Tesira Forte AVB)
    // Thread-safe: set*() calls may come from any Python/network thread;
    // processDevice() is called from the RT audio thread.
    // ========================================

    /** Set dB level for one channel of one Tesira device (0 dB = unity). */
    bool setTesiraDeviceLevel(int deviceIdx, int channel, float levelDb);

    /** Mute/unmute one channel of one Tesira device. */
    bool setTesiraDeviceMute(int deviceIdx, int channel, bool muted);

    /** Mark a Tesira device slot as connected (true) or disconnected (false). */
    bool setTesiraDeviceConnected(int deviceIdx, bool connected);

    /** Update the active preset index for a Tesira device (-1 = none). */
    bool setTesiraDevicePreset(int deviceIdx, int presetIndex);

    /** Read the latest peak output level (dBFS) for a channel. Returns -120 if unavailable. */
    float getTesiraOutputLevel(int deviceIdx, int channel) const;
#endif

private:
    struct SpilloverChain {
        int id = 0;
        std::vector<InstanceId> instanceIds;
        std::atomic<int64_t> remainingSamples{0};
        std::atomic<bool> expired{false};
        double estimatedTailSeconds = 0.0;
    };

    struct IndependentGraphCrossfade {
        int id = 0;
        std::vector<InstanceId> instanceIds;
        std::atomic<int64_t> remainingSamples{0};
        int64_t totalSamples = 0;
        std::atomic<int64_t> processedSamples{0};
        std::atomic<bool> expired{false};
    };

    struct DelaySpilloverState {
        int id = 0;
        std::unique_ptr<DelayProcessor> processor;
        std::atomic<int64_t> remainingSamples{0};
        std::atomic<bool> expired{false};
        double estimatedTailSeconds = 0.0;
    };

    struct MorphEndpointPluginState {
        std::string uri;
        int position = 0;
        bool bypass = false;
        std::map<std::string, float> parameters;
    };

    struct MorphEndpointState {
        bool configured = false;
        std::map<std::string, MorphEndpointPluginState> plugins;
    };

    struct QuadMorphState {
        std::array<MorphEndpointState, 4> endpoints;
        float x = 0.0f;
        float y = 0.0f;
    };

    struct ShoeGazeSpilloverState {
        int id = 0;
        std::unique_ptr<ShoeGazeProcessor> processor;
        std::atomic<int64_t> remainingSamples{0};
        std::atomic<bool> expired{false};
        double estimatedTailSeconds = 0.0;
    };

    struct LexiLoveSpilloverState {
        int id = 0;
        std::unique_ptr<LexiLoveProcessor> processor;
        std::atomic<int64_t> remainingSamples{0};
        std::atomic<bool> expired{false};
        double estimatedTailSeconds = 0.0;
    };

    void cleanupExpiredSpilloverChains();
    void clearAllSpilloverChains();
    void processSpilloverChains(juce::AudioBuffer<float>& buffer, int numSamples);
    bool stageSpilloverFromCurrentChain(const std::vector<InstanceId>& nextOrder);
    std::shared_ptr<SpilloverChain> buildSpilloverChainFromCurrentOrder(const std::vector<InstanceId>& nextOrder);
    std::optional<InstanceId> clonePluginInstanceForSpillover(InstanceId sourceInstanceId);
    void cleanupExpiredIndependentGraphCrossfades();
    void clearIndependentGraphCrossfades();
    void processIndependentGraphCrossfades(
        juce::AudioBuffer<float>& buffer,
        const juce::AudioBuffer<float>& dryInputBuffer,
        int numSamples);
    void applyTopologyTransitionFade(juce::AudioBuffer<float>& buffer, int numSamples);
    void applySnapshotExpressionControlChange(int midiChannel, int cc, int value);
    bool applySnapshotExpressionMappedValue(const std::map<std::string, juce::var>& mapping, float value);
    static float applySnapshotExpressionCurve(
        float normalized,
        const std::string& curveName,
        const juce::var& customCurve);
    bool buildSoloMonitorMix(juce::AudioBuffer<float>& dest, int numSamples);
    bool replaceChainWithIndependentGraphCrossfade(
        const std::vector<InstanceId>& order,
        int maxCrossfadeMs);
    std::shared_ptr<IndependentGraphCrossfade> buildIndependentGraphCrossfadeFromCurrentOrder(int maxCrossfadeMs);
    static int morphCornerIndexForId(const std::string& cornerId);
    static std::string morphCornerKey(int index);
    static std::string makeMorphPluginKey(const std::string& uri, int position);
    static MorphEndpointState buildMorphEndpointState(const juce::var& graphDocumentVar);
    bool applyMorphPosition(float x, float y);
    void cleanupExpiredNativeSpillovers();
    void clearAllNativeSpillovers();
    void processNativeSpillovers(juce::AudioBuffer<float>& buffer, int numSamples);

    struct PlatformEventSlot {
        std::array<char, 64> kind{};
        std::array<char, 16> severity{};
        std::array<char, 48> title{};
        std::array<char, 160> message{};
        uint64_t sequence = 0;
        int64_t timestampMs = 0;
        std::atomic<bool> ready{false};
    };

    static constexpr size_t PLATFORM_EVENT_FIFO_SIZE = 128;
    std::array<PlatformEventSlot, PLATFORM_EVENT_FIFO_SIZE> platformEventFifo_{};
    std::atomic<uint64_t> platformEventWriteSeq_{0};
    std::atomic<uint64_t> platformEventReadSeq_{0};
    std::atomic<uint64_t> droppedPlatformEventCount_{0};
    void enqueuePlatformEvent(
        const char* kind,
        const char* severity,
        const char* title,
        const char* message) noexcept;
    static void handleAudioIoXrunEvent(void* context) noexcept;

    // JUCE Components (NEW)
    JuceAudioIO audioIO_;
    JucePluginHost pluginHost_;
    std::unique_ptr<JuceAudioGraph> audioGraph_;
    juce::AudioBuffer<float> callbackBuffer_;
    juce::AudioBuffer<float> spilloverBuffer_;
    juce::AudioBuffer<float> monitorBuffer_;
    juce::AudioBuffer<float> graphCrossfadeInputBuffer_;
    juce::AudioBuffer<float> graphCrossfadeOldBuffer_;
    juce::AudioBuffer<float> graphCrossfadeNewBuffer_;
    juce::AudioBuffer<float> topologyTransitionReferenceBuffer_;

    // Lexicon MPX-1 Hardware Plugin
    // Raw pointer (non-owning) — lifetime managed by pluginHost_.hardwareInstances_
    LexiconHardwareProcessor* lexiconProcessor_ = nullptr;
    InstanceId lexiconInstanceId_ = INVALID_INSTANCE_ID;

    // Native Processors (NEW)
    ConvolutionProcessor cabinetProcessor_;
    ConvolutionProcessor reverbProcessor_;

    // Dynamics Processors (NEW)
    DynamicsProcessor compressor_;
    DynamicsProcessor limiter_;
    DynamicsProcessor gate_;

    // EQ Processor (NEW)
    FilterProcessor eq_;

    // Modulation Processors (NEW)
    ChorusProcessor chorus_;
    PhaserProcessor phaser_;
    PitchShifterProcessor pitchShifter_;
    DelayProcessor delay_;
    IntelliFX8VoiceChorusProcessor intellifx_;
    BossXS1PolyShifterProcessor bossXS1_;
    ShoeGazeProcessor shoegaze_;
    LexiLoveProcessor lexiLove_;
    H3000Processor h3000_;
    Peavey5150Processor peavey5150_;
    TweedBassmanProcessor tweedBassman_;
    PassionFXProcessor passionFX_;
    drummachine::DrumMachineProcessor drumMachine_;
    drummachine::DrumSequencer drumSequencer_;
    synthforge::SynthForgeProcessor synthForge_;

    // Graph adapters — non-owning pointers, lifetime managed by pluginHost_
    synthforge::SynthForgeGraphAdapter* synthForgeAdapter_ = nullptr;
    InstanceId synthForgeInstanceId_ = INVALID_INSTANCE_ID;
    drummachine::DrumMachineGraphAdapter* drumMachineAdapter_ = nullptr;
    InstanceId drumMachineInstanceId_ = INVALID_INSTANCE_ID;

#ifdef HAS_NAM
    // Neural Amp Modeler (NEW - RT-safe)
    NAMProcessor namProcessor_;
#endif

#ifdef HAS_AVDECC
    // AVDECC Controller (la_avdecc-backed)
    std::unique_ptr<Map2Audio::Map2AvdeccController> avdeccController_;
#endif

#ifdef HAS_AVB
    // Tesira Forte AVB bridge (RT-safe per-channel gain/mute for up to 5 units)
    TesiraAvbNode tesiraNode_;
#endif

    // Metering (NEW) - OFF AUDIO THREAD (Option 3)
    SpectrumAnalyzer spectrumAnalyzer_;
    LufsMeter lufsMeter_;
    PhaseCorrelationMeter phaseCorrelation_;
    CPUMonitor cpuMonitor_;
    mutable std::mutex spilloverChainsMutex_;
    std::vector<std::shared_ptr<SpilloverChain>> spilloverChains_;
    int nextSpilloverChainId_ = 1;
    mutable std::mutex graphCrossfadeMutex_;
    std::vector<std::shared_ptr<IndependentGraphCrossfade>> independentGraphCrossfades_;
    int nextIndependentGraphCrossfadeId_ = 1;
    mutable std::mutex morphStateMutex_;
    QuadMorphState quadMorphState_;
    // T2454-B2: stats from the most-recent loadGraphDocument call —
    // populated at the end of each call and consulted by Python to attribute
    // warm-vs-cold instance reuse on a per-activation basis.
    mutable std::mutex graphLoadStatsMutex_;
    GraphLoadStats lastGraphLoadStats_;
    mutable std::mutex nativeSpilloverMutex_;
    std::vector<std::shared_ptr<DelaySpilloverState>> delaySpillovers_;
    std::vector<std::shared_ptr<ShoeGazeSpilloverState>> shoegazeSpillovers_;
    std::vector<std::shared_ptr<LexiLoveSpilloverState>> lexiLoveSpillovers_;
    int nextNativeSpilloverId_ = 1;
    
    // Metering thread and lock-free ring buffer (Option 3 - RT-safe)
    std::thread meteringThread_;
    std::atomic<bool> meteringRunning_{false};

    // Lock-free metering ring buffer — zero allocations, zero locks in audio callback
    static constexpr int METERING_RING_SIZE = 8;
    static constexpr int METERING_MAX_SAMPLES = 1024;  // Covers up to quantum 1024
    struct MeteringFrame {
        float channels[2][METERING_MAX_SAMPLES];  // Pre-allocated, no heap alloc
        int numSamples = 0;
    };
    std::array<MeteringFrame, METERING_RING_SIZE> meteringRing_;
    juce::AbstractFifo meteringFifo_{METERING_RING_SIZE};
    std::atomic<bool> meteringDataReady_{false};
    static constexpr int METERING_QUEUE_DEPTH = METERING_RING_SIZE;  // Compat alias

    // Metering thread entry point
    void meteringThreadFunc();
    void pushMeteringData(const juce::AudioBuffer<float>& buffer);

    // Existing Components
    MidiHandler midiHandler_;
    ParameterBridge parameterBridge_;
    std::unique_ptr<SnapshotManager> snapshotManager_;
    VuMeter masterVuMeter_;

    // State
    bool initialized_ = false;
    std::atomic<bool> audioRunning_{false};
    std::atomic<bool> drumMachineEnabled_{true};

    struct AvbManagedStream {
        AvbStreamRuntimeConfig config;
        bool isTestStream = false;
        bool running = false;
        AvbStreamRuntimeStats stats;
        std::string lastError;
        std::chrono::steady_clock::time_point startedAt{};
#ifdef BUILD_AVB_TESTS
        AvbStreamLifecycleState lifecycleState = AvbStreamLifecycleState::Unknown;
#endif
#ifdef HAS_AVB
        std::unique_ptr<Map2Audio::AvbAudioIODevice> device;
#endif
    };
    mutable std::mutex avbStreamsMutex_;
    std::map<std::string, AvbManagedStream> avbStreams_;
    mutable std::mutex avbDiscoveredDevicesMutex_;
    std::vector<AvbDiscoveredDeviceInfo> avbDiscoveredDevices_;
    mutable std::mutex effectsLoopsMutex_;
    std::map<std::string, ExternalLoopDefinition> externalLoops_;
    std::map<int, std::vector<ExternalLoopInsertion>> chainLoopInsertions_;
    std::map<std::string, ExternalLoopMetrics> externalLoopMetrics_;
    mutable std::mutex chainStateMutex_;
    std::map<int, float> chainDryWetMix_;
    std::map<int, float> chainGainLinear_;
    std::map<int, bool> chainMuteState_;
    std::map<int, bool> chainSoloState_;

    struct ExternalLoopRuntimeLoop {
        std::string loopId;
        bool active = false;
        bool bypass = false;
        int channels = 2;
        int compensationSamples = 0;
        std::vector<std::vector<float>> delayLines;
        int delayWriteIndex = 0;
    };

    struct ExternalLoopRuntimeInsertion {
        std::string insertionId;
        std::string loopId;
        int chainId = 0;
        int slotIndex = 0;
        bool enabled = false;
        std::string mode = "serial_insert";
        float targetBlend = 1.0f;
        float currentBlend = 1.0f;
        float targetSendGainLinear = 1.0f;
        float currentSendGainLinear = 1.0f;
        float targetReturnGainLinear = 1.0f;
        float currentReturnGainLinear = 1.0f;
        float smoothingAlpha = 1.0f;
    };

    struct ExternalLoopProcessingState {
        std::map<std::string, ExternalLoopRuntimeLoop> loops;
        std::vector<ExternalLoopRuntimeInsertion> orderedInsertions;
    };

    void rebuildExternalLoopProcessingStateLocked();
    void processExternalLoopInsertions(juce::AudioBuffer<float>& buffer, int numSamples);

    std::shared_ptr<ExternalLoopProcessingState> externalLoopProcessingState_;
    juce::AudioBuffer<float> externalLoopDryBuffer_;
    juce::AudioBuffer<float> externalLoopWetBuffer_;

    // Configuration
    double sampleRate_ = DEFAULT_SAMPLE_RATE;
    int bufferSize_ = DEFAULT_BUFFER_SIZE;
    int numInputChannels_ = 2;
    int numOutputChannels_ = 2;
    InputChannelMode inputChannelMode_ = InputChannelMode::Stereo;
    std::atomic<float> inputGainDb_{0.0f};
    std::atomic<float> outputGainDb_{0.0f};
    std::atomic<float> inputGainLinear_{1.0f};
    std::atomic<float> outputGainLinear_{1.0f};
    std::atomic<int> monitoringOutputIndex_{0};
    std::atomic<int> topologyTransitionSamplesRemaining_{0};
    std::atomic<int> topologyTransitionTotalSamples_{0};
    std::string audioDevice_ = "default";
    std::string lv2Path_ = "/usr/lib64/lv2:/usr/lib/lv2:/usr/local/lib/lv2";

    // Audio processing callback
    void audioCallback(const float* const* inputs, int numInputs,
                      float* const* outputs, int numOutputs,
                      int numSamples);

    // Lock-free MIDI handoff from MIDI thread to audio callback.
    void enqueueMidiEvent(const MidiMessage& msg);
    void drainMidiEvents(juce::MidiBuffer& midiBuffer, int numSamples);
    void sendDrumSequencerMidiEvent(const drummachine::DrumSequencer::MidiOutputEvent& event);
    static constexpr int MIDI_RING_SIZE = 512;
    struct QueuedMidiEvent {
        uint8_t status = 0;
        uint8_t data1 = 0;
        uint8_t data2 = 0;
        int sampleOffset = 0;
    };
    std::array<QueuedMidiEvent, MIDI_RING_SIZE> midiRing_;
    juce::AbstractFifo midiFifo_{MIDI_RING_SIZE};
    std::atomic<bool> midiDataReady_{false};
    std::shared_ptr<const std::vector<std::map<std::string, juce::var>>> snapshotExpressionMappings_;
};

} // namespace map2
