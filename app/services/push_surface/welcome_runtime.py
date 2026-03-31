"""Helpers for saved welcome-routine playback on Push surfaces."""

from __future__ import annotations

from typing import Any

from app.services.push_surface.models.capabilities import SurfaceColor
from app.services.push_surface.models.render_state import ControlLightState, DisplayFrame, RenderFrame


def _surface_color(value: str | None) -> SurfaceColor:
    normalized = str(value or "OFF").strip().upper()
    try:
        return SurfaceColor[normalized]
    except KeyError:
        return SurfaceColor.OFF


def _resolve_template(value: str | None, stats: dict[str, str]) -> str:
    text = str(value or "")
    for key, replacement in stats.items():
        text = text.replace(f"{{{key}}}", str(replacement))
    return text


def build_render_frame_from_welcome_step(step: dict[str, Any], stats: dict[str, str]) -> RenderFrame:
    pad_lights: dict[str, ControlLightState] = {}
    button_lights: dict[str, ControlLightState] = {}

    for control_id, raw_state in (step.get("pad_lights") or {}).items():
        if not isinstance(raw_state, dict):
            continue
        pad_lights[str(control_id)] = ControlLightState(
            color=_surface_color(raw_state.get("color")),
            pulse=bool(raw_state.get("pulse", False)),
            blink=bool(raw_state.get("blink", False)),
            label=raw_state.get("label"),
        )

    for control_id, raw_state in (step.get("button_lights") or {}).items():
        if not isinstance(raw_state, dict):
            continue
        button_lights[str(control_id)] = ControlLightState(
            color=_surface_color(raw_state.get("color")),
            pulse=bool(raw_state.get("pulse", False)),
            blink=bool(raw_state.get("blink", False)),
            label=raw_state.get("label"),
        )

    raw_display = step.get("display") or {}
    display = None
    if isinstance(raw_display, dict):
        display = DisplayFrame(
            title=_resolve_template(raw_display.get("title"), stats),
            lines=tuple(_resolve_template(line, stats) for line in raw_display.get("lines") or ()),
        )

    return RenderFrame(
        pad_lights=pad_lights,
        button_lights=button_lights,
        display=display,
    )
