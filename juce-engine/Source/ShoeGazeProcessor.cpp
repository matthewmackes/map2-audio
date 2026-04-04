/**
 * MAP2 Audio Engine - ShoeGaze Multi-Effect Processor Implementation
 *
 * "Wall of Sound" effect combining:
 * - Soft saturation for warmth
 * - Modulated delay with BBD-style wobble
 * - Granular shimmer (pitch shifting into reverb feedback)
 * - FDN reverb network with long decay
 * - Multi-voice chorus for thickness
 * - Low/high cut filters for tone shaping
 */

#include "ShoeGazeProcessor.h"
#include <cmath>
#include <algorithm>

namespace map2 {

// ========================================
// AllPassFilter Implementation
// ========================================

void ShoeGazeProcessor::AllPassFilter::prepare(int maxSamples) {
    buffer.resize(maxSamples, 0.0f);
    writePos = 0;
}

float ShoeGazeProcessor::AllPassFilter::process(float input) {
    if (buffer.empty()) return input;

    int readPos = writePos - delaySamples;
    if (readPos < 0) readPos += static_cast<int>(buffer.size());

    float delayed = buffer[readPos];
    float output = -input + delayed;
    buffer[writePos] = input + delayed * feedback;

    writePos = (writePos + 1) % static_cast<int>(buffer.size());
    return output;
}

void ShoeGazeProcessor::AllPassFilter::reset() {
    std::fill(buffer.begin(), buffer.end(), 0.0f);
    writePos = 0;
}

// ========================================
// Constructor
// ========================================

ShoeGazeProcessor::ShoeGazeProcessor() {
}

// ========================================
// Initialization
// ========================================

void ShoeGazeProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;
    numChannels_ = numChannels;

    // Calculate buffer sizes based on sample rate
    int maxDelaySamples = static_cast<int>(sampleRate * 1.0) + 1;  // 1 second max delay
    int shimmerBufferSize = static_cast<int>(sampleRate * 0.2) + 1;  // 200ms for shimmer
    int chorusBufferSize = static_cast<int>(sampleRate * 0.05) + 1;  // 50ms for chorus
    int reverbBufferSize = static_cast<int>(sampleRate * 0.3) + 1;  // 300ms max per tap

    // Allocate delay buffers
    delayBufferL_.resize(maxDelaySamples, 0.0f);
    delayBufferR_.resize(maxDelaySamples, 0.0f);

    // Allocate shimmer buffers
    shimmerBufferL_.resize(shimmerBufferSize, 0.0f);
    shimmerBufferR_.resize(shimmerBufferSize, 0.0f);
    shimmerGrainSize_ = static_cast<int>(sampleRate * 0.042);  // ~42ms grain size

    // Initialize shimmer grains with staggered positions
    for (int i = 0; i < NUM_SHIMMER_GRAINS; ++i) {
        float phase = static_cast<float>(i) / static_cast<float>(NUM_SHIMMER_GRAINS);
        shimmerGrainsL_[i].readPos = phase * shimmerGrainSize_;
        shimmerGrainsL_[i].sampleCount = static_cast<int>(phase * shimmerGrainSize_);
        shimmerGrainsL_[i].active = true;

        shimmerGrainsR_[i].readPos = phase * shimmerGrainSize_;
        shimmerGrainsR_[i].sampleCount = static_cast<int>(phase * shimmerGrainSize_);
        shimmerGrainsR_[i].active = true;
    }

    // Initialize delay diffusers
    int diffuserDelays[] = {113, 199, 307, 421};
    for (int i = 0; i < NUM_DIFFUSION_STAGES; ++i) {
        int scaledDelay = static_cast<int>(diffuserDelays[i] * sampleRate / 48000.0);
        delayDiffusersL_[i].prepare(scaledDelay * 2);
        delayDiffusersL_[i].delaySamples = scaledDelay;
        delayDiffusersL_[i].feedback = 0.5f;

        delayDiffusersR_[i].prepare(scaledDelay * 2);
        delayDiffusersR_[i].delaySamples = scaledDelay;
        delayDiffusersR_[i].feedback = 0.5f;
    }

    // Initialize reverb taps
    for (int i = 0; i < NUM_REVERB_TAPS; ++i) {
        int scaledDelay = static_cast<int>(REVERB_DELAYS[i] * sampleRate / 48000.0);
        reverbTapsL_[i].buffer.resize(reverbBufferSize, 0.0f);
        reverbTapsL_[i].delaySamples = scaledDelay;
        reverbTapsL_[i].modPhase = static_cast<double>(i) / NUM_REVERB_TAPS;

        reverbTapsR_[i].buffer.resize(reverbBufferSize, 0.0f);
        reverbTapsR_[i].delaySamples = scaledDelay;
        reverbTapsR_[i].modPhase = static_cast<double>(i) / NUM_REVERB_TAPS + 0.5;
    }

    // Initialize reverb input diffusers
    int reverbDiffuserDelays[] = {142, 233, 379, 547};
    for (int i = 0; i < NUM_DIFFUSION_STAGES; ++i) {
        int scaledDelay = static_cast<int>(reverbDiffuserDelays[i] * sampleRate / 48000.0);
        reverbDiffusersL_[i].prepare(scaledDelay * 2);
        reverbDiffusersL_[i].delaySamples = scaledDelay;
        reverbDiffusersL_[i].feedback = 0.6f;

        reverbDiffusersR_[i].prepare(scaledDelay * 2);
        reverbDiffusersR_[i].delaySamples = scaledDelay;
        reverbDiffusersR_[i].feedback = 0.6f;
    }

