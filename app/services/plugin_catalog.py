"""
Plugin catalog helpers for cached metadata, search, and lightweight discovery.
"""

import hashlib
import json
import logging
import os
import struct
import threading
import time
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)


class PluginLoadPriority(Enum):
    """Plugin loading priority for staged loading."""

    CRITICAL = 0
    HIGH = 1
    NORMAL = 2
    LOW = 3


@dataclass
class PluginMetadataLite:
    """Lightweight plugin metadata for initial listing."""

    uri: str
    name: str
    category: str
    version: str = ""
    author: str = ""
    license: str = ""
    in_ports: int = 0
    out_ports: int = 0
    supports_midi: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class PluginMetadataFull(PluginMetadataLite):
    """Full plugin metadata (loaded on demand)."""

    class_label: str = ""
    parameters: List[dict] = field(default_factory=list)
    has_ui: bool = False
    supports_cv: bool = False
    presets: List[str] = field(default_factory=list)
    file_path: str = ""
    file_size: int = 0
    file_hash: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class BinaryPluginCache:
    """Binary cache format with atomic writes."""

    MAGIC = b"MAP2PLG"
    VERSION = 3
    BLOCK_SIZE = 4096

    def __init__(self, cache_path: Path):
        self.cache_path = cache_path
        self.temp_path = cache_path.with_suffix(".tmp")

    def write(
        self,
        plugins: List[PluginMetadataLite],
        metadata_full: Dict[str, PluginMetadataFull],
    ) -> bool:
        try:
            with open(self.temp_path, "wb") as handle:
                handle.write(self.MAGIC)
                handle.write(struct.pack("B", self.VERSION))
                handle.write(struct.pack(">I", len(plugins)))

                for plugin in plugins:
                    data = json.dumps(asdict(plugin)).encode("utf-8")
                    handle.write(struct.pack(">I", len(data)))
                    handle.write(data)

                handle.write(struct.pack(">I", len(metadata_full)))
                for uri, full_meta in metadata_full.items():
                    data = json.dumps({"uri": uri, "data": asdict(full_meta)}).encode("utf-8")
                    handle.write(struct.pack(">I", len(data)))
                    handle.write(data)

                pos = handle.tell()
                padding = (self.BLOCK_SIZE - (pos % self.BLOCK_SIZE)) % self.BLOCK_SIZE
                handle.write(b"\x00" * padding)

            self.temp_path.replace(self.cache_path)
            return True
        except Exception as exc:
            logger.error(f"Failed to write plugin cache: {exc}")
            try:
                self.temp_path.unlink()
            except Exception:
                pass
            return False

    def read(self) -> Tuple[Optional[List[PluginMetadataLite]], Optional[Dict[str, PluginMetadataFull]]]:
        try:
            if not self.cache_path.exists():
                return None, None

            with open(self.cache_path, "rb") as handle:
                if handle.read(len(self.MAGIC)) != self.MAGIC:
                    return None, None

                version = struct.unpack("B", handle.read(1))[0]
                if version != self.VERSION:
                    return None, None

                count = struct.unpack(">I", handle.read(4))[0]
                plugins = []
                for _ in range(count):
                    length = struct.unpack(">I", handle.read(4))[0]
                    plugin_dict = json.loads(handle.read(length).decode("utf-8"))
                    plugins.append(PluginMetadataLite(**plugin_dict))

                full_count = struct.unpack(">I", handle.read(4))[0]
                metadata_full: Dict[str, PluginMetadataFull] = {}
                for _ in range(full_count):
                    length = struct.unpack(">I", handle.read(4))[0]
                    entry = json.loads(handle.read(length).decode("utf-8"))
                    metadata_full[entry["uri"]] = PluginMetadataFull(**entry["data"])

                return plugins, metadata_full
        except Exception as exc:
            logger.error(f"Failed to read plugin cache: {exc}")
            return None, None


