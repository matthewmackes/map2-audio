#pragma once

/**
 * MAP2 Audio Engine - Stereo Delay Processor
 * Professional multi-tap delay with tempo sync, modulation, filtering, and ducking
 * Inspired by Axe-FX II Delay block
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <atomic>
#include <array>
#include <vector>

namespace map2 {

/**
 * DelayProcessor - Professional stereo delay
 *
 * Features:
 * - Independent L/R delay times up to 2000ms
 * - Tempo sync with 16 beat divisions
 * - 4 multi-taps with level and ratio controls
 * - Stereo modes: Mono, Stereo, Ping-Pong, Dual Mono
 * - Modulation with sine, triangle, and random waveforms
 * - Low cut and high cut filters (in feedback loop or input)
 * - Diffusion for smeared repeats
 * - Ducking that reduces wet signal when input is loud
 * - Spillover option for tails when bypassed
 *
 * All parameters are RT-safe via atomics.
 */
class DelayProcessor {
public:
    /**
     * Stereo mode
     */
    enum class StereoMode {
        Mono = 0,       // Mono delay to both channels
        Stereo = 1,     // True stereo (L->L, R->R)
        PingPong = 2,   // Alternating L-R-L-R pattern
        DualMono = 3    // Independent L and R (no cross-feed)
    };

    /**
     * Modulation waveform
     */
    enum class ModWaveform {
        Sine = 0,
        Triangle = 1,
        Random = 2
    };

    /**
     * Tempo sync divisions (0 = off, then note values)
     */
    enum class TempoDivision {
        Off = 0,
        Whole = 1,      // 1/1 = 4 beats
        Half = 2,       // 1/2 = 2 beats
        Quarter = 3,    // 1/4 = 1 beat
        Eighth = 4,     // 1/8 = 0.5 beats
        Sixteenth = 5,  // 1/16 = 0.25 beats
        ThirtySecond = 6, // 1/32 = 0.125 beats
        WholeDotted = 7,  // 1/1D = 6 beats
        HalfDotted = 8,   // 1/2D = 3 beats
        QuarterDotted = 9,  // 1/4D = 1.5 beats
        EighthDotted = 10,  // 1/8D = 0.75 beats
        SixteenthDotted = 11, // 1/16D = 0.375 beats
        WholeTriplet = 12,    // 1/1T = 2.667 beats
        HalfTriplet = 13,     // 1/2T = 1.333 beats
        QuarterTriplet = 14,  // 1/4T = 0.667 beats
        EighthTriplet = 15,   // 1/8T = 0.333 beats
        SixteenthTriplet = 16 // 1/16T = 0.167 beats
    };

    /**
     * Parameters structure for bulk get/set
     */
    struct Parameters {
        // Core delay
        float delayTimeL = 500.0f;       // ms (1 to 2000)
        float delayTimeR = 500.0f;       // ms (1 to 2000)
        float feedback = 30.0f;          // % (0 to 100)
        float mix = 50.0f;               // % wet (0 to 100)

        // Tempo sync
        float tempo = 120.0f;            // BPM (20 to 300)
        TempoDivision tempoSyncL = TempoDivision::Off;
        TempoDivision tempoSyncR = TempoDivision::Off;

        // Multi-tap (Tap 1 is the main tap)
        float tap1Level = 100.0f;        // % (0 to 100)
        float tap2Level = 0.0f;
        float tap2Ratio = 0.5f;          // ratio of main delay (0.1 to 1)
        float tap3Level = 0.0f;
        float tap3Ratio = 0.33f;
        float tap4Level = 0.0f;
        float tap4Ratio = 0.25f;

        // Stereo
        StereoMode stereoMode = StereoMode::Stereo;
        float stereoSpread = 100.0f;     // % (0 to 200)
        float pan = 0.0f;                // -100 to +100

        // Modulation
        float modRate = 0.5f;            // Hz (0.01 to 10)
        float modDepth = 0.0f;           // % (0 to 100)
        ModWaveform modWaveform = ModWaveform::Sine;

        // Filtering
        float lowCut = 20.0f;            // Hz (20 to 2000)
        float highCut = 12000.0f;        // Hz (1000 to 20000)
        bool filterInLoop = true;        // true = feedback loop, false = input

        // Diffusion
        float diffusion = 0.0f;          // % (0 to 100)

        // Ducking
        float duckThreshold = -20.0f;    // dB (-60 to 0)
        float duckAmount = 0.0f;         // % (0 to 100)
        float duckRelease = 200.0f;      // ms (10 to 2000)

        // Output
        float outputLevel = 0.0f;        // dB (-12 to +12)
        bool spillover = true;           // tails when bypassed
        bool bypass = false;
    };

