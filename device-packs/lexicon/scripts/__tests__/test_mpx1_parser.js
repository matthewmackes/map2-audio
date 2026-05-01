// T2482-P1.5 / iter 35: tests for MPX-1 SysEx parser ported to JS.
//
// Mirrors the Python coverage in tests/test_mpx1_syx_parser.py (where
// applicable) for the pure parsing logic. Engine-bridge concerns +
// Python-specific validation (audition mode, library import pipeline)
// stay in Python; the JS port is just the parser.

'use strict';

const path = require('path');
const { loadPack, assert, run, summary } = require('../../../_tests/js_harness');

const ctx = loadPack(path.join(__dirname, '..', 'mpx1.js'));
const M = ctx.MPX1;

// ---------- Constants ----------

run('parser constants match Python defaults', () => {
    assert.equal(M.LEXICON_MFR_ID, 0x06, 'Lexicon mfr ID');
    assert.equal(M.MIN_PROGRAM_DUMP_SIZE, 20, 'min frame size');
    assert.equal(M.NAME_LENGTH, 12, 'name length');
    assert.deepEqual(M.NAME_OFFSETS, [2, 0, 1], 'name offset candidates');
});

// ---------- split_frames ----------

run('split_frames splits two adjacent F0..F7 frames', () => {
    // Build two minimal-size frames back-to-back.
    const f1 = [0xF0, 0x06, 0x00, 0x00].concat(new Array(15).fill(0x20)).concat([0xF7]); // 20 bytes
    const f2 = [0xF0, 0x06, 0x01, 0x01].concat(new Array(15).fill(0x21)).concat([0xF7]);
    const data = f1.concat(f2);
    const frames = M.split_frames(data);
    assert.equal(frames.length, 2, 'frame count');
    assert.equal(frames[0][0], 0xF0, 'first frame starts F0');
    assert.equal(frames[0][frames[0].length - 1], 0xF7, 'first frame ends F7');
    assert.equal(frames[1][2], 0x01, 'second frame mfr-data byte');
});

run('split_frames drops frames smaller than MIN_PROGRAM_DUMP_SIZE', () => {
    // Tiny frame (5 bytes) — should be filtered out.
    const tiny = [0xF0, 0x06, 0x00, 0x00, 0xF7];
    const frames = M.split_frames(tiny);
    assert.equal(frames.length, 0, 'tiny frame dropped');
});

run('split_frames ignores junk between frames', () => {
    const junk = [0x12, 0x34, 0x56];
    const frame = [0xF0, 0x06, 0x00, 0x00].concat(new Array(15).fill(0x20)).concat([0xF7]);
    const data = junk.concat(frame).concat(junk);
    const frames = M.split_frames(data);
    assert.equal(frames.length, 1, 'junk ignored');
});

run('split_frames handles unterminated F0 (no F7) by dropping', () => {
    // F0 starts, no F7 ever — should return [].
    const data = [0xF0, 0x06].concat(new Array(50).fill(0x20));
    const frames = M.split_frames(data);
    assert.equal(frames.length, 0, 'no F7 → no frame');
});

// ---------- is_lexicon_frame ----------

run('is_lexicon_frame returns true for Lexicon frame', () => {
    const f = [0xF0, 0x06, 0x02, 0x00, 0x20, 0xF7];
    assert.equal(M.is_lexicon_frame(f), true);
});

run('is_lexicon_frame returns false for non-Lexicon mfr ID', () => {
    const f = [0xF0, 0x07, 0x02, 0x00, 0x20, 0xF7]; // Yamaha mfr ID 0x07
    assert.equal(M.is_lexicon_frame(f), false);
});

run('is_lexicon_frame returns false for too-short frame', () => {
    assert.equal(M.is_lexicon_frame([0xF0, 0x06]), false);
});

// ---------- extract_name ----------

run('extract_name finds name at offset 2 (canonical position)', () => {
    // Frame layout:
    //   F0 06 ?? ??              (4-byte header)
    //   .. .. <12 ASCII bytes>   (name at payload offset 2)
    //   .. F7                    (footer)
    const headerOffset = [0x40, 0x41]; // 2 bytes before the name in payload
    const nameBytes = 'TestProgram1'.split('').map(c => c.charCodeAt(0));
    const padding = new Array(20).fill(0x20);
    const frame = [0xF0, 0x06, 0x00, 0x00].concat(headerOffset).concat(nameBytes).concat(padding).concat([0xF7]);
    const name = M.extract_name(frame);
    assert.equal(name, 'TestProgram1', 'name at offset 2');
});

run('extract_name returns null when no offset has valid ASCII', () => {
    // All non-printable bytes in the payload.
    const frame = [0xF0, 0x06, 0x00, 0x00].concat(new Array(40).fill(0x01)).concat([0xF7]);
    const name = M.extract_name(frame);
    assert.isNull(name);
});

