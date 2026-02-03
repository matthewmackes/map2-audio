/**
 * MAP2 Audio Engine - Stereo Delay Processor Implementation
 * Professional multi-tap delay with tempo sync, modulation, filtering, and ducking
 */

#include "DelayProcessor.h"
#include <cmath>
#include <algorithm>
#include <random>

namespace map2 {

// Beat values for each tempo division
static const float DIVISION_BEATS[] = {
    0.0f,    // Off
    4.0f,    // 1/1 Whole
    2.0f,    // 1/2 Half
    1.0f,    // 1/4 Quarter
    0.5f,    // 1/8 Eighth
    0.25f,   // 1/16 Sixteenth
    0.125f,  // 1/32 ThirtySecond
    6.0f,    // 1/1D Whole Dotted
    3.0f,    // 1/2D Half Dotted
    1.5f,    // 1/4D Quarter Dotted
    0.75f,   // 1/8D Eighth Dotted
    0.375f,  // 1/16D Sixteenth Dotted
    2.667f,  // 1/1T Whole Triplet
    1.333f,  // 1/2T Half Triplet
    0.667f,  // 1/4T Quarter Triplet
    0.333f,  // 1/8T Eighth Triplet
    0.167f   // 1/16T Sixteenth Triplet
};

// AllPassFilter implementation
void DelayProcessor::AllPassFilter::prepare(int maxSamples) {
    buffer.resize(maxSamples, 0.0f);
    writePos = 0;
}

float DelayProcessor::AllPassFilter::process(float input) {
    int readPos = writePos - delaySamples;
    if (readPos < 0) readPos += static_cast<int>(buffer.size());

    float delayed = buffer[readPos];
    float output = -input + delayed;
    buffer[writePos] = input + delayed * feedback;

    writePos++;
    if (writePos >= static_cast<int>(buffer.size())) writePos = 0;

    return output;
}

void DelayProcessor::AllPassFilter::reset() {
    std::fill(buffer.begin(), buffer.end(), 0.0f);
    writePos = 0;
}

// DelayProcessor implementation
DelayProcessor::DelayProcessor() {
    // Default initialization - prepare() must be called before processing
}

void DelayProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;
    numChannels_ = numChannels;

    // Allocate delay buffers (max 2 seconds)
    int maxSamples = static_cast<int>(sampleRate * 2.0) + 1;
    delayBufferL_.resize(maxSamples, 0.0f);
    delayBufferR_.resize(maxSamples, 0.0f);
    writePos_ = 0;

    // Prepare diffusion filters with varying delay times
    int diffusionDelays[] = {142, 379, 503, 661}; // Prime-ish numbers for nice diffusion
    for (int i = 0; i < NUM_DIFFUSION_STAGES; ++i) {
        diffusionFiltersL_[i].prepare(1000);
        diffusionFiltersL_[i].delaySamples = diffusionDelays[i];
        diffusionFiltersL_[i].feedback = 0.5f;

        diffusionFiltersR_[i].prepare(1000);
        diffusionFiltersR_[i].delaySamples = diffusionDelays[i];
        diffusionFiltersR_[i].feedback = 0.5f;
    }

    // Initialize smoothed values
    smoothedDelayL_.reset(sampleRate, 0.05); // 50ms smoothing
    smoothedDelayR_.reset(sampleRate, 0.05);
    smoothedDelayL_.setCurrentAndTargetValue(delayTimeL_.load() * sampleRate_ / 1000.0f);
    smoothedDelayR_.setCurrentAndTargetValue(delayTimeR_.load() * sampleRate_ / 1000.0f);

    // Initialize filters
    filtersNeedUpdate_.store(true);
    updateFilters();

    // Reset tap tempo
    clearTaps();

    prepared_ = true;
}

