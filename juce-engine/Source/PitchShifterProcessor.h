#pragma once

/**
 * MAP2 Audio Engine - Pitch Shifter Processor
 * Dual-voice stereo pitch shifter / harmonizer with Van Halen-inspired presets
 * Based on Eventide--IN-STYLE H910/H949/H3000 algorithms
 *
 * Research sources:
 * - Eventide--IN-STYLE forums: Eddie used dual H910s set to +/-18 cents with 12ms stagger
 * - Roth era (VH I - 1984): H910/H949 at ~+/-4-9 cents, 3-20ms delay
 * - Hagar era (5150 - Balance): H3000 micropitch at +/-9 cents, longer delays
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <atomic>
#include <array>
#include <vector>

namespace map2 {

/**
 * PitchShifterProcessor - EVH--IN-STYLE-style dual pitch shifter
 *
 * Features:
 * - Independent L/R pitch shift in cents (-100 to +100)
 * - Independent L/R delay (0 to 100ms)
 * - Mix control for wet/dry blend
 * - Van Halen song-inspired presets
 * - Feedback for shimmer/spiral effects
 * - Stereo spread control
 *
 * Algorithm: Granular pitch shifting with dual overlapping grains
 * and linear interpolation, similar to classic Eventide--IN-STYLE units.
 */
class PitchShifterProcessor {
public:
    /**
     * Van Halen-inspired preset enumeration
     * Named after iconic EVH--IN-STYLE songs featuring the harmonizer
     */
    enum class Preset {
        Manual = 0,           // User-defined settings

        // === David Lee Roth Era (H910/H949) ===
        Eruption,             // Classic VH1 tone, subtle +/-4c, 3ms/6ms
        Unchained,            // Fair Warning, +/-4c dual detune
        LittleGuitars,        // Diver Down, delicate +/-5c
        MeanStreet,           // Fair Warning intro, heavier +/-7c
        DropDeadLegs,         // 1984, sub-octave mixed in
        Panama,               // 1984, +/-7c with 8ms/20ms delay
        Cathedral,            // Diver Down echo/shimmer, +/-12c with feedback
        HotForTeacher,        // 1984, punchy +/-6c

        // === Sammy Hagar Era (H3000 Micropitch) ===
        WhyCantThisBeLove,    // 5150, classic micropitch +/-9c
        Dreams,               // 5150, wide stereo +/-9c, 250ms/500ms
        FinishWhatYaStarted,  // OU812, clean subtle +/-6c
        RightNow,             // F.U.C.K., thick +/-9c
        CantStopLovinYou,     // Balance, smooth +/-9c
        HumansBeingOuttro,    // Twister soundtrack, thick +/-12c

        NumPresets
    };

    /**
     * Parameters structure
     */
    struct Parameters {
        float pitchL = 0.0f;          // cents (-100 to +100)
        float pitchR = 0.0f;          // cents (-100 to +100)
        float delayL = 0.0f;          // ms (0 to 100)
        float delayR = 0.0f;          // ms (0 to 100)
        float feedback = 0.0f;        // 0 to 0.9
        float mix = 50.0f;            // % wet (0 to 100)
        float spread = 100.0f;        // stereo spread % (0 to 200)
        Preset preset = Preset::Manual;
        bool bypass = false;
    };

    /**
     * Metering data
     */
    struct Metering {
        float inputLevelL = -100.0f;
        float inputLevelR = -100.0f;
        float outputLevelL = -100.0f;
        float outputLevelR = -100.0f;
        float grainPhase = 0.0f;      // 0-1 for visualization
    };

    /**
     * Preset info for UI display
     */
    struct PresetInfo {
        const char* name;
        const char* song;
        const char* album;
        const char* year;
        const char* description;
    };

    PitchShifterProcessor();
    ~PitchShifterProcessor() = default;

