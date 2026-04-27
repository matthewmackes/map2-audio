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
from app.services.controllers.learn_session import get_learn_registry

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


# ---------------------------------------------------------------------------
# T2459-D4 — MIDI learn wizard
# ---------------------------------------------------------------------------

class LearnStartRequest(BaseModel):
    controller_key: str
    pack_id: str
    model: str


class LearnCaptureRequest(BaseModel):
    session_id: str
    bytes: list[int]
    timestamp_ns: int = 0


class LearnAssignRequest(BaseModel):
    session_id: str
    target: str | None = None
    script: str | None = None
    action: str | None = None
    fast_path: bool = False


@router.post("/learn/start")
async def learn_start(req: LearnStartRequest) -> dict[str, Any]:
    sid = get_learn_registry().start(req.controller_key, req.pack_id, req.model)
    return {"session_id": sid}


@router.post("/learn/capture")
async def learn_capture(req: LearnCaptureRequest) -> dict[str, Any]:
    result = get_learn_registry().capture(req.session_id, req.bytes, req.timestamp_ns)
    return {
        "session_id": req.session_id,
        "kind": result.kind,
        "confidence": result.confidence,
        "status": result.status,
        "midino": result.midino,
        "channel": result.channel,
        "notes": result.notes,
    }


@router.post("/learn/assign")
async def learn_assign(req: LearnAssignRequest) -> dict[str, Any]:
    row = get_learn_registry().assign(
        req.session_id, req.target, req.script, req.action, req.fast_path,
    )
    if row is None:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "learn_session_not_finalisable",
                      "message": "Session not found or classifier could not recover a status/midino.",
                      "details": None}
        })
    return {"session_id": req.session_id, "row": row}


@router.post("/learn/cancel/{session_id}")
async def learn_cancel(session_id: str) -> dict[str, Any]:
    cancelled = get_learn_registry().cancel(session_id)
    return {"session_id": session_id, "cancelled": cancelled}


# ---------------------------------------------------------------------------
# T2459-E4 — "Measure latency" GUI endpoint
# ---------------------------------------------------------------------------

class MeasureLatencyRequest(BaseModel):
    pack_id: str
    model: str
    trials: int = 3
    duration_ms: int = 500
    tail_ms: int = 200


@router.post("/measure-latency")
async def measure_latency(req: MeasureLatencyRequest) -> dict[str, Any]:
    """Run path-c IR loopback measurement against the device's
    profile-defined `loopback_ports` and write versioned evidence
    under `docs/fit-for-purpose-evidence/<date>/<pack>/<model>/`.
    """
    import asyncio
    import json
    from datetime import datetime, timezone
    from pathlib import Path

    svc = get_controller_service()
    detail = svc.get_profile(req.pack_id, req.model, "audio")
    if detail is None:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "not_found",
                      "message": f"Audio profile {req.pack_id}/{req.model} not found.",
                      "details": None}
        })
    doc = detail.get("document", {}) or {}
    loopback = doc.get("loopback_ports") or {}
    playback = loopback.get("playback")
    capture = loopback.get("capture")
    if not playback or not capture:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "no_loopback_ports",
                      "message": f"Profile {req.pack_id}/{req.model} does not declare loopback_ports.",
                      "details": None}
        })

    from scripts.measure_loopback_ir import measure_loopback_ir

    loop = asyncio.get_running_loop()

    def _run():
        return measure_loopback_ir(
            playback_port=playback,
            capture_port=capture,
            sample_rate=48000,
            duration_ms=req.duration_ms,
            tail_ms=req.tail_ms,
            trials=req.trials,
            use_synthetic_fallback=True,
        )

    result = await loop.run_in_executor(None, _run)

    evidence_dir = (
        Path(__file__).resolve().parents[2]
        / "docs" / "fit-for-purpose-evidence"
        / datetime.now().strftime("%Y%m%d")
        / req.pack_id / req.model
    )
    evidence_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pack_id": req.pack_id,
        "model": req.model,
        "method": result.method,
        "sample_rate": result.sample_rate,
        "duration_ms": result.duration_ms,
        "tail_ms": result.tail_ms,
        "trials": [
            {"rtt_ms": t.rtt_ms,
             "peak_correlation": t.peak_correlation,
             "secondary_peak_ratio": t.secondary_peak_ratio}
            for t in result.trials
        ],
        "mean_rtt_ms": result.mean_rtt_ms,
        "p95_rtt_ms": result.p95_rtt_ms,
        "jitter_p95_ms": result.jitter_p95_ms,
        "notes": result.notes,
        "loopback_ports": {"playback": playback, "capture": capture},
    }
    evidence_path = evidence_dir / f"loopback-{datetime.now().strftime('%H%M%S')}.json"
    evidence_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    payload["evidence_path"] = str(
        evidence_path.relative_to(Path(__file__).resolve().parents[2])
    )
    return payload


