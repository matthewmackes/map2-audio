"""T2515-6 — TASCAM US-144MKII tier-1 device routes.

Surfaces the device's operational state to the Carbon Devices panel:

  GET  /api/v1/devices/tascam-us144mkii/status         driver + USB-enum state
  GET  /api/v1/devices/tascam-us144mkii/capabilities   declared port + capability table
  GET  /api/v1/devices/tascam-us144mkii/meters         per-channel peak dBFS (T2515-6-METERS)
  GET  /api/v1/devices/tascam-us144mkii/clock-source   clock-source state + valid options (T2515-6-CLOCK)
  POST /api/v1/devices/tascam-us144mkii/reset          confirm=true → usbreset
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.devices.tascam_us144mkii_meters import read_snapshot as _read_meter_snapshot
from app.services.devices.tascam_us144mkii_preflight import (
    BOOT_PID,
    EnumerationStage,
    OPERATIONAL_PID,
    OPERATIONAL_VID,
    PreflightReport,
    get_preflight_report,
)
from app.services.juce.common import TASCAM_US144MKII

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/devices/tascam-us144mkii",
    tags=["TASCAM US-144MKII"],
)


# ----------------------------------------------------------------------------
# Response models
# ----------------------------------------------------------------------------

class StatusResponse(BaseModel):
    """Operational state for the Devices panel header banner."""

    module_loaded: bool = Field(
        ..., description="Whether snd-usb-us144mkii is in /proc/modules."
    )
    enumeration_stage: str = Field(
        ...,
        description="One of: disconnected, boot_mode, operational.",
    )
    operational_path: Optional[str] = Field(
        None, description="/sys/bus/usb/devices path when operational."
    )
    remediation_hint: Optional[str] = Field(
        None, description="Operator-readable one-liner when not operational."
    )
    vid_pid: str = Field(..., description="Canonical operational VID:PID pair.")
    boot_vid_pid: str = Field(..., description="Transient boot/loader VID:PID pair.")
    canonical_name: str = Field(..., description="Display name across the platform.")
    tier1_sample_rate_hz: int = Field(..., description="Pinned tier-1 sample rate.")
    tier1_buffer_samples: int = Field(..., description="Pinned tier-1 buffer size.")


class CapabilitiesResponse(BaseModel):
    """Static device profile snapshot for the I/O Routing tab."""

    name: str
    manufacturer: str
    kernel_module: str
    input_channels: int
    output_channels: int
    format: str
    sample_rate: int
    buffer_size: int
    spdif_send_channels: List[int]
    spdif_return_channels: List[int]
    analog_send_channels: List[int]
    analog_return_channels: List[int]


class ResetResponse(BaseModel):
    success: bool
    message: str
    operational_path: Optional[str] = None


class MeterPayload(BaseModel):
    """T2515-6-METERS — per-channel peak readout in dBFS.

    Channel indexing follows the device-pack profile: indices 0-1 are the
    analog L/R pair, 2-3 are the S/PDIF L/R pair. A live engine metering
    hook is filed as **T2515-Follow-up-METER-WIRE**; until that lands the
    sentinel value (-150.0) is returned per channel so the Carbon panel
    renders the row with an em-dash instead of crashing.
    """

    input_peak_db: List[float]
    output_peak_db: List[float]
    source: str = Field(
        ...,
        description=(
            "How the values were obtained. One of: 'engine', 'placeholder'. "
            "Operators reading 'placeholder' should treat them as 'not yet measured'."
        ),
    )


class ClockSourceOption(BaseModel):
    id: str
    label: str
    description: str
    selectable: bool


class ClockSourceResponse(BaseModel):
    """T2515-6-CLOCK — clock source state for the Carbon Clock tab.

    Tier-1 pins to ``internal_48k``; the other options are advertised as
    selectable=False until the transactional clock-change endpoint ships.
    """

    selected: str = Field(..., description="Currently-active clock source id.")
    locked_for_tier1: bool = Field(
        ...,
        description=(
            "True while tier-1 pins the device to 48 kHz / internal clock. "
            "Operators can't change the source until the change endpoint ships."
        ),
    )
    sample_rate_hz: int
    options: List[ClockSourceOption]


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

def _report_to_response(report: PreflightReport) -> StatusResponse:
    return StatusResponse(
        module_loaded=report.module_loaded,
        enumeration_stage=report.enumeration_stage,
        operational_path=report.operational_path,
        remediation_hint=report.remediation_hint,
        vid_pid=f"{OPERATIONAL_VID}:{OPERATIONAL_PID}",
        boot_vid_pid=f"{OPERATIONAL_VID}:{BOOT_PID}",
        canonical_name=TASCAM_US144MKII["name"],
        tier1_sample_rate_hz=int(TASCAM_US144MKII["sample_rate"]),
        tier1_buffer_samples=int(TASCAM_US144MKII["buffer_size"]),
    )


def _usbreset_available() -> Optional[str]:
    """Return the resolved `usbreset` binary path, or None if not installed."""
    return shutil.which("usbreset")


# ----------------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------------

@router.get("/status", response_model=StatusResponse)
async def get_status() -> StatusResponse:
    """Current operational state, including driver presence + USB stage."""
    # Non-resolving — status polling must be instant. The Devices panel can
    # request a one-shot resolve by hitting POST /reset.
    report = await asyncio.to_thread(get_preflight_report, resolve_boot_mode=False)
    return _report_to_response(report)


@router.get("/capabilities", response_model=CapabilitiesResponse)
async def get_capabilities() -> CapabilitiesResponse:
    """Static profile of declared I/O channels + tier-1 audio settings."""
    spec = TASCAM_US144MKII
    return CapabilitiesResponse(
        name=spec["name"],
        manufacturer=spec["manufacturer"],
        kernel_module=spec["kernel_module"],
        input_channels=int(spec["input_channels"]),
        output_channels=int(spec["output_channels"]),
        format=spec["format"],
        sample_rate=int(spec["sample_rate"]),
        buffer_size=int(spec["buffer_size"]),
        spdif_send_channels=list(spec["spdif_send_channels"]),
        spdif_return_channels=list(spec["spdif_return_channels"]),
        analog_send_channels=list(spec["analog_send_channels"]),
        analog_return_channels=list(spec["analog_return_channels"]),
    )


@router.get("/meters", response_model=MeterPayload)
async def get_meters() -> MeterPayload:
    """Per-channel peak meter values in dBFS.

    Reads through the ``tascam_us144mkii_meters`` injection seam. The
    default ``PlaceholderMeterSource`` returns -150 dBFS sentinels per
    channel (Carbon panel renders these as em-dashes). When the JUCE
    engine's per-device ring-buffer metering wire-up lands, lifespan
    startup will swap in a ``JuceEngineMeterSource`` and the ``source``
    field flips from ``placeholder`` to ``engine`` without any change
    to this handler.
    """
    snapshot = await _read_meter_snapshot()
    return MeterPayload(
        input_peak_db=list(snapshot.input_peak_db),
        output_peak_db=list(snapshot.output_peak_db),
        source=snapshot.source,
    )


@router.get("/clock-source", response_model=ClockSourceResponse)
async def get_clock_source() -> ClockSourceResponse:
    """Clock-source state + the choice menu the operator sees.

    Tier-1 pins to ``internal_48k`` to match the platform-wide Tier A
    locks (``audio.sample_rate=48000``). The other options are listed
    with ``selectable=false`` so the panel can render a proper radio
    group with an explanatory subtitle; an operator selecting one will
    hit the (future) transactional clock-source-change route.
    """
    spec = TASCAM_US144MKII
    return ClockSourceResponse(
        selected="internal_48k",
        locked_for_tier1=True,
        sample_rate_hz=int(spec["sample_rate"]),
        options=[
            ClockSourceOption(
                id="internal_48k",
                label="Internal — 48 kHz",
                description=(
                    "Device generates its own clock at 48 kHz. Tier-1 default; "
                    "matches platform-wide Tier A locks."
                ),
                selectable=True,
            ),
            ClockSourceOption(
                id="spdif_in",
                label="External — S/PDIF in",
                description=(
                    "Slave to the incoming S/PDIF stream's clock. Requires a "
                    "valid signal on the S/PDIF coax input. Transactional "
                    "change endpoint ships in T2515 follow-up."
                ),
                selectable=False,
            ),
        ],
    )


@router.post("/reset", response_model=ResetResponse)
async def reset_device(
    confirm: bool = Query(
        False,
        description=(
            "Must be true. Reset is destructive — it issues a USB-port reset "
            "which stops audio I/O for ~1 second."
        ),
    ),
) -> ResetResponse:
    """Issue a USB-port reset for the stuck-in-boot-mode recovery case.

    Refuses without ``confirm=true``. Re-runs the preflight after the reset
    so the response carries the post-reset state.
    """
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "confirmation_required",
                "message": (
                    "USB reset is destructive (~1 second audio interruption). "
                    "Re-call with ?confirm=true to proceed."
                ),
            },
        )

    usbreset = _usbreset_available()
    if usbreset is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "usbreset_unavailable",
                "message": (
                    "`usbreset` binary not found on PATH. Install `usbutils` "
                    "(Fedora) or your distro's equivalent."
                ),
            },
        )

    target = f"{OPERATIONAL_VID}:{BOOT_PID}"
    boot_first_then_operational = [
        f"{OPERATIONAL_VID}:{BOOT_PID}",
        f"{OPERATIONAL_VID}:{OPERATIONAL_PID}",
    ]

    last_err: Optional[str] = None
    for spec in boot_first_then_operational:
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                [usbreset, spec],
                check=False,
                capture_output=True,
                text=True,
                timeout=5.0,
            )
            if result.returncode == 0:
                # Wait briefly for the driver to re-enumerate.
                post = await asyncio.to_thread(
                    get_preflight_report, resolve_boot_mode=True, timeout_s=3.0
                )
                logger.info(
                    "tascam.us144mkii.reset_ok target=%s stage_after=%s",
                    spec, post.enumeration_stage,
                )
                return ResetResponse(
                    success=True,
                    message=f"usbreset {spec} → enumeration stage: {post.enumeration_stage}",
                    operational_path=post.operational_path,
                )
            last_err = (result.stderr or result.stdout or "").strip()
        except subprocess.TimeoutExpired:
            last_err = "usbreset timed out"
        except FileNotFoundError as e:
            last_err = str(e)

    logger.warning("tascam.us144mkii.reset_failed last_err=%s", last_err)
    raise HTTPException(
        status_code=502,
        detail={
            "code": "usbreset_failed",
            "message": (
                "usbreset did not return successfully for either VID:PID. "
                f"Last stderr: {last_err or '<empty>'}"
            ),
        },
    )
