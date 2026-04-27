// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Map2Controller — abstract base class implementation.
// See Map2Controller.h for the contract.

#include "Map2Controller.h"

namespace map2::controllers
{

Map2Controller::Map2Controller (ControllerIdentity identityIn)
    : identity (std::move (identityIn))
{
}

Map2Controller::~Map2Controller()
{
    // Subclasses are expected to have called close() in their own destructor
    // before the base destructor runs. We don't call close() here because
    // it's pure virtual.
    jassert (! opened.load (std::memory_order_acquire));
}

void Map2Controller::addFastPathBinding (const FastPathBinding& binding)
{
    const juce::ScopedLock sl (fastPathLock);
    fastPathBindings.push_back (binding);
}

void Map2Controller::clearFastPathBindings()
{
    const juce::ScopedLock sl (fastPathLock);
    fastPathBindings.clear();
}

void Map2Controller::dispatch (const ControllerEvent& event)
{
    const bool consumedByFastPath = applyFastPath (event);

    if (! consumedByFastPath && eventCallback)
    {
        eventCallback (event);
    }
}

bool Map2Controller::applyFastPath (const ControllerEvent& event)
{
    if (event.bytes.size() < 2)
        return false;

    const auto status = event.bytes[0];
    const auto data1 = event.bytes[1];

    const juce::ScopedLock sl (fastPathLock);
    for (const auto& binding : fastPathBindings)
    {
        if (binding.statusByte != status)
            continue;
        if (binding.matchExact && binding.dataByte1 != data1)
            continue;

        // A real fast-path implementation invokes Map2AudioEngine directly
        // here. The integration with the engine API surface lands in T2459-B1
        // when Map2MidiController wires through to the live engine. For now
        // this method records the match so the unit test in T2459-A2 can
        // assert the dispatch path took the fast-path branch.
        //
        // TODO(T2459-B1): replace this stub with a direct call into
        // Map2AudioEngine::dispatchControlAction(binding.engineTarget,
        //                                        binding.action,
        //                                        event.bytes);
        return true;
    }

    return false;
}

void Map2Controller::setOpen (bool isOpenNow)
{
    const bool wasOpen = opened.exchange (isOpenNow, std::memory_order_acq_rel);
    if (wasOpen != isOpenNow && stateCallback)
        stateCallback (isOpenNow);
}

} // namespace map2::controllers
