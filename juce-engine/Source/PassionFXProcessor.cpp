/**
 * MAP2 Audio Engine - PassionFX Multi-Effect Processor Implementation
 *
 * 12-module signal chain inspired by Steve Vai's "Passion & Warfare" tones:
 * Input -> NoiseGate -> Compressor -> Wah -> Phaser -> Chorus ->
 * PitchShifter -> Harmonizer -> Delay -> Reverb -> EQ -> Exciter -> Tremolo -> Output
 *
 * Each module processes per-sample (float& sampleL, float& sampleR).
 * process() loops over buffer samples, calling each enabled module in chain order.
 * All parameters read from atomics once at block start, stored into local vars.
 */

#include "PassionFXProcessor.h"
#include <cmath>
#include <algorithm>

namespace map2 {

// ========================================
// AllPassFilter Implementation
// ========================================

void PassionFXProcessor::AllPassFilter::prepare(int maxSamples) {
    buffer.resize(maxSamples, 0.0f);
    writePos = 0;
}

float PassionFXProcessor::AllPassFilter::process(float input) {
    if (buffer.empty()) return input;

    int readPos = writePos - delaySamples;
    if (readPos < 0) readPos += static_cast<int>(buffer.size());

    float delayed = buffer[readPos];
    float output = -input + delayed;
    buffer[writePos] = input + delayed * feedback;

    writePos = (writePos + 1) % static_cast<int>(buffer.size());
    return output;
}

void PassionFXProcessor::AllPassFilter::reset() {
    std::fill(buffer.begin(), buffer.end(), 0.0f);
    writePos = 0;
}

// ========================================
// Constructor
// ========================================

PassionFXProcessor::PassionFXProcessor() {
}

// ========================================
// Initialization
// ========================================

void PassionFXProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;
    numChannels_ = numChannels;

    // --- Chorus buffers: 50ms max per voice ---
    int chorusBufferSize = static_cast<int>(sampleRate * 0.05) + 1;
    for (int i = 0; i < MAX_CHORUS_VOICES; ++i) {
        chorusVoiceState_[i].bufferL.resize(chorusBufferSize, 0.0f);
        chorusVoiceState_[i].bufferR.resize(chorusBufferSize, 0.0f);
        chorusVoiceState_[i].writePos = 0;
        chorusVoiceState_[i].lfoPhase = static_cast<double>(i) / MAX_CHORUS_VOICES;
    }

    // --- PitchShifter buffers ---
    int pitchBufSize = PITCH_GRAIN_SIZE * 4;
    pitchBufferL_.resize(pitchBufSize, 0.0f);
    pitchBufferR_.resize(pitchBufSize, 0.0f);
    pitchWritePos_ = 0;
    for (int i = 0; i < NUM_PITCH_GRAINS; ++i) {
        float phase = static_cast<float>(i) / static_cast<float>(NUM_PITCH_GRAINS);
        pitchGrainsL_[i].readPos = phase * PITCH_GRAIN_SIZE;
        pitchGrainsL_[i].sampleCount = static_cast<int>(phase * PITCH_GRAIN_SIZE);
        pitchGrainsL_[i].active = true;
        pitchGrainsR_[i].readPos = phase * PITCH_GRAIN_SIZE;
        pitchGrainsR_[i].sampleCount = static_cast<int>(phase * PITCH_GRAIN_SIZE);
        pitchGrainsR_[i].active = true;
    }

    // --- Harmonizer buffers ---
    int harmBufSize = PITCH_GRAIN_SIZE * 4;
    harmBufferL_.resize(harmBufSize, 0.0f);
    harmBufferR_.resize(harmBufSize, 0.0f);
    harmWritePos_ = 0;
    for (int i = 0; i < NUM_PITCH_GRAINS; ++i) {
        float phase = static_cast<float>(i) / static_cast<float>(NUM_PITCH_GRAINS);
        harmGrainsV1L_[i] = { phase * PITCH_GRAIN_SIZE, static_cast<int>(phase * PITCH_GRAIN_SIZE) };
        harmGrainsV1R_[i] = { phase * PITCH_GRAIN_SIZE, static_cast<int>(phase * PITCH_GRAIN_SIZE) };
        harmGrainsV2L_[i] = { phase * PITCH_GRAIN_SIZE, static_cast<int>(phase * PITCH_GRAIN_SIZE) };
        harmGrainsV2R_[i] = { phase * PITCH_GRAIN_SIZE, static_cast<int>(phase * PITCH_GRAIN_SIZE) };
    }

    // --- Delay buffers: up to 8s ---
    int delayBufSize = MAX_DELAY_SAMPLES;
    if (sampleRate > 48000.0)
        delayBufSize = static_cast<int>(sampleRate * 8.0) + 1;
    delayBufferL_.resize(delayBufSize, 0.0f);
    delayBufferR_.resize(delayBufSize, 0.0f);
    delayWritePos_ = 0;

    // Delay pitch-shift buffers
    int delayPitchBufSize = PITCH_GRAIN_SIZE * 4;
    delayPitchBufL_.resize(delayPitchBufSize, 0.0f);
    delayPitchBufR_.resize(delayPitchBufSize, 0.0f);
    delayPitchWritePos_ = 0;
    for (int i = 0; i < NUM_PITCH_GRAINS; ++i) {
        float phase = static_cast<float>(i) / static_cast<float>(NUM_PITCH_GRAINS);
        delayPitchGrainsL_[i] = { phase * PITCH_GRAIN_SIZE, static_cast<int>(phase * PITCH_GRAIN_SIZE), true };
        delayPitchGrainsR_[i] = { phase * PITCH_GRAIN_SIZE, static_cast<int>(phase * PITCH_GRAIN_SIZE), true };
    }

    // --- Reverb FDN taps ---
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

    // --- Reverb input diffusers ---
    int reverbDiffuserDelays[] = { 142, 233, 379, 547 };
    for (int i = 0; i < 4; ++i) {
        int scaledDelay = static_cast<int>(reverbDiffuserDelays[i] * sampleRate / 48000.0);
        reverbDiffusersL_[i].prepare(scaledDelay * 2);
        reverbDiffusersL_[i].delaySamples = scaledDelay;
        reverbDiffusersL_[i].feedback = 0.6f;

        reverbDiffusersR_[i].prepare(scaledDelay * 2);
        reverbDiffusersR_[i].delaySamples = scaledDelay;
        reverbDiffusersR_[i].feedback = 0.6f;
    }

    // --- Shimmer buffers ---
    int shimmerBufSize = PITCH_GRAIN_SIZE * 4;
    shimmerBufferL_.resize(shimmerBufSize, 0.0f);
    shimmerBufferR_.resize(shimmerBufSize, 0.0f);
    shimmerWritePos_ = 0;
    for (int i = 0; i < NUM_PITCH_GRAINS; ++i) {
        float phase = static_cast<float>(i) / static_cast<float>(NUM_PITCH_GRAINS);
        shimmerGrainsL_[i] = { phase * PITCH_GRAIN_SIZE, static_cast<int>(phase * PITCH_GRAIN_SIZE), true };
        shimmerGrainsR_[i] = { phase * PITCH_GRAIN_SIZE, static_cast<int>(phase * PITCH_GRAIN_SIZE), true };
    }

    // --- EQ filters ---
    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = static_cast<juce::uint32>(samplesPerBlock);
    spec.numChannels = 1;

    eqLowL_.prepare(spec);
    eqLowR_.prepare(spec);
    eqMidL_.prepare(spec);
    eqMidR_.prepare(spec);
    eqHighL_.prepare(spec);
    eqHighR_.prepare(spec);

    // --- Exciter filters ---
    exciterLowL_.prepare(spec);
    exciterLowR_.prepare(spec);
    exciterMidL_.prepare(spec);
    exciterMidR_.prepare(spec);
    exciterHighL_.prepare(spec);
    exciterHighR_.prepare(spec);

    // --- Smoothed values ---
    smoothedGlobalMix_.reset(sampleRate, 0.02);
    smoothedOutputLevel_.reset(sampleRate, 0.02);
    smoothedDelayTimeL_.reset(sampleRate, 0.05);
    smoothedDelayTimeR_.reset(sampleRate, 0.05);

    eqNeedsUpdate_.store(true);
    exciterNeedsUpdate_.store(true);
    prepared_ = true;
}

void PassionFXProcessor::reset() {
    // NoiseGate
    gateEnvelopeL_ = 0.0f;
    gateEnvelopeR_ = 0.0f;
    gateGain_ = 1.0f;

    // Compressor
    compEnvelopeL_ = 0.0f;
    compEnvelopeR_ = 0.0f;
    compGainReduction_ = 0.0f;

    // Wah
    wahBandpassL_ = 0.0f;
    wahLowpassL_ = 0.0f;
    wahBandpassR_ = 0.0f;
    wahLowpassR_ = 0.0f;
    wahEnvelope_ = 0.0f;
    wahAutoLfoPhase_ = 0.0;

    // Phaser
    for (auto& s : phaserStageState_) {
        s.stateL = 0.0f;
        s.stateR = 0.0f;
    }
    phaserLfoPhase_ = 0.0;
    phaserFeedbackSampleL_ = 0.0f;
    phaserFeedbackSampleR_ = 0.0f;

    // Chorus
    for (auto& v : chorusVoiceState_) {
        std::fill(v.bufferL.begin(), v.bufferL.end(), 0.0f);
        std::fill(v.bufferR.begin(), v.bufferR.end(), 0.0f);
        v.writePos = 0;
    }

    // PitchShifter
    std::fill(pitchBufferL_.begin(), pitchBufferL_.end(), 0.0f);
    std::fill(pitchBufferR_.begin(), pitchBufferR_.end(), 0.0f);
    pitchWritePos_ = 0;

    // Harmonizer
    std::fill(harmBufferL_.begin(), harmBufferL_.end(), 0.0f);
    std::fill(harmBufferR_.begin(), harmBufferR_.end(), 0.0f);
    harmWritePos_ = 0;

    // Delay
    std::fill(delayBufferL_.begin(), delayBufferL_.end(), 0.0f);
    std::fill(delayBufferR_.begin(), delayBufferR_.end(), 0.0f);
    delayWritePos_ = 0;
    std::fill(delayPitchBufL_.begin(), delayPitchBufL_.end(), 0.0f);
    std::fill(delayPitchBufR_.begin(), delayPitchBufR_.end(), 0.0f);
    delayPitchWritePos_ = 0;

    // Reverb
    for (auto& tap : reverbTapsL_) {
        std::fill(tap.buffer.begin(), tap.buffer.end(), 0.0f);
        tap.writePos = 0;
        tap.lowpassState = 0.0f;
    }
    for (auto& tap : reverbTapsR_) {
        std::fill(tap.buffer.begin(), tap.buffer.end(), 0.0f);
        tap.writePos = 0;
        tap.lowpassState = 0.0f;
    }
    for (auto& d : reverbDiffusersL_) d.reset();
    for (auto& d : reverbDiffusersR_) d.reset();

    // Shimmer
    std::fill(shimmerBufferL_.begin(), shimmerBufferL_.end(), 0.0f);
    std::fill(shimmerBufferR_.begin(), shimmerBufferR_.end(), 0.0f);
    shimmerWritePos_ = 0;
    shimmerFeedbackL_ = 0.0f;
    shimmerFeedbackR_ = 0.0f;

    // EQ
    eqLowL_.reset();
    eqLowR_.reset();
    eqMidL_.reset();
    eqMidR_.reset();
    eqHighL_.reset();
    eqHighR_.reset();

    // Exciter
    exciterLowL_.reset();
    exciterLowR_.reset();
    exciterMidL_.reset();
    exciterMidR_.reset();
    exciterHighL_.reset();
    exciterHighR_.reset();

    // Tremolo
    tremoloLfoPhase_ = 0.0;
    tremoloSHValue_ = 0.0f;
    tremoloSHCounter_ = 0.0f;

    // Metering
    meterInputL_.store(-100.0f);
    meterInputR_.store(-100.0f);
    meterOutputL_.store(-100.0f);
    meterOutputR_.store(-100.0f);
    meterGateGain_.store(1.0f);
    meterCompGR_.store(0.0f);
    meterReverbL_.store(-100.0f);
    meterReverbR_.store(-100.0f);
    meterDelayL_.store(-100.0f);
    meterDelayR_.store(-100.0f);
    meterPhaserPhase_.store(0.0f);
    meterTremoloPhase_.store(0.0f);
    meterWahPos_.store(0.5f);
}

// ========================================
// Main Processing
// ========================================

