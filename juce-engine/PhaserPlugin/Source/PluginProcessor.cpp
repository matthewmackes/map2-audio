#include "PluginProcessor.h"
#include "PluginEditor.h"

PhaserAudioProcessor::PhaserAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "Parameters", createParameterLayout())
{
    apvts.addParameterListener(PARAM_RATE, this);
    apvts.addParameterListener(PARAM_DEPTH, this);
    apvts.addParameterListener(PARAM_CENTRE_FREQUENCY, this);
    apvts.addParameterListener(PARAM_FEEDBACK, this);
    apvts.addParameterListener(PARAM_MIX, this);
    apvts.addParameterListener(PARAM_BYPASS, this);
}

PhaserAudioProcessor::~PhaserAudioProcessor()
{
    apvts.removeParameterListener(PARAM_RATE, this);
    apvts.removeParameterListener(PARAM_DEPTH, this);
    apvts.removeParameterListener(PARAM_CENTRE_FREQUENCY, this);
    apvts.removeParameterListener(PARAM_FEEDBACK, this);
    apvts.removeParameterListener(PARAM_MIX, this);
    apvts.removeParameterListener(PARAM_BYPASS, this);
}

juce::AudioProcessorValueTreeState::ParameterLayout PhaserAudioProcessor::createParameterLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_RATE, 1}, "Rate",
        juce::NormalisableRange<float>(0.05f, 5.0f, 0.01f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_DEPTH, 1}, "Depth",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_CENTRE_FREQUENCY, 1}, "Centre Frequency",
        juce::NormalisableRange<float>(100.0f, 10000.0f, 1.0f, 0.35f), 1000.0f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_FEEDBACK, 1}, "Feedback",
        juce::NormalisableRange<float>(-1.0f, 1.0f, 0.001f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{PARAM_MIX, 1}, "Mix",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));

    layout.add(std::make_unique<juce::AudioParameterBool>(
        juce::ParameterID{PARAM_BYPASS, 1}, "Bypass", false));

    return layout;
}

void PhaserAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    phaser.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    phaser.reset();
    updateProcessorParameters();
}

void PhaserAudioProcessor::releaseResources()
{
    phaser.reset();
}

bool PhaserAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void PhaserAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    juce::ignoreUnused(midiMessages);

    const auto totalIn = getTotalNumInputChannels();
    const auto totalOut = getTotalNumOutputChannels();
    const auto numSamples = buffer.getNumSamples();

    for (auto ch = totalIn; ch < totalOut; ++ch) {
        buffer.clear(ch, 0, numSamples);
    }

    phaser.process(buffer);
}

void PhaserAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(parameterID, newValue);
    updateProcessorParameters();
}

void PhaserAudioProcessor::updateProcessorParameters()
{
    phaser.setRate(*apvts.getRawParameterValue(PARAM_RATE));
    phaser.setDepth(*apvts.getRawParameterValue(PARAM_DEPTH));
    phaser.setCentreFrequency(*apvts.getRawParameterValue(PARAM_CENTRE_FREQUENCY));
    phaser.setFeedback(*apvts.getRawParameterValue(PARAM_FEEDBACK));
    phaser.setMix(*apvts.getRawParameterValue(PARAM_MIX));
    phaser.setBypass(*apvts.getRawParameterValue(PARAM_BYPASS) > 0.5f);
}

juce::AudioProcessorEditor* PhaserAudioProcessor::createEditor()
{
    return new PhaserAudioProcessorEditor(*this);
}

bool PhaserAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String PhaserAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void PhaserAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    std::unique_ptr<juce::XmlElement> xml(state.createXml());
    copyXmlToBinary(*xml, destData);
}

void PhaserAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xmlState(getXmlFromBinary(data, sizeInBytes));
    if (xmlState != nullptr && xmlState->hasTagName(apvts.state.getType())) {
        apvts.replaceState(juce::ValueTree::fromXml(*xmlState));
        updateProcessorParameters();
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new PhaserAudioProcessor();
}
