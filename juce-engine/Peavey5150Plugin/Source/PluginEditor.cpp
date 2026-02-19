#include "PluginEditor.h"

Peavey5150AudioProcessorEditor::Peavey5150AudioProcessorEditor(Peavey5150AudioProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    genericEditor.reset(new juce::GenericAudioProcessorEditor(p));
    addAndMakeVisible(genericEditor.get());
    setSize(400, genericEditor->getHeight());
}

Peavey5150AudioProcessorEditor::~Peavey5150AudioProcessorEditor() = default;

void Peavey5150AudioProcessorEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff1a1a2e));
}

void Peavey5150AudioProcessorEditor::resized()
{
    if (genericEditor)
        genericEditor->setBounds(getLocalBounds());
}
