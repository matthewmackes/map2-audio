#pragma once

/**
 * MAP2 Audio Engine - Circular Delays Processor
 * Emulates the famous Yamaha SPX90 circular delays effect
 *
 * Key Features:
 * - Multiple delay taps rotating around stereo field
 * - Smooth panning creating 3D spatial effect
 * - Adjustable delay time (100ms - 2000ms)
 * - Configurable number of repeats (4-12 taps)
 * - Feedback control for decay characteristic
 * - Pan rotation rate (LFO speed)
 * - Stereo depth control
 * - Wet/dry mix control
 * - Real-time parameter adjustment
 *
 * Algorithm:
 * - Single circular delay buffer for efficiency
 * - Multiple read taps at calculated positions
 * - Pan modulation using sine/cosine wave
 * - Smooth feedback path for natural decay
 * - Cubic interpolation for clean delay reading
 *
 * Research Sources:
 * - Yamaha SPX90 official specifications
 * - Classic digital effects design
 * - Circular spatial audio techniques
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <atomic>
#include <array>
#include <cmath>

namespace map2 {

class CircularDelayProcessor {
public:
    /**
     * Parameters structure for bulk get/set
     */
    struct Parameters {
        float delayTime = 500.0f;      // ms (100 to 2000)
        int numTaps = 8;               // Number of repeats (4 to 12)
        float feedback = 0.5f;         // 0 to 0.95 (repeat decay)
        float panRate = 1.0f;          // Hz (0.1 to 5.0, LFO speed)
        float depth = 1.0f;            // 0 to 1 (stereo field width)
        float mix = 0.5f;              // 0 to 1 (wet/dry blend)
        float initialPanAngle = 0.0f;  // 0 to 360 degrees (starting position)
        bool bypass = false;
    };

    /**
     * Metering data for visualization
     */
    struct Metering {
        float inputLevel = -100.0f;    // dB peak
        float outputLevel = -100.0f;   // dB peak
        float lfoPhase = 0.0f;         // 0-1 for visualization
        std::array<float, 12> tapLevels = {};  // Level of each tap output
        std::array<float, 12> tapAngles = {};  // Pan angle of each tap
    };

    CircularDelayProcessor();
    ~CircularDelayProcessor() = default;

    // Prevent copying
    CircularDelayProcessor(const CircularDelayProcessor&) = delete;
    CircularDelayProcessor& operator=(const CircularDelayProcessor&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Prepare for processing
     * @param sampleRate Sample rate in Hz
     * @param samplesPerBlock Max samples per processBlock call
     * @param numChannels Number of audio channels (1 or 2)
     */
    void prepare(double sampleRate, int samplesPerBlock, int numChannels);

    /**
     * Reset internal state and clear delay buffer
     */
    void reset();

    // ========================================
    // Processing
    // ========================================

    /**
     * Process audio block in-place
     * @param buffer Audio buffer to process
     */
    void process(juce::AudioBuffer<float>& buffer);

    // ========================================
    // Parameter Control (RT-safe)
    // ========================================

    /**
     * Set delay time in milliseconds
     */
    void setDelayTime(float ms);
    float getDelayTime() const { return delayTime_.load(); }

    /**
     * Set number of delay taps/repeats
     */
    void setNumTaps(int numTaps);
    int getNumTaps() const { return numTaps_.load(); }

    /**
     * Set feedback amount (decay of repeats)
     */
    void setFeedback(float feedback);
    float getFeedback() const { return feedback_.load(); }

    /**
     * Set pan rotation rate (LFO frequency)
     */
    void setPanRate(float hz);
    float getPanRate() const { return panRate_.load(); }

    /**
     * Set stereo field depth/width
     */
    void setDepth(float depth);
    float getDepth() const { return depth_.load(); }

    /**
     * Set wet/dry mix
     */
    void setMix(float mix);
    float getMix() const { return mix_.load(); }

    /**
     * Set initial pan angle (starting position, 0-360 degrees)
     */
    void setInitialPanAngle(float degrees);
    float getInitialPanAngle() const { return initialPanAngle_.load(); }

    /**
     * Set bypass state
     */
    void setBypass(bool shouldBypass);
    bool getBypass() const { return bypass_.load(); }

    /**
     * Get current metering information
     */
    Metering getMetering() const { return metering_; }

    /**
     * Get all parameters at once
     */
    Parameters getParameters() const;

    /**
     * Set all parameters at once
     */
    void setParameters(const Parameters& params);

private:
    // ========================================
    // DSP Internals
    // ========================================

    /**
     * Update derived parameters (called when any parameter changes)
     */
    void updateDerivedParameters();

    /**
     * Process a single sample and return output for both channels
     * @param inputSample Input sample value
     * @param lfoPhase Current LFO phase (0-1)
     * @param outL Output left channel
     * @param outR Output right channel
     */
    void processSample(float inputSample, float lfoPhase, float& outL, float& outR);

    /**
     * Calculate pan angle for a given tap index and LFO phase
     * Pan angle determines left/right positioning
     */
    float calculatePanAngle(int tapIndex, float lfoPhase) const;

    /**
     * Convert angle (0-360) to stereo pan coefficient (-1 to +1)
     * Uses sine function: 0° = -1 (full left), 90° = 0 (center), 180° = +1 (full right), 270° = 0 (center)
     */
    std::pair<float, float> angleToPan(float angleDegrees) const;

    /**
     * Read from circular delay buffer with cubic interpolation
     * @param readPosition Sample position (may be fractional)
     * @return Interpolated sample value
     */
    float readDelayBuffer(float readPosition) const;

    /**
     * Write to circular delay buffer
     * @param writePosition Sample position to write to
     * @param sample Value to write
     */
    void writeDelayBuffer(float sample);

    // ========================================
    // State Variables
    // ========================================

    double sampleRate_ = 44100.0;
    int samplesPerBlock_ = 512;
    int numChannels_ = 2;

    // Circular delay buffer
    std::vector<float> delayBuffer_;
    int delayBufferSize_ = 0;
    int writePosition_ = 0;

    // LFO oscillator for pan modulation
    juce::dsp::Oscillator<float> lfoOscillator_;
    float lfoPhase_ = 0.0f;

    // RT-safe atomic parameters
    std::atomic<float> delayTime_ { 500.0f };
    std::atomic<int> numTaps_ { 8 };
    std::atomic<float> feedback_ { 0.5f };
    std::atomic<float> panRate_ { 1.0f };
    std::atomic<float> depth_ { 1.0f };
    std::atomic<float> mix_ { 0.5f };
    std::atomic<float> initialPanAngle_ { 0.0f };
    std::atomic<bool> bypass_ { false };

    // Derived parameters (calculated from atomics)
    int delayLineSamples_ = 0;      // Delay time in samples
    float feedbackAmount_ = 0.5f;   // Smoothed feedback value
    float depthAmount_ = 1.0f;      // Smoothed depth value
    float mixAmount_ = 0.5f;        // Smoothed mix value

    // Parameter smoothing for click-free changes
    static constexpr float SMOOTHING_COEFF = 0.0005f;

    // Metering
    mutable Metering metering_;
    std::atomic<float> inputLevel_ { -100.0f };
    std::atomic<float> outputLevel_ { -100.0f };

    // Constants for pan calculations
    static constexpr float TWO_PI = 6.28318530718f;
    static constexpr float PI = 3.14159265359f;
    static constexpr float PI_OVER_180 = 0.0174532925199f;  // PI / 180

    // denormal prevention
    static constexpr float DENORMAL_FLOOR = 1e-10f;
};

}  // namespace map2
