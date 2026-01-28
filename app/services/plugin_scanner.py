"""
Plugin Scanner Service - Full LV2 Plugin Discovery with Caching

Provides comprehensive plugin discovery, caching, and search functionality.
Integrates with lv2_enhanced.py for full LV2 spec compliance.
"""

import logging
import os
import json
import hashlib
from typing import Dict, List, Any, Optional
from pathlib import Path
from dataclasses import dataclass, asdict
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class PluginMetadata:
    """Cached plugin metadata."""
    uri: str
    name: str
    category: str
    author: Optional[str]
    path: str
    audio_inputs: int
    audio_outputs: int
    control_ports: int
    is_rt_safe: bool
    has_latency: bool
    latency_samples: int
    features: List[str]
    last_scanned: str


class PluginScanner:
    """
    Full LV2 plugin scanner with caching and search capabilities.

    Features:
    - Scans standard LV2 directories
    - Caches results to JSON file
    - Supports search by name, category, features
    - Integrates with native MAP2 plugins
    - Provides category listings
    """

    # Standard LV2 plugin directories
    DEFAULT_LV2_PATHS = [
        os.path.expanduser("~/.lv2"),
        "/usr/lib/lv2",
        "/usr/local/lib/lv2",
        "/usr/lib64/lv2",
        "/usr/lib/x86_64-linux-gnu/lv2",
    ]

    # Native MAP2 plugins
    NATIVE_PLUGINS = {
        "http://map2-audio.local/nam-loader": {
            "name": "MAP2 NAM Loader",
            "category": "Simulator",
            "author": "MAP2 Audio",
            "audio_inputs": 1,
            "audio_outputs": 1,
            "is_rt_safe": True,
            "features": ["neural-amp-modeler", "amp-simulation"]
        },
        "http://map2-audio.local/ir-cabinet-loader": {
            "name": "MAP2 Cabinet IR Loader",
            "category": "Simulator",
            "author": "MAP2 Audio",
            "audio_inputs": 2,
            "audio_outputs": 2,
            "is_rt_safe": True,
            "features": ["impulse-response", "cabinet-simulation"]
        },
        "http://map2-audio.local/ir-reverb-loader": {
            "name": "MAP2 Reverb IR Loader",
            "category": "Reverb",
            "author": "MAP2 Audio",
            "audio_inputs": 2,
            "audio_outputs": 2,
            "is_rt_safe": True,
            "features": ["impulse-response", "convolution-reverb"]
        },
        "http://map2-audio.local/reevr-engine": {
            "name": "MAP2 ReevR Convolution",
            "category": "Reverb",
            "author": "MAP2 Audio",
            "audio_inputs": 2,
            "audio_outputs": 2,
            "is_rt_safe": True,
            "features": ["convolution", "reverb", "zero-latency"]
        },
        "http://map2-audio.local/cocoa-delay": {
            "name": "MAP2 Cocoa Delay",
            "category": "Delay",
            "author": "MAP2 Audio",
            "audio_inputs": 2,
            "audio_outputs": 2,
            "is_rt_safe": True,
            "features": ["delay", "modulation", "ducking"]
        },
        "http://map2-audio.local/zita-at1": {
            "name": "MAP2 Zita AT1 Auto-Tune",
            "category": "Pitch",
            "author": "MAP2 Audio",
            "audio_inputs": 1,
            "audio_outputs": 1,
            "is_rt_safe": True,
            "features": ["pitch-correction", "auto-tune", "midi-control"]
        },
        "http://map2-audio.local/triplespread": {
            "name": "MAP2 TripleSpread",
            "category": "Modulator",
            "author": "MAP2 Audio",
            "audio_inputs": 2,
            "audio_outputs": 2,
            "is_rt_safe": True,
            "features": ["stereo-width", "spatial"]
        },
        "http://map2-audio.local/valentine": {
            "name": "MAP2 Valentine",
            "category": "Dynamics",
            "author": "MAP2 Audio",
            "audio_inputs": 2,
            "audio_outputs": 2,
            "is_rt_safe": True,
            "features": ["compressor", "saturator", "dynamics"]
        },
        "http://map2-audio.local/zlequalizer": {
            "name": "MAP2 ZL Equalizer",
            "category": "Equaliser",
            "author": "MAP2 Audio",
            "audio_inputs": 2,
            "audio_outputs": 2,
            "is_rt_safe": True,
            "features": ["dynamic-eq", "parametric-eq", "multiband", "sidechain"]
        },
        "http://map2-audio.local/freeverb3": {
            "name": "MAP2 Freeverb3",
            "category": "Reverb",
            "author": "MAP2 Audio",
            "audio_inputs": 2,
            "audio_outputs": 2,
            "is_rt_safe": True,
            "features": ["algorithmic-reverb", "modulation", "simd-optimized", "multi-algorithm"]
        },
    }

    def __init__(self, cache_dir: Optional[str] = None, lv2_paths: Optional[List[str]] = None):
        """
        Initialize plugin scanner.

        Args:
            cache_dir: Directory for cache file (default: ~/.config/map2)
            lv2_paths: Custom LV2 search paths
        """
        self._cache_dir = Path(cache_dir or os.path.expanduser("~/.config/map2"))
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._cache_file = self._cache_dir / "plugin_cache.json"

        self._lv2_paths = lv2_paths or self.DEFAULT_LV2_PATHS
        self._plugin_cache: Dict[str, PluginMetadata] = {}
        self._categories: List[str] = []
        self._last_scan_hash: str = ""

        # Load cache from disk
        self._load_cache()

        logger.info(f"Plugin scanner initialized (cache: {self._cache_file})")

    @property
    def plugin_cache(self) -> Dict[str, Dict[str, Any]]:
        """Get plugin cache as dict."""
        return {uri: asdict(meta) for uri, meta in self._plugin_cache.items()}

    @property
    def cache_file(self) -> str:
        """Get cache file path."""
        return str(self._cache_file)

    @property
    def lv2_paths(self) -> List[str]:
        """Get LV2 search paths."""
        return self._lv2_paths

    def scan_all(self, force_rescan: bool = False) -> Dict[str, Dict[str, Any]]:
        """
        Scan all LV2 plugins and native plugins.

        Args:
            force_rescan: Force rescan even if cache is valid

        Returns:
            Dict of plugin URI -> metadata
        """
        # Check if rescan needed
        current_hash = self._compute_paths_hash()

        if not force_rescan and current_hash == self._last_scan_hash and self._plugin_cache:
            logger.debug("Using cached plugin scan results")
            return self.plugin_cache

        logger.info("Starting full plugin scan...")
        self._plugin_cache.clear()
        scan_time = datetime.now().isoformat()

        # Scan native plugins first
        for uri, info in self.NATIVE_PLUGINS.items():
            self._plugin_cache[uri] = PluginMetadata(
                uri=uri,
                name=info["name"],
                category=info["category"],
                author=info.get("author"),
                path="native",
                audio_inputs=info.get("audio_inputs", 2),
                audio_outputs=info.get("audio_outputs", 2),
                control_ports=0,
                is_rt_safe=info.get("is_rt_safe", True),
                has_latency=False,
                latency_samples=0,
                features=info.get("features", []),
                last_scanned=scan_time
            )

        # Try to use enhanced LV2 service
        try:
            from app.services.lv2_enhanced import get_lv2_service
            lv2_service = get_lv2_service()

            for plugin_info in lv2_service.discover_all_plugins():
                # Map category
                category = "Utility"
                if plugin_info.categories:
                    cat_name = plugin_info.categories[0].name
                    category = cat_name.replace("_", " ").title()

                # Count ports
                control_ports = len([p for p in plugin_info.ports
                                    if p.port_type.name == "CONTROL"])
                audio_inputs = len([p for p in plugin_info.ports
                                   if p.port_type.name == "AUDIO" and p.direction.name == "INPUT"])
                audio_outputs = len([p for p in plugin_info.ports
                                    if p.port_type.name == "AUDIO" and p.direction.name == "OUTPUT"])

                self._plugin_cache[plugin_info.uri] = PluginMetadata(
                    uri=plugin_info.uri,
                    name=plugin_info.name,
                    category=category,
                    author=plugin_info.author,
                    path=plugin_info.bundle_path,
                    audio_inputs=audio_inputs,
                    audio_outputs=audio_outputs,
                    control_ports=control_ports,
                    is_rt_safe=plugin_info.has_hard_rt_capable,
                    has_latency=plugin_info.has_latency,
                    latency_samples=plugin_info.reported_latency_samples,
                    features=self._extract_features(plugin_info),
                    last_scanned=scan_time
                )
        except ImportError:
            logger.warning("lv2_enhanced not available, using fallback scanner")
            self._scan_lv2_fallback(scan_time)
        except Exception as e:
            logger.error(f"Error using lv2_enhanced: {e}")
            self._scan_lv2_fallback(scan_time)

        # Update categories
        self._update_categories()

        # Save cache
        self._last_scan_hash = current_hash
        self._save_cache()

        logger.info(f"Plugin scan complete: {len(self._plugin_cache)} plugins found")
        return self.plugin_cache

    def _scan_lv2_fallback(self, scan_time: str) -> None:
        """Fallback LV2 scanning without lv2_enhanced."""
        for lv2_path in self._lv2_paths:
            if not os.path.isdir(lv2_path):
                continue

            try:
                for plugin_dir in os.listdir(lv2_path):
                    plugin_path = os.path.join(lv2_path, plugin_dir)
                    if not os.path.isdir(plugin_path):
                        continue

                    manifest = os.path.join(plugin_path, "manifest.ttl")
                    if os.path.isfile(manifest):
                        plugin_meta = self._parse_manifest(plugin_path, manifest, scan_time)
                        if plugin_meta:
                            self._plugin_cache[plugin_meta.uri] = plugin_meta
            except PermissionError:
                logger.debug(f"Permission denied: {lv2_path}")
            except Exception as e:
                logger.warning(f"Error scanning {lv2_path}: {e}")

    def _parse_manifest(self, plugin_path: str, manifest_path: str, scan_time: str) -> Optional[PluginMetadata]:
        """Parse manifest.ttl file for basic plugin info."""
        try:
            with open(manifest_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()

            uri = None
            name = None

            for line in content.split('\n'):
                line = line.strip()

                if 'a lv2:Plugin' in line or 'rdf:type lv2:Plugin' in line:
                    if '<' in line and '>' in line:
                        uri = line[line.find('<')+1:line.find('>')]

                if ('doap:name' in line or 'lv2:name' in line or 'rdfs:label' in line) and '"' in line:
                    name = line[line.find('"')+1:line.rfind('"')]

            if uri and name:
                # Guess category from path or name
                category = self._guess_category(plugin_path, name)

                return PluginMetadata(
                    uri=uri,
                    name=name,
                    category=category,
                    author=None,
                    path=plugin_path,
                    audio_inputs=2,
                    audio_outputs=2,
                    control_ports=0,
                    is_rt_safe=False,
                    has_latency=False,
                    latency_samples=0,
                    features=[],
                    last_scanned=scan_time
                )
        except Exception as e:
            logger.debug(f"Error parsing {manifest_path}: {e}")

        return None

    def _guess_category(self, path: str, name: str) -> str:
        """Guess plugin category from path or name."""
        path_lower = path.lower()
        name_lower = name.lower()
        combined = f"{path_lower} {name_lower}"

        if any(x in combined for x in ['reverb', 'hall', 'room', 'plate']):
            return "Reverb"
        elif any(x in combined for x in ['delay', 'echo']):
            return "Delay"
        elif any(x in combined for x in ['eq', 'equaliz', 'filter', 'tone']):
            return "EQ"
        elif any(x in combined for x in ['comp', 'limit', 'gate', 'dynamic']):
            return "Dynamics"
        elif any(x in combined for x in ['dist', 'overdrive', 'fuzz', 'amp', 'cabinet', 'cab']):
            return "Distortion"
        elif any(x in combined for x in ['chorus', 'flang', 'phas', 'trem', 'vibrat']):
            return "Modulation"
        elif any(x in combined for x in ['synth', 'instrument', 'sampler']):
            return "Instrument"
        elif any(x in combined for x in ['meter', 'analyz', 'spectrum', 'tuner']):
            return "Analyzer"
        else:
            return "Utility"

    def _extract_features(self, plugin_info) -> List[str]:
        """Extract feature tags from plugin info."""
        features = []

        if plugin_info.has_hard_rt_capable:
            features.append("rt-safe")
        if plugin_info.has_latency:
            features.append("reports-latency")
        if plugin_info.has_state:
            features.append("stateful")
        if plugin_info.has_worker:
            features.append("worker-thread")

        # Add category-based features
        for cat in plugin_info.categories:
            features.append(cat.name.lower().replace("_", "-"))

        return features

    def _compute_paths_hash(self) -> str:
        """Compute hash of LV2 paths for cache invalidation."""
        path_info = []
        for path in self._lv2_paths:
            if os.path.isdir(path):
                try:
                    mtime = os.path.getmtime(path)
                    count = len(os.listdir(path))
                    path_info.append(f"{path}:{mtime}:{count}")
                except Exception:
                    pass

        return hashlib.md5("|".join(path_info).encode()).hexdigest()

    def _update_categories(self) -> None:
        """Update category list from cached plugins."""
        categories = set()
        for meta in self._plugin_cache.values():
            if meta.category:
                categories.add(meta.category)
        self._categories = sorted(categories)

    def _load_cache(self) -> None:
        """Load plugin cache from disk."""
        if not self._cache_file.exists():
            return

        try:
            with open(self._cache_file, 'r') as f:
                data = json.load(f)

            self._last_scan_hash = data.get("hash", "")

            for uri, meta_dict in data.get("plugins", {}).items():
                self._plugin_cache[uri] = PluginMetadata(**meta_dict)

            self._update_categories()
            logger.info(f"Loaded {len(self._plugin_cache)} plugins from cache")
        except Exception as e:
            logger.warning(f"Error loading plugin cache: {e}")

    def _save_cache(self) -> None:
        """Save plugin cache to disk."""
        try:
            data = {
                "hash": self._last_scan_hash,
                "plugins": {uri: asdict(meta) for uri, meta in self._plugin_cache.items()}
            }

            with open(self._cache_file, 'w') as f:
                json.dump(data, f, indent=2)

            logger.debug(f"Saved {len(self._plugin_cache)} plugins to cache")
        except Exception as e:
            logger.warning(f"Error saving plugin cache: {e}")

    def get_plugin(self, uri: str) -> Optional[Dict[str, Any]]:
        """
        Get plugin metadata by URI.

        Args:
            uri: Plugin URI

        Returns:
            Plugin metadata dict or None
        """
        if not self._plugin_cache:
            self.scan_all()

        if uri in self._plugin_cache:
            return asdict(self._plugin_cache[uri])

        return None

    def search_plugins(
        self,
        name: Optional[str] = None,
        category: Optional[str] = None,
        feature: Optional[str] = None,
        rt_safe_only: bool = False,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Search plugins by various criteria.

        Args:
            name: Search by name (partial match)
            category: Filter by category
            feature: Filter by feature tag
            rt_safe_only: Only return RT-safe plugins
            limit: Maximum results

        Returns:
            List of matching plugin metadata
        """
        if not self._plugin_cache:
            self.scan_all()

        results = []

        for uri, meta in self._plugin_cache.items():
            # Filter by name
            if name and name.lower() not in meta.name.lower():
                continue

            # Filter by category
            if category and category.lower() != meta.category.lower():
                continue

            # Filter by feature
            if feature and feature.lower() not in [f.lower() for f in meta.features]:
                continue

            # Filter by RT safety
            if rt_safe_only and not meta.is_rt_safe:
                continue

            results.append(asdict(meta))

            if len(results) >= limit:
                break

        return results

    def get_categories(self) -> List[str]:
        """
        Get list of all plugin categories.

        Returns:
            Sorted list of category names
        """
        if not self._categories:
            self.scan_all()

        return self._categories.copy()

    def get_plugins_by_category(self, category: str) -> List[Dict[str, Any]]:
        """
        Get all plugins in a category.

        Args:
            category: Category name

        Returns:
            List of plugin metadata in category
        """
        return self.search_plugins(category=category)

    def get_native_plugins(self) -> List[Dict[str, Any]]:
        """
        Get all native MAP2 plugins.

        Returns:
            List of native plugin metadata
        """
        return [
            asdict(self._plugin_cache[uri])
            for uri in self.NATIVE_PLUGINS.keys()
            if uri in self._plugin_cache
        ]

    def clear_cache(self) -> None:
        """Clear the plugin cache."""
        self._plugin_cache.clear()
        self._categories.clear()
        self._last_scan_hash = ""

        if self._cache_file.exists():
            try:
                self._cache_file.unlink()
            except Exception as e:
                logger.warning(f"Error deleting cache file: {e}")

        logger.info("Plugin cache cleared")

    def get_stats(self) -> Dict[str, Any]:
        """Get scanner statistics."""
        return {
            "total_plugins": len(self._plugin_cache),
            "native_plugins": len(self.NATIVE_PLUGINS),
            "lv2_plugins": len(self._plugin_cache) - len(self.NATIVE_PLUGINS),
            "categories": len(self._categories),
            "cache_file": str(self._cache_file),
            "cache_valid": self._last_scan_hash != "",
            "lv2_paths": self._lv2_paths
        }


# Global singleton instance
_plugin_scanner: Optional[PluginScanner] = None


def get_plugin_scanner() -> PluginScanner:
    """Get or create global plugin scanner instance."""
    global _plugin_scanner
    if _plugin_scanner is None:
        _plugin_scanner = PluginScanner()
    return _plugin_scanner


# Backwards compatibility wrapper matching the old stub API
class PluginScannerCompat:
    """Compatibility wrapper matching the old stub API."""

    def scan_all(self, force_rescan=False):
        return get_plugin_scanner().scan_all(force_rescan)

    def get_plugin(self, uri):
        return get_plugin_scanner().get_plugin(uri)

    def search_plugins(self, **kwargs):
        return get_plugin_scanner().search_plugins(**kwargs)

    def get_categories(self):
        return get_plugin_scanner().get_categories()

    def clear_cache(self):
        return get_plugin_scanner().clear_cache()

    @property
    def plugin_cache(self):
        return get_plugin_scanner().plugin_cache

    @property
    def cache_file(self):
        return get_plugin_scanner().cache_file

    @property
    def lv2_paths(self):
        return get_plugin_scanner().lv2_paths


# Replace stub with real implementation - maintains backwards compatibility
plugin_scanner = PluginScannerCompat()
