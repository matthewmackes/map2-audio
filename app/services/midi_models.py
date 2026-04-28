"""
MIDI DTOs and enums shared by runtime services and device profiles.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Optional

from app.midi.curves import CurveType


class ActionType(str, Enum):
    """MIDI command action types."""
    ACTIVATE_CHAIN = "activate_chain"
    TOGGLE_CHAIN = "toggle_chain"
    TOGGLE_PLUGIN = "toggle_plugin"
    SET_ROUTING = "set_routing"
    NEXT_PRESET = "next_preset"
    PREV_PRESET = "prev_preset"
    TESIRA_RECALL_PRESET = "tesira_recall_preset"
    TESIRA_SET_LEVEL = "tesira_set_level"
    TESIRA_TOGGLE_MUTE = "tesira_toggle_mute"


class CommandType(str, Enum):
    """MIDI command trigger types."""
    PROGRAM_CHANGE = "program_change"
    NOTE_ON = "note_on"
    CC_TOGGLE = "cc_toggle"


@dataclass
class MIDIMappingDTO:
    """Data Transfer Object for MIDI mappings."""
    id: Optional[int] = None
    channel: int = 0
    cc: int = 0
    chain_id: Optional[int] = None
    target_plugin_uri: str = ""
    target_plugin_position: Optional[int] = None
    target_param_index: int = 0
    target_param_symbol: str = ""
    min_val: float = 0.0
    max_val: float = 1.0
    curve_type: CurveType = CurveType.LINEAR
    invert: bool = False
    feedback_enabled: bool = True
    feedback_cc: Optional[int] = None
    name: str = ""
    group_id: Optional[int] = None
    is_learned: bool = False
    is_enabled: bool = True


@dataclass
class MIDICommandDTO:
    """Data Transfer Object for MIDI commands."""
    id: Optional[int] = None
    command_type: CommandType = CommandType.PROGRAM_CHANGE
    channel: int = 0
    data1: int = 0
    data2: Optional[int] = None
    action_type: ActionType = ActionType.ACTIVATE_CHAIN
    target_chain_id: Optional[int] = None
    target_plugin_uri: Optional[str] = None
    target_plugin_position: Optional[int] = None
    action_data: Dict = field(default_factory=dict)
    name: str = ""
    is_enabled: bool = True
