"""MeloAudio MIDI Commander binding resolver.

T2459-H3-CFG Phase 6.

Composes the canonical device-pack defaults (``protocol.py``) with the
per-installation override (``CommanderDiscoveryOverride``) into a single
``EffectiveCommanderProfile``. The runtime matches incoming MIDI bytes
against this profile to decide which physical control fired.

Why this layer exists
=====================
Stock MeloAudio firmware emits different CC numbers per mode (Standard,
Axe-Fx II/III, Helix, GT-1000, …). The device-pack defaults reflect the
factory Standard mode but may not match the operator's chosen mode.
Operators run the Discovery Wizard once to capture *their* mode's
mapping; the resolver merges the override over the canonical defaults so
the rest of MAP2 can stay agnostic to which firmware mode is active.

Resolution rules
================

For each physical control:

1. **Override wins** — if the override has a binding for the control,
   that's what the runtime matches against. Status byte, midino
   (controller/note/program number), and channel all come from the
   override.
2. **Canonical default** — otherwise, fall back to the device-pack
   constant (``BUTTON_CC_BY_ID``, ``BUTTON_PC_BY_ID``, etc.).
3. **Canonical absent** — if neither side has a binding (for instance,
   custom firmware that omits a control), the entry is omitted from the
   resolved profile. Callers must treat missing controls as "no
   binding".

The resolver is deliberately pure: input → output, no I/O. The caller
decides where to read the override from (filesystem, REST endpoint,
stub for tests).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.services.midi_commander_surface.protocol import (
    BANK_DOWN_CC,
    BANK_UP_CC,
    BUTTON_CC_BY_ID,
    BUTTON_PC_BY_ID,
    EXPRESSION_CC_BY_ID,
)

from .commander_discovery import (
    CommanderControl,
    CommanderDiscoveryEvent,
    CommanderDiscoveryOverride,
)


CC_STATUS_BYTE = 0xB0
PC_STATUS_BYTE = 0xC0
DEFAULT_MIDI_CHANNEL = 1


@dataclass(frozen=True)
class ResolvedBinding:
    """One physical control's effective MIDI signature.

    ``status`` + ``midino`` together identify a unique incoming MIDI
    message. ``channel`` is 1-indexed (1..16) to match how operators
    talk about MIDI channels — the wire format is 0..15, conversion
    happens at the parser layer.

    ``source`` records where the binding came from so UI can surface
    "your override says this; the device-pack default says that".
    """

    control: CommanderControl
    status: int
    midino: int
    channel: int
    source: str  # "override" | "device_pack"

    def matches(self, status_byte: int, data1: int, channel: int) -> bool:
        """True iff an incoming MIDI message matches this binding."""
        return (
            self.status == status_byte
            and self.midino == data1
            and self.channel == channel
        )


@dataclass(frozen=True)
class EffectiveCommanderProfile:
    """Composed device-pack + override binding map.

    ``bindings`` is keyed by ``CommanderControl`` so callers can ask
    "what is bound to TOP_1 right now?" directly. ``has_override`` is
    True iff at least one binding came from the override file. If
    False, the runtime is using pure device-pack defaults — useful for
    UI to surface "operator hasn't run Discovery Wizard yet".
    """

    bindings: dict[CommanderControl, ResolvedBinding]
    has_override: bool

    def find_binding(
        self,
        status_byte: int,
        data1: int,
        channel: int,
    ) -> Optional[ResolvedBinding]:
        """Reverse lookup: which control fires for this incoming MIDI?

        Linear scan — there are only 12 controls, so a dict-of-dicts
        index is overkill. Returns the first match (bindings are unique
        per (status, midino, channel) tuple by construction).
        """
        for binding in self.bindings.values():
            if binding.matches(status_byte, data1, channel):
                return binding
        return None


def _device_pack_default(
    control: CommanderControl,
) -> Optional[tuple[int, int]]:
    """Return ``(status_byte, midino)`` for a control's device-pack
    default, or ``None`` if the device-pack doesn't bind it.

    The device-pack default uses channel 1; that lives in
    ``DEFAULT_MIDI_CHANNEL`` so callers can override it if a future
    profile variant ships with a different default channel.
    """
    if control is CommanderControl.TOP_1:
        return (CC_STATUS_BYTE, BUTTON_CC_BY_ID["1"])
    if control is CommanderControl.TOP_2:
        return (CC_STATUS_BYTE, BUTTON_CC_BY_ID["2"])
    if control is CommanderControl.TOP_3:
        return (CC_STATUS_BYTE, BUTTON_CC_BY_ID["3"])
    if control is CommanderControl.TOP_4:
        return (CC_STATUS_BYTE, BUTTON_CC_BY_ID["4"])
    if control is CommanderControl.BOTTOM_A:
        return (PC_STATUS_BYTE, BUTTON_PC_BY_ID["A"])
    if control is CommanderControl.BOTTOM_B:
        return (PC_STATUS_BYTE, BUTTON_PC_BY_ID["B"])
    if control is CommanderControl.BOTTOM_C:
        return (PC_STATUS_BYTE, BUTTON_PC_BY_ID["C"])
    if control is CommanderControl.BOTTOM_D:
        return (PC_STATUS_BYTE, BUTTON_PC_BY_ID["D"])
    if control is CommanderControl.EXPRESSION_1:
        return (CC_STATUS_BYTE, EXPRESSION_CC_BY_ID["EXP1"])
    if control is CommanderControl.EXPRESSION_2:
        return (CC_STATUS_BYTE, EXPRESSION_CC_BY_ID["EXP2"])
    if control is CommanderControl.BANK_UP:
        return (CC_STATUS_BYTE, BANK_UP_CC)
    if control is CommanderControl.BANK_DOWN:
        return (CC_STATUS_BYTE, BANK_DOWN_CC)
    return None


def resolve_commander_profile(
    override: Optional[CommanderDiscoveryOverride] = None,
) -> EffectiveCommanderProfile:
    """Compose device-pack + override into the runtime binding map.

    Pass ``override=None`` (or an override with no bindings) to get the
    pure device-pack defaults — useful as a fallback when no Discovery
    Wizard has run yet.
    """
    override_bindings = (override.bindings or {}) if override else {}
    bindings: dict[CommanderControl, ResolvedBinding] = {}

    for control in CommanderControl:
        ev: Optional[CommanderDiscoveryEvent] = override_bindings.get(control)
        if ev is not None:
            bindings[control] = ResolvedBinding(
                control=control,
                status=ev.status,
                midino=ev.midino,
                channel=ev.channel,
                source="override",
            )
            continue

        default = _device_pack_default(control)
        if default is None:
            continue
        status, midino = default
        bindings[control] = ResolvedBinding(
            control=control,
            status=status,
            midino=midino,
            channel=DEFAULT_MIDI_CHANNEL,
            source="device_pack",
        )

    has_override = bool(override_bindings)
    return EffectiveCommanderProfile(bindings=bindings, has_override=has_override)
