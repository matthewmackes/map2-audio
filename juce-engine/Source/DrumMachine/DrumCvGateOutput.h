#pragma once

#include <juce_audio_basics/juce_audio_basics.h>

namespace map2::drummachine {

class DrumCvGateOutput {
public:
    struct Config {
        bool enabled = false;
        int outputPair = 0;
        float gateLengthMs = 25.0f;
        int noteMin = 36;
        int noteMax = 84;
        float pitchMinVolts = 0.0f;
        float pitchMaxVolts = 5.0f;
    };

    void prepare(double sampleRate);
    void reset();
    void noteOn(int midiNote, const Config& config);
    void noteOff();
    void render(juce::AudioBuffer<float>& buffer, int gateChannel, int cvChannel, int startSample, int numSamples);

private:
    double sampleRate_ = 44100.0;
    int gateRemainingSamples_ = 0;
    float pitchVolts_ = 0.0f;
};

}  // namespace map2::drummachine
