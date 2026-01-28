/**
 * MAP2 Audio Engine - JUCE Audio Graph Implementation
 */

#include "JuceAudioGraph.h"

namespace map2 {

JuceAudioGraph::JuceAudioGraph(JucePluginHost& host)
    : host_(host)
    , graph_(std::make_unique<juce::AudioProcessorGraph>()) {
}

JuceAudioGraph::~JuceAudioGraph() {
    releaseResources();
    graph_->clear();
}

void JuceAudioGraph::initialize(double sampleRate, int bufferSize, int numChannels) {
    sampleRate_ = sampleRate;
    bufferSize_ = bufferSize;
    numChannels_ = numChannels;

    // Clear any existing state
    graph_->clear();
    nodeMap_.clear();
    chain_.clear();

    // Create I/O nodes
    createIONodes();

    // Prepare the graph
    graph_->setPlayConfigDetails(numChannels, numChannels, sampleRate, bufferSize);
    graph_->prepareToPlay(sampleRate, bufferSize);

    // Initialize temp buffer
    tempBuffer_.setSize(numChannels, bufferSize);

    initialized_ = true;
}

void JuceAudioGraph::prepareToPlay(double sampleRate, int samplesPerBlock) {
    sampleRate_ = sampleRate;
    bufferSize_ = samplesPerBlock;

    graph_->setPlayConfigDetails(numChannels_, numChannels_, sampleRate, samplesPerBlock);
    graph_->prepareToPlay(sampleRate, samplesPerBlock);

    tempBuffer_.setSize(numChannels_, samplesPerBlock);
}

void JuceAudioGraph::releaseResources() {
    graph_->releaseResources();
}

void JuceAudioGraph::createIONodes() {
    // Create audio I/O nodes
    audioInputNode_ = graph_->addNode(
        std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
            juce::AudioProcessorGraph::AudioGraphIOProcessor::audioInputNode)
    )->nodeID;

    audioOutputNode_ = graph_->addNode(
        std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
            juce::AudioProcessorGraph::AudioGraphIOProcessor::audioOutputNode)
    )->nodeID;

    // Create MIDI I/O nodes
    midiInputNode_ = graph_->addNode(
        std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
            juce::AudioProcessorGraph::AudioGraphIOProcessor::midiInputNode)
    )->nodeID;

    midiOutputNode_ = graph_->addNode(
        std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
            juce::AudioProcessorGraph::AudioGraphIOProcessor::midiOutputNode)
    )->nodeID;

    // If no plugins, connect input directly to output
    if (chain_.empty()) {
        for (int ch = 0; ch < numChannels_; ++ch) {
            graph_->addConnection({{audioInputNode_, ch}, {audioOutputNode_, ch}});
        }
        // Connect MIDI
        graph_->addConnection({{midiInputNode_, juce::AudioProcessorGraph::midiChannelIndex},
                               {midiOutputNode_, juce::AudioProcessorGraph::midiChannelIndex}});
    }
}

bool JuceAudioGraph::addPlugin(InstanceId instanceId, int position) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    // Check if plugin is already in chain
    auto it = std::find(chain_.begin(), chain_.end(), instanceId);
    if (it != chain_.end()) {
        return false;
    }

    // Add node to graph
    auto nodeId = addPluginNode(instanceId);
    if (nodeId == juce::AudioProcessorGraph::NodeID()) {
        return false;
    }

    // Add to chain
    if (position < 0 || position >= static_cast<int>(chain_.size())) {
        chain_.push_back(instanceId);
    } else {
        chain_.insert(chain_.begin() + position, instanceId);
    }

    // Create meter for this plugin
    {
        std::lock_guard<std::mutex> meterLock(meterMutex_);
        pluginMeters_[instanceId] = std::make_unique<VuMeter>();
    }

    // Rebuild all connections
    rebuildConnections();

    return true;
}

bool JuceAudioGraph::removePlugin(InstanceId instanceId) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    auto it = std::find(chain_.begin(), chain_.end(), instanceId);
    if (it == chain_.end()) {
        return false;
    }

    // Remove from chain
    chain_.erase(it);

    // Remove node from graph
    removePluginNode(instanceId);

    // Remove meter
    {
        std::lock_guard<std::mutex> meterLock(meterMutex_);
        pluginMeters_.erase(instanceId);
    }

    // Rebuild connections
    rebuildConnections();

    return true;
}

