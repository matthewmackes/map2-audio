#pragma once

/**
 * MAP2 Audio Engine - ShoeGaze Multi-Effect Processor
 * "Wall of Sound" effect inspired by boutique ambient and shimmer pedals
 * Captures the aesthetic of My Bloody Valentine, Slowdive, and Cocteau Twins
 *
 * Signal chain:
 * Input -> Saturation -> Modulated Delay -> Shimmer (Pitch+Reverb) -> Chorus -> Filters -> Mix -> Output
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <atomic>
#include <array>
#include <memory>
#include <vector>

namespace map2 {

/**
 * ShoeGazeProcessor - Multi-effect for dreamy, atmospheric sounds
 *
 * Features:
 * - Soft saturation for warmth
 * - Modulated delay with BBD-style wobble
 * - Granular shimmer (pitch shifting into reverb feedback)
 * - FDN reverb network with long decay
 * - Multi-voice chorus for thickness
 * - Low/high cut filters for tone shaping
 * - Artist-inspired presets (MBV, Slowdive, Cocteau Twins, etc.)
 *
 * All parameters are RT-safe via atomics.
 */
class ShoeGazeProcessor {
public:
    // DSP constants
    static constexpr int NUM_REVERB_TAPS = 8;
    static constexpr int MAX_CHORUS_VOICES = 6;
    static constexpr int MAX_DELAY_SAMPLES = 192000;  // 1s at 192kHz
    static constexpr int NUM_SHIMMER_GRAINS = 4;
    static constexpr int SHIMMER_GRAIN_SIZE = 2048;
    static constexpr int NUM_DIFFUSION_STAGES = 4;

    /**
     * Artist-inspired preset enumeration
     */
    enum class Preset {
        Manual = 0,       // User-defined settings

        // Shoegaze classics
        Loveless,         // My Bloody Valentine - dense, gliding
        Souvlaki,         // Slowdive - ethereal, washy
        Treasure,         // Cocteau Twins - shimmering crystal
        SpaceAge,         // Spiritualized - expansive, evolving
        Psychocandy,      // Jesus and Mary Chain - feedback noise
        Nowhere,          // Ride - swirling, propulsive

        NumPresets
    };

    /**
     * Main parameters - musically meaningful controls
     */
    struct Parameters {
        // Primary controls
        float atmosphere = 50.0f;       // 0-100%, master dreamy amount
        float decay = 4.0f;             // 0.5-30s, reverb tail
        float shimmer = 25.0f;          // 0-100%, shimmer amount
        float shimmerPitch = 12.0f;     // -12 to +24 semitones
        float modulation = 35.0f;       // 0-100%, chorus depth
        float modRate = 0.7f;           // 0.1-5Hz
        float drive = 15.0f;            // 0-100%, saturation
        float delayTime = 200.0f;       // 0-1000ms
        float delayFeedback = 30.0f;    // 0-90%
        float delayMod = 20.0f;         // 0-100%, BBD wobble
        float lowCut = 80.0f;           // 20-2000Hz
        float highCut = 8000.0f;        // 1000-20000Hz
        float mix = 50.0f;              // 0-100%
        float stereoWidth = 150.0f;     // 0-200%

        // Advanced controls
        float reverbDiffusion = 85.0f;  // 0-100%
        float reverbDamping = 40.0f;    // 0-100%
        float reverbSize = 75.0f;       // 10-100%
        float reverbModDepth = 15.0f;   // 0-50%
        float shimmerFeedback = 35.0f;  // 0-80%
        float shimmerDelay = 50.0f;     // 0-200ms
        int chorusVoices = 4;           // 1-6
        float chorusSpread = 80.0f;     // 0-100%
        float saturationTone = 50.0f;   // 0-100%
        float ducking = 0.0f;           // 0-100%

