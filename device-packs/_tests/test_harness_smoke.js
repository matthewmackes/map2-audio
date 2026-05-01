// Smoke test for the device-pack JS harness itself. Verifies the
// harness can load + exercise an existing pack script (MPX-1) and
// that the assertion helpers detect both pass + fail conditions.

'use strict';

const path = require('path');
const { loadPack, assert, run, summary } = require('./js_harness');

const mpx1Path = path.join(__dirname, '..', 'lexicon', 'scripts', 'mpx1.js');
const ctx = loadPack(mpx1Path);

run('harness loads MPX1 pack and exposes the namespace', () => {
    assert.isNotNull(ctx.MPX1, 'MPX1 namespace');
    assert.equal(typeof ctx.MPX1.bypass_toggle, 'function', 'MPX1.bypass_toggle');
    assert.equal(typeof ctx.MPX1.handle_sysex, 'function', 'MPX1.handle_sysex');
});

run('MPX1 constants are reachable', () => {
    assert.equal(ctx.MPX1.STATUS_CC, 0xB0, 'CC status byte');
    assert.equal(ctx.MPX1.STATUS_SYSEX, 0xF0, 'SysEx status byte');
    assert.equal(ctx.MPX1.LEXICON_MFR_ID, 0x06, 'Lexicon mfr ID');
});

run('MPX1.bypass_feedback emits CC 64 0 when bypass=false', () => {
    const out = ctx.MPX1.bypass_feedback(false);
    assert.equal(out[0], 0xB0, 'status');
    assert.equal(out[1], 64, 'cc number');
    assert.equal(out[2], 0, 'velocity');
});

run('MPX1.bypass_feedback emits CC 64 127 when bypass=true', () => {
    const out = ctx.MPX1.bypass_feedback(true);
    assert.equal(out[0], 0xB0, 'status');
    assert.equal(out[1], 64, 'cc number');
    assert.equal(out[2], 127, 'velocity');
});

run('MPX1.handle_sysex returns null on under-min-size frames (defensive)', () => {
    // Frames smaller than MIN_PROGRAM_DUMP_SIZE (20 bytes) are rejected
    // — pre-iter-35 the stub returned null for everything; post-iter-35
    // legitimate Lexicon program dumps return parsed objects (see
    // lexicon/scripts/__tests__/test_mpx1_parser.js for full coverage).
    const result = ctx.MPX1.handle_sysex([0xF0, 0x06, 0x02, 0x00, 0xF7]);
    assert.isNull(result, 'under-min frame');
});

run('MPX1.program_change uses default offset=0 when no setting', () => {
    // engine.getSetting returns undefined for unknown keys; the script
    // falls back to 0 via `(offset || 0)`.
    const result = ctx.MPX1.program_change(0, 12);
    assert.deepEqual(result, { snapshot_id: 12 });
});

// Re-load with a setting override to exercise engine.getSetting path.
const ctxWithOffset = loadPack(mpx1Path, { mpx1_program_offset: 100 });

run('MPX1.program_change applies mpx1_program_offset setting', () => {
    const result = ctxWithOffset.MPX1.program_change(0, 12);
    assert.deepEqual(result, { snapshot_id: 112 });
});

run('assert.equal FAILS on inequality (negative test)', () => {
    let caught = false;
    try {
        assert.equal(1, 2, 'should fail');
    } catch (e) {
        caught = true;
    }
    if (!caught) throw new Error('assert.equal did not throw on inequality');
});

run('assert.deepEqual FAILS on object inequality (negative test)', () => {
    let caught = false;
    try {
        assert.deepEqual({ a: 1 }, { a: 2 }, 'should fail');
    } catch (e) {
        caught = true;
    }
    if (!caught) throw new Error('assert.deepEqual did not throw on inequality');
});

summary();
