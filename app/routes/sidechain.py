"""
Sidechain Routing API Routes
Manage sidechain connections between plugins
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import json
import threading
from pathlib import Path

from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/routing", tags=["sidechain"])


class SidechainConnection(BaseModel):
    """Sidechain connection data"""
    id: str
    sourcePluginId: int
    sourcePluginName: str
    destPluginId: int
    destPluginName: str
    destBus: int
    active: bool


class SidechainCapablePlugin(BaseModel):
    """Plugin with sidechain capability"""
    instanceId: int
    name: str
    numSidechainBuses: int
    sidechainBusNames: List[str]
    canBeSidechainSource: bool


class CreateSidechainRequest(BaseModel):
    """Request to create a sidechain connection"""
    sourceId: int
    destId: int
    destBus: int = 1


class ToggleSidechainRequest(BaseModel):
    """Request to toggle a sidechain connection"""
    active: bool


# Sidechain cache persisted to disk for restart resilience.
_sidechain_connections: dict[str, SidechainConnection] = {}
_sidechain_lock = threading.RLock()
_sidechain_store_path = Path("/home/mm/map2-audio/.map2/sidechain_connections.json")


def _persist_sidechain_connections_to_disk() -> None:
    """Persist sidechain connections to disk (best effort)."""
    try:
        with _sidechain_lock:
            payload = [
                conn.model_dump()
                for conn in _sidechain_connections.values()
            ]
        _sidechain_store_path.parent.mkdir(parents=True, exist_ok=True)
        _sidechain_store_path.write_text(
            json.dumps(payload, indent=2),
            encoding="utf-8",
        )
    except Exception:
        # Persistence failures should not break routing API behavior.
        pass


def _load_sidechain_connections_from_disk() -> None:
    """Load persisted sidechain connections from disk."""
    global _sidechain_connections

    if not _sidechain_store_path.exists():
        return

    try:
        payload = json.loads(_sidechain_store_path.read_text(encoding="utf-8"))
        loaded: dict[str, SidechainConnection] = {}
        if isinstance(payload, list):
            for item in payload:
                if not isinstance(item, dict):
                    continue
                conn = SidechainConnection(**item)
                loaded[conn.id] = conn
        with _sidechain_lock:
            _sidechain_connections = loaded
    except Exception:
        # Keep default empty cache when file is malformed.
        with _sidechain_lock:
            _sidechain_connections = {}


@router.get("/sidechain", response_model=List[SidechainConnection])
async def get_sidechain_connections():
    """Get all sidechain connections"""
    try:
        service = get_audio_engine()

        # Get connections from engine
        engine_connections = await service.get_sidechain_connections()

        # Update our local cache
        connections = []
        for conn in engine_connections:
            conn_id = f"{conn['source_id']}_{conn['dest_id']}_{conn['dest_bus']}"
            connection = SidechainConnection(
                id=conn_id,
                sourcePluginId=conn["source_id"],
                sourcePluginName=conn.get("source_name", f"Plugin {conn['source_id']}"),
                destPluginId=conn["dest_id"],
                destPluginName=conn.get("dest_name", f"Plugin {conn['dest_id']}"),
                destBus=conn["dest_bus"],
                active=conn.get("active", True)
            )
            connections.append(connection)
            with _sidechain_lock:
                _sidechain_connections[conn_id] = connection

        _persist_sidechain_connections_to_disk()

        return connections
    except Exception as e:
        # Return cached connections if engine call fails
        with _sidechain_lock:
            return list(_sidechain_connections.values())


@router.get("/sidechain-plugins", response_model=List[SidechainCapablePlugin])
async def get_sidechain_capable_plugins():
    """Get all plugins capable of sidechain routing"""
    try:
        service = get_audio_engine()

        # Get loaded plugins
        plugins = await service.get_loaded_plugins()

        capable_plugins = []
        for plugin in plugins:
            capable_plugins.append(SidechainCapablePlugin(
                instanceId=plugin.get("instance_id", 0),
                name=plugin.get("name", "Unknown"),
                numSidechainBuses=plugin.get("sidechain_buses", 0),
                sidechainBusNames=plugin.get("sidechain_bus_names", []),
                canBeSidechainSource=plugin.get("audio_outputs", 0) > 0
            ))

        return capable_plugins
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sidechain", response_model=SidechainConnection)
async def create_sidechain_connection(request: CreateSidechainRequest):
    """Create a new sidechain connection"""
    try:
        service = get_audio_engine()

        # Create connection in engine
        result = await service.connect_sidechain(
            source_id=request.sourceId,
            dest_id=request.destId,
            dest_bus=request.destBus
        )

        if not result.get("success", False):
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Failed to create sidechain connection")
            )

        # Get plugin names
        source_name = result.get("source_name", f"Plugin {request.sourceId}")
        dest_name = result.get("dest_name", f"Plugin {request.destId}")

        conn_id = f"{request.sourceId}_{request.destId}_{request.destBus}"
        connection = SidechainConnection(
            id=conn_id,
            sourcePluginId=request.sourceId,
            sourcePluginName=source_name,
            destPluginId=request.destId,
            destPluginName=dest_name,
            destBus=request.destBus,
            active=True
        )

        with _sidechain_lock:
            _sidechain_connections[conn_id] = connection
        _persist_sidechain_connections_to_disk()
        return connection

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sidechain/{connection_id}")
async def delete_sidechain_connection(connection_id: str):
    """Delete a sidechain connection"""
    try:
        with _sidechain_lock:
            conn = _sidechain_connections.get(connection_id)
        if conn is None:
            raise HTTPException(status_code=404, detail="Connection not found")

        service = get_audio_engine()

        # Disconnect in engine
        result = await service.disconnect_sidechain(
            source_id=conn.sourcePluginId,
            dest_id=conn.destPluginId,
            dest_bus=conn.destBus
        )

        if not result.get("success", False):
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Failed to delete sidechain connection")
            )

        with _sidechain_lock:
            del _sidechain_connections[connection_id]
        _persist_sidechain_connections_to_disk()

        return {"success": True, "message": "Connection deleted"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sidechain/{connection_id}/toggle")
async def toggle_sidechain_connection(connection_id: str, request: ToggleSidechainRequest):
    """Toggle a sidechain connection active state"""
    try:
        with _sidechain_lock:
            conn = _sidechain_connections.get(connection_id)
        if conn is None:
            raise HTTPException(status_code=404, detail="Connection not found")

        service = get_audio_engine()

        if request.active:
            # Reconnect
            result = await service.connect_sidechain(
                source_id=conn.sourcePluginId,
                dest_id=conn.destPluginId,
                dest_bus=conn.destBus
            )
        else:
            # Disconnect
            result = await service.disconnect_sidechain(
                source_id=conn.sourcePluginId,
                dest_id=conn.destPluginId,
                dest_bus=conn.destBus
            )

        if not result.get("success", False):
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Failed to toggle sidechain connection")
            )

        # Update local state
        conn.active = request.active
        with _sidechain_lock:
            _sidechain_connections[connection_id] = conn
        _persist_sidechain_connections_to_disk()

        return {"success": True, "active": request.active}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


_load_sidechain_connections_from_disk()
