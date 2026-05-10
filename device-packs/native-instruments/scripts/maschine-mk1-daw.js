// T2503 Set 6 — Maschine MK1 DAW-mode mapping script.
//
// Companion to profiles/maschine-mk1-daw.midi.yaml.
//
// State held in script:
//   active_track_id     → group A..H selects which track receives subsequent
//                         pad triggers and group-encoder edits.
//   pad_clip_offset     → pad 1..16 = clip slots [offset, offset+15];
//                         scroll button steps the offset by 16.
//   clip_default_length → samples per pad-launched clip; defaults to one
//                         bar at 120 BPM @ 48 kHz = 96000 samples.
//   selected_param      → per-track (slot_index, param_id) for encoder.

var MaschineMK1_DAW = MaschineMK1_DAW || {};

MaschineMK1_DAW.active_track_id = 0;
MaschineMK1_DAW.pad_clip_offset = 0;
MaschineMK1_DAW.clip_default_length = 96000;        // 1 bar @ 120bpm/48kHz
MaschineMK1_DAW.selected_params = {};

// Mapping pad MIDI note → pad index 0..15 (notes 36..51).
function _pad_index_from_note(midino) {
    return midino - 36;
}

// ---------- 4×4 pads → daw.clip.add ----------

MaschineMK1_DAW.pad = function (channel, value, midino) {
    if (value === 0) return null;                    // ignore note-off
    var padIndex = _pad_index_from_note(midino);
    var clipSlot = MaschineMK1_DAW.pad_clip_offset + padIndex;
    var startSamples = clipSlot * MaschineMK1_DAW.clip_default_length;
    var source = 'audio/pad-' + (padIndex + 1) + '.wav';
    return {
        verb: 'daw.clip.add',
        args: [
            MaschineMK1_DAW.active_track_id,
            startSamples,
            MaschineMK1_DAW.clip_default_length,
            source,
        ],
    };
};

// ---------- Group encoders → plugin param scrub ----------

MaschineMK1_DAW.encoder_param = function (channel, value, midino) {
    var stripIndex = midino - 7;                     // 0..7
    var trackId = stripIndex;                        // simple mapping; no banking yet
    var sel = MaschineMK1_DAW.selected_params[trackId] || { slot: 0, param: 'gain' };
    // MK1 encoders use signed 7-bit deltas (0x01..0x3F = +1..+63;
    // 0x41..0x7F = -1..-63 in two's complement).
    var delta = (value > 64) ? (value - 128) : value;
    var normalized = delta * 0.005;                  // 0.5% per detent
    return {
        verb: 'daw.plugin.set_param',
        args: [trackId, sel.slot, sel.param, normalized],
    };
};

// ---------- MASTER encoder → transport scrub ----------

MaschineMK1_DAW.master_encoder = function (channel, value) {
    var delta = (value > 64) ? (value - 128) : value;
    var samples = delta * 4800;                      // 100ms per detent @ 48k
    return {
        verb: 'daw.transport.set_position',
        value: samples,
        args: [],
    };
};

// ---------- RESTART button → set position 0 ----------

MaschineMK1_DAW.restart = function (channel, value) {
    if (value === 0) return null;
    return {
        verb: 'daw.transport.set_position',
        value: 0,
        args: [],
    };
};

// ---------- Group button → select active track ----------

MaschineMK1_DAW.select_track = function (channel, value, midino) {
    if (value === 0) return null;
    MaschineMK1_DAW.active_track_id = midino - 112;  // GROUP A = note 112 = track 0
    return {
        // Selection state is host-side only; emit a synthetic frame so the
        // host's bookkeeping (and any UI mirror) sees the change.
        verb: 'daw.track.select',
        value: MaschineMK1_DAW.active_track_id,
        args: [],
    };
};