    /**
     * Metering data - updated every process block
     */
    struct Metering {
        float inputLevelL = -100.0f;     // dB peak
        float inputLevelR = -100.0f;
        float outputLevelL = -100.0f;
        float outputLevelR = -100.0f;
        float delayLevelL = -100.0f;     // wet signal level
        float delayLevelR = -100.0f;
        float duckingGain = 0.0f;        // current ducking reduction in dB
        float modPhase = 0.0f;           // 0-1 for visualization
    };

    DelayProcessor();
    ~DelayProcessor() = default;

    // Prevent copying
    DelayProcessor(const DelayProcessor&) = delete;
    DelayProcessor& operator=(const DelayProcessor&) = delete;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Prepare for processing
     * @param sampleRate Audio sample rate
     * @param samplesPerBlock Maximum block size
     * @param numChannels Number of channels (should be 2 for stereo)
     */
    void prepare(double sampleRate, int samplesPerBlock, int numChannels);

    /**
     * Reset internal state (clears delay buffers)
     */
    void reset();

    // ========================================
    // Processing
    // ========================================

    /**
     * Process audio block in-place
     * @param buffer Audio buffer (modified in place)
     */
    void process(juce::AudioBuffer<float>& buffer);

    // ========================================
    // Parameter Control (RT-safe)
    // ========================================

    // Core delay
    void setDelayTimeL(float ms);
    void setDelayTimeR(float ms);
    void setFeedback(float percent);
    void setMix(float percent);

    float getDelayTimeL() const { return delayTimeL_.load(); }
    float getDelayTimeR() const { return delayTimeR_.load(); }
    float getFeedback() const { return feedback_.load(); }
    float getMix() const { return mix_.load(); }

    // Tempo sync
    void setTempo(float bpm);
    void setTempoSyncL(TempoDivision div);
    void setTempoSyncR(TempoDivision div);

    float getTempo() const { return tempo_.load(); }
    TempoDivision getTempoSyncL() const { return tempoSyncL_.load(); }
    TempoDivision getTempoSyncR() const { return tempoSyncR_.load(); }

    // Multi-tap
    void setTap1Level(float percent);
    void setTap2Level(float percent);
    void setTap2Ratio(float ratio);
    void setTap3Level(float percent);
    void setTap3Ratio(float ratio);
    void setTap4Level(float percent);
    void setTap4Ratio(float ratio);

    // Stereo
    void setStereoMode(StereoMode mode);
    void setStereoSpread(float percent);
    void setPan(float pan);

    StereoMode getStereoMode() const { return stereoMode_.load(); }
    float getStereoSpread() const { return stereoSpread_.load(); }
    float getPan() const { return pan_.load(); }

    // Modulation
    void setModRate(float hz);
    void setModDepth(float percent);
    void setModWaveform(ModWaveform waveform);

    float getModRate() const { return modRate_.load(); }
    float getModDepth() const { return modDepth_.load(); }
    ModWaveform getModWaveform() const { return modWaveform_.load(); }

    // Filtering
    void setLowCut(float hz);
    void setHighCut(float hz);
    void setFilterInLoop(bool inLoop);

    float getLowCut() const { return lowCut_.load(); }
    float getHighCut() const { return highCut_.load(); }
    bool getFilterInLoop() const { return filterInLoop_.load(); }

    // Diffusion
    void setDiffusion(float percent);
    float getDiffusion() const { return diffusion_.load(); }

    // Ducking
    void setDuckThreshold(float dB);
    void setDuckAmount(float percent);
    void setDuckRelease(float ms);

    float getDuckThreshold() const { return duckThreshold_.load(); }
    float getDuckAmount() const { return duckAmount_.load(); }
    float getDuckRelease() const { return duckRelease_.load(); }

    // Output
    void setOutputLevel(float dB);
    void setSpillover(bool enabled);
    void setBypass(bool bypass);

    float getOutputLevel() const { return outputLevel_.load(); }
    bool getSpillover() const { return spillover_.load(); }
    bool isBypassed() const { return bypass_.load(); }

    // Bulk parameter access
    Parameters getParameters() const;
    void setParameters(const Parameters& params);

    // ========================================
    // Tap Tempo
    // ========================================

    /**
     * Record a tap for tempo calculation
     * @param timestampMs Current time in milliseconds
     * @return Calculated tempo in BPM (or 0 if not enough taps)
     */
    float recordTap(double timestampMs);

    /**
     * Clear tap tempo history
     */
    void clearTaps();

    // ========================================
    // Metering (Thread-safe reads)
    // ========================================

    Metering getMetering() const;
    void resetPeaks();

    // ========================================
    // Utility
    // ========================================

    /**
     * Calculate delay time from tempo division
     */
    static float divisionToMs(TempoDivision div, float bpm);

    /**
     * Get the effective delay time (considering tempo sync)
     */
    float getEffectiveDelayTimeL() const;
    float getEffectiveDelayTimeR() const;

private:
    // Maximum delay time in samples (2 seconds at 192kHz)
    static constexpr int MAX_DELAY_SAMPLES = 384000;
    static constexpr int NUM_TAPS = 4;
    static constexpr int NUM_DIFFUSION_STAGES = 4;
    static constexpr int MAX_TAP_HISTORY = 8;

