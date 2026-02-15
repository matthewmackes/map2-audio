#pragma once

/**
 * MAP2 Audio Engine - Multi-Effect Processor
 * Top 10 Algorithms emulation with professional-grade DSP
 *
 * This processor implements iconic multi-effect algorithms:
 * 1. MicroPitch - Detuned copies with continuous modulation
 * 2. UltraShift - High-quality pitch shifter with formant correction
 * 3. SmartShift - Intelligent pitch shifting with pitch detection
 * 4. Transpose - Clean octave/interval shifting
 * 5. PitchFactor - Multi-voice pitch shifting harmony
 * 6. ReverseDelays - Time-reversed delay with pitch shifts
 * 7. ShimmerVerbs - Reverb with high-pitched pitch-shifted reflections
 * 8. MotionReverbs - Reverb with modulated reflections
 * 9. Granular - Granular synthesis with lookahead buffering
 * 10. Crystallize - Granular + reverb fusion effect
 * 
 * Research-backed implementations using:
 * - STFT (Short-Time Fourier Transform) for phase-coherent shifting
 * - Phase vocoder techniques for time-independent pitch shifts
 * - Granular synthesis with Hann windowing and overlap-add
 * - Multi-tap feedback delays with modulation
 * - High-order convolution for shimmer reverbs
 */

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>
#include <array>
#include <memory>
#include <cmath>
#include <complex>
#include <deque>
#include <atomic>

namespace map2 {

// ============================================================================
// Algorithm Selection & State
// ============================================================================

enum class H9Algorithm : int {
    MicroPitch = 0,    // Detuned copies
    UltraShift = 1,    // High-quality pitch shift with formant
    SmartShift = 2,    // Pitch detection + shifting
    Transpose = 3,     // Clean octave shifts
    PitchFactor = 4,   // Multi-voice harmonizer
    ReverseDelays = 5, // Time-reversed delays
    ShimmerVerbs = 6,  // Reverb + pitch-shifted reflections
    MotionReverbs = 7, // Reverb with modulated reflections
    Granular = 8,      // Granular synthesis
    Crystallize = 9    // Granular + reverb fusion
};

// ============================================================================
// Core DSP Components - STFT Phase Vocoder
// ============================================================================

/**
 * Phase Vocoder for time-independent pitch shifting
 * Uses Short-Time Fourier Transform (STFT) for high-quality shifting
 * Preserves formants while changing pitch
 */
class PhaseVocoder {
public:
    PhaseVocoder(int fftSize = 2048);
    ~PhaseVocoder() = default;

    void prepare(double sampleRate, int maxBlockSize);
    void reset();
    
    // Process audio: returns output samples (variable length based on pitch ratio)
    void process(const float* inputBuffer, float* outputBuffer, 
                 int numSamples, float pitchRatio);
    
    int getLatencySamples() const { return fftSize_ / 2; }
    
private:
    int fftSize_;
    int hopSize_;
    std::unique_ptr<juce::dsp::FFT> fft_;
    
    std::vector<float> windowedInput_;
    std::vector<float> fftBuffer_;
    std::vector<std::complex<float>> spectrum_;
    std::vector<float> previousPhase_;
    std::vector<float> outputBuffer_;
    
    double sampleRate_ = 44100.0;
    float lastPitchRatio_ = 1.0f;
    int writePos_ = 0;
    
    void applyWindow(std::vector<float>& buffer);
    void updatePhases(float pitchRatio);
};

// ============================================================================
// Granular Synthesis Engine
// ============================================================================

/**
 * High-quality granular synthesis with pitch shifting
 * Used by Granular and Crystallize algorithms
 */
class GranularEngine {
public:
    static constexpr int MAX_GRAINS = 32;
    static constexpr int GRAIN_BUFFER_SIZE = 131072; // 3 seconds @ 44.1kHz
    
    GranularEngine();
    ~GranularEngine() = default;
    
    void prepare(double sampleRate, int maxBlockSize);
    void reset();
    
