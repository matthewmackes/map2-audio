/**
 * Circular Delays Processor - Example Usage
 * 
 * This file demonstrates how to use the CircularDelayProcessor
 * in various scenarios and integration patterns.
 */

#pragma once

#include "CircularDelayProcessor.h"
#include "CircularDelayUI.h"
#include <juce_audio_processors/juce_audio_processors.h>

namespace map2::examples {

/**
 * === EXAMPLE 1: Basic Standalone Usage ===
 * 
 * Simplest possible setup - create, prepare, process
 */
class BasicCircularDelayExample {
public:
    void initialize() {
        // Create processor
        processor_ = std::make_unique<CircularDelayProcessor>();
        
        // Prepare with your sample rate and block size
        processor_->prepare(44100.0, 512, 2);
        
        // Set default preset
        CircularDelayProcessor::Parameters params;
        params.delayTime = 500.0f;
        params.numTaps = 8;
        params.feedback = 0.5f;
        params.panRate = 1.0f;
        params.depth = 0.8f;
        params.mix = 0.5f;
        processor_->setParameters(params);
    }
    
    void processAudio(juce::AudioBuffer<float>& buffer) {
        if (processor_) {
            processor_->process(buffer);
        }
    }
    
private:
    std::unique_ptr<CircularDelayProcessor> processor_;
};

/**
 * === EXAMPLE 2: Plugin Integration ===
 * 
 * How to integrate into a JUCE AudioProcessor plugin
 */
class CircularDelayPluginProcessor : public juce::AudioProcessor {
public:
    CircularDelayPluginProcessor()
        : AudioProcessor(BusesProperties()
            .withInput ("Input",  juce::AudioChannelSet::stereo(), true)
            .withOutput("Output", juce::AudioChannelSet::stereo(), true)) {
    }
    
    void prepareToPlay(double sampleRate, int samplesPerBlock) override {
        delay_.prepare(sampleRate, samplesPerBlock, getTotalNumInputChannels());
    }
    
    void releaseResources() override {
        delay_.reset();
    }
    
    void processBlock(juce::AudioBuffer<float>& buffer, 
                     juce::MidiBuffer&) override {
        // Apply the circular delay effect
        delay_.process(buffer);
    }
    
    juce::AudioProcessorEditor* createEditor() override {
        return new CircularDelayUI(delay_);
    }
    
    bool hasEditor() const override { return true; }
    const juce::String getName() const override { return "Circular Delay"; }
    
    // ... other required AudioProcessor methods ...
    
private:
    CircularDelayProcessor delay_;
};

/**
 * === EXAMPLE 3: Parameter Automation ===
 * 
 * Real-time parameter control with smooth transitions
 */
class ParameterAutomationExample {
public:
    ParameterAutomationExample(CircularDelayProcessor& processor)
        : processor_(processor) {
    }
    
    /**
     * Gradually increase intensity from 0 to max
     */
    void automateIntensity(float elapsed_seconds) {
        float intensity = std::min(1.0f, elapsed_seconds / 10.0f);  // 10 second ramp
        
        processor_.setMix(intensity * 0.8f);              // 0 to 80% wet
        processor_.setPanRate(0.5f + intensity * 2.5f);   // 0.5 to 3.0 Hz
        processor_.setFeedback(0.2f + intensity * 0.5f);  // 0.2 to 0.7
        processor_.setDepth(intensity);                   // 0 to 100%
    }
    
    /**
     * Rhythmic effect pulse (on/off)
     */
    void rhythmicPulse(int sample_count, float bpm) {
        const int beats_per_measure = 4;
        const int sample_rate = 44100;
        const int samples_per_beat = (60.0f / bpm) * sample_rate;
        const int samples_per_measure = samples_per_beat * beats_per_measure;
        
        int position_in_measure = sample_count % samples_per_measure;
        int beat_position = position_in_measure / samples_per_beat;
        
        // Effect on beats 1 and 3, off on 2 and 4
        float target_mix = (beat_position == 0 || beat_position == 2) ? 0.6f : 0.0f;
        processor_.setMix(target_mix);
    }
    
