"""T2515-4 — engine-side guard regression tests."""

from __future__ import annotations

import pytest

from app.services.devices.tascam_us144mkii_engine import (
    JACK_DIRECT_ENV_VAR,
    JACK_DIRECT_ENV_VALUE,
    JackDirectRequiredError,
    SampleRateLockedError,
    TIER1_SAMPLE_RATE,
    apply_sample_rate_change,
    ensure_jack_direct_or_raise,
)


# ----------------------------------------------------------------------------
# JACK-direct enforcement
# ----------------------------------------------------------------------------

def test_ensure_jack_direct_passes_when_env_set():
    ensure_jack_direct_or_raise({JACK_DIRECT_ENV_VAR: JACK_DIRECT_ENV_VALUE})


def test_ensure_jack_direct_raises_when_env_missing():
    with pytest.raises(JackDirectRequiredError):
        ensure_jack_direct_or_raise({})


def test_ensure_jack_direct_raises_when_env_wrong_value():
    with pytest.raises(JackDirectRequiredError):
        ensure_jack_direct_or_raise({JACK_DIRECT_ENV_VAR: "0"})


# ----------------------------------------------------------------------------
# Sample-rate change wrapper
# ----------------------------------------------------------------------------

class _FakeEngine:
    """Minimal stand-in for the JUCE engine binding."""

    def __init__(self, running: bool = True):
        self._running = running
        self.sample_rate: int | None = None
        self.events: list[str] = []

    def is_audio_running(self) -> bool:
        return self._running

    def stop_audio(self) -> None:
        self.events.append("stop_audio")
        self._running = False

    def start_audio(self) -> None:
        self.events.append("start_audio")
        self._running = True

    def set_sample_rate(self, rate: int) -> None:
        self.events.append(f"set_sample_rate:{rate}")
        self.sample_rate = rate


def test_sr_change_stops_and_restarts_when_audio_was_running():
    engine = _FakeEngine(running=True)
    result = apply_sample_rate_change(engine, TIER1_SAMPLE_RATE)
    assert engine.events == [
        "stop_audio",
        f"set_sample_rate:{TIER1_SAMPLE_RATE}",
        "start_audio",
    ]
    assert engine.sample_rate == TIER1_SAMPLE_RATE
    assert result.streams_were_running is True
    assert result.streams_restarted is True


def test_sr_change_skips_restart_when_audio_was_stopped():
    engine = _FakeEngine(running=False)
    result = apply_sample_rate_change(engine, TIER1_SAMPLE_RATE)
    assert engine.events == [f"set_sample_rate:{TIER1_SAMPLE_RATE}"]
    assert result.streams_were_running is False
    assert result.streams_restarted is False


def test_sr_change_refuses_off_tier1_rate_by_default():
    engine = _FakeEngine(running=True)
    with pytest.raises(SampleRateLockedError):
        apply_sample_rate_change(engine, 96000)
    assert engine.events == []           # engine never touched


def test_sr_change_allows_off_tier1_when_operator_confirms():
    engine = _FakeEngine(running=True)
    result = apply_sample_rate_change(engine, 96000, allow_off_tier1=True)
    assert engine.events == [
        "stop_audio",
        "set_sample_rate:96000",
        "start_audio",
    ]
    assert result.applied_rate == 96000
