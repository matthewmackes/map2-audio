"""Chains page rendering."""

from __future__ import annotations

from app.services.push_surface.config import PushSurfaceConfig
from app.services.push_surface.models.capabilities import SurfaceColor
from app.services.push_surface.models.render_state import ControlLightState, RenderFrame
from app.services.push_surface.models.state import PushSurfaceState
from app.services.push_surface.pages import display_frame, grid_coordinates, merge_page_button_lights, render_empty_page


def build_chains_page(state: PushSurfaceState, config: PushSurfaceConfig) -> RenderFrame:
    """Render nodes for the currently selected chain."""

    chain = state.current_chain()
    if chain is None:
        return render_empty_page(state, "Chains")

    pad_lights: dict[str, ControlLightState] = {}
    selected_node = state.current_node()
    for index, node in enumerate(chain.nodes[:64]):
        x, y = grid_coordinates(index)
        control_id = f"grid_{x}_{y}"
        color = config.color_for_category(node.category)
        if node.bypassed:
            color = SurfaceColor.RED
        if selected_node is not None and node.id == selected_node.id:
            color = SurfaceColor.BLUE
        pad_lights[control_id] = ControlLightState(color=color, pulse=bool(selected_node and node.id == selected_node.id))

    frame = RenderFrame(
        pad_lights=pad_lights,
        button_lights={
            "bypass": ControlLightState(color=SurfaceColor.AMBER),
            "select": ControlLightState(color=SurfaceColor.WHITE),
        },
        display=display_frame(
            "Chains",
            f"Chain: {chain.name}",
            f"Nodes: {len(chain.nodes)}",
            "Press a node to select. Press again for detail.",
        ),
    )
    return merge_page_button_lights(frame, state.active_page)
