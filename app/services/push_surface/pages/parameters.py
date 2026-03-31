"""Parameters page rendering."""

from __future__ import annotations

from app.services.push_surface.config import PushSurfaceConfig
from app.services.push_surface.models.capabilities import SurfaceColor
from app.services.push_surface.models.render_state import ControlLightState, EncoderRingState, RenderFrame
from app.services.push_surface.models.state import PushSurfaceState
from app.services.push_surface.pages import display_frame, grid_coordinates, merge_page_button_lights, render_empty_page


def build_parameters_page(state: PushSurfaceState, config: PushSurfaceConfig) -> RenderFrame:
    """Render the current parameter bank onto encoder LEDs/display."""

    node = state.current_node()
    if node is None:
        return render_empty_page(state, "Parameters")

    bank_size = max(1, int(config.bank_size))
    start = state.parameter_bank_index * bank_size
    params = list(node.parameters[start:start + bank_size])
    pad_lights: dict[str, ControlLightState] = {}
    encoder_rings: dict[str, EncoderRingState] = {}
    lines: list[str] = [f"Node: {node.name}", f"Bank {state.parameter_bank_index + 1}"]

    for index, parameter in enumerate(params):
        x, y = grid_coordinates(index)
        pad_lights[f"grid_{x}_{y}"] = ControlLightState(color=SurfaceColor.BLUE if index == 0 else SurfaceColor.WHITE)
        try:
            span = max(parameter.max_value - parameter.min_value, 1e-6)
            current = float(parameter.value)
            normalized = int(max(0.0, min(1.0, (current - parameter.min_value) / span)) * 127.0)
        except Exception:
            normalized = 0
        encoder_rings[f"encoder_{index}"] = EncoderRingState(position=normalized, color=SurfaceColor.CYAN)
        lines.append(f"{parameter.name}: {parameter.display_text}")

    frame = RenderFrame(
        pad_lights=pad_lights,
        button_lights={
            "nav_left": ControlLightState(color=SurfaceColor.WHITE),
            "nav_right": ControlLightState(color=SurfaceColor.WHITE),
            "shift": ControlLightState(color=SurfaceColor.BLUE if state.shift_pressed else SurfaceColor.DIM),
        },
        encoder_rings=encoder_rings,
        display=display_frame("Parameters", *lines[:4]),
    )
    return merge_page_button_lights(frame, state.active_page)
