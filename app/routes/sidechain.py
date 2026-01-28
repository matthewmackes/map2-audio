"""
Sidechain Routing API Routes
Manage sidechain connections between plugins
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid

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


# In-memory storage for sidechain connections (would be persisted in real app)
_sidechain_connections: dict[str, SidechainConnection] = {}


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
            _sidechain_connections[conn_id] = connection

        return connections
    except Exception as e:
        # Return cached connections if engine call fails
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

        _sidechain_connections[conn_id] = connection
        return connection

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sidechain/{connection_id}")
async def delete_sidechain_connection(connection_id: str):
    """Delete a sidechain connection"""
    try:
        if connection_id not in _sidechain_connections:
            raise HTTPException(status_code=404, detail="Connection not found")

        conn = _sidechain_connections[connection_id]

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

        del _sidechain_connections[connection_id]

        return {"success": True, "message": "Connection deleted"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sidechain/{connection_id}/toggle")
async def toggle_sidechain_connection(connection_id: str, request: ToggleSidechainRequest):
    """Toggle a sidechain connection active state"""
    try:
        if connection_id not in _sidechain_connections:
            raise HTTPException(status_code=404, detail="Connection not found")

        conn = _sidechain_connections[connection_id]

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
        _sidechain_connections[connection_id] = conn

        return {"success": True, "active": request.active}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