        // State
        Preset preset = Preset::Manual;
        bool spillover = true;
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
        float reverbLevelL = -100.0f;
        float reverbLevelR = -100.0f;
        float shimmerLevel = -100.0f;
        float saturationAmount = 0.0f;
        float chorusLfoPhase = 0.0f;
        float delayModPhase = 0.0f;
        float duckingGain = 0.0f;
    };

    /**
     * Preset information for UI display
     */
    struct PresetInfo {
        const char* name;
        const char* artist;
        const char* description;
    };

    ShoeGazeProcessor();
    ~ShoeGazeProcessor() = default;

    // Prevent copying
    ShoeGazeProcessor(const ShoeGazeProcessor&) = delete;
    ShoeGazeProcessor& operator=(const ShoeGazeProcessor&) = delete;

    // ========================================
    // Initialization
    // ========================================

    void prepare(double sampleRate, int samplesPerBlock, int numChannels);
    void reset();

    // ========================================
    // Processing
    // ========================================

    void process(juce::AudioBuffer<float>& buffer);

    // ========================================
    // Primary Parameter Control (RT-safe)
    // ========================================

    void setAtmosphere(float percent);
    void setDecay(float seconds);
    void setShimmer(float percent);
    void setShimmerPitch(float semitones);
    void setModulation(float percent);
    void setModRate(float hz);
    void setDrive(float percent);
    void setDelayTime(float ms);
    void setDelayFeedback(float percent);
    void setDelayMod(float percent);
    void setLowCut(float hz);
    void setHighCut(float hz);
    void setMix(float percent);
    void setStereoWidth(float percent);

    float getAtmosphere() const { return atmosphere_.load(); }
    float getDecay() const { return decay_.load(); }
    float getShimmer() const { return shimmer_.load(); }
    float getShimmerPitch() const { return shimmerPitch_.load(); }
    float getModulation() const { return modulation_.load(); }
    float getModRate() const { return modRate_.load(); }
    float getDrive() const { return drive_.load(); }
    float getDelayTime() const { return delayTime_.load(); }
    float getDelayFeedback() const { return delayFeedback_.load(); }
    float getDelayMod() const { return delayMod_.load(); }
    float getLowCut() const { return lowCut_.load(); }
    float getHighCut() const { return highCut_.load(); }
    float getMix() const { return mix_.load(); }
    float getStereoWidth() const { return stereoWidth_.load(); }

    // ========================================
    // Advanced Parameter Control (RT-safe)
    // ========================================

    void setReverbDiffusion(float percent);
    void setReverbDamping(float percent);
    void setReverbSize(float percent);
    void setReverbModDepth(float percent);
    void setShimmerFeedback(float percent);
    void setShimmerDelay(float ms);
    void setChorusVoices(int voices);
    void setChorusSpread(float percent);
    void setSaturationTone(float percent);
    void setDucking(float percent);

    float getReverbDiffusion() const { return reverbDiffusion_.load(); }
    float getReverbDamping() const { return reverbDamping_.load(); }
    float getReverbSize() const { return reverbSize_.load(); }
    float getReverbModDepth() const { return reverbModDepth_.load(); }
    float getShimmerFeedback() const { return shimmerFeedback_.load(); }
    float getShimmerDelay() const { return shimmerDelay_.load(); }
    int getChorusVoices() const { return chorusVoices_.load(); }
    float getChorusSpread() const { return chorusSpread_.load(); }
    float getSaturationTone() const { return saturationTone_.load(); }
    float getDucking() const { return ducking_.load(); }

    // ========================================
    // State Control
    // ========================================

    void setPreset(Preset preset);
    void setSpillover(bool enabled);
    void setBypass(bool bypass);

    Preset getPreset() const { return preset_.load(); }
    bool hasSpillover() const { return spillover_.load(); }
    bool isBypassed() const { return bypass_.load(); }

    // ========================================
    // Bulk Parameter Access
    // ========================================

    Parameters getParameters() const;
    void setParameters(const Parameters& params);
    std::unique_ptr<ShoeGazeProcessor> cloneForSpillover() const;

