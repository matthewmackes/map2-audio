"""T2512-QUANT — pure-Python tempo-grid quantize helper.

Pure math module: no service dependencies, no engine bindings, no
async. Given a frame count, a tempo, a grid division, and a sample
rate, the helpers below compute frames-per-grid, snap an arbitrary
frame count to the nearest (or up/down) grid boundary, and test
grid-alignment within a tolerance.

The looper service does not yet *use* these helpers — auto-close on
a grid boundary lands later as a separate service slice that combines
this math with the recording state machine. Shipping the helper now
unblocks any caller (service, runner, UI preview) that wants
quantize math against the snapshot tempo (T2512-CLOCK inbound).

Constants
- ``SAMPLE_RATE_HZ`` matches the engine's locked 48000 Hz audio
  pipeline; the helpers accept a ``sample_rate`` parameter so a
  future engine config change doesn't break the math.
- ``MIN_BPM`` / ``MAX_BPM`` mirror SnapshotTempoService's clamp
  (20..300 BPM).

Division shorthand
- All helpers accept either the long form (``"quarter"``,
  ``"eighth"``) or fraction shorthand (``"1/4"``, ``"1/8"``). Mapping
  is total — unknown strings raise ``QuantizeError``.
"""

from __future__ import annotations

from typing import Literal


SAMPLE_RATE_HZ = 48000.0
MIN_BPM = 20.0
MAX_BPM = 300.0


# ---------------------------------------------------------------------------
# Division names
# ---------------------------------------------------------------------------

# Maps any acceptable division name to its beats-per-division ratio.
# A "beat" is defined as a quarter note (the standard musical
# convention); so quarter == 1 beat per division, eighth == 0.5,
# half == 2.0, whole == 4.0, etc.
_DIVISION_BEATS: dict[str, float] = {
    "whole":         4.0,
    "1/1":           4.0,
    "half":          2.0,
    "1/2":           2.0,
    "quarter":       1.0,
    "1/4":           1.0,
    "eighth":        0.5,
    "1/8":           0.5,
    "sixteenth":     0.25,
    "1/16":          0.25,
    "thirty-second": 0.125,
    "thirty_second": 0.125,
    "1/32":          0.125,
}


SnapMode = Literal["nearest", "up", "down"]


class QuantizeError(ValueError):
    """Raised for invalid inputs to the quantize helpers."""


# ---------------------------------------------------------------------------
# Frame math
# ---------------------------------------------------------------------------


def _clamp_bpm(bpm: float) -> float:
    return max(MIN_BPM, min(MAX_BPM, float(bpm)))


def _beats_for_division(division: str) -> float:
    if division not in _DIVISION_BEATS:
        raise QuantizeError(
            f"unknown division {division!r} — supported: "
            f"{sorted(set(_DIVISION_BEATS.keys()))}"
        )
    return _DIVISION_BEATS[division]


def frames_per_beat(bpm: float, sample_rate: float = SAMPLE_RATE_HZ) -> float:
    """Frames per quarter note at ``bpm``.

    Example: 120 BPM at 48000 Hz → 24000 frames per beat.
    """
    if sample_rate <= 0:
        raise QuantizeError(f"sample_rate must be positive (got {sample_rate})")
    clamped = _clamp_bpm(bpm)
    return (60.0 * sample_rate) / clamped


def frames_per_division(
    bpm: float,
    division: str,
    sample_rate: float = SAMPLE_RATE_HZ,
) -> float:
    """Frames per ``division`` grid cell.

    Example: 120 BPM, eighth, 48000 Hz → 12000.0.
    """
    return frames_per_beat(bpm, sample_rate) * _beats_for_division(division)


def snap_frames_to_grid(
    frames: int,
    bpm: float,
    division: str,
    sample_rate: float = SAMPLE_RATE_HZ,
    mode: SnapMode = "nearest",
) -> int:
    """Snap ``frames`` to the nearest grid boundary.

    ``mode``:
        - ``"nearest"`` (default): banker's-rounding-style round-half-up
          to the closest boundary.
        - ``"up"``: smallest grid boundary >= frames.
        - ``"down"``: largest grid boundary <= frames.

    Always returns ``int`` so callers feeding the engine's int-frame
    APIs don't need to cast.
    """
    if frames < 0:
        raise QuantizeError(f"frames must be non-negative (got {frames})")
    fpd = frames_per_division(bpm, division, sample_rate)
    if fpd <= 0:
        # Shouldn't happen given clamps, but guard the division-by-zero.
        raise QuantizeError(
            f"computed grid spacing is non-positive ({fpd}) — check bpm + division"
        )
    if mode == "nearest":
        # Round-half-up using shifted floor; avoids Python's bankers'
        # rounding edge cases at exact .5 boundaries.
        return int((frames + fpd / 2.0) // fpd * fpd)
    if mode == "up":
        # Ceil to next boundary; exact boundary stays put.
        if frames % fpd == 0:
            return int(frames)
        return int((frames // fpd + 1) * fpd)
    if mode == "down":
        return int((frames // fpd) * fpd)
    raise QuantizeError(
        f"unknown snap mode {mode!r} — must be one of nearest / up / down"
    )


def grid_aligned(
    frames: int,
    bpm: float,
    division: str,
    sample_rate: float = SAMPLE_RATE_HZ,
    tolerance_frames: int = 1,
) -> bool:
    """Return True when ``frames`` lies within ``tolerance_frames`` of
    a grid boundary.

    Useful for the "is this take grid-aligned?" check before deciding
    whether to nudge a loop length.
    """
    if frames < 0:
        return False
    fpd = frames_per_division(bpm, division, sample_rate)
    if fpd <= 0:
        return False
    nearest_boundary = round(frames / fpd) * fpd
    return abs(frames - nearest_boundary) <= float(tolerance_frames)


def beats_for_frames(
    frames: int,
    bpm: float,
    sample_rate: float = SAMPLE_RATE_HZ,
) -> float:
    """Inverse of ``frames_per_beat`` — how many beats does this
    frame count cover?"""
    if frames < 0:
        raise QuantizeError(f"frames must be non-negative (got {frames})")
    return float(frames) / frames_per_beat(bpm, sample_rate)
