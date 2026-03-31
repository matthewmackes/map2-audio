"""Raw MIDI to normalized Push surface event parser."""

from __future__ import annotations

from time import time

from app.services.midi_hub.ports import MidiMessage
from app.services.push_surface.device_profile import PushDeviceProfile
from app.services.push_surface.models.events import SurfaceEvent, SurfaceEventType
from app.services.push_surface.protocol.generic_midi import (
    ControlKind,
    EncoderMode,
    MidiControlType,
    decode_relative_delta,
    decode_status,
)


class PushInputParser:
    """Translate raw MIDI messages into normalized surface events."""

    def __init__(self, profile: PushDeviceProfile):
        self.profile = profile

    def parse(self, message: MidiMessage, *, device_id: str) -> SurfaceEvent:
        data = bytes(message.data or b"")
        status, _channel = decode_status(data)
        timestamp = message.timestamp_ns / 1_000_000_000 if message.timestamp_ns else time()

        if status in {0x80, 0x90} and len(data) >= 3:
            note = int(data[1]) & 0x7F
            velocity = int(data[2]) & 0x7F
            binding = self.profile.find_binding(MidiControlType.NOTE, note)
            if binding is None:
                return self._unknown(device_id=device_id, data=data, timestamp=timestamp)
            is_press = status == 0x90 and velocity > 0
            if binding.control_kind == ControlKind.PAD:
                return SurfaceEvent(
                    device_id=device_id,
                    event_type=SurfaceEventType.PAD_PRESS if is_press else SurfaceEventType.PAD_RELEASE,
                    control_id=binding.logical_name,
                    value=velocity,
                    pressure=velocity,
                    timestamp=timestamp,
                    raw_data=data,
                )
            if binding.control_kind == ControlKind.ENCODER_TOUCH:
                return SurfaceEvent(
                    device_id=device_id,
                    event_type=SurfaceEventType.ENCODER_TOUCH if is_press else SurfaceEventType.ENCODER_RELEASE,
                    control_id=f"encoder_{binding.encoder_index}",
                    value=velocity,
                    timestamp=timestamp,
                    raw_data=data,
                )
            return SurfaceEvent(
                device_id=device_id,
                event_type=SurfaceEventType.BUTTON_PRESS if is_press else SurfaceEventType.BUTTON_RELEASE,
                control_id=binding.logical_name,
                value=velocity,
                timestamp=timestamp,
                raw_data=data,
            )

        if status == 0xB0 and len(data) >= 3:
            cc = int(data[1]) & 0x7F
            value = int(data[2]) & 0x7F
            binding = self.profile.find_binding(MidiControlType.CONTROL_CHANGE, cc)
            if binding is None:
                return self._unknown(device_id=device_id, data=data, timestamp=timestamp)
            if binding.control_kind == ControlKind.ENCODER:
                delta = decode_relative_delta(value, self.profile.encoder_mode)
                return SurfaceEvent(
                    device_id=device_id,
                    event_type=SurfaceEventType.ENCODER_TURN,
                    control_id=binding.logical_name,
                    value=value,
                    delta=delta,
                    timestamp=timestamp,
                    raw_data=data,
                )
            if binding.control_kind == ControlKind.ENCODER_TOUCH:
                pressed = value > 0
                return SurfaceEvent(
                    device_id=device_id,
                    event_type=SurfaceEventType.ENCODER_TOUCH if pressed else SurfaceEventType.ENCODER_RELEASE,
                    control_id=f"encoder_{binding.encoder_index}",
                    value=value,
                    timestamp=timestamp,
                    raw_data=data,
                )
            if binding.control_kind == ControlKind.PEDAL:
                return SurfaceEvent(
                    device_id=device_id,
                    event_type=SurfaceEventType.PEDAL_CHANGE,
                    control_id=binding.logical_name,
                    value=value,
                    timestamp=timestamp,
                    raw_data=data,
                )
            pressed = value > 0
            return SurfaceEvent(
                device_id=device_id,
                event_type=SurfaceEventType.BUTTON_PRESS if pressed else SurfaceEventType.BUTTON_RELEASE,
                control_id=binding.logical_name,
                value=value,
                timestamp=timestamp,
                raw_data=data,
            )

        if status == 0xE0 and len(data) >= 3:
            lsb = int(data[1]) & 0x7F
            msb = int(data[2]) & 0x7F
            combined = (msb << 7) | lsb
            return SurfaceEvent(
                device_id=device_id,
                event_type=SurfaceEventType.TOUCHSTRIP_CHANGE,
                control_id="touchstrip",
                value=combined,
                timestamp=timestamp,
                raw_data=data,
            )

        if status == 0xD0 and len(data) >= 2:
            pressure = int(data[1]) & 0x7F
            return SurfaceEvent(
                device_id=device_id,
                event_type=SurfaceEventType.AFTERTOUCH,
                control_id="aftertouch",
                value=pressure,
                pressure=pressure,
                timestamp=timestamp,
                raw_data=data,
            )

        if status == 0xA0 and len(data) >= 3:
            note = int(data[1]) & 0x7F
            pressure = int(data[2]) & 0x7F
            binding = self.profile.find_binding(MidiControlType.NOTE, note)
            control_id = binding.logical_name if binding is not None else f"note_{note}"
            return SurfaceEvent(
                device_id=device_id,
                event_type=SurfaceEventType.POLY_AFTERTOUCH,
                control_id=control_id,
                value=pressure,
                pressure=pressure,
                timestamp=timestamp,
                raw_data=data,
            )

        return self._unknown(device_id=device_id, data=data, timestamp=timestamp)

    def _unknown(self, *, device_id: str, data: bytes, timestamp: float) -> SurfaceEvent:
        return SurfaceEvent(
            device_id=device_id,
            event_type=SurfaceEventType.UNKNOWN_MIDI_EVENT,
            control_id="unknown",
            value=None,
            timestamp=timestamp,
            raw_data=data,
            metadata={"hex": data.hex(" ")},
        )
