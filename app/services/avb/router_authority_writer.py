"""T2496-2 — writer-side coupling between AvbRouter and AvbBindingAuthority.

The legacy router (`app/services/avb/avb_router.py`) maintains its own
`connections: Dict[str, StreamConnection]` store. T2490-3a shipped the
read-side projection seam (`router_projection.py`) so the operator
Connections page could see live router state. This slice closes the
writer-side gap: every successful `AvbRouter.connect()` writes a real
`AvbBinding` row through `AvbBindingAuthority`, and every successful
`AvbRouter.disconnect()` deletes it.

Once authority-backed bindings exist for a connection, the read-side
projection skips the connection (the authority row supersedes the
synthetic projection — see `router_projection.py`).

Design constraints:
  - The router runs as a singleton with no request-scoped session.
    These helpers create their own short-lived session via
    `app.database.get_session()` and commit on success.
  - DB errors must not fail the audio routing operation. Any exception
    is logged and swallowed; the router stays operational. Authority
    drift (a connect that didn't write a row, or a disconnect that
    didn't delete one) self-heals on next operator action against the
    same talker/listener pair.
  - The mapping mirrors `router_projection._project_one_connection` so
    a binding written here is shape-identical to what the projection
    used to render — the only differences are: a real UUID4 binding_id
    (authority-assigned), `source="avb_router"` (not `..._projection`),
    and the absence of `metadata.projection_source` (this is a durable
    row, not a synthetic one).
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

from app.database import get_session
from app.services.avb.binding_authority import AvbBindingAuthority
from app.services.avb.binding_schemas import AvbBindingCreate

if TYPE_CHECKING:  # pragma: no cover — type-only
    from app.services.avb.avb_router import StreamConnection

logger = logging.getLogger(__name__)


# Source-of-record tag for rows written by this helper. The read-side
# projection layer skips connections whose `authority_binding_id` is set,
# so this tag exists primarily for operator-visible diagnostics ("who
# wrote this row?") in the Connections / Bindings pages.
ROUTER_WRITER_SOURCE = "avb_router"


def _format_stream_id(entity_id: str, unique_id: int) -> str:
    """Compose an AVTP-style stream id — mirrors router_projection."""
    return f"{entity_id}:{unique_id}".upper()


def _build_create_payload(connection: "StreamConnection") -> AvbBindingCreate:
    """Translate a live `StreamConnection` to an `AvbBindingCreate`.

    Schema mirrors `router_projection._project_one_connection` so the
    durable row is bit-identical to what the projection used to render.
    """
    talker = connection.talker
    listener = connection.listener
    connection_id = connection.connection_id()

    talker_node_id = talker.node_id or None
    listener_node_id = listener.node_id or None

    return AvbBindingCreate(
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
        stream_id=_format_stream_id(talker.entity_id, talker.unique_id),
        stream_format=getattr(talker, "format", None) or None,
        srp_class=None,
        talker_node_id=talker_node_id,
        listener_node_id=listener_node_id,
        scope="cluster" if (talker_node_id or listener_node_id) else "global",
        scope_id=None,
        enabled=True,
        source=ROUTER_WRITER_SOURCE,
        created_by=ROUTER_WRITER_SOURCE,
        metadata={
            "connection_role": getattr(connection, "connection_role", None),
            "loop_id": getattr(connection, "loop_id", None),
            "srp_admission_id": getattr(connection, "srp_admission_id", None),
            "srp_reservation_id": getattr(connection, "srp_reservation_id", None),
        },
    )


async def record_connection_in_authority(
    connection: "StreamConnection",
) -> Optional[str]:
    """Write the connection through `AvbBindingAuthority`. Returns the
    new `binding_id`, or None on failure.

    Idempotent on duplicate: if a row with the same `consumer_id` (the
    deterministic `talker_endpoint→listener_endpoint` connection id)
    already exists, the existing row is returned and no new row is
    inserted.

    Failure is non-fatal — the router stays operational even if the
    DB write fails. The caller logs and proceeds.
    """
    try:
        payload = _build_create_payload(connection)
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "AvbRouter: could not build binding payload for %s: %s",
            getattr(connection, "connection_id", lambda: "<?>")(),
            exc,
        )
        return None

    try:
        async with get_session() as session:
            authority = AvbBindingAuthority(session)
            existing = await authority.list_for_consumer(
                consumer_type="avdecc_stream",
                consumer_id=payload.consumer_id,
            )
            if existing:
                # Idempotent path: a row already exists for this
                # connection. Return its id without writing again.
                return existing[0].binding_id
            created = await authority.create(payload)
            return created.binding_id
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "AvbRouter: failed to record connection %s in AvbBindingAuthority: %s",
            payload.consumer_id,
            exc,
        )
        return None


async def clear_connection_in_authority(connection_id: str) -> int:
    """Delete every authority row keyed on this connection_id. Returns
    the number of rows deleted (0 if nothing matched, which is fine —
    the connection may pre-date the writer-side coupling, or the row
    may have been removed out-of-band).

    Failure is non-fatal — same posture as `record_connection_in_authority`.
    """
    try:
        async with get_session() as session:
            authority = AvbBindingAuthority(session)
            return await authority.delete_for_consumer(
                consumer_type="avdecc_stream",
                consumer_id=connection_id,
            )
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "AvbRouter: failed to clear connection %s from AvbBindingAuthority: %s",
            connection_id,
            exc,
        )
        return 0


__all__ = [
    "ROUTER_WRITER_SOURCE",
    "record_connection_in_authority",
    "clear_connection_in_authority",
]
