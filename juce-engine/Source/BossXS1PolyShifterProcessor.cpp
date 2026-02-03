/**
 * MAP2 Audio Engine - Boss XS-1 Poly Shifter Implementation
 * Professional polyphonic pitch shifter emulating the Boss XS-1 pedal
 *
 * Algorithm Overview:
 * - Granular pitch shifting with overlapping window functions
 * - Real-time pitch ratio calculation
 * - Seamless blend between wet and dry signal
 * - MIDI CC mapping for all parameters
 * - Expression pedal support for dynamic control
 */

#include "BossXS1PolyShifterProcessor.h"
#include <algorithm>
#include <cmath>

namespace map2 {

BossXS1PolyShifterProcessor::BossXS1PolyShifterProcessor() {
    parameters_.preset = Preset::Manual;
    initializePresets();
}

void BossXS1PolyShifterProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;

    // Configure pitch shifter engines for both channels
    auto setupEngine = [this, samplesPerBlock](PitchShifterEngine& engine) {
        // Grain size calculation (adaptive to sample rate, ~20ms base)
        engine.grainSize = static_cast<int>(sampleRate_ * 0.02f);
        if (engine.grainSize < 512) engine.grainSize = 512;
        if (engine.grainSize > 4096) engine.grainSize = 4096;

        // Setup circular buffer (extra space for processing)
        int bufferSize = engine.grainSize * engine.grainOverlapFactor * 2;
        engine.circularBuffer.assign(bufferSize, 0.0f);
        engine.inputBuffer.assign(bufferSize, 0.0f);
        engine.outputBuffer.assign(bufferSize, 0.0f);

        // Initialize Hann window for grain envelope
        engine.grainWindow.resize(engine.grainSize);
        for (int i = 0; i < engine.grainSize; ++i) {
            float phase = juce::MathConstants<float>::pi * i / (engine.grainSize - 1);
            engine.grainWindow[i] = std::pow(std::sin(phase), 2.0f);  // Hann window
        }

        engine.readIndex = 0.0f;
        engine.writeIndex = 0.0f;
        engine.currentPitchRatio = 1.0f;
        engine.targetPitchRatio = 1.0f;
        engine.feedbackBuffer = 0.0f;
    };

    setupEngine(state_.shifterL);
    setupEngine(state_.shifterR);

    // Setup smoothed values
    state_.smoothedShift.reset(sampleRate_, 0.02);  // 20ms ramp time
    state_.smoothedBalance.reset(sampleRate_, 0.01);
    state_.smoothedGlide.reset(sampleRate_, 0.01);

    prepared_ = true;
}

void BossXS1PolyShifterProcessor::reset() {
    for (auto& sample : state_.shifterL.circularBuffer) sample = 0.0f;
    for (auto& sample : state_.shifterL.inputBuffer) sample = 0.0f;
    for (auto& sample : state_.shifterL.outputBuffer) sample = 0.0f;
    for (auto& sample : state_.shifterR.circularBuffer) sample = 0.0f;
    for (auto& sample : state_.shifterR.inputBuffer) sample = 0.0f;
    for (auto& sample : state_.shifterR.outputBuffer) sample = 0.0f;

    state_.shifterL.readIndex = 0.0f;
    state_.shifterL.writeIndex = 0.0f;
    state_.shifterL.feedbackBuffer = 0.0f;
    state_.shifterR.readIndex = 0.0f;
    state_.shifterR.writeIndex = 0.0f;
    state_.shifterR.feedbackBuffer = 0.0f;

    inputLevel_.store(-100.0f);
    outputLevel_.store(-100.0f);
}

