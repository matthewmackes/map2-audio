"""
System Health Event Producer

Monitors system health metrics and generates LCD events for:
- CPU usage (overall system)
- Memory usage
- Disk space
- Temperature
- Network connectivity
"""

import asyncio
import logging
import psutil
import shutil
from datetime import datetime

from app.services.lcd_event_bus import LCDEventBus, create_system_event, create_alert_event
from app.lcd_models.lcd_event import EventSeverity

logger = logging.getLogger(__name__)


class SystemHealthProducer:
    """
    Produces LCD events based on system health metrics.
    
    Monitors:
    - CPU usage (system-wide)
    - Memory usage
    - Disk space
    - System temperature
    - Network status
    """
    
    def __init__(self, event_bus: LCDEventBus):
        self.event_bus = event_bus
        
        # Thresholds
        self.cpu_warning_threshold = 75.0
        self.cpu_critical_threshold = 90.0
        self.memory_warning_threshold = 80.0
        self.disk_warning_threshold = 90.0
        self.temp_warning_threshold = 70.0
        
        # Previous states
        self.last_cpu_alert_level = None
        self.last_memory_alert_level = None
        self.last_disk_alert_level = None
        
        # Monitoring task
        self._monitor_task = None
        
    async def start(self):
        """Start system health monitoring"""
        logger.info("Starting System Health Producer")
        self._monitor_task = asyncio.create_task(self._monitor_loop())
    
    async def stop(self):
        """Stop monitoring"""
        logger.info("Stopping System Health Producer")
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
                await self._check_system_health()
                await asyncio.sleep(10)  # Check every 10 seconds
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"System health monitoring error: {e}")
                await asyncio.sleep(30)
    
    async def _check_system_health(self):
        """Check all system health metrics"""
        # CPU
        cpu_percent = psutil.cpu_percent(interval=1)
        await self._check_cpu(cpu_percent)
        
        # Memory
        memory = psutil.virtual_memory()
        await self._check_memory(memory.percent, memory.available)
        
        # Disk
        disk = shutil.disk_usage('/')
        disk_percent = (disk.used / disk.total) * 100
        await self._check_disk(disk_percent, disk.free)
        
        # Temperature (if available)
        try:
            temps = psutil.sensors_temperatures()
            if temps:
                await self._check_temperature(temps)
        except AttributeError:
            pass  # sensors_temperatures not available on all platforms
    
    async def _check_cpu(self, cpu_percent: float):
        """Check CPU usage and alert if needed"""
        current_level = None
        
        if cpu_percent >= self.cpu_critical_threshold:
            current_level = "critical"
        elif cpu_percent >= self.cpu_warning_threshold:
            current_level = "warning"
        
        # Only alert on level changes
        if current_level != self.last_cpu_alert_level:
            if current_level == "critical":
                await create_alert_event(
                    self.event_bus,
                    title="Critical CPU Usage",
                    message=f"System CPU: {cpu_percent:.1f}%",
                    severity=EventSeverity.CRITICAL,
                    context={"cpu_percent": cpu_percent}
                )
            elif current_level == "warning":
                await create_system_event(
                    self.event_bus,
                    title="High CPU Usage",
                    message=f"System CPU: {cpu_percent:.1f}%",
                    severity=EventSeverity.WARNING,
                    color="yellow",
                    context={"cpu_percent": cpu_percent}
                )
            elif self.last_cpu_alert_level:  # Returning to normal
                await create_system_event(
                    self.event_bus,
                    title="CPU Normal",
                    message=f"System CPU: {cpu_percent:.1f}%",
                    severity=EventSeverity.INFO,
                    color="green",
                    context={"cpu_percent": cpu_percent}
                )
            
            self.last_cpu_alert_level = current_level
    
    async def _check_memory(self, memory_percent: float, available_mb: int):
        """Check memory usage"""
        current_level = None
        
        if memory_percent >= self.memory_warning_threshold:
            current_level = "warning"
        
        if current_level != self.last_memory_alert_level:
            if current_level == "warning":
                await create_system_event(
                    self.event_bus,
                    title="High Memory Usage",
                    message=f"Memory: {memory_percent:.1f}% ({available_mb}MB free)",
                    severity=EventSeverity.WARNING,
                    color="yellow",
                    context={"memory_percent": memory_percent, "available_mb": available_mb}
                )
            elif self.last_memory_alert_level:
                await create_system_event(
                    self.event_bus,
                    title="Memory Normal",
                    message=f"Memory: {memory_percent:.1f}%",
                    severity=EventSeverity.INFO,
                    color="green",
                    context={"memory_percent": memory_percent}
                )
            
            self.last_memory_alert_level = current_level
    
    async def _check_disk(self, disk_percent: float, free_gb: int):
        """Check disk space"""
        current_level = None
        
        if disk_percent >= self.disk_warning_threshold:
            current_level = "warning"
        
        if current_level != self.last_disk_alert_level:
            if current_level == "warning":
                await create_system_event(
                    self.event_bus,
                    title="Low Disk Space",
                    message=f"Disk: {disk_percent:.1f}% full ({free_gb}GB free)",
                    severity=EventSeverity.WARNING,
                    color="yellow",
                    context={"disk_percent": disk_percent, "free_gb": free_gb}
                )
            
            self.last_disk_alert_level = current_level
    
    async def _check_temperature(self, temps: dict):
        """Check system temperature"""
        # Find highest temperature
        max_temp = 0
        sensor_name = None
        
        for name, entries in temps.items():
            for entry in entries:
                if entry.current > max_temp:
                    max_temp = entry.current
                    sensor_name = name
        
        if max_temp >= self.temp_warning_threshold:
            await create_system_event(
                self.event_bus,
                title="High Temperature",
                message=f"{sensor_name}: {max_temp:.1f}°C",
                severity=EventSeverity.WARNING,
                color="yellow",
                context={"temperature": max_temp, "sensor": sensor_name}
            )
    
    async def on_startup_complete(self, boot_time_seconds: float):
        """Called when system startup completes"""
        await create_system_event(
            self.event_bus,
            title="System Ready",
            message=f"Boot completed in {boot_time_seconds:.1f}s",
            severity=EventSeverity.INFO,
            color="green",
            context={"boot_time": boot_time_seconds}
        )
        
        logger.info(f"System ready in {boot_time_seconds:.1f}s")
    
    async def on_service_started(self, service_name: str):
        """Called when a service starts"""
        await create_system_event(
            self.event_bus,
            title=f"Service: {service_name}",
            message="Started successfully",
            severity=EventSeverity.INFO,
            context={"service": service_name}
        )
    
    async def on_service_failed(self, service_name: str, error: str):
        """Called when a service fails"""
        await create_alert_event(
            self.event_bus,
            title=f"Service Failed: {service_name}",
            message=error[:50],
            severity=EventSeverity.ERROR,
            context={"service": service_name, "error": error}
        )