void DelayProcessor::reset() {
    // Clear delay buffers
    std::fill(delayBufferL_.begin(), delayBufferL_.end(), 0.0f);
    std::fill(delayBufferR_.begin(), delayBufferR_.end(), 0.0f);
    writePos_ = 0;

    // Reset diffusion filters
    for (auto& filter : diffusionFiltersL_) filter.reset();
    for (auto& filter : diffusionFiltersR_) filter.reset();

    // Reset filters
    lowCutFilterL_.reset();
    lowCutFilterR_.reset();
    highCutFilterL_.reset();
    highCutFilterR_.reset();

    // Reset modulation
    modPhase_ = 0.0;
    randomModValue_ = 0.0f;
    randomModTarget_ = 0.0f;
    randomModCounter_ = 0;

    // Reset ducking
    duckEnvelope_ = 0.0f;

    // Reset feedback storage
    lastFeedbackL_ = 0.0f;
    lastFeedbackR_ = 0.0f;

    // Reset metering
    inputLevelL_.store(-100.0f);
    inputLevelR_.store(-100.0f);
    outputLevelL_.store(-100.0f);
    outputLevelR_.store(-100.0f);
    delayLevelL_.store(-100.0f);
    delayLevelR_.store(-100.0f);
    duckingGainDb_.store(0.0f);
}