bool JuceAudioGraph::reorderPlugins(const std::vector<InstanceId>& order) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    // Validate that order contains exactly the same plugins
    if (order.size() != chain_.size()) {
        return false;
    }

    std::set<InstanceId> currentSet(chain_.begin(), chain_.end());
    std::set<InstanceId> newSet(order.begin(), order.end());

    if (currentSet != newSet) {
        return false;
    }

    // Apply new order
    chain_ = order;

    // Rebuild connections
    rebuildConnections();

    return true;
}

bool JuceAudioGraph::movePlugin(InstanceId instanceId, int newPosition) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    auto it = std::find(chain_.begin(), chain_.end(), instanceId);
    if (it == chain_.end()) {
        return false;
    }

    // Remove from current position
    chain_.erase(it);

    // Insert at new position
    if (newPosition < 0 || newPosition >= static_cast<int>(chain_.size())) {
        chain_.push_back(instanceId);
    } else {
        chain_.insert(chain_.begin() + newPosition, instanceId);
    }

    // Rebuild connections
    rebuildConnections();

    return true;
}

std::vector<InstanceId> JuceAudioGraph::getChainOrder() const {
    std::lock_guard<std::mutex> lock(chainMutex_);
    return chain_;
}

int JuceAudioGraph::getPluginPosition(InstanceId instanceId) const {
    std::lock_guard<std::mutex> lock(chainMutex_);

    auto it = std::find(chain_.begin(), chain_.end(), instanceId);
    if (it == chain_.end()) {
        return -1;
    }
    return static_cast<int>(std::distance(chain_.begin(), it));
}

int JuceAudioGraph::getChainSize() const {
    std::lock_guard<std::mutex> lock(chainMutex_);
    return static_cast<int>(chain_.size());
}

void JuceAudioGraph::clearChain() {
    std::lock_guard<std::mutex> lock(chainMutex_);

    // Remove all plugin nodes
    for (auto id : chain_) {
        removePluginNode(id);
    }

    chain_.clear();

    {
        std::lock_guard<std::mutex> meterLock(meterMutex_);
        pluginMeters_.clear();
    }

    rebuildConnections();
}

juce::AudioProcessorGraph::NodeID JuceAudioGraph::addPluginNode(InstanceId instanceId) {
    auto* pluginInstance = host_.getInstance(instanceId);
    if (pluginInstance == nullptr) {
        return juce::AudioProcessorGraph::NodeID();
    }

    // Create a wrapper that doesn't own the processor
    // We use a shared_ptr to manage lifetime properly
    class PluginWrapper : public juce::AudioProcessor {
    public:
        PluginWrapper(juce::AudioPluginInstance* wrapped) : wrapped_(wrapped) {}

        const juce::String getName() const override { return wrapped_->getName(); }
        void prepareToPlay(double sr, int bs) override { wrapped_->prepareToPlay(sr, bs); }
        void releaseResources() override { wrapped_->releaseResources(); }
        void processBlock(juce::AudioBuffer<float>& b, juce::MidiBuffer& m) override {
            wrapped_->processBlock(b, m);
        }
        double getTailLengthSeconds() const override { return wrapped_->getTailLengthSeconds(); }
        bool acceptsMidi() const override { return wrapped_->acceptsMidi(); }
        bool producesMidi() const override { return wrapped_->producesMidi(); }
        juce::AudioProcessorEditor* createEditor() override { return nullptr; }
        bool hasEditor() const override { return false; }
        int getNumPrograms() override { return wrapped_->getNumPrograms(); }
        int getCurrentProgram() override { return wrapped_->getCurrentProgram(); }
        void setCurrentProgram(int i) override { wrapped_->setCurrentProgram(i); }
        const juce::String getProgramName(int i) override { return wrapped_->getProgramName(i); }
        void changeProgramName(int i, const juce::String& n) override { wrapped_->changeProgramName(i, n); }
        void getStateInformation(juce::MemoryBlock& b) override { wrapped_->getStateInformation(b); }
        void setStateInformation(const void* d, int s) override { wrapped_->setStateInformation(d, s); }
        int getLatencySamples() const { return wrapped_->getLatencySamples(); }

    private:
        juce::AudioPluginInstance* wrapped_;
    };

    // Add the plugin directly (JUCE will manage it within the graph)
    // Note: We're adding the actual instance - the graph takes ownership
    auto node = graph_->addNode(std::unique_ptr<juce::AudioProcessor>(pluginInstance));

    if (node == nullptr) {
        return juce::AudioProcessorGraph::NodeID();
    }

    nodeMap_[instanceId] = node->nodeID;
    return node->nodeID;
}

