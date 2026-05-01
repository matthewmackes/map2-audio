"""Pydantic shapes for the MidiBinding canonical authority.

Authority enforces these shapes on every write; projection adapters
build them from per-consumer request shapes. See `models.py` for the
ORM column semantics and `docs/architecture/MIDI_SERVICES.md` §3.1
for the design intent.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

# ---------- Constrained vocabularies ----------

# Order matters for the literal types (Pydantic uses positional matching
# for union deserialization in some paths). Ordered alphabetically + by
# expected frequency where alpha would be ambiguous.

BindingConsumerType = Literal[
    "snapshot",
    "brain_slot",
    "plugin_param",
    "global_param",        # Plugin params bound at global scope (not chain-scoped).
                           # Added in T2482-P2.8 part 1 to absorb the 49 chain-less
                           # legacy MIDIMapping rows (rows where chain_id was NULL).
    "performance_preset",
    "device_pack",
    "transport",
    "tesira_ttp",
    "gpio",
    "macro",
]

BindingSourceType = Literal[
    "midi_cc",
    "midi_note",
    "midi_pc",
    "midi_nrpn",
    "midi_sysex",
    "midi_clock",
    "midi_aftertouch",
    "midi_pitchbend",
    "midi_channel_pressure",
    "ttp_subscription",
    "gpio_input",
    "string_command",
]

BindingTargetType = Literal[
    "engine_param",
    "engine_command",
    "snapshot_action",
    "brain_slot",
    "device_command",
    "macro",
    "gpio_output",
]

BindingScope = Literal["global", "snapshot", "node", "cluster"]


# ---------- Wire shapes ----------


class _MidiBindingBase(BaseModel):
    """Common fields shared by Create / Update / Read."""

    model_config = ConfigDict(extra="forbid")

    consumer_type: BindingConsumerType
    consumer_id: str = Field(min_length=1, max_length=255)
    consumer_label: str = Field(default="", max_length=255)

    source_type: BindingSourceType
    source_descriptor: dict[str, Any] = Field(default_factory=dict)

    target_type: BindingTargetType
    target_descriptor: dict[str, Any] = Field(default_factory=dict)

    device_id: Optional[str] = Field(default=None, max_length=255)

    scope: BindingScope = "global"
    scope_id: Optional[str] = Field(default=None, max_length=255)

    enabled: bool = True

    source: str = Field(default="manual", max_length=80)
    metadata: dict[str, Any] = Field(default_factory=dict)


class MidiBindingCreate(_MidiBindingBase):
    """POST payload — authority assigns binding_id + timestamps + author."""

    created_by: str = Field(default="unknown", max_length=80)


class MidiBindingUpdate(BaseModel):
    """PATCH payload — every field optional. Authority bumps modified_at +
    modified_by on any successful write."""

    model_config = ConfigDict(extra="forbid")

    consumer_label: Optional[str] = Field(default=None, max_length=255)
    source_descriptor: Optional[dict[str, Any]] = None
    target_descriptor: Optional[dict[str, Any]] = None
    device_id: Optional[str] = Field(default=None, max_length=255)
    scope: Optional[BindingScope] = None
    scope_id: Optional[str] = Field(default=None, max_length=255)
    enabled: Optional[bool] = None
    source: Optional[str] = Field(default=None, max_length=80)
    metadata: Optional[dict[str, Any]] = None
    modified_by: str = Field(default="unknown", max_length=80)


class MidiBindingRead(_MidiBindingBase):
    """GET response — full binding record."""

    binding_id: str = Field(min_length=36, max_length=36)
    created_at: datetime
    created_by: str = Field(max_length=80)
    modified_at: datetime
    modified_by: str = Field(max_length=80)
