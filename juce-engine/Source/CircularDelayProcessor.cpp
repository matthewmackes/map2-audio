#include "CircularDelayProcessor.h"
#include <cmath>
#include <algorithm>

namespace map2 {

CircularDelayProcessor::CircularDelayProcessor()
    : lfoOscillator_([](float x) { return x < 0.0f ? (x * 2.0f + 1.0f) : (1.0f - x * 2.0f); }) // Triangle wave
{
}

void CircularDelayProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels)
{
    sampleRate_ = sampleRate;
    samplesPerBlock_ = samplesPerBlock;
    numChannels_ = numChannels;

    // Create delay buffer (max 2 seconds at current sample rate)
    int maxDelaySamples = static_cast<int>(sampleRate * 2.0);
    delayBuffer_.resize(maxDelaySamples, 0.0f);
    delayBufferSize_ = maxDelaySamples;
    writePosition_ = 0;

    // Setup LFO oscillator
    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = static_cast<juce::uint32>(samplesPerBlock);
    spec.numChannels = 1;
    lfoOscillator_.prepare(spec);
    lfoOscillator_.setFrequency(1.0f);

    updateDerivedParameters();
    reset();
}

void CircularDelayProcessor::reset()
{
    std::fill(delayBuffer_.begin(), delayBuffer_.end(), 0.0f);
    writePosition_ = 0;
    lfoPhase_ = 0.0f;
    lfoOscillator_.reset();
    metering_ = Metering();
}

