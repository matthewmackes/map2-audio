"""
Plugin Preset Lifecycle Management - Handles plugin preset operations with lifecycle controls
Manages initialization, cleanup, and event handling for plugin presets.
"""

import logging
import json
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime
from app.database import PluginPreset, get_session

logger = logging.getLogger(__name__)


class PluginPresetLifecycle:
    """
    Manages the lifecycle of plugin presets including:
    - Initialization (loading default presets, caching)
    - Cleanup (archiving, deletion)
    - Event handling (on save, load, delete)
    - Usage tracking and optimization
    """

    def __init__(self):
        """Initialize the preset lifecycle manager."""
        self.listeners: Dict[str, List[Callable]] = {
            "preset_created": [],
            "preset_loaded": [],
            "preset_updated": [],
            "preset_deleted": [],
            "preset_favorite_toggled": [],
            "preset_set_default": [],
        }
        self._loaded_presets_cache: Dict[int, Dict[str, Any]] = {}
        self._plugin_default_presets: Dict[str, int] = {}  # plugin_uri -> preset_id

    def register_listener(self, event: str, callback: Callable) -> None:
        """
        Register a callback for a preset lifecycle event.

        Args:
            event: Event name (e.g., "preset_created", "preset_loaded")
            callback: Async callback function
        """
        if event not in self.listeners:
            self.listeners[event] = []
        self.listeners[event].append(callback)
        logger.debug(f"Registered listener for event: {event}")

    async def emit_event(self, event: str, data: Dict[str, Any]) -> None:
        """
        Emit a lifecycle event to all registered listeners.

        Args:
            event: Event name
            data: Event data
        """
        if event not in self.listeners:
            return

        for callback in self.listeners[event]:
            try:
                if hasattr(callback, "__await__"):
                    await callback(data)
                else:
                    callback(data)
            except Exception as e:
                logger.error(f"Error in {event} listener: {e}")

    async def on_preset_created(
        self, preset_id: int, name: str, plugin_uri: str, parameters: Dict[str, Any]
    ) -> None:
        """Handle preset creation event."""
        self._loaded_presets_cache[preset_id] = {
            "id": preset_id,
            "name": name,
            "plugin_uri": plugin_uri,
            "parameters": parameters,
            "created_at": datetime.utcnow().isoformat(),
        }
        await self.emit_event(
            "preset_created",
            {
                "preset_id": preset_id,
                "name": name,
                "plugin_uri": plugin_uri,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
        logger.info(f"Preset created: {name} (id={preset_id}) for {plugin_uri}")

    async def on_preset_loaded(self, preset_id: int) -> None:
        """Handle preset loaded event (increment usage, update cache)."""
        await self.emit_event(
            "preset_loaded",
            {
                "preset_id": preset_id,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
        logger.info(f"Preset loaded: {preset_id}")

    async def on_preset_deleted(self, preset_id: int, name: str) -> None:
        """Handle preset deletion event (cleanup cache, etc)."""
        if preset_id in self._loaded_presets_cache:
            del self._loaded_presets_cache[preset_id]

        await self.emit_event(
            "preset_deleted",
            {
                "preset_id": preset_id,
                "name": name,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
        logger.info(f"Preset deleted: {name} (id={preset_id})")

    async def on_preset_favorite_toggled(
        self, preset_id: int, is_favorite: bool
    ) -> None:
        """Handle favorite toggle event."""
        await self.emit_event(
            "preset_favorite_toggled",
            {
                "preset_id": preset_id,
                "is_favorite": is_favorite,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
        logger.info(f"Preset {preset_id} favorite toggled: {is_favorite}")

    async def on_preset_set_default(self, preset_id: int, plugin_uri: str) -> None:
        """Handle default preset setting event."""
        self._plugin_default_presets[plugin_uri] = preset_id
        await self.emit_event(
            "preset_set_default",
            {
                "preset_id": preset_id,
                "plugin_uri": plugin_uri,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
        logger.info(f"Preset {preset_id} set as default for {plugin_uri}")

    async def load_default_presets(self) -> Dict[str, int]:
        """
        Load all default presets for each plugin.

        Returns:
            Mapping of plugin_uri -> default_preset_id
        """
        try:
            from sqlalchemy import select

            async with get_session() as session:
                result = await session.execute(
                    select(PluginPreset).filter(PluginPreset.is_default == True)
                )
                defaults = result.scalars().all()

                for preset in defaults:
                    self._plugin_default_presets[preset.plugin_uri] = preset.id

                logger.info(
                    f"Loaded {len(self._plugin_default_presets)} default presets"
                )
                return self._plugin_default_presets

        except Exception as e:
            logger.error(f"Error loading default presets: {e}")
            return {}

    async def get_default_preset(self, plugin_uri: str) -> Optional[Dict[str, Any]]:
        """
        Get the default preset for a plugin.

        Args:
            plugin_uri: Plugin URI

        Returns:
            Preset data or None
        """
        preset_id = self._plugin_default_presets.get(plugin_uri)
        if not preset_id:
            return None

        try:
            from sqlalchemy import select

            async with get_session() as session:
                result = await session.execute(
                    select(PluginPreset).filter(PluginPreset.id == preset_id)
                )
                preset = result.scalar_one_or_none()

                if preset:
                    return {
                        "id": preset.id,
                        "name": preset.name,
                        "parameters": json.loads(preset.parameters),
                        "description": preset.description,
                    }

        except Exception as e:
            logger.error(f"Error getting default preset for {plugin_uri}: {e}")

        return None

    async def get_plugin_favorites(self, plugin_uri: str) -> List[Dict[str, Any]]:
        """
        Get all favorite presets for a plugin.

        Args:
            plugin_uri: Plugin URI

        Returns:
            List of favorite presets
        """
        try:
            from sqlalchemy import select

            async with get_session() as session:
                result = await session.execute(
                    select(PluginPreset).filter(
                        (PluginPreset.plugin_uri == plugin_uri)
                        & (PluginPreset.is_favorite == True)
                    )
                )
                presets = result.scalars().all()

                return [
                    {
                        "id": p.id,
                        "name": p.name,
                        "parameters": json.loads(p.parameters),
                        "description": p.description,
                        "usage_count": p.usage_count,
                    }
                    for p in presets
                ]

        except Exception as e:
            logger.error(f"Error getting favorite presets for {plugin_uri}: {e}")
            return []

    async def cleanup_unused_presets(self, days_threshold: int = 30) -> int:
        """
        Clean up presets that haven't been used in a while.
        Archives old, unused presets to optimize database.

        Args:
            days_threshold: Delete presets older than this many days if never used

        Returns:
            Number of presets cleaned up
        """
        try:
            from sqlalchemy import select
            from datetime import datetime, timedelta

            cutoff_date = datetime.utcnow() - timedelta(days=days_threshold)

            async with get_session() as session:
                result = await session.execute(
                    select(PluginPreset).filter(
                        (PluginPreset.usage_count == 0)
                        & (PluginPreset.created_at < cutoff_date)
                        & (PluginPreset.is_favorite == False)
                        & (PluginPreset.is_default == False)
                    )
                )
                presets = result.scalars().all()

                count = len(presets)
                for preset in presets:
                    await session.delete(preset)
                    logger.info(f"Cleaned up unused preset: {preset.name} (id={preset.id})")

                logger.info(f"Cleaned up {count} unused presets")
                return count

        except Exception as e:
            logger.error(f"Error cleaning up presets: {e}")
            return 0

    async def get_usage_stats(self) -> Dict[str, Any]:
        """
        Get usage statistics for plugin presets.

        Returns:
            Statistics dict with total, favorites, defaults, usage info
        """
        try:
            from sqlalchemy import select, func

            async with get_session() as session:
                total = await session.execute(select(func.count(PluginPreset.id)))
                total_count = total.scalar()

                favorites = await session.execute(
                    select(func.count(PluginPreset.id)).filter(
                        PluginPreset.is_favorite == True
                    )
                )
                favorite_count = favorites.scalar()

                defaults = await session.execute(
                    select(func.count(PluginPreset.id)).filter(
                        PluginPreset.is_default == True
                    )
                )
                default_count = defaults.scalar()

                total_usage = await session.execute(
                    select(func.sum(PluginPreset.usage_count))
                )
                total_usage_count = total_usage.scalar() or 0

                return {
                    "total_presets": total_count,
                    "favorite_presets": favorite_count,
                    "default_presets": default_count,
                    "total_usage": total_usage_count,
                    "avg_usage_per_preset": (
                        total_usage_count / total_count if total_count > 0 else 0
                    ),
                    "cache_size": len(self._loaded_presets_cache),
                }

        except Exception as e:
            logger.error(f"Error getting usage stats: {e}")
            return {}

    async def startup(self) -> None:
        """Lifecycle startup - load defaults and initialize."""
        try:
            logger.info("Starting Plugin Preset Lifecycle Manager")
            await self.load_default_presets()
            logger.info("Plugin Preset Lifecycle Manager started successfully")
        except Exception as e:
            logger.error(f"Error during preset lifecycle startup: {e}")

    async def shutdown(self) -> None:
        """Lifecycle shutdown - cleanup and cache flush."""
        try:
            logger.info("Shutting down Plugin Preset Lifecycle Manager")

            # Cleanup unused presets
            await self.cleanup_unused_presets()

            # Clear cache
            self._loaded_presets_cache.clear()
            self._plugin_default_presets.clear()

            logger.info("Plugin Preset Lifecycle Manager shut down successfully")
        except Exception as e:
            logger.error(f"Error during preset lifecycle shutdown: {e}")


# Global lifecycle manager instance
_preset_lifecycle: Optional[PluginPresetLifecycle] = None


def get_preset_lifecycle() -> PluginPresetLifecycle:
    """Get or create the global preset lifecycle manager."""
    global _preset_lifecycle
    if _preset_lifecycle is None:
        _preset_lifecycle = PluginPresetLifecycle()
    return _preset_lifecycle
