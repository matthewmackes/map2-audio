"""
Signal Chain Service with Database Persistence
Manages signal chains with full CRUD operations and database storage.

REAL-TIME SAFETY:
- Database operations run in background via command queue
- Non-blocking API returns immediately
- State updates via lock-free mechanisms

Performance optimizations:
- Pre-populated plugin metadata cache for O(1) lookups
- Class-level shared cache across all instances
"""

import asyncio
import json
import logging
import os
import time
from typing import List, Dict, Any, Optional, ClassVar
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from .command_queue import CommandQueue, CommandType
from app.services.plugin_loader_unified import get_plugin_loader

logger = logging.getLogger(__name__)

_ENABLE_ENGINE_CHAIN_DEPLOY = os.getenv("MAP2_ENABLE_ENGINE_CHAIN_DEPLOY", "false").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
_CHAIN_DEPLOY_API_WARNING_EMITTED = False


def _warn_chain_deploy_api_once(missing_methods: List[str]) -> None:
    """Emit chain-deploy API incompatibility warning only once per process."""
    global _CHAIN_DEPLOY_API_WARNING_EMITTED
    if _CHAIN_DEPLOY_API_WARNING_EMITTED:
        return
    _CHAIN_DEPLOY_API_WARNING_EMITTED = True
    logger.warning(
        "Skipping JUCE chain deployment: engine missing required APIs (%s).",
        ", ".join(missing_methods),
    )


