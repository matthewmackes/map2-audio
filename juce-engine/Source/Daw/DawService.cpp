// =============================================================================
// T2503 Set 2 — DawService shell implementation (MAP2-native engine)
// =============================================================================

#include "DawService.h"

#include <iostream>

namespace map2::daw {

struct DawService::Impl {
    bool initialized = false;
    Impl() : initialized(true) {}
};

DawService::DawService() : impl_(std::make_unique<Impl>()) {
    // Set 2 shell. No audio device acquired, no AudioProcessorGraph started.
    // Set 3 (DawDeviceManager) introduces the first real wiring.
    std::cerr << "[T2503] DawService shell instantiated (Set 2 — MAP2-native, no graph yet)" << std::endl;
}

DawService::~DawService() = default;

std::string DawService::statusLine() const {
    if (impl_ && impl_->initialized) {
        return "DAW service: shell-only (T2503 Set 2). MAP2-native graph not yet active.";
    }
    return "DAW service: uninitialized";
}

} // namespace map2::daw
