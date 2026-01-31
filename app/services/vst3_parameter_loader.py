"""
VST3 Parameter Loading via JUCE Engine
This module provides functions to load VST3 plugin parameters using the JUCE engine.
"""

import json
from typing import Dict, List, Any, Optional
from pathlib import Path

def load_vst3_parameters(plugin_path: str) -> List[Dict[str, Any]]:
    """
    Load VST3 plugin parameters by instantiating the plugin through JUCE.
    
    Args:
        plugin_path: Path to the VST3 plugin bundle or file
        
    Returns:
        List of parameter dictionaries with metadata
        
    Example:
        >>> params = load_vst3_parameters("~/.vst3/lsp-plugins.vst3")
        >>> for param in params:
        ...     print(f"{param['name']}: {param['default']}")
    """
    # This is a placeholder - actual implementation requires JUCE C++ integration
    # TODO: Call into JUCE engine to instantiate plugin and enumerate parameters
    
    # For now, return empty list with a note
    return []


def get_vst3_parameter_info(plugin_uri: str) -> Dict[str, Any]:
    """
    Get parameter information for a VST3 plugin by URI.
    
    Args:
        plugin_uri: Plugin URI (e.g., "vst3://lsp-plugins")
        
    Returns:
        Dictionary with parameter information:
        {
            "uri": str,
            "parameters": List[Dict],
            "parameter_count": int,
            "requires_instantiation": bool,
            "message": str
        }
    """
    try:
        # Extract plugin name from URI
        plugin_name = plugin_uri.replace("vst3://", "")
        
        # Try to find the plugin file
        search_paths = [
            Path.home() / ".vst3",
            Path("/usr/lib/vst3"),
            Path("/usr/lib64/vst3"),
            Path("/usr/local/lib/vst3"),
        ]
        
        plugin_path = None
        for search_path in search_paths:
            # Check for bundle format (.vst3 directory)
            bundle_path = search_path / f"{plugin_name}.vst3"
            if bundle_path.exists():
                plugin_path = str(bundle_path)
                break
            
            # Check for single file format
            file_path = search_path / plugin_name
            if file_path.exists() and file_path.is_file():
                plugin_path = str(file_path)
                break
        
        if not plugin_path:
            return {
                "uri": plugin_uri,
                "parameters": [],
                "parameter_count": 0,
                "requires_instantiation": True,
                "message": f"Plugin file not found for {plugin_uri}",
                "error": "Plugin not found"
            }
        
        # Load parameters through JUCE
        parameters = load_vst3_parameters(plugin_path)
        
        return {
            "uri": plugin_uri,
            "parameters": parameters,
            "parameter_count": len(parameters),
            "requires_instantiation": len(parameters) == 0,
            "message": "Parameters loaded" if parameters else "Parameters require plugin instantiation in effects chain",
            "plugin_path": plugin_path
        }
        
    except Exception as e:
        return {
            "uri": plugin_uri,
            "parameters": [],
            "parameter_count": 0,
            "requires_instantiation": True,
            "message": f"Error loading parameters: {str(e)}",
            "error": str(e)
        }


def format_parameter_for_api(param: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format a JUCE parameter dict for the API response.
    
    Args:
        param: Raw parameter dict from JUCE
        
    Returns:
        Formatted parameter dict for API
    """
    return {
        "index": param.get("index", 0),
        "name": param.get("name", "Unknown"),
        "symbol": param.get("symbol", param.get("name", "unknown")),
        "min": param.get("min", param.get("minValue", 0.0)),
        "max": param.get("max", param.get("maxValue", 1.0)),
        "default": param.get("default", param.get("defaultValue", 0.5)),
        "value": param.get("value", param.get("currentValue", param.get("default", 0.5))),
        "unit": param.get("unit", ""),
        "label": param.get("label", ""),
        "is_toggled": param.get("is_toggled", param.get("isBoolean", False)),
        "is_log": param.get("is_log", param.get("isLogarithmic", False)),
        "is_automatable": param.get("is_automatable", True),
        "is_meta": param.get("is_meta", False),
    }


if __name__ == "__main__":
    # Test the parameter loading
    test_uri = "vst3://lsp-plugins"
    info = get_vst3_parameter_info(test_uri)
    print(json.dumps(info, indent=2))
