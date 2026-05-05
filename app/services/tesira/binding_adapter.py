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


# ---------------------------------------------------------------------------
# T2496-5 — Tesira preset / design recall as canonical AvbBindings.
#
# Closes the T2490-6c deferred refactor: every Tesira preset recall
# (`POST /api/tesira/presets/recall`) and every design push
# (`POST /api/tesira/designs/push`) gets a row in the canonical authority
# *before* the device is asked to do the work, so the binding authority
# knows about the recall request before the device has acked it. The
# `enabled` flag tracks the device's ack — operator UI shows "pending"
# rows in warm-gray and "applied" rows in green.
#
# Vocabulary mapping:
#   - consumer_type="tesira_preset"
#       metadata.kind="preset"  → preset recall
#       metadata.kind="design"  → design push
#   - source_type="tesira_subscription" (the operator-pinned event)
#   - target_type="tesira_apply"        (the device action)
# ---------------------------------------------------------------------------


def _make_preset_consumer_id(device_host: str, preset_id: int | str) -> str:
    """Stable consumer_id for a Tesira preset recall request."""
    return f"{device_host}::preset::{preset_id}"


def _make_design_consumer_id(device_host: str, design_id: str) -> str:
    """Stable consumer_id for a Tesira design push request."""
    return f"{device_host}::design::{design_id}"


def _build_preset_payload(
    *,
    device_host: str,
    device_name: str,
    preset_id: int | str,
    preset_label: Optional[str] = None,
    pending: bool = True,
    extra_metadata: Optional[dict[str, Any]] = None,
) -> AvbBindingCreate:
    """Translate a preset recall into an `AvbBindingCreate`.

    `pending=True` (the default) writes the row with `enabled=False`
    so the operator surface can render the recall in the
    "requested-but-not-yet-acked" state. The device-ack handler
    flips `enabled=True` once the recall completes.
    """
    consumer_id = _make_preset_consumer_id(device_host, preset_id)
    label = preset_label or f"Preset {preset_id}"
    metadata: dict[str, Any] = {
        "kind": "preset",
        "device_host": device_host,
        "device_name": device_name,
        "preset_id": str(preset_id),
        "preset_label": label,
        "pending": pending,
    }
    if extra_metadata:
        metadata.update(dict(extra_metadata))

    return AvbBindingCreate(
        consumer_type="tesira_preset",
        consumer_id=consumer_id,
        consumer_label=f"{device_name or device_host} — {label}",
        source_type="tesira_subscription",
        source_descriptor={
            "device_host": device_host,
            "device_name": device_name,
            "preset_id": str(preset_id),
            "kind": "preset",
        },
        target_type="tesira_apply",
        target_descriptor={
            "device_host": device_host,
            "preset_id": str(preset_id),
            "action": "recall",
        },
        stream_id=None,
        stream_format=None,
        srp_class=None,
        talker_node_id=None,
        listener_node_id=None,
        scope="global",
        scope_id=None,
        # When the recall is pending, the row exists but is disabled —
        # operator UI tags it warm-gray. The device-ack handler flips
        # enabled=True via mark_preset_acked_in_authority below.
        enabled=not pending,
        source=TESIRA_FLEET_SOURCE,
        created_by=TESIRA_FLEET_SOURCE,
        metadata=metadata,
    )


def _build_design_payload(
    *,
    device_host: str,
    device_name: str,
    design_id: str,
    design_label: Optional[str] = None,
    pending: bool = True,
    extra_metadata: Optional[dict[str, Any]] = None,
) -> AvbBindingCreate:
    """Translate a design push into an `AvbBindingCreate`."""
    consumer_id = _make_design_consumer_id(device_host, design_id)
    label = design_label or f"Design {design_id}"
    metadata: dict[str, Any] = {
        "kind": "design",
        "device_host": device_host,
        "device_name": device_name,
        "design_id": design_id,
        "design_label": label,
        "pending": pending,
    }
    if extra_metadata:
        metadata.update(dict(extra_metadata))

    return AvbBindingCreate(
        consumer_type="tesira_preset",  # vocab: presets + designs share the bucket
        consumer_id=consumer_id,
        consumer_label=f"{device_name or device_host} — {label}",
        source_type="tesira_subscription",
        source_descriptor={
            "device_host": device_host,
            "device_name": device_name,
            "design_id": design_id,
            "kind": "design",
        },
        target_type="tesira_apply",
        target_descriptor={
            "device_host": device_host,
            "design_id": design_id,
            "action": "push",
        },
        stream_id=None,
        stream_format=None,
        srp_class=None,
        talker_node_id=None,
        listener_node_id=None,
        scope="global",
        scope_id=None,
        enabled=not pending,
        source=TESIRA_FLEET_SOURCE,
        created_by=TESIRA_FLEET_SOURCE,
        metadata=metadata,
    )