void CircularDelayProcessor::process(juce::AudioBuffer<float>& buffer)
{
    if (bypass_.load()) {
        return;
    }

    const int numSamples = buffer.getNumSamples();
    const int numChannelsBuffer = buffer.getNumChannels();

    // Update LFO frequency (pan rate)
    float currentPanRate = panRate_.load();
    lfoOscillator_.setFrequency(currentPanRate);

    // Get input level for metering
    float peakInput = 0.0f;
    float peakOutput = 0.0f;

    // Smooth parameters
    float targetFeedback = feedback_.load();
    float targetDepth = depth_.load();
    float targetMix = mix_.load();

    feedbackAmount_ += (targetFeedback - feedbackAmount_) * SMOOTHING_COEFF;
    depthAmount_ += (targetDepth - depthAmount_) * SMOOTHING_COEFF;
    mixAmount_ += (targetMix - mixAmount_) * SMOOTHING_COEFF;

    // Update delay line length if delay time changed
    float currentDelayTime = delayTime_.load();
    int targetDelaySamples = std::max(1, static_cast<int>(currentDelayTime * sampleRate_ / 1000.0));
    if (targetDelaySamples != delayLineSamples_) {
        delayLineSamples_ = std::min(targetDelaySamples, delayBufferSize_ - 1);
        updateDerivedParameters();
    }

    int numTaps = getNumTaps();
    float initialAngle = initialPanAngle_.load();

    // Process mono to stereo
    if (numChannelsBuffer == 1) {
        auto* channelData = buffer.getWritePointer(0);

        for (int sample = 0; sample < numSamples; ++sample) {
            float inputSample = channelData[sample];
            peakInput = std::max(peakInput, std::abs(inputSample));

            // Get current LFO phase for pan modulation
            lfoPhase_ = std::fmod(lfoPhase_ + currentPanRate / static_cast<float>(sampleRate_), 1.0f);

            float outputL = 0.0f;
            float outputR = 0.0f;

            // Process all taps
            for (int tapIndex = 0; tapIndex < numTaps; ++tapIndex) {
                // Calculate pan angle for this tap
                float tapPanAngle = (tapIndex / static_cast<float>(numTaps)) * 360.0f +
                                   (lfoPhase_ * 360.0f);  // Rotate based on LFO

                // Apply depth modulation to pan angle
                tapPanAngle += (lfoPhase_ * depthAmount_ * 45.0f);  // Max ±45° from depth

                // Convert angle to stereo pan coefficients
                auto [panL, panR] = angleToPan(tapPanAngle);

                // Calculate read position for this tap
                float readOffset = (tapIndex + 1) * (delayLineSamples_ / static_cast<float>(numTaps));
                float readPos = writePosition_ - readOffset;
                if (readPos < 0.0f) {
                    readPos += delayBufferSize_;
                }

                // Read from delay buffer with interpolation
                float tapSample = readDelayBuffer(readPos);

                // Apply pan and add to output
                outputL += tapSample * panL;
                outputR += tapSample * panR;

                // Update metering
                if (tapIndex < 12) {
                    metering_.tapLevels[tapIndex] = std::max(metering_.tapLevels[tapIndex] * 0.99f,
                                                              std::abs(tapSample) * 0.01f);
                    metering_.tapAngles[tapIndex] = tapPanAngle;
                }
            }

            // Mix feedback back into delay buffer
            float feedbackSignal = (outputL + outputR) * 0.5f * feedbackAmount_;
            float delayInput = inputSample + feedbackSignal;

            // Write to delay buffer
            writeDelayBuffer(delayInput);

            // Dry/wet mix
            float dryL = inputSample;
            float dryR = inputSample;

            float wetL = outputL / static_cast<float>(numTaps);  // Normalize by number of taps
            float wetR = outputR / static_cast<float>(numTaps);

            float finalL = dryL * (1.0f - mixAmount_) + wetL * mixAmount_;
            float finalR = dryR * (1.0f - mixAmount_) + wetR * mixAmount_;

            peakOutput = std::max(peakOutput, std::max(std::abs(finalL), std::abs(finalR)));

            // Store output back as mono (average of L/R)
            channelData[sample] = (finalL + finalR) * 0.5f;

            writePosition_++;
            if (writePosition_ >= delayBufferSize_) {
                writePosition_ = 0;
            }
        }
    }
    // Process stereo
    else if (numChannelsBuffer >= 2) {
        auto* channelDataL = buffer.getWritePointer(0);
        auto* channelDataR = buffer.getWritePointer(1);

        for (int sample = 0; sample < numSamples; ++sample) {
            float inputL = channelDataL[sample];
            float inputR = channelDataR[sample];
            float inputSample = (inputL + inputR) * 0.5f;  // Mono mix for processing
            peakInput = std::max(peakInput, std::max(std::abs(inputL), std::abs(inputR)));

            // Get current LFO phase for pan modulation
            lfoPhase_ = std::fmod(lfoPhase_ + currentPanRate / static_cast<float>(sampleRate_), 1.0f);

            float outputL = 0.0f;
            float outputR = 0.0f;

            // Process all taps
            for (int tapIndex = 0; tapIndex < numTaps; ++tapIndex) {
                // Calculate pan angle for this tap
                float baseTapAngle = (tapIndex / static_cast<float>(numTaps)) * 360.0f;
                float tapPanAngle = baseTapAngle + (lfoPhase_ * 360.0f);

                // Apply depth modulation
                tapPanAngle += (lfoPhase_ * depthAmount_ * 45.0f);

                // Convert angle to stereo pan
                auto [panL, panR] = angleToPan(tapPanAngle);

                // Calculate read position
                float readOffset = (tapIndex + 1) * (delayLineSamples_ / static_cast<float>(numTaps));
                float readPos = writePosition_ - readOffset;
                if (readPos < 0.0f) {
                    readPos += delayBufferSize_;
                }

                // Read from delay
                float tapSample = readDelayBuffer(readPos);

                // Apply pan
                outputL += tapSample * panL;
                outputR += tapSample * panR;

                // Update metering
                if (tapIndex < 12) {
                    metering_.tapLevels[tapIndex] = std::max(metering_.tapLevels[tapIndex] * 0.99f,
                                                              std::abs(tapSample) * 0.01f);
                    metering_.tapAngles[tapIndex] = tapPanAngle;
                }
            }

            // Feedback path
            float feedbackSignal = (outputL + outputR) * 0.5f * feedbackAmount_;
            float delayInput = inputSample + feedbackSignal;

            // Write to delay
            writeDelayBuffer(delayInput);

            // Dry/wet mix
            float wetL = outputL / static_cast<float>(numTaps);
            float wetR = outputR / static_cast<float>(numTaps);

            float finalL = inputL * (1.0f - mixAmount_) + wetL * mixAmount_;
            float finalR = inputR * (1.0f - mixAmount_) + wetR * mixAmount_;

            peakOutput = std::max(peakOutput, std::max(std::abs(finalL), std::abs(finalR)));

            channelDataL[sample] = finalL;
            channelDataR[sample] = finalR;

            writePosition_++;
            if (writePosition_ >= delayBufferSize_) {
                writePosition_ = 0;
            }
        }
    }

    // Update metering
    inputLevel_.store(20.0f * std::log10(peakInput + DENORMAL_FLOOR));
    outputLevel_.store(20.0f * std::log10(peakOutput + DENORMAL_FLOOR));
    metering_.inputLevel = inputLevel_.load();
    metering_.outputLevel = outputLevel_.load();
    metering_.lfoPhase = lfoPhase_;
}

void CircularDelayProcessor::setDelayTime(float ms)
{
    delayTime_.store(std::clamp(ms, 100.0f, 2000.0f));
}

void CircularDelayProcessor::setNumTaps(int numTaps)
{
    numTaps_.store(std::clamp(numTaps, 4, 12));
}

void CircularDelayProcessor::setFeedback(float feedback)
{
    feedback_.store(std::clamp(feedback, 0.0f, 0.95f));
}

void CircularDelayProcessor::setPanRate(float hz)
{
    panRate_.store(std::clamp(hz, 0.1f, 5.0f));
}

void CircularDelayProcessor::setDepth(float depth)
{
    depth_.store(std::clamp(depth, 0.0f, 1.0f));
}

