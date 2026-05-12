/**
 * MAP2 Audio Engine - Lexicon MPX-1 Hardware Processor
 * Routes audio through an external Lexicon MPX-1 via send/return on any
 * interface advertising the hardware_fx_bridge_capable port role.
 *
 * processBlock() flow:
 *   1. Load atomic channel-map + controls
 *   2. Save dry copy
 *   3. Apply send gain → write to configured send channels
 *   4. Read configured return channels → latency compensation delay line
 *   5. Read compensated wet signal
 *   6. Apply return gain
 *   7. Blend dry/wet → write back to graph buffer
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
    setLatencySamples(DEFAULT_LATENCY_SAMPLES);
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

    // ---- Load per-instance channel mapping (atomic, no torn read) ----
    const std::uint32_t packedMap = channelMap_.load(std::memory_order_relaxed);
    const int sendL   = static_cast<int>( packedMap        & 0xFFu);
    const int sendR   = static_cast<int>((packedMap >>  8) & 0xFFu);
    const int returnL = static_cast<int>((packedMap >> 16) & 0xFFu);
    const int returnR = static_cast<int>((packedMap >> 24) & 0xFFu);

    const bool hasSends   = (hwNumOutputs_ > sendL && hwNumOutputs_ > sendR);
    const bool hasReturns = (hwNumInputs_  > returnL && hwNumInputs_  > returnR);
    if (!hasSends || !hasReturns)
        return;

    // ---- Mid-stream remap: emit one block of silence to avoid clicks ----
    if (muteNextBlock_.exchange(false, std::memory_order_acq_rel)) {
        for (int s = 0; s < numSamples; ++s) {
            hwOutputs_[sendL][s] = 0.0f;
            hwOutputs_[sendR][s] = 0.0f;
            for (int ch = 0; ch < numChannels; ++ch)
                buffer.setSample(ch, s, 0.0f);
        }
        return;
    }

    // ---- Bypass: pass dry through, silence send so the hardware sees nothing ----
    if (bypassed_.load(std::memory_order_relaxed)) {
        for (int s = 0; s < numSamples; ++s) {
            hwOutputs_[sendL][s] = 0.0f;
            hwOutputs_[sendR][s] = 0.0f;
        }
        // Buffer passes through unchanged (dry signal)
        return;
    }

    // Load remaining atomic controls
    const float sendGain = sendGainLinear_.load(std::memory_order_relaxed);
    const float returnGain = returnGainLinear_.load(std::memory_order_relaxed);
    const float wetMix = dryWetMix_.load(std::memory_order_relaxed);
    const float dryMix = 1.0f - wetMix;
    const int latencySamples = getLatencySamples();

    // ---- 1. Save dry copy ----
    for (int ch = 0; ch < numChannels; ++ch) {
        dryBuffer_.copyFrom(ch, 0, buffer, ch, 0, numSamples);
    }

    // ---- 2. Send to hardware out (with send gain) ----
    for (int s = 0; s < numSamples; ++s) {
        hwOutputs_[sendL][s] = buffer.getSample(0, s) * sendGain;
        hwOutputs_[sendR][s] =
            (numChannels > 1) ? buffer.getSample(1, s) * sendGain
                              : buffer.getSample(0, s) * sendGain;
    }

    // ---- 3+4. Read returns into delay buffer; read compensated samples ----
    for (int s = 0; s < numSamples; ++s) {
        delayBuffers_[0][static_cast<size_t>(delayWritePos_)] =
            hwInputs_[returnL][s];
        delayBuffers_[1][static_cast<size_t>(delayWritePos_)] =
            hwInputs_[returnR][s];

        int readPos = delayWritePos_ - latencySamples;
        if (readPos < 0)
            readPos += delayBufferSize_;

        const float wetLs = delayBuffers_[0][static_cast<size_t>(readPos)] * returnGain;
        const float wetRs = delayBuffers_[1][static_cast<size_t>(readPos)] * returnGain;

        // ---- 5. Blend dry/wet ----
        const float dryLs = dryBuffer_.getSample(0, s);
        const float dryRs = (numChannels > 1) ? dryBuffer_.getSample(1, s) : dryLs;

        buffer.setSample(0, s, dryLs * dryMix + wetLs * wetMix);
        if (numChannels > 1) {
            buffer.setSample(1, s, dryRs * dryMix + wetRs * wetMix);
        }

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

void LexiconHardwareProcessor::setChannelMapping(int sendLeft, int sendRight,
                                                  int returnLeft, int returnRight)
{
    // Clamp to 8-bit range so all four indices fit in the packed atomic.
    const auto clampByte = [](int v) {
        return static_cast<std::uint8_t>(juce::jlimit(0, 254, v));
    };
    const std::uint32_t packed = packMap(
        clampByte(sendLeft),
        clampByte(sendRight),
        clampByte(returnLeft),
        clampByte(returnRight));
    channelMap_.store(packed, std::memory_order_release);
    muteNextBlock_.store(true, std::memory_order_release);
}

void LexiconHardwareProcessor::getChannelMapping(int& sendLeft, int& sendRight,
                                                  int& returnLeft, int& returnRight) const
{
    const std::uint32_t packed = channelMap_.load(std::memory_order_acquire);
    sendLeft   = static_cast<int>( packed        & 0xFFu);
    sendRight  = static_cast<int>((packed >>  8) & 0xFFu);
    returnLeft = static_cast<int>((packed >> 16) & 0xFFu);
    returnRight= static_cast<int>((packed >> 24) & 0xFFu);
}

void LexiconHardwareProcessor::setConnectionType(ConnectionType type)
{
    connectionType_.store(static_cast<int>(type), std::memory_order_relaxed);
}

LexiconHardwareProcessor::ConnectionType LexiconHardwareProcessor::getConnectionType() const
{
    return static_cast<ConnectionType>(
        connectionType_.load(std::memory_order_relaxed));
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
