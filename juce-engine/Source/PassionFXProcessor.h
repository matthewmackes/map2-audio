#pragma once

/**
 * MAP2 Audio Engine - PassionFX Multi-Effect Processor
 * Streamlined multi-effect chain inspired by Steve Vai's "Passion & Warfare" tones
 * 12-module signal chain with per-module enable and key parameters
 *
 * Signal chain:
 * Input -> NoiseGate -> Compressor -> Wah -> Phaser -> Chorus ->
 * PitchShifter -> Harmonizer -> Delay -> Reverb -> EQ -> Exciter -> Tremolo -> Output
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <atomic>
#include <array>
#include <vector>

namespace map2 {

/**
 * PassionFXProcessor - Multi-effect for expressive, virtuoso guitar tones
 *
 * Features:
 * - 12-module signal chain (gate, comp, wah, phaser, chorus, pitch, harmonizer,
 *   delay, reverb, EQ, exciter, tremolo)
 * - Per-module bypass for flexible routing
 * - FDN reverb with shimmer and freeze
 * - Stereo delay with pitch-shifted feedback
 * - Granular pitch shifting and harmonization
 * - Factory presets inspired by Passion & Warfare tracks
 *
 * All parameters are RT-safe via atomics.
 */
class PassionFXProcessor {
public:
    // DSP constants
    static constexpr int NUM_REVERB_TAPS = 8;
    static constexpr int MAX_DELAY_SAMPLES = 384000;   // 8s at 48kHz
    static constexpr int MAX_CHORUS_VOICES = 6;
    static constexpr int NUM_PHASER_STAGES_MAX = 16;
    static constexpr int PITCH_GRAIN_SIZE = 2048;
    static constexpr int NUM_PITCH_GRAINS = 2;
    static constexpr int NUM_HARM_VOICES = 2;

    /**
     * Passion & Warfare track-inspired preset enumeration
     */
    enum class Preset {
        Manual = 0,

        // Passion & Warfare tracks
        Liberty,                  // Liberty - soaring clean lead
        EroticNightmares,         // Erotic Nightmares - aggressive, dark
        TheAnimal,                // The Animal - raw, primal overdrive
        Answers,                  // Answers - emotional ballad shimmer
        TheRiddle,                // The Riddle - mysterious, phased
        Ballerina1224,            // Ballerina 12/24 - delicate harmonics
        ForTheLoveOfGod,          // For the Love of God - epic sustain & reverb
        TheAudienceIsListening,   // The Audience Is Listening - wah-heavy funk
        IWouldLoveTo,             // I Would Love To - lush chorus & delay
        BluePowder,               // Blue Powder - jazzy clean, warm
        GreasyKidsStuff,          // Greasy Kids Stuff - funky wah tremolo
        AlienWaterKiss,           // Alien Water Kiss - pitch-shifted ambient
        Sisters,                  // Sisters - harmonized lead
        LoveSecrets,              // Love Secrets - shredding with tight delay

        NumPresets
    };

    /**
     * All parameters - musically meaningful controls for 12 DSP modules + global
     */
    struct Parameters {
        // NoiseGate
        bool noiseGateEnabled = false;
        float noiseGateThreshold = -40.0f;   // -80 to 0 dB
        float noiseGateRelease = 100.0f;     // 5-2000 ms

        // Compressor
        bool compressorEnabled = false;
        float compressorThreshold = -20.0f;  // -60 to 0 dB
        float compressorRatio = 4.0f;        // 1-20
        float compressorAttack = 10.0f;      // 0.01-300 ms
        float compressorRelease = 100.0f;    // 10-3000 ms
        bool compressorGlassy = false;

        // Wah
        bool wahEnabled = false;
        int wahMode = 0;                     // 0=manual, 1=auto, 2=env
        float wahPosition = 0.5f;            // 0-1
        float wahQ = 5.0f;                   // 1-15

        // Phaser
        bool phaserEnabled = false;
        float phaserRate = 0.5f;             // 0.05-10 Hz
        float phaserDepth = 0.5f;            // 0-1
        int phaserStages = 4;                // 2-16
        float phaserFeedback = 0.3f;         // -0.95 to 0.95

