#pragma once

/**
 * MAP2 Audio Engine - Tweed Bassman 5F6-A Amplifier Simulator
 * Fender Bassman (1958-60) with full mod suite.
 *
 * Signal chain:
 * Input -> ChannelMixer -> V1(12AY7) -> V2A(12AX7) -> V2B(CathodeFollower)
 * -> Master -> ToneStack -> PhaseInverter(+NFB) -> PowerAmp -> RectifierSag
 * -> CabinetSim -> Output
 *
 * 4x oversampling, 22 parameters, 14 factory presets.
 */

#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <atomic>
#include <array>
#include <cmath>
#include <cstring>

namespace map2 {

class TweedBassmanProcessor {
public:
    // ========================================
    // Factory Presets
    // ========================================
    enum class Preset {
        Manual = 0,
        Stock5F6A,
        CrankedTweed,
        BluesBreakup,
        CountryClean,
        JumpedDirty,
        HighGainMod,
        NeilYoung,
        TweedDeluxe,
        JTM45Flavor,
        SagMonster,
        PedalPlatform,
        BrightChimey,
        SRVTone,
        RecordingDI,
        NumPresets
    };

    // ========================================
    // Parameters
    // ========================================
    struct Parameters {
        // Channel
        int channelMode = 0;        // 0=Normal, 1=Bright, 2=Jumped
        float normalVolume = 5.0f;  // 0-10
        float brightVolume = 5.0f;  // 0-10
        bool brightCap = true;

        // Preamp
        int v1TubeType = 0;         // 0=12AY7, 1=12AX7, 2=5751, 3=12AT7
        bool cathodeBypass = false;
        int cathodeBias = 0;        // 0=Hot(820), 1=Normal(1.5k), 2=Cool(2.7k)

        // Tone
        float treble = 5.0f;       // 0-10
        float mid = 5.0f;          // 0-10
        float bass = 5.0f;         // 0-10
        bool rawSwitch = false;

        // Master
        float masterVolume = 5.0f; // 0-10

        // Power amp
        float presence = 5.0f;     // 0-10
        int nfbMode = 0;           // 0=Stock(27k), 1=None, 2=High(10k)
        int powerTubeType = 0;     // 0=6L6, 1=6V6, 2=EL34, 3=KT66
        int biasMode = 0;          // 0=Fixed, 1=Cathode
        int rectifierType = 0;     // 0=GZ34, 1=5U4G, 2=5Y3, 3=SS

        // Output
        float outputLevel = 0.0f;  // -24 to +6 dB
        bool cabinetEnabled = true;
        int cabinetIR = 0;         // 0=SM57, 1=Ribbon, 2=Room

        // State
        Preset preset = Preset::Manual;
        bool bypass = false;
    };

    // ========================================
    // Metering
    // ========================================
    struct Metering {
        float inputLevel = -100.0f;
        float outputLevel = -100.0f;
        float preampLevel = -100.0f;
        float powerLevel = -100.0f;
        float supplySag = 1.0f;
        float cpuLoad = 0.0f;
    };

    struct PresetInfo {
        const char* name;
        const char* description;
    };

    TweedBassmanProcessor();
    ~TweedBassmanProcessor() = default;

    TweedBassmanProcessor(const TweedBassmanProcessor&) = delete;
    TweedBassmanProcessor& operator=(const TweedBassmanProcessor&) = delete;

    void prepare(double sampleRate, int samplesPerBlock, int numChannels);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);

    // ========================================
    // Individual Parameter Setters/Getters
    // ========================================

    // Channel
    void setChannelMode(int mode);
    int getChannelMode() const { return channelMode_.load(); }
    void setNormalVolume(float v);
    float getNormalVolume() const { return normalVolume_.load(); }
    void setBrightVolume(float v);
    float getBrightVolume() const { return brightVolume_.load(); }
    void setBrightCap(bool on);
    bool getBrightCap() const { return brightCap_.load(); }

    // Preamp
    void setV1TubeType(int type);
    int getV1TubeType() const { return v1TubeType_.load(); }
    void setCathodeBypass(bool on);
    bool getCathodeBypass() const { return cathodeBypass_.load(); }
    void setCathodeBias(int mode);
    int getCathodeBias() const { return cathodeBias_.load(); }

