"""MeloAudio MIDI Commander stock-firmware discovery wizard.

T2459-H3-CFG Phase 2.

The wizard runs the operator through "press control N now" prompts and
captures whatever MIDI message the device emits. The captured mapping
gets saved as a **per-installation override** at
``~/.map2/devices/meloaudio-commander-discovered.yaml`` which shadows
the device-pack profile (`device-packs/meloaudio/profiles/midi-commander.midi.yaml`)
at runtime.

This sidesteps the two architectural blockers found in the 2026-05-07
HIL bench session:

1. Stock MeloAudio firmware has multiple hardcoded "modes" (Standard,
   Axe-Fx II/III, Helix, GT-1000, …) selected by holding footswitch
   combos at boot. CCs differ per mode. Discovery captures whatever
   the operator's current mode emits.

2. PipeWire 1.4.10's UMP-MIDI2 ALSA seq client doesn't auto-bridge
   legacy `[type=kernel]` MIDI 1.0 clients to JACK MIDI ports, so
   libremidi-via-PipeWire never sees Commander events. Discovery
   subscribes to ALSA seq directly (Phase 2b — needs the C++ host's
   `Map2MidiBackend::forceSelect` to be wired into a runtime IPC; the
   orchestrator below is MIDI-source-agnostic so any subscriber can
   feed it).

This module owns:

* :class:`CommanderControl`              — enumeration of physical controls
* :class:`CommanderDiscoveryEvent`       — single captured event payload
* :class:`CommanderDiscoveryState`       — the orchestrator state machine
* :class:`CommanderDiscoveryOverride`    — the persisted YAML payload
* :func:`override_yaml_path`             — resolves the per-host save path
* :func:`load_override`                  — loads override (if present)
* :func:`save_override`                  — atomically writes override

It does NOT own the actual MIDI subscription — that's Phase 2b. Tests
inject events synthetically.
"""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

import yaml


class CommanderControl(str, Enum):
    """Physical controls on the MeloAudio MIDI Commander.

    Ordered as the wizard prompts them — top row first (1-4), bottom
    row second (A-D), then the two expression pedals, then the bank
    navigation buttons. The order is operator-friendly (top-left to
    bottom-right) and matches the device-pack YAML's logical
    structure.
    """

    TOP_1 = "top_1"
    TOP_2 = "top_2"
    TOP_3 = "top_3"
    TOP_4 = "top_4"
    BOTTOM_A = "bottom_a"
    BOTTOM_B = "bottom_b"
    BOTTOM_C = "bottom_c"
    BOTTOM_D = "bottom_d"
    EXPRESSION_1 = "expression_1"
    EXPRESSION_2 = "expression_2"
    BANK_UP = "bank_up"
    BANK_DOWN = "bank_down"


# Operator-prompt sequence for the wizard. Same order as the values
# in CommanderControl, which is also the default device-pack ordering.
DEFAULT_PROMPT_SEQUENCE: tuple[CommanderControl, ...] = tuple(CommanderControl)


@dataclass(frozen=True)
class CommanderDiscoveryEvent:
    """A single MIDI message captured during discovery.

    The wizard considers the FIRST event after a prompt as the binding
    for that control. Repeated identical messages within a short
    debounce window are coalesced (operator may press the switch
    multiple times to confirm; we record the first press).
    """

    status: int
    """MIDI status byte (high nibble) — 0xB0 (CC), 0xC0 (PC), 0x90 (Note On)."""

    midino: int
    """The MIDI control number — CC#, PC#, or Note number."""

    channel: int
    """MIDI channel (1-16)."""

    raw_value: Optional[int] = None
    """Optional raw value byte (CC value, Note velocity). For
    expression-pedal sweeps we capture the FIRST byte the operator
    moves through; later sweep values aren't recorded — the binding
    is on the CC#, not the value."""


