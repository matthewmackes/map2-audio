// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform

#include "EngineApiBindings.h"
#include "QuickJSEngine.h"

#include <quickjs.h>

#include <string>

namespace map2::controller_host
{

namespace
{

QuickJSEngine* engineFromCtx (JSContext* ctx)
{
    JSRuntime* rt = JS_GetRuntime (ctx);
    return rt != nullptr ? static_cast<QuickJSEngine*> (JS_GetRuntimeOpaque (rt)) : nullptr;
}

std::string toStdString (JSContext* ctx, JSValueConst v)
{
    const char* s = JS_ToCString (ctx, v);
    if (s == nullptr) return {};
    std::string out (s);
    JS_FreeCString (ctx, s);
    return out;
}

std::optional<double> toOptionalDouble (JSContext* ctx, JSValueConst v)
{
    if (JS_IsUndefined (v) || JS_IsNull (v))
        return std::nullopt;
    double d = 0.0;
    if (JS_ToFloat64 (ctx, &d, v) == 0)
        return d;
    return std::nullopt;
}

// engine.setValue(target, action, value?)
JSValue js_engine_setValue (JSContext* ctx, JSValueConst /*this_val*/,
                             int argc, JSValueConst* argv)
{
    auto* engine = engineFromCtx (ctx);
    if (engine == nullptr || argc < 2)
        return JS_UNDEFINED;
    PendingEngineCommand cmd;
    cmd.controller_key = engine->getActiveControllerKey();
    cmd.target = toStdString (ctx, argv[0]);
    cmd.action = toStdString (ctx, argv[1]);
    if (argc >= 3)
        cmd.value = toOptionalDouble (ctx, argv[2]);
    engine->recordEngineCommand (std::move (cmd));
    return JS_UNDEFINED;
}

// engine.setParameter(target, key, normalised)
JSValue js_engine_setParameter (JSContext* ctx, JSValueConst /*this_val*/,
                                 int argc, JSValueConst* argv)
{
    auto* engine = engineFromCtx (ctx);
    if (engine == nullptr || argc < 3)
        return JS_UNDEFINED;
    PendingEngineCommand cmd;
    cmd.controller_key = engine->getActiveControllerKey();
    cmd.target = toStdString (ctx, argv[0]) + "." + toStdString (ctx, argv[1]);
    cmd.action = "setParameter";
    cmd.value = toOptionalDouble (ctx, argv[2]);
    engine->recordEngineCommand (std::move (cmd));
    return JS_UNDEFINED;
}

// engine.trigger(group, key)
JSValue js_engine_trigger (JSContext* ctx, JSValueConst /*this_val*/,
                            int argc, JSValueConst* argv)
{
    auto* engine = engineFromCtx (ctx);
    if (engine == nullptr || argc < 2)
        return JS_UNDEFINED;
    PendingEngineCommand cmd;
    cmd.controller_key = engine->getActiveControllerKey();
    cmd.target = toStdString (ctx, argv[0]);
    cmd.action = "trigger:" + toStdString (ctx, argv[1]);
    engine->recordEngineCommand (std::move (cmd));
    return JS_UNDEFINED;
}

// engine.getValue(group, key) — returns 0.0 by default. The IPC
// round-trip needed for synchronous reads (wait-for-reply pattern via
// promise) lands in T2459-B2-followup. Until then, JS-side reads
// return 0; this matches Mixxx behaviour for a not-yet-connected
// ControlObject.
JSValue js_engine_getValue (JSContext* ctx, JSValueConst /*this_val*/,
                             int /*argc*/, JSValueConst* /*argv*/)
{
    return JS_NewFloat64 (ctx, 0.0);
}

JSValue js_engine_getParameter (JSContext* ctx, JSValueConst /*this_val*/,
                                 int /*argc*/, JSValueConst* /*argv*/)
{
    return JS_NewFloat64 (ctx, 0.0);
}

// engine.log(message)        → level=info
// engine.logInfo(message)    → level=info
// engine.logWarning(message) → level=warning
// engine.logError(message)   → level=error
// engine.logDebug(message)   → level=debug
template <const char* LEVEL>
JSValue js_engine_log_impl (JSContext* ctx, JSValueConst /*this_val*/,
                             int argc, JSValueConst* argv)
{
    auto* engine = engineFromCtx (ctx);
    if (engine == nullptr || argc < 1)
        return JS_UNDEFINED;
    PendingLogEvent ev;
    ev.controller_key = engine->getActiveControllerKey();
    ev.level = LEVEL;
    ev.message = toStdString (ctx, argv[0]);
    engine->recordLog (std::move (ev));
    return JS_UNDEFINED;
}

constexpr char kLevelInfo[] = "info";
constexpr char kLevelWarning[] = "warning";
constexpr char kLevelError[] = "error";
constexpr char kLevelDebug[] = "debug";

// Stubs for not-yet-implemented Mixxx surface.
JSValue js_engine_noop (JSContext* /*ctx*/, JSValueConst /*this_val*/,
                         int /*argc*/, JSValueConst* /*argv*/)
{
    return JS_UNDEFINED;
}

} // anonymous namespace

EngineApiBindings::EngineApiBindings (QuickJSEngine& ownerIn) : owner (ownerIn) {}

void EngineApiBindings::install (JSContext* ctx)
{
    JSValue global = JS_GetGlobalObject (ctx);
    JSValue engineObj = JS_NewObject (ctx);

    auto bindFn = [&] (const char* name, JSCFunction* fn, int nargs) {
        JS_SetPropertyStr (ctx, engineObj, name,
                            JS_NewCFunction (ctx, fn, name, nargs));
    };

    bindFn ("setValue",     js_engine_setValue,     3);
    bindFn ("getValue",     js_engine_getValue,     2);
    bindFn ("setParameter", js_engine_setParameter, 3);
    bindFn ("getParameter", js_engine_getParameter, 2);
    bindFn ("trigger",      js_engine_trigger,      2);

    bindFn ("log",        js_engine_log_impl<kLevelInfo>,    1);
    bindFn ("logInfo",    js_engine_log_impl<kLevelInfo>,    1);
    bindFn ("logWarning", js_engine_log_impl<kLevelWarning>, 1);
    bindFn ("logError",   js_engine_log_impl<kLevelError>,   1);
    bindFn ("logDebug",   js_engine_log_impl<kLevelDebug>,   1);

    // Stubs — accept Mixxx-style calls without crashing scripts that
    // use them. Real implementation lands in T2459-B2-followup or B5.
    bindFn ("connectControl",   js_engine_noop, 4);
    bindFn ("makeConnection",   js_engine_noop, 3);
    bindFn ("beginTimer",       js_engine_noop, 3);
    bindFn ("stopTimer",        js_engine_noop, 1);
    bindFn ("softTakeover",     js_engine_noop, 3);
    bindFn ("softTakeoverIgnoreNextValue", js_engine_noop, 2);
    bindFn ("scratchEnable",    js_engine_noop, 6);
    bindFn ("scratchTick",      js_engine_noop, 2);
    bindFn ("scratchDisable",   js_engine_noop, 2);
    bindFn ("isScratching",     js_engine_noop, 1);
    bindFn ("brake",            js_engine_noop, 4);
    bindFn ("spinback",         js_engine_noop, 4);
    bindFn ("softStart",        js_engine_noop, 3);
    bindFn ("getSetting",       js_engine_noop, 1);

    JS_SetPropertyStr (ctx, global, "engine", engineObj);
    JS_FreeValue (ctx, global);
}

} // namespace map2::controller_host
