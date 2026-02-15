/**
 * MAP2 Audio Engine - Pitch Shifter Processor Implementation
 *
 * Implements a dual granular pitch shifter optimized
 * for the classic Van Halen "brown sound" micropitch/detune effect.
 *
 * Technical approach:
 * - Two overlapping grains per channel with Hann windowing
 * - Linear interpolation for smooth pitch shifting
 * - Separate post-shift delay for L/R channel stagger
 * - Feedback path for shimmer/spiral effects
 */

#include "PitchShifterProcessor.h"
#include <cmath>
#include <algorithm>

namespace map2 {

PitchShifterProcessor::PitchShifterProcessor() {
}

void PitchShifterProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;
    numChannels_ = numChannels;

    // Calculate grain size based on sample rate (~42ms)
    grainSize_ = static_cast<int>(sampleRate * 0.042);
    if (grainSize_ < 512) grainSize_ = 512;
    if (grainSize_ > 4096) grainSize_ = 4096;

    // Allocate buffers
    int bufferSize = grainSize_ * 4;  // Room for multiple grains
    stateL_.buffer.resize(bufferSize, 0.0f);
    stateR_.buffer.resize(bufferSize, 0.0f);

    // Delay buffers for post-shift delay (100ms max)
    int maxDelaySamples = static_cast<int>(sampleRate * 0.1) + 1;
    delayBufferL_.resize(maxDelaySamples, 0.0f);
    delayBufferR_.resize(maxDelaySamples, 0.0f);

    // Initialize grains with staggered start positions
    for (int i = 0; i < NUM_GRAINS; ++i) {
        stateL_.grains[i].readPos = static_cast<float>(i * grainSize_ / NUM_GRAINS);
        stateL_.grains[i].sampleCount = i * grainSize_ / NUM_GRAINS;
        stateL_.grains[i].active = true;

        stateR_.grains[i].readPos = static_cast<float>(i * grainSize_ / NUM_GRAINS);
        stateR_.grains[i].sampleCount = i * grainSize_ / NUM_GRAINS;
        stateR_.grains[i].active = true;
    }

    // Setup smoothed values
    smoothedPitchL_.reset(sampleRate, 0.05);
    smoothedPitchR_.reset(sampleRate, 0.05);
    smoothedDelayL_.reset(sampleRate, 0.05);
    smoothedDelayR_.reset(sampleRate, 0.05);
    smoothedMix_.reset(sampleRate, 0.02);

    prepared_ = true;
    parametersChanged_.store(true);
}

void PitchShifterProcessor::reset() {
    std::fill(stateL_.buffer.begin(), stateL_.buffer.end(), 0.0f);
    std::fill(stateR_.buffer.begin(), stateR_.buffer.end(), 0.0f);
    std::fill(delayBufferL_.begin(), delayBufferL_.end(), 0.0f);
    std::fill(delayBufferR_.begin(), delayBufferR_.end(), 0.0f);

    stateL_.writePos = 0;
    stateR_.writePos = 0;
    stateL_.feedback = 0.0f;
    stateR_.feedback = 0.0f;
    delayWritePos_ = 0;

    inputLevelL_.store(-100.0f);
    inputLevelR_.store(-100.0f);
    outputLevelL_.store(-100.0f);
    outputLevelR_.store(-100.0f);
}

