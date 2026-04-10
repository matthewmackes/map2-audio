/**
 * MAP2 Audio Engine - JUCE Audio Graph Implementation
 */

#include "JuceAudioGraph.h"

#include <chrono>

namespace map2 {

JuceAudioGraph::JuceAudioGraph(JucePluginHost& host)
    : host_(host)
    , graph_(std::make_unique<juce::AudioProcessorGraph>()) {
}

JuceAudioGraph::~JuceAudioGraph() {
    shutdown();
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

void JuceAudioGraph::shutdown() {
    std::lock_guard<std::mutex> chainLock(chainMutex_);

    {
        std::lock_guard<std::mutex> meterLock(meterMutex_);
        pluginMeters_.clear();
    }

    sidechainConnections_.clear();
    chain_.clear();
    parallelGroups_.clear();
    parallelMixers_.clear();
    parallelMixerNodes_.clear();
    nodeMap_.clear();
    topologyUpdateDepth_ = 0;
    topologyDirty_ = false;
    nextParallelGroupId_ = 1;
    initialized_ = false;

    const juce::SpinLock::ScopedLockType graphLock(graphLock_);
    graph_->releaseResources();
    graph_->clear();
    audioInputNode_ = juce::AudioProcessorGraph::NodeID();
    audioOutputNode_ = juce::AudioProcessorGraph::NodeID();
    midiInputNode_ = juce::AudioProcessorGraph::NodeID();
    midiOutputNode_ = juce::AudioProcessorGraph::NodeID();
}

void JuceAudioGraph::createIONodes() {
    constexpr auto updateKind = juce::AudioProcessorGraph::UpdateKind::none;

    // Create audio I/O nodes
    audioInputNode_ = graph_->addNode(
        std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
            juce::AudioProcessorGraph::AudioGraphIOProcessor::audioInputNode),
        std::nullopt,
        updateKind
    )->nodeID;

    audioOutputNode_ = graph_->addNode(
        std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
            juce::AudioProcessorGraph::AudioGraphIOProcessor::audioOutputNode),
        std::nullopt,
        updateKind
    )->nodeID;

    // Create MIDI I/O nodes
    midiInputNode_ = graph_->addNode(
        std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
            juce::AudioProcessorGraph::AudioGraphIOProcessor::midiInputNode),
        std::nullopt,
        updateKind
    )->nodeID;

    midiOutputNode_ = graph_->addNode(
        std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
            juce::AudioProcessorGraph::AudioGraphIOProcessor::midiOutputNode),
        std::nullopt,
        updateKind
    )->nodeID;

    // If no plugins, connect input directly to output
    if (chain_.empty()) {
        for (int ch = 0; ch < numChannels_; ++ch) {
            graph_->addConnection({{audioInputNode_, ch}, {audioOutputNode_, ch}}, updateKind);
        }
        // Connect MIDI
        graph_->addConnection({{midiInputNode_, juce::AudioProcessorGraph::midiChannelIndex},
                               {midiOutputNode_, juce::AudioProcessorGraph::midiChannelIndex}},
                              updateKind);
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

    markTopologyDirtyAndMaybeRebuildLocked();

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

    // Remove meter
    {
        std::lock_guard<std::mutex> meterLock(meterMutex_);
        pluginMeters_.erase(instanceId);
    }

    markTopologyDirtyAndMaybeRebuildLocked();

    return true;
}

bool JuceAudioGraph::reorderPlugins(const std::vector<InstanceId>& order) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    // Validate that order contains exactly the same plugins
    if (order.size() != chain_.size()) {
        return false;
    }

    if (order == chain_) {
        recordTopologyNoOpSkip();
        return true;
    }

    std::set<InstanceId> currentSet(chain_.begin(), chain_.end());
    std::set<InstanceId> newSet(order.begin(), order.end());

    if (currentSet != newSet) {
        return false;
    }

    // Apply new order
    chain_ = order;

    markTopologyDirtyAndMaybeRebuildLocked();

    return true;
}

