// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform

#include "Map2ControllerFactory.h"

// T2459-H6: legacy raw-ALSA Map2MidiController retired 2026-05-08.
// IpcMidiBridgeController drains MIDI events from the host's shm event
// ring (libremidi I/O lives in map2-controller-host) and satisfies the
// Map2Controller contract by translating ring frames into ControllerEvents.
// See docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md for the retirement record.
#include "Midi/IpcMidiBridgeController.h"

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
        return std::make_unique<midi::IpcMidiBridgeController> (identity);
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
