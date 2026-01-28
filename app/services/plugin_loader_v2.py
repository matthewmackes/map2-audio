"""
Advanced LV2 Plugin Loader with Real Lilv Support

Phase 5 Implementation: Real plugin discovery and loading using lilv library.
Provides fallback stubs when lilv is not available.
"""

import logging
import json
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# Try to import lilv
try:
    import lilv
    LILV_AVAILABLE = True
except ImportError:
    LILV_AVAILABLE = False
    logger.warning("lilv not available - using plugin stubs. Install with: apt/dnf install -y lilv python3-lilv")


@dataclass
class PluginParameter:
    """Plugin parameter metadata."""
    index: int
    name: str
    symbol: str
    uri: str
    value_type: str  # "float", "int", "enum"
    min_value: float
    max_value: float
    default_value: float
    is_toggled: bool = False
    is_logarithmic: bool = False
    scale_points: Dict[str, float] = field(default_factory=dict)


@dataclass
class OutputPort:
    """Output port metadata for visualization."""
    index: int
    symbol: str
    name: str
    min_value: float
    max_value: float
    designation: str = "generic"  # meter, gain_reduction, latency, tuner_frequency, etc.
    unit: Optional[str] = None
    is_logarithmic: bool = False


@dataclass
class PluginUIInfo:
    """Plugin UI capabilities and metadata."""
    has_native_ui: bool = False
    ui_types: List[str] = field(default_factory=list)
    has_mod_gui: bool = False
    mod_gui_url: Optional[str] = None
    output_ports: List[OutputPort] = field(default_factory=list)
    has_tuner: bool = False
    has_spectrum: bool = False
    has_meters: bool = False


@dataclass
class LV2Plugin:
    """Complete LV2 plugin metadata."""
    uri: str
    name: str
    author: str
    license: str
    version: str
    class_label: str  # "Instrument", "Utility", "Distortion", etc.
    parameters: List[PluginParameter] = field(default_factory=list)
    has_ui: bool = False
    executable: bool = True
    in_port_count: int = 0
    out_port_count: int = 0
    ui_info: PluginUIInfo = field(default_factory=PluginUIInfo)
    
    @property
    def category(self) -> str:
        """Return plugin category from class label."""
        class_map = {
            "Instrument": "Instrument",
            "Distortion": "Distortion",
            "Utility": "Utility",
            "Delay": "Delay",
            "Reverb": "Reverb",
            "Compressor": "Compressor",
            "Equalizer": "EQ",
            "Filter": "Filter",
            "Modulator": "Modulator",
            "Flanger": "Flanger",
            "Phaser": "Phaser",
            "Chorus": "Chorus",
            "Mixer": "Mixer",
            "Oscillator": "Oscillator",
            "Generator": "Generator",
            "Analyser": "Analyser",
            "AnalyserPlugin": "Analyser",
        }
        return class_map.get(self.class_label, "Utility")


