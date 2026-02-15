/**
 * MAP2 Audio Engine - Lexi Love Reverb Processor Implementation
 *
 * Algorithmic reverb processor with signature "depth and sparkle" sound quality.
 *
 * Key characteristics captured:
 * - Rich, lush, warm reverb character
 * - Prominent "spitty" early reflections (especially Tiled Room)
 * - Multi-band decay (bass sustains longer, treble rolls off)
 * - Modulation for the signature "sparkle"
 * - 3D depth from the Lexichip algorithm
 */

#include "LexiLoveProcessor.h"
#include <cmath>
#include <algorithm>

namespace map2 {

// ========================================
// Early Reflection Patterns Per Algorithm
// ========================================
// These patterns define the distinctive character of each algorithm
// Times in ms, gains normalized, pans from -1 (left) to +1 (right)

const std::array<LexiLoveProcessor::AlgorithmEarlyPattern, 9> LexiLoveProcessor::EARLY_PATTERNS = {{
    // 0. Tiled Room V2.0 - Dense, "spitty" character with tight spacing
    {
        {{3.2f, 5.1f, 7.3f, 9.8f, 12.4f, 15.1f, 18.3f, 21.7f, 25.4f, 29.8f, 34.2f, 39.1f}},
        {{0.85f, 0.78f, 0.72f, 0.68f, 0.62f, 0.55f, 0.48f, 0.42f, 0.35f, 0.28f, 0.22f, 0.15f}},
        {{-0.3f, 0.4f, -0.5f, 0.6f, -0.4f, 0.3f, -0.6f, 0.5f, -0.2f, 0.4f, -0.3f, 0.2f}}
    },
    // 1. Rich Plate - Smooth, warm character
    {
        {{5.0f, 11.2f, 18.5f, 26.3f, 35.1f, 44.8f, 55.2f, 66.7f, 79.3f, 92.8f, 107.5f, 123.4f}},
        {{0.70f, 0.65f, 0.60f, 0.55f, 0.50f, 0.45f, 0.40f, 0.35f, 0.30f, 0.25f, 0.20f, 0.15f}},
        {{-0.2f, 0.2f, -0.3f, 0.3f, -0.2f, 0.2f, -0.4f, 0.4f, -0.3f, 0.3f, -0.2f, 0.2f}}
    },
    // 2. Concert Hall - Spacious with modulation
    {
        {{12.5f, 25.3f, 38.7f, 52.8f, 67.4f, 83.1f, 99.6f, 117.2f, 135.8f, 155.4f, 176.2f, 198.3f}},
        {{0.60f, 0.55f, 0.50f, 0.46f, 0.42f, 0.38f, 0.34f, 0.30f, 0.26f, 0.22f, 0.18f, 0.14f}},
        {{-0.5f, 0.6f, -0.4f, 0.5f, -0.6f, 0.4f, -0.5f, 0.5f, -0.4f, 0.6f, -0.3f, 0.3f}}
    },
    // 3. Small Room - Tight, quick reflections
    {
        {{2.1f, 4.3f, 6.8f, 9.5f, 12.4f, 15.6f, 19.1f, 22.8f, 26.8f, 31.2f, 35.9f, 40.8f}},
        {{0.80f, 0.74f, 0.68f, 0.62f, 0.56f, 0.50f, 0.44f, 0.38f, 0.32f, 0.26f, 0.20f, 0.14f}},
        {{-0.4f, 0.3f, -0.3f, 0.4f, -0.2f, 0.2f, -0.5f, 0.5f, -0.3f, 0.3f, -0.4f, 0.4f}}
    },
    // 4. Rich Chamber - Prominent early reflections
    {
        {{4.5f, 9.2f, 14.6f, 20.8f, 27.5f, 35.1f, 43.4f, 52.6f, 62.7f, 73.8f, 85.9f, 99.2f}},
        {{0.88f, 0.82f, 0.76f, 0.70f, 0.64f, 0.58f, 0.52f, 0.46f, 0.40f, 0.34f, 0.28f, 0.22f}},
        {{-0.3f, 0.4f, -0.4f, 0.3f, -0.5f, 0.5f, -0.3f, 0.4f, -0.4f, 0.3f, -0.2f, 0.2f}}
    },
    // 5. Gymnasium - Large sparse reflections
    {
        {{18.3f, 38.7f, 61.2f, 85.8f, 112.5f, 141.3f, 172.4f, 205.6f, 241.2f, 279.1f, 319.5f, 362.3f}},
        {{0.55f, 0.50f, 0.45f, 0.40f, 0.36f, 0.32f, 0.28f, 0.24f, 0.20f, 0.16f, 0.12f, 0.08f}},
        {{-0.7f, 0.8f, -0.6f, 0.7f, -0.8f, 0.6f, -0.7f, 0.7f, -0.5f, 0.6f, -0.4f, 0.5f}}
    },
    // 6. Long Hall - Extended spacing
    {
        {{15.2f, 32.8f, 52.6f, 74.5f, 98.7f, 125.2f, 154.1f, 185.4f, 219.2f, 255.6f, 294.7f, 336.5f}},
        {{0.58f, 0.53f, 0.48f, 0.43f, 0.39f, 0.35f, 0.31f, 0.27f, 0.23f, 0.19f, 0.15f, 0.11f}},
        {{-0.6f, 0.5f, -0.5f, 0.6f, -0.4f, 0.5f, -0.6f, 0.4f, -0.5f, 0.5f, -0.3f, 0.4f}}
    },
    // 7. Gated Plate - Ultra-dense for drums
    {
        {{1.2f, 2.5f, 3.9f, 5.4f, 7.1f, 8.9f, 10.8f, 12.9f, 15.1f, 17.5f, 20.0f, 22.7f}},
        {{0.95f, 0.90f, 0.85f, 0.80f, 0.75f, 0.70f, 0.65f, 0.60f, 0.55f, 0.50f, 0.45f, 0.40f}},
        {{-0.2f, 0.2f, -0.3f, 0.3f, -0.2f, 0.2f, -0.4f, 0.4f, -0.2f, 0.2f, -0.3f, 0.3f}}
    },
    // 8. Infinite - Sparse, evolving
    {
        {{25.4f, 54.8f, 88.6f, 127.2f, 170.5f, 218.6f, 271.8f, 330.2f, 394.1f, 463.7f, 539.2f, 620.8f}},
        {{0.45f, 0.42f, 0.39f, 0.36f, 0.33f, 0.30f, 0.27f, 0.24f, 0.21f, 0.18f, 0.15f, 0.12f}},
        {{-0.4f, 0.5f, -0.6f, 0.4f, -0.5f, 0.6f, -0.4f, 0.5f, -0.6f, 0.4f, -0.5f, 0.5f}}
    }
}};

// ========================================
// Factory Presets (Based on PCM 70 Research)
// ========================================
const std::array<LexiLoveProcessor::PresetData, 9> LexiLoveProcessor::FACTORY_PRESETS = {{
    // 0. Tiled Room V2.0 - The legendary preset
    {12.0f, 1.2f, 95.0f, 0.9f, 0.7f, 1200.0f, 8000.0f, 85.0f, 75.0f, 8.0f, 0.5f, 10000.0f, 80.0f},
    // 1. Rich Plate - Warm vocals
    {35.0f, 2.8f, 80.0f, 1.1f, 0.65f, 800.0f, 7000.0f, 55.0f, 40.0f, 20.0f, 0.9f, 9000.0f, 60.0f},
    // 2. Concert Hall - Classic 80s with sparkle
    {65.0f, 3.5f, 75.0f, 1.15f, 0.75f, 600.0f, 9000.0f, 60.0f, 55.0f, 35.0f, 1.2f, 11000.0f, 50.0f},
    // 3. Small Room - Tight space
    {8.0f, 0.8f, 70.0f, 1.0f, 0.85f, 1000.0f, 10000.0f, 75.0f, 85.0f, 5.0f, 0.3f, 12000.0f, 100.0f},
    // 4. Rich Chamber - Warm thick chamber
    {25.0f, 2.2f, 90.0f, 1.2f, 0.7f, 700.0f, 6500.0f, 80.0f, 65.0f, 12.0f, 0.6f, 8000.0f, 70.0f},
    // 5. Gymnasium - Large space
    {90.0f, 5.5f, 65.0f, 1.3f, 0.5f, 500.0f, 5000.0f, 70.0f, 30.0f, 25.0f, 0.4f, 6000.0f, 40.0f},
    // 6. Long Hall - Extended decay
    {85.0f, 8.0f, 78.0f, 1.1f, 0.6f, 550.0f, 7500.0f, 50.0f, 45.0f, 30.0f, 0.7f, 8500.0f, 45.0f},
    // 7. Gated Plate - Drums/drama
    {5.0f, 0.4f, 95.0f, 0.8f, 1.0f, 1500.0f, 12000.0f, 90.0f, 95.0f, 3.0f, 2.0f, 14000.0f, 100.0f},
    // 8. Infinite - Atmospheric
    {142.0f, 30.0f, 85.0f, 1.0f, 0.95f, 400.0f, 10000.0f, 35.0f, 50.0f, 40.0f, 0.2f, 13000.0f, 30.0f}
}};

// ========================================
// AllPassFilter Implementation
// ========================================

void LexiLoveProcessor::AllPassFilter::prepare(int maxSamples) {
    buffer.resize(maxSamples, 0.0f);
    writePos = 0;
}

float LexiLoveProcessor::AllPassFilter::process(float input) {
    if (buffer.empty()) return input;

    int readPos = writePos - delaySamples;
    if (readPos < 0) readPos += static_cast<int>(buffer.size());

    float delayed = buffer[readPos];
    float output = -input + delayed;
    buffer[writePos] = input + delayed * feedback;

    writePos = (writePos + 1) % static_cast<int>(buffer.size());
    return output;
}

void LexiLoveProcessor::AllPassFilter::reset() {
    std::fill(buffer.begin(), buffer.end(), 0.0f);
    writePos = 0;
}

// ========================================
// Constructor
// ========================================

LexiLoveProcessor::LexiLoveProcessor() {
}

// ========================================
// Initialization
// ========================================

void LexiLoveProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;
    numChannels_ = numChannels;

