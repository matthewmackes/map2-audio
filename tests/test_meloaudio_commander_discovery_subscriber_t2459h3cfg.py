"""T2459-H3-CFG Phase 2b — Discovery wizard ALSA-seq subscriber tests.

Hermetic tests that exercise the parsing/filtering/dispatch path
without opening a real MIDI port. The subscriber's
``feed_raw_message`` test seam injects synthetic byte triples through
the same code path as live ALSA seq events.
"""

from __future__ import annotations

import pytest

from app.services.devices.meloaudio.commander_discovery import (
    CommanderControl,
    CommanderDiscoveryState,
)
from app.services.devices.meloaudio.commander_discovery_subscriber import (
    ACCEPTED_STATUS_BYTES,
    CommanderDiscoverySubscriber,
    NOISE_STATUS_BYTES,
    SubscriberConfig,
    SubscriberError,
)


# ---------------------------------------------------------------------------
# Filtering — noise bytes are dropped, accepted bytes pass through
# ---------------------------------------------------------------------------


def _start(state: CommanderDiscoveryState | None = None) -> tuple[CommanderDiscoveryState, CommanderDiscoverySubscriber]:
    state = state or CommanderDiscoveryState()
    state.start()
    sub = CommanderDiscoverySubscriber(state)
    return state, sub


def test_active_sense_is_filtered() -> None:
    """Active Sense (0xFE) is sent ~3x/sec by the Commander as a
    keepalive; never count it as a press.
    """
    state, sub = _start()
    sub.feed_raw_message(0xFE, 0, 0)
    assert state.current_prompt is CommanderControl.TOP_1
    assert len(state.captured) == 0


def test_clock_messages_filtered() -> None:
    """All system-realtime clock bytes (Start/Continue/Stop/Clock) are noise."""
    state, sub = _start()
    for status in (0xF8, 0xFA, 0xFB, 0xFC):
        sub.feed_raw_message(status, 0, 0)
    assert len(state.captured) == 0
    assert state.current_prompt is CommanderControl.TOP_1


def test_system_reset_filtered() -> None:
    state, sub = _start()
    sub.feed_raw_message(0xFF, 0, 0)
    assert len(state.captured) == 0


def test_cc_message_passes_through() -> None:
    state, sub = _start()
    # CC 24 on channel 1 — top switch 1 in this operator's mode
    sub.feed_raw_message(0xB0, 24, 127)
    assert state.captured[CommanderControl.TOP_1].midino == 24
    assert state.captured[CommanderControl.TOP_1].status == 0xB0
    assert state.captured[CommanderControl.TOP_1].channel == 1
    assert state.captured[CommanderControl.TOP_1].raw_value == 127


def test_program_change_passes_through_with_no_raw_value() -> None:
    """PC is one-byte data; raw_value should be None, not 0."""
    state, sub = _start()
    # Walk to the bottom_a prompt
    for _ in range(4):
        state.skip_current()
    sub.feed_raw_message(0xC0, 0, 0)  # PC 0
    binding = state.captured[CommanderControl.BOTTOM_A]
    assert binding.status == 0xC0
    assert binding.midino == 0
    assert binding.raw_value is None


def test_note_on_passes_through() -> None:
    """Some MIDI controllers emit Note On for footswitch presses
    instead of CC. Subscriber must accept them.
    """
    state, sub = _start()
    sub.feed_raw_message(0x90, 60, 100)  # C4 with velocity 100
    assert state.captured[CommanderControl.TOP_1].status == 0x90
    assert state.captured[CommanderControl.TOP_1].midino == 60
    assert state.captured[CommanderControl.TOP_1].raw_value == 100


def test_pitch_bend_passes_through() -> None:
    state, sub = _start()
    sub.feed_raw_message(0xE0, 0, 64)
    assert state.captured[CommanderControl.TOP_1].status == 0xE0
    assert state.captured[CommanderControl.TOP_1].midino == 0
    assert state.captured[CommanderControl.TOP_1].raw_value == 64


def test_channel_aftertouch_passes_through_with_no_raw_value() -> None:
    """Channel Pressure (0xD0) is a one-byte-data message like PC."""
    state, sub = _start()
    sub.feed_raw_message(0xD0, 100, 0)
    assert state.captured[CommanderControl.TOP_1].status == 0xD0
    assert state.captured[CommanderControl.TOP_1].midino == 100
    assert state.captured[CommanderControl.TOP_1].raw_value is None


