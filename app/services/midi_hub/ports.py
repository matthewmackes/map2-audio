"""
MIDI Hub port abstraction layer.
"""

from __future__ import annotations

import logging
import os
import time
import re
import subprocess

logger = logging.getLogger(__name__)
from abc import ABC, abstractmethod
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Literal, Optional

from app.services.midi_hub.ring_buffer import MidiRingBuffer

# T2482 loop 9 / iter 85: rtmidi import removed. AlsaMidiPort now
# delegates to the controller-host (MidiHostClient) per the iter-85
# refactor. The dispose_rtmidi_client helper is no longer needed.


# T2482-P1.1 Gap D.4 (iter 49) + Gap E phase 7 (iter 57) — controller-host
# routing is now MANDATORY for the canonical MIDI Hub port enumeration.
# The env-gate helper from iters 49/51 was dropped in iter 57 — host
# is preferred unconditionally; rtmidi remains a lenient-mode fallback
# until iter 59 strips it entirely.
#
# midi_hub/ports.py is the wrapper every downstream Hub consumer
# (Tesira, GPIO, OSC, event list, etc.) goes through, so this flip
# benefits the entire Hub surface.


PortDirection = Literal["input", "output", "duplex"]
_INTERNAL_ALSA_PORT_PREFIXES = (
    "rtmidiin client:",
    "rtmidiout client:",
    "map2 audio engine:",
    "juce:",
    "midi through:",
    "pipewire-system:",
    "pipewire-rt-event:",
)


@dataclass
class MidiMessage:
    data: bytes
    timestamp_ns: int
    source_port: str
    destination_port: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MidiPortInfo:
    port_id: str
    name: str
    direction: PortDirection
    kind: str
    is_open: bool
    metadata: Dict[str, Any] = field(default_factory=dict)


class MidiPort(ABC):
    """Abstract MIDI port contract used by MidiHub."""

    def __init__(self, *, port_id: str, name: str, direction: PortDirection, kind: str):
        self.port_id = str(port_id)
        self.name = str(name)
        self.direction: PortDirection = direction
        self.kind = str(kind)
        self._is_open = False

    @property
    def is_open(self) -> bool:
        return self._is_open

    def info(self) -> MidiPortInfo:
        return MidiPortInfo(
            port_id=self.port_id,
            name=self.name,
            direction=self.direction,
            kind=self.kind,
            is_open=self._is_open,
            metadata=self.metadata(),
        )

    def metadata(self) -> Dict[str, Any]:
        return {}

    def can_send(self) -> bool:
        return self.direction in ("output", "duplex")

    def can_receive(self) -> bool:
        return self.direction in ("input", "duplex")

    @abstractmethod
    def open(self) -> bool:
        ...

    @abstractmethod
    def close(self) -> None:
        ...

    @abstractmethod
    def send(self, data: bytes) -> bool:
        ...

    @abstractmethod
    def receive(self, *, max_messages: int = 64) -> List[MidiMessage]:
        ...


class VirtualMidiPort(MidiPort):
    """In-process virtual MIDI port."""

    def __init__(self, *, port_id: str, name: str, direction: PortDirection = "duplex", queue_size: int = 4096):
        super().__init__(port_id=port_id, name=name, direction=direction, kind="virtual")
        self._rx = MidiRingBuffer[MidiMessage](queue_size, overwrite_on_full=True)
        self._tx = MidiRingBuffer[MidiMessage](queue_size, overwrite_on_full=True)

    def open(self) -> bool:
        self._is_open = True
        return True

    def close(self) -> None:
        self._is_open = False

    def inject(self, data: bytes, *, source_port: str = "virtual_external") -> bool:
        msg = MidiMessage(
            data=bytes(data),
            timestamp_ns=time.time_ns(),
            source_port=source_port,
            destination_port=self.port_id,
        )
        return self._rx.push(msg)

    def send(self, data: bytes) -> bool:
        if not self._is_open or not self.can_send():
            return False
        msg = MidiMessage(
            data=bytes(data),
            timestamp_ns=time.time_ns(),
            source_port=self.port_id,
        )
        return self._tx.push(msg)

    def receive(self, *, max_messages: int = 64) -> List[MidiMessage]:
        if not self._is_open or not self.can_receive():
            return []
        return self._rx.drain(max_messages)

    def read_transmitted(self, *, max_messages: int = 64) -> List[MidiMessage]:
        return self._tx.drain(max_messages)

    def metadata(self) -> Dict[str, Any]:
        return {
            "rx": self._rx.stats().__dict__,
            "tx": self._tx.stats().__dict__,
        }


