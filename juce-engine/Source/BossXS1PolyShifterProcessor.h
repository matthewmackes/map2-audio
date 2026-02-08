#pragma once

/**
 * MAP2 Audio Engine - Boss XS-1 Poly Shifter
 * Professional polyphonic pitch shifter emulating the Boss XS-1 pedal
 *
 * Key Features:
 * - Polyphonic real-time pitch shifting (±7 semitones / ±3 octaves)
 * - Detune mode for rich doubling effects (±20 cents)
 * - Balance control (wet/dry blend)
 * - Selectable pedal switch modes (toggle/momentary)
 * - Expression pedal control for real-time pitch bending
 * - Boss-style presets for various musical styles
 * - Full MIDI CC mapping for all parameters
 * - Low-latency processing (~5ms)
 *
 * Research Sources:
 * - Boss official XS-1 documentation
 * - Professional pitch shifting algorithms
 * - Real-time polyphonic DSP techniques
 */

#include <juce_dsp/juce_dsp.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "Common.h"
#include <atomic>
#include <array>
#include <vector>
#include <cmath>

namespace map2 {

class BossXS1PolyShifterProcessor {
public:
    /**
     * Boss XS-1 Preset Library
     * Carefully tuned presets for different musical applications
     */
    enum class Preset {
        Manual = 0,

        // === Core Use Cases ===
        DropD,                        // Drop tuning: -2 semitones
        DropDSharp,                   // Drop tuning: -2.5 semitones
        HalfStepDown,                 // Universal half-step down: -1 semitone
        Capo2ndFret,                  // Capo simulation: +2 semitones
        Capo3rdFret,                  // Capo simulation: +3 semitones
        Capo5thFret,                  // Capo simulation: +5 semitones
        OctaveUp,                     // +12 semitones (1 octave)
        OctaveDown,                   // -12 semitones
        OctaveUpDown,                 // +12 / -12 stereo

        // === Doubling/Layering (Detune Mode) ===
        MicroPitchWide,               // ±20 cents - thick chorus effect
        MicroPitchNarrow,             // ±8 cents - subtle fattening
        VoiceDoubling,                // ±15 cents - vocal-like layering
        StringDoubling,               // ±12 cents - 12-string guitar simulation
        PianistOctaves,               // +5 cents / -5 cents stereo detune

        // === Extreme Effects ===
        SubBass,                      // -24 semitones (2 octaves down)
        SonicScreamer,                // +24 semitones (2 octaves up)
        UniqueIntervals,              // +5 / +7 semitones (major third/perfect fifth)
        MinorThird,                   // -3 semitones + octave up
        ChordShift,                   // Complex interval combinations

        // === Experimental ===
        DetuneChorus,                 // Slight pitch shift with feedback
        SpaceyVibrato,                // Pitch wobble simulation
        RoboticMod,                   // Extreme pitch movement

        NumPresets
    };

    /**
     * Boss XS-1 Parameters Structure
     * Maps directly to physical pedal controls
     */
    struct Parameters {
        // === Primary Controls ===
        float shiftAmount = 0.0f;          // Semitones (-7 to +7, or ±3 octaves)
        float balance = 0.0f;              // Wet/Dry mix (0 = dry only, 100 = wet only)
        
        // === Mode Controls ===
        int shiftDirection = 0;            // 0 = no direction lock, 1 = up, -1 = down
        bool detuneMode = false;           // False = pitch shift, True = detune ±20c
        bool pedalMomentary = false;       // False = toggle, True = momentary
        
        // === Expression/Pedal Control ===
        float pedalPosition = 0.0f;        // 0-100% pedal travel
        float pedalMin = -7.0f;            // Pedal minimum shift (semitones)
        float pedalMax = 7.0f;             // Pedal maximum shift (semitones)
        bool pedalEnabled = false;         // Enable pedal control
        
        // === Fine-tuning ===
        float detuneAmount = 20.0f;        // Cents (±20 for detune mode)
        float glide = 0.0f;                // Pitch change smoothness (ms, 0-100)
        
        // === Feedback for special effects ===
        float feedback = 0.0f;             // 0 to 0.7 for pitch shift feedback
        
        // === State ===
        Preset preset = Preset::Manual;
        bool bypass = false;
        bool active = true;
    };

    BossXS1PolyShifterProcessor();
    ~BossXS1PolyShifterProcessor() = default;

