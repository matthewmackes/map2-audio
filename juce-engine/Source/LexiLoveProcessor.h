#pragma once

/**
 * MAP2 Audio Engine - Lexi Love Reverb Processor
 * Emulates the legendary Lexicon PCM 70 Digital Effects Processor (1985)
 *
 * Features:
 * - 9 factory algorithms based on PCM 70's most popular presets
 * - Multi-band decay (low/mid/high) for the signature Lexicon sound
 * - Early reflection engine with algorithm-specific patterns
 * - FDN late reverb with modulation for "sparkle"
 * - All standard PCM 70 parameters plus user tweaks
 *
 * Algorithm Reference:
 * 1. Tiled Room V2.0 - The legendary preset with "spitty" early reflections
 * 2. Rich Plate - Warm vocals, used on countless recordings
 * 3. Concert Hall - Classic 80s reverb with time variation
 * 4. Small Room - Tight, customizable space
 * 5. Rich Chamber - Warm thick chamber with prominent ERs
 * 6. Gymnasium - Large acoustic space simulation
 * 7. Long Hall - Extended decay concert hall
 * 8. Gated Plate - Compressed/gated for drums
 * 9. Infinite - Special effects and atmospheric textures
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <atomic>
#include <array>
#include <vector>

namespace map2 {

/**
 * LexiLoveProcessor - Lexicon PCM 70 Algorithmic Reverb Emulation
 *
 * All parameters are RT-safe via atomics.
 */
class LexiLoveProcessor {
public:
    // DSP constants
    static constexpr int NUM_REVERB_TAPS = 8;
    static constexpr int NUM_EARLY_TAPS = 12;
    static constexpr int NUM_DIFFUSION_STAGES = 4;
    static constexpr int MAX_PREDELAY_SAMPLES = 24000;  // 500ms at 48kHz

    /**
     * Algorithm enumeration - 9 legendary PCM 70 presets
     */
    enum class Algorithm {
        TiledRoom = 0,    // V2.0 - Legendary "spitty" early reflections
        RichPlate,        // Warm vocals
        ConcertHall,      // Classic 80s with modulation/sparkle
        SmallRoom,        // Tight customizable space
        RichChamber,      // Warm thick chamber
        Gymnasium,        // Large space simulation
        LongHall,         // Extended decay
        GatedPlate,       // Compressed/gated for drums
        Infinite,         // Special effects, atmospheric
        NumAlgorithms
    };

    /**
     * Main parameters - Lexicon PCM 70 style
     */
    struct Parameters {
        Algorithm algorithm = Algorithm::RichPlate;

        // Core parameters (from PCM 70)
        float preDelay = 40.0f;        // 0-500ms
        float decayTime = 2.5f;        // 0.5-30s RT60
        float diffusion = 85.0f;       // 0-100%

        // Multi-band decay (Lexicon signature feature)
        float lowDecayMult = 1.0f;     // 0.25-2.0 (bass decay relative to mid)
        float highDecayMult = 0.8f;    // 0.25-2.0 (treble decay relative to mid)
        float lowCrossover = 500.0f;   // 100-2000Hz
        float highCrossover = 9000.0f; // 2000-15000Hz

        // Early reflections (PCM 70 signature)
        float earlyLevel = 70.0f;      // 0-100%
        float earlyPattern = 50.0f;    // 0-100% (sparse to dense)

        // Modulation (Concert Hall "sparkle")
        float modDepth = 15.0f;        // 0-100%
        float modRate = 0.8f;          // 0.1-10Hz

        // Output
        float mix = 35.0f;             // 0-100%
        float highCut = 12000.0f;      // 1000-20000Hz
        float lowCut = 40.0f;          // 20-500Hz

        // State
        bool bypass = false;
        bool spillover = true;
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
        float earlyLevel = -100.0f;
        float lateLevel = -100.0f;
        float modLfoPhase = 0.0f;
        float currentDecay = 0.0f;
    };

    /**
     * Algorithm information for UI display
     */
    struct AlgorithmInfo {
        const char* name;
        const char* shortName;
        const char* description;
    };

    LexiLoveProcessor();
    ~LexiLoveProcessor() = default;

    // Prevent copying
    LexiLoveProcessor(const LexiLoveProcessor&) = delete;
    LexiLoveProcessor& operator=(const LexiLoveProcessor&) = delete;

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
    // Core Parameter Control (RT-safe)
    // ========================================