void PitchShifterProcessor::process(juce::AudioBuffer<float>& buffer) {
    if (!prepared_) return;

    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    // Get input levels
    if (numChannels >= 1) {
        inputLevelL_.store(calculatePeakLevel(buffer.getReadPointer(0), numSamples));
    }
    if (numChannels >= 2) {
        inputLevelR_.store(calculatePeakLevel(buffer.getReadPointer(1), numSamples));
    }

    if (bypass_.load()) {
        outputLevelL_.store(inputLevelL_.load());
        outputLevelR_.store(inputLevelR_.load());
        return;
    }

    // Update smoothed parameters
    float pitchLCents = pitchL_.load();
    float pitchRCents = pitchR_.load();
    float delayLMs = delayL_.load();
    float delayRMs = delayR_.load();
    float mixPercent = mix_.load();
    float feedbackAmt = feedback_.load();

    smoothedPitchL_.setTargetValue(centsToRatio(pitchLCents));
    smoothedPitchR_.setTargetValue(centsToRatio(pitchRCents));
    smoothedDelayL_.setTargetValue(delayLMs * static_cast<float>(sampleRate_) / 1000.0f);
    smoothedDelayR_.setTargetValue(delayRMs * static_cast<float>(sampleRate_) / 1000.0f);
    smoothedMix_.setTargetValue(mixPercent / 100.0f);

    float* dataL = buffer.getWritePointer(0);
    float* dataR = numChannels >= 2 ? buffer.getWritePointer(1) : nullptr;

    int delayBufferSize = static_cast<int>(delayBufferL_.size());

    for (int i = 0; i < numSamples; ++i) {
        float pitchRatioL = smoothedPitchL_.getNextValue();
        float pitchRatioR = smoothedPitchR_.getNextValue();
        float delaySamplesL = smoothedDelayL_.getNextValue();
        float delaySamplesR = smoothedDelayR_.getNextValue();
        float wet = smoothedMix_.getNextValue();
        float dry = 1.0f - wet;

        // Process left channel
        float inputL = dataL[i];
        float shiftedL = processSample(stateL_, inputL + stateL_.feedback * feedbackAmt, pitchRatioL);

        // Apply post-shift delay to left channel
        delayBufferL_[delayWritePos_] = shiftedL;
        float delayedL = shiftedL;
        if (delaySamplesL > 0.0f) {
            float readPos = static_cast<float>(delayWritePos_) - delaySamplesL;
            if (readPos < 0.0f) readPos += static_cast<float>(delayBufferSize);
            delayedL = readFromBuffer(delayBufferL_, readPos);
        }
        stateL_.feedback = delayedL;

        // Mix dry and wet
        dataL[i] = inputL * dry + delayedL * wet;

        // Process right channel
        if (dataR != nullptr) {
            float inputR = dataR[i];
            float shiftedR = processSample(stateR_, inputR + stateR_.feedback * feedbackAmt, pitchRatioR);

            // Apply post-shift delay to right channel
            delayBufferR_[delayWritePos_] = shiftedR;
            float delayedR = shiftedR;
            if (delaySamplesR > 0.0f) {
                float readPos = static_cast<float>(delayWritePos_) - delaySamplesR;
                if (readPos < 0.0f) readPos += static_cast<float>(delayBufferSize);
                delayedR = readFromBuffer(delayBufferR_, readPos);
            }
            stateR_.feedback = delayedR;

            dataR[i] = inputR * dry + delayedR * wet;
        }

        // Advance delay write position
        delayWritePos_ = (delayWritePos_ + 1) % delayBufferSize;
    }

    // Update output levels
    outputLevelL_.store(calculatePeakLevel(dataL, numSamples));
    if (dataR != nullptr) {
        outputLevelR_.store(calculatePeakLevel(dataR, numSamples));
    }

    // Update grain phase for visualization
    if (!stateL_.grains.empty()) {
        float phase = static_cast<float>(stateL_.grains[0].sampleCount) / static_cast<float>(grainSize_);
        grainPhase_.store(phase);
    }
}

float PitchShifterProcessor::processSample(ChannelState& state, float input, float pitchRatio) {
    // Write input to circular buffer
    int bufferSize = static_cast<int>(state.buffer.size());
    state.buffer[state.writePos] = input;

    float output = 0.0f;

    // Process each grain
    for (auto& grain : state.grains) {
        if (!grain.active) continue;

        // Calculate window amplitude using Hann window
        float phase = static_cast<float>(grain.sampleCount) / static_cast<float>(grainSize_);
        float window = hannWindow(phase);

        // Read from buffer with interpolation
        float readSample = readFromBuffer(state.buffer, grain.readPos);
        output += readSample * window;

        // Advance read position based on pitch ratio
        grain.readPos += pitchRatio;

        // Wrap read position
        while (grain.readPos >= static_cast<float>(bufferSize)) {
            grain.readPos -= static_cast<float>(bufferSize);
        }
        while (grain.readPos < 0.0f) {
            grain.readPos += static_cast<float>(bufferSize);
        }

        // Advance sample count and check for grain reset
        grain.sampleCount++;
        if (grain.sampleCount >= grainSize_) {
            grain.sampleCount = 0;
            // Reset read position to near write position
            grain.readPos = static_cast<float>(state.writePos);
        }
    }

    // Advance write position
    state.writePos = (state.writePos + 1) % bufferSize;

    return output;
}

