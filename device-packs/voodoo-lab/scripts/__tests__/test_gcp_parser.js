// T2482-P1.5 / iter 37: tests for GCP bulk-dump container parser
// ported to JS.
//
// Mirrors the container-level coverage in tests/test_ground_control_pro_parser.py
// (size/preamble/terminator validation + round-trip) for the pure
// layout logic. Field-level decoding stays in Python until P1.2.

'use strict';

const path = require('path');
const { loadPack, assert, run, summary } = require('../../../_tests/js_harness');

const ctx = loadPack(path.join(__dirname, '..', 'gcp.js'));
const G = ctx.GCP;

// ---------- Helpers ----------

// Build a synthetic 16567-byte bulk dump. Preamble + terminator are
// real; config + preset blocks are filled with deterministic bytes so
// round-trip identity is meaningful.
function buildBulkDump(opts) {
    opts = opts || {};
    var data = new Array(G.SYSEX_NUM_BYTES).fill(0);
    // Preamble (5 bytes).
    var preamble = opts.preamble || G.BULK_DUMP_PREAMBLE;
    for (var i = 0; i < preamble.length; i++) data[i] = preamble[i];
    // Config block — fill with 0x42.
    for (var c = 0; c < G.CONFIG_NUM_BYTES; c++) {
        data[G.CONFIG_OFFSET + c] = 0x42;
    }
    // Preset blocks — each preset gets a marker byte = preset index & 0x7F.
    for (var p = 0; p < G.NUM_PRESETS; p++) {
        var begin = G.PRESET_OFFSET + (p * G.PRESET_NUM_BYTES);
        for (var b = 0; b < G.PRESET_NUM_BYTES; b++) {
            data[begin + b] = (p + b) & 0x7F;
        }
    }
    // Terminator (1 byte).
    var terminator = opts.terminator !== undefined ? opts.terminator : 0xF7;
    data[G.TERMINATOR_OFFSET] = terminator;
    return data;
}

// ---------- Constants ----------

run('parser constants match Python defaults', () => {
    assert.equal(G.SYSEX_NUM_BYTES, 16567, 'bulk-dump byte count');
    assert.equal(G.NUM_PRESETS, 200, 'preset count');
    assert.equal(G.CONFIG_NUM_BYTES, 161, 'config block size');
    assert.equal(G.PRESET_NUM_BYTES, 82, 'preset block size');
    assert.equal(G.CONFIG_OFFSET, 5, 'config offset');
    assert.equal(G.PRESET_OFFSET, 166, 'preset offset (5 + 161)');
    assert.equal(G.TERMINATOR_OFFSET, 16566, 'terminator offset (166 + 82*200)');
    assert.deepEqual(G.BULK_DUMP_PREAMBLE, [0xF0, 0x00, 0x00, 0x07, 0x10], 'bulk preamble');
    assert.deepEqual(G.VOODOOLAB_MFR_ID, [0x00, 0x00, 0x32], 'live-traffic mfr ID');
});

// ---------- parse_bulk_dump ----------

run('parse_bulk_dump accepts a well-formed 16567-byte frame', () => {
    const data = buildBulkDump();
    const container = G.parse_bulk_dump(data);
    assert.equal(container.preamble.length, 5);
    assert.equal(container.config_block.length, G.CONFIG_NUM_BYTES);
    assert.equal(container.preset_blocks.length, G.NUM_PRESETS);
    assert.equal(container.terminator.length, 1);
    assert.equal(container.terminator[0], 0xF7);
});

run('parse_bulk_dump splits all 200 preset blocks at 82 bytes each', () => {
    const data = buildBulkDump();
    const container = G.parse_bulk_dump(data);
    // Verify preset 0 starts at offset 166 with byte 0+0=0x00.
    assert.equal(container.preset_blocks[0][0], 0x00);
    // Preset 100, byte 5 = (100+5) & 0x7F = 105 & 127 = 105
    assert.equal(container.preset_blocks[100][5], 105);
    // Last preset, last byte = (199+81) & 0x7F = 280 & 127 = 24
    assert.equal(container.preset_blocks[199][81], 24);
    // Each block is exactly PRESET_NUM_BYTES.
    for (let i = 0; i < G.NUM_PRESETS; i++) {
        if (container.preset_blocks[i].length !== G.PRESET_NUM_BYTES) {
            throw new Error('preset ' + i + ' wrong size: ' + container.preset_blocks[i].length);
        }
    }
});

run('parse_bulk_dump rejects bad size (one byte short)', () => {
    const data = buildBulkDump().slice(0, G.SYSEX_NUM_BYTES - 1);
    let caught = false;
    try {
        G.parse_bulk_dump(data);
    } catch (e) {
        caught = true;
        // Mirror Python's "Expected 16567 bytes" wording.
        if (e.message.indexOf('Expected ' + G.SYSEX_NUM_BYTES + ' bytes') < 0) {
            throw new Error('wrong message: ' + e.message);
        }
    }
    if (!caught) throw new Error('parse_bulk_dump did not throw on bad size');
});