        // Chorus
        bool chorusEnabled = false;
        float chorusRate = 0.8f;             // 0.1-5 Hz
        float chorusDepth = 0.5f;            // 0-1
        int chorusVoices = 3;                // 1-6
        float chorusMix = 0.5f;              // 0-1

        // PitchShifter
        bool pitchShifterEnabled = false;
        float pitchShifterSemitones = 0.0f;  // -36 to 36
        float pitchShifterMix = 0.5f;        // 0-1

        // Harmonizer
        bool harmonizerEnabled = false;
        float harmonizerVoice1 = 4.0f;       // -12 to 12 semitones
        float harmonizerVoice2 = 7.0f;       // -12 to 12 semitones
        float harmonizerDetune = 5.0f;       // 0-25 cents
        float harmonizerMix = 0.5f;          // 0-1

        // Delay
        bool delayEnabled = false;
        float delayTimeL = 375.0f;           // 1-8000 ms
        float delayTimeR = 500.0f;           // 1-8000 ms
        float delayFeedback = 0.35f;         // 0-0.95
        float delayMix = 0.4f;               // 0-1
        bool delayFreeze = false;
        float delayPitchShiftL = 0.0f;       // -12 to 12 semitones
        float delayPitchShiftR = 0.0f;       // -12 to 12 semitones

        // Reverb
        bool reverbEnabled = false;
        int reverbType = 0;                  // 0-4 (room, hall, plate, cathedral, infinite)
        float reverbDecay = 2.5f;            // 0.1-30 s
        float reverbShimmerAmount = 0.0f;    // 0-1
        float reverbShimmerInterval = 12.0f; // -24 to 24 semitones
        float reverbMix = 0.3f;              // 0-1
        bool reverbFreeze = false;

        // EQ
        bool eqEnabled = false;
        float eqLowGain = 0.0f;             // -12 to 12 dB
        float eqMidGain = 0.0f;             // -12 to 12 dB
        float eqHighGain = 0.0f;            // -12 to 12 dB
        float eqTilt = 0.0f;                // -1 to 1

        // Exciter
        bool exciterEnabled = false;
        float exciterWarmth = 0.0f;          // 0-1
        float exciterPresence = 0.0f;        // 0-1
        float exciterAir = 0.0f;             // 0-1

        // Tremolo
        bool tremoloEnabled = false;
        float tremoloRate = 5.0f;            // 0.5-20 Hz
        float tremoloDepth = 0.5f;           // 0-1
        int tremoloWaveform = 0;             // 0-5 (sin, tri, sqr, saw, s&h, trapz)

        // Global
        float globalMix = 1.0f;             // 0-1
        float outputLevel = 0.0f;           // -24 to 12 dB

        // State
        Preset preset = Preset::Manual;
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
        float gateGain = 1.0f;
        float compressorGainReduction = 0.0f;
        float reverbLevelL = -100.0f;
        float reverbLevelR = -100.0f;
        float delayLevelL = -100.0f;
        float delayLevelR = -100.0f;
        float phaserLfoPhase = 0.0f;
        float tremoloLfoPhase = 0.0f;
        float wahPosition = 0.5f;
    };

    /**
     * Preset information for UI display
     */
    struct PresetInfo {
        const char* name;
        const char* track;
        const char* description;
    };

    PassionFXProcessor();
    ~PassionFXProcessor() = default;

    // Prevent copying
    PassionFXProcessor(const PassionFXProcessor&) = delete;
    PassionFXProcessor& operator=(const PassionFXProcessor&) = delete;

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
    // NoiseGate Parameter Control (RT-safe)
    // ========================================

    void setNoiseGateEnabled(bool enabled);
    void setNoiseGateThreshold(float dB);
    void setNoiseGateRelease(float ms);

    bool getNoiseGateEnabled() const { return noiseGateEnabled_.load(); }
    float getNoiseGateThreshold() const { return noiseGateThreshold_.load(); }
    float getNoiseGateRelease() const { return noiseGateRelease_.load(); }

    // ========================================
    // Compressor Parameter Control (RT-safe)
    // ========================================