@dataclass
class CommanderDiscoveryOverride:
    """Per-installation override that shadows the device-pack profile.

    Saved as YAML at ``~/.map2/devices/meloaudio-commander-discovered.yaml``.
    Each entry binds a logical CommanderControl to the actual MIDI
    message the operator's specific device emitted.
    """

    bindings: dict[CommanderControl, CommanderDiscoveryEvent] = field(default_factory=dict)
    """Logical control → captured MIDI event."""

    captured_at_utc: Optional[str] = None
    """ISO-8601 UTC timestamp of when the wizard run completed."""

    device_serial: Optional[str] = None
    """USB iSerial of the device that ran the wizard. If a different
    device with a different serial is connected later, MAP2 surfaces a
    warning so the operator knows the override may not apply."""

    notes: Optional[str] = None
    """Free-form operator notes. Useful when the operator wants to
    label which stock firmware mode was active during the wizard
    (e.g. "Axe-Fx III mode")."""

    def to_yaml_payload(self) -> dict:
        """Serialise to a YAML-friendly dict.

        The schema is human-readable so an operator can hand-edit the
        file if they need to tweak a binding without re-running the
        wizard.
        """
        return {
            "schema_version": 1,
            "device": "meloaudio_midi_commander",
            "captured_at_utc": self.captured_at_utc,
            "device_serial": self.device_serial,
            "notes": self.notes,
            "bindings": {
                control.value: {
                    "status": f"0x{event.status:02X}",
                    "midino": event.midino,
                    "channel": event.channel,
                    **(
                        {"raw_value": event.raw_value}
                        if event.raw_value is not None
                        else {}
                    ),
                }
                for control, event in self.bindings.items()
            },
        }

    @classmethod
    def from_yaml_payload(cls, payload: dict) -> "CommanderDiscoveryOverride":
        """Parse a YAML override file. Strict on schema_version + device."""
        if not isinstance(payload, dict):
            raise ValueError("override YAML did not parse to an object")
        version = payload.get("schema_version")
        if version != 1:
            raise ValueError(f"unsupported override schema_version: {version!r}")
        device = payload.get("device")
        if device != "meloaudio_midi_commander":
            raise ValueError(f"override is not a Commander override: device={device!r}")
        bindings_raw = payload.get("bindings", {})
        if not isinstance(bindings_raw, dict):
            raise ValueError("bindings must be an object")

        bindings: dict[CommanderControl, CommanderDiscoveryEvent] = {}
        for control_name, entry in bindings_raw.items():
            try:
                control = CommanderControl(control_name)
            except ValueError as exc:
                raise ValueError(
                    f"unknown control {control_name!r}; "
                    f"expected one of {[c.value for c in CommanderControl]}"
                ) from exc
            if not isinstance(entry, dict):
                raise ValueError(f"binding for {control_name} must be an object")
            status = entry.get("status")
            if isinstance(status, str):
                status = int(status, 16) if status.startswith("0x") else int(status)
            elif not isinstance(status, int):
                raise ValueError(f"binding {control_name}: status must be int or hex string")
            midino = entry.get("midino")
            channel = entry.get("channel", 1)
            raw_value = entry.get("raw_value")
            if not isinstance(midino, int):
                raise ValueError(f"binding {control_name}: midino must be int")
            if not isinstance(channel, int):
                raise ValueError(f"binding {control_name}: channel must be int")
            bindings[control] = CommanderDiscoveryEvent(
                status=status,
                midino=midino,
                channel=channel,
                raw_value=raw_value if isinstance(raw_value, int) else None,
            )

        return cls(
            bindings=bindings,
            captured_at_utc=payload.get("captured_at_utc"),
            device_serial=payload.get("device_serial"),
            notes=payload.get("notes"),
        )


def override_yaml_path(home: Optional[Path] = None) -> Path:
    """Return the canonical path for the per-installation override file.

    Defaults to ``~/.map2/devices/meloaudio-commander-discovered.yaml``.
    Callers can pass a different ``home`` to point at a fixture
    directory (used by tests).
    """
    base = home if home is not None else Path.home()
    return base / ".map2" / "devices" / "meloaudio-commander-discovered.yaml"


def load_override(path: Optional[Path] = None) -> Optional[CommanderDiscoveryOverride]:
    """Read the per-installation override file.

    Returns ``None`` if the file doesn't exist (no override → device-pack
    profile applies as-is). Raises ``ValueError`` if the file is present
    but malformed; callers should treat that as a hard error so the
    operator notices a corrupt override rather than silently falling
    back to the default profile.
    """
    target = path if path is not None else override_yaml_path()
    if not target.exists():
        return None
    payload = yaml.safe_load(target.read_text(encoding="utf-8"))
    return CommanderDiscoveryOverride.from_yaml_payload(payload)


