"""
NAM Plugin Wrapper - Exposes NAM as virtual LV2 plugin

This module provides a wrapper that allows NAM (Neural Amp Modeler)
to be discovered and used like a standard LV2 plugin in the signal chain.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any


@dataclass
class NAMPluginParameter:
    """NAM parameter representation."""
    index: int
    name: str
    symbol: str
    min_value: float = 0.0
    max_value: float = 1.0
    default_value: float = 0.5
    is_toggled: bool = False
    is_logarithmic: bool = False


@dataclass
class NAMPluginInfo:
    """
    Virtual LV2 plugin info for NAM.
    
    This class makes NAM appear as a standard LV2 plugin in the plugin
    discovery system, allowing seamless integration into signal chains.
    """
    
    # Core plugin metadata
    uri: str = "urn:map2:nam-player"
    name: str = "Neural Amp Modeler"
    author: str = "Shapeoko (Neural Amp Modeler)"
    category: str = "Amplifier"  # Appears in "Amplifier" category
    class_label: str = "AmplifierPlugin"
    version: str = "1.0.0"
    license: str = "Apache-2.0"
    
    # Plugin capabilities
    has_ui: bool = False  # NAM is managed via /api/nam endpoints
    in_port_count: int = 1  # Mono or stereo input
    out_port_count: int = 1  # Mono or stereo output
    
    # NAM-specific flag
    is_nam_plugin: bool = True  # Identifies this as NAM for special handling
    
    # Plugin parameters
    parameters: List[Dict[str, Any]] = field(default_factory=lambda: [
        {
            "index": 0,
            "name": "Model Select",
            "symbol": "model_select",
            "min": 0,
            "max": 1000,
            "default": 0,
            "is_toggled": False,
            "is_log": False,
            "description": "Select active NAM model"
        }
    ])
    
    # Metadata
    description: str = "Neural Amp Modeler - High-quality guitar amp simulation using trained neural networks"
    tags: List[str] = field(default_factory=lambda: ["guitar", "amp", "neural", "simulation"])
    
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
            "is_nam_plugin": self.is_nam_plugin,
            "parameters": self.parameters,
            "description": self.description,
            "tags": self.tags,
        }
