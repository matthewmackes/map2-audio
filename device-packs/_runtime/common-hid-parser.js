// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Common HID Parser — packet-structure registration + per-control
// dispatch for native MAP2 HID mappings.
//
// Pattern reference: Mixxx's res/controllers/common-hid-packet-parser.js
// (2243 lines, GPLv2-or-later). This is a clean MAP2-authored rewrite
// under AGPL-3.0-only. Functional contract is structurally similar so
// existing community knowledge transfers, but the code is independent.
//
// Scope: T2459-D2 fully populates this module's API. T2459-A4 ships the
// scaffold below so the schema validator's expectation of a runtime
// library being present is satisfied.

(function (global) {
    'use strict';

    var HID = global.HID || {};

    /** A single field within an HID input report (offset/size/kind/...). */
    function HidField(options) {
        this.id = options.id;
        this.offset = options.offset;          // byte offset into the report
        this.sizeBits = options.sizeBits || 8;
        this.kind = options.kind;              // 'button' | 'knob_absolute' | ...
        this.signed = options.signed || false;
        this.callback = options.callback || null;
    }

    /** A registered input-report structure with an array of fields. */
    function HidInputReport(reportId, sizeBytes) {
        this.reportId = reportId;
        this.sizeBytes = sizeBytes;
        this.fields = [];
    }
    HidInputReport.prototype.addField = function (field) {
        this.fields.push(field);
    };
    HidInputReport.prototype.parse = function (bytes) {
        // bytes is a Uint8Array. The report ID byte (if present) is at
        // bytes[0]; field offsets are 1-indexed if reportId !== 0.
        var base = (this.reportId !== 0) ? 1 : 0;
        for (var i = 0; i < this.fields.length; ++i) {
            var f = this.fields[i];
            var raw = readField(bytes, base + f.offset, f.sizeBits, f.signed);
            if (f.callback) f.callback(raw, bytes);
        }
    };

    function readField(bytes, byteOffset, sizeBits, signed) {
        // Simple aligned-byte read for v1 scaffold. Bit-aligned reads
        // land in T2459-D2 alongside the full Mixxx-feature parity.
        var nbytes = Math.ceil(sizeBits / 8);
        var v = 0;
        for (var i = 0; i < nbytes; ++i) {
            v |= bytes[byteOffset + i] << (i * 8);
        }
        if (signed && (v & (1 << (sizeBits - 1)))) {
            v = v - (1 << sizeBits);
        }
        return v;
    }

    var registry = {};

    HID.registerInputReport = function (reportId, sizeBytes) {
        var rep = new HidInputReport(reportId, sizeBytes);
        registry[reportId] = rep;
        return rep;
    };

    HID.dispatch = function (bytes) {
        var reportId = bytes[0];
        var rep = registry[reportId] || registry[0];
        if (rep) rep.parse(bytes);
    };

    HID.HidField = HidField;
    HID.HidInputReport = HidInputReport;

    global.HID = HID;
})(typeof globalThis !== 'undefined' ? globalThis : this);
