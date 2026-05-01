// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2MappingEngine — Mixxx-pattern mapping engine inside map2-controller-host.
// Worklist: T2459-H2
// Architecture: docs/architecture/CONTROLLER_LAYER.md §6, §7
//
// Owns one QuickJSEngine per host process (QuickJS is single-threaded).
// Loads a MappingDescriptor (XML+JS pair from the Mixxx XML reader, or a
// MAP2-native YAML profile) into the engine, registers any global
// callbacks the descriptor's controls reference, and drives incoming
// MIDI bytes through the matching JS function.
//
// JS host surface (matches the Mixxx ControllerEngine contract):
//   engine.setValue(group, key, value)
//   engine.getValue(group, key)
//   engine.trigger(group, key)
//   engine.log(message), logInfo, logWarning, logError, logDebug
//   midi.sendShortMsg(status, note_or_cc, velocity_or_value)
//   midi.sendSysexMsg(byteArray, length?)
//
// The `engine.*` surface is wired by EngineApiBindings (T2459-B2). H2
// adds the `midi.*` surface and the orchestration that connects an
// incoming MIDI message to the right global callback name declared in
// the mapping descriptor's controls table.

#pragma once

#include "ControlObjectBridge.h"
#include "../QuickJSEngine.h"

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

namespace map2::controller_host {

// Wire-form descriptor. Mirrors Python MappingDescriptor + the IPC
// MappingActivate payload. The host receives this from the Python
// backend and feeds it to Map2MappingEngine::loadDescriptor().
struct MappingControlSpec
{
    std::optional<int> status;
    std::optional<int> midino;
    std::optional<int> channel;
    std::optional<std::string> target;
    std::optional<std::string> action;
    std::optional<std::string> script;     // global JS function name to call
    bool fast_path = false;
    std::string description;
};

struct MappingDescriptorSpec
{
    std::string pack_id;
    std::string model;
    std::string kind;                      // "midi" | "hid"
    std::vector<std::string> scripts;      // JS source bodies, in load order
    std::vector<MappingControlSpec> controls;
    std::vector<MappingControlSpec> outputs;
    ControlObjectBridge::AliasTable mixxx_alias_table;
};

// Outbound short MIDI message produced by midi.sendShortMsg().
struct OutboundShortMidi
{
    std::string controller_key;
    std::uint8_t status;
    std::uint8_t data1;
    std::uint8_t data2;
};

// Outbound SysEx message produced by midi.sendSysexMsg().
struct OutboundSysExMidi
{
    std::string controller_key;
    std::vector<std::uint8_t> bytes;
};

class Map2MappingEngine
{
public:
    Map2MappingEngine();
    ~Map2MappingEngine();

    Map2MappingEngine (const Map2MappingEngine&)            = delete;
    Map2MappingEngine& operator= (const Map2MappingEngine&) = delete;

    // Initialise the underlying QuickJS engine + install the engine.*
    // and midi.* host objects on the global. Idempotent.
    bool initialise();

    // Load a mapping descriptor for a controller_key. Evaluates each
    // script in order; on first failure, returns the exception and
    // does NOT mark the controller active. A successful load
    // overwrites any prior descriptor for the same controller_key.
    std::optional<ScriptException> loadDescriptor (
        const std::string& controller_key,
        const MappingDescriptorSpec& descriptor);

    // T2482-P1.2 Gap F (iter 64) — drop the descriptor for a controller_key.
    // Returns true iff a descriptor was removed (false when the
    // controller_key wasn't loaded). After unload, planDispatch()
    // returns matched=false for that controller and the host's
    // pass-through path emits ControllerEvent IPC frames for
    // inbound MIDI/HID instead of routing through JS.
    bool unloadDescriptor (const std::string& controller_key);

    // Hot-reload the descriptor — atomic unload + load. The internal
    // map is updated only on a successful re-load (parser/script
    // exception during reload leaves the prior descriptor active so
    // the controller doesn't drop traffic mid-edit).
    std::optional<ScriptException> reloadDescriptor (
        const std::string& controller_key,
        const MappingDescriptorSpec& descriptor);

    // Look up the JS callback for an incoming MIDI message. The
    // mapping descriptor's controls table maps (status, midino,
    // channel) tuples to script function names; this method finds
    // the match (if any) and returns the function name plus the
    // resolved `target` (via the alias bridge) so the caller can
    // route the dispatch.
    struct DispatchPlan
    {
        std::string controller_key;
        std::string callback_name;     // JS global function name
        std::optional<std::string> resolved_target; // post-bridge target
        bool matched = false;
    };
    DispatchPlan planDispatch (const std::string& controller_key,
                                std::uint8_t status,
                                std::uint8_t data1,
                                std::uint8_t channel) const;

    // Invoke a previously-planned dispatch. Forwards the raw bytes to
    // the JS handler and returns any exception. Drains the engine
    // command + log queues into the QuickJSEngine accessor.
    std::optional<ScriptException> dispatch (
        const std::string& controller_key,
        const std::string& callback_name,
        const std::vector<std::uint8_t>& bytes);

    // Drain outbound MIDI queued by the JS via midi.send*.
    std::vector<OutboundShortMidi>  drainShortMidi();
    std::vector<OutboundSysExMidi>  drainSysExMidi();

    // Bridge accessor — exposed for tests + per-pack alias_table updates.
    ControlObjectBridge& bridge() noexcept { return bridge_; }

    // Underlying QuickJSEngine accessor — exposed for the JS bindings
    // installation step + the EngineCommand drain on the IPC writer.
    QuickJSEngine& js() noexcept { return js_; }

    // Internal accessors used by the midi.* JS bindings to enqueue
    // outbound messages.
    void recordShortMidi (OutboundShortMidi msg);
    void recordSysExMidi (OutboundSysExMidi msg);

private:
    QuickJSEngine js_;
    ControlObjectBridge bridge_;
    bool installed_ = false;

    // Per-controller descriptor cache. Keyed by controller_key.
    struct LoadedController {
        MappingDescriptorSpec descriptor;
    };
    std::unordered_map<std::string, LoadedController> controllers_;

    // Outbound MIDI queues, drained by the IPC writer.
    std::vector<OutboundShortMidi> shortQueue_;
    std::vector<OutboundSysExMidi> sysexQueue_;

    void installMidiBindings();
};

} // namespace map2::controller_host
