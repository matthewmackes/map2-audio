// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// UA-1000 mapping JS.
// Worklist: T2459-B4
//
// Loaded by map2-controller-host's QuickJS engine. The `engine` global
// is installed by EngineApiBindings (T2459-B2). Functions referenced
// from ua-1000.midi.yaml's `script:` rows must exist as global
// callables on the QuickJS context.

var UA1000Mapping = (function () {
    'use strict';

    /** Apply the configured master volume curve to a 0-127 MIDI value
     *  and forward it to audio.master.volume.
     *
     *  Curves:
     *    linear   v
     *    log      log10(1 + 9*v) / log10(10)
     *    exp      pow(v, 2)
     *    s_curve  (3*v^2 - 2*v^3) — Hermite smoothstep
     */
    function masterVolume(buffer) {
        var bytes = new Uint8Array(buffer);
        if (bytes.length < 3) {
            engine.logWarning('UA1000Mapping.masterVolume: short MIDI message');
            return;
        }
        var raw = bytes[2] / 127.0;
        var curve = (typeof engine.getSetting === 'function')
            ? engine.getSetting('master_volume_curve')
            : 'linear';
        var v = applyCurve(raw, curve);
        engine.setValue('audio.master.volume', 'set', v);
    }

    function applyCurve(v, curve) {
        v = Math.max(0.0, Math.min(1.0, v));
        if (curve === 'log') {
            return Math.log(1.0 + 9.0 * v) / Math.log(10.0);
        }
        if (curve === 'exp') {
            return v * v;
        }
        if (curve === 's_curve') {
            return v * v * (3.0 - 2.0 * v);
        }
        return v;  // linear
    }

    return {
        masterVolume: masterVolume,
        applyCurve: applyCurve,
    };
})();

// QuickJS host-callable shim — the IPC dispatcher's invokeIncomingData
// path looks up a global with the function name. Re-export the
// namespaced functions as flat globals so YAML `script:` references
// like "UA1000Mapping.masterVolume" can be resolved either way.
globalThis['UA1000Mapping.masterVolume'] = UA1000Mapping.masterVolume;
globalThis['UA1000Mapping.applyCurve'] = UA1000Mapping.applyCurve;
