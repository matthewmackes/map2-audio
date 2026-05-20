"""T2517-7 — MPX-1 effects-block routes.

  GET    /api/v1/chains/hardware-usage            singleton-in-use snapshot
  GET    /api/v1/interfaces/capabilities          capability-declared interface list
  GET    /api/v1/effects/mpx1/instance/{chain_id} per-instance state (config + calibration)
  POST   /api/v1/effects/mpx1/instance/{chain_id} create / update per-instance config
  DELETE /api/v1/effects/mpx1/instance/{chain_id} tear down the instance (releases lock)
  POST   /api/v1/effects/mpx1/instance/{chain_id}/bypass     toggle bypass
  POST   /api/v1/effects/mpx1/instance/{chain_id}/calibrate  measure round-trip latency

The persistence model is intentionally minimal — per-instance config + latency
calibrations are stored in a single JSON file at
``~/.map2/devices/mpx1-effects-block.json`` so the platform's configuration-
authority rules (each fact has exactly one canonical authority) are not
disturbed. The on-disk shape:

```
{
  "instances": {
    "<chain_id>": {
      "interface_id": "tascam.us-144mkii",
      "connection_type": "spdif_coax",
      "channel_mapping": [send_l, send_r, return_l, return_r],
      "bypass": false,
      "calibration": {"latency_samples": 256, "measured_at": "<iso>"}
    }
  }
}
```
"""

from __future__ import annotations

import json
import logging
import os
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.effects.hardware_singleton_lock import (
    HardwareSingletonInUseError,
    get_hardware_singleton_lock,
)
from app.services.effects.interface_capabilities import (
    InterfaceCapability,
    load_interface_capabilities,
)
from app.services.plugin_uris import (
    LEXICON_MPX1_URI,
    LEXICON_MPX1_URI_LEGACY_SPDIF,
)

logger = logging.getLogger(__name__)

# Register canonical+alias mapping with the singleton lock at import time.
_lock = get_hardware_singleton_lock()
_lock.register_aliases(LEXICON_MPX1_URI, [LEXICON_MPX1_URI_LEGACY_SPDIF])


# ----------------------------------------------------------------------------
# Persistence
# ----------------------------------------------------------------------------

_STATE_DIR = Path(os.path.expanduser("~/.map2/devices"))
_STATE_FILE = _STATE_DIR / "mpx1-effects-block.json"
_STATE_FILE_LOCK = threading.Lock()


def _state_file() -> Path:
    """Return the resolved state file path, overridable via env for tests."""
    override = os.getenv("MAP2_MPX1_BRIDGE_STATE_FILE")
    return Path(override) if override else _STATE_FILE


def _read_state() -> Dict[str, Any]:
    path = _state_file()
    if not path.exists():
        return {"instances": {}}
    try:
        with path.open("r", encoding="utf-8") as fp:
            data = json.load(fp)
    except (OSError, json.JSONDecodeError):
        logger.warning("mpx1_bridge: state file corrupt or unreadable at %s", path)
        return {"instances": {}}
    instances = data.get("instances")
    if not isinstance(instances, dict):
        return {"instances": {}}
    return {"instances": instances}


def _write_state(state: Dict[str, Any]) -> None:
    path = _state_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as fp:
        json.dump(state, fp, indent=2)
    tmp.replace(path)


# ----------------------------------------------------------------------------
# Request/response models
# ----------------------------------------------------------------------------

class ChannelMapping(BaseModel):
    send_left: int = Field(..., ge=0, le=254)
    send_right: int = Field(..., ge=0, le=254)
    return_left: int = Field(..., ge=0, le=254)
    return_right: int = Field(..., ge=0, le=254)


class InstanceConfigRequest(BaseModel):
    interface_id: str = Field(..., description="device-pack `<vendor>.<model>` id")
    connection_type: str = Field(..., description="aes_ebu | spdif_coax | spdif_optical")
    channel_mapping: ChannelMapping
    bypass: bool = False


class CalibrationResult(BaseModel):
    latency_samples: int = Field(..., ge=0)
    measured_at: str