void CircularDelayProcessor::setMix(float mix)
{
    mix_.store(std::clamp(mix, 0.0f, 1.0f));
}

void CircularDelayProcessor::setInitialPanAngle(float degrees)
{
    initialPanAngle_.store(std::fmod(degrees, 360.0f));
}

void CircularDelayProcessor::setBypass(bool shouldBypass)
{
    bypass_.store(shouldBypass);
}

CircularDelayProcessor::Parameters CircularDelayProcessor::getParameters() const
{
    return Parameters{
        delayTime_.load(),
        numTaps_.load(),
        feedback_.load(),
        panRate_.load(),
        depth_.load(),
        mix_.load(),
        initialPanAngle_.load(),
        bypass_.load()
    };
}

void CircularDelayProcessor::setParameters(const Parameters& params)
{
    setDelayTime(params.delayTime);
    setNumTaps(params.numTaps);
    setFeedback(params.feedback);
    setPanRate(params.panRate);
    setDepth(params.depth);
    setMix(params.mix);
    setInitialPanAngle(params.initialPanAngle);
    setBypass(params.bypass);
}

void CircularDelayProcessor::updateDerivedParameters()
{
    // Delay line length calculation
    float currentDelayTime = delayTime_.load();
    delayLineSamples_ = std::max(1, static_cast<int>(currentDelayTime * sampleRate_ / 1000.0));
    delayLineSamples_ = std::min(delayLineSamples_, delayBufferSize_ - 1);
}

float CircularDelayProcessor::calculatePanAngle(int tapIndex, float lfoPhase) const
{
    int numTaps = numTaps_.load();
    float initialAngle = initialPanAngle_.load();

    // Base angle distributed around circle
    float baseAngle = (tapIndex / static_cast<float>(numTaps)) * 360.0f;

    // Rotating angle based on LFO phase
    float rotatingAngle = lfoPhase * 360.0f;

    // Depth modulation
    float depthMod = depthAmount_ * 45.0f * std::sin(lfoPhase * TWO_PI);

    return initialAngle + baseAngle + rotatingAngle + depthMod;
}

std::pair<float, float> CircularDelayProcessor::angleToPan(float angleDegrees) const
{
    // Normalize angle to 0-360
    angleDegrees = std::fmod(angleDegrees, 360.0f);
    if (angleDegrees < 0.0f) {
        angleDegrees += 360.0f;
    }

    // Convert to radians
    float angleRadians = angleDegrees * PI_OVER_180;

    // Pan using sine/cosine for circular motion
    // 0° = left (-1), 90° = center (0), 180° = right (1), 270° = center (0)
    float panL = std::cos(angleRadians);      // Left channel: cos
    float panR = std::sin(angleRadians);      // Right channel: sin

    // Apply equal power panning to maintain consistent loudness
    float leftGain = std::sqrt(std::abs(panL));
    float rightGain = std::sqrt(std::abs(panR));

    // Ensure proper sign
    panL = panL > 0.0f ? leftGain : -leftGain;
    panR = panR > 0.0f ? rightGain : -rightGain;

    return { panL, panR };
}

float CircularDelayProcessor::readDelayBuffer(float readPosition) const
{
    // Normalize read position to buffer bounds
    while (readPosition < 0.0f) {
        readPosition += delayBufferSize_;
    }
    while (readPosition >= static_cast<float>(delayBufferSize_)) {
        readPosition -= delayBufferSize_;
    }

    // Get integer and fractional parts for interpolation
    int readIndex = static_cast<int>(readPosition);
    float fraction = readPosition - readIndex;

    // Cubic interpolation for smooth delay line reading
    int idx0 = (readIndex - 1 + delayBufferSize_) % delayBufferSize_;
    int idx1 = readIndex;
    int idx2 = (readIndex + 1) % delayBufferSize_;
    int idx3 = (readIndex + 2) % delayBufferSize_;

    float y0 = delayBuffer_[idx0];
    float y1 = delayBuffer_[idx1];
    float y2 = delayBuffer_[idx2];
    float y3 = delayBuffer_[idx3];

    // Cubic Hermite interpolation
    float a0 = -0.5f * y0 + 1.5f * y1 - 1.5f * y2 + 0.5f * y3;
    float a1 = y0 - 2.5f * y1 + 2.0f * y2 - 0.5f * y3;
    float a2 = -0.5f * y0 + 0.5f * y2;
    float a3 = y1;

    float t2 = fraction * fraction;
    float t3 = t2 * fraction;

    return a0 * t3 + a1 * t2 + a2 * fraction + a3;
}

void CircularDelayProcessor::writeDelayBuffer(float sample)
{
    // Prevent denormal numbers
    if (std::abs(sample) < DENORMAL_FLOOR) {
        sample = 0.0f;
    }

    delayBuffer_[writePosition_] = sample;
}

}  // namespace map2
