"""
Flow Snapshots Routes - Complete GridFlow state capture and MIDI PC switching
"""

import logging
import json
from typing import Dict, Any, List, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/flow-snapshots", tags=["flow-snapshots"])


# =============================================================================
# Pydantic Models
# =============================================================================

class FlowSlotData(BaseModel):
    """Single flow slot state"""
    id: str
    chainId: Optional[int] = None
    label: str
    color: str
    muted: bool = False
    solo: bool = False
    dryWetMix: float = 100.0


class RoutingConfigData(BaseModel):
    """Routing configuration state"""
    mode: str  # parallel_blend, ab_switch, series, parameter_morph, sidechain
    activeSlotId: Optional[str] = None
    blendPositions: Dict[str, float] = {}
    morphProgress: float = 0.5
    morphSourceSlotId: Optional[str] = None
    morphTargetSlotId: Optional[str] = None
    seriesOrder: List[str] = []


class PluginSnapshotData(BaseModel):
    """Plugin state within a chain"""
    uri: str
    position: int
    bypass: bool = False
    parameters: Dict[str, float] = {}


class ChainSnapshotData(BaseModel):
    """Chain state snapshot"""
    name: str
    plugins: List[PluginSnapshotData] = []


class SnapshotData(BaseModel):
    """Complete snapshot payload"""
    flowSlots: List[FlowSlotData]
    routing: RoutingConfigData
    activeFlowIndex: int = 0
    chains: Dict[str, ChainSnapshotData] = {}


class CreateSnapshotRequest(BaseModel):
    """Request to create a new snapshot"""
    name: str
    description: str = ""
    tags: List[str] = []
    program_number: Optional[int] = None
    snapshot_data: SnapshotData


class UpdateSnapshotRequest(BaseModel):
    """Request to update snapshot metadata"""
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    display_order: Optional[int] = None
    is_favorite: Optional[bool] = None


class SetProgramNumberRequest(BaseModel):
    """Request to set MIDI program number"""
    program_number: Optional[int] = None


# =============================================================================
# Routes
# =============================================================================

@router.get("")
async def list_snapshots() -> Dict[str, Any]:
    """
    List all flow snapshots (metadata only, no snapshot_data)

    Returns:
        List of snapshots with count and active ID
    """
    try:
        from app.database import get_session, FlowSnapshot

        async with get_session() as session:
            result = await session.execute(
                select(FlowSnapshot).order_by(
                    FlowSnapshot.display_order,
                    FlowSnapshot.created_at
                )
            )
            snapshots = result.scalars().all()

            # Build response with flow summaries
            snapshot_list = []
            for s in snapshots:
                # Parse snapshot_data to extract flow summary
                flow_slots = []
                try:
                    data = json.loads(s.snapshot_data) if s.snapshot_data else {}
                    for slot in data.get("flowSlots", []):
                        flow_slots.append({
                            "id": slot.get("id", ""),
                            "label": slot.get("label", ""),
                            "color": slot.get("color", "#888"),
                            "chainId": slot.get("chainId"),
                        })
                except Exception:
                    pass  # If parsing fails, just use empty flow_slots

                snapshot_list.append({
                    "id": s.id,
                    "name": s.name,
                    "description": s.description or "",
                    "tags": s.tags or [],
                    "program_number": s.program_number,
                    "is_active": s.is_active,
                    "is_favorite": s.is_favorite,
                    "display_order": s.display_order,
                    "flow_slots": flow_slots,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                    "updated_at": s.updated_at.isoformat() if s.updated_at else None,
                })

            return {
                "snapshots": snapshot_list,
                "count": len(snapshots),
                "active_id": next((s.id for s in snapshots if s.is_active), None),
            }

    except Exception as e:
        logger.error(f"Error listing flow snapshots: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{snapshot_id}")
