#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace
{
constexpr auto PARAM_ALGO   = "algorithm";
constexpr auto PARAM_MIX    = "mix";
constexpr auto PARAM_FEEDBACK = "feedback";
constexpr auto PARAM_PITCH   = "pitch";
constexpr auto PARAM_BYPASS  = "bypass";
constexpr auto PARAM_IN_GAIN = "inputGainDb";
constexpr auto PARAM_OUT_GAIN = "outputGainDb";
}

EventideH9AudioProcessor::EventideH9AudioProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "PARAMS", createParameterLayout())
{
    apvts.addParameterListener(PARAM_ALGO, this);
    apvts.addParameterListener(PARAM_MIX, this);
    apvts.addParameterListener(PARAM_FEEDBACK, this);
    apvts.addParameterListener(PARAM_PITCH, this);
    apvts.addParameterListener(PARAM_BYPASS, this);
    syncParameters();
}

EventideH9AudioProcessor::~EventideH9AudioProcessor() = default;

void EventideH9AudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    processor.reset();
}

void EventideH9AudioProcessor::releaseResources()
{
    processor.reset();
}

juce::AudioProcessorValueTreeState::ParameterLayout EventideH9AudioProcessor::createParameterLayout()
{
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;
    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(
        PARAM_ALGO, "Algorithm",
        juce::StringArray{"MicroPitch", "UltraShift", "SmartShift", "Transpose", "PitchFactor",
                          "ReverseDelays", "ShimmerVerbs", "MotionReverbs", "Granular", "Crystallize"},
        0));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_MIX, "Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_FEEDBACK, "Feedback", juce::NormalisableRange<float>(0.0f, 0.95f, 0.001f), 0.35f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_PITCH, "Pitch (semitones)", juce::NormalisableRange<float>(-24.0f, 24.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(PARAM_BYPASS, "Bypass", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_IN_GAIN, "Input Gain (dB)", juce::NormalisableRange<float>(-24.0f, 24.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_OUT_GAIN, "Output Gain (dB)", juce::NormalisableRange<float>(-24.0f, 24.0f, 0.1f), 0.0f));
    return {params.begin(), params.end()};
}

bool EventideH9AudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void EventideH9AudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    juce::ignoreUnused(midiMessages);

    const auto totalIn = getTotalNumInputChannels();
    const auto totalOut = getTotalNumOutputChannels();
    const auto numSamples = buffer.getNumSamples();

    for (auto ch = totalIn; ch < totalOut; ++ch) {
        buffer.clear(ch, 0, numSamples);
    }

    processor.process(buffer);
}

void EventideH9AudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(newValue);
    syncParameters();
}

juce::AudioProcessorEditor* EventideH9AudioProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor(*this);
}

bool EventideH9AudioProcessor::hasEditor() const
{
    return true;
}

const juce::String EventideH9AudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void EventideH9AudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::MemoryOutputStream stream(destData, true);
    apvts.state.writeToStream(stream);
}

void EventideH9AudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    auto state = juce::ValueTree::readFromData(data, (size_t) sizeInBytes);
    if (state.isValid())
    {
        apvts.replaceState(state);
        syncParameters();
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new EventideH9AudioProcessor();
}

void EventideH9AudioProcessor::syncParameters()
{
    using map2::H9Algorithm;
    if (auto* algo = apvts.getRawParameterValue(PARAM_ALGO))
        processor.setAlgorithm(static_cast<H9Algorithm>(juce::jlimit(0, 9, (int)algo->load())));
    if (auto* mix = apvts.getRawParameterValue(PARAM_MIX))
        processor.setMix(mix->load());
    if (auto* bypass = apvts.getRawParameterValue(PARAM_BYPASS))
        processor.setBypass(bypass->load() > 0.5f);
    if (auto* in = apvts.getRawParameterValue(PARAM_IN_GAIN))
        processor.setInputGain(in->load());
    if (auto* out = apvts.getRawParameterValue(PARAM_OUT_GAIN))
        processor.setOutputGain(out->load());
}
