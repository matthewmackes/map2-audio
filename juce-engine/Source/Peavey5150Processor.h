#pragma once

/**
 * MAP2 Audio Engine - Peavey 5150 Block Letter Amp Simulator
 * 6-stage preamp with cold clipper, Yeh/Smith tone stack,
 * push-pull 6L6GC power amp with supply sag and transformer saturation
 *
 * Signal chain:
 * Input -> 8x Oversample -> 6-Stage Preamp -> Downsample ->
 * Tone Stack -> 8x Oversample -> Push-Pull Power Amp -> Downsample -> Output
 */

#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <atomic>
#include <array>
#include <cmath>
#include <cstring>

namespace map2 {

/**
 * Peavey5150Processor - Block Letter 5150 Tube Amplifier Simulator
 *
 * Features:
 * - 12AX7 triode waveshaping (asymmetric soft-clipping)
 * - Cold clipper stage with 39kΩ unbypassed cathode
 * - Cathode follower interaction model
 * - Yeh/Smith 3rd-order tone stack (250pF/22nF/22nF)
 * - Push-pull 6L6GC pentode power amp with crossover distortion
 * - Power supply sag (RC model)
 * - Output transformer saturation
 * - Presence/Resonance NFB shelving filters
 * - 8x oversampling via polyphase half-band cascade
 * - Factory presets (Brown Sound, Pantera Scoop, etc.)
 *
 * All parameters are RT-safe via atomics.
 */
class Peavey5150Processor {
public:
    /**
     * Factory preset enumeration
     */
    enum class Preset {
        Manual = 0,
        BrownSound,     // Van Halen studio tone
        PanteraScoop,   // Scooped mids, high gain, cold bias
        ModernMetal,    // Maximum gain, cold bias, high presence
        HardRock,       // Medium gain, bumped mids, warm power
        Crunch,         // Low gain, bright switch, touch sensitive

        NumPresets
    };

    /**
     * Main parameters
     */
    struct Parameters {
        float preGain = 5.0f;       // 0-10
        float postGain = 3.0f;      // 0-10
        float low = 5.0f;           // 0-10
        float mid = 5.0f;           // 0-10
        float high = 5.0f;          // 0-10
        float presence = 5.0f;      // 0-10
        float resonance = 5.0f;     // 0-10
        bool bright = false;
        float bias = 3.0f;          // 0-10 (0=cold stock, 10=hot)
        Preset preset = Preset::Manual;
        bool bypass = false;
    };

    /**
     * Metering data for UI
     */
    struct Metering {
        float inputLevel = -100.0f;
        float outputLevel = -100.0f;
        float preampLevel = -100.0f;
        float powerLevel = -100.0f;
        float supplySag = 1.0f;
        float cpuLoad = 0.0f;
    };

    /**
     * Preset info for UI
     */
    struct PresetInfo {
        const char* name;
        const char* description;
    };

    Peavey5150Processor();
    ~Peavey5150Processor() = default;

    Peavey5150Processor(const Peavey5150Processor&) = delete;
    Peavey5150Processor& operator=(const Peavey5150Processor&) = delete;

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

    void setPreGain(float value);
    float getPreGain() const { return preGain_.load(); }

    void setPostGain(float value);
    float getPostGain() const { return postGain_.load(); }

    void setLow(float value);
    float getLow() const { return low_.load(); }

    void setMid(float value);
    float getMid() const { return mid_.load(); }

    void setHigh(float value);
    float getHigh() const { return high_.load(); }

    void setPresence(float value);
    float getPresence() const { return presence_.load(); }

    void setResonance(float value);
    float getResonance() const { return resonance_.load(); }

    void setBright(bool on);
    bool getBright() const { return bright_.load(); }

    void setBias(float value);
    float getBias() const { return bias_.load(); }

    // ========================================
    // State Control
    // ========================================

    void setPreset(Preset preset);
    Preset getPreset() const { return preset_.load(); }

    void setBypass(bool bypass);
    bool isBypassed() const { return bypass_.load(); }

    // ========================================
    // Bulk Parameter Access
    // ========================================

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

private:
    // ========================================
    // Tube Models (inline for RT performance)
    // ========================================

    static inline float fastTanh(float x) {
        if (x < -3.0f) return -1.0f;
        if (x > 3.0f) return 1.0f;
        float x2 = x * x;
        return x * (27.0f + x2) / (27.0f + 9.0f * x2);
    }

    static inline float softClip(float x, float knee) {
        return x / (1.0f + std::abs(x) * knee);
    }

    static float triode12AX7(float input, float bias, float drive);
    static float triodeColdClipper(float input, float drive);
    static float cathodeFollower(float input);
    static float pentode6L6GC(float input, float bias);
    static float pushPullPair(float input, float bias);

    // ========================================
    // First-order RC filter (coupling cap HPF)
    // ========================================
    struct CouplingCapFilter {
        float b0 = 1.0f, b1 = -1.0f, a1 = 0.99f;
        float prevIn = 0.0f, prevOut = 0.0f;

        void setParams(float capFarads, float resistOhms, float sampleRate);
        float process(float input);
        void reset();
    };

    // ========================================
    // First-order RC low-pass (plate bypass)
    // ========================================
    struct PlateLPFilter {
        float b0 = 0.01f, b1 = 0.01f, a1 = -0.98f;
        float prevIn = 0.0f, prevOut = 0.0f;

