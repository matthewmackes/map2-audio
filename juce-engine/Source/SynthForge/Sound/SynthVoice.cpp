#include "SynthForge/Sound/SynthVoice.h"

#include <cmath>

namespace map2::synthforge {

SynthVoice::SynthVoice(SynthVoiceParameters& parameters)
    : parameters_(parameters) {
    filterL_.setType(juce::dsp::StateVariableTPTFilterType::lowpass);
    filterR_.setType(juce::dsp::StateVariableTPTFilterType::lowpass);
}

bool SynthVoice::canPlaySound(juce::SynthesiserSound* sound) {
    return dynamic_cast<SynthSound*>(sound) != nullptr;
}

void SynthVoice::setCurrentSampleRate(double sampleRate) {
    sampleRate_ = sampleRate;
    adsr_.setSampleRate(sampleRate_);

    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate_;
    spec.maximumBlockSize = 1024;
    spec.numChannels = 1;

    filterL_.prepare(spec);
    filterR_.prepare(spec);
    filterL_.reset();
    filterR_.reset();
}

void SynthVoice::startNote(
    int midiNoteNumber,
    float velocity,
    juce::SynthesiserSound*,
    int /*currentPitchWheelPosition*/) {
    currentNote_ = midiNoteNumber;
    noteVelocity_ = juce::jlimit(0.0f, 1.0f, velocity);
    phase_ = 0.0f;

    updateEnvelope();
    updateFrequency();
    updateFilter();
    adsr_.noteOn();
}

void SynthVoice::stopNote(float, bool allowTailOff) {
    if (allowTailOff) {
        adsr_.noteOff();
        return;
    }

    adsr_.reset();
    clearCurrentNote();
}

void SynthVoice::renderNextBlock(juce::AudioBuffer<float>& outputBuffer, int startSample, int numSamples) {
    if (!isVoiceActive()) {
        return;
    }

    updateEnvelope();
    updateFrequency();
    updateFilter();

    const float level = juce::jlimit(0.0f, 1.0f, parameters_.oscLevel.load(std::memory_order_relaxed));
    const int waveform = juce::jlimit(0, 3, parameters_.waveform.load(std::memory_order_relaxed));

    float* left = outputBuffer.getWritePointer(0);
    float* right = outputBuffer.getNumChannels() > 1 ? outputBuffer.getWritePointer(1) : nullptr;

    for (int i = 0; i < numSamples; ++i) {
        const float env = adsr_.getNextSample();

        if (!adsr_.isActive()) {
            clearCurrentNote();
            break;
        }

        const float wave = renderWave(waveform, phase_);
        phase_ += phaseIncrement_;
        if (phase_ >= 1.0f) {
            phase_ -= 1.0f;
        }

        const float dry = wave * env * level * noteVelocity_;
        const float sampleL = filterL_.processSample(0, dry);
        const float sampleR = filterR_.processSample(0, dry);

        left[startSample + i] += sampleL;
        if (right != nullptr) {
            right[startSample + i] += sampleR;
        }
    }
}

float SynthVoice::renderWave(int waveform, float phase) {
    switch (waveform) {
        case 1:  // saw
            return (2.0f * phase) - 1.0f;
        case 2:  // square
            return phase < 0.5f ? 1.0f : -1.0f;
        case 3: {  // triangle
            const float v = 4.0f * std::fabs(phase - 0.5f) - 1.0f;
            return juce::jlimit(-1.0f, 1.0f, v);
        }
        case 0:
        default:
            return std::sin(juce::MathConstants<float>::twoPi * phase);
    }
}

void SynthVoice::updateFrequency() {
    const float coarse = parameters_.coarseSemitones.load(std::memory_order_relaxed);
    const float midiNote = static_cast<float>(currentNote_) + coarse;
    const double hz = juce::MidiMessage::getMidiNoteInHertz(midiNote);
    phaseIncrement_ = static_cast<float>(hz / sampleRate_);
}

void SynthVoice::updateEnvelope() {
    const float attackMs = juce::jmax(0.1f, parameters_.attackMs.load(std::memory_order_relaxed));
    const float decayMs = juce::jmax(1.0f, parameters_.decayMs.load(std::memory_order_relaxed));
    const float sustain = juce::jlimit(0.0f, 1.0f, parameters_.sustain.load(std::memory_order_relaxed));
    const float releaseMs = juce::jmax(1.0f, parameters_.releaseMs.load(std::memory_order_relaxed));

    adsrParams_.attack = attackMs / 1000.0f;
    adsrParams_.decay = decayMs / 1000.0f;
    adsrParams_.sustain = sustain;
    adsrParams_.release = releaseMs / 1000.0f;
    adsr_.setParameters(adsrParams_);
}

void SynthVoice::updateFilter() {
    const float cutoff = juce::jlimit(20.0f, 20000.0f, parameters_.cutoffHz.load(std::memory_order_relaxed));
    const float resonance = juce::jlimit(0.1f, 1.2f, parameters_.resonance.load(std::memory_order_relaxed));

    filterL_.setCutoffFrequency(cutoff);
    filterL_.setResonance(resonance);
    filterR_.setCutoffFrequency(cutoff);
    filterR_.setResonance(resonance);
}

}  // namespace map2::synthforge
