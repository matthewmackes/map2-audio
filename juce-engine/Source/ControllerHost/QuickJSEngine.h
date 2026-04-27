// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// QuickJSEngine — embeds Bellard's QuickJS into map2-controller-host to
// execute mapping JavaScript in a sandboxed, separate-process runtime.
//
// The engine never links into map2_audio_engine — a buggy mapping must
// not be able to take down audio. See docs/architecture/CONTROLLER_LAYER.md
// §3 for the crash-isolation budget.
//
// Pattern reference: Mixxx ControllerScriptEngineLegacy (GPLv2-or-later)
// uses Qt's QJSEngine. We use QuickJS for the same reasons Mixxx uses
// QJSEngine: V8-class ECMAScript with predictable single-threaded
// execution, low memory overhead, no Qt dependency.
//
// Worklist: T2459-B2

#pragma once

#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

extern "C"
{
struct JSContext;
struct JSRuntime;
struct JSValue;
}

namespace map2::controller_host
{

class EngineApiBindings;

/** A single JS exception caught by the engine. */
struct ScriptException
{
    std::string message;
    std::string stack;
    std::string file;
    int line = 0;
    int column = 0;
};

/** Outbound EngineCommand assembled by the JS-side `engine.setValue(...)` /
 *  `engine.trigger(...)` etc. and forwarded to the IPC writer.
 */
struct PendingEngineCommand
{
    std::string controller_key;
    std::string target;
    std::string action;
    std::optional<double> value;
    std::vector<std::string> args;
};

/** Outbound LogEvent from `engine.log("…")`. */
struct PendingLogEvent
{
    std::string controller_key;
    std::string level;     // "debug" | "info" | "warning" | "error"
    std::string message;
};

class QuickJSEngine
{
public:
    QuickJSEngine();
    ~QuickJSEngine();

    QuickJSEngine (const QuickJSEngine&) = delete;
    QuickJSEngine& operator= (const QuickJSEngine&) = delete;

    /** Evaluate a JS source body. Returns an empty optional on success
     *  or the captured exception on failure.
     */
    std::optional<ScriptException> evaluate (
        const std::string& source,
        const std::string& filename = "<anonymous>");

    /** Bind a controller_key to a fresh JS scope. Subsequent calls to
     *  invokeIncomingData(controller_key, …) will run inside that scope.
     *  Idempotent — re-binding overwrites any previous scope.
     */
    void registerController (const std::string& controller_key);

    /** Call a global `engine.<name>` callback with a single Uint8Array
     *  argument carrying the raw MIDI/HID/bulk bytes. Returns the
     *  exception (if any) or an empty optional on success.
     *
     *  This is the path used by the MIDI dispatcher to deliver events
     *  to JS mappings. The matching JS handler is registered by the
     *  mapping script via the `engine` host object's
     *  registerIncomingData(name, fn) helper (set up in
     *  EngineApiBindings).
     */
    std::optional<ScriptException> invokeIncomingData (
        const std::string& controller_key,
        const std::string& callback_name,
        const std::vector<std::uint8_t>& bytes);

    /** Drain the EngineCommand queue accumulated during the most recent
     *  evaluate / invokeIncomingData call. Caller serializes these to
     *  IPC frames bound for map2-backend.
     */
    std::vector<PendingEngineCommand> drainEngineCommands();

    /** Drain the LogEvent queue. */
    std::vector<PendingLogEvent> drainLogs();

    // ---- Internal accessors used by the host bindings (engine.*) ----
    JSContext* getContext() noexcept { return ctx; }
    void recordEngineCommand (PendingEngineCommand cmd);
    void recordLog (PendingLogEvent ev);
    void setActiveControllerKey (std::string key) { activeControllerKey = std::move (key); }
    const std::string& getActiveControllerKey() const noexcept { return activeControllerKey; }

private:
    JSRuntime* rt = nullptr;
    JSContext* ctx = nullptr;
    std::unique_ptr<EngineApiBindings> bindings;
    std::vector<PendingEngineCommand> commandQueue;
    std::vector<PendingLogEvent> logQueue;
    std::string activeControllerKey;
};

} // namespace map2::controller_host