void PassionFXProcessor::process(juce::AudioBuffer<float>& buffer) {
    if (!prepared_) return;

    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    // Measure input levels
    if (numChannels >= 1)
        meterInputL_.store(calculatePeakLevel(buffer.getReadPointer(0), numSamples));
    if (numChannels >= 2)
        meterInputR_.store(calculatePeakLevel(buffer.getReadPointer(1), numSamples));

    // Handle bypass
    if (bypass_.load()) {
        meterOutputL_.store(meterInputL_.load());
        meterOutputR_.store(meterInputR_.load());
        return;
    }

    // --- Read atomics once at block start ---
    bool gateOn       = noiseGateEnabled_.load();
    bool compOn       = compressorEnabled_.load();
    bool wahOn        = wahEnabled_.load();
    bool phaserOn     = phaserEnabled_.load();
    bool chorusOn     = chorusEnabled_.load();
    bool pitchOn      = pitchShifterEnabled_.load();
    bool harmOn       = harmonizerEnabled_.load();
    bool delayOn      = delayEnabled_.load();
    bool reverbOn     = reverbEnabled_.load();
    bool eqOn         = eqEnabled_.load();
    bool exciterOn    = exciterEnabled_.load();
    bool tremoloOn    = tremoloEnabled_.load();

    float gMix        = globalMix_.load();
    float outLvl      = outputLevel_.load();

    // Update smoothed targets
    smoothedGlobalMix_.setTargetValue(gMix);
    smoothedOutputLevel_.setTargetValue(dbToLinear(outLvl));
    smoothedDelayTimeL_.setTargetValue(delayTimeL_.load() * static_cast<float>(sampleRate_) / 1000.0f);
    smoothedDelayTimeR_.setTargetValue(delayTimeR_.load() * static_cast<float>(sampleRate_) / 1000.0f);

    // Update EQ/exciter if needed
    if (eqOn && eqNeedsUpdate_.exchange(false))
        updateEQ();
    if (exciterOn && exciterNeedsUpdate_.exchange(false))
        updateExciterFilters();

    float* dataL = buffer.getWritePointer(0);
    float* dataR = numChannels >= 2 ? buffer.getWritePointer(1) : nullptr;

    for (int i = 0; i < numSamples; ++i) {
        float sampleL = dataL[i];
        float sampleR = dataR != nullptr ? dataR[i] : sampleL;

        // Store dry signal for global mix
        float dryL = sampleL;
        float dryR = sampleR;

        // --- Signal chain ---
        if (gateOn)     processNoiseGate(sampleL, sampleR);
        if (compOn)     processCompressor(sampleL, sampleR);
        if (wahOn)      processWah(sampleL, sampleR);
        if (phaserOn)   processPhaser(sampleL, sampleR);
        if (chorusOn)   processChorus(sampleL, sampleR);
        if (pitchOn)    processPitchShifter(sampleL, sampleR);
        if (harmOn)     processHarmonizer(sampleL, sampleR);
        if (delayOn)    processDelay(sampleL, sampleR);
        if (reverbOn)   processReverb(sampleL, sampleR);
        if (eqOn)       processEQ(sampleL, sampleR);
        if (exciterOn)  processExciter(sampleL, sampleR);
        if (tremoloOn)  processTremolo(sampleL, sampleR);

        // Global mix: blend dry/wet
        float mix = smoothedGlobalMix_.getNextValue();
        sampleL = dryL * (1.0f - mix) + sampleL * mix;
        sampleR = dryR * (1.0f - mix) + sampleR * mix;

        // Output level
        float outGain = smoothedOutputLevel_.getNextValue();
        sampleL *= outGain;
        sampleR *= outGain;

        // Write output
        dataL[i] = sampleL;
        if (dataR != nullptr)
            dataR[i] = sampleR;
    }

    // Update output metering
    meterOutputL_.store(calculatePeakLevel(dataL, numSamples));
    if (dataR != nullptr)
        meterOutputR_.store(calculatePeakLevel(dataR, numSamples));
}

// ========================================
// NoiseGate - Envelope-following gate with smooth release
// ========================================

void PassionFXProcessor::processNoiseGate(float& sampleL, float& sampleR) {
    float thresholdDb = noiseGateThreshold_.load();
    float releaseMs   = noiseGateRelease_.load();

    float thresholdLin = dbToLinear(thresholdDb);
    float releaseCoeff = std::exp(-1.0f / (static_cast<float>(sampleRate_) * releaseMs * 0.001f));

    // Envelope follower (peak)
    float absL = std::abs(sampleL);
    float absR = std::abs(sampleR);
    float inputPeak = std::max(absL, absR);

    // Fast attack, smooth release envelope
    float attackCoeff = std::exp(-1.0f / (static_cast<float>(sampleRate_) * 0.001f)); // 1ms attack
    float env = std::max(gateEnvelopeL_, gateEnvelopeR_);
    if (inputPeak > env) {
        env = attackCoeff * env + (1.0f - attackCoeff) * inputPeak;
    } else {
        env = releaseCoeff * env + (1.0f - releaseCoeff) * inputPeak;
    }
    gateEnvelopeL_ = env;
    gateEnvelopeR_ = env;

    // Gate gain: smooth transition
    float targetGain = (env > thresholdLin) ? 1.0f : 0.0f;
    float smoothCoeff = (targetGain > gateGain_) ? (1.0f - attackCoeff) : (1.0f - releaseCoeff);
    gateGain_ += smoothCoeff * (targetGain - gateGain_);
    gateGain_ = std::clamp(gateGain_, 0.0f, 1.0f);

    sampleL *= gateGain_;
    sampleR *= gateGain_;

    meterGateGain_.store(gateGain_);
}

// ========================================
// Compressor - Feedforward with optional "glassy" high-shelf boost
// ========================================

void PassionFXProcessor::processCompressor(float& sampleL, float& sampleR) {
    float thresholdDb = compressorThreshold_.load();
    float ratio       = compressorRatio_.load();
    float attackMs    = compressorAttack_.load();
    float releaseMs   = compressorRelease_.load();
    bool  glassy      = compressorGlassy_.load();

    float attackCoeff  = std::exp(-1.0f / (static_cast<float>(sampleRate_) * attackMs * 0.001f));
    float releaseCoeff = std::exp(-1.0f / (static_cast<float>(sampleRate_) * releaseMs * 0.001f));

    // Peak detection
    float absL = std::abs(sampleL);
    float absR = std::abs(sampleR);
    float inputPeak = std::max(absL, absR);

    // Smooth envelope
    if (inputPeak > compEnvelopeL_) {
        compEnvelopeL_ = attackCoeff * compEnvelopeL_ + (1.0f - attackCoeff) * inputPeak;
    } else {
        compEnvelopeL_ = releaseCoeff * compEnvelopeL_ + (1.0f - releaseCoeff) * inputPeak;
    }

    // Gain calculation in dB domain
    float envDb = linearToDb(compEnvelopeL_);
    float gainReductionDb = 0.0f;
    if (envDb > thresholdDb) {
        float excess = envDb - thresholdDb;
        gainReductionDb = excess * (1.0f - 1.0f / ratio);
    }

    float gainLin = dbToLinear(-gainReductionDb);
    compGainReduction_ = gainReductionDb;

    sampleL *= gainLin;
    sampleR *= gainLin;

    // Glassy mode: subtle high-frequency emphasis after compression
    if (glassy) {
        // Simple one-pole high shelf approximation
        // Boosts presence range for "glass-like" clarity
        float highCoeff = 0.15f;
        float highL = sampleL - compEnvelopeL_ * highCoeff * sampleL;
        float highR = sampleR - compEnvelopeL_ * highCoeff * sampleR;
        sampleL += highL * 0.1f;
        sampleR += highR * 0.1f;
    }

    // Auto makeup gain: compensate for average compression
    float makeupDb = gainReductionDb * 0.5f;
    float makeupLin = dbToLinear(makeupDb);
    sampleL *= makeupLin;
    sampleR *= makeupLin;

    meterCompGR_.store(gainReductionDb);
}

// ========================================
// Wah - State-variable filter with manual/auto/envelope modes
// ========================================

void PassionFXProcessor::processWah(float& sampleL, float& sampleR) {
    int   mode     = wahMode_.load();
    float position = wahPosition_.load();
    float q        = wahQ_.load();

    float wahFreq;

    switch (mode) {
        case 0: // Manual - position controls wah directly
            wahFreq = position;
            break;

        case 1: { // Auto - LFO-driven
            float autoRate = 1.0f; // Fixed LFO rate for auto wah
            wahAutoLfoPhase_ += autoRate / sampleRate_;
            if (wahAutoLfoPhase_ >= 1.0) wahAutoLfoPhase_ -= 1.0;
            wahFreq = 0.5f + 0.5f * static_cast<float>(std::sin(wahAutoLfoPhase_ * 2.0 * juce::MathConstants<double>::pi));
            break;
        }

        case 2: { // Envelope - input dynamics drive the filter
            float inputLevel = std::max(std::abs(sampleL), std::abs(sampleR));
            float envAttack  = std::exp(-1.0f / (static_cast<float>(sampleRate_) * 0.005f)); // 5ms
            float envRelease = std::exp(-1.0f / (static_cast<float>(sampleRate_) * 0.1f));   // 100ms
            if (inputLevel > wahEnvelope_) {
                wahEnvelope_ = envAttack * wahEnvelope_ + (1.0f - envAttack) * inputLevel;
            } else {
                wahEnvelope_ = envRelease * wahEnvelope_ + (1.0f - envRelease) * inputLevel;
            }
            wahFreq = std::clamp(wahEnvelope_ * 4.0f, 0.0f, 1.0f); // Scale envelope to 0-1
            break;
        }

        default:
            wahFreq = position;
            break;
    }

    // Map wah position (0-1) to frequency range (350Hz - 4500Hz)
    float freqHz = 350.0f * std::pow(4500.0f / 350.0f, wahFreq);
    float f = 2.0f * std::sin(juce::MathConstants<float>::pi * freqHz / static_cast<float>(sampleRate_));
    f = std::clamp(f, 0.0f, 1.0f);
    float qInv = 1.0f / q;

    // State-variable filter: bandpass output for wah character
    // Left channel
    wahLowpassL_  += f * wahBandpassL_;
    float highpassL = sampleL - wahLowpassL_ - qInv * wahBandpassL_;
    wahBandpassL_ += f * highpassL;

    // Right channel
    wahLowpassR_  += f * wahBandpassR_;
    float highpassR = sampleR - wahLowpassR_ - qInv * wahBandpassR_;
    wahBandpassR_ += f * highpassR;

    // Mix bandpass (wah) with some dry for body
    float wahMix = 0.85f;
    sampleL = sampleL * (1.0f - wahMix) + wahBandpassL_ * wahMix;
    sampleR = sampleR * (1.0f - wahMix) + wahBandpassR_ * wahMix;

    meterWahPos_.store(wahFreq);
}

// ========================================
// Phaser - Multi-stage allpass chain with LFO and feedback
// ========================================

void PassionFXProcessor::processPhaser(float& sampleL, float& sampleR) {
    float rate     = phaserRate_.load();
    float depth    = phaserDepth_.load();
    int   stages   = std::clamp(phaserStages_.load(), 2, NUM_PHASER_STAGES_MAX);
    float feedback = phaserFeedback_.load();

    // LFO
    phaserLfoPhase_ += rate / sampleRate_;
    if (phaserLfoPhase_ >= 1.0) phaserLfoPhase_ -= 1.0;
    float lfo = static_cast<float>(std::sin(phaserLfoPhase_ * 2.0 * juce::MathConstants<double>::pi));
    float lfoVal = 0.5f + 0.5f * lfo * depth;

    // Map LFO to allpass coefficient range (phase shift center frequency)
    // Range: ~200Hz to ~4000Hz mapped as coefficient
    float minFreq = 200.0f;
    float maxFreq = 4000.0f;
    float freq = minFreq * std::pow(maxFreq / minFreq, lfoVal);
    float apCoeff = (std::tan(juce::MathConstants<float>::pi * freq / static_cast<float>(sampleRate_)) - 1.0f)
                  / (std::tan(juce::MathConstants<float>::pi * freq / static_cast<float>(sampleRate_)) + 1.0f);

    // Mix feedback into input
    float inL = sampleL + phaserFeedbackSampleL_ * feedback;
    float inR = sampleR + phaserFeedbackSampleR_ * feedback;

    // Process allpass chain
    float outL = inL;
    float outR = inR;
    for (int s = 0; s < stages; ++s) {
        // First-order allpass: y[n] = a * x[n] + x[n-1] - a * y[n-1]
        // Simplified as: out = coeff * (in - state) + state; state = in
        // Using: out = coeff * in + state; state = in - coeff * out
        float newOutL = apCoeff * outL + phaserStageState_[s].stateL;
        phaserStageState_[s].stateL = outL - apCoeff * newOutL;
        outL = newOutL;

        float newOutR = apCoeff * outR + phaserStageState_[s].stateR;
        phaserStageState_[s].stateR = outR - apCoeff * newOutR;
        outR = newOutR;
    }

    // Store feedback sample
    phaserFeedbackSampleL_ = outL;
    phaserFeedbackSampleR_ = outR;

    // Mix dry + phased signal (notch comb effect)
    sampleL = sampleL + outL * depth;
    sampleR = sampleR + outR * depth;

    // Normalize to prevent buildup
    sampleL *= 0.5f;
    sampleR *= 0.5f;

    meterPhaserPhase_.store(static_cast<float>(phaserLfoPhase_));
}

// ========================================
// Chorus - Multi-voice modulated delay with stereo spread
// ========================================

