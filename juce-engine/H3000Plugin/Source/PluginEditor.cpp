#include "PluginEditor.h"

H3000AudioProcessorEditor::H3000AudioProcessorEditor(H3000AudioProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    setSize(440, 220);
}

H3000AudioProcessorEditor::~H3000AudioProcessorEditor() = default;

void H3000AudioProcessorEditor::paint(juce::Graphics& g)
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

void H3000AudioProcessorEditor::resized()
{
}
