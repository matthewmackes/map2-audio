"""T2459-H Outer Loop 2 — end-to-end integration test.

Wires together the three Outer-Loop-2 building blocks:

    physical MIDI bytes
        ↓ subscriber  (commander_discovery_subscriber.py)
        ↓ resolver    (commander_resolver.py)
        ↓ vendor mapping JS would produce engine_command frames
        ↓ dispatcher  (engine_command_dispatcher.py)
        ↓ handlers    (engine_command_handlers.py)
            ↓ recorded service hook (this test)

The vendor-mapping-JS layer (controller-host's QuickJS runtime) sits
between the resolver and the dispatcher in the production path; here
we substitute a small Python translator that mirrors what a vendor
mapping script would emit, so we can validate the full chain
end-to-end without spinning up the host process.
"""

from __future__ import annotations

import pytest

from app.services.devices.meloaudio import (
    CommanderControl,
    CommanderDiscoveryEvent,
    CommanderDiscoveryOverride,
    EffectiveCommanderProfile,
    resolve_commander_profile,
)
from app.services.engine_command_dispatcher import EngineCommandDispatcher
from app.services.engine_command_handlers import (
    HandlerHooks,
    register_default_handlers,
)


def _vendor_mapping_for(
    profile: EffectiveCommanderProfile,
    status: int,
    data1: int,
    channel: int,
) -> dict | None:
    """Stand-in for the vendor mapping JS in the controller-host.

    Maps Commander controls to canonical MAP2 engine_command frames:

      TOP_1 / TOP_2 / TOP_3 / TOP_4 → audio.chain.<idx>.bypass (toggle)
      BOTTOM_A..D                     → audio.snapshot.recall (set value=index)
      EXPRESSION_1                   → audio.master.volume (set ratio)
      EXPRESSION_2                   → audio.master.volume (set ratio, alt)
      BANK_UP / BANK_DOWN            → no-op (UI-only)
    """
    binding = profile.find_binding(status_byte=status, data1=data1, channel=channel)
    if binding is None:
        return None

    base = {
        "type": "engine_command",
        "msg_id": "fake-msg",
        "schema_version": 1,
        "controller_key": "meloaudio:midi-commander",
    }

    if binding.control == CommanderControl.TOP_1:
        return {**base, "target": "audio.chain.1.bypass", "action": "toggle"}
    if binding.control == CommanderControl.TOP_2:
        return {**base, "target": "audio.chain.2.bypass", "action": "toggle"}
    if binding.control == CommanderControl.TOP_3:
        return {**base, "target": "audio.chain.3.bypass", "action": "toggle"}
    if binding.control == CommanderControl.TOP_4:
        return {**base, "target": "audio.chain.4.bypass", "action": "toggle"}
    if binding.control == CommanderControl.BOTTOM_A:
        return {**base, "target": "audio.snapshot.recall", "action": "set", "value": 1.0}
    if binding.control == CommanderControl.BOTTOM_B:
        return {**base, "target": "audio.snapshot.recall", "action": "set", "value": 2.0}
    if binding.control == CommanderControl.BOTTOM_C:
        return {**base, "target": "audio.snapshot.recall", "action": "set", "value": 3.0}
    if binding.control == CommanderControl.BOTTOM_D:
        return {**base, "target": "audio.snapshot.recall", "action": "set", "value": 4.0}
    if binding.control == CommanderControl.EXPRESSION_1:
        return None  # value-bearing control: vendor would use raw_value at the JS layer
    return None


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def stub_engine() -> tuple[
    EngineCommandDispatcher,
    list[tuple[int, bool]],
    list[int],
]:
    bypass_calls: list[tuple[int, bool]] = []
    recall_calls: list[int] = []
    bypass_state: dict[int, bool] = {}

    def set_bypass(chain_id: int, bypass: bool) -> None:
        bypass_state[chain_id] = bypass
        bypass_calls.append((chain_id, bypass))

    def recall(snapshot_id: int) -> None:
        recall_calls.append(snapshot_id)

    hooks = HandlerHooks(
        set_chain_bypass=set_bypass,
        recall_snapshot=recall,
    )
    dispatcher = EngineCommandDispatcher()
    register_default_handlers(dispatcher, hooks=hooks)
    return dispatcher, bypass_calls, recall_calls


# ---------------------------------------------------------------------------
# End-to-end paths
# ---------------------------------------------------------------------------


