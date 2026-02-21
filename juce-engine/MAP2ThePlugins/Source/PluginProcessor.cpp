#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace {
// Find a directory containing MAP2 plugins relative to this binary.
juce::File defaultSearchRoot()
{
    auto exe = juce::File::getSpecialLocation(juce::File::currentExecutableFile);
    // exe = .../MAP2-THEPLUGINS.vst3/Contents/x86_64-win/MAP2-THEPLUGINS.vst3
    auto vst3Bundle = exe.getParentDirectory().getParentDirectory(); // Contents
    auto bundleDir  = vst3Bundle.getParentDirectory();               // MAP2-THEPLUGINS.vst3
    auto parent     = bundleDir.getParentDirectory();                // VSTs-MAP2-Windows (expected)
    if (parent.exists() && parent.isDirectory())
        return parent;
    return bundleDir.getParentDirectory();
}

// Helper to gather all .vst3 bundles in a directory (non-recursive)
static juce::Array<juce::File> findVst3Bundles(const juce::File& dir)
{
    juce::Array<juce::File> results;
    if (!dir.isDirectory())
        return results;
    juce::DirectoryIterator it(dir, false, "*.vst3", juce::File::findDirectories);
    while (it.next())
        results.add(it.getFile());
    return results;
}

} // namespace

MAP2ThePluginsAudioProcessor::MAP2ThePluginsAudioProcessor()
    : AudioProcessor(BusesProperties().withInput("Input", juce::AudioChannelSet::stereo(), true)
                                       .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    formatManager_.addDefaultFormats(); // includes VST3 on all platforms
    rescanPlugins();
}

MAP2ThePluginsAudioProcessor::~MAP2ThePluginsAudioProcessor() = default;

void MAP2ThePluginsAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    juce::ignoreUnused(samplesPerBlock);
    syncSampleRateIfReady();
    if (pluginInstance_ != nullptr)
        pluginInstance_->prepareToPlay(sampleRate, samplesPerBlock);
}

void MAP2ThePluginsAudioProcessor::releaseResources()
{
    if (pluginInstance_ != nullptr)
        pluginInstance_->releaseResources();
}

bool MAP2ThePluginsAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    // Support mono or stereo, matching input/output
    auto mainOut = layouts.getMainOutputChannelSet();
    return (mainOut == juce::AudioChannelSet::mono() || mainOut == juce::AudioChannelSet::stereo())
           && mainOut == layouts.getMainInputChannelSet();
}

void MAP2ThePluginsAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer,
                                                juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    const auto totalIn  = getTotalNumInputChannels();
    const auto totalOut = getTotalNumOutputChannels();
    const auto numSamples = buffer.getNumSamples();

    for (auto ch = totalIn; ch < totalOut; ++ch)
        buffer.clear(ch, 0, numSamples);

    if (pluginInstance_ != nullptr)
    {
        pluginInstance_->processBlock(buffer, midiMessages);
    }
}

void MAP2ThePluginsAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::MemoryOutputStream stream(destData, true);
    stream.writeString(savedPluginPath_);
    stream.writeInt(currentIndex_);
    stream.writeInt((int)savedPluginState_.getSize());
    if (savedPluginState_.getSize() > 0)
        stream.write(savedPluginState_.getData(), savedPluginState_.getSize());
}

void MAP2ThePluginsAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    juce::MemoryInputStream stream(data, (size_t) sizeInBytes, false);
    savedPluginPath_  = stream.readString();
    currentIndex_     = stream.readInt();
    auto blobSize     = stream.readInt();
    savedPluginState_.setSize((size_t) blobSize);
    if (blobSize > 0)
        stream.read(savedPluginState_.getData(), (size_t) blobSize);

    if (currentIndex_ >= 0)
        loadPluginByIndex(currentIndex_);
}

juce::AudioProcessorEditor* MAP2ThePluginsAudioProcessor::createEditor()
{
    return new MAP2ThePluginsAudioProcessorEditor(*this);
}

