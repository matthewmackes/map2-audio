// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2MappingEngine implementation.
// Worklist: T2459-H2

#include "Map2MappingEngine.h"

#include <quickjs.h>

#include <cstring>

namespace map2::controller_host {

namespace {

// Retrieve the Map2MappingEngine* stashed on the JSContext's opaque
// pointer. Set by Map2MappingEngine::installMidiBindings().
Map2MappingEngine* engineFor (JSContext* ctx)
{
    return reinterpret_cast<Map2MappingEngine*> (JS_GetContextOpaque (ctx));
}

JSValue js_midi_sendShortMsg (JSContext* ctx, JSValueConst /*this_val*/,
                              int argc, JSValueConst* argv)
{
    if (argc < 3) return JS_UNDEFINED;
    int32_t status = 0, data1 = 0, data2 = 0;
    JS_ToInt32 (ctx, &status, argv[0]);
    JS_ToInt32 (ctx, &data1,  argv[1]);
    JS_ToInt32 (ctx, &data2,  argv[2]);

    auto* engine = engineFor (ctx);
    if (engine != nullptr)
    {
        OutboundShortMidi msg;
        msg.controller_key = engine->js().getActiveControllerKey();
        msg.status = static_cast<std::uint8_t> (status & 0xFF);
        msg.data1  = static_cast<std::uint8_t> (data1 & 0x7F);
        msg.data2  = static_cast<std::uint8_t> (data2 & 0x7F);
        engine->recordShortMidi (std::move (msg));
    }
    return JS_UNDEFINED;
}

JSValue js_midi_sendSysexMsg (JSContext* ctx, JSValueConst /*this_val*/,
                              int argc, JSValueConst* argv)
{
    if (argc < 1) return JS_UNDEFINED;

    OutboundSysExMidi msg;
    auto* engine = engineFor (ctx);
    if (engine != nullptr)
        msg.controller_key = engine->js().getActiveControllerKey();

    // Accept both Array and Uint8Array. We poke at the first argument's
    // length property + index it as a 0..255 integer per element.
    JSValue arr = argv[0];
    JSValue lenVal = JS_GetPropertyStr (ctx, arr, "length");
    int32_t length = 0;
    JS_ToInt32 (ctx, &length, lenVal);
    JS_FreeValue (ctx, lenVal);

    // Optional second arg overrides length (Mixxx-compatible).
    if (argc >= 2)
    {
        int32_t override_len = length;
        JS_ToInt32 (ctx, &override_len, argv[1]);
        if (override_len > 0 && override_len < length) length = override_len;
    }

    if (length > 0 && length <= 65535)
    {
        msg.bytes.reserve (static_cast<std::size_t> (length));
        for (int32_t i = 0; i < length; ++i)
        {
            JSValue elem = JS_GetPropertyUint32 (ctx, arr, static_cast<uint32_t> (i));
            int32_t b = 0;
            JS_ToInt32 (ctx, &b, elem);
            JS_FreeValue (ctx, elem);
            msg.bytes.push_back (static_cast<std::uint8_t> (b & 0xFF));
        }
    }

    if (engine != nullptr)
        engine->recordSysExMidi (std::move (msg));
    return JS_UNDEFINED;
}

} // namespace

Map2MappingEngine::Map2MappingEngine() = default;
Map2MappingEngine::~Map2MappingEngine() = default;

bool Map2MappingEngine::initialise()
{
    if (installed_) return true;
    // Stash the engine pointer on the JSContext opaque so the
    // host bindings can recover it without a global.
    JS_SetContextOpaque (js_.getContext(), this);
    installMidiBindings();
    installed_ = true;
    return true;
}

void Map2MappingEngine::installMidiBindings()
{
    JSContext* ctx = js_.getContext();
    JSValue global = JS_GetGlobalObject (ctx);
    JSValue midiObj = JS_NewObject (ctx);

    auto bindFn = [&] (const char* name, JSCFunction* fn, int nargs) {
        JS_SetPropertyStr (ctx, midiObj, name,
                            JS_NewCFunction (ctx, fn, name, nargs));
    };

    bindFn ("sendShortMsg", js_midi_sendShortMsg, 3);
    bindFn ("sendSysexMsg", js_midi_sendSysexMsg, 2);

    JS_SetPropertyStr (ctx, global, "midi", midiObj);
    JS_FreeValue (ctx, global);
}

std::optional<ScriptException> Map2MappingEngine::loadDescriptor (
    const std::string& controller_key,
    const MappingDescriptorSpec& descriptor)
{
    if (! installed_) initialise();

    js_.registerController (controller_key);
    js_.setActiveControllerKey (controller_key);

    // Apply the per-pack alias table to the bridge.
    bridge_.setAliasTable (descriptor.mixxx_alias_table);

    // Evaluate each script body in order. First failure returns the
    // exception; do NOT cache the descriptor in that case (the
    // controller's prior descriptor stays effective).
    for (std::size_t i = 0; i < descriptor.scripts.size(); ++i)
    {
        const std::string fname = descriptor.pack_id + "/" + descriptor.model
                                + ".script[" + std::to_string (i) + "]";
        if (auto exc = js_.evaluate (descriptor.scripts[i], fname))
            return exc;
    }

    controllers_[controller_key] = LoadedController{ descriptor };
    return std::nullopt;
}

Map2MappingEngine::DispatchPlan Map2MappingEngine::planDispatch (
    const std::string& controller_key,
    std::uint8_t status,
    std::uint8_t data1,
    std::uint8_t channel) const
{
    DispatchPlan plan;
    plan.controller_key = controller_key;
    const auto it = controllers_.find (controller_key);
    if (it == controllers_.end()) return plan;

    for (const auto& ctrl : it->second.descriptor.controls)
    {
        if (ctrl.status.has_value() && static_cast<std::uint8_t> (*ctrl.status) != status)
            continue;
        if (ctrl.midino.has_value() && static_cast<std::uint8_t> (*ctrl.midino) != data1)
            continue;
        if (ctrl.channel.has_value() && static_cast<std::uint8_t> (*ctrl.channel) != channel)
            continue;
        if (ctrl.script.has_value())
            plan.callback_name = *ctrl.script;
        if (ctrl.target.has_value())
        {
            // Direct binding — target is already resolved by the
            // Python side. Pass through.
            plan.resolved_target = *ctrl.target;
        }
        plan.matched = true;
        return plan;
    }
    return plan;
}

std::optional<ScriptException> Map2MappingEngine::dispatch (
    const std::string& controller_key,
    const std::string& callback_name,
    const std::vector<std::uint8_t>& bytes)
{
    js_.setActiveControllerKey (controller_key);

    // Mixxx-style mappings name callbacks as dotted paths
    // ("PackName.onCC7"). The base QuickJSEngine::invokeIncomingData
    // only resolves top-level globals, so we walk the dots ourselves
    // and eval the call. Bytes are stashed on `__map2_dispatch_bytes`
    // so the JS callee can access them as an Array.
    JSContext* ctx = js_.getContext();

    // Build a JS array with the byte payload. Allocations here are
    // off the libremidi I/O thread (host main loop drives dispatch
    // after the producer has already pushed to the ring), so this
    // is allocation-acceptable.
    JSValue arr = JS_NewArray (ctx);
    for (std::size_t i = 0; i < bytes.size(); ++i)
        JS_SetPropertyUint32 (ctx, arr, static_cast<uint32_t> (i),
                              JS_NewInt32 (ctx, bytes[i]));
    JSValue global = JS_GetGlobalObject (ctx);
    JS_SetPropertyStr (ctx, global, "__map2_dispatch_bytes", arr);
    JS_FreeValue (ctx, global);

    const std::string call =
        "(typeof " + callback_name + " === 'function')"
        " ? " + callback_name + "(__map2_dispatch_bytes)"
        " : (function(){ throw new Error('callback " + callback_name + " is not a function'); })()";
    return js_.evaluate (call, "<dispatch:" + callback_name + ">");
}

std::vector<OutboundShortMidi> Map2MappingEngine::drainShortMidi()
{
    std::vector<OutboundShortMidi> out;
    out.swap (shortQueue_);
    return out;
}

std::vector<OutboundSysExMidi> Map2MappingEngine::drainSysExMidi()
{
    std::vector<OutboundSysExMidi> out;
    out.swap (sysexQueue_);
    return out;
}

void Map2MappingEngine::recordShortMidi (OutboundShortMidi msg)
{
    shortQueue_.push_back (std::move (msg));
}

void Map2MappingEngine::recordSysExMidi (OutboundSysExMidi msg)
{
    sysexQueue_.push_back (std::move (msg));
}

} // namespace map2::controller_host
