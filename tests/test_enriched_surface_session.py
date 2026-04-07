from __future__ import annotations

import pytest

from app.services.enriched_surface_session import EnrichedSurfaceSessionService


@pytest.mark.asyncio
async def test_session_service_applies_operator_view_override():
    service = EnrichedSurfaceSessionService()

    await service.set_view_override("maschine-mk1", view_id="surface-lab", source="operator")
    resolved = await service.resolve_session(
        "maschine-mk1",
        derived_view_id="synth-parameters-primary",
        derived_view_source="maschine-audio-grid-selection",
        available_view_ids=["synth-parameters-primary", "surface-lab"],
    )

    assert resolved["current_view_id"] == "surface-lab"
    assert resolved["is_override_active"] is True


@pytest.mark.asyncio
async def test_session_service_prefers_derived_recent_target_when_present():
    service = EnrichedSurfaceSessionService()

    await service.set_recent_target(
        "maschine-mk1",
        target_id="manual-node",
        label="Manual",
        kind="operator-target",
    )
    resolved = await service.resolve_session(
        "maschine-mk1",
        derived_view_id="synth-parameters-primary",
        derived_view_source="maschine-audio-grid-selection",
        available_view_ids=["synth-parameters-primary"],
        derived_recent_target={
            "target_id": "runtime-node",
            "label": "Runtime",
            "kind": "maschine-audio-grid-block",
            "source": "maschine-audio-grid-selection",
        },
    )

    assert resolved["recent_target"]["target_id"] == "runtime-node"
    assert resolved["recent_target"]["source"] == "maschine-audio-grid-selection"
