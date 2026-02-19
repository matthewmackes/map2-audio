#include "PluginEditor.h"

Marshall800AudioProcessorEditor::Marshall800AudioProcessorEditor(Marshall800AudioProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    genericEditor.reset(new juce::GenericAudioProcessorEditor(p));
    addAndMakeVisible(genericEditor.get());
    setSize(400, genericEditor->getHeight());
}

Marshall800AudioProcessorEditor::~Marshall800AudioProcessorEditor() = default;

void Marshall800AudioProcessorEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff1a1a2e));
}

void Marshall800AudioProcessorEditor::resized()
{
    if (genericEditor)
        genericEditor->setBounds(getLocalBounds());
}
