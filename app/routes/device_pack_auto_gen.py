"""
T2492-1 — REST surface for the device-pack auto-generator wizard.

Three endpoints under /api/midi/devices/auto-generate/:
  - POST /lookup    — body: USB descriptor; returns Mixxx + USB-IF results.
  - POST /synthesize — body: lookup result + operator choice; returns
                       the three text blobs (manifest, XML, JS).
  - POST /commit    — body: final blobs + vendor + model; writes to
                      `device-packs/<vendor>/<model>/`.

The wizard frontend (`DevicePackGeneratorModal`) walks the operator
through these in order; each step displays the previous response and
lets the operator review before proceeding.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.services.device_pack_auto_gen import (
    LookupResult,
    ManifestSynthesizer,
    MixxxLookup,
    UsbIfLookup,
)
from app.services.device_pack_auto_gen.lookup import perform_lookup
from app.services.device_pack_auto_gen.synthesis import SynthesisInput
from app.services.device_pack_auto_gen.writer import PackWriteError, PackWriter

router = APIRouter(
    prefix="/api/midi/devices/auto-generate",
    tags=["MIDI Device-Pack Auto-Generation"],
)


class LookupRequest(BaseModel):
    vid: str = Field(..., description="USB vendor id, hex string '0xNNNN'")
    pid: str = Field(..., description="USB product id, hex string '0xNNNN'")


class MixxxMatchPayload(BaseModel):
    vid: str
    pid: str
    device_name: str
    mapping_file: str
    script_files: list[str]
    protocol: str
    upstream_commit: str


class UsbIfMatchPayload(BaseModel):
    vid: str
    pid: Optional[str]
    vendor_name: Optional[str]
    product_name: Optional[str]


class LookupResponse(BaseModel):
    vid: str
    pid: str
    mixxx_match: Optional[MixxxMatchPayload]
    usbif_match: Optional[UsbIfMatchPayload]


class SynthesizeRequest(BaseModel):
    vid: str
    pid: str
    alsa_name: str = ""
    usb_manufacturer: str = ""
    usb_product: str = ""
    operator_choice: str = Field(default="auto", pattern="^(auto|use-mixxx-template|from-scratch)$")


class SynthesizeResponse(BaseModel):
    manifest_yaml: str
    mapping_xml: str
    scripts_js: str
    suggested_vendor: str
    suggested_model: str
    used_mixxx_template: bool
    mixxx_template_path: Optional[str]
    mixxx_upstream_commit: Optional[str]


class CommitRequest(BaseModel):
    vendor: str = Field(..., min_length=1, max_length=128)
    model: str = Field(..., min_length=1, max_length=128)
    manifest_yaml: str
    mapping_xml: str
    scripts_js: str = ""
    overwrite: bool = False


class CommitResponse(BaseModel):
    profile_key: str
    pack_dir: str
    manifest_path: str
    mapping_path: str
    scripts_path: str
    runtime_packs_dir: str  # T2492-1a: surface which target dir was used.


def _lookup_to_response(result: LookupResult) -> LookupResponse:
    mixxx = (
        MixxxMatchPayload(
            vid=result.mixxx_match.vid,
            pid=result.mixxx_match.pid,
            device_name=result.mixxx_match.device_name,
            mapping_file=result.mixxx_match.mapping_file,
            script_files=list(result.mixxx_match.script_files),
            protocol=result.mixxx_match.protocol,
            upstream_commit=result.mixxx_match.upstream_commit,
        )
        if result.mixxx_match
        else None
    )
    usbif = (
        UsbIfMatchPayload(
            vid=result.usbif_match.vid,
            pid=result.usbif_match.pid,
            vendor_name=result.usbif_match.vendor_name,
            product_name=result.usbif_match.product_name,
        )
        if result.usbif_match
        else None
    )
    return LookupResponse(vid=result.vid, pid=result.pid, mixxx_match=mixxx, usbif_match=usbif)


@router.post("/lookup", response_model=LookupResponse)
async def auto_generate_lookup(payload: LookupRequest) -> LookupResponse:
    return _lookup_to_response(perform_lookup(payload.vid, payload.pid))


@router.post("/synthesize", response_model=SynthesizeResponse)
async def auto_generate_synthesize(payload: SynthesizeRequest) -> SynthesizeResponse:
    lookup = perform_lookup(payload.vid, payload.pid)
    synth = ManifestSynthesizer().synthesize(
        lookup,
        SynthesisInput(
            vid=payload.vid,
            pid=payload.pid,
            alsa_name=payload.alsa_name,
            usb_manufacturer=payload.usb_manufacturer,
            usb_product=payload.usb_product,
            operator_choice=payload.operator_choice,
        ),
    )
    return SynthesizeResponse(
        manifest_yaml=synth.manifest_yaml,
        mapping_xml=synth.mapping_xml,
        scripts_js=synth.scripts_js,
        suggested_vendor=synth.suggested_vendor,
        suggested_model=synth.suggested_model,
        used_mixxx_template=synth.used_mixxx_template,
        mixxx_template_path=synth.mixxx_template_path,
        mixxx_upstream_commit=synth.mixxx_upstream_commit,
    )


@router.post("/commit", response_model=CommitResponse, status_code=status.HTTP_201_CREATED)
async def auto_generate_commit(payload: CommitRequest) -> CommitResponse:
    # T2492-1a: PackWriteError → 400 with operator-actionable detail.
    # Anything else (unexpected exceptions in best-effort registry
    # reload, etc.) is logged and surfaced as a 500 with a clean
    # message instead of bubbling a raw stack trace.
    try:
        result = PackWriter().commit(
            vendor=payload.vendor,
            model=payload.model,
            manifest_yaml=payload.manifest_yaml,
            mapping_xml=payload.mapping_xml,
            scripts_js=payload.scripts_js,
            overwrite=payload.overwrite,
        )
    except PackWriteError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:  # noqa: BLE001 — clean envelope for the operator
        import logging
        logging.getLogger(__name__).exception("Unexpected device-pack commit failure")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected commit failure: {exc.__class__.__name__}: {exc}",
        ) from exc
    return CommitResponse(
        profile_key=result.profile_key,
        pack_dir=result.pack_dir,
        manifest_path=result.manifest_path,
        mapping_path=result.mapping_path,
        scripts_path=result.scripts_path,
        runtime_packs_dir=result.runtime_packs_dir,
    )


@router.get("/diagnostics")
async def auto_generate_diagnostics() -> dict[str, object]:
    """Quick health check: lookup-table sizes + the resolved write target."""
    import os
    from app.services.device_pack_auto_gen.writer import _resolve_runtime_packs_dir

    target = _resolve_runtime_packs_dir()
    target_writable = False
    try:
        target.mkdir(parents=True, exist_ok=True)
        target_writable = os.access(target, os.W_OK)
    except OSError:
        target_writable = False
    return {
        "mixxx_lookup_entries": MixxxLookup().entry_count,
        "usbif_lookup_vendors": UsbIfLookup().vendor_count,
        "runtime_packs_dir": str(target),
        "runtime_packs_dir_writable": target_writable,
    }