def test_default_profile_top_1_press_actuates_chain_1_bypass(stub_engine) -> None:
    """Press TOP_1 (CC 80 ch 1, the device-pack default) → audio.chain.1.bypass toggle."""
    dispatcher, bypass_calls, _ = stub_engine
    profile = resolve_commander_profile(override=None)

    # Synthetic MIDI message: CC 80 = 127 on channel 1 (status byte 0xB0).
    cmd = _vendor_mapping_for(profile, status=0xB0, data1=80, channel=1)
    assert cmd is not None
    dispatcher.dispatch(cmd)

    assert bypass_calls == [(1, True)]


def test_override_routed_top_1_still_actuates_chain_1_bypass(stub_engine) -> None:
    """Operator's stock-mode emits CC 24 instead of CC 80 for TOP_1.
    The override re-routes; downstream pipeline still actuates chain 1."""
    dispatcher, bypass_calls, _ = stub_engine
    override = CommanderDiscoveryOverride(
        bindings={
            CommanderControl.TOP_1: CommanderDiscoveryEvent(
                status=0xB0, midino=24, channel=1, raw_value=127,
            ),
        }
    )
    profile = resolve_commander_profile(override=override)

    # Hardware emits CC 24 (operator's mode), not CC 80.
    cmd = _vendor_mapping_for(profile, status=0xB0, data1=24, channel=1)
    assert cmd is not None
    dispatcher.dispatch(cmd)

    assert bypass_calls == [(1, True)]

    # The pre-override CC 80 no longer matches anything.
    cmd_2 = _vendor_mapping_for(profile, status=0xB0, data1=80, channel=1)
    assert cmd_2 is None


def test_bottom_a_press_recalls_snapshot_one(stub_engine) -> None:
    dispatcher, _, recall_calls = stub_engine
    profile = resolve_commander_profile(override=None)

    # Bottom A defaults to PC 0 (status 0xC0).
    cmd = _vendor_mapping_for(profile, status=0xC0, data1=0, channel=1)
    assert cmd is not None
    dispatcher.dispatch(cmd)

    assert recall_calls == [1]


def test_full_pedalboard_choreography(stub_engine) -> None:
    """Exercise a realistic operator interaction:
       1. Recall snapshot B
       2. Toggle chain 1 bypass on
       3. Toggle chain 2 bypass on
       4. Toggle chain 1 off again
       5. Recall snapshot C
    All under default device-pack mappings."""
    dispatcher, bypass_calls, recall_calls = stub_engine
    profile = resolve_commander_profile(override=None)

    sequence = [
        (0xC0, 1, 1),   # Bottom B → recall 2
        (0xB0, 80, 1),  # Top 1 → chain 1 bypass toggle
        (0xB0, 81, 1),  # Top 2 → chain 2 bypass toggle
        (0xB0, 80, 1),  # Top 1 → chain 1 bypass toggle (off)
        (0xC0, 2, 1),   # Bottom C → recall 3
    ]
    for status, data1, channel in sequence:
        cmd = _vendor_mapping_for(profile, status=status, data1=data1, channel=channel)
        assert cmd is not None, f"vendor mapping missed control: {hex(status)} {data1}"
        dispatcher.dispatch(cmd)

    assert recall_calls == [2, 3]
    # Chain 1 toggled twice (on, off); chain 2 toggled once (on).
    assert bypass_calls == [(1, True), (2, True), (1, False)]


def test_unmatched_message_does_not_actuate_anything(stub_engine) -> None:
    dispatcher, bypass_calls, recall_calls = stub_engine
    profile = resolve_commander_profile(override=None)
    cmd = _vendor_mapping_for(profile, status=0xB0, data1=121, channel=1)  # CC 121 not bound
    assert cmd is None
    assert bypass_calls == []
    assert recall_calls == []


def test_overridden_bottom_a_changes_snapshot_recall_target(stub_engine) -> None:
    """A custom-firmware operator who's bound BOTTOM_A to CC 99 (not PC 0)
    still hits snapshot.recall via the resolver path."""
    dispatcher, _, recall_calls = stub_engine
    override = CommanderDiscoveryOverride(
        bindings={
            CommanderControl.BOTTOM_A: CommanderDiscoveryEvent(
                status=0xB0, midino=99, channel=1, raw_value=127,
            ),
        }
    )
    profile = resolve_commander_profile(override=override)
    cmd = _vendor_mapping_for(profile, status=0xB0, data1=99, channel=1)
    assert cmd is not None
    dispatcher.dispatch(cmd)
    assert recall_calls == [1]
