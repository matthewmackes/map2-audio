"""Standalone Maschine MK1 HID daemon.

This daemon bridges the Native Instruments Maschine MK1 USB HID surface into
MAP2 by:

- reading HID reports and translating them into a virtual ALSA MIDI port
- mirroring HID activity into the backend websocket bridge
- polling backend state to render LCD frames and pad LEDs
- dispatching transport and block-focus actions back into the MAP2 API

The HID report decoder is intentionally table-driven and tolerant of unknown
reports. The concrete Maschine MK1 packet layout can vary by firmware/runtime,
so unsupported reports are surfaced as raw HID events instead of crashing the
daemon.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import queue
import signal
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Iterable
from urllib.parse import urlencode, urljoin, urlparse

import httpx
import websockets
from websockets.sync.client import ClientConnection, connect as ws_connect

from app.services.maschine.transport import MaschineTransportController
from app.services.maschine_encoder_map_service import default_maschine_encoder_map
from app.services.maschine_lcd_service import (
    LCD_HEIGHT,
    LCD_WIDTH,
    MaschineLCDRenderService,
    _Canvas,
    _safe_label,
)
from app.services.maschine_service import MaschineService

try:
    import hid  # type: ignore
except Exception:  # pragma: no cover - optional runtime dependency
    hid = None

try:
    import rtmidi  # type: ignore
except Exception:  # pragma: no cover - optional runtime dependency
    rtmidi = None

LOGGER = logging.getLogger("maschine_mk1_daemon")

MASCHINE_VENDOR_ID = 0x17CC
MASCHINE_PRODUCT_ID = 0x0808
MASCHINE_VIRTUAL_PORT_NAME = "MAP2:Maschine-MK1"
DEFAULT_BACKEND_URL = "http://localhost:8080"
HID_POLL_INTERVAL_SECONDS = 0.002
DISPLAY_FPS = 30.0
DISPLAY_POLL_INTERVAL_SECONDS = 0.5
HEARTBEAT_INTERVAL_SECONDS = 2.0
RECONNECT_BACKOFF_MIN_SECONDS = 1.0
RECONNECT_BACKOFF_MAX_SECONDS = 10.0
PAD_NOTE_BASE = 36
TRANSPORT_NOTE_BASE = 60
GROUP_CC_BASE = 20
ENCODER_CC_BASE = 1
MASTER_CC_BASE = 9
LED_STATE_CODES = {
    "off": 0,
    "dim": 1,
    "bright": 2,
    "pulsing": 3,
}
TOP_LEVEL_MENU_ITEMS = ("Audio Grid", "Stats", "---", "---", "---")
BACKEND_MESSAGE_QUEUE_LIMIT = 256


def _utcnow_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _clamp(value: int, lower: int, upper: int) -> int:
    return max(lower, min(upper, value))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _best_effort_set_scheduler(priority: int | None = None) -> None:
    if os.name != "posix" or not hasattr(os, "sched_setscheduler"):
        return
    try:
        if priority is None:
            os.sched_setscheduler(0, os.SCHED_OTHER, os.sched_param(0))
            return
        os.sched_setscheduler(0, os.SCHED_FIFO, os.sched_param(int(priority)))
    except Exception as exc:  # pragma: no cover - depends on host privileges
        LOGGER.debug("Scheduler change skipped: %s", exc)


def _midi_note_message(channel: int, note: int, velocity: int, *, note_on: bool) -> bytes:
    status = 0x90 if note_on else 0x80
    return bytes([(status | ((channel - 1) & 0x0F)), note & 0x7F, velocity & 0x7F])


def _midi_cc_message(channel: int, control: int, value: int) -> bytes:
    return bytes([(0xB0 | ((channel - 1) & 0x0F)), control & 0x7F, value & 0x7F])


def _json_dumps(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _normalize_backend_url(url: str) -> str:
    normalized = str(url or DEFAULT_BACKEND_URL).strip() or DEFAULT_BACKEND_URL
    return normalized.rstrip("/")


def _load_runtime_transport_overrides() -> tuple[str | None, bool | None]:
    try:
        from app.config import get_config as get_runtime_config_manager

        runtime_config = get_runtime_config_manager()
        runtime_config.reload()
        preference = str(runtime_config.get("maschine.transport_preference", "") or "").strip().lower()
        if preference in {"pyusb", "usb", "bulk"}:
            preference = "pyusb-bulk"
        if preference not in {"auto", "hidapi", "pyusb-bulk"}:
            preference = ""
        allow_kernel_detach = runtime_config.get("maschine.allow_kernel_detach", None)
        allow_value = None if allow_kernel_detach is None else bool(allow_kernel_detach)
        return (preference or None), allow_value
    except Exception:
        return None, None


def _build_ws_url(base_url: str, path: str) -> str:
    parsed = urlparse(base_url)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    normalized_path = path if path.startswith("/") else f"/{path}"
    return f"{scheme}://{parsed.netloc}{normalized_path}"


@dataclass
class DaemonConfig:
    backend_url: str = DEFAULT_BACKEND_URL
    vendor_id: int = MASCHINE_VENDOR_ID
    product_id: int = MASCHINE_PRODUCT_ID
    virtual_port_name: str = MASCHINE_VIRTUAL_PORT_NAME
    hid_poll_interval_seconds: float = HID_POLL_INTERVAL_SECONDS
    display_poll_interval_seconds: float = DISPLAY_POLL_INTERVAL_SECONDS
    heartbeat_interval_seconds: float = HEARTBEAT_INTERVAL_SECONDS
    display_refresh_interval_seconds: float = 1.0 / DISPLAY_FPS
    reconnect_backoff_min_seconds: float = RECONNECT_BACKOFF_MIN_SECONDS
    reconnect_backoff_max_seconds: float = RECONNECT_BACKOFF_MAX_SECONDS
    transport_preference: str = "auto"
    allow_kernel_detach: bool = False

    @classmethod
    def from_env(cls) -> "DaemonConfig":
        runtime_preference, runtime_allow_kernel_detach = _load_runtime_transport_overrides()
        env_transport_preference = str(os.getenv("MAP2_MASCHINE_TRANSPORT", "")).strip().lower()
        if env_transport_preference in {"pyusb", "usb", "bulk"}:
            env_transport_preference = "pyusb-bulk"
        resolved_transport_preference = env_transport_preference or runtime_preference or "auto"
        env_allow_kernel_detach = os.getenv("MAP2_MASCHINE_ALLOW_KERNEL_DETACH")
        resolved_allow_kernel_detach = (
            str(env_allow_kernel_detach).strip().lower() in {"1", "true", "yes", "on"}
            if env_allow_kernel_detach is not None
            else bool(runtime_allow_kernel_detach)
        )
        return cls(
            backend_url=_normalize_backend_url(os.getenv("MAP2_BACKEND_URL", DEFAULT_BACKEND_URL)),
            transport_preference=resolved_transport_preference,
            allow_kernel_detach=resolved_allow_kernel_detach,
        )


@dataclass
class DecodedHidEvent:
    report_id: int
    decoded_type: str
    payload: dict[str, Any]
    raw: bytes
    midi_messages: tuple[bytes, ...] = field(default_factory=tuple)

    def to_backend_message(self) -> dict[str, Any]:
        return {
            "type": "hid_event",
            "payload": {
                "timestamp": _utcnow_iso(),
                "direction": "in",
                "report_id": self.report_id,
                "decoded_type": self.decoded_type,
                "raw_hex": self.raw.hex().upper(),
                "midi_hex": [message.hex().upper() for message in self.midi_messages],
                **self.payload,
            },
        }


@dataclass
class LastTouchedControl:
    label: str
    display_value: str
    midi_value: int
    min_label: str = "0"
    max_label: str = "127"


@dataclass
class SharedRuntimeState:
    backend_connected: bool = False
    reconnecting: bool = True
    hid_connected: bool = False
    hid_device: dict[str, Any] = field(default_factory=dict)
    transport: dict[str, Any] = field(default_factory=dict)
    transport_candidates: list[dict[str, Any]] = field(default_factory=list)
    display_context: str = "audio_grid"
    top_level_menu_index: int = 0
    stats_metric_keys: list[str] = field(default_factory=list)
    stats_focus_metric: str | None = None
    audio_grid: dict[str, Any] = field(
        default_factory=lambda: {
            "blocks": [],
            "selected_block_id": None,
            "page_index": 0,
            "updated_at": None,
            "snapshot_id": None,
            "snapshot_name": None,
        }
    )
    encoder_map: dict[str, Any] = field(default_factory=default_maschine_encoder_map)
    led_state: dict[str, Any] = field(default_factory=lambda: {"pads": [], "updated_at": None})
    lcd_frames: dict[str, Any] = field(
        default_factory=lambda: {
            "left": {"width": LCD_WIDTH, "height": LCD_HEIGHT, "format": "xbm", "data": ""},
            "right": {"width": LCD_WIDTH, "height": LCD_HEIGHT, "format": "xbm", "data": ""},
        }
    )
    last_touched_control: LastTouchedControl | None = None
    stats_payload: dict[str, Any] = field(default_factory=dict)


class VirtualMidiOutput:
    def __init__(self, name: str) -> None:
        self.name = name
        self._port = None
        self._is_open = False

    def open(self) -> bool:
        if rtmidi is None:
            LOGGER.warning("python-rtmidi not installed; Maschine daemon running without virtual MIDI output")
            return False
        try:
            self._port = rtmidi.MidiOut()
            self._port.open_virtual_port(self.name)
            self._is_open = True
            LOGGER.info("Opened virtual MIDI port %s", self.name)
            return True
        except Exception as exc:  # pragma: no cover - hardware runtime dependent
            LOGGER.warning("Failed to open virtual MIDI port %s: %s", self.name, exc)
            self._port = None
            self._is_open = False
            return False

    def send_messages(self, messages: Iterable[bytes]) -> None:
        if not self._is_open or self._port is None:
            return
        for message in messages:
            try:
                self._port.send_message(list(message))
            except Exception as exc:  # pragma: no cover - hardware runtime dependent
                LOGGER.debug("Failed to send MIDI message on %s: %s", self.name, exc)

    def close(self) -> None:
        if self._port is not None:
            try:
                self._port.close_port()
            except Exception:
                pass
        self._port = None
        self._is_open = False


class HidDeviceController:
    def __init__(self, *, vendor_id: int, product_id: int) -> None:
        self.vendor_id = vendor_id
        self.product_id = product_id
        self._device = None
        self._lock = threading.Lock()

    @property
    def connected(self) -> bool:
        return self._device is not None

    def connect(self) -> tuple[bool, dict[str, Any]]:
        if hid is None:
            return False, {
                "vendor_id": f"{self.vendor_id:04x}",
                "product_id": f"{self.product_id:04x}",
                "error": "python-hid unavailable",
            }

        try:
            device = hid.device()
            device.open(self.vendor_id, self.product_id)
            try:
                device.set_nonblocking(True)
            except Exception:
                pass
            with self._lock:
                self._device = device
            info = {
                "vendor_id": f"{self.vendor_id:04x}",
                "product_id": f"{self.product_id:04x}",
                "manufacturer": self._read_string(device, "get_manufacturer_string"),
                "product": self._read_string(device, "get_product_string"),
                "serial_number": self._read_string(device, "get_serial_number_string"),
            }
            return True, info
        except Exception as exc:  # pragma: no cover - hardware runtime dependent
            self.disconnect()
            return False, {
                "vendor_id": f"{self.vendor_id:04x}",
                "product_id": f"{self.product_id:04x}",
                "error": str(exc),
            }

    def disconnect(self) -> None:
        with self._lock:
            device = self._device
            self._device = None
        if device is None:
            return
        try:
            device.close()
        except Exception:
            pass

    def read_report(self, *, max_length: int = 64, timeout_ms: int = 2) -> bytes | None:
        with self._lock:
            device = self._device
        if device is None:
            return None
        try:
            try:
                raw = device.read(max_length, timeout_ms)
            except TypeError:
                raw = device.read(max_length)
        except Exception as exc:  # pragma: no cover - hardware runtime dependent
            LOGGER.warning("Maschine HID read failed: %s", exc)
            self.disconnect()
            return None
        if not raw:
            return None
        return bytes(raw)

    def write_reports(self, reports: Iterable[bytes]) -> bool:
        with self._lock:
            device = self._device
        if device is None:
            return False
        try:
            for report in reports:
                payload = bytes(report)
                if not payload:
                    continue
                device.write(payload)
            return True
        except Exception as exc:  # pragma: no cover - hardware runtime dependent
            LOGGER.debug("Maschine HID write failed: %s", exc)
            self.disconnect()
            return False

    @staticmethod
    def _read_string(device: Any, method_name: str) -> str | None:
        method = getattr(device, method_name, None)
        if method is None:
            return None
        try:
            value = method()
        except Exception:
            return None
        return str(value) if value is not None else None


def decode_hid_report(report: bytes) -> DecodedHidEvent | None:
    raw = bytes(report)
    if not raw:
        return None

    report_id = raw[0]

    if report_id == 0x01 and len(raw) >= 4:
        pad_index = _clamp(int(raw[1]), 0, 15)
        velocity = _clamp(int(raw[2]), 0, 127)
        pressed = bool(raw[3])
        return DecodedHidEvent(
            report_id=report_id,
            decoded_type="pad_press" if pressed else "pad_release",
            payload={
                "pad_index": pad_index,
                "velocity": velocity,
                "pressed": pressed,
                "channel": 1,
                "note": PAD_NOTE_BASE + pad_index,
            },
            raw=raw,
            midi_messages=(
                _midi_note_message(1, PAD_NOTE_BASE + pad_index, velocity if pressed else 0, note_on=pressed),
            ),
        )

    if 0x10 <= report_id <= 0x1F:
        pad_index = report_id - 0x10
        velocity = _clamp(int(raw[1]) if len(raw) > 1 else 127, 0, 127)
        pressed = bool(raw[2]) if len(raw) > 2 else velocity > 0
        return DecodedHidEvent(
            report_id=report_id,
            decoded_type="pad_press" if pressed else "pad_release",
            payload={
                "pad_index": pad_index,
                "velocity": velocity,
                "pressed": pressed,
                "channel": 1,
                "note": PAD_NOTE_BASE + pad_index,
            },
            raw=raw,
            midi_messages=(
                _midi_note_message(1, PAD_NOTE_BASE + pad_index, velocity if pressed else 0, note_on=pressed),
            ),
        )

    if report_id == 0x02 and len(raw) >= 3:
        control_index = _clamp(int(raw[1]), 0, 10)
        value = _clamp(int(raw[2]), 0, 127)
        control = ENCODER_CC_BASE + control_index if control_index < 8 else MASTER_CC_BASE + (control_index - 8)
        control_type = "encoder" if control_index < 8 else "master_knob"
        return DecodedHidEvent(
            report_id=report_id,
            decoded_type=control_type,
            payload={
                "control_index": control_index,
                "control": control,
                "value": value,
                "channel": 1,
            },
            raw=raw,
            midi_messages=(_midi_cc_message(1, control, value),),
        )

    if 0x20 <= report_id <= 0x2A:
        control_index = report_id - 0x20
        value = _clamp(int(raw[1]) if len(raw) > 1 else 0, 0, 127)
        control = ENCODER_CC_BASE + control_index if control_index < 8 else MASTER_CC_BASE + (control_index - 8)
        control_type = "encoder" if control_index < 8 else "master_knob"
        return DecodedHidEvent(
            report_id=report_id,
            decoded_type=control_type,
            payload={
                "control_index": control_index,
                "control": control,
                "value": value,
                "channel": 1,
            },
            raw=raw,
            midi_messages=(_midi_cc_message(1, control, value),),
        )

    if report_id == 0x03 and len(raw) >= 3:
        button_index = _clamp(int(raw[1]), 0, 4)
        pressed = bool(raw[2])
        action = ("play", "stop", "record", "restart", "erase")[button_index]
        note = TRANSPORT_NOTE_BASE + button_index
        return DecodedHidEvent(
            report_id=report_id,
            decoded_type="transport_press" if pressed else "transport_release",
            payload={
                "button_index": button_index,
                "transport_action": action,
                "pressed": pressed,
                "channel": 2,
                "note": note,
            },
            raw=raw,
            midi_messages=(_midi_note_message(2, note, 127 if pressed else 0, note_on=pressed),),
        )

    if 0x30 <= report_id <= 0x34:
        button_index = report_id - 0x30
        pressed = bool(raw[1]) if len(raw) > 1 else True
        action = ("play", "stop", "record", "restart", "erase")[button_index]
        note = TRANSPORT_NOTE_BASE + button_index
        return DecodedHidEvent(
            report_id=report_id,
            decoded_type="transport_press" if pressed else "transport_release",
            payload={
                "button_index": button_index,
                "transport_action": action,
                "pressed": pressed,
                "channel": 2,
                "note": note,
            },
            raw=raw,
            midi_messages=(_midi_note_message(2, note, 127 if pressed else 0, note_on=pressed),),
        )

    if report_id == 0x04 and len(raw) >= 3:
        group_index = _clamp(int(raw[1]), 0, 7)
        pressed = bool(raw[2])
        control = GROUP_CC_BASE + group_index
        return DecodedHidEvent(
            report_id=report_id,
            decoded_type="group_press" if pressed else "group_release",
            payload={
                "group_index": group_index,
                "pressed": pressed,
                "channel": 1,
                "control": control,
            },
            raw=raw,
            midi_messages=(_midi_cc_message(1, control, 127 if pressed else 0),),
        )

    if 0x40 <= report_id <= 0x47:
        group_index = report_id - 0x40
        pressed = bool(raw[1]) if len(raw) > 1 else True
        control = GROUP_CC_BASE + group_index
        return DecodedHidEvent(
            report_id=report_id,
            decoded_type="group_press" if pressed else "group_release",
            payload={
                "group_index": group_index,
                "pressed": pressed,
                "channel": 1,
                "control": control,
            },
            raw=raw,
            midi_messages=(_midi_cc_message(1, control, 127 if pressed else 0),),
        )

    if report_id == 0x05 and len(raw) >= 4:
        control_index = _clamp(int(raw[1]), 0, 7)
        pressed = bool(raw[2])
        long_press = bool(raw[3])
        return DecodedHidEvent(
            report_id=report_id,
            decoded_type="encoder_push_long" if pressed and long_press else ("encoder_push" if pressed else "encoder_release"),
            payload={
                "control_index": control_index,
                "pressed": pressed,
                "long_press": long_press,
            },
            raw=raw,
        )

    return DecodedHidEvent(
        report_id=report_id,
        decoded_type="unknown",
        payload={"length": len(raw)},
        raw=raw,
    )


def build_led_output_report(led_state: dict[str, Any]) -> bytes:
    pads = list(led_state.get("pads") or [])
    payload = bytearray([0x80])
    for index in range(16):
        pad = pads[index] if index < len(pads) and isinstance(pads[index], dict) else {}
        code = LED_STATE_CODES.get(str(pad.get("state") or "off"), 0)
        payload.append(code & 0xFF)
    return bytes(payload)


def build_lcd_output_reports(side: str, bitmap: dict[str, Any]) -> list[bytes]:
    side_id = 0 if side == "left" else 1
    raw_data = str(bitmap.get("data") or "")
    format_name = str(bitmap.get("format") or "xbm").lower()
    try:
        payload = bytes.fromhex(raw_data) if format_name == "xbm" else raw_data.encode("ascii", "replace")
    except ValueError:
        payload = raw_data.encode("ascii", "replace")
    if not payload:
        payload = b"\x00"
    chunk_size = 56
    total_chunks = max(1, (len(payload) + chunk_size - 1) // chunk_size)
    reports: list[bytes] = []
    report_id = 0x81 if side_id == 0 else 0x82
    for chunk_index in range(total_chunks):
        chunk = payload[chunk_index * chunk_size:(chunk_index + 1) * chunk_size]
        header = bytes([report_id, chunk_index & 0xFF, total_chunks & 0xFF, len(chunk) & 0xFF])
        reports.append(header + chunk)
    return reports


def build_reconnecting_frames(title: str = "RECONNECTING") -> dict[str, dict[str, Any]]:
    left = _Canvas()
    left.draw_text(_safe_label(title, limit=12), 8, 8, scale=2)
    left.draw_hline(4, 28, LCD_WIDTH - 8)
    left.draw_text("BACKEND OR HID", 8, 36)
    left.draw_text("RECOVERING...", 8, 48)

    right = _Canvas()
    right.draw_text("MAP2", 24, 8, scale=2)
    right.draw_hline(4, 28, LCD_WIDTH - 8)
    right.draw_text("LCD", 16, 38, scale=2)
    right.draw_text("WAIT", 66, 38, scale=2)

    return {
        "left": {
            "width": LCD_WIDTH,
            "height": LCD_HEIGHT,
            "format": "xbm",
            "data": left.to_xbm_hex(),
        },
        "right": {
            "width": LCD_WIDTH,
            "height": LCD_HEIGHT,
            "format": "xbm",
            "data": right.to_xbm_hex(),
        },
    }


def build_last_touched_bitmap(control: LastTouchedControl) -> dict[str, Any]:
    canvas = _Canvas()
    canvas.draw_text(_safe_label(control.label, limit=16), 4, 4)
    canvas.draw_hline(4, 14, LCD_WIDTH - 8)
    canvas.draw_text(_safe_label(control.display_value, limit=8), 8, 20, scale=3)
    progress_width = 4 + int((_clamp(control.midi_value, 0, 127) / 127.0) * (LCD_WIDTH - 12))
    canvas.fill_rect(4, 46, progress_width, 5)
    canvas.draw_text(_safe_label(control.min_label, limit=5), 4, 56)
    canvas.draw_text(_safe_label(control.max_label, limit=5), 92, 56)
    return {
        "width": LCD_WIDTH,
        "height": LCD_HEIGHT,
        "format": "xbm",
        "data": canvas.to_xbm_hex(),
    }


class MaschineMK1Daemon:
    def __init__(self, config: DaemonConfig) -> None:
        self.config = config
        self._stop_event = threading.Event()
        self._render_requested = threading.Event()
        self._state_lock = threading.Lock()
        self._state = SharedRuntimeState()
        self._state.lcd_frames = build_reconnecting_frames()
        self._transport = MaschineTransportController(
            vendor_id=config.vendor_id,
            product_id=config.product_id,
            preference=config.transport_preference,
            allow_kernel_detach=config.allow_kernel_detach,
        )
        initial_transport = self._transport.runtime_info()
        self._state.transport = dict(initial_transport)
        self._state.transport_candidates = [
            dict(candidate) for candidate in initial_transport.get("candidates", []) if isinstance(candidate, dict)
        ]
        self._state.hid_device = self._runtime_hid_device(initial_transport)
        self._midi = VirtualMidiOutput(config.virtual_port_name)
        self._outbound_messages: "queue.Queue[dict[str, Any]]" = queue.Queue(maxsize=BACKEND_MESSAGE_QUEUE_LIMIT)
        self._hid_thread = threading.Thread(target=self._hid_read_loop, name="maschine-hid", daemon=True)
        self._display_thread = threading.Thread(target=self._display_loop, name="maschine-display", daemon=True)
        self._led_thread = threading.Thread(target=self._led_feedback_loop, name="maschine-led", daemon=True)

    def run(self) -> int:
        LOGGER.info("Starting Maschine MK1 daemon")
        self._midi.open()
        self._hid_thread.start()
        self._display_thread.start()
        self._led_thread.start()

        try:
            while not self._stop_event.is_set():
                time.sleep(0.25)
        except KeyboardInterrupt:
            LOGGER.info("Keyboard interrupt received; stopping Maschine daemon")
        finally:
            self.stop()
        return 0

    def stop(self) -> None:
        if self._stop_event.is_set():
            return
        self._stop_event.set()
        self._render_requested.set()
        self._transport.disconnect()
        self._midi.close()
        for thread in (self._hid_thread, self._display_thread, self._led_thread):
            if thread.is_alive():
                thread.join(timeout=2.0)

    def _hid_read_loop(self) -> None:
        _best_effort_set_scheduler(55)
        client = httpx.Client(base_url=self.config.backend_url, timeout=2.5)
        pad_press_started: dict[int, float] = {}
        last_encoder_values: dict[int, int] = {}
        held_groups: set[int] = set()
        reconnect_sleep_seconds = self.config.reconnect_backoff_min_seconds

        try:
            while not self._stop_event.is_set():
                self._refresh_transport_controller_from_runtime()
                if not self._transport.connected:
                    connected, transport_info = self._transport.connect()
                    self._set_transport_state(connected=connected, transport_info=transport_info)
                    if not connected:
                        self._set_reconnecting(True)
                        time.sleep(reconnect_sleep_seconds)
                        reconnect_sleep_seconds = min(
                            reconnect_sleep_seconds * 2.0,
                            self.config.reconnect_backoff_max_seconds,
                        )
                        continue
                    reconnect_sleep_seconds = self.config.reconnect_backoff_min_seconds
                    self._request_render()

                report = self._transport.read_report(timeout_ms=max(1, int(self.config.hid_poll_interval_seconds * 1000)))
                if report is None:
                    time.sleep(self.config.hid_poll_interval_seconds)
                    continue

                event = decode_hid_report(report)
                if event is None:
                    continue

                self._midi.send_messages(event.midi_messages)
                self._enqueue_backend_message(event.to_backend_message())

                payload = event.payload
                decoded_type = event.decoded_type

                if decoded_type == "pad_press":
                    pad_index = int(payload.get("pad_index", 0))
                    pad_press_started[pad_index] = time.monotonic()
                    self._select_block_for_pad(client, pad_index)
                elif decoded_type == "pad_release":
                    pad_index = int(payload.get("pad_index", 0))
                    started_at = pad_press_started.pop(pad_index, None)
                    if started_at is not None and (time.monotonic() - started_at) >= 0.5:
                        self._toggle_block_bypass_for_pad(client, pad_index)
                elif decoded_type == "transport_press" and bool(payload.get("pressed", False)):
                    self._dispatch_transport_action(client, str(payload.get("transport_action") or ""))
                elif decoded_type == "group_press" and bool(payload.get("pressed", False)):
                    held_groups.add(int(payload.get("group_index", 0)))
                elif decoded_type == "group_release":
                    held_groups.discard(int(payload.get("group_index", 0)))
                elif decoded_type in {"encoder", "master_knob"}:
                    control_index = int(payload.get("control_index", 0))
                    current_value = int(payload.get("value", 0))
                    previous_value = last_encoder_values.get(control_index)
                    last_encoder_values[control_index] = current_value
                    delta = self._resolve_encoder_delta(previous_value, current_value)
                    if control_index == 0:
                        self._handle_navigation_encoder(client, delta)
                    else:
                        if 0 in held_groups and 1 <= control_index <= 7:
                            self._assign_encoder_for_selected_block(client, encoder_slot=control_index + 1)
                        self._record_last_touched_control(control_index=control_index, midi_value=current_value)
                elif decoded_type == "encoder_push" and bool(payload.get("pressed", False)):
                    control_index = int(payload.get("control_index", 0))
                    if control_index == 0:
                        self._toggle_display_context()
                elif decoded_type == "encoder_push_long" and bool(payload.get("pressed", False)):
                    control_index = int(payload.get("control_index", 0))
                    if control_index == 0:
                        self._set_display_context("audio_grid")

        finally:
            client.close()
            self._transport.disconnect()
            self._set_transport_state(connected=False, transport_info=self._snapshot_transport_info())

    def _display_loop(self) -> None:
        _best_effort_set_scheduler(None)
        renderer = MaschineLCDRenderService()
        client = httpx.Client(base_url=self.config.backend_url, timeout=3.5)
        backoff_seconds = self.config.reconnect_backoff_min_seconds
        last_led_hash = ""
        last_lcd_hash = {"left": "", "right": ""}

        try:
            while not self._stop_event.is_set():
                websocket_url = "/api/maschine/ws"
                register_payload = self._registration_payload(status="reconnecting")
                try:
                    response = client.post("/api/maschine/register", json=register_payload)
                    response.raise_for_status()
                    payload = response.json()
                    websocket_url = str(payload.get("websocket_url") or websocket_url)
                except Exception as exc:
                    LOGGER.debug("Maschine register request failed: %s", exc)

                try:
                    with ws_connect(_build_ws_url(self.config.backend_url, websocket_url), ping_interval=30, open_timeout=5, close_timeout=1) as websocket:
                        LOGGER.info("Maschine backend websocket connected")
                        backoff_seconds = self.config.reconnect_backoff_min_seconds
                        self._set_backend_connected(True)
                        self._set_reconnecting(not self._snapshot_transport_connected())
                        self._send_json(websocket, {"type": "request_state", "payload": {}})
                        next_heartbeat = 0.0
                        next_poll = 0.0

                        while not self._stop_event.is_set():
                            now = time.monotonic()
                            if now >= next_heartbeat:
                                self._register_heartbeat(client)
                                next_heartbeat = now + self.config.heartbeat_interval_seconds

                            if now >= next_poll or self._render_requested.is_set():
                                self._render_requested.clear()
                                led_hash, lcd_hash = self._poll_and_render(renderer, client, websocket)
                                if led_hash:
                                    last_led_hash = led_hash
                                if lcd_hash:
                                    last_lcd_hash = lcd_hash
                                next_poll = now + self.config.display_poll_interval_seconds

                            self._flush_outbound_messages(websocket)

                            try:
                                raw_message = websocket.recv(timeout=0.1)
                            except TimeoutError:
                                continue

                            if not raw_message:
                                continue

                            try:
                                message = json.loads(raw_message)
                            except json.JSONDecodeError:
                                continue
                            self._handle_backend_message(message)

                except Exception as exc:
                    LOGGER.warning("Maschine backend websocket disconnected: %s", exc)
                    self._set_backend_connected(False)
                    self._set_reconnecting(True)
                    reconnect_frames = build_reconnecting_frames()
                    self._set_output_state(
                        lcd_frames=reconnect_frames,
                        led_state={"pads": [], "updated_at": _utcnow_iso()},
                    )
                    last_led_hash = ""
                    last_lcd_hash = {"left": "", "right": ""}
                    if self._stop_event.wait(backoff_seconds):
                        break
                    backoff_seconds = min(backoff_seconds * 2.0, self.config.reconnect_backoff_max_seconds)
        finally:
            client.close()
            self._set_backend_connected(False)

    def _led_feedback_loop(self) -> None:
        _best_effort_set_scheduler(None)
        last_led_hash = ""
        last_left_hash = ""
        last_right_hash = ""

        while not self._stop_event.is_set():
            if not self._transport.connected:
                time.sleep(self.config.display_refresh_interval_seconds)
                continue

            output_state = self._snapshot_output_state()
            led_state = output_state["led_state"]
            lcd_frames = output_state["lcd_frames"]
            led_hash = _json_dumps(led_state)
            left_hash = _json_dumps(lcd_frames.get("left"))
            right_hash = _json_dumps(lcd_frames.get("right"))

            reports: list[bytes] = []
            if led_hash != last_led_hash:
                reports.append(build_led_output_report(led_state))
                last_led_hash = led_hash
            if left_hash != last_left_hash:
                reports.extend(build_lcd_output_reports("left", dict(lcd_frames.get("left") or {})))
                last_left_hash = left_hash
            if right_hash != last_right_hash:
                reports.extend(build_lcd_output_reports("right", dict(lcd_frames.get("right") or {})))
                last_right_hash = right_hash

            if reports:
                self._transport.write_reports(reports)

            time.sleep(self.config.display_refresh_interval_seconds)

    def _registration_payload(self, *, status: str) -> dict[str, Any]:
        hid_device = self._snapshot_hid_device()
        transport = self._snapshot_transport_info()
        return {
            "daemon_version": "1.0.0",
            "virtual_port_name": self.config.virtual_port_name,
            "hid_device": hid_device,
            "transport": transport,
            "transport_candidates": [
                dict(candidate) for candidate in transport.get("candidates", []) if isinstance(candidate, dict)
            ],
            "firmware_info": {},
            "capabilities": {
                "protocol_version": "open-maschine-v1",
                "transport_preference": self.config.transport_preference,
                "hidapi_available": bool(any(
                    str(candidate.get("transport_id") or "") == "hidapi" and candidate.get("module_available")
                    for candidate in transport.get("candidates", [])
                    if isinstance(candidate, dict)
                )),
                "pyusb_available": bool(any(
                    str(candidate.get("transport_id") or "") == "pyusb-bulk" and candidate.get("module_available")
                    for candidate in transport.get("candidates", [])
                    if isinstance(candidate, dict)
                )),
                "rtmidi_available": rtmidi is not None,
                "pads": 16,
                "encoders": 8,
                "master_knobs": 3,
                "lcd": {
                    "left": {"width": LCD_WIDTH, "height": LCD_HEIGHT},
                    "right": {"width": LCD_WIDTH, "height": LCD_HEIGHT},
                },
            },
            "status": status,
        }

    def _register_heartbeat(self, client: httpx.Client) -> None:
        status = "connected" if self._snapshot_transport_connected() else "reconnecting"
        payload = self._registration_payload(status=status)
        try:
            response = client.post("/api/maschine/register", json=payload)
            response.raise_for_status()
        except Exception as exc:
            LOGGER.debug("Maschine heartbeat failed: %s", exc)

    def _poll_and_render(
        self,
        renderer: MaschineLCDRenderService,
        client: httpx.Client,
        websocket: ClientConnection,
    ) -> tuple[str | None, dict[str, str] | None]:
        audio_grid = self._poll_audio_grid(client)
        encoder_map = self._poll_encoder_map(client)
        stats_payload = self._poll_stats_payload(renderer, client)
        self._update_polled_state(audio_grid=audio_grid, encoder_map=encoder_map, stats_payload=stats_payload)

        with self._state_lock:
            reconnecting = self._state.reconnecting
            display_context = self._state.display_context
            focus_metric = self._state.stats_focus_metric
            led_state = dict(self._state.led_state)
            lcd_frames = dict(self._state.lcd_frames)
            last_touched = self._state.last_touched_control
            current_audio_grid = dict(self._state.audio_grid)
            current_stats = dict(self._state.stats_payload)

        if reconnecting:
            frames = build_reconnecting_frames()
        elif display_context == "stats":
            rendered = renderer._render_stats(stats=current_stats, focus_metric=focus_metric)
            frames = {"left": rendered["left"], "right": rendered["right"]}
        else:
            rendered_audio_grid = self._audio_grid_with_last_touched(current_audio_grid, last_touched)
            rendered = renderer._render_audio_grid(audio_grid=rendered_audio_grid)
            right = build_last_touched_bitmap(last_touched) if last_touched else rendered["right"]
            frames = {"left": rendered["left"], "right": right}

        self._set_output_state(lcd_frames=frames, led_state=led_state)

        led_hash = _json_dumps(led_state)
        lcd_hash = {
            "left": _json_dumps(frames["left"]),
            "right": _json_dumps(frames["right"]),
        }

        self._send_json(websocket, {"type": "lcd", "payload": {"side": "left", "bitmap": frames["left"]}})
        self._send_json(websocket, {"type": "lcd", "payload": {"side": "right", "bitmap": frames["right"]}})
        self._send_json(websocket, {"type": "led_state", "payload": {"pads": list(led_state.get("pads") or [])}})
        return led_hash, lcd_hash

    def _poll_audio_grid(self, client: httpx.Client) -> dict[str, Any]:
        try:
            response = client.get("/api/maschine/audio-grid")
            response.raise_for_status()
            payload = response.json()
            return dict(payload.get("audio_grid") or {})
        except Exception as exc:
            LOGGER.debug("Audio grid poll failed: %s", exc)
            return {}

    def _poll_encoder_map(self, client: httpx.Client) -> dict[str, Any]:
        try:
            response = client.get("/api/maschine/encoder-map")
            response.raise_for_status()
            payload = response.json()
            return dict(payload.get("encoder_map") or {})
        except Exception as exc:
            LOGGER.debug("Encoder map poll failed: %s", exc)
            return {}

    def _poll_stats_payload(self, renderer: MaschineLCDRenderService, client: httpx.Client) -> dict[str, Any]:
        payloads: dict[str, Any] = {}
        for label, path in (
            ("health", "/api/health"),
            ("audio", "/api/audio/status"),
            ("midi_hub", "/api/midi/hub/status"),
        ):
            try:
                response = client.get(path)
                response.raise_for_status()
                payloads[label] = response.json()
            except Exception as exc:
                LOGGER.debug("Stats poll failed for %s: %s", path, exc)
                payloads[label] = {}

        metrics = renderer._extract_numeric_metrics(payloads)
        metric_entries = [
            {
                "key": key,
                "value": value,
                "label": _safe_label(key.replace(".", " "), limit=20),
                "source": key.split(".", 1)[0].upper(),
            }
            for key, value in sorted(metrics.items())
        ]
        return {
            "sources": payloads,
            "metrics": metric_entries,
            "metric_count": len(metric_entries),
            "updated_at": _utcnow_iso(),
        }

    def _update_polled_state(
        self,
        *,
        audio_grid: dict[str, Any],
        encoder_map: dict[str, Any],
        stats_payload: dict[str, Any],
    ) -> None:
        with self._state_lock:
            if audio_grid:
                self._state.audio_grid = audio_grid
                self._state.led_state = MaschineService._led_state_from_blocks(
                    list(audio_grid.get("blocks") or []),
                    selected_block_id=str(audio_grid.get("selected_block_id") or ""),
                )
            if encoder_map:
                self._state.encoder_map = encoder_map
            if stats_payload:
                self._state.stats_payload = stats_payload
                metric_keys = [str(metric.get("key")) for metric in stats_payload.get("metrics", []) if isinstance(metric, dict)]
                self._state.stats_metric_keys = metric_keys
                if metric_keys and self._state.stats_focus_metric not in metric_keys:
                    self._state.stats_focus_metric = metric_keys[0]

    def _handle_backend_message(self, message: dict[str, Any]) -> None:
        message_type = str(message.get("type") or "")
        data = dict(message.get("data") or {})
        if message_type == "maschine:welcome":
            with self._state_lock:
                if isinstance(data.get("encoder_map"), dict):
                    self._state.encoder_map = dict(data["encoder_map"])
                if isinstance(data.get("audio_grid"), dict):
                    self._state.audio_grid = dict(data["audio_grid"])
                if isinstance(data.get("state"), dict):
                    state = dict(data["state"])
                    if isinstance(state.get("audio_grid"), dict):
                        self._state.audio_grid = dict(state["audio_grid"])
                    if isinstance(state.get("lcd"), dict):
                        self._state.lcd_frames = dict(state["lcd"])
                    if isinstance(state.get("led_state"), dict):
                        self._state.led_state = dict(state["led_state"])
            self._request_render()
            return

        if message_type == "maschine:status":
            with self._state_lock:
                if isinstance(data.get("audio_grid"), dict):
                    self._state.audio_grid = dict(data["audio_grid"])
                if isinstance(data.get("lcd"), dict):
                    self._state.lcd_frames = dict(data["lcd"])
                if isinstance(data.get("led_state"), dict):
                    self._state.led_state = dict(data["led_state"])
            self._request_render()

    def _flush_outbound_messages(self, websocket: ClientConnection) -> None:
        while not self._stop_event.is_set():
            try:
                payload = self._outbound_messages.get_nowait()
            except queue.Empty:
                return
            self._send_json(websocket, payload)

    @staticmethod
    def _send_json(websocket: ClientConnection, payload: dict[str, Any]) -> None:
        websocket.send(json.dumps(payload))

    def _enqueue_backend_message(self, payload: dict[str, Any]) -> None:
        try:
            self._outbound_messages.put_nowait(payload)
        except queue.Full:
            try:
                self._outbound_messages.get_nowait()
            except queue.Empty:
                pass
            try:
                self._outbound_messages.put_nowait(payload)
            except queue.Full:
                LOGGER.debug("Dropping outbound Maschine websocket payload after queue saturation")

    def _set_transport_state(self, *, connected: bool, transport_info: dict[str, Any]) -> None:
        with self._state_lock:
            self._state.hid_connected = connected
            self._state.transport = dict(transport_info)
            self._state.transport_candidates = [
                dict(candidate) for candidate in transport_info.get("candidates", []) if isinstance(candidate, dict)
            ]
            self._state.hid_device = self._runtime_hid_device(transport_info)
        self._request_render()

    def _refresh_transport_controller_from_runtime(self) -> None:
        runtime_preference, runtime_allow_kernel_detach = _load_runtime_transport_overrides()
        env_transport_preference = str(os.getenv("MAP2_MASCHINE_TRANSPORT", "")).strip().lower()
        if env_transport_preference in {"pyusb", "usb", "bulk"}:
            env_transport_preference = "pyusb-bulk"
        desired_preference = env_transport_preference or runtime_preference or self.config.transport_preference or "auto"

        env_allow_kernel_detach = os.getenv("MAP2_MASCHINE_ALLOW_KERNEL_DETACH")
        desired_allow_kernel_detach = (
            str(env_allow_kernel_detach).strip().lower() in {"1", "true", "yes", "on"}
            if env_allow_kernel_detach is not None
            else (
                runtime_allow_kernel_detach
                if runtime_allow_kernel_detach is not None
                else self.config.allow_kernel_detach
            )
        )

        if (
            desired_preference == self.config.transport_preference
            and bool(desired_allow_kernel_detach) == bool(self.config.allow_kernel_detach)
        ):
            return
        if self._transport.connected:
            return
        self.config.transport_preference = str(desired_preference)
        self.config.allow_kernel_detach = bool(desired_allow_kernel_detach)
        self._transport = MaschineTransportController(
            vendor_id=self.config.vendor_id,
            product_id=self.config.product_id,
            preference=self.config.transport_preference,
            allow_kernel_detach=self.config.allow_kernel_detach,
        )
        self._set_transport_state(connected=False, transport_info=self._transport.runtime_info())

    def _set_backend_connected(self, connected: bool) -> None:
        with self._state_lock:
            self._state.backend_connected = bool(connected)
        self._request_render()

    def _set_reconnecting(self, reconnecting: bool) -> None:
        with self._state_lock:
            self._state.reconnecting = bool(reconnecting)
        self._request_render()

    def _set_display_context(self, context: str) -> None:
        with self._state_lock:
            self._state.display_context = "stats" if context == "stats" else "audio_grid"
            self._state.top_level_menu_index = 1 if self._state.display_context == "stats" else 0
        self._request_render()

    def _toggle_display_context(self) -> None:
        with self._state_lock:
            self._state.display_context = "stats" if self._state.display_context == "audio_grid" else "audio_grid"
            self._state.top_level_menu_index = 1 if self._state.display_context == "stats" else 0
        self._request_render()

    def _request_render(self) -> None:
        self._render_requested.set()

    def _snapshot_transport_connected(self) -> bool:
        with self._state_lock:
            return bool(self._state.hid_connected)

    def _snapshot_hid_device(self) -> dict[str, Any]:
        with self._state_lock:
            return dict(self._state.hid_device)

    def _snapshot_transport_info(self) -> dict[str, Any]:
        with self._state_lock:
            return {
                **dict(self._state.transport),
                "candidates": [dict(candidate) for candidate in self._state.transport_candidates],
            }

    @staticmethod
    def _runtime_hid_device(transport_info: dict[str, Any]) -> dict[str, Any]:
        selected = transport_info.get("selected_transport")
        if isinstance(selected, dict) and selected:
            payload = {
                "vendor_id": selected.get("vendor_id"),
                "product_id": selected.get("product_id"),
                "manufacturer": selected.get("manufacturer"),
                "product": selected.get("product"),
                "serial_number": selected.get("serial_number"),
                "busnum": selected.get("busnum"),
                "devnum": selected.get("devnum"),
                "speed": selected.get("speed"),
                "transport_id": selected.get("transport_id") or transport_info.get("transport_id"),
            }
            return {key: value for key, value in payload.items() if value not in {None, ""}}
        for candidate in transport_info.get("candidates", []):
            if not isinstance(candidate, dict):
                continue
            sysfs_probe = candidate.get("sysfs_probe")
            if not isinstance(sysfs_probe, dict):
                continue
            payload = {
                "vendor_id": sysfs_probe.get("vendor_id"),
                "product_id": sysfs_probe.get("product_id"),
                "manufacturer": sysfs_probe.get("manufacturer"),
                "product": sysfs_probe.get("product"),
                "serial_number": sysfs_probe.get("serial_number"),
                "busnum": sysfs_probe.get("busnum"),
                "devnum": sysfs_probe.get("devnum"),
                "speed": sysfs_probe.get("speed"),
                "transport_id": candidate.get("transport_id"),
            }
            return {key: value for key, value in payload.items() if value not in {None, ""}}
        return {}

    def _snapshot_output_state(self) -> dict[str, Any]:
        with self._state_lock:
            return {
                "led_state": dict(self._state.led_state),
                "lcd_frames": dict(self._state.lcd_frames),
            }

    def _set_output_state(self, *, lcd_frames: dict[str, Any], led_state: dict[str, Any]) -> None:
        with self._state_lock:
            self._state.lcd_frames = dict(lcd_frames)
            self._state.led_state = dict(led_state)

    @staticmethod
    def _resolve_encoder_delta(previous_value: int | None, current_value: int) -> int:
        if previous_value is None:
            return 0
        delta = current_value - previous_value
        if delta > 64:
            delta -= 128
        elif delta < -64:
            delta += 128
        return 1 if delta > 0 else (-1 if delta < 0 else 0)

    def _handle_navigation_encoder(self, client: httpx.Client, delta: int) -> None:
        if delta == 0:
            return
        with self._state_lock:
            display_context = self._state.display_context
            metric_keys = list(self._state.stats_metric_keys)
            current_metric = self._state.stats_focus_metric
        if display_context == "stats":
            if not metric_keys:
                return
            try:
                current_index = metric_keys.index(current_metric) if current_metric in metric_keys else 0
            except ValueError:
                current_index = 0
            next_index = (current_index + delta) % len(metric_keys)
            with self._state_lock:
                self._state.stats_focus_metric = metric_keys[next_index]
            self._request_render()
            return
        self._select_relative_audio_grid_block(client, delta)

    def _select_relative_audio_grid_block(self, client: httpx.Client, delta: int) -> None:
        with self._state_lock:
            blocks = list(self._state.audio_grid.get("blocks") or [])
            selected_block_id = self._state.audio_grid.get("selected_block_id")
        if not blocks:
            return
        current_index = next(
            (index for index, block in enumerate(blocks) if block.get("block_id") == selected_block_id),
            0,
        )
        next_index = (current_index + delta) % len(blocks)
        block_id = str(blocks[next_index].get("block_id") or "")
        if not block_id:
            return
        try:
            response = client.post("/api/maschine/audio-grid/select", json={"block_id": block_id})
            response.raise_for_status()
        except Exception as exc:
            LOGGER.debug("Audio grid relative select failed: %s", exc)
        self._request_render()

    def _select_block_for_pad(self, client: httpx.Client, pad_index: int) -> None:
        with self._state_lock:
            blocks = list(self._state.audio_grid.get("blocks") or [])
        if pad_index < 0 or pad_index >= len(blocks):
            return
        block_id = str(blocks[pad_index].get("block_id") or "")
        if not block_id:
            return
        try:
            response = client.post("/api/maschine/audio-grid/select", json={"block_id": block_id})
            response.raise_for_status()
        except Exception as exc:
            LOGGER.debug("Audio grid pad select failed: %s", exc)
        self._request_render()

    def _toggle_block_bypass_for_pad(self, client: httpx.Client, pad_index: int) -> None:
        with self._state_lock:
            blocks = list(self._state.audio_grid.get("blocks") or [])
        if pad_index < 0 or pad_index >= len(blocks):
            return
        block_id = str(blocks[pad_index].get("block_id") or "")
        if not block_id:
            return
        try:
            response = client.post("/api/maschine/audio-grid/bypass", json={"block_id": block_id})
            response.raise_for_status()
        except Exception as exc:
            LOGGER.debug("Audio grid bypass failed: %s", exc)
        self._request_render()

    def _dispatch_transport_action(self, client: httpx.Client, action: str) -> None:
        if action not in {"play", "stop", "record", "restart", "erase"}:
            return
        try:
            response = client.post(f"/api/transport/{action}")
            response.raise_for_status()
        except Exception as exc:
            LOGGER.debug("Transport action %s failed: %s", action, exc)

    def _record_last_touched_control(self, *, control_index: int, midi_value: int) -> None:
        with self._state_lock:
            audio_grid = dict(self._state.audio_grid)
            encoder_map = dict(self._state.encoder_map)
        selected_block = next(
            (block for block in list(audio_grid.get("blocks") or []) if block.get("block_id") == audio_grid.get("selected_block_id")),
            None,
        )
        label = f"Encoder {control_index + 1}"
        display_value = str(midi_value)
        if control_index >= 8:
            fixed_key = ("vol", "tempo", "swing")[control_index - 8]
            fixed_entry = encoder_map.get(fixed_key)
            if isinstance(fixed_entry, dict):
                label = str(fixed_entry.get("label") or label)
        elif selected_block is not None:
            encoder_key = f"enc{control_index + 1}"
            mapped_entry = encoder_map.get(encoder_key)
            if isinstance(mapped_entry, dict) and mapped_entry.get("label"):
                label = str(mapped_entry.get("label"))
                if mapped_entry.get("param_id") and selected_block.get("top_parameters"):
                    for parameter in list(selected_block.get("top_parameters") or []):
                        if str(parameter.get("param_id")) == str(mapped_entry.get("param_id")):
                            display_value = str(parameter.get("value"))
                            break
            else:
                parameters = list(selected_block.get("top_parameters") or [])
                parameter_index = max(0, control_index - 1)
                if parameter_index < len(parameters):
                    parameter = dict(parameters[parameter_index])
                    label = str(parameter.get("param_id") or label)
                    display_value = str(parameter.get("value") or display_value)

        with self._state_lock:
            self._state.last_touched_control = LastTouchedControl(
                label=label,
                display_value=display_value,
                midi_value=_clamp(midi_value, 0, 127),
            )
        self._request_render()

    def _assign_encoder_for_selected_block(self, client: httpx.Client, *, encoder_slot: int) -> None:
        encoder_key = f"enc{encoder_slot}"
        with self._state_lock:
            current_map = dict(self._state.encoder_map)
            selected_block = next(
                (
                    block for block in list(self._state.audio_grid.get("blocks") or [])
                    if block.get("block_id") == self._state.audio_grid.get("selected_block_id")
                ),
                None,
            )
        if selected_block is None:
            return
        parameter_index = max(0, encoder_slot - 2)
        parameters = list(selected_block.get("top_parameters") or [])
        if parameter_index >= len(parameters):
            return
        parameter = dict(parameters[parameter_index])
        current_map[encoder_key] = {
            "block_id": selected_block.get("block_id"),
            "param_id": parameter.get("param_id"),
            "label": str(parameter.get("param_id") or encoder_key).replace("_", " ").title(),
        }
        try:
            response = client.post("/api/maschine/encoder-map", json={"encoder_map": current_map})
            response.raise_for_status()
            payload = response.json()
            if isinstance(payload.get("encoder_map"), dict):
                with self._state_lock:
                    self._state.encoder_map = dict(payload["encoder_map"])
        except Exception as exc:
            LOGGER.debug("Encoder reassignment failed for %s: %s", encoder_key, exc)
        self._request_render()

    @staticmethod
    def _audio_grid_with_last_touched(
        audio_grid: dict[str, Any],
        last_touched: LastTouchedControl | None,
    ) -> dict[str, Any]:
        if last_touched is None:
            return audio_grid
        rendered = dict(audio_grid)
        selected_block_id = rendered.get("selected_block_id")
        next_blocks: list[dict[str, Any]] = []
        for block in list(rendered.get("blocks") or []):
            next_block = dict(block)
            if next_block.get("block_id") == selected_block_id:
                existing = [dict(item) for item in list(next_block.get("top_parameters") or [])]
                existing = [item for item in existing if str(item.get("param_id")) != last_touched.label]
                next_block["top_parameters"] = [{"param_id": last_touched.label, "value": last_touched.display_value}, *existing]
            next_blocks.append(next_block)
        rendered["blocks"] = next_blocks
        return rendered


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="MAP2 Maschine MK1 HID daemon")
    parser.add_argument("--backend-url", default=os.getenv("MAP2_BACKEND_URL", DEFAULT_BACKEND_URL))
    parser.add_argument("--log-level", default=os.getenv("MAP2_LOG_LEVEL", "INFO"))
    return parser.parse_args()


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, str(level).upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("websockets").setLevel(logging.WARNING)


def main() -> int:
    args = parse_args()
    config = DaemonConfig.from_env()
    config.backend_url = _normalize_backend_url(args.backend_url)
    configure_logging(args.log_level)
    daemon = MaschineMK1Daemon(config)

    def _handle_signal(signum: int, _frame: Any) -> None:
        LOGGER.info("Received signal %s; stopping Maschine daemon", signum)
        daemon.stop()

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)
    return daemon.run()


if __name__ == "__main__":
    raise SystemExit(main())