    void setCompressorEnabled(bool enabled);
    void setCompressorThreshold(float dB);
    void setCompressorRatio(float ratio);
    void setCompressorAttack(float ms);
    void setCompressorRelease(float ms);
    void setCompressorGlassy(bool glassy);

    bool getCompressorEnabled() const { return compressorEnabled_.load(); }
    float getCompressorThreshold() const { return compressorThreshold_.load(); }
    float getCompressorRatio() const { return compressorRatio_.load(); }
    float getCompressorAttack() const { return compressorAttack_.load(); }
    float getCompressorRelease() const { return compressorRelease_.load(); }
    bool getCompressorGlassy() const { return compressorGlassy_.load(); }

    // ========================================
    // Wah Parameter Control (RT-safe)
    // ========================================

    void setWahEnabled(bool enabled);
    void setWahMode(int mode);
    void setWahPosition(float position);
    void setWahQ(float q);

    bool getWahEnabled() const { return wahEnabled_.load(); }
    int getWahMode() const { return wahMode_.load(); }
    float getWahPosition() const { return wahPosition_.load(); }
    float getWahQ() const { return wahQ_.load(); }

    // ========================================
    // Phaser Parameter Control (RT-safe)
    // ========================================

    void setPhaserEnabled(bool enabled);
    void setPhaserRate(float hz);
    void setPhaserDepth(float depth);
    void setPhaserStages(int stages);
    void setPhaserFeedback(float feedback);

    bool getPhaserEnabled() const { return phaserEnabled_.load(); }
    float getPhaserRate() const { return phaserRate_.load(); }
    float getPhaserDepth() const { return phaserDepth_.load(); }
    int getPhaserStages() const { return phaserStages_.load(); }
    float getPhaserFeedback() const { return phaserFeedback_.load(); }

    // ========================================
    // Chorus Parameter Control (RT-safe)
    // ========================================

    void setChorusEnabled(bool enabled);
    void setChorusRate(float hz);
    void setChorusDepth(float depth);
    void setChorusVoices(int voices);
    void setChorusMix(float mix);

    bool getChorusEnabled() const { return chorusEnabled_.load(); }
    float getChorusRate() const { return chorusRate_.load(); }
    float getChorusDepth() const { return chorusDepth_.load(); }
    int getChorusVoices() const { return chorusVoices_.load(); }
    float getChorusMix() const { return chorusMix_.load(); }

    // ========================================
    // PitchShifter Parameter Control (RT-safe)
    // ========================================

    void setPitchShifterEnabled(bool enabled);
    void setPitchShifterSemitones(float semitones);
    void setPitchShifterMix(float mix);

    bool getPitchShifterEnabled() const { return pitchShifterEnabled_.load(); }
    float getPitchShifterSemitones() const { return pitchShifterSemitones_.load(); }
    float getPitchShifterMix() const { return pitchShifterMix_.load(); }

    // ========================================
    // Harmonizer Parameter Control (RT-safe)
    // ========================================

    void setHarmonizerEnabled(bool enabled);
    void setHarmonizerVoice1(float semitones);
    void setHarmonizerVoice2(float semitones);
    void setHarmonizerDetune(float cents);
    void setHarmonizerMix(float mix);

    bool getHarmonizerEnabled() const { return harmonizerEnabled_.load(); }
    float getHarmonizerVoice1() const { return harmonizerVoice1_.load(); }
    float getHarmonizerVoice2() const { return harmonizerVoice2_.load(); }
    float getHarmonizerDetune() const { return harmonizerDetune_.load(); }
    float getHarmonizerMix() const { return harmonizerMix_.load(); }

    // ========================================
    // Delay Parameter Control (RT-safe)
    // ========================================

    void setDelayEnabled(bool enabled);
    void setDelayTimeL(float ms);
    void setDelayTimeR(float ms);
    void setDelayFeedback(float feedback);
    void setDelayMix(float mix);
    void setDelayFreeze(bool freeze);
    void setDelayPitchShiftL(float semitones);
    void setDelayPitchShiftR(float semitones);

