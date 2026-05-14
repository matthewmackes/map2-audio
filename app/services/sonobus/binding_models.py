"""Canonical `SonoBusBinding` ORM model — the one place a SonoBus/AOO
binding lives.

T2521-3 (SonoBus/AOO Remote-Audio Transport, Phase 1 / sub-task 3). The
shape mirrors `AvbBinding` (T2490-2) so the four-services discipline
applies identically: every operator-visible SonoBus authority on the
platform — peer reachability, group/session ownership, AOO source/sink
stream pairs, client-session lease — writes through this single table.

See `docs/architecture/SONOBUS_AOO_TRANSPORT.md` for the locked Q1-Q21
decisions, and the T2521 epic in `docs/PROJECT_WORKLIST.md`.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Index,
    Integer,
    String,
)

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SonoBusBinding(Base):
    """Canonical authority for every SonoBus/AOO binding on the platform.

    Sister of `AvbBinding`. The shape is intentionally generic so each
    SonoBus consumer (peer, group, AOO stream pair, client session) writes
    the same row. Per-consumer payload lives in the JSON descriptor
    columns; per-consumer projection adapters validate on write and parse
    on read.

    Storage layout: SQLite (sole platform backend today). Two cluster
    fields, `talker_node_id` and `listener_node_id`, are first-class
    columns (not buried inside metadata) because the cluster matrix
    endpoint queries against them directly (T2521-7 routes; mirrors
    `/api/avb/cluster/bindings/matrix`).
    """

    __tablename__ = "sonobus_bindings"

    binding_id = Column(String(36), primary_key=True)  # UUID4 string

    # Consumer identity — who owns this binding?
    consumer_type = Column(String(40), nullable=False)
    """One of:
    - "sonobus_peer"           (peer registration / mDNS-discovered or
                                connection-server registered)
    - "sonobus_group"          (channel-group / session ownership)
    - "sonobus_stream"         (AOO source/sink stream pair)
    - "sonobus_client_session" (transient client lease on a stream)
    - "cluster_route"          (cluster routing decision over SonoBus)
    """

    consumer_id = Column(String(255), nullable=False)
    """Identifier scoped per consumer_type. UTF-8."""

    consumer_label = Column(String(255), nullable=False, default="")
    """Human-readable label rendered in the canonical /sonobus surface."""

    binding_kind = Column(String(40), nullable=False, default="stream")
    """One of: "peer" | "group" | "stream" | "client_session".

    Lets the authority filter by intent class without parsing
    consumer_type strings. Mirrors the `consumer_type` axis but is the
    canonical filter for UI/projection queries.
    """

    # Source — the local AOO source instance
    source_type = Column(String(40), nullable=False)
    """One of:
    - "aoo_source"             (local AOO source on the talker)
    - "aoo_sink"               (local AOO sink on the listener)
    - "peer_endpoint"          (a remote endpoint for peer bindings)
    - "engine_signal"          (engine signal-level source for cluster routing)
    """

    source_descriptor = Column(JSON, nullable=False, default=dict)
    """JSON payload — aoo_source_id, channel_count, bind_interface, bind_port,
    SonoBus group/session, codec profile, jitter buffer ms, etc. Schema
    enforced by the per-consumer projection adapter."""

    target_type = Column(String(40), nullable=False)
    """One of:
    - "aoo_sink"               (remote AOO sink is the receiver)
    - "aoo_source"             (remote AOO source for incoming streams)
    - "peer_endpoint"          (a remote peer endpoint for peer bindings)
    - "engine_sink"            (engine signal-level destination)
    """

    target_descriptor = Column(JSON, nullable=False, default=dict)
    """JSON payload — listener_peer_endpoint, aoo_sink_id, server_endpoint,
    listener_capability, etc."""

    # Stream-level identity (first-class columns; queried by routing and
    # cluster-matrix endpoints; nullable for non-stream bindings like
    # peers or groups).
    stream_format = Column(String(64), nullable=True)
    """Stream format token. Default per Q7/Q8: "pcm_s24_48000".
    Reserved for future codec slots ("opus_lowlatency", etc.)."""

    codec_profile = Column(String(32), nullable=True)
    """Codec profile name. "pcm" by default; future expansions reserved."""

    jitter_buffer_ms = Column(Integer, nullable=True)
    """Per-binding jitter buffer in milliseconds. Default 4 ms per Q9
    (lowest practical). Operator-tunable. Adaptive ramp lives in the
    daemon; this is the configured target."""

    resend_policy = Column(String(32), nullable=True)
    """One of: "off" | "burst_loss_only" | "full". Default per Q9:
    "burst_loss_only"."""

    latency_target_ms = Column(Integer, nullable=True)
    """Operator-pinned latency cap. Default 8 ms (matches MAP2's live
    performance target)."""

    channel_count = Column(Integer, nullable=False, default=1)
    """Channel count for the stream (Q14: full multichannel from day
    one). Capped at 32 by default in the schema layer."""

    # Group / session (SonoBus channel-group semantics, Q14)
    group_id = Column(String(80), nullable=True)
    """SonoBus group identifier. Operator-visible. Bindings within the
    same group share routing namespace."""

    session_label = Column(String(120), nullable=True)
    """Operator-visible session label rendered in /sonobus/sessions."""

    # Network (Q3, Q17)
    transport_protocol = Column(String(16), nullable=False, default="udp")
    """One of: "udp" | "udp_tls". Future expansion; v1 ships UDP only."""

    bind_interface = Column(String(40), nullable=True)
    """Local bind interface (e.g., "eth0", "wlan0", "any")."""

    bind_port_local = Column(Integer, nullable=True)
    """Local UDP port. Allocated from the default 10000-10100 range if
    null; firewalld zone fragment opens this range (T2521-8)."""

    server_endpoint = Column(String(255), nullable=True)
    """MAP2-hosted connection server endpoint (Q3: enabled by default).
    "host:port" or null when running pure mDNS LAN discovery."""

    # Cluster identity — first-class columns so the cluster matrix
    # endpoint can index against them directly.
    talker_node_id = Column(String(64), nullable=True)
    """Node hosting the talker (AOO source). Nullable when local or
    unknown."""

    listener_node_id = Column(String(64), nullable=True)
    """Node hosting the listener (AOO sink). Nullable for client-session
    or peer-only bindings."""

    listener_capability = Column(String(32), nullable=True)
    """One of: "map2" | "sonobus_native" | "aoo_native". Cluster
    negotiation (Q4): "map2" peers are first-class, others are
    "degraded" with a UI tag."""

    cluster_role = Column(String(16), nullable=True)
    """One of: "primary" | "fallback" | "peer". Mirrors AVB cluster
    semantics (Q17)."""

    transport_priority = Column(String(32), nullable=False, default="avb_preferred")
    """One of: "avb_preferred" | "sonobus_preferred" | "sonobus_only".
    Default "avb_preferred" per Q18. Operator can pin a binding to
    "sonobus_preferred" or "sonobus_only" per-row."""

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
        Index("ix_sonobus_bindings_consumer", "consumer_type", "consumer_id"),
        Index("ix_sonobus_bindings_kind", "binding_kind"),
        Index("ix_sonobus_bindings_group", "group_id"),
        Index("ix_sonobus_bindings_cluster", "talker_node_id", "listener_node_id"),
        Index("ix_sonobus_bindings_scope", "scope", "scope_id"),
        Index("ix_sonobus_bindings_enabled", "enabled"),
        Index("ix_sonobus_bindings_transport_priority", "transport_priority"),
    )

    def __repr__(self) -> str:
        return (
            f"<SonoBusBinding {self.binding_id} "
            f"kind={self.binding_kind} "
            f"{self.consumer_type}:{self.consumer_id} "
            f"<= {self.source_type} => {self.target_type} "
            f"group={self.group_id} ({self.source})>"
        )


# Re-export the table object so the database migration helper can pass
# it explicitly to Base.metadata.create_all(tables=[...]).
sonobus_bindings_table = SonoBusBinding.__table__
