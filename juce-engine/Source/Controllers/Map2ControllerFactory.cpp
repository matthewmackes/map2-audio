// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform

#include "Map2ControllerFactory.h"

// T2459-H6 retirement gate. When MAP2_HAS_LEGACY_MIDI_CONTROLLER=0 the
// raw-ALSA Map2MidiController is excluded from the build; "midi"
// identities short-circuit to nullptr and the consumer is expected to
// route through IpcMidiBridge (host-side libremidi → shm ring) instead.
// See docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md.
#ifndef MAP2_HAS_LEGACY_MIDI_CONTROLLER
  #define MAP2_HAS_LEGACY_MIDI_CONTROLLER 1
#endif

#if MAP2_HAS_LEGACY_MIDI_CONTROLLER
  #include "Midi/Map2MidiController.h"
#endif

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
#if MAP2_HAS_LEGACY_MIDI_CONTROLLER
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
#else
        // Legacy path retired (T2459-H6 OFF build). MIDI ingestion is
        // owned by map2-controller-host via libremidi; the engine drains
        // events through IpcMidiBridge.
        return nullptr;
#endif
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
