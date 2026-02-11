#pragma once

/**
 * MAP2 Audio Engine - Convolution Processor
 * High-performance IR convolution using JUCE dsp::Convolution
 * Replaces Python-based ReevR engine
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <memory>
#include "Common.h"

namespace map2 {

/**
 * ConvolutionProcessor - Zero-latency* IR convolution
 *
 * Features:
 * - Partitioned FFT for low latency with long IRs
 * - Automatic resampling when IR sample rate differs
 * - Pre-delay support
 * - Stereo/mono IR handling
 * - Thread-safe IR loading
 *
 * * Zero-latency mode uses hybrid time-domain/frequency-domain processing
 */
class ConvolutionProcessor {
public:
    /**
     * Convolution mode affects latency/CPU trade-off
     */
    enum class Mode {
        ZeroLatency,    // Hybrid processing, minimal latency
        LowLatency,     // Small partition size
        HighQuality     // Larger partitions, lower CPU
    };

    ConvolutionProcessor();
    ~ConvolutionProcessor();

    // Prevent copying
    ConvolutionProcessor(const ConvolutionProcessor&) = delete;
    ConvolutionProcessor& operator=(const ConvolutionProcessor&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Prepare for processing
     * @param sampleRate Audio sample rate
     * @param samplesPerBlock Maximum block size
     * @param numChannels Number of channels (1 or 2)
     */
    void prepare(double sampleRate, int samplesPerBlock, int numChannels = 2);

    /**
     * Reset internal state (clear delay lines, etc.)
     */
    void reset();

    /**
     * Release resources
     */
    void releaseResources();

    // ========================================
    // IR Management
    // ========================================

    /**
     * Load impulse response from file
     * @param irPath Path to WAV/AIFF file
     * @return true if successful
     */
    bool loadImpulseResponse(const std::string& irPath);

    /**
     * Load impulse response from memory
     * @param data Interleaved float samples
     * @param numSamples Number of samples per channel
     * @param numChannels Number of channels in IR
     * @param irSampleRate Sample rate of IR data
     * @return true if successful
     */
    bool loadImpulseResponseFromData(const float* data,
                                     size_t numSamples,
                                     int numChannels,
                                     double irSampleRate);

    /**
     * Unload current IR
     */
    void unloadImpulseResponse();

    /**
     * Check if IR is loaded
     */
    bool isIRLoaded() const { return irLoaded_.load(); }

    /**
     * Get path of loaded IR
     */
    std::string getLoadedIRPath() const { return irPath_; }

    // ========================================
    // Processing
    // ========================================

    /**
     * Process audio block in-place
     * @param buffer Audio buffer (modified in place)
     */
    void process(juce::AudioBuffer<float>& buffer);

    /**
     * Process with separate input/output
     */
    void process(const float* const* inputs, float** outputs,
                int numChannels, int numSamples);

    // ========================================
    // Parameters
    // ========================================

    /**
     * Set dry/wet mix
     * @param mix 0.0 = fully dry, 1.0 = fully wet
     */
    void setDryWetMix(float mix);
    float getDryWetMix() const { return dryWetMix_; }

    /**
     * Set pre-delay time
     * @param delayMs Pre-delay in milliseconds (0-500)
     */
    void setPreDelay(float delayMs);
    float getPreDelay() const { return preDelayMs_; }

    /**
     * Set bypass state
     */
    void setBypass(bool bypass);
    bool isBypassed() const { return bypass_; }

    /**
     * Set convolution mode
     */
    void setMode(Mode mode);
    Mode getMode() const { return mode_; }

    // ========================================
    // Info
    // ========================================

    /**
     * Get processing latency in samples
     */
    int getLatency() const;

    /**
     * Get loaded IR length in seconds
     */
    double getIRLengthSeconds() const;

    /**
     * Get loaded IR length in samples (at current sample rate)
     */
    int getIRLengthSamples() const;

    /**
     * Get IR info
     */
    struct IRInfo {
        std::string path;
        int lengthSamples = 0;
        double lengthSeconds = 0.0;
        int numChannels = 0;
        double originalSampleRate = 0.0;
        bool stereo = false;
    };
    IRInfo getIRInfo() const;

private:
    // JUCE DSP components
    std::unique_ptr<juce::dsp::Convolution> convolution_;
    juce::dsp::DryWetMixer<float> dryWetMixer_;
    juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::Linear> preDelay_;

    // State
    std::atomic<bool> irLoaded_{false};
    bool bypass_ = false;
    Mode mode_ = Mode::ZeroLatency;

    // Parameters
    float dryWetMix_ = 1.0f;  // 100% wet by default
    float preDelayMs_ = 0.0f;

    // Processing config
    double sampleRate_ = 48000.0;
    int blockSize_ = 256;
    int numChannels_ = 2;

    // IR info
    std::string irPath_;
    IRInfo irInfo_;
    mutable std::mutex irMutex_;

    // Temp buffers
    juce::AudioBuffer<float> dryBuffer_;

    // Audio format manager for file loading
    juce::AudioFormatManager formatManager_;

    // Helper methods
    juce::dsp::Convolution::Latency getModeLatency() const;
};

} // namespace map2