void PassionFXProcessor::processChorus(float& sampleL, float& sampleR) {
    float rate    = chorusRate_.load();
    float depth   = chorusDepth_.load();
    int   voices  = std::clamp(chorusVoices_.load(), 1, MAX_CHORUS_VOICES);
    float mix     = chorusMix_.load();

    float baseDelayMs = 7.0f;   // 7ms center delay
    float depthMs     = 3.0f * depth;  // Up to 3ms modulation swing

    float chorusOutL = 0.0f;
    float chorusOutR = 0.0f;

    for (int v = 0; v < voices; ++v) {
        auto& voice = chorusVoiceState_[v];

        // Write to chorus delay buffer
        int bufSize = static_cast<int>(voice.bufferL.size());
        voice.bufferL[voice.writePos] = sampleL;
        voice.bufferR[voice.writePos] = sampleR;

        // LFO per voice (staggered phases for richness)
        float lfo = static_cast<float>(std::sin(voice.lfoPhase * 2.0 * juce::MathConstants<double>::pi));

        float delayMsL = baseDelayMs + depthMs * lfo;
        float delayMsR = baseDelayMs - depthMs * lfo; // Opposite phase for stereo width

        float delaySamplesL = delayMsL * static_cast<float>(sampleRate_) / 1000.0f;
        float delaySamplesR = delayMsR * static_cast<float>(sampleRate_) / 1000.0f;
        delaySamplesL = std::clamp(delaySamplesL, 1.0f, static_cast<float>(bufSize - 1));
        delaySamplesR = std::clamp(delaySamplesR, 1.0f, static_cast<float>(bufSize - 1));

        float chorusSampleL = readDelayLine(voice.bufferL, voice.writePos, delaySamplesL);
        float chorusSampleR = readDelayLine(voice.bufferR, voice.writePos, delaySamplesR);

        chorusOutL += chorusSampleL;
        chorusOutR += chorusSampleR;

        // Advance write position
        voice.writePos = (voice.writePos + 1) % bufSize;

        // Advance LFO
        voice.lfoPhase += rate / sampleRate_;
        if (voice.lfoPhase >= 1.0) voice.lfoPhase -= 1.0;
    }

    // Normalize
    chorusOutL /= static_cast<float>(voices);
    chorusOutR /= static_cast<float>(voices);

    // Wet/dry mix
    sampleL = sampleL * (1.0f - mix) + chorusOutL * mix;
    sampleR = sampleR * (1.0f - mix) + chorusOutR * mix;
}

// ========================================
// PitchShifter - 2-grain overlap-add pitch shifting
// ========================================

void PassionFXProcessor::processPitchShifter(float& sampleL, float& sampleR) {
    float semitones = pitchShifterSemitones_.load();
    float mix       = pitchShifterMix_.load();

    if (std::abs(semitones) < 0.01f) return; // No shift needed

    float ratio = semitonesToRatio(semitones);
    int bufSize = static_cast<int>(pitchBufferL_.size());

    // Write input to circular buffer
    pitchBufferL_[pitchWritePos_] = sampleL;
    pitchBufferR_[pitchWritePos_] = sampleR;

    float shiftedL = 0.0f;
    float shiftedR = 0.0f;

    // Process each grain
    for (int g = 0; g < NUM_PITCH_GRAINS; ++g) {
        auto& grainL = pitchGrainsL_[g];
        auto& grainR = pitchGrainsR_[g];

        if (!grainL.active) continue;

        // Hann window based on grain phase
        float phase = static_cast<float>(grainL.sampleCount) / static_cast<float>(PITCH_GRAIN_SIZE);
        float window = hannWindow(phase);

        // Read from buffer at grain's read position
        float delayL = static_cast<float>(bufSize) - grainL.readPos;
        float delayR = static_cast<float>(bufSize) - grainR.readPos;
        delayL = std::clamp(delayL, 1.0f, static_cast<float>(bufSize - 1));
        delayR = std::clamp(delayR, 1.0f, static_cast<float>(bufSize - 1));

        shiftedL += readDelayLine(pitchBufferL_, pitchWritePos_, delayL) * window;
        shiftedR += readDelayLine(pitchBufferR_, pitchWritePos_, delayR) * window;

        // Advance read position by pitch ratio
        grainL.readPos += ratio;
        grainR.readPos += ratio;

        // Wrap read position
        while (grainL.readPos >= static_cast<float>(bufSize)) grainL.readPos -= static_cast<float>(bufSize);
        while (grainL.readPos < 0.0f) grainL.readPos += static_cast<float>(bufSize);
        while (grainR.readPos >= static_cast<float>(bufSize)) grainR.readPos -= static_cast<float>(bufSize);
        while (grainR.readPos < 0.0f) grainR.readPos += static_cast<float>(bufSize);

        // Advance grain sample count
        grainL.sampleCount++;
        grainR.sampleCount++;
        if (grainL.sampleCount >= PITCH_GRAIN_SIZE) {
            grainL.sampleCount = 0;
            grainL.readPos = 0.0f;
        }
        if (grainR.sampleCount >= PITCH_GRAIN_SIZE) {
            grainR.sampleCount = 0;
            grainR.readPos = 0.0f;
        }
    }

    // Normalize by number of overlapping grains
    shiftedL /= static_cast<float>(NUM_PITCH_GRAINS) * 0.5f;
    shiftedR /= static_cast<float>(NUM_PITCH_GRAINS) * 0.5f;

    // Advance write position
    pitchWritePos_ = (pitchWritePos_ + 1) % bufSize;

    // Mix
    sampleL = sampleL * (1.0f - mix) + shiftedL * mix;
    sampleR = sampleR * (1.0f - mix) + shiftedR * mix;
}

// ========================================
// Harmonizer - 2-voice pitch shift with detune for thickness
// ========================================

void PassionFXProcessor::processHarmonizer(float& sampleL, float& sampleR) {
    float voice1St   = harmonizerVoice1_.load();
    float voice2St   = harmonizerVoice2_.load();
    float detuneCts  = harmonizerDetune_.load();
    float mix        = harmonizerMix_.load();

    // Add slight detune for richness
    float ratio1 = semitonesToRatio(voice1St + detuneCts / 100.0f);
    float ratio2 = semitonesToRatio(voice2St - detuneCts / 100.0f);

    int bufSize = static_cast<int>(harmBufferL_.size());

    // Write input to circular buffer
    harmBufferL_[harmWritePos_] = sampleL;
    harmBufferR_[harmWritePos_] = sampleR;

    float voice1OutL = 0.0f, voice1OutR = 0.0f;
    float voice2OutL = 0.0f, voice2OutR = 0.0f;

    // Process voice 1 grains
    for (int g = 0; g < NUM_PITCH_GRAINS; ++g) {
        auto& gL = harmGrainsV1L_[g];
        auto& gR = harmGrainsV1R_[g];

        float phase = static_cast<float>(gL.sampleCount) / static_cast<float>(PITCH_GRAIN_SIZE);
        float window = hannWindow(phase);

        float delayL = static_cast<float>(bufSize) - gL.readPos;
        float delayR = static_cast<float>(bufSize) - gR.readPos;
        delayL = std::clamp(delayL, 1.0f, static_cast<float>(bufSize - 1));
        delayR = std::clamp(delayR, 1.0f, static_cast<float>(bufSize - 1));

        voice1OutL += readDelayLine(harmBufferL_, harmWritePos_, delayL) * window;
        voice1OutR += readDelayLine(harmBufferR_, harmWritePos_, delayR) * window;

        gL.readPos += ratio1;
        gR.readPos += ratio1;
        while (gL.readPos >= static_cast<float>(bufSize)) gL.readPos -= static_cast<float>(bufSize);
        while (gL.readPos < 0.0f) gL.readPos += static_cast<float>(bufSize);
        while (gR.readPos >= static_cast<float>(bufSize)) gR.readPos -= static_cast<float>(bufSize);
        while (gR.readPos < 0.0f) gR.readPos += static_cast<float>(bufSize);

        gL.sampleCount++;
        gR.sampleCount++;
        if (gL.sampleCount >= PITCH_GRAIN_SIZE) { gL.sampleCount = 0; gL.readPos = 0.0f; }
        if (gR.sampleCount >= PITCH_GRAIN_SIZE) { gR.sampleCount = 0; gR.readPos = 0.0f; }
    }

    // Process voice 2 grains
    for (int g = 0; g < NUM_PITCH_GRAINS; ++g) {
        auto& gL = harmGrainsV2L_[g];
        auto& gR = harmGrainsV2R_[g];

        float phase = static_cast<float>(gL.sampleCount) / static_cast<float>(PITCH_GRAIN_SIZE);
        float window = hannWindow(phase);

        float delayL = static_cast<float>(bufSize) - gL.readPos;
        float delayR = static_cast<float>(bufSize) - gR.readPos;
        delayL = std::clamp(delayL, 1.0f, static_cast<float>(bufSize - 1));
        delayR = std::clamp(delayR, 1.0f, static_cast<float>(bufSize - 1));

        voice2OutL += readDelayLine(harmBufferL_, harmWritePos_, delayL) * window;
        voice2OutR += readDelayLine(harmBufferR_, harmWritePos_, delayR) * window;

        gL.readPos += ratio2;
        gR.readPos += ratio2;
        while (gL.readPos >= static_cast<float>(bufSize)) gL.readPos -= static_cast<float>(bufSize);
        while (gL.readPos < 0.0f) gL.readPos += static_cast<float>(bufSize);
        while (gR.readPos >= static_cast<float>(bufSize)) gR.readPos -= static_cast<float>(bufSize);
        while (gR.readPos < 0.0f) gR.readPos += static_cast<float>(bufSize);

        gL.sampleCount++;
        gR.sampleCount++;
        if (gL.sampleCount >= PITCH_GRAIN_SIZE) { gL.sampleCount = 0; gL.readPos = 0.0f; }
        if (gR.sampleCount >= PITCH_GRAIN_SIZE) { gR.sampleCount = 0; gR.readPos = 0.0f; }
    }

    // Normalize
    float normFactor = 1.0f / (static_cast<float>(NUM_PITCH_GRAINS) * 0.5f);
    voice1OutL *= normFactor;
    voice1OutR *= normFactor;
    voice2OutL *= normFactor;
    voice2OutR *= normFactor;

    // Advance write position
    harmWritePos_ = (harmWritePos_ + 1) % bufSize;

    // Blend: voice1 slightly left, voice2 slightly right for stereo interest
    float harmL = (voice1OutL * 0.6f + voice2OutL * 0.4f);
    float harmR = (voice1OutR * 0.4f + voice2OutR * 0.6f);

    sampleL = sampleL * (1.0f - mix) + harmL * mix;
    sampleR = sampleR * (1.0f - mix) + harmR * mix;
}

// ========================================
// Delay - Stereo delay with pitch-shifted feedback and freeze
// ========================================

void PassionFXProcessor::processDelay(float& sampleL, float& sampleR) {
    float feedback    = delayFeedback_.load();
    float mix         = delayMix_.load();
    bool  freeze      = delayFreeze_.load();
    float pitchShiftL = delayPitchShiftL_.load();
    float pitchShiftR = delayPitchShiftR_.load();

    float delaySamplesL = smoothedDelayTimeL_.getNextValue();
    float delaySamplesR = smoothedDelayTimeR_.getNextValue();

    int delayBufSize = static_cast<int>(delayBufferL_.size());
    delaySamplesL = std::clamp(delaySamplesL, 1.0f, static_cast<float>(delayBufSize - 1));
    delaySamplesR = std::clamp(delaySamplesR, 1.0f, static_cast<float>(delayBufSize - 1));

    // Read from delay line with linear interpolation
    float delayedL = readDelayLine(delayBufferL_, delayWritePos_, delaySamplesL);
    float delayedR = readDelayLine(delayBufferR_, delayWritePos_, delaySamplesR);

    // Optional pitch shifting in feedback path
    float feedbackL = delayedL;
    float feedbackR = delayedR;

    if (std::abs(pitchShiftL) > 0.01f || std::abs(pitchShiftR) > 0.01f) {
        float ratioL = semitonesToRatio(pitchShiftL);
        float ratioR = semitonesToRatio(pitchShiftR);
        int pitchBufSize = static_cast<int>(delayPitchBufL_.size());

        // Write delayed signal to pitch shift buffer
        delayPitchBufL_[delayPitchWritePos_] = delayedL;
        delayPitchBufR_[delayPitchWritePos_] = delayedR;

        float pitchOutL = 0.0f, pitchOutR = 0.0f;

        for (int g = 0; g < NUM_PITCH_GRAINS; ++g) {
            auto& gL = delayPitchGrainsL_[g];
            auto& gR = delayPitchGrainsR_[g];
            if (!gL.active) continue;

            float phase = static_cast<float>(gL.sampleCount) / static_cast<float>(PITCH_GRAIN_SIZE);
            float window = hannWindow(phase);

            float dL = static_cast<float>(pitchBufSize) - gL.readPos;
            float dR = static_cast<float>(pitchBufSize) - gR.readPos;
            dL = std::clamp(dL, 1.0f, static_cast<float>(pitchBufSize - 1));
            dR = std::clamp(dR, 1.0f, static_cast<float>(pitchBufSize - 1));

            pitchOutL += readDelayLine(delayPitchBufL_, delayPitchWritePos_, dL) * window;
            pitchOutR += readDelayLine(delayPitchBufR_, delayPitchWritePos_, dR) * window;

            gL.readPos += ratioL;
            gR.readPos += ratioR;
            while (gL.readPos >= static_cast<float>(pitchBufSize)) gL.readPos -= static_cast<float>(pitchBufSize);
            while (gL.readPos < 0.0f) gL.readPos += static_cast<float>(pitchBufSize);
            while (gR.readPos >= static_cast<float>(pitchBufSize)) gR.readPos -= static_cast<float>(pitchBufSize);
            while (gR.readPos < 0.0f) gR.readPos += static_cast<float>(pitchBufSize);

            gL.sampleCount++;
            gR.sampleCount++;
            if (gL.sampleCount >= PITCH_GRAIN_SIZE) { gL.sampleCount = 0; gL.readPos = 0.0f; }
            if (gR.sampleCount >= PITCH_GRAIN_SIZE) { gR.sampleCount = 0; gR.readPos = 0.0f; }
        }

        float normFactor = 1.0f / (static_cast<float>(NUM_PITCH_GRAINS) * 0.5f);
        pitchOutL *= normFactor;
        pitchOutR *= normFactor;

        delayPitchWritePos_ = (delayPitchWritePos_ + 1) % pitchBufSize;

        feedbackL = pitchOutL;
        feedbackR = pitchOutR;
    }

    // Write to delay buffer: input + feedback
    if (!freeze) {
        delayBufferL_[delayWritePos_] = sampleL + feedbackL * feedback;
        delayBufferR_[delayWritePos_] = sampleR + feedbackR * feedback;
    }
    // When frozen, don't write new input -- feedback path recirculates

    delayWritePos_ = (delayWritePos_ + 1) % delayBufSize;

    // Mix
    sampleL = sampleL * (1.0f - mix) + delayedL * mix;
    sampleR = sampleR * (1.0f - mix) + delayedR * mix;

    meterDelayL_.store(linearToDb(std::abs(delayedL)));
    meterDelayR_.store(linearToDb(std::abs(delayedR)));
}