    // Delay buffers (circular)
    std::vector<float> delayBufferL_;
    std::vector<float> delayBufferR_;
    int writePos_ = 0;

    // Diffusion all-pass filters
    struct AllPassFilter {
        std::vector<float> buffer;
        int writePos = 0;
        float feedback = 0.5f;
        int delaySamples = 100;

        void prepare(int maxSamples);
        float process(float input);
        void reset();
    };
    std::array<AllPassFilter, NUM_DIFFUSION_STAGES> diffusionFiltersL_;
    std::array<AllPassFilter, NUM_DIFFUSION_STAGES> diffusionFiltersR_;

    // Filters
    juce::dsp::IIR::Filter<float> lowCutFilterL_;
    juce::dsp::IIR::Filter<float> lowCutFilterR_;
    juce::dsp::IIR::Filter<float> highCutFilterL_;
    juce::dsp::IIR::Filter<float> highCutFilterR_;

    // Modulation LFO state
    double modPhase_ = 0.0;
    float randomModValue_ = 0.0f;
    float randomModTarget_ = 0.0f;
    int randomModCounter_ = 0;

    // Ducking envelope follower state
    float duckEnvelope_ = 0.0f;

    // Smoothed delay times (to avoid clicks)
    juce::SmoothedValue<float> smoothedDelayL_;
    juce::SmoothedValue<float> smoothedDelayR_;

    // Atomic parameters
    std::atomic<float> delayTimeL_{500.0f};
    std::atomic<float> delayTimeR_{500.0f};
    std::atomic<float> feedback_{30.0f};
    std::atomic<float> mix_{50.0f};

    std::atomic<float> tempo_{120.0f};
    std::atomic<TempoDivision> tempoSyncL_{TempoDivision::Off};
    std::atomic<TempoDivision> tempoSyncR_{TempoDivision::Off};

    std::atomic<float> tap1Level_{100.0f};
    std::atomic<float> tap2Level_{0.0f};
    std::atomic<float> tap2Ratio_{0.5f};
    std::atomic<float> tap3Level_{0.0f};
    std::atomic<float> tap3Ratio_{0.33f};
    std::atomic<float> tap4Level_{0.0f};
    std::atomic<float> tap4Ratio_{0.25f};

    std::atomic<StereoMode> stereoMode_{StereoMode::Stereo};
    std::atomic<float> stereoSpread_{100.0f};
    std::atomic<float> pan_{0.0f};

    std::atomic<float> modRate_{0.5f};
    std::atomic<float> modDepth_{0.0f};
    std::atomic<ModWaveform> modWaveform_{ModWaveform::Sine};

    std::atomic<float> lowCut_{20.0f};
    std::atomic<float> highCut_{12000.0f};
    std::atomic<bool> filterInLoop_{true};

    std::atomic<float> diffusion_{0.0f};

    std::atomic<float> duckThreshold_{-20.0f};
    std::atomic<float> duckAmount_{0.0f};
    std::atomic<float> duckRelease_{200.0f};

    std::atomic<float> outputLevel_{0.0f};
    std::atomic<bool> spillover_{true};
    std::atomic<bool> bypass_{false};

    // Metering
    std::atomic<float> inputLevelL_{-100.0f};
    std::atomic<float> inputLevelR_{-100.0f};
    std::atomic<float> outputLevelL_{-100.0f};
    std::atomic<float> outputLevelR_{-100.0f};
    std::atomic<float> delayLevelL_{-100.0f};
    std::atomic<float> delayLevelR_{-100.0f};
    std::atomic<float> duckingGainDb_{0.0f};
    std::atomic<float> modPhaseOut_{0.0f};

    // Tap tempo history
    std::array<double, MAX_TAP_HISTORY> tapHistory_;
    int tapCount_ = 0;
    double lastTapTime_ = 0.0;

    // State
    double sampleRate_ = 48000.0;
    int blockSize_ = 256;
    int numChannels_ = 2;
    bool prepared_ = false;

    // Parameter update flag
    std::atomic<bool> parametersChanged_{true};
    std::atomic<bool> filtersNeedUpdate_{true};

    // Feedback storage for ping-pong
    float lastFeedbackL_ = 0.0f;
    float lastFeedbackR_ = 0.0f;

    // Helper methods
    void updateFilters();
    float readDelay(const std::vector<float>& buffer, float delaySamples) const;
    float getModulation();
    float processDucking(float inputLevel);
    float processDiffusion(float input, std::array<AllPassFilter, NUM_DIFFUSION_STAGES>& filters);

    static float linearToDb(float linear);
    static float dbToLinear(float db);
    static float calculatePeakLevel(const float* data, int numSamples);
};

} // namespace map2