# ---------------------------------------------------------------------------
# T2459-G1 — Hardware Store integration: connected / known / diagnostics
# ---------------------------------------------------------------------------
#
# These endpoints use the locked Q20 error envelope:
#   {"detail": "...", "code": "...", "source": "...", "degraded_files": [...]}
# Legacy endpoints above keep their existing envelope shape for backward
# compatibility — they predate the Q20 lock.

from app.services.controllers.bench_state import (   # noqa: E402
    get_bench_state_tracker,
)
from app.services.controllers.connection_detector import (   # noqa: E402
    detect_connections,
)
from app.services.controllers.profile_registry import (   # noqa: E402
    get_profile_registry,
)


def _g1_error(
    *, status_code: int, detail: str, code: str, source: str,
    degraded_files: list[str] | None = None,
) -> HTTPException:
    """Q20-locked error envelope used by the G1 endpoints."""
    return HTTPException(status_code=status_code, detail={
        "detail": detail,
        "code": code,
        "source": source,
        "degraded_files": degraded_files or [],
    })


def _classify_pack_source(pack_path: str) -> str:
    """Classify a pack as shipped / user / imported per Q14/Q15.

    - shipped:  ``device-packs/<vendor>/`` (top-level, repo-tracked)
    - imported: ``device-packs/_mixx-imports/...``
    - user:     ``~/.map2/device-packs-user/...``
    """
    p = str(pack_path)
    if "/_mixx-imports" in p or "_mixx-imports" in p.split("/"):
        return "imported"
    if "/.map2/device-packs-user" in p:
        return "user"
    return "shipped"


@router.get("/connected")
async def list_connected_devices() -> dict[str, Any]:
    """Live detector snapshot. Q3 chain: USB + ALSA seq + ALSA card +
    PipeWire. Each detection source can fail independently; failed
    sources surface in ``sources_failed`` so the GUI can show partial
    detection state honestly.

    Side-effect: every matched profile gets recorded in the bench-state
    tracker so ``/known`` and ``/recently-disconnected`` work.
    """
    registry = get_profile_registry()
    snapshot = detect_connections(registry)
    tracker = get_bench_state_tracker()
    tracker.record_seen([r.profile_key for r in snapshot.records])

    return {
        "snapshot": snapshot.to_dict(),
        "count": len(snapshot.records),
    }


@router.get("/recently-disconnected")
async def list_recently_disconnected() -> dict[str, Any]:
    """Profile keys seen within the 30-second grace window but absent
    from the current detector pass (Q12 lifecycle).
    """
    registry = get_profile_registry()
    snapshot = detect_connections(registry)
    currently = {r.profile_key for r in snapshot.records}
    tracker = get_bench_state_tracker()
    tracker.record_seen(list(currently))

    keys = tracker.recently_disconnected_keys(currently)
    rows = []
    for key in keys:
        last = tracker.last_seen(key)
        rows.append({
            "profile_key": key,
            "last_seen_at": last,
        })
    return {"recently_disconnected": rows, "count": len(rows)}


