#pragma once

#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

class MAP2ThePluginsAudioProcessorEditor : public juce::AudioProcessorEditor,
                                           private juce::ChangeListener,
                                           private juce::Button::Listener,
                                           private juce::ComboBox::Listener
{
public:
    explicit MAP2ThePluginsAudioProcessorEditor(MAP2ThePluginsAudioProcessor&);
    ~MAP2ThePluginsAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    void changeListenerCallback(juce::ChangeBroadcaster* source) override;
    void buttonClicked(juce::Button* button) override;
    void comboBoxChanged(juce::ComboBox* comboBoxThatHasChanged) override;

    void rebuildPluginList();
    void rebuildEmbeddedEditor();

    MAP2ThePluginsAudioProcessor& processor_;

    juce::ComboBox pluginSelector_;
    juce::TextButton rescanButton_{"Rescan"};
    juce::Label titleLabel_;

    std::unique_ptr<juce::AudioProcessorEditor> embeddedEditor_;
    juce::Component boundsGuard_; // keeps a border background behind embedded editor

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MAP2ThePluginsAudioProcessorEditor)
};
