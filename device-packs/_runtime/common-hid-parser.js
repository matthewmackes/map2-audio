// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Common HID Parser — packet-structure registration + per-control
// dispatch for native MAP2 HID mappings.
//
// Pattern reference: Mixxx's res/controllers/common-hid-packet-parser.js
// (2243 lines, GPLv2-or-later). This is a clean MAP2-authored rewrite
// under AGPL-3.0-only. The functional contract is structurally similar
// so existing community knowledge transfers; the code is independent.
//
// Scope: T2459-D2 fully populates the API. T2459-A4 shipped the
// scaffold; this revision adds bit-aligned reads, signed/unsigned
// support, range-mapped callbacks, and a `dispatch()` function that
// routes incoming reports through every registered structure.
//
// The runtime is loaded by map2-controller-host's QuickJS engine
// for any HID mapping that calls `HID.registerInputReport(...)`.

(function (global) {
    'use strict';

    var HID = global.HID || {};

    // ---- Field reading helpers -------------------------------------

    /** Read `sizeBits` bits from `bytes`, starting at the given byte+bit
     *  offset. Bits are read little-endian (matches the convention
     *  Mixxx HID mappings use). Returns an unsigned integer.
     */
    function readBits(bytes, byteOffset, bitOffset, sizeBits) {
        var v = 0;
        var bitsRead = 0;
        var idx = byteOffset;
        var subBit = bitOffset;
        while (bitsRead < sizeBits) {
            var avail = 8 - subBit;
            var take = Math.min(avail, sizeBits - bitsRead);
            var byteVal = bytes[idx] || 0;
            var chunk = (byteVal >> subBit) & ((1 << take) - 1);
            v |= chunk << bitsRead;
            bitsRead += take;
            subBit += take;
            if (subBit >= 8) { subBit = 0; idx += 1; }
        }
        return v;
    }

    /** Sign-extend an unsigned value of `sizeBits` width. */
    function signExtend(v, sizeBits) {
        if (sizeBits >= 32) return v | 0;
        var mask = 1 << (sizeBits - 1);
        return (v & mask) ? (v - (1 << sizeBits)) : v;
    }

    // ---- HidField --------------------------------------------------

    function HidField(options) {
        if (!options || typeof options.id !== 'string') {
            throw new Error('HidField: id is required');
        }
        this.id = options.id;
        this.byteOffset = (options.byteOffset >>> 0) || 0;
        this.bitOffset = (options.bitOffset >>> 0) || 0;
        this.sizeBits = (options.sizeBits >>> 0) || 8;
        this.signed = !!options.signed;
        this.min = (typeof options.min === 'number') ? options.min : null;
        this.max = (typeof options.max === 'number') ? options.max : null;
        this.callback = (typeof options.callback === 'function')
            ? options.callback : null;
        this.lastValue = undefined;
    }

    HidField.prototype.read = function (bytes) {
        var raw = readBits(bytes, this.byteOffset, this.bitOffset, this.sizeBits);
        if (this.signed) raw = signExtend(raw, this.sizeBits);
        return raw;
    };

    HidField.prototype.dispatchIfChanged = function (bytes, fullReport) {
        var v = this.read(bytes);
        if (v === this.lastValue) return false;
        this.lastValue = v;
        if (this.callback) {
            try {
                this.callback(v, fullReport);
            } catch (e) {
                if (typeof engine !== 'undefined' && engine.logError) {
                    engine.logError('HID field callback threw: ' + e);
                }
            }
        }
        return true;
    };

    // ---- HidInputReport --------------------------------------------

    function HidInputReport(reportId, sizeBytes) {
        this.reportId = reportId | 0;
        this.sizeBytes = sizeBytes | 0;
        this.fields = [];
    }

    HidInputReport.prototype.addField = function (options) {
        var f = new HidField(options);
        this.fields.push(f);
        return f;
    };

    HidInputReport.prototype.parse = function (bytes) {
        // bytes is a Uint8Array. If reportId !== 0, the first byte is
        // the report ID prefix. Field byteOffsets are 0-based against
        // the data area (after the report ID byte if present).
        var base = (this.reportId !== 0) ? 1 : 0;
        var dataView = bytes.subarray
            ? bytes.subarray(base)
            : Array.prototype.slice.call(bytes, base);
        var changed = 0;
        for (var i = 0; i < this.fields.length; ++i) {
            if (this.fields[i].dispatchIfChanged(dataView, bytes)) changed += 1;
        }
        return changed;
    };

    // ---- Top-level registry + dispatch -----------------------------

    var registry = Object.create(null);

    HID.registerInputReport = function (reportId, sizeBytes) {
        var rep = new HidInputReport(reportId, sizeBytes);
        registry[reportId] = rep;
        return rep;
    };

    HID.getRegisteredReport = function (reportId) {
        return registry[reportId] || null;
    };

    HID.clearRegistry = function () {
        registry = Object.create(null);
    };

    /** Route an incoming HID report through the registered parser.
     *  `bytes` is a Uint8Array starting with the report ID byte (if
     *  the device uses report IDs) or with the data directly.
     */
    HID.dispatch = function (bytes) {
        if (!bytes || bytes.length === 0) return 0;
        var reportId = bytes[0] | 0;
        var rep = registry[reportId];
        if (!rep && registry[0]) {
            // Fall back to the no-report-ID parser if registered.
            rep = registry[0];
        }
        if (!rep) return 0;
        return rep.parse(bytes);
    };

    HID.HidField = HidField;
    HID.HidInputReport = HidInputReport;
    HID._readBits = readBits;
    HID._signExtend = signExtend;

    global.HID = HID;
})(typeof globalThis !== 'undefined' ? globalThis : this);
