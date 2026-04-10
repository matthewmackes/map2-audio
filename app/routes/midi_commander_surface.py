from __future__ import annotations

import copy
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.database import get_session
from app.services.midi_commander_surface import get_midi_commander_surface_service
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService
from app.services.snapshot_service import SnapshotService

router = APIRouter(prefix="/api/midi-commander", tags=["midi-commander"])


class MidiCommanderMappingPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    control_id: str
    patch: dict[str, Any] = Field(default_factory=dict)


def _assignment_summary(control: dict[str, Any]) -> str:
    assignment = control.get("assignment") if isinstance(control.get("assignment"), dict) else {}
    action_type = str(
        assignment.get("kind")
        or assignment.get("action_type")
        or assignment.get("action")
        or ""
    ).strip().lower()
    if action_type in {"parameter", "expression_target"}:
        param_id = str(assignment.get("param_id") or assignment.get("symbol") or "parameter")
        plugin_uri = str(assignment.get("target_plugin_uri", assignment.get("plugin_uri")) or "").strip()
        return f"Parameter: {plugin_uri or 'plugin'} / {param_id}"
    if action_type in {"toggle_plugin", "bypass"}:
        return f"Bypass toggle: {assignment.get('block_id') or assignment.get('target_plugin_uri') or 'plugin'}"
    if action_type in {"focus_block", "focus"}:
        return f"Focus block: {assignment.get('block_id') or assignment.get('target_plugin_uri') or 'target'}"
    if action_type == "transport":
        return f"Transport: {assignment.get('transport_action') or assignment.get('transport') or assignment.get('action') or 'action'}"
    return "Unassigned"


def _build_projection(*, service_state: dict[str, Any], live_snapshot_payload: dict[str, Any] | None) -> dict[str, Any]:
    service = get_midi_commander_surface_service()
    entries = (
        service._iter_live_input_mappings(live_snapshot_payload)
        if isinstance(live_snapshot_payload, dict)
        else service._normalize_extension_payload({})
    )
    controls = [{**dict(entry), "assignment_summary": _assignment_summary(entry)} for entry in entries]
    return {
        "snapshot": (
            {"id": int(live_snapshot_payload.get("id") or 0), "name": str(live_snapshot_payload.get("name") or "")}
            if isinstance(live_snapshot_payload, dict)
            else None
        ),
        "controls": controls,
        "active_snapshot_mapping": service_state.get("active_snapshot_mapping"),
        "last_activation_push": service_state.get("last_activation_push"),
        "detected_ports": service_state.get("detected_ports", []),
        "active_profile": service_state.get("active_profile"),
        "current_bank": service_state.get("current_bank"),
        "expression_calibrations": service_state.get("expression_calibrations", {}),
    }


@router.get("/status")
async def get_midi_commander_status() -> dict[str, Any]:
    service = get_midi_commander_surface_service()
    await service.ensure_daemon_started()
    matched_ports = service.list_matching_ports()
    state = service.get_state_snapshot()
    recent_events = state.get("recent_events") if isinstance(state.get("recent_events"), list) else []
    return {
        "status": "ok",
        "state": {
            "connected": bool(matched_ports),
            "matched_ports": matched_ports,
            "matched_port_count": len(matched_ports),
            "active_snapshot_mapping": state.get("active_snapshot_mapping"),
            "last_activation_push": state.get("last_activation_push"),
            "active_profile": state.get("active_profile"),
            "current_bank": state.get("current_bank"),
            "expression_calibrations": state.get("expression_calibrations", {}),
            "daemon_status": state.get("daemon_status"),
            "recent_event_count": len(recent_events),
            "last_event": recent_events[-1] if recent_events else None,
        },
    }


@router.get("/projection")
async def get_midi_commander_projection() -> dict[str, Any]:
    service = get_midi_commander_surface_service()
    async with get_session(read_only=True) as session:
        live_snapshot_payload = await SnapshotRuntimeStateService(session).get_live_snapshot_payload()
    return {
        "status": "ok",
        "projection": _build_projection(
            service_state=service.get_state_snapshot(),
            live_snapshot_payload=live_snapshot_payload if isinstance(live_snapshot_payload, dict) else None,
        ),
    }


@router.post("/mapping")
async def patch_live_midi_commander_mapping(request: MidiCommanderMappingPatchRequest) -> dict[str, Any]:
    control_id = str(request.control_id or "").strip()
    if not control_id:
        raise HTTPException(status_code=400, detail="control_id is required")

    service = get_midi_commander_surface_service()
    async with get_session() as session:
        snapshot_service = SnapshotService(session)
        live_snapshot = await snapshot_service.get_live_snapshot()
        if not isinstance(live_snapshot, dict):
            raise HTTPException(status_code=404, detail="No live snapshot is active")

        detail_payload = copy.deepcopy(live_snapshot)
        extensions = detail_payload.setdefault("extensions", {})
        if not isinstance(extensions, dict):
            detail_payload["extensions"] = {}
            extensions = detail_payload["extensions"]
        midi_commander = extensions.setdefault("midi_commander", {})
        if not isinstance(midi_commander, dict):
            extensions["midi_commander"] = {}
            midi_commander = extensions["midi_commander"]
        mappings = midi_commander.get("mappings")
        if not isinstance(mappings, list):
            mappings = []
            midi_commander["mappings"] = mappings

        target = next(
            (
                entry
                for entry in mappings
                if isinstance(entry, dict) and str(entry.get("control_id") or "").strip() == control_id
            ),
            None,
        )
        if target is None:
            target = {"control_id": control_id}
            mappings.append(target)
        target.update(dict(request.patch or {}))

        updated = await snapshot_service.update_snapshot(
            int(live_snapshot["id"]),
            detail_payload=detail_payload,
            capture_current_authority_extensions=False,
        )
        if not isinstance(updated, dict):
            raise HTTPException(status_code=500, detail="Failed to update live snapshot MIDI Commander mapping")
        extension_payload = updated.get("extensions", {}).get("midi_commander") if isinstance(updated.get("extensions"), dict) else None
        await service.push_snapshot_activation(
            snapshot_id=int(updated.get("id") or 0),
            snapshot_name=str(updated.get("name") or ""),
            extension_payload=dict(extension_payload) if isinstance(extension_payload, dict) else {},
        )

    return {
        "status": "ok",
        "projection": _build_projection(service_state=service.get_state_snapshot(), live_snapshot_payload=updated),
    }
