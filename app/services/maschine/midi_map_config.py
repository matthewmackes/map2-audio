"""Maschine MK1 MIDI mapping configuration.

Stores per-element MIDI assignments (note/CC numbers, message type, channel)
for all 16 pads, 42 buttons, and 11 encoders. Persisted as JSON in
``~/.map2/maschine_midi_map.json``.
"""

from __future__ import annotations

import copy
import json
import os
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Literal

from app.paths import Map2Paths
from app.services.maschine.mk1_protocol import (
    Button,
    Led,
    N_ENCODERS,
    PAD_COUNT,
)


CONFIG_DIR = Map2Paths.user_dir()
CONFIG_FILE = Map2Paths.user_file("maschine_midi_map.json")

MidiMessageType = Literal["note", "cc", "program_change"]
VelocityCurve = Literal["linear", "log", "exp"]


# ---------------------------------------------------------------------------
# NI silkscreen labels (exact hardware printing)
# ---------------------------------------------------------------------------

PAD_LABELS: tuple[str, ...] = tuple(f"PAD {i+1}" for i in range(PAD_COUNT))

BUTTON_LABELS: dict[int, str] = {
    int(Button.Mute): "MUTE",
    int(Button.Solo): "SOLO",
    int(Button.Select): "SELECT",
    int(Button.Duplicate): "DUPLICATE",
    int(Button.Navigate): "NAVIGATE",
    int(Button.Keyboard): "KEYBOARD",
    int(Button.Pattern): "PATTERN",
    int(Button.Scene): "SCENE",
    int(Button.Rec): "REC",
    int(Button.Erase): "ERASE",
    int(Button.Shift): "SHIFT",
    int(Button.Grid): "GRID",
    int(Button.TransportRight): "|>|",
    int(Button.TransportLeft): "|<|",
    int(Button.Loop): "RESTART",
    int(Button.GroupE): "GROUP E",
    int(Button.GroupF): "GROUP F",
    int(Button.GroupG): "GROUP G",
    int(Button.GroupH): "GROUP H",
    int(Button.GroupD): "GROUP D",
    int(Button.GroupC): "GROUP C",
    int(Button.GroupB): "GROUP B",
    int(Button.GroupA): "GROUP A",
    int(Button.Control): "CONTROL",
    int(Button.Browse): "BROWSE",
    int(Button.BrowseLeft): "< BROWSE",
    int(Button.Snap): "SNAP",
    int(Button.AutoWrite): "AUTO",
    int(Button.BrowseRight): "BROWSE >",
    int(Button.Sampling): "SAMPLING",
    int(Button.Step): "STEP",
    int(Button.DisplayButton8): "DISPLAY 8",
    int(Button.DisplayButton7): "DISPLAY 7",
    int(Button.DisplayButton6): "DISPLAY 6",
    int(Button.DisplayButton5): "DISPLAY 5",
    int(Button.DisplayButton4): "DISPLAY 4",
    int(Button.DisplayButton3): "DISPLAY 3",
    int(Button.DisplayButton2): "DISPLAY 2",
    int(Button.DisplayButton1): "DISPLAY 1",
    int(Button.NoteRepeat): "NOTE REPEAT",
    int(Button.Play): "PLAY",
}

