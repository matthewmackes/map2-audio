from app.services.intelfx_service import IntelFXService
from app.services.midi_sysex_bridge_base import MidiSysexBridgeBase
from app.services.mpx1_service import MPX1Service


def test_mpx1_and_intelfx_share_midi_sysex_bridge_base():
    assert issubclass(MPX1Service, MidiSysexBridgeBase)
    assert issubclass(IntelFXService, MidiSysexBridgeBase)
    assert MPX1Service.SYX_PARSER_MODULE == "app.services.mpx1_syx_parser"
    assert IntelFXService.SYX_PARSER_MODULE == "app.services.intelfx_syx_parser"