// ========================================
// Reverb - FDN with Hadamard mixing, shimmer, and freeze
// ========================================

void PassionFXProcessor::processReverb(float& sampleL, float& sampleR) {
    int   type          = reverbType_.load();
    float decaySec      = reverbDecay_.load();
    float shimmerAmt    = reverbShimmerAmount_.load();
    float shimmerSt     = reverbShimmerInterval_.load();
    float mix           = reverbMix_.load();
    bool  freeze        = reverbFreeze_.load();

    // Reverb type affects pre-delay and damping
    float damping = 0.5f;
    switch (type) {
        case 0: damping = 0.7f; break;  // Room
        case 1: damping = 0.5f; break;  // Hall
        case 2: damping = 0.3f; break;  // Plate
        case 3: damping = 0.4f; break;  // Cathedral
        case 4: damping = 0.1f; break;  // Infinite
        default: break;
    }

    // Calculate FDN feedback gain from decay time
    // feedback_i = 10^(-3 * delay_i / (T60 * sampleRate))
    // For freeze mode, set feedback to ~1.0
    float avgDelay = 2100.0f * static_cast<float>(sampleRate_) / 48000.0f;
    float reverbFeedback;
    if (freeze || type == 4) {
        reverbFeedback = 0.999f;
        damping = 0.05f; // Minimal damping for freeze/infinite
    } else {
        reverbFeedback = std::pow(10.0f, -3.0f * avgDelay / (decaySec * static_cast<float>(sampleRate_)));
        reverbFeedback = std::clamp(reverbFeedback, 0.0f, 0.995f);
    }

    // Input diffusion
    float reverbInL = sampleL;
    float reverbInR = sampleR;

    if (!freeze) {
        for (auto& diff : reverbDiffusersL_)
            reverbInL = diff.process(reverbInL);
        for (auto& diff : reverbDiffusersR_)
            reverbInR = diff.process(reverbInR);
    }

    // ---- FDN with inline 8-point Hadamard mixing ----
    // Read all tap outputs first
    std::array<float, NUM_REVERB_TAPS> tapOutL, tapOutR;

    for (int t = 0; t < NUM_REVERB_TAPS; ++t) {
        auto& tapL = reverbTapsL_[t];
        auto& tapR = reverbTapsR_[t];

        // Modulated read position for chorus-like smearing
        float modL = static_cast<float>(std::sin(tapL.modPhase * 2.0 * juce::MathConstants<double>::pi));
        float modR = static_cast<float>(std::sin(tapR.modPhase * 2.0 * juce::MathConstants<double>::pi));

        int modDelayL = tapL.delaySamples + static_cast<int>(modL * 15.0f);
        int modDelayR = tapR.delaySamples + static_cast<int>(modR * 15.0f);
        modDelayL = std::clamp(modDelayL, 1, static_cast<int>(tapL.buffer.size()) - 1);
        modDelayR = std::clamp(modDelayR, 1, static_cast<int>(tapR.buffer.size()) - 1);

        int readPosL = tapL.writePos - modDelayL;
        if (readPosL < 0) readPosL += static_cast<int>(tapL.buffer.size());
        int readPosR = tapR.writePos - modDelayR;
        if (readPosR < 0) readPosR += static_cast<int>(tapR.buffer.size());

        float rawL = tapL.buffer[readPosL];
        float rawR = tapR.buffer[readPosR];

        // One-pole damping lowpass
        tapL.lowpassState += damping * (rawL - tapL.lowpassState);
        tapR.lowpassState += damping * (rawR - tapR.lowpassState);

        tapOutL[t] = rawL * (1.0f - damping) + tapL.lowpassState * damping;
        tapOutR[t] = rawR * (1.0f - damping) + tapR.lowpassState * damping;
    }

    // Inline 8-point Hadamard transform for cross-coupling
    // H_8 = H_2 (x) H_2 (x) H_2  (Kronecker product)
    // Implemented as 3 stages of butterfly operations
    std::array<float, NUM_REVERB_TAPS> hadL, hadR;

    // Copy for in-place transform
    for (int i = 0; i < NUM_REVERB_TAPS; ++i) {
        hadL[i] = tapOutL[i];
        hadR[i] = tapOutR[i];
    }

    // Stage 1: pairs (0,1), (2,3), (4,5), (6,7)
    for (int i = 0; i < NUM_REVERB_TAPS; i += 2) {
        float aL = hadL[i], bL = hadL[i + 1];
        hadL[i]     = aL + bL;
        hadL[i + 1] = aL - bL;
        float aR = hadR[i], bR = hadR[i + 1];
        hadR[i]     = aR + bR;
        hadR[i + 1] = aR - bR;
    }

    // Stage 2: pairs (0,2), (1,3), (4,6), (5,7)
    for (int i = 0; i < NUM_REVERB_TAPS; i += 4) {
        for (int j = 0; j < 2; ++j) {
            float aL = hadL[i + j], bL = hadL[i + j + 2];
            hadL[i + j]     = aL + bL;
            hadL[i + j + 2] = aL - bL;
            float aR = hadR[i + j], bR = hadR[i + j + 2];
            hadR[i + j]     = aR + bR;
            hadR[i + j + 2] = aR - bR;
        }
    }

    // Stage 3: pairs (0,4), (1,5), (2,6), (3,7)
    for (int j = 0; j < 4; ++j) {
        float aL = hadL[j], bL = hadL[j + 4];
        hadL[j]     = aL + bL;
        hadL[j + 4] = aL - bL;
        float aR = hadR[j], bR = hadR[j + 4];
        hadR[j]     = aR + bR;
        hadR[j + 4] = aR - bR;
    }

    // Normalize Hadamard: divide by sqrt(8)
    constexpr float hadNorm = 1.0f / 2.828427f; // 1/sqrt(8)
    for (int i = 0; i < NUM_REVERB_TAPS; ++i) {
        hadL[i] *= hadNorm;
        hadR[i] *= hadNorm;
    }

    // Write back to taps: input + Hadamard-mixed feedback
    for (int t = 0; t < NUM_REVERB_TAPS; ++t) {
        auto& tapL = reverbTapsL_[t];
        auto& tapR = reverbTapsR_[t];

        float writeL = reverbInL + hadL[t] * reverbFeedback;
        float writeR = reverbInR + hadR[t] * reverbFeedback;

        // Soft clip to prevent runaway in freeze mode
        writeL = std::tanh(writeL);
        writeR = std::tanh(writeR);

        tapL.buffer[tapL.writePos] = writeL;
        tapR.buffer[tapR.writePos] = writeR;

        tapL.writePos = (tapL.writePos + 1) % static_cast<int>(tapL.buffer.size());
        tapR.writePos = (tapR.writePos + 1) % static_cast<int>(tapR.buffer.size());

        // Advance modulation
        tapL.modPhase += 0.1 / sampleRate_;
        if (tapL.modPhase >= 1.0) tapL.modPhase -= 1.0;
        tapR.modPhase += 0.1 / sampleRate_;
        if (tapR.modPhase >= 1.0) tapR.modPhase -= 1.0;
    }

    // Accumulate reverb output from all taps
    float reverbOutL = 0.0f, reverbOutR = 0.0f;
    for (int t = 0; t < NUM_REVERB_TAPS; ++t) {
        reverbOutL += tapOutL[t];
        reverbOutR += tapOutR[t];
    }
    reverbOutL /= static_cast<float>(NUM_REVERB_TAPS) * 0.5f;
    reverbOutR /= static_cast<float>(NUM_REVERB_TAPS) * 0.5f;

    // ---- Shimmer: granular pitch shift on reverb output ----
    if (shimmerAmt > 0.0f) {
        float shimmerRatio = semitonesToRatio(shimmerSt);
        int shimBufSize = static_cast<int>(shimmerBufferL_.size());

        // Feed reverb output + shimmer feedback into shimmer buffer
        float shimmerInL = reverbOutL + shimmerFeedbackL_ * shimmerAmt * 0.5f;
        float shimmerInR = reverbOutR + shimmerFeedbackR_ * shimmerAmt * 0.5f;

        shimmerBufferL_[shimmerWritePos_] = shimmerInL;
        shimmerBufferR_[shimmerWritePos_] = shimmerInR;

        float shimOutL = 0.0f, shimOutR = 0.0f;

        for (int g = 0; g < NUM_PITCH_GRAINS; ++g) {
            auto& gL = shimmerGrainsL_[g];
            auto& gR = shimmerGrainsR_[g];
            if (!gL.active) continue;

            float phase = static_cast<float>(gL.sampleCount) / static_cast<float>(PITCH_GRAIN_SIZE);
            float window = hannWindow(phase);

            float dL = static_cast<float>(shimBufSize) - gL.readPos;
            float dR = static_cast<float>(shimBufSize) - gR.readPos;
            dL = std::clamp(dL, 1.0f, static_cast<float>(shimBufSize - 1));
            dR = std::clamp(dR, 1.0f, static_cast<float>(shimBufSize - 1));

            shimOutL += readDelayLine(shimmerBufferL_, shimmerWritePos_, dL) * window;
            shimOutR += readDelayLine(shimmerBufferR_, shimmerWritePos_, dR) * window;

            gL.readPos += shimmerRatio;
            gR.readPos += shimmerRatio;
            while (gL.readPos >= static_cast<float>(shimBufSize)) gL.readPos -= static_cast<float>(shimBufSize);
            while (gL.readPos < 0.0f) gL.readPos += static_cast<float>(shimBufSize);
            while (gR.readPos >= static_cast<float>(shimBufSize)) gR.readPos -= static_cast<float>(shimBufSize);
            while (gR.readPos < 0.0f) gR.readPos += static_cast<float>(shimBufSize);

            gL.sampleCount++;
            gR.sampleCount++;
            if (gL.sampleCount >= PITCH_GRAIN_SIZE) { gL.sampleCount = 0; gL.readPos = 0.0f; }
            if (gR.sampleCount >= PITCH_GRAIN_SIZE) { gR.sampleCount = 0; gR.readPos = 0.0f; }
        }

        float normFactor = 1.0f / (static_cast<float>(NUM_PITCH_GRAINS) * 0.5f);
        shimOutL *= normFactor;
        shimOutR *= normFactor;

        shimmerWritePos_ = (shimmerWritePos_ + 1) % shimBufSize;

        // Store shimmer feedback for recirculation
        shimmerFeedbackL_ = shimOutL;
        shimmerFeedbackR_ = shimOutR;

        // Blend shimmer into reverb output
        reverbOutL += shimOutL * shimmerAmt;
        reverbOutR += shimOutR * shimmerAmt;
    }

    // Mix reverb with dry
    sampleL = sampleL * (1.0f - mix) + reverbOutL * mix;
    sampleR = sampleR * (1.0f - mix) + reverbOutR * mix;

    meterReverbL_.store(linearToDb(std::abs(reverbOutL)));
    meterReverbR_.store(linearToDb(std::abs(reverbOutR)));
}

// ========================================
// EQ - 3-band parametric (low shelf, mid peak, high shelf) with tilt
// ========================================

void PassionFXProcessor::processEQ(float& sampleL, float& sampleR) {
    sampleL = eqLowL_.processSample(sampleL);
    sampleL = eqMidL_.processSample(sampleL);
    sampleL = eqHighL_.processSample(sampleL);

    sampleR = eqLowR_.processSample(sampleR);
    sampleR = eqMidR_.processSample(sampleR);
    sampleR = eqHighR_.processSample(sampleR);
}

// ========================================
// Exciter - Multi-band saturation for warmth, presence, and air
// ========================================

void PassionFXProcessor::processExciter(float& sampleL, float& sampleR) {
    float warmth   = exciterWarmth_.load();
    float presence = exciterPresence_.load();
    float air      = exciterAir_.load();

    // Split into bands using the exciter filters
    float lowL = exciterLowL_.processSample(sampleL);
    float lowR = exciterLowR_.processSample(sampleR);
    float midL = exciterMidL_.processSample(sampleL);
    float midR = exciterMidR_.processSample(sampleR);
    float highL = exciterHighL_.processSample(sampleL);
    float highR = exciterHighR_.processSample(sampleR);

    // Apply soft saturation to each band proportional to its exciter amount
    if (warmth > 0.0f) {
        float driveW = 1.0f + warmth * 3.0f;
        lowL = std::tanh(lowL * driveW) / driveW;
        lowR = std::tanh(lowR * driveW) / driveW;
    }

    if (presence > 0.0f) {
        float driveP = 1.0f + presence * 4.0f;
        midL = std::tanh(midL * driveP) / driveP;
        midR = std::tanh(midR * driveP) / driveP;
    }

    if (air > 0.0f) {
        float driveA = 1.0f + air * 5.0f;
        highL = std::tanh(highL * driveA) / driveA;
        highR = std::tanh(highR * driveA) / driveA;
    }

    // Blend excited bands back with dry signal
    sampleL += lowL * warmth * 0.3f + midL * presence * 0.4f + highL * air * 0.5f;
    sampleR += lowR * warmth * 0.3f + midR * presence * 0.4f + highR * air * 0.5f;
}

