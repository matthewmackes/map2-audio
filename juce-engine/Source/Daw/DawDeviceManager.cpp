// =============================================================================
// T2503 Set 7 — DawDeviceManager implementation
// =============================================================================

#include "DawDeviceManager.h"

#include <juce_audio_processors/juce_audio_processors.h>

#include <iostream>

namespace map2::daw {

DawDeviceManager::DawDeviceManager(ModeSwitchCoordinator* coordinator)
    : coordinator_(coordinator) {
    // Pre-construct an empty graph so beginInitialize is a fast call.
    graph_ = std::make_unique<juce::AudioProcessorGraph>();
}

DawDeviceManager::~DawDeviceManager() {
    if (running_.load(std::memory_order_acquire)) {
        clearGraph();
        running_.store(false, std::memory_order_release);
    }
}

void DawDeviceManager::beginStop() {
    // Stop the audio callback. With no real device acquisition in Set 7,
    // we only flip the running flag and signal completion immediately.
    running_.store(false, std::memory_order_release);
    std::cerr << "[T2503] DawDeviceManager.beginStop" << std::endl;
    if (coordinator_ != nullptr) coordinator_->finishStop();
}

void DawDeviceManager::beginRelease() {
    // Tear down the graph contents — Set 8 will (re)build them from the
    // active project on beginInitialize.
    clearGraph();
    std::cerr << "[T2503] DawDeviceManager.beginRelease" << std::endl;
    if (coordinator_ != nullptr) coordinator_->finishRelease();
}

void DawDeviceManager::beginInitialize() {
    // Reset transport position; Set 8+ will wire clip launchers + deck
    // patterns into the graph here. For now the graph stays empty.
    transport_.setPositionSamples(0);
    running_.store(true, std::memory_order_release);
    std::cerr << "[T2503] DawDeviceManager.beginInitialize" << std::endl;
    if (coordinator_ != nullptr) coordinator_->finishInitialize();
}

bool DawDeviceManager::hasGraph() const noexcept {
    if (graph_ == nullptr) return false;
    return graph_->getNumNodes() > 0;
}

void DawDeviceManager::clearGraph() noexcept {
    if (graph_ == nullptr) return;
    graph_->clear();
}

} // namespace map2::daw