    // Initialize chorus voices
    for (int i = 0; i < MAX_CHORUS_VOICES; ++i) {
        chorusVoicesL_[i].buffer.resize(chorusBufferSize, 0.0f);
        chorusVoicesL_[i].lfoPhase = static_cast<double>(i) / MAX_CHORUS_VOICES;
        chorusVoicesL_[i].pan = -1.0f + 2.0f * static_cast<float>(i) / (MAX_CHORUS_VOICES - 1);

        chorusVoicesR_[i].buffer.resize(chorusBufferSize, 0.0f);
        chorusVoicesR_[i].lfoPhase = static_cast<double>(i) / MAX_CHORUS_VOICES + 0.5;
        chorusVoicesR_[i].pan = -1.0f + 2.0f * static_cast<float>(i) / (MAX_CHORUS_VOICES - 1);
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
    saturationToneL_.prepare(spec);
    saturationToneR_.prepare(spec);

    // Initialize smoothed values
    smoothedMix_.reset(sampleRate, 0.02);
    smoothedDrive_.reset(sampleRate, 0.02);
    smoothedDelayTime_.reset(sampleRate, 0.05);

    filtersNeedUpdate_.store(true);
    prepared_ = true;
}

void ShoeGazeProcessor::reset() {
    // Clear delay buffers
    std::fill(delayBufferL_.begin(), delayBufferL_.end(), 0.0f);
    std::fill(delayBufferR_.begin(), delayBufferR_.end(), 0.0f);
    delayWritePos_ = 0;

    // Clear shimmer buffers
    std::fill(shimmerBufferL_.begin(), shimmerBufferL_.end(), 0.0f);
    std::fill(shimmerBufferR_.begin(), shimmerBufferR_.end(), 0.0f);
    shimmerWritePos_ = 0;
    shimmerFeedbackL_ = 0.0f;
    shimmerFeedbackR_ = 0.0f;

    // Reset diffusers
    for (auto& d : delayDiffusersL_) d.reset();
    for (auto& d : delayDiffusersR_) d.reset();
    for (auto& d : reverbDiffusersL_) d.reset();
    for (auto& d : reverbDiffusersR_) d.reset();

    // Reset reverb taps
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

    // Reset chorus voices
    for (auto& voice : chorusVoicesL_) {
        std::fill(voice.buffer.begin(), voice.buffer.end(), 0.0f);
        voice.writePos = 0;
    }
    for (auto& voice : chorusVoicesR_) {
        std::fill(voice.buffer.begin(), voice.buffer.end(), 0.0f);
        voice.writePos = 0;
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
    meterShimmer_.store(-100.0f);

    duckingEnvelope_ = 1.0f;
}

// ========================================
// Processing
// ========================================

void ShoeGazeProcessor::process(juce::AudioBuffer<float>& buffer) {
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

    const bool bypassed = bypass_.load();
    const bool spilloverEnabled = spillover_.load();

    // Handle bypass
    if (bypassed && !spilloverEnabled) {
        reset();
        meterOutputL_.store(meterInputL_.load());
        meterOutputR_.store(meterInputR_.load());
        return;
    }

    // Update filters if needed
    if (filtersNeedUpdate_.exchange(false)) {
        updateFilters();
    }

    // Load parameters
    float driveAmt = drive_.load() / 100.0f;
    float toneAmt = saturationTone_.load() / 100.0f;
    float mixAmt = mix_.load() / 100.0f;
    float shimmerAmt = shimmer_.load() / 100.0f;
    float shimmerPitchSt = shimmerPitch_.load();
    float modulationAmt = modulation_.load() / 100.0f;
    float modRateHz = modRate_.load();
    float delayMs = delayTime_.load();
    float delayFb = delayFeedback_.load() / 100.0f;
    float delayModAmt = delayMod_.load() / 100.0f;
    float decaySec = decay_.load();
    float stereoWidthAmt = stereoWidth_.load() / 100.0f;
    float duckingAmt = ducking_.load() / 100.0f;
    int numChorusVoices = chorusVoices_.load();

    // Update smoothed values
    smoothedMix_.setTargetValue(mixAmt);
    smoothedDrive_.setTargetValue(driveAmt);
    smoothedDelayTime_.setTargetValue(delayMs * static_cast<float>(sampleRate_) / 1000.0f);

    // Calculate pitch ratio for shimmer
    float shimmerRatio = semitonesToRatio(shimmerPitchSt);

    // Calculate reverb feedback from decay time
    // feedback = 10^(-3 * avgDelay / (decay * sampleRate))
    float avgDelay = 2000.0f;  // Average delay in samples at 48kHz
    float reverbFeedback = std::pow(10.0f, -3.0f * avgDelay / (decaySec * static_cast<float>(sampleRate_)));
    reverbFeedback = std::clamp(reverbFeedback, 0.0f, 0.995f);

    float* dataL = buffer.getWritePointer(0);
    float* dataR = numChannels >= 2 ? buffer.getWritePointer(1) : nullptr;

    // Temporary buffers for wet signal
    float reverbAccumL = 0.0f;
    float reverbAccumR = 0.0f;

    int delayBufferSize = static_cast<int>(delayBufferL_.size());
    int shimmerBufferSize = static_cast<int>(shimmerBufferL_.size());

    for (int i = 0; i < numSamples; ++i) {
        float wet = smoothedMix_.getNextValue();
        float dry = bypassed ? 1.0f : (1.0f - wet);
        float drive = smoothedDrive_.getNextValue();
        float delaySamples = smoothedDelayTime_.getNextValue();

        float dryInputL = dataL[i];
        float dryInputR = dataR != nullptr ? dataR[i] : dryInputL;
        float inputL = bypassed ? 0.0f : dryInputL;
        float inputR = bypassed ? 0.0f : dryInputR;

        // Calculate ducking based on input level
        float inputLevel = std::max(std::abs(inputL), std::abs(inputR));
        float duckGain = processDucking(inputLevel);
        if (duckingAmt > 0.0f) {
            duckGain = 1.0f - duckingAmt * (1.0f - duckGain);
        } else {
            duckGain = 1.0f;
        }

        // ========================================
        // Stage 1: Saturation
        // ========================================
        float satL = processSaturation(inputL, drive, toneAmt);
        float satR = processSaturation(inputR, drive, toneAmt);

        // ========================================
        // Stage 2: Modulated Delay
        // ========================================
        // Write to delay buffer
        delayBufferL_[delayWritePos_] = satL;
        delayBufferR_[delayWritePos_] = satR;

        // Calculate modulated delay time
        float delayModulation = std::sin(delayModLfoPhase_ * 2.0 * juce::MathConstants<double>::pi);
        float modDelaySamples = delaySamples + delayModulation * delayModAmt * 50.0f;
        modDelaySamples = std::max(1.0f, modDelaySamples);

        // Read from delay with feedback
        float delayedL = readDelayLine(delayBufferL_, delayWritePos_, modDelaySamples);
        float delayedR = readDelayLine(delayBufferR_, delayWritePos_, modDelaySamples);

        // Apply diffusion to delayed signal
        float diffusedL = delayedL;
        float diffusedR = delayedR;
        float diffusionAmt = reverbDiffusion_.load() / 100.0f;
        if (diffusionAmt > 0.0f) {
            for (auto& diff : delayDiffusersL_) {
                diffusedL = diff.process(diffusedL) * diffusionAmt + delayedL * (1.0f - diffusionAmt);
            }
            for (auto& diff : delayDiffusersR_) {
                diffusedR = diff.process(diffusedR) * diffusionAmt + delayedR * (1.0f - diffusionAmt);
            }
        }

        // Add feedback to delay buffer
        delayBufferL_[delayWritePos_] += diffusedL * delayFb;
        delayBufferR_[delayWritePos_] += diffusedR * delayFb;

        // Advance delay write position
        delayWritePos_ = (delayWritePos_ + 1) % delayBufferSize;

        // Advance delay modulation LFO
        delayModLfoPhase_ += modRateHz / sampleRate_;
        if (delayModLfoPhase_ >= 1.0) delayModLfoPhase_ -= 1.0;

        // ========================================
        // Stage 3: Shimmer (Pitch Shift + Reverb Feedback)
        // ========================================
        float shimmerOutL = 0.0f, shimmerOutR = 0.0f;
        if (shimmerAmt > 0.0f) {
            // Mix delayed signal with shimmer feedback for input
            float shimmerInL = diffusedL + shimmerFeedbackL_ * (shimmerFeedback_.load() / 100.0f);
            float shimmerInR = diffusedR + shimmerFeedbackR_ * (shimmerFeedback_.load() / 100.0f);

            // Write to shimmer buffer
            shimmerBufferL_[shimmerWritePos_] = shimmerInL;
            shimmerBufferR_[shimmerWritePos_] = shimmerInR;

            // Process shimmer grains (granular pitch shift)
            for (auto& grain : shimmerGrainsL_) {
                if (!grain.active) continue;

                float phase = static_cast<float>(grain.sampleCount) / static_cast<float>(shimmerGrainSize_);
                float window = hannWindow(phase);

                float sample = readDelayLine(shimmerBufferL_, shimmerWritePos_,
                    shimmerBufferSize - grain.readPos);
                shimmerOutL += sample * window;

                grain.readPos += shimmerRatio;
                while (grain.readPos >= shimmerBufferSize) grain.readPos -= shimmerBufferSize;
                while (grain.readPos < 0) grain.readPos += shimmerBufferSize;

                grain.sampleCount++;
                if (grain.sampleCount >= shimmerGrainSize_) {
                    grain.sampleCount = 0;
                    grain.readPos = 0.0f;
                }
            }

            for (auto& grain : shimmerGrainsR_) {
                if (!grain.active) continue;

                float phase = static_cast<float>(grain.sampleCount) / static_cast<float>(shimmerGrainSize_);
                float window = hannWindow(phase);

                float sample = readDelayLine(shimmerBufferR_, shimmerWritePos_,
                    shimmerBufferSize - grain.readPos);
                shimmerOutR += sample * window;

                grain.readPos += shimmerRatio;
                while (grain.readPos >= shimmerBufferSize) grain.readPos -= shimmerBufferSize;
                while (grain.readPos < 0) grain.readPos += shimmerBufferSize;

                grain.sampleCount++;
                if (grain.sampleCount >= shimmerGrainSize_) {
                    grain.sampleCount = 0;
                    grain.readPos = 0.0f;
                }
            }

            shimmerWritePos_ = (shimmerWritePos_ + 1) % shimmerBufferSize;

            // Normalize shimmer output
            shimmerOutL /= static_cast<float>(NUM_SHIMMER_GRAINS) * 0.5f;
            shimmerOutR /= static_cast<float>(NUM_SHIMMER_GRAINS) * 0.5f;
        }

        // ========================================
        // Stage 4: FDN Reverb
        // ========================================
        // Input diffusion
        float reverbInL = diffusedL + shimmerOutL * shimmerAmt;
        float reverbInR = diffusedR + shimmerOutR * shimmerAmt;

        for (auto& diff : reverbDiffusersL_) {
            reverbInL = diff.process(reverbInL);
        }
        for (auto& diff : reverbDiffusersR_) {
            reverbInR = diff.process(reverbInR);
        }

        // FDN processing
        reverbAccumL = 0.0f;
        reverbAccumR = 0.0f;

        float dampingCoeff = reverbDamping_.load() / 100.0f;
        float reverbModDepth = reverbModDepth_.load() / 100.0f;

        for (int t = 0; t < NUM_REVERB_TAPS; ++t) {
            auto& tapL = reverbTapsL_[t];
            auto& tapR = reverbTapsR_[t];

            // Modulated delay time
            float modL = static_cast<float>(std::sin(tapL.modPhase * 2.0 * juce::MathConstants<double>::pi));
            float modR = static_cast<float>(std::sin(tapR.modPhase * 2.0 * juce::MathConstants<double>::pi));

            int modDelayL = tapL.delaySamples + static_cast<int>(modL * reverbModDepth * 20.0f);
            int modDelayR = tapR.delaySamples + static_cast<int>(modR * reverbModDepth * 20.0f);
            modDelayL = std::clamp(modDelayL, 1, static_cast<int>(tapL.buffer.size()) - 1);
            modDelayR = std::clamp(modDelayR, 1, static_cast<int>(tapR.buffer.size()) - 1);

            // Read from tap
            int readPosL = tapL.writePos - modDelayL;
            if (readPosL < 0) readPosL += static_cast<int>(tapL.buffer.size());
            int readPosR = tapR.writePos - modDelayR;
            if (readPosR < 0) readPosR += static_cast<int>(tapR.buffer.size());

            float tapOutL = tapL.buffer[readPosL];
            float tapOutR = tapR.buffer[readPosR];

            // Apply damping (one-pole lowpass)
            tapL.lowpassState = tapL.lowpassState + dampingCoeff * (tapOutL - tapL.lowpassState);
            tapR.lowpassState = tapR.lowpassState + dampingCoeff * (tapOutR - tapR.lowpassState);

            float dampedL = tapOutL * (1.0f - dampingCoeff) + tapL.lowpassState * dampingCoeff;
            float dampedR = tapOutR * (1.0f - dampingCoeff) + tapR.lowpassState * dampingCoeff;

            // Accumulate output
            reverbAccumL += dampedL;
            reverbAccumR += dampedR;

            // Write to tap (input + feedback from other taps)
            tapL.buffer[tapL.writePos] = reverbInL + dampedR * reverbFeedback;
            tapR.buffer[tapR.writePos] = reverbInR + dampedL * reverbFeedback;

            // Advance write position
            tapL.writePos = (tapL.writePos + 1) % static_cast<int>(tapL.buffer.size());
            tapR.writePos = (tapR.writePos + 1) % static_cast<int>(tapR.buffer.size());

            // Advance modulation phase
            tapL.modPhase += 0.1 / sampleRate_;
            if (tapL.modPhase >= 1.0) tapL.modPhase -= 1.0;
            tapR.modPhase += 0.1 / sampleRate_;
            if (tapR.modPhase >= 1.0) tapR.modPhase -= 1.0;
        }

        // Normalize reverb output
        reverbAccumL /= static_cast<float>(NUM_REVERB_TAPS) * 0.5f;
        reverbAccumR /= static_cast<float>(NUM_REVERB_TAPS) * 0.5f;

        // Store shimmer feedback
        shimmerFeedbackL_ = reverbAccumL;
        shimmerFeedbackR_ = reverbAccumR;

        // ========================================
        // Stage 5: Chorus
        // ========================================
        float chorusOutL = 0.0f, chorusOutR = 0.0f;
        if (modulationAmt > 0.0f && numChorusVoices > 0) {
            float baseDelayMs = 7.0f;  // 7ms base delay
            float depthMs = 3.0f * modulationAmt;  // Up to 3ms modulation depth

            for (int v = 0; v < numChorusVoices; ++v) {
                auto& voiceL = chorusVoicesL_[v];
                auto& voiceR = chorusVoicesR_[v];

                // Write to chorus buffers
                voiceL.buffer[voiceL.writePos] = reverbAccumL;
                voiceR.buffer[voiceR.writePos] = reverbAccumR;

                // Calculate modulated delay
                float lfoL = static_cast<float>(std::sin(voiceL.lfoPhase * 2.0 * juce::MathConstants<double>::pi));
                float lfoR = static_cast<float>(std::sin(voiceR.lfoPhase * 2.0 * juce::MathConstants<double>::pi));

                float delayMsL = baseDelayMs + depthMs * lfoL;
                float delayMsR = baseDelayMs + depthMs * lfoR;

                float delaySamplesL = delayMsL * static_cast<float>(sampleRate_) / 1000.0f;
                float delaySamplesR = delayMsR * static_cast<float>(sampleRate_) / 1000.0f;

                // Read from chorus buffer
                float chorusSampleL = readDelayLine(voiceL.buffer, voiceL.writePos, delaySamplesL);
                float chorusSampleR = readDelayLine(voiceR.buffer, voiceR.writePos, delaySamplesR);

                // Apply panning based on spread
                float spreadAmt = chorusSpread_.load() / 100.0f;
                float panL = voiceL.pan * spreadAmt;
                float panR = voiceR.pan * spreadAmt;

                chorusOutL += chorusSampleL * (1.0f - std::max(0.0f, panL));
                chorusOutR += chorusSampleR * (1.0f + std::min(0.0f, panR));

                // Advance write position
                voiceL.writePos = (voiceL.writePos + 1) % static_cast<int>(voiceL.buffer.size());
                voiceR.writePos = (voiceR.writePos + 1) % static_cast<int>(voiceR.buffer.size());

                // Advance LFO phase
                voiceL.lfoPhase += modRateHz / sampleRate_;
                if (voiceL.lfoPhase >= 1.0) voiceL.lfoPhase -= 1.0;
                voiceR.lfoPhase += modRateHz / sampleRate_;
                if (voiceR.lfoPhase >= 1.0) voiceR.lfoPhase -= 1.0;
            }

            // Normalize chorus output
            chorusOutL /= static_cast<float>(numChorusVoices);
            chorusOutR /= static_cast<float>(numChorusVoices);

            // Mix chorus with reverb
            reverbAccumL = reverbAccumL * (1.0f - modulationAmt) + chorusOutL * modulationAmt;
            reverbAccumR = reverbAccumR * (1.0f - modulationAmt) + chorusOutR * modulationAmt;
        }

        // ========================================
        // Stage 6: Filters
        // ========================================
        float filteredL = lowCutFilterL_.processSample(reverbAccumL);
        filteredL = highCutFilterL_.processSample(filteredL);
        float filteredR = lowCutFilterR_.processSample(reverbAccumR);
        filteredR = highCutFilterR_.processSample(filteredR);

        // ========================================
        // Stage 7: Stereo Width
        // ========================================
        float mid = (filteredL + filteredR) * 0.5f;
        float side = (filteredL - filteredR) * 0.5f;
        side *= stereoWidthAmt;
        float widthL = mid + side;
        float widthR = mid - side;

        // ========================================
        // Final Mix with Ducking
        // ========================================
        float wetL = widthL * duckGain;
        float wetR = widthR * duckGain;

        dataL[i] = dryInputL * dry + wetL * wet;
        if (dataR != nullptr) {
            dataR[i] = dryInputR * dry + wetR * wet;
        }
    }

    // Update metering
    meterOutputL_.store(calculatePeakLevel(dataL, numSamples));
    if (dataR != nullptr) {
        meterOutputR_.store(calculatePeakLevel(dataR, numSamples));
    }
    meterReverbL_.store(linearToDb(std::abs(reverbAccumL)));
    meterReverbR_.store(linearToDb(std::abs(reverbAccumR)));
    meterChorusPhase_.store(static_cast<float>(chorusVoicesL_[0].lfoPhase));
    meterDelayModPhase_.store(static_cast<float>(delayModLfoPhase_));
    meterDuckingGain_.store(duckingEnvelope_);
}

// ========================================
// DSP Processing Methods
// ========================================

float ShoeGazeProcessor::processSaturation(float input, float driveAmount, float toneAmount) {
    if (driveAmount <= 0.0f) return input;

    // Apply drive (gain before saturation)
    float gained = input * (1.0f + driveAmount * 4.0f);

    // Soft clipping using tanh
    float saturated = std::tanh(gained);

    // Blend based on drive amount
    float output = input * (1.0f - driveAmount) + saturated * driveAmount;

    // Store saturation amount for metering
    meterSaturation_.store(std::abs(gained - saturated));

    return output;
}

float ShoeGazeProcessor::processDucking(float inputLevel) {
    // Envelope follower for ducking
    float attackCoeff = std::exp(-1.0f / (static_cast<float>(sampleRate_) * 0.01f));  // 10ms attack
    float releaseCoeff = std::exp(-1.0f / (static_cast<float>(sampleRate_) * 0.2f));  // 200ms release

    if (inputLevel > duckingEnvelope_) {
        duckingEnvelope_ = attackCoeff * duckingEnvelope_ + (1.0f - attackCoeff) * inputLevel;
    } else {
        duckingEnvelope_ = releaseCoeff * duckingEnvelope_ + (1.0f - releaseCoeff) * inputLevel;
    }

    // Convert envelope to ducking gain (higher input = lower gain)
    float threshold = 0.1f;
    if (duckingEnvelope_ > threshold) {
        return threshold / duckingEnvelope_;
    }
    return 1.0f;
}

void ShoeGazeProcessor::updateFilters() {
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

// ========================================
// Utility Methods
// ========================================

float ShoeGazeProcessor::readDelayLine(const std::vector<float>& buffer, int writePos, float delaySamples) const {
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

float ShoeGazeProcessor::hannWindow(float phase) const {
    return 0.5f * (1.0f - std::cos(2.0f * juce::MathConstants<float>::pi * phase));
}

float ShoeGazeProcessor::semitonesToRatio(float semitones) const {
    return std::pow(2.0f, semitones / 12.0f);
}

float ShoeGazeProcessor::linearToDb(float linear) {
    if (linear <= 0.0f) return -100.0f;
    return 20.0f * std::log10(linear);
}

float ShoeGazeProcessor::dbToLinear(float db) {
    return std::pow(10.0f, db / 20.0f);
}

float ShoeGazeProcessor::calculatePeakLevel(const float* data, int numSamples) {
    float peak = 0.0f;
    for (int i = 0; i < numSamples; ++i) {
        float abs = std::abs(data[i]);
        if (abs > peak) peak = abs;
    }
    return linearToDb(peak);
}

// ========================================
// Preset Management
// ========================================

void ShoeGazeProcessor::applyPreset(Preset preset) {
    switch (preset) {
        case Preset::Manual:
            break;

        case Preset::Loveless:
            // My Bloody Valentine - dense, gliding, otherworldly
            atmosphere_.store(75.0f);
            decay_.store(5.5f);
            shimmer_.store(15.0f);
            shimmerPitch_.store(12.0f);
            modulation_.store(60.0f);
            modRate_.store(0.5f);
            drive_.store(25.0f);
            delayTime_.store(300.0f);
            delayFeedback_.store(45.0f);
            delayMod_.store(40.0f);
            lowCut_.store(120.0f);
            highCut_.store(6000.0f);
            mix_.store(55.0f);
            stereoWidth_.store(180.0f);
            filtersNeedUpdate_.store(true);
            break;

        case Preset::Souvlaki:
            // Slowdive - ethereal, washy, dream-like
            atmosphere_.store(80.0f);
            decay_.store(8.0f);
            shimmer_.store(35.0f);
            shimmerPitch_.store(12.0f);
            modulation_.store(40.0f);
            modRate_.store(0.6f);
            drive_.store(10.0f);
            delayTime_.store(400.0f);
            delayFeedback_.store(35.0f);
            delayMod_.store(25.0f);
            lowCut_.store(100.0f);
            highCut_.store(7000.0f);
            mix_.store(60.0f);
            stereoWidth_.store(160.0f);
            filtersNeedUpdate_.store(true);
            break;

        case Preset::Treasure:
            // Cocteau Twins - shimmering, crystal-clear highs
            atmosphere_.store(70.0f);
            decay_.store(4.0f);
            shimmer_.store(50.0f);
            shimmerPitch_.store(12.0f);
            modulation_.store(30.0f);
            modRate_.store(0.8f);
            drive_.store(5.0f);
            delayTime_.store(250.0f);
            delayFeedback_.store(25.0f);
            delayMod_.store(15.0f);
            lowCut_.store(60.0f);
            highCut_.store(12000.0f);
            mix_.store(50.0f);
            stereoWidth_.store(140.0f);
            filtersNeedUpdate_.store(true);
            break;

        case Preset::SpaceAge:
            // Spiritualized - expansive, slowly evolving
            atmosphere_.store(90.0f);
            decay_.store(12.0f);
            shimmer_.store(40.0f);
            shimmerPitch_.store(12.0f);
            modulation_.store(25.0f);
            modRate_.store(0.3f);
            drive_.store(20.0f);
            delayTime_.store(500.0f);
            delayFeedback_.store(50.0f);
            delayMod_.store(30.0f);
            lowCut_.store(80.0f);
            highCut_.store(5500.0f);
            mix_.store(65.0f);
            stereoWidth_.store(175.0f);
            filtersNeedUpdate_.store(true);
            break;

        case Preset::Psychocandy:
            // Jesus and Mary Chain - feedback-drenched noise-gaze
            atmosphere_.store(60.0f);
            decay_.store(3.0f);
            shimmer_.store(10.0f);
            shimmerPitch_.store(7.0f);
            modulation_.store(20.0f);
            modRate_.store(1.2f);
            drive_.store(60.0f);
            delayTime_.store(180.0f);
            delayFeedback_.store(55.0f);
            delayMod_.store(35.0f);
            lowCut_.store(150.0f);
            highCut_.store(4500.0f);
            mix_.store(45.0f);
            stereoWidth_.store(120.0f);
            filtersNeedUpdate_.store(true);
            break;

        case Preset::Nowhere:
            // Ride - swirling, propulsive
            atmosphere_.store(65.0f);
            decay_.store(4.5f);
            shimmer_.store(25.0f);
            shimmerPitch_.store(12.0f);
            modulation_.store(50.0f);
            modRate_.store(0.9f);
            drive_.store(15.0f);
            delayTime_.store(350.0f);
            delayFeedback_.store(40.0f);
            delayMod_.store(30.0f);
            lowCut_.store(90.0f);
            highCut_.store(7500.0f);
            mix_.store(50.0f);
            stereoWidth_.store(155.0f);
            filtersNeedUpdate_.store(true);
            break;

        default:
            break;
    }
}

ShoeGazeProcessor::PresetInfo ShoeGazeProcessor::getPresetInfo(Preset preset) {
    switch (preset) {
        case Preset::Manual:
            return {"Manual", "Custom", "User-defined settings"};
        case Preset::Loveless:
            return {"Loveless", "My Bloody Valentine", "Dense, gliding, otherworldly - Kevin Shields' signature sound"};
        case Preset::Souvlaki:
            return {"Souvlaki", "Slowdive", "Ethereal, washy, dream-like - Rachel Goswell era"};
        case Preset::Treasure:
            return {"Treasure", "Cocteau Twins", "Shimmering, crystal-clear highs - Robin Guthrie's signature"};
        case Preset::SpaceAge:
            return {"Space Age", "Spiritualized", "Expansive, slowly evolving - Jason Pierce's spacious sound"};
        case Preset::Psychocandy:
            return {"Psychocandy", "Jesus and Mary Chain", "Feedback-drenched noise-gaze"};
        case Preset::Nowhere:
            return {"Nowhere", "Ride", "Swirling, propulsive textures - Mark Gardener's sound"};
        default:
            return {"Unknown", "Unknown", ""};
    }
}

// ========================================
// Parameter Setters
// ========================================

void ShoeGazeProcessor::setAtmosphere(float percent) {
    atmosphere_.store(std::clamp(percent, 0.0f, 100.0f));
    preset_.store(Preset::Manual);
}

void ShoeGazeProcessor::setDecay(float seconds) {
    decay_.store(std::clamp(seconds, 0.5f, 30.0f));
    preset_.store(Preset::Manual);
}

void ShoeGazeProcessor::setShimmer(float percent) {
    shimmer_.store(std::clamp(percent, 0.0f, 100.0f));
    preset_.store(Preset::Manual);
}

void ShoeGazeProcessor::setShimmerPitch(float semitones) {
    shimmerPitch_.store(std::clamp(semitones, -12.0f, 24.0f));
    preset_.store(Preset::Manual);
}

void ShoeGazeProcessor::setModulation(float percent) {
    modulation_.store(std::clamp(percent, 0.0f, 100.0f));
    preset_.store(Preset::Manual);
}

void ShoeGazeProcessor::setModRate(float hz) {
    modRate_.store(std::clamp(hz, 0.1f, 5.0f));
    preset_.store(Preset::Manual);
}

void ShoeGazeProcessor::setDrive(float percent) {
    drive_.store(std::clamp(percent, 0.0f, 100.0f));
    preset_.store(Preset::Manual);
}

void ShoeGazeProcessor::setDelayTime(float ms) {
    delayTime_.store(std::clamp(ms, 0.0f, 1000.0f));
    preset_.store(Preset::Manual);
}

void ShoeGazeProcessor::setDelayFeedback(float percent) {
    delayFeedback_.store(std::clamp(percent, 0.0f, 90.0f));
    preset_.store(Preset::Manual);
}

void ShoeGazeProcessor::setDelayMod(float percent) {
    delayMod_.store(std::clamp(percent, 0.0f, 100.0f));
    preset_.store(Preset::Manual);
}

void ShoeGazeProcessor::setLowCut(float hz) {
    lowCut_.store(std::clamp(hz, 20.0f, 2000.0f));
    filtersNeedUpdate_.store(true);
    preset_.store(Preset::Manual);
}

void ShoeGazeProcessor::setHighCut(float hz) {
    highCut_.store(std::clamp(hz, 1000.0f, 20000.0f));
    filtersNeedUpdate_.store(true);
    preset_.store(Preset::Manual);
}

void ShoeGazeProcessor::setMix(float percent) {
    mix_.store(std::clamp(percent, 0.0f, 100.0f));
}

void ShoeGazeProcessor::setStereoWidth(float percent) {
    stereoWidth_.store(std::clamp(percent, 0.0f, 200.0f));
    preset_.store(Preset::Manual);
}

// Advanced setters
void ShoeGazeProcessor::setReverbDiffusion(float percent) {
    reverbDiffusion_.store(std::clamp(percent, 0.0f, 100.0f));
}

void ShoeGazeProcessor::setReverbDamping(float percent) {
    reverbDamping_.store(std::clamp(percent, 0.0f, 100.0f));
}

void ShoeGazeProcessor::setReverbSize(float percent) {
    reverbSize_.store(std::clamp(percent, 10.0f, 100.0f));
}

void ShoeGazeProcessor::setReverbModDepth(float percent) {
    reverbModDepth_.store(std::clamp(percent, 0.0f, 50.0f));
}

void ShoeGazeProcessor::setShimmerFeedback(float percent) {
    shimmerFeedback_.store(std::clamp(percent, 0.0f, 80.0f));
}

void ShoeGazeProcessor::setShimmerDelay(float ms) {
    shimmerDelay_.store(std::clamp(ms, 0.0f, 200.0f));
}

void ShoeGazeProcessor::setChorusVoices(int voices) {
    chorusVoices_.store(std::clamp(voices, 1, MAX_CHORUS_VOICES));
}

void ShoeGazeProcessor::setChorusSpread(float percent) {
    chorusSpread_.store(std::clamp(percent, 0.0f, 100.0f));
}

void ShoeGazeProcessor::setSaturationTone(float percent) {
    saturationTone_.store(std::clamp(percent, 0.0f, 100.0f));
}

void ShoeGazeProcessor::setDucking(float percent) {
    ducking_.store(std::clamp(percent, 0.0f, 100.0f));
}

// State setters
void ShoeGazeProcessor::setPreset(Preset preset) {
    preset_.store(preset);
    applyPreset(preset);
}

void ShoeGazeProcessor::setSpillover(bool enabled) {
    spillover_.store(enabled);
}

void ShoeGazeProcessor::setBypass(bool bypass) {
    bypass_.store(bypass);
}

// ========================================
// Bulk Parameter Access
// ========================================

ShoeGazeProcessor::Parameters ShoeGazeProcessor::getParameters() const {
    Parameters params;
    params.atmosphere = atmosphere_.load();
    params.decay = decay_.load();
    params.shimmer = shimmer_.load();
    params.shimmerPitch = shimmerPitch_.load();
    params.modulation = modulation_.load();
    params.modRate = modRate_.load();
    params.drive = drive_.load();
    params.delayTime = delayTime_.load();
    params.delayFeedback = delayFeedback_.load();
    params.delayMod = delayMod_.load();
    params.lowCut = lowCut_.load();
    params.highCut = highCut_.load();
    params.mix = mix_.load();
    params.stereoWidth = stereoWidth_.load();
    params.reverbDiffusion = reverbDiffusion_.load();
    params.reverbDamping = reverbDamping_.load();
    params.reverbSize = reverbSize_.load();
    params.reverbModDepth = reverbModDepth_.load();
    params.shimmerFeedback = shimmerFeedback_.load();
    params.shimmerDelay = shimmerDelay_.load();
    params.chorusVoices = chorusVoices_.load();
    params.chorusSpread = chorusSpread_.load();
    params.saturationTone = saturationTone_.load();
    params.ducking = ducking_.load();
    params.preset = preset_.load();
    params.spillover = spillover_.load();
    params.bypass = bypass_.load();
    return params;
}

void ShoeGazeProcessor::setParameters(const Parameters& params) {
    if (params.preset != Preset::Manual) {
        setPreset(params.preset);
    } else {
        atmosphere_.store(params.atmosphere);
        decay_.store(params.decay);
        shimmer_.store(params.shimmer);
        shimmerPitch_.store(params.shimmerPitch);
        modulation_.store(params.modulation);
        modRate_.store(params.modRate);
        drive_.store(params.drive);
        delayTime_.store(params.delayTime);
        delayFeedback_.store(params.delayFeedback);
        delayMod_.store(params.delayMod);
        lowCut_.store(params.lowCut);
        highCut_.store(params.highCut);
        stereoWidth_.store(params.stereoWidth);
        reverbDiffusion_.store(params.reverbDiffusion);
        reverbDamping_.store(params.reverbDamping);
        reverbSize_.store(params.reverbSize);
        reverbModDepth_.store(params.reverbModDepth);
        shimmerFeedback_.store(params.shimmerFeedback);
        shimmerDelay_.store(params.shimmerDelay);
        chorusVoices_.store(params.chorusVoices);
        chorusSpread_.store(params.chorusSpread);
        saturationTone_.store(params.saturationTone);
        ducking_.store(params.ducking);
        filtersNeedUpdate_.store(true);
    }
    mix_.store(params.mix);
    spillover_.store(params.spillover);
    bypass_.store(params.bypass);
}

std::unique_ptr<ShoeGazeProcessor> ShoeGazeProcessor::cloneForSpillover() const {
    auto clone = std::make_unique<ShoeGazeProcessor>();

    auto copyAtomicFloat = [](std::atomic<float>& dst, const std::atomic<float>& src) {
        dst.store(src.load());
    };
    auto copyAtomicBool = [](std::atomic<bool>& dst, const std::atomic<bool>& src) {
        dst.store(src.load());
    };

    clone->delayBufferL_ = delayBufferL_;
    clone->delayBufferR_ = delayBufferR_;
    clone->delayWritePos_ = delayWritePos_;
    clone->delayModLfoPhase_ = delayModLfoPhase_;
    clone->delayDiffusersL_ = delayDiffusersL_;
    clone->delayDiffusersR_ = delayDiffusersR_;
    clone->shimmerBufferL_ = shimmerBufferL_;
    clone->shimmerBufferR_ = shimmerBufferR_;
    clone->shimmerWritePos_ = shimmerWritePos_;
    clone->shimmerGrainsL_ = shimmerGrainsL_;
    clone->shimmerGrainsR_ = shimmerGrainsR_;
    clone->currentShimmerGrain_ = currentShimmerGrain_;
    clone->shimmerGrainSize_ = shimmerGrainSize_;
    clone->shimmerFeedbackL_ = shimmerFeedbackL_;
    clone->shimmerFeedbackR_ = shimmerFeedbackR_;
    clone->reverbTapsL_ = reverbTapsL_;
    clone->reverbTapsR_ = reverbTapsR_;
    clone->reverbDiffusersL_ = reverbDiffusersL_;
    clone->reverbDiffusersR_ = reverbDiffusersR_;
    clone->chorusVoicesL_ = chorusVoicesL_;
    clone->chorusVoicesR_ = chorusVoicesR_;
    clone->duckingEnvelope_ = duckingEnvelope_;
    clone->smoothedMix_ = smoothedMix_;
    clone->smoothedDrive_ = smoothedDrive_;
    clone->smoothedDelayTime_ = smoothedDelayTime_;

    copyAtomicFloat(clone->atmosphere_, atmosphere_);
    copyAtomicFloat(clone->decay_, decay_);
    copyAtomicFloat(clone->shimmer_, shimmer_);
    copyAtomicFloat(clone->shimmerPitch_, shimmerPitch_);
    copyAtomicFloat(clone->modulation_, modulation_);
    copyAtomicFloat(clone->modRate_, modRate_);
    copyAtomicFloat(clone->drive_, drive_);
    copyAtomicFloat(clone->delayTime_, delayTime_);
    copyAtomicFloat(clone->delayFeedback_, delayFeedback_);
    copyAtomicFloat(clone->delayMod_, delayMod_);
    copyAtomicFloat(clone->lowCut_, lowCut_);
    copyAtomicFloat(clone->highCut_, highCut_);
    copyAtomicFloat(clone->mix_, mix_);
    copyAtomicFloat(clone->stereoWidth_, stereoWidth_);
    copyAtomicFloat(clone->reverbDiffusion_, reverbDiffusion_);
    copyAtomicFloat(clone->reverbDamping_, reverbDamping_);
    copyAtomicFloat(clone->reverbSize_, reverbSize_);
    copyAtomicFloat(clone->reverbModDepth_, reverbModDepth_);
    copyAtomicFloat(clone->shimmerFeedback_, shimmerFeedback_);
    copyAtomicFloat(clone->shimmerDelay_, shimmerDelay_);
    clone->chorusVoices_.store(chorusVoices_.load());
    copyAtomicFloat(clone->chorusSpread_, chorusSpread_);
    copyAtomicFloat(clone->saturationTone_, saturationTone_);
    copyAtomicFloat(clone->ducking_, ducking_);
    clone->preset_.store(preset_.load());
    copyAtomicBool(clone->spillover_, spillover_);
    copyAtomicBool(clone->bypass_, bypass_);

    copyAtomicFloat(clone->meterInputL_, meterInputL_);
    copyAtomicFloat(clone->meterInputR_, meterInputR_);
    copyAtomicFloat(clone->meterOutputL_, meterOutputL_);
    copyAtomicFloat(clone->meterOutputR_, meterOutputR_);
    copyAtomicFloat(clone->meterReverbL_, meterReverbL_);
    copyAtomicFloat(clone->meterReverbR_, meterReverbR_);
    copyAtomicFloat(clone->meterShimmer_, meterShimmer_);
    copyAtomicFloat(clone->meterSaturation_, meterSaturation_);
    copyAtomicFloat(clone->meterChorusPhase_, meterChorusPhase_);
    copyAtomicFloat(clone->meterDelayModPhase_, meterDelayModPhase_);
    copyAtomicFloat(clone->meterDuckingGain_, meterDuckingGain_);

    clone->sampleRate_ = sampleRate_;
    clone->blockSize_ = blockSize_;
    clone->numChannels_ = numChannels_;
    clone->prepared_ = prepared_;
    clone->filtersNeedUpdate_.store(true);

    return clone;
}

// ========================================
// Metering
// ========================================

ShoeGazeProcessor::Metering ShoeGazeProcessor::getMetering() const {
    Metering m;
    m.inputLevelL = meterInputL_.load();
    m.inputLevelR = meterInputR_.load();
    m.outputLevelL = meterOutputL_.load();
    m.outputLevelR = meterOutputR_.load();
    m.reverbLevelL = meterReverbL_.load();
    m.reverbLevelR = meterReverbR_.load();
    m.shimmerLevel = meterShimmer_.load();
    m.saturationAmount = meterSaturation_.load();
    m.chorusLfoPhase = meterChorusPhase_.load();
    m.delayModPhase = meterDelayModPhase_.load();
    m.duckingGain = meterDuckingGain_.load();
    return m;
}

void ShoeGazeProcessor::resetPeaks() {
    meterInputL_.store(-100.0f);
    meterInputR_.store(-100.0f);
    meterOutputL_.store(-100.0f);
    meterOutputR_.store(-100.0f);
    meterReverbL_.store(-100.0f);
    meterReverbR_.store(-100.0f);
    meterShimmer_.store(-100.0f);
}

} // namespace map2
