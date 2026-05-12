"""T2512-QUANT — tempo-grid quantize helper tests.

The looper-quantize module is pure math (no service dependencies),
so the tests pin every observable contract in isolation. A future
caller (auto-close on grid boundary, quantize-overdub-stop, UI
preview) gets a stable surface to build against.
"""

from __future__ import annotations

import pytest

from app.services.looper_quantize import (
    MAX_BPM,
    MIN_BPM,
    SAMPLE_RATE_HZ,
    QuantizeError,
    beats_for_frames,
    frames_per_beat,
    frames_per_division,
    grid_aligned,
    snap_frames_to_grid,
)


# ---------------------------------------------------------------------------
# frames_per_beat
# ---------------------------------------------------------------------------


def test_frames_per_beat_120_bpm() -> None:
    """120 BPM at 48000 Hz → 24000 frames/beat (the standard reference
    point for any guitarist's metronome muscle memory)."""
    assert frames_per_beat(120.0) == pytest.approx(24000.0)


def test_frames_per_beat_60_bpm() -> None:
    """60 BPM = 1 beat per second → 48000 frames/beat."""
    assert frames_per_beat(60.0) == pytest.approx(48000.0)


def test_frames_per_beat_clamps_extreme_bpm() -> None:
    # Below clamp: 5 BPM → MIN_BPM (20).
    assert frames_per_beat(5.0) == pytest.approx(
        frames_per_beat(MIN_BPM)
    )
    # Above clamp: 999 BPM → MAX_BPM (300).
    assert frames_per_beat(999.0) == pytest.approx(
        frames_per_beat(MAX_BPM)
    )


def test_frames_per_beat_rejects_non_positive_sample_rate() -> None:
    with pytest.raises(QuantizeError):
        frames_per_beat(120.0, sample_rate=0.0)
    with pytest.raises(QuantizeError):
        frames_per_beat(120.0, sample_rate=-48000.0)


# ---------------------------------------------------------------------------
# frames_per_division
# ---------------------------------------------------------------------------


def test_frames_per_division_quarter_equals_beat() -> None:
    """A 'quarter' is one beat by definition."""
    assert frames_per_division(120.0, "quarter") == pytest.approx(24000.0)


def test_frames_per_division_eighth_is_half_beat() -> None:
    assert frames_per_division(120.0, "eighth") == pytest.approx(12000.0)


def test_frames_per_division_half_is_two_beats() -> None:
    assert frames_per_division(120.0, "half") == pytest.approx(48000.0)


def test_frames_per_division_sixteenth() -> None:
    assert frames_per_division(120.0, "sixteenth") == pytest.approx(6000.0)


def test_frames_per_division_accepts_fraction_aliases() -> None:
    assert frames_per_division(120.0, "1/4") == pytest.approx(
        frames_per_division(120.0, "quarter")
    )
    assert frames_per_division(120.0, "1/8") == pytest.approx(
        frames_per_division(120.0, "eighth")
    )
    assert frames_per_division(120.0, "1/16") == pytest.approx(
        frames_per_division(120.0, "sixteenth")
    )
    assert frames_per_division(120.0, "1/32") == pytest.approx(
        frames_per_division(120.0, "thirty-second")
    )


def test_frames_per_division_rejects_unknown() -> None:
    with pytest.raises(QuantizeError) as exc:
        frames_per_division(120.0, "1/7")
    assert "unknown division" in str(exc.value)


# ---------------------------------------------------------------------------
# snap_frames_to_grid — nearest
# ---------------------------------------------------------------------------


def test_snap_nearest_exact_boundary() -> None:
    """An exact-grid frame count must round to itself."""
    assert snap_frames_to_grid(48000, 120.0, "quarter") == 48000
    assert snap_frames_to_grid(96000, 120.0, "quarter") == 96000


def test_snap_nearest_just_above_boundary() -> None:
    """24001 frames at 120 BPM quarter (24000) snaps down to 24000."""
    assert snap_frames_to_grid(24001, 120.0, "quarter") == 24000


def test_snap_nearest_just_below_boundary() -> None:
    """47999 frames at 120 BPM quarter (24000) → second beat (48000)."""
    assert snap_frames_to_grid(47999, 120.0, "quarter") == 48000


def test_snap_nearest_halfway_rounds_up() -> None:
    """Exact midpoint (12000 between 0 and 24000) snaps UP to 24000.
    Half-up rule.
    """
    assert snap_frames_to_grid(12000, 120.0, "quarter") == 24000


def test_snap_nearest_zero_stays_zero() -> None:
    assert snap_frames_to_grid(0, 120.0, "quarter") == 0


