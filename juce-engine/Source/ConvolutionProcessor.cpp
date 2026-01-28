/**
 * MAP2 Audio Engine - Convolution Processor Implementation
 */

#include "ConvolutionProcessor.h"

namespace map2 {

ConvolutionProcessor::ConvolutionProcessor()
    : preDelay_(48000)  // 1 second max pre-delay at 48kHz
{
    // Register common audio formats
    formatManager_.registerBasicFormats();
}

ConvolutionProcessor::~ConvolutionProcessor() {
    releaseResources();
}

void ConvolutionProcessor::prepare(double sampleRate, int samplesPerBlock, int numChannels) {
    sampleRate_ = sampleRate;
    blockSize_ = samplesPerBlock;
    numChannels_ = numChannels;

    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = static_cast<juce::uint32>(samplesPerBlock);
    spec.numChannels = static_cast<juce::uint32>(numChannels);

    // Prepare convolution with current mode
    convolution_.prepare(spec);

    // Prepare dry/wet mixer
    dryWetMixer_.prepare(spec);
    dryWetMixer_.setMixingRule(juce::dsp::DryWetMixingRule::linear);
    dryWetMixer_.setWetMixProportion(dryWetMix_);

    // Prepare pre-delay
    preDelay_.prepare(spec);
    preDelay_.setMaximumDelayInSamples(static_cast<int>(sampleRate * 0.5));  // 500ms max
    preDelay_.setDelay(static_cast<float>(preDelayMs_ * sampleRate / 1000.0));

    // Allocate dry buffer
    dryBuffer_.setSize(numChannels, samplesPerBlock);
}

void ConvolutionProcessor::reset() {
    convolution_.reset();
    dryWetMixer_.reset();
    preDelay_.reset();
}

void ConvolutionProcessor::releaseResources() {
    reset();
}

bool ConvolutionProcessor::loadImpulseResponse(const std::string& irPath) {
    juce::File irFile(irPath);

    if (!irFile.existsAsFile()) {
        return false;
    }

    std::unique_ptr<juce::AudioFormatReader> reader(
        formatManager_.createReaderFor(irFile));

    if (reader == nullptr) {
        return false;
    }

    // Read IR data
    juce::AudioBuffer<float> irBuffer(
        static_cast<int>(reader->numChannels),
        static_cast<int>(reader->lengthInSamples));

    reader->read(&irBuffer, 0,
                static_cast<int>(reader->lengthInSamples),
                0, true, true);

    // Load into convolution engine
    convolution_.loadImpulseResponse(
        std::move(irBuffer),
        reader->sampleRate,
        juce::dsp::Convolution::Stereo::yes,
        juce::dsp::Convolution::Trim::yes,
        juce::dsp::Convolution::Normalise::yes);

    // Update info
    {
        std::lock_guard<std::mutex> lock(irMutex_);
        irPath_ = irPath;
        irInfo_.path = irPath;
        irInfo_.lengthSamples = static_cast<int>(reader->lengthInSamples);
        irInfo_.lengthSeconds = reader->lengthInSamples / reader->sampleRate;
        irInfo_.numChannels = static_cast<int>(reader->numChannels);
        irInfo_.originalSampleRate = reader->sampleRate;
        irInfo_.stereo = reader->numChannels >= 2;
    }

    irLoaded_ = true;
    return true;
}

bool ConvolutionProcessor::loadImpulseResponseFromData(const float* data,
                                                       size_t numSamples,
                                                       int numChannels,
                                                       double irSampleRate) {
    if (data == nullptr || numSamples == 0) {
        return false;
    }

    // Create buffer from interleaved data
    juce::AudioBuffer<float> irBuffer(numChannels, static_cast<int>(numSamples));

    // Deinterleave
    for (int ch = 0; ch < numChannels; ++ch) {
        for (size_t i = 0; i < numSamples; ++i) {
            irBuffer.setSample(ch, static_cast<int>(i), data[i * numChannels + ch]);
        }
    }

    // Load into convolution engine
    convolution_.loadImpulseResponse(
        std::move(irBuffer),
        irSampleRate,
        numChannels >= 2 ? juce::dsp::Convolution::Stereo::yes
                         : juce::dsp::Convolution::Stereo::no,
        juce::dsp::Convolution::Trim::yes,
        juce::dsp::Convolution::Normalise::yes);

    // Update info
    {
        std::lock_guard<std::mutex> lock(irMutex_);
        irPath_ = "<memory>";
        irInfo_.path = "<memory>";
        irInfo_.lengthSamples = static_cast<int>(numSamples);
        irInfo_.lengthSeconds = numSamples / irSampleRate;
        irInfo_.numChannels = numChannels;
        irInfo_.originalSampleRate = irSampleRate;
        irInfo_.stereo = numChannels >= 2;
    }

    irLoaded_ = true;
    return true;
}

void ConvolutionProcessor::unloadImpulseResponse() {
    // Reset convolution (clears IR)
    convolution_.reset();

    {
        std::lock_guard<std::mutex> lock(irMutex_);
        irPath_.clear();
        irInfo_ = IRInfo{};
    }

    irLoaded_ = false;
}

void ConvolutionProcessor::process(juce::AudioBuffer<float>& buffer) {
    if (bypass_ || !irLoaded_.load()) {
        return;  // Pass through unchanged
    }

    auto numSamples = buffer.getNumSamples();
    auto numCh = buffer.getNumChannels();

    // Store dry signal
    dryBuffer_.makeCopyOf(buffer);

    // Apply pre-delay if set
    if (preDelayMs_ > 0.0f) {
        juce::dsp::AudioBlock<float> block(buffer);
        juce::dsp::ProcessContextReplacing<float> context(block);

        for (int ch = 0; ch < numCh; ++ch) {
            for (int i = 0; i < numSamples; ++i) {
                float sample = buffer.getSample(ch, i);
                buffer.setSample(ch, i, preDelay_.popSample(ch));
                preDelay_.pushSample(ch, sample);
            }
        }
    }

    // Push dry signal to mixer
    juce::dsp::AudioBlock<float> dryBlock(dryBuffer_);
    dryWetMixer_.pushDrySamples(dryBlock);

    // Process through convolution
    juce::dsp::AudioBlock<float> block(buffer);
    juce::dsp::ProcessContextReplacing<float> context(block);
    convolution_.process(context);

    // Apply dry/wet mix
    dryWetMixer_.mixWetSamples(block);
}

void ConvolutionProcessor::process(const float* const* inputs, float** outputs,
                                   int numChannels, int numSamples) {
    // Use JUCE buffer wrapper
    juce::AudioBuffer<float> buffer(outputs, numChannels, numSamples);

    // Copy input to output first
    for (int ch = 0; ch < numChannels; ++ch) {
        if (inputs[ch] != nullptr && outputs[ch] != nullptr) {
            std::copy_n(inputs[ch], numSamples, outputs[ch]);
        }
    }

    process(buffer);
}

void ConvolutionProcessor::setDryWetMix(float mix) {
    dryWetMix_ = clamp(mix, 0.0f, 1.0f);
    dryWetMixer_.setWetMixProportion(dryWetMix_);
}

void ConvolutionProcessor::setPreDelay(float delayMs) {
    preDelayMs_ = clamp(delayMs, 0.0f, 500.0f);
    preDelay_.setDelay(static_cast<float>(preDelayMs_ * sampleRate_ / 1000.0));
}

void ConvolutionProcessor::setBypass(bool bypass) {
    bypass_ = bypass;
}

void ConvolutionProcessor::setMode(Mode mode) {
    if (mode_ == mode) return;

    mode_ = mode;

    // Note: Changing mode may require re-preparing the convolution
    // This would typically be done by reloading the IR
}

int ConvolutionProcessor::getLatency() const {
    // JUCE convolution latency depends on mode and block size
    // For zero-latency mode, it's minimal
    // For other modes, it's typically the partition size
    switch (mode_) {
        case Mode::ZeroLatency:
            return 0;
        case Mode::LowLatency:
            return blockSize_;
        case Mode::HighQuality:
            return blockSize_ * 2;
    }
    return 0;
}

double ConvolutionProcessor::getIRLengthSeconds() const {
    std::lock_guard<std::mutex> lock(irMutex_);
    return irInfo_.lengthSeconds;
}

int ConvolutionProcessor::getIRLengthSamples() const {
    std::lock_guard<std::mutex> lock(irMutex_);
    // Return length at current sample rate
    if (irInfo_.originalSampleRate > 0) {
        return static_cast<int>(irInfo_.lengthSeconds * sampleRate_);
    }
    return irInfo_.lengthSamples;
}

ConvolutionProcessor::IRInfo ConvolutionProcessor::getIRInfo() const {
    std::lock_guard<std::mutex> lock(irMutex_);
    return irInfo_;
}

juce::dsp::Convolution::Latency ConvolutionProcessor::getModeLatency() const {
    switch (mode_) {
        case Mode::ZeroLatency:
            return juce::dsp::Convolution::Latency{0};
        case Mode::LowLatency:
            return juce::dsp::Convolution::Latency{128};
        case Mode::HighQuality:
            return juce::dsp::Convolution::Latency{512};
    }
    return juce::dsp::Convolution::Latency{128};
}

} // namespace map2
