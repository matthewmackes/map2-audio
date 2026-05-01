// Biamp Tesira MIDI-side bridge script
// — controller-host QuickJS module.
//
// The real Tesira control work happens via TTP over TCP (see
// app/services/midi_hub/tesira_client.py). This script is the MIDI-
// side seam that lets MAP2 recognize Tesira as a device and route
// any incidental MIDI events through the canonical authority.

var TesiraBridge = TesiraBridge || {};

TesiraBridge.STATUS_SYSEX = 0xF0;

TesiraBridge.handle_sysex = function (bytes) {
    // Tesira does NOT emit MIDI SysEx in normal operation. If we see
    // any inbound SysEx on the Tesira ALSA port it's diagnostic
    // (probably a firmware-update message from the device's USB
    // configuration page). Log + drop.
    return null;
};
