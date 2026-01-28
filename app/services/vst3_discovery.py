"""
VST3 Plugin Discovery Service
Implements VST3 plugin discovery using JUCE engine integration.

Performance optimizations:
- Persistent JSON cache with file modification timestamps
- Async-compatible discovery
- In-memory caching after first load
"""

import logging
import json
import hashlib
import time
from typing import List, Dict, Any, Optional
from pathlib import Path
import os

logger = logging.getLogger(__name__)

# Cache configuration
CACHE_DIR = Path.home() / ".cache" / "map2"
CACHE_FILE = CACHE_DIR / "vst3_plugins.json"
CACHE_VERSION = "1.0"


class VST3PluginDiscovery:
    """Discover and manage VST3 plugins with caching."""

    # Class-level cache shared across all instances
    _shared_cache: Dict[str, Dict[str, Any]] = {}
    _cache_loaded: bool = False
    _cache_timestamp: float = 0

    def __init__(self, use_cache: bool = True):
        """Initialize VST3 plugin discovery.

        Args:
            use_cache: Whether to use persistent file cache (default True)
        """
        self.plugins: Dict[str, Dict[str, Any]] = {}
        self.loaded_plugins: Dict[str, Any] = {}
        self._use_cache = use_cache

        # Try to load from cache first
        if use_cache and self._load_from_cache():
            logger.info(f"Loaded {len(self.plugins)} VST3 plugins from cache")
        else:
            self._discover_system_plugins()
            if use_cache:
                self._save_to_cache()

    def _get_vst3_paths(self) -> List[str]:
        """Get list of VST3 plugin directories."""
        return [
            os.path.expanduser("~/.vst3"),
            "/usr/lib/vst3",
            "/usr/local/lib/vst3",
            "/usr/lib64/vst3",
            # Common additional paths
            os.path.expanduser("~/.local/lib/vst3"),
            "/opt/vst3",
        ]

    def _compute_paths_hash(self) -> str:
        """Compute a hash of VST3 directory modification times.

        Used to detect when plugins have been added/removed.
        """
        hash_data = []
        for path in self._get_vst3_paths():
            if os.path.isdir(path):
                try:
                    # Include directory mtime and count of subdirectories/files
                    mtime = os.path.getmtime(path)
                    items = os.listdir(path)
                    vst3_count = len([d for d in items if d.endswith('.vst3')])
                    hash_data.append(f"{path}:{mtime}:{vst3_count}")
                except OSError:
                    pass
        return hashlib.md5("|".join(hash_data).encode()).hexdigest()

    def _load_from_cache(self) -> bool:
        """Load plugins from persistent cache.

        Returns:
            True if cache was valid and loaded, False otherwise
        """
        # Check if already loaded in memory (class-level cache)
        if VST3PluginDiscovery._cache_loaded and VST3PluginDiscovery._shared_cache:
            self.plugins = VST3PluginDiscovery._shared_cache.copy()
            logger.debug("Using in-memory VST3 plugin cache")
            return True

        if not CACHE_FILE.exists():
            logger.debug("No VST3 cache file found")
            return False

        try:
            with open(CACHE_FILE, 'r') as f:
                cache_data = json.load(f)

            # Validate cache version
            if cache_data.get("version") != CACHE_VERSION:
                logger.info("VST3 cache version mismatch, will rescan")
                return False

            # Validate paths hash (detect new/removed plugins)
            current_hash = self._compute_paths_hash()
            if cache_data.get("paths_hash") != current_hash:
                logger.info("VST3 paths changed, will rescan")
                return False

            # Check cache age (max 24 hours)
            cache_time = cache_data.get("timestamp", 0)
            if time.time() - cache_time > 86400:
                logger.info("VST3 cache expired (>24h), will rescan")
                return False

            # Load plugins
            self.plugins = cache_data.get("plugins", {})

            # Update class-level cache
            VST3PluginDiscovery._shared_cache = self.plugins.copy()
            VST3PluginDiscovery._cache_loaded = True
            VST3PluginDiscovery._cache_timestamp = cache_time

            return True

        except (json.JSONDecodeError, KeyError, OSError) as e:
            logger.warning(f"Failed to load VST3 cache: {e}")
            return False

    def _save_to_cache(self) -> None:
        """Save discovered plugins to persistent cache."""
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)

            cache_data = {
                "version": CACHE_VERSION,
                "timestamp": time.time(),
                "paths_hash": self._compute_paths_hash(),
                "plugins": self.plugins
            }

            with open(CACHE_FILE, 'w') as f:
                json.dump(cache_data, f, indent=2)

            # Update class-level cache
            VST3PluginDiscovery._shared_cache = self.plugins.copy()
            VST3PluginDiscovery._cache_loaded = True
            VST3PluginDiscovery._cache_timestamp = cache_data["timestamp"]

            logger.info(f"Saved {len(self.plugins)} VST3 plugins to cache")

        except OSError as e:
            logger.warning(f"Failed to save VST3 cache: {e}")

    @classmethod
    def invalidate_cache(cls) -> None:
        """Invalidate both in-memory and persistent cache."""
        cls._shared_cache = {}
        cls._cache_loaded = False
        cls._cache_timestamp = 0
        try:
            if CACHE_FILE.exists():
                CACHE_FILE.unlink()
                logger.info("VST3 plugin cache invalidated")
        except OSError as e:
            logger.warning(f"Failed to delete VST3 cache file: {e}")

    def _discover_system_plugins(self) -> None:
        """Discover VST3 plugins on the system.

        Looks in standard VST3 plugin directories:
        - ~/.vst3/
        - /usr/lib/vst3/
        - /usr/local/lib/vst3/
        - /usr/lib64/vst3/

        Supports both bundle format (directories) and flat format (single files).
        """
        start_time = time.time()
        vst3_paths = self._get_vst3_paths()

        discovered = 0
        incompatible = 0
        for path in vst3_paths:
            if not os.path.isdir(path):
                continue

            for item in os.listdir(path):
                plugin_path = os.path.join(path, item)

                # VST3 plugins end in .vst3 (can be directories or files)
                if not item.endswith('.vst3'):
                    continue

                try:
                    if os.path.isdir(plugin_path):
                        # Bundle format: plugin.vst3/Contents/arch/plugin.so
                        plugin_data = self._parse_vst3_bundle(plugin_path, item)
                    elif os.path.isfile(plugin_path):
                        # Flat format: plugin.vst3 (single file)
                        plugin_data = self._parse_vst3_flat(plugin_path, item)
                    else:
                        continue

                    if plugin_data:
                        self.plugins[plugin_data["uri"]] = plugin_data
                        if plugin_data.get("compatible", True):
                            discovered += 1
                        else:
                            incompatible += 1
                except Exception as e:
                    logger.warning(f"Error parsing VST3 plugin at {plugin_path}: {e}")

        elapsed = (time.time() - start_time) * 1000
        if incompatible > 0:
            logger.info(f"Discovered {discovered} VST3 plugins ({incompatible} incompatible) in {elapsed:.1f}ms")
        else:
            logger.info(f"Discovered {discovered} VST3 plugins in {elapsed:.1f}ms")

    def _parse_vst3_bundle(self, plugin_path: str, bundle_name: str) -> Optional[Dict[str, Any]]:
        """Parse VST3 bundle to extract plugin metadata.

        Args:
            plugin_path: Path to plugin .vst3 bundle
            bundle_name: Name of the bundle directory

        Returns:
            Plugin metadata dict or None
        """
        try:
            # Extract plugin name from bundle name (remove .vst3 extension)
            plugin_name = bundle_name[:-5] if bundle_name.endswith('.vst3') else bundle_name

            # Generate a unique URI for this plugin
            plugin_uri = f"vst3://{plugin_name}"

            # Check for the actual plugin binary
            # VST3 structure: plugin.vst3/Contents/x86_64-linux/plugin.so
            contents_path = os.path.join(plugin_path, "Contents")
            has_binary = False
            binary_path = None

            if os.path.isdir(contents_path):
                # Check for Linux binary
                for arch in ["x86_64-linux", "i386-linux", "aarch64-linux"]:
                    arch_path = os.path.join(contents_path, arch)
                    if os.path.isdir(arch_path):
                        for f in os.listdir(arch_path):
                            if f.endswith('.so'):
                                has_binary = True
                                binary_path = os.path.join(arch_path, f)
                                break
                        if has_binary:
                            break

            if not has_binary:
                # Also check for flat structure (some plugins)
                for f in os.listdir(plugin_path):
                    if f.endswith('.so'):
                        has_binary = True
                        binary_path = os.path.join(plugin_path, f)
                        break

            if not has_binary:
                logger.debug(f"No binary found for VST3 plugin: {plugin_name}")
                return None

            # Try to extract category from common naming patterns
            category = self._guess_category(plugin_name)

            # Try to read moduleinfo.json if it exists (VST3 3.7+)
            author = "Unknown"
            description = ""
            moduleinfo_path = os.path.join(contents_path, "moduleinfo.json") if contents_path else None

            if moduleinfo_path and os.path.isfile(moduleinfo_path):
                try:
                    with open(moduleinfo_path, 'r') as f:
                        moduleinfo = json.load(f)
                    if "Factory Info" in moduleinfo:
                        factory = moduleinfo["Factory Info"]
                        author = factory.get("Vendor", author)
                    if "Classes" in moduleinfo and len(moduleinfo["Classes"]) > 0:
                        cls = moduleinfo["Classes"][0]
                        if "Sub Categories" in cls:
                            subcats = cls["Sub Categories"]
                            if subcats:
                                category = self._map_vst3_category(subcats[0])
                except Exception as e:
                    logger.debug(f"Could not parse moduleinfo.json for {plugin_name}: {e}")

            # Check binary compatibility
            is_compatible, platform = self._check_binary_platform(binary_path) if binary_path else (False, "unknown")

            return {
                "uri": plugin_uri,
                "name": plugin_name,
                "category": category,
                "path": plugin_path,
                "binary_path": binary_path,
                "author": author,
                "description": description,
                "format": "VST3",
                "audio_inputs": 2,
                "audio_outputs": 2,
                "midi_inputs": 1,
                "has_ui": True,  # Most VST3 plugins have UI
                "parameters": [],
                "compatible": is_compatible,
                "platform": platform,
            }
        except Exception as e:
            logger.error(f"Error parsing VST3 bundle at {plugin_path}: {e}")
            return None

    def _parse_vst3_flat(self, plugin_path: str, file_name: str) -> Optional[Dict[str, Any]]:
        """Parse flat VST3 file (single file format) to extract plugin metadata.

        Args:
            plugin_path: Path to plugin .vst3 file
            file_name: Name of the file

        Returns:
            Plugin metadata dict or None
        """
        try:
            # Extract plugin name from file name (remove .vst3 extension)
            plugin_name = file_name[:-5] if file_name.endswith('.vst3') else file_name

            # Generate a unique URI for this plugin
            plugin_uri = f"vst3://{plugin_name}"

            # Check if binary is Linux-compatible
            is_compatible, platform = self._check_binary_platform(plugin_path)

            # Try to guess category from naming patterns
            category = self._guess_category(plugin_name)

            return {
                "uri": plugin_uri,
                "name": plugin_name,
                "category": category,
                "path": plugin_path,
                "binary_path": plugin_path,
                "author": "Unknown",
                "description": "",
                "format": "VST3",
                "audio_inputs": 2,
                "audio_outputs": 2,
                "midi_inputs": 1,
                "has_ui": True,
                "parameters": [],
                "compatible": is_compatible,
                "platform": platform,
            }
        except Exception as e:
            logger.error(f"Error parsing flat VST3 at {plugin_path}: {e}")
            return None

    def _check_binary_platform(self, binary_path: str) -> tuple[bool, str]:
        """Check if a binary file is Linux-compatible.

        Args:
            binary_path: Path to the binary file

        Returns:
            Tuple of (is_compatible, platform_string)
        """
        try:
            with open(binary_path, 'rb') as f:
                header = f.read(4)

            # ELF magic number (Linux shared objects)
            if header[:4] == b'\x7fELF':
                return True, "linux"

            # PE/COFF magic number (Windows DLL)
            if header[:2] == b'MZ':
                return False, "windows"

            # Mach-O magic numbers (macOS)
            if header[:4] in (b'\xfe\xed\xfa\xce', b'\xfe\xed\xfa\xcf',
                              b'\xce\xfa\xed\xfe', b'\xcf\xfa\xed\xfe'):
                return False, "macos"

            return False, "unknown"
        except Exception as e:
            logger.debug(f"Could not determine platform for {binary_path}: {e}")
            return False, "unknown"

    def _guess_category(self, plugin_name: str) -> str:
        """Guess plugin category from its name."""
        name_lower = plugin_name.lower()

        category_keywords = {
            "Distortion": ["dist", "overdrive", "fuzz", "saturat", "drive", "tube", "amp"],
            "Amplifier": ["amp", "amplifier", "preamp"],
            "Filter": ["filter", "wah", "eq", "equaliz"],
            "EQ": ["eq", "equaliz", "tone"],
            "Delay": ["delay", "echo"],
            "Reverb": ["reverb", "room", "hall", "plate", "spring"],
            "Modulation": ["chorus", "flanger", "phaser", "tremolo", "vibrato", "rotary", "leslie", "mod"],
            "Compressor": ["comp", "limit", "gate", "expander", "dynamics"],
            "Dynamics": ["dynamics", "transient"],
            "Simulator": ["sim", "cabinet", "cab", "ir"],
            "Generator": ["synth", "osc", "generator", "tone"],
            "Utility": ["util", "gain", "meter", "analyz", "tuner", "mix"],
        }

        for category, keywords in category_keywords.items():
            for keyword in keywords:
                if keyword in name_lower:
                    return category

        return "Effect"

    def _map_vst3_category(self, vst3_category: str) -> str:
        """Map VST3 subcategory to our category system."""
        category_map = {
            "Fx|Distortion": "Distortion",
            "Fx|Filter": "Filter",
            "Fx|EQ": "EQ",
            "Fx|Delay": "Delay",
            "Fx|Reverb": "Reverb",
            "Fx|Modulation": "Modulation",
            "Fx|Dynamics": "Dynamics",
            "Fx|Compressor": "Compressor",
            "Fx|Limiter": "Compressor",
            "Fx|Gate": "Dynamics",
            "Fx|Pitch Shift": "Modulation",
            "Fx|Chorus": "Modulation",
            "Fx|Flanger": "Modulation",
            "Fx|Phaser": "Modulation",
            "Fx|Restoration": "Utility",
            "Fx|Analyzer": "Utility",
            "Fx|Tools": "Utility",
            "Fx": "Effect",
            "Instrument": "Generator",
            "Instrument|Synth": "Generator",
        }

        return category_map.get(vst3_category, "Effect")

    async def discover_plugins(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """Get list of discovered plugins.

        Args:
            force_refresh: If True, invalidate cache and rescan

        Returns:
            List of plugin metadata dicts
        """
        if force_refresh:
            self.invalidate_cache()
            self.plugins = {}
            self._discover_system_plugins()
            if self._use_cache:
                self._save_to_cache()

        return list(self.plugins.values())

    def get_plugin_by_uri(self, uri: str) -> Optional[Dict[str, Any]]:
        """Get a single plugin by URI (fast O(1) lookup).

        Args:
            uri: Plugin URI

        Returns:
            Plugin metadata dict or None
        """
        return self.plugins.get(uri)

    def search_plugins(
        self,
        query: str = "",
        category: Optional[str] = None,
        author: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Search plugins by criteria.

        Args:
            query: Name search query
            category: Category filter
            author: Author filter

        Returns:
            List of matching plugins
        """
        results = []
        query_lower = query.lower() if query else ""

        for plugin in self.plugins.values():
            # Check query match
            if query_lower:
                name_match = query_lower in plugin.get("name", "").lower()
                author_match = query_lower in plugin.get("author", "").lower()
                if not (name_match or author_match):
                    continue

            # Check category filter
            if category and plugin.get("category") != category:
                continue

            # Check author filter
            if author and plugin.get("author") != author:
                continue

            results.append(plugin)

        return results

    def get_categories(self) -> List[str]:
        """Get all unique categories."""
        categories = set()
        for plugin in self.plugins.values():
            if plugin.get("category"):
                categories.add(plugin["category"])
        return sorted(list(categories))

    async def load_plugin(self, uri: str) -> Optional[Dict[str, Any]]:
        """Load a plugin instance.

        Args:
            uri: Plugin URI

        Returns:
            Plugin instance dict or None
        """
        if uri not in self.plugins:
            logger.warning(f"VST3 Plugin {uri} not found")
            return None

        try:
            plugin_data = self.plugins[uri].copy()
            instance_id = f"{uri}_{len(self.loaded_plugins)}"

            # Create instance with empty parameters for now
            instance = {
                "uri": uri,
                "instance_id": instance_id,
                "name": plugin_data.get("name", "Unknown"),
                "parameters": self._get_default_parameters(uri),
                "is_active": False
            }

            self.loaded_plugins[instance_id] = instance
            logger.info(f"Loaded VST3 plugin {uri} as {instance_id}")
            return instance
        except Exception as e:
            logger.error(f"Error loading VST3 plugin {uri}: {e}")
            return None

    def _get_default_parameters(self, uri: str) -> List[Dict[str, Any]]:
        """Get default parameters for a plugin.

        Args:
            uri: Plugin URI

        Returns:
            List of parameter dicts
        """
        # Default parameters - would be populated from JUCE plugin host
        return [
            {
                "index": 0,
                "name": "Output Gain",
                "min": 0.0,
                "max": 1.0,
                "default": 0.5
            }
        ]

    async def unload_plugin(self, instance_id: str) -> bool:
        """Unload a plugin instance.

        Args:
            instance_id: Plugin instance ID

        Returns:
            True if unloaded, False if not found
        """
        if instance_id in self.loaded_plugins:
            del self.loaded_plugins[instance_id]
            logger.info(f"Unloaded VST3 plugin instance {instance_id}")
            return True
        return False


# Global instance for easy access
_vst3_discovery: Optional[VST3PluginDiscovery] = None


def get_vst3_discovery() -> VST3PluginDiscovery:
    """Get or create the global VST3 discovery instance."""
    global _vst3_discovery
    if _vst3_discovery is None:
        _vst3_discovery = VST3PluginDiscovery()
    return _vst3_discovery
