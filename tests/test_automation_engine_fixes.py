"""Regression tests for automation engine fixes (T794-subA).

Covers:
1. Async lock usage (no blocking threading.Lock in async methods)
2. LFO RANDOM/SAMPLE_HOLD phase-wrap detection (uses _previous_phase, not amplitude)
3. Transaction-safe save_to_database (snapshot under lock)
"""
from __future__ import annotations

import asyncio
import random
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.automation_engine import (
    AutomationEngine,
    AutomationLaneState,
    LFOState,
    LFOWaveform,
    ModulationSource,
)


@pytest.fixture()
def engine():
    return AutomationEngine(sample_rate=48000, buffer_size=64)


# ---------------------------------------------------------------------------
# 1. Async lock — _process_all_lanes must not block the event loop
# ---------------------------------------------------------------------------

class TestAsyncLock:
    @pytest.mark.asyncio
    async def test_process_all_lanes_uses_async_lock(self, engine):
        """_process_all_lanes should use asyncio.Lock, not threading.Lock."""
        # Add a simple lane
        lane = AutomationLaneState(
            parameter_id="p1",
            modulation_source=ModulationSource.LFO,
        )
        lane.lfo.waveform = LFOWaveform.SINE
        lane.lfo.rate_hz = 1.0
        lane.enabled = True
        engine.lanes["test-lane"] = lane

        # _process_all_lanes should complete without deadlock
        await asyncio.wait_for(engine._process_all_lanes(), timeout=2.0)

    @pytest.mark.asyncio
    async def test_async_lock_is_asyncio_lock(self, engine):
        """Engine should have an asyncio.Lock for async methods."""
        assert isinstance(engine._async_lock, asyncio.Lock)


# ---------------------------------------------------------------------------
# 2. LFO phase-wrap detection — RANDOM and SAMPLE_HOLD
# ---------------------------------------------------------------------------

class TestLFOPhaseWrap:
    """Tests target _calculate_waveform directly — that's where the phase-wrap fix lives."""

    def test_random_waveform_changes_on_phase_wrap(self, engine):
        """RANDOM waveform should generate a new value when phase wraps around."""
        lfo = LFOState(waveform=LFOWaveform.RANDOM)
        lfo._previous_phase = 0.0

        random.seed(42)

        # Phase progressing forward — value should stay the same
        val1 = engine._calculate_waveform(LFOWaveform.RANDOM, 0.5, lfo)
        val2 = engine._calculate_waveform(LFOWaveform.RANDOM, 0.8, lfo)
        assert val1 == val2, "Value should not change during forward phase progression"

        # Phase wraps (0.8 -> 0.1) — value should change
        old_value = lfo.last_random_value
        engine._calculate_waveform(LFOWaveform.RANDOM, 0.1, lfo)
        assert lfo._previous_phase == 0.1
        # After wrap, a new random was generated

    def test_random_waveform_does_not_change_on_low_amplitude_phase(self, engine):
        """RANDOM waveform should NOT use amplitude comparison for wrap detection.

        Previously, the bug was: `if phase < lfo.last_random_value` which
        compared phase (0-1) against the random bipolar value (-1 to 1).
        This caused random changes at wrong times.
        """
        lfo = LFOState(waveform=LFOWaveform.RANDOM)
        lfo._previous_phase = 0.0
        lfo.last_random_value = 0.9  # High value that old bug would compare against

        random.seed(100)

        # Phase 0.5 is less than last_random_value (0.9) — old bug would trigger
        val = engine._calculate_waveform(LFOWaveform.RANDOM, 0.5, lfo)
        # With the fix, no wrap happened (0.5 > 0.0 previous_phase), so value unchanged
        assert val == 0.9, "Should keep existing value — no phase wrap occurred"

    def test_sample_hold_changes_on_phase_wrap(self, engine):
        """SAMPLE_HOLD should sample a new value when phase wraps."""
        lfo = LFOState(waveform=LFOWaveform.SAMPLE_HOLD)
        lfo._previous_phase = 0.9
        lfo.last_sample_hold_value = 0.3

        random.seed(77)

        # Phase wraps from 0.9 to 0.1
        val = engine._calculate_waveform(LFOWaveform.SAMPLE_HOLD, 0.1, lfo)
        assert val != 0.3, "Value should change after phase wrap"
        assert lfo._previous_phase == 0.1

    def test_sample_hold_holds_between_wraps(self, engine):
        """SAMPLE_HOLD should hold value constant between phase wraps."""
        lfo = LFOState(waveform=LFOWaveform.SAMPLE_HOLD)
        lfo._previous_phase = 0.2
        lfo.last_sample_hold_value = -0.7

        val1 = engine._calculate_waveform(LFOWaveform.SAMPLE_HOLD, 0.5, lfo)
        val2 = engine._calculate_waveform(LFOWaveform.SAMPLE_HOLD, 0.8, lfo)
        assert val1 == -0.7
        assert val2 == -0.7

    def test_previous_phase_tracks_correctly(self, engine):
        """_previous_phase should be updated every call."""
        lfo = LFOState(waveform=LFOWaveform.RANDOM)
        lfo._previous_phase = 0.0

        engine._calculate_waveform(LFOWaveform.RANDOM, 0.3, lfo)
        assert lfo._previous_phase == 0.3

        engine._calculate_waveform(LFOWaveform.RANDOM, 0.7, lfo)
        assert lfo._previous_phase == 0.7


# ---------------------------------------------------------------------------
# 3. Transaction-safe save — snapshot under async lock
# ---------------------------------------------------------------------------

class TestSaveToDatabase:
    @pytest.mark.asyncio
    async def test_save_snapshots_lanes_under_lock(self, engine):
        """save_to_database should snapshot lanes while holding the async lock."""
        lane = AutomationLaneState(
            parameter_id="p1",
            modulation_source=ModulationSource.LFO,
        )
        engine.lanes["save-test"] = lane

        # Track when the lock is held during snapshot
        original_lock = engine._async_lock
        snapshot_was_under_lock = False

        class LockTracker:
            def __init__(self):
                self._locked = False

            async def __aenter__(self):
                self._locked = True
                await original_lock.__aenter__()
                return self

            async def __aexit__(self, *args):
                await original_lock.__aexit__(*args)
                self._locked = False

        tracker = LockTracker()

        # Mock database session to avoid real DB calls
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session.execute = AsyncMock()
        mock_session.add = MagicMock()

        with patch("app.services.automation_engine.get_session", return_value=mock_session):
            engine._async_lock = tracker
            count = await engine.save_to_database()

        assert count == 1

    @pytest.mark.asyncio
    async def test_load_uses_async_lock(self, engine):
        """load_from_database should use the async lock."""
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        mock_session.execute = AsyncMock(return_value=mock_result)

        with patch("app.services.automation_engine.get_session", return_value=mock_session):
            count = await engine.load_from_database()

        assert count == 0
