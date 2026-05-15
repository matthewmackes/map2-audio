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
from app.services.maschine.led_animations import (
    build_profile_signature_overlay,
    normalize_pad_led_entry,
    resolve_led_value,
)
from app.services.maschine.boot_sequence import (
    MaschineBootSequence,
    build_boot_button_overrides,
    build_boot_pad_overlay,
)
from app.services.maschine.incident_log import get_maschine_incident_log_service
from app.services.maschine.led_choreography import (
    build_audio_reactive_pad_overlay,
    build_brain_choreography_pad_overlay,
    build_choreography_button_overrides,
    is_brain_profile,
)
from app.services.maschine.long_op_feedback import (
    MaschineLongOperationFeedback,
    MaschineLongOperationSnapshot,
)
from app.services.maschine.onboarding import (
    MaschineOnboardingTour,
    build_onboarding_button_overrides,
    build_onboarding_pad_overlay,
)
from app.services.maschine.screensaver import (
    MaschineScreensaverState,
    build_screensaver_button_overrides,
    build_screensaver_pad_overlay,
    build_screensaver_snapshot,
)
from app.services.maschine.shutdown_sequence import (
    MaschineShutdownSequence,
    build_shutdown_button_overrides,
    build_shutdown_pad_overlay,
)
from app.services.maschine.mk1_usb_transport import (
    MaschineMK1NotFound,
    MaschineMK1UsbTransport,
)
from app.services.maschine.mk1_host_client_transport import (
    MaschineMK1HostClientTransport,
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
from app.services.automation_engine import automation_engine
from app.services.sequencer_service import get_sequencer_service
# T2523 — Maschine MK1 transport buttons drive the multi-track Looper
# in addition to the existing /api/transport/* dispatch. Looper service
# is local Python; calling it directly avoids the HTTP round-trip and
# the loop-amplification that would come from binding the HTTP endpoint
# back into the same process.
from app.services.looper_service import (
    LooperService,
    LooperServiceError,
    get_looper_service,
)
# T2482 loop 9 / iter 86: rtmidi import + dispose helper removed.
# Virtual-port creation goes exclusively through the controller-host's
# MidiCreateVirtualPortRequest IPC envelope (iter 75). The legacy
# rtmidi fallback was retired here.
#
# `rtmidi = None` retained as a module-level stub so existing test
# suites that use `mock.patch.object(maschine_mk1_daemon, "rtmidi", ...)`
# continue to find the attribute; production code no longer reads it.
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
BACKEND_MESSAGE_QUEUE_LIMIT = 256
_CATEGORY_ORDER = ("Control", "Chain", "Brain", "Sampler", "Monitor", "Admin", "Help")
_INSPECTION_MODES = ("off", "assigned", "muted", "automated")
_PROFILE_SWITCH_OSD_SECONDS = 1.5
_STOP_THREAD_JOIN_TIMEOUT_SECONDS = 1.0
_STOP_SHUTDOWN_SEQUENCE_BUDGET_SECONDS = 4.0
_STOP_SHUTDOWN_WRITE_TIMEOUT_MS = 50
_STOP_SHUTDOWN_STAGE_MIN_SECONDS = 0.05
_LONG_OPERATION_PROGRESS_LEDS: tuple[Led, ...] = (
    Led.TransportLeft,
    Led.Play,
    Led.Rec,
    Led.Loop,
    Led.TransportRight,
)

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

_CATEGORY_LED_BUTTONS: tuple[Led, ...] = (
    Led.GroupA,
    Led.GroupB,
    Led.GroupC,
    Led.GroupD,
    Led.GroupE,
    Led.GroupF,
    Led.GroupG,
    Led.GroupH,
)

_INSPECTION_MODE_BUTTONS: dict[str, Led] = {
    "assigned": Led.Keyboard,
    "muted": Led.Pattern,
    "automated": Led.Scene,
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


def _maschine_pad_pressure_source_id(pad_index: int) -> str:
    return f"maschine.pad.{max(0, int(pad_index))}"


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
    display_context: str = "t1_ctrl"
    menu_return_context: str = "t1_ctrl"
    menu_category_index: int = 0
    top_level_menu_index: int = 0
    inspection_mode: str = "off"
    profile_switch_osd_until: float = 0.0
    profile_switch_osd_profile_id: str | None = None
    automation_parameter_ids: list[str] = field(default_factory=list)
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
    platform_event_overlay: dict[str, Any] = field(
        default_factory=lambda: {
            "active": False,
            "event_id": None,
            "severity": "info",
            "mode": "shared_receipt",
            "title": "",
            "message": "",
            "pads": [],
            "lcd": {
                "left": {"width": LCD_WIDTH, "height": LCD_HEIGHT, "format": "xbm", "data": ""},
                "right": {"width": LCD_WIDTH, "height": LCD_HEIGHT, "format": "xbm", "data": ""},
            },
            "updated_at": None,
            "expires_at": None,
        }
    )
    lcd_frames: dict[str, Any] = field(
        default_factory=lambda: {
            "left": {"width": LCD_WIDTH, "height": LCD_HEIGHT, "format": "xbm", "data": ""},
            "right": {"width": LCD_WIDTH, "height": LCD_HEIGHT, "format": "xbm", "data": ""},
        }
    )
    last_touched_control: LastTouchedControl | None = None
    stats_payload: dict[str, Any] = field(default_factory=dict)
    transport_state: dict[str, Any] = field(default_factory=dict)
    drum_transport_state: dict[str, Any] = field(default_factory=dict)
    audio_levels_state: dict[str, Any] = field(default_factory=dict)
    spectrum_state: dict[str, Any] = field(default_factory=dict)
    true_peak_state: dict[str, Any] = field(default_factory=dict)
    brain_state: dict[str, Any] = field(default_factory=dict)
    brain_sequence_state: dict[str, Any] = field(default_factory=dict)
    beat_anchor_monotonic: float = 0.0
    screensaver_active: bool = False
    boot_active: bool = False
    onboarding_active: bool = False
    admin_console_state: dict[str, Any] = field(default_factory=dict)


def _maschine_use_host_client_transport() -> bool:
    """T2459-H4 slice 12 — env-var gate for the Maschine daemon's
    host-client transport.

    When ``MAP2_MASCHINE_HOST_CLIENT_TRANSPORT`` is truthy
    (``1`` / ``true`` / ``yes`` / ``on`` — case-insensitive), the
    daemon constructs ``MaschineMK1HostClientTransport`` instead of
    ``MaschineMK1UsbTransport``. The host-client facade matches the
    legacy public method shape byte-for-byte, so the daemon's read/
    write call sites are unchanged.

    Default OFF until slices 13-15 ship the host-side IPC contract +
    HID parser + bulk sink. See ``docs/midi/MASCHINE_MK1_HID_MIGRATION.md``
    for the slice-by-slice plan.
    """
    import os

    raw = os.environ.get("MAP2_MASCHINE_HOST_CLIENT_TRANSPORT", "")
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _build_maschine_mk1_transport(
    *,
    allow_kernel_detach: bool,
) -> MaschineMK1UsbTransport | MaschineMK1HostClientTransport:
    """Slice-12 factory — picks the host-client facade when the env
    flag is on, the legacy USB transport otherwise.

    The two implementations share a public surface (open/close/
    initialize_device/write_leds/write_display_frame/read_pads/
    read_buttons_encoders/is_open) so the daemon's downstream code
    doesn't branch on the choice.
    """
    if _maschine_use_host_client_transport():
        return MaschineMK1HostClientTransport()
    return MaschineMK1UsbTransport(allow_kernel_detach=allow_kernel_detach)


def _maschine_use_midi_host() -> bool:
    """T2482-P1.1 Gap D.2 (iter 47) + Gap E phase 1 (iter 51) + phase 5
    (iter 55) — env-var gate for the Maschine daemon's host shadow path.

    Default ON as of iter 51 (SHIP loop 6): when the env var is unset
    or empty, the shadow-send through the host runs alongside the
    rtmidi virtual port. Set MAP2_USE_MIDI_HOST=0 to disable the
    shadow.

    UNUSUAL CASE — iter 55 deferral:

    Unlike the other 4 P1.1 consumers, Maschine cannot strip rtmidi
    in iter 55 because the controller-host IPC schema does not yet
    expose `openVirtualOutput()` to Python. The Maschine daemon
    publishes a virtual MIDI port that downstream apps connect to
    (the `MAP2:Maschine-MK1` ALSA-seq port); creating that port
    today requires `rtmidi.MidiOut().open_virtual_port(name)`.

    The C++ side has the surface (`LibremidiAdapter::openVirtualOutput`
    in juce-engine/Source/ControllerHost/Midi/LibremidiAdapter.cpp:156)
    but no `MidiCreateVirtualPortRequest` IPC envelope wires it to
    Python. Adding that envelope is queued as a P1.2 follow-up.

    Until then:
    - Virtual-port creation: stays rtmidi (legacy production path).
    - Per-message send: runs as a host SHADOW alongside the rtmidi
      send (both paths fire concurrently when env-gate is on +
      daemon up; counter ticks for latency-floor measurement).
    - Strict mode (MAP2_REQUIRE_MIDI_HOST=1): host-shadow failure
      raises (as of iter 53); rtmidi virtual-port path still required.

    Iter 59 (drop python-rtmidi from requirements) WILL break Maschine
    until the P1.2 IPC extension lands. Tracking note added to the
    SHIP loop 6 closing log.
    """
    val = os.environ.get("MAP2_USE_MIDI_HOST", "").strip().lower()
    if val in ("0", "false", "no", "off"):
        return False
    return True  # default ON


# Stable controller_key for the Maschine MK1 surface.
_MASCHINE_CONTROLLER_KEY = "native-instruments.maschine-mk1"


class VirtualMidiOutput:
    """Maschine MK1 daemon's virtual MIDI output port.

    Two backends with the same surface (open / send_messages / close):
    - rtmidi (legacy) — opens a virtual ALSA-seq port via rtmidi.MidiOut.
    - host (T2482-P1.1) — defers virtual-port creation until the
      controller-host IPC exposes it; in the interim the host path
      ONLY routes the per-message send through MidiHostClient.send_short_message
      (the virtual port itself is still rtmidi-owned).

    Tracked under iter-41 reality audit Gap D.2; the full virtual-port
    migration awaits a `MidiCreateVirtualPortRequest` IPC schema
    extension (P1.2 follow-up).
    """

    def __init__(self, name: str) -> None:
        self.name = name
        self._port = None
        self._is_open = False
        # Lazy host client — only constructed when env-gate is on AND
        # send is called. Tests can short-circuit by patching.
        self._host_client: Any = None
        self._host_routed_sends = 0

    def _get_host_client(self) -> Any:
        if self._host_client is None:
            from app.services.midi_host_client import MidiHostClient
            self._host_client = MidiHostClient()
        return self._host_client

    def open(self) -> bool:
        # T2482-P1.2 (iter 76) — prefer the controller-host's
        # MidiCreateVirtualPortRequest IPC envelope (iter 75) over
        # rtmidi.MidiOut().open_virtual_port. The host owns libremidi's
        # virtual-port surface; using its path closes the
        # iter-50b/iter-55 deferral that left Maschine as the last
        # rtmidi-hard consumer.
        #
        # Falls back to rtmidi when the host daemon is unreachable
        # (preserves the pre-iter-76 behaviour for ad-hoc test runs +
        # CI without a running daemon). Once iter 79 drops python-rtmidi
        # from requirements, the rtmidi branch becomes unreachable in
        # production.
        if _maschine_use_midi_host():
            try:
                client = self._get_host_client()
                if client.is_daemon_available():
                    response = client.create_virtual_port(name=self.name)
                    if response.get("level") == "info":
                        # Mark the port as host-owned. send_messages()
                        # already routes via the host shadow path
                        # under the env-gate; with the port host-owned,
                        # the rtmidi local port is no longer required.
                        self._is_open = True
                        self._port = None  # signal "no rtmidi local port"
                        LOGGER.info(
                            "Published virtual MIDI port %s via controller-host",
                            self.name,
                        )
                        return True
                    LOGGER.warning(
                        "controller-host create_virtual_port returned %s: %s; "
                        "falling back to rtmidi",
                        response.get("level"), response.get("message"),
                    )
            except Exception as exc:  # pragma: no cover - daemon transient
                LOGGER.debug(
                    "controller-host create_virtual_port failed (%s)",
                    exc,
                )
        # T2482 loop 9 / iter 86: rtmidi fallback removed. The Maschine
        # daemon now requires the controller-host to publish its
        # virtual port. Daemon-down → return False (Maschine consumers
        # already check open() return value). Tests that need a
        # virtual port without the daemon should mock the host client
        # path or use the iter-76 host-owned-port path.
        LOGGER.warning(
            "Maschine daemon: controller-host did not publish virtual "
            "MIDI port; running without virtual output (iter 86 removed "
            "the rtmidi fallback)."
        )
        self._port = None
        self._is_open = False
        return False

    def send_messages(self, messages: Iterable[bytes]) -> None:
        # Iter 76: when the virtual port is host-owned (open() succeeded
        # via create_virtual_port), self._port is None but self._is_open
        # is True. The host shadow-send below carries the traffic; the
        # rtmidi send is skipped (no local port to send to).
        if not self._is_open:
            return
        # Env-gated host routing for SEND only. The virtual port itself
        # remains rtmidi-owned until the IPC schema extension lands;
        # but each per-message send can already go through the host
        # once a controller_key is established. Today the host can't
        # route to a port-name that it didn't open — so the host path
        # below is essentially "log + skip" until P1.2 wires
        # send_short_message through to a host-resolved port.
        host_routed = _maschine_use_midi_host()
        # Strict mode (Gap E phase 3 / iter 53): if the operator has
        # set MAP2_REQUIRE_MIDI_HOST=1 AND the daemon is down, raise
        # rather than silently skip the shadow path.
        if host_routed:
            from app.services.midi_host_client import (
                MidiHostClientError, midi_host_required,
            )
            if midi_host_required():
                client = self._get_host_client()
                if not client.is_daemon_available():
                    raise MidiHostClientError(
                        "MAP2_REQUIRE_MIDI_HOST set but controller-host "
                        "daemon is unreachable; refusing to skip "
                        "Maschine MK1 host shadow-send"
                    )
        for message in messages:
            try:
                if host_routed:
                    # Host send is best-effort while the virtual-port
                    # IPC is missing. We still attempt the call so the
                    # host's traffic counters tick — useful for the
                    # latency-floor measurement (Gap C / iter 50).
                    try:
                        client = self._get_host_client()
                        if client.is_daemon_available() and len(message) <= 3:
                            client.send_short_message(
                                controller_key=_MASCHINE_CONTROLLER_KEY,
                                message_bytes=bytes(message),
                            )
                            self._host_routed_sends += 1
                    except Exception:  # pragma: no cover - daemon transient
                        # Don't let a host-send failure block the rtmidi
                        # send below; we want both paths active during
                        # the transition.
                        pass
                if self._port is not None:
                    self._port.send_message(list(message))
                # else: virtual port is host-owned (iter 76); the host
                # shadow-send above carries the traffic.
            except Exception as exc:  # pragma: no cover - hardware runtime dependent
                LOGGER.debug("Failed to send MIDI message on %s: %s", self.name, exc)

    @property
    def host_routed_sends(self) -> int:
        """Counter for how many sends were also routed through the host
        in the current run. Used by tests + Gap C latency measurement
        to confirm the host path is actually being exercised."""
        return self._host_routed_sends

    def close(self) -> None:
        # iter 86: dispose_rtmidi_client removed; self._port is now
        # always None in production (host-owned port; iter 76 + iter 86).
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


def build_top_level_menu_frames(
    *,
    menu_items: list[dict[str, Any]],
    selected_index: int,
    active_context: str,
    category_label: str,
) -> dict[str, dict[str, Any]]:
    left = _Canvas()
    left.draw_text("MENU", 4, 4, scale=2)
    left.draw_hline(4, 22, 72)
    start_index = 0 if selected_index < 4 else selected_index - 3
    visible_items = menu_items[start_index:start_index + 4]
    for offset, item in enumerate(visible_items):
        index = start_index + offset
        row_y = 28 + (offset * 8)
        label = _safe_label(item.get("name") or item.get("profile_id") or "---", limit=12)
        if index == selected_index:
            left.fill_rect(2, row_y - 1, 76, 8)
            left.draw_text(label, 6, row_y)
            left.invert_rect(2, row_y - 1, 76, 8)
        else:
            left.draw_text(label, 6, row_y)

    right = _Canvas()
    selected_item = menu_items[selected_index] if 0 <= selected_index < len(menu_items) else {}
    selected_label = _safe_label(selected_item.get("name") or "---", limit=14)
    right.draw_text("LCD MENU", 4, 4)
    right.draw_hline(4, 14, LCD_WIDTH - 8)
    right.draw_text(_safe_label(selected_label, limit=14), 4, 20, scale=2)
    right.draw_text(_safe_label(category_label, limit=14), 4, 38)
    right.draw_text(f"ACTIVE {_safe_label(active_context.replace('_', ' '), limit=12)}", 4, 48)
    right.draw_text("NAV MOVE", 120, 48)
    right.draw_text("NR SEL SH+NR CAT", 4, 56)
    return {
        "left": _canvas_panel(left),
        "right": _canvas_panel(right),
    }


def build_profile_switch_osd_frames(*, profile_name: str, description: str, category: str) -> dict[str, dict[str, Any]]:
    left = _Canvas()
    left.draw_text("PROFILE", 4, 4)
    left.draw_hline(4, 14, LCD_WIDTH - 8)
    left.draw_text(_safe_label(profile_name, limit=14), 4, 20, scale=2)
    left.draw_text(_safe_label(category, limit=12), 4, 46)

    right = _Canvas()
    right.draw_text("SWITCHED", 4, 4)
    right.draw_hline(4, 14, LCD_WIDTH - 8)
    right.draw_text(_safe_label(description, limit=18), 4, 20)
    right.draw_text("NOTE REP OPEN", 4, 48)
    right.draw_text("SHIFT+NR CATEGORY", 4, 56)
    return {"left": _canvas_panel(left), "right": _canvas_panel(right)}


def build_screensaver_frames(
    *,
    profile_id: str,
    transport_state: dict[str, Any],
    backend_connected: bool,
    device_connected: bool,
    idle_seconds: float,
) -> dict[str, dict[str, Any]]:
    snapshot = build_screensaver_snapshot(
        profile_id=profile_id,
        transport_state=transport_state,
        backend_connected=backend_connected,
        device_connected=device_connected,
        idle_seconds=idle_seconds,
    )
    left = _Canvas()
    left.draw_text("AMBIENT", 4, 4, scale=2)
    left.draw_hline(4, 22, LCD_WIDTH - 8)
    left.draw_text(snapshot.profile_label, 4, 28, scale=2)
    left.draw_text(snapshot.idle_label, 4, 48)
    left.draw_text(snapshot.status_label, 4, 56)

    right = _Canvas()
    right.draw_text("PRESENCE WAKE", 4, 4)
    right.draw_hline(4, 14, LCD_WIDTH - 8)
    right.draw_text(snapshot.transport_label, 4, 22, scale=2)
    right.draw_text(snapshot.owner_label, 4, 46)
    right.draw_text(snapshot.wake_label, 4, 56)
    return {"left": _canvas_panel(left), "right": _canvas_panel(right)}


def build_boot_sequence_frames(snapshot: dict[str, Any]) -> dict[str, dict[str, Any]]:
    left = _Canvas()
    left.draw_text(_safe_label(snapshot.get("title") or "BOOT", limit=12), 4, 4, scale=2)
    left.draw_hline(4, 22, LCD_WIDTH - 8)
    left.draw_text(_safe_label(snapshot.get("subtitle") or "STARTING", limit=18), 4, 30)
    left.draw_text(_safe_label(snapshot.get("profile_label") or "CTRL", limit=16), 4, 44, scale=2)
    progress_width = 4 + int(float(snapshot.get("progress") or 0.0) * (LCD_WIDTH - 8))
    left.fill_rect(4, 56, progress_width, 4)

    right = _Canvas()
    right.draw_text("BOOT CEREMONY", 4, 4)
    right.draw_hline(4, 14, LCD_WIDTH - 8)
    right.draw_text(_safe_label(snapshot.get("backend_label") or "BACKEND", limit=16), 4, 22, scale=2)
    right.draw_text(_safe_label(snapshot.get("device_label") or "DEVICE", limit=16), 4, 40, scale=2)
    right.draw_text("ANY INPUT SKIPS", 4, 56)
    return {"left": _canvas_panel(left), "right": _canvas_panel(right)}


def build_shutdown_sequence_frames(snapshot: dict[str, Any]) -> dict[str, dict[str, Any]]:
    left = _Canvas()
    left.draw_text(_safe_label(snapshot.get("title") or "SHUTDOWN", limit=12), 4, 4, scale=2)
    left.draw_hline(4, 22, LCD_WIDTH - 8)
    left.draw_text(_safe_label(snapshot.get("subtitle") or "STOPPING", limit=18), 4, 32)
    progress_width = 4 + int(float(snapshot.get("progress") or 0.0) * (LCD_WIDTH - 8))
    left.fill_rect(4, 56, progress_width, 4)

    right = _Canvas()
    right.draw_text("SESSION CLOSE", 4, 4)
    right.draw_hline(4, 14, LCD_WIDTH - 8)
    right.draw_text(_safe_label(str(snapshot.get("stage_id") or "bye").replace("_", " "), limit=16), 4, 22, scale=2)
    right.draw_text("THANK YOU", 4, 40, scale=2)
    right.draw_text("POWER SAFE", 4, 56)
    return {"left": _canvas_panel(left), "right": _canvas_panel(right)}


def build_long_operation_frames(snapshot: MaschineLongOperationSnapshot) -> dict[str, dict[str, Any]]:
    left = _Canvas()
    left.draw_text(_safe_label(snapshot.title, limit=12), 4, 4, scale=2)
    left.draw_hline(4, 22, LCD_WIDTH - 8)
    left.draw_text(_safe_label(snapshot.subtitle, limit=18), 4, 30)
    left.draw_text(_safe_label(snapshot.detail, limit=18), 4, 44)
    progress_width = 4 + int(_clamp(int(snapshot.progress * 1000.0), 0, 1000) / 1000.0 * (LCD_WIDTH - 8))
    left.fill_rect(4, 56, progress_width, 4)

    right = _Canvas()
    status_label = str(snapshot.status or "running").replace("_", " ").upper()
    right.draw_text(_safe_label(status_label, limit=16), 4, 4)
    right.draw_hline(4, 14, LCD_WIDTH - 8)
    right.draw_text(f"{int(snapshot.progress * 100):03d}%".rjust(4), 4, 22, scale=2)
    if snapshot.can_cancel:
        right.draw_text("SHIFT+ERASE", 4, 46)
        right.draw_text("CANCEL", 4, 56)
    elif snapshot.status in {"completed", "failed", "cancelled"}:
        right.draw_text("RECEIPT", 4, 46)
        right.draw_text("PROFILE READY", 4, 56)
    else:
        right.draw_text("BACKGROUND", 4, 46)
        right.draw_text("WORK ACTIVE", 4, 56)
    return {"left": _canvas_panel(left), "right": _canvas_panel(right)}


def build_onboarding_frames(snapshot: dict[str, Any]) -> dict[str, dict[str, Any]]:
    left = _Canvas()
    left.draw_text(_safe_label(snapshot.get("title") or "WELCOME", limit=12), 4, 4, scale=2)
    left.draw_hline(4, 22, LCD_WIDTH - 8)
    left.draw_text(_safe_label(snapshot.get("subtitle") or "", limit=18), 4, 30)
    left.draw_text(_safe_label(snapshot.get("detail") or "", limit=18), 4, 44)
    progress_width = 4 + int(float(snapshot.get("progress") or 0.0) * (LCD_WIDTH - 8))
    left.fill_rect(4, 56, progress_width, 4)

    right = _Canvas()
    right.draw_text("ONBOARDING", 4, 4)
    right.draw_hline(4, 14, LCD_WIDTH - 8)
    right.draw_text(
        _safe_label(
            f"STEP {int(snapshot.get('step_number') or 1)}/{int(snapshot.get('total_steps') or 1)}",
            limit=18,
        ),
        4,
        22,
        scale=2,
    )
    right.draw_text("NR NEXT", 4, 46)
    right.draw_text("NAV BACK  ERASE SKIP", 4, 56)
    return {"left": _canvas_panel(left), "right": _canvas_panel(right)}


class MaschineMK1Daemon:
    def __init__(self, config: DaemonConfig) -> None:
        self.config = config
        self._stop_event = threading.Event()
        self._render_requested = threading.Event()
        self._state_lock = threading.Lock()
        self._state = SharedRuntimeState()
        self._state.lcd_frames = build_reconnecting_frames()
        self._menu_catalog = MaschineLCDRenderService().menu_items()
        self._boot_sequence = MaschineBootSequence()
        self._shutdown_sequence = MaschineShutdownSequence()
        self._long_operation_feedback = MaschineLongOperationFeedback()
        self._onboarding = MaschineOnboardingTour()
        self._screensaver = MaschineScreensaverState()
        self._transport: (
            MaschineMK1UsbTransport | MaschineMK1HostClientTransport | None
        ) = None
        self._midi = VirtualMidiOutput(config.virtual_port_name)
        self._hotplug_monitor = MaschineDeviceHotplugMonitor()
        self._outbound_messages: "queue.Queue[dict[str, Any]]" = queue.Queue(maxsize=BACKEND_MESSAGE_QUEUE_LIMIT)
        self._input_thread = threading.Thread(target=self._input_loop, name="maschine-input", daemon=True)
        self._display_thread = threading.Thread(target=self._display_loop, name="maschine-display", daemon=True)
        self._output_thread = threading.Thread(target=self._output_loop, name="maschine-output", daemon=True)
        self._stop_lock = threading.Lock()
        self._stop_started = False

    def run(self) -> int:
        LOGGER.info("Starting Maschine MK1 daemon")
        self._boot_sequence.start()
        with self._state_lock:
            self._state.boot_active = True
        self._record_incident(severity="info", message="Maschine boot ceremony started", event="boot_started")
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
        with self._stop_lock:
            if self._stop_started:
                return
            self._stop_started = True
        self._record_incident(severity="info", message="Maschine shutdown ceremony started", event="shutdown_started")
        self._stop_event.set()
        self._render_requested.set()
        self._hotplug_monitor.stop()
        stop_deadline = time.monotonic() + _STOP_SHUTDOWN_SEQUENCE_BUDGET_SECONDS
        for thread in (self._input_thread, self._display_thread, self._output_thread):
            if thread.is_alive():
                thread.join(timeout=_STOP_THREAD_JOIN_TIMEOUT_SECONDS)
                if thread.is_alive():
                    LOGGER.warning("Maschine daemon thread %s did not stop before shutdown deadline", thread.name)
        self._play_shutdown_sequence_directly(deadline_monotonic=stop_deadline)
        transport = self._transport
        if transport is not None:
            transport.close()
        self._midi.close()

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
                        # T2459-H4 slice 12 — flag-aware factory picks
                        # the host-client facade when
                        # MAP2_MASCHINE_HOST_CLIENT_TRANSPORT=1, else
                        # the legacy direct-USB transport.
                        transport = _build_maschine_mk1_transport(
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
        now = time.monotonic()
        if self._state.boot_active and self._refresh_boot_sequence_state(now=now):
            self._skip_boot_sequence()
            return
        if event.pressed:
            if self._refresh_onboarding_state():
                self._note_activity(now=now)
                return
            if self._screensaver.active:
                if self._screensaver.wake_from_pressure(raw_pressure=event.pressure, now=now):
                    with self._state_lock:
                        self._state.screensaver_active = False
                    self._request_render()
                return
            self._note_activity(now=now)
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
        self._fanout_pad_pressure(
            pad_index=event.pad,
            note=note,
            raw_pressure=event.pressure,
            midi_velocity=velocity_midi,
            pressed=event.pressed,
        )
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

    def _fanout_pad_pressure(
        self,
        *,
        pad_index: int,
        note: int,
        raw_pressure: int,
        midi_velocity: int,
        pressed: bool,
    ) -> None:
        normalized = max(0.0, min(1.0, float(raw_pressure) / 4095.0))
        try:
            automation_engine.push_midi_modulation(_maschine_pad_pressure_source_id(pad_index), normalized)
        except Exception as exc:
            LOGGER.debug("Maschine pad pressure automation fanout failed: %s", exc)
        try:
            get_sequencer_service().record_pad_pressure(
                pad=pad_index,
                pressure=raw_pressure,
                normalized=normalized,
                velocity=midi_velocity,
                note=note,
                pressed=pressed,
            )
        except Exception as exc:
            LOGGER.debug("Maschine pad pressure brain fanout failed: %s", exc)

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
        if pressed and self._state.boot_active and self._refresh_boot_sequence_state(now=time.monotonic()):
            self._skip_boot_sequence()
            return
        if pressed:
            now = time.monotonic()
            if self._wake_screensaver(now=now):
                return
            self._note_activity(now=now)

        if pressed and self._refresh_onboarding_state():
            if button == int(Button.NoteRepeat):
                self._advance_onboarding()
            elif button == int(Button.Navigate):
                self._retreat_onboarding()
            elif button == int(Button.Erase):
                self._skip_onboarding()
            return

        if pressed and shift and button == int(Button.Erase):
            if self._cancel_active_long_operation(client):
                return

        with self._state_lock:
            display_context = self._state.display_context

        if pressed and shift and button == int(Button.Control):
            self._open_admin_console()
            return

        if pressed and display_context == "t18_admin_console":
            if button == int(Button.NoteRepeat):
                self._confirm_admin_console_action(client)
                return
            if button == int(Button.Erase):
                self._cancel_admin_console_action(client)
                return

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

        # Direct profile selectors + menu navigation
        if button == int(Button.Control) and pressed:
            with self._state_lock:
                in_menu = self._state.display_context == "menu"
            if in_menu:
                self._close_top_level_menu()
            else:
                self._set_display_context("t1_ctrl", show_osd=True)
        elif button == int(Button.Step) and pressed:
            self._set_display_context("t9_effect_chain_editor", show_osd=True)
        elif button == int(Button.AutoWrite) and pressed:
            self._set_display_context("t16_monitor", show_osd=True)
        elif button == int(Button.Navigate) and pressed:
            if shift:
                self._cycle_inspection_mode()
            else:
                self._open_top_level_menu()
        elif button == int(Button.NoteRepeat) and pressed:
            if shift:
                self._cycle_menu_category(activate=False)
            else:
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
        now = time.monotonic()
        if self._state.boot_active and self._refresh_boot_sequence_state(now=now):
            self._skip_boot_sequence()
            return
        if self._wake_screensaver(now=now):
            return
        self._note_activity(now=now)
        if self._refresh_onboarding_state():
            if delta.direction > 0:
                self._advance_onboarding()
            elif delta.direction < 0:
                self._retreat_onboarding()
            return
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
                        self._record_incident(
                            severity="info",
                            message="Maschine backend websocket connected",
                            detail=self.config.backend_url,
                            event="backend_ws_connected",
                        )
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
                    self._record_incident(
                        severity="warn",
                        message="Maschine backend websocket disconnected",
                        detail=str(exc),
                        event="backend_ws_disconnected",
                        context={"backend_url": self.config.backend_url},
                    )
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
        now = time.monotonic()
        wall_clock_now = time.time()
        long_operation_snapshot = self._long_operation_feedback.snapshot(now=now)

        with self._state_lock:
            transport_state = dict(self._state.transport_state)
            drum_transport_state = dict(self._state.drum_transport_state)
            backend_connected = bool(self._state.backend_connected)
            device_connected = bool(self._state.device_connected)
            display_context = str(self._state.display_context or "t1_ctrl")
            menu_category_index = self._state.menu_category_index
            menu_return_context = str(self._state.menu_return_context or "t1_ctrl")
            inspection_mode = str(self._state.inspection_mode or "off")
            profile_switch_osd_until = self._state.profile_switch_osd_until
            profile_switch_osd_profile_id = self._state.profile_switch_osd_profile_id
            current_audio_grid = dict(self._state.audio_grid)
            current_encoder_map = dict(self._state.encoder_map)
            automation_parameter_ids = list(self._state.automation_parameter_ids)
            audio_levels_state = dict(self._state.audio_levels_state)
            spectrum_state = dict(self._state.spectrum_state)
            true_peak_state = dict(self._state.true_peak_state)
            brain_state = dict(self._state.brain_state)
            brain_sequence_state = dict(self._state.brain_sequence_state)
            beat_anchor_monotonic = float(self._state.beat_anchor_monotonic or 0.0)
            screensaver_active = bool(self._state.screensaver_active)
            platform_event_overlay = dict(self._state.platform_event_overlay)
            boot_active = bool(self._state.boot_active)
            onboarding_active = bool(self._state.onboarding_active)
            admin_console_state = dict(self._state.admin_console_state)

        effective_transport_state = dict(drum_transport_state)
        effective_transport_state.update(transport_state)

        if boot_active:
            snapshot = self._boot_sequence.snapshot(
                profile_id=display_context,
                backend_connected=backend_connected,
                device_connected=device_connected,
                now=now,
            )
            for index, pad_entry in enumerate(build_boot_pad_overlay(stage_index=int(snapshot["stage_index"]), stage_progress=float(snapshot["stage_progress"]), pad_count=16)):
                led[LED_PAD_INDEX[index]] = normalize_pad_led_entry(pad_entry, now=now, phase_offset=(index / 16.0))
            for button_index, entry in build_boot_button_overrides(
                stage_id=str(snapshot["stage_id"]),
                backend_connected=backend_connected,
                device_connected=device_connected,
            ).items():
                led[button_index] = max(
                    led[button_index],
                    resolve_led_value(
                        level=str(entry.get("level") or "off"),
                        animation=str(entry.get("animation") or "steady"),
                        now=now,
                        phase_offset=0.0,
                    ),
            )
            led[int(Led.DisplayBacklight)] = LED_BACKLIGHT_DEFAULT
            return led

        if onboarding_active:
            snapshot = self._onboarding.snapshot()
            for index, pad_entry in enumerate(
                build_onboarding_pad_overlay(
                    step_index=int(snapshot.get("step_index") or 0),
                    total_steps=int(snapshot.get("total_steps") or 0),
                    pad_count=16,
                )
            ):
                led[LED_PAD_INDEX[index]] = normalize_pad_led_entry(pad_entry, now=now, phase_offset=(index / 16.0))
            for button_index, entry in build_onboarding_button_overrides(
                can_go_back=bool(snapshot.get("can_go_back")),
            ).items():
                led[button_index] = max(
                    led[button_index],
                    resolve_led_value(
                        level=str(entry.get("level") or "off"),
                        animation=str(entry.get("animation") or "steady"),
                        now=now,
                        phase_offset=0.0,
                    ),
                )
            led[int(Led.DisplayBacklight)] = LED_BACKLIGHT_DEFAULT
            return led

        if screensaver_active and long_operation_snapshot is None:
            pads = build_screensaver_pad_overlay(now=now, pad_count=16)
            for i, pad_entry in enumerate(pads[:16]):
                brightness = normalize_pad_led_entry(pad_entry, now=now, phase_offset=(i / 16.0))
                if i < len(LED_PAD_INDEX):
                    led[LED_PAD_INDEX[i]] = _clamp(brightness, 0, 255)
            for button_index, entry in build_screensaver_button_overrides(
                backend_connected=backend_connected,
                device_connected=device_connected,
                transport_state=effective_transport_state,
            ).items():
                led[button_index] = max(
                    led[button_index],
                    resolve_led_value(
                        level=str(entry.get("level") or "off"),
                        animation=str(entry.get("animation") or "steady"),
                        now=now,
                        phase_offset=0.0,
                    ),
                )
            led[int(Led.DisplayBacklight)] = LED_BACKLIGHT_DEFAULT
            return led

        pads = self._apply_choreography_pads(
            list(led_state.get("pads") or []),
            display_context=display_context,
            drum_transport_state=effective_transport_state,
            audio_levels_state=audio_levels_state,
            spectrum_state=spectrum_state,
            brain_state=brain_state,
            brain_sequence_state=brain_sequence_state,
            beat_anchor_monotonic=beat_anchor_monotonic,
            now=now,
        )
        pads = self._apply_led_overlays(
            pads,
            audio_grid=current_audio_grid,
            encoder_map=current_encoder_map,
            automation_parameter_ids=automation_parameter_ids,
            inspection_mode=inspection_mode,
            profile_switch_osd_profile_id=profile_switch_osd_profile_id,
            profile_switch_osd_until=profile_switch_osd_until,
            now=now,
        )
        pads = self._apply_platform_event_overlay_pads(
            pads,
            overlay_state=platform_event_overlay,
            now=wall_clock_now,
        )
        for i, pad_entry in enumerate(pads[:16]):
            if not isinstance(pad_entry, dict):
                continue
            brightness = normalize_pad_led_entry(pad_entry, now=now, phase_offset=(i / 16.0))
            if i < len(LED_PAD_INDEX):
                led[LED_PAD_INDEX[i]] = _clamp(brightness, 0, 255)

        if effective_transport_state:
            is_playing = bool(effective_transport_state.get("is_playing"))
            is_recording = bool(effective_transport_state.get("is_recording"))
            is_looping = bool(effective_transport_state.get("is_looping"))

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

        led[int(Led.Navigate)] = max(
            led[int(Led.Navigate)],
            resolve_led_value(
                level="mid" if backend_connected else "dim",
                animation="heartbeat" if backend_connected else "blink_slow",
                now=now,
                phase_offset=0.0,
            ),
        )
        led[int(Led.NoteRepeat)] = max(
            led[int(Led.NoteRepeat)],
            resolve_led_value(
                level=(
                    "full" if display_context == "t18_admin_console" else
                    ("bright" if display_context == "menu" else "mid")
                ),
                animation=(
                    "double_pulse" if display_context == "t18_admin_console" and not bool(admin_console_state.get("session_unlocked")) else
                    ("steady" if display_context in {"menu", "t18_admin_console"} else "pulse_slow")
                ),
                now=now,
                phase_offset=0.15,
            ),
        )
        led[int(Led.Control)] = max(
            led[int(Led.Control)],
            resolve_led_value(
                level=(
                    "full" if display_context in {"t1_ctrl", "t18_admin_console"} else
                    ("bright" if device_connected else "dim")
                ),
                animation=(
                    "double_pulse" if display_context == "t18_admin_console" else
                    ("steady" if display_context == "t1_ctrl" else ("pulse_fast" if device_connected else "blink_slow"))
                ),
                now=now,
                phase_offset=0.25,
            ),
        )
        led[int(Led.Step)] = max(
            led[int(Led.Step)],
            resolve_led_value(
                level="full" if display_context == "t9_effect_chain_editor" else "off",
                animation="steady",
                now=now,
                phase_offset=0.0,
            ),
        )
        led[int(Led.AutoWrite)] = max(
            led[int(Led.AutoWrite)],
            resolve_led_value(
                level="full" if display_context == "t16_monitor" else "off",
                animation="steady",
                now=now,
                phase_offset=0.0,
            ),
        )
        if display_context == "t18_admin_console":
            led[int(Led.Erase)] = max(
                led[int(Led.Erase)],
                resolve_led_value(
                    level="bright" if bool(admin_console_state.get("session_unlocked")) else "dim",
                    animation="steady",
                    now=now,
                    phase_offset=0.0,
                ),
            )
        self._apply_choreography_leds(
            led,
            display_context=display_context,
            drum_transport_state=effective_transport_state,
            audio_levels_state=audio_levels_state,
            true_peak_state=true_peak_state,
            brain_state=brain_state,
            brain_sequence_state=brain_sequence_state,
            beat_anchor_monotonic=beat_anchor_monotonic,
            now=now,
        )

        active_category_context = menu_return_context if display_context == "menu" else display_context
        self._apply_category_leds(
            led,
            display_context=display_context,
            active_context=active_category_context,
            menu_category_index=menu_category_index,
            inspection_mode=inspection_mode,
            now=now,
        )

        # Display backlight always on
        led[int(Led.DisplayBacklight)] = LED_BACKLIGHT_DEFAULT

        if long_operation_snapshot is not None:
            self._apply_long_operation_leds(
                led,
                snapshot=long_operation_snapshot,
                now=now,
            )

        self._apply_platform_event_overlay_leds(
            led,
            overlay_state=platform_event_overlay,
            now=wall_clock_now,
        )

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
        startup_progress = self._poll_startup_progress(client)
        cluster_update_status = self._poll_cluster_update_status(client)
        plugin_scan_status = self._poll_plugin_scan_status(client)
        admin_console_state = self._poll_admin_console_state(client)
        automation_parameter_ids = self._poll_automation_parameter_ids(client)
        audio_levels_state = self._poll_audio_levels(client)
        spectrum_state = self._poll_spectrum_state(client)
        true_peak_state = self._poll_true_peak_state(client)
        drum_transport_state = self._poll_drum_transport_state(client)

        with self._state_lock:
            active_context = (
                str(self._state.menu_return_context or "t1_ctrl")
                if self._state.display_context == "menu"
                else str(self._state.display_context or "t1_ctrl")
            )
        brain_state = self._poll_brain_state(client) if is_brain_profile(active_context) else {}
        brain_sequence_state = self._poll_brain_sequence_state(client) if is_brain_profile(active_context) else {}

        self._update_polled_state(
            audio_grid=audio_grid,
            encoder_map=encoder_map,
            stats_payload=stats_payload,
            admin_console_state=admin_console_state,
            automation_parameter_ids=automation_parameter_ids,
            audio_levels_state=audio_levels_state,
            spectrum_state=spectrum_state,
            true_peak_state=true_peak_state,
            drum_transport_state=drum_transport_state,
            brain_state=brain_state,
            brain_sequence_state=brain_sequence_state,
        )
        feedback_now = time.monotonic()
        self._long_operation_feedback.observe_startup_progress(startup_progress, now=feedback_now)
        self._long_operation_feedback.observe_update_status(cluster_update_status, now=feedback_now)
        self._long_operation_feedback.observe_plugin_scan_status(plugin_scan_status, now=feedback_now)
        boot_active = self._refresh_boot_sequence_state()
        with self._state_lock:
            reconnecting_now = bool(self._state.reconnecting)
            backend_connected_now = bool(self._state.backend_connected)
        if not boot_active and not reconnecting_now and backend_connected_now:
            self._activate_onboarding_if_needed()
        onboarding_active = self._refresh_onboarding_state()
        screensaver_active = self._refresh_screensaver_state()
        long_operation_snapshot = self._long_operation_feedback.snapshot(now=feedback_now)

        with self._state_lock:
            reconnecting = self._state.reconnecting
            display_context = self._state.display_context
            menu_return_context = self._state.menu_return_context
            menu_category_index = self._state.menu_category_index
            top_level_menu_index = self._state.top_level_menu_index
            focus_metric = self._state.stats_focus_metric
            led_state = dict(self._state.led_state)
            platform_event_overlay = dict(self._state.platform_event_overlay)
            profile_switch_osd_until = self._state.profile_switch_osd_until
            profile_switch_osd_profile_id = self._state.profile_switch_osd_profile_id
            backend_connected = bool(self._state.backend_connected)
            device_connected = bool(self._state.device_connected)
            effective_transport_state = dict(self._state.drum_transport_state)
            effective_transport_state.update(self._state.transport_state)

        if boot_active:
            active_context = menu_return_context if display_context == "menu" else display_context
            frames = build_boot_sequence_frames(
                self._boot_sequence.snapshot(
                    profile_id=str(active_context or "t1_ctrl"),
                    backend_connected=backend_connected,
                    device_connected=device_connected,
                )
            )
        elif reconnecting:
            frames = build_reconnecting_frames()
        elif onboarding_active:
            frames = build_onboarding_frames(self._onboarding.snapshot())
        elif long_operation_snapshot is not None:
            frames = build_long_operation_frames(long_operation_snapshot)
        elif self._platform_event_overlay_is_active(platform_event_overlay, now=time.time()):
            frames = dict(platform_event_overlay.get("lcd") or {}) or build_reconnecting_frames()
        elif screensaver_active:
            idle_seconds = self._screensaver.idle_seconds()
            active_context = menu_return_context if display_context == "menu" else display_context
            frames = build_screensaver_frames(
                profile_id=str(active_context or "t1_ctrl"),
                transport_state=effective_transport_state,
                backend_connected=backend_connected,
                device_connected=device_connected,
                idle_seconds=idle_seconds,
            )
        elif display_context == "menu":
            menu_items, category_label = self._menu_items_for_category_index(menu_category_index)
            frames = build_top_level_menu_frames(
                menu_items=menu_items,
                selected_index=top_level_menu_index,
                active_context=menu_return_context,
                category_label=category_label,
            )
        elif profile_switch_osd_profile_id and time.monotonic() < profile_switch_osd_until:
            profile_meta = self._profile_meta(profile_switch_osd_profile_id)
            frames = build_profile_switch_osd_frames(
                profile_name=str(profile_meta.get("name") or profile_switch_osd_profile_id),
                description=str(profile_meta.get("description") or "Profile ready"),
                category=str(profile_meta.get("category") or "Profile"),
            )
        else:
            rendered = self._poll_profile_render(
                client,
                profile_id=display_context,
                focus_metric=focus_metric,
            )
            frames = rendered or build_reconnecting_frames()

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

    def _poll_startup_progress(self, client: httpx.Client) -> dict[str, Any]:
        try:
            response = client.get("/api/services/startup-order")
            response.raise_for_status()
            payload = response.json()
            return dict(payload.get("startup_progress") or {})
        except Exception as exc:
            LOGGER.debug("Startup progress poll failed: %s", exc)
            return {}

    def _poll_cluster_update_status(self, client: httpx.Client) -> dict[str, Any]:
        try:
            response = client.get("/api/cluster/update/status")
            response.raise_for_status()
            return dict(response.json() or {})
        except Exception as exc:
            LOGGER.debug("Cluster update status poll failed: %s", exc)
            return {}

    def _poll_plugin_scan_status(self, client: httpx.Client) -> dict[str, Any]:
        try:
            response = client.get("/api/plugins/scan-status")
            response.raise_for_status()
            return dict(response.json() or {})
        except Exception as exc:
            LOGGER.debug("Plugin scan status poll failed: %s", exc)
            return {}

    def _poll_admin_console_state(self, client: httpx.Client) -> dict[str, Any]:
        try:
            response = client.get("/api/maschine/admin-console")
            response.raise_for_status()
            payload = response.json()
            return dict(payload.get("admin_console") or {})
        except Exception as exc:
            LOGGER.debug("Admin console poll failed: %s", exc)
            return {}

    def _poll_automation_parameter_ids(self, client: httpx.Client) -> list[str]:
        try:
            response = client.get("/api/automation/lanes")
            response.raise_for_status()
            payload = response.json()
            return [
                str(parameter_id)
                for parameter_id in payload.get("parameters", [])
                if str(parameter_id or "").strip()
            ]
        except Exception as exc:
            LOGGER.debug("Automation lane poll failed: %s", exc)
            return []

    def _poll_audio_levels(self, client: httpx.Client) -> dict[str, Any]:
        try:
            response = client.get("/api/audio/levels")
            response.raise_for_status()
            return dict(response.json() or {})
        except Exception as exc:
            LOGGER.debug("Audio levels poll failed: %s", exc)
            return {}

    def _poll_spectrum_state(self, client: httpx.Client) -> dict[str, Any]:
        try:
            response = client.get("/api/engine/spectrum")
            response.raise_for_status()
            return dict(response.json() or {})
        except Exception as exc:
            LOGGER.debug("Spectrum poll failed: %s", exc)
            return {}

    def _poll_true_peak_state(self, client: httpx.Client) -> dict[str, Any]:
        try:
            response = client.get("/api/engine/loudness/true-peak")
            response.raise_for_status()
            return dict(response.json() or {})
        except Exception as exc:
            LOGGER.debug("True-peak poll failed: %s", exc)
            return {}

    def _poll_drum_transport_state(self, client: httpx.Client) -> dict[str, Any]:
        try:
            response = client.get("/api/engine/drums/transport")
            response.raise_for_status()
            return dict(response.json() or {})
        except Exception as exc:
            LOGGER.debug("Drum transport poll failed: %s", exc)
            return {}

    def _poll_brain_state(self, client: httpx.Client) -> dict[str, Any]:
        try:
            response = client.get("/api/engine/sequencer/state")
            response.raise_for_status()
            return dict(response.json() or {})
        except Exception as exc:
            LOGGER.debug("Sequencer state poll failed: %s", exc)
            return {}

    def _poll_brain_sequence_state(self, client: httpx.Client) -> dict[str, Any]:
        try:
            response = client.get("/api/engine/sequencer/sequence")
            response.raise_for_status()
            return dict(response.json() or {})
        except Exception as exc:
            LOGGER.debug("Sequencer sequence poll failed: %s", exc)
            return {}

    def _update_polled_state(
        self,
        *,
        audio_grid: dict[str, Any],
        encoder_map: dict[str, Any],
        stats_payload: dict[str, Any],
        admin_console_state: dict[str, Any],
        automation_parameter_ids: list[str],
        audio_levels_state: dict[str, Any],
        spectrum_state: dict[str, Any],
        true_peak_state: dict[str, Any],
        drum_transport_state: dict[str, Any],
        brain_state: dict[str, Any],
        brain_sequence_state: dict[str, Any],
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
            if admin_console_state:
                self._state.admin_console_state = dict(admin_console_state)
            self._state.automation_parameter_ids = list(automation_parameter_ids)
            if audio_levels_state:
                self._state.audio_levels_state = dict(audio_levels_state)
            if spectrum_state:
                self._state.spectrum_state = dict(spectrum_state)
            if true_peak_state:
                self._state.true_peak_state = dict(true_peak_state)
            if drum_transport_state:
                previous_transport = dict(self._state.drum_transport_state)
                previous_playing = bool(previous_transport.get("is_playing"))
                previous_bpm = _safe_float(previous_transport.get("bpm"), 0.0)
                next_playing = bool(drum_transport_state.get("is_playing"))
                next_bpm = _safe_float(drum_transport_state.get("bpm"), 0.0)
                if next_playing and (not previous_playing or abs(next_bpm - previous_bpm) >= 0.5):
                    self._state.beat_anchor_monotonic = time.monotonic()
                elif not next_playing:
                    self._state.beat_anchor_monotonic = 0.0
                self._state.drum_transport_state = dict(drum_transport_state)
            if brain_state:
                self._state.brain_state = dict(brain_state)
            if brain_sequence_state:
                self._state.brain_sequence_state = dict(brain_sequence_state)

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
                if isinstance(state.get("platform_event_overlay"), dict):
                    self._state.platform_event_overlay = dict(state["platform_event_overlay"])
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
                if isinstance(data.get("platform_event_overlay"), dict):
                    self._state.platform_event_overlay = dict(data["platform_event_overlay"])
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

    @staticmethod
    def _record_incident(
        *,
        severity: str,
        message: str,
        detail: str | None = None,
        event: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        try:
            get_maschine_incident_log_service().append(
                severity=severity,
                source="maschine-daemon",
                message=message,
                detail=detail,
                event=event,
                context=context,
            )
        except Exception as exc:
            LOGGER.debug("Maschine incident log append failed: %s", exc)

    def _refresh_screensaver_state(self, *, now: float | None = None) -> bool:
        active = self._screensaver.update(now=now)
        with self._state_lock:
            self._state.screensaver_active = active
        return active

    def _refresh_boot_sequence_state(self, *, now: float | None = None) -> bool:
        active = self._boot_sequence.is_active(now=now)
        with self._state_lock:
            previous = bool(self._state.boot_active)
            self._state.boot_active = active
        if previous and not active and not self._boot_sequence.skipped:
            self._record_incident(severity="info", message="Maschine boot ceremony completed", event="boot_completed")
        return active

    def _skip_boot_sequence(self) -> bool:
        skipped = self._boot_sequence.skip()
        with self._state_lock:
            self._state.boot_active = False
        if skipped:
            self._record_incident(severity="info", message="Maschine boot ceremony skipped", event="boot_skipped")
            self._request_render()
        return skipped

    def _wake_screensaver(self, *, now: float | None = None) -> bool:
        woke = self._screensaver.wake(now=now)
        with self._state_lock:
            self._state.screensaver_active = False
        if woke:
            self._request_render()
        return woke

    def _note_activity(self, *, now: float | None = None) -> None:
        self._screensaver.note_activity(now=now)
        with self._state_lock:
            self._state.screensaver_active = False

    def _refresh_onboarding_state(self) -> bool:
        active = self._onboarding.is_active()
        with self._state_lock:
            self._state.onboarding_active = active
        return active

    def _activate_onboarding_if_needed(self) -> bool:
        changed = self._onboarding.activate_if_needed()
        active = self._onboarding.is_active()
        with self._state_lock:
            self._state.onboarding_active = active
        if changed:
            snapshot = self._onboarding.snapshot()
            event = "onboarding_resumed" if int(snapshot.get("step_index") or 0) > 0 else "onboarding_started"
            self._record_incident(
                severity="info",
                message="Maschine onboarding tour activated",
                event=event,
                context={"step_index": int(snapshot.get("step_index") or 0)},
            )
            self._request_render()
        return active

    def _advance_onboarding(self) -> bool:
        if not self._onboarding.advance():
            return False
        active = self._onboarding.is_active()
        with self._state_lock:
            self._state.onboarding_active = active
        if active:
            snapshot = self._onboarding.snapshot()
            self._record_incident(
                severity="info",
                message="Maschine onboarding advanced",
                event="onboarding_advanced",
                context={"step_index": int(snapshot.get("step_index") or 0)},
            )
        else:
            self._record_incident(
                severity="info",
                message="Maschine onboarding completed",
                event="onboarding_completed",
            )
        self._request_render()
        return True

    def _retreat_onboarding(self) -> bool:
        if not self._onboarding.previous():
            return False
        with self._state_lock:
            self._state.onboarding_active = True
        self._record_incident(
            severity="info",
            message="Maschine onboarding moved backward",
            event="onboarding_back",
            context={"step_index": int(self._onboarding.snapshot().get("step_index") or 0)},
        )
        self._request_render()
        return True

    def _skip_onboarding(self) -> bool:
        skipped = self._onboarding.skip()
        with self._state_lock:
            self._state.onboarding_active = False
        if skipped:
            self._record_incident(
                severity="warn",
                message="Maschine onboarding skipped",
                event="onboarding_skipped",
            )
            self._request_render()
        return skipped

    def _play_shutdown_sequence_directly(self, *, deadline_monotonic: float | None = None) -> None:
        transport = self._transport
        if transport is None or not transport.is_open:
            self._record_incident(severity="info", message="Maschine shutdown ceremony completed", event="shutdown_completed")
            return
        try:
            snapshots = self._shutdown_sequence.stage_snapshots()
            remaining_stages = len(snapshots)
            for snapshot in snapshots:
                remaining_budget = None if deadline_monotonic is None else max(0.0, deadline_monotonic - time.monotonic())
                if remaining_budget is not None and remaining_budget <= 0.0:
                    LOGGER.warning("Skipping remaining shutdown ceremony stages because the stop budget was exhausted")
                    break
                frames = build_shutdown_sequence_frames(snapshot)
                led = [0] * LED_DATA_SIZE
                now = time.monotonic()
                for index, pad_entry in enumerate(build_shutdown_pad_overlay(stage_index=int(snapshot["stage_index"]), pad_count=16)):
                    led[LED_PAD_INDEX[index]] = normalize_pad_led_entry(pad_entry, now=now, phase_offset=(index / 16.0))
                for button_index, entry in build_shutdown_button_overrides(stage_id=str(snapshot["stage_id"])).items():
                    led[button_index] = max(
                        led[button_index],
                        resolve_led_value(
                            level=str(entry.get("level") or "off"),
                            animation=str(entry.get("animation") or "steady"),
                            now=now,
                            phase_offset=0.0,
                        ),
                    )
                led[int(Led.DisplayBacklight)] = LED_BACKLIGHT_DEFAULT
                transport.write_leds(led, timeout_ms=_STOP_SHUTDOWN_WRITE_TIMEOUT_MS)
                transport.write_display_frame(
                    0,
                    bytes.fromhex(str(frames["left"].get("framebuffer") or "")),
                    timeout_ms=_STOP_SHUTDOWN_WRITE_TIMEOUT_MS,
                )
                transport.write_display_frame(
                    1,
                    bytes.fromhex(str(frames["right"].get("framebuffer") or "")),
                    timeout_ms=_STOP_SHUTDOWN_WRITE_TIMEOUT_MS,
                )
                if remaining_budget is not None:
                    hold_seconds = min(
                        float(snapshot["duration_seconds"]),
                        max(
                            _STOP_SHUTDOWN_STAGE_MIN_SECONDS,
                            remaining_budget / max(1, remaining_stages),
                        ),
                    )
                else:
                    hold_seconds = float(snapshot["duration_seconds"])
                time.sleep(max(_STOP_SHUTDOWN_STAGE_MIN_SECONDS, hold_seconds))
                remaining_stages = max(0, remaining_stages - 1)
        except Exception as exc:
            LOGGER.debug("Shutdown ceremony playback failed: %s", exc)
        self._record_incident(severity="info", message="Maschine shutdown ceremony completed", event="shutdown_completed")

    def _set_device_connected(self, connected: bool) -> None:
        with self._state_lock:
            previous = bool(self._state.device_connected)
            self._state.device_connected = bool(connected)
            if not connected:
                self._state.reconnecting = True
        if previous != bool(connected):
            self._record_incident(
                severity="info" if connected else "warn",
                message="Maschine device connected" if connected else "Maschine device disconnected",
                event="device_connected" if connected else "device_disconnected",
            )
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

    def _visible_menu_catalog(self) -> list[dict[str, Any]]:
        admin_unlocked = bool((self._state.admin_console_state or {}).get("session_unlocked"))
        return [
            item
            for item in self._menu_catalog
            if (
                not bool(item.get("hidden_from_cycle"))
                or (admin_unlocked and bool(item.get("admin_only")))
            )
            and (admin_unlocked or not bool(item.get("admin_only")))
        ]

    def _menu_categories(self) -> list[str]:
        categories = {
            str(item.get("category") or "Other")
            for item in self._visible_menu_catalog()
        }
        ordered = [category for category in _CATEGORY_ORDER if category in categories]
        extras = sorted(category for category in categories if category not in _CATEGORY_ORDER)
        return ordered + extras or ["Control"]

    def _menu_items_for_category(self, category: str) -> list[dict[str, Any]]:
        return [
            item
            for item in self._visible_menu_catalog()
            if str(item.get("category") or "") == category
        ]

    def _menu_items_for_category_index(self, category_index: int) -> tuple[list[dict[str, Any]], str]:
        categories = self._menu_categories()
        normalized_index = _clamp(category_index, 0, len(categories) - 1) if categories else 0
        category = categories[normalized_index] if categories else "Control"
        items = self._menu_items_for_category(category)
        if items:
            return items, category
        fallback = self._visible_menu_catalog()
        return fallback, category

    def _profile_meta(self, profile_id: str) -> dict[str, Any]:
        for item in self._menu_catalog:
            if str(item.get("profile_id") or "") == profile_id:
                return item
        return {}

    def _resolve_display_context(self, context: str) -> str:
        resolved = str(context or "").strip()
        if self._profile_meta(resolved):
            return resolved
        return "t1_ctrl"

    def _menu_position_for_context(self, context: str) -> tuple[int, int]:
        resolved = self._resolve_display_context(context)
        target = self._profile_meta(resolved)
        categories = self._menu_categories()
        if not target:
            return 0, 0
        category = str(target.get("category") or "")
        if category in categories:
            category_index = categories.index(category)
            items = self._menu_items_for_category(category)
            for index, item in enumerate(items):
                if str(item.get("profile_id") or "") == resolved:
                    return category_index, index
            return category_index, 0
        return 0, 0

    def _show_profile_switch_osd(self, profile_id: str) -> None:
        self._state.profile_switch_osd_profile_id = profile_id
        self._state.profile_switch_osd_until = time.monotonic() + _PROFILE_SWITCH_OSD_SECONDS

    def _set_display_context(self, context: str, *, show_osd: bool = False) -> None:
        resolved = self._resolve_display_context(context)
        category_index, item_index = self._menu_position_for_context(resolved)
        with self._state_lock:
            self._state.display_context = resolved
            self._state.menu_return_context = resolved
            self._state.menu_category_index = category_index
            self._state.top_level_menu_index = item_index
            if show_osd:
                self._show_profile_switch_osd(resolved)
        self._request_render()

    def _toggle_display_context(self) -> None:
        self._cycle_menu_category(activate=True)

    def _open_top_level_menu(self) -> None:
        default_context = "t1_ctrl"
        with self._state_lock:
            current_context = self._state.display_context
            if current_context != "menu":
                self._state.menu_return_context = self._resolve_display_context(current_context)
            elif not self._profile_meta(self._state.menu_return_context):
                self._state.menu_return_context = default_context
            self._state.display_context = "menu"
            category_index, item_index = self._menu_position_for_context(self._state.menu_return_context)
            self._state.menu_category_index = category_index
            self._state.top_level_menu_index = item_index
        self._request_render()

    def _close_top_level_menu(self) -> None:
        with self._state_lock:
            resolved = self._resolve_display_context(self._state.menu_return_context)
            category_index, item_index = self._menu_position_for_context(resolved)
            self._state.display_context = resolved
            self._state.menu_return_context = resolved
            self._state.menu_category_index = category_index
            self._state.top_level_menu_index = item_index
        self._request_render()

    def _activate_top_level_menu_selection(self) -> None:
        with self._state_lock:
            category_index = self._state.menu_category_index
            item_index = self._state.top_level_menu_index
        menu_items, _category_label = self._menu_items_for_category_index(category_index)
        if not menu_items:
            return
        selected_index = _clamp(item_index, 0, len(menu_items) - 1)
        selected_context = str(menu_items[selected_index].get("profile_id") or "t1_ctrl")
        self._set_display_context(selected_context, show_osd=True)

    def _cycle_menu_category(self, *, activate: bool) -> None:
        categories = self._menu_categories()
        if not categories:
            return
        with self._state_lock:
            current_context = self._state.menu_return_context if self._state.display_context == "menu" else self._state.display_context
            current_category_index, _item_index = self._menu_position_for_context(current_context)
            next_category_index = (current_category_index + 1) % len(categories)
            next_items, _category_label = self._menu_items_for_category_index(next_category_index)
            if not next_items:
                return
            next_context = str(next_items[0].get("profile_id") or "t1_ctrl")
            if self._state.display_context == "menu" and not activate:
                self._state.menu_return_context = next_context
                self._state.menu_category_index = next_category_index
                self._state.top_level_menu_index = 0
            else:
                self._state.display_context = next_context
                self._state.menu_return_context = next_context
                self._state.menu_category_index = next_category_index
                self._state.top_level_menu_index = 0
                self._show_profile_switch_osd(next_context)
        self._request_render()

    def _cycle_inspection_mode(self) -> None:
        with self._state_lock:
            current = str(self._state.inspection_mode or "off")
            try:
                index = _INSPECTION_MODES.index(current)
            except ValueError:
                index = 0
            self._state.inspection_mode = _INSPECTION_MODES[(index + 1) % len(_INSPECTION_MODES)]
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
            current_menu_category_index = self._state.menu_category_index
            current_menu_index = self._state.top_level_menu_index
        if display_context == "t18_admin_console":
            self._select_relative_admin_console_action(client, delta)
            return
        if display_context == "menu":
            menu_items, _category_label = self._menu_items_for_category_index(current_menu_category_index)
            if not menu_items:
                return
            with self._state_lock:
                self._state.top_level_menu_index = (current_menu_index + delta) % len(menu_items)
            self._request_render()
            return
        if display_context == "t16_monitor":
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

    @staticmethod
    def _parse_automation_parameter_id(parameter_id: str) -> tuple[str, int | None]:
        raw = str(parameter_id or "").strip()
        if not raw:
            return "", None
        base, _, position_suffix = raw.rpartition("@")
        candidate = base if position_suffix else raw
        plugin_position = None
        if position_suffix:
            try:
                plugin_position = int(position_suffix)
            except ValueError:
                plugin_position = None
        plugin_uri, _, _param_index = candidate.rpartition(":")
        return plugin_uri or candidate, plugin_position

    @classmethod
    def _assigned_block_ids(cls, encoder_map: dict[str, Any]) -> set[str]:
        return {
            str(entry.get("block_id"))
            for entry in encoder_map.values()
            if isinstance(entry, dict) and str(entry.get("block_id") or "").strip()
        }

    @classmethod
    def _automated_block_ids(cls, audio_grid: dict[str, Any], automation_parameter_ids: list[str]) -> set[str]:
        blocks = [block for block in audio_grid.get("blocks", []) if isinstance(block, dict)]
        automated_targets = {cls._parse_automation_parameter_id(parameter_id) for parameter_id in automation_parameter_ids}
        automated_blocks: set[str] = set()
        for block in blocks:
            plugin_uri = str(block.get("plugin_uri") or "").strip()
            plugin_position_raw = block.get("plugin_position")
            plugin_position = plugin_position_raw if isinstance(plugin_position_raw, int) else None
            if (plugin_uri, plugin_position) in automated_targets or (plugin_uri, None) in automated_targets:
                automated_blocks.add(str(block.get("block_id") or ""))
        return {block_id for block_id in automated_blocks if block_id}

    @staticmethod
    def _inspection_overlay_pads(
        pads: list[dict[str, Any]],
        *,
        inspection_mode: str,
        assigned_block_ids: set[str],
        automated_block_ids: set[str],
    ) -> list[dict[str, Any]]:
        if inspection_mode == "off":
            return pads
        overlayed: list[dict[str, Any]] = []
        for index, pad in enumerate(pads):
            if not isinstance(pad, dict):
                overlayed.append(pad)
                continue
            block_id = str(pad.get("block_id") or "")
            bypassed = bool(pad.get("color") == "bypassed")
            is_selected = bool(pad.get("selected"))
            highlighted = False
            if inspection_mode == "assigned":
                highlighted = block_id in assigned_block_ids
            elif inspection_mode == "muted":
                highlighted = bypassed
            elif inspection_mode == "automated":
                highlighted = block_id in automated_block_ids
            overlay = dict(pad)
            overlay["inspection_mode"] = inspection_mode
            overlay["brightness_level"] = "full" if highlighted else ("mid" if is_selected else "off")
            overlay["animation"] = (
                "pulse_fast" if is_selected and highlighted else
                "steady" if highlighted else
                "steady"
            )
            overlay["state"] = "full" if highlighted else ("mid" if is_selected else "off")
            overlayed.append(overlay)
        while len(overlayed) < 16:
            overlayed.append({"index": len(overlayed), "state": "off", "brightness_level": "off", "animation": "steady"})
        return overlayed

    @staticmethod
    def _platform_event_overlay_is_active(overlay_state: dict[str, Any], *, now: float) -> bool:
        if not bool(overlay_state.get("active")):
            return False
        expires_at = str(overlay_state.get("expires_at") or "").strip()
        if not expires_at:
            return True
        try:
            return datetime.fromisoformat(expires_at.replace("Z", "+00:00")).timestamp() > now
        except ValueError:
            return True

    def _apply_platform_event_overlay_pads(
        self,
        pads: list[dict[str, Any]],
        *,
        overlay_state: dict[str, Any],
        now: float,
    ) -> list[dict[str, Any]]:
        if not self._platform_event_overlay_is_active(overlay_state, now=now):
            return pads
        overlay_pads = [
            dict(entry)
            for entry in list(overlay_state.get("pads") or [])[:16]
            if isinstance(entry, dict)
        ]
        if not overlay_pads:
            return pads
        if str(overlay_state.get("mode") or "") == "exclusive_overlay":
            merged = [
                {
                    "index": index,
                    **(
                        overlay_pads[index]
                        if index < len(overlay_pads)
                        else {"index": index, "state": "off", "brightness_level": "off", "animation": "steady"}
                    ),
                }
                for index in range(16)
            ]
            return merged
        return self._merge_pad_overlay(pads, overlay_pads)

    def _apply_platform_event_overlay_leds(
        self,
        led: list[int],
        *,
        overlay_state: dict[str, Any],
        now: float,
    ) -> None:
        if not self._platform_event_overlay_is_active(overlay_state, now=now):
            return
        if str(overlay_state.get("mode") or "") != "exclusive_overlay":
            return
        led[int(Led.Navigate)] = max(
            led[int(Led.Navigate)],
            resolve_led_value(level="full", animation="pulse_fast", now=now, phase_offset=0.0),
        )
        led[int(Led.Control)] = max(
            led[int(Led.Control)],
            resolve_led_value(level="bright", animation="pulse_fast", now=now, phase_offset=0.2),
        )

    def _apply_led_overlays(
        self,
        pads: list[dict[str, Any]],
        *,
        audio_grid: dict[str, Any],
        encoder_map: dict[str, Any],
        automation_parameter_ids: list[str],
        inspection_mode: str,
        profile_switch_osd_profile_id: str | None,
        profile_switch_osd_until: float,
        now: float,
    ) -> list[dict[str, Any]]:
        overlayed = list(pads)
        if inspection_mode != "off":
            overlayed = self._inspection_overlay_pads(
                overlayed,
                inspection_mode=inspection_mode,
                assigned_block_ids=self._assigned_block_ids(encoder_map),
                automated_block_ids=self._automated_block_ids(audio_grid, automation_parameter_ids),
            )
        if profile_switch_osd_profile_id and now < profile_switch_osd_until:
            overlay = build_profile_signature_overlay(profile_switch_osd_profile_id, now=now, pad_count=16)
            signature_pads: list[dict[str, Any]] = []
            for index, brightness in enumerate(overlay[:16]):
                entry = dict(overlayed[index]) if index < len(overlayed) and isinstance(overlayed[index], dict) else {"index": index}
                level = "off"
                if brightness >= 220:
                    level = "full"
                elif brightness >= 150:
                    level = "bright"
                elif brightness >= 90:
                    level = "mid"
                elif brightness > 0:
                    level = "dim"
                entry["signature_overlay"] = True
                entry["brightness_level"] = level if level != "off" else str(entry.get("brightness_level") or "off")
                entry["animation"] = str(entry.get("animation") or "steady") if level == "off" else "pulse_fast"
                signature_pads.append(entry)
            return signature_pads
        return overlayed

    @staticmethod
    def _merge_pad_overlay(
        pads: list[dict[str, Any]],
        overlay: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        merged: list[dict[str, Any]] = []
        target_count = max(16, len(pads), len(overlay))
        for index in range(target_count):
            base = dict(pads[index]) if index < len(pads) and isinstance(pads[index], dict) else {"index": index}
            if index < len(overlay) and isinstance(overlay[index], dict):
                for key in ("state", "brightness_level", "animation", "choreography", "brain_slot_mode"):
                    if key in overlay[index]:
                        base[key] = overlay[index][key]
            merged.append(base)
        return merged[:16]

    def _apply_choreography_pads(
        self,
        pads: list[dict[str, Any]],
        *,
        display_context: str,
        drum_transport_state: dict[str, Any],
        audio_levels_state: dict[str, Any],
        spectrum_state: dict[str, Any],
        brain_state: dict[str, Any],
        brain_sequence_state: dict[str, Any],
        beat_anchor_monotonic: float,
        now: float,
    ) -> list[dict[str, Any]]:
        if display_context == "menu":
            return pads
        if is_brain_profile(display_context):
            overlay = build_brain_choreography_pad_overlay(
                brain_state=brain_state,
                brain_sequence=brain_sequence_state,
                transport_state=drum_transport_state,
                beat_anchor_monotonic=beat_anchor_monotonic,
                now=now,
                pad_count=16,
            )
        else:
            overlay = build_audio_reactive_pad_overlay(
                audio_levels=audio_levels_state,
                spectrum_state=spectrum_state,
                transport_state=drum_transport_state,
                beat_anchor_monotonic=beat_anchor_monotonic,
                now=now,
                pad_count=16,
            )
        return self._merge_pad_overlay(pads, overlay)

    def _apply_choreography_leds(
        self,
        led: list[int],
        *,
        display_context: str,
        drum_transport_state: dict[str, Any],
        audio_levels_state: dict[str, Any],
        true_peak_state: dict[str, Any],
        brain_state: dict[str, Any],
        brain_sequence_state: dict[str, Any],
        beat_anchor_monotonic: float,
        now: float,
    ) -> None:
        if display_context == "menu":
            return
        for button_index, entry in build_choreography_button_overrides(
            profile_id=display_context,
            transport_state=drum_transport_state,
            audio_levels=audio_levels_state,
            true_peak_state=true_peak_state,
            brain_state=brain_state,
            brain_sequence=brain_sequence_state,
            beat_anchor_monotonic=beat_anchor_monotonic,
            now=now,
        ).items():
            led[button_index] = max(
                led[button_index],
                resolve_led_value(
                    level=str(entry.get("level") or "off"),
                    animation=str(entry.get("animation") or "steady"),
                    now=now,
                    phase_offset=0.0,
                ),
            )

    def _apply_category_leds(
        self,
        led: list[int],
        *,
        display_context: str,
        active_context: str,
        menu_category_index: int,
        inspection_mode: str,
        now: float,
    ) -> None:
        categories = self._menu_categories()
        active_category = str(self._profile_meta(active_context).get("category") or "")
        active_category_index = categories.index(active_category) if active_category in categories else menu_category_index
        for index, category in enumerate(categories[: len(_CATEGORY_LED_BUTTONS)]):
            button = _CATEGORY_LED_BUTTONS[index]
            if display_context == "menu":
                level = "full" if index == menu_category_index else "dim"
                animation = "steady" if index == menu_category_index else "pulse_slow"
            else:
                level = "bright" if index == active_category_index else "off"
                animation = "steady"
            led[int(button)] = max(
                led[int(button)],
                resolve_led_value(level=level, animation=animation, now=now, phase_offset=(index / max(1, len(categories) or 1))),
            )

        for mode, button in _INSPECTION_MODE_BUTTONS.items():
            active = inspection_mode == mode
            led[int(button)] = max(
                led[int(button)],
                resolve_led_value(
                    level="full" if active else "off",
                    animation="double_pulse" if active else "steady",
                    now=now,
                    phase_offset=0.0,
                ),
            )

    def _apply_long_operation_leds(
        self,
        led: list[int],
        *,
        snapshot: MaschineLongOperationSnapshot,
        now: float,
    ) -> None:
        slot_count = len(_LONG_OPERATION_PROGRESS_LEDS)
        fractional_slots = _clamp(int(snapshot.progress * 1000.0), 0, 1000) / 1000.0 * slot_count
        filled_slots = int(fractional_slots)
        active_slot = min(slot_count - 1, filled_slots)

        for index, button in enumerate(_LONG_OPERATION_PROGRESS_LEDS):
            level = "off"
            animation = "steady"
            if snapshot.status == "completed":
                level = "full"
            elif snapshot.status in {"failed", "cancelled"}:
                level = "bright" if index <= filled_slots else "dim"
                animation = "blink_slow"
            elif index < filled_slots:
                level = "full"
            elif index == active_slot:
                level = "bright"
                animation = "pulse_fast" if snapshot.status != "cancel_requested" else "double_pulse"
            else:
                level = "dim"
            led[int(button)] = max(
                led[int(button)],
                resolve_led_value(
                    level=level,
                    animation=animation,
                    now=now,
                    phase_offset=(index / max(1, slot_count)),
                ),
            )

        if snapshot.can_cancel or snapshot.status == "cancel_requested":
            led[int(Led.Erase)] = max(
                led[int(Led.Erase)],
                resolve_led_value(
                    level="full" if snapshot.status != "cancel_requested" else "bright",
                    animation="pulse_fast" if snapshot.status != "cancel_requested" else "double_pulse",
                    now=now,
                    phase_offset=0.0,
                ),
            )

    def _render_context_for_profile(self, profile_id: str) -> str:
        category = str(self._profile_meta(profile_id).get("category") or "")
        return "stats" if category == "Monitor" else "audio_grid"

    def _poll_profile_render(
        self,
        client: httpx.Client,
        *,
        profile_id: str,
        focus_metric: str | None = None,
    ) -> dict[str, dict[str, Any]] | None:
        params: dict[str, Any] = {
            "profile_id": profile_id,
            "context": self._render_context_for_profile(profile_id),
        }
        if focus_metric and profile_id == "t16_monitor":
            params["focus_metric"] = focus_metric
        try:
            response = client.get("/api/maschine/lcd/render", params=params)
            response.raise_for_status()
            payload = response.json()
            render = dict(payload.get("render") or {})
            left = dict(render.get("left") or {})
            right = dict(render.get("right") or {})
            if left and right:
                return {"left": left, "right": right}
        except Exception as exc:
            LOGGER.debug("Maschine LCD render poll failed for %s: %s", profile_id, exc)
        return None

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
        # T2523 — fold the same transport press into the Looper service.
        # The five MK1 transport buttons drive Mixxx-style stomps on the
        # active looper track (Track 0 for v1 — multi-track active-track
        # selection lands once the operator picks a UX). Engine-side
        # transport state is owned by the looper service; broadcasting
        # is handled there.
        self._dispatch_looper_transport(action)

    # ------------------------------------------------------------------
    # T2523 — Maschine MK1 transport buttons → Looper service
    # ------------------------------------------------------------------

    _LOOPER_ACTIVE_TRACK = 0  # v1: pin to Track 0 (4-track active-track
    # selector lands when the operator picks a SHIFT-combo / pad-bank
    # convention — filed as T2523 follow-on).

    def _dispatch_looper_transport(self, action: str) -> None:
        """T2523 — route a Maschine transport button press into the
        Looper service. Mixxx-style state machine:

        - ``play``    → ``play_track`` (resume / re-trigger)
        - ``stop``    → ``stop_track`` (preserves loop content)
        - ``record``  → ``record`` (state-machine: arm → record → close)
        - ``restart`` → ``restart_track`` (jump to loop start)
        - ``erase``   → ``clear`` (destroys content; long-press confirm
                                  lives in the GUI surface)

        All four mutating verbs respect the per-track write lock the
        operator may have set; ``LooperServiceError("track_locked")`` is
        swallowed to a debug log so a locked track produces silence on
        the controller rather than a daemon crash.
        """
        track = self._LOOPER_ACTIVE_TRACK
        try:
            service: LooperService = get_looper_service()
            if action == "play":
                service.play_track(track)
            elif action == "stop":
                service.stop_track(track)
            elif action == "record":
                service.record(track)
            elif action == "restart":
                service.restart_track(track)
            elif action == "erase":
                service.clear(track)
            else:
                LOGGER.debug("Looper transport: unknown action %s", action)
        except LooperServiceError as exc:
            LOGGER.debug(
                "Looper transport %s skipped on track %d: %s",
                action, track, exc,
            )
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning(
                "Looper transport %s failed on track %d: %s",
                action, track, exc,
            )

    def _cancel_active_long_operation(self, client: httpx.Client) -> bool:
        snapshot = self._long_operation_feedback.snapshot(now=time.monotonic())
        if snapshot is None or not snapshot.can_cancel or not snapshot.cancel_path:
            return False
        try:
            response = client.post(snapshot.cancel_path)
            response.raise_for_status()
            self._long_operation_feedback.mark_cancel_requested(snapshot.source)
            self._record_incident(
                severity="warn",
                message=f"Maschine cancel requested for {snapshot.title.lower()}",
                event="long_op_cancel_requested",
                context={"source": snapshot.source, "operation_id": snapshot.operation_id},
            )
        except Exception as exc:
            self._long_operation_feedback.push_receipt(
                source=snapshot.source,
                title=snapshot.title,
                subtitle="CANCEL FAILED",
                detail=_safe_label(str(exc), limit=18),
                progress=snapshot.progress,
                status="failed",
            )
            self._record_incident(
                severity="error",
                message=f"Maschine cancel failed for {snapshot.title.lower()}",
                detail=str(exc),
                event="long_op_cancel_failed",
                context={"source": snapshot.source, "operation_id": snapshot.operation_id},
            )
        self._request_render()
        return True

    def _open_admin_console(self) -> None:
        self._set_display_context("t18_admin_console", show_osd=True)

    def _select_relative_admin_console_action(self, client: httpx.Client, delta: int) -> None:
        try:
            response = client.post("/api/maschine/admin-console/select", json={"delta": delta})
            response.raise_for_status()
            payload = response.json()
            with self._state_lock:
                self._state.admin_console_state = dict(payload.get("admin_console") or {})
        except Exception as exc:
            LOGGER.debug("Admin console relative select failed: %s", exc)
        self._request_render()

    def _confirm_admin_console_action(self, client: httpx.Client) -> None:
        try:
            response = client.post("/api/maschine/admin-console/confirm")
            response.raise_for_status()
            payload = response.json()
            with self._state_lock:
                self._state.admin_console_state = dict(payload.get("admin_console") or {})
        except Exception as exc:
            LOGGER.debug("Admin console confirm failed: %s", exc)
        self._request_render()

    def _cancel_admin_console_action(self, client: httpx.Client) -> None:
        try:
            response = client.post("/api/maschine/admin-console/cancel")
            response.raise_for_status()
            payload = response.json()
            with self._state_lock:
                self._state.admin_console_state = dict(payload.get("admin_console") or {})
        except Exception as exc:
            LOGGER.debug("Admin console cancel failed: %s", exc)
        self._request_render()

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
