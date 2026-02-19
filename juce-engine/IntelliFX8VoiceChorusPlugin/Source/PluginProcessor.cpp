#include "PluginProcessor.h"
#include "PluginEditor.h"

IntelliFX8VoiceChorusAudioProcessor::IntelliFX8VoiceChorusAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
}

IntelliFX8VoiceChorusAudioProcessor::~IntelliFX8VoiceChorusAudioProcessor() = default;

void IntelliFX8VoiceChorusAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    processor.reset();
}

void IntelliFX8VoiceChorusAudioProcessor::releaseResources()
{
    processor.reset();
}

bool IntelliFX8VoiceChorusAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void IntelliFX8VoiceChorusAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
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

juce::AudioProcessorEditor* IntelliFX8VoiceChorusAudioProcessor::createEditor()
{
    return new IntelliFX8VoiceChorusAudioProcessorEditor(*this);
}

bool IntelliFX8VoiceChorusAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String IntelliFX8VoiceChorusAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void IntelliFX8VoiceChorusAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::ignoreUnused(destData);
}

void IntelliFX8VoiceChorusAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    juce::ignoreUnused(data, sizeInBytes);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new IntelliFX8VoiceChorusAudioProcessor();
}
