"""
IR Plugin Wrappers - Exposes IRs as virtual LV2 plugins

This module provides wrappers that allow Impulse Responses (Cabinet and Reverb)
to be discovered and used like standard LV2 plugins in the signal chain.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any


@dataclass
class IRPluginInfo:
    """
    Virtual LV2 plugin info for Impulse Response effects.
    
    Supports both Cabinet IRs and Reverb IRs as separate plugin types.
    """
    
    # Core plugin metadata
    uri: str
    name: str
    category: str  # "Amplifier" for cabinets, "Reverb" for reverbs
    class_label: str
    author: str = "MAP2 Audio"
    version: str = "1.0.0"
    license: str = "Apache-2.0"
    ir_type: str = "cabinet"  # 'cabinet' or 'reverb'
    
    # Plugin capabilities
    has_ui: bool = False
    in_port_count: int = 1
    out_port_count: int = 1
    
    # IR-specific flag
    is_ir_plugin: bool = True
    
    # Plugin parameters
    parameters: List[Dict[str, Any]] = field(default_factory=lambda: [
        {
            "index": 0,
            "name": "IR Select",
            "symbol": "ir_select",
            "min": 0,
            "max": 1000,
            "default": 0,
            "is_toggled": False,
            "is_log": False,
            "description": "Select active IR"
        }
    ])
    
    # Metadata
    description: str = ""
    tags: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses."""
        return {
            "uri": self.uri,
            "name": self.name,
            "author": self.author,
            "category": self.category,
            "class_label": self.class_label,
            "version": self.version,
            "license": self.license,
            "has_ui": self.has_ui,
            "in_ports": self.in_port_count,
            "out_ports": self.out_port_count,
            "is_ir_plugin": self.is_ir_plugin,
            "ir_type": self.ir_type,
            "parameters": self.parameters,
            "description": self.description,
            "tags": self.tags,
        }


# Pre-configured Cabinet IR Plugin
def get_cabinet_ir_plugin() -> IRPluginInfo:
    """Get Cabinet IR as virtual LV2 plugin."""
    return IRPluginInfo(
        uri="urn:map2:ir-cabinet",
        name="Cabinet IR",
        category="Amplifier",
        class_label="AmplifierPlugin",
        ir_type="cabinet",
        description="Impulse Response speaker cabinet simulation with high-quality convolution",
        tags=["guitar", "cabinet", "ir", "convolution"]
    )


# Pre-configured Reverb IR Plugin
def get_reverb_ir_plugin() -> IRPluginInfo:
    """Get Reverb IR as virtual LV2 plugin."""
    return IRPluginInfo(
        uri="urn:map2:ir-reverb",
        name="Reverb IR",
        category="Reverb",
        class_label="ReverbPlugin",
        ir_type="reverb",
        description="Impulse Response reverb with authentic space simulation",
        tags=["reverb", "ir", "convolution", "space"]
    )
