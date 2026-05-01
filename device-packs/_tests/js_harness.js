// T2482-P1.5 / iter 34: SysEx cutover groundwork.
//
// Node-based test harness for device-pack JS scripts. Loads a script,
// stubs the controller-host engine bindings (engine.getSetting, etc.),
// and exposes a tiny assertion helper so per-pack JS tests stay
// readable.
//
// Usage from a per-pack test file:
//
//     const { loadPack, assert, run } = require('../_tests/js_harness');
//     const ctx = loadPack(require('path').join(__dirname, 'scripts/mpx1.js'));
//
//     run('MPX1.bypass_feedback emits CC 64 0 when bypass=false', () => {
//         const out = ctx.MPX1.bypass_feedback(false);
//         assert.equal(out[0], 0xB0, 'status');
//         assert.equal(out[1], 64, 'cc number');
//         assert.equal(out[2], 0, 'velocity');
//     });
//
// The harness deliberately avoids QuickJS / Duktape / SpiderMonkey
// dependencies — Node + plain require() is enough to exercise the
// pack JS in isolation. The QuickJS-specific runtime concerns
// (memory limits, sandboxing, timeouts) are tested separately when
// the controller-host process integration lands in T2482-P1.2.

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------- Engine binding stubs ----------

function makeEngineStub(settings = {}) {
    return {
        getSetting: function (key) {
            return Object.prototype.hasOwnProperty.call(settings, key)
                ? settings[key]
                : undefined;
        },
        // emitSysex / emitMidi / etc. are recorded for assertions.
        _emitted: [],
        emitMidi: function (bytes) { this._emitted.push({ kind: 'midi', bytes: bytes }); },
        emitSysex: function (bytes) { this._emitted.push({ kind: 'sysex', bytes: bytes }); },
    };
}

// ---------- Script loader ----------

function loadPack(scriptPath, settings = {}) {
    if (!fs.existsSync(scriptPath)) {
        throw new Error(`pack script not found: ${scriptPath}`);
    }
    const source = fs.readFileSync(scriptPath, 'utf8');

    // Build a fresh VM context per loadPack call so tests are isolated.
    const engine = makeEngineStub(settings);
    const sandbox = {
        engine: engine,
        Math: Math,
        JSON: JSON,
        // Allow scripts to define top-level helpers via `var X = ...;`
        // — those land on the sandbox after script.runInContext.
    };
    vm.createContext(sandbox);
    const script = new vm.Script(source, { filename: path.basename(scriptPath) });
    script.runInContext(sandbox);
    sandbox._engine = engine;  // expose for assertions
    return sandbox;
}

// ---------- Assertion helpers ----------

const assert = {
    equal: function (actual, expected, label) {
        if (actual !== expected) {
            throw new Error(
                `assert.equal FAILED${label ? ` (${label})` : ''}: ` +
                `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`
            );
        }
    },
    deepEqual: function (actual, expected, label) {
        const a = JSON.stringify(actual);
        const e = JSON.stringify(expected);
        if (a !== e) {
            throw new Error(
                `assert.deepEqual FAILED${label ? ` (${label})` : ''}: ` +
                `actual=${a} expected=${e}`
            );
        }
    },
    isNull: function (actual, label) {
        if (actual !== null) {
            throw new Error(
                `assert.isNull FAILED${label ? ` (${label})` : ''}: ` +
                `got ${JSON.stringify(actual)}`
            );
        }
    },
    isNotNull: function (actual, label) {
        if (actual === null || actual === undefined) {
            throw new Error(
                `assert.isNotNull FAILED${label ? ` (${label})` : ''}: got ${actual}`
            );
        }
    },
    truthy: function (actual, label) {
        if (!actual) {
            throw new Error(
                `assert.truthy FAILED${label ? ` (${label})` : ''}: ` +
                `got ${JSON.stringify(actual)}`
            );
        }
    },
};

// ---------- Test runner ----------

let _passed = 0;
let _failed = 0;
const _failures = [];

function run(name, body) {
    try {
        body();
        _passed += 1;
        process.stdout.write('.');
    } catch (err) {
        _failed += 1;
        _failures.push({ name: name, message: err.message });
        process.stdout.write('F');
    }
}

function summary() {
    process.stdout.write('\n');
    if (_failures.length > 0) {
        for (const f of _failures) {
            console.error(`\n  FAIL: ${f.name}`);
            console.error(`        ${f.message}`);
        }
    }
    console.log(`\n${_passed} passed, ${_failed} failed (${_passed + _failed} total)`);
    process.exit(_failed === 0 ? 0 : 1);
}

module.exports = { loadPack, assert, run, summary };
