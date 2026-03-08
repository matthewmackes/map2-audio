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
    // Prevent duplicate placement: one instance may only appear once in topology.
    if (isPluginInParallelGroupsUnlocked(instanceId)) {
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

    bool removedAny = false;

    auto chainIt = std::find(chain_.begin(), chain_.end(), instanceId);
    if (chainIt != chain_.end()) {
        chain_.erase(chainIt);
        removedAny = true;
    }

    for (auto& group : parallelGroups_) {
        for (auto& branch : group.branches) {
            auto branchIt = std::find(branch.begin(), branch.end(), instanceId);
            if (branchIt != branch.end()) {
                branch.erase(branchIt);
                removedAny = true;
            }
        }
    }

    if (!removedAny) {
        return false;
    }

    // Remove sidechain references to deleted plugin.
    sidechainConnections_.erase(
        std::remove_if(
            sidechainConnections_.begin(),
            sidechainConnections_.end(),
            [instanceId](const SidechainConnection& sc) {
                return sc.sourcePlugin == instanceId || sc.destPlugin == instanceId;
            }),
        sidechainConnections_.end());

    // Remove graph node once the instance is no longer referenced anywhere.
    if (!isPluginReferencedUnlocked(instanceId)) {
        removePluginNode(instanceId);
    }

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
    const juce::SpinLock::ScopedLockType lock(graphLock_);
    auto existing = nodeMap_.find(instanceId);
    if (existing != nodeMap_.end()) {
        return existing->second;
    }

    // Non-owning wrapper: delegates all AudioProcessor calls to the
    // wrapped pointer without transferring ownership.
    // Works for both AudioPluginInstance* and AudioProcessor* (hardware plugins).
    class NonOwningPluginWrapper : public juce::AudioProcessor {
    public:
        NonOwningPluginWrapper(juce::AudioProcessor* wrapped)
            : juce::AudioProcessor(createBusesPropertiesFromProcessor(wrapped))
            , wrapped_(wrapped) {}

        ~NonOwningPluginWrapper() override {
            wrapped_ = nullptr;  // DON'T delete — we don't own it
        }

        const juce::String getName() const override {
            return wrapped_ ? wrapped_->getName() : juce::String();
        }
        void prepareToPlay(double sr, int bs) override {
            if (wrapped_) wrapped_->prepareToPlay(sr, bs);
        }
        void releaseResources() override {
            if (wrapped_) wrapped_->releaseResources();
        }
        void processBlock(juce::AudioBuffer<float>& b, juce::MidiBuffer& m) override {
            if (wrapped_) wrapped_->processBlock(b, m);
        }
        double getTailLengthSeconds() const override {
            return wrapped_ ? wrapped_->getTailLengthSeconds() : 0.0;
        }
        bool isBusesLayoutSupported(const BusesLayout& layouts) const override {
            return wrapped_ ? wrapped_->checkBusesLayoutSupported(layouts) : false;
        }
        bool acceptsMidi() const override {
            return wrapped_ ? wrapped_->acceptsMidi() : false;
        }
        bool producesMidi() const override {
            return wrapped_ ? wrapped_->producesMidi() : false;
        }
        juce::AudioProcessorEditor* createEditor() override { return nullptr; }
        bool hasEditor() const override { return false; }
        int getNumPrograms() override {
            return wrapped_ ? wrapped_->getNumPrograms() : 1;
        }
        int getCurrentProgram() override {
            return wrapped_ ? wrapped_->getCurrentProgram() : 0;
        }
        void setCurrentProgram(int i) override {
            if (wrapped_) wrapped_->setCurrentProgram(i);
        }
        const juce::String getProgramName(int i) override {
            return wrapped_ ? wrapped_->getProgramName(i) : juce::String();
        }
        void changeProgramName(int i, const juce::String& n) override {
            if (wrapped_) wrapped_->changeProgramName(i, n);
        }
        void getStateInformation(juce::MemoryBlock& b) override {
            if (wrapped_) wrapped_->getStateInformation(b);
        }
        void setStateInformation(const void* d, int s) override {
            if (wrapped_) wrapped_->setStateInformation(d, s);
        }

    private:
        static juce::AudioProcessor::BusesProperties createBusesPropertiesFromProcessor(
            juce::AudioProcessor* wrapped) {
            juce::AudioProcessor::BusesProperties props;
            if (wrapped == nullptr) return props;

            const int numInputs = wrapped->getBusCount(true);
            for (int i = 0; i < numInputs; ++i) {
                if (auto* bus = wrapped->getBus(true, i)) {
                    props = props.withInput(bus->getName(), bus->getCurrentLayout(), bus->isEnabled());
                }
            }

            const int numOutputs = wrapped->getBusCount(false);
            for (int i = 0; i < numOutputs; ++i) {
                if (auto* bus = wrapped->getBus(false, i)) {
                    props = props.withOutput(bus->getName(), bus->getCurrentLayout(), bus->isEnabled());
                }
            }

            return props;
        }

        juce::AudioProcessor* wrapped_;  // Non-owned pointer
    };

    // Resolve the processor — check both regular and hardware plugins
    juce::AudioProcessor* processor = host_.getProcessor(instanceId);
    if (processor == nullptr) {
        return juce::AudioProcessorGraph::NodeID();
    }

    // Ensure processor is prepared before entering the active graph
    processor->setRateAndBufferSizeDetails(sampleRate_, bufferSize_);
    processor->setNonRealtime(false);
    processor->prepareToPlay(sampleRate_, bufferSize_);

    // Create the non-owning wrapper and add to graph
    // The graph owns the wrapper, not the underlying processor
    auto node = graph_->addNode(std::make_unique<NonOwningPluginWrapper>(processor));

    if (node == nullptr) {
        return juce::AudioProcessorGraph::NodeID();
    }

    nodeMap_[instanceId] = node->nodeID;
    return node->nodeID;
}

