"""
T2499-B Slice 5 — pressure-curve fitter.

Operator workflow (after pad-sensitivity, before LCD calibration):

  1. Orchestrator transitions to ``PRESSURE_CURVES``.
  2. The MK1 LCD prompts: "Hold pad N at light/medium/hard pressure."
  3. The orchestrator records (pad_index, normalized_pressure_input,
     measured_pressure_output) tuples for each pad.
  4. ``finalize()`` fits a low-order polynomial per pad and returns a
     `pressure_curves` payload ready to feed
     `MaschineCalibrationStore.update(pressure_curves=...)`.

Math
----

For each pad, we fit::

    y = c0 + c1 * x + c2 * x^2  (order = 2 by default)

via plain least-squares (Gauss-Jordan elimination on the normal
equations). The choice not to use numpy is deliberate — the rest of
the maschine code path stays numpy-free, and the polynomial degree
is capped at 4 so a 4×4 normal equation is trivial to solve in pure
Python.

The fitter falls back to the linear default ``[0.0, 1.0]`` for any
pad with fewer observations than coefficients (the schema accepts
1..4 coefficients, so a pad with one observation gets a constant
fit ``[y0]``, a pad with two gets a linear fit, etc.).

Global compensation
-------------------

The schema's ``global_compensation`` field captures a host-wide bias
that the operator can dial in if every pad reads slightly heavy/light
under their fingers. The fitter computes it as the mean of all
observed (output - linear_prediction(input)) residuals across every
pad, clamped to [-1.0, 1.0]. With no observations, it is 0.0.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from app.services.maschine.calibration_store import (
    PAD_COUNT,
    default_pressure_curves,
)


DEFAULT_POLYNOMIAL_ORDER = 2

# Schema accepts 1..4 coefficients; we fit at most this many.
MAX_POLYNOMIAL_ORDER = 4


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class PressureCurveError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Recorder + finalizer
# ---------------------------------------------------------------------------


@dataclass
class _PadSamples:
    inputs: List[float] = field(default_factory=list)
    outputs: List[float] = field(default_factory=list)


class PressureCurveFitter:
    """Records pad-pressure samples and emits a fitted curve payload."""

    def __init__(self, *, order: int = DEFAULT_POLYNOMIAL_ORDER) -> None:
        if not 1 <= order <= MAX_POLYNOMIAL_ORDER:
            raise PressureCurveError(
                f"order must be 1..{MAX_POLYNOMIAL_ORDER}; got {order}",
            )
        self._order = order
        self._samples: Dict[int, _PadSamples] = {
            i: _PadSamples() for i in range(PAD_COUNT)
        }

    # -- input -------------------------------------------------------------

    def record_sample(
        self,
        pad_index: int,
        input_value: float,
        output_value: float,
    ) -> None:
        if not 0 <= pad_index < PAD_COUNT:
            raise PressureCurveError(
                f"pad_index must be 0..{PAD_COUNT - 1}; got {pad_index}",
            )
        if not isinstance(input_value, (int, float)) or not 0.0 <= input_value <= 1.0:
            raise PressureCurveError(
                f"input_value must be 0.0..1.0; got {input_value!r}",
            )
        if not isinstance(output_value, (int, float)) or not 0.0 <= output_value <= 1.0:
            raise PressureCurveError(
                f"output_value must be 0.0..1.0; got {output_value!r}",
            )
        target = self._samples[pad_index]
        target.inputs.append(float(input_value))
        target.outputs.append(float(output_value))

    # -- output ------------------------------------------------------------

    def finalize(self) -> Dict[str, object]:
        per_pad: List[Dict[str, List[float]]] = []
        residuals: List[float] = []
        for pad_index in range(PAD_COUNT):
            samples = self._samples[pad_index]
            poly = self._fit_pad(samples)
            per_pad.append({"polynomial": poly})
            # Linear residual contributes to global_compensation:
            # actual_output - input (the perfectly-linear identity).
            for x, y in zip(samples.inputs, samples.outputs):
                residuals.append(y - x)
        if residuals:
            mean = sum(residuals) / len(residuals)
            global_comp = max(-1.0, min(1.0, mean))
        else:
            global_comp = 0.0
        return {
            "global_compensation": global_comp,
            "per_pad": per_pad,
        }

    # -- internals ---------------------------------------------------------

    def _fit_pad(self, samples: _PadSamples) -> List[float]:
        n = len(samples.inputs)
        if n == 0:
            return list(default_pressure_curves()["per_pad"][0]["polynomial"])
        # Effective order: can't fit a degree-k polynomial with fewer
        # than k+1 observations, so reduce.
        effective_order = min(self._order, n - 1)
        if effective_order <= 0:
            # Single observation → constant fit at y0.
            return [samples.outputs[0]]
        return self._least_squares(samples.inputs, samples.outputs, effective_order)

    @staticmethod
    def _least_squares(
        xs: List[float],
        ys: List[float],
        order: int,
    ) -> List[float]:
        """Solve the normal equations for a degree-``order`` polynomial.

        Builds the (order+1) × (order+1) Gram matrix + the moment
        vector, then solves via Gaussian elimination with partial
        pivoting. Pure-Python — no numpy.
        """
        coef_count = order + 1
        # gram[r][c] = sum(x^(r+c))
        gram = [
            [sum(x ** (r + c) for x in xs) for c in range(coef_count)]
            for r in range(coef_count)
        ]
        # moments[r] = sum(y * x^r)
        moments = [sum(y * (x ** r) for x, y in zip(xs, ys)) for r in range(coef_count)]
        # Augmented matrix for elimination.
        augmented = [list(gram[r]) + [moments[r]] for r in range(coef_count)]
        # Gauss-Jordan with partial pivoting.
        for col in range(coef_count):
            pivot = max(range(col, coef_count), key=lambda r: abs(augmented[r][col]))
            if abs(augmented[pivot][col]) < 1e-12:
                # Singular — fall back to linear identity.
                return [0.0, 1.0]
            augmented[col], augmented[pivot] = augmented[pivot], augmented[col]
            pivot_value = augmented[col][col]
            for c in range(col, coef_count + 1):
                augmented[col][c] /= pivot_value
            for r in range(coef_count):
                if r == col:
                    continue
                factor = augmented[r][col]
                for c in range(col, coef_count + 1):
                    augmented[r][c] -= factor * augmented[col][c]
        return [augmented[r][coef_count] for r in range(coef_count)]
