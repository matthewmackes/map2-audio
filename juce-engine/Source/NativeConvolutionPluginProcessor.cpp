#include "NativeConvolutionPluginProcessor.h"

namespace {
constexpr auto PARAM_MIX = "mix";
constexpr auto PARAM_BYPASS = "bypass";
constexpr auto STATE_IR_PATH = "ir_path";
}

namespace map2 {

NativeConvolutionPluginProcessor::NativeConvolutionPluginProcessor(juce::String name, float defaultMixPercent)
    : juce::AudioProcessor(BusesProperties()
          .withInput("Input", juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      name_(std::move(name)),
      defaultMixPercent_(juce::jlimit(0.0f, 100.0f, defaultMixPercent)),
      apvts_(*this, nullptr, "PARAMS", createParameterLayout()) {
    apvts_.addParameterListener(PARAM_MIX, this);
    apvts_.addParameterListener(PARAM_BYPASS, this);
    syncParameters();
}

NativeConvolutionPluginProcessor::~NativeConvolutionPluginProcessor() {
    apvts_.removeParameterListener(PARAM_MIX, this);
    apvts_.removeParameterListener(PARAM_BYPASS, this);
}

juce::AudioProcessorValueTreeState::ParameterLayout NativeConvolutionPluginProcessor::createParameterLayout() const {
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_MIX,
        "Mix",
        juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f),
        defaultMixPercent_));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(PARAM_BYPASS, "Bypass", false));
    return {params.begin(), params.end()};
}

void NativeConvolutionPluginProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
    processor_.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    processor_.reset();
    syncParameters();
}

void NativeConvolutionPluginProcessor::releaseResources() {
    processor_.releaseResources();
}

bool NativeConvolutionPluginProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
    const auto& output = layouts.getMainOutputChannelSet();
    if (output != juce::AudioChannelSet::mono() && output != juce::AudioChannelSet::stereo()) {
        return false;
    }
    return output == layouts.getMainInputChannelSet();
}

void NativeConvolutionPluginProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) {
    juce::ignoreUnused(midiMessages);
    juce::ScopedNoDenormals noDenormals;

    const auto totalInputs = getTotalNumInputChannels();
    const auto totalOutputs = getTotalNumOutputChannels();
    const auto numSamples = buffer.getNumSamples();
    for (auto ch = totalInputs; ch < totalOutputs; ++ch) {
        buffer.clear(ch, 0, numSamples);
    }

    processor_.process(buffer);
}

void NativeConvolutionPluginProcessor::getStateInformation(juce::MemoryBlock& destData) {
    auto state = apvts_.copyState();
    state.setProperty(STATE_IR_PATH, juce::String(irPath_), nullptr);
    juce::MemoryOutputStream stream(destData, true);
    state.writeToStream(stream);
}

void NativeConvolutionPluginProcessor::setStateInformation(const void* data, int sizeInBytes) {
    const auto state = juce::ValueTree::readFromData(data, static_cast<size_t>(sizeInBytes));
    if (!state.isValid()) {
        return;
    }

    const auto restoredPath = state.getProperty(STATE_IR_PATH).toString().toStdString();
    apvts_.replaceState(state);
    irPath_ = restoredPath;
    syncParameters();
    if (!irPath_.empty()) {
        processor_.loadImpulseResponse(irPath_);
    }
}

void NativeConvolutionPluginProcessor::parameterChanged(const juce::String& parameterID, float newValue) {
    syncParameterValue(parameterID, newValue);
}

bool NativeConvolutionPluginProcessor::loadImpulseResponse(const std::string& path) {
    if (!processor_.loadImpulseResponse(path)) {
        return false;
    }
    irPath_ = path;
    return true;
}

void NativeConvolutionPluginProcessor::unloadImpulseResponse() {
    processor_.unloadImpulseResponse();
    irPath_.clear();
}

ConvolutionProcessor::IRInfo NativeConvolutionPluginProcessor::getIRInfo() const {
    return processor_.getIRInfo();
}

float NativeConvolutionPluginProcessor::getMixPercent() const {
    return processor_.getDryWetMix() * 100.0f;
}

bool NativeConvolutionPluginProcessor::isBypassedLocally() const {
    return processor_.isBypassed();
}

void NativeConvolutionPluginProcessor::setMixPercent(float mixPercent) {
    const float clamped = juce::jlimit(0.0f, 100.0f, mixPercent);
    if (auto* parameter = apvts_.getParameter(PARAM_MIX)) {
        parameter->setValueNotifyingHost(parameter->convertTo0to1(clamped));
    } else {
        processor_.setDryWetMix(clamped / 100.0f);
    }
}

void NativeConvolutionPluginProcessor::setBypassEnabled(bool enabled) {
    if (auto* parameter = apvts_.getParameter(PARAM_BYPASS)) {
        parameter->setValueNotifyingHost(enabled ? 1.0f : 0.0f);
    } else {
        processor_.setBypass(enabled);
    }
}

void NativeConvolutionPluginProcessor::syncParameters() {
    if (const auto* value = apvts_.getRawParameterValue(PARAM_MIX)) {
        processor_.setDryWetMix(juce::jlimit(0.0f, 100.0f, value->load()) / 100.0f);
    }
    if (const auto* value = apvts_.getRawParameterValue(PARAM_BYPASS)) {
        processor_.setBypass(value->load() > 0.5f);
    }
}

void NativeConvolutionPluginProcessor::syncParameterValue(const juce::String& parameterID, float newValue) {
    if (parameterID == PARAM_MIX) {
        if (auto* parameter = apvts_.getParameter(PARAM_MIX)) {
            processor_.setDryWetMix(parameter->convertFrom0to1(newValue) / 100.0f);
            return;
        }
    }
    if (parameterID == PARAM_BYPASS) {
        processor_.setBypass(newValue > 0.5f);
    }
}

} // namespace map2
