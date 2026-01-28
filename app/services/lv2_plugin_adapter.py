"""
LV2 Plugin Adapter

Adapts LV2 plugins to the PluginBase interface for unified signal chain integration.
"""

from .plugin_base import PluginBase
from typing import Any, Dict
import numpy as np

class LV2PluginAdapter(PluginBase):
    def __init__(self, uri: str, lv2_instance):
        super().__init__(uri)
        self.lv2_instance = lv2_instance
        self.parameters: Dict[str, Any] = {}

    def process_audio(self, input_buffer: np.ndarray) -> np.ndarray:
        if self.bypassed:
            return input_buffer
        # Assume lv2_instance has a process method
        return self.lv2_instance.process(input_buffer)

    def get_parameters(self) -> Dict[str, Any]:
        # Query LV2 instance for parameters
        return self.parameters.copy()

    def set_parameter(self, name: str, value: Any) -> None:
        self.parameters[name] = value
        # Assume lv2_instance has a set_parameter method
        if hasattr(self.lv2_instance, 'set_parameter'):
            self.lv2_instance.set_parameter(name, value)

    def serialize_state(self) -> Dict[str, Any]:
        # Assume lv2_instance has a method to get state
        state = self.parameters.copy()
        if hasattr(self.lv2_instance, 'get_state'):
            state.update(self.lv2_instance.get_state())
        return {
            "parameters": state,
            "bypassed": self.bypassed
        }

    def deserialize_state(self, state: Dict[str, Any]) -> None:
        params = state.get("parameters", {})
        for k, v in params.items():
            self.set_parameter(k, v)
        self.bypassed = state.get("bypassed", False)
