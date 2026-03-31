"""Diff-based Push output renderer."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.services.push_surface.device_profile import PushDeviceProfile
from app.services.push_surface.models.render_state import ControlLightState, RenderFrame
from app.services.push_surface.protocol.generic_midi import MidiControlType, build_control_change, build_note_message
from app.services.push_surface.protocol import push1, push2, push3


@dataclass
class RenderMetrics:
    """Counters describing renderer activity."""

    midi_events_out: int = 0
    dropped_renders: int = 0
    protocol_errors: int = 0


@dataclass
class PushOutputRenderer:
    """Convert logical render frames into outbound MIDI payloads."""

    profile: PushDeviceProfile
    previous_frame: RenderFrame = field(default_factory=RenderFrame.empty)
    metrics: RenderMetrics = field(default_factory=RenderMetrics)

    def render(self, frame: RenderFrame, *, urgent_controls: set[str] | None = None, experimental_protocol: bool = False) -> list[bytes]:
        urgent_controls = set(urgent_controls or set())
        payloads: list[tuple[int, bytes]] = []

        for control_id, state in frame.pad_lights.items():
            previous = self.previous_frame.pad_lights.get(control_id)
            if previous == state:
                continue
            encoded = self._encode_light(control_id, state)
            if encoded is not None:
                priority = 0 if control_id in urgent_controls else 5
                payloads.append((priority, encoded))

        for control_id, state in frame.button_lights.items():
            previous = self.previous_frame.button_lights.get(control_id)
            if previous == state:
                continue
            encoded = self._encode_light(control_id, state)
            if encoded is not None:
                priority = 0 if control_id in urgent_controls else 10
                payloads.append((priority, encoded))

        if experimental_protocol and frame.display is not None and frame.display != self.previous_frame.display:
            payloads.extend((20, item) for item in self._encode_display(frame))

        payloads.sort(key=lambda item: item[0])
        midi_payloads = [payload for _priority, payload in payloads]
        self.metrics.midi_events_out += len(midi_payloads)
        self.previous_frame = frame
        return midi_payloads

    def _encode_light(self, control_id: str, state: ControlLightState) -> bytes | None:
        binding = self.profile.binding_for_logical_name(control_id)
        if binding is None:
            return None
        midi_type = binding.led_midi_type or binding.midi_type
        number = binding.led_number if binding.led_number is not None else binding.number
        value = self.profile.led_value(state.color, emphasized=state.pulse or state.blink)
        if midi_type == MidiControlType.NOTE:
            note_on = state.color.name != "OFF"
            return build_note_message(number, value if note_on else 0, channel=self.profile.midi_channel, note_on=note_on)
        if midi_type == MidiControlType.CONTROL_CHANGE:
            return build_control_change(number, value, channel=self.profile.midi_channel)
        return None

    def _encode_display(self, frame: RenderFrame) -> list[bytes]:
        try:
            if self.profile.profile_id == "push1":
                return push1.build_display_payload(frame.display)
            if self.profile.profile_id == "push2":
                return push2.build_display_payload(frame.display)
            if self.profile.profile_id == "push3":
                return push3.build_display_payload(frame.display)
        except Exception:
            self.metrics.protocol_errors += 1
        return []
