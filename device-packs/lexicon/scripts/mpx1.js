// Lexicon MPX-1 mapping script — controller-host QuickJS module.
//
// Handles front-panel CC + Note + PC events that need parameterized
// behavior beyond a direct engine target, plus the SysEx parser
// cutover surface for the future T2459-H4 / T2482-P1.5 work.
//
// Scope today (T2482 Phase 1.5 NOT yet shipped):
//   - The fast-path direct-target rows in mpx1.midi.yaml (CC 7, CC 64,
//     CC 65, PC) work via the MAP2 engine target system; these JS
//     functions are invoked when the YAML row also names a script,
//     and they perform any per-binding side-effects (e.g., updating
//     the chain bypass LED state).
//   - The SysEx handler is the cutover surface for retiring
//     app/services/mpx1_syx_parser.py. Until the cutover lands, this
//     handler is a no-op stub; the Python parser remains active and
//     handles inbound SysEx via app/services/midi_hub/router.py.

var MPX1 = MPX1 || {};

// MIDI status nibble constants (echoed in YAML)
MPX1.STATUS_NOTE_OFF       = 0x80;
MPX1.STATUS_NOTE_ON        = 0x90;
MPX1.STATUS_CC             = 0xB0;
MPX1.STATUS_PC             = 0xC0;
MPX1.STATUS_SYSEX          = 0xF0;
MPX1.LEXICON_MFR_ID        = 0x06;  // matches _LEXICON_ID in mpx1_syx_parser.py

// ---------- Front-panel handlers ----------

MPX1.bypass_toggle = function (channel, value) {
    // CC 64 from front-panel BYPASS button. Engine target audio.chain.1.bypass
    // is already toggled by the dispatcher (action: latch in YAML); this
    // hook would be where vendor-specific debounce or LED-mirror logic
    // lives. Currently a no-op until the Phase 1.5 cutover.
    return null;
};

MPX1.tap_tempo = function (channel, value) {
    // CC 65 from front-panel TAP button. The dispatcher emits the
    // momentary action; this hook would record tap timestamps for
    // tempo computation. No-op until Phase 1.5.
    return null;
};

MPX1.program_change = function (channel, program) {
    // PC X selects MPX-1 program X. We translate that to a MAP2
    // snapshot recall via the audio.snapshot.recall engine target,
    // applying the operator-set program offset from the settings.
    var offset = (typeof engine !== 'undefined' && engine.getSetting)
        ? engine.getSetting('mpx1_program_offset') : 0;
    return { snapshot_id: program + (offset || 0) };
};

MPX1.handle_sysex = function (bytes) {
    // T2459-H4 / T2482-P1.5 cutover surface.
    //
    // Inbound bytes is the raw SysEx payload (F0 .. F7 inclusive).
    // The MPX-1 SysEx tag map lives in app/midi/sysex_tags.py
    // (consolidated in T2459-H4); the parser logic lives in
    // app/services/mpx1_syx_parser.py.
    //
    // When the cutover lands, this function will:
    //   1. Validate F0 06 ... F7 framing (Lexicon mfr ID).
    //   2. Dispatch to one of:
    //      - program-dump handler   (function code 0x02)
    //      - panel-status handler   (function code 0x01 01)
    //      - parameter-write handler (function code 0x01 80+)
    //      - bulk-transfer handler  (function code 0x06)
    //   3. Emit shadow-state updates via the engine bridge.
    //
    // Until then this returns null and the Python parser handles
    // every inbound SysEx via app/services/midi_hub/router.py.
    return null;
};

// ---------- Outbound (LED feedback) ----------

MPX1.bypass_feedback = function (engineValue) {
    // engineValue is the new audio.chain.1.bypass boolean.
    // Emit CC 64 with 0/127 to mirror the BYPASS LED on the panel.
    return [
        MPX1.STATUS_CC | 0,        // channel 1 → status nibble | (channel-1)
        64,                        // CC number
        engineValue ? 127 : 0,
    ];
};
