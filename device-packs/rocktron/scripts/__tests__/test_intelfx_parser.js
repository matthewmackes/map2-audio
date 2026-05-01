// T2482-P1.5 / iter 36: tests for IntelFX SysEx parser ported to JS.
//
// Mirrors the Python coverage in tests/test_intelfx_syx_parser.py
// (where applicable) for the pure parsing logic. Tagging + audition
// pipelines stay in Python; the JS port is just the parser.

'use strict';

const path = require('path');
const { loadPack, assert, run, summary } = require('../../../_tests/js_harness');

const ctx = loadPack(path.join(__dirname, '..', 'intelfx.js'));
const I = ctx.IntelFX;

// ---------- Helpers ----------

// Build a minimal valid Rocktron program-dump frame:
//   F0 00 01 56 <dev=0> <msg=03> <hi> <lo> <name_16> <param_pad> <checksum> F7
function buildFrame(progNum, name, opts) {
    opts = opts || {};
    var dev = opts.device_id !== undefined ? opts.device_id : 0x00;
    var hi = (progNum >> 7) & 0x7F;
    var lo = progNum & 0x7F;
    var nameBytes = [];
    for (var i = 0; i < 16; i++) {
        nameBytes.push(i < name.length ? name.charCodeAt(i) : 0x20);
    }
    var paramPad = new Array(opts.param_pad_len || 8).fill(0x20);
    var head = [0xF0, 0x00, 0x01, 0x56, dev, 0x03, hi, lo].concat(nameBytes).concat(paramPad);
    // Compute XOR checksum over data bytes (everything after F0, excluding checksum + F7).
    var checksum = 0;
    for (var j = 1; j < head.length; j++) checksum ^= head[j];
    checksum &= 0x7F;
    return head.concat([checksum, 0xF7]);
}

// ---------- Constants ----------

run('parser constants match Python defaults', () => {
    assert.deepEqual(I.ROCKTRON_MFR_ID, [0x00, 0x01, 0x56], 'Rocktron 3-byte mfr ID');
    assert.equal(I.MIN_PROGRAM_DUMP_SIZE, 28, 'min frame size');
    assert.equal(I.HEADER_SIZE, 8, 'header size');
    assert.equal(I.NAME_LENGTH, 16, 'name length');
    assert.equal(I.MAX_PROGRAM_NUMBER, 255, 'max program number');
});

// ---------- split_frames ----------

run('split_frames splits two adjacent F0..F7 frames', () => {
    const f1 = buildFrame(1, 'First');
    const f2 = buildFrame(2, 'Second');
    const data = f1.concat(f2);
    const frames = I.split_frames(data);
    assert.equal(frames.length, 2, 'frame count');
    assert.equal(frames[0][0], 0xF0, 'first frame F0');
    assert.equal(frames[0][frames[0].length - 1], 0xF7, 'first frame F7');
    assert.equal(frames[1][3], 0x56, 'second frame mfr ID byte');
});

run('split_frames drops frames smaller than MIN_PROGRAM_DUMP_SIZE', () => {
    // 5-byte frame — well below 28-byte minimum.
    const tiny = [0xF0, 0x00, 0x01, 0x56, 0xF7];
    const frames = I.split_frames(tiny);
    assert.equal(frames.length, 0, 'tiny frame dropped');
});

run('split_frames ignores junk between frames', () => {
    const junk = [0x12, 0x34, 0x56];
    const frame = buildFrame(7, 'JunkSurround');
    const data = junk.concat(frame).concat(junk);
    const frames = I.split_frames(data);
    assert.equal(frames.length, 1, 'junk ignored');
});

run('split_frames handles unterminated F0 (no F7) by dropping', () => {
    // F0 starts, no F7 ever — should return [].
    const data = [0xF0, 0x00, 0x01, 0x56].concat(new Array(40).fill(0x20));
    const frames = I.split_frames(data);
    assert.equal(frames.length, 0, 'no F7 → no frame');
});

// ---------- is_rocktron_frame ----------

run('is_rocktron_frame returns true for valid Rocktron frame', () => {
    const f = [0xF0, 0x00, 0x01, 0x56, 0x00, 0x03, 0x00, 0x01, 0xF7];
    assert.equal(I.is_rocktron_frame(f), true);
});

run('is_rocktron_frame returns false for non-Rocktron mfr ID', () => {
    // Single-byte Yamaha ID 0x43 — not Rocktron's 00 01 56.
    const f = [0xF0, 0x43, 0x00, 0x00, 0x00, 0x03, 0x00, 0x01, 0xF7];
    assert.equal(I.is_rocktron_frame(f), false);
});

run('is_rocktron_frame returns false for partial 3-byte ID', () => {
    // Has 00 01 but wrong third byte.
    const f = [0xF0, 0x00, 0x01, 0x55, 0x00, 0x03, 0x00, 0x01, 0xF7];
    assert.equal(I.is_rocktron_frame(f), false);
});

run('is_rocktron_frame returns false for too-short frame', () => {
    assert.equal(I.is_rocktron_frame([0xF0, 0x00, 0x01]), false);
});

// ---------- extract_name ----------

run('extract_name reads 16-char name at canonical offset 8', () => {
    const frame = buildFrame(0, 'PluckedString12');  // 15 chars + 1 pad
    const name = I.extract_name(frame);
    assert.equal(name, 'PluckedString12');
});

