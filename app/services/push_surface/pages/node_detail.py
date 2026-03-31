"""Node-detail page rendering."""

from __future__ import annotations

from app.services.push_surface.config import PushSurfaceConfig
from app.services.push_surface.models.capabilities import SurfaceColor
from app.services.push_surface.models.render_state import ControlLightState, RenderFrame
from app.services.push_surface.models.state import PushSurfaceState
from app.services.push_surface.pages import display_frame, merge_page_button_lights, render_empty_page


def build_node_detail_page(state: PushSurfaceState, config: PushSurfaceConfig) -> RenderFrame:
    """Render summary/status information for the selected node."""

    node = state.current_node()
    if node is None:
        return render_empty_page(state, "Node Detail")

    pad_lights = {
        "grid_0_0": ControlLightState(color=SurfaceColor.BLUE, pulse=True),
        "grid_1_0": ControlLightState(color=SurfaceColor.AMBER if node.bypassed else SurfaceColor.GREEN),
        "grid_2_0": ControlLightState(color=config.color_for_category(node.category)),
    }
    frame = RenderFrame(
        pad_lights=pad_lights,
        button_lights={
            "bypass": ControlLightState(color=SurfaceColor.RED if node.bypassed else SurfaceColor.GREEN),
            "select": ControlLightState(color=SurfaceColor.WHITE),
            "page_parameters": ControlLightState(color=SurfaceColor.BLUE),
        },
        display=display_frame(
            "Node Detail",
            f"Name: {node.name}",
            f"Type: {node.node_type}",
            f"State: {'Bypassed' if node.bypassed else 'Active'}",
            "Bypass or jump to Parameters.",
        ),
    )
    return merge_page_button_lights(frame, state.active_page)
