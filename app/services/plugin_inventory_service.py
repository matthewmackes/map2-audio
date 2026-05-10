"""T2503 Set 9 — plugin inventory service.

Mirrors the C++ Daw/PluginScanner inventory on the Python side. Owns the
cache + the WebSocket-publishable change events. Locked decision A9: one
inventory shared by the live engine and the DAW service.

Set 9 ships the in-memory model + the FastAPI shape; the bench-gate
slice wires the actual scan to the engine_command bridge so the C++ scanner
publishes its inventory back to Python on populate().
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class PluginFormat(str, Enum):
    LV2 = "lv2"
    NATIVE = "native"


@dataclass
class PluginDescriptor:
    uri: str
    name: str
    vendor: str = ""
    category: str = ""
    format: PluginFormat = PluginFormat.NATIVE
    audio_inputs: int = 1
    audio_outputs: int = 1
    is_instrument: bool = False

    def to_dict(self) -> Dict:
        return {**asdict(self), "format": self.format.value}


_InventoryListener = Callable[[List[PluginDescriptor]], None]


class PluginInventoryService:
    """In-memory inventory + change-event publisher.

    Threadsafe at the inventory level. ``set_inventory`` replaces the full
    inventory atomically and fires every registered listener (synchronous
    fan-out; listener exceptions are isolated).
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._inventory: List[PluginDescriptor] = []
        self._listeners: List[_InventoryListener] = []
        self._last_scan_at: Optional[float] = None

    def inventory(self) -> List[PluginDescriptor]:
        with self._lock:
            return list(self._inventory)

    def size(self) -> int:
        with self._lock:
            return len(self._inventory)

    def find(self, uri: str) -> Optional[PluginDescriptor]:
        with self._lock:
            for p in self._inventory:
                if p.uri == uri:
                    return p
        return None

    def last_scan_at(self) -> Optional[float]:
        with self._lock:
            return self._last_scan_at

    def set_inventory(self, plugins: List[PluginDescriptor]) -> None:
        with self._lock:
            self._inventory = list(plugins)
            self._last_scan_at = time.time()
            snapshot = list(self._inventory)
            listeners = list(self._listeners)
        for listener in listeners:
            try:
                listener(snapshot)
            except Exception as exc:  # noqa: BLE001
                logger.warning("plugin inventory listener raised: %s", exc)

    def add_listener(self, listener: _InventoryListener) -> None:
        with self._lock:
            self._listeners.append(listener)

    def remove_listener(self, listener: _InventoryListener) -> None:
        with self._lock:
            if listener in self._listeners:
                self._listeners.remove(listener)

    def populate_default(self) -> None:
        """Set Set-9 default contents (matches the C++ scanner's stub).

        The bench-gate slice replaces this with an engine_command-driven
        callback that mirrors the C++ scanner's actual populate() output.
        """
        defaults = [
            PluginDescriptor(
                uri="map2:fx:nam",
                name="Neural Amp Modeler",
                vendor="MAP2",
                category="amp",
                format=PluginFormat.NATIVE,
                audio_inputs=1,
                audio_outputs=1,
            ),
            PluginDescriptor(
                uri="map2:fx:cabinet-ir",
                name="Cabinet IR",
                vendor="MAP2",
                category="ir",
                format=PluginFormat.NATIVE,
                audio_inputs=1,
                audio_outputs=1,
            ),
            PluginDescriptor(
                uri="map2:fx:reverb-ir",
                name="Reverb IR",
                vendor="MAP2",
                category="reverb",
                format=PluginFormat.NATIVE,
                audio_inputs=1,
                audio_outputs=2,
            ),
            PluginDescriptor(
                uri="lv2://map2.audio/test/eg-amp",
                name="LV2 Example Amp",
                vendor="LV2 (placeholder until bench wires juce::LV2PluginFormat)",
                category="amp",
                format=PluginFormat.LV2,
                audio_inputs=1,
                audio_outputs=1,
            ),
        ]
        self.set_inventory(defaults)


_INSTANCE: Optional[PluginInventoryService] = None


def get_plugin_inventory_service() -> PluginInventoryService:
    global _INSTANCE
    if _INSTANCE is None:
        _INSTANCE = PluginInventoryService()
        _INSTANCE.populate_default()
    return _INSTANCE


def reset_plugin_inventory_service() -> None:
    global _INSTANCE
    _INSTANCE = None
