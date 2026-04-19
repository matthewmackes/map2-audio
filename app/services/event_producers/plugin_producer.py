"""
Plugin Event Producer

Monitors JUCE plugin loading, configuration, and performance and emits
canonical PlatformEvents targeted at the LCD surface.
"""

from __future__ import annotations

import logging
from typing import Dict, List

from app.services.platform_event.bus import PlatformEventBus
from app.services.platform_event.factories import make_lcd_surface_event
from app.services.platform_event.severity import Severity
from app.utils.time import utc_now

logger = logging.getLogger(__name__)


class PluginEventProducer:
    """Produces plugin-related LCD PlatformEvents."""

    def __init__(self, event_bus: PlatformEventBus, *, node_label: str):
        self.event_bus = event_bus
        self.node_label = node_label
        self.loaded_plugins: Dict[str, Dict] = {}
        self.cpu_thresholds = {}

    async def start(self):
        logger.info("Starting Plugin Event Producer")

    async def stop(self):
        logger.info("Stopping Plugin Event Producer")

    async def _emit(
        self,
        *,
        severity: Severity,
        title: str,
        message: str,
        color: str | None = None,
        sound: bool | None = None,
        dismiss_auto: bool | None = None,
        context: dict | None = None,
    ) -> None:
        await self.event_bus.emit(
            make_lcd_surface_event(
                event_type="audio",
                severity=severity,
                source_node=self.node_label,
                source_service="plugin_event_producer",
                title=title,
                message=message,
                color=color,
                sound=sound,
                dismiss_auto=dismiss_auto,
                context=context,
            )
        )

    async def on_plugin_loaded(
        self,
        plugin_name: str,
        plugin_type: str,
        plugin_id: str,
        latency_change_ms: float = 0.0,
    ):
        self.loaded_plugins[plugin_id] = {
            "name": plugin_name,
            "type": plugin_type,
            "loaded_at": utc_now().isoformat(),
            "instances": 1,
        }

        severity = Severity.WARNING if latency_change_ms > 2.0 else Severity.INFO
        await self._emit(
            severity=severity,
            title=f"Plugin Loaded: {plugin_name}",
            message=f"{plugin_type} ({plugin_id})" + (f" +{latency_change_ms:.1f}ms latency" if latency_change_ms > 0 else ""),
            color="green" if severity == Severity.INFO else "yellow",
            context={
                "plugin_name": plugin_name,
                "plugin_type": plugin_type,
                "plugin_id": plugin_id,
                "latency_change": latency_change_ms,
            },
        )
        logger.info("Plugin loaded: %s (%s)", plugin_name, plugin_id)

    async def on_plugin_unloaded(self, plugin_id: str):
        if plugin_id not in self.loaded_plugins:
            return
        plugin_info = self.loaded_plugins.pop(plugin_id)
        await self._emit(
            severity=Severity.INFO,
            title="Plugin Unloaded",
            message=f"{plugin_info['name']} removed",
            color="yellow",
            context={"plugin_name": plugin_info["name"], "plugin_id": plugin_id},
        )
        logger.info("Plugin unloaded: %s", plugin_id)

    async def on_plugin_cpu_spike(self, plugin_id: str, plugin_name: str, cpu_percent: float):
        threshold = self.cpu_thresholds.get(plugin_id, 50.0)
        if cpu_percent <= threshold:
            return
        severity = Severity.CRITICAL if cpu_percent > 90 else Severity.WARNING
        await self._emit(
            severity=severity,
            title=f"High Plugin CPU: {plugin_name}",
            message=f"{cpu_percent:.1f}% (threshold: {threshold:.0f}%)",
            color="red" if severity == Severity.CRITICAL else "yellow",
            context={
                "plugin_name": plugin_name,
                "plugin_id": plugin_id,
                "cpu_percent": cpu_percent,
                "threshold": threshold,
            },
        )
        logger.warning("Plugin CPU spike: %s at %.1f%%", plugin_name, cpu_percent)

    async def on_plugin_parameter_changed(
        self,
        plugin_id: str,
        plugin_name: str,
        parameter_name: str,
        value: float,
        automation: bool = False,
    ):
        if not automation and parameter_name not in ["Bypass", "Dry/Wet", "Mix"]:
            return
        await self._emit(
            severity=Severity.INFO,
            title=f"{plugin_name}: {parameter_name}",
            message=f"Value: {value:.2f}" + (" (automation)" if automation else ""),
            color="cyan",
            context={
                "plugin_name": plugin_name,
                "plugin_id": plugin_id,
                "parameter": parameter_name,
                "value": value,
                "automation": automation,
            },
        )

    async def on_plugin_crash(self, plugin_id: str, plugin_name: str, error: str):
        self.loaded_plugins.pop(plugin_id, None)
        await self._emit(
            severity=Severity.CRITICAL,
            title=f"Plugin Crash: {plugin_name}",
            message=error[:100],
            color="red",
            sound=True,
            dismiss_auto=False,
            context={"plugin_name": plugin_name, "plugin_id": plugin_id, "error": error},
        )
        logger.error("Plugin crash: %s - %s", plugin_name, error)

    async def on_preset_loaded(self, plugin_id: str, plugin_name: str, preset_name: str, parameter_count: int):
        await self._emit(
            severity=Severity.INFO,
            title=f"{plugin_name}: Preset",
            message=f"{preset_name} ({parameter_count} params)",
            color="green",
            context={
                "plugin_name": plugin_name,
                "plugin_id": plugin_id,
                "preset_name": preset_name,
                "parameter_count": parameter_count,
            },
        )
        logger.info("Preset loaded: %s in %s", preset_name, plugin_name)

    async def on_plugin_latency_changed(
        self,
        plugin_id: str,
        plugin_name: str,
        new_latency_samples: int,
        old_latency_samples: int,
    ):
        change = new_latency_samples - old_latency_samples
        if change == 0:
            return
        severity = Severity.WARNING if abs(change) > 512 else Severity.INFO
        await self._emit(
            severity=severity,
            title=f"{plugin_name}: Latency",
            message=f"{new_latency_samples}s ({change:+d}s change)",
            color="yellow" if severity == Severity.WARNING else "cyan",
            context={
                "plugin_name": plugin_name,
                "plugin_id": plugin_id,
                "new_latency_samples": new_latency_samples,
                "old_latency_samples": old_latency_samples,
                "change": change,
            },
        )

    def get_loaded_plugins(self) -> List[str]:
        return list(self.loaded_plugins.keys())

    def set_cpu_threshold(self, plugin_id: str, threshold: float):
        self.cpu_thresholds[plugin_id] = threshold
