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

#include "ChorusProcessor.h"
#include "PhaserProcessor.h"
#include "PitchShifterProcessor.h"
#include "IntelliFX8VoiceChorusProcessor.h"
#include "BossXS1PolyShifterProcessor.h"
#include "ShoeGazeProcessor.h"

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
    // Pitch Shifter / EVH Harmonizer (NEW)
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

    // Modulation Processors (NEW)
    ChorusProcessor chorus_;
    PhaserProcessor phaser_;
    PitchShifterProcessor pitchShifter_;
    IntelliFX8VoiceChorusProcessor intellifx_;
    BossXS1PolyShifterProcessor bossXS1_;
    ShoeGazeProcessor shoegaze_;

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
    
    // Fix #4: Unified processor preparation helper\n    void prepareAllProcessors(double sampleRate, int bufferSize, int numChannels);
};

} // namespace map2
