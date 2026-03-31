"""Routing page rendering."""

from __future__ import annotations

from app.services.push_surface.config import PushSurfaceConfig
from app.services.push_surface.models.capabilities import SurfaceColor
from app.services.push_surface.models.render_state import ControlLightState, RenderFrame
from app.services.push_surface.models.state import PushSurfaceState
from app.services.push_surface.pages import display_frame, merge_page_button_lights, render_empty_page


def build_routing_page(state: PushSurfaceState, config: PushSurfaceConfig) -> RenderFrame:
    """Render the current routing matrix."""

    routing = state.routing
    if not routing.sources or not routing.destinations:
        return render_empty_page(state, "Routing")

    source_index = {source_id: index for index, source_id in enumerate(routing.sources[:8])}
    dest_index = {dest_id: index for index, dest_id in enumerate(routing.destinations[:8])}
    pad_lights: dict[str, ControlLightState] = {}
    for slot in routing.slots:
        if slot.source_id not in source_index or slot.destination_id not in dest_index:
            continue
        x = source_index[slot.source_id]
        y = dest_index[slot.destination_id]
        color = SurfaceColor.GREEN if slot.active else SurfaceColor.DIM
        if slot.preview:
            color = SurfaceColor.BLUE
        pad_lights[f"grid_{x}_{y}"] = ControlLightState(color=color, pulse=slot.preview)

    frame = RenderFrame(
        pad_lights=pad_lights,
        button_lights={
            "confirm": ControlLightState(
                color=SurfaceColor.AMBER if routing.pending_confirmation else SurfaceColor.WHITE
            ),
        },
        display=display_frame(
            "Routing",
            f"Sources: {len(routing.sources)}",
            f"Destinations: {len(routing.destinations)}",
            "Press a cell. Confirm if safe mode is on.",
        ),
    )
    return merge_page_button_lights(frame, state.active_page)
