// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform

#include "Map2ControllerFactory.h"
#include "Midi/Map2MidiController.h"

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
        // Resolve the ALSA-seq client pattern from the identity.
        // The hardware_id format for ALSA-seq endpoints is
        // "alsa-seq:<client_pattern>:<port_index>" — parse those out.
        midi::AlsaSeqTarget target;
        target.clientPattern = identity.displayName;
        target.portIndex = 0;

        const juce::String hwid = identity.hardwareId;
        if (hwid.startsWith ("alsa-seq:"))
        {
            const juce::String tail = hwid.fromFirstOccurrenceOf ("alsa-seq:", false, false);
            const int lastColon = tail.lastIndexOfChar (':');
            if (lastColon > 0)
            {
                target.clientPattern = tail.substring (0, lastColon);
                target.portIndex = tail.substring (lastColon + 1).getIntValue();
            }
            else
            {
                target.clientPattern = tail;
            }
        }
        return std::make_unique<midi::Map2MidiController> (identity, target);
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