# ---------------------------------------------------------------------------
# snap_frames_to_grid — up / down
# ---------------------------------------------------------------------------


def test_snap_up_ceils_to_next_boundary() -> None:
    assert snap_frames_to_grid(100, 120.0, "quarter", mode="up") == 24000
    assert snap_frames_to_grid(24001, 120.0, "quarter", mode="up") == 48000


def test_snap_up_exact_boundary_stays() -> None:
    assert snap_frames_to_grid(24000, 120.0, "quarter", mode="up") == 24000


def test_snap_down_floors_to_previous_boundary() -> None:
    assert snap_frames_to_grid(23999, 120.0, "quarter", mode="down") == 0
    assert snap_frames_to_grid(48001, 120.0, "quarter", mode="down") == 48000


def test_snap_down_exact_boundary_stays() -> None:
    assert snap_frames_to_grid(48000, 120.0, "quarter", mode="down") == 48000


def test_snap_zero_with_any_mode_stays_zero() -> None:
    for mode in ("nearest", "up", "down"):
        assert snap_frames_to_grid(0, 120.0, "quarter", mode=mode) == 0  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# snap_frames_to_grid — validation
# ---------------------------------------------------------------------------


def test_snap_rejects_negative_frames() -> None:
    with pytest.raises(QuantizeError):
        snap_frames_to_grid(-1, 120.0, "quarter")


def test_snap_rejects_unknown_mode() -> None:
    with pytest.raises(QuantizeError):
        snap_frames_to_grid(
            1000, 120.0, "quarter", mode="ceiling"  # type: ignore[arg-type]
        )


def test_snap_returns_int() -> None:
    """Engine APIs take int frame counts — the helper must not leak floats."""
    result = snap_frames_to_grid(33333, 120.0, "eighth")
    assert isinstance(result, int)


# ---------------------------------------------------------------------------
# grid_aligned
# ---------------------------------------------------------------------------


def test_grid_aligned_exact_match() -> None:
    assert grid_aligned(24000, 120.0, "quarter") is True
    assert grid_aligned(48000, 120.0, "quarter") is True


def test_grid_aligned_within_default_tolerance() -> None:
    """Default tolerance is 1 frame — 23999 + 24001 both qualify."""
    assert grid_aligned(23999, 120.0, "quarter") is True
    assert grid_aligned(24001, 120.0, "quarter") is True


def test_grid_aligned_outside_default_tolerance() -> None:
    assert grid_aligned(23998, 120.0, "quarter") is False
    assert grid_aligned(24002, 120.0, "quarter") is False


def test_grid_aligned_custom_tolerance() -> None:
    assert grid_aligned(23900, 120.0, "quarter", tolerance_frames=100) is True
    assert grid_aligned(23899, 120.0, "quarter", tolerance_frames=100) is False


def test_grid_aligned_negative_frames_false() -> None:
    assert grid_aligned(-1, 120.0, "quarter") is False


# ---------------------------------------------------------------------------
# beats_for_frames
# ---------------------------------------------------------------------------


def test_beats_for_frames_round_trip() -> None:
    """beats_for_frames(frames_per_beat(bpm) * N) == N. Use 120 BPM
    where frames_per_beat is integer (24000) so the int() truncation
    on round-trip is exact."""
    fpb = frames_per_beat(120.0)
    assert beats_for_frames(int(fpb * 4), 120.0) == pytest.approx(4.0)


def test_beats_for_frames_zero() -> None:
    assert beats_for_frames(0, 120.0) == 0.0


def test_beats_for_frames_rejects_negative() -> None:
    with pytest.raises(QuantizeError):
        beats_for_frames(-1, 120.0)


# ---------------------------------------------------------------------------
# Sample-rate seam
# ---------------------------------------------------------------------------


def test_sample_rate_constant_matches_48000() -> None:
    """If the engine's locked sample rate ever changes, this test
    catches the divergence between SAMPLE_RATE_HZ here and the
    runner / engine values."""
    assert SAMPLE_RATE_HZ == 48000.0


def test_helpers_honor_custom_sample_rate() -> None:
    """At 44100 Hz, 60 BPM = 1 beat/sec → 44100 frames/beat."""
    assert frames_per_beat(60.0, sample_rate=44100.0) == pytest.approx(44100.0)
    assert frames_per_division(60.0, "eighth", sample_rate=44100.0) == pytest.approx(22050.0)


# ---------------------------------------------------------------------------
# BPM clamp behavior — observable through frame math
# ---------------------------------------------------------------------------


def test_min_bpm_constant() -> None:
    assert MIN_BPM == 20.0


def test_max_bpm_constant() -> None:
    assert MAX_BPM == 300.0
