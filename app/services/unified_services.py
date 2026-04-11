"""
Unified Services Facade for MAP2 Audio Platform
⚠️  DEPRECATED - Use ServiceOrchestrator directly ⚠️

This facade is deprecated. Use ServiceOrchestrator directly:
    from app.services.service_orchestrator import get_orchestrator
This module provides a single, unified API for accessing all MAP2 services,
consolidating the ServiceManager and ServiceOrchestrator patterns.

Usage:
    from app.services.unified_services import services

    # Service access
    audio = services.audio_manager
    plugins = services.plugin_loader
    midi = services.midi_engine
    automation = services.automation_engine

    # Lifecycle
    await services.start_all()
    await services.stop_all()

    # Status
    status = services.get_status()
"""

import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass

from app.utils.singleton import Singleton

logger = logging.getLogger(__name__)


@dataclass
class ServiceStatus:
    """Status of a single service."""
    name: str
    running: bool
    healthy: bool
    message: str = ""
    metrics: Dict[str, Any] = None

    def __post_init__(self):
        if self.metrics is None:
            self.metrics = {}


class UnifiedServices(Singleton):
    """
    Unified access point for all MAP2 services.

    This facade consolidates service access patterns and provides:
    - Single entry point for all service instances
    - Consistent lifecycle management
    - Health monitoring
    - Backwards compatibility with existing code

    Delegates to ServiceOrchestrator for lifecycle and ServiceManager for instances.
    """

    def __init__(self):
        self._initialized = False
        self._service_manager = None
        self._orchestrator = None

    def _ensure_initialized(self):
        """Lazy initialization of underlying services."""
        if self._initialized:
            return

        # Get ServiceManager (for service instances)
        try:
            from app.services.service_manager import ServiceManager
            self._service_manager = ServiceManager.get_instance()
        except Exception as e:
            logger.warning(f"ServiceManager not available: {e}")

        # Get ServiceOrchestrator (for lifecycle)
        try:
            from app.services.service_orchestrator import get_orchestrator
            self._orchestrator = get_orchestrator()
        except Exception as e:
            logger.warning(f"ServiceOrchestrator not available: {e}")

        self._initialized = True

    # ========================================================================
    # Service Instance Access
    # ========================================================================

    @property
    def audio_manager(self):
        """Get audio I/O manager."""
        self._ensure_initialized()
        if self._service_manager:
            return self._service_manager.audio_manager
        return None

    @property
    def plugin_loader(self):
        """Get unified plugin loader."""
        self._ensure_initialized()
        try:
            from app.services.plugin_loader_unified import get_plugin_loader
            return get_plugin_loader()
        except ImportError:
            if self._service_manager:
                return self._service_manager.plugin_loader
        return None

    @property
    def midi_engine(self):
        """Get MIDI engine."""
        self._ensure_initialized()
        try:
            from app.services.midi_engine import MIDIEngineService
            if hasattr(MIDIEngineService, '_instance'):
                return MIDIEngineService._instance
            logger.debug("MIDI engine instance not initialized")
            return None
        except ImportError:
            logger.debug("MIDI engine module not available")
            return None

    @property
    def automation_engine(self):
        """Get automation engine."""
        self._ensure_initialized()
        try:
            from app.services.automation_engine import automation_engine
            return automation_engine
        except ImportError:
            logger.debug("Automation engine module not available")
            return None

    @property
    def rt_parameter_bridge(self):
        """Get real-time parameter bridge."""
        self._ensure_initialized()
        try:
            from app.services.realtime_parameter_bridge import rt_parameter_bridge
            return rt_parameter_bridge
        except ImportError:
            logger.debug("RT parameter bridge module not available")
            return None

    @property
    def websocket_manager(self):
        """Get WebSocket manager."""
        self._ensure_initialized()
        try:
            from app.services.websocket_manager import ws_manager
            return ws_manager
        except ImportError:
            logger.debug("WebSocket manager module not available")
            return None

    @property
    def command_history(self):
        """Get command history manager."""
        self._ensure_initialized()
        try:
            from app.services.command_history import get_command_history
            return get_command_history()
        except ImportError:
            logger.debug("Command history module not available")
            return None

    @property
    def backup_manager(self):
        """Get session backup manager."""
        self._ensure_initialized()
        try:
            from app.services.command_history import get_session_backup_manager
            return get_session_backup_manager()
        except ImportError:
            logger.debug("Backup manager module not available")
            return None

    @property
    def config(self):
        """Get configuration manager."""
        try:
            from app.config import get_config
            return get_config()
        except ImportError:
            logger.debug("Config module not available")
            return None

    # ========================================================================
    # Lifecycle Management (delegates to orchestrator)
    # ========================================================================

    async def start_all(self) -> Dict[str, bool]:
        """
        Start all services in proper dependency order.

        Returns:
            Dict mapping service name to success status
        """
        self._ensure_initialized()

        if self._orchestrator:
            return await self._orchestrator.start_all()

        # Fallback to basic startup
        if self._service_manager:
            result = await self._service_manager.start_all_services()
            return {k: v.get('success', False) for k, v in result.items()}

        return {}

    async def stop_all(self) -> Dict[str, bool]:
        """
        Stop all services gracefully.

        Returns:
            Dict mapping service name to success status
        """
        self._ensure_initialized()

        if self._orchestrator:
            return await self._orchestrator.stop_all()

        # Fallback to basic shutdown
        if self._service_manager:
            result = await self._service_manager.stop_all_services()
            return {k: v.get('success', False) for k, v in result.items()}

        return {}

    async def restart_service(self, name: str) -> bool:
        """Restart a specific service."""
        self._ensure_initialized()

        if self._orchestrator:
            return await self._orchestrator.restart_service(name)

        return False

    # ========================================================================
    # Status and Health
    # ========================================================================

    def get_status(self) -> Dict[str, ServiceStatus]:
        """
        Get status of all services.

        Returns:
            Dict mapping service name to ServiceStatus
        """
        self._ensure_initialized()
        status = {}

        # Get orchestrator status if available
        if self._orchestrator:
            try:
                orch_status = self._orchestrator.get_all_status()
                for name, svc in orch_status.get('services', {}).items():
                    status[name] = ServiceStatus(
                        name=name,
                        running=svc.get('running', False),
                        healthy=svc.get('health', {}).get('healthy', False),
                        message=svc.get('health', {}).get('message', ''),
                        metrics=svc.get('health', {}).get('metrics', {}),
                    )
            except Exception as e:
                logger.warning(f"Failed to get orchestrator status: {e}")

        # Add service instance status
        status['audio_manager'] = ServiceStatus(
            name='audio_manager',
            running=self.audio_manager is not None and getattr(self.audio_manager, 'is_running', False),
            healthy=self.audio_manager is not None,
        )

        status['plugin_loader'] = ServiceStatus(
            name='plugin_loader',
            running=self.plugin_loader is not None,
            healthy=self.plugin_loader is not None,
            metrics={'plugin_count': self.plugin_loader.get_plugin_count() if self.plugin_loader else 0}
        )

        status['midi_engine'] = ServiceStatus(
            name='midi_engine',
            running=self.midi_engine is not None and getattr(self.midi_engine, '_running', False),
            healthy=self.midi_engine is not None,
        )

        status['automation_engine'] = ServiceStatus(
            name='automation_engine',
            running=self.automation_engine is not None and getattr(self.automation_engine, '_running', False),
            healthy=self.automation_engine is not None,
        )

        status['rt_parameter_bridge'] = ServiceStatus(
            name='rt_parameter_bridge',
            running=self.rt_parameter_bridge is not None and getattr(self.rt_parameter_bridge, '_running', False),
            healthy=self.rt_parameter_bridge is not None,
        )

        return status

    def get_summary(self) -> Dict[str, Any]:
        """Get summary of all services."""
        status = self.get_status()
        running = sum(1 for s in status.values() if s.running)
        healthy = sum(1 for s in status.values() if s.healthy)

        return {
            'total': len(status),
            'running': running,
            'healthy': healthy,
            'services': {name: {'running': s.running, 'healthy': s.healthy} for name, s in status.items()}
        }

    def is_ready(self) -> bool:
        """Check if all critical services are ready."""
        self._ensure_initialized()

        if self._orchestrator:
            return self._orchestrator.is_ready()

        # Basic readiness check
        return (
            self.audio_manager is not None and
            self.plugin_loader is not None
        )

    def is_healthy(self) -> bool:
        """Check if all services are healthy."""
        status = self.get_status()
        return all(s.healthy for s in status.values())

    # ========================================================================
    # Audio Shortcuts
    # ========================================================================

    def get_audio_status(self) -> Dict[str, Any]:
        """Get detailed audio status."""
        self._ensure_initialized()
        if self._service_manager:
            return self._service_manager.get_audio_status()
        return {'running': False, 'error': 'Audio not available'}

    async def start_audio(self) -> Dict[str, Any]:
        """Start audio engine."""
        self._ensure_initialized()
        if self._service_manager:
            return await self._service_manager.start_audio()
        return {'success': False, 'error': 'Audio not available'}

    async def stop_audio(self) -> Dict[str, Any]:
        """Stop audio engine."""
        self._ensure_initialized()
        if self._service_manager:
            return await self._service_manager.stop_audio()
        return {'success': False, 'error': 'Audio not available'}

    # ========================================================================
    # Plugin Shortcuts
    # ========================================================================

    async def discover_plugins(self, refresh: bool = False) -> List:
        """Discover available plugins."""
        loader = self.plugin_loader
        if loader:
            return await loader.discover(force_refresh=refresh)
        return []

    def get_plugin(self, uri: str):
        """Get a plugin by URI."""
        loader = self.plugin_loader
        if loader:
            return loader.get_plugin(uri)
        return None

    def search_plugins(self, query: str) -> List:
        """Search plugins."""
        loader = self.plugin_loader
        if loader:
            return loader.search(query)
        return []


# Global singleton instance
services = UnifiedServices.get_instance()


# Convenience function
def get_services() -> UnifiedServices:
    """Get the unified services instance."""
    return services