def test_channel_extracted_from_status_byte() -> None:
    """Channel is the low nibble of status byte; we expose it 1-16."""
    state, sub = _start()
    sub.feed_raw_message(0xB5, 24, 127)  # CC on channel 6 (status nibble 5)
    assert state.captured[CommanderControl.TOP_1].channel == 6


def test_channel_16_max() -> None:
    state, sub = _start()
    sub.feed_raw_message(0xBF, 24, 127)  # status nibble 0xF = channel 16
    assert state.captured[CommanderControl.TOP_1].channel == 16


@pytest.mark.parametrize("noise_byte", sorted(NOISE_STATUS_BYTES))
def test_noise_byte_set_is_explicit(noise_byte: int) -> None:
    """Lock down the noise filter — every byte in the set is rejected."""
    state, sub = _start()
    sub.feed_raw_message(noise_byte, 0, 0)
    assert len(state.captured) == 0


@pytest.mark.parametrize("status_high", sorted(ACCEPTED_STATUS_BYTES))
def test_accepted_status_high_pass(status_high: int) -> None:
    """Lock down the accept set — every status family produces a binding."""
    state, sub = _start()
    sub.feed_raw_message(status_high | 0x00, 24, 60)
    assert len(state.captured) == 1


# ---------------------------------------------------------------------------
# Orchestrator integration — full flow through the subscriber
# ---------------------------------------------------------------------------


def test_full_walkthrough_via_subscriber_feed() -> None:
    """Replay the 2026-05-07 HIL bench session's actual MIDI dump
    through the subscriber's feed seam.
    """
    state, sub = _start()
    # Top 1-4 → CC 24, 25, 22, 26
    sub.feed_raw_message(0xB0, 24, 127)
    sub.feed_raw_message(0xB0, 25, 127)
    sub.feed_raw_message(0xB0, 22, 127)
    sub.feed_raw_message(0xB0, 26, 127)
    # Bottom A-D → PC 0-3
    sub.feed_raw_message(0xC0, 0, 0)
    sub.feed_raw_message(0xC0, 1, 0)
    sub.feed_raw_message(0xC0, 2, 0)
    sub.feed_raw_message(0xC0, 3, 0)
    # Expression 1 + 2 → CC 4, 7
    sub.feed_raw_message(0xB0, 4, 13)
    sub.feed_raw_message(0xB0, 7, 68)
    # Bank up/down skipped
    state.skip_current()
    state.skip_current()

    assert state.is_complete
    captured = state.captured
    assert captured[CommanderControl.TOP_1].midino == 24
    assert captured[CommanderControl.TOP_2].midino == 25
    assert captured[CommanderControl.TOP_3].midino == 22
    assert captured[CommanderControl.TOP_4].midino == 26
    assert captured[CommanderControl.BOTTOM_A].midino == 0
    assert captured[CommanderControl.BOTTOM_D].midino == 3
    assert captured[CommanderControl.EXPRESSION_1].midino == 4
    assert captured[CommanderControl.EXPRESSION_2].midino == 7


def test_active_sense_during_walkthrough_does_not_perturb() -> None:
    """Realistic case: between operator presses, the device sends Active
    Sense at ~3 Hz. Filter strips them so the orchestrator only
    advances on real presses.
    """
    state, sub = _start()
    sub.feed_raw_message(0xFE, 0, 0)  # active sense
    sub.feed_raw_message(0xFE, 0, 0)
    sub.feed_raw_message(0xB0, 24, 127)  # top 1 press
    sub.feed_raw_message(0xFE, 0, 0)
    sub.feed_raw_message(0xB0, 25, 127)  # top 2 press
    assert state.captured[CommanderControl.TOP_1].midino == 24
    assert state.captured[CommanderControl.TOP_2].midino == 25
    assert state.current_prompt is CommanderControl.TOP_3


def test_on_event_callback_fires_for_accepted_events() -> None:
    """UI hook: callback receives the parsed event before the
    orchestrator binds it. Lets the UI show 'captured CC 24' live.
    """
    received: list = []
    state = CommanderDiscoveryState()
    state.start()
    sub = CommanderDiscoverySubscriber(state, on_event=received.append)
    sub.feed_raw_message(0xB0, 24, 127)
    assert len(received) == 1
    assert received[0].midino == 24


