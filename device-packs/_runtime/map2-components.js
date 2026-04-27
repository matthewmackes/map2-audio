// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// MAP2 Components — Button / Knob / Encoder / Deck / Component framework
// for native MAP2 mappings. Pattern reference: Mixxx's
// res/controllers/midi-components-0.0.js (GPLv2-or-later); this file is
// a clean MAP2-authored rewrite under AGPL-3.0-only.
//
// Native packs may use either this MAP2-authored library or import the
// upstream Mixxx version under _mixx-imports/_runtime/. Mixxx-format
// packs use the upstream library by default.
//
// Scope: T2459-B2 fully populates this module's API. T2459-A4 ships the
// scaffold below so vendor pack authoring is unblocked.

(function (global) {
    'use strict';

    var MAP2 = global.MAP2 || {};

    /** A controllable widget: a button, knob, encoder, fader, pad. */
    function Component(options) {
        options = options || {};
        this.midi = options.midi || [0, 0];           // [status, midino]
        this.group = options.group || '';
        this.key = options.key || '';
        this.input = options.input || function () {};
        this.output = options.output || function () {};
    }

    /** A simple momentary or latching button. */
    function Button(options) {
        Component.call(this, options);
        this.type = 'button';
        this.toggle = options.toggle || false;
    }
    Button.prototype = Object.create(Component.prototype);
    Button.prototype.input = function (channel, control, value, status, group) {
        if (value > 0) {
            if (this.toggle) {
                engine.setValue(this.group, this.key,
                    !engine.getValue(this.group, this.key));
            } else {
                engine.setValue(this.group, this.key, 1);
            }
        } else if (!this.toggle) {
            engine.setValue(this.group, this.key, 0);
        }
    };

    /** An absolute-value knob or fader (0-127 → continuous). */
    function Knob(options) {
        Component.call(this, options);
        this.type = 'knob';
        this.invert = options.invert || false;
    }
    Knob.prototype = Object.create(Component.prototype);
    Knob.prototype.input = function (channel, control, value, status, group) {
        var normalised = value / 127.0;
        if (this.invert) normalised = 1.0 - normalised;
        engine.setParameter(this.group, this.key, normalised);
    };

    /** A relative encoder (signed-magnitude or two's-complement deltas). */
    function Encoder(options) {
        Component.call(this, options);
        this.type = 'encoder';
        this.scale = options.scale || 1.0;
        this.format = options.format || 'two_complement_7bit';   // 'signed_mag', 'two_complement_7bit'
    }
    Encoder.prototype = Object.create(Component.prototype);
    Encoder.prototype.input = function (channel, control, value, status, group) {
        var delta;
        if (this.format === 'signed_mag') {
            delta = (value & 0x40) ? -(value & 0x3F) : (value & 0x3F);
        } else {
            delta = (value > 0x40) ? value - 128 : value;
        }
        delta *= this.scale;
        var current = engine.getValue(this.group, this.key);
        engine.setValue(this.group, this.key, current + delta);
    };

    /** A pad with velocity / aftertouch. */
    function Pad(options) {
        Component.call(this, options);
        this.type = 'pad';
        this.velocityScale = options.velocityScale || 1.0;
    }
    Pad.prototype = Object.create(Component.prototype);
    Pad.prototype.input = function (channel, control, value, status, group) {
        var note = (status & 0xF0);
        if (note === 0x90 && value > 0) {
            engine.setValue(this.group, this.key, value * this.velocityScale / 127.0);
        } else if (note === 0x80 || (note === 0x90 && value === 0)) {
            engine.setValue(this.group, this.key, 0);
        }
    };

    MAP2.Component = Component;
    MAP2.Button = Button;
    MAP2.Knob = Knob;
    MAP2.Encoder = Encoder;
    MAP2.Pad = Pad;

    global.MAP2 = MAP2;
})(typeof globalThis !== 'undefined' ? globalThis : this);