bool JuceAudioGraph::movePlugin(InstanceId instanceId, int newPosition) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    auto it = std::find(chain_.begin(), chain_.end(), instanceId);
    if (it == chain_.end()) {
        return false;
    }

    const auto currentIndex = static_cast<int>(std::distance(chain_.begin(), it));
    if (newPosition == currentIndex
        || ((newPosition < 0 || newPosition >= static_cast<int>(chain_.size()) - 1)
            && currentIndex == static_cast<int>(chain_.size()) - 1)) {
        recordTopologyNoOpSkip();
        return true;
    }

    // Remove from current position
    chain_.erase(it);

    // Insert at new position
    if (newPosition < 0 || newPosition >= static_cast<int>(chain_.size())) {
        chain_.push_back(instanceId);
    } else {
        chain_.insert(chain_.begin() + newPosition, instanceId);
    }

    markTopologyDirtyAndMaybeRebuildLocked();

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

    if (chain_.empty()) {
        {
            std::lock_guard<std::mutex> meterLock(meterMutex_);
            pluginMeters_.clear();
        }
        recordTopologyNoOpSkip();
        return;
    }

    chain_.clear();

    {
        std::lock_guard<std::mutex> meterLock(meterMutex_);
        pluginMeters_.clear();
    }

    markTopologyDirtyAndMaybeRebuildLocked();
}

bool JuceAudioGraph::replaceChain(const std::vector<InstanceId>& order) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    std::set<InstanceId> seen;
    for (const auto instanceId : order) {
        if (!seen.insert(instanceId).second) {
            return false;
        }
        if (isPluginInParallelGroupsUnlocked(instanceId)) {
            return false;
        }
        if (addPluginNode(instanceId) == juce::AudioProcessorGraph::NodeID()) {
            return false;
        }
    }

    if (chain_ == order) {
        recordTopologyNoOpSkip();
        return true;
    }

    chain_ = order;

    {
        std::lock_guard<std::mutex> meterLock(meterMutex_);
        pluginMeters_.clear();
        for (const auto instanceId : chain_) {
            pluginMeters_[instanceId] = std::make_unique<VuMeter>();
        }
    }

    markTopologyDirtyAndMaybeRebuildLocked();
    return true;
}

bool JuceAudioGraph::applyRoutingTopology(const RoutingTopologySpec& spec) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    std::set<InstanceId> seen;
    auto validatePlugin = [this, &seen](InstanceId instanceId) -> bool {
        if (!seen.insert(instanceId).second) {
            return false;
        }
        return addPluginNode(instanceId) != juce::AudioProcessorGraph::NodeID();
    };

    for (const auto instanceId : spec.chainOrder) {
        if (!validatePlugin(instanceId)) {
            return false;
        }
    }

    for (const auto& groupSpec : spec.parallelGroups) {
        if (groupSpec.branches.size() < 2
            || groupSpec.branches.size() > static_cast<size_t>(ParallelMixerProcessor::MAX_BRANCHES)) {
            return false;
        }
        for (const auto& branchSpec : groupSpec.branches) {
            for (const auto instanceId : branchSpec.pluginIds) {
                if (!validatePlugin(instanceId)) {
                    return false;
                }
            }
        }
    }

    for (const auto& connection : spec.sidechainConnections) {
        if (connection.sourcePlugin == INVALID_INSTANCE_ID || connection.destPlugin == INVALID_INSTANCE_ID) {
            return false;
        }
        if (seen.find(connection.sourcePlugin) == seen.end() || seen.find(connection.destPlugin) == seen.end()) {
            return false;
        }
    }

    {
        const juce::SpinLock::ScopedLockType graphLock(graphLock_);
        for (const auto& [groupId, nodeId] : parallelMixerNodes_) {
            graph_->removeNode(nodeId, juce::AudioProcessorGraph::UpdateKind::none);
            parallelMixers_.erase(groupId);
        }
    }
    parallelMixerNodes_.clear();
    parallelGroups_.clear();

    chain_ = spec.chainOrder;
    sidechainConnections_ = spec.sidechainConnections;

    {
        std::lock_guard<std::mutex> meterLock(meterMutex_);
        pluginMeters_.clear();
        for (const auto instanceId : spec.chainOrder) {
            pluginMeters_[instanceId] = std::make_unique<VuMeter>();
        }
        for (const auto& groupSpec : spec.parallelGroups) {
            for (const auto& branchSpec : groupSpec.branches) {
                for (const auto instanceId : branchSpec.pluginIds) {
                    if (pluginMeters_.find(instanceId) == pluginMeters_.end()) {
                        pluginMeters_[instanceId] = std::make_unique<VuMeter>();
                    }
                }
            }
        }
    }

    for (const auto& groupSpec : spec.parallelGroups) {
        ParallelGroup group;
        group.id = nextParallelGroupId_++;
        group.abBlend = std::clamp(groupSpec.abBlend, 0.0f, 1.0f);
        group.masterLevel = std::clamp(groupSpec.masterLevel, 0.0f, 2.0f);
        group.bypass = groupSpec.bypass;
        group.mode = groupSpec.mode;
        group.branches.resize(groupSpec.branches.size());
        group.branchLevels.resize(groupSpec.branches.size(), 1.0f);
        group.branchChainIds.resize(groupSpec.branches.size(), -1);

        auto mixer = std::make_unique<ParallelMixerProcessor>();
        mixer->setNumBranches(static_cast<int>(groupSpec.branches.size()));
        mixer->setMode(groupSpec.mode);
        mixer->setABBlend(group.abBlend);
        mixer->setMasterLevel(group.masterLevel);
        mixer->setBypass(group.bypass);
        for (size_t branchIndex = 0; branchIndex < groupSpec.branches.size(); ++branchIndex) {
            const auto& branchSpec = groupSpec.branches[branchIndex];
            group.branches[branchIndex] = branchSpec.pluginIds;
            group.branchLevels[branchIndex] = std::clamp(branchSpec.level, 0.0f, 2.0f);
            group.branchChainIds[branchIndex] = branchSpec.chainId;
            mixer->setBranchLevel(static_cast<int>(branchIndex), group.branchLevels[branchIndex]);
        }
        mixer->prepareToPlay(sampleRate_, bufferSize_);

        juce::AudioProcessorGraph::Node::Ptr node;
        {
            const juce::SpinLock::ScopedLockType graphLock(graphLock_);
            node = graph_->addNode(std::move(mixer), std::nullopt, juce::AudioProcessorGraph::UpdateKind::none);
        }
        if (node == nullptr) {
            return false;
        }

        parallelMixerNodes_[group.id] = node->nodeID;
        parallelGroups_.push_back(std::move(group));
    }

    markTopologyDirtyAndMaybeRebuildLocked();
    return true;
}

