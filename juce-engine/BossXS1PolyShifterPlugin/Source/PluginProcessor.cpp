#include "PluginProcessor.h"
#include "PluginEditor.h"

BossXS1PolyShifterAudioProcessor::BossXS1PolyShifterAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
}

BossXS1PolyShifterAudioProcessor::~BossXS1PolyShifterAudioProcessor() = default;

void BossXS1PolyShifterAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    processor.reset();
}

void BossXS1PolyShifterAudioProcessor::releaseResources()
{
    processor.reset();
}

bool BossXS1PolyShifterAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) {
        return false;
    }

    return layouts.getMainOutputChannelSet() == layouts.getMainInputChannelSet();
}

void BossXS1PolyShifterAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
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

juce::AudioProcessorEditor* BossXS1PolyShifterAudioProcessor::createEditor()
{
    return new BossXS1PolyShifterAudioProcessorEditor(*this);
}

bool BossXS1PolyShifterAudioProcessor::hasEditor() const
{
    return true;
}

const juce::String BossXS1PolyShifterAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

void BossXS1PolyShifterAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::ignoreUnused(destData);
}

void BossXS1PolyShifterAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    juce::ignoreUnused(data, sizeInBytes);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new BossXS1PolyShifterAudioProcessor();
}
