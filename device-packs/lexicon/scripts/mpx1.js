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

// ---------- SysEx parsing (ported from mpx1_syx_parser.py) ----------
//
// T2482-P1.5 / iter 35: parser logic ported from
// app/services/mpx1_syx_parser.py to JS for execution inside the
// controller-host. The Python parser remains active until the
// controller-host integration ships (T2482-P1.2); these functions
// are exercised today via the device-pack JS test harness, and
// will become live once the dispatcher routes inbound SysEx through
// JS instead of Python.

// Minimum size for a valid program dump (incl F0 and F7).
MPX1.MIN_PROGRAM_DUMP_SIZE = 20;
// Standard 12-char ASCII program name length.
MPX1.NAME_LENGTH = 12;
// Common name offsets from start of payload (after the 4-byte SysEx
// header). MPX-1 dumps put the name at offset 2 most commonly; some
// variants use 0 or 1.
MPX1.NAME_OFFSETS = [2, 0, 1];

// Split raw bytes into individual SysEx frames (F0 ... F7 each).
// Returns an array of arrays; frames smaller than MIN_PROGRAM_DUMP_SIZE
// are dropped.
MPX1.split_frames = function (data) {
    var frames = [];
    var start = -1;
    for (var i = 0; i < data.length; i++) {
        var b = data[i];
        if (b === 0xF0) {
            start = i;
        } else if (b === 0xF7 && start !== -1) {
            var frame = data.slice(start, i + 1);
            if (frame.length >= MPX1.MIN_PROGRAM_DUMP_SIZE) {
                frames.push(frame);
            }
            start = -1;
        }
    }
    return frames;
};

// True iff `frame` carries the Lexicon manufacturer ID (single-byte
// 0x06 immediately after F0).
MPX1.is_lexicon_frame = function (frame) {
    return frame.length >= 4 && frame[0] === 0xF0 && frame[1] === MPX1.LEXICON_MFR_ID;
};

// Try to extract a 12-char ASCII program name at the given offset
// inside the payload. Returns the trimmed name or null if invalid.
MPX1._try_name_at = function (payload, offset) {
    if (offset + MPX1.NAME_LENGTH > payload.length) return null;
    var raw = payload.slice(offset, offset + MPX1.NAME_LENGTH);
    for (var i = 0; i < raw.length; i++) {
        var b = raw[i];
        // All bytes must be printable ASCII (0x20-0x7E) or null padding.
        if (b !== 0x00 && (b < 0x20 || b > 0x7E)) return null;
    }
    // Build the string, strip trailing nulls + spaces.
    var s = '';
    for (var j = 0; j < raw.length; j++) {
        if (raw[j] === 0x00) break;
        s += String.fromCharCode(raw[j]);
    }
    s = s.replace(/[\x00 ]+$/, '');
    return s.length > 0 ? s : null;
};

// Extract a printable program name from the frame, trying each known
// offset. Returns null if no candidate validates.
MPX1.extract_name = function (frame) {
    // Strip F0 + 4 header bytes off the front and F7 off the end.
    var payload = frame.slice(4, frame.length - 1);
    for (var i = 0; i < MPX1.NAME_OFFSETS.length; i++) {
        var name = MPX1._try_name_at(payload, MPX1.NAME_OFFSETS[i]);
        if (name !== null) return name;
    }
    return null;
};

// Extract the program slot number from frame[3] when in valid range
// (0..249). Falls back to `fallback_index` otherwise.
MPX1.extract_program_number = function (frame, fallback_index) {
    if (frame.length >= 5) {
        var candidate = frame[3] & 0xFF;
        if (candidate >= 0 && candidate <= 249) return candidate;
    }
    return fallback_index;
};

// Parse raw bytes (Array<number>) into a list of program objects:
//   [{name: string, program_number: number, raw_bytes: number[]}]
// Returns [] when no valid Lexicon frames are found.
MPX1.parse_bytes = function (data) {
    var frames = MPX1.split_frames(data);
    var programs = [];
    for (var i = 0; i < frames.length; i++) {
        var frame = frames[i];
        if (!MPX1.is_lexicon_frame(frame)) continue;
        var name = MPX1.extract_name(frame) || ('Program ' + ('000' + i).slice(-3));
        var prog_num = MPX1.extract_program_number(frame, i);
        programs.push({
            name: name,
            program_number: prog_num,
            raw_bytes: frame,
        });
    }
    return programs;
};

// ---------- handle_sysex (live dispatch entry point) ----------

MPX1.handle_sysex = function (bytes) {
    // Live dispatch hook called by the controller-host inbound
    // dispatcher. Routes every Lexicon-mfr-ID SysEx through the
    // ported parser logic.
    //
    // Returns:
    //   { kind: 'program', program: <parsed program object> }
    //     when the bytes parse as a single Lexicon program dump
    //   null
    //     when the bytes are not a valid Lexicon frame OR there's no
    //     interpretable program (caller falls back to the Python parser
    //     for legacy formats not covered here)
    if (bytes === null || bytes === undefined) return null;
    var arr = Array.prototype.slice.call(bytes);
    if (arr.length < MPX1.MIN_PROGRAM_DUMP_SIZE) return null;
    if (!MPX1.is_lexicon_frame(arr)) return null;
    var programs = MPX1.parse_bytes(arr);
    if (programs.length === 0) return null;
    // Single-frame inbound SysEx returns the first (and only) program.
    return { kind: 'program', program: programs[0] };
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