// ========================================
// Tremolo - Amplitude modulation with multiple waveforms
// ========================================

void PassionFXProcessor::processTremolo(float& sampleL, float& sampleR) {
    float rate     = tremoloRate_.load();
    float depth    = tremoloDepth_.load();
    int   waveform = tremoloWaveform_.load();

    // Generate LFO sample based on waveform type
    float lfo = generateLfoSample(tremoloLfoPhase_, waveform);

    // Tremolo: modulate amplitude between (1-depth) and 1
    float gain = 1.0f - depth * (0.5f + 0.5f * lfo);

    sampleL *= gain;
    sampleR *= gain;

    // Advance LFO phase
    tremoloLfoPhase_ += rate / sampleRate_;
    if (tremoloLfoPhase_ >= 1.0) tremoloLfoPhase_ -= 1.0;

    meterTremoloPhase_.store(static_cast<float>(tremoloLfoPhase_));
}

// ========================================
// Update EQ filter coefficients
// ========================================

void PassionFXProcessor::updateEQ() {
    float lowGain  = eqLowGain_.load();
    float midGain  = eqMidGain_.load();
    float highGain = eqHighGain_.load();
    float tilt     = eqTilt_.load();

    // Apply tilt: shifts gain balance between low and high
    float tiltLow  = lowGain  + tilt * 3.0f;   // Tilt adds up to 3dB
    float tiltHigh = highGain - tilt * 3.0f;

    // Low shelf at 250 Hz
    auto lowCoeffs = juce::dsp::IIR::Coefficients<float>::makeLowShelf(
        sampleRate_, 250.0f, 0.707f, dbToLinear(tiltLow));
    *eqLowL_.coefficients = *lowCoeffs;
    *eqLowR_.coefficients = *lowCoeffs;

    // Mid peak at 1kHz, Q=1.0
    auto midCoeffs = juce::dsp::IIR::Coefficients<float>::makePeakFilter(
        sampleRate_, 1000.0f, 1.0f, dbToLinear(midGain));
    *eqMidL_.coefficients = *midCoeffs;
    *eqMidR_.coefficients = *midCoeffs;

    // High shelf at 4kHz
    auto highCoeffs = juce::dsp::IIR::Coefficients<float>::makeHighShelf(
        sampleRate_, 4000.0f, 0.707f, dbToLinear(tiltHigh));
    *eqHighL_.coefficients = *highCoeffs;
    *eqHighR_.coefficients = *highCoeffs;
}

// ========================================
// Update Exciter filter coefficients (band-split filters)
// ========================================

void PassionFXProcessor::updateExciterFilters() {
    // Low band: lowpass at 300Hz for warmth
    auto lowCoeffs = juce::dsp::IIR::Coefficients<float>::makeLowPass(sampleRate_, 300.0f);
    *exciterLowL_.coefficients = *lowCoeffs;
    *exciterLowR_.coefficients = *lowCoeffs;

    // Mid band: bandpass approximation at 2kHz for presence
    // Using a peak filter with narrow Q as bandpass approximation
    auto midCoeffs = juce::dsp::IIR::Coefficients<float>::makePeakFilter(
        sampleRate_, 2000.0f, 2.0f, 1.0f);
    *exciterMidL_.coefficients = *midCoeffs;
    *exciterMidR_.coefficients = *midCoeffs;

    // High band: highpass at 6kHz for air
    auto highCoeffs = juce::dsp::IIR::Coefficients<float>::makeHighPass(sampleRate_, 6000.0f);
    *exciterHighL_.coefficients = *highCoeffs;
    *exciterHighR_.coefficients = *highCoeffs;
}

// ========================================
// Utility Methods
// ========================================

