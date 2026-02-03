#pragma once

/**
 * MAP2 Audio Engine - IntelliFX 8-Voice Chorus Processor
 * Rocktron IntelliFX-style multi-voice chorus with HUSH noise reduction
 *
 * Based on the Rocktron IntelliFX manual specifications:
 * - 8 independent voices with Level, Pan, Delay (0-418ms), Depth, Rate
 * - Global mixer: Chorus Level, Direct L/R, Regen L/R (feedback)
 * - HUSH noise reduction: Threshold, Release Rate
 * - 30+ factory presets
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <atomic>
#include <array>
#include <vector>

namespace map2 {

/**
 * IntelliFX8VoiceChorusProcessor
 *
 * Each of 8 voices has independent:
 * - Level (-inf to 0dB): Voice output level
 * - Pan (L-100 to R+100): Stereo position
 * - Delay (0 to 418ms): Delay time per voice
 * - Depth (0 to 100): Modulation depth
 * - Rate (0 to 254): LFO rate (maps to ~0.05-10Hz)
 *
 * Global mixer section:
 * - Chorus Level (-inf to +6dB)
 * - Direct L/R Levels (-inf to +6dB)
 * - Regen L/R (-inf to 0dB) - feedback for flanging
 *
 * HUSH noise reduction:
 * - Enabled: On/Off
 * - Threshold: -92 to -20dB
 * - Release Rate: 25 to 800ms
 */
class IntelliFX8VoiceChorusProcessor {
public:
    static constexpr int NUM_VOICES = 8;
    static constexpr float MAX_DELAY_MS = 418.0f;
    static constexpr float MAX_RATE = 254.0f;
    static constexpr int NUM_PRESETS = 30;

    /**
     * Per-voice parameters
     */
    struct VoiceParameters {
        float level = -6.0f;     // dB (-100 to 0)
        float pan = 0.0f;        // -100 (L) to +100 (R)
        float delay = 15.0f;     // ms (0 to 418)
        float depth = 50.0f;     // 0 to 100
        float rate = 40.0f;      // 0 to 254 (IntelliFX scale)
    };

    /**
     * HUSH noise reduction parameters
     */
    struct HushParameters {
        bool enabled = false;
        float threshold = -40.0f;   // dB (-92 to -20)
        float releaseRate = 200.0f; // ms (25 to 800)
    };

    /**
     * Complete parameter set
     */
    struct Parameters {
        std::array<VoiceParameters, NUM_VOICES> voices;

        // Global mixer
        float chorusLevel = 0.0f;      // dB (-100 to +6)
        float directLevelL = -3.0f;    // dB (-100 to +6)
        float directLevelR = -3.0f;    // dB (-100 to +6)
        float regenL = -100.0f;        // dB (-100 to 0)
        float regenR = -100.0f;        // dB (-100 to 0)

        // HUSH
        HushParameters hush;

        // Master
        bool bypass = false;
    };

    /**
     * Metering data for UI visualization
     */
    struct Metering {
        float inputLevelL = -100.0f;
        float inputLevelR = -100.0f;
        float outputLevelL = -100.0f;
        float outputLevelR = -100.0f;
        float chorusLevelL = -100.0f;
        float chorusLevelR = -100.0f;
        std::array<float, NUM_VOICES> voiceLfoPhases;  // 0-1 for UI animation
        float hushGainReduction = 0.0f;  // dB
    };

    /**
     * Preset categories
     */
    enum class PresetCategory {
        Classic8Voice,
        Shimmer,
        Flange,
        Chorus,
        Echo,
        Special
    };

    /**
     * Preset information
     */
    struct PresetInfo {
        int index;
        const char* name;
        const char* category;
        const char* description;
    };

    IntelliFX8VoiceChorusProcessor();
    ~IntelliFX8VoiceChorusProcessor() = default;