float PitchShifterProcessor::readFromBuffer(const std::vector<float>& buffer, float pos) const {
    int bufferSize = static_cast<int>(buffer.size());

    // Wrap position
    while (pos < 0.0f) pos += static_cast<float>(bufferSize);
    while (pos >= static_cast<float>(bufferSize)) pos -= static_cast<float>(bufferSize);

    // Linear interpolation
    int idx0 = static_cast<int>(pos);
    int idx1 = (idx0 + 1) % bufferSize;
    float frac = pos - static_cast<float>(idx0);

    return buffer[idx0] * (1.0f - frac) + buffer[idx1] * frac;
}

float PitchShifterProcessor::hannWindow(float phase) const {
    // Hann window: 0.5 * (1 - cos(2 * pi * phase))
    return 0.5f * (1.0f - std::cos(2.0f * juce::MathConstants<float>::pi * phase));
}

float PitchShifterProcessor::centsToRatio(float cents) const {
    // pitch_ratio = 2^(cents/1200)
    return std::pow(2.0f, cents / 1200.0f);
}

void PitchShifterProcessor::applyPreset(Preset preset) {
    // Van Halen preset settings based on documented vintage harmonizer settings
    // Sources: Audio equipment forums, VHLinks, Metropoulos Forum discussions

    switch (preset) {
        case Preset::Manual:
            // Don't change parameters in manual mode
            break;

        // === David Lee Roth Era ===

        case Preset::Eruption:
            // Classic VH1 sound - subtle dual detune
            pitchL_.store(4.0f);
            pitchR_.store(-4.0f);
            delayL_.store(3.0f);
            delayR_.store(6.0f);
            feedback_.store(0.0f);
            mix_.store(40.0f);
            break;

        case Preset::Unchained:
            // Fair Warning - punchy detune, H910 style
            pitchL_.store(4.0f);
            pitchR_.store(-4.0f);
            delayL_.store(3.0f);
            delayR_.store(6.0f);
            feedback_.store(0.0f);
            mix_.store(35.0f);
            break;

        case Preset::LittleGuitars:
            // Diver Down - delicate nylon-string shimmer
            pitchL_.store(5.0f);
            pitchR_.store(-5.0f);
            delayL_.store(5.0f);
            delayR_.store(10.0f);
            feedback_.store(0.0f);
            mix_.store(30.0f);
            break;

        case Preset::MeanStreet:
            // Fair Warning - heavier detuning for the intro
            pitchL_.store(7.0f);
            pitchR_.store(-7.0f);
            delayL_.store(8.0f);
            delayR_.store(16.0f);
            feedback_.store(0.1f);
            mix_.store(45.0f);
            break;

        case Preset::DropDeadLegs:
            // 1984 - sub-octave effect (one voice down an octave)
            pitchL_.store(-1200.0f);  // -12 semitones = octave down
            pitchR_.store(0.0f);
            delayL_.store(0.0f);
            delayR_.store(0.0f);
            feedback_.store(0.0f);
            mix_.store(25.0f);
            break;

        case Preset::Panama:
            // 1984 - classic EVH--IN-STYLE 949 detune
            pitchL_.store(7.0f);
            pitchR_.store(-9.0f);
            delayL_.store(8.0f);
            delayR_.store(20.0f);
            feedback_.store(0.0f);
            mix_.store(40.0f);
            break;

        case Preset::Cathedral:
            // Diver Down - shimmer/echo effect with feedback
            // Note: The actual song uses volume swells + echo,
            // but this gives similar ethereal quality
            pitchL_.store(12.0f);
            pitchR_.store(-12.0f);
            delayL_.store(80.0f);
            delayR_.store(100.0f);
            feedback_.store(0.4f);
            mix_.store(50.0f);
            break;

        case Preset::HotForTeacher:
            // 1984 - punchy detune for the main riff
            pitchL_.store(6.0f);
            pitchR_.store(-6.0f);
            delayL_.store(5.0f);
            delayR_.store(12.0f);
            feedback_.store(0.0f);
            mix_.store(35.0f);
            break;

        // === Sammy Hagar Era (Micropitch) ===

        case Preset::WhyCantThisBeLove:
            // 5150 - classic micropitch
            pitchL_.store(9.0f);
            pitchR_.store(-9.0f);
            delayL_.store(0.0f);
            delayR_.store(25.0f);
            feedback_.store(0.0f);
            mix_.store(45.0f);
            break;

        case Preset::Dreams:
            // 5150 - wide stereo micropitch
            pitchL_.store(9.0f);
            pitchR_.store(-9.0f);
            delayL_.store(250.0f > 100.0f ? 100.0f : 20.0f);  // Limited to our max
            delayR_.store(50.0f);
            feedback_.store(0.0f);
            mix_.store(50.0f);
            break;

        case Preset::FinishWhatYaStarted:
            // OU812 - clean, subtle micropitch
            pitchL_.store(6.0f);
            pitchR_.store(-6.0f);
            delayL_.store(0.0f);
            delayR_.store(15.0f);
            feedback_.store(0.0f);
            mix_.store(35.0f);
            break;

        case Preset::RightNow:
            // For Unlawful Carnal Knowledge - thick micropitch
            pitchL_.store(9.0f);
            pitchR_.store(-9.0f);
            delayL_.store(0.0f);
            delayR_.store(25.0f);
            feedback_.store(0.0f);
            mix_.store(50.0f);
            break;

        case Preset::CantStopLovinYou:
            // Balance - smooth ballad tone
            pitchL_.store(9.0f);
            pitchR_.store(-9.0f);
            delayL_.store(0.0f);
            delayR_.store(20.0f);
            feedback_.store(0.0f);
            mix_.store(40.0f);
            break;

        case Preset::HumansBeingOuttro:
            // Twister soundtrack - thick, dramatic detune
            pitchL_.store(12.0f);
            pitchR_.store(-12.0f);
            delayL_.store(0.0f);
            delayR_.store(30.0f);
            feedback_.store(0.15f);
            mix_.store(55.0f);
            break;

        default:
            break;
    }
}

