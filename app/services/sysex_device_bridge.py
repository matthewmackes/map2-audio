from __future__ import annotations

import asyncio
import gc
import json
import logging
import os
import time
import uuid
import zlib
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.services.event_publisher import RealtimeMessagePublisher, event_publisher
from app.utils.rtmidi_utils import dispose_rtmidi_client


# T2482-P1.1 Gap D.3 (iter 48) + Gap E phase 6 (iter 56) — controller-host
# routing is now MANDATORY for SysEx-device-bridge port enumeration.
# Production code unconditionally takes the host path; the
# rtmidi-direct enumeration branch survives only as a test-injection
# escape hatch (see _enumerate_via_rtmidi). The
# _sysex_bridge_use_midi_host() helper from iters 48/51 was dropped
# in iter 56 — env-gate semantics no longer apply.
#
# The connect loop and per-message send still use rtmidi (deeper
# refactors required: inbound poll → subscribe API rewrite + outbound
# send → host-resolved port binding). Both IntelFX and MPX-1 services
# derive from this base class.

logger = logging.getLogger(__name__)

try:
    from app.services.midi_hub.hub import get_midi_hub
    from app.services.midi_hub.ports import MidiMessage, VirtualMidiPort
except Exception:  # pragma: no cover - optional integration path
    get_midi_hub = None  # type: ignore[assignment]
    MidiMessage = None  # type: ignore[assignment]
    VirtualMidiPort = None  # type: ignore[assignment]


