"""Transport consumer projection (T2482-P2.6 part 1).

Models MIDI transport bindings — clock master/slave selection,
transport-control (start/stop/continue), song-position-pointer, and
MIDI Time Code (MTC) bindings.

Today the platform's transport bindings live in `app/services/midi_hub/
clock_engine.py` + `cluster_clock.py` as ad-hoc state. This projection
gives them a typed shape on the canonical authority so the consolidated
`/midi/transport` region (P3.6) reads through one source.

The consumer_id format for this consumer_type is the symbolic transport
target name:
  - "clock" — MIDI clock source/sink configuration
  - "transport-control" — start/stop/continue messages
  - "song-position" — song position pointer (SPP)
  - "mtc" — MIDI Time Code
"""

from __future__ import annotations

from typing import Any, Optional

from app.services.midi.authority import MidiBindingAuthority
from app.services.midi.schemas import (
    BindingSourceType,
    MidiBindingCreate,
    MidiBindingRead,
)


_VALID_CONSUMER_IDS = frozenset(
    {"clock", "transport-control", "song-position", "mtc"}
)


def make_create_payload(
    *,
    consumer_id: str,
    source_type: BindingSourceType,
    channel: Optional[int] = None,
    cc: Optional[int] = None,
    note: Optional[int] = None,
    target_command: Optional[str] = None,
    role: Optional[str] = None,
    extras: Optional[dict[str, Any]] = None,
    created_by: str = "transport-projection",
    source: str = "manual",
) -> MidiBindingCreate:
    """Build a MidiBindingCreate for a transport binding.

    Transport bindings are global-scope (they're not per-snapshot).

    Args:
      consumer_id: One of "clock" / "transport-control" /
        "song-position" / "mtc".
      source_type: The MIDI source kind (typically "midi_clock" for
        clock, "midi_cc" or "midi_note" for transport buttons,
        "midi_pc" for some controllers).
      channel/cc/note: signal source descriptor.
      target_command: For transport-control bindings, names the
        command driven ("start", "stop", "continue", "play", "rewind",
        "pause", etc.).
      role: For clock bindings, "master" or "slave".
      extras: vendor-specific fields preserved through metadata.extra.
    """
    if consumer_id not in _VALID_CONSUMER_IDS:
        raise ValueError(
            f"transport consumer_id must be one of {sorted(_VALID_CONSUMER_IDS)}; got {consumer_id!r}"
        )

    label_parts = [consumer_id]
    if target_command:
        label_parts.append(target_command)
    if role:
        label_parts.append(f"({role})")
    consumer_label = " ".join(label_parts)

    source_descriptor: dict[str, Any] = {}
    if channel is not None:
        source_descriptor["channel"] = int(channel)
    if cc is not None and source_type == "midi_cc":
        source_descriptor["cc"] = int(cc)
    if note is not None and source_type == "midi_note":
        source_descriptor["note"] = int(note)

    target_descriptor: dict[str, Any] = {"transport_target": consumer_id}
    if target_command:
        target_descriptor["command"] = target_command
    if role:
        target_descriptor["role"] = role

    metadata: dict[str, Any] = {}
    if extras:
        metadata["extra"] = dict(extras)

    return MidiBindingCreate(
        consumer_type="transport",
        consumer_id=consumer_id,
        consumer_label=consumer_label,
        source_type=source_type,
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


async def list_transport_bindings(
    authority: MidiBindingAuthority,
    *,
    consumer_id: Optional[str] = None,
) -> list[MidiBindingRead]:
    """Read every transport binding, optionally filtered by consumer_id
    ("clock" / "transport-control" / "song-position" / "mtc")."""
    if consumer_id is not None:
        if consumer_id not in _VALID_CONSUMER_IDS:
            raise ValueError(
                f"transport consumer_id must be one of {sorted(_VALID_CONSUMER_IDS)}; got {consumer_id!r}"
            )
        return await authority.list_for_consumer(
            "transport", consumer_id, enabled_only=False
        )
    in_scope = await authority.list_in_scope("global", None, enabled_only=False)
    return [b for b in in_scope if b.consumer_type == "transport"]
