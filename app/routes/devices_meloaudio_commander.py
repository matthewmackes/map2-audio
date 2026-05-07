"""MeloAudio MIDI Commander Configurator API routes.

T2459-H3-CFG Phase 5 slice 1.

Routes:

* ``GET /api/devices/meloaudio/commander/status`` —
  point-in-time firmware/connection status
* ``POST /api/devices/meloaudio/commander/discovery/start`` —
  begin a discovery session, returns a session ID
* ``GET /api/devices/meloaudio/commander/discovery/{session_id}`` —
  current state of a session (current prompt, progress, captured map)
* ``POST /api/devices/meloaudio/commander/discovery/{session_id}/skip`` —
  skip the current prompt
* ``POST /api/devices/meloaudio/commander/discovery/{session_id}/cancel`` —
  cancel the session
* ``POST /api/devices/meloaudio/commander/discovery/{session_id}/save`` —
  persist captured bindings to ``~/.map2/devices/...yaml``
* ``GET /api/devices/meloaudio/commander/override`` —
  load the per-installation override file (if it exists)
* ``DELETE /api/devices/meloaudio/commander/override`` —
  delete the per-installation override file
* ``GET /api/devices/meloaudio/commander/firmware/bundled`` —
  list bundled custom-firmware binaries

For Phase 5 slice 1, only the read-side routes (``status``, ``override`` GET,
``firmware/bundled``) are implemented. The write-side (discovery session
lifecycle, override save/delete) lands in slice 2 with the actual session
manager. The frontend component code is slice 3+4.

The routes are intentionally **stateless on this layer** for the read
side — each request re-reads the USB tree / the override file. Caching
is the operator's responsibility (the UI polls when the page is open
and stops when navigated away).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.devices.meloaudio import (
    CommanderFirmwareKind,
    CommanderStatus,
    CommanderControl,
    CommanderDiscoveryEvent,
    CommanderDiscoveryOverride,
    FIRMWARE_BUNDLE_DIR,
    detect_commander_status,
    list_bundled_firmware,
    load_override,
    override_yaml_path,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/devices/meloaudio/commander",
    tags=["MeloAudio Commander Configurator"],
)


# ---------------------------------------------------------------------------
# Pydantic response models — keep the wire shape stable across UI versions
# ---------------------------------------------------------------------------


class CommanderStatusResponse(BaseModel):
    """Snapshot of the connected Commander's firmware + hardware identity."""

    firmware_kind: str = Field(
        description=(
            "One of: stock, custom, dfu_bootloader, unknown, not_present. "
            "stock = factory MeloAudio firmware (CC mappings depend on the "
            "current mode; use Discovery Wizard). custom = harvie256 community "
            "firmware (CC mappings configurable via SysEx; use Push MAP2 "
            "Canonical Config). dfu_bootloader = STM32 bootloader, ready to "
            "receive a flash. unknown = USB IDs match but the iProduct string "
            "doesn't match either known firmware. not_present = no Commander "
            "or DFU bootloader on the bus."
        )
    )
    is_present: bool = Field(
        description=(
            "True when ANY device matching the Commander's identifiers is on "
            "the bus, including the DFU bootloader. UI uses this vs. the "
            "specific kind to distinguish 'no Commander connected' from "
            "'Commander is mid-flash, finish it' states."
        )
    )
    supports_discovery_wizard: bool = Field(
        description="True when the Discovery Wizard can run."
    )
    supports_canonical_config_push: bool = Field(
        description="True when MAP2 can push a SysEx canonical config."
    )

    vendor_id: Optional[int] = None
    product_id: Optional[int] = None
    product_string: Optional[str] = None
    manufacturer_string: Optional[str] = None
    serial: Optional[str] = None
    sysfs_path: Optional[str] = None
    bcd_device: Optional[str] = None

    @classmethod
    def from_status(cls, status: CommanderStatus) -> "CommanderStatusResponse":
        return cls(
            firmware_kind=status.firmware_kind.value,
            is_present=status.is_present,
            supports_discovery_wizard=status.supports_discovery_wizard,
            supports_canonical_config_push=status.supports_canonical_config_push,
            vendor_id=status.vendor_id,
            product_id=status.product_id,
            product_string=status.product_string,
            manufacturer_string=status.manufacturer_string,
            serial=status.serial,
            sysfs_path=status.sysfs_path,
            bcd_device=status.bcd_device,
        )


