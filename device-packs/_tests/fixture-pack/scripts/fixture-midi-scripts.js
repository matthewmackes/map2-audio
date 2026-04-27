// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Fixture MIDI script — referenced by the fixture pack used in
// tests/test_device_packs_schema.py. Worklist: T2459-A4.

var FixtureMidi = (function () {
    function masterVolume(channel, control, value, status, group) {
        // Linear 0-127 → 0.0-1.0
        engine.setValue('audio.master.volume', 'set', value / 127.0);
    }

    return {
        masterVolume: masterVolume,
    };
})();
