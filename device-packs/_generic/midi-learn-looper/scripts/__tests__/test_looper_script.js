// SPDX-License-Identifier: AGPL-3.0-only
// T2512-SCRIPT — unit tests for the generic looper ControllerEngine JS module.
//
// Uses the device-packs/_tests/js_harness.js Node-side harness (no
// QuickJS dependency). Loads `looper.js` into a fresh VM context with a
// stubbed `engine` binding that records each `setValue` call so we can
// assert the script emits the right dispatcher target / action / value.

'use strict';

const path = require('path');
const vm = require('vm');
const fs = require('fs');
const { assert, run, summary } = require('../../../../_tests/js_harness');

// Bespoke loader: the shared makeEngineStub doesn't include
// engine.setValue (only emitMidi / emitSysex), so we extend it inline
// rather than amend the harness for one pack.
function loadLooperScript() {
    const calls = [];
    const engine = {
        setValue: function (target, action, value) {
            calls.push({ target: target, action: action, value: value });
        },
        log: function () {},
    };
    const sandbox = {
        engine: engine,
        Math: Math,
        JSON: JSON,
    };
    // Carry globalThis = sandbox so the script's `globalThis[...]`
    // dispatch-table writes land on the sandbox.
    vm.createContext(sandbox);
    sandbox.globalThis = sandbox;
    const scriptPath = path.join(__dirname, '..', 'looper.js');
    const source = fs.readFileSync(scriptPath, 'utf8');
    const script = new vm.Script(source, { filename: 'looper.js' });
    script.runInContext(sandbox);
    return { sandbox: sandbox, engine: engine, calls: calls };
}

// ----------------------------------------------------------------------
// Stomp helpers
// ----------------------------------------------------------------------

run('record stomp on press → engine.setValue(audio.looper.<n>.record)', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_0.record']([0xB0, 80, 127]);
    assert.equal(ctx.calls.length, 1, 'one setValue per press');
    assert.equal(ctx.calls[0].target, 'audio.looper.0.record');
    assert.equal(ctx.calls[0].action, 'set');
    assert.equal(ctx.calls[0].value, 1.0);
});

run('record stomp on release (value=0) is dropped', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_0.record']([0xB0, 80, 0]);
    assert.equal(ctx.calls.length, 0, 'release should not fire stomp');
});

run('stomp helpers route per track', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_2.stop']([0xB0, 81, 127]);
    ctx.sandbox['Looper.track_3.clear']([0xB0, 82, 127]);
    ctx.sandbox['Looper.track_1.undo']([0xB0, 83, 127]);
    ctx.sandbox['Looper.track_0.redo']([0xB0, 84, 127]);
    assert.equal(ctx.calls[0].target, 'audio.looper.2.stop');
    assert.equal(ctx.calls[1].target, 'audio.looper.3.clear');
    assert.equal(ctx.calls[2].target, 'audio.looper.1.undo');
    assert.equal(ctx.calls[3].target, 'audio.looper.0.redo');
});

// ----------------------------------------------------------------------
// Bool setters use toggle
// ----------------------------------------------------------------------

run('muted toggle uses action=toggle', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_1.muted']([0xB0, 60, 127]);
    assert.equal(ctx.calls[0].target, 'audio.looper.1.muted');
    assert.equal(ctx.calls[0].action, 'toggle');
});

run('soloed/reverse/half_speed all use toggle', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_0.soloed']([0xB0, 61, 127]);
    ctx.sandbox['Looper.track_0.reverse']([0xB0, 62, 127]);
    ctx.sandbox['Looper.track_0.half_speed']([0xB0, 63, 127]);
    assert.equal(ctx.calls[0].action, 'toggle');
    assert.equal(ctx.calls[1].action, 'toggle');
    assert.equal(ctx.calls[2].action, 'toggle');
});

run('bool setter on release is dropped', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_2.muted']([0xB0, 60, 0]);
    assert.equal(ctx.calls.length, 0);
});

// ----------------------------------------------------------------------
// Level setters scale CC 0..127 → -60..+6 dB
// ----------------------------------------------------------------------

run('level setter at value 0 → -60 dB', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_0.level']([0xB0, 7, 0]);
    assert.equal(ctx.calls.length, 1);
    assert.equal(ctx.calls[0].target, 'audio.looper.0.level');
    assert.equal(ctx.calls[0].action, 'set');
    assert.equal(ctx.calls[0].value, -60.0);
});

run('level setter at value 127 → +6 dB', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_3.level']([0xB0, 7, 127]);
    assert.equal(ctx.calls[0].target, 'audio.looper.3.level');
    assert.equal(ctx.calls[0].value, 6.0);
});

run('master level setter scales identically', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.master.level']([0xB0, 7, 127]);
    assert.equal(ctx.calls[0].target, 'audio.looper.master.level');
    assert.equal(ctx.calls[0].value, 6.0);
});

