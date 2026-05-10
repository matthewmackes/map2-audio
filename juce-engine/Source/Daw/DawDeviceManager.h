// =============================================================================
// T2503 Set 7 — DawDeviceManager
// =============================================================================
// Owns the DAW signal graph and implements ITransitionTarget so the
// ModeSwitchCoordinator can drive the hard mode switch (locked decision A2).
//
// Set 7 ships the lifecycle skeleton + a stubbed AudioProcessorGraph.
// Subsequent sets fill in:
//   Set 8 — clip launchers + deck wiring inside the graph
//   Set 9 — AvbBusNode + LV2 plugin nodes via the shared scanner
//   Set 10 — soak harness wiring (no engine-side code)
//
// The actual audio device handover (claim/release of UA-1000) is
// intentionally deferred to the bench-gate slice — DawDeviceManager
// reports state transitions through the coordinator without acquiring
// real audio hardware here. This keeps the unit-test path stable
// independent of the audio environment.
//
// License: AGPLv3-only.
// =============================================================================

#pragma once

#if !MAP2_DAW_MODE
#error "DawDeviceManager.h included but MAP2_DAW_MODE is not set"
#endif

#include "ModeSwitchCoordinator.h"
#include "TransportBridge.h"

#include <atomic>
#include <memory>

namespace juce { class AudioProcessorGraph; }

namespace map2::daw {

class DawDeviceManager : public ITransitionTarget {
public:
    explicit DawDeviceManager(ModeSwitchCoordinator* coordinator);
    ~DawDeviceManager() override;

    DawDeviceManager(const DawDeviceManager&) = delete;
    DawDeviceManager& operator=(const DawDeviceManager&) = delete;

    // ITransitionTarget
    void beginStop() override;
    void beginRelease() override;
    void beginInitialize() override;

    /** Returns the canonical transport state for this DAW process. The
        TransportBridge is the canonical position; the C++ engine, the
        Python tempo service, and the React UI all chase it. */
    TransportBridge& transport() noexcept { return transport_; }

    /** True after beginInitialize() finishes. The audio callback is only
        active while this flag is true. */
    bool isRunning() const noexcept {
        return running_.load(std::memory_order_acquire);
    }

    /** Stub: returns true once the graph node count is non-zero (Set 8+
        will instantiate clip launchers etc.). */
    bool hasGraph() const noexcept;

private:
    void clearGraph() noexcept;

    ModeSwitchCoordinator* coordinator_;
    TransportBridge transport_;
    std::unique_ptr<juce::AudioProcessorGraph> graph_;
    std::atomic<bool> running_{false};
};

} // namespace map2::daw
