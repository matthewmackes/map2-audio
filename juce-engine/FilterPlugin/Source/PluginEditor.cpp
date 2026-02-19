#include "PluginEditor.h"

FilterAudioProcessorEditor::FilterAudioProcessorEditor(FilterAudioProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    genericEditor.reset(new juce::GenericAudioProcessorEditor(p));
    addAndMakeVisible(genericEditor.get());
    setSize(560, juce::jmax(560, genericEditor->getHeight()));
}

FilterAudioProcessorEditor::~FilterAudioProcessorEditor() = default;

void FilterAudioProcessorEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff22242a));
}

void FilterAudioProcessorEditor::resized()
{
    if (genericEditor) {
        genericEditor->setBounds(getLocalBounds());
    }
}