void BossXS1PolyShifterProcessor::process(juce::AudioBuffer<float>& buffer) {
    if (!prepared_ || parameters_.bypass) {
        inputLevel_.store(-100.0f);
        outputLevel_.store(-100.0f);
        return;
    }

    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    if (numChannels == 0) return;

    // Measure input level
    float inputMax = 0.0f;
    for (int ch = 0; ch < numChannels; ++ch) {
        inputMax = std::max(inputMax, calculatePeakLevel(buffer.getReadPointer(ch), numSamples));
    }
    inputLevel_.store(20.0f * std::log10(inputMax + 1e-10f));

    // Update smoothed parameters
    state_.smoothedShift.setTargetValue(parameters_.shiftAmount);
    state_.smoothedBalance.setTargetValue(parameters_.balance);
    state_.smoothedGlide.setTargetValue(parameters_.glide);

    // Process each channel
    if (numChannels >= 1) {
        auto* channelData = buffer.getWritePointer(0);
        float* dryData = new float[numSamples];
        std::copy(channelData, channelData + numSamples, dryData);

        // Calculate target pitch ratio
        float shiftAmount = state_.smoothedShift.getNextValue();
        if (parameters_.pedalEnabled) {
            float pedalShift = parameters_.pedalMin + 
                              (parameters_.pedalMax - parameters_.pedalMin) * 
                              (parameters_.pedalPosition / 100.0f);
            shiftAmount = pedalShift;
        }

        float pitchRatio = semitoneToPitchRatio(shiftAmount);
        if (parameters_.detuneMode) {
            pitchRatio = centsToFrequencyRatio(shiftAmount * 100.0f / 7.0f);  // Scale semitones to cents
        }

        state_.shifterL.targetPitchRatio = pitchRatio;
        processGranularPitchShift(buffer, state_.shifterL, pitchRatio);

        float balance = state_.smoothedBalance.getNextValue() / 100.0f;  // 0.0 to 1.0
        for (int i = 0; i < numSamples; ++i) {
            channelData[i] = (1.0f - balance) * dryData[i] + balance * channelData[i];
        }
        delete[] dryData;
    }

    if (numChannels >= 2) {
        auto* channelData = buffer.getWritePointer(1);
        float* dryData = new float[numSamples];
        std::copy(channelData, channelData + numSamples, dryData);

        float shiftAmount = state_.smoothedShift.getNextValue();
        if (parameters_.pedalEnabled) {
            float pedalShift = parameters_.pedalMin + 
                              (parameters_.pedalMax - parameters_.pedalMin) * 
                              (parameters_.pedalPosition / 100.0f);
            shiftAmount = pedalShift;
        }

        float pitchRatio = semitoneToPitchRatio(shiftAmount);
        if (parameters_.detuneMode) {
            pitchRatio = centsToFrequencyRatio(shiftAmount * 100.0f / 7.0f);
        }

        state_.shifterR.targetPitchRatio = pitchRatio;
        processGranularPitchShift(buffer, state_.shifterR, pitchRatio);

        float balance = state_.smoothedBalance.getNextValue() / 100.0f;
        for (int i = 0; i < numSamples; ++i) {
            channelData[i] = (1.0f - balance) * dryData[i] + balance * channelData[i];
        }
        delete[] dryData;
    }

    // Measure output level
    float outputMax = 0.0f;
    for (int ch = 0; ch < numChannels; ++ch) {
        outputMax = std::max(outputMax, calculatePeakLevel(buffer.getReadPointer(ch), numSamples));
    }
    outputLevel_.store(20.0f * std::log10(outputMax + 1e-10f));
}

void BossXS1PolyShifterProcessor::setParameters(const Parameters& params) {
    parameters_ = params;
}

BossXS1PolyShifterProcessor::Parameters BossXS1PolyShifterProcessor::getParameters() const {
    return parameters_;
}

float BossXS1PolyShifterProcessor::semitoneToPitchRatio(float semitones) const {
    return std::pow(2.0f, semitones / 12.0f);
}

float BossXS1PolyShifterProcessor::centsToFrequencyRatio(float cents) const {
    return std::pow(2.0f, cents / 1200.0f);
}

