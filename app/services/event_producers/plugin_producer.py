"""
Plugin Event Producer

Monitors JUCE plugin loading, configuration, and performance.
Generates events for:
- Plugin loading/unloading
- Parameter changes
- Latency impact
- CPU usage per plugin
- Crash detection
"""

import logging
from typing import Dict, List, Optional

from app.services.lcd_event_bus import LCDEventBus, create_audio_event
from app.lcd_models.lcd_event import EventType, EventSeverity
from app.utils.time import utc_now

logger = logging.getLogger(__name__)


class PluginEventProducer:
    """
    Produces events related to plugin operations.
    
    Monitors:
    - Plugin lifecycle (load, unload)
    - Plugin parameter changes
    - Plugin CPU usage
    - Plugin latency impact
    - Plugin state saves/loads
    """
    
    def __init__(self, event_bus: LCDEventBus):
        self.event_bus = event_bus
        self.loaded_plugins: Dict[str, Dict] = {}
        self.cpu_thresholds = {}  # Per-plugin CPU thresholds

    async def start(self):
        """Start plugin event producer (no background loop)"""
        logger.info("Starting Plugin Event Producer")

    async def stop(self):
        """Stop plugin event producer"""
        logger.info("Stopping Plugin Event Producer")
    
    async def on_plugin_loaded(
        self,
        plugin_name: str,
        plugin_type: str,
        plugin_id: str,
        latency_change_ms: float = 0.0
    ):
        """Called when plugin is loaded"""
        self.loaded_plugins[plugin_id] = {
            'name': plugin_name,
            'type': plugin_type,
            'loaded_at': utc_now().isoformat(),
            'instances': 1
        }
        
        severity = EventSeverity.WARNING if latency_change_ms > 2.0 else EventSeverity.INFO
        
        await create_audio_event(
            self.event_bus,
            title=f"Plugin Loaded: {plugin_name}",
            message=f"{plugin_type} ({plugin_id})" + 
                    (f" +{latency_change_ms:.1f}ms latency" if latency_change_ms > 0 else ""),
            severity=severity,
            color="green" if severity == EventSeverity.INFO else "yellow",
            context={
                'plugin_name': plugin_name,
                'plugin_type': plugin_type,
                'plugin_id': plugin_id,
                'latency_change': latency_change_ms
            }
        )
        
        logger.info(f"Plugin loaded: {plugin_name} ({plugin_id})")
    
    async def on_plugin_unloaded(self, plugin_id: str):
        """Called when plugin is unloaded"""
        if plugin_id in self.loaded_plugins:
            plugin_info = self.loaded_plugins.pop(plugin_id)
            
            await create_audio_event(
                self.event_bus,
                title=f"Plugin Unloaded",
                message=f"{plugin_info['name']} removed",
                severity=EventSeverity.INFO,
                color="yellow",
                context={'plugin_name': plugin_info['name'], 'plugin_id': plugin_id}
            )
            
            logger.info(f"Plugin unloaded: {plugin_id}")
    
    async def on_plugin_cpu_spike(
        self,
        plugin_id: str,
        plugin_name: str,
        cpu_percent: float
    ):
        """Called when plugin CPU usage spikes"""
        threshold = self.cpu_thresholds.get(plugin_id, 50.0)
        
        if cpu_percent > threshold:
            severity = EventSeverity.CRITICAL if cpu_percent > 90 else EventSeverity.WARNING
            
            await create_audio_event(
                self.event_bus,
                title=f"High Plugin CPU: {plugin_name}",
                message=f"{cpu_percent:.1f}% (threshold: {threshold:.0f}%)",
                severity=severity,
                color="red" if severity == EventSeverity.CRITICAL else "yellow",
                context={
                    'plugin_name': plugin_name,
                    'plugin_id': plugin_id,
                    'cpu_percent': cpu_percent,
                    'threshold': threshold
                }
            )
            
            logger.warning(f"Plugin CPU spike: {plugin_name} at {cpu_percent:.1f}%")
    
    async def on_plugin_parameter_changed(
        self,
        plugin_id: str,
        plugin_name: str,
        parameter_name: str,
        value: float,
        automation: bool = False
    ):
        """Called when plugin parameter changes (filtered for important changes)"""
        # Only log if automation or critical parameters
        if not automation and parameter_name not in ['Bypass', 'Dry/Wet', 'Mix']:
            return
        
        await create_audio_event(
            self.event_bus,
            title=f"{plugin_name}: {parameter_name}",
            message=f"Value: {value:.2f}" + (" (automation)" if automation else ""),
            severity=EventSeverity.INFO,
            color="cyan",
            context={
                'plugin_name': plugin_name,
                'plugin_id': plugin_id,
                'parameter': parameter_name,
                'value': value,
                'automation': automation
            }
        )
    
    async def on_plugin_crash(self, plugin_id: str, plugin_name: str, error: str):
        """Called when plugin crashes"""
        if plugin_id in self.loaded_plugins:
            del self.loaded_plugins[plugin_id]
        
        await create_audio_event(
            self.event_bus,
            title=f"Plugin Crash: {plugin_name}",
            message=error[:100],
            severity=EventSeverity.CRITICAL,
            color="red",
            sound=True,
            context={
                'plugin_name': plugin_name,
                'plugin_id': plugin_id,
                'error': error
            }
        )
        
        logger.error(f"Plugin crash: {plugin_name} - {error}")
    
    async def on_preset_loaded(
        self,
        plugin_id: str,
        plugin_name: str,
        preset_name: str,
        parameter_count: int
    ):
        """Called when plugin preset is loaded"""
        await create_audio_event(
            self.event_bus,
            title=f"{plugin_name}: Preset",
            message=f"{preset_name} ({parameter_count} params)",
            severity=EventSeverity.INFO,
            color="green",
            context={
                'plugin_name': plugin_name,
                'plugin_id': plugin_id,
                'preset_name': preset_name,
                'parameter_count': parameter_count
            }
        )
        
        logger.info(f"Preset loaded: {preset_name} in {plugin_name}")
    
    async def on_plugin_latency_changed(
        self,
        plugin_id: str,
        plugin_name: str,
        new_latency_samples: int,
        old_latency_samples: int
    ):
        """Called when plugin reports latency change"""
        change = new_latency_samples - old_latency_samples
        
        if change != 0:
            severity = EventSeverity.WARNING if abs(change) > 512 else EventSeverity.INFO
            
            await create_audio_event(
                self.event_bus,
                title=f"{plugin_name}: Latency",
                message=f"{new_latency_samples}s ({change:+d}s change)",
                severity=severity,
                color="yellow" if severity == EventSeverity.WARNING else "cyan",
                context={
                    'plugin_name': plugin_name,
                    'plugin_id': plugin_id,
                    'new_latency_samples': new_latency_samples,
                    'old_latency_samples': old_latency_samples,
                    'change': change
                }
            )
    
    def get_loaded_plugins(self) -> List[str]:
        """Get list of loaded plugin IDs"""
        return list(self.loaded_plugins.keys())
    
    def set_cpu_threshold(self, plugin_id: str, threshold: float):
        """Set CPU threshold for a plugin"""
        self.cpu_thresholds[plugin_id] = threshold
