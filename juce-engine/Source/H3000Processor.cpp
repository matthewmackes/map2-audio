/**
 * MAP2 Audio Engine - Ultra-Harmonizer Processor Implementation
 *
 * Grain-based pitch shifting and complex modulation.
 */

#include "H3000Processor.h"
#include <cmath>
#include <algorithm>

namespace map2 {

// ========================================
// Algorithm Preset Values
// ========================================
const std::array<H3000Processor::PresetData, H3000Processor::NUM_ALGORITHMS> H3000Processor::ALGORITHM_PRESETS = {{
    // Micropitch - subtle detuning (signature harmonizer sound)
    {7.0f, -7.0f, 10.0f, 15.0f, 0.0f, 5.0f, 0.3f, 50.0f},
    // DualShift - independent pitch shifting
    {400.0f, -400.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.5f, 50.0f},
    // CrystalEchoes - shimmering delays
    {1200.0f, 700.0f, 250.0f, 375.0f, 35.0f, 20.0f, 0.8f, 40.0f},
    // StereoShift - wide stereo image
    {9.0f, -9.0f, 20.0f, 25.0f, 0.0f, 15.0f, 0.5f, 50.0f},
    // LayeredShift - stacked harmonies
    {500.0f, 700.0f, 30.0f, 45.0f, 20.0f, 10.0f, 0.7f, 45.0f},
    // SweptCombs - lush flanging
    {0.0f, 0.0f, 5.0f, 7.0f, 60.0f, 80.0f, 0.2f, 50.0f},
    // StutterShift - rhythmic glitches
    {1200.0f, -1200.0f, 100.0f, 150.0f, 50.0f, 100.0f, 4.0f, 60.0f},
    // ReversePitch - reverse effect
    {0.0f, 0.0f, 200.0f, 200.0f, 30.0f, 0.0f, 0.5f, 70.0f},
    // BandDelays - frequency-selective
    {0.0f, 0.0f, 150.0f, 225.0f, 40.0f, 25.0f, 0.6f, 45.0f},
    // PatchFactory - complex modulation
    {300.0f, -500.0f, 80.0f, 120.0f, 45.0f, 60.0f, 1.2f, 55.0f}
}};

// ========================================
// Algorithm Info
// ========================================
H3000Processor::AlgorithmInfo H3000Processor::getAlgorithmInfo(int index) {
    static const std::array<AlgorithmInfo, NUM_ALGORITHMS> infos = {{
        {"Micropitch", "MICRO", "Subtle detuning for a signature thick sound"},
        {"Dual Shift", "DUAL", "Independent L/R pitch shifting with full control"},
        {"Crystal Echoes", "CRYSTAL", "Shimmering pitch-shifted delays"},
        {"Stereo Shift", "STEREO", "Wide stereo image with micropitch"},
        {"Layered Shift", "LAYER", "Stacked pitch voices for harmonies"},
        {"Swept Combs", "COMBS", "Classic swept comb flanging and phasing"},
        {"Stutter Shift", "STUTTER", "Rhythmic pitch glitches and stutter"},
        {"Reverse Pitch", "REVERSE", "Reversed pitch-shifted texture"},
        {"Band Delays", "BAND", "Frequency-selective multi-tap delays"},
        {"Patch Factory", "PATCH", "Complex modulated pitch effects"}
    }};

    if (index >= 0 && index < NUM_ALGORITHMS) {
        return infos[index];
    }
    return infos[0];
}

// ========================================
// PitchShifter Implementation
// ========================================
void H3000Processor::PitchShifter::prepare(int maxSamples, int grainSize) {
    inputBuffer.resize(maxSamples * 2, 0.0f);
    inputWritePos = 0;
    currentPitch = 0.0f;
    targetPitch = 0.0f;
    grainCounter = 0;

    for (auto& grain : grains) {
        grain.buffer.resize(grainSize, 0.0f);
        grain.readPos = 0;
        grain.writePos = 0;
        grain.amplitude = 0.0f;
        grain.pitchRatio = 1.0f;
        grain.active = false;
    }
}

float H3000Processor::PitchShifter::process(float input, float pitchCents, float glideCoeff) {
    // Store input in circular buffer
    inputBuffer[inputWritePos] = input;
    inputWritePos = (inputWritePos + 1) % static_cast<int>(inputBuffer.size());

    // Smooth pitch transition
    targetPitch = pitchCents;
    currentPitch += (targetPitch - currentPitch) * glideCoeff;

    // Calculate pitch ratio
    float pitchRatio = std::pow(2.0f, currentPitch / 1200.0f);

    // Grain spawning
    grainCounter++;
    if (grainCounter >= GRAIN_SIZE / 2) {
        grainCounter = 0;

        // Find inactive grain
        for (auto& grain : grains) {
            if (!grain.active) {
                grain.active = true;
                grain.readPos = 0;
                grain.pitchRatio = pitchRatio;
                grain.amplitude = 0.0f;

                // Copy from input buffer to grain
                int startPos = (inputWritePos - GRAIN_SIZE + static_cast<int>(inputBuffer.size())) % static_cast<int>(inputBuffer.size());
                for (int i = 0; i < GRAIN_SIZE; ++i) {
                    int idx = (startPos + i) % static_cast<int>(inputBuffer.size());
                    grain.buffer[i] = inputBuffer[idx];
                }
                break;
            }
        }
    }

    // Process active grains
    float output = 0.0f;
    for (auto& grain : grains) {
        if (!grain.active) continue;

        // Hann window envelope
        float progress = static_cast<float>(grain.readPos) / GRAIN_SIZE;
        float envelope = 0.5f * (1.0f - std::cos(2.0f * juce::MathConstants<float>::pi * progress));

        // Read with interpolation
        float readPosF = static_cast<float>(grain.readPos) * grain.pitchRatio;
        int readPosI = static_cast<int>(readPosF);
        float frac = readPosF - readPosI;

        if (readPosI >= GRAIN_SIZE - 1) {
            grain.active = false;
            continue;
        }

        float sample = grain.buffer[readPosI] * (1.0f - frac) + grain.buffer[readPosI + 1] * frac;
        output += sample * envelope;

        grain.readPos++;
    }

    return output;
}

void H3000Processor::PitchShifter::reset() {
    std::fill(inputBuffer.begin(), inputBuffer.end(), 0.0f);
    inputWritePos = 0;
    currentPitch = 0.0f;
    targetPitch = 0.0f;
    for (auto& grain : grains) {
        grain.active = false;
        std::fill(grain.buffer.begin(), grain.buffer.end(), 0.0f);
    }
}

// ========================================
// DelayLine Implementation
// ========================================
void H3000Processor::DelayLine::prepare(int maxSamples) {
    buffer.resize(maxSamples, 0.0f);
    writePos = 0;
    currentDelay = 0.0f;
}

void H3000Processor::DelayLine::write(float sample) {
    buffer[writePos] = sample;
    writePos = (writePos + 1) % static_cast<int>(buffer.size());
}

float H3000Processor::DelayLine::read(float delaySamples) {
    int delayInt = static_cast<int>(delaySamples);
    int readPos = (writePos - delayInt + static_cast<int>(buffer.size())) % static_cast<int>(buffer.size());
    return buffer[readPos];
}

float H3000Processor::DelayLine::readInterpolated(float delaySamples) {
    int delayInt = static_cast<int>(delaySamples);
    float frac = delaySamples - delayInt;

    int readPos1 = (writePos - delayInt + static_cast<int>(buffer.size())) % static_cast<int>(buffer.size());
    int readPos2 = (readPos1 - 1 + static_cast<int>(buffer.size())) % static_cast<int>(buffer.size());

    return buffer[readPos1] * (1.0f - frac) + buffer[readPos2] * frac;
}

void H3000Processor::DelayLine::reset() {
    std::fill(buffer.begin(), buffer.end(), 0.0f);
    writePos = 0;
}

// ========================================
// Constructor
// ========================================
H3000Processor::H3000Processor() {
    randomGen_.seed(42);
}

// ========================================
// Prepare
// ========================================
void H3000Processor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;
    numChannels_ = numChannels;