    // Tone
    void setTreble(float v);
    float getTreble() const { return treble_.load(); }
    void setMid(float v);
    float getMid() const { return mid_.load(); }
    void setBass(float v);
    float getBass() const { return bass_.load(); }
    void setRawSwitch(bool on);
    bool getRawSwitch() const { return rawSwitch_.load(); }

    // Master
    void setMasterVolume(float v);
    float getMasterVolume() const { return masterVolume_.load(); }

    // Power amp
    void setPresence(float v);
    float getPresence() const { return presence_.load(); }
    void setNFBMode(int mode);
    int getNFBMode() const { return nfbMode_.load(); }
    void setPowerTubeType(int type);
    int getPowerTubeType() const { return powerTubeType_.load(); }
    void setBiasMode(int mode);
    int getBiasMode() const { return biasMode_.load(); }
    void setRectifierType(int type);
    int getRectifierType() const { return rectifierType_.load(); }

    // Output
    void setOutputLevel(float dB);
    float getOutputLevel() const { return outputLevel_.load(); }
    void setCabinetEnabled(bool on);
    bool getCabinetEnabled() const { return cabinetEnabled_.load(); }
    void setCabinetIR(int index);
    int getCabinetIR() const { return cabinetIR_.load(); }

    // State
    void setPreset(Preset preset);
    Preset getPreset() const { return preset_.load(); }
    void setBypass(bool bypass);
    bool isBypassed() const { return bypass_.load(); }

    // Bulk
    Parameters getParameters() const;
    void setParameters(const Parameters& params);

    // Preset info
    static PresetInfo getPresetInfo(Preset preset);
    static int getNumPresets() { return static_cast<int>(Preset::NumPresets); }

    // Metering
    Metering getMetering() const;

private:
    // ========================================
    // Tube Models
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

    // Triode models with different mu/gain characteristics
    struct TubeParams {
        float mu;       // amplification factor
        float drive;    // drive scaling
        float bias;     // bias offset
        float asymm;    // asymmetry amount (even harmonics)
    };

    static const TubeParams kTubeParams[4]; // 12AY7, 12AX7, 5751, 12AT7

    static float triodeStage(float input, const TubeParams& tube, float cathodeFeedback);
    static float cathodeFollowerStage(float input);

    // Power tube models (pentode characteristics)
    struct PowerTubeParams {
        float gain;
        float headroom;
        float sagAmount;
    };

    static const PowerTubeParams kPowerTubeParams[4]; // 6L6, 6V6, EL34, KT66

    static float pentodePushPull(float input, const PowerTubeParams& tube, float bias01);

    // Rectifier sag parameters
    struct RectifierParams {
        float dropV;    // forward voltage drop
        float resistance; // internal resistance
        float sagTau;   // time constant
    };

    static const RectifierParams kRectifierParams[4]; // GZ34, 5U4G, 5Y3, SS

    // ========================================
    // RC Filter
    // ========================================
    struct RCFilter {
        float b0 = 1.0f, b1 = -1.0f, a1 = 0.99f;
        float prevIn = 0.0f, prevOut = 0.0f;

        void setHighPass(float fc, float sampleRate);
        void setLowPass(float fc, float sampleRate);
        float process(float input);
        void reset();
    };

    // ========================================
    // Shelving Filter (presence NFB)
    // ========================================
    struct ShelvingFilter {
        float b0 = 1.0f, b1 = 0.0f, a1 = 0.0f;
        float prevIn = 0.0f, prevOut = 0.0f;

        void setHighShelf(float fc, float gainDB, float sampleRate);
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
    // 4x Oversampler (two 2x half-band stages)
    // ========================================
    struct Oversampler {
        double baseSampleRate = 48000.0;
        HalfBandFilter upFilters[2];
        HalfBandFilter downFilters[2];

        void prepare(double sampleRate);
        void reset();
        double getOversampledRate() const { return baseSampleRate * 4.0; }
        void upsample(float input, float* output4);
        float downsample(const float* input4);
    };

