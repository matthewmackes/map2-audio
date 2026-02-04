/**
 * MAP2 Audio Engine - H3000 Harmonizer Processor
 *
 * Emulates the legendary Eventide H3000 Ultra-Harmonizer (1988)
 * Known for its crystal-clear pitch shifting and studio-quality effects.
 *
 * Key characteristics:
 * - Dual independent pitch shifters with fine control
 * - Micropitch detuning for the signature "thick" sound
 * - Modulated delays with complex routing
 * - Swept comb filters for lush flanging
 * - Used by countless artists: U2, Van Halen, Steve Vai, etc.
 */

#pragma once

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <array>
#include <atomic>
#include <vector>
#include <cmath>
#include <random>

namespace map2 {

class H3000Processor {
public:
    // ========================================
    // Algorithm Presets (H3000 Famous Programs)
    // ========================================
    enum class Algorithm {
        Micropitch = 0,      // Subtle detuning for thickening
        DualShift,           // Independent L/R pitch shifting
        CrystalEchoes,       // Shimmering delays with pitch
        StereoShift,         // Wide stereo pitch image
        LayeredShift,        // Stacked pitch voices
        SweptCombs,          // Classic H3000 flanging
        StutterShift,        // Rhythmic pitch glitches
        ReversePitch,        // Reverse pitch effect
        BandDelays,          // Frequency-selective delays
        PatchFactory,        // Complex modulation patches
        NumAlgorithms
    };

    static constexpr int NUM_ALGORITHMS = static_cast<int>(Algorithm::NumAlgorithms);
    static constexpr int NUM_VOICES = 2;  // Dual pitch shifter
    static constexpr int MAX_DELAY_SAMPLES = 96000;  // 2 seconds at 48kHz
    static constexpr int GRAIN_SIZE = 2048;
    static constexpr int NUM_GRAINS = 4;

    // ========================================
    // Parameter Structure (non-atomic for copyability)
    // ========================================
    struct Parameters {
        // Algorithm selection
        int algorithm = static_cast<int>(Algorithm::Micropitch);

        // Pitch shifting (cents: -2400 to +2400 = 2 octaves)
        float pitchL = 0.0f;        // Left channel pitch
        float pitchR = 0.0f;        // Right channel pitch
        float pitchFine = 0.0f;     // Fine tune both channels

        // Delay (ms)
        float delayL = 15.0f;       // Left delay 0-1000ms
        float delayR = 20.0f;       // Right delay 0-1000ms
        bool delayLink = true;      // Link L/R delays

        // Feedback
        float feedback = 0.0f;      // Feedback 0-100%
        float crossFeedback = 0.0f; // Cross-channel feedback

        // Modulation
        float modDepth = 0.0f;      // Modulation depth 0-100%
        float modRate = 0.5f;       // Modulation rate 0.01-10Hz
        int modWaveform = 0;        // 0=Sine, 1=Tri, 2=Random

        // Filters
        float lowCut = 80.0f;       // Low cut frequency Hz
        float highCut = 12000.0f;   // High cut frequency Hz

        // Levels
        float mix = 50.0f;          // Wet/dry mix 0-100%
        float levelL = 100.0f;      // Left output level 0-100%
        float levelR = 100.0f;      // Right output level 0-100%

        // State
        bool bypass = false;
        float glide = 0.0f;         // Glide time in ms (0-1000)
    };

    // ========================================
    // Metering Structure (non-atomic for copyability)
    // ========================================
    struct Metering {
        float inputLevelL = -100.0f;
        float inputLevelR = -100.0f;
        float outputLevelL = -100.0f;
        float outputLevelR = -100.0f;
        float pitchLActual = 0.0f;    // Current pitch shift L
        float pitchRActual = 0.0f;    // Current pitch shift R
        float delayLActual = 0.0f;    // Current delay L
        float delayRActual = 0.0f;    // Current delay R
        float modPhase = 0.0f;
    };

    // ========================================
    // Algorithm Info
    // ========================================
    struct AlgorithmInfo {
        const char* name;
        const char* shortName;
        const char* description;
    };

    // ========================================
    // Constructor/Destructor
    // ========================================
    H3000Processor();
    ~H3000Processor() = default;

    // ========================================
    // Audio Processing
    // ========================================
    void prepare(double sampleRate, int samplesPerBlock, int numChannels);
    void process(juce::AudioBuffer<float>& buffer);
    void reset();

    // ========================================
    // Algorithm Control
    // ========================================
    void setAlgorithm(Algorithm algo);
    void setAlgorithm(int index);
    Algorithm getAlgorithm() const { return static_cast<Algorithm>(params_.algorithm); }
    int getAlgorithmIndex() const { return params_.algorithm; }

    static int getNumAlgorithms() { return NUM_ALGORITHMS; }
    static AlgorithmInfo getAlgorithmInfo(int index);

    // ========================================
    // Parameter Accessors
    // ========================================
    // Pitch
    void setPitchL(float cents) { params_.pitchL = juce::jlimit(-2400.0f, 2400.0f, cents); }
    void setPitchR(float cents) { params_.pitchR = juce::jlimit(-2400.0f, 2400.0f, cents); }
    float getPitchL() const { return params_.pitchL; }
    float getPitchR() const { return params_.pitchR; }

    // Delay
    void setDelayL(float ms) { params_.delayL = juce::jlimit(0.0f, 1000.0f, ms); }
    void setDelayR(float ms) { params_.delayR = juce::jlimit(0.0f, 1000.0f, ms); }
    float getDelayL() const { return params_.delayL; }
    float getDelayR() const { return params_.delayR; }

