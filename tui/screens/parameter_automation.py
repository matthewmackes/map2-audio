"""
Parameter Automation UI for MAP2 Audio
Allows users to automate plugin parameters with envelopes, LFOs, and MIDI mapping.
"""

from textual.app import ComposeResult
from textual.widgets import Static, Label, Input, Button, Select
from textual.containers import Vertical, Horizontal
from textual.reactive import reactive
from typing import Dict, Any, Optional

class ParameterAutomationPanel(Static):
    """
    UI panel for automating a plugin parameter.
    """
    parameter_name: reactive[str] = reactive("")
    automation_type: reactive[str] = reactive("none")
    envelope_points: reactive[list] = reactive([])
    lfo_rate: reactive[float] = reactive(0.0)
    midi_cc: reactive[Optional[int]] = reactive(None)

    def __init__(self, parameter_name: str, **kwargs):
        super().__init__(**kwargs)
        self.parameter_name = parameter_name

    def compose(self) -> ComposeResult:
        yield Label(f"Automate: {self.parameter_name}", classes="automation-title")
        yield Select(options=[("None", "none"), ("Envelope", "envelope"), ("LFO", "lfo"), ("MIDI CC", "midi")], value=self.automation_type, id="automation-type")
        with Vertical():
            if self.automation_type == "envelope":
                yield Label("Envelope Points (time,value):")
                for idx, (t, v) in enumerate(self.envelope_points):
                    yield Input(value=f"{t},{v}", id=f"env-{idx}")
                yield Button("Add Point", id="add-env-point")
            elif self.automation_type == "lfo":
                yield Label("LFO Rate (Hz):")
                yield Input(value=str(self.lfo_rate), id="lfo-rate")
            elif self.automation_type == "midi":
                yield Label("MIDI CC Number:")
                yield Input(value=str(self.midi_cc or ""), id="midi-cc")
        yield Button("Apply Automation", id="apply-automation")

    # Event handlers for UI actions would be implemented here
