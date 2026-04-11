from __future__ import annotations

from app.services.cluster.prometheus_exporter import MetricsManager
from app.services.plugin_loader_unified import UnifiedPluginLoader
from app.services.service_orchestrator import ServiceOrchestrator
from app.services.unified_services import UnifiedServices
from app.utils.singleton import Singleton


def test_remaining_backend_singleton_factories_use_shared_registry() -> None:
    for cls in (UnifiedServices, ServiceOrchestrator, UnifiedPluginLoader, MetricsManager):
        Singleton._instances.pop(cls, None)

    unified_services = UnifiedServices.get_instance()
    orchestrator = ServiceOrchestrator.get_instance()
    plugin_loader = UnifiedPluginLoader.get_instance()
    metrics = MetricsManager()

    assert Singleton._instances[UnifiedServices] is unified_services
    assert Singleton._instances[ServiceOrchestrator] is orchestrator
    assert Singleton._instances[UnifiedPluginLoader] is plugin_loader
    assert Singleton._instances[MetricsManager] is metrics
    assert MetricsManager() is metrics
