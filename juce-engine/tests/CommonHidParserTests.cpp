// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// CommonHidParser smoke tests — T2459-D2 acceptance gate.
//
// Loads device-packs/_runtime/common-hid-parser.js into a QuickJS
// engine, registers an input report with a few fields, dispatches
// synthesized HID byte sequences, and asserts the per-field callbacks
// fire with the expected raw values.

#include <catch2/catch_test_macros.hpp>

#include "ControllerHost/QuickJSEngine.h"

#include <fstream>
#include <sstream>
#include <string>

using map2::controller_host::PendingEngineCommand;
using map2::controller_host::PendingLogEvent;
using map2::controller_host::QuickJSEngine;

namespace
{

#ifndef MAP2_REPO_ROOT
  #define MAP2_REPO_ROOT "."
#endif

std::string readFile(const std::string& path)
{
    std::ifstream f(path);
    REQUIRE(f.is_open());
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

const std::string kParserPath =
    std::string(MAP2_REPO_ROOT) + "/device-packs/_runtime/common-hid-parser.js";

} // anonymous namespace

TEST_CASE ("common-hid-parser.js loads in QuickJS without exceptions", "[T2459-D2]")
{
    QuickJSEngine engine;
    auto exc = engine.evaluate (readFile (kParserPath), "common-hid-parser.js");
    REQUIRE_FALSE (exc.has_value());
}

TEST_CASE ("HID.registerInputReport returns a report with addField + parse", "[T2459-D2]")
{
    QuickJSEngine engine;
    REQUIRE_FALSE (engine.evaluate (readFile (kParserPath)).has_value());

    auto exc = engine.evaluate (
        "var rep = HID.registerInputReport(1, 8);"
        "globalThis.padReceived = -1;"
        "rep.addField({"
        "  id: 'pad_velocity',"
        "  byteOffset: 0,"          // first byte of data area (after report ID prefix)
        "  bitOffset: 0,"
        "  sizeBits: 8,"
        "  signed: false,"
        "  callback: function(v) { globalThis.padReceived = v; }"
        "});"
        "var bytes = new Uint8Array([1, 100, 0, 0, 0, 0, 0, 0]);"  // reportId=1, vel=100
        "var changes = HID.dispatch(bytes);"
        "globalThis.changeCount = changes;"
    );
    REQUIRE_FALSE (exc.has_value());

    // Ask the engine for the values we stashed on globalThis.
    exc = engine.evaluate (
        "engine.setValue('test', 'pad', globalThis.padReceived);"
        "engine.setValue('test', 'changes', globalThis.changeCount);"
    );
    REQUIRE_FALSE (exc.has_value());

    auto cmds = engine.drainEngineCommands();
    REQUIRE (cmds.size() == 2);
    REQUIRE (cmds[0].value.has_value());
    REQUIRE (cmds[0].value.value() == 100.0);
    REQUIRE (cmds[1].value.has_value());
    REQUIRE (cmds[1].value.value() == 1.0);
}

TEST_CASE ("HID dispatch only fires callback when the value changes", "[T2459-D2]")
{
    QuickJSEngine engine;
    REQUIRE_FALSE (engine.evaluate (readFile (kParserPath)).has_value());

    auto exc = engine.evaluate (
        "var rep = HID.registerInputReport(1, 8);"
        "globalThis.fireCount = 0;"
        "rep.addField({"
        "  id: 'btn',"
        "  byteOffset: 0,"
        "  bitOffset: 0,"
        "  sizeBits: 8,"
        "  callback: function(v) { globalThis.fireCount += 1; }"
        "});"
        "HID.dispatch(new Uint8Array([1, 0x42, 0,0,0,0,0,0]));"   // first → fires
        "HID.dispatch(new Uint8Array([1, 0x42, 0,0,0,0,0,0]));"   // unchanged → silent
        "HID.dispatch(new Uint8Array([1, 0x10, 0,0,0,0,0,0]));"   // changed → fires
        "engine.setValue('test', 'fires', globalThis.fireCount);"
    );
    REQUIRE_FALSE (exc.has_value());
    auto cmds = engine.drainEngineCommands();
    REQUIRE (cmds.size() == 1);
    REQUIRE (cmds[0].value.value() == 2.0);
}

TEST_CASE ("Signed HID fields are sign-extended correctly", "[T2459-D2]")
{
    QuickJSEngine engine;
    REQUIRE_FALSE (engine.evaluate (readFile (kParserPath)).has_value());

    auto exc = engine.evaluate (
        "var rep = HID.registerInputReport(2, 4);"
        "globalThis.lastSigned = null;"
        "rep.addField({"
        "  id: 'jog',"
        "  byteOffset: 0,"
        "  bitOffset: 0,"
        "  sizeBits: 8,"
        "  signed: true,"
        "  callback: function(v) { globalThis.lastSigned = v; }"
        "});"
        // 0xFF as a signed 8-bit number is -1.
        "HID.dispatch(new Uint8Array([2, 0xFF, 0, 0]));"
        "engine.setValue('test', 'jog', globalThis.lastSigned);"
    );
    REQUIRE_FALSE (exc.has_value());
    auto cmds = engine.drainEngineCommands();
    REQUIRE (cmds.size() == 1);
    REQUIRE (cmds[0].value.value() == -1.0);
}

TEST_CASE ("Bit-aligned reads work across byte boundaries", "[T2459-D2]")
{
    QuickJSEngine engine;
    REQUIRE_FALSE (engine.evaluate (readFile (kParserPath)).has_value());

    auto exc = engine.evaluate (
        "var rep = HID.registerInputReport(0, 4);"  // no report ID prefix
        "globalThis.lastA = null; globalThis.lastB = null;"
        // Bytes: 0xAB 0xCD = 10101011 11001101
        // Field A: 4 bits @ byte0/bit0 → low nibble of 0xAB = 0xB = 11
        // Field B: 4 bits @ byte0/bit4 → high nibble of 0xAB = 0xA = 10
        "rep.addField({id:'a', byteOffset:0, bitOffset:0, sizeBits:4,"
        "  callback:function(v){globalThis.lastA = v;}});"
        "rep.addField({id:'b', byteOffset:0, bitOffset:4, sizeBits:4,"
        "  callback:function(v){globalThis.lastB = v;}});"
        "HID.dispatch(new Uint8Array([0xAB, 0xCD, 0, 0]));"
        "engine.setValue('test','a',globalThis.lastA);"
        "engine.setValue('test','b',globalThis.lastB);"
    );
    REQUIRE_FALSE (exc.has_value());
    auto cmds = engine.drainEngineCommands();
    REQUIRE (cmds.size() == 2);
    REQUIRE (cmds[0].value.value() == 11.0);
    REQUIRE (cmds[1].value.value() == 10.0);
}

TEST_CASE ("HID.clearRegistry resets between mappings", "[T2459-D2]")
{
    QuickJSEngine engine;
    REQUIRE_FALSE (engine.evaluate (readFile (kParserPath)).has_value());

    auto exc = engine.evaluate (
        "HID.registerInputReport(1, 8);"
        "var before = HID.getRegisteredReport(1);"
        "HID.clearRegistry();"
        "var after = HID.getRegisteredReport(1);"
        "engine.setValue('test', 'before', before === null ? 0 : 1);"
        "engine.setValue('test', 'after', after === null ? 0 : 1);"
    );
    REQUIRE_FALSE (exc.has_value());
    auto cmds = engine.drainEngineCommands();
    REQUIRE (cmds.size() == 2);
    REQUIRE (cmds[0].value.value() == 1.0);   // before clear: registered
    REQUIRE (cmds[1].value.value() == 0.0);   // after clear: gone
}

TEST_CASE ("HID dispatch on a missing report returns 0 without crashing", "[T2459-D2]")
{
    QuickJSEngine engine;
    REQUIRE_FALSE (engine.evaluate (readFile (kParserPath)).has_value());

    auto exc = engine.evaluate (
        "var changes = HID.dispatch(new Uint8Array([99, 0, 0]));"
        "engine.setValue('test', 'changes', changes);"
    );
    REQUIRE_FALSE (exc.has_value());
    auto cmds = engine.drainEngineCommands();
    REQUIRE (cmds.size() == 1);
    REQUIRE (cmds[0].value.value() == 0.0);
}

TEST_CASE ("HID field callback exceptions don't break dispatch", "[T2459-D2]")
{
    QuickJSEngine engine;
    REQUIRE_FALSE (engine.evaluate (readFile (kParserPath)).has_value());

    auto exc = engine.evaluate (
        "var rep = HID.registerInputReport(1, 4);"
        "globalThis.bField = null;"
        "rep.addField({id:'a', byteOffset:0, bitOffset:0, sizeBits:8,"
        "  callback:function(v){throw new Error('boom');}});"
        "rep.addField({id:'b', byteOffset:1, bitOffset:0, sizeBits:8,"
        "  callback:function(v){globalThis.bField = v;}});"
        "var changes = HID.dispatch(new Uint8Array([1, 0x10, 0x20, 0]));"
        // Even though field 'a' threw, field 'b' must still have fired.
        "engine.setValue('test', 'b', globalThis.bField);"
        "engine.setValue('test', 'changes', changes);"
    );
    REQUIRE_FALSE (exc.has_value());
    auto cmds = engine.drainEngineCommands();
    REQUIRE (cmds.size() == 2);
    REQUIRE (cmds[0].value.value() == 0x20);
    REQUIRE (cmds[1].value.value() == 2.0);   // both fields ran
}
