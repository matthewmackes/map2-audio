// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// IpcMidiBridgeController — Map2Controller adapter wrapping IpcMidiBridge.
// Worklist: T2459-H6 Slice 2.
//
// Closes the deletion-blocking factory gap from Slice 1: under
// MAP2_USE_LEGACY_MIDI_CONTROLLER=OFF the legacy raw-ALSA
// Map2MidiController is excluded from the build, but
// Map2ControllerFactory::create("midi", ...) needs SOMETHING that
// satisfies the Map2Controller contract or every "midi" identity
// silently turns into nullptr at the call site. This adapter lets
// the OFF build return a working controller that drains its events
// from the host's shm event ring instead of opening its own ALSA
// subscription — matching the H1/H6 architecture decision.
//
// Surface notes:
//   - open() / close() / isOpen() track the wrapped IpcMidiBridge state.
//   - send() is a no-op for now; outbound MIDI in the H6 architecture
//     rides the controller-host's UDS control plane (not the engine
//     side). Returns true so callers don't see spurious failures.
//   - poll() drains the RT ring on every call, dispatching each event
//     through the inherited Map2Controller::dispatch() seam so the
//     fast-path binding table + upstream eventCallback fire identically
//     to the legacy path.

#pragma once

#include "../Map2Controller.h"
#include "IpcMidiBridge.h"

#include <memory>

namespace map2::controllers::midi
{

class IpcMidiBridgeController final : public Map2Controller
{
public:
    explicit IpcMidiBridgeController (ControllerIdentity identity);
    ~IpcMidiBridgeController() override;

    bool open() override;
    void close() override;
    void poll() override;
    bool send (const ControllerOutbound& outbound) override;

    /** Number of events dropped by the host because the rings were
     *  full at push time. Surfaced so the soak harness can assert
     *  zero drops as part of the H6 retirement gate. */
    std::uint64_t rtDroppedCount() const noexcept;

private:
    static ControllerEvent translateRingEvent (
        std::uint64_t tsNanos,
        const std::uint8_t* bytes,
        std::size_t length,
        const ControllerIdentity& identity);

    std::unique_ptr<map2::midi_bridge::IpcMidiBridge> bridge_;
};

} // namespace map2::controllers::midi