    void setAlgorithm(Algorithm algorithm);
    void setAlgorithm(int algorithmIndex);
    void setPreDelay(float ms);
    void setDecayTime(float seconds);
    void setDiffusion(float percent);
    void setMix(float percent);
    void setHighCut(float hz);
    void setLowCut(float hz);

    Algorithm getAlgorithm() const { return algorithm_.load(); }
    float getPreDelay() const { return preDelay_.load(); }
    float getDecayTime() const { return decayTime_.load(); }
    float getDiffusion() const { return diffusion_.load(); }
    float getMix() const { return mix_.load(); }
    float getHighCut() const { return highCut_.load(); }
    float getLowCut() const { return lowCut_.load(); }

    // ========================================
    // Multi-Band Decay Control (RT-safe)
    // ========================================

    void setLowDecayMult(float mult);
    void setHighDecayMult(float mult);
    void setLowCrossover(float hz);
    void setHighCrossover(float hz);

    float getLowDecayMult() const { return lowDecayMult_.load(); }
    float getHighDecayMult() const { return highDecayMult_.load(); }
    float getLowCrossover() const { return lowCrossover_.load(); }
    float getHighCrossover() const { return highCrossover_.load(); }

    // ========================================
    // Early Reflections Control (RT-safe)
    // ========================================

    void setEarlyLevel(float percent);
    void setEarlyPattern(float percent);

    float getEarlyLevel() const { return earlyLevel_.load(); }
    float getEarlyPattern() const { return earlyPattern_.load(); }

    // ========================================
    // Modulation Control (RT-safe)
    // ========================================

    void setModDepth(float percent);
    void setModRate(float hz);

    float getModDepth() const { return modDepth_.load(); }
    float getModRate() const { return modRate_.load(); }

    // ========================================
    // State Control
    // ========================================

    void setSpillover(bool enabled);
    void setBypass(bool bypass);

    bool hasSpillover() const { return spillover_.load(); }
    bool isBypassed() const { return bypass_.load(); }

    // ========================================
    // Bulk Parameter Access
    // ========================================

    Parameters getParameters() const;
    void setParameters(const Parameters& params);

    // ========================================
    // Algorithm Info
    // ========================================

    static AlgorithmInfo getAlgorithmInfo(Algorithm algorithm);
    static AlgorithmInfo getAlgorithmInfo(int algorithmIndex);
    static int getNumAlgorithms() { return static_cast<int>(Algorithm::NumAlgorithms); }

    // ========================================
    // Metering
    // ========================================

    Metering getMetering() const;
    void resetPeaks();

private:
    // ========================================
    // All-Pass Filter (for diffusion network)
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
    // Pre-delay
    // ========================================
    std::vector<float> preDelayBufferL_;
    std::vector<float> preDelayBufferR_;
    int preDelayWritePos_ = 0;

    // ========================================
    // Early Reflections
    // ========================================
    struct EarlyTap {
        int delaySamples = 0;
        float gain = 0.0f;
        float pan = 0.0f;  // -1 to +1
    };
    std::array<EarlyTap, NUM_EARLY_TAPS> earlyTaps_;
    std::vector<float> earlyBufferL_;
    std::vector<float> earlyBufferR_;
    int earlyWritePos_ = 0;

    // ========================================
    // Diffusion Network
    // ========================================
    std::array<AllPassFilter, NUM_DIFFUSION_STAGES> inputDiffusersL_;
    std::array<AllPassFilter, NUM_DIFFUSION_STAGES> inputDiffusersR_;

    // ========================================
    // Late Reverb (FDN)
    // ========================================
    struct ReverbTap {
        std::vector<float> buffer;
        int writePos = 0;
        int delaySamples = 1000;
        float feedback = 0.5f;
        // Multi-band state
        float lowpassState = 0.0f;
        float highpassState = 0.0f;
        float bandpassState = 0.0f;
        // Modulation
        double modPhase = 0.0;
    };

    std::array<ReverbTap, NUM_REVERB_TAPS> reverbTapsL_;
    std::array<ReverbTap, NUM_REVERB_TAPS> reverbTapsR_;

    // ========================================
    // Filters
    // ========================================
    juce::dsp::IIR::Filter<float> lowCutFilterL_;
    juce::dsp::IIR::Filter<float> lowCutFilterR_;
    juce::dsp::IIR::Filter<float> highCutFilterL_;
    juce::dsp::IIR::Filter<float> highCutFilterR_;