void MAP2ThePluginsAudioProcessor::rescanPlugins()
{
    plugins_.clear();
    pluginNames_.clear();

    // Respect env override first
    juce::String pathEnv = juce::SystemStats::getEnvironmentVariable("MAP2_PLUGIN_PATH", {});
    juce::Array<juce::File> roots;
    if (pathEnv.isNotEmpty())
    {
        juce::StringArray parts;
        parts.addTokens(pathEnv, ";:", "\"");
        for (auto& p : parts)
        {
            auto f = juce::File(p.trim());
            if (f.isDirectory())
                roots.add(f);
        }
    }
    if (roots.isEmpty())
        roots.add(defaultSearchRoot());

    juce::OwnedArray<juce::PluginDescription> found;
    for (auto& root : roots)
    {
        auto bundles = findVst3Bundles(root);
        auto* vst3 = findFormatByName("VST3");
        if (vst3 == nullptr)
            continue;

        for (auto& bundle : bundles)
        {
            juce::OwnedArray<juce::PluginDescription> types;
            vst3->findAllTypesForFile(types, bundle.getFullPathName());
            for (auto* t : types)
                found.add(new juce::PluginDescription(*t));
        }
    }

    int idx = 0;
    for (auto* desc : found)
    {
        PluginEntry entry;
        entry.desc = std::make_unique<juce::PluginDescription>(*desc);
        entry.displayName = desc->name.isNotEmpty() ? desc->name
                                                    : desc->fileOrIdentifier;
        plugins_.push_back(std::move(entry));
        pluginNames_.add(plugins_.back().displayName);
        ++idx;
    }

    if (plugins_.empty())
        pluginNames_.add("<no plugins found>");

    sendChangeMessage(); // Notify UI to refresh list
}

bool MAP2ThePluginsAudioProcessor::loadPluginByIndex(int index)
{
    if (index < 0 || index >= (int) plugins_.size())
        return false;

    unloadCurrentPlugin();

    auto& entry = plugins_[index];
    juce::String error;
    auto* format = findFormatByName(entry.desc->pluginFormatName);
    if (format == nullptr)
        return false;

    auto instance = formatManager_.createPluginInstance(*entry.desc,
                                                        juce::jmax(48000.0, getSampleRate()),
                                                        getBlockSize() > 0 ? getBlockSize() : 512,
                                                        error);
    if (instance == nullptr)
        return false;

    pluginInstance_ = std::move(instance);
    currentIndex_ = index;
    savedPluginPath_ = entry.desc->fileOrIdentifier;

    // Restore previous state for this plugin if we have it
    if (savedPluginState_.getSize() > 0)
        pluginInstance_->setStateInformation(savedPluginState_.getData(),
                                             (int) savedPluginState_.getSize());

    syncSampleRateIfReady();
    pluginInstance_->prepareToPlay(getSampleRate(), getBlockSize());

    sendChangeMessage(); // Notify editor to rebuild embedded UI
    return true;
}

void MAP2ThePluginsAudioProcessor::unloadCurrentPlugin()
{
    if (pluginInstance_ != nullptr)
    {
        // Persist its state before unloading
        savedPluginState_.reset();
        pluginInstance_->getStateInformation(savedPluginState_);
        pluginInstance_->releaseResources();
        pluginInstance_.reset();
    }
    currentIndex_ = -1;
}

void MAP2ThePluginsAudioProcessor::syncSampleRateIfReady()
{
    if (pluginInstance_ != nullptr && getSampleRate() > 0.0)
        pluginInstance_->setRateAndBufferSizeDetails(getSampleRate(), getBlockSize());
}

juce::File MAP2ThePluginsAudioProcessor::getSearchRoot() const
{
    return defaultSearchRoot();
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new MAP2ThePluginsAudioProcessor();
}
juce::AudioPluginFormat* MAP2ThePluginsAudioProcessor::findFormatByName(const juce::String& name)
{
    for (int i = 0; i < formatManager_.getNumFormats(); ++i)
    {
        auto* f = formatManager_.getFormat(i);
        if (f != nullptr && f->getName() == name)
            return f;
    }
    return nullptr;
}
