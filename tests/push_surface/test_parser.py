from app.services.midi_hub.ports import MidiMessage
from app.services.push_surface.device_profile import GENERIC_PUSH_PROFILE
from app.services.push_surface.input_parser import PushInputParser
from app.services.push_surface.models.events import SurfaceEventType
from app.services.push_surface.protocol.generic_midi import build_control_change, build_note_message


def test_parser_decodes_pad_and_button_events():
    parser = PushInputParser(GENERIC_PUSH_PROFILE)

    pad_binding = GENERIC_PUSH_PROFILE.pad_binding(2, 3)
    assert pad_binding is not None
    pad_event = parser.parse(
        MidiMessage(
            data=build_note_message(pad_binding.number, 100),
            timestamp_ns=1_000_000_000,
            source_port="push_surface_sim_in",
        ),
        device_id="push",
    )
    assert pad_event.event_type == SurfaceEventType.PAD_PRESS
    assert pad_event.control_id == "grid_2_3"

    home_binding = GENERIC_PUSH_PROFILE.binding_for_logical_name("page_home")
    assert home_binding is not None
    button_event = parser.parse(
        MidiMessage(
            data=build_control_change(home_binding.number, 127),
            timestamp_ns=2_000_000_000,
            source_port="push_surface_sim_in",
        ),
        device_id="push",
    )
    assert button_event.event_type == SurfaceEventType.BUTTON_PRESS
    assert button_event.control_id == "page_home"


def test_parser_decodes_relative_encoder_and_unknown_messages():
    parser = PushInputParser(GENERIC_PUSH_PROFILE)
    encoder = GENERIC_PUSH_PROFILE.binding_for_logical_name("encoder_1")
    assert encoder is not None

    encoder_event = parser.parse(
        MidiMessage(
            data=build_control_change(encoder.number, 2),
            timestamp_ns=3_000_000_000,
            source_port="push_surface_sim_in",
        ),
        device_id="push",
    )
    assert encoder_event.event_type == SurfaceEventType.ENCODER_TURN
    assert encoder_event.delta == 2

    unknown_event = parser.parse(
        MidiMessage(data=b"\xf0\x7e\x00\xf7", timestamp_ns=4_000_000_000, source_port="push_surface_sim_in"),
        device_id="push",
    )
    assert unknown_event.event_type == SurfaceEventType.UNKNOWN_MIDI_EVENT