    // Pre-delay buffers (up to 500ms)
    int maxPreDelaySamples = static_cast<int>(sampleRate * 0.5) + 1;
    preDelayBufferL_.resize(maxPreDelaySamples, 0.0f);
    preDelayBufferR_.resize(maxPreDelaySamples, 0.0f);

    // Early reflection buffer (up to 700ms for largest algorithms)
    int earlyBufferSize = static_cast<int>(sampleRate * 0.7) + 1;
    earlyBufferL_.resize(earlyBufferSize, 0.0f);
    earlyBufferR_.resize(earlyBufferSize, 0.0f);

    // Initialize input diffusers
    int diffuserDelays[] = {142, 233, 379, 547};
    for (int i = 0; i < NUM_DIFFUSION_STAGES; ++i) {
        int scaledDelay = static_cast<int>(diffuserDelays[i] * sampleRate / 48000.0);
        inputDiffusersL_[i].prepare(scaledDelay * 2);
        inputDiffusersL_[i].delaySamples = scaledDelay;
        inputDiffusersL_[i].feedback = 0.6f;

        inputDiffusersR_[i].prepare(scaledDelay * 2);
        inputDiffusersR_[i].delaySamples = scaledDelay;
        inputDiffusersR_[i].feedback = 0.6f;
    }