    // Prevent copying
    PitchShifterProcessor(const PitchShifterProcessor&) = delete;
    PitchShifterProcessor& operator=(const PitchShifterProcessor&) = delete;

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
    // Parameter Control (RT-safe)
    // ========================================

    void setPitchL(float cents);
    void setPitchR(float cents);
    void setDelayL(float ms);
    void setDelayR(float ms);
    void setFeedback(float amount);
    void setMix(float percent);
    void setSpread(float percent);
    void setPreset(Preset preset);
    void setBypass(bool bypass);

    float getPitchL() const { return pitchL_.load(); }
    float getPitchR() const { return pitchR_.load(); }
    float getDelayL() const { return delayL_.load(); }
    float getDelayR() const { return delayR_.load(); }
    float getFeedback() const { return feedback_.load(); }
    float getMix() const { return mix_.load(); }
    float getSpread() const { return spread_.load(); }
    Preset getPreset() const { return preset_.load(); }
    bool isBypassed() const { return bypass_.load(); }

    Parameters getParameters() const;
    void setParameters(const Parameters& params);

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
    // Maximum delay/buffer size (100ms at 192kHz + grain buffer)
    static constexpr int MAX_DELAY_SAMPLES = 19200;
    static constexpr int GRAIN_SIZE = 2048;       // ~42ms at 48kHz
    static constexpr int NUM_GRAINS = 2;          // Overlapping grains

    // Grain structure for pitch shifting
    struct Grain {
        float readPos = 0.0f;
        float readSpeed = 1.0f;     // 1.0 = no pitch shift
        float amplitude = 0.0f;     // Window amplitude
        int sampleCount = 0;
        bool active = false;
    };

    // Per-channel pitch shifter state
    struct ChannelState {
        std::vector<float> buffer;
        int writePos = 0;
        std::array<Grain, NUM_GRAINS> grains;
        int currentGrain = 0;
        float feedback = 0.0f;
    };

    ChannelState stateL_;
    ChannelState stateR_;

    // Additional delay lines for post-pitch delay
    std::vector<float> delayBufferL_;
    std::vector<float> delayBufferR_;
    int delayWritePos_ = 0;

    // Smoothed parameters for glitch-free changes
    juce::SmoothedValue<float> smoothedPitchL_;
    juce::SmoothedValue<float> smoothedPitchR_;
    juce::SmoothedValue<float> smoothedDelayL_;
    juce::SmoothedValue<float> smoothedDelayR_;
    juce::SmoothedValue<float> smoothedMix_;

    // Atomic parameters
    std::atomic<float> pitchL_{0.0f};
    std::atomic<float> pitchR_{0.0f};
    std::atomic<float> delayL_{0.0f};
    std::atomic<float> delayR_{0.0f};
    std::atomic<float> feedback_{0.0f};
    std::atomic<float> mix_{50.0f};
    std::atomic<float> spread_{100.0f};
    std::atomic<Preset> preset_{Preset::Manual};
    std::atomic<bool> bypass_{false};

    // Metering
    std::atomic<float> inputLevelL_{-100.0f};
    std::atomic<float> inputLevelR_{-100.0f};
    std::atomic<float> outputLevelL_{-100.0f};
    std::atomic<float> outputLevelR_{-100.0f};
    std::atomic<float> grainPhase_{0.0f};

    // State
    double sampleRate_ = 48000.0;
    int blockSize_ = 256;
    int numChannels_ = 2;
    int grainSize_ = GRAIN_SIZE;
    bool prepared_ = false;

    std::atomic<bool> parametersChanged_{true};

    // Helper methods
    void applyPreset(Preset preset);
    float processSample(ChannelState& state, float input, float pitchRatio);
    float readFromBuffer(const std::vector<float>& buffer, float pos) const;
    float hannWindow(float phase) const;
    float centsToRatio(float cents) const;

    static float linearToDb(float linear);
    static float dbToLinear(float db);
    static float calculatePeakLevel(const float* data, int numSamples);
};

} // namespace map2
