"""Shared loader for the declared default LV2 effects manifest."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


DEFAULT_EFFECTS_MANIFEST_PATH = Path(__file__).resolve().parents[1] / "deployment" / "default_lv2_effects.json"


def get_default_effects_manifest_path() -> Path:
    """Return the canonical default-LV2 deployment manifest path."""
    return DEFAULT_EFFECTS_MANIFEST_PATH


def load_default_effects_manifest() -> dict[str, Any]:
    """Load the canonical default-LV2 deployment manifest."""
    path = get_default_effects_manifest_path()
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)
