"""Preset page rendering."""

from __future__ import annotations

from app.services.push_surface.config import PushSurfaceConfig
from app.services.push_surface.models.capabilities import SurfaceColor
from app.services.push_surface.models.render_state import ControlLightState, RenderFrame
from app.services.push_surface.models.state import PushSurfaceState
from app.services.push_surface.pages import display_frame, grid_coordinates, merge_page_button_lights, render_empty_page


def build_presets_page(state: PushSurfaceState, config: PushSurfaceConfig) -> RenderFrame:
    """Render preset/snapshot recall slots."""

    if not state.presets:
        return render_empty_page(state, "Presets")

    selected = state.current_preset()
    pad_lights: dict[str, ControlLightState] = {}
    for index, preset in enumerate(state.presets[:64]):
        x, y = grid_coordinates(index)
        control_id = f"grid_{x}_{y}"
        color = SurfaceColor.GREEN if preset.is_active else SurfaceColor.WHITE
        if selected is not None and preset.id == selected.id:
            color = SurfaceColor.BLUE
        pad_lights[control_id] = ControlLightState(color=color, pulse=bool(selected and preset.id == selected.id))

    frame = RenderFrame(
        pad_lights=pad_lights,
        display=display_frame(
            "Presets",
            f"Selected: {selected.name if selected else 'None'}",
            "Press to recall",
            "Long-press save is reserved for later",
        ),
    )
    return merge_page_button_lights(frame, state.active_page)
