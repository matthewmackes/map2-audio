// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes - MAP2 Audio Platform
//
// Native Instruments Maschine MK1 mapping script (MIDI side only).
// Worklist: T2459-H4 slice 6.
//
// The proprietary HID/USB control surface (LEDs, displays, 12-bit pad
// pressure stream) is owned by app/services/maschine/maschine_mk1_daemon.py
// per T2459-H separate-process isolation. This script only handles the
// MIDI-mode events emitted on the virtual ALSA-seq port "MAP2:Maschine-MK1".

var MaschineMK1 = (function () {
    'use strict';

    function _normalize(bytes) {
        if (!bytes || bytes.length < 3) return 0.0;
        return Math.max(0.0, Math.min(1.0, bytes[2] / 127.0));
    }

    function _isPress(bytes) {
        return !!bytes && bytes.length >= 3 && bytes[2] >= 64;
    }

    function _padHandler(index) {
        return function (bytes) {
            engine.setValue('audio.pad.' + index + '.trigger', 'set', _normalize(bytes));
        };
    }

    function _encoderHandler(target) {
        return function (bytes) {
            engine.setValue(target, 'set', _normalize(bytes));
        };
    }

    function _buttonHandler(target) {
        return function (bytes) {
            if (!_isPress(bytes)) return;
            engine.setValue(target, 'momentary', 1.0);
        };
    }

    var api = {
        navigate_encoder: _encoderHandler('audio.nav.cursor'),
        encoder_1: _encoderHandler('audio.macro.1'),
        encoder_2: _encoderHandler('audio.macro.2'),
        encoder_3: _encoderHandler('audio.macro.3'),
        encoder_4: _encoderHandler('audio.macro.4'),
        encoder_5: _encoderHandler('audio.macro.5'),
        encoder_6: _encoderHandler('audio.macro.6'),
        encoder_7: _encoderHandler('audio.macro.7'),
        volume_encoder: _encoderHandler('audio.master.volume'),
        tempo_encoder: _encoderHandler('audio.transport.tempo'),
        swing_encoder: _encoderHandler('audio.transport.swing'),

        group_a: _buttonHandler('audio.group.a.select'),
        group_b: _buttonHandler('audio.group.b.select'),
        group_c: _buttonHandler('audio.group.c.select'),
        group_d: _buttonHandler('audio.group.d.select'),
        group_e: _buttonHandler('audio.group.e.select'),
        group_f: _buttonHandler('audio.group.f.select'),
        group_g: _buttonHandler('audio.group.g.select'),
        group_h: _buttonHandler('audio.group.h.select'),

        transport_play: _buttonHandler('audio.transport.play'),
        transport_rec: _buttonHandler('audio.transport.record'),
        transport_restart: _buttonHandler('audio.transport.restart'),
        transport_left: _buttonHandler('audio.transport.left'),
        transport_right: _buttonHandler('audio.transport.right'),
        transport_grid: _buttonHandler('audio.transport.grid'),
        transport_shift: _buttonHandler('audio.modifier.shift'),
        transport_erase: _buttonHandler('audio.transport.erase'),

        button_mute: _buttonHandler('audio.modifier.mute'),
        button_solo: _buttonHandler('audio.modifier.solo'),
        button_select: _buttonHandler('audio.modifier.select'),
        button_duplicate: _buttonHandler('audio.modifier.duplicate'),
        button_navigate: _buttonHandler('audio.modifier.navigate'),
        button_keyboard: _buttonHandler('audio.modifier.keyboard'),
        button_pattern: _buttonHandler('audio.modifier.pattern'),
        button_scene: _buttonHandler('audio.modifier.scene'),
        button_control: _buttonHandler('audio.lcd.control'),
        button_browse: _buttonHandler('audio.lcd.browse'),
        button_browse_left: _buttonHandler('audio.lcd.browse_left'),
        button_browse_right: _buttonHandler('audio.lcd.browse_right'),
        button_snap: _buttonHandler('audio.modifier.snap'),
        button_auto: _buttonHandler('audio.modifier.auto'),
        button_sampling: _buttonHandler('audio.modifier.sampling'),
        button_step: _buttonHandler('audio.modifier.step'),
        button_note_repeat: _buttonHandler('audio.modifier.note_repeat'),
        button_display_1: _buttonHandler('audio.lcd.display.1'),
        button_display_2: _buttonHandler('audio.lcd.display.2'),
        button_display_3: _buttonHandler('audio.lcd.display.3'),
        button_display_4: _buttonHandler('audio.lcd.display.4'),
        button_display_5: _buttonHandler('audio.lcd.display.5'),
        button_display_6: _buttonHandler('audio.lcd.display.6'),
        button_display_7: _buttonHandler('audio.lcd.display.7'),
        button_display_8: _buttonHandler('audio.lcd.display.8'),
    };

    for (var i = 1; i <= 16; i++) {
        api['pad_' + i] = _padHandler(i);
    }

    return api;
})();

(function () {
    var keys = Object.keys(MaschineMK1);
    for (var i = 0; i < keys.length; i++) {
        globalThis['MaschineMK1.' + keys[i]] = MaschineMK1[keys[i]];
    }
})();
