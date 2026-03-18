#pragma once

/**
 * SynthForge - Basic subtractive synth voice (Phase 2)
 * Single oscillator, ADSR envelope, and per-voice low-pass filter.
 */

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>

#include <atomic>

namespace map2::synthforge {

struct SynthVoiceParameters {
    std::atomic<float> oscLevel{0.75f};      // 0..1
    std::atomic<int> waveform{0};            // 0=sine,1=saw,2=square,3=triangle
    std::atomic<float> cutoffHz{12000.0f};   // 20..20000
    std::atomic<float> resonance{0.15f};     // ~0.1..1.2
    std::atomic<float> attackMs{10.0f};      // ms
    std::atomic<float> decayMs{120.0f};      // ms
    std::atomic<float> sustain{0.8f};        // 0..1
    std::atomic<float> releaseMs{250.0f};    // ms
    std::atomic<float> coarseSemitones{0.0f};
    std::atomic<float> masterTransposeSemitones{0.0f};
    std::atomic<float> pitchBendSemitones{0.0f};
    std::atomic<float> pitchBendRangeSemitones{2.0f};
};

class SynthSound : public juce::SynthesiserSound {
public:
    bool appliesToNote(int) override { return true; }
    bool appliesToChannel(int) override { return true; }
};

class SynthVoice : public juce::SynthesiserVoice {
public:
    explicit SynthVoice(SynthVoiceParameters& parameters);

    bool canPlaySound(juce::SynthesiserSound* sound) override;
    void startNote(int midiNoteNumber, float velocity, juce::SynthesiserSound*, int currentPitchWheelPosition) override;
    void stopNote(float velocity, bool allowTailOff) override;
    void pitchWheelMoved(int value) override;
    void controllerMoved(int, int) override {}
    void renderNextBlock(juce::AudioBuffer<float>& outputBuffer, int startSample, int numSamples) override;

    void setCurrentSampleRate(double sampleRate);

private:
    static float renderWave(int waveform, float phase);
    void updateFrequency();
    void updateEnvelope();
    void updateFilter();

    SynthVoiceParameters& parameters_;

    double sampleRate_ = 48000.0;
    int currentNote_ = 60;
    float phase_ = 0.0f;          // 0..1
    float phaseIncrement_ = 0.0f; // cycles/sample
    float noteVelocity_ = 0.0f;

    juce::ADSR adsr_;
    juce::ADSR::Parameters adsrParams_;
    juce::dsp::StateVariableTPTFilter<float> filterL_;
    juce::dsp::StateVariableTPTFilter<float> filterR_;
};

}  // namespace map2::synthforge
