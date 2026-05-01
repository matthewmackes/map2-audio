// Rocktron IntelFX (IntelliFex / IntelliFex Online) mapping script
// — controller-host QuickJS module.
//
// Mirrors the Lexicon MPX-1 pack's structure (same shape: front-panel
// CC/PC handlers + a SysEx parser ported from Python). The two devices
// share the same operator-facing concept (rack effects unit with
// footswitch expression) so the JS surface intentionally mirrors MPX-1.

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

// ---------- SysEx parsing (ported from intelfx_syx_parser.py) ----------
//
// T2482-P1.5 / iter 36: parser logic ported from
// app/services/intelfx_syx_parser.py to JS for execution inside the
// controller-host. The Python parser remains active until the
// controller-host integration ships (T2482-P1.2); these functions
// are exercised today via the device-pack JS test harness, and
// will become live once the dispatcher routes inbound SysEx through
// JS instead of Python.
//
// IntelFX program-dump frame layout:
//   F0 00 01 56 <device_id> 03 <prog_hi> <prog_lo> <name_16> <param_data> <checksum> F7
//   ^^ ^^^^^^^^^ ^^^^^^^^^^ ^^ ^^^^^^^^^^^^^^^^^^^ ^^^^^^^^^ ^^^^^^^^^^^ ^^^^^^^^^^
//   |  3-byte    device ID  |  program number      ASCII     algorithm   XOR of all
//   F0 mfr ID   (00-7F)    msg (prog_hi << 7 |    name      params      data bytes
//                          type prog_lo)                                 (7-bit)

// Heuristic minimum program-dump size (incl F0/F7).
IntelFX.MIN_PROGRAM_DUMP_SIZE = 28;
// Bytes before name starts: F0 + 3-byte mfr + dev + msg + prog_hi + prog_lo = 8.
IntelFX.HEADER_SIZE = 8;
// Program-name length in ASCII bytes.
IntelFX.NAME_LENGTH = 16;
// Program-number range.
IntelFX.MAX_PROGRAM_NUMBER = 255;

// Split raw bytes into individual SysEx frames (F0 ... F7 each).
// Frames smaller than MIN_PROGRAM_DUMP_SIZE are dropped (mirrors the
// Python parser's heuristic).
IntelFX.split_frames = function (data) {
    var frames = [];
    var start = -1;
    for (var i = 0; i < data.length; i++) {
        var b = data[i];
        if (b === 0xF0) {
            start = i;
        } else if (b === 0xF7 && start !== -1) {
            var frame = data.slice(start, i + 1);
            if (frame.length >= IntelFX.MIN_PROGRAM_DUMP_SIZE) {
                frames.push(frame);
            }
            start = -1;
        }
    }
    return frames;
};

// True iff `frame` carries the Rocktron 3-byte manufacturer ID
// (F0 00 01 56 ...).
IntelFX.is_rocktron_frame = function (frame) {
    if (frame.length < 6) return false;
    return frame[0] === 0xF0
        && frame[1] === IntelFX.ROCKTRON_MFR_ID[0]
        && frame[2] === IntelFX.ROCKTRON_MFR_ID[1]
        && frame[3] === IntelFX.ROCKTRON_MFR_ID[2];
};

// Try to extract a 16-char ASCII program name at the given absolute
// frame offset. Returns the trimmed name or null if invalid.
IntelFX._try_name_at_frame_offset = function (frame, offset) {
    // Need NAME_LENGTH bytes plus room for the F7 footer.
    if (offset + IntelFX.NAME_LENGTH > frame.length - 1) return null;
    var raw = frame.slice(offset, offset + IntelFX.NAME_LENGTH);
    for (var i = 0; i < raw.length; i++) {
        var b = raw[i];
        // All bytes must be printable ASCII (0x20-0x7E) or null padding.
        if (b !== 0x00 && (b < 0x20 || b > 0x7E)) return null;
    }
    var s = '';
    for (var j = 0; j < raw.length; j++) {
        if (raw[j] === 0x00) break;
        s += String.fromCharCode(raw[j]);
    }
    s = s.replace(/[\x00 ]+$/, '');
    return s.length > 0 ? s : null;
};

