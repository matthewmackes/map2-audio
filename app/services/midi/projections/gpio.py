"""Virtual GPIO consumer projection (T2482-P2.6 part 2).

The platform's virtual-GPIO subsystem (`app/services/midi_hub/
virtual_gpio.py`) exposes 12 virtual input pins + 12 output pins that
operators can bind MIDI events to/from. Today those bindings live in
the GPIO service's own state; this projection moves them onto the
canonical authority.

consumer_id format:
  - "input:<n>" for virtual input pins (n in 1..12)
  - "output:<n>" for virtual output pins (n in 1..12)

Inputs are bindings driven BY MIDI INTO a GPIO output pin (target_type
= "gpio_output"); outputs are bindings driven BY a GPIO input pin INTO
some MIDI sink (source_type = "gpio_input"). Both directions live in
this projection so the consolidated /midi/network surface has one
source for "what's bound to GPIO".
"""

from __future__ import annotations

from typing import Any, Optional

from app.services.midi.authority import MidiBindingAuthority
from app.services.midi.schemas import (
    BindingSourceType,
    BindingTargetType,
    MidiBindingCreate,
    MidiBindingRead,
)


GPIO_PIN_MIN = 1
GPIO_PIN_MAX = 12


def _validate_pin(pin: int) -> int:
    pin = int(pin)
    if not (GPIO_PIN_MIN <= pin <= GPIO_PIN_MAX):
        raise ValueError(
            f"GPIO pin must be {GPIO_PIN_MIN}..{GPIO_PIN_MAX}; got {pin}"
        )
    return pin


def make_gpio_input_consumer_id(pin: int) -> str:
    """consumer_id for an INPUT pin (MIDI drives this output pin)."""
    return f"input:{_validate_pin(pin)}"


def make_gpio_output_consumer_id(pin: int) -> str:
    """consumer_id for an OUTPUT pin (this input pin drives MIDI)."""
    return f"output:{_validate_pin(pin)}"


def parse_gpio_consumer_id(consumer_id: str) -> tuple[str, int]:
    """Split a GPIO consumer_id into (direction, pin).

    Returns ("input"|"output", pin_number). Raises ValueError when
    malformed.
    """
    if ":" not in consumer_id:
        raise ValueError(f"malformed GPIO consumer_id: {consumer_id!r}")
    direction, _, pin_str = consumer_id.partition(":")
    if direction not in ("input", "output"):
        raise ValueError(
            f"GPIO consumer_id direction must be 'input' or 'output'; got {direction!r}"
        )
    try:
        pin = _validate_pin(int(pin_str))
    except ValueError:
        raise
    return direction, pin


def make_midi_to_gpio_payload(
    *,
    pin: int,
    source_type: BindingSourceType,
    channel: Optional[int] = None,
    cc: Optional[int] = None,
    note: Optional[int] = None,
    pulse_ms: Optional[int] = None,
    extras: Optional[dict[str, Any]] = None,
    created_by: str = "gpio-projection",
    source: str = "manual",
) -> MidiBindingCreate:
    """MIDI input → GPIO output pin. consumer is a GPIO input target."""
    consumer_id = make_gpio_input_consumer_id(pin)

    source_descriptor: dict[str, Any] = {}
    if channel is not None:
        source_descriptor["channel"] = int(channel)
    if cc is not None and source_type == "midi_cc":
        source_descriptor["cc"] = int(cc)
    if note is not None and source_type == "midi_note":
        source_descriptor["note"] = int(note)

    target_descriptor: dict[str, Any] = {"pin": _validate_pin(pin), "direction": "output"}
    if pulse_ms is not None:
        target_descriptor["pulse_ms"] = int(pulse_ms)

    metadata: dict[str, Any] = {}
    if extras:
        metadata["extra"] = dict(extras)

    return MidiBindingCreate(
        consumer_type="gpio",
        consumer_id=consumer_id,
        consumer_label=f"MIDI → GPIO output pin {pin}",
        source_type=source_type,
        source_descriptor=source_descriptor,
        target_type="gpio_output",
        target_descriptor=target_descriptor,
        device_id=None,
        scope="global",
        scope_id=None,
        enabled=True,
        created_by=created_by,
        source=source,
        metadata=metadata,
    )


def make_gpio_to_midi_payload(
    *,
    pin: int,
    target_type: BindingTargetType,
    target_descriptor: dict[str, Any],
    edge: str = "rising",
    extras: Optional[dict[str, Any]] = None,
    created_by: str = "gpio-projection",
    source: str = "manual",
) -> MidiBindingCreate:
    """GPIO input pin → MIDI output. source is the GPIO input pin.

    Args:
      pin: GPIO input pin number 1..12.
      target_type: any canonical BindingTargetType (typically
        "engine_command" or "device_command").
      target_descriptor: shape per the target_type's contract.
      edge: "rising" | "falling" | "both" — when the binding fires.
    """
    if edge not in ("rising", "falling", "both"):
        raise ValueError(
            f"GPIO edge must be 'rising'|'falling'|'both'; got {edge!r}"
        )

    consumer_id = make_gpio_output_consumer_id(pin)

    source_descriptor: dict[str, Any] = {
        "pin": _validate_pin(pin),
        "direction": "input",
        "edge": edge,
    }

    metadata: dict[str, Any] = {}
    if extras:
        metadata["extra"] = dict(extras)

    return MidiBindingCreate(
        consumer_type="gpio",
        consumer_id=consumer_id,
        consumer_label=f"GPIO input pin {pin} → {target_type}",
        source_type="gpio_input",
        source_descriptor=source_descriptor,
        target_type=target_type,
        target_descriptor=dict(target_descriptor),
        device_id=None,
        scope="global",
        scope_id=None,
        enabled=True,
        created_by=created_by,
        source=source,
        metadata=metadata,
    )


async def list_gpio_bindings(
    authority: MidiBindingAuthority,
    *,
    direction: Optional[str] = None,
    pin: Optional[int] = None,
) -> list[MidiBindingRead]:
    """List GPIO bindings, optionally filtered by direction
    ("input"|"output") and/or specific pin."""
    in_scope = await authority.list_in_scope("global", None, enabled_only=False)
    bindings = [b for b in in_scope if b.consumer_type == "gpio"]
    if direction is not None or pin is not None:
        filtered = []
        for b in bindings:
            try:
                d, p = parse_gpio_consumer_id(b.consumer_id)
            except ValueError:
                continue
            if direction is not None and d != direction:
                continue
            if pin is not None and p != pin:
                continue
            filtered.append(b)
        return filtered
    return bindings