def test_on_event_callback_does_not_fire_for_filtered_events() -> None:
    """Callback only fires for events that pass the filter."""
    received: list = []
    state = CommanderDiscoveryState()
    state.start()
    sub = CommanderDiscoverySubscriber(state, on_event=received.append)
    sub.feed_raw_message(0xFE, 0, 0)  # active sense
    sub.feed_raw_message(0xF8, 0, 0)  # clock
    assert len(received) == 0


def test_on_event_callback_exception_does_not_kill_dispatch() -> None:
    """A buggy UI callback must not stop subsequent events from
    reaching the orchestrator.
    """
    def buggy_callback(_event):
        raise RuntimeError("UI is on fire")

    state = CommanderDiscoveryState()
    state.start()
    sub = CommanderDiscoverySubscriber(state, on_event=buggy_callback)
    sub.feed_raw_message(0xB0, 24, 127)
    sub.feed_raw_message(0xB0, 25, 127)
    # Both events still bound
    assert state.captured[CommanderControl.TOP_1].midino == 24
    assert state.captured[CommanderControl.TOP_2].midino == 25


# ---------------------------------------------------------------------------
# Lifecycle — start / stop / port resolution
# ---------------------------------------------------------------------------


def test_subscriber_default_config_patterns() -> None:
    """The default patterns match both stock (TSMIDI) and custom (STM32)
    firmware port names.
    """
    cfg = SubscriberConfig()
    assert "TSMIDI" in cfg.port_name_patterns
    assert "STM32" in cfg.port_name_patterns


def test_start_raises_when_no_matching_port_found(monkeypatch) -> None:
    """If no MIDI input port matches the configured pattern, start()
    surfaces SubscriberError so the UI can prompt the operator to
    connect the device.
    """
    state = CommanderDiscoveryState()
    state.start()
    sub = CommanderDiscoverySubscriber(
        state,
        config=SubscriberConfig(port_name_patterns=("DefinitelyNotADevice",)),
    )
    with pytest.raises(SubscriberError, match="No MIDI input port matched"):
        sub.start()


def test_double_start_raises() -> None:
    """Calling start twice is a programming error, not a no-op —
    raising loudly catches lifecycle bugs in the caller.
    """
    state = CommanderDiscoveryState()
    state.start()
    sub = CommanderDiscoverySubscriber(state)
    # Trick: tell start() the thread is already running by setting
    # a fake non-None thread. We don't need to actually open a port.
    import threading
    sub._thread = threading.Thread(target=lambda: None)
    sub._thread.start()
    sub._thread.join()
    # is_running is False (thread finished), so start should now succeed
    # if we didn't pin _thread. To test the guard, set _thread to a live
    # one — alternative: use the public API.

    # The cleaner check: start() raises when is_running is True. We
    # simulate that by mocking _thread.is_alive.
    class _FakeThread:
        def is_alive(self): return True
    sub._thread = _FakeThread()  # type: ignore[assignment]
    with pytest.raises(SubscriberError, match="already running"):
        sub.start()


def test_stop_is_idempotent() -> None:
    """stop() on a never-started subscriber is a no-op."""
    state = CommanderDiscoveryState()
    sub = CommanderDiscoverySubscriber(state)
    # No start → no error
    sub.stop()
    sub.stop()
    assert not sub.is_running


def test_port_name_property_none_until_started() -> None:
    state = CommanderDiscoveryState()
    sub = CommanderDiscoverySubscriber(state)
    assert sub.port_name is None
    assert not sub.is_running


def test_state_completion_short_circuits_dispatch() -> None:
    """Once the orchestrator is_complete, the subscriber stops feeding
    events to it (no double-binding past the last prompt).
    """
    state = CommanderDiscoveryState()
    state.start()
    sub = CommanderDiscoverySubscriber(state)
    # Walk to completion
    for _ in range(12):
        sub.feed_raw_message(0xB0, 100, 127)
    assert state.is_complete
    captured_count = len(state.captured)
    # Further events should be ignored (orchestrator's handle_event
    # returns False; nothing bound)
    sub.feed_raw_message(0xB0, 24, 127)
    assert len(state.captured) == captured_count


def test_state_cancellation_short_circuits_dispatch() -> None:
    state = CommanderDiscoveryState()
    state.start()
    sub = CommanderDiscoverySubscriber(state)
    sub.feed_raw_message(0xB0, 24, 127)
    state.cancel()
    sub.feed_raw_message(0xB0, 25, 127)
    # Only the pre-cancel event was bound
    assert state.captured[CommanderControl.TOP_1].midino == 24
    assert CommanderControl.TOP_2 not in state.captured
