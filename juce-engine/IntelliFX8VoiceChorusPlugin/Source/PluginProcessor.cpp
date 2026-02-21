#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <string>

namespace
{
// Global
constexpr auto P_CHORUS_LEVEL   = "chorusLevel";
constexpr auto P_DIRECT_L       = "directLevelL";
constexpr auto P_DIRECT_R       = "directLevelR";
constexpr auto P_REGEN_L        = "regenL";
constexpr auto P_REGEN_R        = "regenR";
constexpr auto P_BYPASS         = "bypass";

// HUSH
constexpr auto P_HUSH_ENABLED   = "hushEnabled";
constexpr auto P_HUSH_THRESHOLD = "hushThreshold";
constexpr auto P_HUSH_RELEASE   = "hushRelease";

// Per-voice parameter name helper
inline std::string vn(int i, const char* suffix) {
    return "voice" + std::to_string(i) + std::string("_") + suffix;
}
}

IntelliFX8VoiceChorusAudioProcessor::IntelliFX8VoiceChorusAudioProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "PARAMS", createParameterLayout())
{
    apvts.addParameterListener(P_CHORUS_LEVEL, this);
    apvts.addParameterListener(P_DIRECT_L, this);
    apvts.addParameterListener(P_DIRECT_R, this);
    apvts.addParameterListener(P_REGEN_L, this);
    apvts.addParameterListener(P_REGEN_R, this);
    apvts.addParameterListener(P_BYPASS, this);
    apvts.addParameterListener(P_HUSH_ENABLED, this);
    apvts.addParameterListener(P_HUSH_THRESHOLD, this);
    apvts.addParameterListener(P_HUSH_RELEASE, this);
    for (int v = 0; v < map2::IntelliFX8VoiceChorusProcessor::NUM_VOICES; ++v)
    {
        apvts.addParameterListener(vn(v, "level"), this);
        apvts.addParameterListener(vn(v, "pan"), this);
        apvts.addParameterListener(vn(v, "delay"), this);
        apvts.addParameterListener(vn(v, "depth"), this);
        apvts.addParameterListener(vn(v, "rate"), this);
    }
    syncParameters();
}

IntelliFX8VoiceChorusAudioProcessor::~IntelliFX8VoiceChorusAudioProcessor() = default;

void IntelliFX8VoiceChorusAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    processor.prepare(sampleRate, samplesPerBlock, getTotalNumOutputChannels());
    processor.reset();
    syncParameters();
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
    return new juce::GenericAudioProcessorEditor(*this);
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
    juce::MemoryOutputStream stream(destData, true);
    apvts.state.writeToStream(stream);
}

void IntelliFX8VoiceChorusAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
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
    return new IntelliFX8VoiceChorusAudioProcessor();
}

juce::AudioProcessorValueTreeState::ParameterLayout IntelliFX8VoiceChorusAudioProcessor::createParameterLayout()
{
    using R = juce::NormalisableRange<float>;
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;

    // Global mixer
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_CHORUS_LEVEL, "Chorus Level (dB)", R(-100.0f, 6.0f, 0.1f), 0.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_DIRECT_L, "Direct L (dB)", R(-100.0f, 6.0f, 0.1f), -3.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_DIRECT_R, "Direct R (dB)", R(-100.0f, 6.0f, 0.1f), -3.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_REGEN_L, "Regen L (dB)", R(-100.0f, 0.0f, 0.1f), -100.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_REGEN_R, "Regen R (dB)", R(-100.0f, 0.0f, 0.1f), -100.0f));

    // HUSH
    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P_HUSH_ENABLED, "HUSH Enabled", false));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_HUSH_THRESHOLD, "HUSH Threshold (dB)", R(-92.0f, -20.0f, 0.1f), -40.0f));
    params.emplace_back(std::make_unique<juce::AudioParameterFloat>(P_HUSH_RELEASE, "HUSH Release (ms)", R(25.0f, 800.0f, 0.1f), 200.0f));

    // Voices
    for (int v = 0; v < map2::IntelliFX8VoiceChorusProcessor::NUM_VOICES; ++v)
    {
        params.emplace_back(std::make_unique<juce::AudioParameterFloat>(vn(v, "level"), "Voice " + std::to_string(v+1) + " Level (dB)", R(-100.0f, 0.0f, 0.1f), -6.0f));
        params.emplace_back(std::make_unique<juce::AudioParameterFloat>(vn(v, "pan"), "Voice " + std::to_string(v+1) + " Pan", R(-100.0f, 100.0f, 0.1f), 0.0f));
        params.emplace_back(std::make_unique<juce::AudioParameterFloat>(vn(v, "delay"), "Voice " + std::to_string(v+1) + " Delay (ms)", R(0.0f, map2::IntelliFX8VoiceChorusProcessor::MAX_DELAY_MS, 0.1f), 15.0f));
        params.emplace_back(std::make_unique<juce::AudioParameterFloat>(vn(v, "depth"), "Voice " + std::to_string(v+1) + " Depth", R(0.0f, 100.0f, 0.1f), 50.0f));
        params.emplace_back(std::make_unique<juce::AudioParameterFloat>(vn(v, "rate"), "Voice " + std::to_string(v+1) + " Rate", R(0.0f, map2::IntelliFX8VoiceChorusProcessor::MAX_RATE, 0.1f), 40.0f));
    }

    params.emplace_back(std::make_unique<juce::AudioParameterBool>(P_BYPASS, "Bypass", false));
    return {params.begin(), params.end()};
}

void IntelliFX8VoiceChorusAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue)
{
    juce::ignoreUnused(parameterID, newValue);
    syncParameters();
}

void IntelliFX8VoiceChorusAudioProcessor::syncParameters()
{
    auto params = processor.getParameters();
    if (auto* v = apvts.getRawParameterValue(P_CHORUS_LEVEL)) params.chorusLevel = v->load();
    if (auto* v = apvts.getRawParameterValue(P_DIRECT_L)) params.directLevelL = v->load();
    if (auto* v = apvts.getRawParameterValue(P_DIRECT_R)) params.directLevelR = v->load();
    if (auto* v = apvts.getRawParameterValue(P_REGEN_L)) params.regenL = v->load();
    if (auto* v = apvts.getRawParameterValue(P_REGEN_R)) params.regenR = v->load();

    if (auto* v = apvts.getRawParameterValue(P_HUSH_ENABLED)) params.hush.enabled = v->load() > 0.5f;
    if (auto* v = apvts.getRawParameterValue(P_HUSH_THRESHOLD)) params.hush.threshold = v->load();
    if (auto* v = apvts.getRawParameterValue(P_HUSH_RELEASE)) params.hush.releaseRate = v->load();

    for (int i = 0; i < map2::IntelliFX8VoiceChorusProcessor::NUM_VOICES; ++i)
    {
        if (auto* v = apvts.getRawParameterValue(vn(i, "level"))) params.voices[i].level = v->load();
        if (auto* v = apvts.getRawParameterValue(vn(i, "pan"))) params.voices[i].pan = v->load();
        if (auto* v = apvts.getRawParameterValue(vn(i, "delay"))) params.voices[i].delay = v->load();
        if (auto* v = apvts.getRawParameterValue(vn(i, "depth"))) params.voices[i].depth = v->load();
        if (auto* v = apvts.getRawParameterValue(vn(i, "rate"))) params.voices[i].rate = v->load();
    }

    if (auto* v = apvts.getRawParameterValue(P_BYPASS)) params.bypass = v->load() > 0.5f;
    processor.setParameters(params);
}
