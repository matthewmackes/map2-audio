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

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.state_authority_graph import (
    canonicalize_plugin_uri,
    load_snapshot_graph_schema,
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
