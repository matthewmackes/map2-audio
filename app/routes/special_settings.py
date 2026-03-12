"""
Special Settings API Routes

Manages special mode settings:
- Plugin visibility controls
- Advanced menu location
- Enable/disable special features

In standalone mode: Updates local database only
In cluster mode: Replicates via Raft consensus to all nodes
"""

import os
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session, SpecialSettings
from app.models import SpecialSettingsResponse, SpecialSettingsUpdateRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings/special", tags=["special"])

# Detect if running in cluster mode
CLUSTER_MODE = os.getenv("CLUSTER_MODE", "disabled").lower() == "enabled"
DEFAULT_PINNED_ROUTES: list[str] = []


def _normalize_pinned_routes(routes: Optional[list]) -> list[str]:
    if not routes:
        return []

    normalized: list[str] = []
    seen: set[str] = set()

    for raw_route in routes:
        if not isinstance(raw_route, str):
            continue

        route = raw_route.strip()
        if not route or not route.startswith("/"):
            continue

        if route in seen:
            continue

        seen.add(route)
        normalized.append(route)

    return normalized


def _normalize_last_active_node(node_id: Optional[str]) -> Optional[str]:
    if node_id is None:
        return None
    if not isinstance(node_id, str):
        return None

    normalized = node_id.strip()
    if not normalized or normalized.lower() in {"null", "local"}:
        return None

    return normalized


def _resolve_pinned_routes_from_settings(settings) -> list[str]:
    raw_routes = getattr(settings, "pinned_routes", None)
    if raw_routes is None:
        raw_routes = getattr(settings, "promoted_advanced_routes", DEFAULT_PINNED_ROUTES)
    return _normalize_pinned_routes(raw_routes)


async def get_special_settings_db(session: AsyncSession) -> Optional[SpecialSettings]:
    """Get special settings from database (or None if not created)."""
    result = await session.execute(
        select(SpecialSettings).where(SpecialSettings.id == 1)
    )
    return result.scalar_one_or_none()


async def create_default_special_settings(session: AsyncSession) -> SpecialSettings:
    """Create default special settings entry."""
    settings = SpecialSettings(
        id=1,
        enabled=False,
        hidden_plugins=[],
        menu_location="top-nav",
        pinned_routes=DEFAULT_PINNED_ROUTES.copy(),
        last_active_node=None,
        version=1,
        last_updated=datetime.now(timezone.utc),
        updated_by_node=None
    )
    session.add(settings)
    await session.flush()
    return settings


def _get_raft_consensus():
    """Get Raft consensus instance (lazy import to avoid circular deps)."""
    try:
        from app.services.cluster.raft_consensus import get_raft_consensus
        return get_raft_consensus()
    except Exception as e:
        logger.debug(f"Raft consensus not available: {e}")
        return None


@router.get("/", response_model=SpecialSettingsResponse)
async def get_special_settings():
    """
    Get current special settings.
    
    Returns the latest committed state from local database.
    In cluster mode, this reflects the consensus state.
    """
    try:
        async with get_session() as session:
            settings = await get_special_settings_db(session)
            
            if not settings:
                # Create default if doesn't exist
                settings = await create_default_special_settings(session)
            
            return SpecialSettingsResponse(
                enabled=settings.enabled,
                hidden_plugins=settings.hidden_plugins or [],
                menu_location=settings.menu_location,
                pinned_routes=_resolve_pinned_routes_from_settings(settings),
                last_active_node=_normalize_last_active_node(getattr(settings, "last_active_node", None)),
                version=settings.version,
                last_updated=settings.last_updated.isoformat() if settings.last_updated else None,
                updated_by_node=settings.updated_by_node
            )
    
    except Exception as e:
        logger.error(f"Failed to get special settings: {e}")
        raise HTTPException(500, f"Failed to get settings: {e}")