    // ========================================
    // Tone Stack (Yeh/Smith - Bassman values)
    // ========================================
    struct ToneStack {
        double fs = 48000.0;
        float treble = 0.5f, bass = 0.5f, mid = 0.5f;
        // Bassman production values
        static constexpr float C1 = 250e-12f, C2 = 20e-9f, C3 = 100e-9f;
        static constexpr float R1 = 100e3f, R2 = 1e6f, R3 = 25e3f, R4 = 250e3f;
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
    // Bright Cap model
    // ========================================
    struct BrightCapFilter {
        float prevIn = 0.0f, prevOut = 0.0f;
        float fs = 192000.0f;

        void prepare(float sampleRate);
        float process(float input, float volumePot01, bool enabled);
        void reset();
    };

    // ========================================
    // Cabinet Sim (simple EQ model)
    // ========================================
    struct CabinetSim {
        RCFilter hpf;      // 80Hz HPF
        RCFilter lpf;      // 5kHz LPF
        RCFilter resonance; // 100Hz resonance bump

        void prepare(double sampleRate);
        float process(float input);
        void reset();
    };

    // ========================================
    // Per-channel processing state
    // ========================================
    struct ChannelState {
        // Coupling caps (preamp interstage)
        RCFilter couplingCaps[4]; // V1 in, V1-V2A, V2A-V2B, V2B-tone
        RCFilter brightCapHPF;

        // Tone stack
        ToneStack toneStack;

        // Phase inverter + Power amp
        ShelvingFilter presenceFilter;
        float feedbackSignal = 0.0f;
        float supplyVoltage = 1.0f;
        float transformerLPState = 0.0f;

        // Bright cap
        BrightCapFilter brightCap;

        // Cabinet
        CabinetSim cabinet;

        // Oversampler
        Oversampler oversampler;
    };

    static constexpr int MAX_CHANNELS = 2;
    ChannelState channels_[MAX_CHANNELS];

    // Processing
    float processPreamp(ChannelState& ch, float input);
    float processPowerAmp(ChannelState& ch, float input);
    void prepareChannel(ChannelState& ch, double sampleRate);
    void resetChannel(ChannelState& ch);
    void applyPreset(Preset preset);

    // ========================================
    // Atomic Parameters
    // ========================================
    std::atomic<int> channelMode_{0};
    std::atomic<float> normalVolume_{5.0f};
    std::atomic<float> brightVolume_{5.0f};
    std::atomic<bool> brightCap_{true};
    std::atomic<int> v1TubeType_{0};
    std::atomic<bool> cathodeBypass_{false};
    std::atomic<int> cathodeBias_{0};
    std::atomic<float> treble_{5.0f};
    std::atomic<float> mid_{5.0f};
    std::atomic<float> bass_{5.0f};
    std::atomic<bool> rawSwitch_{false};
    std::atomic<float> masterVolume_{5.0f};
    std::atomic<float> presence_{5.0f};
    std::atomic<int> nfbMode_{0};
    std::atomic<int> powerTubeType_{0};
    std::atomic<int> biasMode_{0};
    std::atomic<int> rectifierType_{0};
    std::atomic<float> outputLevel_{0.0f};
    std::atomic<bool> cabinetEnabled_{true};
    std::atomic<int> cabinetIR_{0};
    std::atomic<Preset> preset_{Preset::Manual};
    std::atomic<bool> bypass_{false};

    // ========================================
    // Metering
    // ========================================
    std::atomic<float> meterInput_{-100.0f};
    std::atomic<float> meterOutput_{-100.0f};
    std::atomic<float> meterPreamp_{-100.0f};
    std::atomic<float> meterPower_{-100.0f};
    std::atomic<float> meterSag_{1.0f};
    std::atomic<float> meterCpu_{0.0f};

    // ========================================
    // State
    // ========================================
    double sampleRate_ = 48000.0;
    int blockSize_ = 256;
    int numChannels_ = 2;
    bool prepared_ = false;
    std::atomic<bool> nfbFiltersDirty_{true};

    // DC blocker
    float dcBlockState_[MAX_CHANNELS] = {};
    float dcBlockCoeff_ = 0.0f;

    static float linearToDb(float linear);
    static float calculatePeakLevel(const float* data, int numSamples);
};

} // namespace map2
