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

#include <juce_audio_basics/juce_audio_basics.h>
#include <thread>
#include <atomic>

namespace map2 {

class Map2AudioEngine {
public:
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
    // Configuration
    // ========================================

    void setSampleRate(double rate);
    double getSampleRate() const { return sampleRate_; }

    void setBufferSize(int size);
    int getBufferSize() const { return bufferSize_; }

    void setAudioDevice(const std::string& device);
    std::string getAudioDevice() const { return audioDevice_; }

    void setLv2Path(const std::string& path);
    std::string getLv2Path() const { return lv2Path_; }

    void setNumInputChannels(int channels);
    int getNumInputChannels() const { return numInputChannels_; }

    void setNumOutputChannels(int channels);
    int getNumOutputChannels() const { return numOutputChannels_; }

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
    bool addToChain(InstanceId instanceId, int position = -1);
    bool removeFromChain(InstanceId instanceId);
    bool reorderChain(const std::vector<InstanceId>& order);

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
    // Component Access (for advanced use)
    // ========================================

    JucePluginHost& getPluginHost() { return pluginHost_; }
    JuceAudioGraph& getAudioGraph() { return *audioGraph_; }
    MidiHandler& getMidiHandler() { return midiHandler_; }
    ParameterBridge& getParameterBridge() { return parameterBridge_; }
    SnapshotManager& getSnapshotManager() { return *snapshotManager_; }
    SpectrumAnalyzer& getSpectrumAnalyzer() { return spectrumAnalyzer_; }
    LufsMeter& getLufsMeter() { return lufsMeter_; }
    PhaseCorrelationMeter& getPhaseCorrelation() { return phaseCorrelation_; }
    CPUMonitor& getCPUMonitor() { return cpuMonitor_; }

private:
    // JUCE Components (NEW)
    JuceAudioIO audioIO_;
    JucePluginHost pluginHost_;
    std::unique_ptr<JuceAudioGraph> audioGraph_;

    // Native Processors (NEW)
    ConvolutionProcessor cabinetProcessor_;
    ConvolutionProcessor reverbProcessor_;

    // Dynamics Processors (NEW)
    DynamicsProcessor compressor_;
    DynamicsProcessor limiter_;
    DynamicsProcessor gate_;

    // EQ Processor (NEW)
    FilterProcessor eq_;

#ifdef HAS_NAM
    // Neural Amp Modeler (NEW - RT-safe)
    NAMProcessor namProcessor_;
#endif

    // Metering (NEW)
    SpectrumAnalyzer spectrumAnalyzer_;
    LufsMeter lufsMeter_;
    PhaseCorrelationMeter phaseCorrelation_;
    CPUMonitor cpuMonitor_;

    // Existing Components
    MidiHandler midiHandler_;
    ParameterBridge parameterBridge_;
    std::unique_ptr<SnapshotManager> snapshotManager_;
    VuMeter masterVuMeter_;

    // State
    bool initialized_ = false;
    std::atomic<bool> audioRunning_{false};

    // Configuration
    double sampleRate_ = DEFAULT_SAMPLE_RATE;
    int bufferSize_ = DEFAULT_BUFFER_SIZE;
    int numInputChannels_ = 2;
    int numOutputChannels_ = 2;
    std::string audioDevice_ = "default";
    std::string lv2Path_ = "/usr/lib64/lv2:/usr/lib/lv2:/usr/local/lib/lv2";

    // Audio processing callback
    void audioCallback(const float* const* inputs, int numInputs,
                      float* const* outputs, int numOutputs,
                      int numSamples);
};

} // namespace map2