@router.post("/", response_model=SpecialSettingsResponse)
async def update_special_settings(request: SpecialSettingsUpdateRequest):
    """
    Update special settings.

    STANDALONE MODE: Updates local database only
    CLUSTER MODE: Replicates via Raft consensus to all nodes
    
    Args:
        request: Settings update with enabled, hidden_plugins, menu_location
    
    Returns:
        Updated settings or leader redirect (307) in cluster mode
    """
    node_id = os.getenv("NODE_ID", "standalone")
    
    if CLUSTER_MODE:
        # CLUSTER MODE: Try Raft replication
        raft = _get_raft_consensus()
        
        if raft:
            # Check if leader
            if not raft.is_leader():
                # Not leader - redirect to leader
                leader_id = getattr(raft, 'leader_id', None)
                if leader_id and hasattr(raft, 'cluster_nodes'):
                    leader_url = raft.cluster_nodes.get(leader_id)
                    if leader_url:
                        logger.info(f"Redirecting settings update to leader: {leader_url}")
                        raise HTTPException(
                            status_code=307,
                            headers={"Location": f"{leader_url}/api/settings/special"}
                        )
                
                # No leader available - return error
                raise HTTPException(
                    status_code=503,
                    detail="No cluster leader available. Cluster may be partitioned."
                )
            
            # Leader: Replicate via Raft
            try:
                from app.services.special_settings_raft import replicate_special_settings_to_raft
                
                async with get_session() as session:
                    log_index = await replicate_special_settings_to_raft(
                        raft_consensus=raft,
                        session_factory=get_session,
                        enabled=request.enabled,
                        hidden_plugins=request.hidden_plugins,
                        menu_location=request.menu_location,
                        pinned_routes=_normalize_pinned_routes(request.pinned_routes),
                        last_active_node=_normalize_last_active_node(request.last_active_node),
                        node_id=node_id
                    )
                    
                    # Get updated settings
                    settings = await get_special_settings_db(session)
                    
                    return SpecialSettingsResponse(
                        enabled=settings.enabled,
                        hidden_plugins=settings.hidden_plugins or [],
                        menu_location=settings.menu_location,
                        pinned_routes=_resolve_pinned_routes_from_settings(settings),
                        last_active_node=_normalize_last_active_node(getattr(settings, "last_active_node", None)),
                        version=settings.version,
                        last_updated=settings.last_updated.isoformat(),
                        updated_by_node=settings.updated_by_node
                    )
            
            except asyncio.TimeoutError:
                logger.warning("Settings replication timed out - may still succeed")
                # Even if timeout, the entry may be committed. Return partial success.
                async with get_session() as session:
                    settings = await get_special_settings_db(session)
                    if settings:
                        return SpecialSettingsResponse(
                            enabled=settings.enabled,
                            hidden_plugins=settings.hidden_plugins or [],
                            menu_location=settings.menu_location,
                            pinned_routes=_resolve_pinned_routes_from_settings(settings),
                            last_active_node=_normalize_last_active_node(getattr(settings, "last_active_node", None)),
                            version=settings.version,
                            last_updated=settings.last_updated.isoformat(),
                            updated_by_node=settings.updated_by_node
                        )
                raise HTTPException(
                    status_code=504,
                    detail="Settings replication timeout - cluster may be slow"
                )
            except Exception as e:
                logger.error(f"Raft replication failed: {e}")
                raise HTTPException(500, f"Replication error: {e}")
        else:
            logger.warning("Cluster mode configured but Raft not available - falling back to standalone")
    
    # STANDALONE MODE: Update local database only
    try:
        async with get_session() as session:
            settings = await get_special_settings_db(session)
            
            if not settings:
                settings = await create_default_special_settings(session)
            
            # Update settings
            settings.enabled = request.enabled
            settings.hidden_plugins = request.hidden_plugins
            settings.menu_location = request.menu_location
            settings.pinned_routes = _normalize_pinned_routes(request.pinned_routes)
            settings.last_active_node = _normalize_last_active_node(request.last_active_node)
            settings.version += 1
            settings.last_updated = datetime.now(timezone.utc)
            settings.updated_by_node = node_id
            
            await session.flush()
            
            logger.info(
                f"Special settings updated (standalone): enabled={settings.enabled}, "
                f"hidden_plugins={len(settings.hidden_plugins)}, "
                f"menu_location={settings.menu_location}, "
                f"pinned_routes={len(settings.pinned_routes or [])}, "
                f"last_active_node={settings.last_active_node}"
            )
            
            return SpecialSettingsResponse(
                enabled=settings.enabled,
                hidden_plugins=settings.hidden_plugins or [],
                menu_location=settings.menu_location,
                pinned_routes=_resolve_pinned_routes_from_settings(settings),
                last_active_node=_normalize_last_active_node(getattr(settings, "last_active_node", None)),
                version=settings.version,
                last_updated=settings.last_updated.isoformat(),
                updated_by_node=settings.updated_by_node
            )
    
    except Exception as e:
        logger.error(f"Failed to update special settings: {e}")
        raise HTTPException(500, f"Failed to update settings: {e}")


@router.delete("/")
async def reset_special_settings():
    """
    Reset special settings to defaults.
    
    Disables special mode and clears all hidden plugins.
    """
    try:
        async with get_session() as session:
            settings = await get_special_settings_db(session)
            
            if settings:
                settings.enabled = False
                settings.hidden_plugins = []
                settings.menu_location = "top-nav"
                settings.pinned_routes = DEFAULT_PINNED_ROUTES.copy()
                settings.last_active_node = None
                settings.version += 1
                settings.last_updated = datetime.now(timezone.utc)
                
                await session.flush()
                logger.info("Special settings reset to defaults")
            
            return {"status": "reset", "message": "Special settings reset to defaults"}
    
    except Exception as e:
        logger.error(f"Failed to reset special settings: {e}")
        raise HTTPException(500, f"Failed to reset settings: {e}")


@router.post("/sync")
async def receive_special_settings_sync(data: dict):
    """
    Receive special settings sync from leader node.
    
    Called on follower nodes during cluster join or resync.
    Used to synchronize settings across cluster.
    
    Args:
        data: Special settings data from leader
    
    Returns:
        Status of sync operation
    """
    try:
        from app.services.special_settings_node_sync import handle_special_settings_sync
        
        success = await handle_special_settings_sync(data)
        
        if success:
            return {
                "status": "synced",
                "message": "Special settings synchronized",
                "version": data.get("version")
            }
        else:
            raise HTTPException(500, "Failed to apply synced settings")
    
    except Exception as e:
        logger.error(f"Failed to receive special settings sync: {e}")
        raise HTTPException(500, f"Sync failed: {e}")
