"""FastAPI routes for the controller / mapping / device-pack subsystem.

T2459-A3 lands the read-side surface (list packs, list profiles, get
profile, resolve by hardware-id / ALSA card / ALSA client) plus the
mapping assignment endpoints. Carbon ``<DeviceProfilePanel/>`` (T2459-
C1) is the primary consumer.

Routes:

- ``GET    /api/devices/packs``                            list packs
- ``GET    /api/devices/profiles?kind=audio|midi|hid``    list profiles
- ``GET    /api/devices/profiles/{pack_id}/{model}/{kind}`` profile detail
- ``POST   /api/devices/profiles/reload/{pack_id}``        reload one pack
- ``GET    /api/devices/resolve``                          resolve by id
- ``GET    /api/devices/mappings``                         active mappings
- ``POST   /api/devices/mappings/assign``                  assign mapping
- ``POST   /api/devices/mappings/clear``                   clear mapping

Worklist: ``T2459-A3``.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.services.controllers import get_controller_service
from app.services.controllers.mapping_file_handler import MappingLoadError
from app.services.controllers.metadata_enrichment import (
    get_cached_asset_path,
    list_cached_assets,
    refresh_pack_async,
)
from app.services.controllers.mixxx_xml_reader import parse_mixxx_xml
from app.services.controllers.mixxx_xml_writer import write_mixxx_xml

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/devices", tags=["Devices"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AssignMappingRequest(BaseModel):
    controller_key: str = Field(
        ..., description="Canonical controller identifier (hardware_id or "
                         "alsa-seq:<client>:<port>).",
    )
    pack_id: str
    model: str
    kind: str = Field(..., pattern="^(midi|hid)$")


class ClearMappingRequest(BaseModel):
    controller_key: str


# ---------------------------------------------------------------------------
# Read endpoints
# ---------------------------------------------------------------------------

@router.get("/packs")
async def list_packs() -> dict[str, Any]:
    svc = get_controller_service()
    packs = svc.list_packs()
    return {"packs": packs, "count": len(packs)}


@router.get("/profiles")
async def list_profiles(
    kind: str | None = Query(default=None, pattern="^(audio|midi|hid)$"),
) -> dict[str, Any]:
    svc = get_controller_service()
    profiles = svc.list_profiles(kind=kind)
    return {"profiles": profiles, "count": len(profiles)}


@router.get("/profiles/{pack_id}/{model}/{kind}")
async def get_profile(pack_id: str, model: str, kind: str) -> dict[str, Any]:
    if kind not in {"audio", "midi", "hid"}:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "invalid_kind",
                      "message": "kind must be audio, midi, or hid",
                      "details": None}
        })
    svc = get_controller_service()
    profile = svc.get_profile(pack_id, model, kind)
    if profile is None:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "not_found",
                      "message": f"Profile {pack_id}/{model}.{kind} not found",
                      "details": None}
        })
    return {"profile": profile}


@router.post("/profiles/reload/{pack_id}")
async def reload_pack(pack_id: str) -> dict[str, Any]:
    svc = get_controller_service()
    ok = svc.reload_pack(pack_id)
    if not ok:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "not_found",
                      "message": f"Pack {pack_id} not found",
                      "details": None}
        })
    return {"reloaded": pack_id}


@router.get("/resolve")
async def resolve(
    hardware_id: str | None = Query(default=None),
    alsa_card: str | None = Query(default=None),
    alsa_client: str | None = Query(default=None),
) -> dict[str, Any]:
    svc = get_controller_service()
    matches: list[dict[str, Any]] = []
    if hardware_id:
        matches += svc.resolve_for_hardware_id(hardware_id)
    if alsa_card:
        matches += svc.resolve_for_alsa_card(alsa_card)
    if alsa_client:
        matches += svc.resolve_for_alsa_client(alsa_client)
    if not (hardware_id or alsa_card or alsa_client):
        raise HTTPException(status_code=400, detail={
            "error": {
                "code": "missing_query",
                "message": "Provide at least one of hardware_id, alsa_card, alsa_client.",
                "details": None,
            }
        })
    return {"matches": matches, "count": len(matches)}


# ---------------------------------------------------------------------------
# Mapping assignment
# ---------------------------------------------------------------------------

@router.get("/mappings")
async def list_active_mappings() -> dict[str, Any]:
    svc = get_controller_service()
    mappings = svc.active_mappings()
    return {"active_mappings": mappings, "count": len(mappings)}


@router.post("/mappings/assign")
async def assign_mapping(req: AssignMappingRequest) -> dict[str, Any]:
    svc = get_controller_service()
    try:
        descriptor = svc.load_mapping(req.pack_id, req.model, req.kind)
    except MappingLoadError as exc:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "mapping_load_failed",
                      "message": str(exc),
                      "details": None}
        }) from exc
    svc.assign_mapping(req.controller_key, descriptor)
    return {
        "assigned": True,
        "controller_key": req.controller_key,
        "pack_id": descriptor.pack_id,
        "model": descriptor.model,
        "kind": descriptor.kind,
        "control_count": len(descriptor.controls),
    }


@router.post("/mappings/clear")
async def clear_mapping(req: ClearMappingRequest) -> dict[str, Any]:
    svc = get_controller_service()
    svc.clear_mapping(req.controller_key)
    return {"cleared": req.controller_key}


# ---------------------------------------------------------------------------
# T2459-C3 — metadata enrichment: cached asset serving + refresh
# ---------------------------------------------------------------------------

@router.get("/{pack_id}/{model}/assets")
async def list_assets(pack_id: str, model: str) -> dict[str, Any]:
    """List every cached metadata asset (image / datasheet / manual)
    for a device, by filename. The frontend uses this to know what
    paths are available under the asset endpoint.
    """
    return {
        "pack_id": pack_id,
        "model": model,
        "assets": list_cached_assets(pack_id, model),
    }


@router.get("/{pack_id}/{model}/asset/{filename}")
async def serve_asset(pack_id: str, model: str, filename: str) -> FileResponse:
    """Serve one cached metadata asset by filename."""
    path = get_cached_asset_path(pack_id, model, filename)
    if path is None:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "asset_not_cached",
                      "message": f"Asset {filename} for {pack_id}/{model} is not cached.",
                      "details": None}
        })
    return FileResponse(path)


@router.post("/{pack_id}/refresh-metadata")
async def refresh_metadata(pack_id: str) -> dict[str, Any]:
    """Trigger a background metadata fetch for the pack.

    Pulls product images, datasheet, and manual URLs declared in each
    of the pack's audio profiles. Network failures are swallowed and
    surface in the returned counts.
    """
    svc = get_controller_service()
    pack = svc._profiles.get_pack(pack_id)  # noqa: SLF001 — internal API
    if pack is None:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "not_found",
                      "message": f"Pack {pack_id} not found.",
                      "details": None}
        })
    counts = await refresh_pack_async(pack.path)
    return {"pack_id": pack_id, **counts}


# ---------------------------------------------------------------------------
# T2459-C4 — Mixxx XML import + export
# ---------------------------------------------------------------------------

class MixxxImportRequest(BaseModel):
    pack_id: str
    xml_body: str
    alias_table: dict[str, str] | None = None


@router.post("/mixxx/import")
async def import_mixxx_xml(req: MixxxImportRequest) -> dict[str, Any]:
    """Parse a Mixxx-format XML mapping body and return the resolved
    descriptor.

    The frontend's ``<MappingNodeGraphEditor/>`` import flow uploads a
    raw XML body here and renders the returned descriptor as a node
    graph. Bindings that fail soft surface in ``stats.skip_reasons``
    so the GUI can show "N bindings imported, M skipped".
    """
    import tempfile
    from pathlib import Path

    # parse_mixxx_xml expects a Path; write the body to a tmpfile.
    with tempfile.NamedTemporaryFile(suffix=".midi.xml", delete=False, mode="w", encoding="utf-8") as f:
        f.write(req.xml_body)
        tmp_path = Path(f.name)
    try:
        try:
            result = parse_mixxx_xml(tmp_path, pack_id=req.pack_id, alias_table=req.alias_table)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=422, detail={
                "error": {"code": "mixxx_parse_failed",
                          "message": str(exc),
                          "details": None}
            }) from exc
    finally:
        try:
            tmp_path.unlink()
        except OSError:
            pass

    descriptor = result.descriptor
    return {
        "pack_id": descriptor.pack_id,
        "model": descriptor.model,
        "kind": descriptor.kind,
        "controls": [
            {
                "status": c.status,
                "midino": c.midino,
                "channel": c.channel,
                "target": c.target,
                "action": c.action,
                "script": c.script,
                "fast_path": c.fast_path,
                "description": c.description,
                "mixxx_group": (c.extra or {}).get("mixxx_group"),
                "mixxx_key": (c.extra or {}).get("mixxx_key"),
            }
            for c in descriptor.controls
        ],
        "outputs": [
            {
                "status": o.status,
                "midino": o.midino,
                "channel": o.channel,
                "target": o.target,
                "action": o.action,
                "extra": dict(o.extra or {}),
            }
            for o in descriptor.outputs
        ],
        "scripts": list(descriptor.scripts),
        "mixxx_alias_table": dict(descriptor.mixxx_alias_table or {}),
        "stats": {
            "total_controls": result.stats.total_controls,
            "resolved_controls": result.stats.resolved_controls,
            "skipped_controls": result.stats.skipped_controls,
            "skip_reasons": list(result.stats.skip_reasons),
        },
    }


@router.get("/mixxx/export/{pack_id}/{model}")
async def export_mixxx_xml(pack_id: str, model: str) -> dict[str, str]:
    """Serialize a MAP2 native MIDI mapping back to Mixxx-format XML."""
    svc = get_controller_service()
    try:
        descriptor = svc.load_mapping(pack_id, model, "midi")
    except MappingLoadError as exc:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "mapping_load_failed",
                      "message": str(exc),
                      "details": None}
        }) from exc
    try:
        xml_body = write_mixxx_xml(descriptor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "export_unsupported",
                      "message": str(exc),
                      "details": None}
        }) from exc
    return {"xml_body": xml_body}
