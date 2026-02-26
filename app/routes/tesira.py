"""
Biamp Tesira Forte AVB REST API routes.

Prefix: /api/tesira
Tag:    Tesira Forte AVB

All write endpoints (PUT, POST) require the Tesira fleet to be started
(tesira.enabled=true in ~/.map2/config.json).  GET endpoints return
gracefully even if no devices are connected.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Path as FPath, Body
from pydantic import BaseModel, Field

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


# ──────────────────────────────────────────────────────────────────────────────
# Fleet helpers
# ──────────────────────────────────────────────────────────────────────────────

def _get_fleet():
    """Return the TesiraFleet singleton, or raise 503 if unavailable."""
    try:
        from app.services.tesira import get_tesira_fleet
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


# ──────────────────────────────────────────────────────────────────────────────
# Fleet endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/devices", response_model=List[TesiraDeviceSummary], summary="List all Tesira devices")
async def list_devices():
    """Return summary information for all configured Tesira units (connected or not)."""
    fleet = _get_fleet()
    return fleet.list_devices()


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
    """Recall a preset on the Tesira device by index (1-based)."""
    device = _get_device(device_id)
    _require_connected(device)
    try:
        await device.recall_preset(preset_index)
        return {"ok": True, "preset_index": preset_index}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


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
        return {
            "device_id": device_id,
            "instance_tag": instance_tag,
            "levels_dbu": [float(v) for v in levels],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


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
# Preset Interlock Rules
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/preset_interlock", response_model=List[PresetInterlockRuleOut], summary="List interlock rules")
async def list_interlock_rules():
    """Return all MAP2↔Tesira preset interlock rules."""
    try:
        from app.services.tesira.preset_interlock import TesiraPresetInterlock
        from app.services.tesira import get_tesira_fleet
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
        from app.services.tesira.preset_interlock import TesiraPresetInterlock
        from app.services.tesira import get_tesira_fleet
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
        from app.services.tesira.preset_interlock import TesiraPresetInterlock
        from app.services.tesira import get_tesira_fleet
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
        from app.services.tesira import get_tesira_discovery
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