class AlsaMidiPort(MidiPort):
    """ALSA MIDI port — T2482 loop 9 / iter 85: host-routed.

    Originally backed by python-rtmidi (open_port + send_message +
    get_message). Iter 85 flipped the implementation to delegate to
    the controller-host:
    - open() calls MidiHostClient.open_midi_input(controller_key,
      port_id) + starts a subscription that buffers controller_event
      frames in a per-port deque.
    - send() calls MidiHostClient.send_short_message or send_sysex
      depending on the byte length.
    - receive() drains the per-port deque populated by the
      subscription's reader thread.
    The class name is preserved for backwards-compat with consumers
    (build_alsa_ports, MidiHub) that import AlsaMidiPort by name.
    """

    def __init__(self, *, port_id: str, name: str, direction: PortDirection = "duplex", port_index: Optional[int] = None):
        super().__init__(port_id=port_id, name=name, direction=direction, kind="alsa")
        self.port_index = port_index
        self._open_error: Optional[str] = None
        # iter-85: host-routed buffers + subscription handle
        self._inbound: list[MidiMessage] = []
        self._inbound_lock = None  # threading.Lock, lazy-init
        self._host_client: Any = None
        self._host_subscription: Any = None
        # legacy hooks retained as None (no rtmidi clients now)
        self._midi_in = None
        self._midi_out = None

    def _get_host_client(self) -> Any:
        if self._host_client is None:
            from app.services.midi_host_client import MidiHostClient
            self._host_client = MidiHostClient()
        return self._host_client

    def open(self) -> bool:
        # iter-85: route through controller-host. The MidiHub-resolved
        # port name is the iter-78 host-enumerated name; we hand that
        # name to MidiHostClient.open_midi_input as the port_id.
        from app.services.midi_host_client import MidiHostClientError
        client = self._get_host_client()
        if not client.is_daemon_available():
            self._open_error = (
                "controller-host daemon unreachable; AlsaMidiPort "
                "requires the host as of iter 85"
            )
            self._is_open = False
            return False
        try:
            controller_key = f"midi-hub.{self.port_id}"
            if self.can_receive():
                client.open_midi_input(controller_key=controller_key, port_id=self.name)
                # Start a subscription buffering this port's events
                import threading
                self._inbound_lock = threading.Lock()
                sub = client.subscribe()
                def _on_event(msg: dict) -> None:
                    if msg.get("controller_key") != controller_key:
                        return
                    payload = bytes(int(b) & 0xFF for b in msg.get("bytes", []))
                    if not payload:
                        return
                    midi_msg = MidiMessage(
                        data=payload,
                        timestamp_ns=time.time_ns(),
                        source_port=self.port_id,
                    )
                    if self._inbound_lock is not None:
                        with self._inbound_lock:
                            self._inbound.append(midi_msg)
                sub.on_controller_event(_on_event)
                sub.start()
                self._host_subscription = sub
            self._open_error = None
            self._is_open = True
            return True
        except MidiHostClientError as exc:
            self._open_error = str(exc)
            self._is_open = False
            return False
        except Exception as exc:  # pragma: no cover - defensive
            self._open_error = str(exc)
            self._is_open = False
            self.close()
            return False

    def close(self) -> None:
        # iter-85: clean shutdown of the subscription if any was started.
        if self._host_subscription is not None:
            try:
                self._host_subscription.stop()
            except Exception:  # pragma: no cover - defensive
                pass
            self._host_subscription = None
        self._inbound = []
        self._inbound_lock = None
        self._is_open = False

    def send(self, data: bytes) -> bool:
        # iter-85: route via the host client's appropriate helper based
        # on whether the bytes look like a short message or a SysEx.
        if not self._is_open or not self.can_send():
            return False
        client = self._get_host_client()
        if not client.is_daemon_available():
            return False
        controller_key = f"midi-hub.{self.port_id}"
        payload = bytes(data)
        if not payload:
            return False
        try:
            if payload[0] == 0xF0 and payload[-1] == 0xF7:
                client.send_sysex(controller_key=controller_key, sysex_bytes=payload)
            else:
                # short message — clamp to 1..3 bytes per send_short_message contract
                client.send_short_message(
                    controller_key=controller_key,
                    message_bytes=payload[:3],
                )
            return True
        except Exception:  # pragma: no cover - daemon transient
            return False

    def receive(self, *, max_messages: int = 64) -> List[MidiMessage]:
        # iter-85: drain from the per-port deque populated by the
        # subscription reader thread.
        if not self._is_open or not self.can_receive():
            return []
        if self._inbound_lock is None:
            return []
        with self._inbound_lock:
            n = min(max(1, max_messages), len(self._inbound))
            out = self._inbound[:n]
            self._inbound = self._inbound[n:]
        return out

    def metadata(self) -> Dict[str, Any]:
        return {
            "port_index": self.port_index,
            "open_error": self._open_error,
            # iter-85: rtmidi was removed; the host's daemon
            # availability is now the relevant readiness signal.
            "host_routed": True,
            "host_subscribed": self._host_subscription is not None,
        }