void BossXS1PolyShifterProcessor::processGranularPitchShift(
    juce::AudioBuffer<float>& buffer,
    PitchShifterEngine& engine,
    float pitchRatio) {
    
    const int numSamples = buffer.getNumSamples();
    float* channelData = buffer.getWritePointer(0);  // Placeholder - adapt for proper channel
    
    // Smooth pitch ratio changes
    float smoothingFactor = 0.95f;
    engine.currentPitchRatio = smoothingFactor * engine.currentPitchRatio + 
                              (1.0f - smoothingFactor) * engine.targetPitchRatio;
    
    // Process granular pitch shifting
    for (int i = 0; i < numSamples; ++i) {
        // Write input to circular buffer
        int writeIdx = static_cast<int>(engine.writeIndex) % engine.circularBuffer.size();
        engine.circularBuffer[writeIdx] = channelData[i];
        engine.writeIndex += 1.0f;
        
        // Read with pitch-shifted rate
        float readPos = engine.readIndex;
        int readIdx = static_cast<int>(readPos) % engine.circularBuffer.size();
        
        // Linear interpolation for smooth pitch shifting
        float fraction = readPos - std::floor(readPos);
        float sample1 = engine.circularBuffer[readIdx];
        float sample2 = engine.circularBuffer[(readIdx + 1) % engine.circularBuffer.size()];
        float interpolated = sample1 + fraction * (sample2 - sample1);
        
        // Apply grain window envelope
        int grainPhase = static_cast<int>(readPos) % engine.grainSize;
        float gain = engine.grainWindow[grainPhase];
        
        // Output with feedback
        float output = interpolated * gain;
        if (parameters_.feedback > 0.0f) {
            engine.feedbackBuffer = output * parameters_.feedback;
            output += engine.feedbackBuffer;
        }
        
        channelData[i] = output;
        
        // Advance read position with pitch shift rate
        engine.readIndex += engine.currentPitchRatio;
        if (engine.readIndex >= engine.circularBuffer.size()) {
            engine.readIndex -= engine.circularBuffer.size();
        }
    }
}

float BossXS1PolyShifterProcessor::calculatePeakLevel(const float* data, int numSamples) const {
    float peak = 0.0f;
    for (int i = 0; i < numSamples; ++i) {
        peak = std::max(peak, std::abs(data[i]));
    }
    return peak;
}

float BossXS1PolyShifterProcessor::getInputLevel() const {
    return inputLevel_.load();
}

float BossXS1PolyShifterProcessor::getOutputLevel() const {
    return outputLevel_.load();
}

void BossXS1PolyShifterProcessor::setMidiCC(int ccNumber, float value01) {
    jassert(value01 >= 0.0f && value01 <= 1.0f);
    value01 = std::clamp(value01, 0.0f, 1.0f);

    switch (ccNumber) {
        case MIDI_CC_SHIFT:
            parameters_.shiftAmount = MIN_SHIFT + (MAX_SHIFT - MIN_SHIFT) * value01;
            break;
        case MIDI_CC_BALANCE:
            parameters_.balance = MIN_BALANCE + (MAX_BALANCE - MIN_BALANCE) * value01;
            break;
        case MIDI_CC_PEDAL:
            parameters_.pedalPosition = value01 * 100.0f;
            break;
        case MIDI_CC_GLIDE:
            parameters_.glide = MIN_GLIDE + (MAX_GLIDE - MIN_GLIDE) * value01;
            break;
        case MIDI_CC_FEEDBACK:
            parameters_.feedback = value01 * 0.7f;  // Cap feedback at 0.7
            break;
        case MIDI_CC_MODE:
            parameters_.detuneMode = value01 > 0.5f;
            break;
    }
}

void BossXS1PolyShifterProcessor::setMidiNote(int noteNumber, int velocity) {
    // Notes can map to presets or control pitch in performance mode
    if (velocity == 0) return;  // Note off

    // Map MIDI notes to presets (middle octave: C3-B3)
    if (noteNumber >= 36 && noteNumber <= 47) {
        int presetIdx = noteNumber - 36;
        if (presetIdx < static_cast<int>(Preset::NumPresets)) {
            loadPreset(static_cast<Preset>(presetIdx));
        }
    }
}

void BossXS1PolyShifterProcessor::handleProgramChange(int programNumber) {
    // Map MIDI program changes to presets
    if (programNumber >= 0 && programNumber < static_cast<int>(Preset::NumPresets)) {
        loadPreset(static_cast<Preset>(programNumber));
    }
}

void BossXS1PolyShifterProcessor::loadPreset(Preset preset) {
    if (preset != Preset::Manual && preset < Preset::NumPresets) {
        parameters_ = presets_[static_cast<int>(preset)];
        parameters_.preset = preset;
    }
}

void BossXS1PolyShifterProcessor::savePreset(Preset preset, const Parameters& params) {
    if (preset != Preset::Manual && preset < Preset::NumPresets) {
        presets_[static_cast<int>(preset)] = params;
    }
}

BossXS1PolyShifterProcessor::Parameters BossXS1PolyShifterProcessor::getPresetParameters(Preset preset) const {
    if (preset < Preset::NumPresets) {
        return presets_[static_cast<int>(preset)];
    }
    return parameters_;
}