    // Initialize reverb taps (FDN)
    int reverbBufferSize = static_cast<int>(sampleRate * 0.3) + 1;
    for (int i = 0; i < NUM_REVERB_TAPS; ++i) {
        int scaledDelay = static_cast<int>(REVERB_DELAYS[i] * sampleRate / 48000.0);
        reverbTapsL_[i].buffer.resize(reverbBufferSize, 0.0f);
        reverbTapsL_[i].delaySamples = scaledDelay;
        reverbTapsL_[i].modPhase = static_cast<double>(i) / NUM_REVERB_TAPS;

        reverbTapsR_[i].buffer.resize(reverbBufferSize, 0.0f);
        reverbTapsR_[i].delaySamples = scaledDelay;
        reverbTapsR_[i].modPhase = static_cast<double>(i) / NUM_REVERB_TAPS + 0.5;
    }

    // Initialize filters
    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = static_cast<juce::uint32>(samplesPerBlock);
    spec.numChannels = 1;

    lowCutFilterL_.prepare(spec);
    lowCutFilterR_.prepare(spec);
    highCutFilterL_.prepare(spec);
    highCutFilterR_.prepare(spec);
    lowBandFilterL_.prepare(spec);
    lowBandFilterR_.prepare(spec);
    highBandFilterL_.prepare(spec);
    highBandFilterR_.prepare(spec);

    // Initialize smoothed values
    smoothedMix_.reset(sampleRate, 0.02);
    smoothedPreDelay_.reset(sampleRate, 0.05);

    filtersNeedUpdate_.store(true);
    earlyTapsNeedUpdate_.store(true);
    prepared_ = true;
}

void LexiLoveProcessor::reset() {
    // Clear pre-delay buffers
    std::fill(preDelayBufferL_.begin(), preDelayBufferL_.end(), 0.0f);
    std::fill(preDelayBufferR_.begin(), preDelayBufferR_.end(), 0.0f);
    preDelayWritePos_ = 0;

    // Clear early reflection buffers
    std::fill(earlyBufferL_.begin(), earlyBufferL_.end(), 0.0f);
    std::fill(earlyBufferR_.begin(), earlyBufferR_.end(), 0.0f);
    earlyWritePos_ = 0;

    // Reset diffusers
    for (auto& d : inputDiffusersL_) d.reset();
    for (auto& d : inputDiffusersR_) d.reset();

    // Reset reverb taps
    for (auto& tap : reverbTapsL_) {
        std::fill(tap.buffer.begin(), tap.buffer.end(), 0.0f);
        tap.writePos = 0;
        tap.lowpassState = 0.0f;
        tap.highpassState = 0.0f;
        tap.bandpassState = 0.0f;
    }
    for (auto& tap : reverbTapsR_) {
        std::fill(tap.buffer.begin(), tap.buffer.end(), 0.0f);
        tap.writePos = 0;
        tap.lowpassState = 0.0f;
        tap.highpassState = 0.0f;
        tap.bandpassState = 0.0f;
    }

    // Reset filters
    lowCutFilterL_.reset();
    lowCutFilterR_.reset();
    highCutFilterL_.reset();
    highCutFilterR_.reset();

    // Reset metering
    meterInputL_.store(-100.0f);
    meterInputR_.store(-100.0f);
    meterOutputL_.store(-100.0f);
    meterOutputR_.store(-100.0f);
    meterReverbL_.store(-100.0f);
    meterReverbR_.store(-100.0f);
    meterEarlyLevel_.store(-100.0f);
    meterLateLevel_.store(-100.0f);
}