void JuceAudioGraph::removePluginNode(InstanceId instanceId) {
    auto it = nodeMap_.find(instanceId);
    if (it == nodeMap_.end()) {
        return;
    }

    graph_->removeNode(it->second);
    nodeMap_.erase(it);
}

void JuceAudioGraph::rebuildConnections() {
    // Remove all existing connections
    for (auto& conn : graph_->getConnections()) {
        graph_->removeConnection(conn);
    }

    if (chain_.empty()) {
        // Direct passthrough
        for (int ch = 0; ch < numChannels_; ++ch) {
            graph_->addConnection({{audioInputNode_, ch}, {audioOutputNode_, ch}});
        }
        graph_->addConnection({{midiInputNode_, juce::AudioProcessorGraph::midiChannelIndex},
                               {midiOutputNode_, juce::AudioProcessorGraph::midiChannelIndex}});
        return;
    }

    // Connect input to first plugin
    auto firstNodeId = nodeMap_[chain_.front()];
    for (int ch = 0; ch < numChannels_; ++ch) {
        graph_->addConnection({{audioInputNode_, ch}, {firstNodeId, ch}});
    }
    graph_->addConnection({{midiInputNode_, juce::AudioProcessorGraph::midiChannelIndex},
                           {firstNodeId, juce::AudioProcessorGraph::midiChannelIndex}});

    // Connect plugins in chain
    for (size_t i = 1; i < chain_.size(); ++i) {
        auto prevNodeId = nodeMap_[chain_[i - 1]];
        auto currNodeId = nodeMap_[chain_[i]];

        for (int ch = 0; ch < numChannels_; ++ch) {
            graph_->addConnection({{prevNodeId, ch}, {currNodeId, ch}});
        }
        // Pass MIDI through the chain
        graph_->addConnection({{prevNodeId, juce::AudioProcessorGraph::midiChannelIndex},
                               {currNodeId, juce::AudioProcessorGraph::midiChannelIndex}});
    }

    // Connect last plugin to output
    auto lastNodeId = nodeMap_[chain_.back()];
    for (int ch = 0; ch < numChannels_; ++ch) {
        graph_->addConnection({{lastNodeId, ch}, {audioOutputNode_, ch}});
    }
    graph_->addConnection({{lastNodeId, juce::AudioProcessorGraph::midiChannelIndex},
                           {midiOutputNode_, juce::AudioProcessorGraph::midiChannelIndex}});

    // Apply sidechain connections
    for (const auto& sc : sidechainConnections_) {
        auto srcIt = nodeMap_.find(sc.sourcePlugin);
        auto dstIt = nodeMap_.find(sc.destPlugin);

        if (srcIt != nodeMap_.end() && dstIt != nodeMap_.end()) {
            // Connect to sidechain bus (channels offset by main bus count)
            auto* dstNode = graph_->getNodeForId(dstIt->second);
            if (dstNode && dstNode->getProcessor()) {
                int mainChannels = dstNode->getProcessor()->getMainBusNumOutputChannels();
                for (int ch = 0; ch < numChannels_; ++ch) {
                    graph_->addConnection({{srcIt->second, ch},
                                           {dstIt->second, mainChannels + ch}});
                }
            }
        }
    }
}

bool JuceAudioGraph::connectSidechain(InstanceId sourcePlugin, InstanceId destPlugin, int destSidechainBus) {
    // Check both plugins exist
    if (nodeMap_.find(sourcePlugin) == nodeMap_.end() ||
        nodeMap_.find(destPlugin) == nodeMap_.end()) {
        return false;
    }

    // Check if connection already exists
    for (const auto& sc : sidechainConnections_) {
        if (sc.destPlugin == destPlugin && sc.destBusIndex == destSidechainBus) {
            // Already connected to this bus
            return false;
        }
    }

    sidechainConnections_.push_back({sourcePlugin, destPlugin, destSidechainBus});
    rebuildConnections();
    return true;
}