async def record_tesira_preset_in_authority(
    *,
    device_host: str,
    device_name: str,
    preset_id: int | str,
    preset_label: Optional[str] = None,
    pending: bool = True,
    extra_metadata: Optional[dict[str, Any]] = None,
) -> Optional[str]:
    """Write a preset recall request through `AvbBindingAuthority`.

    Returns the new `binding_id`. Idempotent on duplicate. When called
    with `pending=True` (the default), the row is created with
    `enabled=False`; call `mark_preset_acked_in_authority` once the
    device acks the recall to flip `enabled=True`.
    """
    try:
        payload = _build_preset_payload(
            device_host=device_host,
            device_name=device_name,
            preset_id=preset_id,
            preset_label=preset_label,
            pending=pending,
            extra_metadata=extra_metadata,
        )
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "TesiraFleet: could not build preset payload for %s::%s: %s",
            device_host,
            preset_id,
            exc,
        )
        return None

    try:
        async with get_session() as session:
            authority = AvbBindingAuthority(session)
            existing = await authority.list_for_consumer(
                consumer_type="tesira_preset",
                consumer_id=payload.consumer_id,
            )
            if existing:
                return existing[0].binding_id
            created = await authority.create(payload)
            return created.binding_id
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "TesiraFleet: failed to record preset %s in AvbBindingAuthority: %s",
            payload.consumer_id,
            exc,
        )
        return None


async def record_tesira_design_in_authority(
    *,
    device_host: str,
    device_name: str,
    design_id: str,
    design_label: Optional[str] = None,
    pending: bool = True,
    extra_metadata: Optional[dict[str, Any]] = None,
) -> Optional[str]:
    """Write a design push request through `AvbBindingAuthority`.

    Mirrors `record_tesira_preset_in_authority` for the design surface.
    """
    try:
        payload = _build_design_payload(
            device_host=device_host,
            device_name=device_name,
            design_id=design_id,
            design_label=design_label,
            pending=pending,
            extra_metadata=extra_metadata,
        )
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "TesiraFleet: could not build design payload for %s::%s: %s",
            device_host,
            design_id,
            exc,
        )
        return None

    try:
        async with get_session() as session:
            authority = AvbBindingAuthority(session)
            existing = await authority.list_for_consumer(
                consumer_type="tesira_preset",
                consumer_id=payload.consumer_id,
            )
            if existing:
                return existing[0].binding_id
            created = await authority.create(payload)
            return created.binding_id
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "TesiraFleet: failed to record design %s in AvbBindingAuthority: %s",
            payload.consumer_id,
            exc,
        )
        return None


async def mark_preset_acked_in_authority(
    *,
    device_host: str,
    preset_id: int | str,
) -> bool:
    """Flip `enabled=True` + `metadata.pending=False` on a pending
    preset row once the device acks the recall.

    Returns True if a row was updated, False otherwise (no matching
    pending row, or DB failure).
    """
    consumer_id = _make_preset_consumer_id(device_host, preset_id)
    return await _mark_consumer_acked(consumer_id)


async def mark_design_acked_in_authority(
    *,
    device_host: str,
    design_id: str,
) -> bool:
    """Flip `enabled=True` + `metadata.pending=False` on a pending
    design row once the device acks the push."""
    consumer_id = _make_design_consumer_id(device_host, design_id)
    return await _mark_consumer_acked(consumer_id)


async def _mark_consumer_acked(consumer_id: str) -> bool:
    """Internal: flip the first matching tesira_preset row to enabled."""
    from app.services.avb.binding_schemas import AvbBindingUpdate

    try:
        async with get_session() as session:
            authority = AvbBindingAuthority(session)
            rows = await authority.list_for_consumer(
                consumer_type="tesira_preset",
                consumer_id=consumer_id,
            )
            if not rows:
                return False
            row = rows[0]
            new_metadata = dict(row.metadata or {})
            new_metadata["pending"] = False
            await authority.update(
                row.binding_id,
                AvbBindingUpdate(
                    enabled=True,
                    metadata=new_metadata,
                    modified_by=TESIRA_FLEET_SOURCE,
                ),
            )
            return True
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "TesiraFleet: failed to mark consumer %s as acked: %s",
            consumer_id,
            exc,
        )
        return False


async def clear_tesira_preset_in_authority(
    *,
    device_host: str,
    preset_id: int | str,
) -> int:
    """Delete a tesira_preset row by (device_host, preset_id)."""
    consumer_id = _make_preset_consumer_id(device_host, preset_id)
    try:
        async with get_session() as session:
            authority = AvbBindingAuthority(session)
            return await authority.delete_for_consumer(
                consumer_type="tesira_preset",
                consumer_id=consumer_id,
            )
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "TesiraFleet: failed to clear preset %s: %s", consumer_id, exc
        )
        return 0


async def clear_tesira_design_in_authority(
    *,
    device_host: str,
    design_id: str,
) -> int:
    """Delete a tesira_preset row keyed on a design_id."""
    consumer_id = _make_design_consumer_id(device_host, design_id)
    try:
        async with get_session() as session:
            authority = AvbBindingAuthority(session)
            return await authority.delete_for_consumer(
                consumer_type="tesira_preset",
                consumer_id=consumer_id,
            )
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "TesiraFleet: failed to clear design %s: %s", consumer_id, exc
        )
        return 0


__all__ = [
    "TESIRA_FLEET_SOURCE",
    # T2496-4 — subscription helpers
    "record_tesira_subscription_in_authority",
    "clear_tesira_subscription_in_authority",
    "list_tesira_bindings_for_device",
    # T2496-5 — preset + design helpers
    "record_tesira_preset_in_authority",
    "record_tesira_design_in_authority",
    "mark_preset_acked_in_authority",
    "mark_design_acked_in_authority",
    "clear_tesira_preset_in_authority",
    "clear_tesira_design_in_authority",
]
