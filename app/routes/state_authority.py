"""State Authority public API — catalog, URI resolution, schema introspection.

These routes expose the tonechaser URI catalog + canonicalizer + graph-doc
schema to the frontend and to any external integrator. The routes are
read-only: all snapshot mutations flow through the existing snapshot/chain
surface while Phase 2 decomposes the monolithic services.

Contract (matches docs/api-contract-standards.md):

- `GET  /api/state-authority/uri-catalog` → {entries: [...], count: N}
- `GET  /api/state-authority/uri-catalog/{type}` → same shape, filtered
- `POST /api/state-authority/uri-resolve` → {input, canonical, entry?}
- `GET  /api/state-authority/schema` → the monolithic JSON Schema document
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.services.juce_engine_service import get_audio_engine
from app.services.state_authority_graph import (
    canonicalize_plugin_uri,
    load_snapshot_graph_schema,
)
from app.services.state_authority_reconciliation_scheduler import (
    render_metrics_as_prometheus,
)
from app.services.state_authority_uri_catalog import (
    CATALOG_TYPES,
    TONECHASER_CATALOG,
    iter_catalog,
    lookup_uri,
)

router = APIRouter(prefix="/api/state-authority", tags=["State Authority"])


class UriCatalogEntryResponse(BaseModel):
    uri: str
    type: str
    name: str
    label: str
    description: str
    category: str
    default_parameters: dict[str, float]
    default_state: dict[str, Any]
    aliases: list[str]
    is_system_managed: bool


class UriCatalogResponse(BaseModel):
    entries: list[UriCatalogEntryResponse]
    count: int = Field(..., ge=0)


class UriResolveRequest(BaseModel):
    uri: str = Field(..., min_length=1)


class UriResolveResponse(BaseModel):
    input: str
    canonical: str
    entry: UriCatalogEntryResponse | None = None


def _serialize(entry) -> UriCatalogEntryResponse:
    return UriCatalogEntryResponse(
        uri=entry.uri,
        type=entry.type,
        name=entry.name,
        label=entry.label,
        description=entry.description,
        category=entry.category,
        default_parameters=dict(entry.default_parameters),
        default_state=dict(entry.default_state),
        aliases=list(entry.aliases),
        is_system_managed=entry.is_system_managed,
    )


@router.get("/uri-catalog", response_model=UriCatalogResponse)
async def get_uri_catalog() -> UriCatalogResponse:
    entries = [_serialize(entry) for entry in TONECHASER_CATALOG]
    return UriCatalogResponse(entries=entries, count=len(entries))


@router.get("/uri-catalog/{catalog_type}", response_model=UriCatalogResponse)
async def get_uri_catalog_by_type(catalog_type: str) -> UriCatalogResponse:
    if catalog_type not in CATALOG_TYPES:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "invalid_catalog_type",
                    "message": f"catalog_type must be one of {sorted(CATALOG_TYPES)!r}",
                    "details": {"received": catalog_type, "allowed": list(CATALOG_TYPES)},
                }
            },
        )
    entries = [_serialize(entry) for entry in iter_catalog(catalog_type=catalog_type)]
    return UriCatalogResponse(entries=entries, count=len(entries))


@router.post("/uri-resolve", response_model=UriResolveResponse)
async def post_uri_resolve(payload: UriResolveRequest) -> UriResolveResponse:
    canonical = canonicalize_plugin_uri(payload.uri)
    entry = lookup_uri(canonical)
    serialized = _serialize(entry) if entry is not None else None
    return UriResolveResponse(input=payload.uri, canonical=canonical, entry=serialized)


@router.get("/schema")
async def get_state_authority_schema() -> dict[str, Any]:
    schema = load_snapshot_graph_schema()
    return schema


# -----------------------------------------------------------------------------
# Morph pad — atomic A/B/C/D quad morph X/Y position setter.
# Frontend morph-pad UI binds directly here so XY drags become immediate
# engine-side parameter interpolation.
# -----------------------------------------------------------------------------


class MorphPositionRequest(BaseModel):
    x: float = Field(..., ge=-1.0, le=2.0, description="X axis 0..1 (accepts -1..2 which the engine clamps)")
    y: float = Field(..., ge=-1.0, le=2.0, description="Y axis 0..1 (accepts -1..2 which the engine clamps)")


class MorphStateResponse(BaseModel):
    x: float
    y: float
    configured_corners: list[str]


@router.post("/morph/position", response_model=MorphStateResponse)
async def post_morph_position(payload: MorphPositionRequest) -> MorphStateResponse:
    engine = get_audio_engine()
    if engine is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "engine_unavailable",
                    "message": "Audio engine not running; morph position cannot be applied.",
                    "details": None,
                }
            },
        )
    set_position = getattr(engine, "set_morph_position_2d", None)
    if set_position is None:
        raise HTTPException(
            status_code=501,
            detail={
                "error": {
                    "code": "morph_api_not_exposed",
                    "message": "set_morph_position_2d is not exposed on the current engine build.",
                    "details": None,
                }
            },
        )
    set_position(payload.x, payload.y)
    state_getter = getattr(engine, "get_morph_state", None)
    if state_getter is None:
        return MorphStateResponse(x=payload.x, y=payload.y, configured_corners=[])
    state = state_getter() or {}
    return MorphStateResponse(
        x=float(state.get("x", payload.x)),
        y=float(state.get("y", payload.y)),
        configured_corners=list(state.get("configured_corners") or []),
    )


@router.get("/morph/state", response_model=MorphStateResponse)
async def get_morph_state() -> MorphStateResponse:
    engine = get_audio_engine()
    if engine is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "engine_unavailable",
                    "message": "Audio engine not running; morph state unavailable.",
                    "details": None,
                }
            },
        )
    state_getter = getattr(engine, "get_morph_state", None)
    if state_getter is None:
        return MorphStateResponse(x=0.5, y=0.5, configured_corners=[])
    state = state_getter() or {}
    return MorphStateResponse(
        x=float(state.get("x", 0.5)),
        y=float(state.get("y", 0.5)),
        configured_corners=list(state.get("configured_corners") or []),
    )


# -----------------------------------------------------------------------------
# Prometheus exposition for reconciliation metrics.
# -----------------------------------------------------------------------------


class ReconciliationMetricsResponse(BaseModel):
    metrics: dict[str, Any]
    prometheus: str


@router.get("/reconciliation/metrics", response_model=ReconciliationMetricsResponse)
async def get_reconciliation_metrics(request: Request) -> ReconciliationMetricsResponse:
    """Expose reconciliation scheduler metrics as both JSON and Prometheus.

    If a scheduler has been plumbed onto `app.state.state_authority_scheduler`
    (by app.main lifespan), its live metrics are returned. Otherwise the
    response carries an empty-counter body — this lets dashboards always
    succeed even when reconciliation is disabled on the node.
    """
    from app.services.state_authority_reconciliation_scheduler import (
        ReconciliationMetrics,
    )
    scheduler = getattr(request.app.state, "state_authority_scheduler", None)
    metrics: ReconciliationMetrics
    if scheduler is not None and hasattr(scheduler, "metrics"):
        metrics = scheduler.metrics
    else:
        metrics = ReconciliationMetrics()
    return ReconciliationMetricsResponse(
        metrics=metrics.as_dict(),
        prometheus=render_metrics_as_prometheus(metrics),
    )