    bool getDelayEnabled() const { return delayEnabled_.load(); }
    float getDelayTimeL() const { return delayTimeL_.load(); }
    float getDelayTimeR() const { return delayTimeR_.load(); }
    float getDelayFeedback() const { return delayFeedback_.load(); }
    float getDelayMix() const { return delayMix_.load(); }
    bool getDelayFreeze() const { return delayFreeze_.load(); }
    float getDelayPitchShiftL() const { return delayPitchShiftL_.load(); }
    float getDelayPitchShiftR() const { return delayPitchShiftR_.load(); }

    // ========================================
    // Reverb Parameter Control (RT-safe)
    // ========================================

    void setReverbEnabled(bool enabled);
    void setReverbType(int type);
    void setReverbDecay(float seconds);
    void setReverbShimmerAmount(float amount);
    void setReverbShimmerInterval(float semitones);
    void setReverbMix(float mix);
    void setReverbFreeze(bool freeze);

    bool getReverbEnabled() const { return reverbEnabled_.load(); }
    int getReverbType() const { return reverbType_.load(); }
    float getReverbDecay() const { return reverbDecay_.load(); }
    float getReverbShimmerAmount() const { return reverbShimmerAmount_.load(); }
    float getReverbShimmerInterval() const { return reverbShimmerInterval_.load(); }
    float getReverbMix() const { return reverbMix_.load(); }
    bool getReverbFreeze() const { return reverbFreeze_.load(); }

    // ========================================
    // EQ Parameter Control (RT-safe)
    // ========================================

    void setEqEnabled(bool enabled);
    void setEqLowGain(float dB);
    void setEqMidGain(float dB);
    void setEqHighGain(float dB);
    void setEqTilt(float tilt);

    bool getEqEnabled() const { return eqEnabled_.load(); }
    float getEqLowGain() const { return eqLowGain_.load(); }
    float getEqMidGain() const { return eqMidGain_.load(); }
    float getEqHighGain() const { return eqHighGain_.load(); }
    float getEqTilt() const { return eqTilt_.load(); }

    // ========================================
    // Exciter Parameter Control (RT-safe)
    // ========================================

    void setExciterEnabled(bool enabled);
    void setExciterWarmth(float warmth);
    void setExciterPresence(float presence);
    void setExciterAir(float air);

    bool getExciterEnabled() const { return exciterEnabled_.load(); }
    float getExciterWarmth() const { return exciterWarmth_.load(); }
    float getExciterPresence() const { return exciterPresence_.load(); }
    float getExciterAir() const { return exciterAir_.load(); }

    // ========================================
    // Tremolo Parameter Control (RT-safe)
    // ========================================

    void setTremoloEnabled(bool enabled);
    void setTremoloRate(float hz);
    void setTremoloDepth(float depth);
    void setTremoloWaveform(int waveform);

    bool getTremoloEnabled() const { return tremoloEnabled_.load(); }
    float getTremoloRate() const { return tremoloRate_.load(); }
    float getTremoloDepth() const { return tremoloDepth_.load(); }
    int getTremoloWaveform() const { return tremoloWaveform_.load(); }

    // ========================================
    // Global Parameter Control (RT-safe)
    // ========================================

    void setGlobalMix(float mix);
    void setOutputLevel(float dB);

    float getGlobalMix() const { return globalMix_.load(); }
    float getOutputLevel() const { return outputLevel_.load(); }

    // ========================================
    // State Control
    // ========================================

    void setPreset(Preset preset);
    void setBypass(bool bypass);

    Preset getPreset() const { return preset_.load(); }
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
    void resetPeaks();

private:
    // ========================================
    // Allpass filter for phaser and reverb diffusion
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
    // NoiseGate internal state
    // ========================================
    float gateEnvelopeL_ = 0.0f;
    float gateEnvelopeR_ = 0.0f;
    float gateGain_ = 1.0f;

    // ========================================
    // Compressor internal state
    // ========================================
    float compEnvelopeL_ = 0.0f;
    float compEnvelopeR_ = 0.0f;
    float compGainReduction_ = 0.0f;

