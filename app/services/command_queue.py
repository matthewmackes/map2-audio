"""
Command Queue Pattern for Database Operations

Decouples database I/O from real-time audio path.
Commands are queued and processed in background thread.

This service provides:
- RT-safe command submission (non-blocking)
- Async command processing with database integration
- Command history for undo/redo support
- Batch command processing for efficiency
"""

import logging
import asyncio
import queue
from typing import Dict, Any, Optional, Callable, List, Union
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime, timezone
import json

from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload

from app.utils.singleton import Singleton
from app.utils.logging_utils import get_logger

logger = get_logger(__name__)


class CommandType(Enum):
    """Types of commands supported by the queue."""
    # Chain operations
    CREATE_CHAIN = "create_chain"
    UPDATE_CHAIN = "update_chain"
    DELETE_CHAIN = "delete_chain"
    ACTIVATE_CHAIN = "activate_chain"

    # Plugin operations
    ADD_PLUGIN = "add_plugin"
    REMOVE_PLUGIN = "remove_plugin"
    REORDER_PLUGIN = "reorder_plugin"
    SET_PLUGIN_BYPASS = "set_plugin_bypass"
    UPDATE_PLUGIN_PARAM = "update_plugin_param"
    UPDATE_PLUGIN_PRIORITY = "update_plugin_priority"

    # MIDI operations
    CREATE_MIDI_MAPPING = "create_midi_mapping"
    DELETE_MIDI_MAPPING = "delete_midi_mapping"
    UPDATE_MIDI_MAPPING = "update_midi_mapping"

    # Preset operations
    SAVE_PRESET = "save_preset"
    LOAD_PRESET = "load_preset"
    DELETE_PRESET = "delete_preset"

    # System operations — UPDATE_CONFIG removed in T2431-G; generic
    # system_config writes are no longer a first-class command.
    LOG_PERFORMANCE = "log_performance"

    # Batch operations
    BATCH_UPDATE = "batch_update"


@dataclass
class Command:
    """Command to be processed by the queue."""
    type: CommandType
    params: Dict[str, Any]
    callback: Optional[Callable] = None
    result_future: Optional[asyncio.Future] = None
    timestamp: datetime = field(default_factory=datetime.now)
    priority: int = 5  # 1-10, higher = more urgent

    # For undo support
    undo_data: Optional[Dict[str, Any]] = None


@dataclass
class CommandResult:
    """Result of command execution."""
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    undo_data: Optional[Dict[str, Any]] = None