    void process(juce::AudioBuffer<float>& buffer);
    
    // Parameters
    void setGrainSize(float sizeMs) { grainSizeMs_ = juce::jlimit(10.f, 500.f, sizeMs); }
    void setGrainDensity(float density) { grainDensity_ = juce::jlimit(0.1f, 10.f, density); }
    void setPitchShift(float semitones) { pitchShift_ = juce::jlimit(-24.f, 24.f, semitones); }
    void setScatter(float scatter) { scatter_ = juce::jlimit(0.f, 1.f, scatter); }
    void setFeedback(float fb) { feedback_ = juce::jlimit(0.f, 0.95f, fb); }
    
private:
    struct Grain {
        int startPos = 0;
        int readPos = 0;
        float pitch = 1.0f;
        float amp = 0.0f;
        int lengthSamples = 0;
        bool active = false;
    };
    
    std::array<Grain, MAX_GRAINS> grains_;
    std::vector<float> recordBuffer_;
    int recordPos_ = 0;
    double sampleRate_ = 44100.0;
    int maxBlockSize_ = 512;
    
    float grainSizeMs_ = 80.0f;
    float grainDensity_ = 4.0f;
    float pitchShift_ = 0.0f;
    float scatter_ = 0.3f;
    float feedback_ = 0.5f;
    
    juce::Random random_;
    
    void generateGrain(int index);
    float getWindowValue(float phase);
};

// ============================================================================
// Algorithm-Specific Processors
// ============================================================================

/**
 * MicroPitch - Detuned copies with smooth LFO modulation
 * Creates thickened sound with natural chorus effect
 */
class MicroPitchAlgorithm {
public:
    void prepare(double sampleRate, int maxBlockSize);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);
    
    void setDetune(float cents) { detune_ = juce::jlimit(-50.f, 50.f, cents); }
    void setMix(float mix) { mix_ = juce::jlimit(0.f, 1.f, mix); }
    void setModRate(float hz) { modRate_ = juce::jlimit(0.1f, 10.f, hz); }
    void setModDepth(float cents) { modDepth_ = juce::jlimit(0.f, 20.f, cents); }
    
private:
    std::unique_ptr<PhaseVocoder> vocoder1_, vocoder2_;
    juce::dsp::Oscillator<float> lfo1_{[](float x) { return std::sin(x); }};
    juce::dsp::Oscillator<float> lfo2_{[](float x) { return std::sin(x + 1.5f); }};
    
    double sampleRate_ = 44100.0;
    float detune_ = 5.0f;
    float mix_ = 0.5f;
    float modRate_ = 2.0f;
    float modDepth_ = 3.0f;
};

/**
 * UltraShift - High-quality pitch shifter with formant preservation
 * STFT-based shifter that maintains vocal/instrument characteristics
 */
class UltraShiftAlgorithm {
public:
    void prepare(double sampleRate, int maxBlockSize);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);
    
    void setPitchShift(float semitones) { pitchShift_ = juce::jlimit(-24.f, 24.f, semitones); }
    void setFormantCorrection(float factor) { formantFactor_ = juce::jlimit(0.5f, 2.0f, factor); }
    void setMix(float mix) { mix_ = juce::jlimit(0.f, 1.f, mix); }
    void setQuality(int quality) { quality_ = juce::jlimit(1, 3, quality); }
    
private:
    std::unique_ptr<PhaseVocoder> vocoder_;
    double sampleRate_ = 44100.0;
    float pitchShift_ = 0.0f;
    float formantFactor_ = 1.0f;
    float mix_ = 1.0f;
    int quality_ = 2; // 1=fast, 2=balanced, 3=high-quality
    
    std::vector<float> workBuffer_;
};

/**
 * SmartShift - Intelligent pitch detection + shifting
 * Analyzes incoming signal and applies natural pitch shifting
 */
