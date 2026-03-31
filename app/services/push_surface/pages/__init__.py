"""Page render helpers for the Push surface subsystem."""

from __future__ import annotations

from app.services.push_surface.models.capabilities import SurfaceColor
from app.services.push_surface.models.render_state import ControlLightState, DisplayFrame, RenderFrame
from app.services.push_surface.models.state import PageId, PushSurfaceState


def grid_coordinates(index: int) -> tuple[int, int]:
    """Map a linear index onto the canonical 8x8 grid."""

    return index % 8, index // 8


def merge_page_button_lights(frame: RenderFrame, active_page: PageId) -> RenderFrame:
    """Overlay page navigation LEDs on a render frame."""

    button_lights = dict(frame.button_lights)
    page_buttons = {
        PageId.HOME: "page_home",
        PageId.CHAINS: "page_chains",
        PageId.NODE_DETAIL: "page_node_detail",
        PageId.PARAMETERS: "page_parameters",
        PageId.PRESETS: "page_presets",
        PageId.ROUTING: "page_routing",
        PageId.CLUSTER: "page_cluster",
        PageId.DIAGNOSTICS: "page_diagnostics",
    }
    for page_id, control_id in page_buttons.items():
        button_lights[control_id] = ControlLightState(
            color=SurfaceColor.BLUE if page_id == active_page else SurfaceColor.WHITE,
        )
    button_lights.setdefault("back", ControlLightState(color=SurfaceColor.WHITE))
    button_lights.setdefault("home", ControlLightState(color=SurfaceColor.WHITE))
    return RenderFrame(
        pad_lights=dict(frame.pad_lights),
        button_lights=button_lights,
        encoder_rings=dict(frame.encoder_rings),
        display=frame.display,
    )


def display_frame(title: str, *lines: str) -> DisplayFrame:
    """Create a bounded display frame."""

    normalized = tuple(str(line)[:48] for line in lines if str(line))
    return DisplayFrame(title=str(title)[:32], lines=normalized[:4])


def render_empty_page(state: PushSurfaceState, title: str) -> RenderFrame:
    """Fallback page when there is not enough backend data to render content."""

    frame = RenderFrame(
        display=display_frame(title, "No data available"),
    )
    return merge_page_button_lights(frame, state.active_page)