def discover_alsa_ports() -> Dict[str, List[str]]:
    """Discover ALSA MIDI input/output names via the controller-host.

    T2482-P1.2 (iter 78): the iter-57 lenient-mode rtmidi enumeration
    fallback was removed. The controller-host is mandatory for ALSA
    port discovery in production. When the daemon is unreachable the
    function raises MidiHostClientError (matching the iter-77
    sysex_device_bridge contract).
    """
    from app.services.midi_host_client import (
        MidiHostClient, MidiHostClientError,
    )

    client = MidiHostClient()
    if client.is_daemon_available():
        _, ports = client.list_ports()
        inputs_h = []
        outputs_h = []
        for p in ports:
            if not _is_discoverable_alsa_port_name(p.name):
                continue
            if p.is_input:
                inputs_h.append(p.name)
            else:
                outputs_h.append(p.name)
        return {"inputs": inputs_h, "outputs": outputs_h}

    # Daemon down. Strict mode (iter 77 unified contract) — raise.
    # The lenient-mode rtmidi fallback that was here through iter 57-77
    # was removed in iter 78.
    raise MidiHostClientError(
        "controller-host daemon is unreachable; cannot enumerate ALSA "
        "MIDI ports for the MIDI Hub. Start map2-controller-host.service. "
        "(iter-78 hard-strip removed the rtmidi fallback path)."
    )


def build_alsa_ports(*, prefix: str = "alsa") -> Iterable[AlsaMidiPort]:
    """Create AlsaMidiPort instances for discovered ALSA port names."""
    discovered = discover_alsa_ports()
    input_names = set(discovered.get("inputs", []))
    output_names = set(discovered.get("outputs", []))
    all_names = sorted(input_names | output_names)
    for idx, name in enumerate(all_names):
        direction: PortDirection
        if name in input_names and name in output_names:
            direction = "duplex"
        elif name in input_names:
            direction = "input"
        else:
            direction = "output"
        yield AlsaMidiPort(
            port_id=f"{prefix}:{idx}:{name}",
            name=name,
            direction=direction,
        )


def _read_text(path: Path) -> Optional[str]:
    try:
        return path.read_text(encoding="utf-8").strip()
    except Exception:
        return None


def _is_discoverable_alsa_port_name(name: str) -> bool:
    normalized = str(name or "").strip()
    if not normalized:
        return False
    lowered = normalized.lower()
    return not any(lowered.startswith(prefix) for prefix in _INTERNAL_ALSA_PORT_PREFIXES)


def _lookup_usb_vid_pid_for_card(card_index: int) -> Dict[str, Any]:
    card_path = Path(f"/sys/class/sound/card{card_index}")
    if not card_path.exists():
        return {}

    current = card_path / "device"
    if not current.exists():
        return {}

    # Walk up device ancestry to find USB identifiers.
    for candidate in [current, *current.parents]:
        vendor = _read_text(candidate / "idVendor")
        product = _read_text(candidate / "idProduct")
        if vendor and product:
            return {
                "card_index": card_index,
                "vendor_id": vendor.lower(),
                "product_id": product.lower(),
                "usb_path": str(candidate),
            }
    return {"card_index": card_index}


def _discover_alsa_card_name_map() -> Dict[str, int]:
    """
    Return best-effort map of ALSA client names -> card index using `aconnect -l`.
    """
    try:
        proc = subprocess.run(
            ["aconnect", "-l"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=1.5,
            check=False,
        )
    except Exception:
        return {}

    if proc.returncode != 0 or not proc.stdout:
        return {}

    mapping: Dict[str, int] = {}
    pattern = re.compile(r"^client\s+\d+:\s+'([^']+)'.*card=(\d+)")
    for raw_line in proc.stdout.splitlines():
        line = raw_line.strip()
        match = pattern.match(line)
        if not match:
            continue
        name = match.group(1).strip()
        try:
            card_idx = int(match.group(2))
        except Exception:
            continue
        if name:
            mapping[name] = card_idx
    return mapping


def discover_alsa_port_descriptors() -> List[Dict[str, Any]]:
    """
    Discover ALSA port descriptors with best-effort USB VID/PID metadata.
    """
    discovered = discover_alsa_ports()
    input_names = set(discovered.get("inputs", []))
    output_names = set(discovered.get("outputs", []))
    all_names = sorted(input_names | output_names)
    card_name_map = _discover_alsa_card_name_map()

    descriptors: List[Dict[str, Any]] = []
    for name in all_names:
        if name in input_names and name in output_names:
            direction: PortDirection = "duplex"
        elif name in input_names:
            direction = "input"
        else:
            direction = "output"

        metadata: Dict[str, Any] = {
            "name": name,
            "direction": direction,
            "kind": "alsa",
        }
        lower_name = name.lower()
        card_index: Optional[int] = None
        for card_name, idx in card_name_map.items():
            if card_name.lower() in lower_name or lower_name in card_name.lower():
                card_index = idx
                break
        if card_index is not None:
            metadata.update(_lookup_usb_vid_pid_for_card(card_index))
        descriptors.append(metadata)
    return descriptors