bool JuceAudioGraph::prewarmPluginNode(InstanceId instanceId) {
    std::lock_guard<std::mutex> lock(chainMutex_);
    return addPluginNode(instanceId) != juce::AudioProcessorGraph::NodeID();
}

void JuceAudioGraph::beginTopologyUpdate() {
    std::lock_guard<std::mutex> lock(chainMutex_);
    ++topologyUpdateDepth_;
}

void JuceAudioGraph::endTopologyUpdate() {
    std::lock_guard<std::mutex> lock(chainMutex_);
    if (topologyUpdateDepth_ > 0) {
        --topologyUpdateDepth_;
    }
    if (topologyUpdateDepth_ == 0 && topologyDirty_) {
        topologyDirty_ = false;
        rebuildConnections();
    }
}

JuceAudioGraph::TopologyMutationStats JuceAudioGraph::getTopologyMutationStats() const {
    std::lock_guard<std::mutex> lock(topologyMutationStatsMutex_);
    return topologyMutationStats_;
}

void JuceAudioGraph::resetTopologyMutationStats() {
    std::lock_guard<std::mutex> lock(topologyMutationStatsMutex_);
    topologyMutationStats_ = TopologyMutationStats{};
}

juce::AudioProcessorGraph::NodeID JuceAudioGraph::addPluginNode(InstanceId instanceId) {
    {
        const juce::SpinLock::ScopedLockType lock(graphLock_);
        auto existing = nodeMap_.find(instanceId);
        if (existing != nodeMap_.end()) {
            return existing->second;
        }
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
    const juce::SpinLock::ScopedLockType lock(graphLock_);
    auto existing = nodeMap_.find(instanceId);
    if (existing != nodeMap_.end()) {
        return existing->second;
    }

    auto node = graph_->addNode(std::make_unique<NonOwningPluginWrapper>(processor),
                                std::nullopt,
                                juce::AudioProcessorGraph::UpdateKind::none);

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

    graph_->removeNode(it->second, juce::AudioProcessorGraph::UpdateKind::none);
    nodeMap_.erase(it);
}

void JuceAudioGraph::removeDetachedPluginNode(InstanceId instanceId) {
    std::lock_guard<std::mutex> lock(chainMutex_);
    if (isPluginReferencedUnlocked(instanceId)) {
        return;
    }
    removePluginNode(instanceId);
}

void JuceAudioGraph::rebuildConnections() {
    const auto start = std::chrono::steady_clock::now();
    const juce::SpinLock::ScopedLockType lock(graphLock_);
    constexpr auto updateKind = juce::AudioProcessorGraph::UpdateKind::none;

    // Remove all existing connections
    const auto existingConnections = graph_->getConnections();
    const int removedConnectionCount = static_cast<int>(existingConnections.size());
    int addedConnectionCount = 0;
    for (const auto& conn : existingConnections) {
        graph_->removeConnection(conn, updateKind);
    }

    auto connectAudio = [this, updateKind, &addedConnectionCount](juce::AudioProcessorGraph::NodeID src,
                                                                  juce::AudioProcessorGraph::NodeID dst) {
        for (int ch = 0; ch < numChannels_; ++ch) {
            graph_->addConnection({{src, ch}, {dst, ch}}, updateKind);
            ++addedConnectionCount;
        }
    };

    auto connectMidi = [this, updateKind, &addedConnectionCount](juce::AudioProcessorGraph::NodeID src,
                                                                 juce::AudioProcessorGraph::NodeID dst) {
        graph_->addConnection({{src, juce::AudioProcessorGraph::midiChannelIndex},
                               {dst, juce::AudioProcessorGraph::midiChannelIndex}},
                              updateKind);
        ++addedConnectionCount;
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
        auto* mixerNode = graph_->getNodeForId(mixerNodeId);
        auto* mixerProcessor = mixerNode != nullptr ? mixerNode->getProcessor() : nullptr;
        if (mixerProcessor == nullptr) {
            continue;
        }

        bool routedAnyBranch = false;
        for (size_t branchIndex = 0; branchIndex < group.branches.size(); ++branchIndex) {
            const auto& branch = group.branches[branchIndex];
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

            for (int ch = 0; ch < numChannels_; ++ch) {
                const int mixerChannel =
                    mixerProcessor->getChannelIndexInProcessBlockBuffer(true, static_cast<int>(branchIndex), ch);
                graph_->addConnection({{branchTail, ch}, {mixerNodeId, mixerChannel}}, updateKind);
                ++addedConnectionCount;
            }
            routedAnyBranch = true;
        }

        // If all branches are empty/unroutable, pass-through into the mixer.
        if (!routedAnyBranch) {
            for (int ch = 0; ch < numChannels_; ++ch) {
                const int mixerChannel = mixerProcessor->getChannelIndexInProcessBlockBuffer(true, 0, ch);
                graph_->addConnection({{currentNode, ch}, {mixerNodeId, mixerChannel}}, updateKind);
                ++addedConnectionCount;
            }
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
                                           {dstIt->second, mainChannels + ch}},
                                          updateKind);
                    ++addedConnectionCount;
                }
            }
        }
    }

    graph_->rebuild();

    const auto end = std::chrono::steady_clock::now();
    const double mutationDurationMs = std::chrono::duration<double, std::milli>(end - start).count();
    {
        std::lock_guard<std::mutex> statsLock(topologyMutationStatsMutex_);
        topologyMutationStats_.mutationCount += 1;
        topologyMutationStats_.lastMutationDurationMs = mutationDurationMs;
        topologyMutationStats_.peakMutationDurationMs =
            std::max(topologyMutationStats_.peakMutationDurationMs, mutationDurationMs);
        const double count = static_cast<double>(topologyMutationStats_.mutationCount);
        topologyMutationStats_.avgMutationDurationMs =
            ((topologyMutationStats_.avgMutationDurationMs * (count - 1.0)) + mutationDurationMs) / count;
        topologyMutationStats_.lastRemovedConnectionCount = removedConnectionCount;
        topologyMutationStats_.lastAddedConnectionCount = addedConnectionCount;
        topologyMutationStats_.lastChainSize = static_cast<int>(chain_.size());
        topologyMutationStats_.lastParallelGroupCount = static_cast<int>(parallelGroups_.size());
    }
}

