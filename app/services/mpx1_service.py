"""
MPX1 MIDI bridge service.

Provides:
- MPX1 parameter registry loading
- Shadow state persistence (~/.map2/mpx1_shadow.json)
- MIDI map persistence (~/.map2/mpx1_midi_maps.json)
- SysEx encode/decode helpers
- 40ms coalescing command queue for real-time-safe parameters
- MIDI port discovery/connection via python-rtmidi (with graceful fallback)
- Program and library management helpers
- WebSocket event fan-out for /api/mpx1/ws and global websocket topics
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

try:
    import rtmidi  # type: ignore

    RTMIDI_AVAILABLE = True
except ImportError:
    RTMIDI_AVAILABLE = False
    rtmidi = None
    logger.warning("python-rtmidi not installed, MPX1 MIDI I/O running in simulation mode")


class MPX1Service:
    """Stateful MPX1 bridge for REST + WebSocket control."""

    # Lexicon/Harman-ish header used consistently for local encode/decode round-trips.
    _SYSEX_PREFIX = [0xF0, 0x06, 0x7F, 0x11]
    _SYSEX_SUFFIX = 0xF7

    def __init__(
        self,
        registry_path: Optional[Path] = None,
        shadow_path: Optional[Path] = None,
        library_path: Optional[Path] = None,
        midi_maps_path: Optional[Path] = None,
        coalesce_window_sec: float = 0.04,
    ) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        self.registry_path = registry_path or (repo_root / "app" / "data" / "mpx1_params.json")

        state_dir = Path.home() / ".map2"
        state_dir.mkdir(parents=True, exist_ok=True)
        self.shadow_path = shadow_path or (state_dir / "mpx1_shadow.json")
        self.library_path = library_path or (state_dir / "mpx1_library.json")
        self.midi_maps_path = midi_maps_path or (state_dir / "mpx1_midi_maps.json")

        self.coalesce_window_sec = max(0.001, float(coalesce_window_sec))

        self.registry: Dict[str, Any] = {}
        self.params_by_id: Dict[str, Dict[str, Any]] = {}
        self.params_by_address: Dict[Tuple[int, int, int, int], Dict[str, Any]] = {}

        self.shadow_state: Dict[str, float] = {}
        self.current_program: int = 0

        self._midi_in: Any = None
        self._midi_out: Any = None
        self._connected_input_index: Optional[int] = None
        self._connected_output_index: Optional[int] = None
        self._midi_poll_task: Optional[asyncio.Task] = None
        self._running = False

        self._pending_realtime: Dict[str, float] = {}
        self._coalesce_task: Optional[asyncio.Task] = None
        self._state_lock = asyncio.Lock()

        self._outgoing_sysex_log: List[List[int]] = []
        self._traffic_log: List[Dict[str, Any]] = []
        self._dump_jobs: Dict[str, Dict[str, Any]] = {}
        self._toggle_states: Dict[str, bool] = {}
        self._packet_error_count: int = 0
        self._last_event_ts: float = time.time()

        self._ws_subscribers: Dict[str, asyncio.Queue] = {}

        self._load_registry()
        self._load_shadow_state()
        self._load_library()
        self._load_midi_maps()

    # -------------------------------------------------------------------------
    # Load/save state
    # -------------------------------------------------------------------------

    def _load_registry(self) -> None:
        if not self.registry_path.exists():
            raise FileNotFoundError(f"MPX1 registry not found: {self.registry_path}")

        with self.registry_path.open("r", encoding="utf-8") as fh:
            self.registry = json.load(fh)

        params = self.registry.get("params", [])
        self.params_by_id = {}
        self.params_by_address = {}
        for raw in params:
            param = dict(raw)
            param_id = str(param.get("id", "")).strip()
            address = tuple(int(v) & 0x7F for v in param.get("address_bytes", []))
            if not param_id or len(address) != 4:
                continue
            self.params_by_id[param_id] = param
            self.params_by_address[address] = param

    def _build_default_shadow_state(self) -> Dict[str, float]:
        defaults: Dict[str, float] = {}
        for param_id, param in self.params_by_id.items():
            default = param.get("default", 0)
            try:
                defaults[param_id] = float(default)
            except (TypeError, ValueError):
                defaults[param_id] = 0.0
        return defaults

    def _load_shadow_state(self) -> None:
        defaults = self._build_default_shadow_state()
        if not self.shadow_path.exists():
            self.shadow_state = defaults
            self._persist_shadow_state()
            return

        try:
            with self.shadow_path.open("r", encoding="utf-8") as fh:
                payload = json.load(fh)
            stored_state = payload.get("shadow_state", {})
            merged = defaults
            for key, value in stored_state.items():
                if key in merged:
                    try:
                        merged[key] = float(value)
                    except (TypeError, ValueError):
                        continue
            self.shadow_state = merged
            self.current_program = int(payload.get("current_program", 0))
        except Exception as exc:
            logger.warning("Failed to load MPX1 shadow state, using defaults: %s", exc)
            self.shadow_state = defaults

    def _persist_shadow_state(self) -> None:
        payload = {
            "current_program": self.current_program,
            "updated_at": time.time(),
            "shadow_state": self.shadow_state,
        }
        tmp = self.shadow_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        tmp.replace(self.shadow_path)

    def _load_library(self) -> None:
        if self.library_path.exists():
            try:
                with self.library_path.open("r", encoding="utf-8") as fh:
                    payload = json.load(fh)
                if isinstance(payload, dict) and isinstance(payload.get("entries"), list):
                    if payload.get("entries"):
                        return
            except Exception as exc:
                logger.warning("Failed to parse MPX1 library file, resetting: %s", exc)

        payload = {"entries": self._default_library_entries()}
        self.library_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _default_library_entries(self) -> List[Dict[str, Any]]:
        curated_names = [
            "Vocal Hall Gold", "Studio Plate A", "Stereo Tape Echo", "Wide Chorus Air", "Pitch Shift +5th",
            "Ambient Glass Pad", "LoFi Room Wash", "Dual Delay Pulse", "Thick Guitar Plate", "Bright Drum Room",
            "Reverse Bloom", "Cathedral Sky", "Edge Of Cloud", "Motion Flanger", "Dream Choir Gate",
            "Arena Vocal Lift", "Dark Plate Vox", "Shimmer Octave", "Tape Flutter", "MicroShift Double",
            "Big Snare Hall", "Tight Drum Plate", "Analog Slap", "Ping Pong Swell", "Neon Chorus Lead",
            "Formant Sweep", "Octaver Crush", "Subtle Widener", "Glass Delay Wash", "Cinematic Rise",
            "Hallway Verb", "Room Glue", "Mega Sustain", "Punch Delay", "Stereo Drift",
            "Airy Ensemble", "Wide Bloom", "Depth Field", "Crystal Mod", "Plate + Echo",
            "Epic Tail", "Shoegaze Drift", "Lush Vox Hall", "Edge Delay", "Guitar Arena",
            "Sparkle Verb", "Pulse Chorus", "Modulated Space", "Mono Slap Pro", "Go-To Vocal Plate",
        ]

        curated_tags = [
            ["vocal", "go-to", "lush"], ["vocal", "plate"], ["delay", "guitar"], ["chorus", "wide"], ["pitch", "guitar"],
            ["ambient", "epic"], ["ambient", "lofi"], ["delay", "rhythmic"], ["guitar", "plate"], ["drums", "room"],
            ["ambient", "fx"], ["ambient", "epic"], ["ambient", "shoegaze"], ["mod", "guitar"], ["fx", "vocal"],
            ["vocal", "arena"], ["vocal", "dark"], ["pitch", "ambient"], ["delay", "lofi"], ["vocal", "double"],
            ["drums", "snare"], ["drums", "plate"], ["delay", "slap"], ["delay", "pingpong"], ["chorus", "lead"],
            ["pitch", "fx"], ["pitch", "bass"], ["utility", "wide"], ["delay", "ambient"], ["fx", "epic"],
            ["room", "utility"], ["room", "mix"], ["sustain", "guitar"], ["delay", "punch"], ["mod", "stereo"],
            ["chorus", "vocal"], ["ambient", "lush"], ["ambient", "depth"], ["mod", "crystal"], ["plate", "delay"],
            ["epic", "tail"], ["shoegaze", "ambient"], ["vocal", "lush"], ["delay", "guitar"], ["guitar", "arena"],
            ["reverb", "sparkle"], ["chorus", "pulse"], ["mod", "space"], ["delay", "mono"], ["vocal", "go-to"],
        ]

        entries: List[Dict[str, Any]] = []
        for index, name in enumerate(curated_names):
            tags = curated_tags[index] if index < len(curated_tags) else ["curated"]
            entries.append(
                {
                    "program": index,
                    "name": name,
                    "tags": tags,
                    "rating": 2 if ("go-to" in tags or "epic" in tags) else 1,
                    "type": tags[0] if tags else "general",
                }
            )
        return entries

    def _read_library(self) -> Dict[str, Any]:
        try:
            return json.loads(self.library_path.read_text(encoding="utf-8"))
        except Exception:
            return {"entries": []}

    def _write_library(self, payload: Dict[str, Any]) -> None:
        tmp = self.library_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        tmp.replace(self.library_path)

    async def replace_library_entries(self, entries: List[Dict[str, Any]]) -> Dict[str, Any]:
        normalized: List[Dict[str, Any]] = []
        for raw in entries:
            if not isinstance(raw, dict):
                continue
            try:
                program = int(raw.get("program", len(normalized)))
            except Exception:
                program = len(normalized)
            normalized.append(
                {
                    "program": max(0, program),
                    "name": str(raw.get("name", f"Program {program:03d}"))[:128],
                    "tags": [str(tag) for tag in raw.get("tags", []) if str(tag).strip()],
                    "rating": int(raw.get("rating", 1)),
                    "type": str(raw.get("type", "general")),
                }
            )

        payload = {"entries": normalized}
        self._write_library(payload)
        await self._publish_event(
            "mpx1:library_replaced",
            {"count": len(normalized)},
        )
        return {"entries": normalized, "count": len(normalized)}

    def _default_midi_maps_payload(self) -> Dict[str, Any]:
        return {
            "active_map_id": None,
            "learn_target_param_id": None,
            "maps": [],
        }

    def _load_midi_maps(self) -> None:
        if self.midi_maps_path.exists():
            try:
                payload = json.loads(self.midi_maps_path.read_text(encoding="utf-8"))
                if (
                    isinstance(payload, dict)
                    and isinstance(payload.get("maps"), list)
                    and "active_map_id" in payload
                ):
                    return
            except Exception as exc:
                logger.warning("Failed to parse MPX1 MIDI maps file, resetting: %s", exc)

        self._write_midi_maps(self._default_midi_maps_payload())

    def _read_midi_maps(self) -> Dict[str, Any]:
        try:
            payload = json.loads(self.midi_maps_path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                maps = payload.get("maps", [])
                if isinstance(maps, list):
                    payload.setdefault("active_map_id", None)
                    payload.setdefault("learn_target_param_id", None)
                    return payload
        except Exception:
            pass
        return self._default_midi_maps_payload()

    def _write_midi_maps(self, payload: Dict[str, Any]) -> None:
        normalized = self._default_midi_maps_payload()
        normalized.update(payload)
        tmp = self.midi_maps_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(normalized, indent=2, sort_keys=True), encoding="utf-8")
        tmp.replace(self.midi_maps_path)

    # -------------------------------------------------------------------------
    # Registry + codec
    # -------------------------------------------------------------------------

    def get_registry(self) -> Dict[str, Any]:
        return self.registry

    def _normalize_value(self, param: Dict[str, Any], value: float) -> float:
        param_type = str(param.get("type", "float")).lower()
        value_range = param.get("range", {}) or {}
        minimum = float(value_range.get("min", 0))
        maximum = float(value_range.get("max", 16383))
        clamped = max(minimum, min(maximum, float(value)))

        if param_type in {"toggle", "bool", "boolean"}:
            return 1.0 if clamped >= 0.5 else 0.0
        if param_type in {"enum", "int", "integer"}:
            return float(int(round(clamped)))
        return float(clamped)

    @staticmethod
    def _clamp(value: float, minimum: float, maximum: float) -> float:
        return max(minimum, min(maximum, float(value)))

    def _apply_curve(self, normalized: float, curve: str) -> float:
        curve_id = (curve or "linear").lower()
        normalized = self._clamp(normalized, 0.0, 1.0)
        if curve_id == "reverse":
            return 1.0 - normalized
        if curve_id == "log":
            return normalized * normalized
        if curve_id == "exp":
            return normalized ** 0.5
        if curve_id in {"s_curve", "scurve", "s-curve"}:
            return normalized * normalized * (3.0 - 2.0 * normalized)
        return normalized

    def _map_cc_to_value(self, mapping: Dict[str, Any], cc_value: int) -> float:
        source_min = float(mapping.get("source_min", 0))
        source_max = float(mapping.get("source_max", 127))
        target_min = float(mapping.get("target_min", 0))
        target_max = float(mapping.get("target_max", 127))
        mode = str(mapping.get("mode", "continuous")).lower()
        polarity = str(mapping.get("polarity", "normal")).lower()

        if abs(source_max - source_min) < 1e-6:
            normalized = 0.0
        else:
            normalized = (float(cc_value) - source_min) / (source_max - source_min)
        normalized = self._clamp(normalized, 0.0, 1.0)

        if mode == "momentary":
            normalized = 1.0 if cc_value >= 64 else 0.0

        if mode == "toggle":
            mapping_id = str(mapping.get("id", ""))
            if cc_value >= 64:
                current = self._toggle_states.get(mapping_id, False)
                self._toggle_states[mapping_id] = not current
            normalized = 1.0 if self._toggle_states.get(mapping_id, False) else 0.0

        normalized = self._apply_curve(normalized, str(mapping.get("curve", "linear")))

        if polarity == "inverted":
            normalized = 1.0 - normalized

        mapped = target_min + normalized * (target_max - target_min)
        return mapped

    @staticmethod
    def _encode_14bit(value: int) -> Tuple[int, int]:
        value = max(0, min(16383, int(value)))
        lo = value & 0x7F
        hi = (value >> 7) & 0x7F
        return lo, hi

    @staticmethod
    def _decode_14bit(lo: int, hi: int) -> int:
        return ((int(hi) & 0x7F) << 7) | (int(lo) & 0x7F)

    def encode_param_sysex(self, param_id: str, value: float) -> List[int]:
        param = self.params_by_id.get(param_id)
        if param is None:
            raise KeyError(f"Unknown MPX1 param id: {param_id}")

        normalized = self._normalize_value(param, value)
        address = [int(v) & 0x7F for v in param["address_bytes"]]
        lo, hi = self._encode_14bit(int(round(normalized)))
        return [*self._SYSEX_PREFIX, *address, lo, hi, self._SYSEX_SUFFIX]

    def decode_param_sysex(self, message: List[int]) -> Optional[Dict[str, Any]]:
        if len(message) < 11:
            return None
        if message[:4] != self._SYSEX_PREFIX:
            return None
        if message[-1] != self._SYSEX_SUFFIX:
            return None

        address = tuple(int(v) & 0x7F for v in message[4:8])
        lo = int(message[8]) & 0x7F
        hi = int(message[9]) & 0x7F
        value = self._decode_14bit(lo, hi)

        param = self.params_by_address.get(address)
        if param is None:
            return None
        return {
            "param_id": param["id"],
            "address": list(address),
            "value": float(value),
        }

    def _hex_bytes(self, data: List[int]) -> str:
        return " ".join(f"{int(v) & 0xFF:02X}" for v in data)

    def _record_traffic(self, event_type: str, data: Optional[List[int]] = None, **metadata: Any) -> None:
        entry: Dict[str, Any] = {
            "timestamp": time.time(),
            "type": event_type,
            "hex": self._hex_bytes(data or []),
            **metadata,
        }
        self._traffic_log.append(entry)
        if len(self._traffic_log) > 1000:
            self._traffic_log = self._traffic_log[-1000:]

    # -------------------------------------------------------------------------
    # MIDI discovery / connection
    # -------------------------------------------------------------------------

    async def get_midi_ports(self) -> Dict[str, Any]:
        if not RTMIDI_AVAILABLE:
            return {
                "rtmidi_available": False,
                "inputs": [{"index": 0, "name": "Virtual MPX1 Input", "connected": False}],
                "outputs": [{"index": 0, "name": "Virtual MPX1 Output", "connected": False}],
                "recommended_input_index": None,
                "recommended_output_index": None,
            }

        inputs: List[Dict[str, Any]] = []
        outputs: List[Dict[str, Any]] = []
        recommended_in: Optional[int] = None
        recommended_out: Optional[int] = None

        midi_in = rtmidi.MidiIn()
        for index in range(midi_in.get_port_count()):
            name = midi_in.get_port_name(index)
            inputs.append({"index": index, "name": name, "connected": index == self._connected_input_index})
            lowered = name.lower()
            if recommended_in is None and ("mpx" in lowered or "lexicon" in lowered):
                recommended_in = index
        del midi_in

        midi_out = rtmidi.MidiOut()
        for index in range(midi_out.get_port_count()):
            name = midi_out.get_port_name(index)
            outputs.append({"index": index, "name": name, "connected": index == self._connected_output_index})
            lowered = name.lower()
            if recommended_out is None and ("mpx" in lowered or "lexicon" in lowered):
                recommended_out = index
        del midi_out

        return {
            "rtmidi_available": True,
            "inputs": inputs,
            "outputs": outputs,
            "recommended_input_index": recommended_in,
            "recommended_output_index": recommended_out,
        }

    async def connect_midi(
        self,
        input_port_index: Optional[int] = None,
        output_port_index: Optional[int] = None,
        name_hint: str = "mpx",
    ) -> Dict[str, Any]:
        await self.disconnect_midi()

        ports = await self.get_midi_ports()
        if not ports["rtmidi_available"]:
            return {"connected": False, "detail": "python-rtmidi unavailable"}

        hint = (name_hint or "mpx").lower()

        if input_port_index is None:
            for item in ports["inputs"]:
                if hint in item["name"].lower() or "lexicon" in item["name"].lower():
                    input_port_index = int(item["index"])
                    break
            if input_port_index is None:
                input_port_index = ports.get("recommended_input_index")
        if output_port_index is None:
            for item in ports["outputs"]:
                if hint in item["name"].lower() or "lexicon" in item["name"].lower():
                    output_port_index = int(item["index"])
                    break
            if output_port_index is None:
                output_port_index = ports.get("recommended_output_index")

        if input_port_index is None or output_port_index is None:
            return {"connected": False, "detail": "No MPX1-like MIDI ports found"}

        try:
            self._midi_in = rtmidi.MidiIn()
            self._midi_out = rtmidi.MidiOut()
            self._midi_in.open_port(int(input_port_index))
            self._midi_in.ignore_types(sysex=False, timing=True, active_sense=True)
            self._midi_out.open_port(int(output_port_index))
            self._connected_input_index = int(input_port_index)
            self._connected_output_index = int(output_port_index)
            self._running = True
            self._midi_poll_task = asyncio.create_task(self._midi_poll_loop(), name="mpx1_midi_poll")
            await self._publish_event(
                "mpx1:midi_connected",
                {
                    "input_port_index": self._connected_input_index,
                    "output_port_index": self._connected_output_index,
                },
            )
            return {"connected": True}
        except Exception as exc:
            logger.error("Failed to connect MPX1 MIDI ports: %s", exc)
            await self.disconnect_midi()
            return {"connected": False, "detail": str(exc)}

    async def disconnect_midi(self) -> None:
        self._running = False
        if self._midi_poll_task is not None:
            self._midi_poll_task.cancel()
            try:
                await self._midi_poll_task
            except asyncio.CancelledError:
                pass
            self._midi_poll_task = None

        if self._midi_in is not None:
            try:
                self._midi_in.close_port()
            except Exception:
                pass
            self._midi_in = None

        if self._midi_out is not None:
            try:
                self._midi_out.close_port()
            except Exception:
                pass
            self._midi_out = None

        self._connected_input_index = None
        self._connected_output_index = None

    async def _midi_poll_loop(self) -> None:
        while self._running and self._midi_in is not None:
            try:
                msg = self._midi_in.get_message()
                if msg:
                    data, _delta_time = msg
                    if data:
                        status = int(data[0]) & 0xFF
                        if status == 0xF0:
                            await self.handle_incoming_sysex([int(v) for v in data])
                        elif (status & 0xF0) == 0xB0 and len(data) >= 3:
                            channel = (status & 0x0F) + 1
                            cc = int(data[1]) & 0x7F
                            value = int(data[2]) & 0x7F
                            await self.handle_incoming_cc(channel, cc, value)
                await asyncio.sleep(0.002)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._packet_error_count += 1
                self._record_traffic("poll_error", None, error=str(exc))
                logger.debug("MPX1 MIDI poll loop error: %s", exc)
                await asyncio.sleep(0.05)

    async def handle_incoming_sysex(self, message: List[int]) -> Optional[Dict[str, Any]]:
        decoded = self.decode_param_sysex(message)
        if decoded is None:
            self._record_traffic("rx_sysex_unknown", message)
            return None

        param_id = str(decoded["param_id"])
        value = float(decoded["value"])
        self._record_traffic("rx_sysex", message, param_id=param_id, value=value)
        async with self._state_lock:
            self.shadow_state[param_id] = value
            self._persist_shadow_state()

        await self._publish_event(
            "mpx1:param_rx",
            {"param_id": param_id, "value": value, "source": "midi_sysex"},
        )
        return decoded

    async def handle_incoming_cc(self, channel: int, cc: int, value: int) -> Dict[str, Any]:
        payload = {"channel": int(channel), "cc": int(cc), "value": int(value)}
        self._record_traffic(
            "rx_cc",
            [0xB0 | ((int(channel) - 1) & 0x0F), int(cc) & 0x7F, int(value) & 0x7F],
            channel=int(channel),
            cc=int(cc),
            value=int(value),
        )
        await self._publish_event("mpx1:midi_cc", payload)

        midi_maps = self._read_midi_maps()
        learn_target = midi_maps.get("learn_target_param_id")
        active_map_id = str(midi_maps.get("active_map_id") or "")

        if learn_target and active_map_id:
            maps = midi_maps.get("maps", [])
            for midi_map in maps:
                if str(midi_map.get("id")) != active_map_id:
                    continue
                mappings = midi_map.get("mappings", [])
                if not isinstance(mappings, list):
                    mappings = []

                target_param = self.params_by_id.get(str(learn_target))
                if target_param is None:
                    break

                target_range = target_param.get("range", {}) or {}
                new_mapping = {
                    "id": f"map-{uuid.uuid4().hex[:10]}",
                    "name": str(target_param.get("display_name", learn_target)),
                    "cc": int(cc),
                    "channel": int(channel),
                    "target_param_id": str(learn_target),
                    "source_min": 0,
                    "source_max": 127,
                    "target_min": float(target_range.get("min", 0)),
                    "target_max": float(target_range.get("max", 127)),
                    "curve": "linear",
                    "smoothing_ms": 40,
                    "polarity": "normal",
                    "mode": "continuous",
                    "enabled": True,
                }
                mappings.append(new_mapping)
                midi_map["mappings"] = mappings
                midi_maps["learn_target_param_id"] = None
                self._write_midi_maps(midi_maps)
                await self._publish_event(
                    "mpx1:midi_learn_assigned",
                    {
                        "map_id": active_map_id,
                        "mapping": new_mapping,
                    },
                )
                break

        await self._dispatch_midi_map_cc(channel=channel, cc=cc, value=value)
        return payload

    # -------------------------------------------------------------------------
    # Parameter/program operations
    # -------------------------------------------------------------------------

    async def set_param(self, param_id: str, value: float, source: str = "api") -> Dict[str, Any]:
        param = self.params_by_id.get(param_id)
        if param is None:
            raise KeyError(f"Unknown MPX1 param id: {param_id}")

        normalized = self._normalize_value(param, value)
        if bool(param.get("realtime_safe", False)):
            async with self._state_lock:
                self._pending_realtime[param_id] = normalized
                if self._coalesce_task is None or self._coalesce_task.done():
                    self._coalesce_task = asyncio.create_task(
                        self._coalesced_flush_loop(),
                        name="mpx1_coalesced_flush",
                    )
            return {"queued": True, "param_id": param_id, "value": normalized}

        await self._dispatch_param_update(param_id, normalized, source=source)
        return {"queued": False, "param_id": param_id, "value": normalized}

    async def set_params_bulk(self, updates: List[Dict[str, float]]) -> Dict[str, Any]:
        results: List[Dict[str, Any]] = []
        for item in updates:
            param_id = str(item["param_id"])
            value = float(item["value"])
            result = await self.set_param(param_id, value, source="api_bulk")
            results.append(result)
        return {"results": results, "count": len(results)}

    async def _coalesced_flush_loop(self) -> None:
        while True:
            await asyncio.sleep(self.coalesce_window_sec)
            async with self._state_lock:
                if not self._pending_realtime:
                    self._coalesce_task = None
                    return
                pending = dict(self._pending_realtime)
                self._pending_realtime.clear()

            for param_id, value in pending.items():
                await self._dispatch_param_update(param_id, value, source="coalesced")

    async def _dispatch_param_update(self, param_id: str, value: float, source: str) -> None:
        message = self.encode_param_sysex(param_id, value)
        self._record_traffic("tx_sysex", message, param_id=param_id, value=value, source=source)
        self._outgoing_sysex_log.append(message)
        if len(self._outgoing_sysex_log) > 256:
            self._outgoing_sysex_log = self._outgoing_sysex_log[-256:]

        if self._midi_out is not None:
            try:
                self._midi_out.send_message(message)
            except Exception as exc:
                logger.debug("MPX1 send_message failed for %s: %s", param_id, exc)

        async with self._state_lock:
            self.shadow_state[param_id] = value
            self._persist_shadow_state()

        await self._publish_event(
            "mpx1:param_tx",
            {"param_id": param_id, "value": value, "source": source},
        )

    async def set_program(self, program: int) -> Dict[str, Any]:
        max_slots = int(self.registry.get("program_management", {}).get("program_slots", 250))
        normalized = max(0, min(max_slots - 1, int(program)))
        self.current_program = normalized
        self._persist_shadow_state()

        if self._midi_out is not None:
            try:
                bank = normalized // 128
                program_lsb = normalized % 128
                self._midi_out.send_message([0xB0, 0x00, bank & 0x7F])  # Bank select MSB
                self._midi_out.send_message([0xC0, program_lsb & 0x7F])  # Program change
            except Exception as exc:
                logger.debug("MPX1 program change send failed: %s", exc)

        await self._publish_event(
            "mpx1:program_changed",
            {"program": normalized},
        )
        return {"program": normalized}

    async def get_programs(self) -> List[Dict[str, Any]]:
        max_slots = int(self.registry.get("program_management", {}).get("program_slots", 250))
        library_map: Dict[int, Dict[str, Any]] = {}
        for entry in self._read_library().get("entries", []):
            try:
                library_map[int(entry.get("program", -1))] = entry
            except Exception:
                continue

        programs: List[Dict[str, Any]] = []
        for index in range(max_slots):
            entry = library_map.get(index, {})
            programs.append(
                {
                    "program": index,
                    "name": entry.get("name", f"Program {index:03d}"),
                    "tags": list(entry.get("tags", [])),
                    "active": index == self.current_program,
                }
            )
        return programs

    # -------------------------------------------------------------------------
    # MIDI map management and dispatch
    # -------------------------------------------------------------------------

    async def get_midi_maps(self) -> Dict[str, Any]:
        payload = self._read_midi_maps()
        maps = payload.get("maps", [])
        if not isinstance(maps, list):
            maps = []
        return {
            "active_map_id": payload.get("active_map_id"),
            "learn_target_param_id": payload.get("learn_target_param_id"),
            "maps": maps,
            "count": len(maps),
        }

    async def save_midi_map(self, midi_map: Dict[str, Any], make_active: bool = False) -> Dict[str, Any]:
        payload = self._read_midi_maps()
        maps: List[Dict[str, Any]] = payload.get("maps", [])
        if not isinstance(maps, list):
            maps = []

        map_id = str(midi_map.get("id") or f"map-{uuid.uuid4().hex[:10]}")
        normalized = {
            "id": map_id,
            "name": str(midi_map.get("name", f"Map {len(maps) + 1}")).strip() or f"Map {len(maps) + 1}",
            "description": str(midi_map.get("description", "")).strip(),
            "active": bool(midi_map.get("active", False)),
            "mappings": [],
            "created_at": float(midi_map.get("created_at", time.time())),
            "updated_at": time.time(),
        }

        raw_mappings = midi_map.get("mappings", [])
        if not isinstance(raw_mappings, list):
            raw_mappings = []

        for index, raw_mapping in enumerate(raw_mappings):
            if not isinstance(raw_mapping, dict):
                continue
            mapping_id = str(raw_mapping.get("id") or f"{map_id}-m{index+1}")
            target_param_id = str(raw_mapping.get("target_param_id", "")).strip()
            if target_param_id not in self.params_by_id:
                continue
            param = self.params_by_id[target_param_id]
            target_range = param.get("range", {}) or {}
            normalized_mapping = {
                "id": mapping_id,
                "name": str(raw_mapping.get("name", "")).strip(),
                "cc": int(raw_mapping.get("cc", 1)) & 0x7F,
                "channel": int(raw_mapping.get("channel", 1)),
                "target_param_id": target_param_id,
                "source_min": int(raw_mapping.get("source_min", 0)),
                "source_max": int(raw_mapping.get("source_max", 127)),
                "target_min": float(raw_mapping.get("target_min", target_range.get("min", 0))),
                "target_max": float(raw_mapping.get("target_max", target_range.get("max", 127))),
                "curve": str(raw_mapping.get("curve", "linear")),
                "smoothing_ms": float(raw_mapping.get("smoothing_ms", 40)),
                "polarity": str(raw_mapping.get("polarity", "normal")),
                "mode": str(raw_mapping.get("mode", "continuous")),
                "enabled": bool(raw_mapping.get("enabled", True)),
                "macro_group": str(raw_mapping.get("macro_group", "")).strip() or None,
            }
            normalized["mappings"].append(normalized_mapping)

        replaced = False
        for index, existing in enumerate(maps):
            if str(existing.get("id")) == map_id:
                maps[index] = normalized
                replaced = True
                break
        if not replaced:
            maps.append(normalized)

        payload["maps"] = maps
        if make_active or bool(midi_map.get("active", False)):
            payload["active_map_id"] = map_id
        self._write_midi_maps(payload)

        await self._publish_event(
            "mpx1:midi_map_saved",
            {"map_id": map_id, "active_map_id": payload.get("active_map_id")},
        )
        return {"map": normalized, "active_map_id": payload.get("active_map_id")}

    async def delete_midi_map(self, map_id: str) -> Dict[str, Any]:
        payload = self._read_midi_maps()
        maps = payload.get("maps", [])
        if not isinstance(maps, list):
            maps = []

        before = len(maps)
        maps = [item for item in maps if str(item.get("id")) != str(map_id)]
        removed = before - len(maps)

        payload["maps"] = maps
        if str(payload.get("active_map_id") or "") == str(map_id):
            payload["active_map_id"] = None
        self._write_midi_maps(payload)

        await self._publish_event(
            "mpx1:midi_map_deleted",
            {"map_id": map_id, "removed": removed},
        )
        return {"removed": removed, "active_map_id": payload.get("active_map_id")}

    async def activate_midi_map(self, map_id: str) -> Dict[str, Any]:
        payload = self._read_midi_maps()
        maps = payload.get("maps", [])
        if not isinstance(maps, list):
            maps = []

        if not any(str(item.get("id")) == str(map_id) for item in maps):
            raise ValueError(f"Unknown MPX1 MIDI map id: {map_id}")

        payload["active_map_id"] = str(map_id)
        self._write_midi_maps(payload)
        await self._publish_event(
            "mpx1:midi_map_activated",
            {"map_id": map_id},
        )
        return {"active_map_id": map_id}

    async def set_midi_learn_target(self, target_param_id: Optional[str]) -> Dict[str, Any]:
        payload = self._read_midi_maps()
        normalized_target: Optional[str] = None
        if target_param_id:
            candidate = str(target_param_id).strip()
            if candidate and candidate not in self.params_by_id:
                raise ValueError(f"Unknown MPX1 param id for learn target: {candidate}")
            normalized_target = candidate if candidate else None

        payload["learn_target_param_id"] = normalized_target
        self._write_midi_maps(payload)
        await self._publish_event(
            "mpx1:midi_learn_target",
            {"target_param_id": normalized_target},
        )
        return {"learn_target_param_id": normalized_target}

    async def _dispatch_midi_map_cc(self, channel: int, cc: int, value: int) -> None:
        payload = self._read_midi_maps()
        active_map_id = str(payload.get("active_map_id") or "")
        if not active_map_id:
            return

        maps = payload.get("maps", [])
        if not isinstance(maps, list):
            return

        active_map = next((item for item in maps if str(item.get("id")) == active_map_id), None)
        if not isinstance(active_map, dict):
            return

        mappings = active_map.get("mappings", [])
        if not isinstance(mappings, list):
            return

        dispatch_count = 0
        for mapping in mappings:
            if not isinstance(mapping, dict):
                continue
            if not bool(mapping.get("enabled", True)):
                continue
            if int(mapping.get("cc", -1)) != int(cc):
                continue
            mapping_channel = int(mapping.get("channel", channel))
            if mapping_channel not in {0, channel}:
                continue

            target_param_id = str(mapping.get("target_param_id", "")).strip()
            if target_param_id not in self.params_by_id:
                continue

            mapped_value = self._map_cc_to_value(mapping, value)
            await self.set_param(target_param_id, mapped_value, source="midi_map")
            dispatch_count += 1

        if dispatch_count:
            await self._publish_event(
                "mpx1:midi_map_dispatch",
                {
                    "map_id": active_map_id,
                    "channel": channel,
                    "cc": cc,
                    "value": value,
                    "dispatch_count": dispatch_count,
                },
            )

    # -------------------------------------------------------------------------
    # Library and dump flow
    # -------------------------------------------------------------------------

    async def get_library(self) -> Dict[str, Any]:
        payload = self._read_library()
        return {"entries": payload.get("entries", [])}

    async def tag_library(self, program: int, tag: str, action: str = "add") -> Dict[str, Any]:
        normalized_program = int(program)
        normalized_tag = tag.strip()
        if not normalized_tag:
            raise ValueError("tag must not be empty")

        payload = self._read_library()
        entries: List[Dict[str, Any]] = payload.get("entries", [])

        target = None
        for entry in entries:
            if int(entry.get("program", -1)) == normalized_program:
                target = entry
                break
        if target is None:
            target = {"program": normalized_program, "name": f"Program {normalized_program:03d}", "tags": []}
            entries.append(target)

        tags = set(str(t) for t in target.get("tags", []))
        if action == "remove":
            tags.discard(normalized_tag)
        else:
            tags.add(normalized_tag)
        target["tags"] = sorted(tags)
        payload["entries"] = entries
        self._write_library(payload)

        await self._publish_event(
            "mpx1:library_tag",
            {"program": normalized_program, "tag": normalized_tag, "action": action},
        )
        return {"program": normalized_program, "tags": target["tags"]}

    async def start_dump_all(self) -> Dict[str, Any]:
        job_id = str(uuid.uuid4())
        self._dump_jobs[job_id] = {"status": "running", "progress": 0, "started_at": time.time()}
        asyncio.create_task(self._run_dump_job(job_id), name=f"mpx1_dump_{job_id}")
        return {"job_id": job_id, "status": "running"}

    async def _run_dump_job(self, job_id: str) -> None:
        try:
            for progress in range(0, 101, 10):
                if job_id not in self._dump_jobs:
                    return
                self._dump_jobs[job_id]["progress"] = progress
                await self._publish_event(
                    "mpx1:dump_progress",
                    {"job_id": job_id, "progress": progress},
                )
                await asyncio.sleep(0.08)
            self._dump_jobs[job_id]["status"] = "completed"
            self._dump_jobs[job_id]["completed_at"] = time.time()
            await self._publish_event(
                "mpx1:dump_completed",
                {"job_id": job_id},
            )
        except Exception as exc:
            self._dump_jobs[job_id]["status"] = "failed"
            self._dump_jobs[job_id]["error"] = str(exc)
            await self._publish_event(
                "mpx1:dump_failed",
                {"job_id": job_id, "error": str(exc)},
            )

    # -------------------------------------------------------------------------
    # State, health, websocket fan-out
    # -------------------------------------------------------------------------

    async def get_diagnostics(self, limit: int = 100) -> Dict[str, Any]:
        safe_limit = max(1, min(500, int(limit)))
        traffic = self._traffic_log[-safe_limit:]
        return {
            "traffic": traffic,
            "count": len(traffic),
            "packet_error_count": self._packet_error_count,
            "last_heartbeat": self._last_event_ts,
        }

    async def ping_latency(self) -> Dict[str, Any]:
        ping_param_id = "program.pitch.algorithm"
        base_param = self.params_by_id.get(ping_param_id)
        if base_param is None:
            raise KeyError(f"Missing diagnostics ping param: {ping_param_id}")

        current = float(self.shadow_state.get(ping_param_id, base_param.get("default", 0)))
        start = time.perf_counter()
        await self.set_param(ping_param_id, current, source="diag_ping")
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        self._record_traffic("diag_ping", None, latency_ms=elapsed_ms)
        return {
            "latency_ms": elapsed_ms,
            "param_id": ping_param_id,
            "timestamp": time.time(),
        }

    async def get_state(self) -> Dict[str, Any]:
        ports = await self.get_midi_ports()
        midi_maps = self._read_midi_maps()
        maps = midi_maps.get("maps", [])
        map_count = len(maps) if isinstance(maps, list) else 0
        return {
            "connected": self._connected_input_index is not None and self._connected_output_index is not None,
            "input_port_index": self._connected_input_index,
            "output_port_index": self._connected_output_index,
            "current_program": self.current_program,
            "shadow_state_count": len(self.shadow_state),
            "pending_realtime_updates": len(self._pending_realtime),
            "rtmidi_available": ports["rtmidi_available"],
            "active_midi_map_id": midi_maps.get("active_map_id"),
            "midi_map_count": map_count,
            "learn_target_param_id": midi_maps.get("learn_target_param_id"),
        }

    async def get_health(self) -> Dict[str, Any]:
        active_dumps = [
            {"job_id": job_id, **details}
            for job_id, details in self._dump_jobs.items()
            if details.get("status") == "running"
        ]
        midi_maps = self._read_midi_maps()
        maps = midi_maps.get("maps", [])
        map_count = len(maps) if isinstance(maps, list) else 0
        return {
            "status": "ok",
            "rtmidi_available": RTMIDI_AVAILABLE,
            "connected": self._connected_input_index is not None and self._connected_output_index is not None,
            "ws_subscribers": len(self._ws_subscribers),
            "active_dump_jobs": active_dumps,
            "coalesce_window_ms": int(self.coalesce_window_sec * 1000),
            "shadow_path": str(self.shadow_path),
            "library_path": str(self.library_path),
            "registry_path": str(self.registry_path),
            "midi_maps_path": str(self.midi_maps_path),
            "active_midi_map_id": midi_maps.get("active_map_id"),
            "midi_map_count": map_count,
            "learn_target_param_id": midi_maps.get("learn_target_param_id"),
            "packet_error_count": self._packet_error_count,
            "last_heartbeat": self._last_event_ts,
        }

    async def register_ws_client(self, client_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        self._ws_subscribers[client_id] = queue
        return queue

    def unregister_ws_client(self, client_id: str) -> None:
        self._ws_subscribers.pop(client_id, None)

    async def _publish_event(self, event_type: str, data: Dict[str, Any]) -> None:
        self._last_event_ts = time.time()
        message = {"type": event_type, "data": data, "timestamp": time.time()}
        # Topic broadcast for shared websocket manager consumers
        try:
            await ws_manager.broadcast_json(message, topic="mpx1")
        except Exception as exc:
            logger.debug("MPX1 ws_manager broadcast failed: %s", exc)

        # Direct MPX1 websocket subscribers
        stale: List[str] = []
        for client_id, queue in self._ws_subscribers.items():
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                stale.append(client_id)
        for client_id in stale:
            self._ws_subscribers.pop(client_id, None)

    async def shutdown(self) -> None:
        await self.disconnect_midi()
        if self._coalesce_task is not None:
            self._coalesce_task.cancel()
            try:
                await self._coalesce_task
            except asyncio.CancelledError:
                pass
            self._coalesce_task = None


_mpx1_service: Optional[MPX1Service] = None


def get_mpx1_service() -> MPX1Service:
    global _mpx1_service
    if _mpx1_service is None:
        _mpx1_service = MPX1Service()
    return _mpx1_service