bool JuceAudioGraph::disconnectSidechain(InstanceId destPlugin, int destSidechainBus) {
    auto it = std::remove_if(sidechainConnections_.begin(), sidechainConnections_.end(),
        [&](const SidechainConnection& sc) {
            return sc.destPlugin == destPlugin && sc.destBusIndex == destSidechainBus;
        });

    if (it == sidechainConnections_.end()) {
        return false;
    }

    sidechainConnections_.erase(it, sidechainConnections_.end());
    rebuildConnections();
    return true;
}

std::vector<SidechainConnection> JuceAudioGraph::getSidechainConnections() const {
    return sidechainConnections_;
}

int JuceAudioGraph::getTotalLatency() const {
    return graph_->getLatencySamples();
}

double JuceAudioGraph::getTotalLatencyMs() const {
    return (getTotalLatency() / sampleRate_) * 1000.0;
}

std::map<InstanceId, int> JuceAudioGraph::getPerPluginLatency() const {
    std::map<InstanceId, int> result;
    std::lock_guard<std::mutex> lock(chainMutex_);

    for (auto id : chain_) {
        result[id] = host_.getPluginLatency(id);
    }

    return result;
}

void JuceAudioGraph::process(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiBuffer) {
    // Update input meters
    updateMeters(buffer, true);

    // Process through the graph
    graph_->processBlock(buffer, midiBuffer);

    // Update output meters
    updateMeters(buffer, false);
}

void JuceAudioGraph::process(const float* const* inputs, int numInputChannels,
                             float** outputs, int numOutputChannels,
                             int numSamples) {
    // Ensure temp buffer is large enough
    int channels = std::max(numInputChannels, numOutputChannels);
    if (tempBuffer_.getNumChannels() < channels || tempBuffer_.getNumSamples() < numSamples) {
        tempBuffer_.setSize(channels, numSamples);
    }

    // Copy input to temp buffer
    for (int ch = 0; ch < numInputChannels; ++ch) {
        if (inputs[ch] != nullptr) {
            tempBuffer_.copyFrom(ch, 0, inputs[ch], numSamples);
        }
    }

    // Clear unused channels
    for (int ch = numInputChannels; ch < channels; ++ch) {
        tempBuffer_.clear(ch, 0, numSamples);
    }

    // Process
    tempMidiBuffer_.clear();
    process(tempBuffer_, tempMidiBuffer_);

    // Copy output
    for (int ch = 0; ch < numOutputChannels; ++ch) {
        if (outputs[ch] != nullptr) {
            std::copy_n(tempBuffer_.getReadPointer(ch), numSamples, outputs[ch]);
        }
    }
}

VuLevels JuceAudioGraph::getInputVu() const {
    return inputMeter_.getLevels();
}

VuLevels JuceAudioGraph::getOutputVu() const {
    return outputMeter_.getLevels();
}

std::map<InstanceId, VuLevels> JuceAudioGraph::getPluginVuLevels() const {
    std::map<InstanceId, VuLevels> result;
    std::lock_guard<std::mutex> lock(meterMutex_);

    for (const auto& [id, meter] : pluginMeters_) {
        result[id] = meter->getLevels();
    }

    return result;
}

void JuceAudioGraph::setSampleRate(double sampleRate) {
    sampleRate_ = sampleRate;
    graph_->setPlayConfigDetails(numChannels_, numChannels_, sampleRate, bufferSize_);
}

void JuceAudioGraph::setBufferSize(int bufferSize) {
    bufferSize_ = bufferSize;
    graph_->setPlayConfigDetails(numChannels_, numChannels_, sampleRate_, bufferSize);
    tempBuffer_.setSize(numChannels_, bufferSize);
}

void JuceAudioGraph::updateMeters(const juce::AudioBuffer<float>& buffer, bool isInput) {
    VuMeter& meter = isInput ? inputMeter_ : outputMeter_;

    if (buffer.getNumChannels() >= 2) {
        meter.process(buffer.getReadPointer(0), buffer.getReadPointer(1),
                     buffer.getNumSamples());
    } else if (buffer.getNumChannels() >= 1) {
        meter.processMono(buffer.getReadPointer(0), buffer.getNumSamples());
    }
}

} // namespace map2
