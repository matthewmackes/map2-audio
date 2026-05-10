"""
T2499-B Slice 6 — LCD calibration grid fitter.

Operator workflow (after pressure-curves, before profile selection):

  1. Orchestrator transitions to ``LCD_CALIBRATION``.
  2. The MK1 LCD shows a calibration grid: a stepped grayscale ramp
     across both displays at known input intensities (0.0..1.0).
  3. For each step, the operator taps the encoder one of three ways:
     ``darker``, ``correct``, or ``lighter``. Per LCD (left/right), per
     intensity-step, the tap records the operator's perceived offset.
  4. ``finalize()`` fits a single ``gamma`` + per-LCD ``bias`` offset
     and returns an ``lcd`` payload ready to feed
     ``MaschineCalibrationStore.update(lcd=...)``.

Math
----

The schema's ``lcd`` block has:

  - ``gamma``     — a single host-wide value, 0.5..3.0
  - ``per_lcd_bias.{left,right}`` — integer offsets, -32..32

The fitter approximates these from the operator's tri-state taps:

  - ``bias`` (per LCD): take the median tap. ``darker`` → +k, ``correct``
    → 0, ``lighter`` → -k, where ``k`` is a per-step weight scaled by
    grayscale step (a tap on a near-black step is worth less than a
    tap on a near-mid step). Result clamped to [-32, 32].

  - ``gamma`` (host-wide): the slope of the operator's perceived-vs-
    requested mismatch across the grayscale ramp tells us whether
    midtones read brighter (gamma should drop below 1.0) or darker
    (gamma should rise above 1.0). Computed as a least-squares fit on
    the (input, perceived_output) pairs assembled from both LCDs;
    clamped to [0.5, 3.0]. With no observations → 1.0.

Why not numpy
-------------

Like the pressure-curve fitter, this stays pure-Python: the
calibration_store schema is the only consumer, and the matrix here
is at most 2×2.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Literal, Tuple

from app.services.maschine.calibration_store import default_lcd


LcdId = Literal["left", "right"]
LcdTap = Literal["darker", "correct", "lighter"]

LCD_IDS: Tuple[LcdId, ...] = ("left", "right")

# Per-tap bias contribution at a normalized step weight of 1.0. The
# default 8-step grid maps each tap to ±2 LCD-output units after the
# step weighting, so a fully-asymmetric ramp (every tap "darker" at
# every step) saturates near the schema cap of +32.
TAP_BIAS_UNIT = 4.0

# Schema clamps from calibration_store._validate_lcd.
GAMMA_MIN = 0.5
GAMMA_MAX = 3.0
BIAS_MIN = -32
BIAS_MAX = 32


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class LcdCalibrationError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Recorder + finalizer
# ---------------------------------------------------------------------------


@dataclass
class _LcdSamples:
    # List of (intensity_step, tap) per LCD.
    taps: List[Tuple[float, LcdTap]] = field(default_factory=list)


class LcdCalibrationFitter:
    """Records operator taps and emits the schema's ``lcd`` payload."""

    def __init__(self) -> None:
        self._samples: Dict[LcdId, _LcdSamples] = {
            lcd: _LcdSamples() for lcd in LCD_IDS
        }

    # -- input -------------------------------------------------------------

    def record_tap(
        self,
        lcd_id: LcdId,
        intensity_step: float,
        tap: LcdTap,
    ) -> None:
        """Record one operator tap.

        ``intensity_step`` is the requested grayscale level for this
        step (0.0..1.0). ``tap`` is the operator's tri-state response.
        """
        if lcd_id not in LCD_IDS:
            raise LcdCalibrationError(
                f"lcd_id must be one of {LCD_IDS!r}; got {lcd_id!r}",
            )
        if not isinstance(intensity_step, (int, float)) or not 0.0 <= intensity_step <= 1.0:
            raise LcdCalibrationError(
                f"intensity_step must be 0.0..1.0; got {intensity_step!r}",
            )
        if tap not in ("darker", "correct", "lighter"):
            raise LcdCalibrationError(
                f"tap must be darker|correct|lighter; got {tap!r}",
            )
        self._samples[lcd_id].taps.append((float(intensity_step), tap))

    # -- coverage ---------------------------------------------------------

    def coverage(self) -> Dict[str, object]:
        """Return how many taps each LCD has on record.

        The orchestrator uses this to decide whether to advance to
        ``PROFILE_SELECTION`` or to keep prompting for more taps.
        """
        per_lcd = {lcd: len(self._samples[lcd].taps) for lcd in LCD_IDS}
        complete = all(count > 0 for count in per_lcd.values())
        return {"per_lcd": per_lcd, "complete": complete}

    # -- output -----------------------------------------------------------

    def finalize(self) -> Dict[str, object]:
        biases: Dict[str, int] = {}
        for lcd in LCD_IDS:
            biases[lcd] = self._fit_bias(self._samples[lcd])
        gamma = self._fit_gamma_across_lcds()
        return {
            "gamma": gamma,
            "per_lcd_bias": biases,
        }

    # -- internals --------------------------------------------------------

    @staticmethod
    def _fit_bias(samples: _LcdSamples) -> int:
        if not samples.taps:
            return int(default_lcd()["per_lcd_bias"]["left"])  # 0
        # Each tap contributes ±TAP_BIAS_UNIT * step_weight. Step
        # weight peaks in midtones (least information at the rails).
        # weight(s) = 1 - |s - 0.5| * 2 so endpoints contribute 0.
        contributions: List[float] = []
        for step, tap in samples.taps:
            weight = max(0.0, 1.0 - abs(step - 0.5) * 2.0)
            if tap == "darker":
                contributions.append(+TAP_BIAS_UNIT * weight)
            elif tap == "lighter":
                contributions.append(-TAP_BIAS_UNIT * weight)
            else:
                contributions.append(0.0)
        mean = sum(contributions) / len(contributions)
        # Schema requires int -32..32.
        return int(round(max(BIAS_MIN, min(BIAS_MAX, mean * len(samples.taps) / 2.0))))

    def _fit_gamma_across_lcds(self) -> float:
        # Convert taps to perceived-vs-requested pairs.
        # We're fitting gamma so that ``output = input ** gamma`` is
        # the correction the operator wants. With x,y in (0,1),
        # ``log(y) / log(x)`` produces:
        #   - gamma > 1 when |log(y)| > |log(x)|  ⇔  y is closer to 0
        #     than x (output darker than requested);
        #   - gamma < 1 when |log(y)| < |log(x)|  ⇔  y is closer to 1
        #     than x (output brighter than requested).
        # So:
        #   darker  → operator wants output darker → set perceived
        #             closer to 0 than the step (drives gamma > 1).
        #   lighter → operator wants output brighter → set perceived
        #             closer to 1 than the step (drives gamma < 1).
        #   correct → perceived = step → gamma = 1.
        # Endpoints (x=0 or y=0) are excluded.
        log_x: List[float] = []
        log_y: List[float] = []
        for lcd in LCD_IDS:
            for step, tap in self._samples[lcd].taps:
                if tap == "darker":
                    perceived = max(1e-6, step - 0.05)
                elif tap == "lighter":
                    perceived = min(1.0, step + 0.05)
                else:
                    perceived = step
                if step <= 0.0 or perceived <= 0.0:
                    continue
                log_x.append(math.log(step))
                log_y.append(math.log(perceived))
        if not log_x:
            return float(default_lcd()["gamma"])  # 1.0
        # Linear regression through the origin: gamma = sum(x*y)/sum(x*x)
        denom = sum(x * x for x in log_x)
        if denom < 1e-12:
            return float(default_lcd()["gamma"])
        gamma = sum(x * y for x, y in zip(log_x, log_y)) / denom
        return float(max(GAMMA_MIN, min(GAMMA_MAX, gamma)))