// ========================================
// Processing
// ========================================

void LexiLoveProcessor::process(juce::AudioBuffer<float>& buffer) {
    if (!prepared_) return;

    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    // Measure input levels
    if (numChannels >= 1) {
        meterInputL_.store(calculatePeakLevel(buffer.getReadPointer(0), numSamples));
    }
    if (numChannels >= 2) {
        meterInputR_.store(calculatePeakLevel(buffer.getReadPointer(1), numSamples));
    }

    // Handle bypass
    if (bypass_.load()) {
        if (!spillover_.load()) {
            reset();
        }
        meterOutputL_.store(meterInputL_.load());
        meterOutputR_.store(meterInputR_.load());
        return;
    }

    // Update filters and early taps if needed
    if (filtersNeedUpdate_.exchange(false)) {
        updateFilters();
    }
    if (earlyTapsNeedUpdate_.exchange(false)) {
        updateEarlyTaps();
    }

    // Load parameters
    float mixAmt = mix_.load() / 100.0f;
    float preDelayMs = preDelay_.load();
    float decaySec = decayTime_.load();
    float diffusionAmt = diffusion_.load() / 100.0f;
    float earlyLevelAmt = earlyLevel_.load() / 100.0f;
    float modDepthAmt = modDepth_.load() / 100.0f;
    float modRateHz = modRate_.load();
    float lowDecayMultVal = lowDecayMult_.load();
    float highDecayMultVal = highDecayMult_.load();

    // Update smoothed values
    smoothedMix_.setTargetValue(mixAmt);
    float preDelaySamples = preDelayMs * static_cast<float>(sampleRate_) / 1000.0f;
    smoothedPreDelay_.setTargetValue(preDelaySamples);

    // Calculate base reverb feedback from decay time
    float avgDelay = 2000.0f;  // Average delay in samples at 48kHz
    float baseFeedback = std::pow(10.0f, -3.0f * avgDelay / (decaySec * static_cast<float>(sampleRate_)));
    baseFeedback = std::clamp(baseFeedback, 0.0f, 0.998f);

    float* dataL = buffer.getWritePointer(0);
    float* dataR = numChannels >= 2 ? buffer.getWritePointer(1) : nullptr;

    int preDelayBufferSize = static_cast<int>(preDelayBufferL_.size());
    int earlyBufferSize = static_cast<int>(earlyBufferL_.size());

    float earlyAccumL = 0.0f, earlyAccumR = 0.0f;
    float lateAccumL = 0.0f, lateAccumR = 0.0f;

    for (int i = 0; i < numSamples; ++i) {
        float wet = smoothedMix_.getNextValue();
        float dry = 1.0f - wet;
        float currentPreDelay = smoothedPreDelay_.getNextValue();

        float inputL = dataL[i];
        float inputR = dataR != nullptr ? dataR[i] : inputL;

        // ========================================
        // Stage 1: Pre-delay
        // ========================================
        preDelayBufferL_[preDelayWritePos_] = inputL;
        preDelayBufferR_[preDelayWritePos_] = inputR;

        float preDelayedL = readDelayLine(preDelayBufferL_, preDelayWritePos_, currentPreDelay);
        float preDelayedR = readDelayLine(preDelayBufferR_, preDelayWritePos_, currentPreDelay);

        preDelayWritePos_ = (preDelayWritePos_ + 1) % preDelayBufferSize;

        // ========================================
        // Stage 2: Early Reflections
        // ========================================
        earlyBufferL_[earlyWritePos_] = preDelayedL;
        earlyBufferR_[earlyWritePos_] = preDelayedR;

        float earlyOutL = 0.0f;
        float earlyOutR = 0.0f;

        for (int t = 0; t < NUM_EARLY_TAPS; ++t) {
            const auto& tap = earlyTaps_[t];
            if (tap.delaySamples <= 0) continue;

            float tapSampleL = readDelayLine(earlyBufferL_, earlyWritePos_, static_cast<float>(tap.delaySamples));
            float tapSampleR = readDelayLine(earlyBufferR_, earlyWritePos_, static_cast<float>(tap.delaySamples));

            // Apply panning
            float panL = 0.5f * (1.0f - tap.pan);
            float panR = 0.5f * (1.0f + tap.pan);

            earlyOutL += tapSampleL * tap.gain * panL + tapSampleR * tap.gain * (1.0f - panR);
            earlyOutR += tapSampleR * tap.gain * panR + tapSampleL * tap.gain * (1.0f - panL);
        }

        earlyWritePos_ = (earlyWritePos_ + 1) % earlyBufferSize;

        // Scale early reflections
        earlyOutL *= earlyLevelAmt;
        earlyOutR *= earlyLevelAmt;

        // ========================================
        // Stage 3: Input Diffusion
        // ========================================
        float diffusedL = preDelayedL;
        float diffusedR = preDelayedR;

        if (diffusionAmt > 0.0f) {
            for (auto& diff : inputDiffusersL_) {
                diffusedL = diff.process(diffusedL);
            }
            for (auto& diff : inputDiffusersR_) {
                diffusedR = diff.process(diffusedR);
            }
            diffusedL = preDelayedL * (1.0f - diffusionAmt) + diffusedL * diffusionAmt;
            diffusedR = preDelayedR * (1.0f - diffusionAmt) + diffusedR * diffusionAmt;
        }

        // ========================================
        // Stage 4: Late Reverb (FDN with multi-band decay)
        // ========================================
        float reverbOutL = 0.0f;
        float reverbOutR = 0.0f;

        for (int t = 0; t < NUM_REVERB_TAPS; ++t) {
            auto& tapL = reverbTapsL_[t];
            auto& tapR = reverbTapsR_[t];

            // Modulated delay time (for "sparkle")
            float modL = static_cast<float>(std::sin(tapL.modPhase * 2.0 * juce::MathConstants<double>::pi));
            float modR = static_cast<float>(std::sin(tapR.modPhase * 2.0 * juce::MathConstants<double>::pi));

            int modDelayL = tapL.delaySamples + static_cast<int>(modL * modDepthAmt * 25.0f);
            int modDelayR = tapR.delaySamples + static_cast<int>(modR * modDepthAmt * 25.0f);
            modDelayL = std::clamp(modDelayL, 1, static_cast<int>(tapL.buffer.size()) - 1);
            modDelayR = std::clamp(modDelayR, 1, static_cast<int>(tapR.buffer.size()) - 1);

            // Read from tap
            int readPosL = tapL.writePos - modDelayL;
            if (readPosL < 0) readPosL += static_cast<int>(tapL.buffer.size());
            int readPosR = tapR.writePos - modDelayR;
            if (readPosR < 0) readPosR += static_cast<int>(tapR.buffer.size());

            float tapOutL = tapL.buffer[readPosL];
            float tapOutR = tapR.buffer[readPosR];

            // Multi-band decay processing
            // Simple one-pole filters for band separation
            float lowCrossFreq = lowCrossover_.load();
            float highCrossFreq = highCrossover_.load();

            float lowCoeff = std::exp(-2.0f * juce::MathConstants<float>::pi * lowCrossFreq / static_cast<float>(sampleRate_));
            float highCoeff = std::exp(-2.0f * juce::MathConstants<float>::pi * highCrossFreq / static_cast<float>(sampleRate_));

            // Extract bands
            tapL.lowpassState = tapL.lowpassState * lowCoeff + tapOutL * (1.0f - lowCoeff);
            tapR.lowpassState = tapR.lowpassState * lowCoeff + tapOutR * (1.0f - lowCoeff);

            tapL.highpassState = tapL.highpassState * highCoeff + tapOutL * (1.0f - highCoeff);
            tapR.highpassState = tapR.highpassState * highCoeff + tapOutR * (1.0f - highCoeff);

            float lowBandL = tapL.lowpassState;
            float lowBandR = tapR.lowpassState;
            float highBandL = tapOutL - tapL.highpassState;
            float highBandR = tapOutR - tapR.highpassState;
            float midBandL = tapOutL - lowBandL - highBandL;
            float midBandR = tapOutR - lowBandR - highBandR;

            // Apply per-band feedback (multi-band decay)
            float feedbackL = lowBandL * baseFeedback * lowDecayMultVal +
                             midBandL * baseFeedback +
                             highBandL * baseFeedback * highDecayMultVal;
            float feedbackR = lowBandR * baseFeedback * lowDecayMultVal +
                             midBandR * baseFeedback +
                             highBandR * baseFeedback * highDecayMultVal;

            // Accumulate output
            reverbOutL += tapOutL;
            reverbOutR += tapOutR;

            // Write to tap (input + cross-feedback from other channel)
            tapL.buffer[tapL.writePos] = diffusedL + feedbackR * 0.7f + feedbackL * 0.3f;
            tapR.buffer[tapR.writePos] = diffusedR + feedbackL * 0.7f + feedbackR * 0.3f;

            // Advance write position
            tapL.writePos = (tapL.writePos + 1) % static_cast<int>(tapL.buffer.size());
            tapR.writePos = (tapR.writePos + 1) % static_cast<int>(tapR.buffer.size());

            // Advance modulation phase
            tapL.modPhase += modRateHz / sampleRate_;
            if (tapL.modPhase >= 1.0) tapL.modPhase -= 1.0;
            tapR.modPhase += modRateHz / sampleRate_;
            if (tapR.modPhase >= 1.0) tapR.modPhase -= 1.0;
        }

        // Normalize reverb output
        reverbOutL /= static_cast<float>(NUM_REVERB_TAPS) * 0.5f;
        reverbOutR /= static_cast<float>(NUM_REVERB_TAPS) * 0.5f;

        // ========================================
        // Stage 5: Output Filtering
        // ========================================
        // Combine early + late
        float wetL = earlyOutL + reverbOutL;
        float wetR = earlyOutR + reverbOutR;

        // Apply filters
        wetL = lowCutFilterL_.processSample(wetL);
        wetL = highCutFilterL_.processSample(wetL);
        wetR = lowCutFilterR_.processSample(wetR);
        wetR = highCutFilterR_.processSample(wetR);

        // ========================================
        // Final Mix
        // ========================================
        dataL[i] = inputL * dry + wetL * wet;
        if (dataR != nullptr) {
            dataR[i] = inputR * dry + wetR * wet;
        }

        // Update accumulators for metering
        earlyAccumL = std::max(earlyAccumL, std::abs(earlyOutL));
        earlyAccumR = std::max(earlyAccumR, std::abs(earlyOutR));
        lateAccumL = std::max(lateAccumL, std::abs(reverbOutL));
        lateAccumR = std::max(lateAccumR, std::abs(reverbOutR));
    }

    // Update metering
    meterOutputL_.store(calculatePeakLevel(dataL, numSamples));
    if (dataR != nullptr) {
        meterOutputR_.store(calculatePeakLevel(dataR, numSamples));
    }
    meterEarlyLevel_.store(linearToDb(earlyAccumL));
    meterLateLevel_.store(linearToDb(lateAccumL));
    meterReverbL_.store(linearToDb(lateAccumL));
    meterReverbR_.store(linearToDb(lateAccumR));
    meterModPhase_.store(static_cast<float>(reverbTapsL_[0].modPhase));
}

