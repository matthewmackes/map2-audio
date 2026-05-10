"""Per-pack Configurator routes (T2499 mega-epic, Phase 0.2-0.3).

Two endpoint families, both keyed by ``pack_id``:

  - ``GET    /api/devices/configurator/{pack_id}/overrides``
  - ``PUT    /api/devices/configurator/{pack_id}/overrides``
  - ``DELETE /api/devices/configurator/{pack_id}/overrides``
        Thin wrapper over the pack's registered ``OverrideStore``.
        Reads/writes ``~/.map2/devices/<pack_id>-<slug>.yaml`` atomically.
        Hosts non-MIDI bindings (HID, AVDECC) plus per-installation
        device config (firmware mode, calibration data, routing).

  - ``GET /api/devices/configurator/{pack_id}/learn/last-event``
        Polls the pack's registered ``LearnEventSource``. Returns a
        kind-agnostic snapshot that matches the frontend
        ``DeviceLearnEvent`` discriminated union shape (MIDI / HID /
        AVDECC).

Both families look up the pack via the framework's
``DeviceConfiguratorRegistry`` (process-wide singleton). Packs that
do not register the corresponding primitive return 404 — the
frontend hides the corresponding tab in that case.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field

from app.services.devices._shared.override_store import OverrideSchemaError
from app.services.devices._shared.registry import (
    DeviceConfiguratorRegistry,
    get_default_registry,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/devices/configurator",
    tags=["Configurator Devices"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class OverridesResponse(BaseModel):
    pack_id: str
    path: str
    payload: Optional[dict[str, Any]] = None


class OverridesWriteRequest(BaseModel):
    payload: dict[str, Any] = Field(
        ...,
        description=(
            "YAML override payload. The route auto-fills "
            "``schema_version`` and ``device`` if not present so the "
            "frontend doesn't need to know the pack's schema constants."
        ),
    )


class OverridesWriteResponse(BaseModel):
    pack_id: str
    path: str


class OverridesDeleteResponse(BaseModel):
    pack_id: str
    deleted: bool


class LearnEventResponse(BaseModel):
    pack_id: str
    sequence: int
    observed_at: Optional[float] = None
    event: Optional[dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _registry() -> DeviceConfiguratorRegistry:
    return get_default_registry()


def _require_pack(registry: DeviceConfiguratorRegistry, pack_id: str):
    registration = registry.get(pack_id)
    if registration is None:
        raise HTTPException(
            status_code=404, detail=f"Configurator pack {pack_id!r} is not registered"
        )
    return registration


# ---------------------------------------------------------------------------
# Per-pack overrides
# ---------------------------------------------------------------------------


@router.get(
    "/{pack_id}/overrides",
    response_model=OverridesResponse,
    summary="Read the pack's per-installation YAML override file",
)
async def get_overrides(
    pack_id: str = Path(..., description="Stable pack identifier"),
) -> OverridesResponse:
    registration = _require_pack(_registry(), pack_id)
    if registration.override_store is None:
        raise HTTPException(
            status_code=404,
            detail=f"Pack {pack_id!r} does not expose an override store",
        )
    try:
        loaded = registration.override_store.load()
    except OverrideSchemaError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    payload = dict(loaded) if loaded is not None else None
    return OverridesResponse(
        pack_id=pack_id,
        path=registration.override_store.path(),
        payload=payload,
    )


@router.put(
    "/{pack_id}/overrides",
    response_model=OverridesWriteResponse,
    summary="Write the pack's per-installation YAML override file",
)
async def put_overrides(
    request: OverridesWriteRequest,
    pack_id: str = Path(..., description="Stable pack identifier"),
) -> OverridesWriteResponse:
    registration = _require_pack(_registry(), pack_id)
    if registration.override_store is None:
        raise HTTPException(
            status_code=404,
            detail=f"Pack {pack_id!r} does not expose an override store",
        )
    try:
        path = registration.override_store.save(request.payload)
    except OverrideSchemaError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:  # pragma: no cover - guard rail
        logger.exception("Configurator override save failed for %s", pack_id)
        raise HTTPException(status_code=500, detail=str(exc))
    return OverridesWriteResponse(pack_id=pack_id, path=path)


@router.delete(
    "/{pack_id}/overrides",
    response_model=OverridesDeleteResponse,
    summary="Delete the pack's per-installation YAML override file",
)
async def delete_overrides(
    pack_id: str = Path(..., description="Stable pack identifier"),
) -> OverridesDeleteResponse:
    registration = _require_pack(_registry(), pack_id)
    if registration.override_store is None:
        raise HTTPException(
            status_code=404,
            detail=f"Pack {pack_id!r} does not expose an override store",
        )
    deleted = registration.override_store.delete()
    return OverridesDeleteResponse(pack_id=pack_id, deleted=deleted)


# ---------------------------------------------------------------------------
# Per-pack last-event polling
# ---------------------------------------------------------------------------


@router.get(
    "/{pack_id}/learn/last-event",
    response_model=LearnEventResponse,
    summary="Read the pack's most recent Learn event (kind-agnostic)",
)
async def get_last_learn_event(
    pack_id: str = Path(..., description="Stable pack identifier"),
) -> LearnEventResponse:
    registration = _require_pack(_registry(), pack_id)
    if registration.learn_event_source is None:
        raise HTTPException(
            status_code=404,
            detail=f"Pack {pack_id!r} does not expose a Learn event source",
        )
    snapshot = registration.learn_event_source.last_event()
    event_payload: Optional[dict[str, Any]]
    if snapshot.event is None:
        event_payload = None
    else:
        event_payload = dict(snapshot.event)
    return LearnEventResponse(
        pack_id=pack_id,
        sequence=snapshot.sequence,
        observed_at=snapshot.observed_at,
        event=event_payload,
    )
