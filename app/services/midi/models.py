"""Canonical `MidiBinding` ORM model — the one place a MIDI binding lives.

See `docs/architecture/MIDI_SERVICES.md` §3.1 for the full design.

Created in T2482-P2.1 (MIDI Services Phase 2). Migration registers the
table at `app/database.py` migration version 12. No consumer migrations
yet — they land in T2482-P2.3 onwards.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
)

# `Base` is the SQLAlchemy declarative base used by every ORM model on
# the platform. It lives in app/database.py; importing it here keeps
# this module independent of the database wiring details (the migration
# helper in app/database.py imports MidiBinding to register its table
# during create_all).
from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MidiBinding(Base):
    """Canonical authority for every MIDI binding on the platform.

    See the MIDI Services design doc for column semantics. The shape is
    intentionally generic: every consumer (snapshot, brain slot, plugin
    param, performance preset, device pack, transport, Tesira TTP,
    virtual GPIO, macro) writes through this single table via a
    per-consumer projection adapter (`app/services/midi/projections/`).

    Storage layout: SQLite (sole platform backend today). The
    `source_descriptor` and `target_descriptor` JSON columns carry the
    consumer-specific payload — for a CC binding, the source descriptor
    looks like `{"channel": 0, "cc": 7, "curve": "linear"}`; for a
    SysEx binding, it carries the byte template + offset map. The
    canonical table doesn't try to enforce a per-consumer schema; the
    projection adapter validates on write and parses on read.
    """

    __tablename__ = "midi_bindings"

    binding_id = Column(String(36), primary_key=True)  # UUID4 string

    # Consumer identity — who owns this binding?
    consumer_type = Column(String(40), nullable=False)
    """Indexed via the composite `ix_midi_bindings_consumer` in
    `__table_args__` below.

    One of:
    - "snapshot"            (snapshot_id)
    - "brain_slot"          (slot_id)
    - "plugin_param"        ("<chain_id>:<plugin_uri>:<param_index>")
    - "performance_preset"  (preset_id)
    - "device_pack"         (profile_key)
    - "transport"           ("clock" | "transport-control" | "song-position")
    - "tesira_ttp"          (ttp_subscription_id)
    - "gpio"                ("input:<n>" | "output:<n>")
    - "macro"               (macro_id)
    """

    consumer_id = Column(String(255), nullable=False)
    """Identifier scoped per consumer_type (snapshot_id as string,
    slot_id as string, plugin_uri+param composite, etc.)."""

    consumer_label = Column(String(255), nullable=False, default="")
    """Human-readable label rendered in the canonical /midi surface
    binding list. Set by the projection adapter on write."""

    # Source — what MIDI input drives this binding?
    source_type = Column(String(40), nullable=False)
    """One of:
    - "midi_cc"
    - "midi_note"
    - "midi_pc"             (program change)
    - "midi_nrpn"
    - "midi_sysex"
    - "midi_clock"
    - "midi_aftertouch"
    - "midi_pitchbend"
    - "midi_channel_pressure"
    - "ttp_subscription"
    - "gpio_input"
    - "string_command"
    """

    source_descriptor = Column(JSON, nullable=False, default=dict)
    """JSON payload — channel + cc/note/etc., curve, range, scale,
    sysex byte template, etc. Schema enforced by projection adapter."""

    # Target — what does the binding drive?
    target_type = Column(String(40), nullable=False)
    """One of:
    - "engine_param"        (engine target URI + param)
    - "engine_command"      (engine command name)
    - "snapshot_action"     (load / activate / morph / a-b-toggle)
    - "brain_slot"          (slot_id, slot-level command)
    - "device_command"      (device-specific command)
    - "macro"               (macro_id)
    - "gpio_output"         (output_n)
    """

    target_descriptor = Column(JSON, nullable=False, default=dict)
    """JSON payload — engine target URI, plugin URI + param index, etc.
    Schema enforced by projection adapter."""

    # Optional device scoping
    device_id = Column(String(255), nullable=True)
    """FK-equivalent to MidiDeviceState.device_id (nullable for
    "any device" bindings — e.g., a global program-change handler).
    Indexed via composite `ix_midi_bindings_device_enabled`."""

    # Scope — where does this binding apply?
    scope = Column(String(20), nullable=False, default="global")
    """One of: "global" | "snapshot" | "node" | "cluster".

    A global binding fires regardless of which snapshot is live; a
    snapshot-scoped binding fires only when scope_id matches the
    active snapshot_id; a node-scoped binding fires only on the
    matching node_id; cluster-scoped is reserved for future use.

    Indexed via the composite `ix_midi_bindings_scope` in
    `__table_args__` below — do NOT also set `index=True` here, that
    causes a name collision (SQLAlchemy auto-names a per-column
    index "ix_midi_bindings_scope")."""

    scope_id = Column(String(255), nullable=True)
    """snapshot_id when scope="snapshot", node_id when scope="node",
    null when scope="global". Indexed via `ix_midi_bindings_scope`."""

    # Lifecycle
    enabled = Column(Boolean, nullable=False, default=True)
    """Disabling a binding removes it from the active set without
    deleting it (useful for A/B comparison or temporary bypass)."""

    # Provenance — required by the four-services discipline
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    created_by = Column(String(80), nullable=False, default="unknown")
    """Author identifier ("operator" | "wizard" | "brain-setup-task" |
    "phase2-migration" | etc.)."""

    modified_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)
    modified_by = Column(String(80), nullable=False, default="unknown")

    source = Column(String(80), nullable=False, default="manual")
    """Free-form provenance describing where the binding came from
    ("brain-setup-task", "manual", "snapshot-editor",
    "midi-assignments-walkthrough", "legacy-migration", etc.).

    During the Phase 2 migration this carries the legacy_table identity
    for traceability. After migration, new bindings carry the surface
    that authored them."""

    metadata_json = Column("metadata", JSON, nullable=False, default=dict)
    """Pack-specific or consumer-specific opt-in fields. The Python
    attribute is named `metadata_json` because `metadata` collides with
    SQLAlchemy's Base.metadata reserved name; the column is named
    `metadata` in SQL for natural readability.

    During Phase 2 migration, populated with:
        {
          "legacy_table": "<source_table_name>",
          "legacy_row_id": "<source_row_id>",
          ... (any consumer-specific fields)
        }
    so the migration is auditable indefinitely.
    """

    __table_args__ = (
        # (consumer_type, consumer_id) is the primary point lookup —
        # any consumer asking "what bindings do I own?" goes through it.
        Index("ix_midi_bindings_consumer", "consumer_type", "consumer_id"),
        # Device-scoped queries: "what bindings target this device?"
        Index("ix_midi_bindings_device_enabled", "device_id", "enabled"),
        # Scope-resolution queries (snapshot active set, node-local set).
        Index("ix_midi_bindings_scope", "scope", "scope_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<MidiBinding {self.binding_id} "
            f"{self.consumer_type}:{self.consumer_id} "
            f"<= {self.source_type} "
            f"=> {self.target_type} "
            f"({self.source})>"
        )


# Re-export the table object so app/database.py's migration helper can
# pass it explicitly to Base.metadata.create_all(tables=[...]).
midi_bindings_table = MidiBinding.__table__