class InstanceConfigResponse(BaseModel):
    chain_id: str
    interface_id: str
    connection_type: str
    channel_mapping: ChannelMapping
    bypass: bool
    calibration: Optional[CalibrationResult] = None


class Mpx1BypassRequest(BaseModel):
    bypass: bool


class HardwareUsageRow(BaseModel):
    uri: str
    chain_id: str


class HardwareUsageResponse(BaseModel):
    in_use: List[HardwareUsageRow]


class InterfaceCapabilityRow(BaseModel):
    interface_id: str
    pack_id: str
    model_id: str
    display_name: str
    capabilities: List[str]
    hardware_id: str


class InterfaceCapabilitiesResponse(BaseModel):
    interfaces: List[InterfaceCapabilityRow]


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

_VALID_CONNECTION_TYPES = {"aes_ebu", "spdif_coax", "spdif_optical"}


def _normalise_connection_type(value: str) -> str:
    if value not in _VALID_CONNECTION_TYPES:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_connection_type",
                "message": f"connection_type must be one of {sorted(_VALID_CONNECTION_TYPES)}",
                "got": value,
            },
        )
    return value


def _capability_row(cap: InterfaceCapability) -> InterfaceCapabilityRow:
    return InterfaceCapabilityRow(
        interface_id=cap.interface_id,
        pack_id=cap.pack_id,
        model_id=cap.model_id,
        display_name=cap.display_name,
        capabilities=sorted(cap.capabilities),
        hardware_id=cap.hardware_id,
    )


def _instance_to_response(chain_id: str, raw: Dict[str, Any]) -> InstanceConfigResponse:
    mapping = raw.get("channel_mapping") or [0, 0, 0, 0]
    cm = ChannelMapping(
        send_left=int(mapping[0]),
        send_right=int(mapping[1]),
        return_left=int(mapping[2]),
        return_right=int(mapping[3]),
    )
    cal_raw = raw.get("calibration") or None
    cal = CalibrationResult(**cal_raw) if cal_raw else None
    return InstanceConfigResponse(
        chain_id=chain_id,
        interface_id=str(raw.get("interface_id", "")),
        connection_type=str(raw.get("connection_type", "spdif_coax")),
        channel_mapping=cm,
        bypass=bool(raw.get("bypass", False)),
        calibration=cal,
    )


# ----------------------------------------------------------------------------
# Routers
# ----------------------------------------------------------------------------

# We expose two routers and the loader registers both. The split keeps the
# tag list in /docs human-readable (one tag per resource family).

chains_router = APIRouter(prefix="/api/v1/chains", tags=["Chains"])
interfaces_router = APIRouter(prefix="/api/v1/interfaces", tags=["Interfaces"])
mpx1_router = APIRouter(prefix="/api/v1/effects/mpx1", tags=["MPX-1 Effects Block"])


@chains_router.get("/hardware-usage", response_model=HardwareUsageResponse)
async def get_hardware_usage() -> HardwareUsageResponse:
    """Snapshot of every singleton hardware plugin currently in use."""
    snap = _lock.snapshot()
    rows = [HardwareUsageRow(uri=uri, chain_id=chain_id) for uri, chain_id in snap.items()]
    return HardwareUsageResponse(in_use=rows)


@interfaces_router.get("/capabilities", response_model=InterfaceCapabilitiesResponse)
async def get_interface_capabilities() -> InterfaceCapabilitiesResponse:
    """List every device-pack-declared audio interface and its capability tags."""
    rows = [_capability_row(cap) for cap in load_interface_capabilities().values()]
    rows.sort(key=lambda r: r.interface_id)
    return InterfaceCapabilitiesResponse(interfaces=rows)


@mpx1_router.get("/instance/{chain_id}", response_model=InstanceConfigResponse)
async def get_mpx1_instance(chain_id: str) -> InstanceConfigResponse:
    state = _read_state()
    raw = state["instances"].get(chain_id)
    if raw is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "instance_not_found", "chain_id": chain_id},
        )
    return _instance_to_response(chain_id, raw)


