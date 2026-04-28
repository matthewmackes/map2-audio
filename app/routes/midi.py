"""Unified MIDI route module.

Worklist: T2459-H5 (route-consolidation slice)

This module aggregates the existing MIDI route surfaces behind one import
point while preserving current path prefixes and handlers.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.routes.enriched_midi_physical_surfaces import router as enriched_midi_physical_surfaces_router
from app.routes.midi_cluster import router as midi_cluster_router
from app.routes.midi_commander_surface import router as midi_commander_surface_router
from app.routes.midi_hub import router as midi_hub_router
from app.routes.midi_learn import router as midi_learn_router
from app.routes.midi_v2 import router as midi_v2_router

router = APIRouter(tags=["midi"])

router.include_router(midi_v2_router)
router.include_router(midi_hub_router)
router.include_router(midi_cluster_router)
router.include_router(midi_learn_router)
router.include_router(midi_commander_surface_router)
router.include_router(enriched_midi_physical_surfaces_router)