        void setParams(float capFarads, float resistOhms, float sampleRate);
        float process(float input);
        void reset();
    };

    // ========================================
    // Bright cap model
    // ========================================
    struct BrightCapFilter {
        float capValue = 120e-12f;
        float fs = 384000.0f;
        float prevIn = 0.0f, prevOut = 0.0f;

        void setParams(float capFarads, float sampleRate);
        float process(float input, float gainPotResistance, bool brightOn);
        void reset();
    };

    // ========================================
    // Shelving filter (presence/resonance NFB)
    // ========================================
    struct ShelvingFilter {
        enum Type { HighShelf, LowShelf };
        float b0 = 1.0f, b1 = 0.0f, a1 = 0.0f;
        float prevIn = 0.0f, prevOut = 0.0f;

        void setParams(Type type, float fc, float gainDB, float sampleRate);
        float process(float input);
        void reset();
    };

    // ========================================
    // Half-band filter for 2x oversampling
    // ========================================
    struct HalfBandFilter {
        static constexpr int NumCoeffs = 15;
        static constexpr int HalfOrder = 7;
        static const float coeffs[HalfOrder + 1];

        float delayLine[NumCoeffs] = {};
        int writePos = 0;

        void reset();
        void upsample(float input, float& out1, float& out2);
        float downsample(float in1, float in2);
    };

    // ========================================
    // 8x Oversampler (three 2x half-band stages)
    // ========================================
    struct Oversampler {
        double baseSampleRate = 48000.0;
        HalfBandFilter upFilters[3];
        HalfBandFilter downFilters[3];

        void prepare(double sampleRate);
        void reset();
        double getOversampledRate() const { return baseSampleRate * 8.0; }
        void upsample(float input, float* output8);
        float downsample(const float* input8);
    };

    // ========================================
    // Tone Stack (Yeh/Smith 3rd-order IIR)
    // ========================================
    struct ToneStack {
        double fs = 48000.0;
        float treble = 0.5f, bass = 0.5f, mid = 0.5f;
        static constexpr float C1 = 250e-12f, C2 = 22e-9f, C3 = 22e-9f;
        static constexpr float R1 = 250e3f, R2 = 1e6f, R3 = 25e3f, R4 = 39e3f;
        float b[4] = {}, a[4] = {};
        float state[3] = {};
        bool coeffsDirty = true;

        void prepare(double sampleRate);
        void reset();
        void setTreble(float t01);
        void setBass(float b01);
        void setMid(float m01);
        float process(float input);
        void recalcCoeffs();
    };

    // ========================================
    // Per-channel processing state
    // ========================================
    struct ChannelState {
        // Preamp
        CouplingCapFilter couplingCaps[6];
        PlateLPFilter coldClipperLP;
        BrightCapFilter brightCap;
        float divider1Ratio = 0.5f;

        // Tone stack
        ToneStack toneStack;

        // Power amp
        ShelvingFilter presenceFilter;
        ShelvingFilter resonanceFilter;
        float supplyVoltage = 1.0f;
        float feedbackSignal = 0.0f;
        float transformerLPState = 0.0f;

        // Oversampler instances
        Oversampler preampOS;
        Oversampler powerOS;
    };

    static constexpr int MAX_CHANNELS = 2;
    ChannelState channels_[MAX_CHANNELS];

    // Preamp stage constants
    static constexpr float stageDrive[6] = { 1.2f, 1.5f, 2.0f, 2.5f, 3.0f, 2.0f };
    static constexpr float stageBias[6] = { 0.0f, 0.05f, 0.05f, 0.05f, 0.0f, 0.0f };
    static constexpr float divider2Ratio = 0.68f;
    static constexpr float divider3Ratio = 0.5f;

    // Processing methods
    float processPreamp(ChannelState& ch, float input, float preGain01, bool bright);
    float processPowerAmp(ChannelState& ch, float input, float postGain01, float bias01);

    void prepareChannel(ChannelState& ch, double sampleRate);
    void resetChannel(ChannelState& ch);
    void applyPreset(Preset preset);

    // ========================================
    // Atomic Parameters
    // ========================================
    std::atomic<float> preGain_{5.0f};
    std::atomic<float> postGain_{3.0f};
    std::atomic<float> low_{5.0f};
    std::atomic<float> mid_{5.0f};
    std::atomic<float> high_{5.0f};
    std::atomic<float> presence_{5.0f};
    std::atomic<float> resonance_{5.0f};
    std::atomic<bool> bright_{false};
    std::atomic<float> bias_{3.0f};
    std::atomic<Preset> preset_{Preset::Manual};
    std::atomic<bool> bypass_{false};

    // ========================================
    // Metering Atomics
    // ========================================
    std::atomic<float> meterInput_{-100.0f};
    std::atomic<float> meterOutput_{-100.0f};
    std::atomic<float> meterPreamp_{-100.0f};
    std::atomic<float> meterPower_{-100.0f};
    std::atomic<float> meterSag_{1.0f};
    std::atomic<float> meterCpu_{0.0f};

    // ========================================
    // Processing State
    // ========================================
    double sampleRate_ = 48000.0;
    int blockSize_ = 256;
    int numChannels_ = 2;
    bool prepared_ = false;
    std::atomic<bool> nfbFiltersDirty_{true};

    // ========================================
    // Utility
    // ========================================
    static float linearToDb(float linear);
    static float calculatePeakLevel(const float* data, int numSamples);
};

} // namespace map2