    // Initialize pitch shifters
    for (auto& shifter : pitchShifters_) {
        shifter.prepare(MAX_DELAY_SAMPLES, GRAIN_SIZE);
    }

    // Initialize delay lines
    for (auto& delay : delayLines_) {
        delay.prepare(MAX_DELAY_SAMPLES);
    }

    // Initialize filters
    auto lowCutCoeffs = juce::dsp::IIR::Coefficients<float>::makeHighPass(sampleRate, params_.lowCut);
    auto highCutCoeffs = juce::dsp::IIR::Coefficients<float>::makeLowPass(sampleRate, params_.highCut);

    lowCutFilterL_.coefficients = lowCutCoeffs;
    lowCutFilterR_.coefficients = lowCutCoeffs;
    highCutFilterL_.coefficients = highCutCoeffs;
    highCutFilterR_.coefficients = highCutCoeffs;

    // Initialize LFO
    lfoIncrement_ = params_.modRate / static_cast<float>(sampleRate);

    // Initialize smoothed values
    smoothedMix_.reset(sampleRate, 0.02);
    smoothedPitchL_.reset(sampleRate, 0.05);
    smoothedPitchR_.reset(sampleRate, 0.05);

    // Initialize comb buffers for SweptCombs
    for (auto& comb : combBuffers_) {
        comb.resize(static_cast<int>(sampleRate * 0.05), 0.0f);  // 50ms max
    }

