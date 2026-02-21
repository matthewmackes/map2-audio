#include "PluginEditor.h"

namespace {
constexpr int kHeaderHeight = 52;
}

MAP2ThePluginsAudioProcessorEditor::MAP2ThePluginsAudioProcessorEditor(MAP2ThePluginsAudioProcessor& p)
    : AudioProcessorEditor(&p), processor_(p)
{
    titleLabel_.setText("MAP2-THEPLUGINS — one-at-a-time MAP2 host", juce::dontSendNotification);
    titleLabel_.setColour(juce::Label::textColourId, juce::Colours::white);
    titleLabel_.setJustificationType(juce::Justification::centredLeft);
    titleLabel_.setFont(juce::Font(16.0f, juce::Font::bold));
    addAndMakeVisible(titleLabel_);

    pluginSelector_.setTextWhenNothingSelected("Select a MAP2 plugin");
    pluginSelector_.addListener(this);
    addAndMakeVisible(pluginSelector_);

    rescanButton_.addListener(this);
    addAndMakeVisible(rescanButton_);

    addAndMakeVisible(boundsGuard_);

    setSize(900, 620);

    processor_.addChangeListener(this);
    rebuildPluginList();
    rebuildEmbeddedEditor();
}

MAP2ThePluginsAudioProcessorEditor::~MAP2ThePluginsAudioProcessorEditor()
{
    processor_.removeChangeListener(this);
    embeddedEditor_.reset();
}

void MAP2ThePluginsAudioProcessorEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour::fromRGB(16, 18, 22));
    g.setColour(juce::Colour::fromRGB(36, 40, 48));
    g.fillRect(getLocalBounds().removeFromTop(kHeaderHeight));
}

void MAP2ThePluginsAudioProcessorEditor::resized()
{
    auto bounds = getLocalBounds();
    auto header = bounds.removeFromTop(kHeaderHeight).reduced(10);

    titleLabel_.setBounds(header.removeFromLeft(header.getWidth() * 0.45f));
    rescanButton_.setBounds(header.removeFromRight(110));
    pluginSelector_.setBounds(header.removeFromRight(320).reduced(4, 8));

    auto body = bounds.reduced(8);
    boundsGuard_.setBounds(body);
    if (embeddedEditor_ != nullptr)
        embeddedEditor_->setBounds(body);
}

void MAP2ThePluginsAudioProcessorEditor::changeListenerCallback(juce::ChangeBroadcaster* source)
{
    if (source == &processor_)
    {
        rebuildPluginList();
        rebuildEmbeddedEditor();
    }
}

void MAP2ThePluginsAudioProcessorEditor::buttonClicked(juce::Button* button)
{
    if (button == &rescanButton_)
    {
        processor_.rescanPlugins();
    }
}

void MAP2ThePluginsAudioProcessorEditor::comboBoxChanged(juce::ComboBox* comboBoxThatHasChanged)
{
    if (comboBoxThatHasChanged == &pluginSelector_)
    {
        auto sel = pluginSelector_.getSelectedItemIndex();
        processor_.loadPluginByIndex(sel);
    }
}

void MAP2ThePluginsAudioProcessorEditor::rebuildPluginList()
{
    auto selectedName = pluginSelector_.getText();
    pluginSelector_.clear(juce::dontSendNotification);
    const auto& names = processor_.getPluginNames();
    for (int i = 0; i < names.size(); ++i)
        pluginSelector_.addItem(names[i], i + 1);

    if (processor_.getCurrentIndex() >= 0)
        pluginSelector_.setSelectedItemIndex(processor_.getCurrentIndex(), juce::dontSendNotification);
    else if (pluginSelector_.getNumItems() > 0)
        pluginSelector_.setSelectedId(1, juce::dontSendNotification);
}

void MAP2ThePluginsAudioProcessorEditor::rebuildEmbeddedEditor()
{
    embeddedEditor_.reset();

    if (auto* plugin = processor_.getCurrentPlugin())
    {
        auto* childEditor = plugin->createEditorIfNeeded();
        if (childEditor == nullptr)
            childEditor = new juce::GenericAudioProcessorEditor(*plugin);
        embeddedEditor_.reset(childEditor);
        addAndMakeVisible(embeddedEditor_.get());
    }

    resized();
    repaint();
}
