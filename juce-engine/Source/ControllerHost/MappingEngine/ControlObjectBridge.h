// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// ControlObjectBridge — Mixxx ControlObject (group, key) → MAP2 engine
// target resolver. C++ mirror of app/services/controllers/mixxx_control_object_bridge.py.
//
// Worklist: T2459-H2
// Architecture: docs/architecture/CONTROLLER_LAYER.md §6.4
//
// License posture: the WELL_KNOWN table is a *re-implementation* of the
// pattern Mixxx uses internally. We map the same string keys to MAP2's
// engine-target namespace because that's the only practical way for
// Mixxx-imported XML mappings to drive MAP2 audio without rewriting
// every script. The Mixxx imports themselves are GPLv2-or-later and
// preserved with attribution; the bridge is MAP2-original code.
//
// Resolution order matches the Python:
//   1. Per-pack alias_table override (group → chain prefix)
//   2. WELL_KNOWN[(group, key)]
//   3. Unsupported → fail-soft with reason
//   4. Unknown → fail-soft with reason

#pragma once

#include <optional>
#include <string>
#include <unordered_map>

namespace map2::controller_host {

struct BridgeResult
{
    std::optional<std::string> target;       // present iff resolved
    std::string                fail_soft_reason; // empty when resolved
    bool resolved() const noexcept { return target.has_value(); }
};

class ControlObjectBridge
{
public:
    // The per-pack alias_table maps a Mixxx group ("[Channel1]") to a
    // MAP2 chain prefix ("audio.chain.7"). When set, group lookups use
    // the alias prefix concatenated with the Mixxx key.
    using AliasTable = std::unordered_map<std::string, std::string>;

    ControlObjectBridge();

    // Set the active per-pack alias table. Empty = use WELL_KNOWN only.
    void setAliasTable (AliasTable table) { aliasTable_ = std::move (table); }
    const AliasTable& aliasTable() const noexcept { return aliasTable_; }

    // Resolve a Mixxx (group, key) tuple to a MAP2 engine target.
    BridgeResult resolve (const std::string& group, const std::string& key) const;

    // True when the key is in the platform's unsupported set
    // (scratch_position, beatgrid_translate, etc.).
    static bool isUnsupportedKey (const std::string& key);

    // Lookup against WELL_KNOWN only; bypasses the alias table. Returns
    // empty optional when the (group, key) pair has no entry.
    static std::optional<std::string> wellKnownLookup (const std::string& group,
                                                       const std::string& key);

private:
    AliasTable aliasTable_;
};

} // namespace map2::controller_host
