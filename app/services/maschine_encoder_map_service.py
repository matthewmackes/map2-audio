"""Shared Maschine encoder-map normalization helpers."""

from __future__ import annotations

import copy
from typing import Any


DEFAULT_MASCHINE_ENCODER_MAP = {
    "enc1": None,
    "enc2": None,
    "enc3": None,
    "enc4": None,
    "enc5": None,
    "enc6": None,
    "enc7": None,
    "enc8": None,
    "vol": {"fixed": True, "label": "Master Gain"},
    "tempo": {"fixed": True, "label": "MIDI Clock BPM"},
    "swing": {"label": "Swing"},
}


def default_maschine_encoder_map() -> dict[str, Any]:
    return copy.deepcopy(DEFAULT_MASCHINE_ENCODER_MAP)


def normalize_maschine_encoder_map(encoder_map: dict[str, Any] | None) -> dict[str, Any]:
    normalized = default_maschine_encoder_map()
    for key, value in dict(encoder_map or {}).items():
        if key not in normalized:
            continue
        if key in {"enc1", "vol", "tempo"}:
            continue
        if value is None:
            normalized[key] = None
            continue
        if isinstance(value, dict):
            normalized[key] = copy.deepcopy(value)
    return normalized
