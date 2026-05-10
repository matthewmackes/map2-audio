"""
T2499-B Slice 4 — pad-sensitivity calibrator.

Operator workflow (Q50 step 5, after the tour completes):

  1. Orchestrator transitions to ``PAD_SENSITIVITY``.
  2. The MK1 LCD prompts: "Press pad N as light as you can" → repeat.
  3. The MK1 LCD prompts: "Press pad N as hard as you can" → repeat.
  4. The orchestrator emits each pressure reading to
     ``PadSensitivityCalibrator.record_press(pad_index, mode, velocity)``.
  5. When all 16 pads are covered for both modes, ``finalize()`` returns
     a 16-entry calibration list ready to feed into
     ``MaschineCalibrationStore.update(pad_sensitivity=...)``.

The calibrator is fully synchronous and stateless across instances —
one calibrator object per onboarding session.

Heuristics (locked here, change-controlled by tests):

- **threshold** = ``min_observed_velocity_in_light_mode + 1`` (clamped
  to [1, 64]). Picking +1 above the *softest* observed press lets the
  pad respond to anything at or above the operator's intended floor.
- **max_velocity** = ``max_observed_velocity_in_hard_mode`` (clamped to
  [threshold + 8, 127]). This sets the upper rail so the operator's
  hardest press hits the top of the velocity range.
- The +8 minimum spacing between threshold and max_velocity matches
  the calibration_store invariant (``threshold < max_velocity``).
- If a pad is never recorded in a mode, the default
  (threshold=8, max_velocity=120) is used for that pad — defaults that
  match ``calibration_store.default_pad_sensitivity()``.

The calibrator does **not** drive the LCD or read MIDI directly —
those concerns live in the daemon's profile-runtime + MIDI subscriber.
This module is the pure analysis seam between "operator presses
recorded" and "calibration payload ready to save."
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Dict, List

from app.services.maschine.calibration_store import (
    PAD_COUNT,
    default_pad_sensitivity,
)


class PressMode(str, enum.Enum):
    LIGHT = "light"
    HARD = "hard"


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------


THRESHOLD_MIN = 1
THRESHOLD_MAX = 64

MAX_VELOCITY_MIN_FROM_THRESHOLD = 8  # threshold + 8 ≤ max_velocity
MAX_VELOCITY_CEILING = 127

DEFAULT_THRESHOLD = 8
DEFAULT_MAX_VELOCITY = 120


class PadSensitivityCalibrationError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Recorder + finalizer
# ---------------------------------------------------------------------------


@dataclass
class _PadObservations:
    light: List[int] = field(default_factory=list)
    hard: List[int] = field(default_factory=list)


@dataclass
class CalibrationCoverage:
    """Returned by ``coverage()`` so the orchestrator can decide
    whether the operator has pressed every pad in every mode."""

    pads_with_light: int
    pads_with_hard: int
    missing_light: List[int]
    missing_hard: List[int]

    @property
    def complete(self) -> bool:
        return not self.missing_light and not self.missing_hard


class PadSensitivityCalibrator:
    """Records pad-pressure observations and emits a calibration payload."""

    def __init__(self) -> None:
        self._observations: Dict[int, _PadObservations] = {
            i: _PadObservations() for i in range(PAD_COUNT)
        }

    # -- inputs ------------------------------------------------------------

    def record_press(
        self,
        pad_index: int,
        mode: PressMode,
        velocity: int,
    ) -> None:
        if not 0 <= pad_index < PAD_COUNT:
            raise PadSensitivityCalibrationError(
                f"pad_index must be 0..{PAD_COUNT - 1}; got {pad_index}",
            )
        if not isinstance(mode, PressMode):
            raise PadSensitivityCalibrationError(
                f"mode must be a PressMode; got {type(mode).__name__}",
            )
        if not isinstance(velocity, int) or not 1 <= velocity <= 127:
            raise PadSensitivityCalibrationError(
                f"velocity must be int 1..127; got {velocity!r}",
            )
        target = self._observations[pad_index]
        if mode is PressMode.LIGHT:
            target.light.append(velocity)
        else:
            target.hard.append(velocity)

    # -- introspection -----------------------------------------------------

    def coverage(self) -> CalibrationCoverage:
        missing_light = [
            i for i in range(PAD_COUNT) if not self._observations[i].light
        ]
        missing_hard = [
            i for i in range(PAD_COUNT) if not self._observations[i].hard
        ]
        return CalibrationCoverage(
            pads_with_light=PAD_COUNT - len(missing_light),
            pads_with_hard=PAD_COUNT - len(missing_hard),
            missing_light=missing_light,
            missing_hard=missing_hard,
        )

    # -- output ------------------------------------------------------------

    def finalize(self) -> List[Dict[str, int]]:
        """Compute per-pad threshold + max_velocity from observations.

        Pads with no observations in a mode use the default from
        ``calibration_store.default_pad_sensitivity()``. Pads with only
        a partial set of observations apply the heuristic to whichever
        side is present and fall back to the default for the other.
        """
        result: List[Dict[str, int]] = []
        defaults = default_pad_sensitivity()
        for index in range(PAD_COUNT):
            obs = self._observations[index]
            default = defaults[index]
            if obs.light:
                threshold = max(THRESHOLD_MIN, min(min(obs.light) + 1, THRESHOLD_MAX))
            else:
                threshold = default["threshold"]
            if obs.hard:
                raw_max = max(obs.hard)
                max_velocity = min(max(raw_max, threshold + MAX_VELOCITY_MIN_FROM_THRESHOLD),
                                   MAX_VELOCITY_CEILING)
            else:
                max_velocity = default["max_velocity"]
            # Final guard — schema invariant from calibration_store.
            if max_velocity <= threshold:
                max_velocity = min(threshold + MAX_VELOCITY_MIN_FROM_THRESHOLD,
                                   MAX_VELOCITY_CEILING)
            result.append({"threshold": int(threshold), "max_velocity": int(max_velocity)})
        return result
