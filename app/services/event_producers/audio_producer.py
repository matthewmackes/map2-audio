"""
Audio Event Producer

Monitors JUCE audio engine and emits canonical PlatformEvents targeted at the
LCD surface.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

from app.services.platform_event.bus import PlatformEventBus
from app.services.platform_event.factories import make_lcd_surface_event
from app.services.platform_event.severity import Severity

logger = logging.getLogger(__name__)


class AudioEventProducer:
    """Produces audio-related LCD PlatformEvents."""

    def __init__(self, event_bus: PlatformEventBus, *, node_label: str):
        self.event_bus = event_bus
        self.node_label = node_label
        self.audio_running = False
        self.last_xrun_count = 0
        self.last_cpu_percent = 0.0
        self.last_latency_ms = 0.0
        self._monitor_task = None

    async def start(self):
        logger.info("Starting Audio Event Producer")
        self._monitor_task = asyncio.create_task(self._monitor_loop())

    async def stop(self):
        logger.info("Stopping Audio Event Producer")
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass

    async def _monitor_loop(self):
        while True:
            try:
                await self._check_audio_status()
                await asyncio.sleep(2)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Audio monitoring error: %s", e)
                await asyncio.sleep(5)

    async def _emit(
        self,
        *,
        event_type: str,
        severity: Severity,
        title: str,
        message: str,
        color: str | None = None,
        sound: bool | None = None,
        dismiss_auto: bool | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        await self.event_bus.emit(
            make_lcd_surface_event(
                event_type=event_type,
                severity=severity,
                source_node=self.node_label,
                source_service="audio_event_producer",
                title=title,
                message=message,
                color=color,
                sound=sound,
                dismiss_auto=dismiss_auto,
                context=context,
            )
        )

    async def _check_audio_status(self):
        status = await self._get_audio_status()
        running = bool(status.get("running"))
        sample_rate = int(status.get("sample_rate") or 0)
        buffer_size = int(status.get("buffer_size") or 0)
        latency_ms = float(status.get("latency_ms") or 0.0)
        cpu_percent = float(status.get("cpu_load") or 0.0)
        xrun_count = int((status.get("underruns") or 0) + (status.get("overruns") or 0))

        if running and not self.audio_running:
            await self.on_audio_started(
                device_name="JUCE Engine",
                sample_rate=sample_rate,
                buffer_size=buffer_size,
                latency_ms=latency_ms,
            )
        elif not running and self.audio_running:
            await self.on_audio_stopped()

        if running:
            await self.on_xrun_detected(xrun_count)
            await self.on_cpu_spike(cpu_percent)
            await self.on_latency_change(latency_ms)

    async def _get_audio_status(self) -> Dict[str, Any]:
        """Resolve audio status without instantiating the deprecated Python audio backend."""
        try:
            from app.services.juce_engine_service import get_audio_engine

            engine = get_audio_engine()
            info = await asyncio.to_thread(engine.get_system_info)
            sample_rate = int(info.get("sample_rate") or 0)
            buffer_size = int(info.get("buffer_size") or 0)
            latency_ms = float(info.get("latency_ms") or 0.0)
            if latency_ms <= 0.0 and sample_rate > 0 and buffer_size > 0:
                latency_ms = (buffer_size / sample_rate) * 1000.0

            xrun_count = 0
            try:
                xrun_count = int(await engine.get_xrun_count())
            except Exception:
                xrun_count = int(info.get("xrun_count") or 0)

            cpu_load = float(
                info.get("cpu_load")
                or info.get("cpu_usage_pct")
                or info.get("cpu_percent")
                or 0.0
            )

            return {
                "running": bool(info.get("audio_running", info.get("running"))),
                "sample_rate": sample_rate,
                "buffer_size": buffer_size,
                "latency_ms": latency_ms,
                "cpu_load": cpu_load,
                "underruns": xrun_count,
                "overruns": 0,
            }
        except Exception as exc:
            logger.debug("JUCE audio status lookup failed", exc_info=exc)
            return {
                "running": False,
                "sample_rate": 0,
                "buffer_size": 0,
                "latency_ms": 0.0,
                "cpu_load": 0.0,
                "underruns": 0,
                "overruns": 0,
            }

    async def on_audio_started(self, device_name: str, sample_rate: int, buffer_size: int, latency_ms: float):
        self.audio_running = True
        self.last_latency_ms = latency_ms
        await self._emit(
            event_type="audio",
            severity=Severity.INFO,
            title="Audio Engine Started",
            message=f"{device_name} @ {sample_rate}Hz, {latency_ms:.1f}ms latency",
            color="green",
            context={
                "device": device_name,
                "sample_rate": sample_rate,
                "buffer_size": buffer_size,
                "latency_ms": latency_ms,
            },
        )
        logger.info("Audio started: %s @ %sHz", device_name, sample_rate)

    async def on_audio_stopped(self):
        self.audio_running = False
        await self._emit(
            event_type="audio",
            severity=Severity.WARNING,
            title="Audio Engine Stopped",
            message="Audio processing stopped",
            color="yellow",
        )
        logger.info("Audio stopped")

    async def on_xrun_detected(self, xrun_count: int):
        if xrun_count <= self.last_xrun_count:
            return

        new_xruns = xrun_count - self.last_xrun_count
        severity = Severity.CRITICAL if new_xruns >= 3 else Severity.ERROR
        await self._emit(
            event_type="alert",
            severity=severity,
            title="XRUN ALERT" if new_xruns >= 3 else "Audio Dropout",
            message=f"{new_xruns} dropout{'s' if new_xruns > 1 else ''} detected (total: {xrun_count})",
            color="red" if severity == Severity.CRITICAL else "yellow",
            sound=True,
            dismiss_auto=False,
            context={"xrun_count": xrun_count, "new_xruns": new_xruns},
        )
        self.last_xrun_count = xrun_count
        logger.warning("XRUN detected: %s new dropouts", new_xruns)

    async def on_cpu_spike(self, cpu_percent: float):
        if cpu_percent > 75 and self.last_cpu_percent <= 75:
            severity = Severity.CRITICAL if cpu_percent > 90 else Severity.WARNING
            await self._emit(
                event_type="audio",
                severity=severity,
                title="High Audio CPU",
                message=f"Audio CPU: {cpu_percent:.1f}%",
                color="red" if cpu_percent > 90 else "yellow",
                context={"cpu_percent": cpu_percent},
            )
            logger.warning("Audio CPU spike: %.1f%%", cpu_percent)

        self.last_cpu_percent = cpu_percent

    async def on_latency_change(self, latency_ms: float):
        if abs(latency_ms - self.last_latency_ms) <= 2.0:
            return
        await self._emit(
            event_type="audio",
            severity=Severity.INFO,
            title="Latency Changed",
            message=f"New latency: {latency_ms:.1f}ms (was {self.last_latency_ms:.1f}ms)",
            context={"latency_ms": latency_ms, "previous": self.last_latency_ms},
        )
        self.last_latency_ms = latency_ms
        logger.info("Latency changed: %.1fms", latency_ms)

    async def on_plugin_loaded(self, plugin_name: str, plugin_type: str):
        await self._emit(
            event_type="audio",
            severity=Severity.INFO,
            title="Plugin Loaded",
            message=f"{plugin_type}: {plugin_name}",
            context={"plugin_name": plugin_name, "plugin_type": plugin_type},
        )
        logger.info("Plugin loaded: %s", plugin_name)

    async def on_preset_loaded(self, preset_name: str, plugin_count: int):
        await self._emit(
            event_type="audio",
            severity=Severity.INFO,
            title=f"Preset: {preset_name}",
            message=f"{plugin_count} plugin{'s' if plugin_count != 1 else ''} loaded",
            context={"preset_name": preset_name, "plugin_count": plugin_count},
        )
        logger.info("Preset loaded: %s", preset_name)
