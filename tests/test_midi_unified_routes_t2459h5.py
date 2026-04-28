from __future__ import annotations

from fastapi import FastAPI

from app.routes.midi import router as unified_midi_router


def test_unified_midi_router_exposes_all_legacy_prefixes() -> None:
    app = FastAPI()
    app.include_router(unified_midi_router)

    paths = {route.path for route in app.routes}

    assert "/api/v2/midi/mappings" in paths
    assert "/api/midi/hub/status" in paths
    assert "/api/midi/cluster/nodes" in paths
    assert "/api/midi-learn/learn/status" in paths
    assert "/api/midi-commander/status" in paths
    assert "/api/enriched-midi-physical-surfaces/summary" in paths


def test_unified_midi_router_marks_legacy_surfaces_deprecated() -> None:
    app = FastAPI()
    app.include_router(unified_midi_router)
    schema = app.openapi()
    paths = schema["paths"]

    assert paths["/api/v2/midi/mappings"]["post"].get("deprecated") in (None, False)
    assert paths["/api/midi/hub/status"]["get"]["deprecated"] is True
    assert paths["/api/midi/cluster/nodes"]["get"]["deprecated"] is True
    assert paths["/api/midi-learn/learn/status"]["get"]["deprecated"] is True
    assert paths["/api/midi-commander/status"]["get"]["deprecated"] is True
    assert paths["/api/enriched-midi-physical-surfaces/summary"]["get"]["deprecated"] is True
