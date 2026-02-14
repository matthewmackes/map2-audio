"""
Audio Event Producer

Monitors JUCE audio engine and generates LCD events for:
- Audio engine start/stop
- XRUNs (audio dropouts)
- CPU usage spikes
- Latency changes
- Plugin loading
- Preset changes
"""

import asyncio
import logging

from app.services.lcd_event_bus import LCDEventBus, create_audio_event, create_alert_event
from app.lcd_models.lcd_event import EventSeverity

logger = logging.getLogger(__name__)


class AudioEventProducer:
    """
    Produces LCD events based on audio engine state.
    
    Monitors:
    - Audio engine status (running/stopped)
    - XRUN count (audio dropouts)
    - CPU usage by audio process
    - Latency measurements
    - Plugin operations
    """
    
    def __init__(self, event_bus: LCDEventBus):
        self.event_bus = event_bus
        
        # Previous state for change detection
        self.audio_running = False
        self.last_xrun_count = 0
        self.last_cpu_percent = 0.0
        self.last_latency_ms = 0.0
        
        # Monitoring task
        self._monitor_task = None
        
    async def start(self):
        """Start monitoring audio engine"""
        logger.info("Starting Audio Event Producer")
        self._monitor_task = asyncio.create_task(self._monitor_loop())
    
    async def stop(self):
        """Stop monitoring"""
        logger.info("Stopping Audio Event Producer")
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
    
    async def _monitor_loop(self):
        """Background monitoring loop"""
        while True:
            try:
                await self._check_audio_status()
                await asyncio.sleep(2)  # Check every 2 seconds
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Audio monitoring error: {e}")
                await asyncio.sleep(5)
    
    async def _check_audio_status(self):
        """Check current audio engine status"""
        from app.services import service_manager

        status = service_manager.get_audio_status() or {}
        running = bool(status.get("running"))
        sample_rate = int(status.get("sample_rate") or 0)
        buffer_size = int(status.get("buffer_size") or 0)
        latency_ms = float(status.get("latency_ms") or 0.0)
        cpu_percent = float(status.get("cpu_load") or 0.0)
        xrun_count = int((status.get("underruns") or 0) + (status.get("overruns") or 0))

        # Engine start/stop transitions
        if running and not self.audio_running:
            await self.on_audio_started(
                device_name="JUCE Engine",
                sample_rate=sample_rate,
                buffer_size=buffer_size,
                latency_ms=latency_ms,
            )
        elif not running and self.audio_running:
            await self.on_audio_stopped()

        # XRUN, CPU, and latency drift monitoring while running
        if running:
            await self.on_xrun_detected(xrun_count)
            await self.on_cpu_spike(cpu_percent)
            await self.on_latency_change(latency_ms)
    
    async def on_audio_started(self, device_name: str, sample_rate: int, buffer_size: int, latency_ms: float):
        """Called when audio engine starts"""
        self.audio_running = True
        self.last_latency_ms = latency_ms
        
        await create_audio_event(
            self.event_bus,
            title="Audio Engine Started",
            message=f"{device_name} @ {sample_rate}Hz, {latency_ms:.1f}ms latency",
            severity=EventSeverity.INFO,
            color="green",
            context={
                "device": device_name,
                "sample_rate": sample_rate,
                "buffer_size": buffer_size,
                "latency_ms": latency_ms
            }
        )
        
        logger.info(f"Audio started: {device_name} @ {sample_rate}Hz")
    
    async def on_audio_stopped(self):
        """Called when audio engine stops"""
        self.audio_running = False
        
        await create_audio_event(
            self.event_bus,
            title="Audio Engine Stopped",
            message="Audio processing stopped",
            severity=EventSeverity.WARNING,
            color="yellow"
        )
        
        logger.info("Audio stopped")
    
    async def on_xrun_detected(self, xrun_count: int):
        """Called when XRUN (audio dropout) is detected"""
        if xrun_count > self.last_xrun_count:
            new_xruns = xrun_count - self.last_xrun_count
            
            # Critical if multiple XRUNs
            severity = EventSeverity.CRITICAL if new_xruns >= 3 else EventSeverity.ERROR
            
            await create_alert_event(
                self.event_bus,
                title="XRUN ALERT" if new_xruns >= 3 else "Audio Dropout",
                message=f"{new_xruns} dropout{'s' if new_xruns > 1 else ''} detected (total: {xrun_count})",
                severity=severity,
                context={"xrun_count": xrun_count, "new_xruns": new_xruns}
            )
            
            self.last_xrun_count = xrun_count
            logger.warning(f"XRUN detected: {new_xruns} new dropouts")
    
    async def on_cpu_spike(self, cpu_percent: float):
        """Called when audio CPU usage spikes"""
        if cpu_percent > 75 and self.last_cpu_percent <= 75:
            severity = EventSeverity.CRITICAL if cpu_percent > 90 else EventSeverity.WARNING
            
            await create_audio_event(
                self.event_bus,
                title="High Audio CPU",
                message=f"Audio CPU: {cpu_percent:.1f}%",
                severity=severity,
                color="red" if cpu_percent > 90 else "yellow",
                context={"cpu_percent": cpu_percent}
            )
            
            logger.warning(f"Audio CPU spike: {cpu_percent:.1f}%")
        
        self.last_cpu_percent = cpu_percent
    
    async def on_latency_change(self, latency_ms: float):
        """Called when latency changes significantly"""
        if abs(latency_ms - self.last_latency_ms) > 2.0:
            await create_audio_event(
                self.event_bus,
                title="Latency Changed",
                message=f"New latency: {latency_ms:.1f}ms (was {self.last_latency_ms:.1f}ms)",
                severity=EventSeverity.INFO,
                context={"latency_ms": latency_ms, "previous": self.last_latency_ms}
            )
            
            self.last_latency_ms = latency_ms
            logger.info(f"Latency changed: {latency_ms:.1f}ms")
    
    async def on_plugin_loaded(self, plugin_name: str, plugin_type: str):
        """Called when plugin is loaded"""
        await create_audio_event(
            self.event_bus,
            title="Plugin Loaded",
            message=f"{plugin_type}: {plugin_name}",
            severity=EventSeverity.INFO,
            context={"plugin_name": plugin_name, "plugin_type": plugin_type}
        )
        
        logger.info(f"Plugin loaded: {plugin_name}")
    
    async def on_preset_loaded(self, preset_name: str, plugin_count: int):
        """Called when preset is loaded"""
        await create_audio_event(
            self.event_bus,
            title=f"Preset: {preset_name}",
            message=f"{plugin_count} plugin{'s' if plugin_count != 1 else ''} loaded",
            severity=EventSeverity.INFO,
            context={"preset_name": preset_name, "plugin_count": plugin_count}
        )
        
        logger.info(f"Preset loaded: {preset_name}")