void JuceAudioGraph::removePluginNode(InstanceId instanceId) {
    const juce::SpinLock::ScopedLockType lock(graphLock_);
    auto it = nodeMap_.find(instanceId);
    if (it == nodeMap_.end()) {
        return;
    }

    graph_->removeNode(it->second);
    nodeMap_.erase(it);
}

void JuceAudioGraph::rebuildConnections() {
    const juce::SpinLock::ScopedLockType lock(graphLock_);
    // Remove all existing connections
    for (auto& conn : graph_->getConnections()) {
        graph_->removeConnection(conn);
    }

    auto connectAudio = [this](juce::AudioProcessorGraph::NodeID src, juce::AudioProcessorGraph::NodeID dst) {
        for (int ch = 0; ch < numChannels_; ++ch) {
            graph_->addConnection({{src, ch}, {dst, ch}});
        }
    };

    auto connectMidi = [this](juce::AudioProcessorGraph::NodeID src, juce::AudioProcessorGraph::NodeID dst) {
        graph_->addConnection({{src, juce::AudioProcessorGraph::midiChannelIndex},
                               {dst, juce::AudioProcessorGraph::midiChannelIndex}});
    };

    juce::AudioProcessorGraph::NodeID currentNode = audioInputNode_;
    juce::AudioProcessorGraph::NodeID currentMidiNode = midiInputNode_;

    // Main linear chain
    if (!chain_.empty()) {
        auto itFirst = nodeMap_.find(chain_.front());
        if (itFirst != nodeMap_.end()) {
            connectAudio(currentNode, itFirst->second);
            connectMidi(currentMidiNode, itFirst->second);
            currentNode = itFirst->second;
            currentMidiNode = itFirst->second;
        }

        for (size_t i = 1; i < chain_.size(); ++i) {
            auto prevIt = nodeMap_.find(chain_[i - 1]);
            auto currIt = nodeMap_.find(chain_[i]);
            if (prevIt == nodeMap_.end() || currIt == nodeMap_.end()) {
                continue;
            }
            connectAudio(prevIt->second, currIt->second);
            connectMidi(prevIt->second, currIt->second);
            currentNode = currIt->second;
            currentMidiNode = currIt->second;
        }
    }

    // Parallel groups are chained after the linear section.
    for (const auto& group : parallelGroups_) {
        auto mixerIt = parallelMixerNodes_.find(group.id);
        if (mixerIt == parallelMixerNodes_.end()) {
            continue;
        }
        const auto mixerNodeId = mixerIt->second;

        bool routedAnyBranch = false;
        for (const auto& branch : group.branches) {
            if (branch.empty()) {
                continue;
            }

            auto firstBranchIt = nodeMap_.find(branch.front());
            if (firstBranchIt == nodeMap_.end()) {
                continue;
            }

            connectAudio(currentNode, firstBranchIt->second);
            connectMidi(currentMidiNode, firstBranchIt->second);

            juce::AudioProcessorGraph::NodeID branchTail = firstBranchIt->second;
            for (size_t i = 1; i < branch.size(); ++i) {
                auto prevIt = nodeMap_.find(branch[i - 1]);
                auto currIt = nodeMap_.find(branch[i]);
                if (prevIt == nodeMap_.end() || currIt == nodeMap_.end()) {
                    continue;
                }
                connectAudio(prevIt->second, currIt->second);
                connectMidi(prevIt->second, currIt->second);
                branchTail = currIt->second;
            }

            connectAudio(branchTail, mixerNodeId);
            routedAnyBranch = true;
        }

        // If all branches are empty/unroutable, pass-through into the mixer.
        if (!routedAnyBranch) {
            connectAudio(currentNode, mixerNodeId);
        }

        currentNode = mixerNodeId;
    }

    // Final output connection
    connectAudio(currentNode, audioOutputNode_);
    connectMidi(currentMidiNode, midiOutputNode_);

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
        if (sc.destPlugin == destPlugin && sc.destBus == destSidechainBus) {
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
            return sc.destPlugin == destPlugin && sc.destBus == destSidechainBus;
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
    // Update input meters (outside lock — metering doesn't need graph consistency)
    updateMeters(buffer, true);

    // Process through the graph (lock scoped tightly around processBlock only)
    {
        const juce::SpinLock::ScopedLockType lock(graphLock_);
        graph_->processBlock(buffer, midiBuffer);
    }

    // Update output meters (outside lock)
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

// ========================================
// Parallel Processing
// ========================================

int JuceAudioGraph::createParallelGroup(int position, int numBranches) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    if (numBranches < 2 || numBranches > ParallelMixerProcessor::MAX_BRANCHES) {
        return -1;
    }

    // Create the parallel group
    ParallelGroup group;
    group.id = nextParallelGroupId_++;
    group.branches.resize(numBranches);
    group.branchLevels.resize(numBranches, 1.0f);

    // Create the mixer processor
    auto mixer = std::make_unique<ParallelMixerProcessor>();
    mixer->setNumBranches(numBranches);
    mixer->prepareToPlay(sampleRate_, bufferSize_);

    // Add mixer to graph
    auto node = graph_->addNode(std::move(mixer));
    if (node == nullptr) {
        return -1;
    }

    parallelMixerNodes_[group.id] = node->nodeID;
    parallelGroups_.push_back(group);

    // Position is currently advisory; parallel groups are routed in insertion order.

    return group.id;
}

bool JuceAudioGraph::removeParallelGroup(int groupId) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    // Find the group
    auto it = std::find_if(parallelGroups_.begin(), parallelGroups_.end(),
        [groupId](const ParallelGroup& g) { return g.id == groupId; });

    if (it == parallelGroups_.end()) {
        return false;
    }

    std::vector<InstanceId> removedPlugins;
    for (const auto& branch : it->branches) {
        for (auto pluginId : branch) {
            removedPlugins.push_back(pluginId);
        }
    }

    // Remove the mixer node
    auto nodeIt = parallelMixerNodes_.find(groupId);
    if (nodeIt != parallelMixerNodes_.end()) {
        graph_->removeNode(nodeIt->second);
        parallelMixerNodes_.erase(nodeIt);
    }

    parallelMixers_.erase(groupId);
    parallelGroups_.erase(it);

    // Remove nodes only for plugins no longer referenced in chain/other groups.
    for (auto pluginId : removedPlugins) {
        if (!isPluginReferencedUnlocked(pluginId)) {
            removePluginNode(pluginId);
        }
    }

    rebuildConnections();
    return true;
}

