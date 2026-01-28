"""
Unified Plugin Loader - Consolidated LV2 Plugin Management

This module provides a single unified API for LV2 plugin discovery and management,
consolidating functionality from:
- plugin_loader_v2.py (Real lilv-based discovery)
- lv2_discovery.py (Persistent caching)
- lv2_enhanced.py (Full LV2 spec compliance)

Features:
- Real lilv-based plugin discovery with graceful fallback
- Persistent JSON cache with directory modification detection
- Full LV2 specification compliance (port types, properties)
- In-memory caching for performance
- Async-compatible API
- Database integration for plugin state persistence
"""

import logging
import json
import hashlib
import time
import asyncio
import threading
from typing import List, Dict, Any, Optional, Set
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
import os

logger = logging.getLogger(__name__)

# Try to import lilv
try:
    import lilv
    LILV_AVAILABLE = True
except ImportError:
    LILV_AVAILABLE = False
    logger.debug("lilv not available - using cached/fallback plugins")


# ============================================================================
# LV2 Specification Types
# ============================================================================

class LV2PortType(Enum):
    """LV2 port types per specification."""
    AUDIO = "lv2:AudioPort"
    CONTROL = "lv2:ControlPort"
    ATOM = "atom:AtomPort"
    CV = "lv2:CVPort"


class LV2PortDirection(Enum):
    """Port direction."""
    INPUT = "lv2:InputPort"
    OUTPUT = "lv2:OutputPort"


class LV2PluginCategory(Enum):
    """Standard LV2 plugin categories."""
    INSTRUMENT = "Instrument"
    OSCILLATOR = "Oscillator"
    UTILITY = "Utility"
    DELAY = "Delay"
    REVERB = "Reverb"
    COMPRESSOR = "Compressor"
    DISTORTION = "Distortion"
    EQUALIZER = "EQ"
    FILTER = "Filter"
    MODULATOR = "Modulator"
    FLANGER = "Flanger"
    PHASER = "Phaser"
    CHORUS = "Chorus"
    DYNAMICS = "Dynamics"
    LIMITER = "Limiter"
    GATE = "Gate"
    SPATIAL = "Spatial"
    PITCH = "Pitch"
    AMPLIFIER = "Amplifier"
    MIXER = "Mixer"
    SIMULATOR = "Simulator"
    ANALYSER = "Analyser"
    UNKNOWN = "Unknown"


# ============================================================================
# Plugin Data Classes
# ============================================================================

@dataclass
class PluginParameter:
    """Plugin parameter metadata."""
    index: int
    name: str
    symbol: str
    uri: str = ""
    value_type: str = "float"
    min_value: float = 0.0
    max_value: float = 1.0
    default_value: float = 0.0
    is_toggled: bool = False
    is_logarithmic: bool = False
    is_integer: bool = False
    is_enumeration: bool = False
    scale_points: Dict[str, float] = field(default_factory=dict)
    unit: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "index": self.index,
            "name": self.name,
            "symbol": self.symbol,
            "uri": self.uri,
            "value_type": self.value_type,
            "min_value": self.min_value,
            "max_value": self.max_value,
            "default_value": self.default_value,
            "is_toggled": self.is_toggled,
            "is_logarithmic": self.is_logarithmic,
            "is_integer": self.is_integer,
            "is_enumeration": self.is_enumeration,
            "scale_points": self.scale_points,
            "unit": self.unit,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PluginParameter':
        """Create from dictionary."""
        return cls(
            index=data.get("index", 0),
            name=data.get("name", ""),
            symbol=data.get("symbol", ""),
            uri=data.get("uri", ""),
            value_type=data.get("value_type", "float"),
            min_value=data.get("min_value", 0.0),
            max_value=data.get("max_value", 1.0),
            default_value=data.get("default_value", 0.0),
            is_toggled=data.get("is_toggled", False),
            is_logarithmic=data.get("is_logarithmic", False),
            is_integer=data.get("is_integer", False),
            is_enumeration=data.get("is_enumeration", False),
            scale_points=data.get("scale_points", {}),
            unit=data.get("unit", ""),
        )


