"""
Unified Service Orchestrator for MAP2 Audio Platform

Provides centralized management of all platform services with:
- Dependency-aware startup ordering
- Health monitoring and status tracking
- Graceful shutdown sequences
- Service lifecycle management
- Real-time status updates via WebSocket
"""

import asyncio
import inspect
import logging
import time
import os
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Callable, Any, Set
from datetime import datetime
from pathlib import Path

from app.services.event_publisher import RealtimeMessagePublisher, event_publisher
from app.services.platform_checks import validate_platform, get_platform_status
from app.utils.singleton import Singleton
from app.utils.time import utc_now

logger = logging.getLogger(__name__)


class ServiceState(Enum):
    """Service lifecycle states."""
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    FAILED = "failed"
    DEGRADED = "degraded"  # Running but with issues
    READY = "ready"        # Fully operational and validated


class ServicePriority(Enum):
    """Service startup priority levels."""
    CRITICAL = 1      # Database, core infrastructure
    HIGH = 2          # Audio engine, plugin loader
    NORMAL = 3        # WebSocket, monitoring
    LOW = 4           # LCD, optional services
    BACKGROUND = 5    # Metrics collection, logging


@dataclass
class ServiceHealth:
    """Health status for a service."""
    healthy: bool = False
    message: str = ""
    last_check: Optional[datetime] = None
    response_time_ms: float = 0
    metrics: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ServiceDefinition:
    """Definition of a managed service."""
    name: str
    display_name: str
    description: str
    priority: ServicePriority
    dependencies: List[str] = field(default_factory=list)
    start_func: Optional[Callable] = None
    stop_func: Optional[Callable] = None
    health_check: Optional[Callable] = None
    is_async: bool = True
    is_optional: bool = False
    auto_restart: bool = False
    restart_delay: float = 5.0
    max_restarts: int = 3
    env_enabled_var: Optional[str] = None  # Env var to check if enabled
    is_critical_for_ready: bool = False    # Must be healthy for system ready state
    startup_retries: int = 3               # Number of startup retry attempts
    startup_retry_delay: float = 2.0       # Delay between startup retries (exponential backoff)


@dataclass
class ServiceStatus:
    """Runtime status of a service."""
    definition: ServiceDefinition
    state: ServiceState = ServiceState.STOPPED
    health: ServiceHealth = field(default_factory=ServiceHealth)
    started_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None
    restart_count: int = 0
    last_error: Optional[str] = None
    pid: Optional[int] = None