    // ========================================
    // Wah internal state (state-variable filter)
    // ========================================
    float wahBandpassL_ = 0.0f;
    float wahLowpassL_ = 0.0f;
    float wahBandpassR_ = 0.0f;
    float wahLowpassR_ = 0.0f;
    float wahEnvelope_ = 0.0f;
    double wahAutoLfoPhase_ = 0.0;

    // ========================================
    // Phaser internal state (allpass chain with LFO)
    // ========================================
    struct PhaserStage {
        float stateL = 0.0f;
        float stateR = 0.0f;
    };
    std::array<PhaserStage, NUM_PHASER_STAGES_MAX> phaserStageState_;
    double phaserLfoPhase_ = 0.0;
    float phaserFeedbackSampleL_ = 0.0f;
    float phaserFeedbackSampleR_ = 0.0f;

    // ========================================
    // Chorus internal state (multi-voice modulated delay)
    // ========================================
    struct ChorusVoice {
        std::vector<float> bufferL;
        std::vector<float> bufferR;
        int writePos = 0;
        double lfoPhase = 0.0;
    };
    std::array<ChorusVoice, MAX_CHORUS_VOICES> chorusVoiceState_;

    // ========================================
    // PitchShifter internal state (2-grain overlap-add)
    // ========================================
    struct PitchGrain {
        float readPos = 0.0f;
        int sampleCount = 0;
        bool active = false;
    };
    std::vector<float> pitchBufferL_;
    std::vector<float> pitchBufferR_;
    int pitchWritePos_ = 0;
    std::array<PitchGrain, NUM_PITCH_GRAINS> pitchGrainsL_;
    std::array<PitchGrain, NUM_PITCH_GRAINS> pitchGrainsR_;

    // ========================================
    // Harmonizer internal state (stereo detune / pitch shift for 2 voices)
    // ========================================
    std::vector<float> harmBufferL_;
    std::vector<float> harmBufferR_;
    int harmWritePos_ = 0;
    struct HarmGrain {
        float readPos = 0.0f;
        int sampleCount = 0;
    };
    std::array<HarmGrain, NUM_PITCH_GRAINS> harmGrainsV1L_;
    std::array<HarmGrain, NUM_PITCH_GRAINS> harmGrainsV1R_;
    std::array<HarmGrain, NUM_PITCH_GRAINS> harmGrainsV2L_;
    std::array<HarmGrain, NUM_PITCH_GRAINS> harmGrainsV2R_;

    // ========================================
    // Delay internal state (stereo delay with feedback)
    // ========================================
    std::vector<float> delayBufferL_;
    std::vector<float> delayBufferR_;
    int delayWritePos_ = 0;

    // Delay pitch-shift grains (for pitch-shifted feedback)
    std::vector<float> delayPitchBufL_;
    std::vector<float> delayPitchBufR_;
    int delayPitchWritePos_ = 0;
    std::array<PitchGrain, NUM_PITCH_GRAINS> delayPitchGrainsL_;
    std::array<PitchGrain, NUM_PITCH_GRAINS> delayPitchGrainsR_;

    // ========================================
    // Reverb internal state (FDN)
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
    std::array<AllPassFilter, 4> reverbDiffusersL_;
    std::array<AllPassFilter, 4> reverbDiffusersR_;

    // Shimmer grains for reverb shimmer
    std::vector<float> shimmerBufferL_;
    std::vector<float> shimmerBufferR_;
    int shimmerWritePos_ = 0;
    std::array<PitchGrain, NUM_PITCH_GRAINS> shimmerGrainsL_;
    std::array<PitchGrain, NUM_PITCH_GRAINS> shimmerGrainsR_;
    float shimmerFeedbackL_ = 0.0f;
    float shimmerFeedbackR_ = 0.0f;

    // ========================================
    // EQ internal state (3-band IIR)
    // ========================================
    juce::dsp::IIR::Filter<float> eqLowL_, eqLowR_;
    juce::dsp::IIR::Filter<float> eqMidL_, eqMidR_;
    juce::dsp::IIR::Filter<float> eqHighL_, eqHighR_;