void DelayProcessor::process(juce::AudioBuffer<float>& buffer) {
    if (!prepared_) return;

    const int numSamples = buffer.getNumSamples();
    const int numChannels = std::min(buffer.getNumChannels(), 2);

    // Get pointers
    float* dataL = buffer.getWritePointer(0);
    float* dataR = numChannels > 1 ? buffer.getWritePointer(1) : dataL;

    // Measure input levels
    inputLevelL_.store(calculatePeakLevel(dataL, numSamples));
    if (numChannels > 1) {
        inputLevelR_.store(calculatePeakLevel(dataR, numSamples));
    } else {
        inputLevelR_.store(inputLevelL_.load());
    }

    // Check bypass
    bool bypassed = bypass_.load();
    if (bypassed && !spillover_.load()) {
        // Hard bypass - no tails
        outputLevelL_.store(inputLevelL_.load());
        outputLevelR_.store(inputLevelR_.load());
        return;
    }

    // Update filters if needed
    if (filtersNeedUpdate_.exchange(false)) {
        updateFilters();
    }

    // Get current parameters
    const float feedback = feedback_.load() / 100.0f;
    const float mix = bypassed ? 0.0f : (mix_.load() / 100.0f);
    const float dryLevel = 1.0f;  // Keep dry at unity, wet is added
    const float wetLevel = mix;

    // Get effective delay times (considering tempo sync)
    float targetDelayL = getEffectiveDelayTimeL() * sampleRate_ / 1000.0f;
    float targetDelayR = getEffectiveDelayTimeR() * sampleRate_ / 1000.0f;

    // Clamp to buffer size
    int maxDelay = static_cast<int>(delayBufferL_.size()) - 1;
    targetDelayL = std::clamp(targetDelayL, 1.0f, static_cast<float>(maxDelay));
    targetDelayR = std::clamp(targetDelayR, 1.0f, static_cast<float>(maxDelay));

    // Set smoothed targets
    smoothedDelayL_.setTargetValue(targetDelayL);
    smoothedDelayR_.setTargetValue(targetDelayR);

    // Get tap parameters
    const float tap1Level = tap1Level_.load() / 100.0f;
    const float tap2Level = tap2Level_.load() / 100.0f;
    const float tap2Ratio = tap2Ratio_.load();
    const float tap3Level = tap3Level_.load() / 100.0f;
    const float tap3Ratio = tap3Ratio_.load();
    const float tap4Level = tap4Level_.load() / 100.0f;
    const float tap4Ratio = tap4Ratio_.load();

    // Get stereo parameters
    const StereoMode stereoMode = stereoMode_.load();
    const float spread = stereoSpread_.load() / 100.0f;
    const float pan = pan_.load() / 100.0f;

    // Get modulation parameters
    const float modRate = modRate_.load();
    const float modDepth = modDepth_.load() / 100.0f;

    // Get ducking parameters
    const float duckThreshold = duckThreshold_.load();
    const float duckAmount = duckAmount_.load() / 100.0f;
    const float duckReleaseCoef = std::exp(-1.0f / (sampleRate_ * duckRelease_.load() / 1000.0f));

    // Get diffusion and output
    const float diffusion = diffusion_.load() / 100.0f;
    const float outputGain = dbToLinear(outputLevel_.load());
    const bool filterInLoop = filterInLoop_.load();

    // Accumulators for wet level metering
    float wetPeakL = 0.0f;
    float wetPeakR = 0.0f;

    // Process sample by sample
    for (int i = 0; i < numSamples; ++i) {
        // Get current smoothed delay times
        float delaySamplesL = smoothedDelayL_.getNextValue();
        float delaySamplesR = smoothedDelayR_.getNextValue();

        // Apply modulation
        float mod = getModulation() * modDepth;
        float modOffsetL = mod * 0.01f * delaySamplesL;  // up to 1% variation
        float modOffsetR = -mod * 0.01f * delaySamplesR; // opposite for stereo width

        delaySamplesL += modOffsetL;
        delaySamplesR += modOffsetR;

        // Get input
        float inputL = dataL[i];
        float inputR = numChannels > 1 ? dataR[i] : inputL;

        // Apply input filtering if not in loop
        if (!filterInLoop) {
            inputL = lowCutFilterL_.processSample(inputL);
            inputL = highCutFilterL_.processSample(inputL);
            inputR = lowCutFilterR_.processSample(inputR);
            inputR = highCutFilterR_.processSample(inputR);
        }

        // Read delay taps
        float tap1L = readDelay(delayBufferL_, delaySamplesL) * tap1Level;
        float tap1R = readDelay(delayBufferR_, delaySamplesR) * tap1Level;

        float tap2L = tap2Level > 0.001f ? readDelay(delayBufferL_, delaySamplesL * tap2Ratio) * tap2Level : 0.0f;
        float tap2R = tap2Level > 0.001f ? readDelay(delayBufferR_, delaySamplesR * tap2Ratio) * tap2Level : 0.0f;

        float tap3L = tap3Level > 0.001f ? readDelay(delayBufferL_, delaySamplesL * tap3Ratio) * tap3Level : 0.0f;
        float tap3R = tap3Level > 0.001f ? readDelay(delayBufferR_, delaySamplesR * tap3Ratio) * tap3Level : 0.0f;

        float tap4L = tap4Level > 0.001f ? readDelay(delayBufferL_, delaySamplesL * tap4Ratio) * tap4Level : 0.0f;
        float tap4R = tap4Level > 0.001f ? readDelay(delayBufferR_, delaySamplesR * tap4Ratio) * tap4Level : 0.0f;

        // Sum taps
        float delayedL = tap1L + tap2L + tap3L + tap4L;
        float delayedR = tap1R + tap2R + tap3R + tap4R;

        // Apply stereo mode processing
        float wetL, wetR;
        switch (stereoMode) {
            case StereoMode::Mono: {
                // Sum to mono, then spread
                float mono = (delayedL + delayedR) * 0.5f;
                wetL = mono;
                wetR = mono;
                break;
            }
            case StereoMode::Stereo: {
                // True stereo with spread control
                float mid = (delayedL + delayedR) * 0.5f;
                float side = (delayedL - delayedR) * 0.5f * spread;
                wetL = mid + side;
                wetR = mid - side;
                break;
            }
            case StereoMode::PingPong: {
                // Use feedback from opposite channel
                wetL = delayedL + lastFeedbackR_ * 0.5f;
                wetR = delayedR + lastFeedbackL_ * 0.5f;
                break;
            }
            case StereoMode::DualMono:
            default: {
                // Independent L and R
                wetL = delayedL;
                wetR = delayedR;
                break;
            }
        }

        // Apply diffusion
        if (diffusion > 0.001f) {
            float diffusedL = processDiffusion(wetL, diffusionFiltersL_);
            float diffusedR = processDiffusion(wetR, diffusionFiltersR_);
            wetL = wetL * (1.0f - diffusion) + diffusedL * diffusion;
            wetR = wetR * (1.0f - diffusion) + diffusedR * diffusion;
        }

        // Apply feedback loop filtering
        float feedbackL = wetL;
        float feedbackR = wetR;
        if (filterInLoop) {
            feedbackL = lowCutFilterL_.processSample(feedbackL);
            feedbackL = highCutFilterL_.processSample(feedbackL);
            feedbackR = lowCutFilterR_.processSample(feedbackR);
            feedbackR = highCutFilterR_.processSample(feedbackR);
        }

        // Store feedback for ping-pong
        lastFeedbackL_ = feedbackL;
        lastFeedbackR_ = feedbackR;

        // Write to delay buffer (input + feedback)
        float toBufferL = inputL + feedbackL * feedback;
        float toBufferR = inputR + feedbackR * feedback;

        // Soft clip feedback to prevent runaway
        toBufferL = std::tanh(toBufferL);
        toBufferR = std::tanh(toBufferR);

        delayBufferL_[writePos_] = toBufferL;
        delayBufferR_[writePos_] = toBufferR;

        // Advance write position
        writePos_++;
        if (writePos_ >= static_cast<int>(delayBufferL_.size())) {
            writePos_ = 0;
        }

        // Apply ducking based on input level
        float inputPeak = std::max(std::abs(inputL), std::abs(inputR));
        float inputDb = linearToDb(inputPeak);
        float duckGain = 1.0f;

        if (duckAmount > 0.001f && inputDb > duckThreshold) {
            // Calculate target ducking gain
            float overThreshold = inputDb - duckThreshold;
            float targetDuck = 1.0f - (overThreshold / 40.0f) * duckAmount; // 40dB range
            targetDuck = std::clamp(targetDuck, 0.0f, 1.0f);

            // Envelope follower (fast attack, slow release)
            if (targetDuck < duckEnvelope_) {
                duckEnvelope_ = targetDuck; // Instant attack
            } else {
                duckEnvelope_ = duckEnvelope_ * duckReleaseCoef + targetDuck * (1.0f - duckReleaseCoef);
            }
            duckGain = duckEnvelope_;
        } else {
            // Release envelope
            duckEnvelope_ = duckEnvelope_ * duckReleaseCoef + 1.0f * (1.0f - duckReleaseCoef);
            duckGain = duckEnvelope_;
        }

        // Apply ducking to wet signal
        wetL *= duckGain;
        wetR *= duckGain;

        // Apply pan
        if (std::abs(pan) > 0.001f) {
            float panL = std::clamp(1.0f - pan, 0.0f, 1.0f);
            float panR = std::clamp(1.0f + pan, 0.0f, 1.0f);
            wetL *= panL;
            wetR *= panR;
        }

        // Apply output gain
        wetL *= outputGain;
        wetR *= outputGain;

        // Track wet peak for metering
        wetPeakL = std::max(wetPeakL, std::abs(wetL));
        wetPeakR = std::max(wetPeakR, std::abs(wetR));

        // Mix dry and wet
        dataL[i] = inputL * dryLevel + wetL * wetLevel;
        if (numChannels > 1) {
            dataR[i] = inputR * dryLevel + wetR * wetLevel;
        }

        // Store ducking for metering
        duckingGainDb_.store(linearToDb(duckGain));
    }

    // Update metering
    delayLevelL_.store(linearToDb(wetPeakL));
    delayLevelR_.store(linearToDb(wetPeakR));
    outputLevelL_.store(calculatePeakLevel(dataL, numSamples));
    if (numChannels > 1) {
        outputLevelR_.store(calculatePeakLevel(dataR, numSamples));
    } else {
        outputLevelR_.store(outputLevelL_.load());
    }
    modPhaseOut_.store(static_cast<float>(modPhase_));
}

