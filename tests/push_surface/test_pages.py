from app.services.push_surface.config import PushSurfaceConfig
from app.services.push_surface.models.events import SurfaceEvent, SurfaceEventType
from app.services.push_surface.models.state import ChainSummary, NodeSummary, PageId, ParameterModel, PresetSummary
from app.services.push_surface.page_controller import PushPageController, SurfaceCommandType


def _controller() -> PushPageController:
    controller = PushPageController(PushSurfaceConfig())
    controller.replace_data(
        presets=[PresetSummary(id="1", name="Snapshot A", is_active=True)],
        chains=[
            ChainSummary(
                id="snapshot:1:chain:1",
                name="Main",
                nodes=(
                    NodeSummary(
                        id="snapshot:1:chain:1:position:0",
                        chain_id="snapshot:1:chain:1",
                        name="Amp",
                        node_type="urn:test:amp",
                        category="amp",
                        parameters=(ParameterModel(id="drive", name="Drive", value=0.5),),
                    ),
                ),
                is_active=True,
            )
        ],
    )
    return controller


def test_page_controller_home_to_chain_to_node_detail_flow():
    controller = _controller()

    event = SurfaceEvent(
        device_id="push",
        event_type=SurfaceEventType.PAD_PRESS,
        control_id="grid_0_0",
        value=100,
        timestamp=1.0,
    )
    controller.handle_event(event)
    assert controller.state.selected_chain_id == "snapshot:1:chain:1"
    assert controller.state.active_page == PageId.HOME

    controller.handle_event(event)
    assert controller.state.active_page == PageId.CHAINS

    controller.handle_event(event)
    assert controller.state.selected_node_id == "snapshot:1:chain:1:position:0"
    controller.handle_event(event)
    assert controller.state.active_page == PageId.NODE_DETAIL


def test_page_controller_parameter_turn_emits_command():
    controller = _controller()
    controller.state.active_page = PageId.PARAMETERS
    controller.state.selected_chain_id = "snapshot:1:chain:1"
    controller.state.selected_node_id = "snapshot:1:chain:1:position:0"

    event = SurfaceEvent(
        device_id="push",
        event_type=SurfaceEventType.ENCODER_TURN,
        control_id="encoder_0",
        value=1,
        delta=1,
        timestamp=2.0,
    )
    commands = controller.handle_event(event)
    assert len(commands) == 1
    assert commands[0].command_type == SurfaceCommandType.SET_PARAMETER
    assert commands[0].payload["parameter_id"] == "drive"