class RealLV2Loader:
    """Real LV2 plugin discovery using lilv library."""
    
    def __init__(self):
        self.world: Optional[Any] = None
        self.plugin_list: Optional[Any] = None
        
        if LILV_AVAILABLE:
            try:
                self.world = lilv.World()
                self.world.load_all()
                self.plugin_list = self.world.get_all_plugins()
                logger.info("LV2 world initialized with real lilv")
            except Exception as e:
                logger.error(f"Failed to initialize lilv world: {e}")
                self.world = None
    
    def discover_plugins(self) -> List[LV2Plugin]:
        """Discover all available LV2 plugins on the system."""
        if not LILV_AVAILABLE or self.world is None:
            logger.warning("lilv not available, returning stub plugins")
            return self._get_stub_plugins()
        
        plugins = []
        try:
            for plugin in self.plugin_list:
                try:
                    lv2_plugin = self._parse_plugin(plugin)
                    plugins.append(lv2_plugin)
                except Exception as e:
                    logger.debug(f"Error parsing plugin: {e}")
                    continue
            
            logger.info(f"Discovered {len(plugins)} LV2 plugins")
            return plugins
        except Exception as e:
            logger.error(f"Plugin discovery error: {e}")
            return self._get_stub_plugins()
    
    def _parse_plugin(self, lilv_plugin: Any) -> LV2Plugin:
        """Convert lilv plugin to LV2Plugin dataclass."""
        uri = str(lilv_plugin.get_uri())
        name = self._get_lilv_string(lilv_plugin.get_name())
        author = self._get_lilv_string(lilv_plugin.get_author_name()) or "Unknown"

        # License - get_license() doesn't exist in some lilv versions
        license_str = "Unknown"
        try:
            if hasattr(lilv_plugin, 'get_license'):
                license_uri = lilv_plugin.get_license()
                license_str = str(license_uri) if license_uri else "Unknown"
        except Exception as e:
            logger.debug(f"Could not extract license for {uri}: {e}")

        # Extract version - get_version() doesn't exist in some lilv versions
        version = "1.0"
        try:
            if hasattr(lilv_plugin, 'get_version') and lilv_plugin.get_version():
                version = str(lilv_plugin.get_version())
        except Exception as e:
            logger.debug(f"Could not extract version for {uri}: {e}")
        
        # Get class
        class_label = "Utility"
        plugin_class = lilv_plugin.get_class()
        if plugin_class:
            class_label = self._get_lilv_string(plugin_class.get_label()) or "Utility"
        
        # Count ports
        in_count = sum(1 for i in range(lilv_plugin.get_num_ports()) 
                      if self._is_input_port(lilv_plugin, i))
        out_count = sum(1 for i in range(lilv_plugin.get_num_ports())
                       if self._is_output_port(lilv_plugin, i))
        
        # Extract parameters (control INPUT ports only - outputs are for metering)
        parameters = []
        output_ports = []
        for i in range(lilv_plugin.get_num_ports()):
            port = lilv_plugin.get_port_by_index(i)
            if self._is_control_port(lilv_plugin, i):
                if self._is_input_port(lilv_plugin, i):
                    param = self._parse_parameter(port, i)
                    if param:
                        parameters.append(param)
                elif self._is_output_port(lilv_plugin, i):
                    # Parse output control port for metering/visualization
                    output_port = self._parse_output_port(port, i)
                    if output_port:
                        output_ports.append(output_port)
        
        # Extract UI information
        ui_info = self._parse_ui_info(lilv_plugin, output_ports, class_label)
        has_ui = lilv_plugin.get_uis() and len(list(lilv_plugin.get_uis())) > 0
        
        return LV2Plugin(
            uri=uri,
            name=name or "Unknown",
            author=author,
            license=license_str,
            version=version,
            class_label=class_label,
            parameters=parameters,
            has_ui=has_ui,
            executable=True,
            in_port_count=in_count,
            out_port_count=out_count,
            ui_info=ui_info,
        )
    
    def _parse_parameter(self, port: Any, index: int) -> Optional[PluginParameter]:
        """Parse a parameter from a control port."""
        try:
            name_node = port.get_name()
            name = str(name_node) if name_node is not None else f"Param {index}"
            symbol_node = port.get_symbol()
            symbol = str(symbol_node) if symbol_node is not None else f"param_{index}"

            # Get range using lilv's get_range() which returns (default, min, max)
            default, min_val, max_val = 0.0, 0.0, 1.0
            try:
                dfl, mn, mx = port.get_range()
                default = self._node_to_float(dfl, 0.0)
                min_val = self._node_to_float(mn, 0.0)
                max_val = self._node_to_float(mx, 1.0)
            except Exception as e:
                logger.debug(f"Could not get range for param {index}: {e}")

            uri = str(symbol_node) if symbol_node is not None else f"param_{index}"

            # Check port properties
            is_toggled = False
            is_log = False
            try:
                if hasattr(port, 'has_property'):
                    toggled_uri = self.world.new_uri("http://lv2plug.in/ns/lv2core#toggled")
                    log_uri = self.world.new_uri("http://lv2plug.in/ns/ext/port-props#logarithmic")
                    is_toggled = port.has_property(toggled_uri) if toggled_uri else False
                    is_log = port.has_property(log_uri) if log_uri else False
            except Exception as e:
                logger.debug(f"Could not get port properties for param {index}: {e}")

            return PluginParameter(
                index=index,
                name=name,
                symbol=symbol,
                uri=uri,
                value_type="float",
                min_value=min_val,
                max_value=max_val,
                default_value=default,
                is_toggled=is_toggled,
                is_logarithmic=is_log,
            )
        except Exception as e:
            logger.debug(f"Error parsing parameter {index}: {e}")
            return None

    def _node_to_float(self, node: Any, default: float = 0.0) -> float:
        """Convert a lilv Node to a float value."""
        if node is None:
            return default
        try:
            if hasattr(node, 'is_float') and node.is_float():
                return float(node)
            elif hasattr(node, 'is_int') and node.is_int():
                return float(int(node))
            else:
                # Try parsing string representation
                return float(str(node))
        except (ValueError, TypeError):
            return default

    def _is_input_port(self, plugin: Any, index: int) -> bool:
        """Check if port is an input."""
        port = plugin.get_port_by_index(index)
        return port.is_a(self.world.new_uri("http://lv2plug.in/ns/lv2core#InputPort"))

    def _is_output_port(self, plugin: Any, index: int) -> bool:
        """Check if port is an output."""
        port = plugin.get_port_by_index(index)
        return port.is_a(self.world.new_uri("http://lv2plug.in/ns/lv2core#OutputPort"))

    def _is_control_port(self, plugin: Any, index: int) -> bool:
        """Check if port is a control port."""
        port = plugin.get_port_by_index(index)
        return port.is_a(self.world.new_uri("http://lv2plug.in/ns/lv2core#ControlPort"))
    
    def _parse_output_port(self, port: Any, index: int) -> Optional[OutputPort]:
        """Parse an output control port for metering/visualization."""
        try:
            name_node = port.get_name()
            name = str(name_node) if name_node is not None else f"Output {index}"
            symbol_node = port.get_symbol()
            symbol = str(symbol_node) if symbol_node is not None else f"output_{index}"
            
            # Get range
            min_val, max_val = 0.0, 1.0
            try:
                dfl, mn, mx = port.get_range()
                min_val = self._node_to_float(mn, 0.0)
                max_val = self._node_to_float(mx, 1.0)
            except Exception:
                pass
            
            # Detect designation from name/symbol patterns
            designation = self._detect_output_designation(name, symbol)
            
            # Check for logarithmic property
            is_log = False
            try:
                if hasattr(port, 'has_property'):
                    log_uri = self.world.new_uri("http://lv2plug.in/ns/ext/port-props#logarithmic")
                    is_log = port.has_property(log_uri) if log_uri else False
            except Exception:
                pass
            
            return OutputPort(
                index=index,
                symbol=symbol,
                name=name,
                min_value=min_val,
                max_value=max_val,
                designation=designation,
                is_logarithmic=is_log,
            )
        except Exception as e:
            logger.debug(f"Error parsing output port {index}: {e}")
            return None
    
    def _detect_output_designation(self, name: str, symbol: str) -> str:
        """Detect output port designation from name/symbol patterns."""
        combined = f"{name.lower()} {symbol.lower()}"
        
        # Meter patterns
        if any(p in combined for p in ['meter', 'level', 'vu', 'peak', 'rms', 'db']):
            return "meter"
        # Gain reduction patterns
        if any(p in combined for p in ['gain_reduction', 'gainreduction', 'gr', 'reduction']):
            return "gain_reduction"
        # Latency
        if 'latency' in combined:
            return "latency"
        # Tuner frequency
        if any(p in combined for p in ['freq', 'frequency', 'pitch', 'hz']):
            return "tuner_frequency"
        # Tuner note
        if 'note' in combined:
            return "tuner_note"
        # Spectrum
        if any(p in combined for p in ['spectrum', 'fft', 'bin']):
            return "spectrum"
        # Envelope
        if any(p in combined for p in ['envelope', 'env', 'follower']):
            return "envelope"
            
        return "generic"
    
    def _parse_ui_info(self, lilv_plugin: Any, output_ports: List[OutputPort], class_label: str) -> PluginUIInfo:
        """Parse plugin UI information and capabilities."""
        ui_types = []
        has_native_ui = False
        
        # Get UI types
        try:
            uis = lilv_plugin.get_uis()
            if uis:
                for ui in uis:
                    has_native_ui = True
                    # Try to determine UI type from the class
                    ui_class = None
                    try:
                        # Common UI type URIs
                        ui_type_map = {
                            "http://lv2plug.in/ns/extensions/ui#X11UI": "X11UI",
                            "http://lv2plug.in/ns/extensions/ui#Gtk3UI": "Gtk3UI",
                            "http://lv2plug.in/ns/extensions/ui#GtkUI": "GtkUI",
                            "http://lv2plug.in/ns/extensions/ui#Qt4UI": "Qt4UI",
                            "http://lv2plug.in/ns/extensions/ui#Qt5UI": "Qt5UI",
                            "http://lv2plug.in/ns/extensions/ui#CocoaUI": "CocoaUI",
                            "http://lv2plug.in/ns/extensions/ui#WindowsUI": "WindowsUI",
                        }
                        for uri, name in ui_type_map.items():
                            try:
                                if ui.is_a(self.world.new_uri(uri)):
                                    ui_types.append(name)
                            except Exception:
                                pass
                    except Exception:
                        pass
        except Exception as e:
            logger.debug(f"Error getting UI types: {e}")
        
        # Detect capabilities from output ports and class
        has_tuner = any(p.designation in ("tuner_frequency", "tuner_note") for p in output_ports)
        has_spectrum = any(p.designation == "spectrum" for p in output_ports)
        has_meters = any(p.designation in ("meter", "gain_reduction") for p in output_ports)
        
        # Check class label for analyser
        if "analyser" in class_label.lower() or "tuner" in class_label.lower():
            has_tuner = True
        if "spectrum" in class_label.lower() or "analyzer" in class_label.lower():
            has_spectrum = True
        
        return PluginUIInfo(
            has_native_ui=has_native_ui,
            ui_types=ui_types,
            has_mod_gui=False,  # Would need to check for modgui:gui predicate
            output_ports=output_ports,
            has_tuner=has_tuner,
            has_spectrum=has_spectrum,
            has_meters=has_meters,
        )
    
    def _get_lilv_string(self, lilv_val: Any) -> Optional[str]:
        """Safe extraction of string from lilv value."""
        try:
            if lilv_val is None:
                return None
            return str(lilv_val)
        except:
            return None
    
    def _get_stub_plugins(self) -> List[LV2Plugin]:
        """Return stub plugins when lilv is unavailable."""
        return [
            LV2Plugin(
                uri="http://example.com/basic-amp",
                name="Basic Amplifier",
                author="MAP2 Project",
                license="MIT",
                version="1.0.0",
                class_label="Utility",
                parameters=[
                    PluginParameter(
                        index=0,
                        name="Gain",
                        symbol="gain",
                        uri="http://example.com/basic-amp/gain",
                        value_type="float",
                        min_value=-24.0,
                        max_value=24.0,
                        default_value=0.0,
                    ),
                    PluginParameter(
                        index=1,
                        name="Mute",
                        symbol="mute",
                        uri="http://example.com/basic-amp/mute",
                        value_type="float",
                        min_value=0.0,
                        max_value=1.0,
                        default_value=0.0,
                        is_toggled=True,
                    ),
                ],
                in_port_count=2,
                out_port_count=2,
            ),
            LV2Plugin(
                uri="http://example.com/basic-eq",
                name="3-Band EQ",
                author="MAP2 Project",
                license="MIT",
                version="1.0.0",
                class_label="Equalizer",
                parameters=[
                    PluginParameter(index=0, name="Low", symbol="low", uri="http://example.com/basic-eq/low",
                                     value_type="float", min_value=-24.0, max_value=24.0, default_value=0.0),
                    PluginParameter(index=1, name="Mid", symbol="mid", uri="http://example.com/basic-eq/mid",
                                     value_type="float", min_value=-24.0, max_value=24.0, default_value=0.0),
                    PluginParameter(index=2, name="High", symbol="high", uri="http://example.com/basic-eq/high",
                                     value_type="float", min_value=-24.0, max_value=24.0, default_value=0.0),
                ],
                in_port_count=2,
                out_port_count=2,
            ),
        ]