class ServiceOrchestrator(Singleton):
    """
    Centralized service orchestrator for MAP2 Audio Platform.

    Manages lifecycle, dependencies, and health of all platform services.
    """

    _TRAFFIC_GATE_SERVICES = ("database", "command_queue", "websocket_manager")
    _JUCE_HEALTH_TIMEOUT_SECONDS = 0.05

    def __init__(self, publisher: Optional[RealtimeMessagePublisher] = None):
        self._services: Dict[str, ServiceStatus] = {}
        self._startup_order: List[str] = []
        self._shutdown_order: List[str] = []
        self._lock = asyncio.Lock()
        self._health_task: Optional[asyncio.Task] = None
        self._running = False
        self._websocket_manager = None
        self._publisher = publisher or event_publisher
        self._event_callbacks: List[Callable] = []
        self._startup_time: Optional[datetime] = None
        self._plugin_loader_warm_task: Optional[asyncio.Task] = None

        # Register all services
        self._register_all_services()

    def _register_all_services(self):
        """Register all platform services with their definitions."""

        # === CRITICAL SERVICES (Priority 1) ===

        self._register_service(ServiceDefinition(
            name="database",
            display_name="Database",
            description="SQLite database for configuration and state",
            priority=ServicePriority.CRITICAL,
            dependencies=[],
            start_func=self._start_database,
            stop_func=self._stop_database,
            health_check=self._check_database_health,
            is_async=False,
            auto_restart=True,
            max_restarts=5,
            is_critical_for_ready=True,
            startup_retries=3,
        ))

        # === HIGH PRIORITY SERVICES (Priority 2) ===

        self._register_service(ServiceDefinition(
            name="plugin_loader",
            display_name="Plugin Loader",
            description="LV2 plugin discovery and management",
            priority=ServicePriority.LOW,
            dependencies=["database"],
            start_func=self._start_plugin_loader,
            stop_func=self._stop_plugin_loader,
            health_check=self._check_plugin_loader_health,
            is_async=True,
            auto_restart=True,
            max_restarts=3,
            is_critical_for_ready=False,
            startup_retries=3,
        ))

        # NOTE: Legacy audio_engine service removed - use juce_engine instead

        # JUCE engine is optional for readiness - the API must be able to serve
        # on management/testbed nodes even if the JUCE binary isn't built yet.
        # Audio processing will be degraded, but the API remains fully functional.
        self._register_service(ServiceDefinition(
            name="juce_engine",
            display_name="JUCE Audio Engine",
            description="JUCE-based C++ audio processing engine with LV2 support (RECOMMENDED)",
            priority=ServicePriority.HIGH,
            dependencies=["database"],
            start_func=self._start_juce_engine,
            stop_func=self._stop_juce_engine,
            health_check=self._check_juce_health,
            is_async=True,
            is_optional=True,   # Optional: API must start even without audio engine
            is_critical_for_ready=False,  # Don't block systemd readiness on JUCE
            auto_restart=True,
            max_restarts=3,
            restart_delay=10.0,
        ))

        self._register_service(ServiceDefinition(
            name="midi_engine",
            display_name="MIDI Engine",
            description="MIDI device management and routing",
            priority=ServicePriority.HIGH,
            dependencies=["database"],
            start_func=self._start_midi_engine,
            stop_func=self._stop_midi_engine,
            health_check=self._check_midi_health,
            is_async=True,
        ))

        # === NORMAL PRIORITY SERVICES (Priority 3) ===

        self._register_service(ServiceDefinition(
            name="command_queue",
            display_name="Command Queue",
            description="Async command processing for database operations",
            priority=ServicePriority.NORMAL,
            dependencies=["database"],
            start_func=self._start_command_queue,
            stop_func=self._stop_command_queue,
            health_check=self._check_command_queue_health,
            is_async=True,
        ))

        self._register_service(ServiceDefinition(
            name="websocket_manager",
            display_name="WebSocket Manager",
            description="Real-time client communication",
            priority=ServicePriority.NORMAL,
            dependencies=[],
            start_func=self._start_websocket_manager,
            stop_func=self._stop_websocket_manager,
            health_check=self._check_websocket_health,
            is_async=True,
        ))

        self._register_service(ServiceDefinition(
            name="meter_broadcaster",
            display_name="Meter Broadcaster",
            description="Audio level metering broadcast",
            priority=ServicePriority.NORMAL,
            dependencies=["websocket_manager", "juce_engine"],
            start_func=self._start_meter_broadcaster,
            stop_func=self._stop_meter_broadcaster,
            health_check=self._check_meter_broadcaster_health,
            is_async=True,
        ))

        self._register_service(ServiceDefinition(
            name="event_publisher",
            display_name="Event Publisher",
            description="System event broadcasting",
            priority=ServicePriority.NORMAL,
            dependencies=["websocket_manager"],
            start_func=self._start_event_publisher,
            stop_func=self._stop_event_publisher,
            health_check=self._check_event_publisher_health,
            is_async=True,
        ))

        self._register_service(ServiceDefinition(
            name="folder_scanner",
            display_name="Folder Scanner",
            description="NAM/IR/LV2 file discovery",
            priority=ServicePriority.NORMAL,
            dependencies=[],
            start_func=self._start_folder_scanner,
            stop_func=self._stop_folder_scanner,
            health_check=self._check_folder_scanner_health,
            is_async=True,
        ))

        # === LOW PRIORITY SERVICES (Priority 4) ===

        self._register_service(ServiceDefinition(
            name="rt_monitor",
            display_name="RT Monitor",
            description="Real-time performance monitoring",
            priority=ServicePriority.LOW,
            dependencies=["juce_engine"],
            start_func=self._start_rt_monitor,
            stop_func=self._stop_rt_monitor,
            health_check=self._check_rt_monitor_health,
            is_async=True,
        ))

        self._register_service(ServiceDefinition(
            name="plugin_profiler",
            display_name="Plugin Profiler",
            description="Plugin performance profiling",
            priority=ServicePriority.LOW,
            dependencies=["plugin_loader"],
            start_func=self._start_plugin_profiler,
            stop_func=self._stop_plugin_profiler,
            health_check=self._check_plugin_profiler_health,
            is_async=True,
        ))

        self._register_service(ServiceDefinition(
            name="lcd_display",
            display_name="LCD Display",
            description="Hardware LCD display interface",
            priority=ServicePriority.LOW,
            dependencies=["juce_engine"],
            start_func=self._start_lcd_display,
            stop_func=self._stop_lcd_display,
            health_check=self._check_lcd_health,
            is_async=True,
            is_optional=True,
            env_enabled_var="MAP2_ENABLE_LCD",
        ))

        # === BACKGROUND SERVICES (Priority 5) ===

        self._register_service(ServiceDefinition(
            name="metrics_collector",
            display_name="Metrics Collector",
            description="System metrics collection",
            priority=ServicePriority.BACKGROUND,
            dependencies=[],
            start_func=self._start_metrics_collector,
            stop_func=self._stop_metrics_collector,
            health_check=self._check_metrics_health,
            is_async=True,
        ))

        self._register_service(ServiceDefinition(
            name="backup_service",
            display_name="Backup Service",
            description="Configuration backup management",
            priority=ServicePriority.BACKGROUND,
            dependencies=["database"],
            start_func=self._start_backup_service,
            stop_func=self._stop_backup_service,
            health_check=self._check_backup_health,
            is_async=True,
        ))

        # === INFRASTRUCTURE (Priority 2 - Audio Server) ===
        self._register_service(ServiceDefinition(
            name="pipewire",
            display_name="PipeWire Audio Server",
            description="PipeWire audio server monitoring, graph topology, and latency control",
            priority=ServicePriority.HIGH,
            dependencies=[],
            start_func=self._start_pipewire,
            stop_func=self._stop_pipewire,
            health_check=self._check_pipewire_health,
            is_async=True,
            is_optional=True,
            is_critical_for_ready=False,
            auto_restart=True,
            max_restarts=5,
            env_enabled_var="MAP2_ENABLE_PIPEWIRE_SERVICE",
        ))

        # Calculate startup/shutdown order
        self._calculate_service_order()

    def _register_service(self, definition: ServiceDefinition):
        """Register a service definition."""
        self._services[definition.name] = ServiceStatus(definition=definition)

    def _calculate_service_order(self):
        """Calculate dependency-aware startup order using topological sort."""
        visited: Set[str] = set()
        order: List[str] = []

        def visit(name: str, visiting: Set[str]):
            if name in visited:
                return
            if name in visiting:
                raise ValueError(f"Circular dependency detected: {name}")

            visiting.add(name)
            service = self._services.get(name)
            if service:
                for dep in service.definition.dependencies:
                    if dep in self._services:
                        visit(dep, visiting)

            visiting.remove(name)
            visited.add(name)
            order.append(name)

        # Sort by priority first, then topological order
        services_by_priority = sorted(
            self._services.values(),
            key=lambda s: s.definition.priority.value
        )

        for service in services_by_priority:
            visit(service.definition.name, set())

        self._startup_order = order
        self._shutdown_order = list(reversed(order))

        # Calculate dependency levels for parallel startup
        self._dependency_levels = self._calculate_dependency_levels()

        logger.info(f"Service startup order: {self._startup_order}")
        logger.info(f"Dependency levels for parallel startup: {len(self._dependency_levels)} levels")

    def _calculate_dependency_levels(self) -> List[List[str]]:
        """Calculate dependency levels for parallel startup.

        Services at the same level have no dependencies on each other
        and can be started in parallel.

        Returns:
            List of lists, where each inner list contains service names
            that can be started in parallel.
        """
        levels: List[List[str]] = []
        assigned: Set[str] = set()

        while len(assigned) < len(self._services):
            # Find all services whose dependencies are already assigned
            current_level = []
            for name, service in self._services.items():
                if name in assigned:
                    continue
                # Check if all dependencies are assigned
                deps_satisfied = all(
                    dep in assigned or dep not in self._services
                    for dep in service.definition.dependencies
                )
                if deps_satisfied:
                    current_level.append(name)

            if not current_level:
                # Remaining services have circular dependencies or missing deps
                remaining = [n for n in self._services if n not in assigned]
                logger.warning(f"Could not resolve dependencies for: {remaining}")
                current_level = remaining

            # Sort current level by priority for consistent ordering
            current_level.sort(
                key=lambda n: self._services[n].definition.priority.value
            )
            levels.append(current_level)
            assigned.update(current_level)

        return levels

    # === LIFECYCLE MANAGEMENT ===

    async def start_all(self) -> Dict[str, bool]:
        """Start all services in dependency order with parallel execution.

        Services at the same dependency level are started concurrently
        for faster boot times.
        """
        async with self._lock:
            self._running = True
            self._startup_time = utc_now()
            results = {}

            logger.info("=" * 60)
            logger.info("MAP2 SERVICE ORCHESTRATOR - Starting all services (parallel mode)")
            logger.info("=" * 60)

            # Validate platform before starting services
            logger.info("Validating platform configuration...")
            platform_valid, platform_msg = validate_platform()
            if not platform_valid:
                logger.error(f"Platform validation failed: {platform_msg}")
                logger.warning("Continuing despite platform validation failure")
            else:
                logger.info(f"Platform validation passed: {platform_msg}")

            start_time = time.time()

            # Start services level by level (parallel within each level)
            for level_idx, level_services in enumerate(self._dependency_levels):
                level_start = time.time()
                logger.info(f"[LEVEL {level_idx + 1}/{len(self._dependency_levels)}] Starting {len(level_services)} services in parallel: {level_services}")

                # Filter services that should be started
                services_to_start = []
                for name in level_services:
                    service = self._services[name]

                    # Check if service is enabled via env var
                    if service.definition.env_enabled_var:
                        env_val = os.getenv(service.definition.env_enabled_var, 'false')
                        if env_val.lower() != 'true':
                            logger.info(f"[SKIP] {service.definition.display_name} (disabled via {service.definition.env_enabled_var})")
                            results[name] = True
                            continue

                    # Check dependencies (should all be satisfied by previous levels)
                    deps_ok = all(
                        self._services[dep].state == ServiceState.RUNNING
                        for dep in service.definition.dependencies
                        if dep in self._services and not self._services[dep].definition.is_optional
                    )

                    if not deps_ok and not service.definition.is_optional:
                        logger.warning(f"[SKIP] {service.definition.display_name} - dependencies not met")
                        service.state = ServiceState.FAILED
                        service.last_error = "Dependencies not running"
                        results[name] = False
                        continue

                    services_to_start.append(name)

                # Start all services in this level concurrently
                if services_to_start:
                    tasks = [self._start_service(name) for name in services_to_start]
                    level_results = await asyncio.gather(*tasks, return_exceptions=True)

                    for name, result in zip(services_to_start, level_results):
                        if isinstance(result, Exception):
                            logger.error(f"Exception starting {name}: {result}")
                            results[name] = self._services[name].definition.is_optional
                        else:
                            results[name] = result
                            if not result and not self._services[name].definition.is_optional:
                                logger.error(f"Critical service {name} failed to start")

                level_elapsed = (time.time() - level_start) * 1000
                logger.info(f"[LEVEL {level_idx + 1}] Completed in {level_elapsed:.1f}ms")

            # Start health monitoring
            self._health_task = asyncio.create_task(self._health_monitor_loop())

            total_elapsed = (time.time() - start_time) * 1000
            running_count = sum(1 for s in self._services.values() if s.state == ServiceState.RUNNING)

            logger.info("=" * 60)
            logger.info(f"MAP2 SERVICE ORCHESTRATOR - Startup complete in {total_elapsed:.1f}ms")
            logger.info(f"Services running: {running_count}/{len(self._services)}")
            logger.info("=" * 60)

            await self._emit_event("orchestrator_started", {
                "services": {k: v for k, v in results.items()},
                "startup_time": self._startup_time.isoformat(),
                "startup_duration_ms": total_elapsed
            })

            return results

    async def stop_all(self) -> Dict[str, bool]:
        """Stop all services in reverse dependency order."""
        async with self._lock:
            self._running = False
            results = {}

            logger.info("=" * 60)
            logger.info("MAP2 SERVICE ORCHESTRATOR - Stopping all services")
            logger.info("=" * 60)

            # Cancel health monitoring
            if self._health_task:
                self._health_task.cancel()
                try:
                    await self._health_task
                except asyncio.CancelledError:
                    pass

            for name in self._shutdown_order:
                service = self._services[name]
                if service.state in (ServiceState.RUNNING, ServiceState.DEGRADED):
                    success = await self._stop_service(name)
                    results[name] = success
                else:
                    results[name] = True

            logger.info("=" * 60)
            logger.info("MAP2 SERVICE ORCHESTRATOR - Shutdown complete")
            logger.info("=" * 60)

            return results

    async def _start_service(self, name: str) -> bool:
        """Start a single service with retry logic."""
        service = self._services.get(name)
        if not service:
            return False

        max_attempts = service.definition.startup_retries
        base_delay = service.definition.startup_retry_delay
        last_error = None

        for attempt in range(max_attempts):
            service.state = ServiceState.STARTING
            service.last_error = None
            start_time = time.time()

            if attempt > 0:
                delay = base_delay * (2 ** (attempt - 1))  # Exponential backoff
                logger.info(f"[RETRY] {service.definition.display_name} attempt {attempt + 1}/{max_attempts} (waiting {delay:.1f}s)")
                await asyncio.sleep(delay)

            logger.info(f"[START] {service.definition.display_name}{'...' if attempt == 0 else f' (attempt {attempt + 1})'}")

            try:
                if service.definition.start_func:
                    if service.definition.is_async:
                        await service.definition.start_func()
                    else:
                        await asyncio.to_thread(service.definition.start_func)

                service.state = ServiceState.RUNNING
                service.started_at = utc_now()
                elapsed = (time.time() - start_time) * 1000
                logger.info(f"[OK] {service.definition.display_name} started ({elapsed:.1f}ms)")

                await self._emit_event("service_started", {
                    "service": name,
                    "display_name": service.definition.display_name,
                    "elapsed_ms": elapsed,
                    "attempts": attempt + 1
                })

                return True

            except Exception as e:
                last_error = str(e)
                logger.warning(f"[FAIL] {service.definition.display_name} attempt {attempt + 1}: {e}")

        # All retries exhausted
        service.state = ServiceState.FAILED
        service.last_error = last_error
        logger.error(f"[FAIL] {service.definition.display_name}: All {max_attempts} attempts failed - {last_error}")

        await self._emit_event("service_failed", {
            "service": name,
            "display_name": service.definition.display_name,
            "error": last_error,
            "attempts": max_attempts
        })

        return service.definition.is_optional

    async def _stop_service(self, name: str) -> bool:
        """Stop a single service."""
        service = self._services.get(name)
        if not service:
            return False

        service.state = ServiceState.STOPPING
        logger.info(f"[STOP] {service.definition.display_name}...")

        try:
            if service.definition.stop_func:
                if service.definition.is_async:
                    await service.definition.stop_func()
                else:
                    await asyncio.to_thread(service.definition.stop_func)

            service.state = ServiceState.STOPPED
            service.stopped_at = utc_now()
            logger.info(f"[OK] {service.definition.display_name} stopped")

            return True

        except Exception as e:
            service.last_error = str(e)
            service.state = ServiceState.STOPPED
            logger.error(f"[WARN] {service.definition.display_name} stop error: {e}")
            return True

    async def restart_service(self, name: str) -> bool:
        """Restart a single service."""
        async with self._lock:
            service = self._services.get(name)
            if not service:
                return False

            await self._stop_service(name)
            await asyncio.sleep(0.5)
            return await self._start_service(name)

    # === HEALTH MONITORING ===

    # Health check intervals by priority (in ticks, where 1 tick = 5 seconds)
    HEALTH_CHECK_INTERVALS = {
        ServicePriority.CRITICAL: 1,    # Every 5 seconds
        ServicePriority.HIGH: 2,        # Every 10 seconds
        ServicePriority.NORMAL: 3,      # Every 15 seconds
        ServicePriority.LOW: 6,         # Every 30 seconds
        ServicePriority.BACKGROUND: 12, # Every 60 seconds
    }

    async def _health_monitor_loop(self):
        """
        Background health monitoring loop with staggered checks.

        Different service priorities are checked at different intervals
        to reduce CPU usage while maintaining responsiveness for critical services.
        """
        tick = 0
        base_interval = 5  # Base interval in seconds

        while self._running:
            try:
                tick += 1
                await self._check_health_by_tick(tick)
                await asyncio.sleep(base_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Health monitor error: {e}")
                await asyncio.sleep(10)

    async def _check_health_by_tick(self, tick: int):
        """
        Check health of services based on their priority and the current tick.

        Args:
            tick: Current tick count (increments every base interval)
        """
        services_to_check = []

        for name, service in self._services.items():
            if service.state not in (ServiceState.RUNNING, ServiceState.DEGRADED):
                continue

            if not service.definition.health_check:
                continue

            # Determine check interval based on priority
            interval = self.HEALTH_CHECK_INTERVALS.get(
                service.definition.priority,
                6  # Default to 30 seconds
            )

            # Check if this tick aligns with the service's check interval
            if tick % interval == 0:
                services_to_check.append(name)

        # Run health checks in parallel for efficiency
        if services_to_check:
            tasks = [self._check_single_health(name) for name in services_to_check]
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _check_single_health(self, name: str):
        """
        Check health of a single service.

        Args:
            name: Service name
        """
        service = self._services.get(name)
        if not service or not service.definition.health_check:
            return

        try:
            start = time.time()
            if service.definition.is_async:
                health = await service.definition.health_check()
            else:
                health = await asyncio.to_thread(service.definition.health_check)

            health.response_time_ms = (time.time() - start) * 1000
            health.last_check = utc_now()
            service.health = health

            if health.healthy:
                if service.state == ServiceState.DEGRADED:
                    service.state = ServiceState.RUNNING
                    await self._emit_event("service_recovered", {"service": name})
            else:
                if service.state == ServiceState.RUNNING:
                    service.state = ServiceState.DEGRADED
                    await self._emit_event("service_degraded", {
                        "service": name,
                        "message": health.message
                    })

                # Auto-restart if configured
                if service.definition.auto_restart and service.restart_count < service.definition.max_restarts:
                    logger.warning(f"Auto-restarting {name} (attempt {service.restart_count + 1})")
                    service.restart_count += 1
                    asyncio.create_task(self.restart_service(name))

        except Exception as e:
            service.health = ServiceHealth(healthy=False, message=str(e))
            logger.debug(f"Health check failed for {name}: {e}")

    # === STATUS API ===

    def get_all_status(self) -> Dict[str, Any]:
        """Get status of all services."""
        startup_map = self.get_startup_dependency_map()
        return {
            "orchestrator": {
                "running": self._running,
                "startup_time": self._startup_time.isoformat() if self._startup_time else None,
                "uptime_seconds": (utc_now() - self._startup_time).total_seconds() if self._startup_time else 0,
            },
            "services": {
                name: self._serialize_status(status)
                for name, status in self._services.items()
            },
            "startup_order": self._startup_order,
            "dependency_levels": startup_map["dependency_levels"],
            "traffic_gate_services": startup_map["traffic_gate_services"],
            "startup_progress": startup_map["startup_progress"],
        }

    def get_service_status(self, name: str) -> Optional[Dict[str, Any]]:
        """Get status of a specific service."""
        status = self._services.get(name)
        if status:
            return self._serialize_status(status)
        return None

    def _serialize_status(self, status: ServiceStatus) -> Dict[str, Any]:
        """Serialize service status for API response."""
        return {
            "name": status.definition.name,
            "display_name": status.definition.display_name,
            "description": status.definition.description,
            "state": status.state.value,
            "priority": status.definition.priority.value,
            "dependencies": status.definition.dependencies,
            "is_optional": status.definition.is_optional,
            "auto_restart": status.definition.auto_restart,
            "health": {
                "healthy": status.health.healthy,
                "message": status.health.message,
                "last_check": status.health.last_check.isoformat() if status.health.last_check else None,
                "response_time_ms": status.health.response_time_ms,
                "metrics": status.health.metrics,
            },
            "started_at": status.started_at.isoformat() if status.started_at else None,
            "stopped_at": status.stopped_at.isoformat() if status.stopped_at else None,
            "restart_count": status.restart_count,
            "last_error": status.last_error,
            "pid": status.pid,
        }

    def get_summary(self) -> Dict[str, int]:
        """Get summary counts by state."""
        summary = {state.value: 0 for state in ServiceState}
        for status in self._services.values():
            summary[status.state.value] += 1
        return summary

    def get_startup_dependency_map(self) -> Dict[str, Any]:
        """Return the explicit startup dependency map used for restart diagnostics."""
        service_levels: Dict[str, int] = {}
        dependency_levels: List[Dict[str, Any]] = []

        for index, level_services in enumerate(self._dependency_levels, start=1):
            dependency_levels.append(
                {
                    "level": index,
                    "services": list(level_services),
                }
            )
            for name in level_services:
                service_levels[name] = index

        running_or_ready = {
            ServiceState.RUNNING,
            ServiceState.READY,
        }
        completed_services = sum(
            1
            for status in self._services.values()
            if status.state in running_or_ready
        )

        return {
            "traffic_gate_services": list(self._TRAFFIC_GATE_SERVICES),
            "dependency_levels": dependency_levels,
            "services": {
                name: {
                    "level": service_levels.get(name),
                    "dependencies": list(status.definition.dependencies),
                    "dependents": sorted(
                        other_name
                        for other_name, other_status in self._services.items()
                        if name in other_status.definition.dependencies
                    ),
                    "priority": status.definition.priority.value,
                    "is_optional": status.definition.is_optional,
                    "is_critical_for_ready": status.definition.is_critical_for_ready,
                    "gates_accepting_traffic": name in self._TRAFFIC_GATE_SERVICES,
                }
                for name, status in self._services.items()
            },
            "startup_progress": {
                "completed_services": completed_services,
                "total_services": len(self._services),
                "completed_levels": sum(
                    1
                    for level_services in self._dependency_levels
                    if all(
                        self._services[name].state in running_or_ready
                        for name in level_services
                    )
                ),
                "total_levels": len(self._dependency_levels),
            },
        }

    # === READY STATE VALIDATION ===

    def is_ready(self) -> bool:
        """
        Check if system is in ready state.

        Returns True only if all critical services are running and healthy.
        """
        if not self._running:
            return False

        for name, service in self._services.items():
            if service.definition.is_critical_for_ready:
                # Must be running
                if service.state not in (ServiceState.RUNNING, ServiceState.READY):
                    return False
                # Must be healthy (if health check exists)
                if service.definition.health_check and not service.health.healthy:
                    return False

        return True

    def get_ready_status(self) -> Dict[str, Any]:
        """
        Get detailed ready state status.

        Returns status of all critical services and overall ready state.
        """
        platform_event_status = {
            "legacy_buses_removed": False,
            "dual_emitters_remaining": None,
            "platform_event_store": {"available": False},
            "platform_event_federation": {"available": False},
        }
        critical_services = {}
        all_critical_healthy = True
        issues = []
        traffic_gate_services = {}
        accepting_traffic = self._running

        for name, service in self._services.items():
            if service.definition.is_critical_for_ready:
                is_running = service.state in (ServiceState.RUNNING, ServiceState.READY)
                is_healthy = service.health.healthy if service.definition.health_check else True

                critical_services[name] = {
                    "display_name": service.definition.display_name,
                    "state": service.state.value,
                    "running": is_running,
                    "healthy": is_healthy,
                    "last_error": service.last_error,
                    "health_message": service.health.message,
                    "restart_count": service.restart_count,
                }

                if not is_running:
                    all_critical_healthy = False
                    issues.append(f"{service.definition.display_name} is not running (state: {service.state.value})")
                elif not is_healthy:
                    all_critical_healthy = False
                    issues.append(f"{service.definition.display_name} is unhealthy: {service.health.message}")

        for name in self._TRAFFIC_GATE_SERVICES:
            service = self._services.get(name)
            if service is None:
                accepting_traffic = False
                issues.append(f"Traffic gate service '{name}' is missing from orchestrator registration")
                continue

            is_running = service.state in (ServiceState.RUNNING, ServiceState.READY)
            traffic_gate_services[name] = {
                "display_name": service.definition.display_name,
                "state": service.state.value,
                "running": is_running,
                "dependencies": list(service.definition.dependencies),
                "last_error": service.last_error,
            }
            if not is_running:
                accepting_traffic = False
                issues.append(f"Traffic gate service {service.definition.display_name} is not running (state: {service.state.value})")

        ready = self._running and all_critical_healthy
        accepting_traffic = accepting_traffic and ready
        startup_map = self.get_startup_dependency_map()
        try:
            from app.services.platform_event.status import get_platform_event_status_snapshot

            platform_event_status = get_platform_event_status_snapshot()
        except Exception as exc:
            issues.append(f"PlatformEvent status unavailable: {exc}")

        return {
            "ready": ready,
            "accepting_traffic": accepting_traffic,
            "orchestrator_running": self._running,
            "startup_time": self._startup_time.isoformat() if self._startup_time else None,
            "uptime_seconds": (utc_now() - self._startup_time).total_seconds() if self._startup_time else 0,
            "critical_services": critical_services,
            "traffic_gate_services": traffic_gate_services,
            "dependency_levels": startup_map["dependency_levels"],
            "issues": issues,
            "legacy_buses_removed": platform_event_status["legacy_buses_removed"],
            "dual_emitters_remaining": platform_event_status["dual_emitters_remaining"],
            "platform_event_store": platform_event_status["platform_event_store"],
            "platform_event_federation": platform_event_status["platform_event_federation"],
            "summary": {
                "total_critical": len(critical_services),
                "healthy": sum(1 for s in critical_services.values() if s["running"] and s["healthy"]),
                "unhealthy": sum(1 for s in critical_services.values() if not s["running"] or not s["healthy"]),
            }
        }

    async def wait_for_ready(self, timeout: float = 60.0, check_interval: float = 1.0) -> bool:
        """
        Wait for system to reach ready state.

        Args:
            timeout: Maximum time to wait in seconds
            check_interval: Time between checks in seconds

        Returns:
            True if system became ready, False if timeout
        """
        start_time = time.time()

        while (time.time() - start_time) < timeout:
            if self.is_ready():
                logger.info(f"System ready after {time.time() - start_time:.1f}s")
                return True
            await asyncio.sleep(check_interval)

        status = self.get_ready_status()
        logger.warning(f"System not ready after {timeout}s: {status['issues']}")
        return False

    # === EVENT SYSTEM ===

    def set_websocket_manager(self, ws_manager):
        """Set WebSocket manager for event broadcasting."""
        self._websocket_manager = ws_manager
        set_manager = getattr(self._publisher, "set_websocket_manager", None)
        if callable(set_manager):
            set_manager(ws_manager)

    def add_event_callback(self, callback: Callable):
        """Add callback for service events."""
        self._event_callbacks.append(callback)

    async def _emit_event(self, event_type: str, data: Dict[str, Any]):
        """Emit a service event."""
        event = {
            "type": event_type,
            "timestamp": utc_now().isoformat(),
            "data": data
        }

        # Broadcast via WebSocket
        try:
            await self._publisher.publish_message(event, topics=("service_status",))
        except Exception as e:
            logger.debug(f"Realtime publish error: {e}")

        # Call registered callbacks
        for callback in self._event_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(event)
                else:
                    callback(event)
            except Exception as e:
                logger.debug(f"Event callback error: {e}")

    # === SERVICE IMPLEMENTATIONS ===

    def _start_database(self):
        """Start database service."""
        import app.database
        from app.services.default_effects_loader import initialize_default_effects

        app.database.init_db()
        db = app.database._SessionLocal()
        try:
            result = initialize_default_effects(db, force_refresh=False)
            self._services["database"].health.metrics = {
                "plugins_added": result.get("plugins_added", 0),
                "chains_created": result.get("chains_created", 0)
            }
        finally:
            db.close()

    def _stop_database(self):
        """Stop database service."""
        pass  # SQLite doesn't need explicit shutdown

    def _check_database_health(self) -> ServiceHealth:
        """Check database health."""
        try:
            import app.database
            from sqlalchemy import text

            # Get current _SessionLocal - must be re-imported to get updated reference
            session_factory = app.database._SessionLocal
            if session_factory is None:
                return ServiceHealth(healthy=False, message="Database not initialized")

            db = session_factory()
            try:
                db.execute(text("SELECT 1"))
                return ServiceHealth(healthy=True, message="Database responding")
            finally:
                db.close()
        except Exception as e:
            return ServiceHealth(healthy=False, message=str(e))

    async def _start_plugin_loader(self):
        """Start plugin loader service.

        Keep startup non-blocking by warming the plugin catalog in the
        background. This allows API readiness before a full filesystem scan.
        """
        from app.services.plugin_loader_unified import get_plugin_loader

        loader = get_plugin_loader()
        cached_count = loader.get_plugin_count()
        self._services["plugin_loader"].health.metrics = {
            "plugin_count": cached_count,
            "scan_state": "warming",
            "scan_started_at": utc_now().isoformat(),
        }

        if self._plugin_loader_warm_task and not self._plugin_loader_warm_task.done():
            return

        async def _warm_loader() -> None:
            started = time.time()
            try:
                plugins = await asyncio.to_thread(loader.discover_sync, False)
                elapsed_ms = (time.time() - started) * 1000.0
                self._services["plugin_loader"].health.metrics = {
                    "plugin_count": len(plugins),
                    "scan_state": "ready",
                    "scan_elapsed_ms": round(elapsed_ms, 2),
                    "scan_completed_at": utc_now().isoformat(),
                }
                logger.info(
                    "Plugin loader background warm complete: %s plugins in %.1fms",
                    len(plugins),
                    elapsed_ms,
                )
            except Exception as e:
                self._services["plugin_loader"].health.metrics = {
                    "plugin_count": loader.get_plugin_count(),
                    "scan_state": "error",
                    "scan_error": str(e),
                }
                logger.warning("Plugin loader background warm failed: %s", e)

        self._plugin_loader_warm_task = asyncio.create_task(_warm_loader())

    async def _stop_plugin_loader(self):
        """Stop plugin loader service."""
        try:
            if self._plugin_loader_warm_task and not self._plugin_loader_warm_task.done():
                self._plugin_loader_warm_task.cancel()
                try:
                    await self._plugin_loader_warm_task
                except asyncio.CancelledError:
                    pass
            self._plugin_loader_warm_task = None

            from app.services.plugin_loader_unified import get_plugin_loader
            loader = get_plugin_loader()
            if hasattr(loader, 'clear_cache'):
                loader.clear_cache()
            logger.info("Plugin loader stopped")
        except Exception as e:
            logger.debug(f"Plugin loader cleanup: {e}")

    async def _check_plugin_loader_health(self) -> ServiceHealth:
        """Check plugin loader health (lightweight - uses cached count)."""
        try:
            plugin_status = self._services.get("plugin_loader")
            if plugin_status and plugin_status.health.metrics:
                count = plugin_status.health.metrics.get("plugin_count", 0)
                scan_state = plugin_status.health.metrics.get("scan_state", "unknown")
                if scan_state == "warming":
                    return ServiceHealth(
                        healthy=True,
                        message=f"Background plugin scan running ({count} cached)",
                        metrics=plugin_status.health.metrics,
                    )
                if scan_state == "error":
                    return ServiceHealth(
                        healthy=False,
                        message=f"Plugin scan failed: {plugin_status.health.metrics.get('scan_error', 'unknown error')}",
                        metrics=plugin_status.health.metrics,
                    )
                return ServiceHealth(
                    healthy=True,
                    message=f"{count} plugins available",
                    metrics=plugin_status.health.metrics,
                )
            # Fallback - service hasn't started properly
            return ServiceHealth(
                healthy=False,
                message="Plugin loader not initialized"
            )
        except Exception as e:
            return ServiceHealth(healthy=False, message=str(e))

    async def _start_juce_engine(self):
        """Start JUCE audio engine service."""
        try:
            # Safety check: Verify Python audio I/O is not running
            from app.config import get_config
            config = get_config()
            
            if not config.get("audio.allow_python_io", False):
                logger.info("Python audio I/O is disabled (recommended for production)")
            
            # Check if audio.engine is set to juce
            audio_engine = config.get("audio.engine", "juce")
            if audio_engine != "juce":
                logger.warning(
                    f"audio.engine is set to '{audio_engine}' but starting JUCE engine. "
                    "This may cause resource conflicts!"
                )
            
            from app.services.juce_engine_service import get_audio_engine
            service = get_audio_engine()
            success = await service.initialize()
            
            if success:
                logger.info("✅ JUCE Audio Engine initialized successfully")
            else:
                logger.error("❌ JUCE Audio Engine initialization failed")
                raise RuntimeError("JUCE engine failed to initialize")
                
        except ImportError:
            logger.error(
                "❌ JUCE audio engine not available! Install JUCE dependencies.\n"
                "The system requires JUCE for production audio processing."
            )
            raise

    async def _stop_juce_engine(self):
        """Stop JUCE audio engine service."""
        try:
            from app.services.juce_engine_service import get_audio_engine
            service = get_audio_engine()
            await service.stop_audio()
            shutdown = getattr(service, "shutdown", None)
            if callable(shutdown):
                if inspect.iscoroutinefunction(shutdown):
                    await shutdown()
                else:
                    await asyncio.to_thread(shutdown)
        except Exception:
            pass

    async def _check_juce_health(self) -> ServiceHealth:
        """Check JUCE audio engine health."""
        try:
            from app.services.juce_engine_service import get_audio_engine, JUCE_AVAILABLE
            if not JUCE_AVAILABLE:
                return ServiceHealth(
                    healthy=False, 
                    message="❌ JUCE engine not installed - REQUIRED for production audio!"
                )
            service = get_audio_engine()
            cached_health = self._services.get("juce_engine").health if self._services.get("juce_engine") else None
            cached_metrics = (
                dict(cached_health.metrics)
                if cached_health and isinstance(cached_health.metrics, dict)
                else {}
            )
            try:
                info = await asyncio.wait_for(
                    asyncio.to_thread(service.get_system_info),
                    timeout=self._JUCE_HEALTH_TIMEOUT_SECONDS,
                )
            except (asyncio.TimeoutError, Exception) as exc:
                fallback_metrics = dict(cached_metrics)
                if not fallback_metrics:
                    fallback_metrics = {
                        "version": "unknown",
                        "running": bool(getattr(service, "is_running", False)),
                        "audio_running": bool(getattr(service, "is_running", False)),
                        "available": bool(getattr(service, "is_available", JUCE_AVAILABLE)),
                        "initialized": bool(getattr(service, "is_running", False)),
                    }

                fallback_metrics["stale"] = True
                fallback_metrics["health_probe_error"] = str(exc)
                is_running = bool(fallback_metrics.get("running"))
                version = fallback_metrics.get("version", "unknown")
                return ServiceHealth(
                    healthy=is_running,
                    message=(
                        f"✅ JUCE Audio Engine v{version} (cached health snapshot)"
                        if is_running
                        else f"⚠️ JUCE Engine v{version} fallback status only"
                    ),
                    metrics=fallback_metrics,
                )

            is_running = info.get('running', False)
            version = info.get('version', 'unknown')
            
            return ServiceHealth(
                healthy=is_running,
                message=f"✅ JUCE Audio Engine v{version}" if is_running else f"⚠️ JUCE Engine v{version} not running",
                metrics=info
            )
        except Exception as e:
            return ServiceHealth(
                healthy=False, 
                message=f"❌ JUCE engine error: {str(e)}"
            )

    async def _start_midi_engine(self):
        """Start MIDI engine service."""
        from app.services.midi_engine import MIDIEngineService
        engine = MIDIEngineService.get_instance()
        await engine.start()

    async def _stop_midi_engine(self):
        """Stop MIDI engine service."""
        from app.services.midi_engine import MIDIEngineService
        engine = getattr(MIDIEngineService, "_instance", None)
        if engine is not None:
            await engine.stop()

    async def _check_midi_health(self) -> ServiceHealth:
        """Check MIDI engine health (lightweight check)."""
        try:
            # Just verify the MIDI engine module is importable and responsive
            from app.services.midi_engine import MIDIEngineService
            # Don't rediscover devices on every health check - just verify engine exists
            return ServiceHealth(
                healthy=True,
                message="MIDI engine available"
            )
        except Exception as e:
            return ServiceHealth(healthy=False, message=str(e))

    async def _start_command_queue(self):
        """Start command queue service."""
        from app.services.command_queue import init_command_queue
        await init_command_queue()

    async def _stop_command_queue(self):
        """Stop command queue service."""
        from app.services.command_queue import shutdown_command_queue
        await shutdown_command_queue()

    async def _check_command_queue_health(self) -> ServiceHealth:
        """Check command queue health."""
        try:
            from app.services.command_queue import get_queue_stats
            stats = get_queue_stats()
            return ServiceHealth(
                healthy=True,
                message=f"{stats.get('processed_count', 0)} commands processed",
                metrics=stats
            )
        except Exception as e:
            return ServiceHealth(healthy=False, message=str(e))

    async def _start_websocket_manager(self):
        """Start WebSocket manager service."""
        from app.services.websocket_manager import ws_manager
        self._websocket_manager = ws_manager
        set_manager = getattr(self._publisher, "set_websocket_manager", None)
        if callable(set_manager):
            set_manager(ws_manager)

    async def _stop_websocket_manager(self):
        """Stop WebSocket manager service."""
        try:
            from app.services.websocket_manager import ws_manager
            if hasattr(ws_manager, 'disconnect_all'):
                await ws_manager.disconnect_all()
            elif hasattr(ws_manager, 'close_all'):
                await ws_manager.close_all()
            set_manager = getattr(self._publisher, "set_websocket_manager", None)
            if callable(set_manager):
                set_manager(None)
            logger.info("WebSocket manager stopped")
        except Exception as e:
            logger.debug(f"WebSocket manager cleanup: {e}")

    async def _check_websocket_health(self) -> ServiceHealth:
        """Check WebSocket manager health."""
        try:
            from app.services.websocket_manager import ws_manager
            stats = ws_manager.get_stats()
            return ServiceHealth(
                healthy=True,
                message=f"{stats.get('active_connections', 0)} active connections",
                metrics=stats
            )
        except Exception as e:
            return ServiceHealth(healthy=False, message=str(e))

    async def _start_meter_broadcaster(self):
        """Start meter broadcaster service."""
        from app.services.audio_meters import meter_broadcaster
        from app.services.websocket_manager import ws_manager
        await meter_broadcaster.start_broadcasting(ws_manager)

    async def _stop_meter_broadcaster(self):
        """Stop meter broadcaster service."""
        from app.services.audio_meters import meter_broadcaster
        await meter_broadcaster.stop_broadcasting()

    async def _check_meter_broadcaster_health(self) -> ServiceHealth:
        """Check meter broadcaster health."""
        try:
            from app.services.audio_meters import meter_broadcaster
            return ServiceHealth(
                healthy=meter_broadcaster.is_broadcasting,
                message="Broadcasting" if meter_broadcaster.is_broadcasting else "Stopped"
            )
        except Exception as e:
            return ServiceHealth(healthy=False, message=str(e))

    async def _start_event_publisher(self):
        """Start event publisher service."""
        from app.services.event_publisher import event_publisher
        from app.services.websocket_manager import ws_manager
        from app.services.platform_event.runtime import get_platform_event_presenter_runtime
        event_publisher.set_websocket_manager(ws_manager)
        await get_platform_event_presenter_runtime().start()

    async def _stop_event_publisher(self):
        """Stop event publisher service."""
        try:
            from app.services.event_publisher import event_publisher
            from app.services.platform_event.runtime import get_platform_event_presenter_runtime
            await get_platform_event_presenter_runtime().stop()
            event_publisher.set_websocket_manager(None)
            logger.info("Event publisher stopped")
        except Exception as e:
            logger.debug(f"Event publisher cleanup: {e}")

    async def _check_event_publisher_health(self) -> ServiceHealth:
        """Check event publisher health."""
        return ServiceHealth(healthy=True, message="Event publisher active")

    async def _start_folder_scanner(self):
        """Start folder scanner service."""
        from app.services.folder_scanner import get_folder_scanner
        scanner = get_folder_scanner()
        self._services["folder_scanner"].health.metrics = {
            "paths": scanner.base_paths
        }

    async def _stop_folder_scanner(self):
        """Stop folder scanner service."""
        try:
            from app.services.folder_scanner import get_folder_scanner
            scanner = get_folder_scanner()
            if hasattr(scanner, 'stop'):
                scanner.stop()
            logger.info("Folder scanner stopped")
        except Exception as e:
            logger.debug(f"Folder scanner cleanup: {e}")

    async def _check_folder_scanner_health(self) -> ServiceHealth:
        """Check folder scanner health."""
        try:
            from app.services.folder_scanner import get_folder_scanner
            scanner = get_folder_scanner()
            return ServiceHealth(
                healthy=True,
                message="Folder scanner active",
                metrics={"paths": scanner.base_paths}
            )
        except Exception as e:
            return ServiceHealth(healthy=False, message=str(e))

    async def _start_rt_monitor(self):
        """Start RT monitor service."""
        from app.services.rt_monitor import init_rt_monitor
        init_rt_monitor(sample_rate=48000, block_size=256)

    async def _stop_rt_monitor(self):
        """Stop RT monitor service."""
        try:
            from app.services.rt_monitor import shutdown_rt_monitor
            shutdown_rt_monitor()
            logger.info("RT monitor stopped")
        except ImportError:
            logger.debug("RT monitor shutdown function not available")
        except Exception as e:
            logger.debug(f"RT monitor cleanup: {e}")

    async def _check_rt_monitor_health(self) -> ServiceHealth:
        """Check RT monitor health."""
        try:
            from app.services.rt_monitor import get_rt_stats
            stats = get_rt_stats()
            return ServiceHealth(
                healthy=True,
                message=f"Deadline: {stats.get('deadline_us', 0):.1f}μs",
                metrics=stats
            )
        except Exception as e:
            return ServiceHealth(healthy=False, message=str(e))

    async def _start_plugin_profiler(self):
        """Start plugin profiler service."""
        from app.services.plugin_profiler import init_profiler
        profiler = init_profiler(sample_rate=48000, buffer_size=256)
        self._services["plugin_profiler"].health.metrics = {
            "deadline_us": profiler.deadline_us
        }

    async def _stop_plugin_profiler(self):
        """Stop plugin profiler service."""
        try:
            from app.services.plugin_profiler import shutdown_profiler
            shutdown_profiler()
            logger.info("Plugin profiler stopped")
        except Exception as e:
            logger.debug(f"Plugin profiler cleanup: {e}")

    async def _check_plugin_profiler_health(self) -> ServiceHealth:
        """Check plugin profiler health."""
        try:
            from app.services.plugin_profiler import get_profiler
            profiler = get_profiler()
            return ServiceHealth(
                healthy=True,
                message=f"Deadline: {profiler.deadline_us:.1f}μs",
                metrics={"deadline_us": profiler.deadline_us}
            )
        except Exception as e:
            return ServiceHealth(healthy=False, message=str(e))

    async def _start_lcd_display(self):
        """Start LCD display service."""
        try:
            from lcd import create_lcd_system
            simulation = os.getenv('MAP2_LCD_SIMULATION', 'false').lower() == 'true'
            manager = create_lcd_system(simulation=simulation)
            self._services["lcd_display"].health.metrics = {"simulation": simulation}
        except ImportError:
            logger.info("LCD module not available")

    async def _stop_lcd_display(self):
        """Stop LCD display service."""
        try:
            from lcd import shutdown_lcd_system
            shutdown_lcd_system()
            logger.info("LCD display stopped")
        except ImportError:
            logger.debug("LCD module not available for cleanup")
        except Exception as e:
            logger.debug(f"LCD display cleanup: {e}")

    async def _check_lcd_health(self) -> ServiceHealth:
        """Check LCD display health."""
        try:
            enabled = os.getenv('MAP2_ENABLE_LCD', 'false').lower() == 'true'
            if not enabled:
                return ServiceHealth(healthy=True, message="LCD disabled")
            return ServiceHealth(healthy=True, message="LCD active")
        except Exception as e:
            return ServiceHealth(healthy=False, message=str(e))

    async def _start_metrics_collector(self):
        """Start metrics collector service."""
        from app.services.performance_metrics import start_metrics_collection
        start_metrics_collection()

    async def _stop_metrics_collector(self):
        """Stop metrics collector service."""
        from app.services.performance_metrics import stop_metrics_collection
        stop_metrics_collection()

    async def _check_metrics_health(self) -> ServiceHealth:
        """Check metrics collector health."""
        try:
            from app.services.performance_metrics import get_performance_stats
            stats = get_performance_stats()
            return ServiceHealth(
                healthy=True,
                message=f"CPU: {stats.get('cpu_usage_pct', 0):.1f}%",
                metrics=stats
            )
        except Exception as e:
            return ServiceHealth(healthy=False, message=str(e))

    async def _start_backup_service(self):
        """Start backup service (on-demand - initialized when backup is requested)."""
        try:
            from app.services.command_history import get_session_backup_manager
            manager = get_session_backup_manager()
            if manager:
                logger.info("Backup service available")
        except ImportError:
            logger.debug("Backup manager not available")

    async def _stop_backup_service(self):
        """Stop backup service."""
        try:
            from app.services.command_history import get_session_backup_manager
            manager = get_session_backup_manager()
            if manager and hasattr(manager, 'cleanup'):
                manager.cleanup()
            logger.info("Backup service stopped")
        except Exception as e:
            logger.debug(f"Backup service cleanup: {e}")

    async def _check_backup_health(self) -> ServiceHealth:
        """Check backup service health."""
        return ServiceHealth(healthy=True, message="Backup service available")

    # -----------------------------------------------------------
    # PipeWire Audio Server
    # -----------------------------------------------------------

    async def _start_pipewire(self):
        """Start PipeWire monitoring service and WebSocket broadcast."""
        try:
            from app.services.pipewire_service import get_pipewire_service
            svc = get_pipewire_service()
            snapshot = await svc.get_graph_snapshot()

            if not snapshot.daemon.running:
                logger.warning("⚠️ PipeWire daemon not running — monitoring will retry")
            else:
                logger.info(
                    f"✅ PipeWire {snapshot.daemon.version} connected — "
                    f"{len(snapshot.devices)} device(s), "
                    f"latency {snapshot.total_latency_ms:.1f}ms"
                )

            # Start WebSocket broadcast if manager is available
            if self._websocket_manager:
                await svc.start_broadcast(self._websocket_manager, interval=2.0)

        except Exception as e:
            logger.error(f"❌ PipeWire service start failed: {e}")
            raise

    async def _stop_pipewire(self):
        """Stop PipeWire monitoring service."""
        try:
            from app.services.pipewire_service import get_pipewire_service
            svc = get_pipewire_service()
            await svc.stop_broadcast()
            logger.info("PipeWire monitoring stopped")
        except Exception:
            pass

    async def _check_pipewire_health(self) -> ServiceHealth:
        """Check PipeWire audio server health."""
        try:
            from app.services.pipewire_service import get_pipewire_service, HAS_WPCTL
            if not HAS_WPCTL:
                return ServiceHealth(
                    healthy=False,
                    message="❌ wpctl not installed — PipeWire CLI tools required"
                )
            svc = get_pipewire_service()
            snapshot = await svc.get_graph_snapshot()

            if not snapshot.daemon.running:
                return ServiceHealth(
                    healthy=False,
                    message="❌ PipeWire daemon not running"
                )

            alert_count = len(snapshot.alerts)
            alert_msg = f" ({alert_count} alert(s))" if alert_count else ""

            return ServiceHealth(
                healthy=True,
                message=(
                    f"✅ PipeWire {snapshot.daemon.version} — "
                    f"{len(snapshot.devices)} dev, {len(snapshot.streams)} stream(s), "
                    f"{snapshot.total_latency_ms:.1f}ms{alert_msg}"
                ),
                metrics={
                    "version": snapshot.daemon.version,
                    "devices": len(snapshot.devices),
                    "nodes": len(snapshot.nodes),
                    "streams": len(snapshot.streams),
                    "links": len(snapshot.links),
                    "xruns": snapshot.xruns,
                    "latency_ms": snapshot.total_latency_ms,
                    "alerts": snapshot.alerts,
                }
            )
        except Exception as e:
            return ServiceHealth(healthy=False, message=f"❌ PipeWire error: {e}")

    def get_platform_status(self) -> Dict[str, Any]:
        """
        Get detailed platform status including system checks.
        
        Returns:
            Dictionary with platform status information
        """
        platform_info = get_platform_status()
        
        return {
            "timestamp": utc_now().isoformat(),
            "platform_checks": platform_info
        }


# Singleton accessor
def get_orchestrator() -> ServiceOrchestrator:
    """Get the service orchestrator singleton."""
    return ServiceOrchestrator.get_instance()