    // Initialize reverse buffer
    int reverseBufSize = static_cast<int>(sampleRate * 0.5);  // 500ms
    reverseBufferL_.resize(reverseBufSize, 0.0f);
    reverseBufferR_.resize(reverseBufSize, 0.0f);

    reset();
}

// ========================================
// Reset
// ========================================
void H3000Processor::reset() {
    for (auto& shifter : pitchShifters_) {
        shifter.reset();
    }
    for (auto& delay : delayLines_) {
        delay.reset();
    }
    for (auto& comb : combBuffers_) {
        std::fill(comb.begin(), comb.end(), 0.0f);
    }
    std::fill(reverseBufferL_.begin(), reverseBufferL_.end(), 0.0f);
    std::fill(reverseBufferR_.begin(), reverseBufferR_.end(), 0.0f);

    feedbackSamples_ = {0.0f, 0.0f};
    lfoPhase_ = 0.0f;

    lowCutFilterL_.reset();
    lowCutFilterR_.reset();
    highCutFilterL_.reset();
    highCutFilterR_.reset();
}

// ========================================
// Set Algorithm
// ========================================
void H3000Processor::setAlgorithm(Algorithm algo) {
    setAlgorithm(static_cast<int>(algo));
}

void H3000Processor::setAlgorithm(int index) {
    if (index < 0 || index >= NUM_ALGORITHMS) return;

    params_.algorithm = index;

    // Load preset values for the algorithm
    const auto& preset = ALGORITHM_PRESETS[index];
    params_.pitchL = preset.pitchL;
    params_.pitchR = preset.pitchR;
    params_.delayL = preset.delayL;
    params_.delayR = preset.delayR;
    params_.feedback = preset.feedback;
    params_.modDepth = preset.modDepth;
    params_.modRate = preset.modRate;
    params_.mix = preset.mix;
}

// ========================================
// Set Parameters
// ========================================
void H3000Processor::setParameters(const Parameters& p) {
    params_.algorithm = p.algorithm;
    params_.pitchL = p.pitchL;
    params_.pitchR = p.pitchR;
    params_.delayL = p.delayL;
    params_.delayR = p.delayR;
    params_.feedback = p.feedback;
    params_.crossFeedback = p.crossFeedback;
    params_.modDepth = p.modDepth;
    params_.modRate = p.modRate;
    params_.lowCut = p.lowCut;
    params_.highCut = p.highCut;
    params_.mix = p.mix;
    params_.levelL = p.levelL;
    params_.levelR = p.levelR;
    params_.bypass = p.bypass;
    params_.glide = p.glide;
}

// ========================================
// Update Filters
// ========================================
void H3000Processor::updateFilters() {
    auto lowCutCoeffs = juce::dsp::IIR::Coefficients<float>::makeHighPass(sampleRate_, params_.lowCut);
    auto highCutCoeffs = juce::dsp::IIR::Coefficients<float>::makeLowPass(sampleRate_, params_.highCut);

    lowCutFilterL_.coefficients = lowCutCoeffs;
    lowCutFilterR_.coefficients = lowCutCoeffs;
    highCutFilterL_.coefficients = highCutCoeffs;
    highCutFilterR_.coefficients = highCutCoeffs;
}

// ========================================
// LFO
// ========================================
float H3000Processor::getLfoSample() {
    float modRate = params_.modRate;
    lfoIncrement_ = modRate / static_cast<float>(sampleRate_);

    lfoPhase_ += lfoIncrement_;
    if (lfoPhase_ >= 1.0f) {
        lfoPhase_ -= 1.0f;
        // Update random target for S&H
        std::uniform_real_distribution<float> dist(-1.0f, 1.0f);
        randomTarget_ = dist(randomGen_);
    }

    // Use sine waveform by default
    float lfoValue = std::sin(lfoPhase_ * juce::MathConstants<float>::twoPi);

    metering_.modPhase = lfoPhase_;
    return lfoValue;
}

