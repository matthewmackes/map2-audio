#include "DrumMachine/DrumCvGateOutput.h"

#include <algorithm>
#include <cmath>

namespace map2::drummachine {

void DrumCvGateOutput::prepare(double sampleRate) {
    sampleRate_ = std::max(1.0, sampleRate);
    reset();
}

void DrumCvGateOutput::reset() {
    gateRemainingSamples_ = 0;
    pitchVolts_ = 0.0f;
}

void DrumCvGateOutput::noteOn(int midiNote, const Config& config) {
    const int clampedMin = std::clamp(config.noteMin, 0, 127);
    const int clampedMax = std::max(clampedMin + 1, std::clamp(config.noteMax, 0, 127));
    const int clampedNote = std::clamp(midiNote, clampedMin, clampedMax);
    const float normalized = static_cast<float>(clampedNote - clampedMin)
        / static_cast<float>(clampedMax - clampedMin);
    pitchVolts_ = config.pitchMinVolts + normalized * (config.pitchMaxVolts - config.pitchMinVolts);
    gateRemainingSamples_ = std::max(1, static_cast<int>(std::round(
        std::max(1.0f, config.gateLengthMs) * static_cast<float>(sampleRate_) / 1000.0f)));
}

void DrumCvGateOutput::noteOff() {
    gateRemainingSamples_ = 0;
}

void DrumCvGateOutput::render(
    juce::AudioBuffer<float>& buffer,
    int gateChannel,
    int cvChannel,
    int startSample,
    int numSamples) {
    if (numSamples <= 0 || startSample < 0 || gateChannel < 0 || cvChannel < 0) {
        return;
    }
    if (gateChannel >= buffer.getNumChannels() || cvChannel >= buffer.getNumChannels()) {
        return;
    }

    const int boundedSamples = std::min(numSamples, buffer.getNumSamples() - startSample);
    if (boundedSamples <= 0) {
        return;
    }

    auto* gate = buffer.getWritePointer(gateChannel, startSample);
    auto* cv = buffer.getWritePointer(cvChannel, startSample);
    for (int sample = 0; sample < boundedSamples; ++sample) {
        cv[sample] += pitchVolts_;
        if (gateRemainingSamples_ > 0) {
            gate[sample] += 1.0f;
            --gateRemainingSamples_;
        }
    }
}

}  // namespace map2::drummachine
