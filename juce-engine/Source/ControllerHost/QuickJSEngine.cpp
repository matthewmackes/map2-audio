// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform

#include "QuickJSEngine.h"
#include "EngineApiBindings.h"

#include <quickjs.h>

#include <cstring>
#include <iostream>
#include <stdexcept>

namespace map2::controller_host
{

namespace
{
ScriptException captureException (JSContext* ctx)
{
    ScriptException out;
    JSValue exc = JS_GetException (ctx);

    JSValue messageVal = JS_GetPropertyStr (ctx, exc, "message");
    if (! JS_IsUndefined (messageVal))
    {
        const char* s = JS_ToCString (ctx, messageVal);
        if (s) { out.message = s; JS_FreeCString (ctx, s); }
    }
    JS_FreeValue (ctx, messageVal);

    JSValue stackVal = JS_GetPropertyStr (ctx, exc, "stack");
    if (! JS_IsUndefined (stackVal))
    {
        const char* s = JS_ToCString (ctx, stackVal);
        if (s) { out.stack = s; JS_FreeCString (ctx, s); }
    }
    JS_FreeValue (ctx, stackVal);

    if (out.message.empty())
    {
        const char* s = JS_ToCString (ctx, exc);
        if (s) { out.message = s; JS_FreeCString (ctx, s); }
    }
    JS_FreeValue (ctx, exc);
    return out;
}
} // anonymous namespace

QuickJSEngine::QuickJSEngine()
{
    rt = JS_NewRuntime();
    if (rt == nullptr)
        throw std::runtime_error ("JS_NewRuntime failed");
    ctx = JS_NewContext (rt);
    if (ctx == nullptr)
    {
        JS_FreeRuntime (rt);
        rt = nullptr;
        throw std::runtime_error ("JS_NewContext failed");
    }
    // Stash the engine pointer in the runtime opaque so C callbacks can
    // recover it via JS_GetRuntimeOpaque.
    JS_SetRuntimeOpaque (rt, this);

    bindings = std::make_unique<EngineApiBindings> (*this);
    bindings->install (ctx);
}

QuickJSEngine::~QuickJSEngine()
{
    if (ctx != nullptr)
        JS_FreeContext (ctx);
    if (rt != nullptr)
        JS_FreeRuntime (rt);
    ctx = nullptr;
    rt = nullptr;
}

std::optional<ScriptException> QuickJSEngine::evaluate (
    const std::string& source, const std::string& filename)
{
    JSValue result = JS_Eval (ctx, source.data(), source.size(),
                              filename.c_str(), JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException (result))
    {
        auto exc = captureException (ctx);
        JS_FreeValue (ctx, result);
        return exc;
    }
    JS_FreeValue (ctx, result);
    return std::nullopt;
}

void QuickJSEngine::registerController (const std::string& controller_key)
{
    activeControllerKey = controller_key;
}

std::optional<ScriptException> QuickJSEngine::invokeIncomingData (
    const std::string& controller_key,
    const std::string& callback_name,
    const std::vector<std::uint8_t>& bytes)
{
    activeControllerKey = controller_key;

    JSValue global = JS_GetGlobalObject (ctx);
    JSValue cb = JS_GetPropertyStr (ctx, global, callback_name.c_str());
    if (! JS_IsFunction (ctx, cb))
    {
        JS_FreeValue (ctx, cb);
        JS_FreeValue (ctx, global);
        ScriptException out;
        out.message = "incoming-data callback '" + callback_name + "' is not a function";
        return out;
    }

    JSValue arr = JS_NewArrayBufferCopy (
        ctx,
        bytes.empty() ? nullptr : bytes.data(),
        bytes.size());
    JSValue args[1] = { arr };
    JSValue result = JS_Call (ctx, cb, JS_UNDEFINED, 1, args);

    JS_FreeValue (ctx, arr);
    JS_FreeValue (ctx, cb);
    JS_FreeValue (ctx, global);

    if (JS_IsException (result))
    {
        auto exc = captureException (ctx);
        JS_FreeValue (ctx, result);
        return exc;
    }
    JS_FreeValue (ctx, result);
    return std::nullopt;
}

std::vector<PendingEngineCommand> QuickJSEngine::drainEngineCommands()
{
    std::vector<PendingEngineCommand> out;
    out.swap (commandQueue);
    return out;
}

std::vector<PendingLogEvent> QuickJSEngine::drainLogs()
{
    std::vector<PendingLogEvent> out;
    out.swap (logQueue);
    return out;
}

void QuickJSEngine::recordEngineCommand (PendingEngineCommand cmd)
{
    commandQueue.push_back (std::move (cmd));
}

void QuickJSEngine::recordLog (PendingLogEvent ev)
{
    logQueue.push_back (std::move (ev));
}

} // namespace map2::controller_host
