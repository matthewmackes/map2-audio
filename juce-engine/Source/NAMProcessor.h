#pragma once

/**
 * MAP2 Audio Engine - Neural Amp Modeler Processor
 * RT-safe wrapper for NeuralAmpModelerCore
 *
 * Features:
 * - Zero-latency neural amp modeling (causal networks)
 * - Thread-safe model loading
 * - Automatic sample rate conversion
 * - Input/output level normalization
 */

#include "Common.h"

#ifdef HAS_NAM
#include "NAM/dsp.h"
#include "NAM/get_dsp.h"
#endif

#include <juce_audio_basics/juce_audio_basics.h>
#include <atomic>
#include <mutex>
#include <memory>
#include <string>

namespace map2 {

/**
 * NAM Model information
 */
struct NAMModelInfo {
    std::string path;
    std::string name;
    double expectedSampleRate = 48000.0;
    int inputChannels = 1;
    int outputChannels = 1;
    bool hasInputLevel = false;
    bool hasOutputLevel = false;
    double inputLevel = 0.0;
    double outputLevel = 0.0;
    bool loaded = false;
};

/**
 * NAMProcessor - Real-time safe Neural Amp Modeler
 *
 * Wraps NeuralAmpModelerCore for use in JUCE audio processing.
 * Models are loaded on a background thread and swapped atomically.
 */
class NAMProcessor {
public:
    NAMProcessor();
    ~NAMProcessor();

    // Prevent copying
    NAMProcessor(const NAMProcessor&) = delete;
    NAMProcessor& operator=(const NAMProcessor&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Prepare for playback
     * @param sampleRate Current sample rate
     * @param maxBlockSize Maximum samples per block
     */
    void prepare(double sampleRate, int maxBlockSize);

    /**
     * Release resources
     */
    void releaseResources();

    // ========================================
    // Model Management
    // ========================================

    /**
     * Load a NAM model from file (thread-safe)
     * @param path Path to .nam file
     * @return true if loading started successfully
     */
    bool loadModel(const std::string& path);

    /**
     * Unload current model
     */
    void unloadModel();

    /**
     * Check if a model is loaded and ready
     */
    bool isModelLoaded() const;

    /**
     * Check if model is currently loading
     */
    bool isLoading() const { return loading_.load(); }

    /**
     * Get current model information
     */
    NAMModelInfo getModelInfo() const;

    // ========================================
    // Processing
    // ========================================

    /**
     * Process audio (RT-safe)
     * @param buffer Audio buffer to process in-place
     */
    void process(juce::AudioBuffer<float>& buffer);

    /**
     * Process audio with separate I/O (RT-safe)
     * @param input Input samples
     * @param output Output samples
     * @param numSamples Number of samples to process
     */
    void process(const float* input, float* output, int numSamples);

    // ========================================
    // Parameters
    // ========================================

    /**
     * Set input gain (pre-NAM)
     * @param gainDb Gain in dB
     */
    void setInputGain(float gainDb);

    /**
     * Get input gain
     * @return Gain in dB
     */
    float getInputGain() const { return inputGainDb_; }

    /**
     * Set output gain (post-NAM)
     * @param gainDb Gain in dB
     */
    void setOutputGain(float gainDb);

    /**
     * Get output gain
     * @return Gain in dB
     */
    float getOutputGain() const { return outputGainDb_; }

    /**
     * Set bypass state
     * @param bypass true to bypass
     */
    void setBypass(bool bypass) { bypassed_.store(bypass); }

    /**
     * Get bypass state
     */
    bool isBypassed() const { return bypassed_.load(); }

    /**
     * Enable/disable automatic output normalization
     */
    void setNormalize(bool normalize) { normalize_ = normalize; }

    /**
     * Check if normalization is enabled
     */
    bool isNormalized() const { return normalize_; }

    // ========================================
    // Metering
    // ========================================

    /**
     * Get current input level (dB)
     */
    float getInputLevel() const { return inputLevelDb_.load(); }

    /**
     * Get current output level (dB)
     */
    float getOutputLevel() const { return outputLevelDb_.load(); }

private:
#ifdef HAS_NAM
    // NAM DSP instance
    std::unique_ptr<nam::DSP> model_;
    std::unique_ptr<nam::DSP> pendingModel_;
#endif

    // Model info
    NAMModelInfo modelInfo_;
    mutable std::mutex modelMutex_;

    // State
    std::atomic<bool> loading_{false};
    std::atomic<bool> bypassed_{false};
    std::atomic<bool> modelReady_{false};

    // Audio config
    double sampleRate_ = 48000.0;
    int maxBlockSize_ = 512;

    // Parameters
    float inputGainDb_ = 0.0f;
    float outputGainDb_ = 0.0f;
    float inputGainLinear_ = 1.0f;
    float outputGainLinear_ = 1.0f;
    bool normalize_ = true;

    // Metering (atomic for RT-safe reads)
    std::atomic<float> inputLevelDb_{-100.0f};
    std::atomic<float> outputLevelDb_{-100.0f};

    // Temporary buffers for processing
    std::vector<float> inputBuffer_;
    std::vector<float> outputBuffer_;

    // Helper methods
    void updateGains();
    float calculateRMS(const float* buffer, int numSamples) const;
    float linearToDb(float linear) const;
};

} // namespace map2