PitchShifterProcessor::PresetInfo PitchShifterProcessor::getPresetInfo(Preset preset) {
    switch (preset) {
        case Preset::Manual:
            return {"Manual", "Custom", "-", "-", "User-defined pitch shift settings"};

        case Preset::Eruption:
            return {"Eruption", "Eruption", "Van Halen", "1978",
                    "Classic VH1 tone - subtle +/-4c detune, 3/6ms delay"};

        case Preset::Unchained:
            return {"Unchained", "Unchained", "Fair Warning", "1981",
                    "Punchy H910 detune - +/-4c with short delay"};

        case Preset::LittleGuitars:
            return {"Little Guitars", "Little Guitars", "Diver Down", "1982",
                    "Delicate shimmer - +/-5c for nylon-string sound"};

        case Preset::MeanStreet:
            return {"Mean Street", "Mean Street", "Fair Warning", "1981",
                    "Heavier detune - +/-7c for that intro tone"};

        case Preset::DropDeadLegs:
            return {"Drop Dead Legs", "Drop Dead Legs", "1984", "1984",
                    "Sub-octave effect - one voice down 12 semitones"};

        case Preset::Panama:
            return {"Panama", "Panama", "1984", "1984",
                    "Classic 949 style - +7c/-9c with staggered delay"};

        case Preset::Cathedral:
            return {"Cathedral", "Cathedral", "Diver Down", "1982",
                    "Shimmer/echo - +/-12c with feedback for ethereal quality"};

        case Preset::HotForTeacher:
            return {"Hot For Teacher", "Hot For Teacher", "1984", "1984",
                    "Punchy detune - +/-6c for the main riff"};

        case Preset::WhyCantThisBeLove:
            return {"Why Can't This Be Love", "Why Can't This Be Love", "5150", "1986",
                    "Micropitch - +/-9c, the Sammy era signature"};

        case Preset::Dreams:
            return {"Dreams", "Dreams", "5150", "1986",
                    "Wide stereo micropitch - +/-9c with long stereo delay"};

        case Preset::FinishWhatYaStarted:
            return {"Finish What Ya Started", "Finish What Ya Started", "OU812", "1988",
                    "Clean subtle micropitch - +/-6c for acoustic/clean tones"};

        case Preset::RightNow:
            return {"Right Now", "Right Now", "For Unlawful Carnal Knowledge", "1991",
                    "Thick micropitch - +/-9c, bold arena rock sound"};

        case Preset::CantStopLovinYou:
            return {"Can't Stop Lovin' You", "Can't Stop Lovin' You", "Balance", "1995",
                    "Smooth ballad tone - +/-9c micropitch"};

        case Preset::HumansBeingOuttro:
            return {"Humans Being", "Humans Being", "Twister Soundtrack", "1996",
                    "Thick dramatic detune - +/-12c with feedback"};

        default:
            return {"Unknown", "Unknown", "-", "-", ""};
    }
}

