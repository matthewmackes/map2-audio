"""
Special Settings Raft Integration

Handles Raft-based replication of special mode settings across cluster.
Integrates with the existing Raft consensus system to ensure all nodes
have synchronized special settings.
"""

import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import SpecialSettings
from app.services.special_settings_normalization import (
    DEFAULT_LANDING_TILES,
    DEFAULT_MENU_LOCATION,
    DEFAULT_PINNED_ROUTES,
    DEFAULT_SNAPSHOT_EDITOR_FLOW_ANIMATION,
    DEFAULT_SNAPSHOT_EDITOR_GRID_BACKDROP,
    DEFAULT_SNAPSHOT_EDITOR_NODE_SHAPE,
    DEFAULT_SNAPSHOT_SETLIST_MODE,
    DEFAULT_SNAPSHOT_SETLIST_ORDER,
    normalize_landing_tiles,
    normalize_last_active_node,
    normalize_menu_location,
    normalize_pinned_routes,
    normalize_snapshot_editor_flow_animation,
    normalize_snapshot_editor_grid_backdrop,
    normalize_snapshot_editor_node_shape,
    normalize_snapshot_setlist_mode,
    normalize_snapshot_setlist_order,
    resolve_landing_tiles_from_settings,
    resolve_pinned_routes_from_settings,
    resolve_snapshot_editor_flow_animation_from_settings,
    resolve_snapshot_editor_grid_backdrop_from_settings,
    resolve_snapshot_editor_node_shape_from_settings,
    resolve_snapshot_setlist_mode_from_settings,
    resolve_snapshot_setlist_order_from_settings,
)

logger = logging.getLogger(__name__)

_normalize_pinned_routes = normalize_pinned_routes
_normalize_landing_tiles = normalize_landing_tiles
_resolve_pinned_routes = resolve_pinned_routes_from_settings
_resolve_landing_tiles = resolve_landing_tiles_from_settings
_normalize_last_active_node = normalize_last_active_node
_normalize_menu_location = normalize_menu_location
_normalize_snapshot_editor_flow_animation = normalize_snapshot_editor_flow_animation
_normalize_snapshot_editor_grid_backdrop = normalize_snapshot_editor_grid_backdrop
_normalize_snapshot_editor_node_shape = normalize_snapshot_editor_node_shape
_normalize_snapshot_setlist_mode = normalize_snapshot_setlist_mode
_normalize_snapshot_setlist_order = normalize_snapshot_setlist_order
_resolve_snapshot_editor_flow_animation = resolve_snapshot_editor_flow_animation_from_settings
_resolve_snapshot_editor_grid_backdrop = resolve_snapshot_editor_grid_backdrop_from_settings
_resolve_snapshot_editor_node_shape = resolve_snapshot_editor_node_shape_from_settings
_resolve_snapshot_setlist_mode = resolve_snapshot_setlist_mode_from_settings
_resolve_snapshot_setlist_order = resolve_snapshot_setlist_order_from_settings


