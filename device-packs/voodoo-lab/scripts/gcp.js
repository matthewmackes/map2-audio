// Voodoo Lab Ground Control Pro mapping script
// — controller-host QuickJS module.
//
// Two SysEx surfaces share this script:
//   1) Live front-panel traffic (program changes + small command frames)
//      under the Voodoo Lab mfr ID 00 00 32. Used at run-time.
//   2) Bulk memory dumps (16567-byte v1.13 dumps with Digital Music Corp
//      preamble F0 00 00 07 10 ... F7) — historically a DMC product
//      before Voodoo Lab rebranded; the preamble was preserved for
//      backward compatibility. The bulk-dump container is what
//      app/services/ground_control_pro/sysex_container.py parses.

var GCP = GCP || {};

GCP.STATUS_CC      = 0xB0;
GCP.STATUS_PC      = 0xC0;
GCP.STATUS_SYSEX   = 0xF0;

// Live-traffic mfr ID (Voodoo Lab).
GCP.VOODOOLAB_MFR_ID = [0x00, 0x00, 0x32];

// Bulk-dump preamble (Digital Music Corp legacy + version byte 0x10).
GCP.BULK_DUMP_PREAMBLE = [0xF0, 0x00, 0x00, 0x07, 0x10];
GCP.BULK_DUMP_TERMINATOR = [0xF7];

// Bulk-dump v1.13 layout constants (mirrors ground_control_pro/constants.py).
GCP.SYSEX_NUM_BYTES   = 16567;
GCP.NUM_PRESETS       = 200;
GCP.CONFIG_NUM_BYTES  = 161;
GCP.PRESET_NUM_BYTES  = 82;
GCP.CONFIG_OFFSET     = GCP.BULK_DUMP_PREAMBLE.length;        // 5
GCP.PRESET_OFFSET     = GCP.CONFIG_OFFSET + GCP.CONFIG_NUM_BYTES;  // 166
GCP.TERMINATOR_OFFSET = GCP.PRESET_OFFSET + (GCP.PRESET_NUM_BYTES * GCP.NUM_PRESETS);  // 16566

GCP.program_change = function (channel, program) {
    // GCP sends PC for the active bank (0-7) on channel 1. Combined
    // with active-bank setting (0-31), that's a 256-program library.
    var bank = (typeof engine !== 'undefined' && engine.getSetting)
        ? (engine.getSetting('gcp_active_bank') || 0) : 0;
    return { snapshot_id: bank * 8 + program };
};

// ---------- Bulk-dump container parsing (ported from sysex_container.py) ----------
//
// T2482-P1.5 / iter 37: container parser logic ported from
// app/services/ground_control_pro/sysex_container.py to JS for
// execution inside the controller-host. This is the *layout* parser
// only — the field-level decoding (parser.py, serializer.py,
// validator.py, field_map.py) is a much larger surface and stays in
// Python until the controller-host integration ships (T2482-P1.2).
//
// The container parse splits the 16567-byte dump into:
//   preamble   (5 bytes)
//   config     (161 bytes)
//   preset[0..199]   (82 bytes each)
//   terminator (1 byte)

// Returns true iff the leading bytes match the bulk-dump preamble.
GCP._has_bulk_preamble = function (data) {
    if (data.length < GCP.BULK_DUMP_PREAMBLE.length) return false;
    for (var i = 0; i < GCP.BULK_DUMP_PREAMBLE.length; i++) {
        if (data[i] !== GCP.BULK_DUMP_PREAMBLE[i]) return false;
    }
    return true;
};

// Returns true iff the trailing bytes match the bulk-dump terminator.
GCP._has_bulk_terminator = function (data) {
    if (data.length < GCP.BULK_DUMP_TERMINATOR.length) return false;
    var start = data.length - GCP.BULK_DUMP_TERMINATOR.length;
    for (var i = 0; i < GCP.BULK_DUMP_TERMINATOR.length; i++) {
        if (data[start + i] !== GCP.BULK_DUMP_TERMINATOR[i]) return false;
    }
    return true;
};

// Parse a 16567-byte bulk-dump frame into its container layout.
// Returns { preamble, config_block, preset_blocks: [..], terminator }
// or throws Error(<reason>) on size/preamble/terminator mismatch.
GCP.parse_bulk_dump = function (data) {
    var arr = Array.prototype.slice.call(data);
    if (arr.length !== GCP.SYSEX_NUM_BYTES) {
        throw new Error('Expected ' + GCP.SYSEX_NUM_BYTES + ' bytes, received ' + arr.length);
    }
    if (!GCP._has_bulk_preamble(arr)) {
        throw new Error('Invalid Ground Control Pro preamble');
    }
    if (!GCP._has_bulk_terminator(arr)) {
        throw new Error('Invalid Ground Control Pro terminator');
    }
    var presets = [];
    for (var index = 0; index < GCP.NUM_PRESETS; index++) {
        var begin = GCP.PRESET_OFFSET + (index * GCP.PRESET_NUM_BYTES);
        var end = begin + GCP.PRESET_NUM_BYTES;
        presets.push(arr.slice(begin, end));
    }
    return {
        preamble: arr.slice(0, GCP.CONFIG_OFFSET),
        config_block: arr.slice(GCP.CONFIG_OFFSET, GCP.CONFIG_OFFSET + GCP.CONFIG_NUM_BYTES),
        preset_blocks: presets,
        terminator: arr.slice(GCP.TERMINATOR_OFFSET),
        raw_bytes: arr,
    };
};

// Re-assemble a container into a 16567-byte buffer. Mirrors
// GroundControlSysexContainer.to_bytes for parity.
GCP.serialize_bulk_dump = function (container) {
    var payload = new Array(GCP.SYSEX_NUM_BYTES).fill(0);
    var i;
    for (i = 0; i < container.preamble.length; i++) {
        payload[i] = container.preamble[i];
    }
    for (i = 0; i < container.config_block.length; i++) {
        payload[GCP.CONFIG_OFFSET + i] = container.config_block[i];
    }
    for (var p = 0; p < container.preset_blocks.length; p++) {
        var begin = GCP.PRESET_OFFSET + (p * GCP.PRESET_NUM_BYTES);
        var block = container.preset_blocks[p];
        for (var b = 0; b < block.length; b++) {
            payload[begin + b] = block[b];
        }
    }
    for (i = 0; i < container.terminator.length; i++) {
        payload[GCP.TERMINATOR_OFFSET + i] = container.terminator[i];
    }
    return payload;
};

// ---------- handle_sysex (live dispatch entry point) ----------

GCP.handle_sysex = function (bytes) {
    // Live-traffic dispatch hook called by the controller-host inbound
    // dispatcher.
    //
    // Voodoo Lab live-traffic framing: F0 00 00 32 <product-id> <command>
    //   <args...> F7
    // command 0x10 = memory dump request; 0x11 = memory dump response;
    // 0x12 = preset name string; 0x13 = field-map write.
    //
    // Bulk-dump frames (preamble F0 00 00 07 10) flow through
    // parse_bulk_dump separately — they are not single-CC events.
    if (bytes === null || bytes === undefined) return null;
    var arr = Array.prototype.slice.call(bytes);
    if (arr.length < 7) return null;
    if (arr[1] !== GCP.VOODOOLAB_MFR_ID[0]
        || arr[2] !== GCP.VOODOOLAB_MFR_ID[1]
        || arr[3] !== GCP.VOODOOLAB_MFR_ID[2]) return null;
    var command = arr[5];
    return { command: command, length: arr.length };
};
