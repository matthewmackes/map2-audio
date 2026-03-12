"""
Special Settings Raft Integration

Handles Raft-based replication of special mode settings across cluster.
Integrates with the existing Raft consensus system to ensure all nodes
have synchronized special settings.
"""

import logging
import os
import asyncio
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import SpecialSettings

logger = logging.getLogger(__name__)
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
        if not route or not route.startswith("/") or route in seen:
            continue
        seen.add(route)
        normalized.append(route)

    return normalized


def _resolve_pinned_routes(raw_settings) -> list[str]:
    raw_routes = getattr(raw_settings, "pinned_routes", None)
    if raw_routes is None:
        raw_routes = getattr(raw_settings, "promoted_advanced_routes", DEFAULT_PINNED_ROUTES)
    return _normalize_pinned_routes(raw_routes)


def _normalize_last_active_node(node_id: Optional[str]) -> Optional[str]:
    if node_id is None:
        return None
    if not isinstance(node_id, str):
        return None

    normalized = node_id.strip()
    if not normalized or normalized.lower() in {"null", "local"}:
        return None

    return normalized


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
                        menu_location="top-nav",
                        pinned_routes=DEFAULT_PINNED_ROUTES.copy(),
                        last_active_node=None,
                        version=1
                    )
                    session.add(settings)
                
                # Update settings from log entry
                settings.enabled = entry_data.get("enabled", False)
                settings.hidden_plugins = entry_data.get("hidden_plugins", [])
                settings.menu_location = entry_data.get("menu_location", "top-nav")
                settings.pinned_routes = _normalize_pinned_routes(
                    entry_data.get(
                        "pinned_routes",
                        entry_data.get(
                            "promoted_advanced_routes",
                            _resolve_pinned_routes(settings),
                        ),
                    )
                )
                settings.last_active_node = _normalize_last_active_node(
                    entry_data.get("last_active_node")
                )
                settings.version = entry_data.get("version", settings.version)
                settings.updated_by_node = entry_data.get("updated_by_node")
                settings.last_updated = datetime.utcnow()
                
                await session.flush()
                
                self.logger.info(
                    f"Applied special settings: enabled={settings.enabled}, "
                    f"hidden={len(settings.hidden_plugins)}, "
                    f"location={settings.menu_location}, "
                    f"pinned={len(settings.pinned_routes or [])}, "
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
                    "menu_location": settings.menu_location,
                    "pinned_routes": _resolve_pinned_routes(settings),
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
    last_active_node: Optional[str],
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
            "menu_location": menu_location,
            "pinned_routes": _normalize_pinned_routes(pinned_routes),
            "last_active_node": _normalize_last_active_node(last_active_node),
            "updated_by_node": node_id,
            "timestamp": datetime.utcnow().isoformat(),
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
            f"location={menu_location}, pinned={len(entry_data['pinned_routes'])}, "
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