// ========================================
// Filter and Early Tap Updates
// ========================================

void LexiLoveProcessor::updateFilters() {
    float lowCutFreq = lowCut_.load();
    float highCutFreq = highCut_.load();

    // High-pass filter for low cut
    auto lowCutCoeffs = juce::dsp::IIR::Coefficients<float>::makeHighPass(sampleRate_, lowCutFreq);
    *lowCutFilterL_.coefficients = *lowCutCoeffs;
    *lowCutFilterR_.coefficients = *lowCutCoeffs;

    // Low-pass filter for high cut
    auto highCutCoeffs = juce::dsp::IIR::Coefficients<float>::makeLowPass(sampleRate_, highCutFreq);
    *highCutFilterL_.coefficients = *highCutCoeffs;
    *highCutFilterR_.coefficients = *highCutCoeffs;
}

void LexiLoveProcessor::updateEarlyTaps() {
    Algorithm alg = algorithm_.load();
    int algIndex = static_cast<int>(alg);
    if (algIndex < 0 || algIndex >= 9) algIndex = 1;

    const auto& pattern = EARLY_PATTERNS[algIndex];
    float patternDensity = earlyPattern_.load() / 100.0f;

    for (int t = 0; t < NUM_EARLY_TAPS; ++t) {
        // Scale delay times based on pattern density
        float delayMs = pattern.delayMs[t] * (0.5f + patternDensity);
        earlyTaps_[t].delaySamples = static_cast<int>(delayMs * sampleRate_ / 1000.0f);
        earlyTaps_[t].gain = pattern.gains[t];
        earlyTaps_[t].pan = pattern.pans[t];
    }
}

