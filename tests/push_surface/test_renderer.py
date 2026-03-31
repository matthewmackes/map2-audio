from app.services.push_surface.device_profile import GENERIC_PUSH_PROFILE
from app.services.push_surface.models.capabilities import SurfaceColor
from app.services.push_surface.models.render_state import ControlLightState, DisplayFrame, RenderFrame
from app.services.push_surface.output_renderer import PushOutputRenderer


def test_renderer_emits_diff_only():
    renderer = PushOutputRenderer(GENERIC_PUSH_PROFILE)
    frame = RenderFrame(
        pad_lights={"grid_0_0": ControlLightState(color=SurfaceColor.BLUE)},
        button_lights={"page_home": ControlLightState(color=SurfaceColor.WHITE)},
        display=DisplayFrame(title="Home", lines=("Ready",)),
    )

    first = renderer.render(frame)
    second = renderer.render(frame)

    assert len(first) == 2
    assert second == []


def test_renderer_updates_changed_controls():
    renderer = PushOutputRenderer(GENERIC_PUSH_PROFILE)
    first = RenderFrame(pad_lights={"grid_0_0": ControlLightState(color=SurfaceColor.BLUE)})
    second = RenderFrame(pad_lights={"grid_0_0": ControlLightState(color=SurfaceColor.RED)})

    renderer.render(first)
    payloads = renderer.render(second)

    assert len(payloads) == 1