    // Prevent copying
    IntelliFX8VoiceChorusProcessor(const IntelliFX8VoiceChorusProcessor&) = delete;
    IntelliFX8VoiceChorusProcessor& operator=(const IntelliFX8VoiceChorusProcessor&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Prepare for processing at given sample rate
     */
    void prepare(double sampleRate, int samplesPerBlock, int numChannels);

    /**
     * Reset all internal state
     */
    void reset();

    // ========================================
    // Processing
    // ========================================

    /**
     * Process audio buffer in-place
     */
    void process(juce::AudioBuffer<float>& buffer);

    // ========================================
    // Voice Parameter Control (RT-safe)
    // ========================================

    void setVoiceLevel(int voice, float dB);
    float getVoiceLevel(int voice) const;

    void setVoicePan(int voice, float pan);
    float getVoicePan(int voice) const;

    void setVoiceDelay(int voice, float ms);
    float getVoiceDelay(int voice) const;

    void setVoiceDepth(int voice, float depth);
    float getVoiceDepth(int voice) const;

    void setVoiceRate(int voice, float rate);
    float getVoiceRate(int voice) const;

    VoiceParameters getVoiceParameters(int voice) const;
    void setVoiceParameters(int voice, const VoiceParameters& params);

    // ========================================
    // Global Mixer Control (RT-safe)
    // ========================================

    void setChorusLevel(float dB);
    float getChorusLevel() const { return chorusLevel_.load(); }

    void setDirectLevelL(float dB);
    float getDirectLevelL() const { return directLevelL_.load(); }

    void setDirectLevelR(float dB);
    float getDirectLevelR() const { return directLevelR_.load(); }

    void setRegenL(float dB);
    float getRegenL() const { return regenL_.load(); }

    void setRegenR(float dB);
    float getRegenR() const { return regenR_.load(); }

    // ========================================
    // HUSH Control (RT-safe)
    // ========================================

    void setHushEnabled(bool enabled);
    bool isHushEnabled() const { return hushEnabled_.load(); }

    void setHushThreshold(float dB);
    float getHushThreshold() const { return hushThreshold_.load(); }

    void setHushReleaseRate(float ms);
    float getHushReleaseRate() const { return hushReleaseRate_.load(); }

    HushParameters getHushParameters() const;
    void setHushParameters(const HushParameters& params);

    // ========================================
    // Master Control
    // ========================================

    void setBypass(bool bypass);
    bool isBypassed() const { return bypass_.load(); }

    // ========================================
    // Bulk Parameter Access
    // ========================================

    Parameters getParameters() const;
    void setParameters(const Parameters& params);

    // ========================================
    // Presets
    // ========================================

    static int getNumPresets() { return NUM_PRESETS; }
    static PresetInfo getPresetInfo(int index);
    void loadPreset(int index);
    int getCurrentPreset() const { return currentPreset_.load(); }

    // ========================================
    // Metering
    // ========================================

    Metering getMetering() const;
    void resetPeaks();

private:
    // Maximum delay buffer size (418ms at 192kHz = ~80256 samples)
    static constexpr int MAX_DELAY_SAMPLES = 81920;

    /**
     * Per-voice processing state
     */
    struct VoiceState {
        std::vector<float> delayBufferL;
        std::vector<float> delayBufferR;
        int writePos = 0;
        double lfoPhase = 0.0;

        // Smoothed parameters for zipper-free changes
        juce::SmoothedValue<float> smoothedDelay;
        juce::SmoothedValue<float> smoothedLevel;
        juce::SmoothedValue<float> smoothedPanL;
        juce::SmoothedValue<float> smoothedPanR;
    };

    std::array<VoiceState, NUM_VOICES> voiceStates_;

    // Regeneration/feedback storage
    float lastRegenSampleL_ = 0.0f;
    float lastRegenSampleR_ = 0.0f;

    // HUSH expander envelope follower
    float hushEnvelope_ = 0.0f;

    // Per-voice atomic parameters
    struct AtomicVoiceParams {
        std::atomic<float> level{-6.0f};
        std::atomic<float> pan{0.0f};
        std::atomic<float> delay{15.0f};
        std::atomic<float> depth{50.0f};
        std::atomic<float> rate{40.0f};
    };
    std::array<AtomicVoiceParams, NUM_VOICES> voiceParams_;

    // Global mixer atomics
    std::atomic<float> chorusLevel_{0.0f};
    std::atomic<float> directLevelL_{-3.0f};
    std::atomic<float> directLevelR_{-3.0f};
    std::atomic<float> regenL_{-100.0f};
    std::atomic<float> regenR_{-100.0f};

    // HUSH atomics
    std::atomic<bool> hushEnabled_{false};
    std::atomic<float> hushThreshold_{-40.0f};
    std::atomic<float> hushReleaseRate_{200.0f};

    // Master control
    std::atomic<bool> bypass_{false};
    std::atomic<int> currentPreset_{0};

    // Metering atomics
    std::atomic<float> meterInputL_{-100.0f};
    std::atomic<float> meterInputR_{-100.0f};
    std::atomic<float> meterOutputL_{-100.0f};
    std::atomic<float> meterOutputR_{-100.0f};
    std::atomic<float> meterChorusL_{-100.0f};
    std::atomic<float> meterChorusR_{-100.0f};
    std::atomic<float> meterHushGR_{0.0f};
    std::array<std::atomic<float>, NUM_VOICES> meterVoiceLfoPhases_;

    // Processing state
    double sampleRate_ = 48000.0;
    int blockSize_ = 256;
    bool prepared_ = false;

    // Smoothed global parameters
    juce::SmoothedValue<float> smoothedChorusLevel_;
    juce::SmoothedValue<float> smoothedDirectL_;
    juce::SmoothedValue<float> smoothedDirectR_;
    juce::SmoothedValue<float> smoothedRegenL_;
    juce::SmoothedValue<float> smoothedRegenR_;

    // ========================================
    // Helper Methods
    // ========================================

    /**
     * Process a single voice and add to output accumulators
     */
    void processVoice(int voiceIndex, float inputL, float inputR,
                      float& outL, float& outR);

    /**
     * Process HUSH expander, returns gain multiplier
     */
    float processHush(float inputLevel);

    /**
     * Convert IntelliFX rate (0-254) to Hz
     */
    float rateToHz(float rate) const;

    /**
     * Read from delay line with linear interpolation
     */
    float readDelayLine(const std::vector<float>& buffer, int writePos,
                        float delaySamples) const;

    // Utility functions
    static float linearToDb(float linear);
    static float dbToLinear(float db);
    static float calculatePeakLevel(const float* data, int numSamples);
    static float panToGainL(float pan);
    static float panToGainR(float pan);

    // Preset data
    static const Parameters& getPresetParameters(int index);
};

} // namespace map2