void LexiLoveProcessor::applyAlgorithm(Algorithm algorithm) {
    int idx = static_cast<int>(algorithm);
    if (idx < 0 || idx >= 9) return;

    const auto& preset = FACTORY_PRESETS[idx];

    preDelay_.store(preset.preDelay);
    decayTime_.store(preset.decayTime);
    diffusion_.store(preset.diffusion);
    lowDecayMult_.store(preset.lowDecayMult);
    highDecayMult_.store(preset.highDecayMult);
    lowCrossover_.store(preset.lowCrossover);
    highCrossover_.store(preset.highCrossover);
    earlyLevel_.store(preset.earlyLevel);
    earlyPattern_.store(preset.earlyPattern);
    modDepth_.store(preset.modDepth);
    modRate_.store(preset.modRate);
    highCut_.store(preset.highCut);
    lowCut_.store(preset.lowCut);

    filtersNeedUpdate_.store(true);
    earlyTapsNeedUpdate_.store(true);
}

// ========================================
// Utility Methods
// ========================================

float LexiLoveProcessor::readDelayLine(const std::vector<float>& buffer, int writePos, float delaySamples) const {
    int bufferSize = static_cast<int>(buffer.size());
    if (bufferSize == 0) return 0.0f;

    float readPos = static_cast<float>(writePos) - delaySamples;
    while (readPos < 0.0f) readPos += static_cast<float>(bufferSize);
    while (readPos >= static_cast<float>(bufferSize)) readPos -= static_cast<float>(bufferSize);

    // Linear interpolation
    int idx0 = static_cast<int>(readPos);
    int idx1 = (idx0 + 1) % bufferSize;
    float frac = readPos - static_cast<float>(idx0);

    return buffer[idx0] * (1.0f - frac) + buffer[idx1] * frac;
}