    // Feedback
    void setFeedback(float percent) { params_.feedback = juce::jlimit(0.0f, 100.0f, percent); }
    void setCrossFeedback(float percent) { params_.crossFeedback = juce::jlimit(0.0f, 100.0f, percent); }
    float getFeedback() const { return params_.feedback; }
    float getCrossFeedback() const { return params_.crossFeedback; }

    // Modulation
    void setModDepth(float percent) { params_.modDepth = juce::jlimit(0.0f, 100.0f, percent); }
    void setModRate(float hz) { params_.modRate = juce::jlimit(0.1f, 10.0f, hz); }
    float getModDepth() const { return params_.modDepth; }
    float getModRate() const { return params_.modRate; }

    // Filters
    void setLowCut(float hz) { params_.lowCut = juce::jlimit(20.0f, 500.0f, hz); }
    void setHighCut(float hz) { params_.highCut = juce::jlimit(2000.0f, 20000.0f, hz); }
    float getLowCut() const { return params_.lowCut; }
    float getHighCut() const { return params_.highCut; }

    // Levels
    void setMix(float percent) { params_.mix = juce::jlimit(0.0f, 100.0f, percent); }
    void setLevelL(float percent) { params_.levelL = juce::jlimit(0.0f, 100.0f, percent); }
    void setLevelR(float percent) { params_.levelR = juce::jlimit(0.0f, 100.0f, percent); }
    float getMix() const { return params_.mix; }
    float getLevelL() const { return params_.levelL; }
    float getLevelR() const { return params_.levelR; }

    // State
    void setBypass(bool bypass) { params_.bypass = bypass; }
    void setGlide(float ms) { params_.glide = juce::jlimit(0.0f, 1000.0f, ms); }
    bool isBypassed() const { return params_.bypass; }
    float getGlide() const { return params_.glide; }

    // Bulk parameter access
    Parameters getParameters() const { return params_; }
    void setParameters(const Parameters& p);

    // Metering
    Metering getMetering() const { return metering_; }

private:
    // ========================================
    // Grain-based Pitch Shifter
    // ========================================
    struct PitchGrain {
        std::vector<float> buffer;
        int readPos = 0;
        int writePos = 0;
        float amplitude = 0.0f;
        float pitchRatio = 1.0f;
        bool active = false;
    };

    struct PitchShifter {
        std::array<PitchGrain, NUM_GRAINS> grains;
        std::vector<float> inputBuffer;
        int inputWritePos = 0;
        float currentPitch = 0.0f;
        float targetPitch = 0.0f;
        int grainCounter = 0;

        void prepare(int maxSamples, int grainSize);
        float process(float input, float pitchCents, float glideCoeff);
        void reset();
    };

    // ========================================
    // Delay Line
    // ========================================
    struct DelayLine {
        std::vector<float> buffer;
        int writePos = 0;
        float currentDelay = 0.0f;

        void prepare(int maxSamples);
        void write(float sample);
        float read(float delaySamples);
        float readInterpolated(float delaySamples);
        void reset();
    };

    // ========================================
    // Processing
    // ========================================
    void processAlgorithm(juce::AudioBuffer<float>& buffer);
    void processMicropitch(juce::AudioBuffer<float>& buffer);
    void processDualShift(juce::AudioBuffer<float>& buffer);
    void processCrystalEchoes(juce::AudioBuffer<float>& buffer);
    void processStereoShift(juce::AudioBuffer<float>& buffer);
    void processLayeredShift(juce::AudioBuffer<float>& buffer);
    void processSweptCombs(juce::AudioBuffer<float>& buffer);
    void processStutterShift(juce::AudioBuffer<float>& buffer);
    void processReversePitch(juce::AudioBuffer<float>& buffer);
    void processBandDelays(juce::AudioBuffer<float>& buffer);
    void processPatchFactory(juce::AudioBuffer<float>& buffer);

    void updateFilters();
    float getLfoSample();
    void updateMetering(const juce::AudioBuffer<float>& buffer);

    // ========================================
    // Member Variables
    // ========================================
    Parameters params_;
    Metering metering_;

    double sampleRate_ = 48000.0;
    int blockSize_ = 512;
    int numChannels_ = 2;

    // Pitch shifters (one per channel)
    std::array<PitchShifter, 2> pitchShifters_;

    // Delay lines (one per channel)
    std::array<DelayLine, 2> delayLines_;

    // Feedback buffers
    std::array<float, 2> feedbackSamples_{0.0f, 0.0f};

    // Filters
    juce::dsp::IIR::Filter<float> lowCutFilterL_, lowCutFilterR_;
    juce::dsp::IIR::Filter<float> highCutFilterL_, highCutFilterR_;

    // LFO
    float lfoPhase_ = 0.0f;
    float lfoIncrement_ = 0.0f;
    std::mt19937 randomGen_;
    float randomValue_ = 0.0f;
    float randomTarget_ = 0.0f;

    // Smoothing
    juce::SmoothedValue<float> smoothedMix_;
    juce::SmoothedValue<float> smoothedPitchL_;
    juce::SmoothedValue<float> smoothedPitchR_;

    // Comb filter state for SweptCombs
    std::array<std::vector<float>, 4> combBuffers_;
    std::array<int, 4> combWritePos_{0, 0, 0, 0};

    // Reverse buffer for ReversePitch
    std::vector<float> reverseBufferL_, reverseBufferR_;
    int reverseWritePos_ = 0;
    int reverseReadPos_ = 0;
    bool reverseBufferFull_ = false;

    // ========================================
    // Preset Data
    // ========================================
    struct PresetData {
        float pitchL;
        float pitchR;
        float delayL;
        float delayR;
        float feedback;
        float modDepth;
        float modRate;
        float mix;
    };

    static const std::array<PresetData, NUM_ALGORITHMS> ALGORITHM_PRESETS;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(H3000Processor)
};

} // namespace map2