class SmartShiftAlgorithm {
public:
    void prepare(double sampleRate, int maxBlockSize);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);
    
    void setTargetNote(int midiNote) { targetMidiNote_ = juce::jlimit(0, 127, midiNote); }
    void setShiftAmount(float semitones) { shiftAmount_ = juce::jlimit(-24.f, 24.f, semitones); }
    void setMix(float mix) { mix_ = juce::jlimit(0.f, 1.f, mix); }
    
private:
    std::unique_ptr<PhaseVocoder> vocoder_;
    double sampleRate_ = 44100.0;
    int targetMidiNote_ = 69; // A4
    float shiftAmount_ = 0.0f;
    float mix_ = 1.0f;
    
    // Pitch detection via autocorrelation
    float detectPitch(const juce::AudioBuffer<float>& buffer);
};

/**
 * Transpose - Clean octave/interval shifts
 * Simplified, highly optimized pitch shifter
 */
class TransposeAlgorithm {
public:
    void prepare(double sampleRate, int maxBlockSize);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);
    
    void setTranspose(float semitones) { transpose_ = juce::jlimit(-24.f, 24.f, semitones); }
    void setMix(float mix) { mix_ = juce::jlimit(0.f, 1.f, mix); }
    
private:
    std::unique_ptr<PhaseVocoder> vocoder_;
    double sampleRate_ = 44100.0;
    float transpose_ = 0.0f;
    float mix_ = 1.0f;
};

/**
 * PitchFactor - Multi-voice pitch-shifted harmonizer
 * Up to 4 simultaneous pitch-shifted voices
 */
class PitchFactorAlgorithm {
public:
    void prepare(double sampleRate, int maxBlockSize);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);
    
    void setVoice1(float semitones) { voices_[0] = semitones; }
    void setVoice2(float semitones) { voices_[1] = semitones; }
    void setVoice3(float semitones) { voices_[2] = semitones; }
    void setVoice4(float semitones) { voices_[3] = semitones; }
    void setVoiceMix(float mix) { voiceMix_ = juce::jlimit(0.f, 1.f, mix); }
    
private:
    std::array<std::unique_ptr<PhaseVocoder>, 4> vocoders_;
    std::array<float, 4> voices_ = {0.0f, 7.0f, 12.0f, 0.0f}; // Default: root, 5th, octave
    float voiceMix_ = 0.5f;
    double sampleRate_ = 44100.0;
};

/**
 * ReverseDelays - Time-reversed delay with pitch modulation
 * Creates dramatic reversed effects with pitch shifting
 */
class ReverseDelaysAlgorithm {
public:
    static constexpr int MAX_DELAY_SAMPLES = 192000; // 4.4s @ 44.1kHz
    
    void prepare(double sampleRate, int maxBlockSize);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);
    
    void setDelayTime(float ms) { delayTimeMs_ = juce::jlimit(50.f, 4000.f, ms); }
    void setFeedback(float fb) { feedback_ = juce::jlimit(0.f, 0.95f, fb); }
    void setPitchShift(float semitones) { pitchShift_ = juce::jlimit(-12.f, 12.f, semitones); }
    void setMix(float mix) { mix_ = juce::jlimit(0.f, 1.f, mix); }
    void setTaps(int numTaps) { numTaps_ = juce::jlimit(1, 4, numTaps); }
    
private:
    std::vector<float> delayBuffer_;
    int writePos_ = 0;
    double sampleRate_ = 44100.0;
    
    float delayTimeMs_ = 500.0f;
    float feedback_ = 0.6f;
    float pitchShift_ = 12.0f;
    float mix_ = 0.5f;
    int numTaps_ = 2;
    
    std::unique_ptr<PhaseVocoder> vocoder_;
};

/**
 * ShimmerVerbs - Reverb with high-pitched reflections
 * Classic shimmer effect: reverb + octave-up pitch shift blend
 */