float LexiLoveProcessor::linearToDb(float linear) {
    if (linear <= 0.0f) return -100.0f;
    return 20.0f * std::log10(linear);
}

float LexiLoveProcessor::dbToLinear(float db) {
    return std::pow(10.0f, db / 20.0f);
}

float LexiLoveProcessor::calculatePeakLevel(const float* data, int numSamples) {
    float peak = 0.0f;
    for (int i = 0; i < numSamples; ++i) {
        float abs = std::abs(data[i]);
        if (abs > peak) peak = abs;
    }
    return linearToDb(peak);
}

// ========================================
// Algorithm Info
// ========================================

LexiLoveProcessor::AlgorithmInfo LexiLoveProcessor::getAlgorithmInfo(Algorithm algorithm) {
    switch (algorithm) {
        case Algorithm::TiledRoom:
            return {"Tiled Room V2.0", "TILED", "Legendary preset with \"spitty\" early reflections - lively on drums"};
        case Algorithm::RichPlate:
            return {"Rich Plate", "PLATE", "Warm vocals - the studio standard for countless recordings"};
        case Algorithm::ConcertHall:
            return {"Concert Hall", "HALL", "Classic 80s reverb with time variation and sparkle"};
        case Algorithm::SmallRoom:
            return {"Small Room", "SMALL", "Tight, customizable space for close-mic sounds"};
        case Algorithm::RichChamber:
            return {"Rich Chamber", "CHAMB", "Warm thick chamber with prominent early reflections"};
        case Algorithm::Gymnasium:
            return {"Gymnasium", "GYM", "Large acoustic space simulation with long decay"};
        case Algorithm::LongHall:
            return {"Long Hall", "LONG", "Extended decay concert hall for ambient textures"};
        case Algorithm::GatedPlate:
            return {"Gated Plate", "GATED", "Compressed/gated reverb for drums and dramatic effects"};
        case Algorithm::Infinite:
            return {"Infinite", "INF", "Special effects and atmospheric textures - near-infinite decay"};
        default:
            return {"Unknown", "???", ""};
    }
}

LexiLoveProcessor::AlgorithmInfo LexiLoveProcessor::getAlgorithmInfo(int algorithmIndex) {
    if (algorithmIndex < 0 || algorithmIndex >= static_cast<int>(Algorithm::NumAlgorithms)) {
        return {"Unknown", "???", ""};
    }
    return getAlgorithmInfo(static_cast<Algorithm>(algorithmIndex));
}

// ========================================
// Parameter Setters
// ========================================

void LexiLoveProcessor::setAlgorithm(Algorithm algorithm) {
    algorithm_.store(algorithm);
    applyAlgorithm(algorithm);
}

void LexiLoveProcessor::setAlgorithm(int algorithmIndex) {
    if (algorithmIndex >= 0 && algorithmIndex < static_cast<int>(Algorithm::NumAlgorithms)) {
        setAlgorithm(static_cast<Algorithm>(algorithmIndex));
    }
}

void LexiLoveProcessor::setPreDelay(float ms) {
    preDelay_.store(std::clamp(ms, 0.0f, 500.0f));
}

void LexiLoveProcessor::setDecayTime(float seconds) {
    decayTime_.store(std::clamp(seconds, 0.5f, 30.0f));
}

void LexiLoveProcessor::setDiffusion(float percent) {
    diffusion_.store(std::clamp(percent, 0.0f, 100.0f));
}

void LexiLoveProcessor::setMix(float percent) {
    mix_.store(std::clamp(percent, 0.0f, 100.0f));
}

void LexiLoveProcessor::setHighCut(float hz) {
    highCut_.store(std::clamp(hz, 1000.0f, 20000.0f));
    filtersNeedUpdate_.store(true);
}

