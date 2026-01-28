"""
Plugin Base Interface for MAP2 Audio
Defines the interface for all plugins (native and LV2).
"""

from typing import Any, Dict, Optional
import numpy as np

class PluginBase:
    def __init__(self, uri: str):
        self.uri = uri
        self.bypassed = False

    def process_audio(self, input_buffer: np.ndarray) -> np.ndarray:
        """Process audio buffer. Must be RT-safe."""
        raise NotImplementedError

    def get_parameters(self) -> Dict[str, Any]:
        """Return current parameter values."""
        raise NotImplementedError

    def set_parameter(self, name: str, value: Any) -> None:
        """Set a parameter value."""
        raise NotImplementedError

    def bypass(self, state: bool) -> None:
        """Bypass or enable the plugin."""
        self.bypassed = state

    def serialize_state(self) -> Dict[str, Any]:
        """Serialize plugin state for preset management."""
        raise NotImplementedError

    def deserialize_state(self, state: Dict[str, Any]) -> None:
        """Restore plugin state from preset."""
        raise NotImplementedError