class ShimmerVerbAlgorithm {
public:
    void prepare(double sampleRate, int maxBlockSize);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);
    
    void setRoomSize(float size) { roomSize_ = juce::jlimit(0.5f, 1.0f, size); }
    void setDamping(float damp) { damping_ = juce::jlimit(0.f, 1.0f, damp); }
    void setShimmerPitch(float semitones) { shimmerPitch_ = juce::jlimit(12.f, 24.f, semitones); }
    void setShimmerMix(float mix) { shimmerMix_ = juce::jlimit(0.f, 1.f, mix); }
    void setWetLevel(float wet) { wetLevel_ = juce::jlimit(0.f, 1.f, wet); }
    
private:
    // Classic Freeverb structure
    static constexpr int NUM_COMBS = 8;
    static constexpr int NUM_ALLPASSES = 4;
    std::array<std::vector<float>, NUM_COMBS> combBuffers_;
    std::array<int, NUM_COMBS> combWritePos_{};
    std::array<float, NUM_COMBS> filterStore_{};
    
    std::array<std::vector<float>, NUM_ALLPASSES> allpassBuffers_;
    std::array<int, NUM_ALLPASSES> allpassWritePos_{};
    
    std::unique_ptr<PhaseVocoder> shimmerVocoder_;
    
    double sampleRate_ = 44100.0;
    float roomSize_ = 0.7f;
    float damping_ = 0.5f;
    float shimmerPitch_ = 12.0f;
    float shimmerMix_ = 0.5f;
    float wetLevel_ = 0.5f;
};

/**
 * MotionReverbs - Reverb with modulated reflections
 * Reverb with LFO-modulated delays for movement
 */
class MotionVerbAlgorithm {
public:
    void prepare(double sampleRate, int maxBlockSize);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);
    
    void setRoomSize(float size) { roomSize_ = juce::jlimit(0.5f, 1.0f, size); }
    void setDamping(float damp) { damping_ = juce::jlimit(0.f, 1.0f, damp); }
    void setModRate(float hz) { modRate_ = juce::jlimit(0.1f, 5.f, hz); }
    void setModDepth(float depth) { modDepth_ = juce::jlimit(0.f, 0.5f, depth); }
    void setWetLevel(float wet) { wetLevel_ = juce::jlimit(0.f, 1.f, wet); }
    
private:
    static constexpr int NUM_MODULATED_DELAYS = 8;
    std::array<std::vector<float>, NUM_MODULATED_DELAYS> delayBuffers_;
    std::array<float, NUM_MODULATED_DELAYS> delayReadPos_{};
    
    juce::dsp::Oscillator<float> lfo_{[](float x) { return std::sin(x); }};
    
    double sampleRate_ = 44100.0;
    float roomSize_ = 0.7f;
    float damping_ = 0.5f;
    float modRate_ = 1.0f;
    float modDepth_ = 0.2f;
    float wetLevel_ = 0.5f;
};

/**
 * Granular - Pure granular synthesis
 * Uses the GranularEngine for highly textured effects
 */
class GranularAlgorithm {
public:
    void prepare(double sampleRate, int maxBlockSize);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);
    
    void setGrainSize(float ms) { granular_.setGrainSize(ms); }
    void setGrainDensity(float density) { granular_.setGrainDensity(density); }
    void setPitchShift(float semitones) { granular_.setPitchShift(semitones); }
    void setScatter(float scatter) { granular_.setScatter(scatter); }
    void setMix(float mix) { mix_ = juce::jlimit(0.f, 1.f, mix); }
    
private:
    GranularEngine granular_;
    float mix_ = 0.5f;
};

/**
 * Crystallize - Granular + Reverb fusion
 * Combines granular synthesis with reverb for crystalline textures
 */
class CrystallizeAlgorithm {
public:
    void prepare(double sampleRate, int maxBlockSize);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);
    
    void setGrainSize(float ms) { granular_.setGrainSize(ms); }
    void setGrainDensity(float density) { granular_.setGrainDensity(density); }
    void setPitchShift(float semitones) { granular_.setPitchShift(semitones); }
    void setRoomSize(float size) { roomSize_ = juce::jlimit(0.5f, 1.0f, size); }
    void setDamping(float damp) { damping_ = juce::jlimit(0.f, 1.0f, damp); }
    void setMix(float mix) { mix_ = juce::jlimit(0.f, 1.f, mix); }
    