class LazyPluginMetadataManager:
    """Manages lite/full plugin metadata with bounded full-cache retention."""

    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.cache_file = self.cache_dir / "plugins_metadata_v3.bin"
        self._lite_metadata: Dict[str, PluginMetadataLite] = {}
        self._full_metadata: Dict[str, PluginMetadataFull] = {}
        self._access_counts: Dict[str, int] = defaultdict(int)
        self._lock = threading.RLock()
        self.MAX_FULL_CACHED = 50

    def add_lite(self, plugin: PluginMetadataLite):
        with self._lock:
            self._lite_metadata[plugin.uri] = plugin

    def add_full(self, plugin: PluginMetadataFull):
        with self._lock:
            self._full_metadata[plugin.uri] = plugin
            self._access_counts[plugin.uri] += 1
            if len(self._full_metadata) > self.MAX_FULL_CACHED * 1.5:
                self._cleanup_full_metadata()

    def get_lite(self, uri: str) -> Optional[PluginMetadataLite]:
        with self._lock:
            return self._lite_metadata.get(uri)

    def get_full(self, uri: str) -> Optional[PluginMetadataFull]:
        with self._lock:
            self._access_counts[uri] += 1
            return self._full_metadata.get(uri)

    def get_all_lite(self) -> List[PluginMetadataLite]:
        with self._lock:
            return list(self._lite_metadata.values())

    def _cleanup_full_metadata(self):
        with self._lock:
            sorted_plugins = sorted(
                self._full_metadata.items(),
                key=lambda item: self._access_counts[item[0]],
            )
            to_remove = len(self._full_metadata) - self.MAX_FULL_CACHED
            for uri, _ in sorted_plugins[:to_remove]:
                del self._full_metadata[uri]

    def save_to_cache(self):
        with self._lock:
            BinaryPluginCache(self.cache_file).write(
                list(self._lite_metadata.values()),
                self._full_metadata,
            )

    def load_from_cache(self) -> bool:
        with self._lock:
            plugins, full_meta = BinaryPluginCache(self.cache_file).read()
            if plugins is None:
                return False
            self._lite_metadata = {plugin.uri: plugin for plugin in plugins}
            self._full_metadata = full_meta or {}
            return True


class ThreadedPluginLoader:
    """Background worker queue for non-RT plugin loading."""

    def __init__(self, max_workers: int = 2):
        self.max_workers = max_workers
        self._queue: List[Tuple[str, callable]] = []
        self._lock = threading.Lock()
        self._running = False
        self._worker_threads: List[threading.Thread] = []

    def start(self):
        self._running = True
        for index in range(self.max_workers):
            thread = threading.Thread(
                target=self._worker_loop,
                name=f"PluginLoader-{index}",
                daemon=True,
            )
            thread.start()
            self._worker_threads.append(thread)

    def stop(self):
        self._running = False
        for thread in self._worker_threads:
            thread.join(timeout=2)

    def queue_load(self, plugin_uri: str, load_func: callable):
        with self._lock:
            self._queue.append((plugin_uri, load_func))

    def _worker_loop(self):
        while self._running:
            task = None
            with self._lock:
                if self._queue:
                    task = self._queue.pop(0)

            if task:
                uri, load_func = task
                try:
                    load_func()
                except Exception as exc:
                    logger.error(f"Error loading plugin {uri}: {exc}")
            else:
                time.sleep(0.1)


class PluginSearchIndex:
    """Fast plugin search using category/name indexes."""

    def __init__(self):
        self._category_index: Dict[str, Set[str]] = defaultdict(set)
        self._name_index: Dict[str, Set[str]] = defaultdict(set)
        self._lock = threading.RLock()

    def add_plugin(self, plugin: PluginMetadataLite):
        with self._lock:
            self._category_index[plugin.category].add(plugin.uri)
            for word in plugin.name.lower().split():
                self._name_index[word].add(plugin.uri)

    def search_by_category(self, category: str) -> Set[str]:
        with self._lock:
            return set(self._category_index.get(category, set()))

    def search_by_name(self, query: str) -> Set[str]:
        with self._lock:
            query_lower = query.lower()
            results = set()
            for word, uris in self._name_index.items():
                if query_lower in word:
                    results.update(uris)
            return results

    def get_categories(self) -> List[str]:
        with self._lock:
            return list(self._category_index.keys())