run('extract_name strips trailing nulls and spaces', () => {
    // Build a frame manually with mixed null + space padding.
    const head = [0xF0, 0x00, 0x01, 0x56, 0x00, 0x03, 0x00, 0x05];
    const nameBytes = 'Hall '.split('').map(c => c.charCodeAt(0))
        .concat(new Array(11).fill(0x00));  // total 16
    const paramPad = new Array(8).fill(0x20);
    const frame = head.concat(nameBytes).concat(paramPad).concat([0x00, 0xF7]);
    assert.equal(I.extract_name(frame), 'Hall');
});

run('extract_name returns null when no offset has valid ASCII', () => {
    // Build a frame where every byte in the name slot is non-printable.
    const head = [0xF0, 0x00, 0x01, 0x56, 0x00, 0x03, 0x00, 0x00];
    const garbage = new Array(16).fill(0x01);  // 0x01 is non-printable
    const tailPad = new Array(8).fill(0x01);
    // NB: also make the fallback offsets HEADER_SIZE-1, +1, +2 fail by
    // keeping the surrounding bytes non-printable. The header bytes
    // (msg=03, hi=00, lo=00) at offsets 5/6/7 are non-printable, and
    // the tail-pad is 0x01 too — so offset 9, 10 also have 0x01.
    const frame = head.concat(garbage).concat(tailPad).concat([0x00, 0xF7]);
    assert.isNull(I.extract_name(frame));
});

// ---------- extract_program_number ----------

run('extract_program_number reads two-byte program number', () => {
    // 200 = 0xC8 = (1 << 7) | 0x48
    const frame = buildFrame(200, 'TwoBytePN');
    assert.equal(I.extract_program_number(frame, 99), 200);
});

run('extract_program_number reads low-byte-only program number', () => {
    const frame = buildFrame(7, 'SingleByte');
    assert.equal(I.extract_program_number(frame, 99), 7);
});

run('extract_program_number falls back on too-short frame', () => {
    assert.equal(I.extract_program_number([0xF0, 0x00, 0x01, 0x56], 42), 42);
});

run('extract_program_number reads program 255 (max)', () => {
    const frame = buildFrame(255, 'MaxProg');
    assert.equal(I.extract_program_number(frame, 0), 255);
});

// ---------- verify_checksum ----------

run('verify_checksum returns true for correctly-checksummed frame', () => {
    const frame = buildFrame(5, 'GoodChecksum');
    assert.equal(I.verify_checksum(frame), true);
});

run('verify_checksum returns false for tampered frame', () => {
    const frame = buildFrame(5, 'BadChecksum');
    // Flip a name byte but leave the checksum stale.
    frame[10] ^= 0x01;
    assert.equal(I.verify_checksum(frame), false);
});

run('verify_checksum returns false for too-short frame', () => {
    assert.equal(I.verify_checksum([0xF0, 0x00, 0x01, 0xF7]), false);
});

// ---------- parse_bytes (full pipeline) ----------

run('parse_bytes returns programs with names + numbers', () => {
    const frame = buildFrame(42, 'Reverb');
    const programs = I.parse_bytes(frame);
    assert.equal(programs.length, 1);
    assert.equal(programs[0].name, 'Reverb');
    assert.equal(programs[0].program_number, 42);
});

run('parse_bytes parses multiple Rocktron frames', () => {
    const f1 = buildFrame(1, 'First');
    const f2 = buildFrame(2, 'Second');
    const data = f1.concat(f2);
    const programs = I.parse_bytes(data);
    assert.equal(programs.length, 2);
    assert.equal(programs[0].name, 'First');
    assert.equal(programs[1].name, 'Second');
    assert.equal(programs[0].program_number, 1);
    assert.equal(programs[1].program_number, 2);
});

run('parse_bytes synthesizes "Program NNN" name when extraction fails', () => {
    // Build a valid Rocktron frame with non-ASCII bytes throughout the
    // name region (and the fallback offsets).
    const head = [0xF0, 0x00, 0x01, 0x56, 0x00, 0x03, 0x00, 0x00];
    const garbage = new Array(20).fill(0x01);
    const frame = head.concat(garbage).concat([0x00, 0xF7]);
    const programs = I.parse_bytes(frame);
    assert.equal(programs.length, 1);
    assert.equal(programs[0].name, 'Program 000');
});

run('parse_bytes ignores non-Rocktron frames in the stream', () => {
    const rocktron = buildFrame(1, 'ValidRkt');
    const yamaha = [0xF0, 0x43, 0x00, 0x00].concat(new Array(28).fill(0x20)).concat([0xF7]);
    const data = yamaha.concat(rocktron);
    const programs = I.parse_bytes(data);
    assert.equal(programs.length, 1);
    assert.equal(programs[0].name, 'ValidRkt');
});

// ---------- handle_sysex (live dispatch) ----------

run('handle_sysex returns null on too-small frame', () => {
    assert.isNull(I.handle_sysex([0xF0, 0x00, 0x01, 0x56, 0xF7]));
});

run('handle_sysex returns null on non-Rocktron frame', () => {
    const yamaha = [0xF0, 0x43].concat(new Array(28).fill(0x20)).concat([0xF7]);
    assert.isNull(I.handle_sysex(yamaha));
});

run('handle_sysex returns parsed program for valid Rocktron frame', () => {
    const frame = buildFrame(9, 'Lead Tone');
    const result = I.handle_sysex(frame);
    assert.isNotNull(result);
    assert.equal(result.kind, 'program');
    assert.equal(result.program.name, 'Lead Tone');
    assert.equal(result.program.program_number, 9);
});

run('handle_sysex tolerates null/undefined input', () => {
    assert.isNull(I.handle_sysex(null));
    assert.isNull(I.handle_sysex(undefined));
});

summary();