float DelayProcessor::readDelay(const std::vector<float>& buffer, float delaySamples) const {
    // Linear interpolation for fractional delay
    int intDelay = static_cast<int>(delaySamples);
    float frac = delaySamples - static_cast<float>(intDelay);

    int readPos1 = writePos_ - intDelay;
    int readPos2 = readPos1 - 1;

    // Wrap around
    int bufferSize = static_cast<int>(buffer.size());
    while (readPos1 < 0) readPos1 += bufferSize;
    while (readPos2 < 0) readPos2 += bufferSize;

    // Interpolate
    return buffer[readPos1] * (1.0f - frac) + buffer[readPos2] * frac;
}

float DelayProcessor::getModulation() {
    // Advance phase
    double phaseInc = modRate_.load() / sampleRate_;
    modPhase_ += phaseInc;
    if (modPhase_ >= 1.0) modPhase_ -= 1.0;

    ModWaveform waveform = modWaveform_.load();

    switch (waveform) {
        case ModWaveform::Sine:
            return std::sin(modPhase_ * 2.0 * 3.14159265359);

        case ModWaveform::Triangle: {
            float phase = static_cast<float>(modPhase_);
            if (phase < 0.5f) {
                return 4.0f * phase - 1.0f;
            } else {
                return 3.0f - 4.0f * phase;
            }
        }

        case ModWaveform::Random: {
            // Sample-and-hold random
            randomModCounter_++;
            int samplesPerCycle = static_cast<int>(sampleRate_ / modRate_.load());
            if (randomModCounter_ >= samplesPerCycle) {
                randomModCounter_ = 0;
                static std::random_device rd;
                static std::mt19937 gen(rd());
                static std::uniform_real_distribution<float> dis(-1.0f, 1.0f);
                randomModTarget_ = dis(gen);
            }
            // Smooth towards target
            randomModValue_ += (randomModTarget_ - randomModValue_) * 0.01f;
            return randomModValue_;
        }

        default:
            return 0.0f;
    }
}

