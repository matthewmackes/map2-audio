#include "PluginEditor.h"

EventideH9AudioProcessorEditor::EventideH9AudioProcessorEditor(EventideH9AudioProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    setSize(440, 220);
}

EventideH9AudioProcessorEditor::~EventideH9AudioProcessorEditor() = default;

void EventideH9AudioProcessorEditor::paint(juce::Graphics& g)
{
    juce::ignoreUnused(audioProcessor);

    g.fillAll(juce::Colour::fromRGB(18, 20, 24));
    g.setColour(juce::Colours::white);
    g.setFont(juce::FontOptions(22.0f, juce::Font::bold));
    g.drawFittedText(JucePlugin_Name,
                     getLocalBounds().reduced(20),
                     juce::Justification::centred,
                     2);
}

void EventideH9AudioProcessorEditor::resized()
{
}
