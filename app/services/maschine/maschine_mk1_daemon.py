"""Standalone Maschine MK1 daemon.

This daemon bridges the Native Instruments Maschine MK1 USB surface into
MAP2 by:

- reading pad/button/encoder input via bulk USB and translating to MIDI
- mirroring input activity into the backend websocket bridge
- polling backend state to render LCD frames and drive pad/button LEDs
- dispatching transport and block-focus actions back into the MAP2 API

The USB protocol is a direct transcription of shaduzlabs/cabl (MIT).
See mk1_protocol.py for the wire format and mk1_usb_transport.py for
the pyusb I/O layer.
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
from urllib.parse import urlparse

import httpx
import websockets
from websockets.sync.client import ClientConnection, connect as ws_connect

from app.services.maschine.mk1_protocol import (
    LED_BACKLIGHT_DEFAULT,
    LED_DATA_SIZE,
    LED_PAD_INDEX,
    DISPLAY_FRAMEBUFFER_SIZE,
    Button,
    ButtonChange,
    EncoderDelta,
    Led,
    N_BUTTONS,
    N_ENCODERS,
    PAD_COUNT,
    PadEvent,
    REPORT_TAG_BUTTONS,
    REPORT_TAG_ENCODERS,
    decode_button_report,
    decode_encoder_report,
    decode_pad_report,
    is_shift_held,
)
from app.services.maschine.mk1_usb_transport import (
    MaschineMK1NotFound,
    MaschineMK1UsbTransport,
)
from app.services.maschine_encoder_map_service import default_maschine_encoder_map
from app.services.maschine_lcd_service import (
    LCD_HEIGHT,
    LCD_WIDTH,
    MaschineLCDRenderService,
    _Canvas,
    _canvas_panel,
    _safe_label,
)
from app.services.maschine_service import MaschineService
from app.utils.rtmidi_utils import dispose_rtmidi_client

try:
    import rtmidi  # type: ignore
except Exception:  # pragma: no cover - optional runtime dependency
    rtmidi = None

try:
    import pyudev  # type: ignore
except Exception:  # pragma: no cover - optional runtime dependency
    pyudev = None

LOGGER = logging.getLogger("maschine_mk1_daemon")

MASCHINE_VIRTUAL_PORT_NAME = "MAP2:Maschine-MK1"
DEFAULT_BACKEND_URL = "http://localhost:8080"
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
TOP_LEVEL_MENU_ITEMS = ("Audio Grid", "Stats", "---", "---", "---")
BACKEND_MESSAGE_QUEUE_LIMIT = 256
_TOP_LEVEL_MENU_CONTEXTS = ("audio_grid", "stats")

# Button → transport action mapping
_TRANSPORT_BUTTONS: dict[int, str] = {
    int(Button.Play): "play",
    int(Button.Rec): "record",
    int(Button.Erase): "erase",
    int(Button.Loop): "restart",
    int(Button.TransportRight): "stop",
}

# Button → group index (0-7) for A-H
_GROUP_BUTTONS: dict[int, int] = {
    int(Button.GroupA): 0,
    int(Button.GroupB): 1,
    int(Button.GroupC): 2,
    int(Button.GroupD): 3,
    int(Button.GroupE): 4,
    int(Button.GroupF): 5,
    int(Button.GroupG): 6,
    int(Button.GroupH): 7,
}

# LED slots for transport feedback (E2)
_TRANSPORT_LED_MAP: dict[str, int] = {
    "play": int(Led.Play),
    "record": int(Led.Rec),
    "stop": int(Led.TransportRight),
    "loop": int(Led.Loop),
}


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


def _midi_poly_aftertouch_message(channel: int, note: int, pressure: int) -> bytes:
    return bytes([(0xA0 | ((channel - 1) & 0x0F)), note & 0x7F, pressure & 0x7F])


def _json_dumps(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _normalize_backend_url(url: str) -> str:
    normalized = str(url or DEFAULT_BACKEND_URL).strip() or DEFAULT_BACKEND_URL
    return normalized.rstrip("/")


def _build_ws_url(base_url: str, path: str) -> str:
    parsed = urlparse(base_url)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    normalized_path = path if path.startswith("/") else f"/{path}"
    return f"{scheme}://{parsed.netloc}{normalized_path}"


@dataclass
class DaemonConfig:
    backend_url: str = DEFAULT_BACKEND_URL
    virtual_port_name: str = MASCHINE_VIRTUAL_PORT_NAME
    display_poll_interval_seconds: float = DISPLAY_POLL_INTERVAL_SECONDS
    heartbeat_interval_seconds: float = HEARTBEAT_INTERVAL_SECONDS
    display_refresh_interval_seconds: float = 1.0 / DISPLAY_FPS
    reconnect_backoff_min_seconds: float = RECONNECT_BACKOFF_MIN_SECONDS
    reconnect_backoff_max_seconds: float = RECONNECT_BACKOFF_MAX_SECONDS
    allow_kernel_detach: bool = True

    @classmethod
    def from_env(cls) -> "DaemonConfig":
        allow_detach_env = os.getenv("MAP2_MASCHINE_ALLOW_KERNEL_DETACH")
        allow_kernel_detach = True
        if allow_detach_env is not None:
            allow_kernel_detach = str(allow_detach_env).strip().lower() in {"1", "true", "yes", "on"}
        return cls(
            backend_url=_normalize_backend_url(os.getenv("MAP2_BACKEND_URL", DEFAULT_BACKEND_URL)),
            allow_kernel_detach=allow_kernel_detach,
        )


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
    device_connected: bool = False
    display_context: str = "audio_grid"
    menu_return_context: str = "audio_grid"
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
    transport_state: dict[str, Any] = field(default_factory=dict)


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
            dispose_rtmidi_client(self._port)
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
            dispose_rtmidi_client(self._port)
        self._port = None
        self._is_open = False


class MaschineDeviceHotplugMonitor:
    def __init__(self) -> None:
        self._event = threading.Event()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    @property
    def available(self) -> bool:
        return pyudev is not None

    def start(self) -> None:
        if not self.available or self._thread is not None:
            return
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._watch_loop,
            name="maschine-udev-hotplug",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._event.set()
        thread = self._thread
        self._thread = None
        if thread is not None:
            thread.join(timeout=1.0)

    def notify_relevant_event(self) -> None:
        self._event.set()

    def wait_for_event(self, *, stop_event: threading.Event, timeout: float | None = None) -> bool:
        deadline = None if timeout is None else time.monotonic() + max(timeout, 0.0)
        while not stop_event.is_set() and not self._stop_event.is_set():
            if self._event.wait(timeout=0.25):
                self._event.clear()
                return True
            if deadline is not None and time.monotonic() >= deadline:
                return False
        return False

    @staticmethod
    def _normalize_hex(value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, bytes):
            try:
                value = value.decode("utf-8")
            except Exception:
                return None
        text = str(value).strip().lower()
        if not text:
            return None
        if text.startswith("0x"):
            text = text[2:]
        return text.zfill(4)

    @classmethod
    def _matches_maschine_device(cls, device: Any) -> bool:
        candidate_vendor = None
        candidate_product = None

        try:
            candidate_vendor = cls._normalize_hex(device.get("ID_VENDOR_ID"))
        except Exception:
            candidate_vendor = None
        try:
            candidate_product = cls._normalize_hex(device.get("ID_MODEL_ID"))
        except Exception:
            candidate_product = None

        attributes = getattr(device, "attributes", None)
        if attributes is not None:
            try:
                candidate_vendor = candidate_vendor or cls._normalize_hex(attributes.get("idVendor"))
            except Exception:
                pass
            try:
                candidate_product = candidate_product or cls._normalize_hex(attributes.get("idProduct"))
            except Exception:
                pass

        return candidate_vendor == f"{0x17CC:04x}".lower() and candidate_product == f"{0x0808:04x}".lower()

    def _watch_loop(self) -> None:
        if pyudev is None:
            return
        try:
            context = pyudev.Context()
            monitor = pyudev.Monitor.from_netlink(context)
            monitor.filter_by(subsystem="usb")
        except Exception as exc:  # pragma: no cover - depends on host udev
            LOGGER.warning("Maschine hotplug monitor disabled: %s", exc)
            return

        LOGGER.info("Maschine hotplug monitor armed via pyudev")
        while not self._stop_event.is_set():
            try:
                device = monitor.poll(timeout=0.5)
            except Exception as exc:  # pragma: no cover - depends on host udev
                LOGGER.debug("Maschine hotplug monitor poll failed: %s", exc)
                time.sleep(0.5)
                continue
            if device is None:
                continue
            if self._matches_maschine_device(device):
                self._event.set()


def build_reconnecting_frames() -> dict[str, dict[str, Any]]:
    left = _Canvas()
    left.draw_text(_safe_label("RECONNECTING", limit=12), 8, 8, scale=2)
    left.draw_hline(4, 28, LCD_WIDTH - 8)
    left.draw_text("BACKEND OR DEVICE", 8, 36)
    left.draw_text("RECOVERING...", 8, 48)

    right = _Canvas()
    right.draw_text("MAP2", 24, 8, scale=2)
    right.draw_hline(4, 28, LCD_WIDTH - 8)
    right.draw_text("LCD", 16, 38, scale=2)
    right.draw_text("WAIT", 66, 38, scale=2)

    return {
        "left": _canvas_panel(left),
        "right": _canvas_panel(right),
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
    return _canvas_panel(canvas)


def build_top_level_menu_frames(*, selected_index: int, active_context: str) -> dict[str, dict[str, Any]]:
    left = _Canvas()
    left.draw_text("MENU", 4, 4, scale=2)
    left.draw_hline(4, 22, 72)
    for index, item in enumerate(TOP_LEVEL_MENU_ITEMS):
        row_y = 28 + (index * 8)
        if index == selected_index:
            left.fill_rect(2, row_y - 1, 76, 8)
            left.draw_text(item, 6, row_y)
            left.invert_rect(2, row_y - 1, 76, 8)
        else:
            left.draw_text(item, 6, row_y)

    right = _Canvas()
    selected_label = TOP_LEVEL_MENU_ITEMS[selected_index] if 0 <= selected_index < len(TOP_LEVEL_MENU_ITEMS) else "---"
    right.draw_text("LCD MENU", 4, 4)
    right.draw_hline(4, 14, LCD_WIDTH - 8)
    right.draw_text(_safe_label(selected_label, limit=14), 4, 20, scale=2)
    right.draw_text(f"ACTIVE {_safe_label(active_context.replace('_', ' '), limit=12)}", 4, 38)
    right.draw_text("NAV MOVE", 4, 48)
    right.draw_text("NR SEL CTRL BK", 4, 56)
    return {
        "left": _canvas_panel(left),
        "right": _canvas_panel(right),
    }


class MaschineMK1Daemon:
    def __init__(self, config: DaemonConfig) -> None:
        self.config = config
        self._stop_event = threading.Event()
        self._render_requested = threading.Event()
        self._state_lock = threading.Lock()
        self._state = SharedRuntimeState()
        self._state.lcd_frames = build_reconnecting_frames()
        self._transport: MaschineMK1UsbTransport | None = None
        self._midi = VirtualMidiOutput(config.virtual_port_name)
        self._hotplug_monitor = MaschineDeviceHotplugMonitor()
        self._outbound_messages: "queue.Queue[dict[str, Any]]" = queue.Queue(maxsize=BACKEND_MESSAGE_QUEUE_LIMIT)
        self._input_thread = threading.Thread(target=self._input_loop, name="maschine-input", daemon=True)
        self._display_thread = threading.Thread(target=self._display_loop, name="maschine-display", daemon=True)
        self._output_thread = threading.Thread(target=self._output_loop, name="maschine-output", daemon=True)

    def run(self) -> int:
        LOGGER.info("Starting Maschine MK1 daemon")
        self._midi.open()
        self._hotplug_monitor.start()
        self._input_thread.start()
        self._display_thread.start()
        self._output_thread.start()

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
        transport = self._transport
        if transport is not None:
            transport.close()
        self._hotplug_monitor.stop()
        self._midi.close()
        for thread in (self._input_thread, self._display_thread, self._output_thread):
            if thread.is_alive():
                thread.join(timeout=2.0)

    # ------------------------------------------------------------------
    # Input loop — reads pads + buttons/encoders from the USB device
    # ------------------------------------------------------------------

    def _input_loop(self) -> None:
        _best_effort_set_scheduler(55)
        client = httpx.Client(base_url=self.config.backend_url, timeout=2.5)
        reconnect_sleep = self.config.reconnect_backoff_min_seconds

        # Persistent decode state
        prev_pad_pressed: list[bool] = [False] * PAD_COUNT
        prev_button_state: list[bool] = [False] * N_BUTTONS
        prev_encoder_values: list[int] = [0] * N_ENCODERS
        encoder_initialized: bool = False
        pad_press_started: dict[int, float] = {}
        active_pad_pressures: dict[int, int] = {}
        held_groups: set[int] = set()

        try:
            while not self._stop_event.is_set():
                # Connect / reconnect
                if self._transport is None or not self._transport.is_open:
                    try:
                        transport = MaschineMK1UsbTransport(
                            allow_kernel_detach=self.config.allow_kernel_detach,
                        )
                        transport.open()
                        transport.initialize_device()
                        self._transport = transport
                        with self._state_lock:
                            self._state.device_connected = True
                            self._state.reconnecting = not self._state.backend_connected
                        reconnect_sleep = self.config.reconnect_backoff_min_seconds
                        # Reset decode state on fresh connection
                        prev_pad_pressed = [False] * PAD_COUNT
                        prev_button_state = [False] * N_BUTTONS
                        prev_encoder_values = [0] * N_ENCODERS
                        encoder_initialized = False
                        pad_press_started.clear()
                        active_pad_pressures.clear()
                        held_groups.clear()
                        LOGGER.info("Maschine MK1 device connected and initialized")
                        self._request_render()
                    except MaschineMK1NotFound:
                        LOGGER.debug("Maschine MK1 not found")
                        self._set_device_connected(False)
                        if self._hotplug_monitor.available:
                            self._hotplug_monitor.wait_for_event(
                                stop_event=self._stop_event,
                                timeout=self.config.reconnect_backoff_max_seconds,
                            )
                        else:
                            self._stop_event.wait(reconnect_sleep)
                            reconnect_sleep = min(reconnect_sleep * 2.0, self.config.reconnect_backoff_max_seconds)
                        continue
                    except Exception as exc:
                        LOGGER.warning("Maschine MK1 connect failed: %s", exc)
                        self._set_device_connected(False)
                        self._stop_event.wait(reconnect_sleep)
                        reconnect_sleep = min(reconnect_sleep * 2.0, self.config.reconnect_backoff_max_seconds)
                        continue

                transport = self._transport
                if transport is None:
                    continue

                # Read pads
                try:
                    pad_data = transport.read_pads()
                except Exception:
                    self._handle_device_disconnect()
                    continue

                if pad_data is not None:
                    events = decode_pad_report(pad_data, prev_pad_pressed)
                    for event in events:
                        self._dispatch_pad_event(client, event, pad_press_started, active_pad_pressures)

                # Read buttons/encoders
                try:
                    btn_data = transport.read_buttons_encoders()
                except Exception:
                    self._handle_device_disconnect()
                    continue

                if btn_data is not None and len(btn_data) > 0:
                    tag = btn_data[0]
                    if tag == REPORT_TAG_BUTTONS:
                        shift = is_shift_held(btn_data)
                        changes = decode_button_report(btn_data, prev_button_state)
                        for change in changes:
                            self._dispatch_button(client, change, held_groups, shift)
                    elif tag == REPORT_TAG_ENCODERS:
                        deltas, encoder_initialized = decode_encoder_report(
                            btn_data, prev_encoder_values, encoder_initialized,
                        )
                        for delta in deltas:
                            self._dispatch_encoder(client, delta, held_groups)

                # Yield to avoid spinning when no data
                if pad_data is None and btn_data is None:
                    time.sleep(0.001)

        finally:
            client.close()
            self._set_device_connected(False)

    def _handle_device_disconnect(self) -> None:
        transport = self._transport
        self._transport = None
        if transport is not None:
            try:
                transport.close()
            except Exception:
                pass
        self._set_device_connected(False)
        LOGGER.warning("Maschine MK1 device disconnected; will attempt reconnect")

    # ------------------------------------------------------------------
    # Pad dispatch
    # ------------------------------------------------------------------

    def _dispatch_pad_event(
        self,
        client: httpx.Client,
        event: PadEvent,
        pad_press_started: dict[int, float],
        active_pad_pressures: dict[int, int],
    ) -> None:
        note = PAD_NOTE_BASE + event.pad
        velocity_midi = _clamp(int(event.pressure * 127 / 4095), 0, 127) if event.pressed else 0
        previous_pressure = active_pad_pressures.get(event.pad)
        midi_messages: list[bytes] = []
        decoded_type = "pad_release"
        if event.pressed:
            if previous_pressure is None:
                midi_messages.append(_midi_note_message(1, note, velocity_midi, note_on=True))
                pad_press_started[event.pad] = time.monotonic()
                active_pad_pressures[event.pad] = velocity_midi
                self._select_block_for_pad(client, event.pad)
                decoded_type = "pad_press"
            elif velocity_midi != previous_pressure:
                midi_messages.append(_midi_poly_aftertouch_message(1, note, velocity_midi))
                active_pad_pressures[event.pad] = velocity_midi
                decoded_type = "pad_aftertouch"
            else:
                return
        else:
            midi_messages.append(_midi_note_message(1, note, 0, note_on=False))
            active_pad_pressures.pop(event.pad, None)
            started_at = pad_press_started.pop(event.pad, None)
            if started_at is not None and (time.monotonic() - started_at) >= 0.5:
                self._toggle_block_bypass_for_pad(client, event.pad)
            decoded_type = "pad_release"

        self._midi.send_messages(midi_messages)
        self._enqueue_backend_message({
            "type": "hid_event",
            "payload": {
                "timestamp": _utcnow_iso(),
                "direction": "in",
                "decoded_type": decoded_type,
                "pad_index": event.pad,
                "velocity": velocity_midi,
                "pressure": event.pressure,
                "pressed": event.pressed,
                "channel": 1,
                "note": note,
                "midi_hex": [message.hex().upper() for message in midi_messages],
            },
        })

    # ------------------------------------------------------------------
    # Button dispatch
    # ------------------------------------------------------------------

    def _dispatch_button(
        self,
        client: httpx.Client,
        change: ButtonChange,
        held_groups: set[int],
        shift: bool,
    ) -> None:
        button = change.button
        pressed = change.pressed

        # Group buttons
        if button in _GROUP_BUTTONS:
            group_index = _GROUP_BUTTONS[button]
            if pressed:
                held_groups.add(group_index)
            else:
                held_groups.discard(group_index)
            cc = GROUP_CC_BASE + group_index
            midi_msg = _midi_cc_message(1, cc, 127 if pressed else 0)
            self._midi.send_messages((midi_msg,))
            self._enqueue_backend_message({
                "type": "hid_event",
                "payload": {
                    "timestamp": _utcnow_iso(),
                    "direction": "in",
                    "decoded_type": "group_press" if pressed else "group_release",
                    "group_index": group_index,
                    "pressed": pressed,
                    "channel": 1,
                    "midi_hex": [midi_msg.hex().upper()],
                },
            })
            return

        # Transport buttons
        if button in _TRANSPORT_BUTTONS and pressed:
            action = _TRANSPORT_BUTTONS[button]
            note = TRANSPORT_NOTE_BASE + list(_TRANSPORT_BUTTONS.values()).index(action)
            midi_msg = _midi_note_message(2, note, 127, note_on=True)
            self._midi.send_messages((midi_msg,))
            self._dispatch_transport_action(client, action)
            self._enqueue_backend_message({
                "type": "hid_event",
                "payload": {
                    "timestamp": _utcnow_iso(),
                    "direction": "in",
                    "decoded_type": "transport_press",
                    "transport_action": action,
                    "pressed": True,
                    "channel": 2,
                    "midi_hex": [midi_msg.hex().upper()],
                },
            })
            return

        # Control/Navigate/NoteRepeat — encoder push equivalents
        if button == int(Button.Control) and pressed:
            with self._state_lock:
                in_menu = self._state.display_context == "menu"
            if in_menu:
                self._close_top_level_menu()
            else:
                self._toggle_display_context()
        elif button == int(Button.Navigate) and pressed:
            self._open_top_level_menu()
        elif button == int(Button.NoteRepeat) and pressed:
            with self._state_lock:
                in_menu = self._state.display_context == "menu"
            if in_menu:
                self._activate_top_level_menu_selection()
            else:
                self._open_top_level_menu()

        # All other button events → websocket
        self._enqueue_backend_message({
            "type": "hid_event",
            "payload": {
                "timestamp": _utcnow_iso(),
                "direction": "in",
                "decoded_type": "button_press" if pressed else "button_release",
                "button": button,
                "pressed": pressed,
                "shift": shift,
                "midi_hex": [],
            },
        })

    # ------------------------------------------------------------------
    # Encoder dispatch
    # ------------------------------------------------------------------

    def _dispatch_encoder(
        self,
        client: httpx.Client,
        delta: EncoderDelta,
        held_groups: set[int],
    ) -> None:
        encoder = delta.encoder
        direction = delta.direction

        if encoder == 0:
            self._handle_navigation_encoder(client, direction)
            return

        # Encoders 1-7: parameter control; 8-10: master vol/tempo/swing
        cc = ENCODER_CC_BASE + encoder if encoder < 8 else MASTER_CC_BASE + (encoder - 8)
        midi_value = 65 if direction > 0 else 63  # relative CC
        midi_msg = _midi_cc_message(1, cc, midi_value)
        self._midi.send_messages((midi_msg,))

        if 0 in held_groups and 1 <= encoder <= 7:
            self._assign_encoder_for_selected_block(client, encoder_slot=encoder + 1)

        self._record_last_touched_control(control_index=encoder, midi_value=midi_value)

        self._enqueue_backend_message({
            "type": "hid_event",
            "payload": {
                "timestamp": _utcnow_iso(),
                "direction": "in",
                "decoded_type": "encoder",
                "encoder": encoder,
                "delta": direction,
                "channel": 1,
                "midi_hex": [midi_msg.hex().upper()],
            },
        })

    # ------------------------------------------------------------------
    # Display loop — websocket + backend polling + rendering
    # ------------------------------------------------------------------

    def _display_loop(self) -> None:
        _best_effort_set_scheduler(None)
        renderer = MaschineLCDRenderService()
        client = httpx.Client(base_url=self.config.backend_url, timeout=3.5)
        backoff_seconds = self.config.reconnect_backoff_min_seconds

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
                                self._poll_and_render(renderer, client, websocket)
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
                    if self._stop_event.wait(backoff_seconds):
                        break
                    backoff_seconds = min(backoff_seconds * 2.0, self.config.reconnect_backoff_max_seconds)
        finally:
            client.close()
            self._set_backend_connected(False)

    # ------------------------------------------------------------------
    # Output loop — writes LEDs + LCD frames to the physical device
    # ------------------------------------------------------------------

    def _output_loop(self) -> None:
        _best_effort_set_scheduler(None)
        last_led_bytes: bytes | None = None
        last_left_fb: str = ""
        last_right_fb: str = ""

        while not self._stop_event.is_set():
            transport = self._transport
            if transport is None or not transport.is_open:
                time.sleep(self.config.display_refresh_interval_seconds)
                continue

            output = self._snapshot_output_state()
            led_state = output["led_state"]
            lcd_frames = output["lcd_frames"]

            # Build the 62-byte LED array
            led_array = self._build_led_array(led_state)
            led_bytes = bytes(led_array)

            if led_bytes != last_led_bytes:
                try:
                    transport.write_leds(led_array)
                    last_led_bytes = led_bytes
                except Exception as exc:
                    LOGGER.debug("LED write failed: %s", exc)

            # Write LCD frames (use framebuffer hex if available, fall back to skip)
            left = lcd_frames.get("left") or {}
            right = lcd_frames.get("right") or {}
            left_fb = str(left.get("framebuffer") or "")
            right_fb = str(right.get("framebuffer") or "")

            if left_fb and left_fb != last_left_fb:
                try:
                    transport.write_display_frame(0, bytes.fromhex(left_fb))
                    last_left_fb = left_fb
                except Exception as exc:
                    LOGGER.debug("Left LCD write failed: %s", exc)

            if right_fb and right_fb != last_right_fb:
                try:
                    transport.write_display_frame(1, bytes.fromhex(right_fb))
                    last_right_fb = right_fb
                except Exception as exc:
                    LOGGER.debug("Right LCD write failed: %s", exc)

            time.sleep(self.config.display_refresh_interval_seconds)

    def _build_led_array(self, led_state: dict[str, Any]) -> list[int]:
        """Build the 62-byte LED array from backend state.

        Combines pad LEDs (from audio grid selection), transport feedback (E2),
        and display backlight into the flat 62-slot array that the device needs.
        """
        led = [0] * LED_DATA_SIZE

        # Pad LEDs from audio grid
        pads = list(led_state.get("pads") or [])
        for i, pad_entry in enumerate(pads[:16]):
            if not isinstance(pad_entry, dict):
                continue
            state = str(pad_entry.get("state") or "off")
            if state == "off":
                brightness = 0
            elif state == "dim":
                brightness = 40
            elif state == "bright":
                brightness = 180
            elif state == "pulsing":
                # Simple pulse: oscillate based on time
                phase = (time.monotonic() * 3.0) % 1.0
                brightness = int(80 + 175 * abs(phase - 0.5) * 2)
            else:
                brightness = 0
            if i < len(LED_PAD_INDEX):
                led[LED_PAD_INDEX[i]] = _clamp(brightness, 0, 255)

        # Transport button LEDs (E2)
        transport_state = None
        with self._state_lock:
            transport_state = dict(self._state.transport_state)
        if transport_state:
            is_playing = bool(transport_state.get("is_playing"))
            is_recording = bool(transport_state.get("is_recording"))
            is_looping = bool(transport_state.get("is_looping"))

            if is_playing:
                led[int(Led.Play)] = 255
            else:
                led[int(Led.Play)] = 20

            if is_recording:
                led[int(Led.Rec)] = 255
            else:
                led[int(Led.Rec)] = 20

            if is_looping:
                led[int(Led.Loop)] = 255
            else:
                led[int(Led.Loop)] = 20

        # Display backlight always on
        led[int(Led.DisplayBacklight)] = LED_BACKLIGHT_DEFAULT

        return led

    # ------------------------------------------------------------------
    # Registration + heartbeat
    # ------------------------------------------------------------------

    def _registration_payload(self, *, status: str) -> dict[str, Any]:
        return {
            "daemon_version": "2.0.0",
            "virtual_port_name": self.config.virtual_port_name,
            "hid_device": {},
            "transport": {
                "transport_id": "usb-bulk",
                "connected": self._snapshot_device_connected(),
            },
            "transport_candidates": [{
                "transport_id": "usb-bulk",
                "module_available": True,
            }],
            "firmware_info": {},
            "capabilities": {
                "protocol_version": "cabl-mk1-v1",
                "transport_preference": "usb-bulk",
                "hidapi_available": False,
                "pyusb_available": True,
                "rtmidi_available": rtmidi is not None,
                "pyudev_available": self._hotplug_monitor.available,
                "hotplug_mode": "udev" if self._hotplug_monitor.available else "polling",
                "pads": 16,
                "encoders": 11,
                "master_knobs": 3,
                "buttons": N_BUTTONS,
                "led_slots": LED_DATA_SIZE,
                "lcd": {
                    "left": {"width": LCD_WIDTH, "height": LCD_HEIGHT},
                    "right": {"width": LCD_WIDTH, "height": LCD_HEIGHT},
                },
            },
            "status": status,
        }

    def _register_heartbeat(self, client: httpx.Client) -> None:
        status = "connected" if self._snapshot_device_connected() else "reconnecting"
        payload = self._registration_payload(status=status)
        try:
            response = client.post("/api/maschine/register", json=payload)
            response.raise_for_status()
        except Exception as exc:
            LOGGER.debug("Maschine heartbeat failed: %s", exc)

    # ------------------------------------------------------------------
    # Polling + rendering
    # ------------------------------------------------------------------

    def _poll_and_render(
        self,
        renderer: MaschineLCDRenderService,
        client: httpx.Client,
        websocket: ClientConnection,
    ) -> None:
        audio_grid = self._poll_audio_grid(client)
        encoder_map = self._poll_encoder_map(client)
        stats_payload = self._poll_stats_payload(renderer, client)
        self._update_polled_state(audio_grid=audio_grid, encoder_map=encoder_map, stats_payload=stats_payload)

        with self._state_lock:
            reconnecting = self._state.reconnecting
            display_context = self._state.display_context
            menu_return_context = self._state.menu_return_context
            top_level_menu_index = self._state.top_level_menu_index
            focus_metric = self._state.stats_focus_metric
            led_state = dict(self._state.led_state)
            last_touched = self._state.last_touched_control
            current_audio_grid = dict(self._state.audio_grid)
            current_stats = dict(self._state.stats_payload)

        if reconnecting:
            frames = build_reconnecting_frames()
        elif display_context == "menu":
            frames = build_top_level_menu_frames(
                selected_index=top_level_menu_index,
                active_context=menu_return_context,
            )
        elif display_context == "stats":
            rendered = renderer._render_stats(stats=current_stats, focus_metric=focus_metric)
            frames = {"left": rendered["left"], "right": rendered["right"]}
        else:
            rendered_audio_grid = self._audio_grid_with_last_touched(current_audio_grid, last_touched)
            rendered = renderer._render_audio_grid(audio_grid=rendered_audio_grid)
            right = build_last_touched_bitmap(last_touched) if last_touched else rendered["right"]
            frames = {"left": rendered["left"], "right": right}

        self._set_output_state(lcd_frames=frames, led_state=led_state)

        self._send_json(websocket, {"type": "lcd", "payload": {"side": "left", "bitmap": frames["left"]}})
        self._send_json(websocket, {"type": "lcd", "payload": {"side": "right", "bitmap": frames["right"]}})
        self._send_json(websocket, {"type": "led_state", "payload": {"pads": list(led_state.get("pads") or [])}})

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
                    if isinstance(state.get("transport"), dict):
                        self._state.transport_state = dict(state["transport"])
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
                if isinstance(data.get("transport"), dict):
                    self._state.transport_state = dict(data["transport"])
            self._request_render()

    # ------------------------------------------------------------------
    # State helpers
    # ------------------------------------------------------------------

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

    def _set_device_connected(self, connected: bool) -> None:
        with self._state_lock:
            self._state.device_connected = bool(connected)
            if not connected:
                self._state.reconnecting = True
        self._request_render()

    def _set_backend_connected(self, connected: bool) -> None:
        with self._state_lock:
            self._state.backend_connected = bool(connected)
            if connected:
                self._state.reconnecting = not self._state.device_connected
        self._request_render()

    def _set_reconnecting(self, reconnecting: bool) -> None:
        with self._state_lock:
            self._state.reconnecting = bool(reconnecting)
        self._request_render()

    def _set_display_context(self, context: str) -> None:
        with self._state_lock:
            self._state.display_context = "stats" if context == "stats" else "audio_grid"
            self._state.menu_return_context = self._state.display_context
            self._state.top_level_menu_index = 1 if self._state.display_context == "stats" else 0
        self._request_render()

    def _toggle_display_context(self) -> None:
        with self._state_lock:
            self._state.display_context = "stats" if self._state.display_context == "audio_grid" else "audio_grid"
            self._state.menu_return_context = self._state.display_context
            self._state.top_level_menu_index = 1 if self._state.display_context == "stats" else 0
        self._request_render()

    def _open_top_level_menu(self) -> None:
        with self._state_lock:
            current_context = self._state.display_context
            if current_context != "menu":
                self._state.menu_return_context = "stats" if current_context == "stats" else "audio_grid"
            self._state.display_context = "menu"
            self._state.top_level_menu_index = 1 if self._state.menu_return_context == "stats" else 0
        self._request_render()

    def _close_top_level_menu(self) -> None:
        with self._state_lock:
            self._state.display_context = self._state.menu_return_context
            self._state.top_level_menu_index = 1 if self._state.display_context == "stats" else 0
        self._request_render()

    def _activate_top_level_menu_selection(self) -> None:
        with self._state_lock:
            selected_index = _clamp(self._state.top_level_menu_index, 0, len(_TOP_LEVEL_MENU_CONTEXTS) - 1)
            selected_context = _TOP_LEVEL_MENU_CONTEXTS[selected_index]
            self._state.display_context = selected_context
            self._state.menu_return_context = selected_context
            self._state.top_level_menu_index = selected_index
        self._request_render()

    def _request_render(self) -> None:
        self._render_requested.set()

    def _snapshot_device_connected(self) -> bool:
        with self._state_lock:
            return bool(self._state.device_connected)

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

    # ------------------------------------------------------------------
    # Navigation + block actions
    # ------------------------------------------------------------------

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
            current_menu_index = self._state.top_level_menu_index
        if display_context == "menu":
            with self._state_lock:
                self._state.top_level_menu_index = (current_menu_index + delta) % len(_TOP_LEVEL_MENU_CONTEXTS)
            self._request_render()
            return
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
    parser = argparse.ArgumentParser(description="MAP2 Maschine MK1 daemon")
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
