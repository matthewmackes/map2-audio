"""Canonical `AvbBinding` ORM model — the one place an AVB binding lives.

T2490-2 (AVB Services Phase 2 / sub-task 2). The shape mirrors
`MidiBinding` (T2482-P2.1) so the four-services discipline applies
identically: every operator-visible AVB authority on the platform —
talker / listener pairings, AVDECC stream connections, Tesira preset /
design recall, and SRP class — writes through this single table via a
per-consumer projection adapter. T2490-3 will refactor `avb_router.py`
to consume this authority instead of maintaining a parallel routing
matrix.

See `docs/architecture/AVB_SERVICES.md` and the T2490 epic in
`docs/PROJECT_WORKLIST.md` for the locked decisions.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Index,
    String,
)

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AvbBinding(Base):
    """Canonical authority for every AVB binding on the platform.

    Sister of `MidiBinding`. The shape is intentionally generic so each
    AVB consumer (raw AVDECC stream, Tesira preset, Tesira block param,
    cluster routing decision, SRP reservation) writes the same row
    shape. Per-consumer payload lives in the `source_descriptor` and
    `target_descriptor` JSON columns; per-consumer projection adapters
    validate on write and parse on read.

    Storage layout: SQLite (sole platform backend today). Two cluster
    fields, `talker_node_id` and `listener_node_id`, are first-class
    columns (not buried inside metadata) because the cluster matrix
    endpoint queries against them directly (T2490-7).
    """

    __tablename__ = "avb_bindings"

    binding_id = Column(String(36), primary_key=True)  # UUID4 string

    # Consumer identity — who owns this binding?
    consumer_type = Column(String(40), nullable=False)
    """One of:
    - "avdecc_stream"        (stream pair: <talker_unique_id>:<listener_unique_id>:<stream_index>)
    - "tesira_preset"        (instance_tag + preset_name)
    - "tesira_block"         (instance_tag + block_id + attribute)
    - "cluster_route"        (cluster routing decision)
    - "srp_reservation"      (SRP reservation managed by srp_admission)
    """

    consumer_id = Column(String(255), nullable=False)
    """Identifier scoped per consumer_type. UTF-8."""

    consumer_label = Column(String(255), nullable=False, default="")
    """Human-readable label rendered in the canonical /avb surface."""

    # Source — what AVB / network input drives this binding?
    source_type = Column(String(40), nullable=False)
    """One of:
    - "avdecc_talker"        (talker entity emits a stream)
    - "avdecc_listener"      (listener entity consumes a stream)
    - "tesira_subscription"  (Tesira block attribute observation)
    - "engine_signal"        (engine signal-level source for cluster routing)
    """

    source_descriptor = Column(JSON, nullable=False, default=dict)
    """JSON payload — talker_entity_id, talker_unique_id, format index,
    SRP class, presentation time, etc. Schema enforced by adapter."""

    # Target — what does the binding drive?
    target_type = Column(String(40), nullable=False)
    """One of:
    - "avdecc_listener"      (listener entity is the receiver)
    - "tesira_apply"         (apply Tesira preset / write block attribute)
    - "engine_sink"          (engine signal-level destination)
    - "cluster_listener"     (cluster peer listener)
    """

    target_descriptor = Column(JSON, nullable=False, default=dict)
    """JSON payload — listener_entity_id, listener_unique_id,
    Tesira instance_tag + block path, engine sink URI, etc."""

    # Stream-level identity (first-class columns; queried by routing
    # and cluster-matrix endpoints; nullable for non-stream bindings).
    stream_id = Column(String(64), nullable=True)
    """AVTP stream id (8-byte EUI-48 + unique_id, hex-encoded). Nullable
    for non-stream bindings (e.g., a Tesira preset recall doesn't have
    a stream id)."""

    stream_format = Column(String(64), nullable=True)
    """IEC 61883-6 / IEEE 1722 stream format token (e.g.,
    "iec-61883-6/AM824/8ch/48k"). Nullable when the binding doesn't
    pin a specific format."""

    srp_class = Column(String(8), nullable=True)
    """SRP traffic class — "A" | "B" | None for non-stream bindings."""

    # Cluster identity — first-class columns so the cluster matrix
    # endpoint (T2490-7) can index against them.
    talker_node_id = Column(String(64), nullable=True)
    """Node hosting the talker. Nullable when the talker is on the
    local node or unknown."""

    listener_node_id = Column(String(64), nullable=True)
    """Node hosting the listener. Nullable for non-cluster bindings."""

    # Scope — where does this binding apply?
    scope = Column(String(20), nullable=False, default="global")
    """One of: "global" | "snapshot" | "node" | "cluster"."""

    scope_id = Column(String(255), nullable=True)
    """snapshot_id / node_id when scoped; null when scope='global'."""

    # Lifecycle
    enabled = Column(Boolean, nullable=False, default=True)

    # Provenance — required by the four-services discipline
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    created_by = Column(String(80), nullable=False, default="unknown")
    modified_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)
    modified_by = Column(String(80), nullable=False, default="unknown")
    source = Column(String(80), nullable=False, default="manual")

    metadata_json = Column("metadata", JSON, nullable=False, default=dict)
    """Pack-specific or consumer-specific opt-in fields. The Python
    attribute is named `metadata_json` because `metadata` collides with
    SQLAlchemy's Base.metadata reserved name."""

    __table_args__ = (
        Index("ix_avb_bindings_consumer", "consumer_type", "consumer_id"),
        Index("ix_avb_bindings_stream", "stream_id"),
        Index("ix_avb_bindings_cluster", "talker_node_id", "listener_node_id"),
        Index("ix_avb_bindings_scope", "scope", "scope_id"),
        Index("ix_avb_bindings_enabled", "enabled"),
    )

    def __repr__(self) -> str:
        return (
            f"<AvbBinding {self.binding_id} "
            f"{self.consumer_type}:{self.consumer_id} "
            f"<= {self.source_type} => {self.target_type} "
            f"stream={self.stream_id} ({self.source})>"
        )


# Re-export the table object so the database migration helper can pass
# it explicitly to Base.metadata.create_all(tables=[...]).
avb_bindings_table = AvbBinding.__table__
