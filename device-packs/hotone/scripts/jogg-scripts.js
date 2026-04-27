// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Hotone Jogg mapping JS.
// Worklist: T2459-C2.

var HotoneJogg = (function () {
    'use strict';

    var AMP_MODELS = ['Twin', 'Plexi', 'Recto', 'JCM800', 'AC30'];
    var CABS = ['1x12', '2x12', '4x12 V30', '4x12 G12T', 'Bypass'];

    function amp_model_select(buffer) {
        var bytes = new Uint8Array(buffer);
        if (bytes.length < 3) return;
        var idx = Math.min(AMP_MODELS.length - 1, Math.floor(bytes[2] * AMP_MODELS.length / 128));
        engine.setValue('audio.chain.1.amp_model.model_select', 'set', idx);
        engine.log('Jogg amp model: ' + AMP_MODELS[idx]);
    }

    function cab_select(buffer) {
        var bytes = new Uint8Array(buffer);
        if (bytes.length < 3) return;
        var idx = Math.min(CABS.length - 1, Math.floor(bytes[2] * CABS.length / 128));
        engine.setValue('audio.chain.1.cabinet_sim.cab_select', 'set', idx);
        engine.log('Jogg cab: ' + CABS[idx]);
    }

    return {
        amp_model_select: amp_model_select,
        cab_select: cab_select,
    };
})();

globalThis['HotoneJogg.amp_model_select'] = HotoneJogg.amp_model_select;
globalThis['HotoneJogg.cab_select'] = HotoneJogg.cab_select;