// ========================================
// Process
// ========================================
void H3000Processor::process(juce::AudioBuffer<float>& buffer) {
    if (buffer.getNumChannels() < 2) return;

    bool bypassed = params_.bypass;

    if (bypassed) {
        return;
    }

    updateFilters();
    processAlgorithm(buffer);
    updateMetering(buffer);
}

// ========================================
// Process Algorithm Router
// ========================================
void H3000Processor::processAlgorithm(juce::AudioBuffer<float>& buffer) {
    Algorithm algo = static_cast<Algorithm>(params_.algorithm);

    switch (algo) {
        case Algorithm::Micropitch:    processMicropitch(buffer); break;
        case Algorithm::DualShift:     processDualShift(buffer); break;
        case Algorithm::CrystalEchoes: processCrystalEchoes(buffer); break;
        case Algorithm::StereoShift:   processStereoShift(buffer); break;
        case Algorithm::LayeredShift:  processLayeredShift(buffer); break;
        case Algorithm::SweptCombs:    processSweptCombs(buffer); break;
        case Algorithm::StutterShift:  processStutterShift(buffer); break;
        case Algorithm::ReversePitch:  processReversePitch(buffer); break;
        case Algorithm::BandDelays:    processBandDelays(buffer); break;
        case Algorithm::PatchFactory:  processPatchFactory(buffer); break;
        default:                       processMicropitch(buffer); break;
    }
}

// ========================================
// Micropitch - Signature detuning sound
// ========================================
void H3000Processor::processMicropitch(juce::AudioBuffer<float>& buffer) {
    const int numSamples = buffer.getNumSamples();
    float* leftChannel = buffer.getWritePointer(0);
    float* rightChannel = buffer.getWritePointer(1);

    float pitchL = params_.pitchL + 0.0f;
    float pitchR = params_.pitchR + 0.0f;
    float delayL = params_.delayL * sampleRate_ / 1000.0f;
    float delayR = params_.delayR * sampleRate_ / 1000.0f;
    float mix = params_.mix / 100.0f;
    float modDepth = params_.modDepth;

    float glideTime = params_.glide;
    float glideCoeff = 1.0f / (glideTime * sampleRate_ / 1000.0f);
    if (!true) glideCoeff = 1.0f;

    smoothedMix_.setTargetValue(mix);

    for (int i = 0; i < numSamples; ++i) {
        float lfo = getLfoSample() * modDepth / 100.0f;
        float currentMix = smoothedMix_.getNextValue();

        float dryL = leftChannel[i];
        float dryR = rightChannel[i];

        // Add modulation to pitch
        float modPitchL = pitchL + lfo * 10.0f;
        float modPitchR = pitchR - lfo * 10.0f;  // Opposite modulation for width

        // Pitch shift
        float shiftedL = pitchShifters_[0].process(dryL, modPitchL, glideCoeff);
        float shiftedR = pitchShifters_[1].process(dryR, modPitchR, glideCoeff);

        // Delay
        delayLines_[0].write(shiftedL);
        delayLines_[1].write(shiftedR);

        float delayedL = delayLines_[0].readInterpolated(delayL);
        float delayedR = delayLines_[1].readInterpolated(delayR);

        // Filter
        float filteredL = highCutFilterL_.processSample(lowCutFilterL_.processSample(delayedL));
        float filteredR = highCutFilterR_.processSample(lowCutFilterR_.processSample(delayedR));

        // Mix
        leftChannel[i] = dryL * (1.0f - currentMix) + filteredL * currentMix;
        rightChannel[i] = dryR * (1.0f - currentMix) + filteredR * currentMix;
    }

    metering_.pitchLActual =(pitchL);
    metering_.pitchRActual =(pitchR);
}