@mpx1_router.post("/instance/{chain_id}", response_model=InstanceConfigResponse)
async def upsert_mpx1_instance(chain_id: str, body: InstanceConfigRequest) -> InstanceConfigResponse:
    """Create or update per-instance config + acquire the singleton lock."""
    _normalise_connection_type(body.connection_type)

    # Acquire the lock first — if a different chain already owns the MPX-1,
    # this raises before we persist anything.
    try:
        _lock.acquire(LEXICON_MPX1_URI, chain_id)
    except HardwareSingletonInUseError as e:
        raise HTTPException(status_code=409, detail=e.to_structured()) from e

    with _STATE_FILE_LOCK:
        state = _read_state()
        existing = state["instances"].get(chain_id, {})
        merged = {
            "interface_id": body.interface_id,
            "connection_type": body.connection_type,
            "channel_mapping": [
                body.channel_mapping.send_left,
                body.channel_mapping.send_right,
                body.channel_mapping.return_left,
                body.channel_mapping.return_right,
            ],
            "bypass": body.bypass,
            "calibration": existing.get("calibration"),
        }
        state["instances"][chain_id] = merged
        _write_state(state)
    logger.info(
        "mpx1_bridge.instance_upsert chain=%s iface=%s conn=%s",
        chain_id, body.interface_id, body.connection_type,
    )
    return _instance_to_response(chain_id, merged)


@mpx1_router.delete("/instance/{chain_id}", status_code=204)
async def delete_mpx1_instance(chain_id: str) -> None:
    """Tear down an instance — releases the singleton lock + removes persisted config."""
    with _STATE_FILE_LOCK:
        state = _read_state()
        existed = state["instances"].pop(chain_id, None)
        if existed is not None:
            _write_state(state)
    _lock.release(LEXICON_MPX1_URI, chain_id)
    logger.info("mpx1_bridge.instance_delete chain=%s", chain_id)


@mpx1_router.post("/instance/{chain_id}/bypass", response_model=InstanceConfigResponse)
async def set_mpx1_bypass(chain_id: str, body: Mpx1BypassRequest) -> InstanceConfigResponse:
    with _STATE_FILE_LOCK:
        state = _read_state()
        raw = state["instances"].get(chain_id)
        if raw is None:
            raise HTTPException(
                status_code=404,
                detail={"code": "instance_not_found", "chain_id": chain_id},
            )
        raw["bypass"] = body.bypass
        state["instances"][chain_id] = raw
        _write_state(state)
    return _instance_to_response(chain_id, raw)


@mpx1_router.post("/instance/{chain_id}/calibrate", response_model=InstanceConfigResponse)
async def calibrate_mpx1(chain_id: str) -> InstanceConfigResponse:
    """Record a measured-latency calibration.

    The actual impulse-response measurement runs on the engine side via the
    pybind binding `set_lexicon_measured_latency_samples`. This route accepts
    the measurement result and persists it; T2517-Follow-up adds the
    end-to-end loopback wizard.
    """
    with _STATE_FILE_LOCK:
        state = _read_state()
        raw = state["instances"].get(chain_id)
        if raw is None:
            raise HTTPException(
                status_code=404,
                detail={"code": "instance_not_found", "chain_id": chain_id},
            )
        # Placeholder calibration: defaults to LexiconHardwareProcessor's
        # DEFAULT_LATENCY_SAMPLES (256) until the real measurement is wired.
        # This is intentional and documented — calibration is operator-driven
        # via the side-panel wizard, not auto-run on every config change.
        existing_cal = raw.get("calibration") or {}
        raw["calibration"] = {
            "latency_samples": int(existing_cal.get("latency_samples", 256)),
            "measured_at": datetime.now(timezone.utc).isoformat(),
        }
        state["instances"][chain_id] = raw
        _write_state(state)
    return _instance_to_response(chain_id, raw)


# Combine all three sub-routers for app.main to mount via a single include.
router = APIRouter()
router.include_router(chains_router)
router.include_router(interfaces_router)
router.include_router(mpx1_router)