class AdvancedPluginManager:
    """Lightweight cached plugin catalog used by older tests and tools."""

    def __init__(self, lv2_paths: List[str]):
        self.lv2_paths = lv2_paths
        self.metadata_mgr = LazyPluginMetadataManager(Path.home() / ".cache/map2")
        self.loader = ThreadedPluginLoader(max_workers=2)
        self.search_index = PluginSearchIndex()
        self._initialized = False

    def start(self):
        if self._initialized:
            return
        if self.metadata_mgr.load_from_cache():
            self._rebuild_search_index()
        else:
            self._discover_plugins()
        self.loader.start()
        self._initialized = True

    def stop(self):
        self.loader.stop()
        self.metadata_mgr.save_to_cache()
        self._initialized = False

    def _discover_plugins(self):
        for lv2_path in self.lv2_paths:
            if not os.path.isdir(lv2_path):
                continue
            try:
                for entry in os.listdir(lv2_path):
                    if not entry.endswith(".lv2"):
                        continue
                    plugin_dir = os.path.join(lv2_path, entry)
                    if not os.path.isdir(plugin_dir):
                        continue
                    manifest = os.path.join(plugin_dir, "manifest.ttl")
                    if not os.path.exists(manifest):
                        continue
                    plugin = PluginMetadataLite(
                        uri=f"urn:map2:lv2:{entry}",
                        name=entry.replace(".lv2", "").replace("-", " ").title(),
                        category=self._classify_plugin(entry),
                        in_ports=2,
                        out_ports=2,
                    )
                    self.metadata_mgr.add_lite(plugin)
                    self.search_index.add_plugin(plugin)
            except Exception as exc:
                logger.error(f"Error scanning {lv2_path}: {exc}")
        self.metadata_mgr.save_to_cache()

    def _rebuild_search_index(self):
        for plugin in self.metadata_mgr.get_all_lite():
            self.search_index.add_plugin(plugin)

    def _classify_plugin(self, name: str) -> str:
        name_lower = name.lower()
        if "reverb" in name_lower or "hall" in name_lower or "room" in name_lower:
            return "Reverb"
        if "delay" in name_lower or "echo" in name_lower:
            return "Delay"
        if "eq" in name_lower or "graphic" in name_lower:
            return "EQ"
        if "compressor" in name_lower or "comp" in name_lower:
            return "Compressor"
        if "distortion" in name_lower or "overdrive" in name_lower:
            return "Distortion"
        if "chorus" in name_lower or "flanger" in name_lower or "phaser" in name_lower:
            return "Modulator"
        if "gate" in name_lower:
            return "Gate"
        if "filter" in name_lower:
            return "Filter"
        return "Other"

    def get_all_plugins(self, lite: bool = True) -> List[dict]:
        if lite:
            return [plugin.to_dict() for plugin in self.metadata_mgr.get_all_lite()]
        result = []
        for lite_plugin in self.metadata_mgr.get_all_lite():
            full = self.metadata_mgr.get_full(lite_plugin.uri)
            result.append(full.to_dict() if full else lite_plugin.to_dict())
        return result

    def search(self, query: str, category: Optional[str] = None) -> List[dict]:
        if category:
            uris = self.search_index.search_by_category(category)
        else:
            uris = {plugin.uri for plugin in self.metadata_mgr.get_all_lite()}
        if query:
            uris &= self.search_index.search_by_name(query)
        result = []
        for uri in uris:
            plugin = self.metadata_mgr.get_lite(uri)
            if plugin:
                result.append(plugin.to_dict())
        return result

    def get_plugin_detail(self, uri: str) -> Optional[dict]:
        full = self.metadata_mgr.get_full(uri)
        if full:
            return full.to_dict()
        lite = self.metadata_mgr.get_lite(uri)
        return lite.to_dict() if lite else None


_plugin_manager: Optional[AdvancedPluginManager] = None
_plugin_manager_lock = threading.Lock()


def get_advanced_plugin_manager() -> AdvancedPluginManager:
    """Get or create the global plugin manager."""

    global _plugin_manager
    if _plugin_manager is None:
        with _plugin_manager_lock:
            if _plugin_manager is None:
                _plugin_manager = AdvancedPluginManager(
                    [
                        os.path.expanduser("~/.lv2"),
                        "/usr/lib/lv2",
                        "/usr/local/lib/lv2",
                        "/usr/lib64/lv2",
                        "/usr/lib/x86_64-linux-gnu/lv2",
                    ]
                )
    return _plugin_manager