@dataclass
class PluginPort:
    """Plugin port descriptor."""
    index: int
    symbol: str
    name: str
    port_type: LV2PortType
    direction: LV2PortDirection
    is_optional: bool = False
    supports_midi: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "index": self.index,
            "symbol": self.symbol,
            "name": self.name,
            "port_type": self.port_type.value,
            "direction": self.direction.value,
            "is_optional": self.is_optional,
            "supports_midi": self.supports_midi,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PluginPort':
        return cls(
            index=data.get("index", 0),
            symbol=data.get("symbol", ""),
            name=data.get("name", ""),
            port_type=LV2PortType(data.get("port_type", "lv2:ControlPort")),
            direction=LV2PortDirection(data.get("direction", "lv2:InputPort")),
            is_optional=data.get("is_optional", False),
            supports_midi=data.get("supports_midi", False),
        )


@dataclass
class LV2Plugin:
    """Complete LV2 plugin metadata."""
    uri: str
    name: str
    author: str = ""
    license: str = ""
    version: str = ""
    class_label: str = "Utility"
    category: str = "Utility"
    parameters: List[PluginParameter] = field(default_factory=list)
    ports: List[PluginPort] = field(default_factory=list)
    has_ui: bool = False
    executable: bool = True
    in_port_count: int = 0
    out_port_count: int = 0
    supports_midi: bool = False
    supports_cv: bool = False
    latency_port: Optional[int] = None
    required_features: Set[str] = field(default_factory=set)
    optional_features: Set[str] = field(default_factory=set)
    # RT-safety fields
    is_hard_rt_capable: bool = False  # LV2 hardRTCapable feature
    rt_safety_verified: bool = False  # Manually verified RT-safe
    rt_safety_warning: Optional[str] = None  # Warning message if not RT-safe

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization/caching."""
        return {
            "uri": self.uri,
            "name": self.name,
            "author": self.author,
            "license": self.license,
            "version": self.version,
            "class_label": self.class_label,
            "category": self.category,
            "parameters": [p.to_dict() for p in self.parameters],
            "ports": [p.to_dict() for p in self.ports],
            "has_ui": self.has_ui,
            "executable": self.executable,
            "in_port_count": self.in_port_count,
            "out_port_count": self.out_port_count,
            "supports_midi": self.supports_midi,
            "supports_cv": self.supports_cv,
            "latency_port": self.latency_port,
            "required_features": list(self.required_features),
            "optional_features": list(self.optional_features),
            "is_hard_rt_capable": self.is_hard_rt_capable,
            "rt_safety_verified": self.rt_safety_verified,
            "rt_safety_warning": self.rt_safety_warning,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'LV2Plugin':
        """Create from dictionary."""
        return cls(
            uri=data.get("uri", ""),
            name=data.get("name", ""),
            author=data.get("author", ""),
            license=data.get("license", ""),
            version=data.get("version", ""),
            class_label=data.get("class_label", "Utility"),
            category=data.get("category", "Utility"),
            parameters=[PluginParameter.from_dict(p) for p in data.get("parameters", [])],
            ports=[PluginPort.from_dict(p) for p in data.get("ports", [])],
            has_ui=data.get("has_ui", False),
            executable=data.get("executable", True),
            in_port_count=data.get("in_port_count", 0),
            out_port_count=data.get("out_port_count", 0),
            supports_midi=data.get("supports_midi", False),
            supports_cv=data.get("supports_cv", False),
            latency_port=data.get("latency_port"),
            required_features=set(data.get("required_features", [])),
            optional_features=set(data.get("optional_features", [])),
            is_hard_rt_capable=data.get("is_hard_rt_capable", False),
            rt_safety_verified=data.get("rt_safety_verified", False),
            rt_safety_warning=data.get("rt_safety_warning"),
        )

    def is_rt_safe(self) -> bool:
        """Check if plugin is considered RT-safe."""
        return self.is_hard_rt_capable or self.rt_safety_verified

    def get_rt_safety_status(self) -> str:
        """Get RT-safety status description."""
        if self.is_hard_rt_capable:
            return "Verified RT-safe (LV2 hardRTCapable)"
        elif self.rt_safety_verified:
            return "Manually verified RT-safe"
        elif self.rt_safety_warning:
            return f"Warning: {self.rt_safety_warning}"
        else:
            return "RT-safety unknown - use with caution in live contexts"


# ============================================================================
# Unified Plugin Loader
# ============================================================================

class UnifiedPluginLoader:
    """
    Unified LV2 plugin loader with caching and real lilv support.

    This consolidates all plugin loading functionality into a single class
    with the following features:
    - Real lilv-based discovery when available
    - Persistent JSON cache with modification detection
    - In-memory caching for fast repeated access
    - Async-compatible API
    - Full LV2 spec compliance
    """

    # Singleton instance
    _instance: Optional['UnifiedPluginLoader'] = None

    # Cache configuration
    CACHE_DIR = Path.home() / ".cache" / "map2"
    CACHE_FILE = Path.home() / ".cache" / "map2" / "plugins_unified.json"
    CACHE_VERSION = "2.0"
    CACHE_TTL_SECONDS = 300  # 5 minutes in-memory TTL

    def __init__(self, use_cache: bool = True):
        """Initialize the unified plugin loader.

        Args:
            use_cache: Whether to use persistent file cache
        """
        self.use_cache = use_cache
        self._plugins: Dict[str, LV2Plugin] = {}
        self._categories: Dict[str, List[str]] = {}
        self._in_memory_timestamp: float = 0
        self._lilv_world: Optional[Any] = None
        self._initialized = False
        self._lock = threading.Lock()  # Changed from asyncio.Lock to threading.Lock

        # Ensure cache directory exists
        self.CACHE_DIR.mkdir(parents=True, exist_ok=True)

        # Initialize lilv if available
        if LILV_AVAILABLE:
            try:
                self._lilv_world = lilv.World()
                self._lilv_world.load_all()
                logger.info("lilv world initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize lilv: {e}")
                self._lilv_world = None

    @classmethod
    def get_instance(cls) -> 'UnifiedPluginLoader':
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def refresh_lilv_world(self):
        """Refresh the lilv world to detect newly installed/removed plugins."""
        with self._lock:
            # Clear caches
            self._plugins.clear()
            self._categories.clear()
            self._initialized = False
            self._in_memory_timestamp = 0

            # Recreate lilv world
            if LILV_AVAILABLE:
                try:
                    import lilv
                    self._lilv_world = lilv.World()
                    self._lilv_world.load_all()
                    logger.info("lilv world refreshed for new plugins")
                except Exception as e:
                    logger.warning(f"Failed to refresh lilv world: {e}")
                    self._lilv_world = None

            # Clear persistent cache
            try:
                if self.CACHE_FILE.exists():
                    self.CACHE_FILE.unlink()
                    logger.info("Persistent plugin cache cleared")
            except Exception as e:
                logger.warning(f"Failed to clear persistent cache: {e}")

    def _get_lv2_paths(self) -> List[str]:
        """Get list of LV2 plugin directories."""
        paths = [
            os.path.expanduser("~/.lv2"),
            "/usr/lib/lv2",
            "/usr/local/lib/lv2",
            "/usr/lib64/lv2",
            "/usr/lib/x86_64-linux-gnu/lv2",
            "/usr/lib/aarch64-linux-gnu/lv2",
        ]
        # Add from environment
        lv2_path = os.environ.get("LV2_PATH", "")
        if lv2_path:
            paths.extend(lv2_path.split(":"))
        return paths

    def _compute_paths_hash(self) -> str:
        """Compute hash of LV2 directories for cache invalidation."""
        hash_data = []
        for path in self._get_lv2_paths():
            if os.path.isdir(path):
                try:
                    mtime = os.path.getmtime(path)
                    subdir_count = len([
                        d for d in os.listdir(path)
                        if os.path.isdir(os.path.join(path, d))
                    ])
                    hash_data.append(f"{path}:{mtime}:{subdir_count}")
                except OSError:
                    pass
        return hashlib.md5("|".join(sorted(hash_data)).encode()).hexdigest()

    def _load_from_cache(self) -> bool:
        """Load plugins from persistent cache."""
        if not self.use_cache:
            return False

        try:
            if not self.CACHE_FILE.exists():
                return False

            with open(self.CACHE_FILE, 'r') as f:
                cache_data = json.load(f)

            # Validate cache version
            if cache_data.get("version") != self.CACHE_VERSION:
                logger.info("Cache version mismatch, will rediscover")
                return False

            # Check if directories have changed
            current_hash = self._compute_paths_hash()
            if cache_data.get("paths_hash") != current_hash:
                logger.info("LV2 directories changed, will rediscover")
                return False

            # Load plugins
            plugins_data = cache_data.get("plugins", {})
            self._plugins = {
                uri: LV2Plugin.from_dict(data)
                for uri, data in plugins_data.items()
            }

            self._build_category_index()
            self._in_memory_timestamp = time.time()
            logger.info(f"Loaded {len(self._plugins)} plugins from cache")
            return True

        except Exception as e:
            logger.warning(f"Failed to load plugin cache: {e}")
            return False

    def _save_to_cache(self) -> None:
        """Save plugins to persistent cache."""
        if not self.use_cache:
            return

        try:
            cache_data = {
                "version": self.CACHE_VERSION,
                "paths_hash": self._compute_paths_hash(),
                "timestamp": time.time(),
                "plugins": {
                    uri: plugin.to_dict()
                    for uri, plugin in self._plugins.items()
                }
            }

            with open(self.CACHE_FILE, 'w') as f:
                json.dump(cache_data, f, indent=2)

            logger.info(f"Saved {len(self._plugins)} plugins to cache")

        except Exception as e:
            logger.warning(f"Failed to save plugin cache: {e}")

    def _build_category_index(self) -> None:
        """Build category to plugin URI index."""
        self._categories.clear()
        for uri, plugin in self._plugins.items():
            category = plugin.category or "Unknown"
            if category not in self._categories:
                self._categories[category] = []
            self._categories[category].append(uri)

    def _classify_plugin(self, class_uri: str, plugin_name: str) -> str:
        """Determine plugin category from class URI and name."""
        class_lower = class_uri.lower() if class_uri else ""
        name_lower = plugin_name.lower()

        # Check class URI
        category_map = {
            "instrument": "Instrument",
            "oscillator": "Instrument",
            "distortion": "Distortion",
            "waveshaper": "Distortion",
            "amplifier": "Amplifier",
            "delay": "Delay",
            "reverb": "Reverb",
            "compressor": "Compressor",
            "dynamics": "Dynamics",
            "limiter": "Limiter",
            "gate": "Gate",
            "expander": "Dynamics",
            "eq": "EQ",
            "equaliser": "EQ",
            "equalizer": "EQ",
            "paraeq": "EQ",
            "filter": "Filter",
            "lowpass": "Filter",
            "highpass": "Filter",
            "bandpass": "Filter",
            "modulator": "Modulator",
            "flanger": "Modulator",
            "phaser": "Modulator",
            "chorus": "Modulator",
            "pitch": "Pitch",
            "utility": "Utility",
            "mixer": "Mixer",
            "spatial": "Spatial",
            "analyser": "Analyser",
            "simulator": "Simulator",
        }

        # Check class URI first
        for keyword, category in category_map.items():
            if keyword in class_lower:
                return category

        # Fallback to name-based detection
        for keyword, category in category_map.items():
            if keyword in name_lower:
                return category

        return "Utility"

    def _discover_with_lilv(self) -> None:
        """Discover plugins using lilv library."""
        if not LILV_AVAILABLE or self._lilv_world is None:
            logger.debug("lilv not available")
            return

        try:
            logger.info("Discovering plugins with lilv...")
            plugin_list = self._lilv_world.get_all_plugins()

            for lilv_plugin in plugin_list:
                try:
                    lv2_plugin = self._parse_lilv_plugin(lilv_plugin)
                    if lv2_plugin:
                        self._plugins[lv2_plugin.uri] = lv2_plugin
                except Exception as e:
                    logger.debug(f"Error parsing plugin: {e}")
                    continue

            logger.info(f"Discovered {len(self._plugins)} plugins via lilv")

        except Exception as e:
            logger.error(f"Error during lilv discovery: {e}")

    def _parse_lilv_plugin(self, lilv_plugin) -> Optional[LV2Plugin]:
        """Convert lilv plugin to LV2Plugin dataclass."""
        try:
            uri = str(lilv_plugin.get_uri())

            # Note: lilv nodes don't support truthiness check in Python 3.14
            # Use 'is not None' instead of 'if node'
            name_node = lilv_plugin.get_name()
            name = str(name_node) if name_node is not None else "Unknown"

            author_node = lilv_plugin.get_author_name()
            author = str(author_node) if author_node is not None else "Unknown"

            # Get class/category
            class_label = "Utility"
            plugin_class = lilv_plugin.get_class()
            if plugin_class is not None:
                class_node = plugin_class.get_label()
                if class_node is not None:
                    class_label = str(class_node)

            # Count audio ports
            in_count = 0
            out_count = 0
            audio_uri = self._lilv_world.new_uri("http://lv2plug.in/ns/lv2core#AudioPort")
            input_uri = self._lilv_world.new_uri("http://lv2plug.in/ns/lv2core#InputPort")
            output_uri = self._lilv_world.new_uri("http://lv2plug.in/ns/lv2core#OutputPort")
            control_uri = self._lilv_world.new_uri("http://lv2plug.in/ns/lv2core#ControlPort")

            for i in range(lilv_plugin.get_num_ports()):
                port = lilv_plugin.get_port_by_index(i)
                if port.is_a(audio_uri):
                    if port.is_a(input_uri):
                        in_count += 1
                    elif port.is_a(output_uri):
                        out_count += 1

            # Extract parameters (control INPUT ports only)
            parameters = []
            toggled_uri = self._lilv_world.new_uri("http://lv2plug.in/ns/lv2core#toggled")
            log_uri = self._lilv_world.new_uri("http://lv2plug.in/ns/ext/port-props#logarithmic")

            for i in range(lilv_plugin.get_num_ports()):
                port = lilv_plugin.get_port_by_index(i)
                if port.is_a(control_uri) and port.is_a(input_uri):
                    param = self._parse_lilv_parameter(port, i, toggled_uri, log_uri)
                    if param:
                        parameters.append(param)

            # Check for UI
            has_ui = False
            try:
                uis = lilv_plugin.get_uis()
                has_ui = uis is not None and len(list(uis)) > 0
            except Exception:
                pass

            category = self._classify_plugin(class_label, name)

            return LV2Plugin(
                uri=uri,
                name=name,
                author=author,
                license="Unknown",
                version="1.0",
                class_label=class_label,
                category=category,
                parameters=parameters,
                has_ui=has_ui,
                executable=True,
                in_port_count=in_count,
                out_port_count=out_count,
            )
        except Exception as e:
            logger.debug(f"Error parsing lilv plugin: {e}")
            return None

    def _parse_lilv_parameter(self, port, index: int, toggled_uri, log_uri) -> Optional[PluginParameter]:
        """Parse a parameter from a lilv control port."""
        try:
            # Note: lilv nodes don't support truthiness check in Python 3.14
            # Use 'is not None' instead of 'if node'
            name_node = port.get_name()
            name = str(name_node) if name_node is not None else f"Param {index}"

            symbol_node = port.get_symbol()
            symbol = str(symbol_node) if symbol_node is not None else f"param_{index}"

            # Get range (default, min, max)
            default_val, min_val, max_val = 0.0, 0.0, 1.0
            try:
                dfl, mn, mx = port.get_range()
                if dfl is not None:
                    default_val = self._lilv_node_to_float(dfl, 0.0)
                if mn is not None:
                    min_val = self._lilv_node_to_float(mn, 0.0)
                if mx is not None:
                    max_val = self._lilv_node_to_float(mx, 1.0)
            except Exception:
                pass

            # Check port properties
            is_toggled = False
            is_log = False
            try:
                if hasattr(port, 'has_property'):
                    is_toggled = port.has_property(toggled_uri) if toggled_uri else False
                    is_log = port.has_property(log_uri) if log_uri else False
            except Exception:
                pass

            return PluginParameter(
                index=index,
                name=name,
                symbol=symbol,
                uri=symbol,
                value_type="float",
                min_value=min_val,
                max_value=max_val,
                default_value=default_val,
                is_toggled=is_toggled,
                is_logarithmic=is_log,
            )
        except Exception as e:
            logger.debug(f"Error parsing parameter {index}: {e}")
            return None

    def _lilv_node_to_float(self, node, default: float = 0.0) -> float:
        """Convert a lilv Node to a float value."""
        if node is None:
            return default
        try:
            if hasattr(node, 'is_float') and node.is_float():
                return float(node)
            elif hasattr(node, 'is_int') and node.is_int():
                return float(int(node))
            else:
                return float(str(node))
        except (ValueError, TypeError):
            return default

    def _discover_fallback(self) -> None:
        """Discover plugins by scanning LV2 directories (fallback when lilv unavailable)."""
        logger.info("Starting fallback plugin discovery...")
        found_count = 0
        
        for lv2_path in self._get_lv2_paths():
            if not os.path.isdir(lv2_path):
                continue

            try:
                for entry in os.listdir(lv2_path):
                    plugin_dir = os.path.join(lv2_path, entry)
                    if not os.path.isdir(plugin_dir):
                        continue

                    manifest = os.path.join(plugin_dir, "manifest.ttl")
                    if not os.path.exists(manifest):
                        continue

                    # Basic plugin from directory name
                    name = entry.replace(".lv2", "").replace("-", " ").replace("_", " ").title()
                    uri = f"urn:map2:fallback:{entry}"

                    plugin = LV2Plugin(
                        uri=uri,
                        name=name,
                        category=self._classify_plugin("", name),
                        in_port_count=2,
                        out_port_count=2,
                    )
                    self._plugins[uri] = plugin
                    found_count += 1
            except Exception as e:
                logger.debug(f"Error scanning {lv2_path}: {e}")
                continue
        
        logger.info(f"Fallback discovery found {found_count} plugins")
    async def discover(self, force_refresh: bool = False) -> List[LV2Plugin]:
        """
        Discover all available LV2 plugins.

        Args:
            force_refresh: If True, bypass cache and rediscover

        Returns:
            List of discovered plugins
        """
        with self._lock:
            # Check in-memory cache
            if not force_refresh and self._plugins and self._initialized:
                cache_age = time.time() - self._in_memory_timestamp
                if cache_age < self.CACHE_TTL_SECONDS:
                    return list(self._plugins.values())

            # Try loading from persistent cache
            if not force_refresh and self._load_from_cache():
                self._initialized = True
                return list(self._plugins.values())

            # Discover from system
            self._plugins.clear()

            if LILV_AVAILABLE and self._lilv_world:
                self._discover_with_lilv()
            
            # Use fallback if lilv didn't find plugins
            if not self._plugins:
                logger.debug("No plugins found with lilv, using fallback discovery...")
                self._discover_fallback()


            # Build indexes and save cache
            self._build_category_index()
            self._save_to_cache()
            self._in_memory_timestamp = time.time()
            self._initialized = True

            return list(self._plugins.values())

    def discover_sync(self, force_refresh: bool = False) -> List[LV2Plugin]:
        """Synchronous version of discover for non-async contexts."""
        # Check in-memory cache
        if not force_refresh and self._plugins and self._initialized:
            cache_age = time.time() - self._in_memory_timestamp
            if cache_age < self.CACHE_TTL_SECONDS:
                return list(self._plugins.values())

        # Try loading from persistent cache
        if not force_refresh and self._load_from_cache():
            self._initialized = True
            return list(self._plugins.values())

        # Discover from system
        self._plugins.clear()

        # Try lilv first, then fallback if no plugins found
        if LILV_AVAILABLE and self._lilv_world:
            try:
                self._discover_with_lilv()
            except Exception as e:
                logger.warning(f"lilv discovery failed: {e}, using fallback")
                self._plugins.clear()
        
        # Use fallback if lilv didn't find plugins or failed
        if not self._plugins:
            logger.debug("Using fallback discovery...")
            self._discover_fallback()

        # Build indexes and save cache
        self._build_category_index()
        self._save_to_cache()
        self._in_memory_timestamp = time.time()
        self._initialized = True

        return list(self._plugins.values())

    def discover_plugins(self) -> List[LV2Plugin]:
        """Sync wrapper for API compatibility."""
        return self.discover_sync()

    def get_plugin(self, uri: str) -> Optional[LV2Plugin]:
        """Get a plugin by URI."""
        return self._plugins.get(uri)

    def get_plugins_by_category(self, category: str) -> List[LV2Plugin]:
        """Get all plugins in a category."""
        uris = self._categories.get(category, [])
        return [self._plugins[uri] for uri in uris if uri in self._plugins]

    def _get_nam_plugins(self) -> List:
        """Get NAM as virtual plugin if available."""
        nam_plugins = []
        try:
            from app.services.nam_processor import NAM_AVAILABLE
            if NAM_AVAILABLE:
                from app.services.nam_plugin_wrapper import NAMPluginInfo
                nam_plugin = NAMPluginInfo()
                nam_plugins.append(nam_plugin)
                logger.info("Added NAM (Neural Amp Modeler) virtual plugin to discovery")
        except Exception as e:
            logger.debug(f"NAM plugin not available: {e}")
        return nam_plugins

    def _get_ir_plugins(self) -> List:
        """Get IR plugins (cabinet and reverb) if available."""
        ir_plugins = []
        try:
            from app.services.ir_processor import IRProcessor
            ir_proc = IRProcessor()
            if ir_proc:
                from app.services.ir_plugin_wrapper import get_cabinet_ir_plugin, get_reverb_ir_plugin
                # Add Cabinet IR plugin
                cabinet_plugin = get_cabinet_ir_plugin()
                ir_plugins.append(cabinet_plugin)
                logger.info("Added Cabinet IR virtual plugin to discovery")
                # Add Reverb IR plugin
                reverb_plugin = get_reverb_ir_plugin()
                ir_plugins.append(reverb_plugin)
                logger.info("Added Reverb IR virtual plugin to discovery")
        except Exception as e:
            logger.debug(f"IR plugins not available: {e}")
        return ir_plugins

    def get_categories(self) -> List[str]:
        """Get list of all plugin categories."""
        return sorted(self._categories.keys())

    def search(self, query: str) -> List[LV2Plugin]:
        """Search plugins by name, author, or URI."""
        query_lower = query.lower()
        results = []

        for plugin in self._plugins.values():
            if (query_lower in plugin.name.lower() or
                query_lower in plugin.author.lower() or
                query_lower in plugin.uri.lower() or
                query_lower in plugin.category.lower()):
                results.append(plugin)

        return results

    def get_plugin_count(self) -> int:
        """Get total number of discovered plugins."""
        return len(self._plugins)

    def clear_cache(self) -> None:
        """Clear all caches (in-memory and persistent)."""
        self._plugins.clear()
        self._categories.clear()
        self._in_memory_timestamp = 0
        self._initialized = False

        if self.CACHE_FILE.exists():
            try:
                self.CACHE_FILE.unlink()
                logger.info("Plugin cache cleared")
            except Exception as e:
                logger.warning(f"Failed to delete cache file: {e}")

    def get_stats(self) -> Dict[str, Any]:
        """Get loader statistics."""
        return {
            "plugin_count": len(self._plugins),
            "category_count": len(self._categories),
            "lilv_available": LILV_AVAILABLE,
            "cache_file": str(self.CACHE_FILE),
            "cache_exists": self.CACHE_FILE.exists(),
            "initialized": self._initialized,
            "in_memory_age": time.time() - self._in_memory_timestamp if self._in_memory_timestamp else None,
        }


# ============================================================================
# Backwards Compatibility Aliases
# ============================================================================

# For compatibility with plugin_loader_v2.py
class PluginLoaderV2:
    """Backwards-compatible wrapper for UnifiedPluginLoader."""

    def __init__(self):
        self._loader = UnifiedPluginLoader.get_instance()

    async def discover_plugins(self, refresh: bool = False) -> List[LV2Plugin]:
        return await self._loader.discover(force_refresh=refresh)

    def discover_plugins_sync(self) -> List[LV2Plugin]:
        return self._loader.discover_sync()

    def get_plugin(self, uri: str) -> Optional[LV2Plugin]:
        return self._loader.get_plugin(uri)

    def search_plugins(self, query: str) -> List[LV2Plugin]:
        return self._loader.search(query)


# For compatibility with RealLV2Loader
class RealLV2Loader:
    """Backwards-compatible wrapper for UnifiedPluginLoader."""

    def __init__(self):
        self._loader = UnifiedPluginLoader.get_instance()

    def discover_plugins(self) -> List[LV2Plugin]:
        return self._loader.discover_sync()

    def get_plugin(self, uri: str) -> Optional[LV2Plugin]:
        return self._loader.get_plugin(uri)


# Global singleton accessor
def get_plugin_loader() -> UnifiedPluginLoader:
    """Get the global unified plugin loader instance."""
    return UnifiedPluginLoader.get_instance()
