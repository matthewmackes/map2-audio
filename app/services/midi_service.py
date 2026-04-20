"""
Comprehensive MIDI Service
Unified interface for all MIDI operations with RT-safe database access.

Features:
- Per-chain MIDI mappings
- Program Change chain switching
- Full MIDI output for controller feedback
- MIDI learn mode
- Preset save/load
"""

import asyncio
import inspect
import logging
from typing import List, Dict, Any, Optional, Callable
from datetime import datetime, timezone
from sqlalchemy import select, delete, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.midi_models import (
    ActionType,
    CommandType,
    CurveType,
    MIDICommandDTO,
    MIDIMappingDTO,
)

logger = logging.getLogger(__name__)

try:
    from app.services.midi_hub.hub import get_midi_hub
    from app.services.midi_hub.ports import MidiMessage, VirtualMidiPort
    MIDI_HUB_AVAILABLE = True
except Exception:  # pragma: no cover - optional integration
    MidiMessage = None  # type: ignore[assignment]
    VirtualMidiPort = None  # type: ignore[assignment]
    MIDI_HUB_AVAILABLE = False


class MIDIService:
    """
    Comprehensive MIDI Service with RT-safe operations.

    Design principles:
    - All database operations are async and non-blocking
    - Changes are pushed to JUCE engine via lock-free queue
    - WebSocket events broadcast all state changes
    - Supports batch operations for preset loading
    - Per-chain mapping scope with controller feedback
    """

    def __init__(self):
        self._engine = None
        self._ws_manager = None
        self._learn_active = False
        self._learn_target: Optional[Dict[str, Any]] = None
        self._active_chain_id: Optional[int] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._hub = None
        self._hub_subscriber_id = f"midi_service:{id(self)}"
        self._hub_port_id = "consumer:midi_service"
        self._init_hub_bridge()

    def _init_hub_bridge(self) -> None:
        """Register MIDIService as a MidiHub endpoint for v2 routing."""
        if not MIDI_HUB_AVAILABLE:
            return
        try:
            hub = get_midi_hub()
            if hub.resolve_port(self._hub_port_id) is None:
                hub.register_port(
                    VirtualMidiPort(
                        port_id=self._hub_port_id,
                        name="MIDI Service v2",
                        direction="input",
                    ),
                    open_now=False,
                )
            self._hub = hub
        except Exception as exc:
            logger.debug("MIDIService hub bridge unavailable: %s", exc)

    def _on_hub_message(self, message: MidiMessage) -> None:
        """Handle routed MIDI events from MidiHub."""
        if self._loop is None:
            return
        if message.destination_port not in (None, self._hub_port_id):
            return
        payload = [int(byte) & 0xFF for byte in (message.data or b"")]
        if not payload:
            return
        try:
            asyncio.run_coroutine_threadsafe(self._handle_hub_message(payload), self._loop)
        except Exception as exc:  # pragma: no cover - thread scheduling path
            logger.debug("MIDIService hub callback scheduling failed: %s", exc)

    async def _handle_hub_message(self, payload: List[int]) -> None:
        status = payload[0] & 0xFF
        msg_type = status & 0xF0
        channel = (status & 0x0F) + 1

        # Program Change routing drives chain/snapshot switching in v2 service.
        if msg_type == 0xC0 and len(payload) >= 2:
            program = payload[1] & 0x7F
            try:
                from app.database import get_session

                async with get_session() as session:
                    await self.handle_program_change(channel, program, session)
            except Exception as exc:
                logger.debug("MIDIService hub program-change handling failed: %s", exc)

    def attach_midi_hub(self, loop: Optional[asyncio.AbstractEventLoop] = None) -> None:
        """Subscribe to MidiHub callbacks for runtime message handling."""
        if self._hub is None:
            return
        try:
            self._loop = loop or self._loop or asyncio.get_running_loop()
            if not self._hub.running:
                self._hub.start()
            self._hub.subscribe(self._hub_subscriber_id, self._on_hub_message)
        except Exception as exc:
            logger.debug("Failed to attach MIDIService to MidiHub: %s", exc)

    def detach_midi_hub(self) -> None:
        """Unsubscribe from MidiHub callbacks."""
        if self._hub is None:
            return
        try:
            self._hub.unsubscribe(self._hub_subscriber_id)
        except Exception:
            pass

    def set_engine(self, engine):
        """Set reference to JUCE engine service."""
        self._engine = engine

    def set_websocket_manager(self, ws_manager):
        """Set reference to WebSocket manager for event broadcasting."""
        self._ws_manager = ws_manager

    def set_active_chain(self, chain_id: Optional[int]):
        """Set the currently active chain (affects which mappings are active)."""
        self._active_chain_id = chain_id

    @staticmethod
    def _normalize_feedback_channel(channel: int) -> int:
        """MIDI output cannot transmit on omni, so fall back to channel 1."""
        return channel if 1 <= int(channel) <= 16 else 1

    @staticmethod
    def _normalize_parameter_feedback_value(value: float, min_val: float, max_val: float) -> float:
        """Convert a parameter-space value into a 0..1 controller feedback value."""
        if not isinstance(value, (int, float)):
            return 0.0
        if max_val == min_val:
            return 0.0
        normalized = (float(value) - float(min_val)) / (float(max_val) - float(min_val))
        return max(0.0, min(1.0, normalized))

    async def _call_engine_method(self, *method_names: str, args: tuple = (), kwargs: Optional[Dict[str, Any]] = None) -> Any:
        """Call the first available engine method, handling sync and async implementations."""
        if not self._engine:
            return None
        call_kwargs = kwargs or {}

        for method_name in method_names:
            method = getattr(self._engine, method_name, None)
            if not callable(method):
                continue
            try:
                result = method(*args, **call_kwargs)
            except TypeError:
                result = method(*args)
            if inspect.isawaitable(result):
                return await result
            return result

        return None

    # ==================== CC Mappings ====================

    async def create_mapping(self, mapping: MIDIMappingDTO, session: AsyncSession) -> Optional[int]:
        """Create a new MIDI CC mapping."""
        try:
            from app.database import MIDIMapping

            db_mapping = MIDIMapping(
                channel=mapping.channel,
                cc=mapping.cc,
                chain_id=mapping.chain_id,
                target_plugin_uri=mapping.target_plugin_uri,
                target_plugin_position=mapping.target_plugin_position,
                target_param_index=mapping.target_param_index,
                target_param_symbol=mapping.target_param_symbol,
                min_val=mapping.min_val,
                max_val=mapping.max_val,
                curve_type=mapping.curve_type.value if isinstance(mapping.curve_type, CurveType) else mapping.curve_type,
                invert=mapping.invert,
                feedback_enabled=mapping.feedback_enabled,
                feedback_cc=mapping.feedback_cc,
                name=mapping.name,
                group_id=mapping.group_id,
                is_learned=mapping.is_learned,
                is_enabled=mapping.is_enabled,
            )
            session.add(db_mapping)
            await session.flush()
            mapping_id = db_mapping.id

            logger.info(f"Created MIDI mapping {mapping_id}: CH{mapping.channel} CC{mapping.cc} -> {mapping.target_plugin_uri}")

            # Push to JUCE engine if this mapping is for the active chain
            if self._engine and mapping.chain_id == self._active_chain_id:
                await self._sync_mapping_to_engine(mapping_id, session)

            # Broadcast WebSocket event
            await self._broadcast_event("midi_mapping_created", {
                "id": mapping_id,
                "channel": mapping.channel,
                "cc": mapping.cc,
                "chain_id": mapping.chain_id,
            })

            return mapping_id

        except Exception as e:
            import traceback
            logger.error(f"Error creating MIDI mapping: {e}")
            logger.error(traceback.format_exc())
            raise  # Re-raise so the route can handle it

    async def update_mapping(self, mapping_id: int, updates: Dict[str, Any], session: AsyncSession) -> bool:
        """Update an existing MIDI mapping."""
        try:
            from app.database import MIDIMapping

            result = await session.execute(
                select(MIDIMapping).filter(MIDIMapping.id == mapping_id)
            )
            mapping = result.scalar_one_or_none()
            if not mapping:
                return False

            for key, value in updates.items():
                if hasattr(mapping, key):
                    setattr(mapping, key, value)
            mapping.updated_at = datetime.now(timezone.utc)
            await session.flush()

            logger.info(f"Updated MIDI mapping {mapping_id}")

            # Sync to engine if active
            if self._engine and mapping.chain_id == self._active_chain_id:
                await self._sync_mapping_to_engine(mapping_id, session)

            await self._broadcast_event("midi_mapping_updated", {"id": mapping_id, "updates": updates})
            return True

        except Exception as e:
            logger.error(f"Error updating MIDI mapping {mapping_id}: {e}")
            return False

    async def delete_mapping(self, mapping_id: int, session: AsyncSession) -> bool:
        """Delete a MIDI mapping."""
        try:
            from app.database import MIDIMapping

            result = await session.execute(
                select(MIDIMapping).filter(MIDIMapping.id == mapping_id)
            )
            mapping = result.scalar_one_or_none()
            if not mapping:
                return False

            channel, cc = mapping.channel, mapping.cc
            await session.delete(mapping)
            await session.flush()

            logger.info(f"Deleted MIDI mapping {mapping_id}")

            # Remove from engine
            if self._engine:
                await self._engine.remove_midi_cc_mapping(channel, cc)

            await self._broadcast_event("midi_mapping_deleted", {"id": mapping_id})
            return True

        except Exception as e:
            logger.error(f"Error deleting MIDI mapping {mapping_id}: {e}")
            return False

    async def get_mapping(self, mapping_id: int, session: AsyncSession) -> Optional[Dict[str, Any]]:
        """Get a single mapping by ID."""
        try:
            from app.database import MIDIMapping

            result = await session.execute(
                select(MIDIMapping).filter(MIDIMapping.id == mapping_id)
            )
            mapping = result.scalar_one_or_none()
            if not mapping:
                return None
            return self._mapping_to_dict(mapping)

        except Exception as e:
            logger.error(f"Error getting MIDI mapping {mapping_id}: {e}")
            return None

    async def send_mapping_feedback_test(
        self,
        mapping_id: int,
        session: AsyncSession,
        normalized_value: Optional[float] = None,
        use_current_value: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Send a real outbound feedback message for a mapping."""
        mapping = await self.get_mapping(mapping_id, session)
        if not mapping:
            return None
        if not self._engine:
            raise RuntimeError("MIDI engine is not available")

        feedback_cc = mapping.get("feedback_cc") or mapping["cc"]
        output_channel = self._normalize_feedback_channel(mapping.get("channel", 0))

        if use_current_value:
            current_value = await self._call_engine_method(
                "get_plugin_parameter",
                args=(mapping["target_plugin_uri"], mapping["target_param_index"]),
                kwargs={"plugin_position": mapping.get("target_plugin_position")},
            )
            if current_value is None:
                raise RuntimeError("The engine did not return a current parameter value")
            normalized = self._normalize_parameter_feedback_value(
                float(current_value),
                float(mapping["min_val"]),
                float(mapping["max_val"]),
            )
            source = "current"
        else:
            normalized = max(0.0, min(1.0, float(normalized_value if normalized_value is not None else 1.0)))
            source = "manual"

        feedback_sent = await self._call_engine_method(
            "send_parameter_feedback",
            "midi_send_parameter_feedback",
            args=(output_channel, feedback_cc, normalized),
        )

        if feedback_sent is None:
            cc_value = int(round(normalized * 127))
            feedback_sent = await self._call_engine_method(
                "send_cc",
                "midi_send_cc",
                args=(output_channel, feedback_cc, cc_value),
            )
        else:
            cc_value = int(round(normalized * 127))

        if feedback_sent is None:
            raise RuntimeError("The MIDI engine does not support outbound controller feedback")

        return {
            "mapping_id": mapping_id,
            "channel": output_channel,
            "cc": feedback_cc,
            "normalized_value": normalized,
            "cc_value": cc_value,
            "source": source,
        }

    async def get_all_mappings(self, session: AsyncSession, chain_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get all MIDI mappings, optionally filtered by chain."""
        try:
            from app.database import MIDIMapping

            query = select(MIDIMapping).order_by(MIDIMapping.channel, MIDIMapping.cc)
            if chain_id is not None:
                query = query.filter(MIDIMapping.chain_id == chain_id)

            result = await session.execute(query)
            mappings = result.scalars().all()
            return [self._mapping_to_dict(m) for m in mappings]

        except Exception as e:
            logger.error(f"Error getting MIDI mappings: {e}")
            return []

    async def get_mappings_for_plugin(
        self,
        plugin_uri: str,
        session: AsyncSession,
        plugin_position: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Get mappings for a specific plugin."""
        try:
            from app.database import MIDIMapping

            query = select(MIDIMapping).filter(MIDIMapping.target_plugin_uri == plugin_uri)
            if plugin_position is not None:
                query = query.filter(MIDIMapping.target_plugin_position == plugin_position)
            result = await session.execute(query)
            mappings = result.scalars().all()
            return [self._mapping_to_dict(m) for m in mappings]

        except Exception as e:
            logger.error(f"Error getting mappings for plugin {plugin_uri}: {e}")
            return []

    async def get_active_mappings(self, session: AsyncSession) -> List[Dict[str, Any]]:
        """Get mappings for the currently active chain."""
        if self._active_chain_id is None:
            return []
        return await self.get_all_mappings(session, chain_id=self._active_chain_id)

    # ==================== Commands ====================

    async def create_command(
        self,
        command: MIDICommandDTO,
        session: AsyncSession
    ) -> Optional[int]:
        """Create a MIDI command trigger."""
        try:
            from app.database import MIDICommand

            db_command = MIDICommand(
                command_type=command.command_type.value if isinstance(command.command_type, CommandType) else command.command_type,
                channel=command.channel,
                data1=command.data1,
                data2=command.data2,
                action_type=command.action_type.value if isinstance(command.action_type, ActionType) else command.action_type,
                target_chain_id=command.target_chain_id,
                target_plugin_uri=command.target_plugin_uri,
                target_plugin_position=command.target_plugin_position,
                action_data=command.action_data,
                name=command.name,
                is_enabled=command.is_enabled,
            )
            session.add(db_command)
            await session.flush()
            command_id = db_command.id

            logger.info(f"Created MIDI command {command_id}: {command.command_type} -> {command.action_type}")

            if self._engine:
                await self._sync_command_to_engine(command_id, session)

            await self._broadcast_event("midi_command_created", {"id": command_id})
            return command_id

        except Exception as e:
            logger.error(f"Error creating MIDI command: {e}")
            return None

    async def get_command(self, command_id: int, session: AsyncSession) -> Optional[Dict[str, Any]]:
        """Get a single MIDI command by ID."""
        try:
            from app.database import MIDICommand

            result = await session.execute(
                select(MIDICommand).filter(MIDICommand.id == command_id)
            )
            command = result.scalar_one_or_none()
            if not command:
                return None
            return self._command_to_dict(command)

        except Exception as e:
            logger.error(f"Error getting MIDI command {command_id}: {e}")
            return None

    async def get_all_commands(self, session: AsyncSession) -> List[Dict[str, Any]]:
        """Get all MIDI commands."""
        try:
            from app.database import MIDICommand

            result = await session.execute(select(MIDICommand))
            commands = result.scalars().all()
            return [self._command_to_dict(c) for c in commands]

        except Exception as e:
            logger.error(f"Error getting MIDI commands: {e}")
            return []

    async def update_command(self, command_id: int, updates: Dict[str, Any], session: AsyncSession) -> bool:
        """Update an existing MIDI command."""
        try:
            from app.database import MIDICommand

            result = await session.execute(
                select(MIDICommand).filter(MIDICommand.id == command_id)
            )
            command = result.scalar_one_or_none()
            if not command:
                return False

            for key, value in updates.items():
                if hasattr(command, key):
                    setattr(command, key, value)

            await session.flush()

            logger.info(f"Updated MIDI command {command_id}")

            if self._engine:
                await self._sync_command_to_engine(command_id, session)

            await self._broadcast_event("midi_command_updated", {"id": command_id, "updates": updates})
            return True

        except Exception as e:
            logger.error(f"Error updating MIDI command {command_id}: {e}")
            return False

    async def delete_command(self, command_id: int, session: AsyncSession) -> bool:
        """Delete a MIDI command."""
        try:
            from app.database import MIDICommand

            result = await session.execute(
                select(MIDICommand).filter(MIDICommand.id == command_id)
            )
            command = result.scalar_one_or_none()
            if not command:
                return False

            await session.delete(command)
            await session.flush()

            logger.info(f"Deleted MIDI command {command_id}")
            if self._engine:
                await self._sync_all_commands_to_engine(session)
            await self._broadcast_event("midi_command_deleted", {"id": command_id})
            return True

        except Exception as e:
            logger.error(f"Error deleting MIDI command {command_id}: {e}")
            return False

    # ==================== Chain MIDI Config ====================

    async def set_chain_program_number(
        self,
        chain_id: int,
        program_number: int,
        session: AsyncSession,
        bank_msb: int = 0,
        bank_lsb: int = 0
    ) -> bool:
        """Set the Program Change number for a chain."""
        try:
            from app.database import ChainMIDIConfig

            # Check if config exists
            result = await session.execute(
                select(ChainMIDIConfig).filter(ChainMIDIConfig.chain_id == chain_id)
            )
            config = result.scalar_one_or_none()

            if config:
                config.program_number = program_number
                config.bank_msb = bank_msb
                config.bank_lsb = bank_lsb
            else:
                config = ChainMIDIConfig(
                    chain_id=chain_id,
                    program_number=program_number,
                    bank_msb=bank_msb,
                    bank_lsb=bank_lsb
                )
                session.add(config)

            await session.flush()
            logger.info(f"Set chain {chain_id} program number to {program_number}")
            return True

        except Exception as e:
            logger.error(f"Error setting chain program number: {e}")
            return False

    async def get_chain_by_program(
        self,
        program_number: int,
        session: AsyncSession,
        bank_msb: int = 0,
        bank_lsb: int = 0
    ) -> Optional[int]:
        """Get chain ID by Program Change number."""
        try:
            from app.database import ChainMIDIConfig

            result = await session.execute(
                select(ChainMIDIConfig).filter(
                    and_(
                        ChainMIDIConfig.program_number == program_number,
                        ChainMIDIConfig.bank_msb == bank_msb,
                        ChainMIDIConfig.bank_lsb == bank_lsb
                    )
                )
            )
            config = result.scalar_one_or_none()
            return config.chain_id if config else None

        except Exception as e:
            logger.error(f"Error getting chain by program: {e}")
            return None

    async def handle_program_change(
        self,
        channel: int,
        program: int,
        session: AsyncSession
    ) -> Optional[int]:
        """Handle incoming Program Change by recalling snapshots first, then chains."""
        # First, check if a snapshot is mapped to this PC
        snapshot_loaded = await self._try_load_snapshot_by_program(program, session)
        if snapshot_loaded:
            return None  # Signal that snapshot was loaded, not a chain

        # Fall back to chain switching
        chain_id = await self.get_chain_by_program(program, session)
        if chain_id is None:
            logger.debug(f"No chain or snapshot mapped to PC#{program}")
            return None

        # Activate the chain
        await self.activate_chain(chain_id, session)
        return chain_id

    async def _try_load_snapshot_by_program(
        self,
        program: int,
        session: AsyncSession
    ) -> bool:
        """Try to load a snapshot by MIDI program number.

        Returns True if a snapshot was found and loaded, False otherwise.
        """
        try:
            from app.services.snapshot_service import SnapshotService

            snapshot_service = SnapshotService(session)
            snapshot = await snapshot_service.get_snapshot_by_program(program)
            if snapshot is None:
                return False

            activation = await snapshot_service.activate_snapshot(snapshot["id"], triggered_by="midi_pc")
            if activation is None:
                return False

            logger.info("Loaded snapshot '%s' via MIDI PC#%s", activation["name"], program)
            return True

        except Exception as e:
            logger.error(f"Error loading snapshot by program: {e}")
            return False

    # ==================== Chain Activation ====================

    async def activate_chain(self, chain_id: int, session: AsyncSession) -> bool:
        """Activate a chain and its MIDI mappings."""
        try:
            from app.database import Chain, ChainMIDIConfig

            # Get chain
            result = await session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            if not chain:
                return False

            # Update active chain
            old_chain_id = self._active_chain_id
            self._active_chain_id = chain_id
            chain.is_active = True

            # Deactivate old chain
            if old_chain_id and old_chain_id != chain_id:
                old_result = await session.execute(
                    select(Chain).filter(Chain.id == old_chain_id)
                )
                old_chain = old_result.scalar_one_or_none()
                if old_chain:
                    old_chain.is_active = False

            await session.flush()

            # Sync all mappings for new chain to engine
            await self._sync_all_mappings_to_engine(session)

            # Send controller feedback (sync motorized faders, LEDs)
            await self._send_chain_feedback(chain_id, session)

            # Send PC back to controller
            midi_config_result = await session.execute(
                select(ChainMIDIConfig).filter(ChainMIDIConfig.chain_id == chain_id)
            )
            midi_config = midi_config_result.scalar_one_or_none()
            if midi_config and midi_config.send_pc_on_activate and self._engine:
                await self._engine.send_program_change(0, midi_config.program_number)

            logger.info(f"Activated chain {chain_id}")
            await self._broadcast_event("chain_activated", {
                "chain_id": chain_id,
                "previous_chain_id": old_chain_id
            })

            return True

        except Exception as e:
            logger.error(f"Error activating chain {chain_id}: {e}")
            return False

    # ==================== MIDI Learn ====================

    async def start_learn(
        self,
        chain_id: int,
        plugin_uri: str,
        param_index: int,
        plugin_position: Optional[int] = None,
        param_symbol: str = "",
        min_val: float = 0.0,
        max_val: float = 1.0,
        curve: CurveType = CurveType.LINEAR
    ) -> bool:
        """Start MIDI learn mode for a parameter."""
        self._learn_active = True
        self._learn_target = {
            "chain_id": chain_id,
            "plugin_uri": plugin_uri,
            "plugin_position": plugin_position,
            "param_index": param_index,
            "param_symbol": param_symbol,
            "min_val": min_val,
            "max_val": max_val,
            "curve": curve,
        }

        # Tell JUCE to listen
        if self._engine:
            await self._engine.start_midi_learn(
                plugin_uri,
                param_index,
                chain_id=chain_id or 0,
                plugin_position=plugin_position,
                param_symbol=param_symbol,
                min_val=min_val,
                max_val=max_val,
                curve=curve.value if isinstance(curve, CurveType) else str(curve),
            )

        logger.info(f"Started MIDI learn for {plugin_uri}:{param_index}")
        await self._broadcast_event("midi_learn_started", self._learn_target)
        return True

    async def stop_learn(self) -> bool:
        """Stop MIDI learn mode."""
        self._learn_active = False
        self._learn_target = None

        if self._engine:
            await self._engine.stop_midi_learn()

        logger.info("Stopped MIDI learn")
        await self._broadcast_event("midi_learn_stopped", {})
        return True

    async def complete_learn(self, channel: int, cc: int, session: AsyncSession) -> Optional[int]:
        """Called when MIDI learn captures a CC. Creates the mapping."""
        if not self._learn_active or not self._learn_target:
            return None

        target = self._learn_target

        # Create mapping from learned CC
        mapping = MIDIMappingDTO(
            channel=channel,
            cc=cc,
            chain_id=target["chain_id"],
            target_plugin_uri=target["plugin_uri"],
            target_plugin_position=target.get("plugin_position"),
            target_param_index=target["param_index"],
            target_param_symbol=target.get("param_symbol", ""),
            min_val=target.get("min_val", 0.0),
            max_val=target.get("max_val", 1.0),
            curve_type=target.get("curve", CurveType.LINEAR),
            is_learned=True,
            is_enabled=True,
            name=f"Learned: CC{cc}",
        )

        mapping_id = await self.create_mapping(mapping, session)
        await self.stop_learn()

        logger.info(f"Completed MIDI learn: CH{channel} CC{cc} -> mapping {mapping_id}")
        await self._broadcast_event("midi_learn_completed", {
            "mapping_id": mapping_id,
            "channel": channel,
            "cc": cc,
        })

        return mapping_id

    def get_learn_status(self) -> Dict[str, Any]:
        """Get current learn mode status."""
        return {
            "active": self._learn_active,
            "target": self._learn_target,
        }

    # ==================== Presets ====================

    async def save_preset(self, name: str, session: AsyncSession, description: str = "") -> Optional[int]:
        """Save current MIDI configuration as a preset."""
        try:
            from app.database import MIDIPreset

            mappings = await self.get_all_mappings(session)
            commands = await self.get_all_commands(session)

            preset = MIDIPreset(
                name=name,
                description=description,
                mappings_snapshot=mappings,
                commands_snapshot=commands,
            )
            session.add(preset)
            await session.flush()

            logger.info(f"Saved MIDI preset '{name}' with {len(mappings)} mappings")
            await self._broadcast_event("midi_preset_saved", {"id": preset.id, "name": name})
            return preset.id

        except Exception as e:
            logger.error(f"Error saving MIDI preset: {e}")
            return None

    async def load_preset(self, preset_id: int, session: AsyncSession) -> bool:
        """Load a MIDI preset, replacing current configuration."""
        try:
            from app.database import MIDIPreset, MIDIMapping, MIDICommand

            result = await session.execute(
                select(MIDIPreset).filter(MIDIPreset.id == preset_id)
            )
            preset = result.scalar_one_or_none()
            if not preset:
                return False

            # Clear current mappings and commands
            await session.execute(delete(MIDIMapping))
            await session.execute(delete(MIDICommand))

            # Restore from snapshot
            for m in preset.mappings_snapshot:
                mapping = MIDIMapping(**{k: v for k, v in m.items() if k not in ('id', 'created_at', 'updated_at')})
                session.add(mapping)

            for c in preset.commands_snapshot:
                command = MIDICommand(**{k: v for k, v in c.items() if k not in ('id', 'created_at')})
                session.add(command)

            await session.flush()

            # Sync all to engine
            await self._sync_all_mappings_to_engine(session)
            await self._sync_all_commands_to_engine(session)

            logger.info(f"Loaded MIDI preset '{preset.name}'")
            await self._broadcast_event("midi_preset_loaded", {"id": preset_id, "name": preset.name})
            return True

        except Exception as e:
            logger.error(f"Error loading MIDI preset {preset_id}: {e}")
            return False

    async def list_presets(self, session: AsyncSession) -> List[Dict[str, Any]]:
        """List all MIDI presets."""
        try:
            from app.database import MIDIPreset

            result = await session.execute(select(MIDIPreset))
            presets = result.scalars().all()
            return [{
                "id": p.id,
                "name": p.name,
                "description": p.description or "",
                "mappings_count": len(p.mappings_snapshot) if p.mappings_snapshot else 0,
                "commands_count": len(p.commands_snapshot) if p.commands_snapshot else 0,
                "is_default": p.is_default,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            } for p in presets]

        except Exception as e:
            logger.error(f"Error listing MIDI presets: {e}")
            return []

    async def delete_preset(self, preset_id: int, session: AsyncSession) -> bool:
        """Delete a MIDI preset."""
        try:
            from app.database import MIDIPreset

            result = await session.execute(
                select(MIDIPreset).filter(MIDIPreset.id == preset_id)
            )
            preset = result.scalar_one_or_none()
            if not preset:
                return False

            await session.delete(preset)
            await session.flush()

            logger.info(f"Deleted MIDI preset {preset_id}")
            return True

        except Exception as e:
            logger.error(f"Error deleting MIDI preset {preset_id}: {e}")
            return False

    # ==================== Mapping Groups ====================

    async def create_group(self, name: str, session: AsyncSession, color: str = "#808080", description: str = "") -> Optional[int]:
        """Create a MIDI mapping group."""
        try:
            from app.database import MIDIMappingGroup

            group = MIDIMappingGroup(
                name=name,
                description=description,
                color=color,
            )
            session.add(group)
            await session.flush()
            return group.id

        except Exception as e:
            logger.error(f"Error creating mapping group: {e}")
            return None

    async def get_all_groups(self, session: AsyncSession) -> List[Dict[str, Any]]:
        """Get all mapping groups."""
        try:
            from app.database import MIDIMappingGroup

            result = await session.execute(
                select(MIDIMappingGroup).order_by(MIDIMappingGroup.display_order)
            )
            groups = result.scalars().all()
            return [{
                "id": g.id,
                "name": g.name,
                "description": g.description or "",
                "color": g.color or "#808080",
                "display_order": g.display_order,
            } for g in groups]

        except Exception as e:
            logger.error(f"Error getting mapping groups: {e}")
            return []

    # ==================== Engine Sync ====================

    async def _sync_mapping_to_engine(self, mapping_id: int, session: AsyncSession):
        """Sync a single mapping to the JUCE engine (or Tesira if tesira:// URI)."""
        from app.database import MIDIMapping

        result = await session.execute(
            select(MIDIMapping).filter(MIDIMapping.id == mapping_id)
        )
        m = result.scalar_one_or_none()
        if not m:
            return

        # Intercept Tesira-targeted mappings before sending to JUCE engine
        if m.target_plugin_uri and m.target_plugin_uri.startswith("tesira://"):
            await TesiraMidiDispatcher.dispatch(m.target_plugin_uri)
            return

        if not self._engine:
            return

        await self._engine.set_midi_cc_mapping(
            mapping_id=m.id,
            channel=m.channel,
            cc=m.cc,
            plugin_uri=m.target_plugin_uri,
            plugin_position=m.target_plugin_position,
            param_index=m.target_param_index,
            param_symbol=m.target_param_symbol or "",
            min_val=m.min_val,
            max_val=m.max_val,
            curve=m.curve_type,
            invert=m.invert,
            enabled=m.is_enabled,
            feedback_enabled=m.feedback_enabled,
            feedback_cc=m.feedback_cc,
            chain_id=m.chain_id,
        )

    async def _sync_command_to_engine(self, command_id: int, session: AsyncSession):
        """Sync a command trigger to the JUCE engine."""
        if not self._engine:
            return

        from app.database import MIDICommand

        result = await session.execute(
            select(MIDICommand).filter(MIDICommand.id == command_id)
        )
        c = result.scalar_one_or_none()
        if not c:
            return

        await self._engine.set_midi_command(
            command_id=c.id,
            command_type=c.command_type,
            channel=c.channel,
            data1=c.data1,
            data2=c.data2,
            action_type=c.action_type,
            target_chain_id=c.target_chain_id,
            target_plugin_uri=c.target_plugin_uri or "",
            target_plugin_position=c.target_plugin_position,
            action_data=c.action_data or {},
            enabled=c.is_enabled,
        )

    async def _sync_all_mappings_to_engine(self, session: AsyncSession):
        """Sync all mappings for active chain to engine."""
        if not self._engine:
            return

        mappings = await self.get_active_mappings(session)
        await self._engine.set_all_midi_mappings(mappings)

    async def _sync_all_commands_to_engine(self, session: AsyncSession):
        """Sync all commands to engine."""
        if not self._engine:
            return

        commands = await self.get_all_commands(session)
        await self._engine.set_all_midi_commands(commands)

    async def _send_chain_feedback(self, chain_id: int, session: AsyncSession):
        """Send current parameter values to controller on chain switch."""
        if not self._engine:
            return

        mappings = await self.get_all_mappings(session, chain_id=chain_id)

        for mapping in mappings:
            if not mapping.get("feedback_enabled", True):
                continue

            # Get current parameter value from engine
            value = await self._call_engine_method(
                "get_plugin_parameter",
                args=(mapping["target_plugin_uri"], mapping["target_param_index"]),
                kwargs={"plugin_position": mapping.get("target_plugin_position")},
            )

            if value is not None:
                feedback_cc = mapping.get("feedback_cc") or mapping["cc"]
                output_channel = self._normalize_feedback_channel(mapping.get("channel", 0))
                normalized = self._normalize_parameter_feedback_value(
                    float(value),
                    float(mapping["min_val"]),
                    float(mapping["max_val"]),
                )

                feedback_sent = await self._call_engine_method(
                    "send_parameter_feedback",
                    "midi_send_parameter_feedback",
                    args=(output_channel, feedback_cc, normalized),
                )
                if feedback_sent is None:
                    cc_value = int(round(normalized * 127))
                    await self._call_engine_method(
                        "send_cc",
                        "midi_send_cc",
                        args=(output_channel, feedback_cc, cc_value),
                    )

    # ==================== WebSocket Broadcasting ====================

    async def _broadcast_event(self, event_type: str, data: Dict[str, Any]):
        """Broadcast MIDI event via WebSocket."""
        if self._ws_manager:
            try:
                await self._ws_manager.broadcast_json({
                    "type": event_type,
                    "topic": "midi",
                    "data": data,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }, topic="midi")
            except Exception as e:
                logger.debug(f"WebSocket broadcast failed: {e}")

    # ==================== Helpers ====================

    def _mapping_to_dict(self, m) -> Dict[str, Any]:
        """Convert MIDIMapping ORM object to dict."""
        return {
            "id": m.id,
            "channel": m.channel,
            "cc": m.cc,
            "chain_id": m.chain_id,
            "target_plugin_uri": m.target_plugin_uri,
            "target_plugin_position": m.target_plugin_position,
            "target_param_index": m.target_param_index,
            "target_param_symbol": m.target_param_symbol or "",
            "min_val": m.min_val,
            "max_val": m.max_val,
            "curve_type": m.curve_type,
            "invert": m.invert,
            "feedback_enabled": m.feedback_enabled,
            "feedback_cc": m.feedback_cc,
            "name": m.name or "",
            "group_id": m.group_id,
            "is_learned": m.is_learned,
            "is_enabled": m.is_enabled,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "updated_at": m.updated_at.isoformat() if m.updated_at else None,
        }

    def _command_to_dict(self, c) -> Dict[str, Any]:
        """Convert MIDICommand ORM object to dict."""
        return {
            "id": c.id,
            "command_type": c.command_type,
            "channel": c.channel,
            "data1": c.data1,
            "data2": c.data2,
            "action_type": c.action_type,
            "target_chain_id": c.target_chain_id,
            "target_plugin_uri": c.target_plugin_uri,
            "target_plugin_position": c.target_plugin_position,
            "action_data": c.action_data or {},
            "name": c.name or "",
            "is_enabled": c.is_enabled,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }


# Global service instance
midi_service = MIDIService()


# ──────────────────────────────────────────────────────────────────────────────
# Tesira MIDI Dispatcher
# ──────────────────────────────────────────────────────────────────────────────

class TesiraMidiDispatcher:
    """
    Dispatches MIDI CC values to Tesira DSP parameters via the TesiraFleet.

    URI scheme stored in MIDIMapping.target_plugin_uri:
        tesira://<device_id>/<instance_tag>/level/<channel>
        tesira://<device_id>/<instance_tag>/mute/<channel>
        tesira://<device_id>/device/preset/<preset_index>

    This is called from MIDIService._sync_mapping_to_engine() when the
    target_plugin_uri starts with "tesira://".

    Note: value mapping (CC 0-127 → parameter range) is handled by the
    JUCE engine in the normal path. For Tesira targets we receive the
    already-scaled float value from the mapping's min_val/max_val.
    """
    _hub_port_id = "consumer:tesira_dispatch"

    @staticmethod
    def _emit_hub_message(parsed: Dict[str, str], value: float) -> None:
        """Emit a synthetic MIDI event to MidiHub for unified diagnostics/routing."""
        try:
            from app.services.midi_hub.hub import get_midi_hub
            from app.services.midi_hub.ports import VirtualMidiPort
        except Exception:
            return

        try:
            hub = get_midi_hub()
            if hub.resolve_port(TesiraMidiDispatcher._hub_port_id) is None:
                hub.register_port(
                    VirtualMidiPort(
                        port_id=TesiraMidiDispatcher._hub_port_id,
                        name="Tesira MIDI Dispatcher",
                        direction="output",
                    ),
                    open_now=False,
                )
            action = parsed.get("action", "")
            channel = max(0, min(15, int(parsed.get("channel", "1")) - 1))
            if action == "preset":
                payload = bytes([0xC0 | channel, max(0, min(127, int(float(value))))])
            elif action == "mute":
                payload = bytes([0xB0 | channel, 0x78, 127 if value > 0.5 else 0])
            else:
                scaled = int(max(0, min(127, round(float(value)))))
                payload = bytes([0xB0 | channel, 0x07, scaled])
            hub.send(
                source_port=TesiraMidiDispatcher._hub_port_id,
                destination_port=f"tesira:{parsed.get('device_id', 'unknown')}",
                data=payload,
                metadata={
                    "bridge": "tesira_dispatch",
                    "instance_tag": parsed.get("instance_tag"),
                    "action": action,
                },
            )
        except Exception:
            return

    @staticmethod
    async def dispatch(uri: str, value: float = 0.0) -> None:
        """
        Parse a tesira:// URI and dispatch the control value to the device.
        value should already be scaled to the parameter range by the caller.
        """
        try:
            parsed = TesiraMidiDispatcher._parse_uri(uri)
        except ValueError as exc:
            import logging
            logging.getLogger(__name__).warning("TesiraMidiDispatcher: bad URI %r: %s", uri, exc)
            return

        try:
            from app.services.tesira import get_tesira_fleet
            fleet = get_tesira_fleet()
            device = fleet.get_device(parsed['device_id'])
            if device is None or not device.connected:
                return

            action = parsed['action']
            if action == 'level':
                await device.set_level(parsed['instance_tag'], int(parsed['channel']), value)
            elif action == 'mute':
                await device.set_mute(parsed['instance_tag'], int(parsed['channel']), value > 0.5)
            elif action == 'preset':
                await device.recall_preset(int(parsed['channel']))
            TesiraMidiDispatcher._emit_hub_message(parsed, value)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error(
                "TesiraMidiDispatcher: dispatch error for %r: %s", uri, exc
            )

    @staticmethod
    def _parse_uri(uri: str) -> dict:
        """
        Parse tesira://<device_id>/<instance_tag>/<action>/<channel_or_index>

        Returns: {device_id, instance_tag, action, channel}
        Raises ValueError on malformed URI.
        """
        if not uri.startswith("tesira://"):
            raise ValueError(f"Not a tesira:// URI: {uri!r}")
        path = uri[len("tesira://"):]
        parts = path.split('/')
        if len(parts) < 4:
            raise ValueError(
                f"tesira:// URI requires at least 4 path segments: {uri!r}"
            )
        return {
            'device_id': parts[0],
            'instance_tag': parts[1],
            'action': parts[2],         # 'level', 'mute', 'preset'
            'channel': parts[3],        # channel index or preset index (string)
        }
