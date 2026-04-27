// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform

#include "Map2ControllerFactory.h"

namespace map2::controllers
{

std::unique_ptr<Map2Controller> Map2ControllerFactory::create (
    const ControllerIdentity& identity)
{
    // Protocol routing: only MIDI is supported in the audio engine.
    // HID and bulk controllers are constructed in the map2-controller-host
    // process by its own factory. See docs/architecture/CONTROLLER_LAYER.md §3.
    if (identity.protocol == "midi")
    {
        // Map2MidiController is forward-declared via T2459-B1; until that
        // subtask lands the factory returns nullptr for MIDI as well.
        // The factory is wired now so the rest of the controller subsystem
        // (the IPC layer, the supervisor) can be built and tested against
        // the abstract base without waiting for the protocol implementation.
        //
        // TODO(T2459-B1): include Midi/Map2MidiController.h and instantiate.
        return nullptr;
    }

    // HID and bulk are explicitly unsupported in the audio engine binary.
    if (identity.protocol == "hid" || identity.protocol == "bulk")
    {
        return nullptr;
    }

    // Unknown protocol.
    return nullptr;
}

} // namespace map2::controllers