bool JuceAudioGraph::addToParallelBranch(int groupId, int branchIndex,
                                          InstanceId pluginId, int position) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    // Find the group
    auto it = std::find_if(parallelGroups_.begin(), parallelGroups_.end(),
        [groupId](const ParallelGroup& g) { return g.id == groupId; });

    if (it == parallelGroups_.end()) {
        return false;
    }

    if (branchIndex < 0 || branchIndex >= static_cast<int>(it->branches.size())) {
        return false;
    }

    // Prevent duplicate placement in chain/parallel topology.
    if (std::find(chain_.begin(), chain_.end(), pluginId) != chain_.end()) {
        return false;
    }
    if (isPluginInParallelGroupsUnlocked(pluginId)) {
        return false;
    }

    // Add plugin node
    auto nodeId = addPluginNode(pluginId);
    if (nodeId == juce::AudioProcessorGraph::NodeID()) {
        return false;
    }

    // Add to branch
    auto& branch = it->branches[branchIndex];
    if (position < 0 || position >= static_cast<int>(branch.size())) {
        branch.push_back(pluginId);
    } else {
        branch.insert(branch.begin() + position, pluginId);
    }

    rebuildConnections();
    return true;
}

bool JuceAudioGraph::removeFromParallelBranch(int groupId, int branchIndex, InstanceId pluginId) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    // Find the group
    auto it = std::find_if(parallelGroups_.begin(), parallelGroups_.end(),
        [groupId](const ParallelGroup& g) { return g.id == groupId; });

    if (it == parallelGroups_.end()) {
        return false;
    }

    if (branchIndex < 0 || branchIndex >= static_cast<int>(it->branches.size())) {
        return false;
    }

    // Find and remove the plugin
    auto& branch = it->branches[branchIndex];
    auto pluginIt = std::find(branch.begin(), branch.end(), pluginId);
    if (pluginIt == branch.end()) {
        return false;
    }

    branch.erase(pluginIt);

    if (!isPluginReferencedUnlocked(pluginId)) {
        removePluginNode(pluginId);
    }

    rebuildConnections();
    return true;
}