    /**
     * Frequency sweep (varying delay time)
     */
    void frequencySweep(float elapsed_seconds) {
        float sweep_amount = std::sin(elapsed_seconds * 2.0f);  // Oscillate @ 2 rad/s
        float delay_time = 500.0f + sweep_amount * 400.0f;     // 100-900 ms range
        processor_.setDelayTime(delay_time);
    }
    
private:
    CircularDelayProcessor& processor_;
};

/**
 * === EXAMPLE 4: Preset Management ===
 * 
 * Load and switch between predefined presets
 */
class PresetManager {
public:
    enum class Preset {
        SUBTLE_ENHANCEMENT,
        CLASSIC_SPX90,
        DENSE_SHIMMER,
        PSYCHEDELIC,
        SLAPBACK_DELAY
    };
    
    static CircularDelayProcessor::Parameters getPreset(Preset preset) {
        switch (preset) {
            case Preset::SUBTLE_ENHANCEMENT:
                return {
                    250.0f,  // delayTime
                    4,       // numTaps
                    0.2f,    // feedback
                    0.5f,    // panRate
                    0.3f,    // depth
                    0.3f,    // mix
                    0.0f,    // initialPanAngle
                    false    // bypass
                };
            
            case Preset::CLASSIC_SPX90:
                return {
                    500.0f,  // delayTime
                    8,       // numTaps
                    0.5f,    // feedback
                    1.0f,    // panRate
                    0.8f,    // depth
                    0.6f,    // mix
                    0.0f,    // initialPanAngle
                    false    // bypass
                };
            
            case Preset::DENSE_SHIMMER:
                return {
                    300.0f,  // delayTime
                    12,      // numTaps
                    0.4f,    // feedback
                    0.3f,    // panRate
                    1.0f,    // depth
                    0.7f,    // mix
                    0.0f,    // initialPanAngle
                    false    // bypass
                };
            
            case Preset::PSYCHEDELIC:
                return {
                    1500.0f, // delayTime
                    12,      // numTaps
                    0.85f,   // feedback
                    2.5f,    // panRate
                    1.0f,    // depth
                    0.8f,    // mix
                    0.0f,    // initialPanAngle
                    false    // bypass
                };
            
            case Preset::SLAPBACK_DELAY:
                return {
                    200.0f,  // delayTime
                    2,       // numTaps
                    0.3f,    // feedback
                    0.5f,    // panRate
                    0.2f,    // depth
                    0.4f,    // mix
                    0.0f,    // initialPanAngle
                    false    // bypass
                };
            
            default:
                return {};
        }
    }
    
    static void applyPreset(CircularDelayProcessor& processor, Preset preset) {
        processor.setParameters(getPreset(preset));
    }
};

/**
 * === EXAMPLE 5: Dry/Wet Chain Processing ===
 * 
 * Advanced pattern for serial processing with multiple effects
 */
class EffectChain {
public:
    struct EffectParameters {
        float circularDelayMix = 0.5f;
        float reverbMix = 0.3f;
        float masterDryWet = 1.0f;  // 0 = dry, 1 = fully processed
    };
    
    void setup(double sampleRate, int blockSize) {
        circularDelay_.prepare(sampleRate, blockSize, 2);
    }
    
    void process(juce::AudioBuffer<float>& buffer, const EffectParameters& params) {
        // Store dry signal
        juce::AudioBuffer<float> dryBuffer = buffer;
        
        // Apply circular delay
        juce::AudioBuffer<float> delayBuffer = buffer;
        circularDelay_.setMix(params.circularDelayMix);
        circularDelay_.process(delayBuffer);
        
        // Apply reverb (if you have one)
        // reverbProcessor_.process(delayBuffer);
        
        // Dry/wet mix at output stage
        for (int ch = 0; ch < buffer.getNumChannels(); ++ch) {
            auto* dryPtr = dryBuffer.getReadPointer(ch);
            auto* wetPtr = delayBuffer.getReadPointer(ch);
            auto* outPtr = buffer.getWritePointer(ch);
            
            for (int i = 0; i < buffer.getNumSamples(); ++i) {
                outPtr[i] = dryPtr[i] * (1.0f - params.masterDryWet) +
                           wetPtr[i] * params.masterDryWet;
            }
        }
    }
    
private:
    CircularDelayProcessor circularDelay_;
};

/**
 * === EXAMPLE 6: Real-time Metering ===
 * 
 * Display effect activity and visualization
 */
class MeteringExample {
public:
    MeteringExample(CircularDelayProcessor& processor)
        : processor_(processor) {
    }
    
