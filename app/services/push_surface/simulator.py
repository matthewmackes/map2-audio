"""Software-only simulator for Push surface development and tests."""

from __future__ import annotations

from dataclasses import dataclass

from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.ports import MidiMessage, VirtualMidiPort
from app.services.push_surface.device_profile import GENERIC_PUSH_PROFILE, PushDeviceProfile
from app.services.push_surface.protocol.generic_midi import build_control_change, build_note_message


@dataclass
class PushSurfaceSimulator:
    """Virtual Push surface built on MidiHub virtual ports."""

    hub: MidiHub
    profile: PushDeviceProfile = GENERIC_PUSH_PROFILE

    def __post_init__(self) -> None:
        self.input_port = VirtualMidiPort(
            port_id="push_surface_sim_in",
            name="Push Surface Sim In",
            direction="input",
        )
        self.output_port = VirtualMidiPort(
            port_id="push_surface_sim_out",
            name="Push Surface Sim Out",
            direction="output",
        )
        self.hub.register_port(self.input_port)
        self.hub.register_port(self.output_port)

    def press_pad(self, x: int, y: int, *, velocity: int = 100) -> bool:
        binding = self.profile.pad_binding(x, y)
        if binding is None:
            return False
        return self.input_port.inject(
            build_note_message(binding.number, velocity, channel=self.profile.midi_channel, note_on=True),
            source_port=self.input_port.port_id,
        )

    def release_pad(self, x: int, y: int) -> bool:
        binding = self.profile.pad_binding(x, y)
        if binding is None:
            return False
        return self.input_port.inject(
            build_note_message(binding.number, 0, channel=self.profile.midi_channel, note_on=False),
            source_port=self.input_port.port_id,
        )

    def press_button(self, logical_name: str, *, value: int = 127) -> bool:
        binding = self.profile.binding_for_logical_name(logical_name)
        if binding is None:
            return False
        return self.input_port.inject(
            build_control_change(binding.number, value, channel=self.profile.midi_channel),
            source_port=self.input_port.port_id,
        )

    def release_button(self, logical_name: str) -> bool:
        return self.press_button(logical_name, value=0)

    def turn_encoder(self, index: int, delta: int) -> bool:
        binding = self.profile.binding_for_logical_name(f"encoder_{index}")
        if binding is None:
            return False
        encoded = delta if delta >= 0 else 128 + delta
        return self.input_port.inject(
            build_control_change(binding.number, encoded, channel=self.profile.midi_channel),
            source_port=self.input_port.port_id,
        )

    def read_led_messages(self, *, max_messages: int = 256) -> list[MidiMessage]:
        return self.output_port.read_transmitted(max_messages=max_messages)
