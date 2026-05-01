// Ableton Push (Mk1 / Mk2) mapping script — controller-host QuickJS
// module.

var Push = Push || {};

Push.STATUS_NOTE_ON = 0x90;
Push.STATUS_CC      = 0xB0;
Push.STATUS_SYSEX   = 0xF0;
Push.ABLETON_MFR_ID = [0x47, 0x7F, 0x15];

// Push palette — color indices for Note-on velocity in Live mode.
Push.COLOR_OFF      = 0;
Push.COLOR_GREEN    = 122;
Push.COLOR_RED      = 5;
Push.COLOR_AMBER    = 9;
Push.COLOR_BLUE     = 67;

// 8x8 pad grid: row 0 (bottom) = Notes 36..43; row 7 (top) = 92..99.
Push.PAD_BASE_NOTE = 36;

// ---------- Encoder (relative CC) ----------

Push.encoder = function (channel, value) {
    // Push uses 2's complement signed 7-bit relative encoding:
    //   1..63   = clockwise (positive)
    //   65..127 = counter-clockwise (negative, -64..-1 after sign-extend)
    //   0       = no movement (rare)
    var delta = (value < 64) ? value : (value - 128);
    return { delta: delta };
};

// ---------- 8x8 pad grid ----------

Push.pad_press = function (channel, note, velocity) {
    // Decode note → (row, col) in the 8x8 grid.
    var idx = note - Push.PAD_BASE_NOTE;
    if (idx < 0 || idx > 63) return null;
    var row = Math.floor(idx / 8);
    var col = idx % 8;

    // Map (row, col) → snapshot index. Row-major from bottom-left.
    // 64 pads → 64 snapshot slots (rows 0-7 = banks A-H).
    var snapshotId = row * 8 + col;

    // Velocity > 0 = press; velocity == 0 = release (Push uses note-off
    // semantics via velocity-zero note-on).
    if (velocity === 0) return null;
    return { snapshot_id: snapshotId };
};

Push.pad_color = function (engineActiveSnapshotId) {
    // Outbound: highlight the active snapshot pad with green.
    if (engineActiveSnapshotId === null || engineActiveSnapshotId === undefined) {
        return null;
    }
    if (engineActiveSnapshotId < 0 || engineActiveSnapshotId > 63) return null;
    return [
        Push.STATUS_NOTE_ON,
        Push.PAD_BASE_NOTE + engineActiveSnapshotId,
        Push.COLOR_GREEN,
    ];
};

// ---------- Mode buttons ----------

Push.session_mode = function (channel, value) {
    if (value === 0) return null;
    return { mode: 'session' };
};

Push.note_mode = function (channel, value) {
    if (value === 0) return null;
    return { mode: 'note' };
};

Push.user_mode = function (channel, value) {
    if (value === 0) return null;
    return { mode: 'user' };
};

// ---------- SysEx (display + palette) ----------

Push.handle_sysex = function (bytes) {
    // Ableton SysEx framing: F0 47 7F 15 <command> <args...> F7
    // command 0x18 = display LCD line write; 0x04 = color palette
    // update; etc. This stub identifies the command and dispatches
    // to per-command handlers (none implemented yet).
    if (bytes.length < 6) return null;
    if (bytes[1] !== 0x47 || bytes[2] !== 0x7F || bytes[3] !== 0x15) return null;
    var command = bytes[4];
    return { command: command, length: bytes.length };
};
