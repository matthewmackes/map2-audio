"""
Biamp Tesira Forte AVB REST API routes.

Prefix: /api/tesira
Tag:    Tesira Forte AVB

All write endpoints (PUT, POST) require the Tesira fleet to be started
(tesira.enabled=true in ~/.map2/config.json).  GET endpoints return
gracefully even if no devices are connected.
"""

from __future__ import annotations

import io
import json
import logging
import re
import shlex
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, HTTPException, Path as FPath, Body, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, delete as sa_delete
from app.services.tesira import (
    get_tesira_fleet,
    get_tesira_discovery,
    get_tesira_dsp_model,
    get_tesira_metrics_store,
    get_tesira_layout_catalog,
    get_tesira_design_workspace,
    get_tesira_design_compiler,
)
from app.services.tesira.preset_interlock import TesiraPresetInterlock
from app.services.tesira.tesira_block_registry import list_profiles as list_block_registry_profiles

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tesira", tags=["Tesira Forte AVB"])


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ──────────────────────────────────────────────────────────────────────────────

class TesiraDeviceSummary(BaseModel):
    device_id: str
    host: str
    port: int
    name: str
    connected: bool
    transport: Optional[str] = None
    transport_port: Optional[int] = None
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    fault_count: int = 0
    avb_stream_count: int = 0
    ptp_state: Optional[str] = None


class TesiraDeviceDetail(TesiraDeviceSummary):
    hostname: Optional[str] = None
    avb_streams: List[Dict[str, Any]] = Field(default_factory=list)
    ptp_status: Dict[str, Any] = Field(default_factory=dict)
    faults: List[str] = Field(default_factory=list)
    presets: List[Dict[str, Any]] = Field(default_factory=list)


class SetLevelRequest(BaseModel):
    level_db: float = Field(..., ge=-100.0, le=20.0, description="Gain in dB")


class SetMuteRequest(BaseModel):
    muted: bool


class SetCrosspointRequest(BaseModel):
    row: int = Field(..., ge=1, description="Input (row) index, 1-based")
    col: int = Field(..., ge=1, description="Output (column) index, 1-based")
    gain_db: float = Field(..., ge=-100.0, le=20.0, description="Crosspoint gain in dB")


class SetEQBandFreqRequest(BaseModel):
    freq_hz: float = Field(..., ge=20.0, le=20000.0, description="Band centre frequency in Hz")


class SetEQBandGainRequest(BaseModel):
    gain_db: float = Field(..., ge=-24.0, le=24.0, description="Band gain in dB")


class SetEQBandQRequest(BaseModel):
    q: float = Field(..., ge=0.1, le=20.0, description="Band Q factor")


class SetCrosspointMuteRequest(BaseModel):
    row: int = Field(..., ge=1, description="Input (row) index, 1-based")
    col: int = Field(..., ge=1, description="Output (column) index, 1-based")
    muted: bool


class DspParamSetRequest(BaseModel):
    attribute: str = Field(..., min_length=1)
    value: Any
    args: List[Any] = Field(default_factory=list)


class DspBulkOperation(BaseModel):
    id: Optional[str] = None
    instance_tag: str = Field(..., min_length=1)
    attribute: str = Field(..., min_length=1)
    args: List[Any] = Field(default_factory=list)
    value: Any = None


class DspBulkGetRequest(BaseModel):
    operations: List[DspBulkOperation] = Field(default_factory=list)


class DspBulkSetRequest(BaseModel):
    operations: List[DspBulkOperation] = Field(default_factory=list)


class GpioSetRequest(BaseModel):
    state: bool


class SceneCaptureRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class PresetInterlockRuleIn(BaseModel):
    map2_preset_id: int = Field(..., ge=1)
    tesira_device_id: str
    tesira_preset_index: int = Field(..., ge=1)


class PresetInterlockRuleOut(BaseModel):
    id: int
    map2_preset_id: int
    tesira_device_id: str
    tesira_preset_index: int
    created_at: str


class TesiraLayoutImportRequest(BaseModel):
    layout_id: str = Field(..., min_length=1, max_length=128)
    version: str = Field(default="1.0.0", min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=255)
    device_family: str = Field(..., min_length=1, max_length=128)
    channel_profile: Optional[str] = Field(default=None, max_length=128)
    required_firmware: Optional[str] = Field(default=None, max_length=64)
    checksum: str = Field(..., min_length=1, max_length=128)
    artifact_uri: Optional[str] = Field(default=None, max_length=1024)
    instance_tag_map: Dict[str, Any] = Field(default_factory=dict)
    feature_flags: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    is_active: bool = True


class TesiraDeploymentStartRequest(BaseModel):
    layout_id: str = Field(..., min_length=1, max_length=128)
    layout_version: str = Field(default="1.0.0", min_length=1, max_length=64)
    dry_run: bool = False
    requested_by: Optional[str] = Field(default=None, max_length=128)
    rollback_layout_id: Optional[str] = Field(default=None, max_length=128)
    rollback_layout_version: Optional[str] = Field(default=None, max_length=64)


class TesiraDeploymentRollbackRequest(BaseModel):
    requested_by: Optional[str] = Field(default=None, max_length=128)
    layout_id: Optional[str] = Field(default=None, max_length=128)
    layout_version: Optional[str] = Field(default=None, max_length=64)


class TesiraRawCommandRequest(BaseModel):
    command: str = Field(..., min_length=2, max_length=512)


class TesiraDesignCreateRequest(BaseModel):
    design_id: Optional[str] = Field(default=None, max_length=128)
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    graph: Dict[str, Any] = Field(default_factory=dict)
    is_template: bool = False
    is_active: bool = True


class TesiraDesignUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    graph: Optional[Dict[str, Any]] = None
    is_template: Optional[bool] = None
    is_active: Optional[bool] = None


class TesiraDesignValidateRequest(BaseModel):
    graph: Optional[Dict[str, Any]] = None


class TesiraDesignCompileRequest(BaseModel):
    optimize: bool = False
    recompile: bool = False


class TesiraDesignCompileBatchRequest(BaseModel):
    optimize: bool = False
    recompile: bool = False
    include_templates: bool = False


# ──────────────────────────────────────────────────────────────────────────────
# Fleet helpers
# ──────────────────────────────────────────────────────────────────────────────

def _get_fleet():
    """Return the TesiraFleet singleton, or raise 503 if unavailable."""
    try:
        return get_tesira_fleet()
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail=f"Tesira fleet not available: {exc}"
        )


def _get_device(device_id: str):
    """Return a connected TesiraDevice or raise 404/503."""
    fleet = _get_fleet()
    device = fleet.get_device(device_id)
    if device is None:
        raise HTTPException(status_code=404, detail=f"Device '{device_id}' not found")
    return device


def _require_connected(device):
    """Raise 503 if device is offline."""
    if not device.connected:
        raise HTTPException(
            status_code=503, detail=f"Device '{device.device_id}' is not connected"
        )


def _get_dsp_model():
    return get_tesira_dsp_model()


def _get_metrics_store():
    return get_tesira_metrics_store()


def _get_layout_catalog():
    return get_tesira_layout_catalog()


def _get_design_workspace():
    return get_tesira_design_workspace()


def _get_design_compiler():
    return get_tesira_design_compiler()