// ========================================
// Dual Shift - Independent L/R pitch
// ========================================
void H3000Processor::processDualShift(juce::AudioBuffer<float>& buffer) {
    const int numSamples = buffer.getNumSamples();
    float* leftChannel = buffer.getWritePointer(0);
    float* rightChannel = buffer.getWritePointer(1);

    float pitchL = params_.pitchL + 0.0f;
    float pitchR = params_.pitchR + 0.0f;
    float feedbackL = params_.feedback / 100.0f;
    float feedbackR = params_.feedback / 100.0f;
    float mix = params_.mix / 100.0f;

    float glideCoeff = 1.0f / (params_.glide * sampleRate_ / 1000.0f);

    for (int i = 0; i < numSamples; ++i) {
        float dryL = leftChannel[i];
        float dryR = rightChannel[i];

        // Add feedback
        float inputL = dryL + feedbackSamples_[0] * feedbackL;
        float inputR = dryR + feedbackSamples_[1] * feedbackR;

        // Pitch shift
        float shiftedL = pitchShifters_[0].process(inputL, pitchL, glideCoeff);
        float shiftedR = pitchShifters_[1].process(inputR, pitchR, glideCoeff);

        // Store feedback
        feedbackSamples_[0] = shiftedL;
        feedbackSamples_[1] = shiftedR;

        // Filter
        float filteredL = highCutFilterL_.processSample(lowCutFilterL_.processSample(shiftedL));
        float filteredR = highCutFilterR_.processSample(lowCutFilterR_.processSample(shiftedR));

        // Mix
        leftChannel[i] = dryL * (1.0f - mix) + filteredL * mix;
        rightChannel[i] = dryR * (1.0f - mix) + filteredR * mix;
    }

    metering_.pitchLActual =(pitchL);
    metering_.pitchRActual =(pitchR);
}

// ========================================
// Crystal Echoes - Shimmering delays
// ========================================
void H3000Processor::processCrystalEchoes(juce::AudioBuffer<float>& buffer) {
    const int numSamples = buffer.getNumSamples();
    float* leftChannel = buffer.getWritePointer(0);
    float* rightChannel = buffer.getWritePointer(1);

    float pitchL = params_.pitchL;
    float pitchR = params_.pitchR;
    float delayL = params_.delayL * sampleRate_ / 1000.0f;
    float delayR = params_.delayR * sampleRate_ / 1000.0f;
    float feedbackL = params_.feedback / 100.0f;
    float feedbackR = params_.feedback / 100.0f;
    float crossFeedback = params_.crossFeedback / 100.0f;
    float mix = params_.mix / 100.0f;
    float modDepth = params_.modDepth;

    float glideCoeff = 0.001f;

    for (int i = 0; i < numSamples; ++i) {
        float lfo = getLfoSample() * modDepth / 100.0f;

        float dryL = leftChannel[i];
        float dryR = rightChannel[i];

        // Read from delay with modulation
        float modDelayL = delayL * (1.0f + lfo * 0.1f);
        float modDelayR = delayR * (1.0f - lfo * 0.1f);

        float delayedL = delayLines_[0].readInterpolated(modDelayL);
        float delayedR = delayLines_[1].readInterpolated(modDelayR);

        // Pitch shift the delayed signal
        float shiftedL = pitchShifters_[0].process(delayedL, pitchL, glideCoeff);
        float shiftedR = pitchShifters_[1].process(delayedR, pitchR, glideCoeff);

        // Cross feedback
        float feedL = dryL + shiftedL * feedbackL + shiftedR * crossFeedback;
        float feedR = dryR + shiftedR * feedbackR + shiftedL * crossFeedback;

        // Write to delay
        delayLines_[0].write(feedL);
        delayLines_[1].write(feedR);

        // Filter
        float filteredL = highCutFilterL_.processSample(shiftedL);
        float filteredR = highCutFilterR_.processSample(shiftedR);

        // Mix
        leftChannel[i] = dryL * (1.0f - mix) + filteredL * mix;
        rightChannel[i] = dryR * (1.0f - mix) + filteredR * mix;
    }
}