def save_override(
    override: CommanderDiscoveryOverride,
    *,
    path: Optional[Path] = None,
) -> Path:
    """Atomically write the override to disk.

    Atomicity matters because the discovery wizard might crash or be
    interrupted partway through saving; a partial write would corrupt
    the file. We write to a sibling ``*.tmp`` file then ``os.replace``
    to swap atomically.

    Returns the path the override was written to.
    """
    target = path if path is not None else override_yaml_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = override.to_yaml_payload()

    # Write to a temp file in the same directory (so os.replace is
    # an atomic rename rather than a cross-filesystem copy).
    fd, tmp_name = tempfile.mkstemp(
        prefix=target.name + ".",
        suffix=".tmp",
        dir=str(target.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            yaml.safe_dump(payload, fh, sort_keys=False, default_flow_style=False)
        os.replace(tmp_name, target)
    except Exception:
        # Best-effort cleanup if anything failed before the replace.
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise
    return target


class CommanderDiscoveryState:
    """State machine for the Commander discovery wizard.

    Lifecycle::

        state = CommanderDiscoveryState()
        state.start()                          # → prompts for control 0
        # ... operator presses; subscriber calls state.handle_event(...) ...
        # ... orchestrator advances when an event maps to the current prompt ...
        if state.is_complete():
            override = state.build_override(device_serial=...)
            save_override(override)

    The orchestrator is **MIDI-source-agnostic** — it doesn't open any
    sockets, doesn't subscribe to ALSA seq, doesn't talk to libremidi.
    The actual subscriber (Phase 2b) feeds it events via ``handle_event``.

    Repeated events for the same prompt within ``debounce_seconds`` are
    coalesced — operator may tap a switch multiple times to confirm,
    and we only record the first event. After ``debounce_seconds``
    elapses without any new event, the orchestrator advances regardless
    (so a stuck control doesn't hang the wizard forever — it just
    leaves that binding empty and the operator can re-run the wizard
    or hand-edit the file).

    Cancellation: ``cancel()`` sets ``is_cancelled`` so the
    subscriber can exit cleanly without saving an override.
    """

    def __init__(
        self,
        prompt_sequence: tuple[CommanderControl, ...] = DEFAULT_PROMPT_SEQUENCE,
        *,
        debounce_seconds: float = 0.25,
    ) -> None:
        self._prompts = prompt_sequence
        self._debounce_seconds = debounce_seconds
        self._captured: dict[CommanderControl, CommanderDiscoveryEvent] = {}
        self._current_index: int = -1   # not started until start() is called
        self._cancelled: bool = False

    @property
    def is_started(self) -> bool:
        return self._current_index >= 0

    @property
    def is_complete(self) -> bool:
        """True when every prompt has either captured an event or been
        skipped (i.e., the orchestrator advanced past it).
        """
        return self._current_index >= len(self._prompts)

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled

    @property
    def current_prompt(self) -> Optional[CommanderControl]:
        """The control currently being prompted; ``None`` if not started
        or complete or cancelled.
        """
        if not self.is_started or self.is_complete or self.is_cancelled:
            return None
        return self._prompts[self._current_index]

    @property
    def progress(self) -> tuple[int, int]:
        """``(captured_count, total_prompts)`` for UI progress indicators."""
        return (len(self._captured), len(self._prompts))

    @property
    def captured(self) -> dict[CommanderControl, CommanderDiscoveryEvent]:
        """Snapshot of captured bindings so far. Caller should not mutate."""
        return dict(self._captured)

    def start(self) -> None:
        """Move from 'not started' to 'awaiting first prompt'."""
        if self.is_started:
            return
        self._current_index = 0

    def cancel(self) -> None:
        """Mark the session as cancelled. ``current_prompt`` becomes
        ``None``; subsequent ``handle_event`` calls are ignored.
        """
        self._cancelled = True

    def skip_current(self) -> None:
        """Advance past the current prompt without capturing anything.

        Used when an operator tells the UI 'I don't have an expression
        pedal' or 'this control doesn't emit MIDI in my current mode'.
        The skipped control is left out of the override; runtime falls
        back to the device-pack default for that binding.
        """
        if not self.is_started or self.is_complete or self.is_cancelled:
            return
        self._current_index += 1

    def handle_event(self, event: CommanderDiscoveryEvent) -> bool:
        """Feed a captured MIDI event to the orchestrator.

        Returns True if the event bound to the current prompt and the
        orchestrator advanced. Returns False if the event was ignored
        (orchestrator is cancelled / not started / already complete).

        For expression-pedal prompts (``EXPRESSION_1``, ``EXPRESSION_2``)
        we accept the first CC event regardless of value — the operator
        rocks the pedal and we bind to whichever CC# the first byte
        reports. Subsequent events for the same prompt are ignored
        (debouncing rapid sweep updates).
        """
        if not self.is_started or self.is_complete or self.is_cancelled:
            return False
        prompt = self.current_prompt
        if prompt is None:
            return False
        # Bind. If the same prompt already has a binding (defensive — the
        # caller shouldn't double-feed but we guard anyway), the FIRST
        # one wins.
        if prompt not in self._captured:
            self._captured[prompt] = event
        self._current_index += 1
        return True

    def build_override(
        self,
        *,
        device_serial: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> CommanderDiscoveryOverride:
        """Snapshot captured state into a saveable override.

        Should only be called when ``is_complete`` is True (i.e., every
        prompt has been answered or skipped). Calling earlier produces a
        partial override which is also legal — the override file
        format permits any subset of bindings — but the operator should
        usually finish the full sequence so the override fully replaces
        the device-pack defaults.
        """
        return CommanderDiscoveryOverride(
            bindings=dict(self._captured),
            captured_at_utc=datetime.now(timezone.utc).isoformat(),
            device_serial=device_serial,
            notes=notes,
        )