@router.get("/known")
async def list_known_devices() -> dict[str, Any]:
    """Pinned profiles + profiles seen within the last 24 h (Q12/Q14)."""
    tracker = get_bench_state_tracker()
    rows = []
    for key in tracker.known_keys():
        rows.append({
            "profile_key": key,
            "is_pinned": tracker.is_pinned(key),
            "last_seen_at": tracker.last_seen(key),
        })
    return {"known": rows, "count": len(rows)}


class PinRequest(BaseModel):
    profile_key: str


@router.post("/pin")
async def pin_device(req: PinRequest) -> dict[str, Any]:
    """Pin a profile so it stays in the Known-to-Bench section
    regardless of connection state (Q12)."""
    tracker = get_bench_state_tracker()
    added = tracker.pin(req.profile_key)
    return {"profile_key": req.profile_key, "pinned": True, "newly_added": added}


@router.post("/unpin")
async def unpin_device(req: PinRequest) -> dict[str, Any]:
    tracker = get_bench_state_tracker()
    removed = tracker.unpin(req.profile_key)
    return {"profile_key": req.profile_key, "pinned": False, "newly_removed": removed}


@router.get("/diagnostics")
async def list_diagnostics(
    severity: str | None = Query(default=None, pattern="^(info|warning|error)$"),
    source: str | None = Query(default=None),
) -> dict[str, Any]:
    """Bench-wide diagnostics aggregate (Q19).

    Sources unioned:
      - profile_registry: degraded packs (broken YAML, schema fail)
      - controller_host:  recent crash + storm-guard state
    """
    registry = get_profile_registry()
    rows: list[dict[str, Any]] = []
    now = time.time()

    for pack in registry.packs():
        if not pack.is_degraded:
            continue
        for f in pack.degraded_files:
            rows.append({
                "severity": "error",
                "source": "profile_registry",
                "code": "pack_degraded",
                "detail": f"Pack {pack.pack_id} has a broken file: {f}",
                "pack_id": pack.pack_id,
                "file": str(f),
                "ts": now,
            })

    try:
        from app.services.controller_host_service import get_controller_host_service
        host = get_controller_host_service()
        payload = host.status_payload()
        if payload.get("status") == "DEGRADED" or (payload.get("crashes_in_window") or 0) > 0:
            rows.append({
                "severity": "error" if payload.get("status") == "DEGRADED" else "warning",
                "source": "controller_host",
                "code": "host_unhealthy",
                "detail": payload.get("last_error") or f"Controller host status: {payload.get('status')}",
                "pid": payload.get("pid"),
                "restart_count": payload.get("restart_count"),
                "crashes_in_window": payload.get("crashes_in_window"),
                "ts": now,
            })
    except Exception as exc:   # noqa: BLE001 — defensive
        logger.warning("Controller host diagnostics unavailable: %s", exc)

    if severity is not None:
        rows = [r for r in rows if r["severity"] == severity]
    if source is not None:
        rows = [r for r in rows if r["source"] == source]

    counts = {"info": 0, "warning": 0, "error": 0}
    for r in rows:
        s = r.get("severity")
        if s in counts:
            counts[s] += 1

    return {
        "diagnostics": rows,
        "count": len(rows),
        "counts_by_severity": counts,
    }


@router.get("/packs/sources")
async def list_pack_sources() -> dict[str, Any]:
    """Provenance summary per pack (Q15/Q18). Source classification:
    shipped / user / imported.
    """
    registry = get_profile_registry()
    rows = []
    for pack in registry.packs():
        rows.append({
            "pack_id": pack.pack_id,
            "vendor": pack.vendor_name,
            "source": _classify_pack_source(str(pack.path)),
            "path": str(pack.path),
            "is_degraded": pack.is_degraded,
            "degraded_files": [str(f) for f in pack.degraded_files],
            "model_count": len(pack.models),
            "profile_count": len(pack.profiles),
        })
    return {"sources": rows, "count": len(rows)}


# Need ``time`` for /diagnostics ts fields; local import to keep the
# legacy block above untouched.
import time   # noqa: E402  isort:skip