// Extract a printable program name from the frame, trying the canonical
// header offset first, then a few adjacent offsets to tolerate variant
// firmware. Returns null if no candidate validates.
IntelFX.extract_name = function (frame) {
    var primary = IntelFX._try_name_at_frame_offset(frame, IntelFX.HEADER_SIZE);
    if (primary !== null) return primary;
    var fallbacks = [IntelFX.HEADER_SIZE - 1, IntelFX.HEADER_SIZE + 1, IntelFX.HEADER_SIZE + 2];
    for (var i = 0; i < fallbacks.length; i++) {
        var candidate = IntelFX._try_name_at_frame_offset(frame, fallbacks[i]);
        if (candidate !== null) return candidate;
    }
    return null;
};

// Extract the program number from the frame header. The IntelFX program
// dump encodes it across two 7-bit bytes:
//   frame[6] = prog_hi (high 7 bits)
//   frame[7] = prog_lo (low 7 bits)
// Combined: (prog_hi << 7) | prog_lo gives 0..255.
// Falls back to `fallback_index` when out of range or frame too short.
IntelFX.extract_program_number = function (frame, fallback_index) {
    if (frame.length >= IntelFX.HEADER_SIZE + 1) {
        var prog_hi = frame[6] & 0x7F;
        var prog_lo = frame[7] & 0x7F;
        var candidate = (prog_hi << 7) | prog_lo;
        if (candidate >= 0 && candidate <= IntelFX.MAX_PROGRAM_NUMBER) {
            return candidate;
        }
    }
    return fallback_index;
};

// Verify the XOR checksum of a Rocktron SysEx frame. The checksum byte
// (second-to-last, before F7) should equal the XOR of all bytes between
// F0 (exclusive) and the checksum byte (exclusive), masked to 7 bits.
IntelFX.verify_checksum = function (frame) {
    if (frame.length < 6) return false;
    var checksum_byte = frame[frame.length - 2];
    var computed = 0;
    // data_bytes = frame[1 .. -2], i.e. exclude F0 (index 0) and the
    // checksum + F7 at the tail.
    for (var i = 1; i < frame.length - 2; i++) {
        computed ^= frame[i];
    }
    computed &= 0x7F;
    return computed === checksum_byte;
};

// Parse raw bytes (Array<number>) into a list of program objects:
//   [{name: string, program_number: number, raw_bytes: number[]}]
// Returns [] when no valid Rocktron frames are found.
IntelFX.parse_bytes = function (data) {
    var frames = IntelFX.split_frames(data);
    var programs = [];
    for (var i = 0; i < frames.length; i++) {
        var frame = frames[i];
        if (!IntelFX.is_rocktron_frame(frame)) continue;
        var name = IntelFX.extract_name(frame) || ('Program ' + ('000' + i).slice(-3));
        var prog_num = IntelFX.extract_program_number(frame, i);
        programs.push({
            name: name,
            program_number: prog_num,
            raw_bytes: frame,
        });
    }
    return programs;
};

// ---------- handle_sysex (live dispatch entry point) ----------

IntelFX.handle_sysex = function (bytes) {
    // Live dispatch hook called by the controller-host inbound
    // dispatcher. Routes every Rocktron-mfr-ID SysEx through the
    // ported parser logic.
    //
    // Returns:
    //   { kind: 'program', program: <parsed program object> }
    //     when the bytes parse as a single Rocktron program dump
    //   null
    //     when the bytes are not a valid Rocktron frame OR there's no
    //     interpretable program (caller falls back to the Python parser
    //     for legacy formats not covered here)
    if (bytes === null || bytes === undefined) return null;
    var arr = Array.prototype.slice.call(bytes);
    if (arr.length < IntelFX.MIN_PROGRAM_DUMP_SIZE) return null;
    if (!IntelFX.is_rocktron_frame(arr)) return null;
    var programs = IntelFX.parse_bytes(arr);
    if (programs.length === 0) return null;
    return { kind: 'program', program: programs[0] };
};

// ---------- Outbound (LED feedback) ----------

IntelFX.bypass_feedback = function (engineValue) {
    return [
        IntelFX.STATUS_CC | 0,
        64,
        engineValue ? 127 : 0,
    ];
};