    // ========================================
    // Preset Info
    // ========================================

    static PresetInfo getPresetInfo(Preset preset);
    static int getNumPresets() { return static_cast<int>(Preset::NumPresets); }

    // ========================================
    // Metering
    // ========================================

    Metering getMetering() const;
    void resetPeaks();

private:
    // ========================================
    // All-Pass Filter (for diffusion)
    // ========================================
    struct AllPassFilter {
        std::vector<float> buffer;
        int writePos = 0;
        float feedback = 0.5f;
        int delaySamples = 100;

        void prepare(int maxSamples);
        float process(float input);
        void reset();
    };

    // ========================================
    // Delay Section
    // ========================================
    std::vector<float> delayBufferL_;
    std::vector<float> delayBufferR_;
    int delayWritePos_ = 0;
    double delayModLfoPhase_ = 0.0;
    std::array<AllPassFilter, NUM_DIFFUSION_STAGES> delayDiffusersL_;
    std::array<AllPassFilter, NUM_DIFFUSION_STAGES> delayDiffusersR_;

    // ========================================
    // Shimmer Section (Granular Pitch Shift)
    // ========================================
    struct ShimmerGrain {
        float readPos = 0.0f;
        float readSpeed = 1.0f;
        float amplitude = 0.0f;
        int sampleCount = 0;
        bool active = false;
    };

    std::vector<float> shimmerBufferL_;
    std::vector<float> shimmerBufferR_;
    int shimmerWritePos_ = 0;
    std::array<ShimmerGrain, NUM_SHIMMER_GRAINS> shimmerGrainsL_;
    std::array<ShimmerGrain, NUM_SHIMMER_GRAINS> shimmerGrainsR_;
    int currentShimmerGrain_ = 0;
    int shimmerGrainSize_ = SHIMMER_GRAIN_SIZE;
    float shimmerFeedbackL_ = 0.0f;
    float shimmerFeedbackR_ = 0.0f;

    // ========================================
    // Reverb Section (FDN)
    // ========================================
    struct ReverbTap {
        std::vector<float> buffer;
        int writePos = 0;
        int delaySamples = 1000;
        float feedback = 0.5f;
        float lowpassState = 0.0f;
        double modPhase = 0.0;
    };

    std::array<ReverbTap, NUM_REVERB_TAPS> reverbTapsL_;
    std::array<ReverbTap, NUM_REVERB_TAPS> reverbTapsR_;
    std::array<AllPassFilter, NUM_DIFFUSION_STAGES> reverbDiffusersL_;
    std::array<AllPassFilter, NUM_DIFFUSION_STAGES> reverbDiffusersR_;

    // ========================================
    // Chorus Section
    // ========================================
    struct ChorusVoice {
        std::vector<float> buffer;
        int writePos = 0;
        double lfoPhase = 0.0;
        float pan = 0.0f;  // -1 to +1
    };

    std::array<ChorusVoice, MAX_CHORUS_VOICES> chorusVoicesL_;
    std::array<ChorusVoice, MAX_CHORUS_VOICES> chorusVoicesR_;

    // ========================================
    // Filters
    // ========================================
    juce::dsp::IIR::Filter<float> lowCutFilterL_;
    juce::dsp::IIR::Filter<float> lowCutFilterR_;
    juce::dsp::IIR::Filter<float> highCutFilterL_;
    juce::dsp::IIR::Filter<float> highCutFilterR_;
    juce::dsp::IIR::Filter<float> saturationToneL_;
    juce::dsp::IIR::Filter<float> saturationToneR_;

    // ========================================
    // Ducking
    // ========================================
    float duckingEnvelope_ = 1.0f;

    // ========================================
    // Smoothed Values
    // ========================================
    juce::SmoothedValue<float> smoothedMix_;
    juce::SmoothedValue<float> smoothedDrive_;
    juce::SmoothedValue<float> smoothedDelayTime_;