const char* BossXS1PolyShifterProcessor::getPresetName(Preset preset) {
    static const char* presetNames[] = {
        "Manual",
        "Drop D", "Drop D#", "Half Step Down", "Capo 2nd", "Capo 3rd", "Capo 5th",
        "Octave Up", "Octave Down", "Octave Up/Down",
        "Micro Wide", "Micro Narrow", "Voice Doubling", "String Doubling", "Pianist Octaves",
        "Sub Bass", "Sonic Screamer", "Unique Intervals", "Minor Third", "Chord Shift",
        "Detune Chorus", "Spacey Vibrato", "Robotic Mod"
    };
    
    int idx = static_cast<int>(preset);
    if (idx >= 0 && idx < static_cast<int>(Preset::NumPresets)) {
        return presetNames[idx];
    }
    return "Unknown";
}

void BossXS1PolyShifterProcessor::initializePresets() {
    // Manual preset (defaults)
    presets_[static_cast<int>(Preset::Manual)] = Parameters{};

    // === Drop Tunings ===
    presets_[static_cast<int>(Preset::DropD)].shiftAmount = -2.0f;
    presets_[static_cast<int>(Preset::DropD)].balance = 100.0f;
    presets_[static_cast<int>(Preset::DropD)].detuneMode = false;

    presets_[static_cast<int>(Preset::DropDSharp)].shiftAmount = -2.5f;
    presets_[static_cast<int>(Preset::DropDSharp)].balance = 100.0f;
    presets_[static_cast<int>(Preset::DropDSharp)].detuneMode = false;

    presets_[static_cast<int>(Preset::HalfStepDown)].shiftAmount = -1.0f;
    presets_[static_cast<int>(Preset::HalfStepDown)].balance = 100.0f;
    presets_[static_cast<int>(Preset::HalfStepDown)].detuneMode = false;

    // === Capo Simulations ===
    presets_[static_cast<int>(Preset::Capo2ndFret)].shiftAmount = 2.0f;
    presets_[static_cast<int>(Preset::Capo2ndFret)].balance = 100.0f;
    presets_[static_cast<int>(Preset::Capo2ndFret)].detuneMode = false;

    presets_[static_cast<int>(Preset::Capo3rdFret)].shiftAmount = 3.0f;
    presets_[static_cast<int>(Preset::Capo3rdFret)].balance = 100.0f;
    presets_[static_cast<int>(Preset::Capo3rdFret)].detuneMode = false;

    presets_[static_cast<int>(Preset::Capo5thFret)].shiftAmount = 5.0f;
    presets_[static_cast<int>(Preset::Capo5thFret)].balance = 100.0f;
    presets_[static_cast<int>(Preset::Capo5thFret)].detuneMode = false;

    // === Octave Shifts ===
    presets_[static_cast<int>(Preset::OctaveUp)].shiftAmount = 12.0f;
    presets_[static_cast<int>(Preset::OctaveUp)].balance = 50.0f;  // Mix with dry for 12-string effect
    presets_[static_cast<int>(Preset::OctaveUp)].detuneMode = false;

    presets_[static_cast<int>(Preset::OctaveDown)].shiftAmount = -12.0f;
    presets_[static_cast<int>(Preset::OctaveDown)].balance = 50.0f;
    presets_[static_cast<int>(Preset::OctaveDown)].detuneMode = false;

    presets_[static_cast<int>(Preset::OctaveUpDown)].shiftAmount = 0.0f;  // Manual dual mode
    presets_[static_cast<int>(Preset::OctaveUpDown)].balance = 50.0f;
    presets_[static_cast<int>(Preset::OctaveUpDown)].detuneMode = false;

    // === Doubling/Detune Presets ===
    presets_[static_cast<int>(Preset::MicroPitchWide)].shiftAmount = 0.0f;
    presets_[static_cast<int>(Preset::MicroPitchWide)].balance = 75.0f;
    presets_[static_cast<int>(Preset::MicroPitchWide)].detuneMode = true;
    presets_[static_cast<int>(Preset::MicroPitchWide)].detuneAmount = 20.0f;

    presets_[static_cast<int>(Preset::MicroPitchNarrow)].shiftAmount = 0.0f;
    presets_[static_cast<int>(Preset::MicroPitchNarrow)].balance = 60.0f;
    presets_[static_cast<int>(Preset::MicroPitchNarrow)].detuneMode = true;
    presets_[static_cast<int>(Preset::MicroPitchNarrow)].detuneAmount = 8.0f;

    presets_[static_cast<int>(Preset::VoiceDoubling)].shiftAmount = 0.0f;
    presets_[static_cast<int>(Preset::VoiceDoubling)].balance = 70.0f;
    presets_[static_cast<int>(Preset::VoiceDoubling)].detuneMode = true;
    presets_[static_cast<int>(Preset::VoiceDoubling)].detuneAmount = 15.0f;

    presets_[static_cast<int>(Preset::StringDoubling)].shiftAmount = 0.0f;
    presets_[static_cast<int>(Preset::StringDoubling)].balance = 65.0f;
    presets_[static_cast<int>(Preset::StringDoubling)].detuneMode = true;
    presets_[static_cast<int>(Preset::StringDoubling)].detuneAmount = 12.0f;

    presets_[static_cast<int>(Preset::PianistOctaves)].shiftAmount = 0.0f;
    presets_[static_cast<int>(Preset::PianistOctaves)].balance = 68.0f;
    presets_[static_cast<int>(Preset::PianistOctaves)].detuneMode = true;
    presets_[static_cast<int>(Preset::PianistOctaves)].detuneAmount = 10.0f;

    // === Extreme Effects ===
    presets_[static_cast<int>(Preset::SubBass)].shiftAmount = -7.0f;  // -2 octaves would require octave mode
    presets_[static_cast<int>(Preset::SubBass)].balance = 100.0f;
    presets_[static_cast<int>(Preset::SubBass)].detuneMode = false;

    presets_[static_cast<int>(Preset::SonicScreamer)].shiftAmount = 7.0f;
    presets_[static_cast<int>(Preset::SonicScreamer)].balance = 100.0f;
    presets_[static_cast<int>(Preset::SonicScreamer)].detuneMode = false;

    presets_[static_cast<int>(Preset::UniqueIntervals)].shiftAmount = 5.0f;  // Major 3rd
    presets_[static_cast<int>(Preset::UniqueIntervals)].balance = 75.0f;
    presets_[static_cast<int>(Preset::UniqueIntervals)].detuneMode = false;

    presets_[static_cast<int>(Preset::MinorThird)].shiftAmount = -3.0f;
    presets_[static_cast<int>(Preset::MinorThird)].balance = 80.0f;
    presets_[static_cast<int>(Preset::MinorThird)].detuneMode = false;

    presets_[static_cast<int>(Preset::ChordShift)].shiftAmount = 3.0f;  // Minor 3rd
    presets_[static_cast<int>(Preset::ChordShift)].balance = 75.0f;
    presets_[static_cast<int>(Preset::ChordShift)].detuneMode = false;

    // === Experimental/Modulation ===
    presets_[static_cast<int>(Preset::DetuneChorus)].shiftAmount = 0.0f;
    presets_[static_cast<int>(Preset::DetuneChorus)].balance = 70.0f;
    presets_[static_cast<int>(Preset::DetuneChorus)].detuneMode = true;
    presets_[static_cast<int>(Preset::DetuneChorus)].feedback = 0.2f;

    presets_[static_cast<int>(Preset::SpaceyVibrato)].shiftAmount = 0.5f;
    presets_[static_cast<int>(Preset::SpaceyVibrato)].balance = 60.0f;
    presets_[static_cast<int>(Preset::SpaceyVibrato)].detuneMode = true;
    presets_[static_cast<int>(Preset::SpaceyVibrato)].glide = 50.0f;

    presets_[static_cast<int>(Preset::RoboticMod)].shiftAmount = 1.0f;
    presets_[static_cast<int>(Preset::RoboticMod)].balance = 80.0f;
    presets_[static_cast<int>(Preset::RoboticMod)].detuneMode = false;
    presets_[static_cast<int>(Preset::RoboticMod)].feedback = 0.3f;
}

void BossXS1PolyShifterProcessor::updateGrainWindow() {
    // Regenerate Hann windows if grain size changed
    for (auto& engine : {&state_.shifterL, &state_.shifterR}) {
        engine->grainWindow.resize(engine->grainSize);
        for (int i = 0; i < engine->grainSize; ++i) {
            float phase = juce::MathConstants<float>::pi * i / (engine->grainSize - 1);
            engine->grainWindow[i] = std::pow(std::sin(phase), 2.0f);
        }
    }
}

}  // namespace map2