    // ========================================
    // Exciter internal state (filtered saturation)
    // ========================================
    juce::dsp::IIR::Filter<float> exciterLowL_, exciterLowR_;
    juce::dsp::IIR::Filter<float> exciterMidL_, exciterMidR_;
    juce::dsp::IIR::Filter<float> exciterHighL_, exciterHighR_;

    // ========================================
    // Tremolo internal state (amplitude modulation)
    // ========================================
    double tremoloLfoPhase_ = 0.0;
    float tremoloSHValue_ = 0.0f;   // sample & hold value
    float tremoloSHCounter_ = 0.0f; // counter for S&H rate

    // ========================================
    // Smoothed Values
    // ========================================
    juce::SmoothedValue<float> smoothedGlobalMix_;
    juce::SmoothedValue<float> smoothedOutputLevel_;
    juce::SmoothedValue<float> smoothedDelayTimeL_;
    juce::SmoothedValue<float> smoothedDelayTimeR_;

    // ========================================
    // Atomic Parameters - NoiseGate
    // ========================================
    std::atomic<bool> noiseGateEnabled_{false};
    std::atomic<float> noiseGateThreshold_{-40.0f};
    std::atomic<float> noiseGateRelease_{100.0f};

    // ========================================
    // Atomic Parameters - Compressor
    // ========================================
    std::atomic<bool> compressorEnabled_{false};
    std::atomic<float> compressorThreshold_{-20.0f};
    std::atomic<float> compressorRatio_{4.0f};
    std::atomic<float> compressorAttack_{10.0f};
    std::atomic<float> compressorRelease_{100.0f};
    std::atomic<bool> compressorGlassy_{false};

    // ========================================
    // Atomic Parameters - Wah
    // ========================================
    std::atomic<bool> wahEnabled_{false};
    std::atomic<int> wahMode_{0};
    std::atomic<float> wahPosition_{0.5f};
    std::atomic<float> wahQ_{5.0f};

    // ========================================
    // Atomic Parameters - Phaser
    // ========================================
    std::atomic<bool> phaserEnabled_{false};
    std::atomic<float> phaserRate_{0.5f};
    std::atomic<float> phaserDepth_{0.5f};
    std::atomic<int> phaserStages_{4};
    std::atomic<float> phaserFeedback_{0.3f};

    // ========================================
    // Atomic Parameters - Chorus
    // ========================================
    std::atomic<bool> chorusEnabled_{false};
    std::atomic<float> chorusRate_{0.8f};
    std::atomic<float> chorusDepth_{0.5f};
    std::atomic<int> chorusVoices_{3};
    std::atomic<float> chorusMix_{0.5f};

    // ========================================
    // Atomic Parameters - PitchShifter
    // ========================================
    std::atomic<bool> pitchShifterEnabled_{false};
    std::atomic<float> pitchShifterSemitones_{0.0f};
    std::atomic<float> pitchShifterMix_{0.5f};

    // ========================================
    // Atomic Parameters - Harmonizer
    // ========================================
    std::atomic<bool> harmonizerEnabled_{false};
    std::atomic<float> harmonizerVoice1_{4.0f};
    std::atomic<float> harmonizerVoice2_{7.0f};
    std::atomic<float> harmonizerDetune_{5.0f};
    std::atomic<float> harmonizerMix_{0.5f};

    // ========================================
    // Atomic Parameters - Delay
    // ========================================
    std::atomic<bool> delayEnabled_{false};
    std::atomic<float> delayTimeL_{375.0f};
    std::atomic<float> delayTimeR_{500.0f};
    std::atomic<float> delayFeedback_{0.35f};
    std::atomic<float> delayMix_{0.4f};
    std::atomic<bool> delayFreeze_{false};
    std::atomic<float> delayPitchShiftL_{0.0f};
    std::atomic<float> delayPitchShiftR_{0.0f};

    // ========================================
    // Atomic Parameters - Reverb
    // ========================================
    std::atomic<bool> reverbEnabled_{false};
    std::atomic<int> reverbType_{0};
    std::atomic<float> reverbDecay_{2.5f};
    std::atomic<float> reverbShimmerAmount_{0.0f};
    std::atomic<float> reverbShimmerInterval_{12.0f};
    std::atomic<float> reverbMix_{0.3f};
    std::atomic<bool> reverbFreeze_{false};