async def get_snapshot(snapshot_id: int) -> Dict[str, Any]:
    """
    Get snapshot with full data

    Path parameters:
    - snapshot_id: Snapshot ID

    Returns:
        Complete snapshot including snapshot_data
    """
    try:
        from app.database import get_session, FlowSnapshot

        async with get_session() as session:
            result = await session.execute(
                select(FlowSnapshot).filter(FlowSnapshot.id == snapshot_id)
            )
            snapshot = result.scalar_one_or_none()

            if not snapshot:
                raise HTTPException(status_code=404, detail="Snapshot not found")

            return {
                "id": snapshot.id,
                "name": snapshot.name,
                "description": snapshot.description or "",
                "tags": snapshot.tags or [],
                "program_number": snapshot.program_number,
                "is_active": snapshot.is_active,
                "is_favorite": snapshot.is_favorite,
                "display_order": snapshot.display_order,
                "snapshot_data": json.loads(snapshot.snapshot_data),
                "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
                "updated_at": snapshot.updated_at.isoformat() if snapshot.updated_at else None,
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting flow snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_snapshot(request: CreateSnapshotRequest) -> Dict[str, Any]:
    """
    Create a new flow snapshot

    Request body:
    - name: Snapshot name
    - description: Description (optional)
    - tags: Tags list (optional)
    - program_number: MIDI PC number 0-127 (optional)
    - snapshot_data: Complete flow state

    Returns:
        Created snapshot ID
    """
    try:
        from app.database import get_session, FlowSnapshot
        from app.services.juce_engine_service import get_audio_engine
        from app.routes.plugins import _discovered_plugins

        async with get_session() as session:
            # Check for duplicate program number
            if request.program_number is not None:
                if request.program_number < 0 or request.program_number > 127:
                    raise HTTPException(
                        status_code=400,
                        detail="Program number must be 0-127"
                    )
                existing = await session.execute(
                    select(FlowSnapshot).filter(
                        FlowSnapshot.program_number == request.program_number
                    )
                )
                if existing.scalar_one_or_none():
                    raise HTTPException(
                        status_code=400,
                        detail=f"Program number {request.program_number} already mapped"
                    )

            # Enrich snapshot data with current parameter values from engine
            snapshot_data = request.snapshot_data.model_dump()

            # Debug: log incoming snapshot data
            flow_slots = snapshot_data.get("flowSlots", [])
            print(f"[Snapshot Create] Received {len(flow_slots)} flow slots", flush=True)
            for i, slot in enumerate(flow_slots):
                print(f"  Flow {i}: label={slot.get('label')}, chainId={slot.get('chainId')}, id={slot.get('id')}", flush=True)

            engine = get_audio_engine()

            if engine.is_available and engine.is_running:
                for chain_id, chain_data in snapshot_data.get("chains", {}).items():
                    for plugin in chain_data.get("plugins", []):
                        plugin_uri = plugin.get("uri", "")
                        if plugin_uri:
                            # Get parameter metadata for this plugin
                            plugin_info = next(
                                (p for p in _discovered_plugins if p["uri"] == plugin_uri),
                                None
                            )
                            if plugin_info:
                                param_values = {}
                                for idx, param in enumerate(plugin_info.get("parameters", [])):
                                    symbol = param.get("symbol", "")
                                    if symbol:
                                        try:
                                            value = await engine.get_parameter(plugin_uri, symbol)
                                            param_values[str(idx)] = value
                                        except Exception as e:
                                            logger.debug(f"Could not get param {symbol}: {e}")
                                plugin["parameters"] = param_values

            # Get next display order
            result = await session.execute(
                select(FlowSnapshot.display_order)
                .order_by(FlowSnapshot.display_order.desc())
                .limit(1)
            )
            max_order = result.scalar_one_or_none() or 0

            snapshot = FlowSnapshot(
                name=request.name,
                description=request.description,
                tags=request.tags,
                program_number=request.program_number,
                snapshot_data=json.dumps(snapshot_data),
                display_order=max_order + 1,
            )
            session.add(snapshot)
            await session.flush()

            logger.info(f"Created flow snapshot '{request.name}' (id={snapshot.id})")

            return {
                "status": "success",
                "snapshot_id": snapshot.id,
                "message": f"Created snapshot: {request.name}",
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating flow snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{snapshot_id}")
async def update_snapshot(
    snapshot_id: int,
    request: UpdateSnapshotRequest
) -> Dict[str, Any]:
    """
    Update snapshot metadata

    Path parameters:
    - snapshot_id: Snapshot ID

    Request body:
    - name: New name (optional)
    - description: New description (optional)
    - tags: New tags (optional)
    - display_order: New order (optional)
    - is_favorite: New favorite status (optional)

    Returns:
        Success status
    """
    try:
        from app.database import get_session, FlowSnapshot

        async with get_session() as session:
            result = await session.execute(
                select(FlowSnapshot).filter(FlowSnapshot.id == snapshot_id)
            )
            snapshot = result.scalar_one_or_none()

            if not snapshot:
                raise HTTPException(status_code=404, detail="Snapshot not found")

            if request.name is not None:
                snapshot.name = request.name
            if request.description is not None:
                snapshot.description = request.description
            if request.tags is not None:
                snapshot.tags = request.tags
            if request.display_order is not None:
                snapshot.display_order = request.display_order
            if request.is_favorite is not None:
                snapshot.is_favorite = request.is_favorite

            snapshot.updated_at = datetime.utcnow()

            return {"status": "success", "message": f"Updated snapshot {snapshot_id}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating flow snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{snapshot_id}")
async def delete_snapshot(snapshot_id: int) -> Dict[str, Any]:
    """
    Delete a flow snapshot

    Path parameters:
    - snapshot_id: Snapshot ID

    Returns:
        Success status
    """
    try:
        from app.database import get_session, FlowSnapshot

        async with get_session() as session:
            result = await session.execute(
                select(FlowSnapshot).filter(FlowSnapshot.id == snapshot_id)
            )
            snapshot = result.scalar_one_or_none()

            if not snapshot:
                raise HTTPException(status_code=404, detail="Snapshot not found")

            await session.delete(snapshot)

            logger.info(f"Deleted flow snapshot {snapshot_id}")

            return {"status": "success", "message": f"Deleted snapshot {snapshot_id}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting flow snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{snapshot_id}/load")
async def load_snapshot(snapshot_id: int) -> Dict[str, Any]:
    """
    Load/activate a snapshot.
    Applies plugin parameters and bypass states to the engine.
    Returns the full snapshot data for the frontend to apply UI state.

    Path parameters:
    - snapshot_id: Snapshot ID

    Returns:
        Snapshot data for frontend to apply
    """
    try:
        from app.database import get_session, FlowSnapshot
        from app.services.websocket_manager import ws_manager
        from app.services.juce_engine_service import get_audio_engine
        from app.routes.plugins import _discovered_plugins

        async with get_session() as session:
            # Clear existing active snapshot
            await session.execute(
                update(FlowSnapshot).values(is_active=False)
            )

            # Get and activate requested snapshot
            result = await session.execute(
                select(FlowSnapshot).filter(FlowSnapshot.id == snapshot_id)
            )
            snapshot = result.scalar_one_or_none()

            if not snapshot:
                raise HTTPException(status_code=404, detail="Snapshot not found")

            snapshot.is_active = True
            snapshot_data = json.loads(snapshot.snapshot_data)

            # Debug: log loaded snapshot data
            flow_slots = snapshot_data.get("flowSlots", [])
            print(f"[Snapshot Load] Loaded {len(flow_slots)} flow slots from snapshot '{snapshot.name}'", flush=True)
            for i, slot in enumerate(flow_slots):
                print(f"  Flow {i}: label={slot.get('label')}, chainId={slot.get('chainId')}, id={slot.get('id')}", flush=True)

            # Recreate missing chains from snapshot data
            from app.services.chain_service import ChainService
            chain_service = ChainService(session)

            # Get existing chains
            existing_chains = await chain_service.list_chains()
            existing_chain_ids = {c["id"] for c in existing_chains}
            print(f"[Snapshot Load] Existing chain IDs: {existing_chain_ids}", flush=True)

            # Build mapping of old chain IDs to new chain IDs
            chain_id_mapping: Dict[int, int] = {}
            chains_created = 0

            # Process chains from snapshot
            snapshot_chains = snapshot_data.get("chains", {})
            for old_chain_id_str, chain_data in snapshot_chains.items():
                old_chain_id = int(old_chain_id_str)

                if old_chain_id in existing_chain_ids:
                    # Chain exists, use same ID
                    chain_id_mapping[old_chain_id] = old_chain_id
                    print(f"[Snapshot Load] Chain {old_chain_id} exists, keeping", flush=True)
                else:
                    # Chain doesn't exist, create it
                    chain_name = chain_data.get("name", f"Chain {old_chain_id}")
                    print(f"[Snapshot Load] Creating missing chain: {chain_name}", flush=True)

                    new_chain = await chain_service.create_chain(chain_name)
                    if new_chain:
                        new_chain_id = new_chain["id"]
                        chain_id_mapping[old_chain_id] = new_chain_id
                        chains_created += 1
                        print(f"[Snapshot Load] Created chain {new_chain_id} (was {old_chain_id})", flush=True)

                        # Add plugins to the new chain
                        for plugin in chain_data.get("plugins", []):
                            plugin_uri = plugin.get("uri")
                            if plugin_uri:
                                await chain_service.add_plugin_to_chain(new_chain_id, plugin_uri)
                                print(f"[Snapshot Load] Added plugin {plugin_uri} to chain {new_chain_id}", flush=True)
                    else:
                        print(f"[Snapshot Load] Failed to create chain {chain_name}", flush=True)

            # Update flowSlots with new chain IDs
            for slot in flow_slots:
                old_id = slot.get("chainId")
                if old_id is not None and old_id in chain_id_mapping:
                    new_id = chain_id_mapping[old_id]
                    if new_id != old_id:
                        print(f"[Snapshot Load] Remapping flow {slot.get('label')} chainId: {old_id} -> {new_id}", flush=True)
                        slot["chainId"] = new_id

            print(f"[Snapshot Load] Created {chains_created} missing chains", flush=True)

            # Apply plugin parameters and bypass states to the engine
            engine = get_audio_engine()
            params_applied = 0
            bypass_applied = 0

            if engine.is_available and engine.is_running:
                for chain_id, chain_data in snapshot_data.get("chains", {}).items():
                    for plugin in chain_data.get("plugins", []):
                        plugin_uri = plugin.get("uri", "")
                        if not plugin_uri:
                            continue

                        # Apply bypass state
                        bypass = plugin.get("bypass", False)
                        try:
                            instance_id = engine._get_instance_id_for_uri(plugin_uri)
                            if instance_id is not None:
                                await engine.set_bypass(instance_id, bypass)
                                bypass_applied += 1
                        except Exception as e:
                            logger.debug(f"Could not set bypass for {plugin_uri}: {e}")

                        # Apply parameters
                        params = plugin.get("parameters", {})
                        if params:
                            # Get parameter metadata to map index -> symbol
                            plugin_info = next(
                                (p for p in _discovered_plugins if p["uri"] == plugin_uri),
                                None
                            )
                            if plugin_info:
                                param_list = plugin_info.get("parameters", [])
                                for idx_str, value in params.items():
                                    try:
                                        idx = int(idx_str)
                                        if idx < len(param_list):
                                            symbol = param_list[idx].get("symbol", "")
                                            if symbol:
                                                await engine.set_parameter(plugin_uri, symbol, value)
                                                params_applied += 1
                                    except (ValueError, IndexError, Exception) as e:
                                        logger.debug(f"Could not set param {idx_str}: {e}")

            logger.info(
                f"Loaded flow snapshot '{snapshot.name}' (id={snapshot_id}), "
                f"applied {params_applied} params, {bypass_applied} bypass states"
            )

            # Broadcast WebSocket event for real-time sync
            await ws_manager.broadcast_json({
                "type": "flow_snapshot_loaded",
                "topic": "flow_snapshots",
                "data": {
                    "snapshot_id": snapshot_id,
                    "snapshot_name": snapshot.name,
                    "snapshot_data": snapshot_data,
                },
                "timestamp": datetime.utcnow().isoformat(),
            }, topic="flow_snapshots")

            return {
                "status": "success",
                "snapshot_id": snapshot_id,
                "name": snapshot.name,
                "snapshot_data": snapshot_data,
                "params_applied": params_applied,
                "bypass_applied": bypass_applied,
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading flow snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{snapshot_id}/program")
async def set_program_number(
    snapshot_id: int,
    request: SetProgramNumberRequest
) -> Dict[str, Any]:
    """
    Set or clear MIDI program number for a snapshot

    Path parameters:
    - snapshot_id: Snapshot ID

    Request body:
    - program_number: MIDI PC 0-127, or null to clear

    Returns:
        Updated program number
    """
    try:
        from app.database import get_session, FlowSnapshot

        async with get_session() as session:
            # Validate program number
            if request.program_number is not None:
                if request.program_number < 0 or request.program_number > 127:
                    raise HTTPException(
                        status_code=400,
                        detail="Program number must be 0-127"
                    )

                # Check for duplicate program number
                existing = await session.execute(
                    select(FlowSnapshot).filter(
                        FlowSnapshot.program_number == request.program_number,
                        FlowSnapshot.id != snapshot_id
                    )
                )
                if existing.scalar_one_or_none():
                    raise HTTPException(
                        status_code=400,
                        detail=f"Program number {request.program_number} already mapped to another snapshot"
                    )

            result = await session.execute(
                select(FlowSnapshot).filter(FlowSnapshot.id == snapshot_id)
            )
            snapshot = result.scalar_one_or_none()

            if not snapshot:
                raise HTTPException(status_code=404, detail="Snapshot not found")

            snapshot.program_number = request.program_number
            snapshot.updated_at = datetime.utcnow()

            return {
                "status": "success",
                "snapshot_id": snapshot_id,
                "program_number": request.program_number,
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting program number: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{snapshot_id}/duplicate")
async def duplicate_snapshot(snapshot_id: int) -> Dict[str, Any]:
    """
    Create a copy of a snapshot

    Path parameters:
    - snapshot_id: Snapshot ID to duplicate

    Returns:
        New snapshot ID
    """
    try:
        from app.database import get_session, FlowSnapshot

        async with get_session() as session:
            result = await session.execute(
                select(FlowSnapshot).filter(FlowSnapshot.id == snapshot_id)
            )
            original = result.scalar_one_or_none()

            if not original:
                raise HTTPException(status_code=404, detail="Snapshot not found")

            # Get next display order
            order_result = await session.execute(
                select(FlowSnapshot.display_order)
                .order_by(FlowSnapshot.display_order.desc())
                .limit(1)
            )
            max_order = order_result.scalar_one_or_none() or 0

            duplicate = FlowSnapshot(
                name=f"{original.name} (Copy)",
                description=original.description,
                tags=original.tags.copy() if original.tags else [],
                program_number=None,  # Don't copy MIDI mapping
                snapshot_data=original.snapshot_data,
                display_order=max_order + 1,
                is_favorite=False,
            )
            session.add(duplicate)
            await session.flush()

            logger.info(f"Duplicated flow snapshot {snapshot_id} -> {duplicate.id}")

            return {
                "status": "success",
                "snapshot_id": duplicate.id,
                "message": f"Created copy: {duplicate.name}",
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error duplicating flow snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reorder")
async def reorder_snapshots(snapshot_ids: List[int]) -> Dict[str, Any]:
    """
    Reorder snapshots by providing ordered list of IDs

    Request body:
    - List of snapshot IDs in desired order

    Returns:
        Success status
    """
    try:
        from app.database import get_session, FlowSnapshot

        async with get_session() as session:
            for order, sid in enumerate(snapshot_ids):
                await session.execute(
                    update(FlowSnapshot)
                    .where(FlowSnapshot.id == sid)
                    .values(display_order=order)
                )

            return {"status": "success", "message": "Reordered snapshots"}

    except Exception as e:
        logger.error(f"Error reordering flow snapshots: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/by-program/{program_number}")
async def get_snapshot_by_program(program_number: int) -> Dict[str, Any]:
    """
    Get snapshot by MIDI program number

    Path parameters:
    - program_number: MIDI PC number 0-127

    Returns:
        Snapshot ID and name
    """
    try:
        from app.database import get_session, FlowSnapshot

        if program_number < 0 or program_number > 127:
            raise HTTPException(
                status_code=400,
                detail="Program number must be 0-127"
            )

        async with get_session() as session:
            result = await session.execute(
                select(FlowSnapshot).filter(
                    FlowSnapshot.program_number == program_number
                )
            )
            snapshot = result.scalar_one_or_none()

            if not snapshot:
                raise HTTPException(
                    status_code=404,
                    detail=f"No snapshot mapped to PC#{program_number}"
                )

            return {
                "id": snapshot.id,
                "name": snapshot.name,
                "program_number": snapshot.program_number,
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting snapshot by program: {e}")
        raise HTTPException(status_code=500, detail=str(e))