    /**
     * Prepare the processor for playback
     */
    void prepare(double sampleRate, int samplesPerBlock, int numChannels);

    /**
     * Reset all internal state
     */
    void reset();

    /**
     * Process audio buffer
     */
    void process(juce::AudioBuffer<float>& buffer);

    /**
     * Set parameters
     */
    void setParameters(const Parameters& params);
    Parameters getParameters() const;

    /**
     * Preset management
     */
    void loadPreset(Preset preset);
    void savePreset(Preset preset, const Parameters& params);
    Parameters getPresetParameters(Preset preset) const;
    static const char* getPresetName(Preset preset);

    /**
     * MIDI Control Support
     */
    void setMidiCC(int ccNumber, float value01);  // 0.0-1.0
    void setMidiNote(int noteNumber, int velocity);
    
    // CC mapping (0-127 values)
    static constexpr int MIDI_CC_SHIFT = 20;      // Shift amount
    static constexpr int MIDI_CC_BALANCE = 21;    // Balance control
    static constexpr int MIDI_CC_PEDAL = 22;      // Expression pedal (typically CC7 or CC11)
    static constexpr int MIDI_CC_GLIDE = 23;      // Glide time
    static constexpr int MIDI_CC_FEEDBACK = 24;   // Feedback amount
    static constexpr int MIDI_CC_MODE = 25;       // Mode select (detune/shift)
    
    // Program Change for presets
    void handleProgramChange(int programNumber);

    /**
     * Monitoring
     */
    float getInputLevel() const;
    float getOutputLevel() const;
    bool isActive() const { return parameters_.active && !parameters_.bypass; }

    /**
     * Advanced DSP parameters
     */
    static constexpr float MIN_SHIFT = -7.0f;      // semitones
    static constexpr float MAX_SHIFT = 7.0f;       // semitones
    static constexpr float MIN_BALANCE = 0.0f;     // % (100% dry)
    static constexpr float MAX_BALANCE = 100.0f;   // % (100% wet)
    static constexpr float MIN_DETUNE = -20.0f;    // cents
    static constexpr float MAX_DETUNE = 20.0f;     // cents
    static constexpr float MIN_GLIDE = 0.0f;       // ms
    static constexpr float MAX_GLIDE = 100.0f;     // ms

private:
    /**
     * Internal DSP Components
     */
    struct PitchShifterEngine {
        // Granular pitch shifting buffers
        std::vector<float> inputBuffer;
        std::vector<float> outputBuffer;
        std::vector<float> circularBuffer;
        
        // Grain parameters
        int grainSize = 2048;
        int grainOverlapFactor = 4;  // 4x overlap for smooth output
        int grainCount = 0;
        float readIndex = 0.0f;
        float writeIndex = 0.0f;
        
        // Pitch shifting state
        float currentPitchRatio = 1.0f;
        float targetPitchRatio = 1.0f;
        
        // Gain envelope (Hann window)
        std::vector<float> grainWindow;
        
        // Feedback state
        float feedbackBuffer = 0.0f;
    };

    struct ChannelState {
        PitchShifterEngine shifterL;
        PitchShifterEngine shifterR;
        juce::LinearSmoothedValue<float> smoothedShift;
        juce::LinearSmoothedValue<float> smoothedBalance;
        juce::LinearSmoothedValue<float> smoothedGlide;
    };

    /**
     * DSP Helper Methods
     */
    float semitoneToPitchRatio(float semitones) const;
    float centsToFrequencyRatio(float cents) const;
    void updateGrainWindow();
    void processGranularPitchShift(juce::AudioBuffer<float>& buffer, 
                                  PitchShifterEngine& engine,
                                  float pitchRatio);
    float calculatePeakLevel(const float* data, int numSamples) const;

    /**
     * Internal state
     */
    ChannelState state_;
    Parameters parameters_;
    std::array<Parameters, static_cast<int>(Preset::NumPresets)> presets_;
    
    double sampleRate_ = 48000.0;
    int blockSize_ = 256;
    bool prepared_ = false;
    
    std::atomic<float> inputLevel_{-100.0f};
    std::atomic<float> outputLevel_{-100.0f};

    /**
     * Initialize preset library with Boss-style sounds
     */
    void initializePresets();
    
    /**
     * Bypass state query
     */
    bool isBypassed() const { return parameters_.bypass; }
};

}  // namespace map2
