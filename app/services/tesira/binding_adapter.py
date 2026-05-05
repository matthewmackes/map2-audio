"""T2496-4 — TesiraFleet → AvbBindingAuthority adapter.

Closes the T2490-6b deferred refactor: every Tesira TTP subscription
that an operator pins (or the fleet auto-pins) writes a canonical
`AvbBinding` row through the platform-wide authority so the operator
Connections / Bindings surfaces show Tesira fleet state alongside
AVDECC stream state and cluster routing decisions.

Design constraints (mirrors `app/services/avb/router_authority_writer.py`):
  - The fleet runs as a singleton with no request-scoped session.
    These helpers create their own short-lived session via
    `app.database.get_session()` and commit on success.
  - DB errors must not fail the Tesira operation. Any exception is
    logged and swallowed; the fleet stays operational.
  - The TesiraFleet's internal in-memory DSP-block model remains the
    source-of-truth for moment-to-moment block parameters; the binding
    authority becomes the source-of-truth for "which Tesira
    subscriptions / blocks are pinned by an operator decision". This
    is the same posture the AvbRouter takes (T2496-2 + T2496-3): the
    in-memory store is a transient cache; the authority is the durable
    record.

Vocabulary mapping (per `binding_schemas.AvbBindingConsumerType`):
  - consumer_type="tesira_block"   → raw DSP-block parameter
                                      subscription (TTP attribute path)
  - consumer_type="tesira_preset"  → preset / design recall
                                      (T2496-5 covers this surface)
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.database import get_session
from app.services.avb.binding_authority import AvbBindingAuthority
from app.services.avb.binding_schemas import AvbBindingCreate

logger = logging.getLogger(__name__)


# Source-of-record tag for rows written by this adapter. Operator UI
# can filter on this to show "Tesira-authored bindings" as a slice.
TESIRA_FLEET_SOURCE = "tesira_fleet"


def _make_consumer_id(device_host: str, ttp_tag: str) -> str:
    """Compose a stable consumer_id from the device + TTP tag.

    The pair is unique within the fleet — same device + same tag is
    always the same subscription — so this serves as the idempotency
    key on the authority side.
    """
    return f"{device_host}::{ttp_tag}"


def _build_subscription_payload(
    *,
    device_host: str,
    device_name: str,
    ttp_tag: str,
    block_path: Optional[str] = None,
    metering_interval_ms: int = 100,
    extra_metadata: Optional[dict[str, Any]] = None,
) -> AvbBindingCreate:
    """Translate a Tesira TTP subscription into an `AvbBindingCreate`.

    The `source_descriptor` carries enough metadata for the operator
    surface to render a useful row (device + tag + block path);
    `target_descriptor` is empty by default (Tesira subscriptions don't
    have a separate downstream target — the device itself is the sink).
    """
    consumer_id = _make_consumer_id(device_host, ttp_tag)
    metadata: dict[str, Any] = {
        "device_host": device_host,
        "device_name": device_name,
        "ttp_tag": ttp_tag,
        "block_path": block_path,
        "metering_interval_ms": metering_interval_ms,
    }
    if extra_metadata:
        metadata.update(dict(extra_metadata))

    return AvbBindingCreate(
        consumer_type="tesira_block",
        consumer_id=consumer_id,
        consumer_label=f"{device_name or device_host} — {ttp_tag}",
        source_type="tesira_subscription",
        source_descriptor={
            "device_host": device_host,
            "device_name": device_name,
            "ttp_tag": ttp_tag,
            "block_path": block_path,
        },
        target_type="tesira_apply",
        target_descriptor={
            "device_host": device_host,
            "ttp_tag": ttp_tag,
        },
        stream_id=None,
        stream_format=None,
        srp_class=None,
        talker_node_id=None,
        listener_node_id=None,
        scope="global",
        scope_id=None,
        enabled=True,
        source=TESIRA_FLEET_SOURCE,
        created_by=TESIRA_FLEET_SOURCE,
        metadata=metadata,
    )


async def record_tesira_subscription_in_authority(
    *,
    device_host: str,
    device_name: str,
    ttp_tag: str,
    block_path: Optional[str] = None,
    metering_interval_ms: int = 100,
    extra_metadata: Optional[dict[str, Any]] = None,
) -> Optional[str]:
    """Write a Tesira subscription through `AvbBindingAuthority`.

    Returns the new `binding_id` (UUID4) or None on failure.
    Idempotent on duplicate: a second call for the same
    (device_host, ttp_tag) pair returns the existing binding_id without
    inserting a second row.
    """
    try:
        payload = _build_subscription_payload(
            device_host=device_host,
            device_name=device_name,
            ttp_tag=ttp_tag,
            block_path=block_path,
            metering_interval_ms=metering_interval_ms,
            extra_metadata=extra_metadata,
        )
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "TesiraFleet: could not build binding payload for %s::%s: %s",
            device_host,
            ttp_tag,
            exc,
        )
        return None

    try:
        async with get_session() as session:
            authority = AvbBindingAuthority(session)
            existing = await authority.list_for_consumer(
                consumer_type="tesira_block",
                consumer_id=payload.consumer_id,
            )
            if existing:
                return existing[0].binding_id
            created = await authority.create(payload)
            return created.binding_id
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "TesiraFleet: failed to record subscription %s in AvbBindingAuthority: %s",
            payload.consumer_id,
            exc,
        )
        return None


async def clear_tesira_subscription_in_authority(
    *,
    device_host: str,
    ttp_tag: str,
) -> int:
    """Delete the authority row(s) for a Tesira subscription.

    Returns the rowcount. Failure is non-fatal — same posture as
    `record_tesira_subscription_in_authority`.
    """
    consumer_id = _make_consumer_id(device_host, ttp_tag)
    try:
        async with get_session() as session:
            authority = AvbBindingAuthority(session)
            return await authority.delete_for_consumer(
                consumer_type="tesira_block",
                consumer_id=consumer_id,
            )
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "TesiraFleet: failed to clear subscription %s from AvbBindingAuthority: %s",
            consumer_id,
            exc,
        )
        return 0


async def list_tesira_bindings_for_device(
    device_host: str,
    *,
    enabled_only: bool = False,
) -> list[Any]:
    """Return every Tesira-authored binding for a single device host.

    Used by the operator surface to populate per-device cards on the
    Devices region with the count of pinned subscriptions. Returns an
    empty list on DB failure.
    """
    try:
        async with get_session(read_only=True) as session:
            authority = AvbBindingAuthority(session)
            rows = await authority.list_in_scope(
                "global",
                None,
                enabled_only=enabled_only,
            )
            return [
                r
                for r in rows
                if r.consumer_type == "tesira_block"
                and r.source == TESIRA_FLEET_SOURCE
                and (r.metadata or {}).get("device_host") == device_host
            ]
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "TesiraFleet: list_tesira_bindings_for_device(%s) failed: %s",
            device_host,
            exc,
        )
        return []


__all__ = [
    "TESIRA_FLEET_SOURCE",
    "record_tesira_subscription_in_authority",
    "clear_tesira_subscription_in_authority",
    "list_tesira_bindings_for_device",
]