# Button physical zones for UI grouping
BUTTON_ZONE: dict[int, str] = {
    int(Button.Mute): "left_of_pads",
    int(Button.Solo): "left_of_pads",
    int(Button.Select): "left_of_pads",
    int(Button.Duplicate): "left_of_pads",
    int(Button.Navigate): "left_of_pads",
    int(Button.Keyboard): "left_of_pads",
    int(Button.Pattern): "left_of_pads",
    int(Button.Scene): "left_of_pads",
    int(Button.Play): "transport",
    int(Button.Rec): "transport",
    int(Button.Erase): "transport",
    int(Button.Shift): "transport",
    int(Button.Grid): "transport",
    int(Button.TransportRight): "transport",
    int(Button.TransportLeft): "transport",
    int(Button.Loop): "transport",
    int(Button.GroupA): "groups",
    int(Button.GroupB): "groups",
    int(Button.GroupC): "groups",
    int(Button.GroupD): "groups",
    int(Button.GroupE): "groups",
    int(Button.GroupF): "groups",
    int(Button.GroupG): "groups",
    int(Button.GroupH): "groups",
    int(Button.Control): "lcd_side",
    int(Button.Browse): "lcd_side",
    int(Button.BrowseLeft): "lcd_side",
    int(Button.BrowseRight): "lcd_side",
    int(Button.Snap): "lcd_side",
    int(Button.AutoWrite): "lcd_side",
    int(Button.Sampling): "lcd_side",
    int(Button.Step): "lcd_side",
    int(Button.DisplayButton1): "display",
    int(Button.DisplayButton2): "display",
    int(Button.DisplayButton3): "display",
    int(Button.DisplayButton4): "display",
    int(Button.DisplayButton5): "display",
    int(Button.DisplayButton6): "display",
    int(Button.DisplayButton7): "display",
    int(Button.DisplayButton8): "display",
    int(Button.NoteRepeat): "misc",
}

# LED slot for each button (for test lighting)
BUTTON_LED_SLOT: dict[int, int] = {
    int(Button.Mute): int(Led.Mute),
    int(Button.Solo): int(Led.Solo),
    int(Button.Select): int(Led.Select),
    int(Button.Duplicate): int(Led.Duplicate),
    int(Button.Navigate): int(Led.Navigate),
    int(Button.Keyboard): int(Led.Keyboard),
    int(Button.Pattern): int(Led.Pattern),
    int(Button.Scene): int(Led.Scene),
    int(Button.Play): int(Led.Play),
    int(Button.Rec): int(Led.Rec),
    int(Button.Erase): int(Led.Erase),
    int(Button.Shift): int(Led.Shift),
    int(Button.Grid): int(Led.Grid),
    int(Button.TransportRight): int(Led.TransportRight),
    int(Button.TransportLeft): int(Led.TransportLeft),
    int(Button.Loop): int(Led.Loop),
    int(Button.GroupA): int(Led.GroupA),
    int(Button.GroupB): int(Led.GroupB),
    int(Button.GroupC): int(Led.GroupC),
    int(Button.GroupD): int(Led.GroupD),
    int(Button.GroupE): int(Led.GroupE),
    int(Button.GroupF): int(Led.GroupF),
    int(Button.GroupG): int(Led.GroupG),
    int(Button.GroupH): int(Led.GroupH),
    int(Button.Control): int(Led.Control),
    int(Button.Browse): int(Led.Browse),
    int(Button.BrowseLeft): int(Led.BrowseLeft),
    int(Button.BrowseRight): int(Led.BrowseRight),
    int(Button.Snap): int(Led.Snap),
    int(Button.AutoWrite): int(Led.AutoWrite),
    int(Button.Sampling): int(Led.Sampling),
    int(Button.Step): int(Led.Step),
    int(Button.DisplayButton1): int(Led.DisplayButton1),
    int(Button.DisplayButton2): int(Led.DisplayButton2),
    int(Button.DisplayButton3): int(Led.DisplayButton3),
    int(Button.DisplayButton4): int(Led.DisplayButton4),
    int(Button.DisplayButton5): int(Led.DisplayButton5),
    int(Button.DisplayButton6): int(Led.DisplayButton6),
    int(Button.DisplayButton7): int(Led.DisplayButton7),
    int(Button.DisplayButton8): int(Led.DisplayButton8),
    int(Button.NoteRepeat): int(Led.NoteRepeat),
}