class SpecialSettingsStateManager:
    """
    Manages special settings state machine for Raft consensus.
    Applies committed log entries to local database.
    """

    def __init__(self, session_factory):
        """Initialize with async session factory."""
        self.session_factory = session_factory
        self.logger = logging.getLogger("SpecialSettingsStateManager")

    async def apply_entry(self, entry_data: dict) -> bool:
        """
        Apply special settings log entry to local state.
        
        Called when Raft log entry is committed.
        Entry data should contain:
        - enabled: bool
        - hidden_plugins: List[str]
        - menu_location: str
        - pinned_routes: List[str]
        - landing_tiles: List[Dict[str, str]]
        - updated_by_node: str
        - timestamp: str (ISO format)
        - version: int
        """
        try:
            async with self.session_factory() as session:
                # Get current settings or create default
                result = await session.execute(
                    select(SpecialSettings).where(SpecialSettings.id == 1)
                )
                settings = result.scalar_one_or_none()
                
                if not settings:
                    settings = SpecialSettings(
                        id=1,
                        enabled=False,
                        hidden_plugins=[],
                        menu_location=DEFAULT_MENU_LOCATION,
                        pinned_routes=DEFAULT_PINNED_ROUTES.copy(),
                        landing_tiles=DEFAULT_LANDING_TILES.copy(),
                        snapshot_setlist_mode=DEFAULT_SNAPSHOT_SETLIST_MODE,
                        snapshot_setlist_order=DEFAULT_SNAPSHOT_SETLIST_ORDER.copy(),
                        snapshot_editor_flow_animation=DEFAULT_SNAPSHOT_EDITOR_FLOW_ANIMATION,
                        snapshot_editor_grid_backdrop=DEFAULT_SNAPSHOT_EDITOR_GRID_BACKDROP,
                        snapshot_editor_node_shape=DEFAULT_SNAPSHOT_EDITOR_NODE_SHAPE,
                        last_active_node=None,
                        version=1
                    )
                    session.add(settings)
                
                # Update settings from log entry
                settings.enabled = entry_data.get("enabled", False)
                settings.hidden_plugins = entry_data.get("hidden_plugins", [])
                settings.menu_location = _normalize_menu_location(entry_data.get("menu_location"))
                settings.pinned_routes = _normalize_pinned_routes(
                    entry_data.get(
                        "pinned_routes",
                        entry_data.get(
                            "promoted_advanced_routes",
                            _resolve_pinned_routes(settings),
                        ),
                    )
                )
                settings.landing_tiles = _normalize_landing_tiles(
                    entry_data.get("landing_tiles", _resolve_landing_tiles(settings))
                )
                settings.snapshot_setlist_mode = _normalize_snapshot_setlist_mode(
                    entry_data.get("snapshot_setlist_mode", _resolve_snapshot_setlist_mode(settings))
                )
                settings.snapshot_setlist_order = _normalize_snapshot_setlist_order(
                    entry_data.get("snapshot_setlist_order", _resolve_snapshot_setlist_order(settings))
                )
                settings.snapshot_editor_flow_animation = _normalize_snapshot_editor_flow_animation(
                    entry_data.get("snapshot_editor.flow_animation", entry_data.get("snapshot_editor_flow_animation", _resolve_snapshot_editor_flow_animation(settings)))
                )
                settings.snapshot_editor_grid_backdrop = _normalize_snapshot_editor_grid_backdrop(
                    entry_data.get("snapshot_editor.grid_backdrop", entry_data.get("snapshot_editor_grid_backdrop", _resolve_snapshot_editor_grid_backdrop(settings)))
                )
                settings.snapshot_editor_node_shape = _normalize_snapshot_editor_node_shape(
                    entry_data.get("snapshot_editor.node_shape", entry_data.get("snapshot_editor_node_shape", _resolve_snapshot_editor_node_shape(settings)))
                )
                settings.last_active_node = _normalize_last_active_node(
                    entry_data.get("last_active_node")
                )
                settings.version = entry_data.get("version", settings.version)
                settings.updated_by_node = entry_data.get("updated_by_node")
                settings.last_updated = datetime.now(timezone.utc)
                
                await session.flush()
                
                self.logger.info(
                    f"Applied special settings: enabled={settings.enabled}, "
                    f"hidden={len(settings.hidden_plugins)}, "
                    f"location={settings.menu_location}, "
                    f"pinned={len(settings.pinned_routes or [])}, "
                    f"landing_tiles={len(settings.landing_tiles or [])}, "
                    f"snapshot_setlist_mode={settings.snapshot_setlist_mode}, "
                    f"snapshot_setlist_order={len(settings.snapshot_setlist_order or [])}, "
                    f"snapshot_editor_flow_animation={settings.snapshot_editor_flow_animation}, "
                    f"snapshot_editor_grid_backdrop={settings.snapshot_editor_grid_backdrop}, "
                    f"snapshot_editor_node_shape={settings.snapshot_editor_node_shape}, "
                    f"last_active_node={settings.last_active_node}, "
                    f"version={settings.version}"
                )
                return True
                
        except Exception as e:
            self.logger.error(f"Failed to apply special settings entry: {e}")
            return False

    async def get_current_state(self) -> Optional[dict]:
        """Get current special settings as dict for state sync."""
        try:
            async with self.session_factory() as session:
                result = await session.execute(
                    select(SpecialSettings).where(SpecialSettings.id == 1)
                )
                settings = result.scalar_one_or_none()
                
                if not settings:
                    return None
                
                return {
                    "enabled": settings.enabled,
                    "hidden_plugins": settings.hidden_plugins or [],
                    "menu_location": _normalize_menu_location(settings.menu_location),
                    "pinned_routes": _resolve_pinned_routes(settings),
                    "landing_tiles": _resolve_landing_tiles(settings),
                    "snapshot_setlist_mode": _resolve_snapshot_setlist_mode(settings),
                    "snapshot_setlist_order": _resolve_snapshot_setlist_order(settings),
                    "snapshot_editor.flow_animation": _resolve_snapshot_editor_flow_animation(settings),
                    "snapshot_editor.grid_backdrop": _resolve_snapshot_editor_grid_backdrop(settings),
                    "snapshot_editor.node_shape": _resolve_snapshot_editor_node_shape(settings),
                    "last_active_node": _normalize_last_active_node(getattr(settings, "last_active_node", None)),
                    "version": settings.version,
                    "updated_by_node": settings.updated_by_node,
                    "timestamp": settings.last_updated.isoformat() if settings.last_updated else None,
                }
        except Exception as e:
            self.logger.error(f"Failed to get current special settings: {e}")
            return None