run('extract_name strips trailing nulls and spaces', () => {
    // Name "Hall  " (Hall + 2 spaces + 6 nulls) — the helper trims both.
    const headerPad = [0x40, 0x41];
    const nameBytes = 'Hall  '.split('').map(c => c.charCodeAt(0)).concat(new Array(6).fill(0x00));
    const frame = [0xF0, 0x06, 0x00, 0x00].concat(headerPad).concat(nameBytes).concat(new Array(15).fill(0x20)).concat([0xF7]);
    const name = M.extract_name(frame);
    assert.equal(name, 'Hall', 'trimmed');
});

// ---------- extract_program_number ----------

run('extract_program_number reads frame[3] when in range', () => {
    const frame = [0xF0, 0x06, 0x00, 0x42, 0x20, 0x21, 0xF7];
    assert.equal(M.extract_program_number(frame, 99), 0x42);
});

run('extract_program_number falls back when frame[3] > 249', () => {
    const frame = [0xF0, 0x06, 0x00, 0xFA, 0x20, 0x21, 0xF7]; // 0xFA = 250
    assert.equal(M.extract_program_number(frame, 99), 99);
});

run('extract_program_number falls back on too-short frame', () => {
    assert.equal(M.extract_program_number([0xF0, 0x06], 7), 7);
});

// ---------- parse_bytes (full pipeline) ----------

run('parse_bytes returns programs with names + numbers', () => {
    const headerPad = [0x40, 0x41];
    const nameBytes = 'Reverb1     '.split('').map(c => c.charCodeAt(0));
    const frame = [0xF0, 0x06, 0x00, 0x05].concat(headerPad).concat(nameBytes).concat(new Array(10).fill(0x20)).concat([0xF7]);
    const programs = M.parse_bytes(frame);
    assert.equal(programs.length, 1);
    assert.equal(programs[0].name, 'Reverb1');
    assert.equal(programs[0].program_number, 5);
});

run('parse_bytes parses multiple Lexicon frames', () => {
    const f1 = [0xF0, 0x06, 0x00, 0x01, 0x40, 0x41].concat('First       '.split('').map(c => c.charCodeAt(0))).concat(new Array(10).fill(0x20)).concat([0xF7]);
    const f2 = [0xF0, 0x06, 0x00, 0x02, 0x40, 0x41].concat('Second      '.split('').map(c => c.charCodeAt(0))).concat(new Array(10).fill(0x20)).concat([0xF7]);
    const data = f1.concat(f2);
    const programs = M.parse_bytes(data);
    assert.equal(programs.length, 2);
    assert.equal(programs[0].name, 'First');
    assert.equal(programs[1].name, 'Second');
    assert.equal(programs[0].program_number, 1);
    assert.equal(programs[1].program_number, 2);
});

run('parse_bytes synthesizes "Program NNN" name when extraction fails', () => {
    // A valid Lexicon frame with a non-ASCII payload — the parser
    // can't extract a name and falls back to "Program NNN".
    const frame = [0xF0, 0x06, 0x00, 0x00].concat(new Array(20).fill(0x01)).concat([0xF7]);
    const programs = M.parse_bytes(frame);
    assert.equal(programs.length, 1);
    assert.equal(programs[0].name, 'Program 000');
});

run('parse_bytes ignores non-Lexicon frames in the stream', () => {
    const lexicon = [0xF0, 0x06, 0x00, 0x01, 0x40, 0x41].concat('ValidLex    '.split('').map(c => c.charCodeAt(0))).concat(new Array(10).fill(0x20)).concat([0xF7]);
    const yamaha  = [0xF0, 0x43, 0x00, 0x00].concat(new Array(20).fill(0x20)).concat([0xF7]);
    const data = yamaha.concat(lexicon);
    const programs = M.parse_bytes(data);
    assert.equal(programs.length, 1);
    assert.equal(programs[0].name, 'ValidLex');
});

// ---------- handle_sysex (live dispatch) ----------

run('handle_sysex returns null on too-small frame', () => {
    assert.isNull(M.handle_sysex([0xF0, 0x06, 0xF7]));
});

run('handle_sysex returns null on non-Lexicon frame', () => {
    const yamaha = [0xF0, 0x43].concat(new Array(20).fill(0x20)).concat([0xF7]);
    assert.isNull(M.handle_sysex(yamaha));
});

run('handle_sysex returns parsed program for valid Lexicon frame', () => {
    const headerPad = [0x40, 0x41];
    const nameBytes = 'PluckedString'.substr(0, 12).split('').map(c => c.charCodeAt(0));
    const frame = [0xF0, 0x06, 0x00, 0x09].concat(headerPad).concat(nameBytes).concat(new Array(10).fill(0x20)).concat([0xF7]);
    const result = M.handle_sysex(frame);
    assert.isNotNull(result);
    assert.equal(result.kind, 'program');
    assert.equal(result.program.name, 'PluckedStrin');  // truncated to 12 chars then stripped
    assert.equal(result.program.program_number, 9);
});

run('handle_sysex tolerates null/undefined input', () => {
    assert.isNull(M.handle_sysex(null));
    assert.isNull(M.handle_sysex(undefined));
});

summary();
