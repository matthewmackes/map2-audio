// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// EngineApiBindings — installs the global `engine` host object into a
// QuickJS context. Mirrors the Mixxx ControllerScriptInterfaceLegacy
// API surface (GPLv2-or-later, used as architectural reference only).
//
// Surfaces:
//   engine.setValue(group, key, value)
//   engine.getValue(group, key)
//   engine.setParameter(group, key, normalised)
//   engine.getParameter(group, key)
//   engine.trigger(group, key)
//   engine.log(message)         | engine.logInfo / logWarning / logError
//   engine.connectControl(group, key, callback)        — stub (T2459-B2-followup)
//   engine.makeConnection(group, key, callback)        — stub
//   engine.beginTimer(ms, callback, oneShot)           — stub
//   engine.stopTimer(timerId)                          — stub
//   engine.softTakeover(group, key, set)               — stub
//   engine.scratchEnable / scratchTick / scratchDisable — stub
//
// Worklist: T2459-B2

#pragma once

#include <string>

extern "C"
{
struct JSContext;
}

namespace map2::controller_host
{

class QuickJSEngine;

class EngineApiBindings
{
public:
    explicit EngineApiBindings (QuickJSEngine& owner);

    /** Install the global `engine` object into the given JS context.
     *  Called once per QuickJSEngine instance from its constructor.
     */
    void install (JSContext* ctx);

    QuickJSEngine& getOwner() noexcept { return owner; }

private:
    QuickJSEngine& owner;
};

} // namespace map2::controller_host