class CommanderBindingResponse(BaseModel):
    """A single discovered binding from the override file."""

    control: str
    status: str = Field(description="Hex status byte, e.g. '0xB0'.")
    midino: int
    channel: int
    raw_value: Optional[int] = None


class CommanderOverrideResponse(BaseModel):
    """The full per-installation override, if one exists."""

    has_override: bool = Field(
        description=(
            "False when no override file exists. UI surfaces this as 'using "
            "device-pack defaults; no operator-specific bindings configured'."
        )
    )
    captured_at_utc: Optional[str] = None
    device_serial: Optional[str] = None
    notes: Optional[str] = None
    bindings: list[CommanderBindingResponse] = Field(default_factory=list)
    file_path: Optional[str] = None

    @classmethod
    def absent(cls) -> "CommanderOverrideResponse":
        return cls(has_override=False)

    @classmethod
    def from_override(
        cls,
        override: CommanderDiscoveryOverride,
        path: Path,
    ) -> "CommanderOverrideResponse":
        return cls(
            has_override=True,
            captured_at_utc=override.captured_at_utc,
            device_serial=override.device_serial,
            notes=override.notes,
            file_path=str(path),
            bindings=[
                CommanderBindingResponse(
                    control=control.value,
                    status=f"0x{event.status:02X}",
                    midino=event.midino,
                    channel=event.channel,
                    raw_value=event.raw_value,
                )
                for control, event in override.bindings.items()
            ],
        )


class BundledFirmwareEntry(BaseModel):
    name: str
    path: str
    size_bytes: int


class BundledFirmwareResponse(BaseModel):
    """Listing of bundled `.dfu` binaries available for flashing."""

    has_bundled_firmware: bool
    firmwares: list[BundledFirmwareEntry] = Field(default_factory=list)
    bundle_dir: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/status", response_model=CommanderStatusResponse)
async def get_commander_status() -> CommanderStatusResponse:
    """Detect + classify the connected MeloAudio MIDI Commander.

    Side-effect-free; safe to poll. The UI polls this every 2-3
    seconds while the Configurator page is open so the operator
    sees firmware-mode changes (e.g., entering DFU mode) live.
    """
    status = detect_commander_status()
    return CommanderStatusResponse.from_status(status)


@router.get("/override", response_model=CommanderOverrideResponse)
async def get_commander_override() -> CommanderOverrideResponse:
    """Read the per-installation override file if it exists.

    Returns ``has_override=False`` when the file is absent (operator
    hasn't run the Discovery Wizard yet). Raises 500 on a corrupted
    override file so the UI surfaces the issue rather than silently
    falling back to the device-pack defaults.
    """
    path = override_yaml_path()
    try:
        override = load_override(path=path)
    except Exception as exc:
        logger.exception("Commander override load failed")
        raise HTTPException(
            status_code=500,
            detail=f"Override file at {path} is malformed: {exc}",
        ) from exc

    if override is None:
        return CommanderOverrideResponse.absent()
    return CommanderOverrideResponse.from_override(override, path)


@router.delete("/override", status_code=204)
async def delete_commander_override() -> None:
    """Delete the per-installation override file.

    Operator does this when they want to revert to device-pack
    defaults (or when they've changed stock firmware modes and need
    to re-run the Discovery Wizard with a clean slate).
    """
    path = override_yaml_path()
    if path.exists():
        try:
            path.unlink()
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete override at {path}: {exc}",
            ) from exc


@router.get("/firmware/bundled", response_model=BundledFirmwareResponse)
async def get_bundled_firmware() -> BundledFirmwareResponse:
    """List the .dfu firmware binaries bundled with this MAP2 install.

    Returned in lexical order; UI typically picks the latest version
    by default and lets advanced operators select a specific one.
    """
    found = list_bundled_firmware(FIRMWARE_BUNDLE_DIR)
    return BundledFirmwareResponse(
        has_bundled_firmware=bool(found),
        firmwares=[
            BundledFirmwareEntry(
                name=p.name,
                path=str(p),
                size_bytes=p.stat().st_size if p.exists() else 0,
            )
            for p in found
        ],
        bundle_dir=str(FIRMWARE_BUNDLE_DIR),
    )