void LexiLoveProcessor::setLowCut(float hz) {
    lowCut_.store(std::clamp(hz, 20.0f, 500.0f));
    filtersNeedUpdate_.store(true);
}

void LexiLoveProcessor::setLowDecayMult(float mult) {
    lowDecayMult_.store(std::clamp(mult, 0.25f, 2.0f));
}

void LexiLoveProcessor::setHighDecayMult(float mult) {
    highDecayMult_.store(std::clamp(mult, 0.25f, 2.0f));
}

void LexiLoveProcessor::setLowCrossover(float hz) {
    lowCrossover_.store(std::clamp(hz, 100.0f, 2000.0f));
}

void LexiLoveProcessor::setHighCrossover(float hz) {
    highCrossover_.store(std::clamp(hz, 2000.0f, 15000.0f));
}

void LexiLoveProcessor::setEarlyLevel(float percent) {
    earlyLevel_.store(std::clamp(percent, 0.0f, 100.0f));
}

void LexiLoveProcessor::setEarlyPattern(float percent) {
    earlyPattern_.store(std::clamp(percent, 0.0f, 100.0f));
    earlyTapsNeedUpdate_.store(true);
}

void LexiLoveProcessor::setModDepth(float percent) {
    modDepth_.store(std::clamp(percent, 0.0f, 100.0f));
}

void LexiLoveProcessor::setModRate(float hz) {
    modRate_.store(std::clamp(hz, 0.1f, 10.0f));
}

void LexiLoveProcessor::setSpillover(bool enabled) {
    spillover_.store(enabled);
}

void LexiLoveProcessor::setBypass(bool bypass) {
    bypass_.store(bypass);
}

// ========================================
// Bulk Parameter Access
// ========================================

LexiLoveProcessor::Parameters LexiLoveProcessor::getParameters() const {
    Parameters params;
    params.algorithm = algorithm_.load();
    params.preDelay = preDelay_.load();
    params.decayTime = decayTime_.load();
    params.diffusion = diffusion_.load();
    params.lowDecayMult = lowDecayMult_.load();
    params.highDecayMult = highDecayMult_.load();
    params.lowCrossover = lowCrossover_.load();
    params.highCrossover = highCrossover_.load();
    params.earlyLevel = earlyLevel_.load();
    params.earlyPattern = earlyPattern_.load();
    params.modDepth = modDepth_.load();
    params.modRate = modRate_.load();
    params.mix = mix_.load();
    params.highCut = highCut_.load();
    params.lowCut = lowCut_.load();
    params.bypass = bypass_.load();
    params.spillover = spillover_.load();
    return params;
}

void LexiLoveProcessor::setParameters(const Parameters& params) {
    // Don't call setAlgorithm to avoid resetting other params
    algorithm_.store(params.algorithm);
    preDelay_.store(params.preDelay);
    decayTime_.store(params.decayTime);
    diffusion_.store(params.diffusion);
    lowDecayMult_.store(params.lowDecayMult);
    highDecayMult_.store(params.highDecayMult);
    lowCrossover_.store(params.lowCrossover);
    highCrossover_.store(params.highCrossover);
    earlyLevel_.store(params.earlyLevel);
    earlyPattern_.store(params.earlyPattern);
    modDepth_.store(params.modDepth);
    modRate_.store(params.modRate);
    mix_.store(params.mix);
    highCut_.store(params.highCut);
    lowCut_.store(params.lowCut);
    bypass_.store(params.bypass);
    spillover_.store(params.spillover);

    filtersNeedUpdate_.store(true);
    earlyTapsNeedUpdate_.store(true);
}

// ========================================
// Metering
// ========================================

LexiLoveProcessor::Metering LexiLoveProcessor::getMetering() const {
    Metering m;
    m.inputLevelL = meterInputL_.load();
    m.inputLevelR = meterInputR_.load();
    m.outputLevelL = meterOutputL_.load();
    m.outputLevelR = meterOutputR_.load();
    m.reverbLevelL = meterReverbL_.load();
    m.reverbLevelR = meterReverbR_.load();
    m.earlyLevel = meterEarlyLevel_.load();
    m.lateLevel = meterLateLevel_.load();
    m.modLfoPhase = meterModPhase_.load();
    m.currentDecay = decayTime_.load();
    return m;
}

void LexiLoveProcessor::resetPeaks() {
    meterInputL_.store(-100.0f);
    meterInputR_.store(-100.0f);
    meterOutputL_.store(-100.0f);
    meterOutputR_.store(-100.0f);
    meterReverbL_.store(-100.0f);
    meterReverbR_.store(-100.0f);
    meterEarlyLevel_.store(-100.0f);
    meterLateLevel_.store(-100.0f);
}

} // namespace map2