run('parse_bulk_dump rejects bad size (one byte long)', () => {
    const data = buildBulkDump().concat([0x00]);
    let caught = false;
    try { G.parse_bulk_dump(data); } catch (e) { caught = true; }
    if (!caught) throw new Error('parse_bulk_dump did not throw on bad size');
});

run('parse_bulk_dump rejects bad preamble', () => {
    const data = buildBulkDump({ preamble: [0xF0, 0x7E, 0x00, 0x00, 0x00] });
    let caught = false;
    try {
        G.parse_bulk_dump(data);
    } catch (e) {
        caught = true;
        if (e.message.indexOf('Invalid Ground Control Pro preamble') < 0) {
            throw new Error('wrong message: ' + e.message);
        }
    }
    if (!caught) throw new Error('parse_bulk_dump did not throw on bad preamble');
});

run('parse_bulk_dump rejects bad terminator', () => {
    const data = buildBulkDump({ terminator: 0x00 });
    let caught = false;
    try {
        G.parse_bulk_dump(data);
    } catch (e) {
        caught = true;
        if (e.message.indexOf('Invalid Ground Control Pro terminator') < 0) {
            throw new Error('wrong message: ' + e.message);
        }
    }
    if (!caught) throw new Error('parse_bulk_dump did not throw on bad terminator');
});

// ---------- serialize_bulk_dump (round-trip) ----------

run('serialize_bulk_dump round-trips a parsed container byte-identically', () => {
    const original = buildBulkDump();
    const container = G.parse_bulk_dump(original);
    const round = G.serialize_bulk_dump(container);
    assert.equal(round.length, G.SYSEX_NUM_BYTES, 'round-trip length');
    for (let i = 0; i < G.SYSEX_NUM_BYTES; i++) {
        if (round[i] !== original[i]) {
            throw new Error('round-trip mismatch at byte ' + i + ': ' + round[i] + ' vs ' + original[i]);
        }
    }
});

run('serialize_bulk_dump survives a config-block edit', () => {
    const original = buildBulkDump();
    const container = G.parse_bulk_dump(original);
    container.config_block[10] = 0x55;  // mutate
    const round = G.serialize_bulk_dump(container);
    assert.equal(round[G.CONFIG_OFFSET + 10], 0x55, 'config edit propagates');
    // Other bytes still match the original.
    assert.equal(round[G.CONFIG_OFFSET + 11], original[G.CONFIG_OFFSET + 11]);
});

run('serialize_bulk_dump survives a preset edit', () => {
    const original = buildBulkDump();
    const container = G.parse_bulk_dump(original);
    container.preset_blocks[42][7] = 0x33;  // mutate preset 42 byte 7
    const round = G.serialize_bulk_dump(container);
    const idx = G.PRESET_OFFSET + (42 * G.PRESET_NUM_BYTES) + 7;
    assert.equal(round[idx], 0x33, 'preset edit propagates');
});

// ---------- handle_sysex (live-traffic dispatch) ----------

run('handle_sysex returns null on too-small frame', () => {
    assert.isNull(G.handle_sysex([0xF0, 0x00, 0x00, 0x32, 0xF7]));
});

run('handle_sysex returns null on non-Voodoo-Lab mfr ID', () => {
    const yamaha = [0xF0, 0x43, 0x00, 0x00, 0x00, 0x10, 0xF7];
    assert.isNull(G.handle_sysex(yamaha));
});

run('handle_sysex returns command + length for valid live frame', () => {
    // F0 00 00 32 <product> <command=0x12> <arg> F7
    const live = [0xF0, 0x00, 0x00, 0x32, 0x01, 0x12, 0x00, 0xF7];
    const result = G.handle_sysex(live);
    assert.isNotNull(result);
    assert.equal(result.command, 0x12);
    assert.equal(result.length, 8);
});

run('handle_sysex tolerates null/undefined input', () => {
    assert.isNull(G.handle_sysex(null));
    assert.isNull(G.handle_sysex(undefined));
});

// ---------- program_change ----------

run('program_change defaults bank to 0 when no setting', () => {
    const out = G.program_change(0, 5);
    assert.deepEqual(out, { snapshot_id: 5 });
});

run('program_change applies gcp_active_bank setting', () => {
    const ctxBank = loadPack(path.join(__dirname, '..', 'gcp.js'), { gcp_active_bank: 3 });
    const out = ctxBank.GCP.program_change(0, 4);
    assert.deepEqual(out, { snapshot_id: 28 });  // 3*8 + 4
});

summary();