// ========================================
// Stereo Shift - Wide stereo micropitch
// ========================================
void H3000Processor::processStereoShift(juce::AudioBuffer<float>& buffer) {
    // Similar to Micropitch but with more extreme stereo spread
    const int numSamples = buffer.getNumSamples();
    float* leftChannel = buffer.getWritePointer(0);
    float* rightChannel = buffer.getWritePointer(1);

    float pitchL = params_.pitchL + 0.0f;
    float pitchR = params_.pitchR + 0.0f;
    float delayL = params_.delayL * sampleRate_ / 1000.0f;
    float delayR = params_.delayR * sampleRate_ / 1000.0f;
    float modDepth = params_.modDepth;
    float mix = params_.mix / 100.0f;

    float glideCoeff = 0.01f;

    for (int i = 0; i < numSamples; ++i) {
        float lfo = getLfoSample() * modDepth / 100.0f;

        float dryL = leftChannel[i];
        float dryR = rightChannel[i];

        // Cross-feed mono input for wider stereo
        float monoIn = (dryL + dryR) * 0.5f;

        // Pitch shift with opposite directions
        float shiftedL = pitchShifters_[0].process(monoIn, pitchL + lfo * 5.0f, glideCoeff);
        float shiftedR = pitchShifters_[1].process(monoIn, pitchR - lfo * 5.0f, glideCoeff);

        // Delay for haas effect
        delayLines_[0].write(shiftedL);
        delayLines_[1].write(shiftedR);

        float delayedL = delayLines_[0].readInterpolated(delayL);
        float delayedR = delayLines_[1].readInterpolated(delayR);

        // Mix
        leftChannel[i] = dryL * (1.0f - mix) + delayedL * mix;
        rightChannel[i] = dryR * (1.0f - mix) + delayedR * mix;
    }
}

// ========================================
// Layered Shift - Stacked harmonies
// ========================================
void H3000Processor::processLayeredShift(juce::AudioBuffer<float>& buffer) {
    const int numSamples = buffer.getNumSamples();
    float* leftChannel = buffer.getWritePointer(0);
    float* rightChannel = buffer.getWritePointer(1);

    float pitchL = params_.pitchL;
    float pitchR = params_.pitchR;
    float feedbackL = params_.feedback / 100.0f;
    float feedbackR = params_.feedback / 100.0f;
    float mix = params_.mix / 100.0f;

    float glideCoeff = 0.005f;

    for (int i = 0; i < numSamples; ++i) {
        float dryL = leftChannel[i];
        float dryR = rightChannel[i];

        // Multiple layers of pitch shifting
        float layer1L = pitchShifters_[0].process(dryL + feedbackSamples_[0] * feedbackL, pitchL, glideCoeff);
        float layer1R = pitchShifters_[1].process(dryR + feedbackSamples_[1] * feedbackR, pitchR, glideCoeff);

        feedbackSamples_[0] = layer1L * 0.5f;
        feedbackSamples_[1] = layer1R * 0.5f;

        // Filter
        float filteredL = highCutFilterL_.processSample(layer1L);
        float filteredR = highCutFilterR_.processSample(layer1R);

        // Mix with dry
        leftChannel[i] = dryL * (1.0f - mix) + filteredL * mix;
        rightChannel[i] = dryR * (1.0f - mix) + filteredR * mix;
    }
}

// ========================================
// Swept Combs - Classic swept comb flanging
// ========================================
void H3000Processor::processSweptCombs(juce::AudioBuffer<float>& buffer) {
    const int numSamples = buffer.getNumSamples();
    float* leftChannel = buffer.getWritePointer(0);
    float* rightChannel = buffer.getWritePointer(1);

    float delayL = params_.delayL * sampleRate_ / 1000.0f;
    float delayR = params_.delayR * sampleRate_ / 1000.0f;
    float feedbackL = params_.feedback / 100.0f;
    float feedbackR = params_.feedback / 100.0f;
    float modDepth = params_.modDepth / 100.0f;
    float mix = params_.mix / 100.0f;

    for (int i = 0; i < numSamples; ++i) {
        float lfo = getLfoSample();

        float dryL = leftChannel[i];
        float dryR = rightChannel[i];

        // Modulated comb delay times
        float combDelayL = delayL * (1.0f + lfo * modDepth);
        float combDelayR = delayR * (1.0f - lfo * modDepth);

        combDelayL = juce::jlimit(1.0f, static_cast<float>(combBuffers_[0].size() - 1), combDelayL);
        combDelayR = juce::jlimit(1.0f, static_cast<float>(combBuffers_[1].size() - 1), combDelayR);

        // Read from comb buffers
        int readPosL = (combWritePos_[0] - static_cast<int>(combDelayL) + static_cast<int>(combBuffers_[0].size())) % static_cast<int>(combBuffers_[0].size());
        int readPosR = (combWritePos_[1] - static_cast<int>(combDelayR) + static_cast<int>(combBuffers_[1].size())) % static_cast<int>(combBuffers_[1].size());

        float combOutL = combBuffers_[0][readPosL];
        float combOutR = combBuffers_[1][readPosR];

        // Write to comb with feedback
        combBuffers_[0][combWritePos_[0]] = dryL + combOutL * feedbackL;
        combBuffers_[1][combWritePos_[1]] = dryR + combOutR * feedbackR;

        combWritePos_[0] = (combWritePos_[0] + 1) % static_cast<int>(combBuffers_[0].size());
        combWritePos_[1] = (combWritePos_[1] + 1) % static_cast<int>(combBuffers_[1].size());

        // Mix
        leftChannel[i] = dryL * (1.0f - mix) + combOutL * mix;
        rightChannel[i] = dryR * (1.0f - mix) + combOutR * mix;
    }
}

