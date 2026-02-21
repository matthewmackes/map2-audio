#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace
{
constexpr auto PARAM_PITCH    = "pitch";
constexpr auto PARAM_WINDOW   = "grainWindow";
constexpr auto PARAM_MIX      = "mix";
constexpr auto PARAM_BYPASS   = "bypass";
constexpr auto PARAM_FEEDBACK = "feedback";
constexpr auto PARAM_DETUNE   = "detuneMode";
constexpr auto PARAM_BALANCE  = "balance";
constexpr auto PARAM_DIRECTION = "shiftDirection";
constexpr auto PARAM_PEDAL_EN = "pedalEnabled";
constexpr auto PARAM_PEDAL_POS = "pedalPosition";
constexpr auto PARAM_PEDAL_MIN = "pedalMin";
constexpr auto PARAM_PEDAL_MAX = "pedalMax";
constexpr auto PARAM_PEDAL_MOM = "pedalMomentary";
constexpr auto PARAM_DETUNE_AMT = "detuneAmount";
}

BossXS1PolyShifterAudioProcessor::BossXS1PolyShifterAudioProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "PARAMS", createParameterLayout())
{
    apvts.addParameterListener(PARAM_PITCH, this);
    apvts.addParameterListener(PARAM_WINDOW, this);
    apvts.addParameterListener(PARAM_MIX, this);
    apvts.addParameterListener(PARAM_BYPASS, this);
    apvts.addParameterListener(PARAM_FEEDBACK, this);
    apvts.addParameterListener(PARAM_DETUNE, this);
    apvts.addParameterListener(PARAM_BALANCE, this);
    apvts.addParameterListener(PARAM_DIRECTION, this);
    apvts.addParameterListener(PARAM_PEDAL_EN, this);
    apvts.addParameterListener(PARAM_PEDAL_POS, this);
    apvts.addParameterListener(PARAM_PEDAL_MIN, this);
    apvts.addParameterListener(PARAM_PEDAL_MAX, this);
    apvts.addParameterListener(PARAM_PEDAL_MOM, this);
    apvts.addParameterListener(PARAM_DETUNE_AMT, this);
    syncParameters();
}

BossXS1PolyShifterAudioProcessor::~BossXS1PolyShifterAudioProcessor() = default;

void BossXS1PolyShifterAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    processor.reset();
    syncParameters();
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

void BossXS1PolyShifterAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(parameterID, newValue);
    syncParameters();
}

juce::AudioProcessorEditor* BossXS1PolyShifterAudioProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor(*this);
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
    juce::MemoryOutputStream stream(destData, true);
    apvts.state.writeToStream(stream);
}

void BossXS1PolyShifterAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
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
    return new BossXS1PolyShifterAudioProcessor();
}

juce::AudioProcessorValueTreeState::ParameterLayout BossXS1PolyShifterAudioProcessor::createParameterLayout()
{
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_PITCH, "Pitch (semitones)", juce::NormalisableRange<float>(-24.0f, 24.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_WINDOW, "Grain Window (ms)", juce::NormalisableRange<float>(10.0f, 200.0f, 0.1f), 80.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_MIX, "Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_FEEDBACK, "Feedback", juce::NormalisableRange<float>(0.0f, 0.7f, 0.001f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(
        PARAM_DETUNE, "Detune Mode", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_BALANCE, "Balance (wet%)", juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 50.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterChoice>(
        PARAM_DIRECTION, "Shift Direction", juce::StringArray{"Free","Up","Down"}, 0));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(PARAM_PEDAL_EN, "Pedal Enabled", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_PEDAL_POS, "Pedal Position", juce::NormalisableRange<float>(0.0f, 100.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_PEDAL_MIN, "Pedal Min (st)", juce::NormalisableRange<float>(map2::BossXS1PolyShifterProcessor::MIN_SHIFT, map2::BossXS1PolyShifterProcessor::MAX_SHIFT, 0.1f), -7.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_PEDAL_MAX, "Pedal Max (st)", juce::NormalisableRange<float>(map2::BossXS1PolyShifterProcessor::MIN_SHIFT, map2::BossXS1PolyShifterProcessor::MAX_SHIFT, 0.1f), 7.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(PARAM_PEDAL_MOM, "Pedal Momentary", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(
        PARAM_DETUNE_AMT, "Detune Amount (cents)", juce::NormalisableRange<float>(-20.0f, 20.0f, 0.1f), 20.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(PARAM_BYPASS, "Bypass", false));
    return {params.begin(), params.end()};
}

void BossXS1PolyShifterAudioProcessor::syncParameters()
{
    auto params = processor.getParameters();
    if (auto* pitch = apvts.getRawParameterValue(PARAM_PITCH))
        params.shiftAmount = pitch->load();
    if (auto* win = apvts.getRawParameterValue(PARAM_WINDOW))
        params.glide = win->load();
    if (auto* mix = apvts.getRawParameterValue(PARAM_MIX))
        params.balance = mix->load() * 100.0f;
    if (auto* fb = apvts.getRawParameterValue(PARAM_FEEDBACK))
        params.feedback = fb->load();
    if (auto* det = apvts.getRawParameterValue(PARAM_DETUNE))
        params.detuneMode = det->load() > 0.5f;
    if (auto* bal = apvts.getRawParameterValue(PARAM_BALANCE))
        params.balance = bal->load();
    if (auto* dir = apvts.getRawParameterValue(PARAM_DIRECTION)) {
        int sel = (int)dir->load();
        params.shiftDirection = (sel == 1 ? 1 : sel == 2 ? -1 : 0);
    }
    if (auto* pedEn = apvts.getRawParameterValue(PARAM_PEDAL_EN))
        params.pedalEnabled = pedEn->load() > 0.5f;
    if (auto* pedPos = apvts.getRawParameterValue(PARAM_PEDAL_POS))
        params.pedalPosition = pedPos->load();
    if (auto* pedMin = apvts.getRawParameterValue(PARAM_PEDAL_MIN))
        params.pedalMin = pedMin->load();
    if (auto* pedMax = apvts.getRawParameterValue(PARAM_PEDAL_MAX))
        params.pedalMax = pedMax->load();
    if (auto* pedMom = apvts.getRawParameterValue(PARAM_PEDAL_MOM))
        params.pedalMomentary = pedMom->load() > 0.5f;
    if (auto* detAmt = apvts.getRawParameterValue(PARAM_DETUNE_AMT))
        params.detuneAmount = detAmt->load();
    if (auto* bypass = apvts.getRawParameterValue(PARAM_BYPASS))
        params.bypass = bypass->load() > 0.5f;

    processor.setParameters(params);
}
