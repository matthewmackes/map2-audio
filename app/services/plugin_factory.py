"""
Plugin Factory/Registry for MAP2 Audio
Creates plugin instances by URI/type for unified signal chain integration.
"""

from .plugin_base import PluginBase
from .native_plugin_adapter import NativePluginAdapter, NAMLoaderAdapter
from .lv2_plugin_adapter import LV2PluginAdapter

# Example: Extend this mapping as new native plugins are added
NATIVE_PLUGIN_CLASSES = {
    "http://map2-audio.local/nam-loader": NAMLoaderAdapter,
    # Add other native plugin URIs and classes here
}

# Example: LV2 plugin loader (to be replaced with actual LV2 host integration)
def create_lv2_instance(uri: str):
    # Placeholder for LV2 plugin instantiation
    # Replace with actual LV2 host code
    class DummyLV2:
        def process(self, input_buffer):
            return input_buffer
        def set_parameter(self, name, value):
            pass
        def get_state(self):
            return {}
    return DummyLV2()


def create_plugin(uri: str) -> PluginBase:
    if uri in NATIVE_PLUGIN_CLASSES:
        return NATIVE_PLUGIN_CLASSES[uri]()
    # Assume all other URIs are LV2
    lv2_instance = create_lv2_instance(uri)
    return LV2PluginAdapter(uri, lv2_instance)