// T2512-PACK-MUTE — master-bus mute toggle exposed via the script surface.
run('master muted toggle uses action=toggle and routes to master', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.master.muted']([0xB0, 72, 127]);
    assert.equal(ctx.calls.length, 1);
    assert.equal(ctx.calls[0].target, 'audio.looper.master.muted');
    assert.equal(ctx.calls[0].action, 'toggle');
});

run('master muted release at value=0 is dropped', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.master.muted']([0xB0, 72, 0]);
    assert.equal(ctx.calls.length, 0);
});

// ----------------------------------------------------------------------
// Coverage: every track exposes the full handler surface
// ----------------------------------------------------------------------

run('every track 0..3 exposes all 17 verbs on globalThis', () => {
    const ctx = loadLooperScript();
    const expected = ['record', 'stop', 'clear', 'undo', 'redo',
                      'muted', 'soloed', 'reverse', 'half_speed',
                      'locked', 'one_shot', 'auto_armed', 'level',
                      // T2512-PACK-V2 — cycle-6/7/9 setters.
                      'stop_mode', 'sync_mode', 'quantize_division', 'fade_ms'];
    for (let t = 0; t < 4; t++) {
        for (const v of expected) {
            const key = 'Looper.track_' + t + '.' + v;
            assert.truthy(typeof ctx.sandbox[key] === 'function', key);
        }
    }
    assert.truthy(typeof ctx.sandbox['Looper.master.level'] === 'function',
                  'Looper.master.level');
    // T2512-PACK-MUTE — master mute toggle on the master.
    assert.truthy(typeof ctx.sandbox['Looper.master.muted'] === 'function',
                  'Looper.master.muted');
});

// T2512-LOCK-MIDI — write-lock toggle via the script surface.
run('locked toggle uses action=toggle and routes per track', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_3.locked']([0xB0, 70, 127]);
    assert.equal(ctx.calls.length, 1);
    assert.equal(ctx.calls[0].target, 'audio.looper.3.locked');
    assert.equal(ctx.calls[0].action, 'toggle');
});

run('locked release at value=0 is dropped', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_0.locked']([0xB0, 70, 0]);
    assert.equal(ctx.calls.length, 0);
});

// T2512-OS — one-shot / trigger mode toggle.
run('one_shot toggle uses action=toggle and routes per track', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_2.one_shot']([0xB0, 71, 127]);
    assert.equal(ctx.calls.length, 1);
    assert.equal(ctx.calls[0].target, 'audio.looper.2.one_shot');
    assert.equal(ctx.calls[0].action, 'toggle');
});

// T2512-AUTO — auto-record arm toggle.
run('auto_armed toggle uses action=toggle and routes per track', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_3.auto_armed']([0xB0, 72, 127]);
    assert.equal(ctx.calls.length, 1);
    assert.equal(ctx.calls[0].target, 'audio.looper.3.auto_armed');
    assert.equal(ctx.calls[0].action, 'toggle');
});

// T2512-PACK-V2 — cycle-6/7/9 setters.
run('stop_mode maps CC 0 → index 0 ("hard")', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_0.stop_mode']([0xB0, 100, 0]);
    assert.equal(ctx.calls.length, 1);
    assert.equal(ctx.calls[0].target, 'audio.looper.0.stop_mode');
    assert.equal(ctx.calls[0].action, 'set');
    assert.equal(ctx.calls[0].value, 0);
});

run('stop_mode maps CC 127 → index 1 ("fade")', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_0.stop_mode']([0xB0, 100, 127]);
    assert.equal(ctx.calls[0].value, 1);
});

run('sync_mode maps CC 0/64/127 to indices 0/1/2', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_0.sync_mode']([0xB0, 101, 0]);
    ctx.sandbox['Looper.track_0.sync_mode']([0xB0, 101, 64]);
    ctx.sandbox['Looper.track_0.sync_mode']([0xB0, 101, 127]);
    assert.equal(ctx.calls[0].value, 0);
    assert.equal(ctx.calls[1].value, 1);
    assert.equal(ctx.calls[2].value, 2);
});

run('quantize_division spans 7 indices across CC 0..127', () => {
    const ctx = loadLooperScript();
    // CC 0 → 0; CC 127 → 6 (last index for 7 positions).
    ctx.sandbox['Looper.track_2.quantize_division']([0xB0, 102, 0]);
    ctx.sandbox['Looper.track_2.quantize_division']([0xB0, 102, 127]);
    assert.equal(ctx.calls[0].target, 'audio.looper.2.quantize_division');
    assert.equal(ctx.calls[0].value, 0);
    assert.equal(ctx.calls[1].value, 6);
});

run('fade_ms maps CC 0..127 to 0..5000 ms', () => {
    const ctx = loadLooperScript();
    ctx.sandbox['Looper.track_1.fade_ms']([0xB0, 103, 0]);
    ctx.sandbox['Looper.track_1.fade_ms']([0xB0, 103, 127]);
    assert.equal(ctx.calls[0].target, 'audio.looper.1.fade_ms');
    assert.equal(ctx.calls[0].action, 'set');
    assert.equal(ctx.calls[0].value, 0);
    assert.equal(ctx.calls[1].value, 5000);
});

summary();