    // ========================================
    // Atomic Parameters - EQ
    // ========================================
    std::atomic<bool> eqEnabled_{false};
    std::atomic<float> eqLowGain_{0.0f};
    std::atomic<float> eqMidGain_{0.0f};
    std::atomic<float> eqHighGain_{0.0f};
    std::atomic<float> eqTilt_{0.0f};

    // ========================================
    // Atomic Parameters - Exciter
    // ========================================
    std::atomic<bool> exciterEnabled_{false};
    std::atomic<float> exciterWarmth_{0.0f};
    std::atomic<float> exciterPresence_{0.0f};
    std::atomic<float> exciterAir_{0.0f};

    // ========================================
    // Atomic Parameters - Tremolo
    // ========================================
    std::atomic<bool> tremoloEnabled_{false};
    std::atomic<float> tremoloRate_{5.0f};
    std::atomic<float> tremoloDepth_{0.5f};
    std::atomic<int> tremoloWaveform_{0};

    // ========================================
    // Atomic Parameters - Global
    // ========================================
    std::atomic<float> globalMix_{1.0f};
    std::atomic<float> outputLevel_{0.0f};

    // ========================================
    // Atomic Parameters - State
    // ========================================
    std::atomic<Preset> preset_{Preset::Manual};
    std::atomic<bool> bypass_{false};

    // ========================================
    // Metering Atomics
    // ========================================
    std::atomic<float> meterInputL_{-100.0f};
    std::atomic<float> meterInputR_{-100.0f};
    std::atomic<float> meterOutputL_{-100.0f};
    std::atomic<float> meterOutputR_{-100.0f};
    std::atomic<float> meterGateGain_{1.0f};
    std::atomic<float> meterCompGR_{0.0f};
    std::atomic<float> meterReverbL_{-100.0f};
    std::atomic<float> meterReverbR_{-100.0f};
    std::atomic<float> meterDelayL_{-100.0f};
    std::atomic<float> meterDelayR_{-100.0f};
    std::atomic<float> meterPhaserPhase_{0.0f};
    std::atomic<float> meterTremoloPhase_{0.0f};
    std::atomic<float> meterWahPos_{0.5f};

    // ========================================
    // Processing State
    // ========================================
    double sampleRate_ = 48000.0;
    int blockSize_ = 256;
    int numChannels_ = 2;
    bool prepared_ = false;
    std::atomic<bool> eqNeedsUpdate_{true};
    std::atomic<bool> exciterNeedsUpdate_{true};

    // ========================================
    // Prime delay times for FDN reverb (in samples at 48kHz)
    // ========================================
    static constexpr std::array<int, NUM_REVERB_TAPS> REVERB_DELAYS = {
        1433, 1619, 1823, 2017, 2221, 2417, 2621, 2837
    };

    // ========================================
    // Per-module Processing Methods
    // ========================================
    void processNoiseGate(float& sampleL, float& sampleR);
    void processCompressor(float& sampleL, float& sampleR);
    void processWah(float& sampleL, float& sampleR);
    void processPhaser(float& sampleL, float& sampleR);
    void processChorus(float& sampleL, float& sampleR);
    void processPitchShifter(float& sampleL, float& sampleR);
    void processHarmonizer(float& sampleL, float& sampleR);
    void processDelay(float& sampleL, float& sampleR);
    void processReverb(float& sampleL, float& sampleR);
    void processEQ(float& sampleL, float& sampleR);
    void processExciter(float& sampleL, float& sampleR);
    void processTremolo(float& sampleL, float& sampleR);

    void updateEQ();
    void updateExciterFilters();
    void applyPreset(Preset preset);

    // ========================================
    // Utility Methods
    // ========================================
    float readDelayLine(const std::vector<float>& buffer, int writePos, float delaySamples) const;
    float hannWindow(float phase) const;
    float semitonesToRatio(float semitones) const;
    float generateLfoSample(double phase, int waveform) const;

    static float linearToDb(float linear);
    static float dbToLinear(float db);
    static float calculatePeakLevel(const float* data, int numSamples);
};

} // namespace map2