// ========================================
// Stutter Shift - Rhythmic glitches
// ========================================
void H3000Processor::processStutterShift(juce::AudioBuffer<float>& buffer) {
    const int numSamples = buffer.getNumSamples();
    float* leftChannel = buffer.getWritePointer(0);
    float* rightChannel = buffer.getWritePointer(1);

    float pitchL = params_.pitchL;
    float pitchR = params_.pitchR;
    float modDepth = params_.modDepth / 100.0f;
    float mix = params_.mix / 100.0f;

    float glideCoeff = 0.1f;  // Fast glide for stutter effect

    for (int i = 0; i < numSamples; ++i) {
        float lfo = getLfoSample();

        // Use LFO as gate/stutter trigger
        float gate = lfo > 0.0f ? 1.0f : 0.0f;
        gate = gate * modDepth + (1.0f - modDepth);

        float dryL = leftChannel[i];
        float dryR = rightChannel[i];

        // Pitch shift with stutter
        float currentPitchL = pitchL * gate;
        float currentPitchR = pitchR * gate;

        float shiftedL = pitchShifters_[0].process(dryL, currentPitchL, glideCoeff);
        float shiftedR = pitchShifters_[1].process(dryR, currentPitchR, glideCoeff);

        // Apply gate to output
        shiftedL *= gate;
        shiftedR *= gate;

        // Mix
        leftChannel[i] = dryL * (1.0f - mix) + shiftedL * mix;
        rightChannel[i] = dryR * (1.0f - mix) + shiftedR * mix;
    }
}

// ========================================
// Reverse Pitch - Reversed texture
// ========================================
void H3000Processor::processReversePitch(juce::AudioBuffer<float>& buffer) {
    const int numSamples = buffer.getNumSamples();
    float* leftChannel = buffer.getWritePointer(0);
    float* rightChannel = buffer.getWritePointer(1);

    float mix = params_.mix / 100.0f;
    int bufSize = static_cast<int>(reverseBufferL_.size());

    for (int i = 0; i < numSamples; ++i) {
        float dryL = leftChannel[i];
        float dryR = rightChannel[i];

        // Write to reverse buffer
        reverseBufferL_[reverseWritePos_] = dryL;
        reverseBufferR_[reverseWritePos_] = dryR;

        // Read backwards
        float reversedL = reverseBufferL_[reverseReadPos_];
        float reversedR = reverseBufferR_[reverseReadPos_];

        reverseWritePos_ = (reverseWritePos_ + 1) % bufSize;
        reverseReadPos_ = (reverseReadPos_ - 1 + bufSize) % bufSize;

        // Cross-fade at buffer boundaries
        float fadePos = static_cast<float>(reverseWritePos_) / bufSize;
        float crossfade = std::sin(fadePos * juce::MathConstants<float>::pi);

        float wetL = reversedL * crossfade;
        float wetR = reversedR * crossfade;

        // Mix
        leftChannel[i] = dryL * (1.0f - mix) + wetL * mix;
        rightChannel[i] = dryR * (1.0f - mix) + wetR * mix;
    }
}

// ========================================
// Band Delays - Frequency-selective delays
// ========================================
void H3000Processor::processBandDelays(juce::AudioBuffer<float>& buffer) {
    // Use filters + delays for frequency-selective processing
    const int numSamples = buffer.getNumSamples();
    float* leftChannel = buffer.getWritePointer(0);
    float* rightChannel = buffer.getWritePointer(1);

    float delayL = params_.delayL * sampleRate_ / 1000.0f;
    float delayR = params_.delayR * sampleRate_ / 1000.0f;
    float feedbackL = params_.feedback / 100.0f;
    float feedbackR = params_.feedback / 100.0f;
    float mix = params_.mix / 100.0f;
    float modDepth = params_.modDepth / 100.0f;

    for (int i = 0; i < numSamples; ++i) {
        float lfo = getLfoSample();

        float dryL = leftChannel[i];
        float dryR = rightChannel[i];

        // Filter input
        float filteredL = highCutFilterL_.processSample(lowCutFilterL_.processSample(dryL));
        float filteredR = highCutFilterR_.processSample(lowCutFilterR_.processSample(dryR));

        // Modulated delay
        float modDelayL = delayL * (1.0f + lfo * modDepth * 0.2f);
        float modDelayR = delayR * (1.0f - lfo * modDepth * 0.2f);

        // Read and write delays
        float delayOutL = delayLines_[0].readInterpolated(modDelayL);
        float delayOutR = delayLines_[1].readInterpolated(modDelayR);

        delayLines_[0].write(filteredL + delayOutL * feedbackL);
        delayLines_[1].write(filteredR + delayOutR * feedbackR);

        // Mix
        leftChannel[i] = dryL * (1.0f - mix) + delayOutL * mix;
        rightChannel[i] = dryR * (1.0f - mix) + delayOutR * mix;
    }
}