float DelayProcessor::processDiffusion(float input, std::array<AllPassFilter, NUM_DIFFUSION_STAGES>& filters) {
    float output = input;
    for (auto& filter : filters) {
        output = filter.process(output);
    }
    return output;
}

void DelayProcessor::updateFilters() {
    float lowCutFreq = lowCut_.load();
    float highCutFreq = highCut_.load();

    // Create filter coefficients
    auto lowCutCoeffs = juce::dsp::IIR::Coefficients<float>::makeHighPass(sampleRate_, lowCutFreq);
    auto highCutCoeffs = juce::dsp::IIR::Coefficients<float>::makeLowPass(sampleRate_, highCutFreq);

    // Apply to filters
    *lowCutFilterL_.coefficients = *lowCutCoeffs;
    *lowCutFilterR_.coefficients = *lowCutCoeffs;
    *highCutFilterL_.coefficients = *highCutCoeffs;
    *highCutFilterR_.coefficients = *highCutCoeffs;
}

// Static utility functions
float DelayProcessor::divisionToMs(TempoDivision div, float bpm) {
    if (div == TempoDivision::Off || bpm <= 0.0f) {
        return 0.0f;
    }

    int divIndex = static_cast<int>(div);
    if (divIndex < 0 || divIndex >= static_cast<int>(sizeof(DIVISION_BEATS) / sizeof(float))) {
        return 0.0f;
    }

    float beats = DIVISION_BEATS[divIndex];
    // ms = (beats / (bpm / 60)) * 1000 = beats * 60000 / bpm
    return beats * 60000.0f / bpm;
}

float DelayProcessor::getEffectiveDelayTimeL() const {
    TempoDivision sync = tempoSyncL_.load();
    if (sync == TempoDivision::Off) {
        return delayTimeL_.load();
    }
    float ms = divisionToMs(sync, tempo_.load());
    // Clamp to valid range
    return std::clamp(ms, 1.0f, 2000.0f);
}

float DelayProcessor::getEffectiveDelayTimeR() const {
    TempoDivision sync = tempoSyncR_.load();
    if (sync == TempoDivision::Off) {
        return delayTimeR_.load();
    }
    float ms = divisionToMs(sync, tempo_.load());
    return std::clamp(ms, 1.0f, 2000.0f);
}

float DelayProcessor::recordTap(double timestampMs) {
    // Reset if more than 2 seconds since last tap
    if (lastTapTime_ > 0.0 && (timestampMs - lastTapTime_) > 2000.0) {
        clearTaps();
    }

    // Record this tap
    if (tapCount_ < MAX_TAP_HISTORY) {
        tapHistory_[tapCount_] = timestampMs;
        tapCount_++;
    } else {
        // Shift history
        for (int i = 0; i < MAX_TAP_HISTORY - 1; ++i) {
            tapHistory_[i] = tapHistory_[i + 1];
        }
        tapHistory_[MAX_TAP_HISTORY - 1] = timestampMs;
    }
    lastTapTime_ = timestampMs;

    // Need at least 2 taps to calculate tempo
    if (tapCount_ < 2) {
        return 0.0f;
    }

    // Calculate average interval
    double totalInterval = 0.0;
    int intervals = tapCount_ - 1;
    for (int i = 0; i < intervals; ++i) {
        totalInterval += tapHistory_[i + 1] - tapHistory_[i];
    }
    double avgInterval = totalInterval / intervals;

    // Convert to BPM
    float tempo = static_cast<float>(60000.0 / avgInterval);
    tempo = std::clamp(tempo, 20.0f, 300.0f);

    // Apply to engine
    setTempo(tempo);

    return tempo;
}

void DelayProcessor::clearTaps() {
    tapCount_ = 0;
    lastTapTime_ = 0.0;
    for (auto& t : tapHistory_) t = 0.0;
}