class SysExDeviceBridge:
    DEVICE_LABEL = "Device"
    DEVICE_TOPIC = "device"
    BRIDGE_ID = "device_service"
    REGISTRY_FILENAME = ""
    SHADOW_FILENAME = "device_shadow.json"
    LIBRARY_FILENAME = "device_library.json"
    MIDI_MAPS_FILENAME = "device_midi_maps.json"
    HUB_INPUT_PORT_ID = "consumer:device_in"
    HUB_OUTPUT_PORT_ID = "consumer:device_out"
    HUB_INPUT_NAME = "Device Input"
    HUB_OUTPUT_NAME = "Device Output"
    VIRTUAL_INPUT_NAME = "Virtual Device Input"
    VIRTUAL_OUTPUT_NAME = "Virtual Device Output"
    DEFAULT_NAME_HINT = "device"
    PORT_MATCH_ALIASES: Tuple[str, ...] = ()
    DEFAULT_PROGRAM_SLOTS = 128
    PING_PARAM_ID = ""
    _SYSEX_PREFIX: List[int] = [0xF0]
    _SYSEX_SUFFIX = 0xF7

    def __init__(
        self,
        registry_path: Optional[Path] = None,
        shadow_path: Optional[Path] = None,
        library_path: Optional[Path] = None,
        midi_maps_path: Optional[Path] = None,
        coalesce_window_sec: float = 0.04,
        publisher: Optional[RealtimeMessagePublisher] = None,
    ) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        self.registry_path = registry_path or (repo_root / "app" / "data" / self.REGISTRY_FILENAME)

        state_dir = Path.home() / ".map2"
        state_dir.mkdir(parents=True, exist_ok=True)
        self.shadow_path = shadow_path or (state_dir / self.SHADOW_FILENAME)
        self.library_path = library_path or (state_dir / self.LIBRARY_FILENAME)
        self.midi_maps_path = midi_maps_path or (state_dir / self.MIDI_MAPS_FILENAME)

        self.coalesce_window_sec = max(0.001, float(coalesce_window_sec))
        self._publisher = publisher or event_publisher

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
        self._event_loop: Optional[asyncio.AbstractEventLoop] = None

        self._hub = None
        self._hub_subscriber_id = f"{self.BRIDGE_ID}:{id(self)}"

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

        self._outgoing_seq: Dict[str, Tuple[str, float, float]] = {}
        self._echo_window_sec: float = 0.2

        self._pending_readbacks: Dict[str, Tuple[str, float, float]] = {}
        self._readback_timeout_sec: float = 0.5
        self._verification_task: Optional[asyncio.Task] = None
        self._verify_pass_count: int = 0
        self._verify_fail_count: int = 0

        self._owner: Dict[str, Tuple[str, float]] = {}
        self._owner_lock_sec: float = 2.0
        self._last_sent_value: Dict[str, float] = {}

        self._expected_checksum: int = 0
        self._drift_status: str = "unknown"
        self._drift_task: Optional[asyncio.Task] = None
        self._drift_interval_sec: float = 30.0
        self._drift_mismatch_threshold: int = 3

        self._writer_client_id: Optional[str] = None
        self._write_lock_expires: float = 0.0
        self._write_lock_ttl_sec: float = 5.0

        self._audition_previous_program: int = 0
        self._audition_revert_task: Optional[asyncio.Task] = None
        self._audition_timeout_sec: float = 10.0

        self._load_registry()
        self._load_shadow_state()
        self._load_library()
        self._load_midi_maps()
        self._init_midi_hub_bridge()

    def _topic(self, event_name: str) -> str:
        return f"{self.DEVICE_TOPIC}:{event_name}"

    def _task_name(self, suffix: str) -> str:
        return f"{self.DEVICE_TOPIC}_{suffix}"

    def _rtmidi_available(self) -> bool:
        return False

    def _rtmidi_module(self) -> Any:
        return None

    def _simulator_active(self) -> bool:
        return False

    def _create_simulated_ports(self) -> Tuple[Any, Any]:
        raise RuntimeError(f"{self.DEVICE_LABEL} simulator unavailable")

    def _state_extras(self) -> Dict[str, Any]:
        return {}

    def _health_extras(self) -> Dict[str, Any]:
        return {}

    def _default_library_entries(self) -> List[Dict[str, Any]]:
        raise NotImplementedError

    def decode_param_sysex(self, message: List[int]) -> Optional[Dict[str, Any]]:
        raise NotImplementedError

    def decode_extended_sysex(self, message: List[int]) -> Optional[Dict[str, Any]]:
        raise NotImplementedError

    def _program_slot_count(self) -> int:
        return int(
            self.registry.get("program_management", {}).get("program_slots", self.DEFAULT_PROGRAM_SLOTS)
        )

    def _matches_port_name(self, lowered_name: str, hint: str) -> bool:
        tokens = [hint, *self.PORT_MATCH_ALIASES]
        return any(token and token in lowered_name for token in tokens)

    def _init_midi_hub_bridge(self) -> None:
        if get_midi_hub is None or VirtualMidiPort is None:
            return
        try:
            hub = get_midi_hub()
            if hub.resolve_port(self.HUB_INPUT_PORT_ID) is None:
                hub.register_port(
                    VirtualMidiPort(
                        port_id=self.HUB_INPUT_PORT_ID,
                        name=self.HUB_INPUT_NAME,
                        direction="input",
                    ),
                    open_now=False,
                )
            if hub.resolve_port(self.HUB_OUTPUT_PORT_ID) is None:
                hub.register_port(
                    VirtualMidiPort(
                        port_id=self.HUB_OUTPUT_PORT_ID,
                        name=self.HUB_OUTPUT_NAME,
                        direction="output",
                    ),
                    open_now=False,
                )
            self._hub = hub
        except Exception as exc:
            logger.debug("%s MidiHub bridge unavailable: %s", self.DEVICE_LABEL, exc)

    def _load_registry(self) -> None:
        if not self.registry_path.exists():
            raise FileNotFoundError(f"{self.DEVICE_LABEL} registry not found: {self.registry_path}")

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
            logger.warning("Failed to load %s shadow state, using defaults: %s", self.DEVICE_LABEL, exc)
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
                logger.warning("Failed to parse %s library file, resetting: %s", self.DEVICE_LABEL, exc)

        payload = {"entries": self._default_library_entries()}
        self.library_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

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
        await self._publish_event("library_replaced", {"count": len(normalized)})
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
                logger.warning("Failed to parse %s MIDI maps file, resetting: %s", self.DEVICE_LABEL, exc)

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

        return target_min + normalized * (target_max - target_min)

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
            raise KeyError(f"Unknown {self.DEVICE_LABEL} param id: {param_id}")

        normalized = self._normalize_value(param, value)
        address = [int(v) & 0x7F for v in param["address_bytes"]]
        lo, hi = self._encode_14bit(int(round(normalized)))
        return [*self._SYSEX_PREFIX, *address, lo, hi, self._SYSEX_SUFFIX]

    def _decode_param_sysex_at_offset(self, message: List[int], offset: int) -> Optional[Dict[str, Any]]:
        if offset < 0 or offset + 5 >= len(message) - 1:
            return None
        address = tuple(int(v) & 0x7F for v in message[offset : offset + 4])
        param = self.params_by_address.get(address)
        if param is None:
            return None
        lo = int(message[offset + 4]) & 0x7F
        hi = int(message[offset + 5]) & 0x7F
        value = self._decode_14bit(lo, hi)
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

    async def get_midi_ports(self) -> Dict[str, Any]:
        """Enumerate MIDI ports for this device-bridge.

        T2482-P1.1 Gap E phase 6 (iter 56): the rtmidi-direct
        enumeration is no longer the default production path. The
        controller-host is preferred; when it's unreachable AND
        rtmidi is unavailable, the call raises MidiHostClientError
        with a descriptive message.

        Branch order:

        1. Host-routed enumeration when controller-host daemon is
           reachable (production path).
        2. rtmidi-direct enumeration when daemon is unreachable but
           rtmidi IS available (preserves the iter-48 test idioms
           that patch the module-level rtmidi to drive the legacy
           branch; also covers ad-hoc CLI sessions where the daemon
           isn't running but rtmidi is installed).
        3. Virtual-port placeholder when neither host nor rtmidi
           is available (no-hardware test environments / simulators).
        4. Strict mode (MAP2_REQUIRE_MIDI_HOST=1): branch 2 raises
           even when rtmidi is available — operator wants the host
           path or nothing.
        """
        from app.services.midi_host_client import (
            MidiHostClientError, MidiHostClient, midi_host_required,
        )

        # Production path — try controller-host first.
        client = MidiHostClient()
        if not client.is_daemon_available():
            # Strict mode forbids the rtmidi fallback even when
            # available. Iter 53 introduced the env var; iter 56
            # keeps it honored here.
            if midi_host_required():
                raise MidiHostClientError(
                    f"MAP2_REQUIRE_MIDI_HOST set but controller-host "
                    f"daemon is unreachable; refusing rtmidi fallback "
                    f"for {self.DEVICE_LABEL} get_midi_ports()"
                )
            # Lenient mode: if rtmidi is available, use it. The
            # legacy test idioms (`monkeypatch.setattr(<service>,
            # "rtmidi", ...)`) and ad-hoc CLI sessions both land
            # here. NB: this is NOT silent — when the daemon is
            # supposed to be up, operators should see a startup
            # warning telling them rtmidi is being used.
            if self._rtmidi_available():
                logger.warning(
                    "%s: controller-host daemon unreachable; falling "
                    "back to rtmidi enumeration. This will become a "
                    "hard error after iter 59.",
                    self.DEVICE_LABEL,
                )
                return self._enumerate_via_rtmidi()
            # Neither host nor rtmidi — return the virtual placeholder.
            return {
                "rtmidi_available": False,
                "inputs": [{"index": 0, "name": self.VIRTUAL_INPUT_NAME, "connected": False}],
                "outputs": [{"index": 0, "name": self.VIRTUAL_OUTPUT_NAME, "connected": False}],
                "recommended_input_index": None,
                "recommended_output_index": None,
            }
        # Daemon reachable — use it.
        status, ports = client.list_ports()
        inputs = []
        outputs = []
        recommended_in: Optional[int] = None
        recommended_out: Optional[int] = None
        in_idx = 0
        out_idx = 0
        for p in ports:
            if p.is_input:
                entry = {
                    "index": in_idx,
                    "name": p.name,
                    "connected": in_idx == self._connected_input_index,
                }
                inputs.append(entry)
                lowered = p.name.lower()
                if recommended_in is None and self._matches_port_name(
                        lowered, self.DEFAULT_NAME_HINT):
                    recommended_in = in_idx
                in_idx += 1
            else:
                entry = {
                    "index": out_idx,
                    "name": p.name,
                    "connected": out_idx == self._connected_output_index,
                }
                outputs.append(entry)
                lowered = p.name.lower()
                if recommended_out is None and self._matches_port_name(
                        lowered, self.DEFAULT_NAME_HINT):
                    recommended_out = out_idx
                out_idx += 1
        return {
            "rtmidi_available": True,
            "inputs": inputs,
            "outputs": outputs,
            "recommended_input_index": recommended_in,
            "recommended_output_index": recommended_out,
            "probe_errors": [],
            "host_routed": True,
            "host_backend": status.backend,
        }

    def _enumerate_via_rtmidi(self) -> Dict[str, Any]:
        """Legacy rtmidi-direct enumeration — test-injection only.

        Reachable only when a test has patched _rtmidi_module on the
        instance. Connect/poll/send paths in this class still call
        rtmidi directly, so this helper continues to drive that
        codepath under unit tests.
        """
        rtmidi = self._rtmidi_module()
        inputs: List[Dict[str, Any]] = []
        outputs: List[Dict[str, Any]] = []
        recommended_in: Optional[int] = None
        recommended_out: Optional[int] = None
        probe_errors: List[str] = []

        midi_in: Any = None
        try:
            midi_in = rtmidi.MidiIn()
            for index in range(midi_in.get_port_count()):
                name = midi_in.get_port_name(index)
                inputs.append({"index": index, "name": name, "connected": index == self._connected_input_index})
                lowered = name.lower()
                if recommended_in is None and self._matches_port_name(lowered, self.DEFAULT_NAME_HINT):
                    recommended_in = index
        except Exception as exc:
            error = f"input_probe_failed: {exc}"
            probe_errors.append(error)
            self._record_traffic("midi_ports_probe_error", None, direction="input", error=str(exc))
            logger.warning("%s MIDI input probe failed: %s", self.DEVICE_LABEL, exc)
        finally:
            dispose_rtmidi_client(midi_in)
            gc.collect()

        midi_out: Any = None
        try:
            midi_out = rtmidi.MidiOut()
            for index in range(midi_out.get_port_count()):
                name = midi_out.get_port_name(index)
                outputs.append({"index": index, "name": name, "connected": index == self._connected_output_index})
                lowered = name.lower()
                if recommended_out is None and self._matches_port_name(lowered, self.DEFAULT_NAME_HINT):
                    recommended_out = index
        except Exception as exc:
            error = f"output_probe_failed: {exc}"
            probe_errors.append(error)
            self._record_traffic("midi_ports_probe_error", None, direction="output", error=str(exc))
            logger.warning("%s MIDI output probe failed: %s", self.DEVICE_LABEL, exc)
        finally:
            dispose_rtmidi_client(midi_out)
            gc.collect()

        return {
            "rtmidi_available": True,
            "inputs": inputs,
            "outputs": outputs,
            "recommended_input_index": recommended_in,
            "recommended_output_index": recommended_out,
            "probe_errors": probe_errors,
        }

    async def connect_midi(
        self,
        input_port_index: Optional[int] = None,
        output_port_index: Optional[int] = None,
        name_hint: Optional[str] = None,
    ) -> Dict[str, Any]:
        await self.disconnect_midi()

        ports = await self.get_midi_ports()
        if not ports["rtmidi_available"]:
            return {"connected": False, "detail": "python-rtmidi unavailable"}

        hint = (name_hint or self.DEFAULT_NAME_HINT).lower()

        if input_port_index is None:
            for item in ports["inputs"]:
                if self._matches_port_name(item["name"].lower(), hint):
                    input_port_index = int(item["index"])
                    break
            if input_port_index is None:
                input_port_index = ports.get("recommended_input_index")
        if output_port_index is None:
            for item in ports["outputs"]:
                if self._matches_port_name(item["name"].lower(), hint):
                    output_port_index = int(item["index"])
                    break
            if output_port_index is None:
                output_port_index = ports.get("recommended_output_index")

        if input_port_index is None or output_port_index is None:
            return {"connected": False, "detail": f"No {self.DEVICE_LABEL}-like MIDI ports found"}

        if self._simulator_active():
            self._midi_in, self._midi_out = self._create_simulated_ports()
            self._connected_input_index = input_port_index or 0
            self._connected_output_index = output_port_index or 0
            self._running = True
            self._event_loop = asyncio.get_running_loop()
            if self._hub is not None:
                try:
                    if not self._hub.running:
                        self._hub.start()
                    self._hub.subscribe(self._hub_subscriber_id, self._on_hub_message)
                except Exception as exc:
                    logger.debug("Failed to subscribe %s hub bridge: %s", self.DEVICE_LABEL, exc)
            self._midi_poll_task = asyncio.create_task(self._midi_poll_loop(), name=self._task_name("midi_poll"))
            self._start_background_tasks()
            await self._publish_event(
                "midi_connected",
                {
                    "input_port_index": self._connected_input_index,
                    "output_port_index": self._connected_output_index,
                    "simulator": True,
                },
            )
            return {"connected": True, "simulator": True}

        rtmidi = self._rtmidi_module()
        try:
            self._midi_in = rtmidi.MidiIn()
            self._midi_out = rtmidi.MidiOut()
            self._midi_in.open_port(int(input_port_index))
            self._midi_in.ignore_types(sysex=False, timing=True, active_sense=True)
            self._midi_out.open_port(int(output_port_index))
            self._connected_input_index = int(input_port_index)
            self._connected_output_index = int(output_port_index)
            self._running = True
            self._event_loop = asyncio.get_running_loop()
            if self._hub is not None:
                try:
                    if not self._hub.running:
                        self._hub.start()
                    self._hub.subscribe(self._hub_subscriber_id, self._on_hub_message)
                except Exception as exc:
                    logger.debug("Failed to subscribe %s hub bridge: %s", self.DEVICE_LABEL, exc)
            self._midi_poll_task = asyncio.create_task(self._midi_poll_loop(), name=self._task_name("midi_poll"))
            self._start_background_tasks()
            await self._publish_event(
                "midi_connected",
                {
                    "input_port_index": self._connected_input_index,
                    "output_port_index": self._connected_output_index,
                },
            )
            return {"connected": True}
        except Exception as exc:
            logger.error("Failed to connect %s MIDI ports: %s", self.DEVICE_LABEL, exc)
            await self.disconnect_midi()
            return {"connected": False, "detail": str(exc)}

    async def disconnect_midi(self) -> None:
        self._running = False
        if self._hub is not None:
            try:
                self._hub.unsubscribe(self._hub_subscriber_id)
            except Exception:
                pass
        if self._midi_poll_task is not None:
            self._midi_poll_task.cancel()
            try:
                await self._midi_poll_task
            except asyncio.CancelledError:
                pass
            self._midi_poll_task = None

        if self._midi_in is not None:
            dispose_rtmidi_client(self._midi_in)
            self._midi_in = None

        if self._midi_out is not None:
            dispose_rtmidi_client(self._midi_out)
            self._midi_out = None

        self._connected_input_index = None
        self._connected_output_index = None
        self._event_loop = None

    def _on_hub_message(self, message: MidiMessage) -> None:
        if not self._running:
            return
        if message.source_port == self.HUB_OUTPUT_PORT_ID:
            return
        if message.destination_port not in (None, self.HUB_INPUT_PORT_ID):
            return
        payload = [int(value) & 0xFF for value in (message.data or b"")]
        if not payload or self._event_loop is None:
            return

        async def _dispatch() -> None:
            status = payload[0] & 0xFF
            if status == 0xF0:
                await self.handle_incoming_sysex(payload)
            elif (status & 0xF0) == 0xB0 and len(payload) >= 3:
                channel = (status & 0x0F) + 1
                await self.handle_incoming_cc(channel, payload[1] & 0x7F, payload[2] & 0x7F)

        try:
            asyncio.run_coroutine_threadsafe(_dispatch(), self._event_loop)
        except Exception as exc:  # pragma: no cover - thread bridge
            logger.debug("%s hub dispatch scheduling failed: %s", self.DEVICE_LABEL, exc)

    def _emit_hub_message(self, payload: List[int], *, direction: str, kind: str) -> None:
        if self._hub is None:
            return
        try:
            destination = self.HUB_INPUT_PORT_ID if direction == "in" else f"{self.DEVICE_TOPIC}:device"
            self._hub.send(
                source_port=self.HUB_OUTPUT_PORT_ID if direction == "out" else self.HUB_INPUT_PORT_ID,
                destination_port=destination,
                data=bytes(int(v) & 0xFF for v in payload),
                metadata={"bridge": self.BRIDGE_ID, "direction": direction, "kind": kind},
            )
        except Exception:
            return

    def _start_background_tasks(self) -> None:
        if self._drift_task is None or self._drift_task.done():
            self._drift_task = asyncio.create_task(self._drift_detection_loop(), name=self._task_name("drift_detect"))
        if self._verification_task is None or self._verification_task.done():
            self._verification_task = asyncio.create_task(
                self._readback_timeout_loop(),
                name=self._task_name("readback_verify"),
            )

    def _register_outgoing(self, param_id: str, value: float) -> str:
        seq_id = uuid.uuid4().hex
        expires_at = time.monotonic() + self._echo_window_sec
        self._outgoing_seq[seq_id] = (param_id, value, expires_at)
        now = time.monotonic()
        stale = [k for k, (_, _, exp) in self._outgoing_seq.items() if exp < now]
        for key in stale:
            self._outgoing_seq.pop(key, None)
        return seq_id

    def _is_echo(self, param_id: str, value: float) -> bool:
        now = time.monotonic()
        for seq_id, (pid, val, expires_at) in list(self._outgoing_seq.items()):
            if expires_at < now:
                self._outgoing_seq.pop(seq_id, None)
                continue
            if pid == param_id and abs(val - value) < 0.5:
                self._outgoing_seq.pop(seq_id, None)
                return True
        return False

    def _register_readback(self, param_id: str, expected_value: float) -> None:
        seq_id = uuid.uuid4().hex
        expires_at = time.monotonic() + self._readback_timeout_sec
        self._pending_readbacks[seq_id] = (param_id, expected_value, expires_at)

    def _resolve_readback(self, param_id: str, received_value: float) -> bool:
        for seq_id, (pid, expected, _expires_at) in list(self._pending_readbacks.items()):
            if pid == param_id and abs(expected - received_value) < 0.5:
                self._pending_readbacks.pop(seq_id, None)
                self._verify_pass_count += 1
                return True
        return False

    async def _readback_timeout_loop(self) -> None:
        while self._running:
            await asyncio.sleep(max(0.1, self._readback_timeout_sec / 2))
            now = time.monotonic()
            timed_out: List[Tuple[str, str, float]] = []
            for seq_id, (param_id, expected, expires_at) in list(self._pending_readbacks.items()):
                if expires_at < now:
                    timed_out.append((seq_id, param_id, expected))
            for seq_id, param_id, expected in timed_out:
                self._pending_readbacks.pop(seq_id, None)
                self._verify_fail_count += 1
                self._record_traffic("readback_timeout", None, param_id=param_id, expected=expected)
                await self._publish_event("param_unverified", {"param_id": param_id, "expected": expected})

    def _acquire_ownership(self, param_id: str, source: str) -> None:
        self._owner[param_id] = (source, time.monotonic())

    def _gui_owns(self, param_id: str) -> bool:
        entry = self._owner.get(param_id)
        if entry is None:
            return False
        owner_source, locked_at = entry
        if owner_source != "gui":
            return False
        if time.monotonic() - locked_at > self._owner_lock_sec:
            self._owner.pop(param_id, None)
            return False
        return True

    def _pickup_distance(self, param_id: str, incoming_value: float) -> Optional[float]:
        last = self._last_sent_value.get(param_id)
        if last is None:
            return None
        param = self.params_by_id.get(param_id)
        if param is None:
            return None
        value_range = param.get("range", {}) or {}
        span = float(value_range.get("max", 100)) - float(value_range.get("min", 0))
        if span <= 0:
            return None
        return abs(incoming_value - last) / span

    def _compute_shadow_checksum(self) -> int:
        blob = json.dumps(
            sorted((k, round(v, 4)) for k, v in self.shadow_state.items()),
            separators=(",", ":"),
        ).encode()
        return zlib.crc32(blob) & 0xFFFFFFFF

    async def _drift_detection_loop(self) -> None:
        while self._running:
            await asyncio.sleep(self._drift_interval_sec)
            if self._midi_out is None:
                continue
            try:
                await self._check_drift()
            except Exception as exc:
                logger.debug("Drift detection loop error: %s", exc)

    async def _check_drift(self) -> None:
        current_checksum = self._compute_shadow_checksum()
        if self._expected_checksum == 0:
            self._expected_checksum = current_checksum
            self._drift_status = "clean"
            return

        if current_checksum == self._expected_checksum:
            if self._drift_status != "clean":
                self._drift_status = "clean"
                await self._publish_event("drift_status", {"status": "clean"})
            return

        mismatch_count = bin(current_checksum ^ self._expected_checksum).count("1")
        if mismatch_count >= self._drift_mismatch_threshold:
            logger.warning("%s drift detected (mismatch bits=%d)", self.DEVICE_LABEL, mismatch_count)
            self._drift_status = "resyncing"
            await self._publish_event("drift_detected", {"mismatch_bits": mismatch_count, "action": "resync"})
            async with self._state_lock:
                snapshot = dict(self.shadow_state)
            for param_id, value in snapshot.items():
                param = self.params_by_id.get(param_id)
                if param and param.get("realtime_safe"):
                    await self._dispatch_param_update(param_id, value, source="resync")
            self._expected_checksum = self._compute_shadow_checksum()
            self._drift_status = "clean"
            await self._publish_event("drift_status", {"status": "clean"})
        else:
            self._expected_checksum = current_checksum

    def _write_lock_owner(self) -> Optional[str]:
        if self._writer_client_id and time.monotonic() < self._write_lock_expires:
            return self._writer_client_id
        self._writer_client_id = None
        return None

    def _refresh_write_lock(self, client_id: str) -> None:
        if self._writer_client_id is None or self._writer_client_id == client_id:
            self._writer_client_id = client_id
            self._write_lock_expires = time.monotonic() + self._write_lock_ttl_sec

    async def acquire_write_lock(self, client_id: str) -> Dict[str, Any]:
        current_owner = self._write_lock_owner()
        if current_owner and current_owner != client_id:
            return {
                "acquired": False,
                "holder": current_owner,
                "expires_in_sec": self._write_lock_expires - time.monotonic(),
            }
        self._refresh_write_lock(client_id)
        await self._publish_event("writer_changed", {"client_id": client_id, "expires_at": self._write_lock_expires})
        return {
            "acquired": True,
            "client_id": client_id,
            "expires_at": self._write_lock_expires,
        }

    async def release_write_lock(self, client_id: str) -> Dict[str, Any]:
        owner = self._write_lock_owner()
        if owner != client_id:
            return {"released": False, "reason": "not the current writer"}
        self._writer_client_id = None
        await self._publish_event("writer_changed", {"client_id": None})
        return {"released": True}

    async def _midi_poll_loop(self) -> None:
        while self._running and self._midi_in is not None:
            try:
                msg = self._midi_in.get_message()
                if msg:
                    data, _delta_time = msg
                    if data:
                        frame = [int(v) & 0xFF for v in data]
                        self._emit_hub_message(frame, direction="in", kind="poll_rx")
                        status = int(data[0]) & 0xFF
                        if status == 0xF0:
                            await self.handle_incoming_sysex([int(v) for v in data])
                        elif (status & 0xF0) == 0xB0 and len(data) >= 3:
                            channel = (status & 0x0F) + 1
                            cc = int(data[1]) & 0x7F
                            value = int(data[2]) & 0x7F
                            await self.handle_incoming_cc(channel, cc, value)
                await asyncio.sleep(0.005)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._packet_error_count += 1
                self._record_traffic("poll_error", None, error=str(exc))
                logger.debug("%s MIDI poll loop error: %s", self.DEVICE_LABEL, exc)
                await asyncio.sleep(0.05)

    async def handle_incoming_sysex(self, message: List[int]) -> Optional[Dict[str, Any]]:
        extended = self.decode_extended_sysex(message)
        if extended is not None:
            frame_type = str(extended.get("frame_type", "unknown"))
            if frame_type == "program_status":
                program = int(extended.get("program", self.current_program))
                self.current_program = max(0, program)
                self._persist_shadow_state()
                self._record_traffic("rx_program_sysex", message, program=program)
                await self._publish_event("program_changed", {"program": program, "source": "midi_sysex"})
                self._record_traffic(
                    "rx_sysex_panel_inferred",
                    message,
                    control="program_select",
                    control_value=program,
                )
                await self._publish_event(
                    "panel_status",
                    {
                        "control": "program_select",
                        "control_value": program,
                        "inferred_from": "program_status",
                        "source": "midi_sysex",
                    },
                )
                return extended

            if frame_type == "panel_status":
                value = int(extended.get("control_value", 0))
                self._record_traffic("rx_sysex_panel", message, control_value=value)
                await self._publish_event("panel_status", {"control_value": value})
                return extended

            if frame_type == "heartbeat":
                self._record_traffic("rx_sysex_heartbeat", message)
                await self._publish_event("heartbeat", {})
                return extended

        decoded = self.decode_param_sysex(message)
        if decoded is None:
            self._record_traffic("rx_sysex_unknown", message)
            return None

        param_id = str(decoded["param_id"])
        value = float(decoded["value"])

        if self._is_echo(param_id, value):
            self._record_traffic("rx_sysex_echo_suppressed", message, param_id=param_id, value=value)
            self._resolve_readback(param_id, value)
            await self._publish_event("param_verified", {"param_id": param_id, "value": value})
            return None

        self._record_traffic("rx_sysex", message, param_id=param_id, value=value)

        verified = self._resolve_readback(param_id, value)
        if verified:
            await self._publish_event("param_verified", {"param_id": param_id, "value": value})

        if self._gui_owns(param_id):
            distance = self._pickup_distance(param_id, value)
            self._record_traffic(
                "rx_sysex_ownership_conflict",
                message,
                param_id=param_id,
                value=value,
                pickup_distance=distance,
            )
            await self._publish_event(
                "ownership_conflict",
                {"param_id": param_id, "value": value, "pickup_distance": distance},
            )
            if distance is not None and distance > 0:
                await self._publish_event(
                    "pickup_zone",
                    {"param_id": param_id, "hardware_value": value, "distance": distance},
                )
            return None

        async with self._state_lock:
            self.shadow_state[param_id] = value
            self._persist_shadow_state()

        await self._publish_event("param_rx", {"param_id": param_id, "value": value, "source": "midi_sysex"})
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
        await self._publish_event("midi_cc", payload)

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
                await self._publish_event("midi_learn_assigned", {"map_id": active_map_id, "mapping": new_mapping})
                break

        await self._dispatch_midi_map_cc(channel=channel, cc=cc, value=value)
        return payload

    async def set_param(
        self,
        param_id: str,
        value: float,
        source: str = "api",
        writer_client_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        param = self.params_by_id.get(param_id)
        if param is None:
            raise KeyError(f"Unknown {self.DEVICE_LABEL} param id: {param_id}")

        current_owner = self._write_lock_owner()
        if current_owner is not None and writer_client_id != current_owner:
            return {
                "locked": True,
                "holder": current_owner,
                "param_id": param_id,
                "expires_in_sec": self._write_lock_expires - time.monotonic(),
            }
        if writer_client_id and current_owner == writer_client_id:
            self._refresh_write_lock(writer_client_id)

        normalized = self._normalize_value(param, value)
        if bool(param.get("realtime_safe", False)):
            async with self._state_lock:
                self._pending_realtime[param_id] = normalized
                if self._coalesce_task is None or self._coalesce_task.done():
                    self._coalesce_task = asyncio.create_task(
                        self._coalesced_flush_loop(),
                        name=self._task_name("coalesced_flush"),
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
        self._register_outgoing(param_id, value)

        if source not in ("resync",):
            param = self.params_by_id.get(param_id)
            if param and not param.get("realtime_safe", False):
                self._register_readback(param_id, value)

        if source in ("gui", "api", "api_bulk"):
            self._acquire_ownership(param_id, "gui")
            self._last_sent_value[param_id] = value

        self._record_traffic("tx_sysex", message, param_id=param_id, value=value, source=source)
        self._outgoing_sysex_log.append(message)
        if len(self._outgoing_sysex_log) > 256:
            self._outgoing_sysex_log = self._outgoing_sysex_log[-256:]

        if self._midi_out is not None:
            try:
                self._midi_out.send_message(message)
                self._emit_hub_message(message, direction="out", kind="param_sysex")
            except Exception as exc:
                logger.debug("%s send_message failed for %s: %s", self.DEVICE_LABEL, param_id, exc)

        async with self._state_lock:
            self.shadow_state[param_id] = value
            self._persist_shadow_state()

        self._expected_checksum = self._compute_shadow_checksum()
        await self._publish_event("param_tx", {"param_id": param_id, "value": value, "source": source})

    async def set_program(self, program: int) -> Dict[str, Any]:
        max_slots = self._program_slot_count()
        normalized = max(0, min(max_slots - 1, int(program)))
        self.current_program = normalized
        self._persist_shadow_state()

        if self._midi_out is not None:
            try:
                bank = normalized // 128
                program_lsb = normalized % 128
                self._midi_out.send_message([0xB0, 0x00, bank & 0x7F])
                self._midi_out.send_message([0xC0, program_lsb & 0x7F])
                self._emit_hub_message([0xB0, 0x00, bank & 0x7F], direction="out", kind="bank_select")
                self._emit_hub_message([0xC0, program_lsb & 0x7F], direction="out", kind="program_change")
            except Exception as exc:
                logger.debug("%s program change send failed: %s", self.DEVICE_LABEL, exc)

        await self._publish_event("program_changed", {"program": normalized})
        return {"program": normalized}

    async def get_programs(self) -> List[Dict[str, Any]]:
        max_slots = self._program_slot_count()
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

        await self._publish_event("midi_map_saved", {"map_id": map_id, "active_map_id": payload.get("active_map_id")})
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

        await self._publish_event("midi_map_deleted", {"map_id": map_id, "removed": removed})
        return {"removed": removed, "active_map_id": payload.get("active_map_id")}

    async def activate_midi_map(self, map_id: str) -> Dict[str, Any]:
        payload = self._read_midi_maps()
        maps = payload.get("maps", [])
        if not isinstance(maps, list):
            maps = []

        if not any(str(item.get("id")) == str(map_id) for item in maps):
            raise ValueError(f"Unknown {self.DEVICE_LABEL} MIDI map id: {map_id}")

        payload["active_map_id"] = str(map_id)
        self._write_midi_maps(payload)
        await self._publish_event("midi_map_activated", {"map_id": map_id})
        return {"active_map_id": map_id}

    async def set_midi_learn_target(self, target_param_id: Optional[str]) -> Dict[str, Any]:
        payload = self._read_midi_maps()
        normalized_target: Optional[str] = None
        if target_param_id:
            candidate = str(target_param_id).strip()
            if candidate and candidate not in self.params_by_id:
                raise ValueError(f"Unknown {self.DEVICE_LABEL} param id for learn target: {candidate}")
            normalized_target = candidate if candidate else None

        payload["learn_target_param_id"] = normalized_target
        self._write_midi_maps(payload)
        await self._publish_event("midi_learn_target", {"target_param_id": normalized_target})
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
                "midi_map_dispatch",
                {
                    "map_id": active_map_id,
                    "channel": channel,
                    "cc": cc,
                    "value": value,
                    "dispatch_count": dispatch_count,
                },
            )

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

        await self._publish_event("library_tag", {"program": normalized_program, "tag": normalized_tag, "action": action})
        return {"program": normalized_program, "tags": target["tags"]}

    async def start_dump_all(self) -> Dict[str, Any]:
        job_id = str(uuid.uuid4())
        self._dump_jobs[job_id] = {"status": "running", "progress": 0, "started_at": time.time()}
        asyncio.create_task(self._run_dump_job(job_id), name=f"{self.DEVICE_TOPIC}_dump_{job_id}")
        return {"job_id": job_id, "status": "running"}

    async def _run_dump_job(self, job_id: str) -> None:
        try:
            for progress in range(0, 101, 10):
                if job_id not in self._dump_jobs:
                    return
                self._dump_jobs[job_id]["progress"] = progress
                await self._publish_event("dump_progress", {"job_id": job_id, "progress": progress})
                await asyncio.sleep(0.08)
            self._dump_jobs[job_id]["status"] = "completed"
            self._dump_jobs[job_id]["completed_at"] = time.time()
            await self._publish_event("dump_completed", {"job_id": job_id})
        except Exception as exc:
            self._dump_jobs[job_id]["status"] = "failed"
            self._dump_jobs[job_id]["error"] = str(exc)
            await self._publish_event("dump_failed", {"job_id": job_id, "error": str(exc)})

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
        ping_param_id = self.PING_PARAM_ID
        base_param = self.params_by_id.get(ping_param_id)
        if base_param is None:
            raise KeyError(f"Missing diagnostics ping param: {ping_param_id}")

        current = float(self.shadow_state.get(ping_param_id, base_param.get("default", 0)))
        start = time.perf_counter()
        await self.set_param(ping_param_id, current, source="diag_ping")
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        self._record_traffic("diag_ping", None, latency_ms=elapsed_ms)
        return {"latency_ms": elapsed_ms, "param_id": ping_param_id, "timestamp": time.time()}

    async def _import_parsed_programs(
        self,
        programs: List[Any],
        *,
        source_name: str,
        skip_duplicates: bool,
    ) -> Dict[str, Any]:
        payload = self._read_library()
        entries: List[Dict[str, Any]] = payload.get("entries", [])
        if not isinstance(entries, list):
            entries = []

        existing_checksums: set[str] = set()
        if skip_duplicates:
            for entry in entries:
                checksum = str(entry.get("checksum", ""))
                if checksum:
                    existing_checksums.add(checksum)

        imported = 0
        skipped = 0
        errors: List[str] = []
        slot_count = self._program_slot_count()

        for index, prog in enumerate(programs):
            try:
                if skip_duplicates and prog.checksum_hex in existing_checksums:
                    skipped += 1
                    continue
                program_number = prog.program_number
                if program_number is None:
                    used = {int(entry.get("program", -1)) for entry in entries}
                    program_number = next((n for n in range(slot_count) if n not in used), len(entries))
                entry = prog.to_library_entry(override_program=program_number)
                entries.append(entry)
                existing_checksums.add(prog.checksum_hex)
                imported += 1
            except Exception as exc:
                errors.append(f"program[{index}]: {exc}")

        payload["entries"] = entries
        self._write_library(payload)
        await self._publish_event("library_syx_imported", {"imported": imported, "skipped": skipped, "source": source_name})
        return {"imported": imported, "skipped": skipped, "errors": errors}

    async def export_bundle(self, program_numbers: Optional[List[int]] = None) -> bytes:
        import io
        import zipfile

        payload = self._read_library()
        entries = payload.get("entries", [])

        if program_numbers is not None:
            target_set = set(program_numbers)
            entries = [entry for entry in entries if int(entry.get("program", -1)) in target_set]

        metadata: List[Dict[str, Any]] = []
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for entry in entries:
                program = int(entry.get("program", 0))
                syx_hex = str(entry.get("syx_blob", ""))
                if syx_hex:
                    try:
                        zf.writestr(f"programs/{program:03d}.syx", bytes.fromhex(syx_hex))
                    except Exception:
                        pass
                metadata.append({key: value for key, value in entry.items() if key != "syx_blob"})
            zf.writestr("metadata.json", json.dumps(metadata, indent=2))
        return buf.getvalue()

    async def save_preset_version(self, program: int, note: str = "") -> Dict[str, Any]:
        payload = self._read_library()
        entries = payload.get("entries", [])
        target: Optional[Dict[str, Any]] = None
        for entry in entries:
            if int(entry.get("program", -1)) == program:
                target = entry
                break
        if target is None:
            raise KeyError(f"Program {program} not in library")

        versions = target.get("versions") or []
        current_v = int(target.get("current_version", len(versions)))
        new_v = current_v + 1

        versions.append(
            {
                "v": new_v,
                "snapshot": {key: value for key, value in self.shadow_state.items()},
                "saved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "note": note,
            }
        )
        target["versions"] = versions
        target["current_version"] = new_v
        payload["entries"] = entries
        self._write_library(payload)
        return {"program": program, "version": new_v}

    async def list_preset_versions(self, program: int) -> Dict[str, Any]:
        payload = self._read_library()
        for entry in payload.get("entries", []):
            if int(entry.get("program", -1)) == program:
                versions = entry.get("versions") or []
                diffs = []
                for index in range(1, len(versions)):
                    previous = versions[index - 1].get("snapshot", {})
                    current = versions[index].get("snapshot", {})
                    changed = [
                        {"param_id": key, "old": previous.get(key), "new": current.get(key)}
                        for key in set(previous) | set(current)
                        if previous.get(key) != current.get(key)
                    ]
                    diffs.append({"from_v": index, "to_v": index + 1, "changes": changed})
                return {"program": program, "versions": versions, "diffs": diffs}
        raise KeyError(f"Program {program} not in library")

    async def revert_preset_version(self, program: int, version: int) -> Dict[str, Any]:
        payload = self._read_library()
        for entry in payload.get("entries", []):
            if int(entry.get("program", -1)) == program:
                versions = entry.get("versions") or []
                target_snap: Optional[Dict[str, Any]] = None
                for item in versions:
                    if int(item.get("v", 0)) == version:
                        target_snap = item.get("snapshot")
                        break
                if target_snap is None:
                    raise KeyError(f"Version {version} not found for program {program}")
                for param_id, value in target_snap.items():
                    if param_id in self.params_by_id:
                        await self.set_param(param_id, float(value), source="version_revert")
                entry["current_version"] = version
                payload["entries"] = [
                    entry if int(existing.get("program", -1)) == program else existing
                    for existing in payload.get("entries", [])
                ]
                self._write_library(payload)
                return {"program": program, "reverted_to": version}
        raise KeyError(f"Program {program} not in library")

    async def audition_program(self, program: int) -> Dict[str, Any]:
        self._audition_previous_program = self.current_program
        result = await self.set_program(program)
        if self._audition_revert_task is not None:
            try:
                self._audition_revert_task.cancel()
            except Exception:
                pass
        self._audition_revert_task = asyncio.create_task(
            self._audition_auto_revert(delay_sec=self._audition_timeout_sec),
            name=self._task_name("audition_revert"),
        )
        await self._publish_event(
            "audition_started",
            {
                "program": program,
                "previous_program": self._audition_previous_program,
                "timeout_sec": self._audition_timeout_sec,
            },
        )
        return {**result, "previous_program": self._audition_previous_program}

    async def audition_revert(self) -> Dict[str, Any]:
        if self._audition_revert_task is not None:
            try:
                self._audition_revert_task.cancel()
            except Exception:
                pass
            self._audition_revert_task = None
        previous = self._audition_previous_program
        result = await self.set_program(previous)
        await self._publish_event("audition_reverted", {"program": previous})
        return result

    async def audition_confirm(self) -> Dict[str, Any]:
        if self._audition_revert_task is not None:
            try:
                self._audition_revert_task.cancel()
            except Exception:
                pass
            self._audition_revert_task = None
        await self._publish_event("audition_confirmed", {"program": self.current_program})
        return {"confirmed": True, "program": self.current_program}

    async def _audition_auto_revert(self, delay_sec: float) -> None:
        try:
            await asyncio.sleep(delay_sec)
        except asyncio.CancelledError:
            return
        await self.audition_revert()

    async def get_state(self) -> Dict[str, Any]:
        ports = await self.get_midi_ports()
        midi_maps = self._read_midi_maps()
        maps = midi_maps.get("maps", [])
        map_count = len(maps) if isinstance(maps, list) else 0
        payload = {
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
            "drift_status": self._drift_status,
            "verify_pass": self._verify_pass_count,
            "verify_fail": self._verify_fail_count,
            "writer_client_id": self._write_lock_owner(),
            "pending_readbacks": len(self._pending_readbacks),
        }
        payload.update(self._state_extras())
        return payload

    async def get_health(self) -> Dict[str, Any]:
        active_dumps = [
            {"job_id": job_id, **details}
            for job_id, details in self._dump_jobs.items()
            if details.get("status") == "running"
        ]
        midi_maps = self._read_midi_maps()
        maps = midi_maps.get("maps", [])
        map_count = len(maps) if isinstance(maps, list) else 0
        payload = {
            "status": "ok",
            "rtmidi_available": self._rtmidi_available(),
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
        payload.update(self._health_extras())
        return payload

    async def register_ws_client(self, client_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        self._ws_subscribers[client_id] = queue
        return queue

    def unregister_ws_client(self, client_id: str) -> None:
        self._ws_subscribers.pop(client_id, None)

    async def _publish_event(self, event_type: str, data: Dict[str, Any]) -> None:
        self._last_event_ts = time.time()
        message_type = event_type if ":" in event_type else self._topic(event_type)
        message = {"type": message_type, "data": data, "timestamp": time.time()}
        try:
            await self._publisher.publish_message(message, topics=(self.DEVICE_TOPIC,))
        except Exception as exc:
            logger.debug("%s realtime publish failed: %s", self.DEVICE_LABEL, exc)

        stale: List[str] = []
        for client_id, queue in self._ws_subscribers.items():
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                stale.append(client_id)
        for client_id in stale:
            self._ws_subscribers.pop(client_id, None)

    async def shutdown(self) -> None:
        self._running = False
        await self.disconnect_midi()
        for task_attr in ("_coalesce_task", "_drift_task", "_verification_task"):
            task = getattr(self, task_attr, None)
            if task is not None and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            setattr(self, task_attr, None)