// ========================================
// Patch Factory - Complex modulation
// ========================================
void H3000Processor::processPatchFactory(juce::AudioBuffer<float>& buffer) {
    const int numSamples = buffer.getNumSamples();
    float* leftChannel = buffer.getWritePointer(0);
    float* rightChannel = buffer.getWritePointer(1);

    float pitchL = params_.pitchL;
    float pitchR = params_.pitchR;
    float delayL = params_.delayL * sampleRate_ / 1000.0f;
    float delayR = params_.delayR * sampleRate_ / 1000.0f;
    float feedbackL = params_.feedback / 100.0f;
    float feedbackR = params_.feedback / 100.0f;
    float modDepth = params_.modDepth;
    float mix = params_.mix / 100.0f;

    float glideCoeff = 0.02f;

    for (int i = 0; i < numSamples; ++i) {
        float lfo = getLfoSample();

        float dryL = leftChannel[i];
        float dryR = rightChannel[i];

        // Complex modulation: LFO affects pitch, delay, and feedback
        float modPitchL = pitchL + lfo * modDepth;
        float modPitchR = pitchR - lfo * modDepth;
        float modDelayL = delayL * (1.0f + lfo * 0.3f);
        float modDelayR = delayR * (1.0f - lfo * 0.3f);
        float modFbL = feedbackL * (0.5f + 0.5f * (lfo + 1.0f));
        float modFbR = feedbackR * (0.5f + 0.5f * (-lfo + 1.0f));

        // Pitch shift
        float shiftedL = pitchShifters_[0].process(dryL + feedbackSamples_[0] * modFbL, modPitchL, glideCoeff);
        float shiftedR = pitchShifters_[1].process(dryR + feedbackSamples_[1] * modFbR, modPitchR, glideCoeff);

        // Delay
        delayLines_[0].write(shiftedL);
        delayLines_[1].write(shiftedR);

        float delayedL = delayLines_[0].readInterpolated(modDelayL);
        float delayedR = delayLines_[1].readInterpolated(modDelayR);

        // Store for feedback
        feedbackSamples_[0] = delayedL;
        feedbackSamples_[1] = delayedR;

        // Filter
        float filteredL = highCutFilterL_.processSample(delayedL);
        float filteredR = highCutFilterR_.processSample(delayedR);

        // Mix
        leftChannel[i] = dryL * (1.0f - mix) + filteredL * mix;
        rightChannel[i] = dryR * (1.0f - mix) + filteredR * mix;
    }
}

// ========================================
// Update Metering
// ========================================
void H3000Processor::updateMetering(const juce::AudioBuffer<float>& buffer) {
    if (buffer.getNumChannels() < 2) return;

    const float* left = buffer.getReadPointer(0);
    const float* right = buffer.getReadPointer(1);
    const int numSamples = buffer.getNumSamples();

    float maxL = 0.0f, maxR = 0.0f;
    for (int i = 0; i < numSamples; ++i) {
        maxL = std::max(maxL, std::abs(left[i]));
        maxR = std::max(maxR, std::abs(right[i]));
    }

    auto toDb = [](float linear) {
        return linear > 0.0f ? 20.0f * std::log10(linear) : -100.0f;
    };

    // Simple smoothing for output levels
    float currentL = metering_.outputLevelL;
    float currentR = metering_.outputLevelR;
    float newL = toDb(maxL);
    float newR = toDb(maxR);

    metering_.outputLevelL = currentL + (newL - currentL) * 0.3f;
    metering_.outputLevelR = currentR + (newR - currentR) * 0.3f;
}

} // namespace map2
