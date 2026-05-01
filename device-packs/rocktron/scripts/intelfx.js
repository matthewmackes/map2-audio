// Rocktron IntelFX (IntelliFex / IntelliFex Online) mapping script
// — controller-host QuickJS module.
//
// Mirrors the Lexicon MPX-1 pack's structure (same shape: front-panel
// CC/PC handlers + a SysEx cutover stub). The two devices share the
// same operator-facing concept (rack effects unit with footswitch
// expression) so the JS surface intentionally mirrors MPX-1.

var IntelFX = IntelFX || {};

IntelFX.STATUS_NOTE_OFF       = 0x80;
IntelFX.STATUS_NOTE_ON        = 0x90;
IntelFX.STATUS_CC             = 0xB0;
IntelFX.STATUS_PC             = 0xC0;
IntelFX.STATUS_SYSEX          = 0xF0;

// Rocktron uses a 3-byte manufacturer ID (extended-format SysEx).
// First byte is 0x00 which signals 3-byte ID; bytes 2+3 are 0x01 0x56.
IntelFX.ROCKTRON_MFR_ID = [0x00, 0x01, 0x56];

// ---------- Front-panel handlers ----------

IntelFX.bypass_toggle = function (channel, value) {
    return null;  // dispatcher handles latch + LED echo via outputs[]
};

IntelFX.tap_tempo = function (channel, value) {
    return null;
};

IntelFX.program_change = function (channel, program) {
    var offset = (typeof engine !== 'undefined' && engine.getSetting)
        ? engine.getSetting('intelfx_program_offset') : 0;
    return { snapshot_id: program + (offset || 0) };
};

IntelFX.handle_sysex = function (bytes) {
    // T2459-H4 / T2482-P1.5 cutover surface.
    //
    // When the cutover lands, this function will:
    //   1. Validate F0 00 01 56 ... F7 framing (Rocktron 3-byte mfr ID).
    //   2. Dispatch by function code per the IntelFex MIDI implementation.
    //   3. Emit shadow-state updates via the engine bridge.
    //
    // Until then this returns null and the Python parser at
    // app/services/intelfx_syx_parser.py handles every inbound SysEx
    // via app/services/midi_hub/router.py.
    return null;
};

// ---------- Outbound (LED feedback) ----------

IntelFX.bypass_feedback = function (engineValue) {
    return [
        IntelFX.STATUS_CC | 0,
        64,
        engineValue ? 127 : 0,
    ];
};