// Parameter setters
void DelayProcessor::setDelayTimeL(float ms) {
    ms = std::clamp(ms, 1.0f, 2000.0f);
    delayTimeL_.store(ms);
}

void DelayProcessor::setDelayTimeR(float ms) {
    ms = std::clamp(ms, 1.0f, 2000.0f);
    delayTimeR_.store(ms);
}

void DelayProcessor::setFeedback(float percent) {
    percent = std::clamp(percent, 0.0f, 100.0f);
    feedback_.store(percent);
}

void DelayProcessor::setMix(float percent) {
    percent = std::clamp(percent, 0.0f, 100.0f);
    mix_.store(percent);
}

void DelayProcessor::setTempo(float bpm) {
    bpm = std::clamp(bpm, 20.0f, 300.0f);
    tempo_.store(bpm);
}

void DelayProcessor::setTempoSyncL(TempoDivision div) {
    tempoSyncL_.store(div);
}

void DelayProcessor::setTempoSyncR(TempoDivision div) {
    tempoSyncR_.store(div);
}

void DelayProcessor::setTap1Level(float percent) {
    tap1Level_.store(std::clamp(percent, 0.0f, 100.0f));
}

void DelayProcessor::setTap2Level(float percent) {
    tap2Level_.store(std::clamp(percent, 0.0f, 100.0f));
}

void DelayProcessor::setTap2Ratio(float ratio) {
    tap2Ratio_.store(std::clamp(ratio, 0.1f, 1.0f));
}

void DelayProcessor::setTap3Level(float percent) {
    tap3Level_.store(std::clamp(percent, 0.0f, 100.0f));
}

void DelayProcessor::setTap3Ratio(float ratio) {
    tap3Ratio_.store(std::clamp(ratio, 0.1f, 1.0f));
}

void DelayProcessor::setTap4Level(float percent) {
    tap4Level_.store(std::clamp(percent, 0.0f, 100.0f));
}

void DelayProcessor::setTap4Ratio(float ratio) {
    tap4Ratio_.store(std::clamp(ratio, 0.1f, 1.0f));
}

void DelayProcessor::setStereoMode(StereoMode mode) {
    stereoMode_.store(mode);
}

void DelayProcessor::setStereoSpread(float percent) {
    stereoSpread_.store(std::clamp(percent, 0.0f, 200.0f));
}

void DelayProcessor::setPan(float pan) {
    pan_.store(std::clamp(pan, -100.0f, 100.0f));
}

void DelayProcessor::setModRate(float hz) {
    modRate_.store(std::clamp(hz, 0.01f, 10.0f));
}

void DelayProcessor::setModDepth(float percent) {
    modDepth_.store(std::clamp(percent, 0.0f, 100.0f));
}

void DelayProcessor::setModWaveform(ModWaveform waveform) {
    modWaveform_.store(waveform);
}

void DelayProcessor::setLowCut(float hz) {
    lowCut_.store(std::clamp(hz, 20.0f, 2000.0f));
    filtersNeedUpdate_.store(true);
}

void DelayProcessor::setHighCut(float hz) {
    highCut_.store(std::clamp(hz, 1000.0f, 20000.0f));
    filtersNeedUpdate_.store(true);
}

void DelayProcessor::setFilterInLoop(bool inLoop) {
    filterInLoop_.store(inLoop);
}

void DelayProcessor::setDiffusion(float percent) {
    diffusion_.store(std::clamp(percent, 0.0f, 100.0f));
}

void DelayProcessor::setDuckThreshold(float dB) {
    duckThreshold_.store(std::clamp(dB, -60.0f, 0.0f));
}

void DelayProcessor::setDuckAmount(float percent) {
    duckAmount_.store(std::clamp(percent, 0.0f, 100.0f));
}

void DelayProcessor::setDuckRelease(float ms) {
    duckRelease_.store(std::clamp(ms, 10.0f, 2000.0f));
}

void DelayProcessor::setOutputLevel(float dB) {
    outputLevel_.store(std::clamp(dB, -12.0f, 12.0f));
}

void DelayProcessor::setSpillover(bool enabled) {
    spillover_.store(enabled);
}

void DelayProcessor::setBypass(bool bypass) {
    bypass_.store(bypass);
    if (bypass && !spillover_.load()) {
        reset();
    }
}

