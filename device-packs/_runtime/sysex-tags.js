// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Shared SysEx name-tag runtime for MPX-1 / IntelFX parser migrations.
// Worklist: T2459-H4

(function (global) {
    'use strict';

    var commonSpecs = [
        ['\\bplate\\b', ['plate', 'reverb']],
        ['\\bhall\\b', ['hall', 'reverb']],
        ['\\broom\\b', ['room', 'reverb']],
        ['\\bspring\\b', ['spring', 'reverb']],
        ['\\bchamber\\b', ['chamber', 'reverb']],
        ['\\becho\\b', ['echo', 'delay']],
        ['\\bdelay\\b', ['delay']],
        ['\\bslap\\b', ['slap', 'delay']],
        ['\\bping\\b', ['pingpong', 'delay']],
        ['\\bchorus\\b', ['chorus']],
        ['\\bpitch\\b', ['pitch']],
        ['\\bshift\\b', ['pitch']],
        ['\\bwhammy\\b', ['pitch']],
        ['\\bdetune\\b', ['pitch']],
        ['\\bharmony\\b', ['pitch']],
        ['\\bocta(ve)?\\b', ['pitch']],
        ['\\beq\\b', ['eq']],
        ['\\bvocal\\b', ['vocal']],
        ['\\bguitar\\b', ['guitar']],
        ['\\bdrum\\b', ['drums']],
        ['\\bsnare\\b', ['drums']],
        ['\\bbass\\b', ['bass']],
        ['\\bambi(ent)?\\b', ['ambient']],
        ['\\bshimmer\\b', ['ambient']],
        ['\\bglass\\b', ['ambient']],
        ['\\bgate\\b', ['gate']],
        ['\\breverse\\b', ['reverse']]
    ];

    var mpx1OnlySpecs = [
        ['\\bflange\\b', ['flange', 'chorus']],
        ['\\bphase\\b', ['phaser', 'chorus']],
        ['\\brotary\\b', ['rotary', 'chorus']],
        ['\\bvibrato\\b', ['vibrato', 'chorus']]
    ];

    var intelfxOnlySpecs = [
        ['\\bhush\\b', ['hush', 'noise_reduction']],
        ['\\bcomp(ressor)?\\b', ['compressor']],
        ['\\bwah\\b', ['wah']],
        ['\\bflange\\b', ['flanger', 'chorus']],
        ['\\bphase\\b', ['phaser']],
        ['\\brotary\\b', ['rotary', 'chorus']],
        ['\\btremolo\\b', ['tremolo']],
        ['\\bvibrato\\b', ['vibrato', 'chorus']],
        ['\\breverb\\b', ['reverb']],
        ['\\bclean\\b', ['clean']],
        ['\\bcrunch\\b', ['crunch']],
        ['\\blead\\b', ['lead']],
        ['\\bacoustic\\b', ['acoustic']]
    ];

    function compileTagRules(specs) {
        return specs.map(function (item) {
            return { pattern: new RegExp(item[0], 'i'), tags: item[1].slice() };
        });
    }

    function autoTagFromName(name, rules) {
        var out = [];
        var seen = Object.create(null);
        for (var i = 0; i < rules.length; ++i) {
            var rule = rules[i];
            if (!rule.pattern.test(name)) continue;
            for (var j = 0; j < rule.tags.length; ++j) {
                var tag = rule.tags[j];
                if (seen[tag]) continue;
                seen[tag] = true;
                out.push(tag);
            }
        }
        return out;
    }

    function buildMpx1TagRules() {
        return compileTagRules(commonSpecs.concat(mpx1OnlySpecs));
    }

    function buildIntelfxTagRules() {
        return compileTagRules(commonSpecs.concat(intelfxOnlySpecs));
    }

    global.MAP2SysexTags = {
        autoTagFromName: autoTagFromName,
        buildMpx1TagRules: buildMpx1TagRules,
        buildIntelfxTagRules: buildIntelfxTagRules
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
