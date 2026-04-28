// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// MeloAudio MIDI Commander script surface.
// Worklist: T2459-H3

var MeloAudioCommander = (function () {
    'use strict';

    function _value(bytes) {
        if (!bytes || bytes.length < 3) return 0.0;
        return Math.max(0.0, Math.min(1.0, bytes[2] / 127.0));
    }

    function toggle_chain_1_bypass(bytes) {
        if (!bytes || bytes.length < 3 || bytes[2] < 64) return;
        engine.setValue('audio.chain.1.bypass', 'toggle', 1.0);
    }

    function toggle_chain_2_bypass(bytes) {
        if (!bytes || bytes.length < 3 || bytes[2] < 64) return;
        engine.setValue('audio.chain.2.bypass', 'toggle', 1.0);
    }

    function toggle_chain_3_bypass(bytes) {
        if (!bytes || bytes.length < 3 || bytes[2] < 64) return;
        engine.setValue('audio.chain.3.bypass', 'toggle', 1.0);
    }

    function tap_tempo(bytes) {
        if (!bytes || bytes.length < 3 || bytes[2] < 64) return;
        engine.setValue('audio.transport.tap_tempo', 'momentary', 1.0);
    }

    function expression_1(bytes) {
        engine.setValue('audio.master.volume', 'set', _value(bytes));
    }

    function expression_2(bytes) {
        engine.setValue('audio.chain.1.mod_depth', 'set', _value(bytes));
    }

    function bank_up(bytes) {
        if (!bytes || bytes.length < 3 || bytes[2] < 64) return;
        engine.log('MeloAudioCommander bank up');
    }

    function bank_down(bytes) {
        if (!bytes || bytes.length < 3 || bytes[2] < 64) return;
        engine.log('MeloAudioCommander bank down');
    }

    return {
        toggle_chain_1_bypass: toggle_chain_1_bypass,
        toggle_chain_2_bypass: toggle_chain_2_bypass,
        toggle_chain_3_bypass: toggle_chain_3_bypass,
        tap_tempo: tap_tempo,
        expression_1: expression_1,
        expression_2: expression_2,
        bank_up: bank_up,
        bank_down: bank_down,
    };
})();

globalThis['MeloAudioCommander.toggle_chain_1_bypass'] = MeloAudioCommander.toggle_chain_1_bypass;
globalThis['MeloAudioCommander.toggle_chain_2_bypass'] = MeloAudioCommander.toggle_chain_2_bypass;
globalThis['MeloAudioCommander.toggle_chain_3_bypass'] = MeloAudioCommander.toggle_chain_3_bypass;
globalThis['MeloAudioCommander.tap_tempo'] = MeloAudioCommander.tap_tempo;
globalThis['MeloAudioCommander.expression_1'] = MeloAudioCommander.expression_1;
globalThis['MeloAudioCommander.expression_2'] = MeloAudioCommander.expression_2;
globalThis['MeloAudioCommander.bank_up'] = MeloAudioCommander.bank_up;
globalThis['MeloAudioCommander.bank_down'] = MeloAudioCommander.bank_down;
