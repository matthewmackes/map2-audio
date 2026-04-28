"""Canonical MIDI response-curve enum shared across services.

Worklist: T2459-H4
"""

from __future__ import annotations

from enum import Enum


class CurveType(str, Enum):
    LINEAR = "linear"
    LOGARITHMIC = "logarithmic"
    EXPONENTIAL = "exponential"
    S_CURVE = "s_curve"
    REVERSE = "reverse"

