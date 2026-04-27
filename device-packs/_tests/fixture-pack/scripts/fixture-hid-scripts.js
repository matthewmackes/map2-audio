// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Fixture HID script. Worklist: T2459-A4.

var FixtureHid = (function () {
    function jogWheel(deltaTicks) {
        engine.setValue('audio.chain.1.cue', 'increment_by', deltaTicks);
    }

    return {
        jogWheel: jogWheel,
    };
})();
