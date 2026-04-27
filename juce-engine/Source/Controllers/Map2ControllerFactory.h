// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2ControllerFactory — protocol-aware controller construction.
//
// Given a ControllerIdentity (with protocol field set), the factory
// constructs the appropriate Map2Controller subclass:
//   - "midi" → Map2MidiController (T2459-B1)
//   - "hid"  → Map2HidController  (T2459-D1) — lives in controller-host
//   - "bulk" → Map2BulkController (T2459-D3) — lives in controller-host
//
// HID and bulk are constructed in the map2-controller-host process; the
// audio engine never sees them. This factory only constructs MIDI
// controllers in-engine. Controller-host has its own factory.
//
// See: docs/architecture/CONTROLLER_LAYER.md §3, §4
//      Worklist: T2459-A2

#pragma once

#include "Map2Controller.h"

#include <memory>

namespace map2::controllers
{

class Map2ControllerFactory
{
public:
    /** Construct a Map2Controller for the given identity.
     *
     *  @returns a unique_ptr to the constructed controller, or nullptr if
     *           the protocol is unsupported in this process. (HID and
     *           bulk are unsupported in the audio engine; the in-engine
     *           factory returns nullptr for those, and the controller-
     *           host process has its own factory.)
     */
    static std::unique_ptr<Map2Controller> create (const ControllerIdentity& identity);
};

} // namespace map2::controllers