async def replicate_special_settings_to_raft(
    raft_consensus,
    session_factory,
    enabled: bool,
    hidden_plugins: list,
    menu_location: str,
    pinned_routes: list,
    landing_tiles: list,
    snapshot_setlist_mode: bool,
    snapshot_setlist_order: list,
    snapshot_editor_flow_animation: str,
    snapshot_editor_grid_backdrop: bool,
    snapshot_editor_node_shape: str,
    last_active_node,
    node_id: str
) -> int:
    """
    Create Raft log entry for special settings change and replicate to followers.
    
    Only call from leader node.
    
    Returns:
        Log index of the entry (for tracking)
    """
    logger = logging.getLogger("SpecialSettingsRaft")
    
    try:
        # Get current version for incrementing
        async with session_factory() as session:
            result = await session.execute(
                select(SpecialSettings).where(SpecialSettings.id == 1)
            )
            current = result.scalar_one_or_none()
            version = (current.version if current else 0) + 1
        
        # Create log entry
        entry_data = {
            "enabled": enabled,
            "hidden_plugins": hidden_plugins,
            "menu_location": _normalize_menu_location(menu_location),
            "pinned_routes": _normalize_pinned_routes(pinned_routes),
            "landing_tiles": _normalize_landing_tiles(landing_tiles),
            "snapshot_setlist_mode": _normalize_snapshot_setlist_mode(snapshot_setlist_mode),
            "snapshot_setlist_order": _normalize_snapshot_setlist_order(snapshot_setlist_order),
            "snapshot_editor.flow_animation": _normalize_snapshot_editor_flow_animation(snapshot_editor_flow_animation),
            "snapshot_editor.grid_backdrop": _normalize_snapshot_editor_grid_backdrop(snapshot_editor_grid_backdrop),
            "snapshot_editor.node_shape": _normalize_snapshot_editor_node_shape(snapshot_editor_node_shape),
            "last_active_node": _normalize_last_active_node(last_active_node),
            "updated_by_node": node_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": version,
        }
        
        # Add to Raft log (this triggers replication to followers)
        # Note: This assumes raft_consensus has append_entry method
        log_index = await raft_consensus.append_entry(
            command="update_special_settings",
            data=entry_data
        )
        
        logger.info(
            f"Special settings replicated to Raft log at index {log_index}: "
            f"enabled={enabled}, hidden={len(hidden_plugins)}, "
            f"location={entry_data['menu_location']}, pinned={len(entry_data['pinned_routes'])}, "
            f"landing_tiles={len(entry_data['landing_tiles'])}, "
            f"snapshot_setlist_mode={entry_data['snapshot_setlist_mode']}, "
            f"snapshot_setlist_order={len(entry_data['snapshot_setlist_order'])}, "
            f"snapshot_editor_flow_animation={entry_data['snapshot_editor.flow_animation']}, "
            f"snapshot_editor_grid_backdrop={entry_data['snapshot_editor.grid_backdrop']}, "
            f"snapshot_editor_node_shape={entry_data['snapshot_editor.node_shape']}, "
            f"last_active_node={entry_data['last_active_node']}, version={version}"
        )
        
        # Wait for majority to acknowledge (with timeout)
        await asyncio.wait_for(
            raft_consensus.wait_for_commit(log_index),
            timeout=5.0
        )
        
        logger.info(f"Special settings committed at index {log_index}")
        return log_index
        
    except asyncio.TimeoutError:
        logger.warning("Special settings replication timed out (may still succeed)")
        raise
    except Exception as e:
        logger.error(f"Failed to replicate special settings: {e}")
        raise


async def get_leader_url(raft_consensus) -> Optional[str]:
    """Get the URL of the current Raft leader."""
    try:
        # This assumes raft_consensus stores leader_id and has cluster_nodes mapping
        if hasattr(raft_consensus, 'leader_id') and raft_consensus.leader_id:
            if hasattr(raft_consensus, 'cluster_nodes'):
                return raft_consensus.cluster_nodes.get(raft_consensus.leader_id)
    except Exception as e:
        logger.error(f"Failed to get leader URL: {e}")
    
    return None
