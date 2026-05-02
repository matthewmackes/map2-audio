"""T2490-3a — read-side projection of `AvbRouter` state into the
canonical AvbBinding shape.

The full T2490-3 refactor will turn `avb_router.py` into a writer
through `AvbBindingAuthority` so the routing matrix becomes a
projection of the binding table rather than a separate state store.
This iter ships the read-side seam first: every live `StreamConnection`
in the running `AvbRouter` instance is rendered as a synthetic
`AvbBindingRead` so the operator-visible Connections surface (T2490-4)
can show real router state today, before the writer side flips over.

Synthetic rows carry a `metadata.projection_source = "avb_router"` flag
so they can be filtered out (or merged with) the durable
authority-backed rows once T2490-3b lands.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from app.services.avb.binding_schemas import AvbBindingRead

logger = logging.getLogger(__name__)


def _format_stream_id(entity_id: str, unique_id: int) -> str:
    """Compose an AVTP-style stream id from talker entity + unique id."""
    return f"{entity_id}:{unique_id}".upper()


def _projected_binding_id(connection_id: str) -> str:
    """Stable, deterministic 36-char id derived from the connection id.

    Synthetic projections must NOT collide with real UUID4 binding_ids
    in the table (which are also 36 chars: 8-4-4-4-12). We use a
    "proj-" prefix followed by 5 hex segments laid out exactly the same
    way as a UUID4 (8-4-4-4-12 = 32 chars + 4 dashes), then drop the
    last 5 chars to keep the total at 36. The literal "proj-" prefix
    lets the operator surface detect synthetic rows trivially.
    """
    import hashlib

    digest = hashlib.sha256(connection_id.encode("utf-8")).hexdigest()
    # Layout: "proj-" (5) + <8>-<4>-<4>-<4>-<7> (5+8+1+4+1+4+1+4+1+7 = 36).
    parts = [
        digest[0:8],
        digest[8:12],
        digest[12:16],
        digest[16:20],
        digest[20:27],
    ]
    return "proj-" + "-".join(parts)


def _project_one_connection(connection) -> Optional[AvbBindingRead]:
    """Render a single `StreamConnection` as an `AvbBindingRead`.

    Returns None if the connection is missing required fields (defensive
    — `StreamConnection` is a permissive dataclass).
    """
    try:
        talker = connection.talker
        listener = connection.listener
        connection_id = connection.connection_id()

        stream_id = _format_stream_id(talker.entity_id, talker.unique_id)
        # Format string is dependent on talker config; expose as-is.
        stream_format = getattr(talker, "format", None) or None

        # talker_node_id / listener_node_id come straight off the
        # endpoint dataclass — None means local node or unknown.
        talker_node_id = talker.node_id or None
        listener_node_id = listener.node_id or None

        now = datetime.now(timezone.utc)
        established = getattr(connection, "established_time", None)
        created_at = established or now

        return AvbBindingRead(
            binding_id=_projected_binding_id(connection_id),
            consumer_type="avdecc_stream",
            consumer_id=connection_id,
            consumer_label=f"{talker.device_name} → {listener.device_name}",
            source_type="avdecc_talker",
            source_descriptor={
                "talker_entity_id": talker.entity_id,
                "talker_unique_id": talker.unique_id,
                "channels": talker.channels,
                "sample_rate": talker.sample_rate,
                "device_type": talker.device_type,
            },
            target_type="avdecc_listener",
            target_descriptor={
                "listener_entity_id": listener.entity_id,
                "listener_unique_id": listener.unique_id,
                "channels": listener.channels,
                "sample_rate": listener.sample_rate,
                "device_type": listener.device_type,
            },
            stream_id=stream_id,
            stream_format=stream_format,
            srp_class=None,  # SRP class not modeled on StreamConnection yet
            talker_node_id=talker_node_id,
            listener_node_id=listener_node_id,
            scope="cluster" if (talker_node_id or listener_node_id) else "global",
            scope_id=None,
            enabled=str(getattr(connection.state, "value", connection.state))
                .lower() == "connected",
            source="avb_router_projection",
            metadata={
                "projection_source": "avb_router",
                "connection_state": str(
                    getattr(connection.state, "value", connection.state)
                ),
                "connection_role": getattr(connection, "connection_role", None),
                "loop_id": getattr(connection, "loop_id", None),
                "srp_admission_id": getattr(connection, "srp_admission_id", None),
            },
            created_at=created_at,
            created_by="avb_router_projection",
            modified_at=now,
            modified_by="avb_router_projection",
        )
    except Exception as exc:
        logger.warning("Skipping uncoercible AVB router connection: %s", exc)
        return None


def project_router_connections() -> list[AvbBindingRead]:
    """Return one projected `AvbBindingRead` per live router connection.

    Safe to call when the router singleton hasn't been initialized — in
    that case it returns an empty list rather than raising.
    """
    try:
        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()
        connections = list(router.connections.values())
    except Exception as exc:
        logger.debug(
            "Could not load avb_router connections for projection: %s", exc
        )
        return []

    out: list[AvbBindingRead] = []
    for conn in connections:
        projected = _project_one_connection(conn)
        if projected is not None:
            out.append(projected)
    return out


def is_projected_binding_id(binding_id: str) -> bool:
    """True iff the binding_id is a router-projection synthetic id."""
    return binding_id.startswith("proj-")


__all__ = [
    "project_router_connections",
    "is_projected_binding_id",
]
