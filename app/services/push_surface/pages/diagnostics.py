"""Diagnostics page rendering."""

from __future__ import annotations

from app.services.push_surface.config import PushSurfaceConfig
from app.services.push_surface.models.capabilities import SurfaceColor
from app.services.push_surface.models.render_state import ControlLightState, RenderFrame
from app.services.push_surface.models.state import PushSurfaceState
from app.services.push_surface.pages import display_frame, merge_page_button_lights


def build_diagnostics_page(state: PushSurfaceState, config: PushSurfaceConfig) -> RenderFrame:
    """Render diagnostics counters and quick actions."""

    diagnostics = state.diagnostics
    frame = RenderFrame(
        pad_lights={
            "grid_0_0": ControlLightState(color=SurfaceColor.WHITE),
            "grid_1_0": ControlLightState(color=SurfaceColor.BLUE),
            "grid_2_0": ControlLightState(color=SurfaceColor.GREEN),
        },
        display=display_frame(
            "Diagnostics",
            f"MIDI in: {diagnostics.midi_events_in}",
            f"MIDI out: {diagnostics.midi_events_out}",
            f"Decoded: {len(diagnostics.decoded_events)}",
            "Pad 0=test pattern, 1=render dump, 2=capabilities",
        ),
    )
    return merge_page_button_lights(frame, state.active_page)
