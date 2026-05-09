"""Unified MIDI route module.

Worklist: T2459-H5 (route-consolidation slice + slice 12 retirement flow)

This module aggregates the existing MIDI route surfaces behind one import
point while preserving current path prefixes and handlers. When
``MAP2_MIDI_LEGACY_RETIRED`` is truthy, legacy v1 surfaces are replaced with a
catch-all 410 Gone shim instead of being mounted in deprecated form.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.routes._midi_v1_retirement import include_legacy_midi_router
from app.routes.enriched_midi_physical_surfaces import router as enriched_midi_physical_surfaces_router
from app.routes.midi_cluster import router as midi_cluster_router
from app.routes.midi_commander_surface import router as midi_commander_surface_router
from app.routes.midi_hub import router as midi_hub_router
from app.routes.midi_learn import router as midi_learn_router
from app.routes.midi_v2 import router as midi_v2_router

router = APIRouter(tags=["midi"])

router.include_router(midi_v2_router)
include_legacy_midi_router(router, midi_hub_router)
include_legacy_midi_router(router, midi_cluster_router)
include_legacy_midi_router(router, midi_learn_router)
include_legacy_midi_router(router, midi_commander_surface_router)
include_legacy_midi_router(router, enriched_midi_physical_surfaces_router)
