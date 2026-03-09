"""Advanced MIDI transform and mapping engine for MidiHub routes."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


@dataclass
class TransformedMidiEvent:
    data: bytes
    delay_ms: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


def _clamp_midi(value: int) -> int:
    return max(0, min(127, int(value)))


def _apply_curve(value: float, curve: str) -> float:
    v = max(0.0, min(1.0, float(value)))
    mode = str(curve or "linear").strip().lower()
    if mode in {"log", "logarithmic"}:
        return v * v
    if mode in {"exp", "exponential"}:
        return v ** 0.5
    if mode in {"s", "s_curve", "sigmoid"}:
        return (3.0 * v * v) - (2.0 * v * v * v)
    if mode in {"reverse", "invert"}:
        return 1.0 - v
    return v


def _parse_message(data: bytes) -> Dict[str, Any]:
    if not data:
        return {
            "status": None,
            "message_type": "empty",
            "channel": None,
            "data1": None,
            "data2": None,
        }

    status = int(data[0])
    if status == 0xF0:
        return {
            "status": status,
            "message_type": "sysex",
            "channel": None,
            "data1": None,
            "data2": None,
        }

    if status >= 0xF8:
        return {
            "status": status,
            "message_type": "system_realtime",
            "channel": None,
            "data1": None,
            "data2": None,
        }

    status_family = status & 0xF0
    channel = (status & 0x0F) + 1
    data1 = int(data[1]) if len(data) > 1 else None
    data2 = int(data[2]) if len(data) > 2 else None

    msg_type_map = {
        0x80: "note_off",
        0x90: "note_on",
        0xA0: "poly_aftertouch",
        0xB0: "control_change",
        0xC0: "program_change",
        0xD0: "channel_aftertouch",
        0xE0: "pitchbend",
    }
    message_type = msg_type_map.get(status_family, "system")
    if message_type == "note_on" and data2 == 0:
        message_type = "note_off"

    return {
        "status": status,
        "status_family": status_family,
        "message_type": message_type,
        "channel": channel,
        "data1": data1,
        "data2": data2,
    }


class MidiTransformEngine:
    """Composable transform chain with MIDI-centric operators."""

    TRANSFORM_TYPES: List[Dict[str, Any]] = [
        {"type": "cc_scale", "family": "value", "description": "Scale CC values with curve/deadzone"},
        {"type": "cc_to_note", "family": "translate", "description": "Translate CC to note on/off"},
        {"type": "note_to_cc", "family": "translate", "description": "Translate note on/off to CC"},
        {"type": "cc_to_program_change", "family": "translate", "description": "Translate CC to program change"},
        {"type": "program_change_to_cc", "family": "translate", "description": "Translate PC to CC"},
        {"type": "velocity_curve", "family": "value", "description": "Remap note velocity with curve"},
        {
            "type": "note_transpose_quantize_harmonize",
            "family": "note",
            "description": "Transpose, quantize, harmonize notes",
        },
        {"type": "program_change_remap", "family": "translate", "description": "Remap program change values"},
        {"type": "sysex_builder", "family": "sysex", "description": "Build outbound SysEx templates"},
        {"type": "sysex_parser", "family": "sysex", "description": "Parse inbound SysEx to CC/note"},
        {"type": "conditional", "family": "logic", "description": "Conditional drop/emit/rewrite"},
        {"type": "message_split", "family": "flow", "description": "Clone/split one message into many"},
        {"type": "throttle", "family": "flow", "description": "Rate limit high-frequency messages"},
        {"type": "message_delay", "family": "flow", "description": "Add fixed/variable delay"},
        {"type": "pitch_aftertouch_curve", "family": "value", "description": "Scale pitchbend/aftertouch"},
        {"type": "key_velocity_split", "family": "filter", "description": "Route by key/velocity windows"},
        {"type": "nrpn_pack", "family": "nrpn", "description": "Pack CC events into NRPN sequence"},
        {"type": "nrpn_unpack", "family": "nrpn", "description": "Unpack NRPN sequence into CC"},
        {"type": "mpe_zone", "family": "mpe", "description": "Basic MPE channel-zone remap"},
        {"type": "channel_remap", "family": "legacy", "description": "Remap channel to fixed target"},
        {"type": "cc_remap", "family": "legacy", "description": "Remap CC number table"},
        {"type": "value_scale", "family": "legacy", "description": "Scale 7-bit data2 value"},
    ]

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._throttle_state: Dict[str, float] = {}
        self._nrpn_state: Dict[int, Dict[str, int]] = {}

    def apply_chain(
        self,
        data: bytes,
        chain: Sequence[Dict[str, Any]],
        *,
        route_id: str,
        source_port: str,
    ) -> List[TransformedMidiEvent]:
        events: List[TransformedMidiEvent] = [
            TransformedMidiEvent(data=bytes(data), metadata={"route_id": route_id, "source_port": source_port})
        ]

        for step in chain:
            next_events: List[TransformedMidiEvent] = []
            for event in events:
                transformed = self._apply_step(event, step, route_id=route_id)
                if transformed:
                    next_events.extend(transformed)
            events = next_events
            if not events:
                break
        return events

    def _apply_step(
        self,
        event: TransformedMidiEvent,
        step: Dict[str, Any],
        *,
        route_id: str,
    ) -> List[TransformedMidiEvent]:
        kind = str(step.get("type") or "").strip().lower()
        if not kind:
            return [event]

        fn_name = f"_transform_{kind}"
        fn = getattr(self, fn_name, None)
        if fn is None:
            return [
                TransformedMidiEvent(
                    data=event.data,
                    delay_ms=event.delay_ms,
                    metadata={**event.metadata, "transform_warning": f"unsupported:{kind}"},
                )
            ]
        return fn(event, step, route_id=route_id)

    def _transform_cc_scale(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        if msg["message_type"] != "control_change" or msg["data2"] is None:
            return [event]

        if "cc" in step and int(step.get("cc")) != int(msg["data1"]):
            return [event]

        low_deadzone = float(step.get("deadzone_low", 0.0))
        high_deadzone = float(step.get("deadzone_high", 0.0))
        curve = str(step.get("curve", "linear"))
        invert = bool(step.get("invert", False))
        min_output = float(step.get("min_output", 0.0))
        max_output = float(step.get("max_output", 127.0))

        value = float(msg["data2"]) / 127.0
        if value <= low_deadzone:
            value = 0.0
        elif value >= (1.0 - high_deadzone):
            value = 1.0
        else:
            span = max(1e-9, 1.0 - low_deadzone - high_deadzone)
            value = (value - low_deadzone) / span

        curved = _apply_curve(value, curve)
        if invert:
            curved = 1.0 - curved
        mapped = min_output + (max_output - min_output) * curved

        out = bytes([event.data[0], event.data[1], _clamp_midi(int(round(mapped)))])
        return [TransformedMidiEvent(data=out, delay_ms=event.delay_ms, metadata=dict(event.metadata))]

    def _transform_cc_to_note(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        if msg["message_type"] != "control_change":
            return [event]

        target_cc = int(step.get("cc", msg["data1"] if msg["data1"] is not None else -1))
        if msg["data1"] != target_cc:
            return [event]

        threshold = int(step.get("threshold", 1))
        note = _clamp_midi(int(step.get("note", 60)))
        velocity = _clamp_midi(int(step.get("velocity", max(1, int(msg["data2"] or 0)))))
        channel = int(step.get("channel", msg["channel"] or 1))
        status = 0x90 | ((channel - 1) & 0x0F)
        value = int(msg["data2"] or 0)
        if value < threshold:
            if bool(step.get("emit_note_off", True)):
                off = bytes([(0x80 | ((channel - 1) & 0x0F)), note, 0])
                return [TransformedMidiEvent(data=off, delay_ms=event.delay_ms, metadata=dict(event.metadata))]
            return []
        on = bytes([status, note, velocity])
        return [TransformedMidiEvent(data=on, delay_ms=event.delay_ms, metadata=dict(event.metadata))]

    def _transform_note_to_cc(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        if msg["message_type"] not in {"note_on", "note_off"}:
            return [event]

        target_note = int(step.get("note", msg["data1"] if msg["data1"] is not None else -1))
        if msg["data1"] != target_note:
            return [event]

        cc = _clamp_midi(int(step.get("cc", 1)))
        channel = int(step.get("channel", msg["channel"] or 1))
        if msg["message_type"] == "note_off":
            value = _clamp_midi(int(step.get("off_value", 0)))
        else:
            velocity = int(msg.get("data2") or 0)
            mode = str(step.get("mode", "velocity")).lower()
            value = _clamp_midi(velocity if mode == "velocity" else int(step.get("on_value", 127)))
        cc_msg = bytes([0xB0 | ((channel - 1) & 0x0F), cc, value])
        return [TransformedMidiEvent(data=cc_msg, delay_ms=event.delay_ms, metadata=dict(event.metadata))]

    def _transform_cc_to_program_change(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        if msg["message_type"] != "control_change":
            return [event]

        target_cc = int(step.get("cc", msg["data1"] if msg["data1"] is not None else -1))
        if msg["data1"] != target_cc:
            return [event]

        threshold = int(step.get("threshold", 64))
        value = int(msg.get("data2") or 0)
        if value < threshold:
            return []

        program = _clamp_midi(int(step.get("program", value)))
        channel = int(step.get("channel", msg["channel"] or 1))
        pc_msg = bytes([0xC0 | ((channel - 1) & 0x0F), program])
        return [TransformedMidiEvent(data=pc_msg, delay_ms=event.delay_ms, metadata=dict(event.metadata))]

    def _transform_program_change_to_cc(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        if msg["message_type"] != "program_change":
            return [event]

        cc = _clamp_midi(int(step.get("cc", 0)))
        channel = int(step.get("channel", msg["channel"] or 1))
        mapping = step.get("mapping") if isinstance(step.get("mapping"), dict) else {}
        source_pc = int(msg.get("data1") or 0)
        target_value = mapping.get(str(source_pc), mapping.get(source_pc, source_pc))
        cc_msg = bytes([0xB0 | ((channel - 1) & 0x0F), cc, _clamp_midi(int(target_value))])
        return [TransformedMidiEvent(data=cc_msg, delay_ms=event.delay_ms, metadata=dict(event.metadata))]

    def _transform_velocity_curve(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        if msg["message_type"] not in {"note_on", "note_off"} or msg["data2"] is None:
            return [event]

        velocity = float(msg["data2"]) / 127.0
        mode = str(step.get("mode", "linear")).strip().lower()
        if mode == "fixed":
            target = _clamp_midi(int(step.get("fixed", 100)))
        elif mode == "compress":
            target = _clamp_midi(int(round((velocity ** 0.7) * 127.0)))
        elif mode == "expand":
            target = _clamp_midi(int(round((velocity ** 1.4) * 127.0)))
        else:
            target = _clamp_midi(int(round(_apply_curve(velocity, mode) * 127.0)))

        out = bytes([event.data[0], event.data[1], target])
        return [TransformedMidiEvent(data=out, delay_ms=event.delay_ms, metadata=dict(event.metadata))]

    def _transform_note_transpose_quantize_harmonize(
        self,
        event: TransformedMidiEvent,
        step: Dict[str, Any],
        *,
        route_id: str,
    ) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        if msg["message_type"] not in {"note_on", "note_off"} or msg["data1"] is None:
            return [event]

        base_note = int(msg["data1"])
        transpose = int(step.get("transpose", 0))
        note = _clamp_midi(base_note + transpose)

        scale = step.get("scale")
        if isinstance(scale, list) and scale:
            pitch_class = note % 12
            best = min((int(s) % 12 for s in scale), key=lambda s: min((pitch_class - s) % 12, (s - pitch_class) % 12))
            delta = (best - pitch_class) % 12
            if delta > 6:
                delta -= 12
            note = _clamp_midi(note + delta)

        intervals = [0]
        if isinstance(step.get("harmonize"), list):
            intervals = [int(v) for v in step.get("harmonize")]
        elif isinstance(step.get("interval"), int):
            intervals = [0, int(step.get("interval"))]

        out: List[TransformedMidiEvent] = []
        for interval in intervals:
            n = _clamp_midi(note + int(interval))
            data = bytes([event.data[0], n, event.data[2] if len(event.data) > 2 else 0])
            out.append(TransformedMidiEvent(data=data, delay_ms=event.delay_ms, metadata=dict(event.metadata)))
        return out

    def _transform_program_change_remap(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        if msg["message_type"] != "program_change" or msg["data1"] is None:
            return [event]

        remap = step.get("remap") if isinstance(step.get("remap"), dict) else {}
        program = int(msg["data1"])
        target_program = remap.get(str(program), remap.get(program, program + int(step.get("offset", 0))))
        target_program = _clamp_midi(int(target_program))

        out: List[TransformedMidiEvent] = []
        bank_msb = step.get("bank_msb")
        bank_lsb = step.get("bank_lsb")
        channel = int(msg["channel"] or 1)
        if bank_msb is not None:
            out.append(TransformedMidiEvent(data=bytes([0xB0 | ((channel - 1) & 0x0F), 0x00, _clamp_midi(int(bank_msb))]), delay_ms=event.delay_ms, metadata=dict(event.metadata)))
        if bank_lsb is not None:
            out.append(TransformedMidiEvent(data=bytes([0xB0 | ((channel - 1) & 0x0F), 0x20, _clamp_midi(int(bank_lsb))]), delay_ms=event.delay_ms, metadata=dict(event.metadata)))
        out.append(TransformedMidiEvent(data=bytes([0xC0 | ((channel - 1) & 0x0F), target_program]), delay_ms=event.delay_ms, metadata=dict(event.metadata)))
        return out

    def _transform_sysex_builder(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        template = step.get("template")
        if not isinstance(template, list) or not template:
            return [event]

        msg = _parse_message(event.data)
        trigger_types = step.get("trigger_types")
        if isinstance(trigger_types, list) and trigger_types and msg["message_type"] not in trigger_types:
            return [event]

        data: List[int] = []
        for entry in template:
            if isinstance(entry, int):
                data.append(_clamp_midi(entry) if entry not in {0xF0, 0xF7} else int(entry))
            elif isinstance(entry, str):
                token = entry.strip().lower()
                if token == "{data1}" and msg["data1"] is not None:
                    data.append(_clamp_midi(int(msg["data1"])))
                elif token == "{data2}" and msg["data2"] is not None:
                    data.append(_clamp_midi(int(msg["data2"])))
                elif token == "{channel}" and msg["channel"] is not None:
                    data.append(_clamp_midi(int(msg["channel"])))
                else:
                    try:
                        data.append(int(token, 0))
                    except Exception:
                        continue
        if not data or data[0] != 0xF0:
            data.insert(0, 0xF0)
        if data[-1] != 0xF7:
            data.append(0xF7)
        return [TransformedMidiEvent(data=bytes(data), delay_ms=event.delay_ms, metadata=dict(event.metadata))]

    def _transform_sysex_parser(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        if msg["message_type"] != "sysex":
            return [event]
        if len(event.data) < 4:
            return [event]

        channel = _clamp_midi(int(step.get("channel", 1)))
        mode = str(step.get("mode", "cc")).strip().lower()
        value_index = int(step.get("value_index", -2))
        value = int(event.data[value_index]) if -len(event.data) <= value_index < len(event.data) else 0

        if mode == "note":
            note = _clamp_midi(int(step.get("note", 60)))
            vel = _clamp_midi(int(value))
            out = bytes([0x90 | ((channel - 1) & 0x0F), note, vel])
        else:
            cc = _clamp_midi(int(step.get("cc", 1)))
            out = bytes([0xB0 | ((channel - 1) & 0x0F), cc, _clamp_midi(value)])
        return [TransformedMidiEvent(data=out, delay_ms=event.delay_ms, metadata=dict(event.metadata))]

    def _transform_conditional(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        field = str(step.get("field", "data2"))
        op = str(step.get("op", ">="))
        threshold = float(step.get("value", 0))
        action = str(step.get("action", "pass")).lower()

        value = msg.get(field)
        if value is None:
            return [event]

        def _compare(lhs: float, rhs: float, operator: str) -> bool:
            if operator == "==":
                return lhs == rhs
            if operator == "!=":
                return lhs != rhs
            if operator == ">":
                return lhs > rhs
            if operator == "<":
                return lhs < rhs
            if operator == "<=":
                return lhs <= rhs
            return lhs >= rhs

        matched = _compare(float(value), threshold, op)
        if matched and action == "drop":
            return []
        if matched and action == "emit_program_change":
            channel = int(step.get("channel", msg.get("channel") or 1))
            program = _clamp_midi(int(step.get("program", 0)))
            pc = bytes([0xC0 | ((channel - 1) & 0x0F), program])
            return [TransformedMidiEvent(data=pc, delay_ms=event.delay_ms, metadata=dict(event.metadata))]
        return [event]

    def _transform_message_split(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        copies = int(step.get("copies", 2))
        interval_ms = max(0, int(step.get("interval_ms", 0)))
        out: List[TransformedMidiEvent] = []
        for idx in range(max(1, copies)):
            out.append(
                TransformedMidiEvent(
                    data=bytes(event.data),
                    delay_ms=event.delay_ms + (idx * interval_ms),
                    metadata={**event.metadata, "split_index": idx},
                )
            )
        return out

    def _transform_throttle(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        min_interval_ms = max(0, int(step.get("min_interval_ms", 10)))
        msg = _parse_message(event.data)
        key = f"{route_id}:{msg.get('message_type')}:{msg.get('channel')}:{msg.get('data1')}"
        now = time.monotonic() * 1000.0
        with self._lock:
            last = self._throttle_state.get(key)
            if last is not None and (now - last) < min_interval_ms:
                return []
            self._throttle_state[key] = now
        return [event]

    def _transform_message_delay(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        delay_ms = int(step.get("delay_ms", 0))
        jitter_ms = int(step.get("jitter_ms", 0))
        applied = max(0, delay_ms + (jitter_ms if jitter_ms > 0 else 0))
        return [
            TransformedMidiEvent(
                data=bytes(event.data),
                delay_ms=event.delay_ms + applied,
                metadata=dict(event.metadata),
            )
        ]

    def _transform_pitch_aftertouch_curve(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        curve = str(step.get("curve", "linear"))
        if msg["message_type"] == "pitchbend" and len(event.data) >= 3:
            raw = (int(event.data[2]) << 7) | int(event.data[1])
            normalized = raw / 16383.0
            curved = _apply_curve(normalized, curve)
            mapped = int(round(curved * 16383.0))
            out = bytes([event.data[0], mapped & 0x7F, (mapped >> 7) & 0x7F])
            return [TransformedMidiEvent(data=out, delay_ms=event.delay_ms, metadata=dict(event.metadata))]
        if msg["message_type"] == "channel_aftertouch" and len(event.data) >= 2:
            normalized = int(event.data[1]) / 127.0
            curved = _apply_curve(normalized, curve)
            out = bytes([event.data[0], _clamp_midi(int(round(curved * 127.0)))])
            return [TransformedMidiEvent(data=out, delay_ms=event.delay_ms, metadata=dict(event.metadata))]
        return [event]

    def _transform_key_velocity_split(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        if msg["message_type"] not in {"note_on", "note_off"}:
            return [event]

        note = int(msg.get("data1") or 0)
        velocity = int(msg.get("data2") or 0)
        note_range = step.get("note_range") if isinstance(step.get("note_range"), list) else None
        vel_range = step.get("velocity_range") if isinstance(step.get("velocity_range"), list) else None

        if note_range and len(note_range) == 2:
            if note < int(note_range[0]) or note > int(note_range[1]):
                return []
        if vel_range and len(vel_range) == 2:
            if velocity < int(vel_range[0]) or velocity > int(vel_range[1]):
                return []

        tag = str(step.get("tag", "split"))
        return [TransformedMidiEvent(data=bytes(event.data), delay_ms=event.delay_ms, metadata={**event.metadata, "split_tag": tag})]

    def _transform_nrpn_pack(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        if msg["message_type"] != "control_change":
            return [event]

        channel = int(msg.get("channel") or 1)
        param = int(step.get("parameter", msg.get("data1") or 0))
        value = int(msg.get("data2") or 0)
        msb_param = (param >> 7) & 0x7F
        lsb_param = param & 0x7F
        msb_value = (value >> 7) & 0x7F
        lsb_value = value & 0x7F
        base_status = 0xB0 | ((channel - 1) & 0x0F)

        seq = [
            bytes([base_status, 99, msb_param]),
            bytes([base_status, 98, lsb_param]),
            bytes([base_status, 6, msb_value]),
            bytes([base_status, 38, lsb_value]),
        ]
        return [TransformedMidiEvent(data=item, delay_ms=event.delay_ms, metadata=dict(event.metadata)) for item in seq]

    def _transform_nrpn_unpack(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        if msg["message_type"] != "control_change" or msg["data1"] is None or msg["data2"] is None:
            return [event]

        cc = int(msg["data1"])
        value = int(msg["data2"])
        channel = int(msg.get("channel") or 1)

        with self._lock:
            state = self._nrpn_state.setdefault(channel, {})
            if cc == 99:
                state["param_msb"] = value
                return []
            if cc == 98:
                state["param_lsb"] = value
                return []
            if cc == 6:
                state["value_msb"] = value
                return []
            if cc == 38:
                state["value_lsb"] = value
                if not {"param_msb", "param_lsb", "value_msb"}.issubset(state.keys()):
                    return []
                param = ((state.get("param_msb", 0) & 0x7F) << 7) | (state.get("param_lsb", 0) & 0x7F)
                combined = ((state.get("value_msb", 0) & 0x7F) << 7) | (state.get("value_lsb", 0) & 0x7F)

        target_cc = _clamp_midi(int(step.get("target_cc", param & 0x7F)))
        target_value = _clamp_midi(int(round((combined / 16383.0) * 127.0)))
        out = bytes([0xB0 | ((channel - 1) & 0x0F), target_cc, target_value])
        return [TransformedMidiEvent(data=out, delay_ms=event.delay_ms, metadata=dict(event.metadata))]

    def _transform_mpe_zone(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        channel = msg.get("channel")
        if channel is None:
            return [event]

        zone_low = int(step.get("zone_low", 2))
        zone_high = int(step.get("zone_high", 16))
        master_channel = int(step.get("master_channel", 1))
        remap_to_master = bool(step.get("remap_to_master", False))

        if zone_low <= channel <= zone_high and remap_to_master and len(event.data) >= 1:
            status = int(event.data[0])
            status_family = status & 0xF0
            if 0x80 <= status_family <= 0xE0:
                remapped = bytes([status_family | ((master_channel - 1) & 0x0F)]) + bytes(event.data[1:])
                return [TransformedMidiEvent(data=remapped, delay_ms=event.delay_ms, metadata=dict(event.metadata))]
        return [event]

    # Legacy short-form transforms used by existing chains.
    def _transform_channel_remap(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        target = int(step.get("channel", 0))
        if target < 1 or target > 16 or not event.data:
            return [event]
        status = int(event.data[0])
        status_family = status & 0xF0
        if status_family < 0x80 or status_family > 0xE0:
            return [event]
        data = bytes([status_family | ((target - 1) & 0x0F)]) + bytes(event.data[1:])
        return [TransformedMidiEvent(data=data, delay_ms=event.delay_ms, metadata=dict(event.metadata))]

    def _transform_cc_remap(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        msg = _parse_message(event.data)
        if msg["message_type"] != "control_change" or len(event.data) < 3:
            return [event]
        mapping = step.get("mapping") if isinstance(step.get("mapping"), dict) else {}
        source = int(msg["data1"] or 0)
        target = mapping.get(str(source), mapping.get(source, source))
        data = bytes([event.data[0], _clamp_midi(int(target)), event.data[2]])
        return [TransformedMidiEvent(data=data, delay_ms=event.delay_ms, metadata=dict(event.metadata))]

    def _transform_value_scale(self, event: TransformedMidiEvent, step: Dict[str, Any], *, route_id: str) -> List[TransformedMidiEvent]:
        if len(event.data) < 3:
            return [event]
        scale = float(step.get("scale", 1.0))
        offset = float(step.get("offset", 0.0))
        value = _clamp_midi(int(round((int(event.data[2]) * scale) + offset)))
        data = bytes([event.data[0], event.data[1], value])
        return [TransformedMidiEvent(data=data, delay_ms=event.delay_ms, metadata=dict(event.metadata))]


_midi_transform_engine_singleton: Optional[MidiTransformEngine] = None


def get_midi_transform_engine() -> MidiTransformEngine:
    global _midi_transform_engine_singleton
    if _midi_transform_engine_singleton is None:
        _midi_transform_engine_singleton = MidiTransformEngine()
    return _midi_transform_engine_singleton
