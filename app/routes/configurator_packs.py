"""Configurator pack-discovery seam.

Cycle 9 / 2026-05-09 — backs the framework Configurator's device-pack
picker so the frontend stops hardcoding the pack list. The endpoint
returns lightweight metadata only — function refs (fetchStatus, tabs)
remain on the frontend descriptor.

This is the seam that unblocks T2499-B (Maschine MK1) and T2499-C
(AVDECC) from requiring UI rework: their pack metadata can land here
first, then the frontend descriptor implementations catch up
incrementally.

Today's registered packs:
    - meloaudio_commander → bespoke route /midi/devices/meloaudio-commander

Adding a pack: append a ConfiguratorPackEntry below. The frontend
treats unknown packIds as backend-only stubs (they render in the
picker and route to the bespoke_route — useful for "coming soon"
entries that need backend-side telemetry before the framework UI lands).
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field


router = APIRouter(
    prefix="/api/midi/configurator",
    tags=["MIDI Configurator"],
)


class ConfiguratorPackEntry(BaseModel):
    """Backend-supplied pack metadata. Frontend merges this with its
    locally-registered descriptor library (by ``pack_id``). Pure data
    only — function refs (fetchStatus, tabs) live on the frontend
    descriptor."""

    pack_id: str = Field(..., description="Stable pack identifier; matches the frontend descriptor's packId.")
    display_name: str
    vendor_name: Optional[str] = None
    summary: Optional[str] = Field(
        default=None,
        description="One-line operator-facing summary; rendered under the picker tile title.",
    )
    bespoke_route: Optional[str] = Field(
        default=None,
        description=(
            "Frontend route for the pack's bespoke onboarding flow. Picking the "
            "pack in the framework picker navigates here. None if no bespoke "
            "route exists yet (the framework shell renders a generic detail view)."
        ),
    )
    available: bool = Field(
        default=True,
        description=(
            "Set False to hide a pack from production discovery while leaving "
            "the metadata in place (e.g. WIP packs gated on hardware bench)."
        ),
    )


class ConfiguratorPacksResponse(BaseModel):
    packs: list[ConfiguratorPackEntry]


_REGISTERED_PACKS: list[ConfiguratorPackEntry] = [
    ConfiguratorPackEntry(
        pack_id="meloaudio_commander",
        display_name="MeloAudio MIDI Commander",
        vendor_name="MeloAudio",
        summary="USB MIDI 10-button foot controller. Custom firmware install + per-installation override.",
        bespoke_route="/midi/devices/meloaudio-commander",
        available=True,
    ),
]


@router.get("/packs", response_model=ConfiguratorPacksResponse)
async def list_configurator_packs(
    include_unavailable: bool = False,
) -> ConfiguratorPacksResponse:
    """Return every device-pack the framework Configurator knows about.

    Default: ``available=True`` packs only. Pass
    ``?include_unavailable=true`` to also list WIP packs the operator
    can't yet exercise (e.g. for QA dashboards or telemetry views).
    """
    packs = _REGISTERED_PACKS
    if not include_unavailable:
        packs = [p for p in packs if p.available]
    return ConfiguratorPacksResponse(packs=list(packs))