// Parameter setters
void PitchShifterProcessor::setPitchL(float cents) {
    cents = std::clamp(cents, -1200.0f, 1200.0f);  // +/- 1 octave
    pitchL_.store(cents);
    preset_.store(Preset::Manual);
}

void PitchShifterProcessor::setPitchR(float cents) {
    cents = std::clamp(cents, -1200.0f, 1200.0f);
    pitchR_.store(cents);
    preset_.store(Preset::Manual);
}

void PitchShifterProcessor::setDelayL(float ms) {
    ms = std::clamp(ms, 0.0f, 100.0f);
    delayL_.store(ms);
    preset_.store(Preset::Manual);
}

void PitchShifterProcessor::setDelayR(float ms) {
    ms = std::clamp(ms, 0.0f, 100.0f);
    delayR_.store(ms);
    preset_.store(Preset::Manual);
}

void PitchShifterProcessor::setFeedback(float amount) {
    amount = std::clamp(amount, 0.0f, 0.9f);
    feedback_.store(amount);
}

void PitchShifterProcessor::setMix(float percent) {
    percent = std::clamp(percent, 0.0f, 100.0f);
    mix_.store(percent);
}

void PitchShifterProcessor::setSpread(float percent) {
    percent = std::clamp(percent, 0.0f, 200.0f);
    spread_.store(percent);
}

void PitchShifterProcessor::setPreset(Preset preset) {
    preset_.store(preset);
    applyPreset(preset);
}

void PitchShifterProcessor::setBypass(bool bypass) {
    bypass_.store(bypass);
}

PitchShifterProcessor::Parameters PitchShifterProcessor::getParameters() const {
    Parameters params;
    params.pitchL = pitchL_.load();
    params.pitchR = pitchR_.load();
    params.delayL = delayL_.load();
    params.delayR = delayR_.load();
    params.feedback = feedback_.load();
    params.mix = mix_.load();
    params.spread = spread_.load();
    params.preset = preset_.load();
    params.bypass = bypass_.load();
    return params;
}

void PitchShifterProcessor::setParameters(const Parameters& params) {
    if (params.preset != Preset::Manual) {
        setPreset(params.preset);
    } else {
        pitchL_.store(params.pitchL);
        pitchR_.store(params.pitchR);
        delayL_.store(params.delayL);
        delayR_.store(params.delayR);
    }
    setFeedback(params.feedback);
    setMix(params.mix);
    setSpread(params.spread);
    setBypass(params.bypass);
}

PitchShifterProcessor::Metering PitchShifterProcessor::getMetering() const {
    Metering m;
    m.inputLevelL = inputLevelL_.load();
    m.inputLevelR = inputLevelR_.load();
    m.outputLevelL = outputLevelL_.load();
    m.outputLevelR = outputLevelR_.load();
    m.grainPhase = grainPhase_.load();
    return m;
}

void PitchShifterProcessor::resetPeaks() {
    inputLevelL_.store(-100.0f);
    inputLevelR_.store(-100.0f);
    outputLevelL_.store(-100.0f);
    outputLevelR_.store(-100.0f);
}

float PitchShifterProcessor::linearToDb(float linear) {
    if (linear <= 0.0f) return -100.0f;
    return 20.0f * std::log10(linear);
}

float PitchShifterProcessor::dbToLinear(float db) {
    return std::pow(10.0f, db / 20.0f);
}

float PitchShifterProcessor::calculatePeakLevel(const float* data, int numSamples) {
    float peak = 0.0f;
    for (int i = 0; i < numSamples; ++i) {
        float abs = std::abs(data[i]);
        if (abs > peak) peak = abs;
    }
    return linearToDb(peak);
}

} // namespace map2
