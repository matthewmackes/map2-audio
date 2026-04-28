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
