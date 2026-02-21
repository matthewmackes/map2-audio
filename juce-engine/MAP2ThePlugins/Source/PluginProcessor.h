#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>

/**
 * MAP2-THEPLUGINS
 * A single-slot plugin host that loads one MAP2 VST3 at a time and embeds its UI.
 */
class MAP2ThePluginsAudioProcessor : public juce::AudioProcessor,
                                     public juce::ChangeBroadcaster
{
public:
    MAP2ThePluginsAudioProcessor();
    ~MAP2ThePluginsAudioProcessor() override;

    // AudioProcessor overrides
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "MAP2-THEPLUGINS"; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    // Host helpers
    struct PluginEntry {
        std::unique_ptr<juce::PluginDescription> desc;
        juce::String displayName;
    };

    const juce::StringArray& getPluginNames() const { return pluginNames_; }
    int getCurrentIndex() const { return currentIndex_; }
    void rescanPlugins();
    bool loadPluginByIndex(int index);

    juce::AudioPluginInstance* getCurrentPlugin() const { return pluginInstance_.get(); }
    juce::File getSearchRoot() const;

private:
    juce::AudioPluginFormat* findFormatByName(const juce::String& name);
    juce::AudioPluginFormatManager formatManager_;
    juce::KnownPluginList knownPlugins_;
    std::unique_ptr<juce::AudioPluginInstance> pluginInstance_;
    juce::StringArray pluginNames_;
    std::vector<PluginEntry> plugins_;
    int currentIndex_ = -1;

    // State blob of loaded plugin
    juce::MemoryBlock savedPluginState_;
    juce::String savedPluginPath_;

    void unloadCurrentPlugin();
    void syncSampleRateIfReady();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MAP2ThePluginsAudioProcessor)
};
