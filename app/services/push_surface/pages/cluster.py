"""Cluster page rendering."""

from __future__ import annotations

from app.services.push_surface.config import PushSurfaceConfig
from app.services.push_surface.models.capabilities import SurfaceColor
from app.services.push_surface.models.render_state import ControlLightState, RenderFrame
from app.services.push_surface.models.state import PushSurfaceState
from app.services.push_surface.pages import display_frame, grid_coordinates, merge_page_button_lights, render_empty_page


def build_cluster_page(state: PushSurfaceState, config: PushSurfaceConfig) -> RenderFrame:
    """Render cluster node health/selection."""

    if not state.cluster_nodes:
        return render_empty_page(state, "Cluster")

    pad_lights: dict[str, ControlLightState] = {}
    selected = state.selected_cluster_node_id
    for index, node in enumerate(state.cluster_nodes[:64]):
        x, y = grid_coordinates(index)
        control_id = f"grid_{x}_{y}"
        color = SurfaceColor.GREEN
        if node.status not in {"healthy", "online", "ok"}:
            color = SurfaceColor.AMBER if node.status not in {"offline", "fault"} else SurfaceColor.RED
        if selected is not None and node.id == selected:
            color = SurfaceColor.BLUE
        pad_lights[control_id] = ControlLightState(color=color, pulse=bool(selected and node.id == selected))

    frame = RenderFrame(
        pad_lights=pad_lights,
        display=display_frame(
            "Cluster",
            f"Nodes: {len(state.cluster_nodes)}",
            f"Selected: {selected or 'None'}",
            "Press a node to target it.",
        ),
    )
    return merge_page_button_lights(frame, state.active_page)
