"""Tesira TTP↔MIDI bridge consumer projection (T2482-P2.6 part 3).

Biamp Tesira speaks TTP (Tesira Text Protocol). The platform's
existing `app/services/midi_hub/tesira_client.py` lets operators
subscribe to TTP attribute updates and bind them as MIDI sources, OR
drive TTP attribute writes from MIDI events.

This projection puts those bridge bindings on the canonical authority
so the consolidated /midi/network surface (Phase 3) reads through one
source.

consumer_id format:
  - "ttp:<instance_tag>:<attribute_path>" — uniquely identifies a TTP
    subscription/write target. Examples:
      "ttp:DanteOut1:level"
      "ttp:Mixer1:input.1.gain"

The instance_tag + attribute_path mirror the TTP command shape; see
`docs/midi/TESIRA_TTP_INTEGRATION.md` and the
`reference_tesira_ttp.md` memory.
"""

from __future__ import annotations

from typing import Any, Optional

from app.services.midi.authority import MidiBindingAuthority
from app.services.midi.schemas import (
    BindingSourceType,
    MidiBindingCreate,
    MidiBindingRead,
)


def make_consumer_id(*, instance_tag: str, attribute_path: str) -> str:
    """Compose the canonical consumer_id for a TTP bridge binding."""
    instance_tag = instance_tag.strip()
    attribute_path = attribute_path.strip()
    if not instance_tag or ":" in instance_tag:
        raise ValueError(
            f"TTP instance_tag must be non-empty and contain no colons; got {instance_tag!r}"
        )
    if not attribute_path:
        raise ValueError("TTP attribute_path must be non-empty")
    return f"ttp:{instance_tag}:{attribute_path}"


def parse_consumer_id(consumer_id: str) -> tuple[str, str]:
    """Reverse: split consumer_id back into (instance_tag,
    attribute_path). Raises ValueError when malformed."""
    if not consumer_id.startswith("ttp:"):
        raise ValueError(f"TTP consumer_id must start with 'ttp:'; got {consumer_id!r}")
    body = consumer_id[len("ttp:"):]
    if ":" not in body:
        raise ValueError(f"malformed TTP consumer_id: {consumer_id!r}")
    instance_tag, _, attribute_path = body.partition(":")
    if not instance_tag or not attribute_path:
        raise ValueError(f"malformed TTP consumer_id: {consumer_id!r}")
    return instance_tag, attribute_path


def make_midi_to_ttp_payload(
    *,
    instance_tag: str,
    attribute_path: str,
    source_type: BindingSourceType,
    channel: Optional[int] = None,
    cc: Optional[int] = None,
    note: Optional[int] = None,
    range_min: Optional[float] = None,
    range_max: Optional[float] = None,
    curve: Optional[str] = None,
    extras: Optional[dict[str, Any]] = None,
    created_by: str = "tesira-ttp-projection",
    source: str = "manual",
) -> MidiBindingCreate:
    """MIDI input drives a TTP attribute write. The binding's TARGET is
    the TTP attribute; SOURCE is the MIDI event."""
    consumer_id = make_consumer_id(
        instance_tag=instance_tag, attribute_path=attribute_path
    )

    source_descriptor: dict[str, Any] = {}
    if channel is not None:
        source_descriptor["channel"] = int(channel)
    if cc is not None and source_type == "midi_cc":
        source_descriptor["cc"] = int(cc)
    if note is not None and source_type == "midi_note":
        source_descriptor["note"] = int(note)
    if range_min is not None:
        source_descriptor["min"] = range_min
    if range_max is not None:
        source_descriptor["max"] = range_max
    if curve is not None:
        source_descriptor["curve"] = curve

    target_descriptor: dict[str, Any] = {
        "instance_tag": instance_tag,
        "attribute_path": attribute_path,
        "direction": "midi_to_ttp",
    }

    metadata: dict[str, Any] = {}
    if extras:
        metadata["extra"] = dict(extras)

    return MidiBindingCreate(
        consumer_type="tesira_ttp",
        consumer_id=consumer_id,
        consumer_label=f"MIDI → TTP {instance_tag}.{attribute_path}",
        source_type=source_type,
        source_descriptor=source_descriptor,
        target_type="device_command",
        target_descriptor=target_descriptor,
        device_id=None,
        scope="global",
        scope_id=None,
        enabled=True,
        created_by=created_by,
        source=source,
        metadata=metadata,
    )


def make_ttp_to_midi_payload(
    *,
    instance_tag: str,
    attribute_path: str,
    midi_channel: int,
    midi_cc: Optional[int] = None,
    midi_note: Optional[int] = None,
    range_min: Optional[float] = None,
    range_max: Optional[float] = None,
    extras: Optional[dict[str, Any]] = None,
    created_by: str = "tesira-ttp-projection",
    source: str = "manual",
) -> MidiBindingCreate:
    """TTP attribute change drives a MIDI output event. SOURCE is the
    TTP subscription; TARGET is the MIDI message to send."""
    consumer_id = make_consumer_id(
        instance_tag=instance_tag, attribute_path=attribute_path
    )

    if midi_cc is not None:
        midi_target_kind = "cc"
        midi_target_value = int(midi_cc)
    elif midi_note is not None:
        midi_target_kind = "note"
        midi_target_value = int(midi_note)
    else:
        raise ValueError(
            "make_ttp_to_midi_payload requires either midi_cc or midi_note"
        )

    source_descriptor: dict[str, Any] = {
        "instance_tag": instance_tag,
        "attribute_path": attribute_path,
        "direction": "ttp_to_midi",
    }
    if range_min is not None:
        source_descriptor["min"] = range_min
    if range_max is not None:
        source_descriptor["max"] = range_max

    target_descriptor: dict[str, Any] = {
        "channel": int(midi_channel),
        midi_target_kind: midi_target_value,
    }

    metadata: dict[str, Any] = {}
    if extras:
        metadata["extra"] = dict(extras)

    return MidiBindingCreate(
        consumer_type="tesira_ttp",
        consumer_id=consumer_id,
        consumer_label=f"TTP {instance_tag}.{attribute_path} → MIDI ch{midi_channel + 1} {midi_target_kind}{midi_target_value}",
        source_type="ttp_subscription",
        source_descriptor=source_descriptor,
        target_type="engine_command",
        target_descriptor=target_descriptor,
        device_id=None,
        scope="global",
        scope_id=None,
        enabled=True,
        created_by=created_by,
        source=source,
        metadata=metadata,
    )


async def list_tesira_ttp_bindings(
    authority: MidiBindingAuthority,
    *,
    instance_tag: Optional[str] = None,
    direction: Optional[str] = None,
) -> list[MidiBindingRead]:
    """Read TTP bridge bindings, optionally filtered by instance_tag
    and/or direction ("midi_to_ttp" | "ttp_to_midi")."""
    in_scope = await authority.list_in_scope("global", None, enabled_only=False)
    bindings = [b for b in in_scope if b.consumer_type == "tesira_ttp"]
    if instance_tag is None and direction is None:
        return bindings

    filtered = []
    for b in bindings:
        try:
            tag, _ = parse_consumer_id(b.consumer_id)
        except ValueError:
            continue
        if instance_tag is not None and tag != instance_tag:
            continue
        if direction is not None:
            # midi_to_ttp lives in target_descriptor.direction;
            # ttp_to_midi lives in source_descriptor.direction.
            d_target = (b.target_descriptor or {}).get("direction")
            d_source = (b.source_descriptor or {}).get("direction")
            actual = d_target or d_source
            if actual != direction:
                continue
        filtered.append(b)
    return filtered
