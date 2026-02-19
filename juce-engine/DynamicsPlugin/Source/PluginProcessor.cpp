#include "PluginProcessor.h"
#include "PluginEditor.h"

DynamicsAudioProcessor::DynamicsAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "Parameters", createParameterLayout())
{
    apvts.addParameterListener(PARAM_THRESHOLD, this);
    apvts.addParameterListener(PARAM_RATIO, this);
    apvts.addParameterListener(PARAM_ATTACK, this);
    apvts.addParameterListener(PARAM_RELEASE, this);
    apvts.addParameterListener(PARAM_KNEE, this);
    apvts.addParameterListener(PARAM_MAKEUP, this);
    apvts.addParameterListener(PARAM_AUTO_MAKEUP, this);
    apvts.addParameterListener(PARAM_MODE, this);
    apvts.addParameterListener(PARAM_BYPASS, this);
}

DynamicsAudioProcessor::~DynamicsAudioProcessor()
{
    apvts.removeParameterListener(PARAM_THRESHOLD, this);
    apvts.removeParameterListener(PARAM_RATIO, this);
    apvts.removeParameterListener(PARAM_ATTACK, this);
    apvts.removeParameterListener(PARAM_RELEASE, this);
    apvts.removeParameterListener(PARAM_KNEE, this);
    apvts.removeParameterListener(PARAM_MAKEUP, this);
    apvts.removeParameterListener(PARAM_AUTO_MAKEUP, this);
    apvts.removeParameterListener(PARAM_MODE, this);
    apvts.removeParameterListener(PARAM_BYPASS, this);
}

juce::AudioProcessorValueTreeState::ParameterLayout DynamicsAudioProcessor::createParameterLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_THRESHOLD, 1}, "Threshold",
        juce::NormalisableRange<float>(-60.0f, 0.0f, 0.1f), -12.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_RATIO, 1}, "Ratio",
        juce::NormalisableRange<float>(1.0f, 100.0f, 0.1f, 0.4f), 4.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_ATTACK, 1}, "Attack",
        juce::NormalisableRange<float>(0.1f, 500.0f, 0.1f, 0.35f), 10.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_RELEASE, 1}, "Release",
        juce::NormalisableRange<float>(10.0f, 5000.0f, 1.0f, 0.35f), 100.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_KNEE, 1}, "Knee",
        juce::NormalisableRange<float>(0.0f, 24.0f, 0.1f), 6.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_MAKEUP, 1}, "Makeup",
        juce::NormalisableRange<float>(-12.0f, 24.0f, 0.1f), 0.0f));

    layout.add(std::make_unique<juce::AudioParameterBool>(
        juce::ParameterID{PARAM_AUTO_MAKEUP, 1}, "Auto Makeup", false));

    layout.add(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID{PARAM_MODE, 1}, "Mode",
        juce::StringArray{"Compressor", "Limiter", "Noise Gate"}, 0));

    layout.add(std::make_unique<juce::AudioParameterBool>(
        juce::ParameterID{PARAM_BYPASS, 1}, "Bypass", false));

    return layout;
}

void DynamicsAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    dynamics.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    dynamics.reset();
    updateProcessorParameters();
}

void DynamicsAudioProcessor::releaseResources()
{
    dynamics.reset();
}

bool DynamicsAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void DynamicsAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    juce::ignoreUnused(midiMessages);

    const auto totalIn = getTotalNumInputChannels();
    const auto totalOut = getTotalNumOutputChannels();
    const auto numSamples = buffer.getNumSamples();

    for (auto ch = totalIn; ch < totalOut; ++ch) {
        buffer.clear(ch, 0, numSamples);
    }

    dynamics.process(buffer);
}

void DynamicsAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(parameterID, newValue);
    updateProcessorParameters();
}

void DynamicsAudioProcessor::updateProcessorParameters()
{
    dynamics.setThreshold(*apvts.getRawParameterValue(PARAM_THRESHOLD));
    dynamics.setRatio(*apvts.getRawParameterValue(PARAM_RATIO));
    dynamics.setAttack(*apvts.getRawParameterValue(PARAM_ATTACK));
    dynamics.setRelease(*apvts.getRawParameterValue(PARAM_RELEASE));
    dynamics.setKnee(*apvts.getRawParameterValue(PARAM_KNEE));
    dynamics.setMakeupGain(*apvts.getRawParameterValue(PARAM_MAKEUP));
    dynamics.setAutoMakeup(*apvts.getRawParameterValue(PARAM_AUTO_MAKEUP) > 0.5f);
    dynamics.setMode(static_cast<map2::DynamicsProcessor::Mode>(
        juce::roundToInt(apvts.getRawParameterValue(PARAM_MODE)->load())));
    dynamics.setBypass(*apvts.getRawParameterValue(PARAM_BYPASS) > 0.5f);
}

juce::AudioProcessorEditor* DynamicsAudioProcessor::createEditor()
{
    return new DynamicsAudioProcessorEditor(*this);
}

bool DynamicsAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String DynamicsAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void DynamicsAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    std::unique_ptr<juce::XmlElement> xml(state.createXml());
    copyXmlToBinary(*xml, destData);
}

void DynamicsAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xmlState(getXmlFromBinary(data, sizeInBytes));
    if (xmlState != nullptr && xmlState->hasTagName(apvts.state.getType())) {
        apvts.replaceState(juce::ValueTree::fromXml(*xmlState));
        updateProcessorParameters();
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new DynamicsAudioProcessor();
}