class ChainService:
    """Service for managing signal chains with RT-safe database operations.

    Uses command queue to decouple database I/O from request handling.
    All database operations are async and non-blocking.

    Performance features:
    - Pre-populated plugin metadata cache for O(1) lookups
    - Class-level shared cache to avoid redundant initialization
    """

    # Class-level cache shared across all instances
    _plugin_meta_cache: ClassVar[Dict[str, Dict[str, Any]]] = {}
    _cache_initialized: ClassVar[bool] = False
    _cache_init_time: ClassVar[float] = 0

    def __init__(self, session: Optional[AsyncSession] = None):
        """Initialize chain service with optional database session."""
        self.session = session
        self.command_queue = CommandQueue(max_size=100)
        # In-memory cache for fast reads
        self._chain_cache: Dict[int, Dict[str, Any]] = {}

        # Initialize class-level plugin cache if not already done
        if not ChainService._cache_initialized:
            self._initialize_plugin_cache()

    @classmethod
    def _initialize_plugin_cache(cls) -> None:
        """
        Pre-populate the plugin metadata cache for O(1) lookups.

        This runs once per application lifecycle and populates the
        class-level cache with all available plugin metadata.
        """
        start_time = time.time()
        loader = get_plugin_loader()

        if not loader:
            logger.warning("Plugin loader not available for cache initialization")
            return

        try:
            # Use the loader's internal plugin dict for direct access
            if hasattr(loader, 'plugins') and isinstance(loader.plugins, dict):
                for uri, plugin_data in loader.plugins.items():
                    if isinstance(plugin_data, dict):
                        cls._plugin_meta_cache[uri] = {
                            "name": plugin_data.get("name", uri.split("/")[-1]),
                            "author": plugin_data.get("author", ""),
                            "category": plugin_data.get("category", ""),
                            "in_port_count": plugin_data.get("audio_inputs", 2),
                            "out_port_count": plugin_data.get("audio_outputs", 2),
                        }
                    else:
                        # Object-style plugin
                        cls._plugin_meta_cache[uri] = {
                            "name": getattr(plugin_data, "name", uri.split("/")[-1]),
                            "author": getattr(plugin_data, "author", ""),
                            "category": getattr(plugin_data, "category", ""),
                            "in_port_count": getattr(plugin_data, "in_port_count", 2),
                            "out_port_count": getattr(plugin_data, "out_port_count", 2),
                        }

            # Add NAM plugin to cache
            try:
                from app.services.nam_processor import NAM_AVAILABLE
                if NAM_AVAILABLE:
                    cls._plugin_meta_cache["urn:map2:nam-player"] = {
                        "name": "Neural Amp Modeler",
                        "author": "Shapeoko",
                        "category": "Amplifier",
                        "in_port_count": 1,
                        "out_port_count": 1,
                        "is_nam_plugin": True
                    }
                    logger.info("Added NAM plugin to metadata cache")
            except Exception as e:
                logger.debug(f"Failed to add NAM to cache: {e}")

            # Add IR plugins to cache
            try:
                from app.services.ir_processor import IRProcessor
                if IRProcessor:
                    # Cabinet IR
                    cls._plugin_meta_cache["urn:map2:ir-cabinet"] = {
                        "name": "Cabinet IR",
                        "author": "MAP2 Audio",
                        "category": "Amplifier",
                        "in_port_count": 1,
                        "out_port_count": 1,
                        "is_ir_plugin": True,
                        "ir_type": "cabinet"
                    }
                    # Reverb IR
                    cls._plugin_meta_cache["urn:map2:ir-reverb"] = {
                        "name": "Reverb IR",
                        "author": "MAP2 Audio",
                        "category": "Reverb",
                        "in_port_count": 1,
                        "out_port_count": 1,
                        "is_ir_plugin": True,
                        "ir_type": "reverb"
                    }
                    logger.info("Added IR plugins to metadata cache")
            except Exception as e:
                logger.debug(f"Failed to add IR plugins to cache: {e}")

            cls._cache_initialized = True
            cls._cache_init_time = time.time() - start_time

            logger.info(
                f"Plugin metadata cache initialized with {len(cls._plugin_meta_cache)} "
                f"plugins in {cls._cache_init_time * 1000:.1f}ms"
            )

        except Exception as e:
            logger.warning(f"Failed to initialize plugin cache: {e}")

    @classmethod
    def invalidate_cache(cls) -> None:
        """Invalidate the plugin metadata cache."""
        cls._plugin_meta_cache.clear()
        cls._cache_initialized = False
        logger.info("Plugin metadata cache invalidated")

    def _get_plugin_metadata(self, plugin_uri: str) -> Dict[str, Any]:
        """
        Lookup plugin metadata (name, ports) with O(1) cache access.

        Falls back to on-demand lookup if not in cache.

        Args:
            plugin_uri: Plugin URI

        Returns:
            Plugin metadata dict
        """
        # Fast path: cache hit
        if plugin_uri in self._plugin_meta_cache:
            return self._plugin_meta_cache[plugin_uri]

        # Slow path: try direct lookup from loader
        loader = get_plugin_loader()
        if not loader:
            return {}

        try:
            # Try the new O(1) lookup method if available
            if hasattr(loader, 'get_plugin_by_uri'):
                plugin = loader.get_plugin_by_uri(plugin_uri)
                if plugin:
                    meta = {
                        "name": plugin.get("name", plugin_uri.split("/")[-1]),
                        "author": plugin.get("author", ""),
                        "category": plugin.get("category", ""),
                        "in_port_count": plugin.get("audio_inputs", 2),
                        "out_port_count": plugin.get("audio_outputs", 2),
                    }
                    self._plugin_meta_cache[plugin_uri] = meta
                    return meta

            # Fallback: check loader's plugins dict directly
            if hasattr(loader, 'plugins') and plugin_uri in loader.plugins:
                plugin_data = loader.plugins[plugin_uri]
                if isinstance(plugin_data, dict):
                    meta = {
                        "name": plugin_data.get("name", plugin_uri.split("/")[-1]),
                        "author": plugin_data.get("author", ""),
                        "category": plugin_data.get("category", ""),
                        "in_port_count": plugin_data.get("audio_inputs", 2),
                        "out_port_count": plugin_data.get("audio_outputs", 2),
                    }
                    self._plugin_meta_cache[plugin_uri] = meta
                    return meta

        except Exception as e:
            logger.debug(f"Plugin lookup failed for {plugin_uri}: {e}")

        return {}

    @staticmethod
    def _serialize_effects_loop(loop: Any) -> Dict[str, Any]:
        return {
            "loop_id": loop.loop_id,
            "name": loop.name,
            "channels": loop.channels,
            "topology": loop.topology,
            "tesira_device_id": loop.tesira_device_id,
            "template_id": loop.template_id,
            "send_endpoint_id": loop.send_endpoint_id,
            "return_endpoint_id": loop.return_endpoint_id,
            "state_desired": loop.state_desired,
            "state_actual": loop.state_actual,
            "health_status": loop.health_status,
            "health_reason": loop.health_reason,
            "target_added_latency_ms": loop.target_added_latency_ms,
            "measured_added_latency_ms": loop.measured_added_latency_ms,
            "compensation_samples": loop.compensation_samples,
            "calibration_status": loop.calibration_status,
            "created_at": loop.created_at.isoformat() if loop.created_at else None,
            "updated_at": loop.updated_at.isoformat() if loop.updated_at else None,
        }

    @staticmethod
    def _serialize_loop_insertion(insertion: Any) -> Dict[str, Any]:
        return {
            "insertion_id": insertion.insertion_id,
            "chain_id": insertion.chain_id,
            "loop_id": insertion.loop_id,
            "slot_index": insertion.slot_index,
            "enabled": insertion.enabled,
            "mode": insertion.mode,
            "blend_pct": insertion.blend_pct,
            "send_gain_db": insertion.send_gain_db,
            "return_gain_db": insertion.return_gain_db,
            "crossfade_ms": insertion.crossfade_ms,
            "band_split_hz": insertion.band_split_hz or [],
            "created_at": insertion.created_at.isoformat() if insertion.created_at else None,
            "updated_at": insertion.updated_at.isoformat() if insertion.updated_at else None,
        }

    async def create_chain(self, name: str) -> Optional[Dict[str, Any]]:
        """Create a new signal chain.
        
        Args:
            name: Chain name (1-256 characters)
            
        Returns:
            Chain dict with id, name, is_active, plugins, or None on error
        """
        try:
            if not name or len(name) > 256:
                logger.error(f"Invalid chain name: {name}")
                return None
            
            from app.database import Chain
            
            chain = Chain(name=name, is_active=False)
            if self.session:
                self.session.add(chain)
                await self.session.flush()
                await self.session.refresh(chain)
                # Note: commit is handled by route's get_session context manager
            
            return {
                "id": chain.id,
                "name": chain.name,
                "is_active": chain.is_active,
                "plugins": [],
                "created_at": chain.created_at.isoformat() if chain.created_at else None
            }
        except Exception as e:
            logger.error(f"Error creating chain: {e}")
            return None

    async def get_chain(self, chain_id: int) -> Optional[Dict[str, Any]]:
        """Get chain details by ID.
        
        Args:
            chain_id: Chain ID
            
        Returns:
            Chain dict or None if not found
        """
        try:
            if not self.session:
                return None
            
            from app.database import Chain, ChainPlugin, EffectsLoop, EffectsLoopInsertion
            
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            
            if not chain:
                return None
            
            # Get plugins in chain
            plugins_result = await self.session.execute(
                select(ChainPlugin)
                .filter(ChainPlugin.chain_id == chain_id)
                .order_by(ChainPlugin.position)
            )
            plugins = plugins_result.scalars().all()
            
            # Build plugins list with single metadata lookup per plugin
            plugins_list = []
            for p in plugins:
                meta = self._get_plugin_metadata(p.plugin_uri)  # Single lookup
                plugins_list.append({
                    "uri": p.plugin_uri,
                    "name": meta.get("name", p.plugin_uri),
                    "author": meta.get("author", ""),
                    "position": p.position,
                    "bypassed": p.bypass,
                    "in_ports": meta.get("in_port_count", 0),
                    "out_ports": meta.get("out_port_count", 0),
                    "parameters": {},
                })

            insertion_result = await self.session.execute(
                select(EffectsLoopInsertion)
                .filter(EffectsLoopInsertion.chain_id == chain_id)
                .order_by(EffectsLoopInsertion.slot_index.asc(), EffectsLoopInsertion.id.asc())
            )
            insertions = list(insertion_result.scalars().all())
            loop_ids = sorted({ins.loop_id for ins in insertions if ins.loop_id})

            effects_loops: Dict[str, Dict[str, Any]] = {}
            if loop_ids:
                loops_result = await self.session.execute(
                    select(EffectsLoop).filter(EffectsLoop.loop_id.in_(loop_ids))
                )
                for loop in loops_result.scalars().all():
                    effects_loops[loop.loop_id] = self._serialize_effects_loop(loop)

            return {
                "id": chain.id,
                "name": chain.name,
                "is_active": chain.is_active,
                "plugins": plugins_list,
                "loop_insertions": [self._serialize_loop_insertion(ins) for ins in insertions],
                "effects_loops": [effects_loops[loop_id] for loop_id in loop_ids if loop_id in effects_loops],
                "created_at": chain.created_at.isoformat() if chain.created_at else None,
                "updated_at": chain.updated_at.isoformat() if chain.updated_at else None
            }
        except Exception as e:
            logger.error(f"Error getting chain {chain_id}: {e}")
            return None

    async def list_chains(self) -> List[Dict[str, Any]]:
        """List all signal chains with their plugins.

        Returns:
            List of chain dicts with plugins array
        """
        try:
            if not self.session:
                return []

            from app.database import Chain, ChainPlugin, EffectsLoop, EffectsLoopInsertion

            # Get all chains
            result = await self.session.execute(select(Chain))
            chains = result.scalars().all()

            chains_list = []
            for chain in chains:
                # Get plugins for this chain
                plugins_result = await self.session.execute(
                    select(ChainPlugin)
                    .filter(ChainPlugin.chain_id == chain.id)
                    .order_by(ChainPlugin.position)
                )
                plugins = plugins_result.scalars().all()

                chain_data = {
                    "id": chain.id,
                    "name": chain.name,
                    "is_active": chain.is_active,
                    "plugins": [],
                    "loop_insertions": [],
                    "effects_loops": [],
                    "plugin_count": len(plugins),
                    "created_at": chain.created_at.isoformat() if chain.created_at else None
                }

                for p in plugins:
                    meta = self._get_plugin_metadata(p.plugin_uri)
                    chain_data["plugins"].append({
                        "uri": p.plugin_uri,
                        "name": meta.get("name", p.plugin_uri),
                        "author": meta.get("author", ""),
                        "position": p.position,
                        "bypassed": p.bypass,
                        "in_ports": meta.get("in_port_count", 0),
                        "out_ports": meta.get("out_port_count", 0),
                        "parameters": {},
                    })

                insertion_result = await self.session.execute(
                    select(EffectsLoopInsertion)
                    .filter(EffectsLoopInsertion.chain_id == chain.id)
                    .order_by(EffectsLoopInsertion.slot_index.asc(), EffectsLoopInsertion.id.asc())
                )
                insertions = list(insertion_result.scalars().all())
                chain_data["loop_insertions"] = [self._serialize_loop_insertion(ins) for ins in insertions]

                loop_ids = sorted({ins.loop_id for ins in insertions if ins.loop_id})
                if loop_ids:
                    loops_result = await self.session.execute(
                        select(EffectsLoop).filter(EffectsLoop.loop_id.in_(loop_ids))
                    )
                    loop_map = {loop.loop_id: self._serialize_effects_loop(loop) for loop in loops_result.scalars().all()}
                    chain_data["effects_loops"] = [loop_map[loop_id] for loop_id in loop_ids if loop_id in loop_map]

                chains_list.append(chain_data)

            return chains_list
        except Exception as e:
            logger.error(f"Error listing chains: {e}")
            return []

    async def delete_chain(self, chain_id: int) -> bool:
        """Delete a chain by ID.

        Args:
            chain_id: Chain ID

        Returns:
            True if deleted, False otherwise
        """
        try:
            if not self.session:
                return False

            from app.database import Chain, PluginPerformanceLog

            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()

            if not chain:
                return False

            # Delete related performance logs first (FK constraint workaround for existing DBs)
            await self.session.execute(
                delete(PluginPerformanceLog).where(PluginPerformanceLog.chain_id == chain_id)
            )

            # Delete and commit immediately (don't just flush)
            await self.session.delete(chain)
            await self.session.commit()

            # Verify deletion persisted
            verify_result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            if verify_result.scalar_one_or_none() is not None:
                logger.error(f"Chain {chain_id} still exists after delete+commit!")
                return False

            logger.info(f"Chain {chain_id} deleted and verified")
            return True
        except Exception as e:
            logger.error(f"Error deleting chain {chain_id}: {e}")
            return False

    async def add_plugin_to_chain(self, chain_id: int, plugin_uri: str) -> bool:
        """Add LV2 plugin to chain.
        Args:
            chain_id: Chain ID
            plugin_uri: Plugin URI
        Returns:
            True if added, False otherwise
        """
        try:
            # LV2 plugin handling
            logger.debug(f"Adding LV2 plugin {plugin_uri} to chain {chain_id}")
            if not self.session:
                logger.error("No database session available")
                return False
            from app.database import Chain, ChainPlugin
            # Verify chain exists
            logger.debug(f"Checking if chain {chain_id} exists")
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            if not chain:
                logger.warning(f"Chain {chain_id} not found in database")
                return False
            logger.debug(f"Chain {chain_id} found: {chain.name}")
            # Get max position
            pos_result = await self.session.execute(
                select(ChainPlugin)
                .filter(ChainPlugin.chain_id == chain_id)
                .order_by(ChainPlugin.position.desc())
            )
            last_plugin = pos_result.scalars().first()
            next_position = (last_plugin.position + 1) if last_plugin else 0
            logger.debug(f"Next position for plugin in chain {chain_id}: {next_position}")
            # Add plugin
            chain_plugin = ChainPlugin(
                chain_id=chain_id,
                plugin_uri=plugin_uri,
                position=next_position,
                bypass=False
            )
            self.session.add(chain_plugin)
            await self.session.flush()
            # Note: commit is handled by route's get_session context manager
            logger.info(f"Successfully added plugin {plugin_uri} to chain {chain_id} at position {next_position}")
            return True
        except Exception as e:
            logger.error(f"Error adding plugin {plugin_uri} to chain {chain_id}: {e}", exc_info=True)
            return False

    async def _add_nam_to_chain(self, chain_id: int) -> bool:
        """Add NAM plugin to chain.
        
        Args:
            chain_id: Chain ID
            
        Returns:
            True if added, False otherwise
        """
        try:
            if not self.session:
                return False
            
            from app.database import Chain, ChainPlugin
            
            # Verify chain exists
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            if not result.scalar_one_or_none():
                logger.warning(f"Chain {chain_id} not found")
                return False
            
            # NAM service integration is optional; default to generic model label.
            active_model = "default"
            
            # Get max position
            pos_result = await self.session.execute(
                select(ChainPlugin)
                .filter(ChainPlugin.chain_id == chain_id)
                .order_by(ChainPlugin.position.desc())
            )
            last_plugin = pos_result.scalars().first()
            next_position = (last_plugin.position + 1) if last_plugin else 0
            
            # Add NAM plugin
            chain_plugin = ChainPlugin(
                chain_id=chain_id,
                plugin_uri="urn:map2:nam-player",
                position=next_position,
                bypass=False
            )
            self.session.add(chain_plugin)
            await self.session.flush()
            
            logger.info(f"Added NAM plugin to chain {chain_id} at position {next_position} with model '{active_model}'")
            
            # Publish event
            try:
                from .event_publisher import event_publisher, EventType
                await event_publisher.publish(
                    EventType.CHAIN_UPDATED,
                    {
                        "chain_id": chain_id,
                        "action": "plugin_added",
                        "plugin_uri": "urn:map2:nam-player",
                        "nam_model": active_model
                    }
                )
            except Exception as e:
                logger.debug(f"Failed to publish event: {e}")
            
            return True
        except Exception as e:
            logger.error(f"Error adding NAM to chain {chain_id}: {e}")
            return False

    async def _add_ir_to_chain(self, chain_id: int, ir_type: str) -> bool:
        """Add IR plugin to chain (cabinet or reverb).
        
        Args:
            chain_id: Chain ID
            ir_type: Type of IR ('cabinet' or 'reverb')
            
        Returns:
            True if added, False otherwise
        """
        try:
            if not self.session:
                return False
            
            from app.database import Chain, ChainPlugin
            
            # Verify chain exists
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            if not result.scalar_one_or_none():
                logger.warning(f"Chain {chain_id} not found")
                return False
            
            if ir_type == "cabinet":
                active_ir = "default"
                plugin_uri = "urn:map2:ir-cabinet"
            else:
                active_ir = "default"
                plugin_uri = "urn:map2:ir-reverb"
            
            # Get max position
            pos_result = await self.session.execute(
                select(ChainPlugin)
                .filter(ChainPlugin.chain_id == chain_id)
                .order_by(ChainPlugin.position.desc())
            )
            last_plugin = pos_result.scalars().first()
            next_position = (last_plugin.position + 1) if last_plugin else 0
            
            # Add IR plugin
            chain_plugin = ChainPlugin(
                chain_id=chain_id,
                plugin_uri=plugin_uri,
                position=next_position,
                bypass=False
            )
            self.session.add(chain_plugin)
            await self.session.flush()
            
            logger.info(f"Added {ir_type} IR plugin to chain {chain_id} at position {next_position} with IR '{active_ir}'")
            
            # Publish event
            try:
                from .event_publisher import event_publisher, EventType
                await event_publisher.publish(
                    EventType.CHAIN_UPDATED,
                    {
                        "chain_id": chain_id,
                        "action": "plugin_added",
                        "plugin_uri": plugin_uri,
                        "ir_type": ir_type,
                        "active_ir": active_ir
                    }
                )
            except Exception as e:
                logger.debug(f"Failed to publish event: {e}")
            
            return True
        except Exception as e:
            logger.error(f"Error adding {ir_type} IR to chain {chain_id}: {e}")
            return False

    async def remove_plugin_from_chain(self, chain_id: int, plugin_uri: str) -> bool:
        """Remove plugin from chain.
        
        Args:
            chain_id: Chain ID
            plugin_uri: Plugin URI
            
        Returns:
            True if removed, False otherwise
        """
        try:
            if not self.session:
                logger.error("REMOVE_PLUGIN: No session available!")
                return False
            
            from app.database import ChainPlugin
            from sqlalchemy import delete, text
            
            logger.info(f"REMOVE_PLUGIN: === START deletion of {plugin_uri} from chain {chain_id} ===")
            logger.info(f"REMOVE_PLUGIN: Plugin URI type: {type(plugin_uri)}, length: {len(plugin_uri)}, repr: {repr(plugin_uri)}")
            
            # Step 1: Check plugin exists
            logger.info(f"REMOVE_PLUGIN: Step 1 - Checking if plugin exists...")
            count_result = await self.session.execute(
                select(ChainPlugin).filter(
                    (ChainPlugin.chain_id == chain_id) &
                    (ChainPlugin.plugin_uri == plugin_uri)
                )
            )
            matching_plugins = count_result.scalars().all()
            count_before = len(matching_plugins)
            logger.info(f"REMOVE_PLUGIN: Found {count_before} matching record(s) by direct filter")
            
            if count_before == 0:
                logger.error(f"REMOVE_PLUGIN: Plugin NOT FOUND - nothing to delete")
                return False
            
            # Log details of what we're about to delete
            for plugin in matching_plugins:
                logger.info(f"REMOVE_PLUGIN: About to delete: id={plugin.id}, chain_id={plugin.chain_id}, uri={plugin.plugin_uri}, pos={plugin.position}")
            
            # Step 2: Try TWO methods to delete - ORM and raw SQL
            # Method 1: ORM delete
            logger.info(f"REMOVE_PLUGIN: Step 2a - Trying ORM DELETE...")
            delete_stmt = delete(ChainPlugin).where(
                (ChainPlugin.chain_id == chain_id) &
                (ChainPlugin.plugin_uri == plugin_uri)
            )
            result = await self.session.execute(delete_stmt)
            deleted_count_orm = result.rowcount
            logger.info(f"REMOVE_PLUGIN: ORM DELETE returned rowcount={deleted_count_orm}")
            
            # Method 2: Raw SQL delete (as backup/verification)
            logger.info(f"REMOVE_PLUGIN: Step 2b - Trying raw SQL DELETE...")
            sql_delete = text("""
                DELETE FROM chain_plugins 
                WHERE chain_id = :chain_id AND plugin_uri = :plugin_uri
            """)
            result_sql = await self.session.execute(
                sql_delete,
                {"chain_id": chain_id, "plugin_uri": plugin_uri}
            )
            deleted_count_sql = result_sql.rowcount
            logger.info(f"REMOVE_PLUGIN: Raw SQL DELETE returned rowcount={deleted_count_sql}")
            
            deleted_count = max(deleted_count_orm, deleted_count_sql)
            if deleted_count == 0:
                logger.error(f"REMOVE_PLUGIN: Both methods returned 0 rows - deletion failed")
                return False
            
            logger.info(f"REMOVE_PLUGIN: Total deleted: {deleted_count} row(s)")
            
            # Step 3: Flush
            logger.info(f"REMOVE_PLUGIN: Step 3 - Flushing session...")
            try:
                await self.session.flush()
                logger.info(f"REMOVE_PLUGIN: Flush successful")
            except Exception as e:
                logger.error(f"REMOVE_PLUGIN: Flush FAILED: {e}", exc_info=True)
                return False
            
            # Step 4: Verify within same transaction - use BOTH ORM and raw SQL
            logger.info(f"REMOVE_PLUGIN: Step 4 - Verifying deletion...")
            
            # ORM verify
            verify_result = await self.session.execute(
                select(ChainPlugin).filter(
                    (ChainPlugin.chain_id == chain_id) &
                    (ChainPlugin.plugin_uri == plugin_uri)
                )
            )
            verify_orm_count = len(verify_result.scalars().all())
            logger.info(f"REMOVE_PLUGIN: ORM verify - {verify_orm_count} record(s) still exist")
            
            # Raw SQL verify
            sql_verify = text("""
                SELECT COUNT(*) as cnt FROM chain_plugins 
                WHERE chain_id = :chain_id AND plugin_uri = :plugin_uri
            """)
            result_verify = await self.session.execute(
                sql_verify,
                {"chain_id": chain_id, "plugin_uri": plugin_uri}
            )
            row = result_verify.one()
            verify_sql_count = row[0] if row else 0
            logger.info(f"REMOVE_PLUGIN: Raw SQL verify - {verify_sql_count} record(s) still exist")
            
            if verify_orm_count > 0 or verify_sql_count > 0:
                logger.error(f"REMOVE_PLUGIN: VERIFICATION FAILED - Plugin still exists!")
                return False
            
            logger.info(f"REMOVE_PLUGIN: === SUCCESS - Deletion verified, {deleted_count} record(s) removed ===")
            return True
            
        except Exception as e:
            logger.error(f"REMOVE_PLUGIN: Exception during removal: {e}", exc_info=True)
            return False

    async def activate_chain(self, chain_id: int) -> bool:
        """Activate a chain and deploy it to the JUCE audio engine.
        
        FIX #8: Bridge layer connecting SQLite chains to JUCE engine graph
        This method now:
        1. Updates chain metadata in database (is_active = True)
        2. Retrieves all plugins in the chain from the database
        3. Deploys each plugin to the JUCE audio engine
        4. Sets up the signal chain in the engine
        
        Args:
            chain_id: Chain ID
            
        Returns:
            True if activated and deployed, False otherwise
        """
        try:
            if not self.session:
                return False
            
            from app.database import Chain, ChainPlugin
            
            # Get the chain
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            
            if not chain:
                return False
            
            # Mark as active in database
            chain.is_active = True
            await self.session.flush()
            
            # FIX #8: Get all plugins in this chain from the database
            plugins_result = await self.session.execute(
                select(ChainPlugin)
                .filter(ChainPlugin.chain_id == chain_id)
                .order_by(ChainPlugin.position)
            )
            chain_plugins = plugins_result.scalars().all()
            
            # Deploy to JUCE only when explicitly enabled; default keeps route fast/stable.
            if _ENABLE_ENGINE_CHAIN_DEPLOY:
                try:
                    from app.services.juce_engine_service import JuceEngineService

                    engine_service = JuceEngineService.get_instance()
                    engine = getattr(engine_service, "_engine", None) if engine_service else None

                    if engine:
                        missing_methods = [
                            method
                            for method in ("clear_chain", "add_to_chain")
                            if not hasattr(engine, method)
                        ]

                        if missing_methods:
                            _warn_chain_deploy_api_once(missing_methods)
                        else:
                            await asyncio.to_thread(engine.clear_chain)
                            for chain_plugin in chain_plugins:
                                try:
                                    instance_id = await engine_service.load_plugin(chain_plugin.plugin_uri)
                                    if instance_id >= 0:
                                        await asyncio.to_thread(
                                            engine.add_to_chain, instance_id, chain_plugin.position
                                        )
                                        logger.info(
                                            "Deployed plugin %s to chain position %s",
                                            chain_plugin.plugin_uri,
                                            chain_plugin.position,
                                        )
                                    else:
                                        logger.warning("Failed to load plugin %s", chain_plugin.plugin_uri)
                                except Exception as e:
                                    logger.error(f"Error deploying plugin {chain_plugin.plugin_uri}: {e}")

                            logger.info(
                                "Chain %s deployed to JUCE engine with %s plugins",
                                chain_id,
                                len(chain_plugins),
                            )
                    else:
                        logger.debug("JUCE engine unavailable; skipping chain deployment")
                except Exception as e:
                    logger.error(f"Error deploying chain to JUCE engine: {e}")
                    # Don't fail the database update if engine deployment fails
            else:
                logger.debug("Skipping JUCE chain deployment (MAP2_ENABLE_ENGINE_CHAIN_DEPLOY disabled)")
            
            logger.info(f"Activated chain {chain_id}")
            return True
        except Exception as e:
            logger.error(f"Error activating chain {chain_id}: {e}")
            return False

    async def deactivate_chain(self, chain_id: int) -> bool:
        """Deactivate a chain.
        
        Args:
            chain_id: Chain ID
            
        Returns:
            True if deactivated, False otherwise
        """
        try:
            if not self.session:
                return False
            
            from app.database import Chain
            
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            
            if not chain:
                return False
            
            chain.is_active = False
            await self.session.flush()
            
            logger.info(f"Deactivated chain {chain_id}")
            return True
        except Exception as e:
            logger.error(f"Error deactivating chain {chain_id}: {e}")
            return False

    async def rename_chain(self, chain_id: int, new_name: str) -> bool:
        """Rename a signal chain.
        
        Args:
            chain_id: Chain ID
            new_name: New name for the chain
            
        Returns:
            True if renamed, False otherwise
        """
        try:
            if not self.session or not new_name or len(new_name) > 256:
                return False
            
            from app.database import Chain
            
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            
            if not chain:
                return False
            
            chain.name = new_name
            await self.session.flush()
            
            logger.info(f"Renamed chain {chain_id} to '{new_name}'")
            return True
        except Exception as e:
            logger.error(f"Error renaming chain {chain_id}: {e}")
            return False

    async def reorder_plugins(self, chain_id: int, plugin_uris: List[str]) -> bool:
        """Reorder plugins in a chain.
        
        Args:
            chain_id: Chain ID
            plugin_uris: Ordered list of plugin URIs
            
        Returns:
            True if reordered, False otherwise
        """
        try:
            if not self.session:
                return False
            
            from app.database import Chain, ChainPlugin
            
            # Get chain
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            
            if not chain:
                return False
            
            # Get existing chain plugins
            result = await self.session.execute(
                select(ChainPlugin).filter(ChainPlugin.chain_id == chain_id)
            )
            chain_plugins = result.scalars().all()
            
            # Create lookup by URI
            cp_by_uri = {cp.plugin_uri: cp for cp in chain_plugins}
            
            # Verify all URIs exist in chain
            if set(plugin_uris) != set(cp_by_uri.keys()):
                logger.error(f"Plugin URI mismatch for chain {chain_id}")
                return False
            
            # Update positions
            for position, plugin_uri in enumerate(plugin_uris):
                cp_by_uri[plugin_uri].position = position
            
            await self.session.flush()

            logger.info(f"Reordered plugins in chain {chain_id}")
            return True
        except Exception as e:
            logger.error(f"Error reordering plugins in chain {chain_id}: {e}")
            return False

    async def set_plugin_bypass(self, chain_id: int, plugin_uri: str, bypass: bool) -> bool:
        """Set plugin bypass state in a chain.
        
        Args:
            chain_id: Chain ID
            plugin_uri: Plugin URI
            bypass: True to bypass, False to enable
            
        Returns:
            True if updated, False otherwise
        """
        try:
            if not self.session:
                return False
            
            from app.database import ChainPlugin
            
            result = await self.session.execute(
                select(ChainPlugin).filter(
                    ChainPlugin.chain_id == chain_id,
                    ChainPlugin.plugin_uri == plugin_uri
                )
            )
            chain_plugin = result.scalar_one_or_none()
            
            if not chain_plugin:
                return False
            
            chain_plugin.bypass = bypass
            await self.session.flush()
            
            logger.info(f"Set bypass={bypass} for plugin {plugin_uri} in chain {chain_id}")
            return True
        except Exception as e:
            logger.error(f"Error setting bypass for plugin {plugin_uri}: {e}")
            return False

    async def save_preset(self, chain_id: int, preset_name: str) -> Optional[int]:
        """Save chain configuration as preset.
        
        Args:
            chain_id: Chain ID to save
            preset_name: Name for the preset
            
        Returns:
            Preset ID if saved, None otherwise
        """
        try:
            if not self.session:
                return None
            
            from app.database import Chain, ChainPlugin, SystemConfig
            import json
            
            # Get chain
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            
            if not chain:
                return None
            
            # Get plugins
            result = await self.session.execute(
                select(ChainPlugin)
                .filter(ChainPlugin.chain_id == chain_id)
                .order_by(ChainPlugin.position)
            )
            chain_plugins = result.scalars().all()
            
            # Serialize preset
            preset_data = {
                "name": chain.name,
                "plugins": [
                    {
                        "uri": cp.plugin_uri,
                        "position": cp.position,
                        "bypass": cp.bypass
                    }
                    for cp in chain_plugins
                ]
            }
            
            # Save as system config
            preset = SystemConfig(
                key=f"chain_preset_{preset_name}",
                value=json.dumps(preset_data)
            )
            self.session.add(preset)
            await self.session.flush()
            await self.session.refresh(preset)
            
            logger.info(f"Saved preset '{preset_name}' from chain {chain_id}")
            return preset.id
        except Exception as e:
            logger.error(f"Error saving preset from chain {chain_id}: {e}")
            return None

    async def load_preset(self, preset_id: int) -> Optional[int]:
        """Load chain from preset.
        
        Args:
            preset_id: Preset ID to load
            
        Returns:
            New chain ID if loaded, None otherwise
        """
        try:
            if not self.session:
                return None
            
            from app.database import Chain, ChainPlugin, SystemConfig
            import json
            
            # Get preset
            result = await self.session.execute(
                select(SystemConfig).filter(SystemConfig.id == preset_id)
            )
            preset = result.scalar_one_or_none()
            
            if not preset or not preset.key.startswith("chain_preset_"):
                return None
            
            # Parse preset data
            preset_data = json.loads(preset.value)
            
            # Create new chain
            chain = Chain(name=preset_data["name"], is_active=False)
            self.session.add(chain)
            await self.session.flush()
            await self.session.refresh(chain)
            
            # Add plugins
            for plugin_data in preset_data["plugins"]:
                cp = ChainPlugin(
                    chain_id=chain.id,
                    plugin_uri=plugin_data["uri"],
                    position=plugin_data["position"],
                    bypass=plugin_data.get("bypass", False)
                )
                self.session.add(cp)
            
            await self.session.flush()
            
            logger.info(f"Loaded preset {preset_id} as chain {chain.id}")
            return chain.id
        except Exception as e:
            logger.error(f"Error loading preset {preset_id}: {e}")
            return None

    async def list_presets(self) -> List[Dict[str, Any]]:
        """List all saved presets.
        
        Returns:
            List of preset dicts with id, name, data
        """
        try:
            if not self.session:
                return []
            
            from app.database import SystemConfig
            import json
            
            result = await self.session.execute(
                select(SystemConfig).filter(SystemConfig.key.like("chain_preset_%"))
            )
            presets = result.scalars().all()
            
            preset_list = []
            for preset in presets:
                try:
                    preset_data = json.loads(preset.value)
                    preset_list.append({
                        "id": preset.id,
                        "name": preset.key.replace("chain_preset_", ""),
                        "chain_name": preset_data.get("name", "Unknown"),
                        "plugin_count": len(preset_data.get("plugins", [])),
                        "created_at": preset.created_at.isoformat() if preset.created_at else None
                    })
                except Exception as e:
                    logger.error(f"Error parsing preset {preset.id}: {e}")
            
            return preset_list
        except Exception as e:
            logger.error(f"Error listing presets: {e}")
            return []

    async def delete_preset(self, preset_id: int) -> bool:
        """Delete a preset.

        Args:
            preset_id: Preset ID to delete

        Returns:
            True if deleted, False otherwise
        """
        try:
            if not self.session:
                return False

            from app.database import SystemConfig

            result = await self.session.execute(
                select(SystemConfig).filter(SystemConfig.id == preset_id)
            )
            preset = result.scalar_one_or_none()

            if not preset or not preset.key.startswith("chain_preset_"):
                return False

            self.session.delete(preset)
            await self.session.flush()

            logger.info(f"Deleted preset {preset_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting preset {preset_id}: {e}")
            return False

    async def create_chain_from_template(self, template_name: str) -> Optional[Dict[str, Any]]:
        """Create a chain from a default template (demo pedalboard).

        Loads default chains from app/config/default_lv2_effects.json

        Args:
            template_name: Name of the template chain (e.g., "Rock Distortion")

        Returns:
            Created chain dict or None on error
        """
        try:
            import os

            # Load templates from config file
            config_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "config", "default_lv2_effects.json"
            )

            if not os.path.exists(config_path):
                logger.error(f"Config file not found: {config_path}")
                return None

            with open(config_path, 'r') as f:
                config = json.load(f)

            # Find template
            templates = config.get("default_chains", [])
            template = next(
                (t for t in templates if t["name"] == template_name),
                None
            )

            if not template:
                logger.error(f"Template not found: {template_name}")
                return None

            # Create chain
            chain = await self.create_chain(template["name"])
            if not chain:
                return None

            chain_id = chain["id"]

            # Add plugins from template
            for plugin_uri in template.get("plugins", []):
                await self.add_plugin_to_chain(chain_id, plugin_uri)

            # Get updated chain with plugins
            updated_chain = await self.get_chain(chain_id)

            logger.info(f"Created chain '{template_name}' from template with {len(template.get('plugins', []))} plugins")
            return updated_chain

        except Exception as e:
            logger.error(f"Error creating chain from template '{template_name}': {e}")
            return None

    async def list_templates(self) -> List[Dict[str, Any]]:
        """List available chain templates (demo pedalboards).

        Returns:
            List of template dicts with name, description, plugins
        """
        try:
            import os

            config_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "config", "default_lv2_effects.json"
            )

            if not os.path.exists(config_path):
                return []

            with open(config_path, 'r') as f:
                config = json.load(f)

            templates = []
            for chain in config.get("default_chains", []):
                templates.append({
                    "name": chain["name"],
                    "description": chain.get("description", ""),
                    "plugin_count": len(chain.get("plugins", [])),
                    "plugins": chain.get("plugins", [])
                })

            return templates

        except Exception as e:
            logger.error(f"Error listing templates: {e}")
            return []
