"""JUCE SnapshotBridge methods for JuceEngineService."""

from .common import *


class JuceSnapshotBridgeMixin:
    """Focused JUCE engine service behavior mixed into the public service."""

    async def get_current_pedalboard(self) -> Dict[str, Any]:
        """Get current pedalboard configuration"""
        if not self._engine:
            return {"name": "none", "plugins": [], "items": []}
        return await self._run_engine_call(
            "get_current_pedalboard",
            default={"name": "none", "plugins": [], "items": []},
        )

    async def get_loaded_plugins(self) -> List[Dict[str, Any]]:
        """List every loaded plugin instance, including detached residents."""
        if not self._engine:
            return []
        return await asyncio.to_thread(self._engine.get_loaded_plugins)

    async def clear_chain(self) -> None:
        """Clear the active chain topology without unloading plugin instances."""
        if not self._engine:
            return
        await asyncio.to_thread(self._engine.clear_chain)

    async def replace_chain(self, order: List[int]) -> bool:
        """Replace the active chain order in one topology mutation."""
        if not self._engine:
            return False
        return await asyncio.to_thread(self._engine.replace_chain, list(order))

    async def replace_chain_with_spillover(self, order: List[int]) -> bool:
        """Replace the active chain order while preserving outgoing wet tails when possible."""
        if not self._engine or not hasattr(self._engine, "replace_chain_with_spillover"):
            return False
        return await asyncio.to_thread(self._engine.replace_chain_with_spillover, list(order))

    async def apply_routing_topology(self, spec: Dict[str, Any]) -> bool:
        """Replace chain, parallel-group, and sidechain topology in one engine mutation."""
        if not self._engine or not hasattr(self._engine, "apply_routing_topology"):
            return False
        return await asyncio.to_thread(self._engine.apply_routing_topology, dict(spec))

    async def get_spillover_chain_states(self) -> List[Dict[str, Any]]:
        """Return active spillover runtime diagnostics when the engine exposes them."""
        if not self._engine or not hasattr(self._engine, "get_spillover_chain_states"):
            return []
        return list(await asyncio.to_thread(self._engine.get_spillover_chain_states))

    async def prewarm_plugin_node(self, instance_id: int) -> bool:
        """Prepare a detached graph node for a loaded plugin instance."""
        if not self._engine:
            return False
        return await asyncio.to_thread(self._engine.prewarm_plugin_node, instance_id)

    async def save_graph_document(self, seed_document: Dict[str, Any] | None = None) -> Dict[str, Any]:
        """Serialize the active JUCE runtime chain into a graph document payload."""
        if not self._engine or not hasattr(self._engine, "save_graph_document"):
            return {}
        payload = await asyncio.to_thread(self._engine.save_graph_document, seed_document)
        return payload if isinstance(payload, dict) else {}

    async def load_graph_document(
        self,
        graph_document: Dict[str, Any],
        *,
        use_independent_crossfade: bool = False,
        max_crossfade_ms: int = 500,
    ) -> bool:
        """Load a graph document directly into the JUCE runtime chain."""
        if not self._engine or not hasattr(self._engine, "load_graph_document"):
            return False
        return await asyncio.to_thread(
            self._engine.load_graph_document,
            graph_document,
            bool(use_independent_crossfade),
            int(max_crossfade_ms),
        )

    async def clear_morph_endpoints(self) -> bool:
        """Clear all configured quad morph endpoints in the JUCE runtime."""
        if not self._engine or not hasattr(self._engine, "clear_morph_endpoints"):
            return False
        return bool(await asyncio.to_thread(self._engine.clear_morph_endpoints))

    async def set_morph_endpoint(self, corner_id: str, graph_document: Dict[str, Any]) -> bool:
        """Configure one quad morph endpoint from a graph document."""
        if not self._engine or not hasattr(self._engine, "set_morph_endpoint"):
            return False
        return bool(await asyncio.to_thread(self._engine.set_morph_endpoint, str(corner_id), graph_document))

    async def set_morph_position_2d(self, x: float, y: float) -> bool:
        """Apply quad morph interpolation and snap behavior in the JUCE runtime."""
        if not self._engine or not hasattr(self._engine, "set_morph_position_2d"):
            return False
        return bool(await asyncio.to_thread(self._engine.set_morph_position_2d, float(x), float(y)))

    async def get_morph_state(self) -> Dict[str, Any]:
        """Inspect the configured quad morph state."""
        if not self._engine or not hasattr(self._engine, "get_morph_state"):
            return {}
        state = await asyncio.to_thread(self._engine.get_morph_state)
        return dict(state or {}) if isinstance(state, dict) else {}

    # Chain Management

    async def get_chain_order(self) -> List[int]:
        """Get current plugin chain order"""
        if not self._engine:
            return []
        return await self._run_engine_call("get_chain_order", default=[])

    async def reorder_chain(self, order: List[int]) -> bool:
        """Reorder plugin chain"""
        if not self._engine:
            return False
        return bool(await self._run_engine_call("reorder_chain", list(order), default=False))

    # Parameter Control

    async def get_current_snapshot(self) -> int:
        """Get current snapshot ID (0-5)"""
        if not self._engine:
            return 0
        return int(await self._run_engine_call("get_current_snapshot", default=0) or 0)

    async def load_snapshot(self, snapshot_id: int) -> bool:
        """Load a snapshot (0-5)"""
        if not self._engine or snapshot_id < 0 or snapshot_id > 5:
            return False
        return bool(await self._run_engine_call("load_snapshot", snapshot_id, default=False))

    async def list_snapshots(self) -> List[Dict[str, Any]]:
        """List all available snapshots"""
        if not self._engine:
            return []
        return await self._run_engine_call("list_snapshots", default=[])

    # MIDI Support

    async def enable_midi(self, enable: bool) -> bool:
        """Enable or disable MIDI"""
        return await self._midi_runtime.enable_midi(enable)

    async def get_midi_devices(self) -> List[str]:
        """List available MIDI devices"""
        return await self._midi_runtime.get_midi_devices()

    async def get_midi_input_devices(self) -> List[Dict[str, Any]]:
        """List MIDI input devices"""
        return await self._midi_runtime.get_midi_input_devices()

    async def get_midi_output_devices(self) -> List[Dict[str, Any]]:
        """List MIDI output devices"""
        return await self._midi_runtime.get_midi_output_devices()

    async def open_midi_input(self, device_index: int) -> bool:
        """Open a MIDI input device"""
        return await self._midi_runtime.open_midi_input(device_index)

    async def close_midi_input(self) -> bool:
        """Close the current MIDI input device"""
        return await self._midi_runtime.close_midi_input()

    async def open_midi_output(self, device_index: int) -> bool:
        """Open a MIDI output device"""
        return await self._midi_runtime.open_midi_output(device_index)

    async def close_midi_output(self) -> bool:
        """Close the current MIDI output device"""
        return await self._midi_runtime.close_midi_output()

    async def get_midi_status(self) -> Dict[str, Any]:
        """Get comprehensive MIDI status"""
        if not self._engine:
            return {
                "enabled": False,
                "running": False,
                "input_device": None,
                "output_device": None,
                "mappings_count": 0,
                "learning": False,
            }
        return await self._midi_runtime.get_midi_status()

    async def inject_midi_note_on(self, channel: int, note: int, velocity: int) -> bool:
        """Inject Note On into internal JUCE MIDI input path."""
        return await self._midi_runtime.inject_midi_note_on(channel, note, velocity)

    async def inject_midi_note_off(self, channel: int, note: int, velocity: int = 0) -> bool:
        """Inject Note Off into internal JUCE MIDI input path."""
        return await self._midi_runtime.inject_midi_note_off(channel, note, velocity)

    # MIDI CC Mappings (JUCE)

    async def add_midi_cc_mapping(self, channel: int, cc_number: int,
                                   plugin_uri: str, param_index: int) -> bool:
        """Add MIDI CC to parameter mapping via JUCE"""
        if not self._engine:
            return False
        try:
            return bool(
                await self._run_engine_call(
                    "add_cc_mapping",
                    channel,
                    cc_number,
                    plugin_uri,
                    param_index,
                    default=False,
                )
            )
        except AttributeError:
            logger.warning("JUCE engine does not support add_cc_mapping")
            return False

    async def set_midi_cc_mapping(
        self,
        *,
        mapping_id: int,
        channel: int,
        cc: int,
        plugin_uri: str,
        param_index: int,
        param_symbol: str = "",
        min_val: float = 0.0,
        max_val: float = 1.0,
        curve: str = "linear",
        invert: bool = False,
        enabled: bool = True,
        plugin_position: Optional[int] = None,
        feedback_enabled: bool = True,
        feedback_cc: Optional[int] = None,
        chain_id: Optional[int] = None,
    ) -> bool:
        """Create or update a duplicate-safe JUCE MIDI CC mapping."""
        if not self._engine:
            return False

        instance_id = await asyncio.to_thread(self._get_instance_id_for_uri, plugin_uri, plugin_position)
        if not isinstance(instance_id, int) or instance_id <= 0:
            logger.warning(
                "Cannot sync MIDI CC mapping %s: plugin not resolved for %s (position=%s)",
                mapping_id,
                plugin_uri,
                plugin_position,
            )
            return False

        mapping_payload = {
            "id": mapping_id,
            "channel": channel,
            "cc_number": cc,
            "target_plugin": instance_id,
            "parameter_symbol": param_symbol or "",
            "parameter_index": param_index,
            "min_value": min_val,
            "max_value": max_val,
            "curve": curve,
            "invert": invert,
            "active": enabled,
            "feedback_enabled": feedback_enabled,
            "feedback_cc": feedback_cc if feedback_cc is not None else -1,
            "chain_id": chain_id if chain_id is not None else 0,
        }

        update_handler = getattr(self._engine, "midi_update_cc_mapping", None)
        add_handler = getattr(self._engine, "midi_add_cc_mapping", None)

        if callable(update_handler):
            updated = await asyncio.to_thread(update_handler, mapping_id, mapping_payload)
            if updated:
                return True
        if callable(add_handler):
            created_id = await asyncio.to_thread(add_handler, mapping_payload)
            return bool(created_id)

        logger.warning("JUCE engine does not support duplicate-safe MIDI CC mapping sync")
        return False

    async def remove_midi_cc_mapping(self, channel: int, cc_number: int) -> bool:
        """Remove MIDI CC mapping via JUCE"""
        if not self._engine:
            return False
        try:
            return bool(await self._run_engine_call("remove_cc_mapping", channel, cc_number, default=False))
        except AttributeError:
            logger.warning("JUCE engine does not support remove_cc_mapping")
            return False

    async def get_midi_cc_mappings(self) -> List[Dict[str, Any]]:
        """Get all MIDI CC mappings from JUCE"""
        if not self._engine:
            return []
        try:
            return await self._run_engine_call("get_cc_mappings", default=[])
        except AttributeError:
            handler = getattr(self._engine, "midi_get_all_cc_mappings", None)
            if callable(handler):
                return list(await asyncio.to_thread(handler))
            return []

    async def clear_midi_cc_mappings(self) -> bool:
        """Clear all MIDI CC mappings via JUCE"""
        if not self._engine:
            return False
        try:
            return bool(await self._run_engine_call("clear_cc_mappings", default=False))
        except AttributeError:
            handler = getattr(self._engine, "midi_clear_cc_mappings", None)
            if callable(handler):
                await asyncio.to_thread(handler)
                return True
            return False

    async def set_all_midi_mappings(self, mappings: List[Dict[str, Any]]) -> bool:
        """Replace all JUCE MIDI CC mappings with duplicate-safe instance resolution."""
        if not self._engine:
            return False

        native_mappings: List[Dict[str, Any]] = []
        for mapping in mappings:
            plugin_uri = str(mapping.get("target_plugin_uri") or "")
            if plugin_uri.startswith("tesira://"):
                continue
            plugin_position = mapping.get("target_plugin_position")
            instance_id = await asyncio.to_thread(self._get_instance_id_for_uri, plugin_uri, plugin_position)
            if not isinstance(instance_id, int) or instance_id <= 0:
                logger.warning(
                    "Skipping unresolved MIDI mapping %s for %s (position=%s)",
                    mapping.get("id"),
                    plugin_uri,
                    plugin_position,
                )
                continue
            native_mappings.append(
                {
                    "id": int(mapping.get("id") or 0),
                    "channel": int(mapping.get("channel") or 0),
                    "cc_number": int(mapping.get("cc") or 0),
                    "target_plugin": instance_id,
                    "parameter_symbol": str(mapping.get("target_param_symbol") or ""),
                    "parameter_index": int(mapping.get("target_param_index") or 0),
                    "min_value": float(mapping.get("min_val") or 0.0),
                    "max_value": float(mapping.get("max_val") or 1.0),
                    "curve": str(mapping.get("curve_type") or "linear"),
                    "invert": bool(mapping.get("invert", False)),
                    "active": bool(mapping.get("is_enabled", True)),
                    "feedback_enabled": bool(mapping.get("feedback_enabled", True)),
                    "feedback_cc": int(mapping["feedback_cc"]) if mapping.get("feedback_cc") is not None else -1,
                    "chain_id": int(mapping.get("chain_id") or 0),
                }
            )

        handler = getattr(self._engine, "midi_set_all_cc_mappings", None)
        if callable(handler):
            await asyncio.to_thread(handler, native_mappings)
            return True

        await self.clear_midi_cc_mappings()
        for mapping in native_mappings:
            add_handler = getattr(self._engine, "midi_add_cc_mapping", None)
            if callable(add_handler):
                await asyncio.to_thread(add_handler, mapping)
        return True

    async def replace_snapshot_expression_mappings(self, entries: List[Dict[str, Any]]) -> bool:
        """Replace snapshot-owned native expression mappings in the JUCE runtime."""
        if not self._engine:
            return False
        method = getattr(self._engine, "replace_snapshot_expression_mappings", None)
        if not callable(method):
            return False
        native_entries: List[Dict[str, Any]] = []
        can_resolve_instances = callable(getattr(self._engine, "get_current_pedalboard", None))
        for entry in entries:
            native_entry = dict(entry)
            plugin_uri = str(native_entry.get("target_plugin_uri") or "")
            plugin_position = native_entry.get("target_plugin_position")
            if can_resolve_instances and plugin_uri:
                instance_id = await asyncio.to_thread(self._get_instance_id_for_uri, plugin_uri, plugin_position)
                if isinstance(instance_id, int) and instance_id > 0:
                    native_entry["target_plugin"] = instance_id
                else:
                    logger.warning(
                        "Snapshot expression mapping %s could not resolve %s (position=%s)",
                        native_entry.get("id"),
                        plugin_uri,
                        plugin_position,
                    )
            native_entries.append(native_entry)
        return bool(await asyncio.to_thread(method, native_entries))

    async def set_midi_command(
        self,
        *,
        command_id: int,
        command_type: str,
        channel: int,
        data1: int,
        data2: Optional[int] = None,
        action_type: str,
        target_chain_id: Optional[int] = None,
        target_plugin_uri: str = "",
        target_plugin_position: Optional[int] = None,
        action_data: Optional[Dict[str, Any]] = None,
        enabled: bool = True,
    ) -> bool:
        """Create or update a JUCE MIDI command trigger with duplicate-safe target metadata."""
        if not self._engine:
            return False

        trigger_payload = {
            "id": int(command_id),
            "trigger_type": str(command_type or "program_change"),
            "channel": int(channel),
            "data1": int(data1),
            "data2_threshold": int(data2) if data2 is not None else 0,
            "action": str(action_type or "activate_chain"),
            "target_chain_id": int(target_chain_id or 0),
            "target_plugin_uri": str(target_plugin_uri or ""),
            "target_plugin_position": int(target_plugin_position) if target_plugin_position is not None else None,
            "action_data": dict(action_data or {}),
            "active": bool(enabled),
        }

        update_handler = getattr(self._engine, "midi_update_command_trigger", None)
        add_handler = getattr(self._engine, "midi_add_command_trigger", None)

        if callable(update_handler):
            updated = await asyncio.to_thread(update_handler, command_id, trigger_payload)
            if updated:
                return True
        if callable(add_handler):
            created_id = await asyncio.to_thread(add_handler, trigger_payload)
            return bool(created_id)

        logger.warning("JUCE engine does not support MIDI command trigger sync")
        return False

    async def set_all_midi_commands(self, commands: List[Dict[str, Any]]) -> bool:
        """Replace all JUCE MIDI command triggers."""
        if not self._engine:
            return False

        native_commands = [
            {
                "id": int(command.get("id") or 0),
                "trigger_type": str(command.get("command_type") or "program_change"),
                "channel": int(command.get("channel") or 0),
                "data1": int(command.get("data1") or 0),
                "data2_threshold": int(command["data2"]) if command.get("data2") is not None else 0,
                "action": str(command.get("action_type") or "activate_chain"),
                "target_chain_id": int(command.get("target_chain_id") or 0),
                "target_plugin_uri": str(command.get("target_plugin_uri") or ""),
                "target_plugin_position": (
                    int(command["target_plugin_position"])
                    if command.get("target_plugin_position") is not None
                    else None
                ),
                "action_data": dict(command.get("action_data") or {}),
                "active": bool(command.get("is_enabled", True)),
            }
            for command in commands
        ]

        set_all_handler = getattr(self._engine, "midi_set_all_command_triggers", None)
        clear_handler = getattr(self._engine, "midi_clear_command_triggers", None)
        add_handler = getattr(self._engine, "midi_add_command_trigger", None)

        if callable(set_all_handler):
            await asyncio.to_thread(set_all_handler, native_commands)
            return True

        if callable(clear_handler):
            await asyncio.to_thread(clear_handler)
        else:
            logger.warning("JUCE engine does not support clearing MIDI command triggers")
            return False

        if callable(add_handler):
            for command in native_commands:
                await asyncio.to_thread(add_handler, command)
            return True

        logger.warning("JUCE engine does not support MIDI command trigger sync")
        return False



__all__ = ["JuceSnapshotBridgeMixin"]
