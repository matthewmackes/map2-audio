// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// QuickJSEngine smoke tests — T2459-B2 acceptance gate.

#include <catch2/catch_test_macros.hpp>

#include "ControllerHost/QuickJSEngine.h"

using map2::controller_host::PendingEngineCommand;
using map2::controller_host::PendingLogEvent;
using map2::controller_host::QuickJSEngine;
using map2::controller_host::ScriptException;

TEST_CASE ("QuickJSEngine constructs and evaluates trivial JS", "[T2459-B2]")
{
    QuickJSEngine engine;
    auto exc = engine.evaluate ("1 + 1;");
    REQUIRE_FALSE (exc.has_value());
}

TEST_CASE ("engine.setValue records a PendingEngineCommand", "[T2459-B2]")
{
    QuickJSEngine engine;
    engine.setActiveControllerKey ("k1");
    auto exc = engine.evaluate (
        "engine.setValue('audio.chain.1.volume', 'set', 0.7);");
    REQUIRE_FALSE (exc.has_value());

    auto commands = engine.drainEngineCommands();
    REQUIRE (commands.size() == 1);
    REQUIRE (commands[0].controller_key == "k1");
    REQUIRE (commands[0].target == "audio.chain.1.volume");
    REQUIRE (commands[0].action == "set");
    REQUIRE (commands[0].value.has_value());
    REQUIRE (commands[0].value.value() == 0.7);
}

TEST_CASE ("engine.setParameter joins group + key", "[T2459-B2]")
{
    QuickJSEngine engine;
    engine.setActiveControllerKey ("k2");
    auto exc = engine.evaluate (
        "engine.setParameter('audio.chain.1', 'volume', 0.5);");
    REQUIRE_FALSE (exc.has_value());
    auto commands = engine.drainEngineCommands();
    REQUIRE (commands.size() == 1);
    REQUIRE (commands[0].target == "audio.chain.1.volume");
    REQUIRE (commands[0].action == "setParameter");
    REQUIRE (commands[0].value.value() == 0.5);
}

TEST_CASE ("engine.trigger emits an action with trigger: prefix", "[T2459-B2]")
{
    QuickJSEngine engine;
    engine.setActiveControllerKey ("k3");
    auto exc = engine.evaluate (
        "engine.trigger('audio.chain.1', 'reset');");
    REQUIRE_FALSE (exc.has_value());
    auto commands = engine.drainEngineCommands();
    REQUIRE (commands.size() == 1);
    REQUIRE (commands[0].target == "audio.chain.1");
    REQUIRE (commands[0].action == "trigger:reset");
}

TEST_CASE ("engine.log records a PendingLogEvent", "[T2459-B2]")
{
    QuickJSEngine engine;
    engine.setActiveControllerKey ("k4");
    auto exc = engine.evaluate ("engine.log('hello world');");
    REQUIRE_FALSE (exc.has_value());

    auto logs = engine.drainLogs();
    REQUIRE (logs.size() == 1);
    REQUIRE (logs[0].controller_key == "k4");
    REQUIRE (logs[0].level == "info");
    REQUIRE (logs[0].message == "hello world");
}

TEST_CASE ("engine.logWarning + logError set distinct levels", "[T2459-B2]")
{
    QuickJSEngine engine;
    engine.setActiveControllerKey ("k5");
    auto exc = engine.evaluate (
        "engine.logWarning('warn'); engine.logError('err'); engine.logDebug('dbg');");
    REQUIRE_FALSE (exc.has_value());
    auto logs = engine.drainLogs();
    REQUIRE (logs.size() == 3);
    REQUIRE (logs[0].level == "warning");
    REQUIRE (logs[1].level == "error");
    REQUIRE (logs[2].level == "debug");
}

TEST_CASE ("Mixxx-pattern stub functions accept calls without crashing", "[T2459-B2]")
{
    QuickJSEngine engine;
    auto exc = engine.evaluate (
        "engine.connectControl('a', 'b', function(){}, true);"
        "engine.makeConnection('a', 'b', function(){});"
        "var t = engine.beginTimer(100, function(){}, false);"
        "engine.stopTimer(t);"
        "engine.softTakeover('a', 'b', true);"
        "engine.scratchEnable(1, 2048, 33+1/3, 1.0/8, 1.0/8/32);"
        "engine.scratchTick(1, 100);"
        "engine.scratchDisable(1, true);"
        "engine.brake(1, true, 8);"
        "engine.spinback(1, true, 8);"
        "engine.softStart(1, true);");
    REQUIRE_FALSE (exc.has_value());
}

TEST_CASE ("Syntax error in JS surfaces as ScriptException", "[T2459-B2]")
{
    QuickJSEngine engine;
    auto exc = engine.evaluate ("this is not valid javascript;");
    REQUIRE (exc.has_value());
    REQUIRE_FALSE (exc->message.empty());
}

TEST_CASE ("Runtime exception in JS surfaces as ScriptException", "[T2459-B2]")
{
    QuickJSEngine engine;
    auto exc = engine.evaluate ("throw new Error('boom');");
    REQUIRE (exc.has_value());
    REQUIRE (exc->message.find ("boom") != std::string::npos);
}

TEST_CASE ("invokeIncomingData calls a JS function with bytes", "[T2459-B2]")
{
    QuickJSEngine engine;
    engine.setActiveControllerKey ("k6");
    auto exc = engine.evaluate (
        "globalThis.received = null;"
        "globalThis.HandleEvent = function(buf) {"
        "  var bytes = new Uint8Array(buf);"
        "  globalThis.received = [bytes[0], bytes[1], bytes[2]];"
        "  engine.setValue('chain.1.volume', 'set', bytes[2] / 127.0);"
        "};");
    REQUIRE_FALSE (exc.has_value());

    std::vector<std::uint8_t> bytes = { 0xB0, 7, 100 };
    exc = engine.invokeIncomingData ("k6", "HandleEvent", bytes);
    REQUIRE_FALSE (exc.has_value());

    auto commands = engine.drainEngineCommands();
    REQUIRE (commands.size() == 1);
    REQUIRE (commands[0].target == "chain.1.volume");
    REQUIRE (commands[0].value.has_value());
    REQUIRE (commands[0].value.value() == 100.0 / 127.0);
}

TEST_CASE ("invokeIncomingData on missing callback surfaces an error", "[T2459-B2]")
{
    QuickJSEngine engine;
    auto exc = engine.invokeIncomingData ("k7", "DoesNotExist", {});
    REQUIRE (exc.has_value());
    REQUIRE (exc->message.find ("DoesNotExist") != std::string::npos);
}

TEST_CASE ("Multiple controllers share one engine but have isolated active keys",
           "[T2459-B2]")
{
    QuickJSEngine engine;
    engine.setActiveControllerKey ("ctrl-a");
    engine.evaluate ("engine.log('from a');");
    engine.setActiveControllerKey ("ctrl-b");
    engine.evaluate ("engine.log('from b');");
    auto logs = engine.drainLogs();
    REQUIRE (logs.size() == 2);
    REQUIRE (logs[0].controller_key == "ctrl-a");
    REQUIRE (logs[1].controller_key == "ctrl-b");
}