void JuceAudioGraph::setParallelABBlend(int groupId, float blend) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    auto it = std::find_if(parallelGroups_.begin(), parallelGroups_.end(),
        [groupId](const ParallelGroup& g) { return g.id == groupId; });

    if (it != parallelGroups_.end()) {
        it->abBlend = std::clamp(blend, 0.0f, 1.0f);

        // Update the mixer processor
        auto nodeIt = parallelMixerNodes_.find(groupId);
        if (nodeIt != parallelMixerNodes_.end()) {
            auto* node = graph_->getNodeForId(nodeIt->second);
            if (node) {
                auto* mixer = dynamic_cast<ParallelMixerProcessor*>(node->getProcessor());
                if (mixer) {
                    mixer->setABBlend(blend);
                }
            }
        }
    }
}

float JuceAudioGraph::getParallelABBlend(int groupId) const {
    std::lock_guard<std::mutex> lock(chainMutex_);

    auto it = std::find_if(parallelGroups_.begin(), parallelGroups_.end(),
        [groupId](const ParallelGroup& g) { return g.id == groupId; });

    if (it != parallelGroups_.end()) {
        return it->abBlend;
    }
    return 0.5f;
}

void JuceAudioGraph::setParallelBranchLevel(int groupId, int branchIndex, float level) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    auto it = std::find_if(parallelGroups_.begin(), parallelGroups_.end(),
        [groupId](const ParallelGroup& g) { return g.id == groupId; });

    if (it != parallelGroups_.end() && branchIndex >= 0 &&
        branchIndex < static_cast<int>(it->branchLevels.size())) {
        it->branchLevels[branchIndex] = std::clamp(level, 0.0f, 2.0f);

        // Update the mixer processor
        auto nodeIt = parallelMixerNodes_.find(groupId);
        if (nodeIt != parallelMixerNodes_.end()) {
            auto* node = graph_->getNodeForId(nodeIt->second);
            if (node) {
                auto* mixer = dynamic_cast<ParallelMixerProcessor*>(node->getProcessor());
                if (mixer) {
                    mixer->setBranchLevel(branchIndex, level);
                }
            }
        }
    }
}

void JuceAudioGraph::setParallelBypass(int groupId, bool bypass) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    auto it = std::find_if(parallelGroups_.begin(), parallelGroups_.end(),
        [groupId](const ParallelGroup& g) { return g.id == groupId; });

    if (it != parallelGroups_.end()) {
        it->bypass = bypass;

        // Update the mixer processor
        auto nodeIt = parallelMixerNodes_.find(groupId);
        if (nodeIt != parallelMixerNodes_.end()) {
            auto* node = graph_->getNodeForId(nodeIt->second);
            if (node) {
                auto* mixer = dynamic_cast<ParallelMixerProcessor*>(node->getProcessor());
                if (mixer) {
                    mixer->setBypass(bypass);
                }
            }
        }
    }
}

std::vector<JuceAudioGraph::ParallelGroup> JuceAudioGraph::getParallelGroups() const {
    std::lock_guard<std::mutex> lock(chainMutex_);
    return parallelGroups_;
}

std::optional<JuceAudioGraph::ParallelGroup> JuceAudioGraph::getParallelGroup(int groupId) const {
    std::lock_guard<std::mutex> lock(chainMutex_);

    auto it = std::find_if(parallelGroups_.begin(), parallelGroups_.end(),
        [groupId](const ParallelGroup& g) { return g.id == groupId; });

    if (it != parallelGroups_.end()) {
        return *it;
    }
    return std::nullopt;
}

bool JuceAudioGraph::isPluginInParallelGroupsUnlocked(InstanceId instanceId) const {
    for (const auto& group : parallelGroups_) {
        for (const auto& branch : group.branches) {
            if (std::find(branch.begin(), branch.end(), instanceId) != branch.end()) {
                return true;
            }
        }
    }
    return false;
}

bool JuceAudioGraph::isPluginReferencedUnlocked(InstanceId instanceId) const {
    if (std::find(chain_.begin(), chain_.end(), instanceId) != chain_.end()) {
        return true;
    }
    return isPluginInParallelGroupsUnlocked(instanceId);
}

} // namespace map2
