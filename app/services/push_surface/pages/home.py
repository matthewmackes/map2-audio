"""Home page rendering."""

from __future__ import annotations

from app.services.push_surface.config import PushSurfaceConfig
from app.services.push_surface.models.capabilities import SurfaceColor
from app.services.push_surface.models.render_state import ControlLightState, RenderFrame
from app.services.push_surface.models.state import PushSurfaceState
from app.services.push_surface.pages import display_frame, grid_coordinates, merge_page_button_lights, render_empty_page


def build_home_page(state: PushSurfaceState, config: PushSurfaceConfig) -> RenderFrame:
    """Render the Home page as a chain/workspace overview."""

    if not state.chains:
        return render_empty_page(state, "Home")

    pad_lights: dict[str, ControlLightState] = {}
    selected_chain = state.current_chain()
    for index, chain in enumerate(state.chains[:64]):
        x, y = grid_coordinates(index)
        control_id = f"grid_{x}_{y}"
        color = SurfaceColor.GREEN
        if chain.health not in {"healthy", "ok"}:
            color = SurfaceColor.AMBER if chain.health != "fault" else SurfaceColor.RED
        if selected_chain is not None and chain.id == selected_chain.id:
            color = SurfaceColor.BLUE
        pad_lights[control_id] = ControlLightState(color=color, pulse=bool(selected_chain and chain.id == selected_chain.id))

    current_preset = state.current_preset()
    frame = RenderFrame(
        pad_lights=pad_lights,
        display=display_frame(
            "Home",
            f"Preset: {current_preset.name if current_preset else 'None'}",
            f"Chain: {selected_chain.name if selected_chain else 'None'}",
            "Press a chain to select. Press again to open.",
        ),
    )
    return merge_page_button_lights(frame, state.active_page)
