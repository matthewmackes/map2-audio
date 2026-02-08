/**
 * MAP2 Audio Engine - Main Engine Implementation
 * Version 2.0 - Full JUCE Integration
 */

#include "Map2AudioEngine.h"

// RT-SAFE: Use conditional logging that can be disabled for production
// In release builds, these are no-ops to avoid console I/O in audio context
#ifndef MAP2_DISABLE_LOGGING
#include <iostream>
#define MAP2_LOG(msg) std::cout << msg << std::endl
#define MAP2_ERR(msg) std::cerr << msg << std::endl
#else
#define MAP2_LOG(msg) ((void)0)
#define MAP2_ERR(msg) ((void)0)
#endif

namespace map2 {

Map2AudioEngine::Map2AudioEngine() {
    audioGraph_ = std::make_unique<JuceAudioGraph>(pluginHost_);
    snapshotManager_ = std::make_unique<SnapshotManager>(pluginHost_);
}

Map2AudioEngine::~Map2AudioEngine() {
    shutdown();
}

bool Map2AudioEngine::initialize(const std::string& /*configFile*/) {
    if (initialized_) return true;

    std::cout << "Initializing MAP2 Audio Engine v" << ENGINE_VERSION << " (JUCE)" << std::endl;

    // Initialize JUCE plugin host
    if (!pluginHost_.initialize(lv2Path_)) {
        std::cerr << "Failed to initialize plugin host" << std::endl;
        return false;
    }

    // Scan for plugins
    std::cout << "Scanning for plugins..." << std::endl;
    pluginHost_.scanForPlugins(false, [](float progress, const std::string& name) {
        if (!name.empty()) {
            std::cout << "  [" << static_cast<int>(progress * 100) << "%] " << name << std::endl;
        }
    });

    // Initialize JUCE audio I/O with configured channel counts
    std::cout << "  Configuring audio: " << numInputChannels_ << " inputs, "
              << numOutputChannels_ << " outputs" << std::endl;
    if (!audioIO_.initialize(audioDevice_, sampleRate_, bufferSize_,
                              numInputChannels_, numOutputChannels_)) {
        std::cerr << "Failed to initialize audio I/O" << std::endl;
        return false;
    }

    // Get actual sample rate and buffer size from device
    sampleRate_ = audioIO_.getSampleRate();
    bufferSize_ = audioIO_.getBufferSize();

    // Initialize audio graph with max of input/output channels
    int graphChannels = std::max(numInputChannels_, numOutputChannels_);
    audioGraph_->initialize(sampleRate_, bufferSize_, graphChannels);

    // Initialize MIDI
    if (!midiHandler_.initialize()) {
        std::cerr << "MIDI initialization failed (continuing without MIDI)" << std::endl;
    }

    // Set up MIDI CC callback
    midiHandler_.setCCMappingCallback([this](InstanceId pluginId, const std::string& param, float value) {
        setParameterByName(pluginId, param, value);
    });

    // Initialize metering components
    spectrumAnalyzer_.prepare(sampleRate_);
    lufsMeter_.prepare(sampleRate_, 2);
    phaseCorrelation_.prepare(sampleRate_);
    cpuMonitor_.prepare(sampleRate_, bufferSize_);

    // Initialize convolution processors
    cabinetProcessor_.prepare(sampleRate_, bufferSize_, 2);
    reverbProcessor_.prepare(sampleRate_, bufferSize_, 2);

    // Initialize dynamics processors
    compressor_.prepare(sampleRate_, bufferSize_, 2);
    compressor_.setMode(DynamicsProcessor::Mode::Compressor);

    limiter_.prepare(sampleRate_, bufferSize_, 2);
    limiter_.setMode(DynamicsProcessor::Mode::Limiter);
    limiter_.setThreshold(-1.0f);  // Default limiter ceiling

    gate_.prepare(sampleRate_, bufferSize_, 2);
    gate_.setMode(DynamicsProcessor::Mode::NoiseGate);

    // Initialize EQ processor
    eq_.prepare(sampleRate_, bufferSize_, 2);

#ifdef HAS_NAM
    // Initialize Neural Amp Modeler processor
    namProcessor_.prepare(sampleRate_, bufferSize_);
    std::cout << "  NAM (Neural Amp Modeler): Available" << std::endl;
#endif

    // Initialize modulation processors
    chorus_.prepare(sampleRate_, bufferSize_, 2);
    phaser_.prepare(sampleRate_, bufferSize_, 2);
    pitchShifter_.prepare(sampleRate_, bufferSize_, 2);
    intellifx_.prepare(sampleRate_, bufferSize_, 2);
    shoegaze_.prepare(sampleRate_, bufferSize_, 2);
    lexiLove_.prepare(sampleRate_, bufferSize_, 2);
    h3000_.prepare(sampleRate_, bufferSize_, 2);
    peavey5150_.prepare(sampleRate_, bufferSize_, 2);
    tweedBassman_.prepare(sampleRate_, bufferSize_, 2);
    passionFX_.prepare(sampleRate_, bufferSize_, 2);
    std::cout << "  Modulation processors: Chorus, Phaser, Pitch Shifter, IntelliFX 8-Voice, ShoeGaze, LexiLove, H3000, Peavey5150, TweedBassman, PassionFX" << std::endl;

    // Set up audio callback
    audioIO_.setProcessCallback([this](const float* const* inputs, int numInputs,
                                       float* const* outputs, int numOutputs,
                                       int numSamples) {
        audioCallback(inputs, numInputs, outputs, numOutputs, numSamples);
    });

    initialized_ = true;

    std::cout << "MAP2 Audio Engine initialized successfully" << std::endl;
    std::cout << "  Sample Rate: " << sampleRate_ << " Hz" << std::endl;
    std::cout << "  Buffer Size: " << bufferSize_ << " samples" << std::endl;
    std::cout << "  Audio Device: " << audioIO_.getCurrentDeviceName() << std::endl;
    std::cout << "  Plugins Found: " << pluginHost_.discoverPlugins().size() << std::endl;

    return true;
}

void Map2AudioEngine::shutdown() {
    if (!initialized_) return;

    std::cout << "Shutting down MAP2 Audio Engine" << std::endl;

    stopAudio();
    midiHandler_.shutdown();
    pluginHost_.shutdown();
    audioIO_.shutdown();

    initialized_ = false;
}

Map2AudioEngine::SystemInfo Map2AudioEngine::getSystemInfo() const {
    SystemInfo info;
    info.version = ENGINE_VERSION;
    info.sampleRate = sampleRate_;
    info.bufferSize = bufferSize_;
    info.audioDevice = audioIO_.getCurrentDeviceName();
    info.lv2Path = lv2Path_;
    info.running = initialized_;
    info.audioRunning = audioRunning_;
    info.pluginCount = static_cast<int>(pluginHost_.discoverPlugins().size());
    info.midiEnabled = midiHandler_.isEnabled();
    info.totalLatencySamples = getTotalLatencySamples();
    info.totalLatencyMs = getTotalLatencyMs();
    return info;
}

bool Map2AudioEngine::startAudio() {
    if (!initialized_ || audioRunning_) return false;

    if (!audioIO_.startAudio()) {
        std::cerr << "Failed to start audio" << std::endl;
        return false;
    }

    audioRunning_ = true;
    std::cout << "Audio processing started" << std::endl;
    return true;
}

bool Map2AudioEngine::stopAudio() {
    if (!audioRunning_) return false;

    audioIO_.stopAudio();
    audioRunning_ = false;

    std::cout << "Audio processing stopped" << std::endl;
    return true;
}

void Map2AudioEngine::audioCallback(const float* const* inputs, int numInputs,
                                    float* const* outputs, int numOutputs,
                                    int numSamples) {
    // Start CPU measurement
    cpuMonitor_.beginCallback();

    // Create JUCE buffers
    juce::AudioBuffer<float> buffer(numOutputs, numSamples);
    juce::MidiBuffer midiBuffer;

    // Copy input to buffer
    for (int ch = 0; ch < std::min(numInputs, numOutputs); ++ch) {
        if (inputs[ch] != nullptr) {
            buffer.copyFrom(ch, 0, inputs[ch], numSamples);
        }
    }

    // Process parameter updates from queue
    parameterBridge_.processQueue([this](const ParameterUpdate& update) {
        pluginHost_.setParameter(update.pluginId, update.paramIndex, update.value);
    });

    // Process through plugin graph (includes automatic PDC)
    audioGraph_->process(buffer, midiBuffer);

#ifdef HAS_NAM
    // Process Neural Amp Modeler (before cabinet IR)
    namProcessor_.process(buffer);
#endif

    // Process modulation effects
    pitchShifter_.process(buffer);   // Pitch shift first
    chorus_.process(buffer);          // Then chorus
    phaser_.process(buffer);          // Then phaser
    intellifx_.process(buffer);       // IntelliFX 8-voice chorus

    // Process cabinet IR (if loaded)
    if (cabinetProcessor_.isIRLoaded()) {
        cabinetProcessor_.process(buffer);
    }

    // Process EQ
    eq_.process(buffer);

    // Process dynamics chain: Gate -> Compressor -> Limiter
    gate_.process(buffer);
    compressor_.process(buffer);
    limiter_.process(buffer);

    // Process reverb IR (if loaded) - at end of chain
    if (reverbProcessor_.isIRLoaded()) {
        reverbProcessor_.process(buffer);
    }

    // Update metering
    spectrumAnalyzer_.pushBuffer(buffer);
    lufsMeter_.process(buffer);

    if (numOutputs >= 2) {
        phaseCorrelation_.process(buffer.getReadPointer(0),
                                  buffer.getReadPointer(1),
                                  numSamples);
        masterVuMeter_.process(buffer.getReadPointer(0),
                              buffer.getReadPointer(1),
                              numSamples);
    }

    // Copy output
    for (int ch = 0; ch < numOutputs; ++ch) {
        if (outputs[ch] != nullptr) {
            std::copy_n(buffer.getReadPointer(ch), numSamples, outputs[ch]);
        }
    }

    // End CPU measurement
    cpuMonitor_.endCallback();
}

// ========================================
// Configuration
// ========================================

void Map2AudioEngine::setSampleRate(double rate) {
    sampleRate_ = rate;
    if (initialized_) {
        audioIO_.setSampleRate(rate);
        audioGraph_->setSampleRate(rate);
        // Fix #4: Use unified prepare method instead of individual calls
        prepareAllProcessors(rate, bufferSize_, 2);
    }
}

void Map2AudioEngine::setBufferSize(int size) {
    bufferSize_ = size;
    if (initialized_) {
        audioIO_.setBufferSize(size);
        audioGraph_->setBufferSize(size);
        // Fix #4: Use unified prepare method instead of individual calls
        prepareAllProcessors(sampleRate_, size, 2);
    }
}

// Fix #4: Unified processor preparation to avoid redundant calls
void Map2AudioEngine::prepareAllProcessors(double sampleRate, int bufferSize, int numChannels) {
    // Prepare all processors in optimal order
    // This reduces redundant initialization overhead
    spectrumAnalyzer_.prepare(sampleRate);
    lufsMeter_.prepare(sampleRate, numChannels);
    phaseCorrelation_.prepare(sampleRate);
    cpuMonitor_.prepare(sampleRate, bufferSize);
    
    // Convolution processors
    cabinetProcessor_.prepare(sampleRate, bufferSize, numChannels);
    reverbProcessor_.prepare(sampleRate, bufferSize, numChannels);
    
    // Dynamics chain
    compressor_.prepare(sampleRate, bufferSize, numChannels);
    limiter_.prepare(sampleRate, bufferSize, numChannels);
    gate_.prepare(sampleRate, bufferSize, numChannels);
    
    // EQ
    eq_.prepare(sampleRate, bufferSize, numChannels);
    
#ifdef HAS_NAM
    namProcessor_.prepare(sampleRate, bufferSize);
#endif
    
    // Modulation effects
    chorus_.prepare(sampleRate, bufferSize, numChannels);
    phaser_.prepare(sampleRate, bufferSize, numChannels);
    pitchShifter_.prepare(sampleRate, bufferSize, numChannels);
    intellifx_.prepare(sampleRate, bufferSize, numChannels);
}

void Map2AudioEngine::setAudioDevice(const std::string& device) {
    audioDevice_ = device;
    if (initialized_) {
        audioIO_.setDevice(device);
    }
}

void Map2AudioEngine::setLv2Path(const std::string& path) {
    lv2Path_ = path;
}

void Map2AudioEngine::setNumInputChannels(int channels) {
    numInputChannels_ = std::max(1, std::min(channels, 32));  // Clamp to 1-32
}

void Map2AudioEngine::setNumOutputChannels(int channels) {
    numOutputChannels_ = std::max(1, std::min(channels, 32));  // Clamp to 1-32
}

// ========================================
// Plugin Management
// ========================================

std::vector<PluginInfo> Map2AudioEngine::listPlugins() const {
    return pluginHost_.discoverPlugins(PluginFormat::All);
}

std::vector<PluginInfo> Map2AudioEngine::listPlugins(PluginFormat format) const {
    return pluginHost_.discoverPlugins(format);
}

std::optional<PluginInfo> Map2AudioEngine::getPluginInfo(const std::string& uri) const {
    return pluginHost_.getPluginInfo(uri);
}

InstanceId Map2AudioEngine::loadPlugin(const std::string& uri) {
    InstanceId id = pluginHost_.loadPlugin(uri, sampleRate_, bufferSize_);
    if (id != INVALID_INSTANCE_ID) {
        audioGraph_->addPlugin(id);
    }
    return id;
}

bool Map2AudioEngine::unloadPlugin(InstanceId instanceId) {
    audioGraph_->removePlugin(instanceId);
    cpuMonitor_.removePlugin(instanceId);
    return pluginHost_.unloadPlugin(instanceId);
}

void Map2AudioEngine::scanForPlugins(bool rescanAll) {
    pluginHost_.scanForPlugins(rescanAll);
}

// ========================================
// Chain Management
// ========================================

std::vector<InstanceId> Map2AudioEngine::getChainOrder() const {
    return audioGraph_->getChainOrder();
}

bool Map2AudioEngine::addToChain(InstanceId instanceId, int position) {
    return audioGraph_->addPlugin(instanceId, position);
}

bool Map2AudioEngine::removeFromChain(InstanceId instanceId) {
    return audioGraph_->removePlugin(instanceId);
}

bool Map2AudioEngine::reorderChain(const std::vector<InstanceId>& order) {
    return audioGraph_->reorderPlugins(order);
}

// ========================================
// Sidechain Routing
// ========================================

bool Map2AudioEngine::connectSidechain(InstanceId source, InstanceId dest, int destBus) {
    return audioGraph_->connectSidechain(source, dest, destBus);
}

bool Map2AudioEngine::disconnectSidechain(InstanceId dest, int destBus) {
    return audioGraph_->disconnectSidechain(dest, destBus);
}

std::vector<SidechainConnection> Map2AudioEngine::getSidechainConnections() const {
    return audioGraph_->getSidechainConnections();
}

// ========================================
// Parameters
// ========================================

bool Map2AudioEngine::setParameter(InstanceId instanceId, int paramIndex, float value) {
    return parameterBridge_.queueParameterChange(instanceId, paramIndex, value);
}

bool Map2AudioEngine::setParameterByName(InstanceId instanceId, const std::string& name, float value) {
    return pluginHost_.setParameterByName(instanceId, name, value);
}

float Map2AudioEngine::getParameter(InstanceId instanceId, int paramIndex) const {
    return pluginHost_.getParameter(instanceId, paramIndex);
}

float Map2AudioEngine::getParameterByName(InstanceId instanceId, const std::string& name) const {
    return pluginHost_.getParameterByName(instanceId, name);
}

bool Map2AudioEngine::setBypass(InstanceId instanceId, bool bypass) {
    return pluginHost_.setBypass(instanceId, bypass);
}

// ========================================
// Snapshots
// ========================================

int Map2AudioEngine::getCurrentSnapshot() const {
    return snapshotManager_->getCurrentSnapshot();
}

bool Map2AudioEngine::loadSnapshot(int snapshotId) {
    return snapshotManager_->loadSnapshot(snapshotId);
}

bool Map2AudioEngine::saveSnapshot(int snapshotId, const std::string& name) {
    return snapshotManager_->saveSnapshot(snapshotId, name);
}

std::vector<Snapshot> Map2AudioEngine::listSnapshots() const {
    return snapshotManager_->listSnapshots();
}

// ========================================
// MIDI
// ========================================

bool Map2AudioEngine::enableMidi(bool enable) {
    midiHandler_.setEnabled(enable);
    return true;
}

bool Map2AudioEngine::isMidiEnabled() const {
    return midiHandler_.isEnabled();
}

std::vector<std::string> Map2AudioEngine::getMidiDevices() const {
    return midiHandler_.getInputDevices();
}

bool Map2AudioEngine::setMidiDevice(const std::string& device) {
    return midiHandler_.openInputDevice(device);
}

// ========================================
// VU Meters (Legacy)
// ========================================

VuLevels Map2AudioEngine::getVuLevels() const {
    return audioGraph_->getOutputVu();
}

std::map<InstanceId, VuLevels> Map2AudioEngine::getPluginVuLevels() const {
    return audioGraph_->getPluginVuLevels();
}

// ========================================
// Advanced Metering
// ========================================

SpectrumAnalyzer::SpectrumData Map2AudioEngine::getSpectrum() const {
    return spectrumAnalyzer_.getSpectrum();
}

std::vector<float> Map2AudioEngine::getSpectrumMagnitudes() const {
    return spectrumAnalyzer_.getMagnitudes();
}

std::vector<float> Map2AudioEngine::getSpectrumFrequencies() const {
    return spectrumAnalyzer_.getFrequencies();
}

LufsLevels Map2AudioEngine::getLufsLevels() const {
    return lufsMeter_.getLevels();
}

void Map2AudioEngine::resetIntegratedLoudness() {
    lufsMeter_.resetIntegrated();
}

float Map2AudioEngine::getPhaseCorrelation() const {
    return phaseCorrelation_.getCorrelation();
}

float Map2AudioEngine::getStereoBalance() const {
    return phaseCorrelation_.getBalance();
}

float Map2AudioEngine::getStereoWidth() const {
    return phaseCorrelation_.getStereoWidth();
}

// ========================================
// CPU Monitoring
// ========================================

CPUMetrics Map2AudioEngine::getCpuMetrics() const {
    return cpuMonitor_.getMetrics();
}

double Map2AudioEngine::getTotalCpu() const {
    return cpuMonitor_.getTotalCpu();
}

double Map2AudioEngine::getPluginCpu(InstanceId instanceId) const {
    return cpuMonitor_.getPluginCpu(instanceId);
}

int Map2AudioEngine::getXRunCount() const {
    return cpuMonitor_.getXRunCount();
}

// ========================================
// Latency
// ========================================

int Map2AudioEngine::getTotalLatencySamples() const {
    return audioGraph_->getTotalLatency();
}

double Map2AudioEngine::getTotalLatencyMs() const {
    return audioGraph_->getTotalLatencyMs();
}

std::map<InstanceId, int> Map2AudioEngine::getPerPluginLatency() const {
    return audioGraph_->getPerPluginLatency();
}

// ========================================
// Convolution
// ========================================

bool Map2AudioEngine::loadCabinetIR(const std::string& path) {
    return cabinetProcessor_.loadImpulseResponse(path);
}

bool Map2AudioEngine::loadReverbIR(const std::string& path) {
    return reverbProcessor_.loadImpulseResponse(path);
}

void Map2AudioEngine::unloadCabinetIR() {
    cabinetProcessor_.unloadImpulseResponse();
}

void Map2AudioEngine::unloadReverbIR() {
    reverbProcessor_.unloadImpulseResponse();
}

void Map2AudioEngine::setCabinetMix(float mix) {
    cabinetProcessor_.setDryWetMix(mix);
}

void Map2AudioEngine::setReverbMix(float mix) {
    reverbProcessor_.setDryWetMix(mix);
}

void Map2AudioEngine::setCabinetBypass(bool bypass) {
    cabinetProcessor_.setBypass(bypass);
}

void Map2AudioEngine::setReverbBypass(bool bypass) {
    reverbProcessor_.setBypass(bypass);
}

ConvolutionProcessor::IRInfo Map2AudioEngine::getCabinetIRInfo() const {
    return cabinetProcessor_.getIRInfo();
}

ConvolutionProcessor::IRInfo Map2AudioEngine::getReverbIRInfo() const {
    return reverbProcessor_.getIRInfo();
}

// ========================================
// Dynamics - Compressor
// ========================================

void Map2AudioEngine::setCompressorThreshold(float dB) {
    compressor_.setThreshold(dB);
}

void Map2AudioEngine::setCompressorRatio(float ratio) {
    compressor_.setRatio(ratio);
}

void Map2AudioEngine::setCompressorAttack(float ms) {
    compressor_.setAttack(ms);
}

void Map2AudioEngine::setCompressorRelease(float ms) {
    compressor_.setRelease(ms);
}

void Map2AudioEngine::setCompressorKnee(float dB) {
    compressor_.setKnee(dB);
}

void Map2AudioEngine::setCompressorMakeupGain(float dB) {
    compressor_.setMakeupGain(dB);
}

void Map2AudioEngine::setCompressorAutoMakeup(bool enabled) {
    compressor_.setAutoMakeup(enabled);
}

void Map2AudioEngine::setCompressorBypass(bool bypass) {
    compressor_.setBypass(bypass);
}

DynamicsProcessor::Parameters Map2AudioEngine::getCompressorParameters() const {
    return compressor_.getParameters();
}

void Map2AudioEngine::setCompressorParameters(const DynamicsProcessor::Parameters& params) {
    compressor_.setParameters(params);
}

DynamicsProcessor::Metering Map2AudioEngine::getCompressorMetering() const {
    return compressor_.getMetering();
}

// ========================================
// Dynamics - Limiter
// ========================================

void Map2AudioEngine::setLimiterThreshold(float dB) {
    limiter_.setThreshold(dB);
}

void Map2AudioEngine::setLimiterRelease(float ms) {
    limiter_.setRelease(ms);
}

void Map2AudioEngine::setLimiterBypass(bool bypass) {
    limiter_.setBypass(bypass);
}

DynamicsProcessor::Parameters Map2AudioEngine::getLimiterParameters() const {
    return limiter_.getParameters();
}

DynamicsProcessor::Metering Map2AudioEngine::getLimiterMetering() const {
    return limiter_.getMetering();
}

// ========================================
// Dynamics - Noise Gate
// ========================================

void Map2AudioEngine::setGateThreshold(float dB) {
    gate_.setThreshold(dB);
}

void Map2AudioEngine::setGateRatio(float ratio) {
    gate_.setRatio(ratio);
}

void Map2AudioEngine::setGateAttack(float ms) {
    gate_.setAttack(ms);
}

void Map2AudioEngine::setGateRelease(float ms) {
    gate_.setRelease(ms);
}

void Map2AudioEngine::setGateBypass(bool bypass) {
    gate_.setBypass(bypass);
}

DynamicsProcessor::Parameters Map2AudioEngine::getGateParameters() const {
    return gate_.getParameters();
}

DynamicsProcessor::Metering Map2AudioEngine::getGateMetering() const {
    return gate_.getMetering();
}

// ========================================
// EQ / Filter Processing
// ========================================

void Map2AudioEngine::setEQBand(int bandIndex, const FilterProcessor::BandParameters& params) {
    eq_.setBand(bandIndex, params);
}

void Map2AudioEngine::setEQBandFrequency(int bandIndex, float hz) {
    eq_.setBandFrequency(bandIndex, hz);
}

void Map2AudioEngine::setEQBandGain(int bandIndex, float dB) {
    eq_.setBandGain(bandIndex, dB);
}

void Map2AudioEngine::setEQBandQ(int bandIndex, float q) {
    eq_.setBandQ(bandIndex, q);
}

void Map2AudioEngine::setEQBandType(int bandIndex, FilterProcessor::FilterType type) {
    eq_.setBandType(bandIndex, type);
}

void Map2AudioEngine::setEQBandEnabled(int bandIndex, bool enabled) {
    eq_.setBandEnabled(bandIndex, enabled);
}

FilterProcessor::BandParameters Map2AudioEngine::getEQBand(int bandIndex) const {
    return eq_.getBand(bandIndex);
}

void Map2AudioEngine::setEQOutputGain(float dB) {
    eq_.setOutputGain(dB);
}

float Map2AudioEngine::getEQOutputGain() const {
    return eq_.getOutputGain();
}

void Map2AudioEngine::setEQBypass(bool bypass) {
    eq_.setBypass(bypass);
}

bool Map2AudioEngine::isEQBypassed() const {
    return eq_.isBypassed();
}

FilterProcessor::Parameters Map2AudioEngine::getEQParameters() const {
    return eq_.getParameters();
}

void Map2AudioEngine::setEQParameters(const FilterProcessor::Parameters& params) {
    eq_.setParameters(params);
}

std::vector<float> Map2AudioEngine::getEQFrequencyResponse(const std::vector<float>& frequencies) const {
    return eq_.getFrequencyResponse(frequencies);
}

// ========================================
// Neural Amp Modeler
// ========================================

bool Map2AudioEngine::isNAMAvailable() const {
#ifdef HAS_NAM
    return true;
#else
    return false;
#endif
}

bool Map2AudioEngine::loadNAMModel(const std::string& path) {
#ifdef HAS_NAM
    return namProcessor_.loadModel(path);
#else
    (void)path;
    return false;
#endif
}

void Map2AudioEngine::unloadNAMModel() {
#ifdef HAS_NAM
    namProcessor_.unloadModel();
#endif
}

bool Map2AudioEngine::isNAMModelLoaded() const {
#ifdef HAS_NAM
    return namProcessor_.isModelLoaded();
#else
    return false;
#endif
}

bool Map2AudioEngine::isNAMLoading() const {
#ifdef HAS_NAM
    return namProcessor_.isLoading();
#else
    return false;
#endif
}

NAMModelInfo Map2AudioEngine::getNAMModelInfo() const {
#ifdef HAS_NAM
    return namProcessor_.getModelInfo();
#else
    return NAMModelInfo();
#endif
}

void Map2AudioEngine::setNAMInputGain(float dB) {
#ifdef HAS_NAM
    namProcessor_.setInputGain(dB);
#else
    (void)dB;
#endif
}

float Map2AudioEngine::getNAMInputGain() const {
#ifdef HAS_NAM
    return namProcessor_.getInputGain();
#else
    return 0.0f;
#endif
}

void Map2AudioEngine::setNAMOutputGain(float dB) {
#ifdef HAS_NAM
    namProcessor_.setOutputGain(dB);
#else
    (void)dB;
#endif
}

float Map2AudioEngine::getNAMOutputGain() const {
#ifdef HAS_NAM
    return namProcessor_.getOutputGain();
#else
    return 0.0f;
#endif
}

void Map2AudioEngine::setNAMBypass(bool bypass) {
#ifdef HAS_NAM
    namProcessor_.setBypass(bypass);
#else
    (void)bypass;
#endif
}

bool Map2AudioEngine::isNAMBypassed() const {
#ifdef HAS_NAM
    return namProcessor_.isBypassed();
#else
    return true;
#endif
}

void Map2AudioEngine::setNAMNormalize(bool normalize) {
#ifdef HAS_NAM
    namProcessor_.setNormalize(normalize);
#else
    (void)normalize;
#endif
}

bool Map2AudioEngine::isNAMNormalized() const {
#ifdef HAS_NAM
    return namProcessor_.isNormalized();
#else
    return false;
#endif
}

float Map2AudioEngine::getNAMInputLevel() const {
#ifdef HAS_NAM
    return namProcessor_.getInputLevel();
#else
    return -100.0f;
#endif
}

float Map2AudioEngine::getNAMOutputLevel() const {
#ifdef HAS_NAM
    return namProcessor_.getOutputLevel();
#else
    return -100.0f;
#endif
}

// ========================================
// Chorus Processing
// ========================================

void Map2AudioEngine::setChorusRate(float hz) {
    chorus_.setRate(hz);
}

float Map2AudioEngine::getChorusRate() const {
    return chorus_.getRate();
}

void Map2AudioEngine::setChorusDepth(float depth) {
    chorus_.setDepth(depth);
}

float Map2AudioEngine::getChorusDepth() const {
    return chorus_.getDepth();
}

void Map2AudioEngine::setChorusCentreDelay(float ms) {
    chorus_.setCentreDelay(ms);
}

float Map2AudioEngine::getChorusCentreDelay() const {
    return chorus_.getCentreDelay();
}

void Map2AudioEngine::setChorusFeedback(float feedback) {
    chorus_.setFeedback(feedback);
}

float Map2AudioEngine::getChorusFeedback() const {
    return chorus_.getFeedback();
}

void Map2AudioEngine::setChorusMix(float mix) {
    chorus_.setMix(mix);
}

float Map2AudioEngine::getChorusMix() const {
    return chorus_.getMix();
}

void Map2AudioEngine::setChorusSpread(float spread) {
    chorus_.setSpread(spread);
}

float Map2AudioEngine::getChorusSpread() const {
    return chorus_.getSpread();
}

void Map2AudioEngine::setChorusBypass(bool bypass) {
    chorus_.setBypass(bypass);
}

bool Map2AudioEngine::isChorusBypassed() const {
    return chorus_.isBypassed();
}

ChorusProcessor::Parameters Map2AudioEngine::getChorusParameters() const {
    return chorus_.getParameters();
}

void Map2AudioEngine::setChorusParameters(const ChorusProcessor::Parameters& params) {
    chorus_.setParameters(params);
}

ChorusProcessor::Metering Map2AudioEngine::getChorusMetering() const {
    return chorus_.getMetering();
}

// ========================================
// Phaser Processing
// ========================================

void Map2AudioEngine::setPhaserRate(float hz) {
    phaser_.setRate(hz);
}

float Map2AudioEngine::getPhaserRate() const {
    return phaser_.getRate();
}

void Map2AudioEngine::setPhaserDepth(float depth) {
    phaser_.setDepth(depth);
}

float Map2AudioEngine::getPhaserDepth() const {
    return phaser_.getDepth();
}

void Map2AudioEngine::setPhaserCentreFrequency(float hz) {
    phaser_.setCentreFrequency(hz);
}

float Map2AudioEngine::getPhaserCentreFrequency() const {
    return phaser_.getCentreFrequency();
}

void Map2AudioEngine::setPhaserFeedback(float feedback) {
    phaser_.setFeedback(feedback);
}

float Map2AudioEngine::getPhaserFeedback() const {
    return phaser_.getFeedback();
}

void Map2AudioEngine::setPhaserMix(float mix) {
    phaser_.setMix(mix);
}

float Map2AudioEngine::getPhaserMix() const {
    return phaser_.getMix();
}

void Map2AudioEngine::setPhaserBypass(bool bypass) {
    phaser_.setBypass(bypass);
}

bool Map2AudioEngine::isPhaserBypassed() const {
    return phaser_.isBypassed();
}

PhaserProcessor::Parameters Map2AudioEngine::getPhaserParameters() const {
    return phaser_.getParameters();
}

void Map2AudioEngine::setPhaserParameters(const PhaserProcessor::Parameters& params) {
    phaser_.setParameters(params);
}

PhaserProcessor::Metering Map2AudioEngine::getPhaserMetering() const {
    return phaser_.getMetering();
}

// ========================================
// Pitch Shifter / EVH Harmonizer
// ========================================

void Map2AudioEngine::setPitchShifterPitchL(float cents) {
    pitchShifter_.setPitchL(cents);
}

float Map2AudioEngine::getPitchShifterPitchL() const {
    return pitchShifter_.getPitchL();
}

void Map2AudioEngine::setPitchShifterPitchR(float cents) {
    pitchShifter_.setPitchR(cents);
}

float Map2AudioEngine::getPitchShifterPitchR() const {
    return pitchShifter_.getPitchR();
}

void Map2AudioEngine::setPitchShifterDelayL(float ms) {
    pitchShifter_.setDelayL(ms);
}

float Map2AudioEngine::getPitchShifterDelayL() const {
    return pitchShifter_.getDelayL();
}

void Map2AudioEngine::setPitchShifterDelayR(float ms) {
    pitchShifter_.setDelayR(ms);
}

float Map2AudioEngine::getPitchShifterDelayR() const {
    return pitchShifter_.getDelayR();
}

void Map2AudioEngine::setPitchShifterFeedback(float feedback) {
    pitchShifter_.setFeedback(feedback);
}

float Map2AudioEngine::getPitchShifterFeedback() const {
    return pitchShifter_.getFeedback();
}

void Map2AudioEngine::setPitchShifterMix(float percent) {
    pitchShifter_.setMix(percent);
}

float Map2AudioEngine::getPitchShifterMix() const {
    return pitchShifter_.getMix();
}

void Map2AudioEngine::setPitchShifterSpread(float percent) {
    pitchShifter_.setSpread(percent);
}

float Map2AudioEngine::getPitchShifterSpread() const {
    return pitchShifter_.getSpread();
}

void Map2AudioEngine::setPitchShifterPreset(PitchShifterProcessor::Preset preset) {
    pitchShifter_.setPreset(preset);
}

PitchShifterProcessor::Preset Map2AudioEngine::getPitchShifterPreset() const {
    return pitchShifter_.getPreset();
}

void Map2AudioEngine::setPitchShifterBypass(bool bypass) {
    pitchShifter_.setBypass(bypass);
}

bool Map2AudioEngine::isPitchShifterBypassed() const {
    return pitchShifter_.isBypassed();
}

PitchShifterProcessor::Parameters Map2AudioEngine::getPitchShifterParameters() const {
    return pitchShifter_.getParameters();
}

void Map2AudioEngine::setPitchShifterParameters(const PitchShifterProcessor::Parameters& params) {
    pitchShifter_.setParameters(params);
}

PitchShifterProcessor::Metering Map2AudioEngine::getPitchShifterMetering() const {
    return pitchShifter_.getMetering();
}

// ========================================
// IntelliFX 8-Voice Chorus
// ========================================

// Voice parameters
void Map2AudioEngine::setIntelliFXVoiceLevel(int voice, float dB) {
    intellifx_.setVoiceLevel(voice, dB);
}

float Map2AudioEngine::getIntelliFXVoiceLevel(int voice) const {
    return intellifx_.getVoiceLevel(voice);
}

void Map2AudioEngine::setIntelliFXVoicePan(int voice, float pan) {
    intellifx_.setVoicePan(voice, pan);
}

float Map2AudioEngine::getIntelliFXVoicePan(int voice) const {
    return intellifx_.getVoicePan(voice);
}

void Map2AudioEngine::setIntelliFXVoiceDelay(int voice, float ms) {
    intellifx_.setVoiceDelay(voice, ms);
}

float Map2AudioEngine::getIntelliFXVoiceDelay(int voice) const {
    return intellifx_.getVoiceDelay(voice);
}

void Map2AudioEngine::setIntelliFXVoiceDepth(int voice, float depth) {
    intellifx_.setVoiceDepth(voice, depth);
}

float Map2AudioEngine::getIntelliFXVoiceDepth(int voice) const {
    return intellifx_.getVoiceDepth(voice);
}

void Map2AudioEngine::setIntelliFXVoiceRate(int voice, float rate) {
    intellifx_.setVoiceRate(voice, rate);
}

float Map2AudioEngine::getIntelliFXVoiceRate(int voice) const {
    return intellifx_.getVoiceRate(voice);
}

IntelliFX8VoiceChorusProcessor::VoiceParameters
Map2AudioEngine::getIntelliFXVoiceParameters(int voice) const {
    return intellifx_.getVoiceParameters(voice);
}

void Map2AudioEngine::setIntelliFXVoiceParameters(
    int voice, const IntelliFX8VoiceChorusProcessor::VoiceParameters& params) {
    intellifx_.setVoiceParameters(voice, params);
}

// Global mixer
void Map2AudioEngine::setIntelliFXChorusLevel(float dB) {
    intellifx_.setChorusLevel(dB);
}

float Map2AudioEngine::getIntelliFXChorusLevel() const {
    return intellifx_.getChorusLevel();
}

void Map2AudioEngine::setIntelliFXDirectLevelL(float dB) {
    intellifx_.setDirectLevelL(dB);
}

float Map2AudioEngine::getIntelliFXDirectLevelL() const {
    return intellifx_.getDirectLevelL();
}

void Map2AudioEngine::setIntelliFXDirectLevelR(float dB) {
    intellifx_.setDirectLevelR(dB);
}

float Map2AudioEngine::getIntelliFXDirectLevelR() const {
    return intellifx_.getDirectLevelR();
}

void Map2AudioEngine::setIntelliFXRegenL(float dB) {
    intellifx_.setRegenL(dB);
}

float Map2AudioEngine::getIntelliFXRegenL() const {
    return intellifx_.getRegenL();
}

void Map2AudioEngine::setIntelliFXRegenR(float dB) {
    intellifx_.setRegenR(dB);
}

float Map2AudioEngine::getIntelliFXRegenR() const {
    return intellifx_.getRegenR();
}

// HUSH
void Map2AudioEngine::setIntelliFXHushEnabled(bool enabled) {
    intellifx_.setHushEnabled(enabled);
}

bool Map2AudioEngine::isIntelliFXHushEnabled() const {
    return intellifx_.isHushEnabled();
}

void Map2AudioEngine::setIntelliFXHushThreshold(float dB) {
    intellifx_.setHushThreshold(dB);
}

float Map2AudioEngine::getIntelliFXHushThreshold() const {
    return intellifx_.getHushThreshold();
}

void Map2AudioEngine::setIntelliFXHushReleaseRate(float ms) {
    intellifx_.setHushReleaseRate(ms);
}

float Map2AudioEngine::getIntelliFXHushReleaseRate() const {
    return intellifx_.getHushReleaseRate();
}

IntelliFX8VoiceChorusProcessor::HushParameters
Map2AudioEngine::getIntelliFXHushParameters() const {
    return intellifx_.getHushParameters();
}

void Map2AudioEngine::setIntelliFXHushParameters(
    const IntelliFX8VoiceChorusProcessor::HushParameters& params) {
    intellifx_.setHushParameters(params);
}

// Master control
void Map2AudioEngine::setIntelliFXBypass(bool bypass) {
    intellifx_.setBypass(bypass);
}

bool Map2AudioEngine::isIntelliFXBypassed() const {
    return intellifx_.isBypassed();
}

// Bulk parameters
IntelliFX8VoiceChorusProcessor::Parameters
Map2AudioEngine::getIntelliFXParameters() const {
    return intellifx_.getParameters();
}

void Map2AudioEngine::setIntelliFXParameters(
    const IntelliFX8VoiceChorusProcessor::Parameters& params) {
    intellifx_.setParameters(params);
}

// Presets
int Map2AudioEngine::getIntelliFXNumPresets() {
    return IntelliFX8VoiceChorusProcessor::getNumPresets();
}

IntelliFX8VoiceChorusProcessor::PresetInfo
Map2AudioEngine::getIntelliFXPresetInfo(int index) {
    return IntelliFX8VoiceChorusProcessor::getPresetInfo(index);
}

void Map2AudioEngine::loadIntelliFXPreset(int index) {
    intellifx_.loadPreset(index);
}

int Map2AudioEngine::getIntelliFXCurrentPreset() const {
    return intellifx_.getCurrentPreset();
}

// Metering
IntelliFX8VoiceChorusProcessor::Metering
Map2AudioEngine::getIntelliFXMetering() const {
    return intellifx_.getMetering();
}

// ========================================
// Boss XS-1 Polyphonic Pitch Shifter
// ========================================

void Map2AudioEngine::setBossXS1ShiftAmount(float semitones) {
    auto params = bossXS1_.getParameters();
    params.shiftAmount = semitones;
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1ShiftAmount() const {
    return bossXS1_.getParameters().shiftAmount;
}

void Map2AudioEngine::setBossXS1Balance(float percent) {
    auto params = bossXS1_.getParameters();
    params.balance = percent;
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1Balance() const {
    return bossXS1_.getParameters().balance;
}

void Map2AudioEngine::setBossXS1DetuneMode(bool enabled) {
    auto params = bossXS1_.getParameters();
    params.detuneMode = enabled;
    bossXS1_.setParameters(params);
}

bool Map2AudioEngine::isBossXS1DetuneMode() const {
    return bossXS1_.getParameters().detuneMode;
}

void Map2AudioEngine::setBossXS1DetuneAmount(float cents) {
    auto params = bossXS1_.getParameters();
    params.detuneAmount = cents;
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1DetuneAmount() const {
    return bossXS1_.getParameters().detuneAmount;
}

void Map2AudioEngine::setBossXS1Glide(float ms) {
    auto params = bossXS1_.getParameters();
    params.glide = ms;
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1Glide() const {
    return bossXS1_.getParameters().glide;
}

void Map2AudioEngine::setBossXS1Feedback(float feedback) {
    auto params = bossXS1_.getParameters();
    params.feedback = feedback;
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1Feedback() const {
    return bossXS1_.getParameters().feedback;
}

void Map2AudioEngine::setBossXS1PedalEnabled(bool enabled) {
    auto params = bossXS1_.getParameters();
    params.pedalEnabled = enabled;
    bossXS1_.setParameters(params);
}

bool Map2AudioEngine::isBossXS1PedalEnabled() const {
    return bossXS1_.getParameters().pedalEnabled;
}

void Map2AudioEngine::setBossXS1PedalPosition(float position) {
    auto params = bossXS1_.getParameters();
    params.pedalPosition = position;
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1PedalPosition() const {
    return bossXS1_.getParameters().pedalPosition;
}

void Map2AudioEngine::setBossXS1PedalRange(float minSemitones, float maxSemitones) {
    auto params = bossXS1_.getParameters();
    params.pedalMin = minSemitones;
    params.pedalMax = maxSemitones;
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1PedalMin() const {
    return bossXS1_.getParameters().pedalMin;
}

float Map2AudioEngine::getBossXS1PedalMax() const {
    return bossXS1_.getParameters().pedalMax;
}

void Map2AudioEngine::setBossXS1Preset(BossXS1PolyShifterProcessor::Preset preset) {
    bossXS1_.loadPreset(preset);
}

BossXS1PolyShifterProcessor::Preset Map2AudioEngine::getBossXS1Preset() const {
    return bossXS1_.getParameters().preset;
}

void Map2AudioEngine::setBossXS1Bypass(bool bypass) {
    auto params = bossXS1_.getParameters();
    params.bypass = bypass;
    bossXS1_.setParameters(params);
}

bool Map2AudioEngine::isBossXS1Bypassed() const {
    return bossXS1_.getParameters().bypass;
}

BossXS1PolyShifterProcessor::Parameters Map2AudioEngine::getBossXS1Parameters() const {
    return bossXS1_.getParameters();
}

void Map2AudioEngine::setBossXS1Parameters(const BossXS1PolyShifterProcessor::Parameters& params) {
    bossXS1_.setParameters(params);
}

float Map2AudioEngine::getBossXS1InputLevel() const {
    return bossXS1_.getInputLevel();
}

float Map2AudioEngine::getBossXS1OutputLevel() const {
    return bossXS1_.getOutputLevel();
}

const char* Map2AudioEngine::getBossXS1PresetName(BossXS1PolyShifterProcessor::Preset preset) {
    return BossXS1PolyShifterProcessor::getPresetName(preset);
}

int Map2AudioEngine::getBossXS1NumPresets() {
    return static_cast<int>(BossXS1PolyShifterProcessor::Preset::NumPresets);
}

// ========================================
// ShoeGaze Multi-Effect Processor
// ========================================

// Primary controls
void Map2AudioEngine::setShoeGazeAtmosphere(float percent) {
    shoegaze_.setAtmosphere(percent);
}

float Map2AudioEngine::getShoeGazeAtmosphere() const {
    return shoegaze_.getAtmosphere();
}

void Map2AudioEngine::setShoeGazeDecay(float seconds) {
    shoegaze_.setDecay(seconds);
}

float Map2AudioEngine::getShoeGazeDecay() const {
    return shoegaze_.getDecay();
}

void Map2AudioEngine::setShoeGazeShimmer(float percent) {
    shoegaze_.setShimmer(percent);
}

float Map2AudioEngine::getShoeGazeShimmer() const {
    return shoegaze_.getShimmer();
}

void Map2AudioEngine::setShoeGazeShimmerPitch(float semitones) {
    shoegaze_.setShimmerPitch(semitones);
}

float Map2AudioEngine::getShoeGazeShimmerPitch() const {
    return shoegaze_.getShimmerPitch();
}

void Map2AudioEngine::setShoeGazeModulation(float percent) {
    shoegaze_.setModulation(percent);
}

float Map2AudioEngine::getShoeGazeModulation() const {
    return shoegaze_.getModulation();
}

void Map2AudioEngine::setShoeGazeModRate(float hz) {
    shoegaze_.setModRate(hz);
}

float Map2AudioEngine::getShoeGazeModRate() const {
    return shoegaze_.getModRate();
}

void Map2AudioEngine::setShoeGazeDrive(float percent) {
    shoegaze_.setDrive(percent);
}

float Map2AudioEngine::getShoeGazeDrive() const {
    return shoegaze_.getDrive();
}

void Map2AudioEngine::setShoeGazeDelayTime(float ms) {
    shoegaze_.setDelayTime(ms);
}

float Map2AudioEngine::getShoeGazeDelayTime() const {
    return shoegaze_.getDelayTime();
}

void Map2AudioEngine::setShoeGazeDelayFeedback(float percent) {
    shoegaze_.setDelayFeedback(percent);
}

float Map2AudioEngine::getShoeGazeDelayFeedback() const {
    return shoegaze_.getDelayFeedback();
}

void Map2AudioEngine::setShoeGazeDelayMod(float percent) {
    shoegaze_.setDelayMod(percent);
}

float Map2AudioEngine::getShoeGazeDelayMod() const {
    return shoegaze_.getDelayMod();
}

void Map2AudioEngine::setShoeGazeLowCut(float hz) {
    shoegaze_.setLowCut(hz);
}

float Map2AudioEngine::getShoeGazeLowCut() const {
    return shoegaze_.getLowCut();
}

void Map2AudioEngine::setShoeGazeHighCut(float hz) {
    shoegaze_.setHighCut(hz);
}

float Map2AudioEngine::getShoeGazeHighCut() const {
    return shoegaze_.getHighCut();
}

void Map2AudioEngine::setShoeGazeMix(float percent) {
    shoegaze_.setMix(percent);
}

float Map2AudioEngine::getShoeGazeMix() const {
    return shoegaze_.getMix();
}

void Map2AudioEngine::setShoeGazeStereoWidth(float percent) {
    shoegaze_.setStereoWidth(percent);
}

float Map2AudioEngine::getShoeGazeStereoWidth() const {
    return shoegaze_.getStereoWidth();
}

// Advanced controls
void Map2AudioEngine::setShoeGazeReverbDiffusion(float percent) {
    shoegaze_.setReverbDiffusion(percent);
}

float Map2AudioEngine::getShoeGazeReverbDiffusion() const {
    return shoegaze_.getReverbDiffusion();
}

void Map2AudioEngine::setShoeGazeReverbDamping(float percent) {
    shoegaze_.setReverbDamping(percent);
}

float Map2AudioEngine::getShoeGazeReverbDamping() const {
    return shoegaze_.getReverbDamping();
}

void Map2AudioEngine::setShoeGazeShimmerFeedback(float percent) {
    shoegaze_.setShimmerFeedback(percent);
}

float Map2AudioEngine::getShoeGazeShimmerFeedback() const {
    return shoegaze_.getShimmerFeedback();
}

void Map2AudioEngine::setShoeGazeChorusVoices(int voices) {
    shoegaze_.setChorusVoices(voices);
}

int Map2AudioEngine::getShoeGazeChorusVoices() const {
    return shoegaze_.getChorusVoices();
}

void Map2AudioEngine::setShoeGazeDucking(float percent) {
    shoegaze_.setDucking(percent);
}

float Map2AudioEngine::getShoeGazeDucking() const {
    return shoegaze_.getDucking();
}

// State control
void Map2AudioEngine::setShoeGazePreset(ShoeGazeProcessor::Preset preset) {
    shoegaze_.setPreset(preset);
}

ShoeGazeProcessor::Preset Map2AudioEngine::getShoeGazePreset() const {
    return shoegaze_.getPreset();
}

void Map2AudioEngine::setShoeGazeBypass(bool bypass) {
    shoegaze_.setBypass(bypass);
}

bool Map2AudioEngine::isShoeGazeBypassed() const {
    return shoegaze_.isBypassed();
}

void Map2AudioEngine::setShoeGazeSpillover(bool enabled) {
    shoegaze_.setSpillover(enabled);
}

bool Map2AudioEngine::hasShoeGazeSpillover() const {
    return shoegaze_.hasSpillover();
}

// Bulk parameters
ShoeGazeProcessor::Parameters Map2AudioEngine::getShoeGazeParameters() const {
    return shoegaze_.getParameters();
}

void Map2AudioEngine::setShoeGazeParameters(const ShoeGazeProcessor::Parameters& params) {
    shoegaze_.setParameters(params);
}

// Metering
ShoeGazeProcessor::Metering Map2AudioEngine::getShoeGazeMetering() const {
    return shoegaze_.getMetering();
}

// Preset info
ShoeGazeProcessor::PresetInfo Map2AudioEngine::getShoeGazePresetInfo(ShoeGazeProcessor::Preset preset) {
    return ShoeGazeProcessor::getPresetInfo(preset);
}

int Map2AudioEngine::getShoeGazeNumPresets() {
    return ShoeGazeProcessor::getNumPresets();
}

// ========================================
// Lexi Love PCM 70 Reverb
// ========================================

// Algorithm control
void Map2AudioEngine::setLexiLoveAlgorithm(int algorithmIndex) {
    lexiLove_.setAlgorithm(algorithmIndex);
}

void Map2AudioEngine::setLexiLoveAlgorithm(LexiLoveProcessor::Algorithm algorithm) {
    lexiLove_.setAlgorithm(algorithm);
}

int Map2AudioEngine::getLexiLoveAlgorithm() const {
    return static_cast<int>(lexiLove_.getAlgorithm());
}

// Core parameters
void Map2AudioEngine::setLexiLovePreDelay(float ms) {
    lexiLove_.setPreDelay(ms);
}

float Map2AudioEngine::getLexiLovePreDelay() const {
    return lexiLove_.getPreDelay();
}

void Map2AudioEngine::setLexiLoveDecayTime(float seconds) {
    lexiLove_.setDecayTime(seconds);
}

float Map2AudioEngine::getLexiLoveDecayTime() const {
    return lexiLove_.getDecayTime();
}

void Map2AudioEngine::setLexiLoveDiffusion(float percent) {
    lexiLove_.setDiffusion(percent);
}

float Map2AudioEngine::getLexiLoveDiffusion() const {
    return lexiLove_.getDiffusion();
}

void Map2AudioEngine::setLexiLoveMix(float percent) {
    lexiLove_.setMix(percent);
}

float Map2AudioEngine::getLexiLoveMix() const {
    return lexiLove_.getMix();
}

void Map2AudioEngine::setLexiLoveHighCut(float hz) {
    lexiLove_.setHighCut(hz);
}

float Map2AudioEngine::getLexiLoveHighCut() const {
    return lexiLove_.getHighCut();
}

void Map2AudioEngine::setLexiLoveLowCut(float hz) {
    lexiLove_.setLowCut(hz);
}

float Map2AudioEngine::getLexiLoveLowCut() const {
    return lexiLove_.getLowCut();
}

// Multi-band decay
void Map2AudioEngine::setLexiLoveLowDecayMult(float mult) {
    lexiLove_.setLowDecayMult(mult);
}

float Map2AudioEngine::getLexiLoveLowDecayMult() const {
    return lexiLove_.getLowDecayMult();
}

void Map2AudioEngine::setLexiLoveHighDecayMult(float mult) {
    lexiLove_.setHighDecayMult(mult);
}

float Map2AudioEngine::getLexiLoveHighDecayMult() const {
    return lexiLove_.getHighDecayMult();
}

void Map2AudioEngine::setLexiLoveLowCrossover(float hz) {
    lexiLove_.setLowCrossover(hz);
}

float Map2AudioEngine::getLexiLoveLowCrossover() const {
    return lexiLove_.getLowCrossover();
}

void Map2AudioEngine::setLexiLoveHighCrossover(float hz) {
    lexiLove_.setHighCrossover(hz);
}

float Map2AudioEngine::getLexiLoveHighCrossover() const {
    return lexiLove_.getHighCrossover();
}

// Early reflections
void Map2AudioEngine::setLexiLoveEarlyLevel(float percent) {
    lexiLove_.setEarlyLevel(percent);
}

float Map2AudioEngine::getLexiLoveEarlyLevel() const {
    return lexiLove_.getEarlyLevel();
}

void Map2AudioEngine::setLexiLoveEarlyPattern(float percent) {
    lexiLove_.setEarlyPattern(percent);
}

float Map2AudioEngine::getLexiLoveEarlyPattern() const {
    return lexiLove_.getEarlyPattern();
}

// Modulation
void Map2AudioEngine::setLexiLoveModDepth(float percent) {
    lexiLove_.setModDepth(percent);
}

float Map2AudioEngine::getLexiLoveModDepth() const {
    return lexiLove_.getModDepth();
}

void Map2AudioEngine::setLexiLoveModRate(float hz) {
    lexiLove_.setModRate(hz);
}

float Map2AudioEngine::getLexiLoveModRate() const {
    return lexiLove_.getModRate();
}

// State control
void Map2AudioEngine::setLexiLoveBypass(bool bypass) {
    lexiLove_.setBypass(bypass);
}

bool Map2AudioEngine::isLexiLoveBypassed() const {
    return lexiLove_.isBypassed();
}

void Map2AudioEngine::setLexiLoveSpillover(bool enabled) {
    lexiLove_.setSpillover(enabled);
}

bool Map2AudioEngine::hasLexiLoveSpillover() const {
    return lexiLove_.hasSpillover();
}

// Bulk parameters
LexiLoveProcessor::Parameters Map2AudioEngine::getLexiLoveParameters() const {
    return lexiLove_.getParameters();
}

void Map2AudioEngine::setLexiLoveParameters(const LexiLoveProcessor::Parameters& params) {
    lexiLove_.setParameters(params);
}

// Metering
LexiLoveProcessor::Metering Map2AudioEngine::getLexiLoveMetering() const {
    return lexiLove_.getMetering();
}

// Algorithm info
LexiLoveProcessor::AlgorithmInfo Map2AudioEngine::getLexiLoveAlgorithmInfo(int algorithmIndex) {
    return LexiLoveProcessor::getAlgorithmInfo(algorithmIndex);
}

int Map2AudioEngine::getLexiLoveNumAlgorithms() {
    return LexiLoveProcessor::getNumAlgorithms();
}

// ========================================
// H3000 Harmonizer Implementation
// ========================================

// Algorithm
void Map2AudioEngine::setH3000Algorithm(int algorithmIndex) {
    h3000_.setAlgorithm(algorithmIndex);
}

void Map2AudioEngine::setH3000Algorithm(H3000Processor::Algorithm algorithm) {
    h3000_.setAlgorithm(algorithm);
}

int Map2AudioEngine::getH3000Algorithm() const {
    return h3000_.getAlgorithmIndex();
}

// Pitch
void Map2AudioEngine::setH3000PitchL(float cents) {
    h3000_.setPitchL(cents);
}

float Map2AudioEngine::getH3000PitchL() const {
    return h3000_.getPitchL();
}

void Map2AudioEngine::setH3000PitchR(float cents) {
    h3000_.setPitchR(cents);
}

float Map2AudioEngine::getH3000PitchR() const {
    return h3000_.getPitchR();
}

// Delay
void Map2AudioEngine::setH3000DelayL(float ms) {
    h3000_.setDelayL(ms);
}

float Map2AudioEngine::getH3000DelayL() const {
    return h3000_.getDelayL();
}

void Map2AudioEngine::setH3000DelayR(float ms) {
    h3000_.setDelayR(ms);
}

float Map2AudioEngine::getH3000DelayR() const {
    return h3000_.getDelayR();
}

// Feedback
void Map2AudioEngine::setH3000Feedback(float percent) {
    h3000_.setFeedback(percent);
}

float Map2AudioEngine::getH3000Feedback() const {
    return h3000_.getFeedback();
}

void Map2AudioEngine::setH3000CrossFeedback(float percent) {
    h3000_.setCrossFeedback(percent);
}

float Map2AudioEngine::getH3000CrossFeedback() const {
    return h3000_.getCrossFeedback();
}

// Modulation
void Map2AudioEngine::setH3000ModDepth(float percent) {
    h3000_.setModDepth(percent);
}

float Map2AudioEngine::getH3000ModDepth() const {
    return h3000_.getModDepth();
}

void Map2AudioEngine::setH3000ModRate(float hz) {
    h3000_.setModRate(hz);
}

float Map2AudioEngine::getH3000ModRate() const {
    return h3000_.getModRate();
}

// Filters
void Map2AudioEngine::setH3000LowCut(float hz) {
    h3000_.setLowCut(hz);
}

float Map2AudioEngine::getH3000LowCut() const {
    return h3000_.getLowCut();
}

void Map2AudioEngine::setH3000HighCut(float hz) {
    h3000_.setHighCut(hz);
}

float Map2AudioEngine::getH3000HighCut() const {
    return h3000_.getHighCut();
}

// Levels
void Map2AudioEngine::setH3000Mix(float percent) {
    h3000_.setMix(percent);
}

float Map2AudioEngine::getH3000Mix() const {
    return h3000_.getMix();
}

void Map2AudioEngine::setH3000LevelL(float percent) {
    h3000_.setLevelL(percent);
}

float Map2AudioEngine::getH3000LevelL() const {
    return h3000_.getLevelL();
}

void Map2AudioEngine::setH3000LevelR(float percent) {
    h3000_.setLevelR(percent);
}

float Map2AudioEngine::getH3000LevelR() const {
    return h3000_.getLevelR();
}

// State
void Map2AudioEngine::setH3000Bypass(bool bypass) {
    h3000_.setBypass(bypass);
}

bool Map2AudioEngine::isH3000Bypassed() const {
    return h3000_.isBypassed();
}

void Map2AudioEngine::setH3000Glide(float ms) {
    h3000_.setGlide(ms);
}

float Map2AudioEngine::getH3000Glide() const {
    return h3000_.getGlide();
}

// Bulk parameters
H3000Processor::Parameters Map2AudioEngine::getH3000Parameters() const {
    return h3000_.getParameters();
}

void Map2AudioEngine::setH3000Parameters(const H3000Processor::Parameters& params) {
    h3000_.setParameters(params);
}

// Metering
H3000Processor::Metering Map2AudioEngine::getH3000Metering() const {
    return h3000_.getMetering();
}

// Algorithm info
H3000Processor::AlgorithmInfo Map2AudioEngine::getH3000AlgorithmInfo(int algorithmIndex) {
    return H3000Processor::getAlgorithmInfo(algorithmIndex);
}

int Map2AudioEngine::getH3000NumAlgorithms() {
    return H3000Processor::getNumAlgorithms();
}

// ========================================
// Peavey 5150 Block Letter Amp Simulator
// ========================================

// Preamp controls
void Map2AudioEngine::setPeavey5150PreGain(float value) {
    peavey5150_.setPreGain(value);
}

float Map2AudioEngine::getPeavey5150PreGain() const {
    return peavey5150_.getPreGain();
}

void Map2AudioEngine::setPeavey5150PostGain(float value) {
    peavey5150_.setPostGain(value);
}

float Map2AudioEngine::getPeavey5150PostGain() const {
    return peavey5150_.getPostGain();
}

// Tone stack
void Map2AudioEngine::setPeavey5150Low(float value) {
    peavey5150_.setLow(value);
}

float Map2AudioEngine::getPeavey5150Low() const {
    return peavey5150_.getLow();
}

void Map2AudioEngine::setPeavey5150Mid(float value) {
    peavey5150_.setMid(value);
}

float Map2AudioEngine::getPeavey5150Mid() const {
    return peavey5150_.getMid();
}

void Map2AudioEngine::setPeavey5150High(float value) {
    peavey5150_.setHigh(value);
}

float Map2AudioEngine::getPeavey5150High() const {
    return peavey5150_.getHigh();
}

// Power amp
void Map2AudioEngine::setPeavey5150Presence(float value) {
    peavey5150_.setPresence(value);
}

float Map2AudioEngine::getPeavey5150Presence() const {
    return peavey5150_.getPresence();
}

void Map2AudioEngine::setPeavey5150Resonance(float value) {
    peavey5150_.setResonance(value);
}

float Map2AudioEngine::getPeavey5150Resonance() const {
    return peavey5150_.getResonance();
}

void Map2AudioEngine::setPeavey5150Bias(float value) {
    peavey5150_.setBias(value);
}

float Map2AudioEngine::getPeavey5150Bias() const {
    return peavey5150_.getBias();
}

// Switches
void Map2AudioEngine::setPeavey5150Bright(bool on) {
    peavey5150_.setBright(on);
}

bool Map2AudioEngine::getPeavey5150Bright() const {
    return peavey5150_.getBright();
}

// State
void Map2AudioEngine::setPeavey5150Preset(Peavey5150Processor::Preset preset) {
    peavey5150_.setPreset(preset);
}

Peavey5150Processor::Preset Map2AudioEngine::getPeavey5150Preset() const {
    return peavey5150_.getPreset();
}

void Map2AudioEngine::setPeavey5150Bypass(bool bypass) {
    peavey5150_.setBypass(bypass);
}

bool Map2AudioEngine::isPeavey5150Bypassed() const {
    return peavey5150_.isBypassed();
}

// Bulk parameters
Peavey5150Processor::Parameters Map2AudioEngine::getPeavey5150Parameters() const {
    return peavey5150_.getParameters();
}

void Map2AudioEngine::setPeavey5150Parameters(const Peavey5150Processor::Parameters& params) {
    peavey5150_.setParameters(params);
}

// Metering
Peavey5150Processor::Metering Map2AudioEngine::getPeavey5150Metering() const {
    return peavey5150_.getMetering();
}

// Preset info
Peavey5150Processor::PresetInfo Map2AudioEngine::getPeavey5150PresetInfo(Peavey5150Processor::Preset preset) {
    return Peavey5150Processor::getPresetInfo(preset);
}

int Map2AudioEngine::getPeavey5150NumPresets() {
    return Peavey5150Processor::getNumPresets();
}

// ========================================
// Tweed Bassman 5F6-A Amplifier Simulator
// ========================================

// Channel
void Map2AudioEngine::setTweedBassmanChannelMode(int mode) { tweedBassman_.setChannelMode(mode); }
int Map2AudioEngine::getTweedBassmanChannelMode() const { return tweedBassman_.getChannelMode(); }
void Map2AudioEngine::setTweedBassmanNormalVolume(float v) { tweedBassman_.setNormalVolume(v); }
float Map2AudioEngine::getTweedBassmanNormalVolume() const { return tweedBassman_.getNormalVolume(); }
void Map2AudioEngine::setTweedBassmanBrightVolume(float v) { tweedBassman_.setBrightVolume(v); }
float Map2AudioEngine::getTweedBassmanBrightVolume() const { return tweedBassman_.getBrightVolume(); }
void Map2AudioEngine::setTweedBassmanBrightCap(bool on) { tweedBassman_.setBrightCap(on); }
bool Map2AudioEngine::getTweedBassmanBrightCap() const { return tweedBassman_.getBrightCap(); }

// Preamp
void Map2AudioEngine::setTweedBassmanV1TubeType(int type) { tweedBassman_.setV1TubeType(type); }
int Map2AudioEngine::getTweedBassmanV1TubeType() const { return tweedBassman_.getV1TubeType(); }
void Map2AudioEngine::setTweedBassmanCathodeBypass(bool on) { tweedBassman_.setCathodeBypass(on); }
bool Map2AudioEngine::getTweedBassmanCathodeBypass() const { return tweedBassman_.getCathodeBypass(); }
void Map2AudioEngine::setTweedBassmanCathodeBias(int mode) { tweedBassman_.setCathodeBias(mode); }
int Map2AudioEngine::getTweedBassmanCathodeBias() const { return tweedBassman_.getCathodeBias(); }

// Tone
void Map2AudioEngine::setTweedBassmanTreble(float v) { tweedBassman_.setTreble(v); }
float Map2AudioEngine::getTweedBassmanTreble() const { return tweedBassman_.getTreble(); }
void Map2AudioEngine::setTweedBassmanMid(float v) { tweedBassman_.setMid(v); }
float Map2AudioEngine::getTweedBassmanMid() const { return tweedBassman_.getMid(); }
void Map2AudioEngine::setTweedBassmanBass(float v) { tweedBassman_.setBass(v); }
float Map2AudioEngine::getTweedBassmanBass() const { return tweedBassman_.getBass(); }
void Map2AudioEngine::setTweedBassmanRawSwitch(bool on) { tweedBassman_.setRawSwitch(on); }
bool Map2AudioEngine::getTweedBassmanRawSwitch() const { return tweedBassman_.getRawSwitch(); }

// Master
void Map2AudioEngine::setTweedBassmanMasterVolume(float v) { tweedBassman_.setMasterVolume(v); }
float Map2AudioEngine::getTweedBassmanMasterVolume() const { return tweedBassman_.getMasterVolume(); }

// Power amp
void Map2AudioEngine::setTweedBassmanPresence(float v) { tweedBassman_.setPresence(v); }
float Map2AudioEngine::getTweedBassmanPresence() const { return tweedBassman_.getPresence(); }
void Map2AudioEngine::setTweedBassmanNFBMode(int mode) { tweedBassman_.setNFBMode(mode); }
int Map2AudioEngine::getTweedBassmanNFBMode() const { return tweedBassman_.getNFBMode(); }
void Map2AudioEngine::setTweedBassmanPowerTubeType(int type) { tweedBassman_.setPowerTubeType(type); }
int Map2AudioEngine::getTweedBassmanPowerTubeType() const { return tweedBassman_.getPowerTubeType(); }
void Map2AudioEngine::setTweedBassmanBiasMode(int mode) { tweedBassman_.setBiasMode(mode); }
int Map2AudioEngine::getTweedBassmanBiasMode() const { return tweedBassman_.getBiasMode(); }
void Map2AudioEngine::setTweedBassmanRectifierType(int type) { tweedBassman_.setRectifierType(type); }
int Map2AudioEngine::getTweedBassmanRectifierType() const { return tweedBassman_.getRectifierType(); }

// Output
void Map2AudioEngine::setTweedBassmanOutputLevel(float dB) { tweedBassman_.setOutputLevel(dB); }
float Map2AudioEngine::getTweedBassmanOutputLevel() const { return tweedBassman_.getOutputLevel(); }
void Map2AudioEngine::setTweedBassmanCabinetEnabled(bool on) { tweedBassman_.setCabinetEnabled(on); }
bool Map2AudioEngine::getTweedBassmanCabinetEnabled() const { return tweedBassman_.getCabinetEnabled(); }
void Map2AudioEngine::setTweedBassmanCabinetIR(int index) { tweedBassman_.setCabinetIR(index); }
int Map2AudioEngine::getTweedBassmanCabinetIR() const { return tweedBassman_.getCabinetIR(); }

// State
void Map2AudioEngine::setTweedBassmanPreset(TweedBassmanProcessor::Preset preset) { tweedBassman_.setPreset(preset); }
TweedBassmanProcessor::Preset Map2AudioEngine::getTweedBassmanPreset() const { return tweedBassman_.getPreset(); }
void Map2AudioEngine::setTweedBassmanBypass(bool bypass) { tweedBassman_.setBypass(bypass); }
bool Map2AudioEngine::isTweedBassmanBypassed() const { return tweedBassman_.isBypassed(); }

// Bulk
TweedBassmanProcessor::Parameters Map2AudioEngine::getTweedBassmanParameters() const { return tweedBassman_.getParameters(); }
void Map2AudioEngine::setTweedBassmanParameters(const TweedBassmanProcessor::Parameters& params) { tweedBassman_.setParameters(params); }

// Metering
TweedBassmanProcessor::Metering Map2AudioEngine::getTweedBassmanMetering() const { return tweedBassman_.getMetering(); }

// Preset info
TweedBassmanProcessor::PresetInfo Map2AudioEngine::getTweedBassmanPresetInfo(TweedBassmanProcessor::Preset preset) {
    return TweedBassmanProcessor::getPresetInfo(preset);
}

int Map2AudioEngine::getTweedBassmanNumPresets() {
    return TweedBassmanProcessor::getNumPresets();
}

// ========================================
// PassionFX Multi-Effect Processor
// ========================================

// NoiseGate
void Map2AudioEngine::setPassionFXGateEnabled(bool enabled) { passionFX_.setNoiseGateEnabled(enabled); }
void Map2AudioEngine::setPassionFXGateThreshold(float dB) { passionFX_.setNoiseGateThreshold(dB); }
void Map2AudioEngine::setPassionFXGateRelease(float ms) { passionFX_.setNoiseGateRelease(ms); }

// Compressor
void Map2AudioEngine::setPassionFXCompEnabled(bool enabled) { passionFX_.setCompressorEnabled(enabled); }
void Map2AudioEngine::setPassionFXCompThreshold(float dB) { passionFX_.setCompressorThreshold(dB); }
void Map2AudioEngine::setPassionFXCompRatio(float ratio) { passionFX_.setCompressorRatio(ratio); }
void Map2AudioEngine::setPassionFXCompAttack(float ms) { passionFX_.setCompressorAttack(ms); }
void Map2AudioEngine::setPassionFXCompRelease(float ms) { passionFX_.setCompressorRelease(ms); }
void Map2AudioEngine::setPassionFXCompGlassy(bool glassy) { passionFX_.setCompressorGlassy(glassy); }

// Wah
void Map2AudioEngine::setPassionFXWahEnabled(bool enabled) { passionFX_.setWahEnabled(enabled); }
void Map2AudioEngine::setPassionFXWahMode(int mode) { passionFX_.setWahMode(mode); }
void Map2AudioEngine::setPassionFXWahPosition(float position) { passionFX_.setWahPosition(position); }
void Map2AudioEngine::setPassionFXWahQ(float q) { passionFX_.setWahQ(q); }

// Phaser
void Map2AudioEngine::setPassionFXPhaserEnabled(bool enabled) { passionFX_.setPhaserEnabled(enabled); }
void Map2AudioEngine::setPassionFXPhaserRate(float hz) { passionFX_.setPhaserRate(hz); }
void Map2AudioEngine::setPassionFXPhaserDepth(float depth) { passionFX_.setPhaserDepth(depth); }
void Map2AudioEngine::setPassionFXPhaserStages(int stages) { passionFX_.setPhaserStages(stages); }
void Map2AudioEngine::setPassionFXPhaserFeedback(float feedback) { passionFX_.setPhaserFeedback(feedback); }

// Chorus
void Map2AudioEngine::setPassionFXChorusEnabled(bool enabled) { passionFX_.setChorusEnabled(enabled); }
void Map2AudioEngine::setPassionFXChorusRate(float hz) { passionFX_.setChorusRate(hz); }
void Map2AudioEngine::setPassionFXChorusDepth(float depth) { passionFX_.setChorusDepth(depth); }
void Map2AudioEngine::setPassionFXChorusVoices(int voices) { passionFX_.setChorusVoices(voices); }
void Map2AudioEngine::setPassionFXChorusMix(float mix) { passionFX_.setChorusMix(mix); }

// PitchShifter
void Map2AudioEngine::setPassionFXPitchEnabled(bool enabled) { passionFX_.setPitchShifterEnabled(enabled); }
void Map2AudioEngine::setPassionFXPitchSemitones(float semitones) { passionFX_.setPitchShifterSemitones(semitones); }
void Map2AudioEngine::setPassionFXPitchMix(float mix) { passionFX_.setPitchShifterMix(mix); }

// Harmonizer
void Map2AudioEngine::setPassionFXHarmEnabled(bool enabled) { passionFX_.setHarmonizerEnabled(enabled); }
void Map2AudioEngine::setPassionFXHarmVoice1(float semitones) { passionFX_.setHarmonizerVoice1(semitones); }
void Map2AudioEngine::setPassionFXHarmVoice2(float semitones) { passionFX_.setHarmonizerVoice2(semitones); }
void Map2AudioEngine::setPassionFXHarmDetune(float cents) { passionFX_.setHarmonizerDetune(cents); }
void Map2AudioEngine::setPassionFXHarmMix(float mix) { passionFX_.setHarmonizerMix(mix); }

// Delay
void Map2AudioEngine::setPassionFXDelayEnabled(bool enabled) { passionFX_.setDelayEnabled(enabled); }
void Map2AudioEngine::setPassionFXDelayTimeL(float ms) { passionFX_.setDelayTimeL(ms); }
void Map2AudioEngine::setPassionFXDelayTimeR(float ms) { passionFX_.setDelayTimeR(ms); }
void Map2AudioEngine::setPassionFXDelayFeedback(float feedback) { passionFX_.setDelayFeedback(feedback); }
void Map2AudioEngine::setPassionFXDelayMix(float mix) { passionFX_.setDelayMix(mix); }
void Map2AudioEngine::setPassionFXDelayFreeze(bool freeze) { passionFX_.setDelayFreeze(freeze); }
void Map2AudioEngine::setPassionFXDelayPitchShiftL(float semitones) { passionFX_.setDelayPitchShiftL(semitones); }
void Map2AudioEngine::setPassionFXDelayPitchShiftR(float semitones) { passionFX_.setDelayPitchShiftR(semitones); }

// Reverb
void Map2AudioEngine::setPassionFXReverbEnabled(bool enabled) { passionFX_.setReverbEnabled(enabled); }
void Map2AudioEngine::setPassionFXReverbType(int type) { passionFX_.setReverbType(type); }
void Map2AudioEngine::setPassionFXReverbDecay(float seconds) { passionFX_.setReverbDecay(seconds); }
void Map2AudioEngine::setPassionFXReverbShimmerAmount(float amount) { passionFX_.setReverbShimmerAmount(amount); }
void Map2AudioEngine::setPassionFXReverbShimmerInterval(float semitones) { passionFX_.setReverbShimmerInterval(semitones); }
void Map2AudioEngine::setPassionFXReverbMix(float mix) { passionFX_.setReverbMix(mix); }
void Map2AudioEngine::setPassionFXReverbFreeze(bool freeze) { passionFX_.setReverbFreeze(freeze); }

// EQ
void Map2AudioEngine::setPassionFXEqEnabled(bool enabled) { passionFX_.setEqEnabled(enabled); }
void Map2AudioEngine::setPassionFXEqLowGain(float dB) { passionFX_.setEqLowGain(dB); }
void Map2AudioEngine::setPassionFXEqMidGain(float dB) { passionFX_.setEqMidGain(dB); }
void Map2AudioEngine::setPassionFXEqHighGain(float dB) { passionFX_.setEqHighGain(dB); }
void Map2AudioEngine::setPassionFXEqTilt(float tilt) { passionFX_.setEqTilt(tilt); }

// Exciter
void Map2AudioEngine::setPassionFXExciterEnabled(bool enabled) { passionFX_.setExciterEnabled(enabled); }
void Map2AudioEngine::setPassionFXExciterWarmth(float warmth) { passionFX_.setExciterWarmth(warmth); }
void Map2AudioEngine::setPassionFXExciterPresence(float presence) { passionFX_.setExciterPresence(presence); }
void Map2AudioEngine::setPassionFXExciterAir(float air) { passionFX_.setExciterAir(air); }

// Tremolo
void Map2AudioEngine::setPassionFXTremEnabled(bool enabled) { passionFX_.setTremoloEnabled(enabled); }
void Map2AudioEngine::setPassionFXTremRate(float hz) { passionFX_.setTremoloRate(hz); }
void Map2AudioEngine::setPassionFXTremDepth(float depth) { passionFX_.setTremoloDepth(depth); }
void Map2AudioEngine::setPassionFXTremWaveform(int waveform) { passionFX_.setTremoloWaveform(waveform); }

// Global
void Map2AudioEngine::setPassionFXMix(float mix) { passionFX_.setGlobalMix(mix); }
void Map2AudioEngine::setPassionFXOutputLevel(float dB) { passionFX_.setOutputLevel(dB); }

// State
void Map2AudioEngine::setPassionFXPreset(PassionFXProcessor::Preset preset) { passionFX_.setPreset(preset); }
PassionFXProcessor::Preset Map2AudioEngine::getPassionFXPreset() const { return passionFX_.getPreset(); }
void Map2AudioEngine::setPassionFXBypass(bool bypass) { passionFX_.setBypass(bypass); }
bool Map2AudioEngine::isPassionFXBypassed() const { return passionFX_.isBypassed(); }

// Bulk parameters
PassionFXProcessor::Parameters Map2AudioEngine::getPassionFXParameters() const { return passionFX_.getParameters(); }
void Map2AudioEngine::setPassionFXParameters(const PassionFXProcessor::Parameters& params) { passionFX_.setParameters(params); }

// Metering
PassionFXProcessor::Metering Map2AudioEngine::getPassionFXMetering() const { return passionFX_.getMetering(); }

// Preset info
PassionFXProcessor::PresetInfo Map2AudioEngine::getPassionFXPresetInfo(PassionFXProcessor::Preset preset) {
    return PassionFXProcessor::getPresetInfo(preset);
}

int Map2AudioEngine::getPassionFXNumPresets() {
    return PassionFXProcessor::getNumPresets();
}

} // namespace map2
