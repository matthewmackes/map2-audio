"""
LCD snapshot hook evaluator — T2430-I + T2430-J.

Each snapshot MAY carry an optional LCD hook that tells the LCD cluster
what to do when that snapshot activates. Per Q6a=B, the hook is a union:

    {preset: "<preset-name>"}      → reference a named preset
    {inline: {...per-field...}}     → inline override of 5 snapshot-aware fields

Missing or empty hook = keep the current node-local lcd.displays config
untouched (fallback-to-node-local semantics).

Storage is a flat JSON file per snapshot under ``~/.map2/snapshot_lcd_hooks/``
so this subsystem is independent of the main snapshot persistence layer
(avoids a full schema migration for Phase 1).

Resolution order:
1. Hook absent → return None (no change).
2. ``{preset: name}`` → load that preset (built-in or user), return the
   5 snapshot-aware fields only (per-LCD).
3. ``{inline: {...}}`` → return the 5 snapshot-aware fields verbatim.

T2430-J adds morph-aware interpolation between corner hooks (A/B/C/D).
This module exposes ``interpolate_snapshot_aware()`` for the evaluator.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

from app.config_schema import LCD_SNAPSHOT_AWARE_FIELDS

logger = logging.getLogger(__name__)


def hooks_dir() -> Path:
    d = Path.home() / ".map2" / "snapshot_lcd_hooks"
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_hook(snapshot_id: str) -> Optional[dict[str, Any]]:
    f = hooks_dir() / f"{snapshot_id}.json"
    if not f.exists():
        return None
    try:
        with open(f) as fp:
            return json.load(fp)
    except Exception as e:  # noqa: BLE001
        logger.warning("LCD hook load failed for %s: %s", snapshot_id, e)
        return None


def set_hook(snapshot_id: str, hook: Optional[dict[str, Any]]) -> None:
    f = hooks_dir() / f"{snapshot_id}.json"
    if hook is None:
        if f.exists():
            f.unlink()
        return
    with open(f, "w") as fp:
        json.dump(hook, fp, indent=2)


def resolve_hook(hook: Optional[dict[str, Any]], *, load_preset) -> Optional[dict[str, Any]]:
    """Resolve a hook envelope to the final set of snapshot-aware overrides.

    Returns a dict shaped like ``{"displays": [ {id, field, ...}, ... ]}``
    where each display entry contains ONLY snapshot-aware fields. Missing
    displays means "no override for that LCD".

    ``load_preset`` is a callable ``(name) -> preset_config_or_None`` used
    to resolve preset references; injected to avoid an import cycle.
    """
    if not hook:
        return None

    # Union member: preset reference.
    if "preset" in hook:
        preset_name = hook["preset"]
        preset = load_preset(preset_name)
        if not preset:
            logger.warning("Snapshot LCD hook references unknown preset '%s'", preset_name)
            return None
        displays_src = preset.get("displays", [])
        return {"displays": [_project_snapshot_aware(d) for d in displays_src]}

    # Union member: inline.
    if "inline" in hook:
        displays_src = hook["inline"].get("displays", [])
        return {"displays": [_project_snapshot_aware(d) for d in displays_src]}

    return None


def _project_snapshot_aware(display_entry: dict[str, Any]) -> dict[str, Any]:
    """Keep id + snapshot-aware fields only; drop hardware-calibration fields."""
    out: dict[str, Any] = {}
    if "id" in display_entry:
        out["id"] = display_entry["id"]
    for field in LCD_SNAPSHOT_AWARE_FIELDS:
        if field in display_entry:
            out[field] = display_entry[field]
    return out


# ---- Morph-aware interpolation (T2430-J) ----


def interpolate_snapshot_aware(
    corners: dict[str, Optional[dict[str, Any]]],
    *,
    x: float,
    y: float,
) -> Optional[dict[str, Any]]:
    """Interpolate four corner snapshot overrides at morph position (x, y).

    corners: ``{"A": overrides_or_None, "B": ..., "C": ..., "D": ...}`` where
    each value is the output of ``resolve_hook()`` (or None for no override).

    Layout (standard morph pad):
        A = (0, 0)     B = (1, 0)
        C = (0, 1)     D = (1, 1)

    Q6b rules:
    - default_page (categorical) → snap to nearest corner.
    - auto_cycle_interval_s, idle_dim_timeout_s (numeric) → bilinear interp.
    - alert_sound, auto_cycle_enabled (bool) → 0.5 threshold after bilinear
      interpolation of 0/1 values.
    """
    x = max(0.0, min(1.0, x))
    y = max(0.0, min(1.0, y))

    # If all corners are None, no morph override.
    if all(v is None for v in corners.values()):
        return None

    # Nearest corner for categorical snap.
    nearest_key = _nearest_corner(x, y)
    nearest = corners.get(nearest_key) or {}
    nearest_displays = {d["id"]: d for d in nearest.get("displays", [])}

    # Collect display ids present in any corner.
    display_ids: set[int] = set()
    for corner_data in corners.values():
        if corner_data:
            for d in corner_data.get("displays", []):
                if "id" in d:
                    display_ids.add(d["id"])

    result_displays: list[dict[str, Any]] = []
    for lcd_id in sorted(display_ids):
        entry: dict[str, Any] = {"id": lcd_id}

        # Numeric fields — bilinear interpolation.
        for field in ("auto_cycle_interval_s", "idle_dim_timeout_s"):
            values = _per_corner_numeric(corners, lcd_id, field)
            if values is not None:
                entry[field] = _bilerp(values, x, y)

        # Bool fields — threshold at 0.5.
        for field in ("alert_sound", "auto_cycle_enabled"):
            bool_values = _per_corner_bool(corners, lcd_id, field)
            if bool_values is not None:
                entry[field] = _bilerp(bool_values, x, y) >= 0.5

        # Categorical — nearest corner snap.
        nearest_entry = nearest_displays.get(lcd_id, {})
        if "default_page" in nearest_entry:
            entry["default_page"] = nearest_entry["default_page"]

        result_displays.append(entry)

    return {"displays": result_displays}


def _nearest_corner(x: float, y: float) -> str:
    # Euclidean distance to the 4 corners.
    corners = {"A": (0.0, 0.0), "B": (1.0, 0.0), "C": (0.0, 1.0), "D": (1.0, 1.0)}
    best = min(corners.items(), key=lambda kv: (kv[1][0] - x) ** 2 + (kv[1][1] - y) ** 2)
    return best[0]


def _per_corner_numeric(corners, lcd_id: int, field: str) -> Optional[tuple[float, float, float, float]]:
    out: list[Optional[float]] = []
    for key in ("A", "B", "C", "D"):
        data = corners.get(key)
        if not data:
            out.append(None)
            continue
        match = next((d for d in data.get("displays", []) if d.get("id") == lcd_id), None)
        if match and field in match:
            out.append(float(match[field]))
        else:
            out.append(None)
    if all(v is None for v in out):
        return None
    # Fill missing corners with the nearest non-None value.
    filled = _fill_missing(out)
    return (filled[0], filled[1], filled[2], filled[3])


def _per_corner_bool(corners, lcd_id: int, field: str) -> Optional[tuple[float, float, float, float]]:
    numeric = _per_corner_numeric({
        key: _bool_corner_as_numeric(corners.get(key), lcd_id, field) for key in ("A", "B", "C", "D")
    }, lcd_id, field)
    return numeric


def _bool_corner_as_numeric(corner, lcd_id: int, field: str):
    if not corner:
        return None
    displays = []
    for d in corner.get("displays", []):
        nd = dict(d)
        if field in nd:
            nd[field] = 1.0 if nd[field] else 0.0
        displays.append(nd)
    return {"displays": displays}


def _fill_missing(values: list[Optional[float]]) -> list[float]:
    fallback = next((v for v in values if v is not None), 0.0)
    return [v if v is not None else fallback for v in values]


def _bilerp(values: tuple[float, float, float, float], x: float, y: float) -> float:
    a, b, c, d = values
    # A=(0,0) B=(1,0) C=(0,1) D=(1,1)
    top = a * (1 - x) + b * x
    bot = c * (1 - x) + d * x
    return top * (1 - y) + bot * y