float PassionFXProcessor::readDelayLine(const std::vector<float>& buffer, int writePos, float delaySamples) const {
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

float PassionFXProcessor::hannWindow(float phase) const {
    return 0.5f * (1.0f - std::cos(2.0f * juce::MathConstants<float>::pi * phase));
}

float PassionFXProcessor::semitonesToRatio(float semitones) const {
    return std::pow(2.0f, semitones / 12.0f);
}

float PassionFXProcessor::generateLfoSample(double phase, int waveform) const {
    switch (waveform) {
        case 0: // Sine
            return static_cast<float>(std::sin(phase * 2.0 * juce::MathConstants<double>::pi));

        case 1: { // Triangle
            float p = static_cast<float>(phase);
            return (p < 0.25f) ? (p * 4.0f) :
                   (p < 0.75f) ? (2.0f - p * 4.0f) :
                                 (p * 4.0f - 4.0f);
        }

        case 2: // Square
            return (phase < 0.5) ? 1.0f : -1.0f;

        case 3: // Sawtooth
            return static_cast<float>(2.0 * phase - 1.0);

        case 4: { // Sample & Hold
            // Update S&H value at LFO rate boundaries
            // Approximation: check if phase wrapped around
            if (phase < 0.01) {
                // Use a simple pseudo-random based on phase
                // This will be called once per LFO cycle approximately
            }
            // For S&H, we return the held value which should be updated
            // in processTremolo's phase advancement. Use a deterministic approach.
            float p = static_cast<float>(phase);
            // Hash the integer part of (phase * 16) for stepped random
            int bucket = static_cast<int>(p * 16.0f);
            float hash = std::sin(static_cast<float>(bucket) * 127.1f) * 43758.5453f;
            hash = hash - std::floor(hash); // fract
            return hash * 2.0f - 1.0f;
        }

        case 5: { // Trapezoid
            float p = static_cast<float>(phase);
            if (p < 0.2f) return p * 5.0f;
            if (p < 0.3f) return 1.0f;
            if (p < 0.5f) return 1.0f - (p - 0.3f) * 5.0f;
            if (p < 0.7f) return (0.5f - p) * 5.0f;
            if (p < 0.8f) return -1.0f;
            return -1.0f + (p - 0.8f) * 5.0f;
        }

        default:
            return static_cast<float>(std::sin(phase * 2.0 * juce::MathConstants<double>::pi));
    }
}

float PassionFXProcessor::linearToDb(float linear) {
    if (linear <= 0.0f) return -100.0f;
    return 20.0f * std::log10(linear);
}

float PassionFXProcessor::dbToLinear(float db) {
    return std::pow(10.0f, db / 20.0f);
}

float PassionFXProcessor::calculatePeakLevel(const float* data, int numSamples) {
    float peak = 0.0f;
    for (int i = 0; i < numSamples; ++i) {
        float abs = std::abs(data[i]);
        if (abs > peak) peak = abs;
    }
    return linearToDb(peak);
}

// ========================================
// Parameter Setters (RT-safe, clamp & store to atomic)
// ========================================

void PassionFXProcessor::setNoiseGateEnabled(bool enabled) {
    noiseGateEnabled_.store(enabled);
}

void PassionFXProcessor::setNoiseGateThreshold(float dB) {
    noiseGateThreshold_.store(std::clamp(dB, -80.0f, 0.0f));
}

void PassionFXProcessor::setNoiseGateRelease(float ms) {
    noiseGateRelease_.store(std::clamp(ms, 5.0f, 2000.0f));
}

void PassionFXProcessor::setCompressorEnabled(bool enabled) {
    compressorEnabled_.store(enabled);
}

void PassionFXProcessor::setCompressorThreshold(float dB) {
    compressorThreshold_.store(std::clamp(dB, -60.0f, 0.0f));
}

void PassionFXProcessor::setCompressorRatio(float ratio) {
    compressorRatio_.store(std::clamp(ratio, 1.0f, 20.0f));
}

void PassionFXProcessor::setCompressorAttack(float ms) {
    compressorAttack_.store(std::clamp(ms, 0.01f, 300.0f));
}

void PassionFXProcessor::setCompressorRelease(float ms) {
    compressorRelease_.store(std::clamp(ms, 10.0f, 3000.0f));
}

void PassionFXProcessor::setCompressorGlassy(bool glassy) {
    compressorGlassy_.store(glassy);
}

void PassionFXProcessor::setWahEnabled(bool enabled) {
    wahEnabled_.store(enabled);
}

void PassionFXProcessor::setWahMode(int mode) {
    wahMode_.store(std::clamp(mode, 0, 2));
}

void PassionFXProcessor::setWahPosition(float position) {
    wahPosition_.store(std::clamp(position, 0.0f, 1.0f));
}

void PassionFXProcessor::setWahQ(float q) {
    wahQ_.store(std::clamp(q, 1.0f, 15.0f));
}

void PassionFXProcessor::setPhaserEnabled(bool enabled) {
    phaserEnabled_.store(enabled);
}

void PassionFXProcessor::setPhaserRate(float hz) {
    phaserRate_.store(std::clamp(hz, 0.05f, 10.0f));
}

void PassionFXProcessor::setPhaserDepth(float depth) {
    phaserDepth_.store(std::clamp(depth, 0.0f, 1.0f));
}

void PassionFXProcessor::setPhaserStages(int stages) {
    phaserStages_.store(std::clamp(stages, 2, NUM_PHASER_STAGES_MAX));
}

void PassionFXProcessor::setPhaserFeedback(float feedback) {
    phaserFeedback_.store(std::clamp(feedback, -0.95f, 0.95f));
}

void PassionFXProcessor::setChorusEnabled(bool enabled) {
    chorusEnabled_.store(enabled);
}

void PassionFXProcessor::setChorusRate(float hz) {
    chorusRate_.store(std::clamp(hz, 0.1f, 5.0f));
}

void PassionFXProcessor::setChorusDepth(float depth) {
    chorusDepth_.store(std::clamp(depth, 0.0f, 1.0f));
}

void PassionFXProcessor::setChorusVoices(int voices) {
    chorusVoices_.store(std::clamp(voices, 1, MAX_CHORUS_VOICES));
}

void PassionFXProcessor::setChorusMix(float mix) {
    chorusMix_.store(std::clamp(mix, 0.0f, 1.0f));
}

void PassionFXProcessor::setPitchShifterEnabled(bool enabled) {
    pitchShifterEnabled_.store(enabled);
}

void PassionFXProcessor::setPitchShifterSemitones(float semitones) {
    pitchShifterSemitones_.store(std::clamp(semitones, -36.0f, 36.0f));
}

void PassionFXProcessor::setPitchShifterMix(float mix) {
    pitchShifterMix_.store(std::clamp(mix, 0.0f, 1.0f));
}

void PassionFXProcessor::setHarmonizerEnabled(bool enabled) {
    harmonizerEnabled_.store(enabled);
}

void PassionFXProcessor::setHarmonizerVoice1(float semitones) {
    harmonizerVoice1_.store(std::clamp(semitones, -12.0f, 12.0f));
}

void PassionFXProcessor::setHarmonizerVoice2(float semitones) {
    harmonizerVoice2_.store(std::clamp(semitones, -12.0f, 12.0f));
}

void PassionFXProcessor::setHarmonizerDetune(float cents) {
    harmonizerDetune_.store(std::clamp(cents, 0.0f, 25.0f));
}

void PassionFXProcessor::setHarmonizerMix(float mix) {
    harmonizerMix_.store(std::clamp(mix, 0.0f, 1.0f));
}

void PassionFXProcessor::setDelayEnabled(bool enabled) {
    delayEnabled_.store(enabled);
}

void PassionFXProcessor::setDelayTimeL(float ms) {
    delayTimeL_.store(std::clamp(ms, 1.0f, 8000.0f));
}

void PassionFXProcessor::setDelayTimeR(float ms) {
    delayTimeR_.store(std::clamp(ms, 1.0f, 8000.0f));
}

void PassionFXProcessor::setDelayFeedback(float feedback) {
    delayFeedback_.store(std::clamp(feedback, 0.0f, 0.95f));
}

void PassionFXProcessor::setDelayMix(float mix) {
    delayMix_.store(std::clamp(mix, 0.0f, 1.0f));
}

void PassionFXProcessor::setDelayFreeze(bool freeze) {
    delayFreeze_.store(freeze);
}

void PassionFXProcessor::setDelayPitchShiftL(float semitones) {
    delayPitchShiftL_.store(std::clamp(semitones, -12.0f, 12.0f));
}

void PassionFXProcessor::setDelayPitchShiftR(float semitones) {
    delayPitchShiftR_.store(std::clamp(semitones, -12.0f, 12.0f));
}

void PassionFXProcessor::setReverbEnabled(bool enabled) {
    reverbEnabled_.store(enabled);
}

void PassionFXProcessor::setReverbType(int type) {
    reverbType_.store(std::clamp(type, 0, 4));
}

void PassionFXProcessor::setReverbDecay(float seconds) {
    reverbDecay_.store(std::clamp(seconds, 0.1f, 30.0f));
}

void PassionFXProcessor::setReverbShimmerAmount(float amount) {
    reverbShimmerAmount_.store(std::clamp(amount, 0.0f, 1.0f));
}

void PassionFXProcessor::setReverbShimmerInterval(float semitones) {
    reverbShimmerInterval_.store(std::clamp(semitones, -24.0f, 24.0f));
}

void PassionFXProcessor::setReverbMix(float mix) {
    reverbMix_.store(std::clamp(mix, 0.0f, 1.0f));
}

void PassionFXProcessor::setReverbFreeze(bool freeze) {
    reverbFreeze_.store(freeze);
}

void PassionFXProcessor::setEqEnabled(bool enabled) {
    eqEnabled_.store(enabled);
}

void PassionFXProcessor::setEqLowGain(float dB) {
    eqLowGain_.store(std::clamp(dB, -12.0f, 12.0f));
    eqNeedsUpdate_.store(true);
}

void PassionFXProcessor::setEqMidGain(float dB) {
    eqMidGain_.store(std::clamp(dB, -12.0f, 12.0f));
    eqNeedsUpdate_.store(true);
}

void PassionFXProcessor::setEqHighGain(float dB) {
    eqHighGain_.store(std::clamp(dB, -12.0f, 12.0f));
    eqNeedsUpdate_.store(true);
}

void PassionFXProcessor::setEqTilt(float tilt) {
    eqTilt_.store(std::clamp(tilt, -1.0f, 1.0f));
    eqNeedsUpdate_.store(true);
}

void PassionFXProcessor::setExciterEnabled(bool enabled) {
    exciterEnabled_.store(enabled);
}

void PassionFXProcessor::setExciterWarmth(float warmth) {
    exciterWarmth_.store(std::clamp(warmth, 0.0f, 1.0f));
}

void PassionFXProcessor::setExciterPresence(float presence) {
    exciterPresence_.store(std::clamp(presence, 0.0f, 1.0f));
}

void PassionFXProcessor::setExciterAir(float air) {
    exciterAir_.store(std::clamp(air, 0.0f, 1.0f));
}

void PassionFXProcessor::setTremoloEnabled(bool enabled) {
    tremoloEnabled_.store(enabled);
}

void PassionFXProcessor::setTremoloRate(float hz) {
    tremoloRate_.store(std::clamp(hz, 0.5f, 20.0f));
}

void PassionFXProcessor::setTremoloDepth(float depth) {
    tremoloDepth_.store(std::clamp(depth, 0.0f, 1.0f));
}

void PassionFXProcessor::setTremoloWaveform(int waveform) {
    tremoloWaveform_.store(std::clamp(waveform, 0, 5));
}

void PassionFXProcessor::setGlobalMix(float mix) {
    globalMix_.store(std::clamp(mix, 0.0f, 1.0f));
}

void PassionFXProcessor::setOutputLevel(float dB) {
    outputLevel_.store(std::clamp(dB, -24.0f, 12.0f));
}

void PassionFXProcessor::setBypass(bool bypass) {
    bypass_.store(bypass);
}

// ========================================
// Preset Management
// ========================================

void PassionFXProcessor::setPreset(Preset preset) {
    preset_.store(preset);
    applyPreset(preset);
}

void PassionFXProcessor::applyPreset(Preset preset) {
    switch (preset) {
        case Preset::Manual:
            break;

        case Preset::Liberty:
            // Liberty - soaring clean lead with chorus and delay
            noiseGateEnabled_.store(true);
            noiseGateThreshold_.store(-50.0f);
            noiseGateRelease_.store(80.0f);
            compressorEnabled_.store(true);
            compressorThreshold_.store(-15.0f);
            compressorRatio_.store(3.0f);
            compressorAttack_.store(5.0f);
            compressorRelease_.store(150.0f);
            compressorGlassy_.store(true);
            wahEnabled_.store(false);
            phaserEnabled_.store(false);
            chorusEnabled_.store(true);
            chorusRate_.store(0.7f);
            chorusDepth_.store(0.4f);
            chorusVoices_.store(3);
            chorusMix_.store(0.35f);
            pitchShifterEnabled_.store(false);
            harmonizerEnabled_.store(false);
            delayEnabled_.store(true);
            delayTimeL_.store(350.0f);
            delayTimeR_.store(470.0f);
            delayFeedback_.store(0.3f);
            delayMix_.store(0.3f);
            delayFreeze_.store(false);
            delayPitchShiftL_.store(0.0f);
            delayPitchShiftR_.store(0.0f);
            reverbEnabled_.store(true);
            reverbType_.store(1); // Hall
            reverbDecay_.store(3.0f);
            reverbShimmerAmount_.store(0.15f);
            reverbShimmerInterval_.store(12.0f);
            reverbMix_.store(0.25f);
            reverbFreeze_.store(false);
            eqEnabled_.store(true);
            eqLowGain_.store(-2.0f);
            eqMidGain_.store(1.0f);
            eqHighGain_.store(3.0f);
            eqTilt_.store(0.2f);
            exciterEnabled_.store(true);
            exciterWarmth_.store(0.2f);
            exciterPresence_.store(0.4f);
            exciterAir_.store(0.3f);
            tremoloEnabled_.store(false);
            eqNeedsUpdate_.store(true);
            exciterNeedsUpdate_.store(true);
            break;

        case Preset::EroticNightmares:
            // Erotic Nightmares - aggressive, dark, phased
            noiseGateEnabled_.store(true);
            noiseGateThreshold_.store(-45.0f);
            noiseGateRelease_.store(60.0f);
            compressorEnabled_.store(true);
            compressorThreshold_.store(-12.0f);
            compressorRatio_.store(6.0f);
            compressorAttack_.store(2.0f);
            compressorRelease_.store(80.0f);
            compressorGlassy_.store(false);
            wahEnabled_.store(false);
            phaserEnabled_.store(true);
            phaserRate_.store(0.3f);
            phaserDepth_.store(0.7f);
            phaserStages_.store(8);
            phaserFeedback_.store(0.5f);
            chorusEnabled_.store(false);
            pitchShifterEnabled_.store(false);
            harmonizerEnabled_.store(false);
            delayEnabled_.store(true);
            delayTimeL_.store(250.0f);
            delayTimeR_.store(375.0f);
            delayFeedback_.store(0.4f);
            delayMix_.store(0.25f);
            delayFreeze_.store(false);
            delayPitchShiftL_.store(0.0f);
            delayPitchShiftR_.store(0.0f);
            reverbEnabled_.store(true);
            reverbType_.store(0); // Room
            reverbDecay_.store(1.5f);
            reverbShimmerAmount_.store(0.0f);
            reverbShimmerInterval_.store(12.0f);
            reverbMix_.store(0.2f);
            reverbFreeze_.store(false);
            eqEnabled_.store(true);
            eqLowGain_.store(3.0f);
            eqMidGain_.store(2.0f);
            eqHighGain_.store(-2.0f);
            eqTilt_.store(-0.3f);
            exciterEnabled_.store(false);
            tremoloEnabled_.store(false);
            eqNeedsUpdate_.store(true);
            break;

        case Preset::TheAnimal:
            // The Animal - raw, primal overdrive feel
            noiseGateEnabled_.store(true);
            noiseGateThreshold_.store(-40.0f);
            noiseGateRelease_.store(50.0f);
            compressorEnabled_.store(true);
            compressorThreshold_.store(-10.0f);
            compressorRatio_.store(8.0f);
            compressorAttack_.store(1.0f);
            compressorRelease_.store(60.0f);
            compressorGlassy_.store(false);
            wahEnabled_.store(true);
            wahMode_.store(2); // Envelope
            wahPosition_.store(0.5f);
            wahQ_.store(6.0f);
            phaserEnabled_.store(false);
            chorusEnabled_.store(false);
            pitchShifterEnabled_.store(false);
            harmonizerEnabled_.store(false);
            delayEnabled_.store(true);
            delayTimeL_.store(180.0f);
            delayTimeR_.store(180.0f);
            delayFeedback_.store(0.2f);
            delayMix_.store(0.15f);
            delayFreeze_.store(false);
            delayPitchShiftL_.store(0.0f);
            delayPitchShiftR_.store(0.0f);
            reverbEnabled_.store(true);
            reverbType_.store(0); // Room
            reverbDecay_.store(1.0f);
            reverbShimmerAmount_.store(0.0f);
            reverbShimmerInterval_.store(12.0f);
            reverbMix_.store(0.15f);
            reverbFreeze_.store(false);
            eqEnabled_.store(true);
            eqLowGain_.store(2.0f);
            eqMidGain_.store(4.0f);
            eqHighGain_.store(1.0f);
            eqTilt_.store(-0.2f);
            exciterEnabled_.store(true);
            exciterWarmth_.store(0.6f);
            exciterPresence_.store(0.5f);
            exciterAir_.store(0.1f);
            tremoloEnabled_.store(false);
            eqNeedsUpdate_.store(true);
            exciterNeedsUpdate_.store(true);
            break;

        case Preset::Answers:
            // Answers - emotional ballad shimmer
            noiseGateEnabled_.store(false);
            compressorEnabled_.store(true);
            compressorThreshold_.store(-20.0f);
            compressorRatio_.store(2.5f);
            compressorAttack_.store(15.0f);
            compressorRelease_.store(200.0f);
            compressorGlassy_.store(true);
            wahEnabled_.store(false);
            phaserEnabled_.store(false);
            chorusEnabled_.store(true);
            chorusRate_.store(0.5f);
            chorusDepth_.store(0.3f);
            chorusVoices_.store(4);
            chorusMix_.store(0.3f);
            pitchShifterEnabled_.store(false);
            harmonizerEnabled_.store(false);
            delayEnabled_.store(true);
            delayTimeL_.store(500.0f);
            delayTimeR_.store(750.0f);
            delayFeedback_.store(0.35f);
            delayMix_.store(0.35f);
            delayFreeze_.store(false);
            delayPitchShiftL_.store(0.0f);
            delayPitchShiftR_.store(0.0f);
            reverbEnabled_.store(true);
            reverbType_.store(1); // Hall
            reverbDecay_.store(5.0f);
            reverbShimmerAmount_.store(0.4f);
            reverbShimmerInterval_.store(12.0f);
            reverbMix_.store(0.4f);
            reverbFreeze_.store(false);
            eqEnabled_.store(true);
            eqLowGain_.store(-1.0f);
            eqMidGain_.store(0.0f);
            eqHighGain_.store(2.0f);
            eqTilt_.store(0.3f);
            exciterEnabled_.store(true);
            exciterWarmth_.store(0.1f);
            exciterPresence_.store(0.3f);
            exciterAir_.store(0.5f);
            tremoloEnabled_.store(false);
            eqNeedsUpdate_.store(true);
            exciterNeedsUpdate_.store(true);
            break;

        case Preset::TheRiddle:
            // The Riddle - mysterious, phased
            noiseGateEnabled_.store(true);
            noiseGateThreshold_.store(-50.0f);
            noiseGateRelease_.store(100.0f);
            compressorEnabled_.store(true);
            compressorThreshold_.store(-18.0f);
            compressorRatio_.store(3.0f);
            compressorAttack_.store(10.0f);
            compressorRelease_.store(120.0f);
            compressorGlassy_.store(false);
            wahEnabled_.store(false);
            phaserEnabled_.store(true);
            phaserRate_.store(0.2f);
            phaserDepth_.store(0.8f);
            phaserStages_.store(12);
            phaserFeedback_.store(0.6f);
            chorusEnabled_.store(true);
            chorusRate_.store(0.4f);
            chorusDepth_.store(0.25f);
            chorusVoices_.store(2);
            chorusMix_.store(0.2f);
            pitchShifterEnabled_.store(false);
            harmonizerEnabled_.store(false);
            delayEnabled_.store(true);
            delayTimeL_.store(400.0f);
            delayTimeR_.store(600.0f);
            delayFeedback_.store(0.45f);
            delayMix_.store(0.3f);
            delayFreeze_.store(false);
            delayPitchShiftL_.store(0.0f);
            delayPitchShiftR_.store(0.0f);
            reverbEnabled_.store(true);
            reverbType_.store(1); // Hall
            reverbDecay_.store(4.0f);
            reverbShimmerAmount_.store(0.1f);
            reverbShimmerInterval_.store(12.0f);
            reverbMix_.store(0.3f);
            reverbFreeze_.store(false);
            eqEnabled_.store(true);
            eqLowGain_.store(0.0f);
            eqMidGain_.store(-1.0f);
            eqHighGain_.store(1.0f);
            eqTilt_.store(0.0f);
            exciterEnabled_.store(false);
            tremoloEnabled_.store(false);
            eqNeedsUpdate_.store(true);
            break;

        case Preset::Ballerina1224:
            // Ballerina 12/24 - delicate harmonics
            noiseGateEnabled_.store(false);
            compressorEnabled_.store(true);
            compressorThreshold_.store(-25.0f);
            compressorRatio_.store(2.0f);
            compressorAttack_.store(20.0f);
            compressorRelease_.store(250.0f);
            compressorGlassy_.store(true);
            wahEnabled_.store(false);
            phaserEnabled_.store(false);
            chorusEnabled_.store(true);
            chorusRate_.store(1.0f);
            chorusDepth_.store(0.2f);
            chorusVoices_.store(4);
            chorusMix_.store(0.25f);
            pitchShifterEnabled_.store(true);
            pitchShifterSemitones_.store(12.0f);
            pitchShifterMix_.store(0.15f);
            harmonizerEnabled_.store(false);
            delayEnabled_.store(true);
            delayTimeL_.store(300.0f);
            delayTimeR_.store(450.0f);
            delayFeedback_.store(0.25f);
            delayMix_.store(0.25f);
            delayFreeze_.store(false);
            delayPitchShiftL_.store(0.0f);
            delayPitchShiftR_.store(0.0f);
            reverbEnabled_.store(true);
            reverbType_.store(2); // Plate
            reverbDecay_.store(3.5f);
            reverbShimmerAmount_.store(0.3f);
            reverbShimmerInterval_.store(12.0f);
            reverbMix_.store(0.35f);
            reverbFreeze_.store(false);
            eqEnabled_.store(true);
            eqLowGain_.store(-3.0f);
            eqMidGain_.store(0.0f);
            eqHighGain_.store(4.0f);
            eqTilt_.store(0.4f);
            exciterEnabled_.store(true);
            exciterWarmth_.store(0.0f);
            exciterPresence_.store(0.2f);
            exciterAir_.store(0.6f);
            tremoloEnabled_.store(false);
            eqNeedsUpdate_.store(true);
            exciterNeedsUpdate_.store(true);
            break;

        case Preset::ForTheLoveOfGod:
            // For the Love of God - epic sustain & reverb, THE Vai tone
            noiseGateEnabled_.store(true);
            noiseGateThreshold_.store(-55.0f);
            noiseGateRelease_.store(150.0f);
            compressorEnabled_.store(true);
            compressorThreshold_.store(-15.0f);
            compressorRatio_.store(5.0f);
            compressorAttack_.store(3.0f);
            compressorRelease_.store(200.0f);
            compressorGlassy_.store(true);
            wahEnabled_.store(false);
            phaserEnabled_.store(false);
            chorusEnabled_.store(true);
            chorusRate_.store(0.6f);
            chorusDepth_.store(0.3f);
            chorusVoices_.store(3);
            chorusMix_.store(0.2f);
            pitchShifterEnabled_.store(false);
            harmonizerEnabled_.store(false);
            delayEnabled_.store(true);
            delayTimeL_.store(420.0f);
            delayTimeR_.store(560.0f);
            delayFeedback_.store(0.35f);
            delayMix_.store(0.3f);
            delayFreeze_.store(false);
            delayPitchShiftL_.store(0.0f);
            delayPitchShiftR_.store(0.0f);
            reverbEnabled_.store(true);
            reverbType_.store(3); // Cathedral
            reverbDecay_.store(6.0f);
            reverbShimmerAmount_.store(0.25f);
            reverbShimmerInterval_.store(12.0f);
            reverbMix_.store(0.35f);
            reverbFreeze_.store(false);
            eqEnabled_.store(true);
            eqLowGain_.store(-1.0f);
            eqMidGain_.store(2.0f);
            eqHighGain_.store(2.0f);
            eqTilt_.store(0.1f);
            exciterEnabled_.store(true);
            exciterWarmth_.store(0.3f);
            exciterPresence_.store(0.5f);
            exciterAir_.store(0.4f);
            tremoloEnabled_.store(false);
            eqNeedsUpdate_.store(true);
            exciterNeedsUpdate_.store(true);
            break;

        case Preset::TheAudienceIsListening:
            // The Audience Is Listening - wah-heavy funk
            noiseGateEnabled_.store(true);
            noiseGateThreshold_.store(-42.0f);
            noiseGateRelease_.store(40.0f);
            compressorEnabled_.store(true);
            compressorThreshold_.store(-12.0f);
            compressorRatio_.store(4.0f);
            compressorAttack_.store(2.0f);
            compressorRelease_.store(80.0f);
            compressorGlassy_.store(false);
            wahEnabled_.store(true);
            wahMode_.store(2); // Envelope
            wahPosition_.store(0.5f);
            wahQ_.store(8.0f);
            phaserEnabled_.store(false);
            chorusEnabled_.store(false);
            pitchShifterEnabled_.store(false);
            harmonizerEnabled_.store(false);
            delayEnabled_.store(true);
            delayTimeL_.store(200.0f);
            delayTimeR_.store(300.0f);
            delayFeedback_.store(0.2f);
            delayMix_.store(0.2f);
            delayFreeze_.store(false);
            delayPitchShiftL_.store(0.0f);
            delayPitchShiftR_.store(0.0f);
            reverbEnabled_.store(true);
            reverbType_.store(0); // Room
            reverbDecay_.store(1.2f);
            reverbShimmerAmount_.store(0.0f);
            reverbShimmerInterval_.store(12.0f);
            reverbMix_.store(0.15f);
            reverbFreeze_.store(false);
            eqEnabled_.store(true);
            eqLowGain_.store(1.0f);
            eqMidGain_.store(3.0f);
            eqHighGain_.store(2.0f);
            eqTilt_.store(0.0f);
            exciterEnabled_.store(true);
            exciterWarmth_.store(0.4f);
            exciterPresence_.store(0.6f);
            exciterAir_.store(0.2f);
            tremoloEnabled_.store(false);
            eqNeedsUpdate_.store(true);
            exciterNeedsUpdate_.store(true);
            break;

        case Preset::IWouldLoveTo:
            // I Would Love To - lush chorus & delay
            noiseGateEnabled_.store(false);
            compressorEnabled_.store(true);
            compressorThreshold_.store(-18.0f);
            compressorRatio_.store(3.0f);
            compressorAttack_.store(10.0f);
            compressorRelease_.store(150.0f);
            compressorGlassy_.store(true);
            wahEnabled_.store(false);
            phaserEnabled_.store(false);
            chorusEnabled_.store(true);
            chorusRate_.store(0.9f);
            chorusDepth_.store(0.6f);
            chorusVoices_.store(5);
            chorusMix_.store(0.45f);
            pitchShifterEnabled_.store(false);
            harmonizerEnabled_.store(false);
            delayEnabled_.store(true);
            delayTimeL_.store(375.0f);
            delayTimeR_.store(500.0f);
            delayFeedback_.store(0.4f);
            delayMix_.store(0.35f);
            delayFreeze_.store(false);
            delayPitchShiftL_.store(0.0f);
            delayPitchShiftR_.store(0.0f);
            reverbEnabled_.store(true);
            reverbType_.store(1); // Hall
            reverbDecay_.store(4.0f);
            reverbShimmerAmount_.store(0.2f);
            reverbShimmerInterval_.store(12.0f);
            reverbMix_.store(0.3f);
            reverbFreeze_.store(false);
            eqEnabled_.store(true);
            eqLowGain_.store(0.0f);
            eqMidGain_.store(1.0f);
            eqHighGain_.store(2.0f);
            eqTilt_.store(0.15f);
            exciterEnabled_.store(true);
            exciterWarmth_.store(0.2f);
            exciterPresence_.store(0.3f);
            exciterAir_.store(0.4f);
            tremoloEnabled_.store(false);
            eqNeedsUpdate_.store(true);
            exciterNeedsUpdate_.store(true);
            break;

        case Preset::BluePowder:
            // Blue Powder - jazzy clean, warm
            noiseGateEnabled_.store(false);
            compressorEnabled_.store(true);
            compressorThreshold_.store(-22.0f);
            compressorRatio_.store(2.0f);
            compressorAttack_.store(20.0f);
            compressorRelease_.store(200.0f);
            compressorGlassy_.store(false);
            wahEnabled_.store(false);
            phaserEnabled_.store(false);
            chorusEnabled_.store(true);
            chorusRate_.store(0.6f);
            chorusDepth_.store(0.2f);
            chorusVoices_.store(2);
            chorusMix_.store(0.2f);
            pitchShifterEnabled_.store(false);
            harmonizerEnabled_.store(false);
            delayEnabled_.store(true);
            delayTimeL_.store(280.0f);
            delayTimeR_.store(350.0f);
            delayFeedback_.store(0.2f);
            delayMix_.store(0.2f);
            delayFreeze_.store(false);
            delayPitchShiftL_.store(0.0f);
            delayPitchShiftR_.store(0.0f);
            reverbEnabled_.store(true);
            reverbType_.store(0); // Room
            reverbDecay_.store(1.8f);
            reverbShimmerAmount_.store(0.0f);
            reverbShimmerInterval_.store(12.0f);
            reverbMix_.store(0.2f);
            reverbFreeze_.store(false);
            eqEnabled_.store(true);
            eqLowGain_.store(2.0f);
            eqMidGain_.store(-1.0f);
            eqHighGain_.store(-1.0f);
            eqTilt_.store(-0.3f);
            exciterEnabled_.store(true);
            exciterWarmth_.store(0.5f);
            exciterPresence_.store(0.2f);
            exciterAir_.store(0.1f);
            tremoloEnabled_.store(false);
            eqNeedsUpdate_.store(true);
            exciterNeedsUpdate_.store(true);
            break;

        case Preset::GreasyKidsStuff:
            // Greasy Kids Stuff - funky wah tremolo
            noiseGateEnabled_.store(true);
            noiseGateThreshold_.store(-38.0f);
            noiseGateRelease_.store(30.0f);
            compressorEnabled_.store(true);
            compressorThreshold_.store(-10.0f);
            compressorRatio_.store(5.0f);
            compressorAttack_.store(1.0f);
            compressorRelease_.store(60.0f);
            compressorGlassy_.store(false);
            wahEnabled_.store(true);
            wahMode_.store(1); // Auto
            wahPosition_.store(0.5f);
            wahQ_.store(7.0f);
            phaserEnabled_.store(false);
            chorusEnabled_.store(false);
            pitchShifterEnabled_.store(false);
            harmonizerEnabled_.store(false);
            delayEnabled_.store(true);
            delayTimeL_.store(150.0f);
            delayTimeR_.store(225.0f);
            delayFeedback_.store(0.15f);
            delayMix_.store(0.15f);
            delayFreeze_.store(false);
            delayPitchShiftL_.store(0.0f);
            delayPitchShiftR_.store(0.0f);
            reverbEnabled_.store(true);
            reverbType_.store(0); // Room
            reverbDecay_.store(0.8f);
            reverbShimmerAmount_.store(0.0f);
            reverbShimmerInterval_.store(12.0f);
            reverbMix_.store(0.1f);
            reverbFreeze_.store(false);
            eqEnabled_.store(true);
            eqLowGain_.store(1.0f);
            eqMidGain_.store(2.0f);
            eqHighGain_.store(1.0f);
            eqTilt_.store(0.0f);
            exciterEnabled_.store(true);
            exciterWarmth_.store(0.3f);
            exciterPresence_.store(0.4f);
            exciterAir_.store(0.1f);
            tremoloEnabled_.store(true);
            tremoloRate_.store(6.0f);
            tremoloDepth_.store(0.6f);
            tremoloWaveform_.store(0); // Sine
            eqNeedsUpdate_.store(true);
            exciterNeedsUpdate_.store(true);
            break;

        case Preset::AlienWaterKiss:
            // Alien Water Kiss - pitch-shifted ambient
            noiseGateEnabled_.store(false);
            compressorEnabled_.store(true);
            compressorThreshold_.store(-20.0f);
            compressorRatio_.store(2.5f);
            compressorAttack_.store(15.0f);
            compressorRelease_.store(250.0f);
            compressorGlassy_.store(true);
            wahEnabled_.store(false);
            phaserEnabled_.store(true);
            phaserRate_.store(0.15f);
            phaserDepth_.store(0.5f);
            phaserStages_.store(6);
            phaserFeedback_.store(0.3f);
            chorusEnabled_.store(true);
            chorusRate_.store(0.3f);
            chorusDepth_.store(0.4f);
            chorusVoices_.store(4);
            chorusMix_.store(0.3f);
            pitchShifterEnabled_.store(true);
            pitchShifterSemitones_.store(7.0f);
            pitchShifterMix_.store(0.25f);
            harmonizerEnabled_.store(false);
            delayEnabled_.store(true);
            delayTimeL_.store(600.0f);
            delayTimeR_.store(800.0f);
            delayFeedback_.store(0.5f);
            delayMix_.store(0.4f);
            delayFreeze_.store(false);
            delayPitchShiftL_.store(5.0f);
            delayPitchShiftR_.store(-5.0f);
            reverbEnabled_.store(true);
            reverbType_.store(3); // Cathedral
            reverbDecay_.store(8.0f);
            reverbShimmerAmount_.store(0.5f);
            reverbShimmerInterval_.store(12.0f);
            reverbMix_.store(0.45f);
            reverbFreeze_.store(false);
            eqEnabled_.store(true);
            eqLowGain_.store(-2.0f);
            eqMidGain_.store(0.0f);
            eqHighGain_.store(3.0f);
            eqTilt_.store(0.4f);
            exciterEnabled_.store(true);
            exciterWarmth_.store(0.0f);
            exciterPresence_.store(0.2f);
            exciterAir_.store(0.7f);
            tremoloEnabled_.store(false);
            eqNeedsUpdate_.store(true);
            exciterNeedsUpdate_.store(true);
            break;

        case Preset::Sisters:
            // Sisters - harmonized lead
            noiseGateEnabled_.store(true);
            noiseGateThreshold_.store(-48.0f);
            noiseGateRelease_.store(100.0f);
            compressorEnabled_.store(true);
            compressorThreshold_.store(-15.0f);
            compressorRatio_.store(4.0f);
            compressorAttack_.store(5.0f);
            compressorRelease_.store(150.0f);
            compressorGlassy_.store(true);
            wahEnabled_.store(false);
            phaserEnabled_.store(false);
            chorusEnabled_.store(false);
            pitchShifterEnabled_.store(false);
            harmonizerEnabled_.store(true);
            harmonizerVoice1_.store(4.0f);  // Major third
            harmonizerVoice2_.store(7.0f);  // Perfect fifth
            harmonizerDetune_.store(8.0f);
            harmonizerMix_.store(0.4f);
            delayEnabled_.store(true);
            delayTimeL_.store(300.0f);
            delayTimeR_.store(400.0f);
            delayFeedback_.store(0.25f);
            delayMix_.store(0.25f);
            delayFreeze_.store(false);
            delayPitchShiftL_.store(0.0f);
            delayPitchShiftR_.store(0.0f);
            reverbEnabled_.store(true);
            reverbType_.store(1); // Hall
            reverbDecay_.store(3.0f);
            reverbShimmerAmount_.store(0.1f);
            reverbShimmerInterval_.store(12.0f);
            reverbMix_.store(0.25f);
            reverbFreeze_.store(false);
            eqEnabled_.store(true);
            eqLowGain_.store(-1.0f);
            eqMidGain_.store(2.0f);
            eqHighGain_.store(1.0f);
            eqTilt_.store(0.1f);
            exciterEnabled_.store(true);
            exciterWarmth_.store(0.2f);
            exciterPresence_.store(0.4f);
            exciterAir_.store(0.3f);
            tremoloEnabled_.store(false);
            eqNeedsUpdate_.store(true);
            exciterNeedsUpdate_.store(true);
            break;

        case Preset::LoveSecrets:
            // Love Secrets - shredding with tight delay
            noiseGateEnabled_.store(true);
            noiseGateThreshold_.store(-40.0f);
            noiseGateRelease_.store(40.0f);
            compressorEnabled_.store(true);
            compressorThreshold_.store(-10.0f);
            compressorRatio_.store(6.0f);
            compressorAttack_.store(1.0f);
            compressorRelease_.store(50.0f);
            compressorGlassy_.store(true);
            wahEnabled_.store(false);
            phaserEnabled_.store(false);
            chorusEnabled_.store(false);
            pitchShifterEnabled_.store(false);
            harmonizerEnabled_.store(false);
            delayEnabled_.store(true);
            delayTimeL_.store(120.0f);
            delayTimeR_.store(160.0f);
            delayFeedback_.store(0.2f);
            delayMix_.store(0.2f);
            delayFreeze_.store(false);
            delayPitchShiftL_.store(0.0f);
            delayPitchShiftR_.store(0.0f);
            reverbEnabled_.store(true);
            reverbType_.store(2); // Plate
            reverbDecay_.store(1.5f);
            reverbShimmerAmount_.store(0.0f);
            reverbShimmerInterval_.store(12.0f);
            reverbMix_.store(0.15f);
            reverbFreeze_.store(false);
            eqEnabled_.store(true);
            eqLowGain_.store(0.0f);
            eqMidGain_.store(3.0f);
            eqHighGain_.store(3.0f);
            eqTilt_.store(0.2f);
            exciterEnabled_.store(true);
            exciterWarmth_.store(0.1f);
            exciterPresence_.store(0.6f);
            exciterAir_.store(0.3f);
            tremoloEnabled_.store(false);
            eqNeedsUpdate_.store(true);
            exciterNeedsUpdate_.store(true);
            break;

        default:
            break;
    }
}

// ========================================
// Preset Info
// ========================================

PassionFXProcessor::PresetInfo PassionFXProcessor::getPresetInfo(Preset preset) {
    switch (preset) {
        case Preset::Manual:
            return { "Manual", "Custom", "User-defined settings" };
        case Preset::Liberty:
            return { "Liberty", "Liberty", "Soaring clean lead with chorus and delay" };
        case Preset::EroticNightmares:
            return { "Erotic Nightmares", "Erotic Nightmares", "Aggressive, dark tones with deep phaser" };
        case Preset::TheAnimal:
            return { "The Animal", "The Animal", "Raw, primal overdrive with envelope wah" };
        case Preset::Answers:
            return { "Answers", "Answers", "Emotional ballad shimmer with lush reverb" };
        case Preset::TheRiddle:
            return { "The Riddle", "The Riddle", "Mysterious, deeply phased atmosphere" };
        case Preset::Ballerina1224:
            return { "Ballerina 12/24", "Ballerina 12/24", "Delicate harmonics with octave shimmer" };
        case Preset::ForTheLoveOfGod:
            return { "For the Love of God", "For the Love of God", "Epic sustain and cathedral reverb" };
        case Preset::TheAudienceIsListening:
            return { "The Audience Is Listening", "The Audience Is Listening", "Wah-heavy funk with tight compression" };
        case Preset::IWouldLoveTo:
            return { "I Would Love To", "I Would Love To", "Lush chorus and wide stereo delay" };
        case Preset::BluePowder:
            return { "Blue Powder", "Blue Powder", "Jazzy clean tone with warm EQ" };
        case Preset::GreasyKidsStuff:
            return { "Greasy Kids Stuff", "Greasy Kids Stuff", "Funky auto-wah with tremolo groove" };
        case Preset::AlienWaterKiss:
            return { "Alien Water Kiss", "Alien Water Kiss", "Pitch-shifted ambient soundscape" };
        case Preset::Sisters:
            return { "Sisters", "Sisters", "Harmonized lead with thirds and fifths" };
        case Preset::LoveSecrets:
            return { "Love Secrets", "Love Secrets", "Shredding tones with tight slapback delay" };
        default:
            return { "Unknown", "Unknown", "" };
    }
}

// ========================================
// Bulk Parameter Access
// ========================================

PassionFXProcessor::Parameters PassionFXProcessor::getParameters() const {
    Parameters params;

    // NoiseGate
    params.noiseGateEnabled = noiseGateEnabled_.load();
    params.noiseGateThreshold = noiseGateThreshold_.load();
    params.noiseGateRelease = noiseGateRelease_.load();

    // Compressor
    params.compressorEnabled = compressorEnabled_.load();
    params.compressorThreshold = compressorThreshold_.load();
    params.compressorRatio = compressorRatio_.load();
    params.compressorAttack = compressorAttack_.load();
    params.compressorRelease = compressorRelease_.load();
    params.compressorGlassy = compressorGlassy_.load();

    // Wah
    params.wahEnabled = wahEnabled_.load();
    params.wahMode = wahMode_.load();
    params.wahPosition = wahPosition_.load();
    params.wahQ = wahQ_.load();

    // Phaser
    params.phaserEnabled = phaserEnabled_.load();
    params.phaserRate = phaserRate_.load();
    params.phaserDepth = phaserDepth_.load();
    params.phaserStages = phaserStages_.load();
    params.phaserFeedback = phaserFeedback_.load();

    // Chorus
    params.chorusEnabled = chorusEnabled_.load();
    params.chorusRate = chorusRate_.load();
    params.chorusDepth = chorusDepth_.load();
    params.chorusVoices = chorusVoices_.load();
    params.chorusMix = chorusMix_.load();

    // PitchShifter
    params.pitchShifterEnabled = pitchShifterEnabled_.load();
    params.pitchShifterSemitones = pitchShifterSemitones_.load();
    params.pitchShifterMix = pitchShifterMix_.load();

    // Harmonizer
    params.harmonizerEnabled = harmonizerEnabled_.load();
    params.harmonizerVoice1 = harmonizerVoice1_.load();
    params.harmonizerVoice2 = harmonizerVoice2_.load();
    params.harmonizerDetune = harmonizerDetune_.load();
    params.harmonizerMix = harmonizerMix_.load();

    // Delay
    params.delayEnabled = delayEnabled_.load();
    params.delayTimeL = delayTimeL_.load();
    params.delayTimeR = delayTimeR_.load();
    params.delayFeedback = delayFeedback_.load();
    params.delayMix = delayMix_.load();
    params.delayFreeze = delayFreeze_.load();
    params.delayPitchShiftL = delayPitchShiftL_.load();
    params.delayPitchShiftR = delayPitchShiftR_.load();

    // Reverb
    params.reverbEnabled = reverbEnabled_.load();
    params.reverbType = reverbType_.load();
    params.reverbDecay = reverbDecay_.load();
    params.reverbShimmerAmount = reverbShimmerAmount_.load();
    params.reverbShimmerInterval = reverbShimmerInterval_.load();
    params.reverbMix = reverbMix_.load();
    params.reverbFreeze = reverbFreeze_.load();

    // EQ
    params.eqEnabled = eqEnabled_.load();
    params.eqLowGain = eqLowGain_.load();
    params.eqMidGain = eqMidGain_.load();
    params.eqHighGain = eqHighGain_.load();
    params.eqTilt = eqTilt_.load();

    // Exciter
    params.exciterEnabled = exciterEnabled_.load();
    params.exciterWarmth = exciterWarmth_.load();
    params.exciterPresence = exciterPresence_.load();
    params.exciterAir = exciterAir_.load();

    // Tremolo
    params.tremoloEnabled = tremoloEnabled_.load();
    params.tremoloRate = tremoloRate_.load();
    params.tremoloDepth = tremoloDepth_.load();
    params.tremoloWaveform = tremoloWaveform_.load();

    // Global
    params.globalMix = globalMix_.load();
    params.outputLevel = outputLevel_.load();

    // State
    params.preset = preset_.load();
    params.bypass = bypass_.load();

    return params;
}

void PassionFXProcessor::setParameters(const Parameters& params) {
    if (params.preset != Preset::Manual) {
        setPreset(params.preset);
    } else {
        // NoiseGate
        noiseGateEnabled_.store(params.noiseGateEnabled);
        noiseGateThreshold_.store(params.noiseGateThreshold);
        noiseGateRelease_.store(params.noiseGateRelease);

        // Compressor
        compressorEnabled_.store(params.compressorEnabled);
        compressorThreshold_.store(params.compressorThreshold);
        compressorRatio_.store(params.compressorRatio);
        compressorAttack_.store(params.compressorAttack);
        compressorRelease_.store(params.compressorRelease);
        compressorGlassy_.store(params.compressorGlassy);

        // Wah
        wahEnabled_.store(params.wahEnabled);
        wahMode_.store(params.wahMode);
        wahPosition_.store(params.wahPosition);
        wahQ_.store(params.wahQ);

        // Phaser
        phaserEnabled_.store(params.phaserEnabled);
        phaserRate_.store(params.phaserRate);
        phaserDepth_.store(params.phaserDepth);
        phaserStages_.store(params.phaserStages);
        phaserFeedback_.store(params.phaserFeedback);

        // Chorus
        chorusEnabled_.store(params.chorusEnabled);
        chorusRate_.store(params.chorusRate);
        chorusDepth_.store(params.chorusDepth);
        chorusVoices_.store(params.chorusVoices);
        chorusMix_.store(params.chorusMix);

        // PitchShifter
        pitchShifterEnabled_.store(params.pitchShifterEnabled);
        pitchShifterSemitones_.store(params.pitchShifterSemitones);
        pitchShifterMix_.store(params.pitchShifterMix);

        // Harmonizer
        harmonizerEnabled_.store(params.harmonizerEnabled);
        harmonizerVoice1_.store(params.harmonizerVoice1);
        harmonizerVoice2_.store(params.harmonizerVoice2);
        harmonizerDetune_.store(params.harmonizerDetune);
        harmonizerMix_.store(params.harmonizerMix);

        // Delay
        delayEnabled_.store(params.delayEnabled);
        delayTimeL_.store(params.delayTimeL);
        delayTimeR_.store(params.delayTimeR);
        delayFeedback_.store(params.delayFeedback);
        delayMix_.store(params.delayMix);
        delayFreeze_.store(params.delayFreeze);
        delayPitchShiftL_.store(params.delayPitchShiftL);
        delayPitchShiftR_.store(params.delayPitchShiftR);

        // Reverb
        reverbEnabled_.store(params.reverbEnabled);
        reverbType_.store(params.reverbType);
        reverbDecay_.store(params.reverbDecay);
        reverbShimmerAmount_.store(params.reverbShimmerAmount);
        reverbShimmerInterval_.store(params.reverbShimmerInterval);
        reverbMix_.store(params.reverbMix);
        reverbFreeze_.store(params.reverbFreeze);

        // EQ
        eqEnabled_.store(params.eqEnabled);
        eqLowGain_.store(params.eqLowGain);
        eqMidGain_.store(params.eqMidGain);
        eqHighGain_.store(params.eqHighGain);
        eqTilt_.store(params.eqTilt);
        eqNeedsUpdate_.store(true);

        // Exciter
        exciterEnabled_.store(params.exciterEnabled);
        exciterWarmth_.store(params.exciterWarmth);
        exciterPresence_.store(params.exciterPresence);
        exciterAir_.store(params.exciterAir);
        exciterNeedsUpdate_.store(true);

        // Tremolo
        tremoloEnabled_.store(params.tremoloEnabled);
        tremoloRate_.store(params.tremoloRate);
        tremoloDepth_.store(params.tremoloDepth);
        tremoloWaveform_.store(params.tremoloWaveform);
    }

    // Always set global params regardless of preset
    globalMix_.store(params.globalMix);
    outputLevel_.store(params.outputLevel);
    bypass_.store(params.bypass);
}

// ========================================
// Metering
// ========================================

PassionFXProcessor::Metering PassionFXProcessor::getMetering() const {
    Metering m;
    m.inputLevelL = meterInputL_.load();
    m.inputLevelR = meterInputR_.load();
    m.outputLevelL = meterOutputL_.load();
    m.outputLevelR = meterOutputR_.load();
    m.gateGain = meterGateGain_.load();
    m.compressorGainReduction = meterCompGR_.load();
    m.reverbLevelL = meterReverbL_.load();
    m.reverbLevelR = meterReverbR_.load();
    m.delayLevelL = meterDelayL_.load();
    m.delayLevelR = meterDelayR_.load();
    m.phaserLfoPhase = meterPhaserPhase_.load();
    m.tremoloLfoPhase = meterTremoloPhase_.load();
    m.wahPosition = meterWahPos_.load();
    return m;
}

void PassionFXProcessor::resetPeaks() {
    meterInputL_.store(-100.0f);
    meterInputR_.store(-100.0f);
    meterOutputL_.store(-100.0f);
    meterOutputR_.store(-100.0f);
    meterGateGain_.store(1.0f);
    meterCompGR_.store(0.0f);
    meterReverbL_.store(-100.0f);
    meterReverbR_.store(-100.0f);
    meterDelayL_.store(-100.0f);
    meterDelayR_.store(-100.0f);
}

} // namespace map2