ENCODER_LABELS: tuple[str, ...] = (
    "NAVIGATE",    # 0 - navigation encoder (push-push)
    "ENCODER 1",   # 1
    "ENCODER 2",   # 2
    "ENCODER 3",   # 3
    "ENCODER 4",   # 4
    "ENCODER 5",   # 5
    "ENCODER 6",   # 6
    "ENCODER 7",   # 7
    "VOLUME",      # 8
    "TEMPO",       # 9
    "SWING",       # 10
)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class PadMidiMapping:
    note: int = 36
    message_type: MidiMessageType = "note"
    velocity_curve: VelocityCurve = "linear"
    label: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ButtonMidiMapping:
    number: int = 0           # CC or note number
    message_type: MidiMessageType = "cc"
    label: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class EncoderMidiMapping:
    cc: int = 1
    mode: Literal["relative", "absolute"] = "relative"
    label: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MaschineMidiMapConfig:
    """Complete MIDI map for the MK1.

    Default values match the current daemon hardcoded assignments.
    """

    channel: int = 1
    pads: list[PadMidiMapping] = field(default_factory=list)
    buttons: dict[str, ButtonMidiMapping] = field(default_factory=dict)
    encoders: list[EncoderMidiMapping] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.pads:
            self.pads = [
                PadMidiMapping(note=36 + i, label=PAD_LABELS[i])
                for i in range(PAD_COUNT)
            ]
        if not self.buttons:
            self.buttons = {}
            for btn_id, label in BUTTON_LABELS.items():
                zone = BUTTON_ZONE.get(btn_id, "misc")
                if zone == "transport":
                    msg_type: MidiMessageType = "note"
                    number = 60 + list(
                        b for b in BUTTON_LABELS if BUTTON_ZONE.get(b) == "transport"
                    ).index(btn_id)
                elif zone == "groups":
                    msg_type = "cc"
                    number = 20 + list(
                        b for b in BUTTON_LABELS if BUTTON_ZONE.get(b) == "groups"
                    ).index(btn_id)
                else:
                    msg_type = "cc"
                    number = 40 + btn_id
                self.buttons[str(btn_id)] = ButtonMidiMapping(
                    number=number, message_type=msg_type, label=label,
                )
        if not self.encoders:
            self.encoders = [
                EncoderMidiMapping(
                    cc=(i if i < 8 else 9 + (i - 8)),
                    mode="relative",
                    label=ENCODER_LABELS[i],
                )
                for i in range(N_ENCODERS)
            ]

    def to_dict(self) -> dict[str, Any]:
        return {
            "channel": self.channel,
            "pads": [p.to_dict() for p in self.pads],
            "buttons": {k: v.to_dict() for k, v in self.buttons.items()},
            "encoders": [e.to_dict() for e in self.encoders],
            "button_labels": BUTTON_LABELS,
            "button_zones": BUTTON_ZONE,
            "button_led_slots": BUTTON_LED_SLOT,
            "encoder_labels": list(ENCODER_LABELS),
            "pad_labels": list(PAD_LABELS),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "MaschineMidiMapConfig":
        config = cls.__new__(cls)
        config.channel = int(data.get("channel", 1))
        config.pads = [
            PadMidiMapping(**p) for p in data.get("pads", [])
        ] or []
        config.buttons = {
            str(k): ButtonMidiMapping(**v) for k, v in data.get("buttons", {}).items()
        } or {}
        config.encoders = [
            EncoderMidiMapping(**e) for e in data.get("encoders", [])
        ] or []
        # Fill defaults for any missing elements
        if not config.pads:
            config.__post_init__()
        return config


def load_midi_map_config() -> MaschineMidiMapConfig:
    """Load config from disk, returning defaults if file doesn't exist."""
    if CONFIG_FILE.exists():
        try:
            data = json.loads(CONFIG_FILE.read_text())
            return MaschineMidiMapConfig.from_dict(data)
        except Exception:
            pass
    return MaschineMidiMapConfig()


def save_midi_map_config(config: MaschineMidiMapConfig) -> None:
    """Save config to disk."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    data = {
        "channel": config.channel,
        "pads": [p.to_dict() for p in config.pads],
        "buttons": {k: v.to_dict() for k, v in config.buttons.items()},
        "encoders": [e.to_dict() for e in config.encoders],
    }
    CONFIG_FILE.write_text(json.dumps(data, indent=2))
