"""
MIDI Learn System - Dynamic parameter mapping for MIDI controllers
Allows click-to-assign MIDI CC to plugin parameters
"""

import logging
from typing import Dict, Optional, List, Any, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
import json

logger = logging.getLogger(__name__)

try:
    from app.services.midi_hub.hub import get_midi_hub
    from app.services.midi_hub.ports import MidiMessage, VirtualMidiPort
except Exception:  # pragma: no cover - optional integration
    get_midi_hub = None  # type: ignore[assignment]
    MidiMessage = None  # type: ignore[assignment]
    VirtualMidiPort = None  # type: ignore[assignment]


@dataclass
class MIDIMapping:
    """
    MIDI CC to parameter mapping
    
    Attributes:
        parameter_id: Target parameter (format: "plugin_id:param_index")
        cc_number: MIDI CC number (0-127)
        channel: MIDI channel (0-15, None = omni)
        min_value: Minimum parameter value
        max_value: Maximum parameter value
        curve: Response curve ("linear", "exponential", "logarithmic")
        inverted: Invert CC direction
        created_at: Timestamp of mapping creation
    """
    parameter_id: str
    cc_number: int
    channel: Optional[int] = None
    min_value: float = 0.0
    max_value: float = 1.0
    curve: str = "linear"
    inverted: bool = False
    created_at: datetime = field(default_factory=datetime.now)
    
    def apply_curve(self, cc_value: int) -> float:
        """
        Apply response curve to MIDI CC value
        
        Args:
            cc_value: MIDI CC value (0-127)
            
        Returns:
            Scaled parameter value
        """
        # Normalize to 0.0-1.0
        normalized = cc_value / 127.0
        
        # Invert if needed
        if self.inverted:
            normalized = 1.0 - normalized
        
        # Apply curve
        if self.curve == "exponential":
            curved = normalized ** 2
        elif self.curve == "logarithmic":
            curved = normalized ** 0.5
        else:  # linear
            curved = normalized
        
        # Scale to parameter range
        return self.min_value + (self.max_value - self.min_value) * curved
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary"""
        return {
            "parameter_id": self.parameter_id,
            "cc_number": self.cc_number,
            "channel": self.channel,
            "min_value": self.min_value,
            "max_value": self.max_value,
            "curve": self.curve,
            "inverted": self.inverted,
            "created_at": self.created_at.isoformat()
        }


class MIDILearnManager:
    """
    MIDI Learn system manager
    
    Features:
    - Click-to-assign parameter mapping
    - MIDI CC listening mode
    - Mapping storage and retrieval
    - Real-time parameter updates
    - Multi-mapping support (one CC to multiple params)
    - Mapping templates
    """
    
    def __init__(self):
        """Initialize MIDI Learn manager"""
        # Mappings: (cc_number, channel) -> List[MIDIMapping]
        self.mappings: Dict[Tuple[int, Optional[int]], List[MIDIMapping]] = {}
        
        # Parameter to mapping lookup: parameter_id -> MIDIMapping
        self.param_to_mapping: Dict[str, MIDIMapping] = {}
        
        # Learn mode state
        self.learn_mode_active = False
        self.learn_target_param: Optional[str] = None
        
        # Thread safety
        self._lock = RLock()
        
        # Last received CC values for display
        self.last_cc_values: Dict[Tuple[int, Optional[int]], int] = {}
        self._hub = None
        self._hub_subscriber_id = f"midi_learn_manager:{id(self)}"
        self._hub_port_id = "consumer:midi_learn"

        logger.info("MIDI Learn manager initialized")
        self._init_hub_bridge()

    def _init_hub_bridge(self) -> None:
        """Subscribe to MidiHub CC traffic for learn capture."""
        if get_midi_hub is None or VirtualMidiPort is None:
            return
        try:
            hub = get_midi_hub()
            if hub.resolve_port(self._hub_port_id) is None:
                hub.register_port(
                    VirtualMidiPort(
                        port_id=self._hub_port_id,
                        name="MIDI Learn Manager",
                        direction="input",
                    ),
                    open_now=False,
                )
            hub.subscribe(self._hub_subscriber_id, self._on_hub_message)
            self._hub = hub
        except Exception as exc:
            logger.debug("MIDILearnManager hub bridge unavailable: %s", exc)

    def _on_hub_message(self, message: MidiMessage) -> None:
        """Decode CC messages from MidiHub for learn/mapping updates."""
        data = list(message.data or [])
        if len(data) < 3:
            return
        status = int(data[0]) & 0xFF
        if (status & 0xF0) != 0xB0:
            return
        channel = status & 0x0F
        cc_number = int(data[1]) & 0x7F
        cc_value = int(data[2]) & 0x7F
        self.process_midi_cc(cc_number, cc_value, channel=channel)

    def shutdown(self) -> None:
        """Unsubscribe from MidiHub callbacks for clean teardown."""
        with self._lock:
            if self._hub is not None:
                try:
                    self._hub.unsubscribe(self._hub_subscriber_id)
                except Exception:
                    pass
                self._hub = None
    
    def start_learn_mode(self, parameter_id: str) -> None:
        """
        Enable learn mode for a parameter
        
        Args:
            parameter_id: Parameter to assign (e.g., "plugin_1:0")
        """
        with self._lock:
            self.learn_mode_active = True
            self.learn_target_param = parameter_id
            logger.info(f"MIDI Learn mode active for: {parameter_id}")
    
    def stop_learn_mode(self) -> None:
        """Disable learn mode"""
        with self._lock:
            self.learn_mode_active = False
            self.learn_target_param = None
            logger.info("MIDI Learn mode stopped")
    
    def process_midi_cc(self, cc_number: int, cc_value: int, channel: Optional[int] = None) -> List[Tuple[str, float]]:
        """
        Process incoming MIDI CC message
        
        Args:
            cc_number: MIDI CC number (0-127)
            cc_value: MIDI CC value (0-127)
            channel: MIDI channel (0-15, None = omni)
            
        Returns:
            List of (parameter_id, scaled_value) tuples for updated parameters
        """
        with self._lock:
            # Store last CC value
            self.last_cc_values[(cc_number, channel)] = cc_value
            
            # Handle learn mode
            if self.learn_mode_active and self.learn_target_param:
                self.create_mapping(
                    parameter_id=self.learn_target_param,
                    cc_number=cc_number,
                    channel=channel
                )
                self.stop_learn_mode()
                logger.info(f"Learned: CC{cc_number} -> {self.learn_target_param}")
            
            # Apply existing mappings
            updates: List[Tuple[str, float]] = []
            
            # Check exact channel match
            key = (cc_number, channel)
            if key in self.mappings:
                for mapping in self.mappings[key]:
                    value = mapping.apply_curve(cc_value)
                    updates.append((mapping.parameter_id, value))
            
            # Check omni channel mappings
            omni_key = (cc_number, None)
            if omni_key in self.mappings and channel is not None:
                for mapping in self.mappings[omni_key]:
                    value = mapping.apply_curve(cc_value)
                    updates.append((mapping.parameter_id, value))
            
            return updates
    
    def create_mapping(
        self,
        parameter_id: str,
        cc_number: int,
        channel: Optional[int] = None,
        min_value: float = 0.0,
        max_value: float = 1.0,
        curve: str = "linear",
        inverted: bool = False
    ) -> MIDIMapping:
        """
        Create a new MIDI mapping
        
        Args:
            parameter_id: Target parameter
            cc_number: MIDI CC number
            channel: MIDI channel (None = omni)
            min_value: Minimum parameter value
            max_value: Maximum parameter value
            curve: Response curve
            inverted: Invert CC direction
            
        Returns:
            Created mapping
        """
        mapping = MIDIMapping(
            parameter_id=parameter_id,
            cc_number=cc_number,
            channel=channel,
            min_value=min_value,
            max_value=max_value,
            curve=curve,
            inverted=inverted
        )
        
        with self._lock:
            # Remove existing mapping for this parameter
            if parameter_id in self.param_to_mapping:
                self.remove_mapping(parameter_id)
            
            # Add to mappings
            key = (cc_number, channel)
            if key not in self.mappings:
                self.mappings[key] = []
            
            self.mappings[key].append(mapping)
            self.param_to_mapping[parameter_id] = mapping
            
            logger.info(f"Created mapping: CC{cc_number} (ch {channel}) -> {parameter_id}")
        
        return mapping
    
    def remove_mapping(self, parameter_id: str) -> bool:
        """
        Remove mapping for a parameter
        
        Args:
            parameter_id: Parameter to unmap
            
        Returns:
            True if mapping was removed
        """
        with self._lock:
            if parameter_id not in self.param_to_mapping:
                return False
            
            mapping = self.param_to_mapping[parameter_id]
            key = (mapping.cc_number, mapping.channel)
            
            if key in self.mappings:
                self.mappings[key] = [m for m in self.mappings[key] if m.parameter_id != parameter_id]
                if not self.mappings[key]:
                    del self.mappings[key]
            
            del self.param_to_mapping[parameter_id]
            logger.info(f"Removed mapping for {parameter_id}")
            return True
    
    def get_mapping(self, parameter_id: str) -> Optional[MIDIMapping]:
        """
        Get mapping for a parameter
        
        Args:
            parameter_id: Parameter ID
            
        Returns:
            Mapping or None
        """
        return self.param_to_mapping.get(parameter_id)
    
    def get_all_mappings(self) -> List[MIDIMapping]:
        """
        Get all active mappings
        
        Returns:
            List of all mappings
        """
        with self._lock:
            return list(self.param_to_mapping.values())
    
    def get_mappings_for_cc(self, cc_number: int, channel: Optional[int] = None) -> List[MIDIMapping]:
        """
        Get all mappings for a CC number
        
        Args:
            cc_number: MIDI CC number
            channel: MIDI channel (None = all)
            
        Returns:
            List of mappings
        """
        with self._lock:
            key = (cc_number, channel)
            return self.mappings.get(key, []).copy()
    
    def clear_all_mappings(self) -> None:
        """Clear all MIDI mappings"""
        with self._lock:
            self.mappings.clear()
            self.param_to_mapping.clear()
            logger.info("Cleared all MIDI mappings")
    
    def export_mappings(self) -> List[Dict[str, Any]]:
        """
        Export all mappings to JSON-serializable format
        
        Returns:
            List of mapping dictionaries
        """
        with self._lock:
            return [mapping.to_dict() for mapping in self.param_to_mapping.values()]
    
    def import_mappings(self, mappings_data: List[Dict[str, Any]]) -> int:
        """
        Import mappings from JSON data
        
        Args:
            mappings_data: List of mapping dictionaries
            
        Returns:
            Number of mappings imported
        """
        count = 0
        for data in mappings_data:
            try:
                self.create_mapping(
                    parameter_id=data["parameter_id"],
                    cc_number=data["cc_number"],
                    channel=data.get("channel"),
                    min_value=data.get("min_value", 0.0),
                    max_value=data.get("max_value", 1.0),
                    curve=data.get("curve", "linear"),
                    inverted=data.get("inverted", False)
                )
                count += 1
            except Exception as e:
                logger.error(f"Error importing mapping: {e}")
        
        logger.info(f"Imported {count} MIDI mappings")
        return count
    
    def get_learn_status(self) -> Dict[str, Any]:
        """
        Get current learn mode status
        
        Returns:
            Status dictionary
        """
        with self._lock:
            return {
                "active": self.learn_mode_active,
                "target_parameter": self.learn_target_param
            }
    
    def get_last_cc_value(self, cc_number: int, channel: Optional[int] = None) -> Optional[int]:
        """
        Get last received value for a CC
        
        Args:
            cc_number: MIDI CC number
            channel: MIDI channel
            
        Returns:
            Last CC value or None
        """
        return self.last_cc_values.get((cc_number, channel))
    
    def create_template(self, name: str, description: str = "") -> Dict[str, Any]:
        """
        Create a mapping template from current mappings
        
        Args:
            name: Template name
            description: Template description
            
        Returns:
            Template dictionary
        """
        return {
            "name": name,
            "description": description,
            "mappings": self.export_mappings(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    
    def apply_template(self, template: Dict[str, Any], clear_existing: bool = True) -> int:
        """
        Apply a mapping template
        
        Args:
            template: Template dictionary
            clear_existing: Clear existing mappings first
            
        Returns:
            Number of mappings applied
        """
        if clear_existing:
            self.clear_all_mappings()
        
        return self.import_mappings(template.get("mappings", []))


# Global MIDI Learn manager instance
midi_learn_manager = MIDILearnManager()
