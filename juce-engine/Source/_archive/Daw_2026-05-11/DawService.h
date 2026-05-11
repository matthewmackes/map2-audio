// =============================================================================
// T2503 Set 2 — DawService shell (MAP2-native engine)
// =============================================================================
// Single-process owner of the MAP2-native DAW signal path. The DAW core is
// built on juce::AudioProcessorGraph (already in tree for the live engine);
// deck/clip-launcher patterns are adapted from Mixxx (already vendored at
// device-packs/_mixx-imports/ under GPLv2-or-later; combined work distributes
// as AGPLv3). No external dependency beyond what the live engine already pulls.
//
// Compiled only when -DMAP2_DAW_MODE=ON. Sets 3..10 fill in the actual wiring:
//   Set 3 — DawDeviceManager + ModeSwitchCoordinator (callback ownership)
//   Set 4 — DawCommandRouter (engine_command daw.* verbs)
//   Set 5 — Project loader bound to MAP2 State Authority graph
//   Set 6 — control-surface device-pack integration (no engine-side code)
//   Set 7 — TransportBridge + MidiClockOut/In + MtcLtcBridge
//   Set 8 — Clip-launcher / deck patterns (Mixxx-derived)
//   Set 9 — AvbBus AudioProcessorGraph node + LV2 + plugin scanner
//   Set 10 — React reference UI + soak harness (no engine-side code)
//
// At Set 2 the shell exists so the build system, smoke test, and downstream
// sets can compile incrementally. The constructor logs "DAW service shell
// instantiated" and the destructor cleans up; no audio device is opened.
//
// License: this header is part of the MAP2 Audio Platform (AGPLv3-only).
// =============================================================================

#pragma once

#if !MAP2_DAW_MODE
#error "DawService.h included but MAP2_DAW_MODE is not set — build flag bug"
#endif

#include <memory>
#include <string>

namespace map2::daw {

class DawService {
public:
    DawService();
    ~DawService();

    DawService(const DawService&) = delete;
    DawService& operator=(const DawService&) = delete;
    DawService(DawService&&) = delete;
    DawService& operator=(DawService&&) = delete;

    /** Returns a one-line status string for diagnostics. Set 2 returns the
        shell-state literal; Sets 3+ replace this with real lifecycle state. */
    std::string statusLine() const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace map2::daw