    // ========================================
    // Atomic Parameters - Primary
    // ========================================
    std::atomic<float> atmosphere_{50.0f};
    std::atomic<float> decay_{4.0f};
    std::atomic<float> shimmer_{25.0f};
    std::atomic<float> shimmerPitch_{12.0f};
    std::atomic<float> modulation_{35.0f};
    std::atomic<float> modRate_{0.7f};
    std::atomic<float> drive_{15.0f};
    std::atomic<float> delayTime_{200.0f};
    std::atomic<float> delayFeedback_{30.0f};
    std::atomic<float> delayMod_{20.0f};
    std::atomic<float> lowCut_{80.0f};
    std::atomic<float> highCut_{8000.0f};
    std::atomic<float> mix_{50.0f};
    std::atomic<float> stereoWidth_{150.0f};

    // ========================================
    // Atomic Parameters - Advanced
    // ========================================
    std::atomic<float> reverbDiffusion_{85.0f};
    std::atomic<float> reverbDamping_{40.0f};
    std::atomic<float> reverbSize_{75.0f};
    std::atomic<float> reverbModDepth_{15.0f};
    std::atomic<float> shimmerFeedback_{35.0f};
    std::atomic<float> shimmerDelay_{50.0f};
    std::atomic<int> chorusVoices_{4};
    std::atomic<float> chorusSpread_{80.0f};
    std::atomic<float> saturationTone_{50.0f};
    std::atomic<float> ducking_{0.0f};

    // ========================================
    // Atomic Parameters - State
    // ========================================
    std::atomic<Preset> preset_{Preset::Manual};
    std::atomic<bool> spillover_{true};
    std::atomic<bool> bypass_{false};

    // ========================================
    // Metering Atomics
    // ========================================
    std::atomic<float> meterInputL_{-100.0f};
    std::atomic<float> meterInputR_{-100.0f};
    std::atomic<float> meterOutputL_{-100.0f};
    std::atomic<float> meterOutputR_{-100.0f};
    std::atomic<float> meterReverbL_{-100.0f};
    std::atomic<float> meterReverbR_{-100.0f};
    std::atomic<float> meterShimmer_{-100.0f};
    std::atomic<float> meterSaturation_{0.0f};
    std::atomic<float> meterChorusPhase_{0.0f};
    std::atomic<float> meterDelayModPhase_{0.0f};
    std::atomic<float> meterDuckingGain_{0.0f};

    // ========================================
    // Processing State
    // ========================================
    double sampleRate_ = 48000.0;
    int blockSize_ = 256;
    int numChannels_ = 2;
    bool prepared_ = false;
    std::atomic<bool> filtersNeedUpdate_{true};

    // ========================================
    // Prime delay times for FDN reverb (in samples at 48kHz)
    // ========================================
    static constexpr std::array<int, NUM_REVERB_TAPS> REVERB_DELAYS = {
        1433, 1619, 1823, 2017, 2221, 2417, 2621, 2837
    };

    // ========================================
    // Processing Methods
    // ========================================
    float processSaturation(float input, float driveAmount, float toneAmount);
    void processDelay(float& inOutL, float& inOutR);
    void processShimmer(float inputL, float inputR, float& outL, float& outR);
    void processReverb(float inputL, float inputR, float& outL, float& outR);
    void processChorus(float& inOutL, float& inOutR);
    float processDucking(float inputLevel);
    void updateFilters();
    void applyPreset(Preset preset);

    // ========================================
    // Utility Methods
    // ========================================
    float readDelayLine(const std::vector<float>& buffer, int writePos, float delaySamples) const;
    float hannWindow(float phase) const;
    float semitonesToRatio(float semitones) const;

    static float linearToDb(float linear);
    static float dbToLinear(float db);
    static float calculatePeakLevel(const float* data, int numSamples);
};

} // namespace map2