    void displayMetering() {
        auto metering = processor_.getMetering();
        
        std::cout << "=== Circular Delay Metering ===" << std::endl;
        std::cout << "Input Level:  " << metering.inputLevel << " dB" << std::endl;
        std::cout << "Output Level: " << metering.outputLevel << " dB" << std::endl;
        std::cout << "LFO Phase: " << metering.lfoPhase << " (0-1)" << std::endl;
        
        std::cout << "\nTap Levels:" << std::endl;
        for (int i = 0; i < 12; ++i) {
            if (metering.tapLevels[i] > 0.001f) {
                std::cout << "  Tap " << i << ": " << metering.tapLevels[i]
                         << " @ " << metering.tapAngles[i] << "°" << std::endl;
            }
        }
    }
    
private:
    CircularDelayProcessor& processor_;
};

/**
 * === EXAMPLE 7: Tempo Synchronization ===
 * 
 * Sync effect parameters to musical tempo
 */
class TempoSyncExample {
public:
    TempoSyncExample(CircularDelayProcessor& processor, float bpm)
        : processor_(processor), bpm_(bpm) {
    }
    
    /**
     * Set delay time based on tempo and note subdivision
     */
    enum class NoteValue {
        WHOLE = 4,
        HALF = 2,
        QUARTER = 1,
        EIGHTH = 0.5f,
        SIXTEENTH = 0.25f,
        TRIPLET = 0.333f
    };
    
    void setSyncedDelayTime(NoteValue noteValue) {
        float beats_per_minute = bpm_;
        float seconds_per_beat = 60.0f / beats_per_minute;
        float delay_seconds = seconds_per_beat * static_cast<float>(noteValue);
        float delay_ms = delay_seconds * 1000.0f;
        
        processor_.setDelayTime(delay_ms);
    }
    
    /**
     * Sync pan rate to tempo (rotations per beat)
     */
    void setSyncedPanRate(float rotations_per_beat) {
        float beats_per_second = bpm_ / 60.0f;
        float pan_rate_hz = beats_per_second * rotations_per_beat;
        
        processor_.setPanRate(std::clamp(pan_rate_hz, 0.1f, 5.0f));
    }
    
private:
    CircularDelayProcessor& processor_;
    float bpm_;
};

/**
 * === EXAMPLE 8: Testing & Validation ===
 * 
 * Unit tests for effect verification
 */
class CircularDelayTests {
public:
    static bool testBasicFunctionality() {
        CircularDelayProcessor processor;
        processor.prepare(44100.0, 512, 2);
        
        // Create test impulse
        juce::AudioBuffer<float> buffer(2, 512);
        buffer.clear();
        buffer.setSample(0, 0, 1.0f);  // Impulse in left channel
        
        // Process
        processor.setMix(1.0f);  // Fully wet
        processor.process(buffer);
        
        // Check for output in delay tail
        bool hasOutput = false;
        auto* data = buffer.getReadPointer(0);
        for (int i = 100; i < 512; ++i) {
            if (std::abs(data[i]) > 0.001f) {
                hasOutput = true;
                break;
            }
        }
        
        return hasOutput;
    }
    
    static bool testParameterRanges() {
        CircularDelayProcessor processor;
        processor.prepare(44100.0, 512, 2);
        
        // Test valid ranges
        processor.setDelayTime(100.0f);
        processor.setDelayTime(2000.0f);
        
        processor.setNumTaps(4);
        processor.setNumTaps(12);
        
        processor.setFeedback(0.0f);
        processor.setFeedback(0.95f);
        
        processor.setPanRate(0.1f);
        processor.setPanRate(5.0f);
        
        processor.setDepth(0.0f);
        processor.setDepth(1.0f);
        
        processor.setMix(0.0f);
        processor.setMix(1.0f);
        
        return true;
    }
};

}  // namespace map2::examples
