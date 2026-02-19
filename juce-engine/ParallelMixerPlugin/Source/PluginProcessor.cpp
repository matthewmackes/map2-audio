#include "PluginProcessor.h"
#include "PluginEditor.h"

ParallelMixerAudioProcessor::ParallelMixerAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
}

ParallelMixerAudioProcessor::~ParallelMixerAudioProcessor() = default;

void ParallelMixerAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepareToPlay(sampleRate, samplesPerBlock);
    processor.setBypass(true);
}

void ParallelMixerAudioProcessor::releaseResources()
{
    processor.releaseResources();
}

bool ParallelMixerAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void ParallelMixerAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;

    const auto totalIn = getTotalNumInputChannels();
    const auto totalOut = getTotalNumOutputChannels();
    const auto numSamples = buffer.getNumSamples();

    for (auto ch = totalIn; ch < totalOut; ++ch) {
        buffer.clear(ch, 0, numSamples);
    }

    processor.processBlock(buffer, midiMessages);
}

juce::AudioProcessorEditor* ParallelMixerAudioProcessor::createEditor()
{
    return new ParallelMixerAudioProcessorEditor(*this);
}

bool ParallelMixerAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String ParallelMixerAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void ParallelMixerAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::ignoreUnused(destData);
}

void ParallelMixerAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    juce::ignoreUnused(data, sizeInBytes);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new ParallelMixerAudioProcessor();
}
