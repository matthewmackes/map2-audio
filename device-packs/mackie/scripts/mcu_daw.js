// T2503 Set 6 — Mackie Control Universal DAW-mode mapping script.
//
// Runs in the controller-host QuickJS sandbox. Each handler returns an object
// the host translates into an engine_command frame:
//
//   { value: <number>, args: [...] }            → standard verb dispatch
//   { verb: 'daw.X', value: ..., args: [...] }  → explicit verb override
//                                                  (used when bank offset
//                                                  expands one fader to a
//                                                  specific track_id arg)
//   null / undefined                              → drop event
//
// State this script holds:
//   bank_offset       → starting track index for the visible 8 strips
//   selected_param    → per-track selected (slot_index, param_id) for V-Pot
//
// Echo-back to the hardware (motorized fader sync, scribble-strip text) is
// produced by MCU_DAW.fader_echo + MCU_DAW.scribble_emit; the host calls
// these when the engine emits state-change events on /api/v1/daw/events.

var MCU_DAW = MCU_DAW || {};

MCU_DAW.STATUS_NOTE_ON   = 0x90;
MCU_DAW.STATUS_CC        = 0xB0;
MCU_DAW.STATUS_PITCH     = 0xE0;
MCU_DAW.MACKIE_MFR_ID    = [0x00, 0x00, 0x66];

MCU_DAW.bank_offset = 0;
MCU_DAW.bank_size = 8;

// Per-track selected plugin param (slot, param_id). Defaults to slot 0,
// gain — overridden when the operator presses SELECT on a strip.
MCU_DAW.selected_params = {};

// ---------- Fader (pitch-bend per channel) → daw.track.gain ----------

MCU_DAW.fader = function (channel, value14bit, vpotIndex) {
    var stripIndex = (vpotIndex || channel) - 1;       // strip 0..7
    var trackId = MCU_DAW.bank_offset + stripIndex;
    var normalized = value14bit / 16383.0;
    // Track gain is not a single daw.* verb yet (Set 4 has track-gain inside
    // daw.automation.set_point lanes for full-scope control). For real-time
    // strip moves we synthesize a daw.plugin.set_param targeting the
    // implicit "track gain" param on slot 0 — an interim contract until
    // Set 7 introduces a dedicated daw.track.set_gain verb.
    return {
        verb: 'daw.plugin.set_param',
        value: null,
        args: [trackId, 0, '__track_gain__', normalized],
    };
};

MCU_DAW.fader_echo = function (trackId, gainLinear) {
    var stripIndex = trackId - MCU_DAW.bank_offset;
    if (stripIndex < 0 || stripIndex >= MCU_DAW.bank_size) return null;
    var v = Math.max(0, Math.min(1, gainLinear));
    var pb = Math.round(v * 16383);
    return [
        MCU_DAW.STATUS_PITCH | stripIndex,
        pb & 0x7F,
        (pb >> 7) & 0x7F,
    ];
};

// ---------- V-Pot (relative CC) → daw.plugin.set_param on selected slot ----

MCU_DAW.vpot_param = function (channel, value, vpotIndex) {
    var stripIndex = vpotIndex - 1;                       // 0..7
    var trackId = MCU_DAW.bank_offset + stripIndex;
    var sel = MCU_DAW.selected_params[trackId] || { slot: 0, param: 'gain' };
    var direction = (value & 0x40) ? -1 : 1;
    var steps = value & 0x3F;
    // Relative encoder mode: emit a delta-relative param value. The host
    // applies it on top of the current value (held server-side); for the
    // QuickJS-only test path, we send a normalized step at 0.01 increments.
    var delta = direction * steps * 0.01;
    return {
        verb: 'daw.plugin.set_param',
        value: null,
        args: [trackId, sel.slot, sel.param, delta],
    };
};

// ---------- Rec-arm per strip → daw.track.set_arm ----------

MCU_DAW.rec_arm = function (channel, value, midino) {
    if (value === 0) return null;                         // ignore note-off
    var stripIndex = midino;                              // 0x00..0x07
    var trackId = MCU_DAW.bank_offset + stripIndex;
    return {
        verb: 'daw.track.set_arm',
        value: trackId,
        args: [true],
    };
};

// ---------- Transport ----------

MCU_DAW.rewind = function (channel, value) {
    if (value === 0) return null;
    return {
        verb: 'daw.transport.set_position',
        value: 0,
        args: [],
    };
};

MCU_DAW.fast_forward = function (channel, value) {
    if (value === 0) return null;
    // The host knows the current project's longest clip end; we emit a
    // sentinel value (-1) the host translates to "end".
    return {
        verb: 'daw.transport.set_position',
        value: -1,
        args: [],
    };
};

// ---------- Bank navigation ----------

MCU_DAW.bank_left = function (channel, value) {
    if (value === 0) return null;
    MCU_DAW.bank_offset = Math.max(0, MCU_DAW.bank_offset - MCU_DAW.bank_size);
    return { bank_offset: MCU_DAW.bank_offset };
};

MCU_DAW.bank_right = function (channel, value) {
    if (value === 0) return null;
    MCU_DAW.bank_offset += MCU_DAW.bank_size;
    return { bank_offset: MCU_DAW.bank_offset };
};

// ---------- Scribble-strip emit (track names + transport state) ----------

MCU_DAW.scribble_emit = function (trackNames, transportPositionSamples) {
    // Top row: 8 track names, 7 chars each. Bottom row: time-code.
    var topRow = '';
    for (var i = 0; i < MCU_DAW.bank_size; i++) {
        var idx = MCU_DAW.bank_offset + i;
        var name = (trackNames[idx] || '').substring(0, 7);
        while (name.length < 7) name += ' ';
        topRow += name;
    }
    var minutes = Math.floor(transportPositionSamples / (48000 * 60));
    var seconds = Math.floor((transportPositionSamples / 48000) % 60);
    var bottomRow = ('Pos ' + minutes + ':' +
                    (seconds < 10 ? '0' : '') + seconds).substring(0, 56);
    while (bottomRow.length < 56) bottomRow += ' ';

    var sysex = [0xF0].concat(MCU_DAW.MACKIE_MFR_ID).concat([0x14, 0x12, 0x00]);
    for (var c = 0; c < topRow.length; c++) sysex.push(topRow.charCodeAt(c));
    for (var c2 = 0; c2 < bottomRow.length; c2++) sysex.push(bottomRow.charCodeAt(c2));
    sysex.push(0xF7);
    return sysex;
};