DelayProcessor::Parameters DelayProcessor::getParameters() const {
    Parameters p;
    p.delayTimeL = delayTimeL_.load();
    p.delayTimeR = delayTimeR_.load();
    p.feedback = feedback_.load();
    p.mix = mix_.load();
    p.tempo = tempo_.load();
    p.tempoSyncL = tempoSyncL_.load();
    p.tempoSyncR = tempoSyncR_.load();
    p.tap1Level = tap1Level_.load();
    p.tap2Level = tap2Level_.load();
    p.tap2Ratio = tap2Ratio_.load();
    p.tap3Level = tap3Level_.load();
    p.tap3Ratio = tap3Ratio_.load();
    p.tap4Level = tap4Level_.load();
    p.tap4Ratio = tap4Ratio_.load();
    p.stereoMode = stereoMode_.load();
    p.stereoSpread = stereoSpread_.load();
    p.pan = pan_.load();
    p.modRate = modRate_.load();
    p.modDepth = modDepth_.load();
    p.modWaveform = modWaveform_.load();
    p.lowCut = lowCut_.load();
    p.highCut = highCut_.load();
    p.filterInLoop = filterInLoop_.load();
    p.diffusion = diffusion_.load();
    p.duckThreshold = duckThreshold_.load();
    p.duckAmount = duckAmount_.load();
    p.duckRelease = duckRelease_.load();
    p.outputLevel = outputLevel_.load();
    p.spillover = spillover_.load();
    p.bypass = bypass_.load();
    return p;
}

void DelayProcessor::setParameters(const Parameters& p) {
    setDelayTimeL(p.delayTimeL);
    setDelayTimeR(p.delayTimeR);
    setFeedback(p.feedback);
    setMix(p.mix);
    setTempo(p.tempo);
    setTempoSyncL(p.tempoSyncL);
    setTempoSyncR(p.tempoSyncR);
    setTap1Level(p.tap1Level);
    setTap2Level(p.tap2Level);
    setTap2Ratio(p.tap2Ratio);
    setTap3Level(p.tap3Level);
    setTap3Ratio(p.tap3Ratio);
    setTap4Level(p.tap4Level);
    setTap4Ratio(p.tap4Ratio);
    setStereoMode(p.stereoMode);
    setStereoSpread(p.stereoSpread);
    setPan(p.pan);
    setModRate(p.modRate);
    setModDepth(p.modDepth);
    setModWaveform(p.modWaveform);
    setLowCut(p.lowCut);
    setHighCut(p.highCut);
    setFilterInLoop(p.filterInLoop);
    setDiffusion(p.diffusion);
    setDuckThreshold(p.duckThreshold);
    setDuckAmount(p.duckAmount);
    setDuckRelease(p.duckRelease);
    setOutputLevel(p.outputLevel);
    setSpillover(p.spillover);
    setBypass(p.bypass);
}

DelayProcessor::Metering DelayProcessor::getMetering() const {
    Metering m;
    m.inputLevelL = inputLevelL_.load();
    m.inputLevelR = inputLevelR_.load();
    m.outputLevelL = outputLevelL_.load();
    m.outputLevelR = outputLevelR_.load();
    m.delayLevelL = delayLevelL_.load();
    m.delayLevelR = delayLevelR_.load();
    m.duckingGain = duckingGainDb_.load();
    m.modPhase = modPhaseOut_.load();
    return m;
}

void DelayProcessor::resetPeaks() {
    inputLevelL_.store(-100.0f);
    inputLevelR_.store(-100.0f);
    outputLevelL_.store(-100.0f);
    outputLevelR_.store(-100.0f);
    delayLevelL_.store(-100.0f);
    delayLevelR_.store(-100.0f);
}

// Static helpers
float DelayProcessor::linearToDb(float linear) {
    if (linear <= 0.0f) return -100.0f;
    return 20.0f * std::log10(linear);
}

float DelayProcessor::dbToLinear(float db) {
    return std::pow(10.0f, db / 20.0f);
}

float DelayProcessor::calculatePeakLevel(const float* data, int numSamples) {
    float peak = 0.0f;
    for (int i = 0; i < numSamples; ++i) {
        float absVal = std::abs(data[i]);
        if (absVal > peak) peak = absVal;
    }
    return linearToDb(peak);
}

} // namespace map2