def _parse_ttp_command(command: str) -> tuple[str, str, str, List[str]]:
    try:
        parts = shlex.split(command.strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid command: {exc}")

    if len(parts) < 2:
        raise HTTPException(
            status_code=400,
            detail="TTP command must include at least an instance tag and service",
        )

    instance_tag = parts[0]
    service = parts[1]
    attribute = parts[2] if len(parts) > 2 else ""
    args = parts[3:] if len(parts) > 3 else []
    return instance_tag, service, attribute, args


_SAGEVUE_DIRECT_DEPLOY_REMOVED = (
    "Direct SageVue integration has been removed from MAP2. "
    "Download a manual deployment package and upload it in SageVue."
)


def _safe_name(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    cleaned = cleaned.strip("._")
    return cleaned or fallback


def _resolve_artifact_path(artifact_uri: Optional[str]) -> Optional[Path]:
    if not artifact_uri:
        return None

    uri = artifact_uri.strip()
    if not uri:
        return None

    parsed = urlparse(uri)
    if parsed.scheme in ("http", "https", "sagevue"):
        return None

    if parsed.scheme == "file":
        candidate = Path(unquote(parsed.path))
    elif parsed.scheme == "":
        candidate = Path(uri)
    else:
        return None

    if candidate.is_file() and candidate.suffix.lower() == ".tmf":
        return candidate
    return None


def _build_manual_package_zip(
    layout: Dict[str, Any],
    *,
    device_id: Optional[str] = None,
) -> bytes:
    layout_id = str(layout.get("layout_id", "")).strip() or "layout"
    version = str(layout.get("version", "1.0.0")).strip() or "1.0.0"
    safe_layout_id = _safe_name(layout_id, "layout")
    safe_version = _safe_name(version, "1.0.0")
    base_name = f"{safe_layout_id}_{safe_version}"
    artifact_uri = str(layout.get("artifact_uri") or "").strip()

    manifest = {
        "layout_id": layout_id,
        "version": version,
        "name": layout.get("name"),
        "device_family": layout.get("device_family"),
        "channel_profile": layout.get("channel_profile"),
        "required_firmware": layout.get("required_firmware"),
        "checksum": layout.get("checksum"),
        "artifact_uri": artifact_uri or None,
        "instance_tag_map": layout.get("instance_tag_map") or {},
        "feature_flags": layout.get("feature_flags") or [],
        "notes": layout.get("notes"),
        "target_device_id": device_id,
    }

    readme = f"""# MAP2 Manual SageVue Upload Package

Layout: {layout_id} v{version}
Target device (optional): {device_id or "not specified"}

## Required file for SageVue
1. `{base_name}.tmf` (Tesira layout file)

## Included files in this package
- `README_UPLOAD_TO_SAGEVUE.md` (this guide)
- `{base_name}.manifest.json` (MAP2 metadata + compatibility context)
- `{base_name}.tmf` (included only when MAP2 has access to a local TMF file)

## How to upload manually in SageVue
1. Open SageVue and sign in.
2. Go to Tesira layout management for your target site/system.
3. Upload `{base_name}.tmf`.
4. Validate compatibility with your target Forte CI units.
5. Deploy/apply layout to the target device(s).
6. After deployment, return to MAP2 and verify connection, AVB streams, and PTP.

## If TMF is missing from this package
MAP2 only includes TMF when `artifact_uri` points to a readable local file.
If missing, export or locate the TMF from your Tesira toolchain and upload it manually in SageVue.

Reference: https://sagevue-help.biamp.com/Tesira_Layouts.htm
"""

    artifact_path = _resolve_artifact_path(artifact_uri)
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README_UPLOAD_TO_SAGEVUE.md", readme)
        zf.writestr(f"{base_name}.manifest.json", json.dumps(manifest, indent=2, sort_keys=True))

        if artifact_path is not None:
            zf.write(artifact_path, arcname=f"{base_name}.tmf")
        else:
            missing_note = (
                "TMF file is not bundled in this package.\n\n"
                f"layout_id: {layout_id}\n"
                f"version: {version}\n"
                f"artifact_uri: {artifact_uri or 'not set'}\n\n"
                "Set artifact_uri to a local TMF path (or file:// URI), then re-download this package."
            )
            zf.writestr("MISSING_TMF.txt", missing_note)

    return zip_buffer.getvalue()


# ──────────────────────────────────────────────────────────────────────────────
# Fleet endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/devices", response_model=List[TesiraDeviceSummary], summary="List all Tesira devices")
async def list_devices():
    """Return summary information for all configured Tesira units (connected or not)."""
    fleet = _get_fleet()
    return fleet.list_devices()


@router.get("/fleet/health", summary="Aggregate fleet health summary")
async def get_fleet_health():
    fleet = _get_fleet()
    devices = fleet.list_devices()
    total = len(devices)
    connected = sum(1 for d in devices if bool(d.get("connected")))
    offline = total - connected
    status = "healthy" if connected > 0 else "degraded"
    return {
        "status": status,
        "total_devices": total,
        "connected_devices": connected,
        "offline_devices": offline,
        "connected_ratio": (connected / total) if total else 0.0,
    }


@router.get("/fleet/ptp-topology", summary="Fleet-wide PTP topology snapshot")
async def get_fleet_ptp_topology():
    fleet = _get_fleet()
    nodes: List[Dict[str, Any]] = []
    grandmasters: List[str] = []
    for summary in fleet.list_devices():
        device = fleet.get_device(summary["device_id"])
        ptp_state = "OFFLINE"
        offset_ns = None
        grandmaster_id = None
        if device is not None and device.connected:
            try:
                ptp = await device.get_ptp_status()
                ptp_state = str(ptp.get("state", "UNKNOWN"))
                offset_ns = ptp.get("offset_ns")
                grandmaster_id = ptp.get("grandmaster_id")
            except Exception:
                ptp_state = "UNKNOWN"
        if grandmaster_id:
            grandmasters.append(str(grandmaster_id))
        nodes.append(
            {
                "device_id": summary["device_id"],
                "host": summary["host"],
                "name": summary["name"],
                "connected": bool(summary.get("connected")),
                "ptp_state": ptp_state,
                "offset_ns": offset_ns,
                "grandmaster_id": grandmaster_id,
            }
        )

    return {
        "nodes": nodes,
        "grandmaster_ids": sorted(set(grandmasters)),
        "node_count": len(nodes),
    }


@router.get("/devices/{device_id}", response_model=TesiraDeviceDetail, summary="Get device details")
async def get_device(device_id: str = FPath(..., description="Device ID (e.g. tesira_001122)")):
    """Return full device detail including presets, AVB streams, PTP status, and faults."""
    device = _get_device(device_id)
    base = (await device.get_info()) if device.connected else {
        'device_id': device.device_id,
        'host': device.host,
        'port': device.port,
        'name': device.name,
    }

    avb_streams: list = []
    ptp_status: dict = {}
    faults: list = []
    presets: list = []

    if device.connected:
        try:
            streams = await device.get_avb_streams()
            avb_streams = [
                {
                    'stream_index': s.stream_index,
                    'direction': s.direction,
                    'name': s.name,
                    'channels': s.channels,
                    'entity_id': s.entity_id,
                }
                for s in streams
            ]
        except Exception as exc:
            logger.warning("get_avb_streams failed for %s: %s", device_id, exc)

        try:
            ptp_status = await device.get_ptp_status()
        except Exception as exc:
            logger.warning("get_ptp_status failed for %s: %s", device_id, exc)

        try:
            faults = await device.get_fault_list()
        except Exception as exc:
            logger.warning("get_fault_list failed for %s: %s", device_id, exc)

        try:
            preset_list = await device.list_presets()
            presets = [{'index': p.index, 'name': p.name} for p in preset_list]
        except Exception as exc:
            logger.warning("list_presets failed for %s: %s", device_id, exc)

    return {
        **base,
        'connected': device.connected,
        'transport': base.get('transport', getattr(device, 'transport', None)),
        'transport_port': base.get('transport_port', getattr(device, 'transport_port', None)),
        'hostname': base.get('hostname'),
        'serial_number': base.get('serial_number'),
        'firmware_version': base.get('firmware_version'),
        'fault_count': len(faults),
        'avb_stream_count': len(avb_streams),
        'ptp_state': ptp_status.get('state'),
        'avb_streams': avb_streams,
        'ptp_status': ptp_status,
        'faults': faults,
        'presets': presets,
    }


@router.get("/devices/{device_id}/capabilities", summary="Get normalized device capability envelope")
async def get_device_capabilities(device_id: str):
    device = _get_device(device_id)
    model = None
    if device.info and getattr(device.info, "model", None):
        model = device.info.model
    elif device.connected:
        try:
            info = await device.get_info()
            model = info.get("model")
        except Exception:
            model = None

    from app.services.tesira.capabilities import get_capabilities_for_model, capabilities_to_dict

    caps = get_capabilities_for_model(model)
    return {
        "device_id": device_id,
        "model": model,
        "capabilities": capabilities_to_dict(caps),
    }


@router.post("/devices/{device_id}/connect", summary="Connect to a device")
async def connect_device(device_id: str):
    """Attempt to (re)connect to a Tesira device."""
    fleet = _get_fleet()
    # Build a minimal config for an ad-hoc connect
    all_devices = fleet.list_devices()
    summary = next((d for d in all_devices if d['device_id'] == device_id), None)
    if summary is None:
        raise HTTPException(status_code=404, detail=f"Device '{device_id}' not in fleet config")

    from app.services.tesira.tesira_fleet import TesiraDeviceConfig
    cfg = TesiraDeviceConfig(host=summary['host'], port=summary['port'], name=summary['name'])
    try:
        await fleet._connect_device(cfg)
        return {"ok": True, "message": f"Device {device_id} connected"}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/devices/{device_id}/disconnect", summary="Disconnect from a device")
async def disconnect_device(device_id: str):
    """Disconnect from a Tesira device (it will auto-reconnect if fleet is running)."""
    device = _get_device(device_id)
    try:
        await device.disconnect()
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/devices/{device_id}/command", summary="Send a raw Tesira Text Protocol command")
async def send_ttp_command(device_id: str, req: TesiraRawCommandRequest):
    """
    Send a raw TTP command to a connected Tesira device.

    This endpoint exists so the dedicated `/tesira` route can expose the same
    quick recovery/operator helper that previously lived only in the MIDI Hub
    Tesira panel.
    """
    device = _get_device(device_id)
    _require_connected(device)

    instance_tag, service, attribute, args = _parse_ttp_command(req.command)
    response = await device._client.send(instance_tag, service, attribute, *args)

    return {
        "ok": bool(response.ok),
        "command": req.command.strip(),
        "raw": response.raw,
        "value": response.value,
        "error_code": response.error_code,
        "error_detail": response.error_detail,
        "message": "Command succeeded" if response.ok else "Command failed",
    }


@router.get("/devices/{device_id}/faults", summary="Get device fault list")
async def get_faults(device_id: str):
    """Return the current fault list from the Tesira device."""
    device = _get_device(device_id)
    _require_connected(device)
    try:
        faults = await device.get_fault_list()
        return {"device_id": device_id, "faults": faults}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# Level / Mute control
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/devices/{device_id}/level/{instance_tag}/{channel}", summary="Get channel level")
async def get_level(device_id: str, instance_tag: str, channel: int):
    """Read the gain level (dB) of one channel on a LevelControl DSP block."""
    device = _get_device(device_id)
    _require_connected(device)
    try:
        level = await device.get_level(instance_tag, channel)
        return {"level_db": level}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.put("/devices/{device_id}/level/{instance_tag}/{channel}", summary="Set channel level")
async def set_level(device_id: str, instance_tag: str, channel: int, req: SetLevelRequest):
    """Set the gain level (dB) of one channel on a LevelControl DSP block."""
    device = _get_device(device_id)
    _require_connected(device)
    try:
        await device.set_level(instance_tag, channel, req.level_db)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/devices/{device_id}/mute/{instance_tag}/{channel}", summary="Get channel mute")
async def get_mute(device_id: str, instance_tag: str, channel: int):
    """Read the mute state of one channel on a LevelControl DSP block."""
    device = _get_device(device_id)
    _require_connected(device)
    try:
        muted = await device.get_mute(instance_tag, channel)
        return {"muted": muted}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.put("/devices/{device_id}/mute/{instance_tag}/{channel}", summary="Set channel mute")
async def set_mute(device_id: str, instance_tag: str, channel: int, req: SetMuteRequest):
    """Set the mute state of one channel on a LevelControl DSP block."""
    device = _get_device(device_id)
    _require_connected(device)
    try:
        await device.set_mute(instance_tag, channel, req.muted)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# Crosspoint matrix
# ──────────────────────────────────────────────────────────────────────────────

@router.put("/devices/{device_id}/crosspoint/{instance_tag}", summary="Set crosspoint gain")
async def set_crosspoint(device_id: str, instance_tag: str, req: SetCrosspointRequest):
    """Set a crosspoint gain value in a Mixer or Router DSP block."""
    device = _get_device(device_id)
    _require_connected(device)
    try:
        await device.set_crosspoint(instance_tag, req.row, req.col, req.gain_db)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/devices/{device_id}/crosspoint/{instance_tag}", summary="Read crosspoint matrix")
async def get_crosspoint_matrix(device_id: str, instance_tag: str, rows: int = 8, cols: int = 8):
    device = _get_device(device_id)
    _require_connected(device)
    rows = max(1, min(rows, 64))
    cols = max(1, min(cols, 64))
    matrix: List[List[Dict[str, Any]]] = []
    for row in range(1, rows + 1):
        row_values: List[Dict[str, Any]] = []
        for col in range(1, cols + 1):
            gain_db = None
            muted = None
            try:
                gain_db = await device.get_crosspoint(instance_tag, row, col)
            except Exception:
                pass
            try:
                resp = await device._client.send(instance_tag, "get", "crosspointMute", row, col)
                muted = bool(resp.value) if resp.ok else None
            except Exception:
                pass
            row_values.append({"row": row, "col": col, "gain_db": gain_db, "muted": muted})
        matrix.append(row_values)
    return {"device_id": device_id, "instance_tag": instance_tag, "rows": rows, "cols": cols, "matrix": matrix}


@router.put("/devices/{device_id}/crosspoint/{instance_tag}/mute", summary="Set crosspoint mute")
async def set_crosspoint_mute(device_id: str, instance_tag: str, req: SetCrosspointMuteRequest):
    device = _get_device(device_id)
    _require_connected(device)
    try:
        await device.set_crosspoint_mute(instance_tag, req.row, req.col, req.muted)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# EQ
# ──────────────────────────────────────────────────────────────────────────────

@router.put(
    "/devices/{device_id}/eq/{instance_tag}/band/{band}/freq",
    summary="Set EQ band frequency",
)
async def set_eq_band_freq(
    device_id: str, instance_tag: str, band: int, req: SetEQBandFreqRequest
):
    """Set the centre frequency of one parametric EQ band."""
    device = _get_device(device_id)
    _require_connected(device)
    try:
        await device.set_eq_band_freq(instance_tag, band, req.freq_hz)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.put(
    "/devices/{device_id}/eq/{instance_tag}/band/{band}/gain",
    summary="Set EQ band gain",
)
async def set_eq_band_gain(
    device_id: str, instance_tag: str, band: int, req: SetEQBandGainRequest
):
    device = _get_device(device_id)
    _require_connected(device)
    try:
        await device.set_eq_band_gain(instance_tag, band, req.gain_db)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.put(
    "/devices/{device_id}/eq/{instance_tag}/band/{band}/q",
    summary="Set EQ band Q",
)
async def set_eq_band_q(
    device_id: str, instance_tag: str, band: int, req: SetEQBandQRequest
):
    device = _get_device(device_id)
    _require_connected(device)
    try:
        await device.set_eq_band_q(instance_tag, band, req.q)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# Presets
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/devices/{device_id}/presets", summary="List device presets")
async def list_presets(device_id: str):
    """Return the preset list from the Tesira device."""
    device = _get_device(device_id)
    _require_connected(device)
    try:
        presets = await device.list_presets()
        return [{"index": p.index, "name": p.name} for p in presets]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/devices/{device_id}/presets/{preset_index}/recall", summary="Recall a preset")
async def recall_preset(device_id: str, preset_index: int = FPath(..., ge=1)):
    """Recall a preset on the Tesira device by index (1-based).

    T2496-5 — writes a pending row through `AvbBindingAuthority` BEFORE
    invoking the device, then flips it to enabled=True on success. The
    operator surface (Bindings page, Connections page) sees the recall
    request as a warm-gray row while it's in-flight, then green once
    the device acks. Defensive: authority write/ack failures log +
    swallow without failing the recall.
    """
    device = _get_device(device_id)
    _require_connected(device)

    # T2496-5 — pre-write the binding row in pending state.
    try:
        from app.services.tesira.binding_adapter import (
            record_tesira_preset_in_authority,
        )

        await record_tesira_preset_in_authority(
            device_host=device.host,
            device_name=getattr(device, "name", "") or device.host,
            preset_id=preset_index,
            pending=True,
        )
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "recall_preset: could not pre-write binding for %s/%d: %s",
            device_id,
            preset_index,
            exc,
        )

    try:
        await device.recall_preset(preset_index)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    # T2496-5 — device acked → flip the binding row to enabled=True.
    try:
        from app.services.tesira.binding_adapter import (
            mark_preset_acked_in_authority,
        )

        await mark_preset_acked_in_authority(
            device_host=device.host,
            preset_id=preset_index,
        )
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning(
            "recall_preset: could not flip binding to enabled for %s/%d: %s",
            device_id,
            preset_index,
            exc,
        )

    return {"ok": True, "preset_index": preset_index}


# ──────────────────────────────────────────────────────────────────────────────
# AVB streams & PTP
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/devices/{device_id}/avb/streams", summary="List AVB streams")
async def get_avb_streams(device_id: str):
    """Return AVB send/receive streams configured on the device."""
    device = _get_device(device_id)
    _require_connected(device)
    try:
        streams = await device.get_avb_streams()
        return [
            {
                'stream_index': s.stream_index,
                'direction': s.direction,
                'name': s.name,
                'channels': s.channels,
                'entity_id': s.entity_id,
            }
            for s in streams
        ]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/devices/{device_id}/avb/ptp", summary="Get PTP status")
async def get_ptp_status(device_id: str):
    """Return the PTP synchronisation status of the device."""
    device = _get_device(device_id)
    _require_connected(device)
    try:
        return await device.get_ptp_status()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# Metering (snapshot)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/devices/{device_id}/meters/{instance_tag}", summary="Get meter snapshot")
async def get_meters(device_id: str, instance_tag: str):
    """
    Return a snapshot of current level readings for a metered DSP block.
    For live streaming metering, subscribe to the 'tesira:meters' WebSocket topic.
    """
    device = _get_device(device_id)
    _require_connected(device)
    try:
        resp = await device._client.send(instance_tag, 'get', 'level')
        if not resp.ok:
            raise HTTPException(status_code=502, detail=resp.error_code)
        levels = resp.value if isinstance(resp.value, list) else [resp.value]
        _get_metrics_store().push(device_id, instance_tag, [float(v) for v in levels])
        return {
            "device_id": device_id,
            "instance_tag": instance_tag,
            "levels_dbu": [float(v) for v in levels],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/devices/{device_id}/meters/{instance_tag}/history", summary="Get metering history")
async def get_meter_history(device_id: str, instance_tag: str, limit: int = 300):
    device = _get_device(device_id)
    _require_connected(device)
    capped = max(1, min(limit, 1000))
    readings = _get_metrics_store().get_history(device_id, instance_tag, capped)
    return {
        "device_id": device_id,
        "instance_tag": instance_tag,
        "count": len(readings),
        "history": [r.to_dict() for r in readings],
    }


@router.get("/devices/{device_id}/meters/{instance_tag}/peak", summary="Get metering history peak")
async def get_meter_peak(device_id: str, instance_tag: str):
    device = _get_device(device_id)
    _require_connected(device)
    peak = _get_metrics_store().get_peak(device_id, instance_tag)
    return {
        "device_id": device_id,
        "instance_tag": instance_tag,
        "peak_dbu": peak,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Metering subscriptions (start/stop)
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/devices/{device_id}/meters/{instance_tag}/start", summary="Start metering subscription")
async def start_metering(
    device_id: str,
    instance_tag: str,
    interval_ms: int = 100,
):
    """
    Start a TTP push subscription for live level metering on a DSP block.
    Updates will be broadcast on the 'tesira:meters' WebSocket topic.
    """
    device = _get_device(device_id)
    _require_connected(device)
    try:
        await device.start_metering(instance_tag, interval_ms)
        return {"ok": True, "instance_tag": instance_tag, "interval_ms": interval_ms}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/devices/{device_id}/meters/{instance_tag}/stop", summary="Stop metering subscription")
async def stop_metering(device_id: str, instance_tag: str):
    """Stop a TTP push subscription for level metering."""
    device = _get_device(device_id)
    try:
        await device.stop_metering(instance_tag)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# DSP block discovery + parameter operations
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/devices/{device_id}/dsp/probe", summary="Probe runtime DSP blocks")
async def probe_dsp_blocks(device_id: str, max_instances: int = 32):
    device = _get_device(device_id)
    _require_connected(device)
    try:
        result = await _get_dsp_model().probe_device(device, max_instances=max(1, min(max_instances, 128)))
        return result.to_dict()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/devices/{device_id}/dsp/blocks", summary="List declared DSP blocks")
async def list_dsp_blocks(device_id: str):
    _get_device(device_id)  # validates device id
    try:
        blocks = await _get_dsp_model().list_blocks(device_id)
        return {"device_id": device_id, "count": len(blocks), "blocks": blocks}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/devices/{device_id}/dsp/blocks/{instance_tag}", summary="Get DSP block declaration")
async def get_dsp_block(device_id: str, instance_tag: str):
    _get_device(device_id)  # validates device id
    try:
        block = await _get_dsp_model().get_block(device_id, instance_tag)
        if block is None:
            raise HTTPException(status_code=404, detail=f"DSP block {instance_tag!r} not found")
        return {"device_id": device_id, **block}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/devices/{device_id}/dsp/{instance_tag}/params", summary="Get DSP block parameters")
async def get_dsp_block_params(device_id: str, instance_tag: str):
    device = _get_device(device_id)
    _require_connected(device)
    block = await _get_dsp_model().get_block(device_id, instance_tag)
    if block is None:
        raise HTTPException(status_code=404, detail=f"DSP block {instance_tag!r} not found")

    values: Dict[str, Any] = {}
    errors: Dict[str, str] = {}
    for attribute in (block.get("parameter_map", {}) or {}).keys():
        try:
            values[attribute] = await _get_dsp_model().get_param(device, instance_tag, attribute)
        except Exception as exc:
            errors[attribute] = str(exc)

    return {
        "device_id": device_id,
        "instance_tag": instance_tag,
        "values": values,
        "errors": errors,
    }


@router.put("/devices/{device_id}/dsp/{instance_tag}/params", summary="Set one DSP parameter")
async def set_dsp_block_param(device_id: str, instance_tag: str, req: DspParamSetRequest):
    device = _get_device(device_id)
    _require_connected(device)
    try:
        await _get_dsp_model().set_param(device, instance_tag, req.attribute, req.value, req.args)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/devices/{device_id}/dsp/bulk-get", summary="Bulk read DSP parameters")
async def dsp_bulk_get(device_id: str, req: DspBulkGetRequest):
    device = _get_device(device_id)
    _require_connected(device)
    operations = [op.model_dump(exclude_none=True) for op in req.operations]
    try:
        results = await _get_dsp_model().bulk_get(device, operations)
        return {"device_id": device_id, "count": len(results), "results": results}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/devices/{device_id}/dsp/bulk-set", summary="Bulk write DSP parameters")
async def dsp_bulk_set(device_id: str, req: DspBulkSetRequest):
    device = _get_device(device_id)
    _require_connected(device)
    operations = [op.model_dump(exclude_none=True) for op in req.operations]
    try:
        results = await _get_dsp_model().bulk_set(device, operations)
        return {"device_id": device_id, "count": len(results), "results": results}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# GPIO control
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/devices/{device_id}/gpio", summary="List GPIO pins")
async def list_gpio_pins(device_id: str):
    device = _get_device(device_id)
    _require_connected(device)

    cap_resp = await get_device_capabilities(device_id)
    gpio_count = int(((cap_resp.get("capabilities") or {}).get("gpio_count") or 0))
    probe_count = gpio_count if gpio_count > 0 else 8

    pins: List[Dict[str, Any]] = []
    for pin in range(1, probe_count + 1):
        resp = await device._client.send("LogicState1", "get", "state", pin)
        pins.append({"pin": pin, "ok": bool(resp.ok), "state": bool(resp.value) if resp.ok else None})

    return {"device_id": device_id, "gpio_count": probe_count, "pins": pins}


@router.get("/devices/{device_id}/gpio/{pin}", summary="Get GPIO pin state")
async def get_gpio_pin(device_id: str, pin: int = FPath(..., ge=1, le=64)):
    device = _get_device(device_id)
    _require_connected(device)
    resp = await device._client.send("LogicState1", "get", "state", pin)
    if not resp.ok:
        raise HTTPException(status_code=502, detail=f"GPIO read failed: {resp.error_detail or resp.error_code}")
    return {"device_id": device_id, "pin": pin, "state": bool(resp.value)}


@router.put("/devices/{device_id}/gpio/{pin}", summary="Set GPIO pin state")
async def set_gpio_pin(device_id: str, pin: int = FPath(..., ge=1, le=64), req: GpioSetRequest = Body(...)):
    device = _get_device(device_id)
    _require_connected(device)
    resp = await device._client.send("LogicState1", "set", "state", pin, "true" if req.state else "false")
    if not resp.ok:
        raise HTTPException(status_code=502, detail=f"GPIO write failed: {resp.error_detail or resp.error_code}")
    return {"ok": True, "device_id": device_id, "pin": pin, "state": req.state}


# ──────────────────────────────────────────────────────────────────────────────
# Scene snapshots
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/devices/{device_id}/scenes/capture", summary="Capture scene snapshot")
async def capture_scene(device_id: str, req: SceneCaptureRequest):
    from app.database import TesiraSceneSnapshot, get_session

    device = _get_device(device_id)
    _require_connected(device)

    blocks = await _get_dsp_model().list_blocks(device_id)
    if not blocks:
        probe = await _get_dsp_model().probe_device(device)
        blocks = [b.to_dict() for b in probe.blocks]
    scene_data = await _get_dsp_model().capture_scene(device, blocks)
    scene_id = f"scene_{uuid.uuid4().hex[:12]}"

    async with get_session() as session:
        session.add(
            TesiraSceneSnapshot(
                scene_id=scene_id,
                device_id=device_id,
                name=req.name,
                block_states=scene_data,
            )
        )

    return {"ok": True, "device_id": device_id, "scene_id": scene_id, "name": req.name, "block_count": len(scene_data)}


@router.get("/devices/{device_id}/scenes", summary="List scene snapshots")
async def list_scenes(device_id: str):
    from app.database import TesiraSceneSnapshot, get_session

    _get_device(device_id)  # validates id
    async with get_session(read_only=True) as session:
        rows = (
            await session.execute(
                select(TesiraSceneSnapshot)
                .where(TesiraSceneSnapshot.device_id == device_id)
                .order_by(TesiraSceneSnapshot.created_at.desc())
            )
        ).scalars().all()

    return {
        "device_id": device_id,
        "count": len(rows),
        "scenes": [
            {
                "scene_id": row.scene_id,
                "name": row.name,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
    }


@router.get("/devices/{device_id}/scenes/{scene_id}", summary="Get scene snapshot")
async def get_scene(device_id: str, scene_id: str):
    from app.database import TesiraSceneSnapshot, get_session

    _get_device(device_id)  # validates id
    async with get_session(read_only=True) as session:
        row = (
            await session.execute(
                select(TesiraSceneSnapshot).where(
                    TesiraSceneSnapshot.device_id == device_id,
                    TesiraSceneSnapshot.scene_id == scene_id,
                )
            )
        ).scalar_one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Scene {scene_id!r} not found")

    return {
        "device_id": device_id,
        "scene_id": row.scene_id,
        "name": row.name,
        "block_states": row.block_states,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.post("/devices/{device_id}/scenes/{scene_id}/recall", summary="Recall scene snapshot")
async def recall_scene(device_id: str, scene_id: str):
    from app.database import TesiraSceneSnapshot, get_session

    device = _get_device(device_id)
    _require_connected(device)

    async with get_session(read_only=True) as session:
        row = (
            await session.execute(
                select(TesiraSceneSnapshot).where(
                    TesiraSceneSnapshot.device_id == device_id,
                    TesiraSceneSnapshot.scene_id == scene_id,
                )
            )
        ).scalar_one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Scene {scene_id!r} not found")

    result = await _get_dsp_model().recall_scene(device, dict(row.block_states or {}))
    return {"ok": True, "device_id": device_id, "scene_id": scene_id, **result}


@router.delete("/devices/{device_id}/scenes/{scene_id}", summary="Delete scene snapshot")
async def delete_scene(device_id: str, scene_id: str):
    from app.database import TesiraSceneSnapshot, get_session

    _get_device(device_id)  # validates id
    async with get_session() as session:
        deleted = await session.execute(
            sa_delete(TesiraSceneSnapshot).where(
                TesiraSceneSnapshot.device_id == device_id,
                TesiraSceneSnapshot.scene_id == scene_id,
            )
        )
    if int(getattr(deleted, "rowcount", 0) or 0) < 1:
        raise HTTPException(status_code=404, detail=f"Scene {scene_id!r} not found")
    return {"ok": True, "device_id": device_id, "scene_id": scene_id}


# ──────────────────────────────────────────────────────────────────────────────
# Preset Interlock Rules
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/preset_interlock", response_model=List[PresetInterlockRuleOut], summary="List interlock rules")
async def list_interlock_rules():
    """Return all MAP2↔Tesira preset interlock rules."""
    try:
        from app.database_session import get_session
        fleet = get_tesira_fleet()
        interlock = TesiraPresetInterlock(fleet)
        async with get_session() as session:
            rules = await interlock.list_rules(session)
        return [
            {
                'id': r.id,
                'map2_preset_id': r.map2_preset_id,
                'tesira_device_id': r.tesira_device_id,
                'tesira_preset_index': r.tesira_preset_index,
                'created_at': r.created_at,
            }
            for r in rules
        ]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/preset_interlock", response_model=Dict[str, Any], summary="Add interlock rule")
async def add_interlock_rule(req: PresetInterlockRuleIn):
    """
    Add a preset interlock rule.
    When MAP2 preset `map2_preset_id` is recalled, Tesira device
    `tesira_device_id` will automatically recall preset `tesira_preset_index`.
    """
    try:
        from app.database_session import get_session
        fleet = get_tesira_fleet()
        interlock = TesiraPresetInterlock(fleet)
        async with get_session() as session:
            rule_id = await interlock.add_rule(
                req.map2_preset_id,
                req.tesira_device_id,
                req.tesira_preset_index,
                session,
            )
        return {"id": rule_id, "ok": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/preset_interlock/{rule_id}", summary="Delete interlock rule")
async def delete_interlock_rule(rule_id: int):
    """Delete a preset interlock rule by ID."""
    try:
        from app.database_session import get_session
        fleet = get_tesira_fleet()
        interlock = TesiraPresetInterlock(fleet)
        async with get_session() as session:
            deleted = await interlock.remove_rule(rule_id, session)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Rule {rule_id} not found")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# Auto-discovery
# ──────────────────────────────────────────────────────────────────────────────

class DiscoveryStartRequest(BaseModel):
    timeout_s: float = Field(default=8.0, ge=2.0, le=60.0, description="mDNS scan duration in seconds")


class AdoptDeviceRequest(BaseModel):
    host: str = Field(..., description="IP address of the Tesira unit to adopt")
    name: Optional[str] = Field(None, description="Friendly name for the device (uses mDNS name if omitted)")


class AddDeviceRequest(BaseModel):
    host: str = Field(..., description="IP address of the Tesira unit")
    port: int = Field(default=23, ge=1, le=65535, description="TTP port (default 23, SSH is 22)")
    name: Optional[str] = Field(None, description="Friendly name for the device")


def _get_discovery():
    """Return the TesiraDiscoveryService singleton."""
    try:
        return get_tesira_discovery()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Tesira discovery service not available: {exc}")


@router.post("/discovery/start", summary="Start Tesira device discovery scan")
async def start_discovery(req: DiscoveryStartRequest = Body(default=DiscoveryStartRequest())):
    """
    Start an mDNS scan for Tesira Forte AVB units on the local network.

    Factory-reset Tesira units advertise via _tesira._tcp.local. and accept
    TTP on port 23 with no password. The scan runs asynchronously; poll
    GET /discovery/status to track progress or subscribe to the
    'tesira:discovery' WebSocket topic for real-time device-found events.
    """
    svc = _get_discovery()
    await svc.start_scan(timeout_s=req.timeout_s)
    return {"ok": True, "message": f"Discovery scan started (timeout={req.timeout_s}s)"}


@router.get("/discovery/status", summary="Get discovery scan status")
async def get_discovery_status():
    """
    Return the current state of the Tesira discovery scan.

    Poll every 1 second while is_scanning=true. When is_scanning becomes
    false the scan is complete and 'devices' contains all found units.
    """
    svc = _get_discovery()
    return svc.get_status()


@router.post("/discovery/adopt", summary="Adopt a discovered Tesira device")
async def adopt_device(req: AdoptDeviceRequest):
    """
    Persist a discovered device into the MAP2 config and hot-connect it to
    the running Tesira fleet — no restart required.

    The device must be reachable at host:23 (TTP port). If the host was
    found by the discovery scan, identity is reused; otherwise a fresh TTP
    probe is performed.
    """
    svc = _get_discovery()
    result = await svc.adopt_device(host=req.host, name=req.name)
    if not result.get("ok"):
        raise HTTPException(status_code=502, detail=result.get("error", "Adoption failed"))
    return result


@router.post("/devices", summary="Manually add a Tesira device by IP (no TTP probe)")
async def add_device_manual(req: AddDeviceRequest):
    """
    Add a Tesira device to the fleet by IP address without requiring TTP
    connectivity.  Unlike /discovery/adopt, this endpoint does NOT probe
    port 23 before accepting the device.

    The device is persisted to config and the fleet attempts an immediate
    connection.  If TTP / SSH is currently disabled on the unit the device
    will appear Offline in the fleet panel; enable TTP in Tesira Software
    (Device Maintenance → Network Settings) to establish control.

    Biamp note: port 23 (Telnet TTP) and port 22 (SSH TTP) are both
    disabled by default on configured units.  Port 61451 (proprietary
    discovery) is always open — this is how Biamp's own Tesira Software
    locates devices on the LAN.
    """
    host = req.host.strip()
    port = req.port
    device_name = req.name or host

    # Persist to config
    try:
        from app.config import config_get, config_set
        existing: List[Dict[str, Any]] = config_get("tesira.devices", []) or []
        if any(d.get("host") == host for d in existing):
            device_id = f"tesira_{host.replace('.', '_')}"
            return {"ok": True, "device_id": device_id, "message": "Device already configured"}
        existing.append({"host": host, "port": port, "name": device_name, "enabled": True})
        config_set("tesira.devices", existing)
        logger.info("Tesira manual add: persisted %s (%s) port %d to config", host, device_name, port)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Config persistence failed: {exc}")

    # Hot-add to running fleet (connection failure is non-fatal — device shows Offline)
    device_id = f"tesira_{host.replace('.', '_')}"
    try:
        from app.services.tesira import get_tesira_fleet
        from app.services.tesira.tesira_fleet import TesiraDeviceConfig
        fleet = get_tesira_fleet()
        cfg = TesiraDeviceConfig(host=host, port=port, name=device_name)
        if device_id not in fleet._devices:
            await fleet._connect_device(cfg)
            if not any(c.host == host for c in fleet._configs):
                fleet._configs.append(cfg)
    except Exception as exc:
        logger.warning("Tesira manual add: fleet hot-add failed for %s: %s", host, exc)
        # Non-fatal — device is in config and will connect on next fleet start

    return {"ok": True, "device_id": device_id}


# ──────────────────────────────────────────────────────────────────────────────
# Firmware management
# ──────────────────────────────────────────────────────────────────────────────

def _get_firmware_service():
    from app.services.tesira.firmware_service import get_firmware_service
    return get_firmware_service()


@router.get("/firmware/latest", summary="Get latest Tesira firmware version from Biamp")
async def get_latest_firmware():
    """
    Fetch (and cache for 1 hour) the latest available Tesira firmware version
    from Biamp's release notes page.  Returns the version string, fetch
    timestamp, download URL, and release notes URL.
    """
    svc = _get_firmware_service()
    version = await svc.get_latest_version()
    return {
        "version": version,
        "fetched_at": svc.get_cached_at(),
        "download_url": svc.get_download_url(),
        "release_notes_url": svc.get_release_notes_url(),
        "update_path_url": svc.get_update_path_url(),
    }


@router.get("/devices/{device_id}/firmware", summary="Get firmware status for a device")
async def get_device_firmware(device_id: str = FPath(..., description="Device ID")):
    """
    Return the current firmware version of the device alongside the latest
    available version (cached) and whether an update is available.
    """
    fleet = _get_fleet()
    device = fleet.get_device(device_id)
    if device is None:
        raise HTTPException(status_code=404, detail=f"Device {device_id!r} not found")

    current = device.info.firmware_version if device.info else None

    svc = _get_firmware_service()
    latest = await svc.get_latest_version()
    update_available = svc.compare_versions(current, latest)

    return {
        "device_id": device_id,
        "host": device.host,
        "name": device.name,
        "connected": device.connected,
        "current_version": current,
        "latest_version": latest,
        "update_available": update_available,
        "update_path_url": svc.get_update_path_url(current),
        "download_url": svc.get_download_url(),
        "release_notes_url": svc.get_release_notes_url(),
    }


@router.post("/devices/{device_id}/reboot", summary="Reboot a Tesira device via TTP")
async def reboot_device(device_id: str = FPath(..., description="Device ID")):
    """
    Send a DEVICE reboot command via TTP.  The device will disconnect and
    reconnect (the fleet's offline retry loop will pick it back up).
    Requires the device to be currently connected.
    """
    fleet = _get_fleet()
    device = fleet.get_device(device_id)
    if device is None:
        raise HTTPException(status_code=404, detail=f"Device {device_id!r} not found")
    if not device.connected:
        raise HTTPException(status_code=409, detail="Device is offline — cannot send reboot")
    try:
        await device.reboot()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Reboot command failed: {exc}")
    return {"ok": True, "message": f"Reboot command sent to {device.host}"}


# ──────────────────────────────────────────────────────────────────────────────
# Manual reconnect (trigger immediate offline retry)
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/devices/{device_id}/reconnect", summary="Trigger immediate reconnect attempt")
async def reconnect_device(device_id: str = FPath(..., description="Device ID")):
    """
    Immediately attempt to reconnect an offline device.  Runs the port-61451
    probe (experimental Telnet enable) and then retries TTP port 23.
    Safe to call on an already-connected device (no-ops).
    """
    fleet = _get_fleet()
    device = fleet.get_device(device_id)
    if device is None:
        raise HTTPException(status_code=404, detail=f"Device {device_id!r} not found")

    if device.connected:
        return {"ok": True, "message": "Device already connected", "connected": True}

    from app.services.tesira.port61451_probe import probe_and_enable_ttp
    from app.services.tesira.tesira_fleet import TesiraDeviceConfig

    host = device.host
    probe_result: Dict[str, Any] = {}

    # Port-61451 probe
    try:
        probe = await probe_and_enable_ttp(host)
        probe_result = {
            "port61451_open": probe.port61451_open,
            "ttp_on_61451_possible": probe.ttp_on_61451_possible,
            "ssh_open": probe.ssh_open,
            "ttp_now_open": probe.ttp_now_open,
        }
    except Exception as exc:
        logger.warning("Reconnect probe error for %s: %s", host, exc)

    # Retry TTP connect
    cfg = next((c for c in fleet._configs if c.host == host), None)
    if cfg is None:
        cfg = TesiraDeviceConfig(host=host, port=device.port, name=device.name)

    try:
        await device.connect()
    except Exception as exc:
        logger.debug("Reconnect TTP attempt failed for %s: %s", host, exc)

    connected_now = device.connected
    if connected_now:
        await fleet._broadcast_device_state(device_id, 'connected')
        await fleet._register_endpoints(device)

    return {
        "ok": True,
        "connected": connected_now,
        "probe": probe_result,
        "message": "Connected" if connected_now else "Still offline — TTP not reachable",
    }


# ──────────────────────────────────────────────────────────────────────────────
# Layout catalog + SageVue adapter endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/layouts", summary="List Tesira layout artifacts in catalog")
async def list_layouts(
    device_family: Optional[str] = None,
    include_inactive: bool = False,
):
    catalog = _get_layout_catalog()
    layouts = await catalog.list_layouts(
        device_family=device_family,
        include_inactive=include_inactive,
    )
    return {"count": len(layouts), "layouts": layouts}


@router.get("/layouts/{layout_id}", summary="Get a Tesira layout artifact")
async def get_layout(layout_id: str, version: Optional[str] = None):
    catalog = _get_layout_catalog()
    layout = await catalog.get_layout(layout_id=layout_id, version=version)
    if layout is None:
        raise HTTPException(
            status_code=404,
            detail=f"Layout '{layout_id}'{f' version {version}' if version else ''} not found",
        )
    return layout


@router.post("/layouts/import", summary="Import or update Tesira layout artifact")
async def import_layout(req: TesiraLayoutImportRequest = Body(...)):
    catalog = _get_layout_catalog()
    try:
        layout = await catalog.import_layout(req.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Tesira layout import failed")
        raise HTTPException(status_code=500, detail=f"Layout import failed: {exc}")

    return {"status": "imported", "layout": layout}


@router.get(
    "/layouts/{layout_id}/manual-package",
    summary="Download manual SageVue upload package for a Tesira layout",
)
async def download_manual_layout_package(
    layout_id: str,
    version: Optional[str] = None,
    device_id: Optional[str] = None,
):
    catalog = _get_layout_catalog()
    layout = await catalog.get_layout(layout_id=layout_id, version=version)
    if layout is None:
        raise HTTPException(
            status_code=404,
            detail=f"Layout '{layout_id}'{f' version {version}' if version else ''} not found",
        )

    payload = _build_manual_package_zip(layout, device_id=device_id)
    resolved_version = str(layout.get("version", version or "1.0.0"))
    safe_layout = _safe_name(layout_id, "layout")
    safe_version = _safe_name(resolved_version, "1.0.0")
    filename = f"{safe_layout}_{safe_version}_sagevue_manual_package.zip"
    return Response(
        content=payload,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/sagevue/status", summary="Get SageVue integration status")
async def get_sagevue_status():
    return {
        "enabled": False,
        "configured": False,
        "base_url": "",
        "healthy": False,
        "detail": _SAGEVUE_DIRECT_DEPLOY_REMOVED,
        "manual_upload_required": True,
    }


@router.post("/devices/{device_id}/deploy", summary="Start Tesira deployment job")
async def start_deployment(
    device_id: str,
    req: TesiraDeploymentStartRequest = Body(...),
):
    _ = (device_id, req)
    raise HTTPException(status_code=410, detail=_SAGEVUE_DIRECT_DEPLOY_REMOVED)


@router.get("/deployments/{job_id}", summary="Get Tesira deployment job")
async def get_deployment(job_id: str):
    _ = job_id
    raise HTTPException(status_code=410, detail=_SAGEVUE_DIRECT_DEPLOY_REMOVED)


@router.post("/deployments/{job_id}/rollback", summary="Rollback Tesira deployment job")
async def rollback_deployment(
    job_id: str,
    req: TesiraDeploymentRollbackRequest = Body(default=TesiraDeploymentRollbackRequest()),
):
    _ = (job_id, req)
    raise HTTPException(status_code=410, detail=_SAGEVUE_DIRECT_DEPLOY_REMOVED)


# ──────────────────────────────────────────────────────────────────────────────
# MAP2-native Tesira design workspace endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/devices/{device_id}/designs", summary="List MAP2 Tesira design workspaces")
async def list_designs(
    device_id: str,
    include_inactive: bool = False,
    include_templates: bool = True,
):
    svc = _get_design_workspace()
    designs = await svc.list_designs(
        device_id=device_id,
        include_inactive=include_inactive,
        include_templates=include_templates,
    )
    return {"device_id": device_id, "count": len(designs), "designs": designs}


@router.get("/devices/{device_id}/designs/library", summary="Get design block palette/library")
async def get_design_block_library(device_id: str, profile: Optional[str] = None):
    svc = _get_design_workspace()
    try:
        blocks = svc.design_block_library(profile)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "device_id": device_id,
        "profile": profile or "forte_ci_v1",
        "available_profiles": list_block_registry_profiles(),
        "count": len(blocks),
        "blocks": blocks,
    }


@router.post("/devices/{device_id}/designs", summary="Create MAP2 Tesira design workspace")
async def create_design(device_id: str, req: TesiraDesignCreateRequest = Body(...)):
    svc = _get_design_workspace()
    design = await svc.create_design(device_id=device_id, payload=req.model_dump(exclude_none=True))
    validation = svc.validate_graph(design.get("graph", {}))
    return {"device_id": device_id, "design": design, "validation": validation}


@router.get("/devices/{device_id}/designs/{design_id}", summary="Get Tesira design workspace")
async def get_design(device_id: str, design_id: str):
    svc = _get_design_workspace()
    design = await svc.get_design(device_id=device_id, design_id=design_id)
    if design is None:
        raise HTTPException(status_code=404, detail=f"Design '{design_id}' not found")
    return {"device_id": device_id, "design": design}


@router.put("/devices/{device_id}/designs/{design_id}", summary="Update Tesira design workspace")
async def update_design(device_id: str, design_id: str, req: TesiraDesignUpdateRequest = Body(...)):
    svc = _get_design_workspace()
    design = await svc.update_design(
        device_id=device_id,
        design_id=design_id,
        payload=req.model_dump(exclude_none=True),
    )
    if design is None:
        raise HTTPException(status_code=404, detail=f"Design '{design_id}' not found")
    validation = svc.validate_graph(design.get("graph", {}))
    return {"device_id": device_id, "design": design, "validation": validation}


@router.delete("/devices/{device_id}/designs/{design_id}", summary="Delete Tesira design workspace")
async def delete_design(device_id: str, design_id: str):
    svc = _get_design_workspace()
    deleted = await svc.delete_design(device_id=device_id, design_id=design_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Design '{design_id}' not found")
    return {"ok": True, "device_id": device_id, "design_id": design_id}


@router.post("/devices/{device_id}/designs/{design_id}/validate", summary="Validate Tesira design graph")
async def validate_design(device_id: str, design_id: str, req: TesiraDesignValidateRequest = Body(default=TesiraDesignValidateRequest())):
    svc = _get_design_workspace()
    design = await svc.get_design(device_id=device_id, design_id=design_id)
    if design is None:
        raise HTTPException(status_code=404, detail=f"Design '{design_id}' not found")
    graph = req.graph if req.graph is not None else design.get("graph", {})
    validation = svc.validate_graph(graph)
    return {"device_id": device_id, "design_id": design_id, "validation": validation}


@router.post("/devices/{device_id}/designs/{design_id}/compile", summary="Compile or recompile one design")
async def compile_design(device_id: str, design_id: str, req: TesiraDesignCompileRequest = Body(default=TesiraDesignCompileRequest())):
    compiler = _get_design_compiler()
    try:
        result = await compiler.compile_design(
            device_id=device_id,
            design_id=design_id,
            optimize=bool(req.optimize),
            recompile=bool(req.recompile),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return result


@router.post("/devices/{device_id}/designs/{design_id}/recompile", summary="Force recompile one design")
async def recompile_design(device_id: str, design_id: str, req: TesiraDesignCompileRequest = Body(default=TesiraDesignCompileRequest())):
    compiler = _get_design_compiler()
    try:
        result = await compiler.compile_design(
            device_id=device_id,
            design_id=design_id,
            optimize=bool(req.optimize),
            recompile=True,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return result


@router.post("/devices/{device_id}/designs/compile-active", summary="Compile active design")
async def compile_active_design(device_id: str, req: TesiraDesignCompileRequest = Body(default=TesiraDesignCompileRequest())):
    compiler = _get_design_compiler()
    return await compiler.compile_active(
        device_id=device_id,
        optimize=bool(req.optimize),
        recompile=bool(req.recompile),
    )


@router.post("/devices/{device_id}/designs/compile-all", summary="Compile all designs")
async def compile_all_designs(device_id: str, req: TesiraDesignCompileBatchRequest = Body(default=TesiraDesignCompileBatchRequest())):
    compiler = _get_design_compiler()
    return await compiler.compile_all(
        device_id=device_id,
        optimize=bool(req.optimize),
        recompile=bool(req.recompile),
        include_templates=bool(req.include_templates),
    )


@router.post("/devices/{device_id}/designs/compile-uncompiled", summary="Compile only uncompiled designs")
async def compile_uncompiled_designs(device_id: str, req: TesiraDesignCompileBatchRequest = Body(default=TesiraDesignCompileBatchRequest())):
    compiler = _get_design_compiler()
    return await compiler.compile_all(
        device_id=device_id,
        optimize=bool(req.optimize),
        recompile=bool(req.recompile),
        only_uncompiled=True,
        include_templates=bool(req.include_templates),
    )


@router.get("/devices/{device_id}/designs/{design_id}/diagnostics", summary="Get design compile diagnostics")
async def get_design_diagnostics(device_id: str, design_id: str):
    compiler = _get_design_compiler()
    try:
        return await compiler.get_diagnostics(device_id=device_id, design_id=design_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
