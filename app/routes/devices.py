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

import asyncio
import uuid

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
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


@router.get("/measure-latency/history")
async def measure_latency_history(
    pack_id: str = Query(...),
    model: str = Query(...),
    limit: int = Query(default=20, ge=1, le=200),
) -> dict[str, Any]:
    """T2459-G6 — list prior loopback evidence files for a pack+model.

    Walks ``docs/fit-for-purpose-evidence/<YYYYMMDD>/<pack>/<model>/``
    across every dated directory and returns the most-recent N
    measurements with their summary stats. The frontend reads this
    to render the history list and the Compare-to-baseline diff.
    """
    import json as _json
    from datetime import datetime as _dt
    from pathlib import Path as _P

    repo_root = _P(__file__).resolve().parents[2]
    evidence_root = repo_root / "docs" / "fit-for-purpose-evidence"
    if not evidence_root.is_dir():
        return {"history": [], "count": 0}

    rows: list[dict[str, Any]] = []
    for date_dir in evidence_root.iterdir():
        if not date_dir.is_dir():
            continue
        target_dir = date_dir / pack_id / model
        if not target_dir.is_dir():
            continue
        for f in target_dir.iterdir():
            if not (f.is_file() and f.suffix == ".json"):
                continue
            try:
                doc = _json.loads(f.read_text(encoding="utf-8"))
            except Exception:   # noqa: BLE001 — defensive
                continue
            if not isinstance(doc, dict):
                continue
            ts = doc.get("timestamp")
            try:
                # Sort key: parse ISO; fall back to file mtime.
                sort_ts = _dt.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp() \
                    if isinstance(ts, str) else f.stat().st_mtime
            except Exception:   # noqa: BLE001
                sort_ts = f.stat().st_mtime
            try:
                rel_path = str(f.relative_to(repo_root))
            except ValueError:
                rel_path = str(f)
            rows.append({
                "evidence_path": rel_path,
                "timestamp": ts,
                "method": doc.get("method"),
                "mean_rtt_ms": doc.get("mean_rtt_ms"),
                "p95_rtt_ms": doc.get("p95_rtt_ms"),
                "jitter_p95_ms": doc.get("jitter_p95_ms"),
                "trial_count": len(doc.get("trials") or []),
                "_sort_ts": sort_ts,
            })

    rows.sort(key=lambda r: r["_sort_ts"], reverse=True)
    rows = rows[:limit]
    for r in rows:
        r.pop("_sort_ts", None)

    return {"history": rows, "count": len(rows)}


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
    """Pinned profiles + profiles seen within the last 24 h (Q12/Q14).

    T2461-A3 — also includes ``last_bound_at`` from the bench-state
    tracker so the GUI can render "Bound Nm ago" beside "Last seen".
    """
    tracker = get_bench_state_tracker()
    rows = []
    for key in tracker.known_keys():
        rows.append({
            "profile_key": key,
            "is_pinned": tracker.is_pinned(key),
            "last_seen_at": tracker.last_seen(key),
            "last_bound_at": tracker.last_bound(key),
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


@router.get("/brain-monitor-candidates")
async def list_brain_monitor_candidates() -> dict[str, Any]:
    """T2461-A5 — return connected devices that declare loopback_ports
    plus their latest measure-latency mean/p95/jitter (if any).

    The Brain ConsoleView's "Bench monitor" affordance reads this to
    populate the strip-routing menu and surface a yellow jitter chip
    when the most-recent loopback exceeds the strip's threshold.

    Worklist: T2461-A5.
    """
    import json as _json
    from datetime import datetime as _dt

    registry = get_profile_registry()
    snapshot = detect_connections(registry)
    connected_keys = {r.profile_key for r in snapshot.records}

    candidates: list[dict[str, Any]] = []
    repo_root = Path(__file__).resolve().parents[2]
    evidence_root = repo_root / "docs" / "fit-for-purpose-evidence"

    for profile in registry.profiles(kind="audio"):
        key = f"{profile.pack_id}/{profile.model}.audio"
        if key not in connected_keys:
            continue
        doc = profile.document
        loopback = (doc.get("loopback_ports") or {}) if isinstance(doc, dict) else {}
        playback = loopback.get("playback")
        capture = loopback.get("capture")
        if not (playback and capture):
            continue

        # Find the most-recent measurement evidence for this profile.
        latest: dict[str, Any] | None = None
        if evidence_root.is_dir():
            for date_dir in sorted(evidence_root.iterdir(), reverse=True):
                if not date_dir.is_dir():
                    continue
                target_dir = date_dir / profile.pack_id / profile.model
                if not target_dir.is_dir():
                    continue
                files = sorted(target_dir.glob("*.json"), reverse=True)
                for f in files:
                    try:
                        latest = _json.loads(f.read_text(encoding="utf-8"))
                        break
                    except Exception:   # noqa: BLE001
                        continue
                if latest:
                    break

        candidates.append({
            "profile_key": key,
            "pack_id": profile.pack_id,
            "model": profile.model,
            "vendor": registry.get_pack(profile.pack_id).vendor_name if registry.get_pack(profile.pack_id) else None,
            "loopback_ports": {"playback": playback, "capture": capture},
            "latest_measurement": (
                None if latest is None
                else {
                    "timestamp": latest.get("timestamp"),
                    "method": latest.get("method"),
                    "mean_rtt_ms": latest.get("mean_rtt_ms"),
                    "p95_rtt_ms": latest.get("p95_rtt_ms"),
                    "jitter_p95_ms": latest.get("jitter_p95_ms"),
                }
            ),
        })

    return {"candidates": candidates, "count": len(candidates)}


# ---------------------------------------------------------------------------
# T2461-A2 — Brain slot ↔ device profile_key binding map.
# ---------------------------------------------------------------------------

from app.services.controllers.slot_device_bindings import (   # noqa: E402
    get_slot_device_bindings,
)


class _SlotBindingRequest(BaseModel):
    slot_id: int
    profile_key: str


@router.get("/slot-bindings")
async def list_slot_bindings() -> dict[str, Any]:
    """T2461-A2 — return every active Brain-slot ↔ device binding.

    Read by both the Hardware Store DeviceCard (to scope its pulse
    animation to the bound slot's clip events) and the Brain
    ConsoleView (to greys out a strip when the bound device drops).
    """
    bindings = get_slot_device_bindings().all_bindings()
    return {
        "bindings": [
            {"slot_id": b.slot_id, "profile_key": b.profile_key, "bound_at": b.bound_at}
            for b in bindings
        ],
        "count": len(bindings),
    }


@router.post("/slot-bindings")
async def bind_slot_to_profile(req: _SlotBindingRequest) -> dict[str, Any]:
    """Bind one Brain slot to one device profile_key. Replaces any
    prior binding on either side."""
    try:
        binding = get_slot_device_bindings().bind(req.slot_id, req.profile_key)
    except ValueError as exc:
        raise _g1_error(
            status_code=400,
            detail=str(exc),
            code="invalid_binding",
            source="slot_device_bindings",
        )
    return {
        "slot_id": binding.slot_id,
        "profile_key": binding.profile_key,
        "bound_at": binding.bound_at,
    }


@router.delete("/slot-bindings/by-slot/{slot_id}")
async def unbind_slot(slot_id: int) -> dict[str, Any]:
    removed = get_slot_device_bindings().unbind_slot(slot_id)
    return {"slot_id": slot_id, "removed": removed}


@router.delete("/slot-bindings/by-profile")
async def unbind_profile(profile_key: str = Query(...)) -> dict[str, Any]:
    removed = get_slot_device_bindings().unbind_profile(profile_key)
    return {"profile_key": profile_key, "removed": removed}


@router.get("/snapshot-keys")
async def snapshot_keys() -> dict[str, Any]:
    """T2461-A9 — return the current connected + recently-disconnected
    profile_keys plus a timestamp so callers (e.g. Brain Library save
    flow) can record which devices were on the bench when an asset
    was authored. Non-blocking; reads from the BenchStateTracker that
    G1 + G2 already keep up to date.
    """
    tracker = get_bench_state_tracker()
    registry = get_profile_registry()
    snapshot = detect_connections(registry)
    connected = sorted({r.profile_key for r in snapshot.records})
    tracker.record_seen(connected)
    recent = list(tracker.recently_disconnected_keys(set(connected)))
    pinned = list(tracker.pinned_keys())
    return {
        "connected": connected,
        "recently_disconnected": recent,
        "pinned": pinned,
        "snapshot_at": time.time(),
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


# ---------------------------------------------------------------------------
# T2459-G9 — Pack Sources admin: sync-mixxx subprocess streamer +
# IMPORT_CHECKSUMS.txt integrity gate.
# ---------------------------------------------------------------------------

import asyncio as _asyncio_g9   # noqa: E402
import hashlib as _hashlib_g9   # noqa: E402
import json   # noqa: E402
from pathlib import Path   # noqa: E402

from fastapi.responses import StreamingResponse   # noqa: E402

REPO_ROOT_G9 = Path(__file__).resolve().parents[2]
MIXX_IMPORTS_ROOT = REPO_ROOT_G9 / "device-packs" / "_mixx-imports"
SYNC_SCRIPT = REPO_ROOT_G9 / "scripts" / "sync_mixxx_imports.py"
CHECKSUMS_FILE = MIXX_IMPORTS_ROOT / "IMPORT_CHECKSUMS.txt"


class _SyncMixxxRequest(BaseModel):
    mixxx_clone_path: str
    checksum_only: bool = False


@router.get("/sources/mixxx-checksums")
async def list_mixxx_checksums() -> dict[str, Any]:
    """Hash every shipped file under device-packs/_mixx-imports/ and
    diff against the recorded `IMPORT_CHECKSUMS.txt`. Returns a row
    per drifted file so the admin tab can surface "imported corpus
    has been modified" warnings inline.
    """
    if not MIXX_IMPORTS_ROOT.is_dir():
        return {"present": False, "drift": [], "files_checked": 0}
    if not CHECKSUMS_FILE.is_file():
        return {"present": True, "drift": [], "files_checked": 0,
                "note": "IMPORT_CHECKSUMS.txt missing — run sync once to populate"}

    expected: dict[str, str] = {}
    for line in CHECKSUMS_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) != 2:
            continue
        expected[parts[1].strip()] = parts[0].strip()

    drift: list[dict[str, str]] = []
    files_checked = 0
    for p in sorted(MIXX_IMPORTS_ROOT.rglob("*")):
        if not p.is_file():
            continue
        if p.name.endswith(".MAP2.yaml"):
            continue   # MAP2-mutable sidecars skip the immutability gate
        try:
            rel = str(p.relative_to(REPO_ROOT_G9))
        except ValueError:
            continue
        files_checked += 1
        actual = _hashlib_g9.sha256(p.read_bytes()).hexdigest()
        want = expected.get(rel)
        if want is None:
            drift.append({"path": rel, "kind": "untracked", "actual_sha256": actual})
        elif want != actual:
            drift.append({"path": rel, "kind": "modified",
                          "expected_sha256": want, "actual_sha256": actual})
    # Files in the manifest but missing from disk:
    for rel in expected:
        full = REPO_ROOT_G9 / rel
        if not full.is_file():
            drift.append({"path": rel, "kind": "missing",
                          "expected_sha256": expected[rel]})

    return {
        "present": True,
        "files_checked": files_checked,
        "drift": drift,
        "checksums_path": str(CHECKSUMS_FILE.relative_to(REPO_ROOT_G9)),
    }


@router.post("/sources/sync-mixxx")
async def sync_mixxx(req: _SyncMixxxRequest) -> StreamingResponse:
    """Stream the output of `scripts/sync_mixxx_imports.py` line-by-line
    as SSE so the admin tab can render it in a Carbon `CodeSnippet`.

    The script does not commit; the operator commits via the standard
    `update` shorthand once the diff looks right.
    """
    clone_path = Path(req.mixxx_clone_path).expanduser()
    if not clone_path.is_dir():
        raise _g1_error(
            status_code=400,
            detail=f"mixxx_clone_path does not exist: {clone_path}",
            code="invalid_clone_path",
            source="sync_mixxx",
        )
    if not SYNC_SCRIPT.is_file():
        raise _g1_error(
            status_code=500,
            detail=f"sync script missing: {SYNC_SCRIPT}",
            code="sync_script_missing",
            source="sync_mixxx",
        )

    cmd = ["python3", str(SYNC_SCRIPT)]
    if req.checksum_only:
        cmd.append("--checksum-only")
    cmd.append(str(clone_path))

    async def _stream():
        proc = await _asyncio_g9.create_subprocess_exec(
            *cmd,
            stdout=_asyncio_g9.subprocess.PIPE,
            stderr=_asyncio_g9.subprocess.STDOUT,
            cwd=str(REPO_ROOT_G9),
        )
        yield f"event: start\ndata: {json.dumps({'cmd': cmd})}\n\n"
        try:
            assert proc.stdout is not None
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                # Standard SSE framing — JSON-encoded so newlines and
                # quotes survive round-trip through the GUI.
                yield f"data: {json.dumps({'line': line.decode('utf-8', errors='replace').rstrip()})}\n\n"
            await proc.wait()
            yield f"event: end\ndata: {json.dumps({'exit_code': proc.returncode})}\n\n"
        except Exception as exc:   # noqa: BLE001
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
            try:
                proc.kill()
            except ProcessLookupError:
                pass

    return StreamingResponse(_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# T2461-A8 — Mixxx-shorthand → MAP2 target resolver
# ---------------------------------------------------------------------------

class _MixxxAliasResolveRequest(BaseModel):
    """Body for POST /api/devices/profiles/{...}/resolve-alias.

    The wizard sends Mixxx-native form (``[Channel1].volume``) plus the
    target profile_key so we can read its ``mixxx_alias_table`` and
    apply per-pack overrides.
    """
    group: str
    key: str


@router.post("/profiles/{pack_id}/{model}/{kind}/resolve-alias")
async def resolve_mixxx_alias(
    pack_id: str, model: str, kind: str,
    req: _MixxxAliasResolveRequest,
) -> dict[str, Any]:
    """T2461-A8 — translate a Mixxx ``(group, key)`` shorthand to the
    MAP2 target string the binding writer accepts. The wizard's target
    step calls this so operators can type the form they already know.

    Returns ``{resolved: true, target: "audio.chain.1.volume"}`` on a
    hit; ``{resolved: false, reason: "..."}`` on a miss (fail-soft).
    """
    from app.services.controllers.mixxx_control_object_bridge import (
        resolve as bridge_resolve,
    )

    if kind not in {"midi", "hid"}:
        raise _g1_error(
            status_code=400,
            detail="alias resolution only meaningful for midi/hid profiles",
            code="invalid_kind",
            source="mixxx_alias_resolver",
        )

    registry = get_profile_registry()
    profile = next(
        (p for p in registry.profiles(kind=kind)
         if p.pack_id == pack_id and p.model == model),
        None,
    )
    if profile is None:
        raise _g1_error(
            status_code=404,
            detail=f"profile {pack_id}/{model}.{kind} not found",
            code="profile_not_found",
            source="profile_registry",
        )

    alias_table = profile.document.get("mixxx_alias_table") or {}
    if not isinstance(alias_table, dict):
        alias_table = {}

    result = bridge_resolve(req.group, req.key, alias_table)
    if result.resolved:
        return {
            "resolved": True,
            "target": result.target,
            "alias_table_used": req.group in alias_table,
        }
    return {
        "resolved": False,
        "reason": result.fail_soft_reason or "no mapping for this (group, key)",
    }


# ---------------------------------------------------------------------------
# T2459-G7 — Bindings write + Undo
# ---------------------------------------------------------------------------

from app.services.controllers.bindings_writer import (   # noqa: E402
    BindingsWriteError,
    get_bindings_writer,
)


class _BindingsRequest(BaseModel):
    controls: list[dict[str, Any]] | None = None
    outputs: list[dict[str, Any]] | None = None


class _UndoRequest(BaseModel):
    undo_token: str


@router.post("/profiles/{pack_id}/{model}/{kind}/bindings")
async def write_bindings(
    pack_id: str, model: str, kind: str, req: _BindingsRequest,
) -> dict[str, Any]:
    """Q20-shaped: atomic write the new ``controls``/``outputs`` block
    to the profile YAML, return ``{revision, undo_token}`` so the GUI
    can offer an 8-second Undo (Q13).
    """
    if kind not in {"midi", "hid"}:
        raise _g1_error(
            status_code=400,
            detail="binding writes only allowed for midi/hid profiles",
            code="invalid_kind",
            source="bindings_writer",
        )
    if req.controls is None and req.outputs is None:
        raise _g1_error(
            status_code=400,
            detail="must supply at least one of controls / outputs",
            code="empty_payload",
            source="bindings_writer",
        )

    registry = get_profile_registry()
    pack = registry.get_pack(pack_id)
    if pack is None:
        raise _g1_error(
            status_code=404,
            detail=f"pack {pack_id} not found",
            code="pack_not_found",
            source="profile_registry",
        )

    profile = next(
        (p for p in registry.profiles(kind=kind)
         if p.pack_id == pack_id and p.model == model),
        None,
    )
    if profile is None:
        raise _g1_error(
            status_code=404,
            detail=f"profile {pack_id}/{model}.{kind} not found",
            code="profile_not_found",
            source="profile_registry",
        )

    try:
        result = get_bindings_writer().write_bindings(
            profile_path=profile.path,
            profile_kind=kind,
            new_controls=req.controls,
            new_outputs=req.outputs,
            registry=registry,
        )
    except BindingsWriteError as exc:
        raise _g1_error(
            status_code=400,
            detail=str(exc),
            code="binding_write_failed",
            source="bindings_writer",
        )

    return {
        "revision": result.revision,
        "undo_token": result.undo_token,
        "profile_key": result.profile_key,
        "bytes_written": result.bytes_written,
    }


@router.post("/profiles/{pack_id}/{model}/{kind}/bindings/undo")
async def undo_bindings(
    pack_id: str, model: str, kind: str, req: _UndoRequest,
) -> dict[str, Any]:
    """Q13: restore the previous YAML body keyed by the undo token."""
    registry = get_profile_registry()
    try:
        result = get_bindings_writer().apply_undo(req.undo_token, registry=registry)
    except BindingsWriteError as exc:
        raise _g1_error(
            status_code=410,
            detail=str(exc),
            code="undo_token_unknown",
            source="bindings_writer",
        )
    # Sanity: the token's profile_key should match the URL.
    expected = f"{pack_id}/{model}.{kind}"
    if result.profile_key != f"{pack_id}/{model}":
        # The writer keys profile_key as <vendor>/<filename-stem>; route
        # uses <pack>/<model>.<kind>. Reconcile by surfacing both.
        return {
            "revision": result.revision,
            "profile_key_from_token": result.profile_key,
            "expected": expected,
            "bytes_written": result.bytes_written,
        }
    return {
        "revision": result.revision,
        "profile_key": result.profile_key,
        "bytes_written": result.bytes_written,
    }


# ---------------------------------------------------------------------------
# T2459-G2 — WebSocket hot-plug channel
# ---------------------------------------------------------------------------

from app.services.controllers.connection_event_bus import (   # noqa: E402
    EVT_HEARTBEAT,
    EVT_SNAPSHOT,
    get_connection_event_bus,
)


@router.websocket("/ws")
async def devices_websocket(websocket: WebSocket) -> None:
    """Hardware Store hot-plug channel.

    Emits:
      - ``devices.snapshot``    — initial state on connect
      - ``device.connected``    — profile started matching the detector
      - ``device.disconnected`` — profile stopped matching
      - ``pack.degraded``       — a pack transitioned to degraded
      - ``host.crash``          — controller-host supervisor recorded a crash
      - ``devices.heartbeat``   — every 10 s if no other event has fired

    The connection is read-only — clients send no frames. The server
    pushes JSON until the client disconnects.
    """
    await websocket.accept()
    bus = get_connection_event_bus()
    client_id = f"hwstore-{uuid.uuid4()}"
    queue = await bus.register_client(client_id)

    try:
        await websocket.send_json({
            "type": EVT_SNAPSHOT,
            "data": bus.build_initial_snapshot(),
            "timestamp": time.time(),
        })
        while True:
            try:
                message = await asyncio.wait_for(queue.get(), timeout=15.0)
                await websocket.send_json(message)
            except asyncio.TimeoutError:
                # Liveness probe so the GUI can detect a dead WS even
                # when the bus loop has stalled.
                await websocket.send_json({
                    "type": EVT_HEARTBEAT,
                    "data": {"server_alive": True},
                    "timestamp": time.time(),
                })
    except WebSocketDisconnect:
        return
    except Exception as exc:   # noqa: BLE001
        logger.warning("Hardware Store WS error for %s: %s", client_id, exc)
    finally:
        await bus.unregister_client(client_id)