void JuceAudioGraph::markTopologyDirtyAndMaybeRebuildLocked() {
    if (topologyUpdateDepth_ > 0) {
        topologyDirty_ = true;
        return;
    }
    rebuildConnections();
}

void JuceAudioGraph::recordTopologyNoOpSkip() {
    std::lock_guard<std::mutex> lock(topologyMutationStatsMutex_);
    topologyMutationStats_.noOpSkipCount += 1;
}

bool JuceAudioGraph::connectSidechain(InstanceId sourcePlugin, InstanceId destPlugin, int destSidechainBus) {
    std::lock_guard<std::mutex> lock(chainMutex_);

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
    markTopologyDirtyAndMaybeRebuildLocked();
    return true;
}

bool JuceAudioGraph::disconnectSidechain(InstanceId destPlugin, int destSidechainBus) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    auto it = std::remove_if(sidechainConnections_.begin(), sidechainConnections_.end(),
        [&](const SidechainConnection& sc) {
            return sc.destPlugin == destPlugin && sc.destBus == destSidechainBus;
        });

    if (it == sidechainConnections_.end()) {
        return false;
    }

    sidechainConnections_.erase(it, sidechainConnections_.end());
    markTopologyDirtyAndMaybeRebuildLocked();
    return true;
}

std::vector<SidechainConnection> JuceAudioGraph::getSidechainConnections() const {
    std::lock_guard<std::mutex> lock(chainMutex_);
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

    // JUCE swaps render sequences internally; taking an extra wrapper lock here
    // turns live graph rewires into callback stalls.
    graph_->processBlock(buffer, midiBuffer);

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
    group.branchChainIds.resize(numBranches, -1);

    // Create the mixer processor
    auto mixer = std::make_unique<ParallelMixerProcessor>();
    mixer->setNumBranches(numBranches);
    mixer->prepareToPlay(sampleRate_, bufferSize_);

    // Add mixer to graph
    juce::AudioProcessorGraph::Node::Ptr node;
    {
        const juce::SpinLock::ScopedLockType graphLock(graphLock_);
        node = graph_->addNode(std::move(mixer),
                               std::nullopt,
                               juce::AudioProcessorGraph::UpdateKind::none);
    }
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

    // Remove the mixer node
    auto nodeIt = parallelMixerNodes_.find(groupId);
    if (nodeIt != parallelMixerNodes_.end()) {
        const juce::SpinLock::ScopedLockType graphLock(graphLock_);
        graph_->removeNode(nodeIt->second, juce::AudioProcessorGraph::UpdateKind::none);
        parallelMixerNodes_.erase(nodeIt);
    }

    parallelMixers_.erase(groupId);
    parallelGroups_.erase(it);

    markTopologyDirtyAndMaybeRebuildLocked();
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

    markTopologyDirtyAndMaybeRebuildLocked();
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

    markTopologyDirtyAndMaybeRebuildLocked();
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
            const juce::SpinLock::ScopedLockType graphLock(graphLock_);
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

bool JuceAudioGraph::triggerParallelABSwitch(int groupId, int branchIndex) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    auto it = std::find_if(parallelGroups_.begin(), parallelGroups_.end(),
        [groupId](const ParallelGroup& g) { return g.id == groupId; });

    if (it == parallelGroups_.end() || branchIndex < 0 || branchIndex > 1) {
        return false;
    }

    it->abBlend = branchIndex == 0 ? 0.0f : 1.0f;

    auto nodeIt = parallelMixerNodes_.find(groupId);
    if (nodeIt == parallelMixerNodes_.end()) {
        return false;
    }

    const juce::SpinLock::ScopedLockType graphLock(graphLock_);
    auto* node = graph_->getNodeForId(nodeIt->second);
    if (node == nullptr) {
        return false;
    }

    auto* mixer = dynamic_cast<ParallelMixerProcessor*>(node->getProcessor());
    if (mixer == nullptr) {
        return false;
    }

    mixer->triggerABSwitchToBranch(branchIndex);
    return true;
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
            const juce::SpinLock::ScopedLockType graphLock(graphLock_);
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

bool JuceAudioGraph::setParallelBranchChainId(int groupId, int branchIndex, int chainId) {
    std::lock_guard<std::mutex> lock(chainMutex_);

    auto it = std::find_if(parallelGroups_.begin(), parallelGroups_.end(),
        [groupId](const ParallelGroup& g) { return g.id == groupId; });

    if (it == parallelGroups_.end()) {
        return false;
    }

    if (branchIndex < 0 || branchIndex >= static_cast<int>(it->branchChainIds.size())) {
        return false;
    }

    it->branchChainIds[static_cast<size_t>(branchIndex)] = chainId;
    return true;
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
            const juce::SpinLock::ScopedLockType graphLock(graphLock_);
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

bool JuceAudioGraph::copyParallelBranchTap(
    int groupId,
    int branchIndex,
    juce::AudioBuffer<float>& dest,
    int numSamples
) const {
    std::lock_guard<std::mutex> lock(chainMutex_);

    auto nodeIt = parallelMixerNodes_.find(groupId);
    if (nodeIt == parallelMixerNodes_.end()) {
        return false;
    }

    const juce::SpinLock::ScopedLockType graphLock(graphLock_);
    auto* node = graph_->getNodeForId(nodeIt->second);
    if (node == nullptr) {
        return false;
    }

    auto* mixer = dynamic_cast<ParallelMixerProcessor*>(node->getProcessor());
    if (mixer == nullptr) {
        return false;
    }

    return mixer->copyBranchTapToBuffer(branchIndex, dest, numSamples);
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