class PluginLoaderV2:
    """Plugin loader facade with both real and stub implementations."""
    
    def __init__(self):
        self.real_loader = RealLV2Loader()
        self._cached_plugins: Optional[List[LV2Plugin]] = None
    
    async def discover_plugins(self, refresh: bool = False) -> List[LV2Plugin]:
        """
        Discover all LV2 plugins.
        
        Args:
            refresh: Force refresh of plugin cache
        
        Returns:
            List of discovered plugins
        """
        if self._cached_plugins and not refresh:
            return self._cached_plugins
        
        plugins = self.real_loader.discover_plugins()
        self._cached_plugins = plugins
        logger.info(f"Plugin discovery complete: {len(plugins)} plugins")
        return plugins
    
    async def get_plugin_by_uri(self, uri: str) -> Optional[LV2Plugin]:
        """Get plugin metadata by URI."""
        plugins = await self.discover_plugins()
        return next((p for p in plugins if p.uri == uri), None)
    
    async def search_plugins(self, query: str) -> List[LV2Plugin]:
        """Search for plugins by name or category."""
        plugins = await self.discover_plugins()
        query_lower = query.lower()
        return [
            p for p in plugins
            if query_lower in p.name.lower()
            or query_lower in p.category.lower()
            or query_lower in p.author.lower()
        ]
    
    async def get_plugins_by_category(self, category: str) -> List[LV2Plugin]:
        """Get all plugins in a category."""
        plugins = await self.discover_plugins()
        return [p for p in plugins if p.category == category]
    
    async def get_plugin_categories(self) -> List[str]:
        """Get all available plugin categories."""
        plugins = await self.discover_plugins()
        categories = set(p.category for p in plugins)
        return sorted(list(categories))