private:
    GranularEngine granular_;
    
    // Simple reverb structure
    std::vector<float> allpassBuffer1_;
    std::vector<float> allpassBuffer2_;
    int allpassWritePos1_ = 0;
    int allpassWritePos2_ = 0;
    
    double sampleRate_ = 44100.0;
    float roomSize_ = 0.7f;
    float damping_ = 0.5f;
    float mix_ = 0.5f;
};

// ============================================================================
// Main H9 Processor
// ============================================================================

/**
 * EventideH9Processor - Complete multi-effect emulation
 * Seamless algorithm switching with state preservation
 * Real-time control and automation support
 */
class EventideH9Processor {
public:
    EventideH9Processor();
    ~EventideH9Processor() = default;
    
    void prepare(double sampleRate, int maxBlockSize, int numChannels);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);
    
    // Algorithm selection
    void setAlgorithm(H9Algorithm algorithm);
    H9Algorithm getCurrentAlgorithm() const { return currentAlgorithm_; }
    
    // Master controls
    void setBypass(bool bypassed) { bypass_ = bypassed; }
    void setInputGain(float gainDb) { inputGain_ = juce::Decibels::decibelsToGain(gainDb); }
    void setOutputGain(float gainDb) { outputGain_ = juce::Decibels::decibelsToGain(gainDb); }
    void setMix(float dryWet) { mix_ = juce::jlimit(0.f, 1.f, dryWet); }
    
    // Algorithm-specific parameter accessors
    MicroPitchAlgorithm& getMicroPitch() { return microPitch_; }
    UltraShiftAlgorithm& getUltraShift() { return ultraShift_; }
    SmartShiftAlgorithm& getSmartShift() { return smartShift_; }
    TransposeAlgorithm& getTranspose() { return transpose_; }
    PitchFactorAlgorithm& getPitchFactor() { return pitchFactor_; }
    ReverseDelaysAlgorithm& getReverseDelays() { return reverseDelays_; }
    ShimmerVerbAlgorithm& getShimmerVerb() { return shimmerVerb_; }
    MotionVerbAlgorithm& getMotionVerb() { return motionVerb_; }
    GranularAlgorithm& getGranular() { return granular_; }
    CrystallizeAlgorithm& getCrystallize() { return crystallize_; }
    
    // Metering
    float getInputLevel() const { return inputLevel_.load(); }
    float getOutputLevel() const { return outputLevel_.load(); }
    bool isClipping() const { return isClipping_.load(); }
    
private:
    H9Algorithm currentAlgorithm_ = H9Algorithm::MicroPitch;
    
    // Algorithm instances
    MicroPitchAlgorithm microPitch_;
    UltraShiftAlgorithm ultraShift_;
    SmartShiftAlgorithm smartShift_;
    TransposeAlgorithm transpose_;
    PitchFactorAlgorithm pitchFactor_;
    ReverseDelaysAlgorithm reverseDelays_;
    ShimmerVerbAlgorithm shimmerVerb_;
    MotionVerbAlgorithm motionVerb_;
    GranularAlgorithm granular_;
    CrystallizeAlgorithm crystallize_;
    
    // Master controls
    bool bypass_ = false;
    float inputGain_ = 1.0f;
    float outputGain_ = 1.0f;
    float mix_ = 0.5f;
    
    // Buffers for processing
    juce::AudioBuffer<float> dryBuffer_;
    juce::AudioBuffer<float> wetBuffer_;
    
    double sampleRate_ = 44100.0;
    int maxBlockSize_ = 512;
    int numChannels_ = 2;
    
    // Metering
    std::atomic<float> inputLevel_{0.0f};
    std::atomic<float> outputLevel_{0.0f};
    std::atomic<bool> isClipping_{false};
    
    void updateMeters(const juce::AudioBuffer<float>& buffer);
};

} // namespace map2
