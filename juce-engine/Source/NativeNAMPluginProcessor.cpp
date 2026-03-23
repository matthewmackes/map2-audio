#include "NativeNAMPluginProcessor.h"

namespace {
constexpr auto PARAM_INPUT_GAIN = "input_gain";
constexpr auto PARAM_OUTPUT_GAIN = "output_gain";
constexpr auto PARAM_NORMALIZE = "normalize";
constexpr auto PARAM_BYPASS = "bypass";
constexpr auto STATE_MODEL_PATH = "model_path";
}

namespace map2 {

NativeNAMPluginProcessor::NativeNAMPluginProcessor()
    : juce::AudioProcessor(BusesProperties()
          .withInput("Input", juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts_(*this, nullptr, "PARAMS", createParameterLayout()) {
    apvts_.addParameterListener(PARAM_INPUT_GAIN, this);
    apvts_.addParameterListener(PARAM_OUTPUT_GAIN, this);
    apvts_.addParameterListener(PARAM_NORMALIZE, this);
    apvts_.addParameterListener(PARAM_BYPASS, this);
    syncParameters();
}

NativeNAMPluginProcessor::~NativeNAMPluginProcessor() {
    apvts_.removeParameterListener(PARAM_INPUT_GAIN, this);
    apvts_.removeParameterListener(PARAM_OUTPUT_GAIN, this);
    apvts_.removeParameterListener(PARAM_NORMALIZE, this);
    apvts_.removeParameterListener(PARAM_BYPASS, this);
}

juce::AudioProcessorValueTreeState::ParameterLayout NativeNAMPluginProcessor::createParameterLayout() {
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_INPUT_GAIN,
        "Input Gain",
        juce::NormalisableRange<float>(-12.0f, 12.0f, 0.1f),
        0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_OUTPUT_GAIN,
        "Output Gain",
        juce::NormalisableRange<float>(-12.0f, 12.0f, 0.1f),
        0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(PARAM_NORMALIZE, "Normalize", true));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(PARAM_BYPASS, "Bypass", false));
    return {params.begin(), params.end()};
}

void NativeNAMPluginProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
    processor_.prepare(sampleRate, samplesPerBlock);
    syncParameters();
}

void NativeNAMPluginProcessor::releaseResources() {
    processor_.releaseResources();
}

bool NativeNAMPluginProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
    const auto& output = layouts.getMainOutputChannelSet();
    if (output != juce::AudioChannelSet::mono() && output != juce::AudioChannelSet::stereo()) {
        return false;
    }
    return output == layouts.getMainInputChannelSet();
}

void NativeNAMPluginProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) {
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

void NativeNAMPluginProcessor::getStateInformation(juce::MemoryBlock& destData) {
    auto state = apvts_.copyState();
    state.setProperty(STATE_MODEL_PATH, juce::String(modelPath_), nullptr);
    juce::MemoryOutputStream stream(destData, true);
    state.writeToStream(stream);
}

void NativeNAMPluginProcessor::setStateInformation(const void* data, int sizeInBytes) {
    const auto state = juce::ValueTree::readFromData(data, static_cast<size_t>(sizeInBytes));
    if (!state.isValid()) {
        return;
    }

    const auto restoredPath = state.getProperty(STATE_MODEL_PATH).toString().toStdString();
    apvts_.replaceState(state);
    modelPath_ = restoredPath;
    syncParameters();
    if (!modelPath_.empty()) {
        processor_.loadModel(modelPath_);
    }
}

void NativeNAMPluginProcessor::parameterChanged(const juce::String& parameterID, float newValue) {
    syncParameterValue(parameterID, newValue);
}

bool NativeNAMPluginProcessor::loadModel(const std::string& path) {
    if (!processor_.loadModel(path)) {
        return false;
    }
    modelPath_ = path;
    return true;
}

void NativeNAMPluginProcessor::unloadModel() {
    processor_.unloadModel();
    modelPath_.clear();
}

NAMModelInfo NativeNAMPluginProcessor::getModelInfo() const {
    return processor_.getModelInfo();
}

float NativeNAMPluginProcessor::getInputGainDb() const {
    return processor_.getInputGain();
}

float NativeNAMPluginProcessor::getOutputGainDb() const {
    return processor_.getOutputGain();
}

float NativeNAMPluginProcessor::getInputLevel() const {
    return processor_.getInputLevel();
}

float NativeNAMPluginProcessor::getOutputLevel() const {
    return processor_.getOutputLevel();
}

bool NativeNAMPluginProcessor::isNormalized() const {
    return processor_.isNormalized();
}

bool NativeNAMPluginProcessor::isBypassedLocally() const {
    return processor_.isBypassed();
}

void NativeNAMPluginProcessor::setInputGainDb(float value) {
    if (auto* parameter = apvts_.getParameter(PARAM_INPUT_GAIN)) {
        parameter->setValueNotifyingHost(parameter->convertTo0to1(value));
    } else {
        processor_.setInputGain(value);
    }
}

void NativeNAMPluginProcessor::setOutputGainDb(float value) {
    if (auto* parameter = apvts_.getParameter(PARAM_OUTPUT_GAIN)) {
        parameter->setValueNotifyingHost(parameter->convertTo0to1(value));
    } else {
        processor_.setOutputGain(value);
    }
}

void NativeNAMPluginProcessor::setNormalizeEnabled(bool enabled) {
    if (auto* parameter = apvts_.getParameter(PARAM_NORMALIZE)) {
        parameter->setValueNotifyingHost(enabled ? 1.0f : 0.0f);
    } else {
        processor_.setNormalize(enabled);
    }
}

void NativeNAMPluginProcessor::setBypassEnabled(bool enabled) {
    if (auto* parameter = apvts_.getParameter(PARAM_BYPASS)) {
        parameter->setValueNotifyingHost(enabled ? 1.0f : 0.0f);
    } else {
        processor_.setBypass(enabled);
    }
}

void NativeNAMPluginProcessor::syncParameters() {
    if (const auto* value = apvts_.getRawParameterValue(PARAM_INPUT_GAIN)) {
        processor_.setInputGain(value->load());
    }
    if (const auto* value = apvts_.getRawParameterValue(PARAM_OUTPUT_GAIN)) {
        processor_.setOutputGain(value->load());
    }
    if (const auto* value = apvts_.getRawParameterValue(PARAM_NORMALIZE)) {
        processor_.setNormalize(value->load() > 0.5f);
    }
    if (const auto* value = apvts_.getRawParameterValue(PARAM_BYPASS)) {
        processor_.setBypass(value->load() > 0.5f);
    }
}

void NativeNAMPluginProcessor::syncParameterValue(const juce::String& parameterID, float newValue) {
    if (parameterID == PARAM_INPUT_GAIN) {
        if (auto* parameter = apvts_.getParameter(PARAM_INPUT_GAIN)) {
            processor_.setInputGain(parameter->convertFrom0to1(newValue));
            return;
        }
    }
    if (parameterID == PARAM_OUTPUT_GAIN) {
        if (auto* parameter = apvts_.getParameter(PARAM_OUTPUT_GAIN)) {
            processor_.setOutputGain(parameter->convertFrom0to1(newValue));
            return;
        }
    }
    if (parameterID == PARAM_NORMALIZE) {
        processor_.setNormalize(newValue > 0.5f);
        return;
    }
    if (parameterID == PARAM_BYPASS) {
        processor_.setBypass(newValue > 0.5f);
    }
}

} // namespace map2
