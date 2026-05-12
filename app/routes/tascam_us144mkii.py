"""T2515-6 — TASCAM US-144MKII tier-1 device routes.

Surfaces the device's operational state to the Carbon Devices panel:

  GET  /api/v1/devices/tascam-us144mkii/status         driver + USB-enum state
  GET  /api/v1/devices/tascam-us144mkii/capabilities   declared port + capability table
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
