/**
 * MAP2 Audio Engine - Lexicon MPX-1 Hardware Processor
 * Routes audio through external Lexicon MPX-1 via S/PDIF coax.
 *
 * processBlock() flow:
 *   1. Save dry copy
 *   2. Apply send gain → write to S/PDIF out channels on UA-1000
 *   3. Read S/PDIF return channels → latency compensation delay line
 *   4. Read compensated wet signal
 *   5. Apply return gain
 *   6. Blend dry/wet → write back to graph buffer
 *
 * All buffers pre-allocated in prepareToPlay(). Zero heap allocations
 * in the audio callback path.
 */

#include "LexiconHardwareProcessor.h"
#include <cstring>

namespace map2 {

LexiconHardwareProcessor::LexiconHardwareProcessor()
    : juce::AudioProcessor(BusesProperties()
        .withInput("Input", juce::AudioChannelSet::stereo(), true)
        .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
}

const juce::String LexiconHardwareProcessor::getName() const
{
    return PLUGIN_NAME;
}

void LexiconHardwareProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    currentSampleRate_ = sampleRate;
    currentBlockSize_ = samplesPerBlock;

    // Size delay buffers for maximum expected latency + one block headroom
    delayBufferSize_ = MAX_LATENCY_SAMPLES + samplesPerBlock;
    for (auto& buf : delayBuffers_) {
        buf.assign(static_cast<size_t>(delayBufferSize_), 0.0f);
    }
    delayWritePos_ = 0;

    // Pre-allocate dry buffer for wet/dry blending
    dryBuffer_.setSize(2, samplesPerBlock, false, true, false);
}

void LexiconHardwareProcessor::releaseResources()
{
    for (auto& buf : delayBuffers_) {
        buf.clear();
        buf.shrink_to_fit();
    }
    delayBufferSize_ = 0;
    delayWritePos_ = 0;
    dryBuffer_.setSize(0, 0);
}

void LexiconHardwareProcessor::processBlock(juce::AudioBuffer<float>& buffer,
                                             juce::MidiBuffer& /*midiMessages*/)
{
    const int numSamples = buffer.getNumSamples();
    const int numChannels = std::min(buffer.getNumChannels(), 2);

    // Early exit: no hardware buffers wired
    if (hwInputs_ == nullptr || hwOutputs_ == nullptr)
        return;

    // Check S/PDIF channels are available
    const bool hasSpdifSend = (hwNumOutputs_ > SPDIF_SEND_RIGHT);
    const bool hasSpdifReturn = (hwNumInputs_ > SPDIF_RETURN_RIGHT);

    if (!hasSpdifSend || !hasSpdifReturn)
        return;

    // ---- Bypass: pass through unchanged, silence S/PDIF send ----
    if (bypassed_.load(std::memory_order_relaxed)) {
        // Write silence to S/PDIF out so the hardware doesn't get stale signal
        for (int s = 0; s < numSamples; ++s) {
            hwOutputs_[SPDIF_SEND_LEFT][s] = 0.0f;
            hwOutputs_[SPDIF_SEND_RIGHT][s] = 0.0f;
        }
        // Buffer passes through unchanged (dry signal)
        return;
    }

    // Load atomic controls
    const float sendGain = sendGainLinear_.load(std::memory_order_relaxed);
    const float returnGain = returnGainLinear_.load(std::memory_order_relaxed);
    const float wetMix = dryWetMix_.load(std::memory_order_relaxed);
    const float dryMix = 1.0f - wetMix;
    const int latencySamples = getLatencySamples();

    // ---- 1. Save dry copy ----
    for (int ch = 0; ch < numChannels; ++ch) {
        dryBuffer_.copyFrom(ch, 0, buffer, ch, 0, numSamples);
    }

    // ---- 2. Send to S/PDIF out (with send gain) ----
    for (int s = 0; s < numSamples; ++s) {
        hwOutputs_[SPDIF_SEND_LEFT][s] =
            buffer.getSample(0, s) * sendGain;
        hwOutputs_[SPDIF_SEND_RIGHT][s] =
            (numChannels > 1) ? buffer.getSample(1, s) * sendGain
                              : buffer.getSample(0, s) * sendGain;
    }

    // ---- 3. Read S/PDIF return into delay buffer ----
    // ---- 4. Read compensated samples from delay buffer ----
    for (int s = 0; s < numSamples; ++s) {
        // Write incoming S/PDIF return to delay line
        delayBuffers_[0][static_cast<size_t>(delayWritePos_)] =
            hwInputs_[SPDIF_RETURN_LEFT][s];
        delayBuffers_[1][static_cast<size_t>(delayWritePos_)] =
            hwInputs_[SPDIF_RETURN_RIGHT][s];

        // Read from delay line with latency compensation
        int readPos = delayWritePos_ - latencySamples;
        if (readPos < 0)
            readPos += delayBufferSize_;

        float wetL = delayBuffers_[0][static_cast<size_t>(readPos)] * returnGain;
        float wetR = delayBuffers_[1][static_cast<size_t>(readPos)] * returnGain;

        // ---- 5. Blend dry/wet ----
        float dryL = dryBuffer_.getSample(0, s);
        float dryR = (numChannels > 1) ? dryBuffer_.getSample(1, s) : dryL;

        buffer.setSample(0, s, dryL * dryMix + wetL * wetMix);
        if (numChannels > 1) {
            buffer.setSample(1, s, dryR * dryMix + wetR * wetMix);
        }

        // Advance write position
        delayWritePos_ = (delayWritePos_ + 1) % delayBufferSize_;
    }
}

double LexiconHardwareProcessor::getTailLengthSeconds() const
{
    // MPX-1 has reverb tails — report a reasonable value
    return 5.0;
}

void LexiconHardwareProcessor::setMeasuredLatencySamples(int samples)
{
    setLatencySamples(juce::jlimit(0, MAX_LATENCY_SAMPLES, samples));
}

void LexiconHardwareProcessor::setHardwareBuffers(
    const float* const* inputChannels,
    float* const* outputChannels,
    int numInputChannels,
    int numOutputChannels)
{
    hwInputs_ = inputChannels;
    hwOutputs_ = outputChannels;
    hwNumInputs_ = numInputChannels;
    hwNumOutputs_ = numOutputChannels;
}

bool LexiconHardwareProcessor::isBusesLayoutSupported(
    const BusesLayout& layouts) const
{
    // Accept stereo or mono
    const auto& mainInput = layouts.getMainInputChannelSet();
    const auto& mainOutput = layouts.getMainOutputChannelSet();

    if (mainInput != mainOutput)
        return false;

    return mainInput == juce::AudioChannelSet::stereo()
        || mainInput == juce::AudioChannelSet::mono();
}

void LexiconHardwareProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    // State is managed by MPX1Service shadow state (Python side).
    // Store only the audio routing parameters here.
    juce::MemoryOutputStream stream(destData, false);
    stream.writeFloat(dryWetMix_.load());
    stream.writeFloat(sendGainLinear_.load());
    stream.writeFloat(returnGainLinear_.load());
    stream.writeBool(bypassed_.load());
    stream.writeInt(getLatencySamples());
}

void LexiconHardwareProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    juce::MemoryInputStream stream(data, static_cast<size_t>(sizeInBytes), false);
    if (stream.getDataSize() >= 17) { // 4+4+4+1+4 bytes minimum
        dryWetMix_.store(stream.readFloat());
        sendGainLinear_.store(stream.readFloat());
        returnGainLinear_.store(stream.readFloat());
        bypassed_.store(stream.readBool());
        setLatencySamples(stream.readInt());
    }
}

} // namespace map2
