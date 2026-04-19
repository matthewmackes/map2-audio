"""
System Health Event Producer

Monitors host health and emits canonical PlatformEvents targeted at the LCD
surface.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
from typing import Any, Dict

import psutil

from app.services.platform_event.bus import PlatformEventBus
from app.services.platform_event.factories import make_lcd_surface_event
from app.services.platform_event.severity import Severity

logger = logging.getLogger(__name__)


class SystemHealthProducer:
    """Produces system health LCD PlatformEvents."""

    def __init__(self, event_bus: PlatformEventBus, *, node_label: str):
        self.event_bus = event_bus
        self.node_label = node_label
        self.cpu_warning_threshold = 75.0
        self.cpu_critical_threshold = 90.0
        self.memory_warning_threshold = 80.0
        self.disk_warning_threshold = 90.0
        self.temp_warning_threshold = 70.0
        self.last_cpu_alert_level = None
        self.last_memory_alert_level = None
        self.last_disk_alert_level = None
        self._monitor_task = None

    async def start(self):
        logger.info("Starting System Health Producer")
        self._monitor_task = asyncio.create_task(self._monitor_loop())

    async def stop(self):
        logger.info("Stopping System Health Producer")
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass

    async def _monitor_loop(self):
        while True:
            try:
                await self._check_system_health()
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("System health monitoring error: %s", e)
                await asyncio.sleep(30)

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
                source_service="system_health_producer",
                title=title,
                message=message,
                color=color,
                sound=sound,
                dismiss_auto=dismiss_auto,
                context=context,
            )
        )

    async def _check_system_health(self):
        snapshot = await asyncio.to_thread(self._collect_system_snapshot)
        await self._check_cpu(float(snapshot["cpu_percent"]))
        await self._check_memory(float(snapshot["memory_percent"]), int(snapshot["memory_available"]))
        await self._check_disk(float(snapshot["disk_percent"]), int(snapshot["disk_free"]))

        temps = snapshot.get("temperatures")
        if temps:
            await self._check_temperature(temps)

    def _collect_system_snapshot(self) -> Dict[str, Any]:
        memory = psutil.virtual_memory()
        disk = shutil.disk_usage("/")
        disk_percent = (disk.used / disk.total) * 100 if disk.total else 0.0

        temperatures = None
        try:
            temperatures = psutil.sensors_temperatures()
        except AttributeError:
            temperatures = None

        return {
            "cpu_percent": psutil.cpu_percent(interval=0.1),
            "memory_percent": memory.percent,
            "memory_available": memory.available,
            "disk_percent": disk_percent,
            "disk_free": disk.free,
            "temperatures": temperatures,
        }

    async def _check_cpu(self, cpu_percent: float):
        current_level = None
        if cpu_percent >= self.cpu_critical_threshold:
            current_level = "critical"
        elif cpu_percent >= self.cpu_warning_threshold:
            current_level = "warning"

        if current_level != self.last_cpu_alert_level:
            if current_level == "critical":
                await self._emit(
                    event_type="alert",
                    severity=Severity.CRITICAL,
                    title="Critical CPU Usage",
                    message=f"System CPU: {cpu_percent:.1f}%",
                    color="red",
                    sound=True,
                    dismiss_auto=False,
                    context={"cpu_percent": cpu_percent},
                )
            elif current_level == "warning":
                await self._emit(
                    event_type="system",
                    severity=Severity.WARNING,
                    title="High CPU Usage",
                    message=f"System CPU: {cpu_percent:.1f}%",
                    color="yellow",
                    context={"cpu_percent": cpu_percent},
                )
            elif self.last_cpu_alert_level:
                await self._emit(
                    event_type="system",
                    severity=Severity.INFO,
                    title="CPU Normal",
                    message=f"System CPU: {cpu_percent:.1f}%",
                    color="green",
                    context={"cpu_percent": cpu_percent},
                )

            self.last_cpu_alert_level = current_level

    async def _check_memory(self, memory_percent: float, available_mb: int):
        current_level = "warning" if memory_percent >= self.memory_warning_threshold else None
        if current_level != self.last_memory_alert_level:
            if current_level == "warning":
                await self._emit(
                    event_type="system",
                    severity=Severity.WARNING,
                    title="High Memory Usage",
                    message=f"Memory: {memory_percent:.1f}% ({available_mb}MB free)",
                    color="yellow",
                    context={"memory_percent": memory_percent, "available_mb": available_mb},
                )
            elif self.last_memory_alert_level:
                await self._emit(
                    event_type="system",
                    severity=Severity.INFO,
                    title="Memory Normal",
                    message=f"Memory: {memory_percent:.1f}%",
                    color="green",
                    context={"memory_percent": memory_percent},
                )

            self.last_memory_alert_level = current_level

    async def _check_disk(self, disk_percent: float, free_gb: int):
        current_level = "warning" if disk_percent >= self.disk_warning_threshold else None
        if current_level != self.last_disk_alert_level:
            if current_level == "warning":
                await self._emit(
                    event_type="system",
                    severity=Severity.WARNING,
                    title="Low Disk Space",
                    message=f"Disk: {disk_percent:.1f}% full ({free_gb}GB free)",
                    color="yellow",
                    context={"disk_percent": disk_percent, "free_gb": free_gb},
                )

            self.last_disk_alert_level = current_level

    async def _check_temperature(self, temps: dict):
        max_temp = 0.0
        sensor_name = None
        for name, entries in temps.items():
            for entry in entries:
                if entry.current > max_temp:
                    max_temp = entry.current
                    sensor_name = name

        if max_temp >= self.temp_warning_threshold:
            await self._emit(
                event_type="system",
                severity=Severity.WARNING,
                title="High Temperature",
                message=f"{sensor_name}: {max_temp:.1f}°C",
                color="yellow",
                context={"temperature": max_temp, "sensor": sensor_name},
            )

    async def on_startup_complete(self, boot_time_seconds: float):
        await self._emit(
            event_type="system",
            severity=Severity.INFO,
            title="System Ready",
            message=f"Boot completed in {boot_time_seconds:.1f}s",
            color="green",
            context={"boot_time": boot_time_seconds},
        )
        logger.info("System ready in %.1fs", boot_time_seconds)

    async def on_service_started(self, service_name: str):
        await self._emit(
            event_type="service",
            severity=Severity.INFO,
            title=f"Service: {service_name}",
            message="Started successfully",
            context={"service": service_name},
        )

    async def on_service_failed(self, service_name: str, error: str):
        await self._emit(
            event_type="alert",
            severity=Severity.ERROR,
            title=f"Service Failed: {service_name}",
            message=error[:50],
            color="red",
            dismiss_auto=False,
            context={"service": service_name, "error": error},
        )
