"""
Global Service Manager for MAP2 Audio
Provides singleton access to all core services with proper initialization and comprehensive monitoring.
⚠️  DEPRECATED - Use ServiceOrchestrator instead ⚠️

This module is deprecated in favor of ServiceOrchestrator which provides:
- Better dependency management
- Health monitoring
- Async initialization
- More comprehensive service management

For new code, use:
    from app.services.service_orchestrator import get_orchestrator

This module remains for backwards compatibility only.

Fix #7: This module now warns on import and delegates to ServiceOrchestrator.
"""

import logging
import time
import json
import asyncio
import subprocess
import psutil
import os
import warnings
from typing import Optional, Dict, List
from pathlib import Path
from .audio_io_v2 import AudioIOFactory, RealAudioIOManager
from .plugin_loader_unified import get_plugin_loader, UnifiedPluginLoader

logger = logging.getLogger(__name__)

# Fix #7: Emit deprecation warning on module import
warnings.warn(
    "ServiceManager is deprecated. Use 'from app.services.service_orchestrator import get_orchestrator' instead.",
    DeprecationWarning,
    stacklevel=2
)


class ServiceManager:
    """Singleton manager for all MAP2 services."""

    _instance: Optional['ServiceManager'] = None
    _initialized = False

    def __init__(self):
        """Initialize services (call get_instance() instead)."""
        self.audio_manager: Optional[RealAudioIOManager] = None
        self.plugin_loader: Optional[UnifiedPluginLoader] = None
        self.monitoring_enabled = False
        self.service_status = {}
        self.system_metrics = {}
        self.log_dir = Path(os.getcwd()) / 'logs'
        self.log_dir.mkdir(exist_ok=True)

    @classmethod
    def get_instance(cls) -> 'ServiceManager':
        """Get singleton instance of service manager."""
        if cls._instance is None:
            cls._instance = cls()
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        """Initialize all services."""
        if self._initialized:
            return

        logger.info("Initializing MAP2 service manager...")

        # Initialize audio I/O
        try:
            self.audio_manager = AudioIOFactory.create(
                sample_rate=48000,
                block_size=256,
                channels=2
            )
            logger.info("Audio I/O manager initialized")
        except Exception as e:
            logger.error(f"Failed to initialize audio manager: {e}")

        # Initialize plugin loader (unified implementation)
        try:
            self.plugin_loader = UnifiedPluginLoader.get_instance()
            logger.info("Plugin loader initialized (unified)")
        except Exception as e:
            logger.error(f"Failed to initialize plugin loader: {e}")
            self.plugin_loader = None

        self._initialized = True
        logger.info("Service manager initialization complete")
        
        # Start monitoring if enabled
        if self.monitoring_enabled:
            asyncio.create_task(self._monitoring_loop())
    
    async def _monitoring_loop(self):
        """Continuous system monitoring loop."""
        while self.monitoring_enabled:
            try:
                await self._collect_system_metrics()
                await asyncio.sleep(10)  # Monitor every 10 seconds
            except Exception as e:
                logger.error(f"Monitoring error: {e}")
                await asyncio.sleep(5)
    
    async def _collect_system_metrics(self):
        """Collect comprehensive system metrics."""
        try:
            # System metrics
            cpu_percent = psutil.cpu_percent(interval=0.1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            # Network metrics
            net_io = psutil.net_io_counters()
            
            # Process metrics for MAP2 services
            processes = {}
            for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'cpu_percent', 'memory_percent']):
                try:
                    if proc.info['cmdline'] and any('map2' in ' '.join(proc.info['cmdline']).lower() for term in ['uvicorn', 'python', 'node']):
                        processes[proc.info['pid']] = {
                            'name': proc.info['name'],
                            'cpu_percent': proc.info['cpu_percent'],
                            'memory_percent': proc.info['memory_percent'],
                            'cmdline': ' '.join(proc.info['cmdline'][:3])  # First 3 args
                        }
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            
            # Audio metrics
            audio_status = self.get_audio_status()
            
            # Service health checks
            try:
                import aiohttp
                services = {
                    'backend': await self._check_service_health('http://localhost:8080/api/health'),
                    'frontend': await self._check_service_health('http://localhost:3001'),
                    'audio_engine': await self._check_service_health('http://localhost:8080/api/engine/status')
                }
            except ImportError:
                services = {'backend': False, 'frontend': False, 'audio_engine': False}
            
            # Compile metrics
            self.system_metrics = {
                'timestamp': time.time(),
                'system': {
                    'cpu_percent': cpu_percent,
                    'memory_percent': memory.percent,
                    'memory_used_gb': memory.used / (1024**3),
                    'memory_total_gb': memory.total / (1024**3),
                    'disk_percent': disk.percent,
                    'disk_used_gb': disk.used / (1024**3),
                    'disk_total_gb': disk.total / (1024**3)
                },
                'network': {
                    'bytes_sent': net_io.bytes_sent,
                    'bytes_recv': net_io.bytes_recv,
                    'packets_sent': net_io.packets_sent,
                    'packets_recv': net_io.packets_recv
                },
                'processes': processes,
                'audio': audio_status,
                'services': services
            }
            
            # Save to file
            with open(self.log_dir / 'system_metrics.json', 'w') as f:
                json.dump(self.system_metrics, f, indent=2)
            
            logger.debug(f"System metrics collected: CPU={cpu_percent}%, Memory={memory.percent}%, Services={sum(services.values())}/3")
            
        except Exception as e:
            logger.error(f"Error collecting system metrics: {e}")
    
    async def _check_service_health(self, url: str) -> bool:
        """Check if a service is healthy."""
        try:
            import aiohttp
            connector = aiohttp.TCPConnector(limit=1, limit_per_host=1)
            timeout = aiohttp.ClientTimeout(total=2)
            async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
                async with session.get(url) as resp:
                    return resp.status == 200
        except Exception:
            return False
    
    def enable_monitoring(self):
        """Enable system monitoring."""
        self.monitoring_enabled = True
        logger.info("System monitoring enabled")
        # Start monitoring loop if not already running
        if self._initialized:
            asyncio.create_task(self._monitoring_loop())
    
    def disable_monitoring(self):
        """Disable system monitoring."""
        self.monitoring_enabled = False
        logger.info("System monitoring disabled")
    
    def get_system_metrics(self) -> Dict:
        """Get latest system metrics."""
        return self.system_metrics
    
    def get_service_status(self) -> Dict:
        """Get status of all monitored services.

        Integrates with ServiceOrchestrator when available for comprehensive status.
        """
        # Basic status from local managers
        status = {
            'audio_manager': self.audio_manager is not None and getattr(self.audio_manager, 'is_running', False),
            'plugin_loader': self.plugin_loader is not None,
            'monitoring': self.monitoring_enabled,
            'system_metrics_available': bool(self.system_metrics),
            'last_update': self.system_metrics.get('timestamp', 0)
        }

        # Integrate with ServiceOrchestrator if available
        try:
            from .service_orchestrator import get_orchestrator
            orchestrator = get_orchestrator()
            orchestrator_status = orchestrator.get_all_status()

            status['orchestrator'] = {
                'running': orchestrator_status.get('orchestrator', {}).get('running', False),
                'uptime_seconds': orchestrator_status.get('orchestrator', {}).get('uptime_seconds', 0),
                'services': orchestrator.get_summary()
            }
        except Exception:
            status['orchestrator'] = {'running': False, 'error': 'Orchestrator not available'}

        return status

    def get_audio_manager(self) -> Optional[RealAudioIOManager]:
        """Get audio I/O manager instance."""
        return self.audio_manager

    def get_plugin_loader(self) -> Optional[UnifiedPluginLoader]:
        """Get plugin loader instance."""
        return self.plugin_loader

    def get_audio_status(self) -> dict:
        """Get current audio engine status."""
        if not self.audio_manager:
            return {
                "running": False,
                "sample_rate": 48000,
                "buffer_size": 256,
                "latency_ms": 5.33,
                "cpu_load": 0.0,
                "error": "Audio manager not initialized"
            }

        # Get CPU load from RT monitor
        cpu_load = 0.0
        try:
            from app.services.rt_monitor import get_rt_monitor
            rt_monitor = get_rt_monitor()
            stats = rt_monitor.get_statistics()
            cpu_load = stats.get("cpu_usage_pct", 0.0)
        except Exception:
            pass

        return {
            "running": self.audio_manager.is_running,
            "sample_rate": self.audio_manager.sample_rate,
            "buffer_size": self.audio_manager.block_size,
            "latency_ms": (self.audio_manager.block_size / self.audio_manager.sample_rate) * 1000,
            "cpu_load": cpu_load,
            "total_blocks": getattr(self.audio_manager, 'total_blocks', 0),
            "underruns": getattr(self.audio_manager, 'total_underruns', 0),
            "overruns": getattr(self.audio_manager, 'total_overruns', 0),
        }
    
    async def start_all_services(self) -> Dict:
        """Start all MAP2 services with proper coordination."""
        logger.info("Starting all MAP2 services...")
        results = {}
        
        # Start audio first
        results['audio'] = await self.start_audio()
        
        # Enable monitoring
        self.enable_monitoring()
        results['monitoring'] = {'success': True, 'message': 'Monitoring enabled'}
        
        # Initialize plugin loader if not already done
        if not self.plugin_loader:
            try:
                self.plugin_loader = UnifiedPluginLoader()
                results['plugins'] = {'success': True, 'message': 'Plugin loader initialized'}
            except Exception as e:
                results['plugins'] = {'success': False, 'error': str(e)}
        else:
            results['plugins'] = {'success': True, 'message': 'Plugin loader already active'}
        
        logger.info(f"Service startup completed: {results}")
        return results
    
    async def stop_all_services(self) -> Dict:
        """Stop all MAP2 services gracefully."""
        logger.info("Stopping all MAP2 services...")
        results = {}
        
        # Disable monitoring
        self.disable_monitoring()
        results['monitoring'] = {'success': True, 'message': 'Monitoring disabled'}
        
        # Stop audio
        results['audio'] = await self.stop_audio()
        
        logger.info(f"Service shutdown completed: {results}")
        return results
    
    async def check_all_services(self) -> Dict:
        """Check status of all services (internal and external)."""
        internal = self.get_service_status()
        
        # Check external services
        external_status = {
            'backend': await self._check_service_health('http://localhost:8080/api/health'),
            'frontend': await self._check_service_health('http://localhost:3001'),
            'audio_engine': await self._check_service_health('http://localhost:8080/api/engine/status')
        }
        
        return {
            'internal_services': internal,
            'external_services': external_status,
            'overall_health': all(external_status.values()) and internal.get('audio_manager', False)
        }

    async def start_audio(self) -> dict:
        """Start audio engine."""
        if not self.audio_manager:
            return {"success": False, "error": "Audio manager not initialized"}

        try:
            success = await self.audio_manager.start_stream()
            return {
                "success": success,
                "running": self.audio_manager.is_running,
                "message": "Audio engine started" if success else "Failed to start audio"
            }
        except Exception as e:
            logger.error(f"Error starting audio: {e}")
            return {"success": False, "error": str(e)}

    async def stop_audio(self) -> dict:
        """Stop audio engine."""
        if not self.audio_manager:
            return {"success": False, "error": "Audio manager not initialized"}

        try:
            success = await self.audio_manager.stop_stream()
            return {
                "success": success,
                "running": self.audio_manager.is_running,
                "message": "Audio engine stopped" if success else "Failed to stop audio"
            }
        except Exception as e:
            logger.error(f"Error stopping audio: {e}")
            return {"success": False, "error": str(e)}


# Global singleton instance
_service_manager: Optional[ServiceManager] = None


def get_service_manager() -> ServiceManager:
    """Get global service manager instance."""
    global _service_manager
    if _service_manager is None:
        _service_manager = ServiceManager.get_instance()
    return _service_manager


# Convenience functions
def get_audio_status() -> dict:
    """Get audio status from global service manager."""
    return get_service_manager().get_audio_status()


async def start_audio() -> dict:
    """Start audio from global service manager."""
    return await get_service_manager().start_audio()


async def stop_audio() -> dict:
    """Stop audio from global service manager."""
    return await get_service_manager().stop_audio()


def get_plugin_loader() -> Optional[UnifiedPluginLoader]:
    """Get plugin loader from global service manager."""
    return get_service_manager().get_plugin_loader()
