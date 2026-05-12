// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2512-SCRIPT — Generic looper ControllerEngine script.
//
// Drop-in mapping helpers for the multi-track looper. Any device pack
// can `scripts: [_generic/midi-learn-looper/scripts/looper.js]` and
// then reference these handlers from its profile YAML — for example a
// 5-button MIDI footswitch profile that wires CC 80..84 to
// Looper.track_1.record / .stop / .clear / .undo / .redo.
//
// Every helper goes through ``engine.setValue(target, action, value)``,
// which the controller-host translates into an ``engine_command`` IPC
// frame. The backend's dispatcher (T2512-MIDI) routes the frame to the
// LooperService.
//
// Stomp helpers (.record / .stop / .clear / .undo / .redo) ignore the
// MIDI message body — they fire on press at value >= 64 and drop the
// release at value < 64. This matches the dispatcher-side stomp
// release-at-zero filter shipped under T2512-MIDI and keeps a
// footswitch press from re-triggering the verb on release.
//
// Setters (.level / .muted / .soloed / .reverse / .half_speed):
//   - .level interprets the CC body as 0..127 mapped linearly to
//     -60..+6 dB so an expression pedal sweep covers the full range.
//   - bool setters use action="toggle" so a single press flips state.
//
// Master:
//   - Looper.master.level scales the CC body the same way as per-track
//     level (-60..+6 dB).

var Looper = Looper || {};
(function () {
    'use strict';

    var STOMP_PRESS_THRESHOLD = 64;
    var LEVEL_MIN_DB = -60.0;
    var LEVEL_MAX_DB = 6.0;

    function _isPress(bytes) {
        // Treat short messages, missing payloads, or value<threshold
        // as a "release" (a no-op for stomp verbs). 3-byte CC/PC have
        // the value at byte[2]; 2-byte PC has it at byte[1].
        if (!bytes || bytes.length < 2) return false;
        var v = (bytes.length >= 3) ? bytes[2] : bytes[1];
        return v >= STOMP_PRESS_THRESHOLD;
    }

    function _ccValueDb(bytes) {
        // 0..127 → -60..+6 dB (linear). Matches the dispatcher clamp.
        if (!bytes || bytes.length < 3) return 0.0;
        var v = Math.max(0, Math.min(127, bytes[2]));
        return LEVEL_MIN_DB + (v / 127.0) * (LEVEL_MAX_DB - LEVEL_MIN_DB);
    }

    function _stomp(target) {
        return function (bytes) {
            if (!_isPress(bytes)) return;
            engine.setValue(target, 'set', 1.0);
        };
    }

    function _toggle(target) {
        return function (bytes) {
            if (!_isPress(bytes)) return;
            engine.setValue(target, 'toggle', 1.0);
        };
    }

    function _level(target) {
        return function (bytes) {
            engine.setValue(target, 'set', _ccValueDb(bytes));
        };
    }

    // Build the 4-track surface programmatically so a future MAX_TRACKS
    // bump only changes one constant in C++ / Python — the script keeps
    // working with no edits here.
    var NUM_TRACKS = 4;
    var STOMP_VERBS = ['record', 'stop', 'clear', 'undo', 'redo'];
    var BOOL_VERBS  = ['muted', 'soloed', 'reverse', 'half_speed'];

    Looper.track = [];
    for (var t = 0; t < NUM_TRACKS; t++) {
        var entry = {};
        for (var i = 0; i < STOMP_VERBS.length; i++) {
            var v = STOMP_VERBS[i];
            entry[v] = _stomp('audio.looper.' + t + '.' + v);
        }
        for (var j = 0; j < BOOL_VERBS.length; j++) {
            var bv = BOOL_VERBS[j];
            entry[bv] = _toggle('audio.looper.' + t + '.' + bv);
        }
        entry.level = _level('audio.looper.' + t + '.level');
        Looper.track[t] = entry;
    }

    Looper.master = {
        level: _level('audio.looper.master.level'),
    };

    // Expose for QuickJS host lookup by string name (mirrors the
    // MeloAudioCommander pattern). Profile YAML references handlers
    // as e.g. ``script: Looper.track_0.record``.
    for (var tt = 0; tt < NUM_TRACKS; tt++) {
        var prefix = 'Looper.track_' + tt + '.';
        var slot = Looper.track[tt];
        globalThis[prefix + 'record']     = slot.record;
        globalThis[prefix + 'stop']       = slot.stop;
        globalThis[prefix + 'clear']      = slot.clear;
        globalThis[prefix + 'undo']       = slot.undo;
        globalThis[prefix + 'redo']       = slot.redo;
        globalThis[prefix + 'muted']      = slot.muted;
        globalThis[prefix + 'soloed']     = slot.soloed;
        globalThis[prefix + 'reverse']    = slot.reverse;
        globalThis[prefix + 'half_speed'] = slot.half_speed;
        globalThis[prefix + 'level']      = slot.level;
    }
    globalThis['Looper.master.level'] = Looper.master.level;
})();
