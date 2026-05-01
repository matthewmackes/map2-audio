"""
MIDI Hub port abstraction layer.
"""

from __future__ import annotations

import os
import time
import re
import subprocess
from abc import ABC, abstractmethod
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Literal, Optional

from app.services.midi_hub.ring_buffer import MidiRingBuffer
from app.utils.rtmidi_utils import dispose_rtmidi_client

try:
    import rtmidi  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    rtmidi = None


# T2482-P1.1 Gap D.4 (iter 49) + Gap E phase 1 (iter 51) — controller-host
# routing is now the default for the canonical MIDI Hub port enumeration.
#
# Default ON as of iter 51 (SHIP loop 6). midi_hub/ports.py is the
# wrapper every downstream Hub consumer (Tesira, GPIO, OSC, event
# list, etc.) goes through, so this flip benefits the entire Hub
# surface. Set MAP2_USE_MIDI_HOST=0 to force the rtmidi fallback.
def _midi_hub_use_midi_host() -> bool:
    val = os.environ.get("MAP2_USE_MIDI_HOST", "").strip().lower()
    if val in ("0", "false", "no", "off"):
        return False
    return True  # default ON


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
    """ALSA MIDI port backed by python-rtmidi when available."""

    def __init__(self, *, port_id: str, name: str, direction: PortDirection = "duplex", port_index: Optional[int] = None):
        super().__init__(port_id=port_id, name=name, direction=direction, kind="alsa")
        self.port_index = port_index
        self._midi_in = None
        self._midi_out = None
        self._open_error: Optional[str] = None

    def _resolve_port_index(self, client: Any) -> Optional[int]:
        if self.port_index is not None:
            return int(self.port_index)
        try:
            count = int(client.get_port_count())
        except Exception:
            return None
        for idx in range(count):
            try:
                candidate = str(client.get_port_name(idx))
            except Exception:
                continue
            if candidate == self.name:
                return idx
        return None

    def open(self) -> bool:
        if rtmidi is None:
            self._open_error = "python-rtmidi not installed"
            self._is_open = False
            return False

        try:
            if self.can_receive():
                self._midi_in = rtmidi.MidiIn()
                idx = self._resolve_port_index(self._midi_in)
                if idx is None:
                    self._open_error = f"input port '{self.name}' not found"
                    self._midi_in = None
                    self._is_open = False
                    return False
                self._midi_in.open_port(idx)
                self._midi_in.ignore_types(sysex=False, timing=True, active_sense=True)

            if self.can_send():
                self._midi_out = rtmidi.MidiOut()
                idx = self._resolve_port_index(self._midi_out)
                if idx is None:
                    self._open_error = f"output port '{self.name}' not found"
                    if self._midi_in is not None:
                        dispose_rtmidi_client(self._midi_in)
                        self._midi_in = None
                    self._midi_out = None
                    self._is_open = False
                    return False
                self._midi_out.open_port(idx)

            self._open_error = None
            self._is_open = True
            return True
        except Exception as exc:  # pragma: no cover - hardware dependent
            self._open_error = str(exc)
            self._is_open = False
            self.close()
            return False

    def close(self) -> None:
        if self._midi_in is not None:
            dispose_rtmidi_client(self._midi_in)
        if self._midi_out is not None:
            dispose_rtmidi_client(self._midi_out)
        self._midi_in = None
        self._midi_out = None
        self._is_open = False

    def send(self, data: bytes) -> bool:
        if not self._is_open or not self.can_send() or self._midi_out is None:
            return False
        try:
            self._midi_out.send_message(list(data))
            return True
        except Exception:  # pragma: no cover - hardware dependent
            return False

    def receive(self, *, max_messages: int = 64) -> List[MidiMessage]:
        if not self._is_open or not self.can_receive() or self._midi_in is None:
            return []
        out: List[MidiMessage] = []
        for _ in range(max(1, max_messages)):
            try:
                msg = self._midi_in.get_message()
            except Exception:  # pragma: no cover - hardware dependent
                break
            if msg is None:
                break
            raw, _ = msg
            if not raw:
                continue
            out.append(
                MidiMessage(
                    data=bytes(int(b) & 0xFF for b in raw),
                    timestamp_ns=time.time_ns(),
                    source_port=self.port_id,
                )
            )
        return out

    def metadata(self) -> Dict[str, Any]:
        return {
            "port_index": self.port_index,
            "open_error": self._open_error,
            "rtmidi_available": rtmidi is not None,
        }


def discover_alsa_ports() -> Dict[str, List[str]]:
    """Discover ALSA MIDI input/output names via rtmidi (or controller-host)."""
    # Host-routed enumeration (env-gated). When the controller-host
    # daemon is up, prefer its libremidi enumeration. The daemon owns
    # the same JACK/ALSA-seq port graph rtmidi sees, so the result is
    # equivalent — we just skip the per-call rtmidi cleanup cost and
    # get consistent backend reporting across services.
    if _midi_hub_use_midi_host():
        try:
            from app.services.midi_host_client import (
                MidiHostClient, MidiHostClientError, midi_host_required,
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
            # Daemon down. Strict mode (Gap E phase 3 / iter 53)
            # raises rather than falling back to rtmidi.
            if midi_host_required():
                raise MidiHostClientError(
                    "MAP2_REQUIRE_MIDI_HOST set but controller-host "
                    "daemon is unreachable; refusing rtmidi fallback "
                    "for discover_alsa_ports()"
                )
            # else: fall through to rtmidi.
        except Exception as exc:  # pragma: no cover - defensive
            # Re-raise strict-mode failures so callers see them.
            from app.services.midi_host_client import MidiHostClientError
            if isinstance(exc, MidiHostClientError):
                raise
            pass  # any other host-side failure → rtmidi fallback

    if rtmidi is None:
        return {"inputs": [], "outputs": []}

    inputs: List[str] = []
    outputs: List[str] = []

    midi_in = None
    midi_out = None
    try:
        midi_in = rtmidi.MidiIn()
        for idx in range(int(midi_in.get_port_count())):
            try:
                name = str(midi_in.get_port_name(idx))
                if _is_discoverable_alsa_port_name(name):
                    inputs.append(name)
            except Exception:
                continue
    except Exception:
        inputs = []
    finally:
        dispose_rtmidi_client(midi_in)

    try:
        midi_out = rtmidi.MidiOut()
        for idx in range(int(midi_out.get_port_count())):
            try:
                name = str(midi_out.get_port_name(idx))
                if _is_discoverable_alsa_port_name(name):
                    outputs.append(name)
            except Exception:
                continue
    except Exception:
        outputs = []
    finally:
        dispose_rtmidi_client(midi_out)

    return {"inputs": inputs, "outputs": outputs}


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