    // Multi-band crossover filters
    juce::dsp::IIR::Filter<float> lowBandFilterL_;
    juce::dsp::IIR::Filter<float> lowBandFilterR_;
    juce::dsp::IIR::Filter<float> highBandFilterL_;
    juce::dsp::IIR::Filter<float> highBandFilterR_;

    // ========================================
    // Smoothed Values
    // ========================================
    juce::SmoothedValue<float> smoothedMix_;
    juce::SmoothedValue<float> smoothedPreDelay_;

    // ========================================
    // Atomic Parameters - Core
    // ========================================
    std::atomic<Algorithm> algorithm_{Algorithm::RichPlate};
    std::atomic<float> preDelay_{40.0f};
    std::atomic<float> decayTime_{2.5f};
    std::atomic<float> diffusion_{85.0f};
    std::atomic<float> mix_{35.0f};
    std::atomic<float> highCut_{12000.0f};
    std::atomic<float> lowCut_{40.0f};

    // ========================================
    // Atomic Parameters - Multi-Band Decay
    // ========================================
    std::atomic<float> lowDecayMult_{1.0f};
    std::atomic<float> highDecayMult_{0.8f};
    std::atomic<float> lowCrossover_{500.0f};
    std::atomic<float> highCrossover_{9000.0f};

    // ========================================
    // Atomic Parameters - Early Reflections
    // ========================================
    std::atomic<float> earlyLevel_{70.0f};
    std::atomic<float> earlyPattern_{50.0f};

    // ========================================
    // Atomic Parameters - Modulation
    // ========================================
    std::atomic<float> modDepth_{15.0f};
    std::atomic<float> modRate_{0.8f};

    // ========================================
    // Atomic Parameters - State
    // ========================================
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
    std::atomic<float> meterEarlyLevel_{-100.0f};
    std::atomic<float> meterLateLevel_{-100.0f};
    std::atomic<float> meterModPhase_{0.0f};

    // ========================================
    // Processing State
    // ========================================
    double sampleRate_ = 48000.0;
    int blockSize_ = 256;
    int numChannels_ = 2;
    bool prepared_ = false;
    std::atomic<bool> filtersNeedUpdate_{true};
    std::atomic<bool> earlyTapsNeedUpdate_{true};

    // ========================================
    // Prime delay times for FDN reverb (in samples at 48kHz)
    // Selected for maximum decorrelation
    // ========================================
    static constexpr std::array<int, NUM_REVERB_TAPS> REVERB_DELAYS = {
        1433, 1619, 1823, 2017, 2221, 2417, 2621, 2837
    };

    // ========================================
    // Early reflection delay times per algorithm (ms at 48kHz base)
    // These create the distinctive character of each algorithm
    // ========================================
    struct AlgorithmEarlyPattern {
        std::array<float, NUM_EARLY_TAPS> delayMs;
        std::array<float, NUM_EARLY_TAPS> gains;
        std::array<float, NUM_EARLY_TAPS> pans;
    };

    static const std::array<AlgorithmEarlyPattern, 9> EARLY_PATTERNS;

    // ========================================
    // Factory preset data
    // ========================================
    struct PresetData {
        float preDelay;
        float decayTime;
        float diffusion;
        float lowDecayMult;
        float highDecayMult;
        float lowCrossover;
        float highCrossover;
        float earlyLevel;
        float earlyPattern;
        float modDepth;
        float modRate;
        float highCut;
        float lowCut;
    };

    static const std::array<PresetData, 9> FACTORY_PRESETS;

    // ========================================
    // Processing Methods
    // ========================================
    void processPreDelay(float inputL, float inputR, float& outL, float& outR);
    void processEarlyReflections(float inputL, float inputR, float& outL, float& outR);
    void processDiffusion(float& inOutL, float& inOutR);
    void processLateReverb(float inputL, float inputR, float& outL, float& outR);
    void updateFilters();
    void updateEarlyTaps();
    void applyAlgorithm(Algorithm algorithm);

    // ========================================
    // Utility Methods
    // ========================================
    float readDelayLine(const std::vector<float>& buffer, int writePos, float delaySamples) const;

    static float linearToDb(float linear);
    static float dbToLinear(float db);
    static float calculatePeakLevel(const float* data, int numSamples);
};

} // namespace map2