class CommandQueue(Singleton):
    """
    Thread-safe command queue for database operations.

    Separates database I/O from real-time audio processing.
    Uses lock-free queues for RT safety.

    Features:
    - Non-blocking command submission
    - Async command processing
    - Priority queue support
    - Batch processing
    - Undo data capture
    """

    def __init__(self, max_size: int = 100):
        """Initialize command queue.

        Args:
            max_size: Maximum queue size
        """
        super().__init__()
        self.command_queue = queue.PriorityQueue(maxsize=max_size)
        self.is_processing = False
        self.processor_task: Optional[asyncio.Task] = None
        self._command_counter = 0  # For stable priority ordering

        # Statistics
        self.processed_count = 0
        self.failed_count = 0
        self.total_latency_ms = 0.0

        # Command handlers registry
        self._handlers: Dict[CommandType, Callable] = {}
        self._register_default_handlers()

    def _register_default_handlers(self) -> None:
        """Register default command handlers."""
        # Chain handlers
        self._handlers[CommandType.CREATE_CHAIN] = self._handle_create_chain
        self._handlers[CommandType.UPDATE_CHAIN] = self._handle_update_chain
        self._handlers[CommandType.DELETE_CHAIN] = self._handle_delete_chain
        self._handlers[CommandType.ACTIVATE_CHAIN] = self._handle_activate_chain

        # Plugin handlers
        self._handlers[CommandType.ADD_PLUGIN] = self._handle_add_plugin
        self._handlers[CommandType.REMOVE_PLUGIN] = self._handle_remove_plugin
        self._handlers[CommandType.REORDER_PLUGIN] = self._handle_reorder_plugin
        self._handlers[CommandType.SET_PLUGIN_BYPASS] = self._handle_set_bypass
        self._handlers[CommandType.UPDATE_PLUGIN_PARAM] = self._handle_update_param
        self._handlers[CommandType.UPDATE_PLUGIN_PRIORITY] = self._handle_update_priority

        # MIDI handlers
        self._handlers[CommandType.CREATE_MIDI_MAPPING] = self._handle_create_midi
        self._handlers[CommandType.DELETE_MIDI_MAPPING] = self._handle_delete_midi
        self._handlers[CommandType.UPDATE_MIDI_MAPPING] = self._handle_update_midi

        # Preset handlers
        self._handlers[CommandType.SAVE_PRESET] = self._handle_save_preset
        self._handlers[CommandType.LOAD_PRESET] = self._handle_load_preset
        self._handlers[CommandType.DELETE_PRESET] = self._handle_delete_preset

        # System handlers
        self._handlers[CommandType.LOG_PERFORMANCE] = self._handle_log_performance
        self._handlers[CommandType.BATCH_UPDATE] = self._handle_batch_update

    async def start(self) -> None:
        """Start command processor."""
        if self.is_processing:
            logger.warning("Command processor already running")
            return

        self.is_processing = True
        self.processor_task = asyncio.create_task(self._process_commands())
        logger.info("Command queue processor started")

    async def stop(self) -> None:
        """Stop command processor."""
        self.is_processing = False

        if self.processor_task:
            self.processor_task.cancel()
            try:
                await self.processor_task
            except asyncio.CancelledError:
                pass

        logger.info(f"Command queue processor stopped (processed: {self.processed_count}, failed: {self.failed_count})")

    def submit_command(
        self,
        cmd_type: CommandType,
        params: Dict[str, Any],
        callback: Optional[Callable] = None,
        priority: int = 5
    ) -> bool:
        """Submit command to queue (non-blocking, RT-safe).

        Args:
            cmd_type: Command type
            params: Command parameters
            callback: Optional callback after processing
            priority: Command priority (1-10, higher = more urgent)

        Returns:
            True if queued, False if queue full
        """
        try:
            command = Command(
                type=cmd_type,
                params=params,
                callback=callback,
                priority=priority
            )

            # Use counter for stable ordering within same priority
            self._command_counter += 1
            # PriorityQueue uses min-heap, so negate priority for max-priority behavior
            self.command_queue.put_nowait((-priority, self._command_counter, command))
            return True

        except queue.Full:
            logger.warning(f"Command queue full, dropping {cmd_type.value}")
            self.failed_count += 1
            return False

    async def submit_command_async(
        self,
        cmd_type: CommandType,
        params: Dict[str, Any],
        priority: int = 5
    ) -> CommandResult:
        """Submit command and wait for result.

        Args:
            cmd_type: Command type
            params: Command parameters
            priority: Command priority

        Returns:
            Command result
        """
        result_future: asyncio.Future = asyncio.get_event_loop().create_future()

        command = Command(
            type=cmd_type,
            params=params,
            result_future=result_future,
            priority=priority
        )

        try:
            self._command_counter += 1
            await asyncio.to_thread(
                self.command_queue.put,
                (-priority, self._command_counter, command),
                timeout=1.0
            )
            return await result_future

        except queue.Full:
            logger.error(f"Command queue full, cannot queue {cmd_type.value}")
            self.failed_count += 1
            return CommandResult(success=False, error="Command queue full")

    async def _process_commands(self) -> None:
        """Process commands from queue (background task)."""
        while self.is_processing:
            try:
                # Get command with timeout (blocks in thread pool)
                try:
                    _, _, command = await asyncio.wait_for(
                        asyncio.to_thread(self.command_queue.get, timeout=0.1),
                        timeout=0.2
                    )
                except (asyncio.TimeoutError, queue.Empty):
                    continue

                # Measure processing time
                start_time = datetime.now(timezone.utc)

                # Process command
                result = await self._execute_command(command)

                # Calculate latency
                latency_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
                self.total_latency_ms += latency_ms

                # Set result if future provided
                if command.result_future and not command.result_future.done():
                    command.result_future.set_result(result)

                # Call callback if provided
                if command.callback:
                    try:
                        if asyncio.iscoroutinefunction(command.callback):
                            await command.callback(result)
                        else:
                            command.callback(result)
                    except Exception as e:
                        logger.error(f"Callback error: {e}")

                if result.success:
                    self.processed_count += 1
                else:
                    self.failed_count += 1

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Command processing error: {e}")
                self.failed_count += 1
                await asyncio.sleep(0.1)

    async def _execute_command(self, command: Command) -> CommandResult:
        """Execute a command using registered handler."""
        handler = self._handlers.get(command.type)

        if handler is None:
            logger.warning(f"No handler for command type: {command.type.value}")
            return CommandResult(success=False, error=f"No handler for {command.type.value}")

        try:
            return await handler(command.params)
        except Exception as e:
            logger.error(f"Command execution error ({command.type.value}): {e}")
            return CommandResult(success=False, error=str(e))

    # ==================== Chain Handlers ====================

    async def _handle_create_chain(self, params: Dict[str, Any]) -> CommandResult:
        """Create a new chain."""
        from app.database import get_session, Chain

        name = params.get("name", "New Chain")
        config = params.get("config", {})

        async with get_session() as session:
            chain = Chain(
                name=name,
                config=json.dumps(config) if isinstance(config, dict) else config,
                is_active=params.get("is_active", False)
            )
            session.add(chain)
            await session.flush()

            chain_id = chain.id
            logger.info(f"Created chain: {name} (id={chain_id})")

            return CommandResult(
                success=True,
                data={"chain_id": chain_id, "name": name},
                undo_data={"chain_id": chain_id}
            )

    async def _handle_update_chain(self, params: Dict[str, Any]) -> CommandResult:
        """Update chain properties."""
        from app.database import get_session, Chain

        chain_id = params.get("chain_id")
        if not chain_id:
            return CommandResult(success=False, error="chain_id required")

        async with get_session() as session:
            result = await session.execute(select(Chain).where(Chain.id == chain_id))
            chain = result.scalar_one_or_none()

            if not chain:
                return CommandResult(success=False, error=f"Chain {chain_id} not found")

            # Store old values for undo
            undo_data = {
                "chain_id": chain_id,
                "name": chain.name,
                "config": chain.config,
                "is_active": chain.is_active
            }

            # Apply updates
            if "name" in params:
                chain.name = params["name"]
            if "config" in params:
                chain.config = json.dumps(params["config"]) if isinstance(params["config"], dict) else params["config"]
            if "is_active" in params:
                chain.is_active = params["is_active"]

            logger.info(f"Updated chain: {chain_id}")
            return CommandResult(success=True, data={"chain_id": chain_id}, undo_data=undo_data)

    async def _handle_delete_chain(self, params: Dict[str, Any]) -> CommandResult:
        """Delete a chain."""
        from app.database import get_session, Chain, ChainPlugin

        chain_id = params.get("chain_id")
        if not chain_id:
            return CommandResult(success=False, error="chain_id required")

        async with get_session() as session:
            # Get chain data for undo
            result = await session.execute(
                select(Chain).options(selectinload(Chain.chain_plugins)).where(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()

            if not chain:
                return CommandResult(success=False, error=f"Chain {chain_id} not found")

            undo_data = {
                "name": chain.name,
                "config": chain.config,
                "is_active": chain.is_active,
                "plugins": [
                    {"plugin_uri": cp.plugin_uri, "position": cp.position, "bypass": cp.bypass}
                    for cp in chain.chain_plugins
                ]
            }

            # Delete chain (cascades to chain_plugins)
            session.delete(chain)

            logger.info(f"Deleted chain: {chain_id}")
            return CommandResult(success=True, data={"chain_id": chain_id}, undo_data=undo_data)

    async def _handle_activate_chain(self, params: Dict[str, Any]) -> CommandResult:
        """Activate a chain (deactivate others)."""
        from app.database import get_session, Chain

        chain_id = params.get("chain_id")
        if not chain_id:
            return CommandResult(success=False, error="chain_id required")

        async with get_session() as session:
            # Find currently active chain for undo
            result = await session.execute(select(Chain).where(Chain.is_active == True))
            active_chain = result.scalar_one_or_none()
            undo_data = {"previous_active_id": active_chain.id if active_chain else None}

            # Deactivate all chains
            await session.execute(update(Chain).values(is_active=False))

            # Activate target chain
            await session.execute(
                update(Chain).where(Chain.id == chain_id).values(is_active=True)
            )

            logger.info(f"Activated chain: {chain_id}")
            return CommandResult(success=True, data={"chain_id": chain_id}, undo_data=undo_data)

    # ==================== Plugin Handlers ====================

    async def _handle_add_plugin(self, params: Dict[str, Any]) -> CommandResult:
        """Add plugin to chain."""
        from app.database import get_session, ChainPlugin, Chain

        chain_id = params.get("chain_id")
        plugin_uri = params.get("plugin_uri")
        position = params.get("position")

        if not chain_id or not plugin_uri:
            return CommandResult(success=False, error="chain_id and plugin_uri required")

        async with get_session() as session:
            # Get max position if not specified
            if position is None:
                result = await session.execute(
                    select(ChainPlugin).where(ChainPlugin.chain_id == chain_id)
                )
                existing = result.scalars().all()
                position = max([p.position for p in existing], default=-1) + 1

            # Create chain plugin entry
            chain_plugin = ChainPlugin(
                chain_id=chain_id,
                plugin_uri=plugin_uri,
                position=position,
                bypass=params.get("bypass", False)
            )
            session.add(chain_plugin)
            await session.flush()

            chain_plugin_id = chain_plugin.id
            logger.info(f"Added plugin {plugin_uri} to chain {chain_id} at position {position}")

            return CommandResult(
                success=True,
                data={"chain_plugin_id": chain_plugin_id, "position": position},
                undo_data={"chain_plugin_id": chain_plugin_id}
            )

    async def _handle_remove_plugin(self, params: Dict[str, Any]) -> CommandResult:
        """Remove plugin from chain."""
        from app.database import get_session, ChainPlugin

        chain_plugin_id = params.get("chain_plugin_id")
        if not chain_plugin_id:
            return CommandResult(success=False, error="chain_plugin_id required")

        async with get_session() as session:
            result = await session.execute(
                select(ChainPlugin).where(ChainPlugin.id == chain_plugin_id)
            )
            chain_plugin = result.scalar_one_or_none()

            if not chain_plugin:
                return CommandResult(success=False, error=f"ChainPlugin {chain_plugin_id} not found")

            # Store for undo
            undo_data = {
                "chain_id": chain_plugin.chain_id,
                "plugin_uri": chain_plugin.plugin_uri,
                "position": chain_plugin.position,
                "bypass": chain_plugin.bypass
            }

            session.delete(chain_plugin)

            logger.info(f"Removed plugin from chain: {chain_plugin_id}")
            return CommandResult(success=True, data={"removed_id": chain_plugin_id}, undo_data=undo_data)

    async def _handle_reorder_plugin(self, params: Dict[str, Any]) -> CommandResult:
        """Reorder plugin in chain."""
        from app.database import get_session, ChainPlugin

        chain_plugin_id = params.get("chain_plugin_id")
        new_position = params.get("position")

        if chain_plugin_id is None or new_position is None:
            return CommandResult(success=False, error="chain_plugin_id and position required")

        async with get_session() as session:
            result = await session.execute(
                select(ChainPlugin).where(ChainPlugin.id == chain_plugin_id)
            )
            chain_plugin = result.scalar_one_or_none()

            if not chain_plugin:
                return CommandResult(success=False, error=f"ChainPlugin {chain_plugin_id} not found")

            old_position = chain_plugin.position
            chain_plugin.position = new_position

            logger.info(f"Reordered plugin {chain_plugin_id} from {old_position} to {new_position}")
            return CommandResult(
                success=True,
                data={"chain_plugin_id": chain_plugin_id, "position": new_position},
                undo_data={"chain_plugin_id": chain_plugin_id, "position": old_position}
            )

    async def _handle_set_bypass(self, params: Dict[str, Any]) -> CommandResult:
        """Set plugin bypass state."""
        from app.database import get_session, ChainPlugin

        chain_plugin_id = params.get("chain_plugin_id")
        bypass = params.get("bypass", False)

        if chain_plugin_id is None:
            return CommandResult(success=False, error="chain_plugin_id required")

        async with get_session() as session:
            result = await session.execute(
                select(ChainPlugin).where(ChainPlugin.id == chain_plugin_id)
            )
            chain_plugin = result.scalar_one_or_none()

            if not chain_plugin:
                return CommandResult(success=False, error=f"ChainPlugin {chain_plugin_id} not found")

            old_bypass = chain_plugin.bypass
            chain_plugin.bypass = bypass

            logger.info(f"Set bypass={bypass} for plugin {chain_plugin_id}")
            return CommandResult(
                success=True,
                data={"chain_plugin_id": chain_plugin_id, "bypass": bypass},
                undo_data={"chain_plugin_id": chain_plugin_id, "bypass": old_bypass}
            )

    async def _handle_update_param(self, params: Dict[str, Any]) -> CommandResult:
        """Update plugin parameter (store in Plugin.parameters JSON)."""
        from app.database import get_session, Plugin

        plugin_uri = params.get("plugin_uri")
        param_index = params.get("param_index")
        value = params.get("value")

        if not plugin_uri or param_index is None or value is None:
            return CommandResult(success=False, error="plugin_uri, param_index, and value required")

        async with get_session() as session:
            result = await session.execute(select(Plugin).where(Plugin.uri == plugin_uri))
            plugin = result.scalar_one_or_none()

            if not plugin:
                return CommandResult(success=False, error=f"Plugin {plugin_uri} not found")

            # Parse current parameters
            try:
                parameters = json.loads(plugin.parameters or "{}")
            except json.JSONDecodeError:
                parameters = {}

            old_value = parameters.get(str(param_index))
            parameters[str(param_index)] = value
            plugin.parameters = json.dumps(parameters)

            logger.info(f"Updated param {param_index} on {plugin_uri}: {old_value} -> {value}")
            return CommandResult(
                success=True,
                data={"plugin_uri": plugin_uri, "param_index": param_index, "value": value},
                undo_data={"plugin_uri": plugin_uri, "param_index": param_index, "value": old_value}
            )

    async def _handle_update_priority(self, params: Dict[str, Any]) -> CommandResult:
        """Update plugin DSP priority."""
        from app.database import get_session, Plugin

        plugin_uri = params.get("plugin_uri")
        priority = params.get("priority")

        if not plugin_uri or priority is None:
            return CommandResult(success=False, error="plugin_uri and priority required")

        async with get_session() as session:
            result = await session.execute(select(Plugin).where(Plugin.uri == plugin_uri))
            plugin = result.scalar_one_or_none()

            if not plugin:
                return CommandResult(success=False, error=f"Plugin {plugin_uri} not found")

            old_priority = plugin.priority
            plugin.priority = priority

            logger.info(f"Updated priority for {plugin_uri}: {old_priority} -> {priority}")
            return CommandResult(
                success=True,
                data={"plugin_uri": plugin_uri, "priority": priority},
                undo_data={"plugin_uri": plugin_uri, "priority": old_priority}
            )

    # ==================== MIDI Handlers ====================

    async def _handle_create_midi(self, params: Dict[str, Any]) -> CommandResult:
        """Create MIDI mapping."""
        from app.database import get_session, MIDIMapping

        channel = params.get("channel", 0)
        cc = params.get("cc")
        target_plugin_uri = params.get("target_plugin_uri")
        target_plugin_position = params.get("target_plugin_position")
        target_param_index = params.get("target_param_index")

        if cc is None or not target_plugin_uri or target_param_index is None:
            return CommandResult(success=False, error="cc, target_plugin_uri, and target_param_index required")

        async with get_session() as session:
            mapping = MIDIMapping(
                channel=channel,
                cc=cc,
                target_plugin_uri=target_plugin_uri,
                target_plugin_position=target_plugin_position,
                target_param_index=target_param_index,
                min_val=params.get("min_val", 0.0),
                max_val=params.get("max_val", 1.0),
                is_learned=params.get("is_learned", False)
            )
            session.add(mapping)
            await session.flush()

            mapping_id = mapping.id
            logger.info(f"Created MIDI mapping: CC{cc} -> {target_plugin_uri}[{target_param_index}]")

            return CommandResult(
                success=True,
                data={"mapping_id": mapping_id},
                undo_data={"mapping_id": mapping_id}
            )

    async def _handle_delete_midi(self, params: Dict[str, Any]) -> CommandResult:
        """Delete MIDI mapping."""
        from app.database import get_session, MIDIMapping

        mapping_id = params.get("mapping_id")
        if not mapping_id:
            return CommandResult(success=False, error="mapping_id required")

        async with get_session() as session:
            result = await session.execute(select(MIDIMapping).where(MIDIMapping.id == mapping_id))
            mapping = result.scalar_one_or_none()

            if not mapping:
                return CommandResult(success=False, error=f"Mapping {mapping_id} not found")

            undo_data = {
                "channel": mapping.channel,
                "cc": mapping.cc,
                "target_plugin_uri": mapping.target_plugin_uri,
                "target_plugin_position": mapping.target_plugin_position,
                "target_param_index": mapping.target_param_index,
                "min_val": mapping.min_val,
                "max_val": mapping.max_val,
                "is_learned": mapping.is_learned
            }

            session.delete(mapping)

            logger.info(f"Deleted MIDI mapping: {mapping_id}")
            return CommandResult(success=True, data={"deleted_id": mapping_id}, undo_data=undo_data)

    async def _handle_update_midi(self, params: Dict[str, Any]) -> CommandResult:
        """Update MIDI mapping."""
        from app.database import get_session, MIDIMapping

        mapping_id = params.get("mapping_id")
        if not mapping_id:
            return CommandResult(success=False, error="mapping_id required")

        async with get_session() as session:
            result = await session.execute(select(MIDIMapping).where(MIDIMapping.id == mapping_id))
            mapping = result.scalar_one_or_none()

            if not mapping:
                return CommandResult(success=False, error=f"Mapping {mapping_id} not found")

            # Store old values
            undo_data = {
                "mapping_id": mapping_id,
                "min_val": mapping.min_val,
                "max_val": mapping.max_val
            }

            if "min_val" in params:
                mapping.min_val = params["min_val"]
            if "max_val" in params:
                mapping.max_val = params["max_val"]

            logger.info(f"Updated MIDI mapping: {mapping_id}")
            return CommandResult(success=True, data={"mapping_id": mapping_id}, undo_data=undo_data)

    # ==================== Preset Handlers ====================

    async def _handle_save_preset(self, params: Dict[str, Any]) -> CommandResult:
        """Save preset."""
        from app.database import get_session, Preset

        name = params.get("name")
        chain_id = params.get("chain_id")
        plugin_states = params.get("plugin_states", {})

        if not name or not chain_id:
            return CommandResult(success=False, error="name and chain_id required")

        async with get_session() as session:
            preset = Preset(
                name=name,
                chain_id=chain_id,
                plugin_states=json.dumps(plugin_states) if isinstance(plugin_states, dict) else plugin_states,
                tags=params.get("tags", []),
                category=params.get("category", "User"),
                description=params.get("description", ""),
                is_favorite=params.get("is_favorite", False)
            )
            session.add(preset)
            await session.flush()

            preset_id = preset.id
            logger.info(f"Saved preset: {name} (id={preset_id})")

            return CommandResult(
                success=True,
                data={"preset_id": preset_id, "name": name},
                undo_data={"preset_id": preset_id}
            )

    async def _handle_load_preset(self, params: Dict[str, Any]) -> CommandResult:
        """Load preset (returns plugin states)."""
        from app.database import get_session, Preset

        preset_id = params.get("preset_id")
        if not preset_id:
            return CommandResult(success=False, error="preset_id required")

        async with get_session() as session:
            result = await session.execute(select(Preset).where(Preset.id == preset_id))
            preset = result.scalar_one_or_none()

            if not preset:
                return CommandResult(success=False, error=f"Preset {preset_id} not found")

            try:
                plugin_states = json.loads(preset.plugin_states)
            except json.JSONDecodeError:
                plugin_states = {}

            logger.info(f"Loaded preset: {preset.name}")
            return CommandResult(
                success=True,
                data={
                    "preset_id": preset_id,
                    "name": preset.name,
                    "chain_id": preset.chain_id,
                    "plugin_states": plugin_states
                }
            )

    async def _handle_delete_preset(self, params: Dict[str, Any]) -> CommandResult:
        """Delete preset."""
        from app.database import get_session, Preset

        preset_id = params.get("preset_id")
        if not preset_id:
            return CommandResult(success=False, error="preset_id required")

        async with get_session() as session:
            result = await session.execute(select(Preset).where(Preset.id == preset_id))
            preset = result.scalar_one_or_none()

            if not preset:
                return CommandResult(success=False, error=f"Preset {preset_id} not found")

            undo_data = {
                "name": preset.name,
                "chain_id": preset.chain_id,
                "plugin_states": preset.plugin_states,
                "tags": preset.tags,
                "category": preset.category,
                "description": preset.description,
                "is_favorite": preset.is_favorite
            }

            session.delete(preset)

            logger.info(f"Deleted preset: {preset_id}")
            return CommandResult(success=True, data={"deleted_id": preset_id}, undo_data=undo_data)

    # ==================== System Handlers ====================

    # T2431-G: _handle_update_config removed. Generic system_config writes
    # are no longer a first-class command — every config concept must live
    # in a typed store or State Authority extension. New handlers should
    # target the domain-specific table directly rather than proxying through
    # the key/value escape hatch.

    async def _handle_log_performance(self, params: Dict[str, Any]) -> CommandResult:
        """Log plugin performance data."""
        from app.database import get_session, PluginPerformanceLog

        plugin_uri = params.get("plugin_uri")
        plugin_name = params.get("plugin_name", "Unknown")

        if not plugin_uri:
            return CommandResult(success=False, error="plugin_uri required")

        async with get_session() as session:
            log_entry = PluginPerformanceLog(
                plugin_uri=plugin_uri,
                plugin_name=plugin_name,
                chain_id=params.get("chain_id"),
                avg_time_us=params.get("avg_time_us", 0),
                max_time_us=params.get("max_time_us", 0),
                cpu_percent=params.get("cpu_percent", 0),
                call_count=params.get("call_count", 0),
                sample_rate=params.get("sample_rate", 48000),
                buffer_size=params.get("buffer_size", 256),
                deadline_us=params.get("deadline_us", 5333)
            )
            session.add(log_entry)

            logger.debug(f"Logged performance for {plugin_name}")
            return CommandResult(success=True, data={"plugin_uri": plugin_uri})

    async def _handle_batch_update(self, params: Dict[str, Any]) -> CommandResult:
        """Execute batch of commands atomically."""
        commands = params.get("commands", [])

        if not commands:
            return CommandResult(success=False, error="commands list required")

        results = []
        for cmd_data in commands:
            cmd_type = cmd_data.get("type")
            cmd_params = cmd_data.get("params", {})

            if isinstance(cmd_type, str):
                cmd_type = CommandType(cmd_type)

            result = await self._execute_command(Command(type=cmd_type, params=cmd_params))
            results.append(result)

            if not result.success:
                logger.warning(f"Batch command failed: {cmd_type.value}")

        success = all(r.success for r in results)
        return CommandResult(
            success=success,
            data={"results": [{"success": r.success, "error": r.error} for r in results]}
        )

    # ==================== Statistics ====================

    def get_stats(self) -> Dict[str, Any]:
        """Get queue statistics."""
        avg_latency = (self.total_latency_ms / self.processed_count) if self.processed_count > 0 else 0

        return {
            "is_processing": self.is_processing,
            "queue_size": self.command_queue.qsize(),
            "processed_count": self.processed_count,
            "failed_count": self.failed_count,
            "avg_latency_ms": round(avg_latency, 2),
            "success_rate": round(
                self.processed_count / (self.processed_count + self.failed_count) * 100, 1
            ) if (self.processed_count + self.failed_count) > 0 else 100.0
        }


# Global singleton instance
def get_command_queue() -> CommandQueue:
    """Get or create global command queue instance."""
    return CommandQueue.get_instance()


async def init_command_queue() -> CommandQueue:
    """Initialize and start the global command queue."""
    queue = get_command_queue()
    await queue.start()
    return queue


async def shutdown_command_queue() -> None:
    """Stop the global command queue."""
    queue = get_command_queue()
    if queue.has_instance():
        await queue.stop()


def get_queue_stats() -> Dict[str, Any]:
    """Get command queue statistics for health checks.

    Returns:
        Dictionary with queue statistics.
    """
    queue = get_command_queue()
    return queue.get_stats()
