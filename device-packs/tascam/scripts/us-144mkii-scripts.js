// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// TASCAM US-144MKII mapping JS.
// Worklist: T2515-3
//
// Loaded by map2-controller-host's QuickJS engine. The US-144MKII has no
// software-readable hardware controls (front panel is purely analog), so
// this module is intentionally a no-op pass-through; declared so the
// controller-host pack-loader has a script entry to bind to and the device
// pack remains consistent with the rest of the tier-1 packs.

var US144MKIIMapping = (function () {
    'use strict';

    /** No-op handler — the US-144MKII's audio role is owned by the JUCE
     *  engine + Devices panel; MIDI passes through unchanged. */
    function noop() { /* intentionally empty */ }

    return {
        noop: noop,
    };
})();
