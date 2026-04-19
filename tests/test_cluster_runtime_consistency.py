from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from app.utils.time import utc_now
from app.services.cluster import config_distributor as config_distributor_module
from app.services.cluster.config_distributor import (
    ConfigDistributor,
    get_config_distributor,
    initialize_config_distributor,
)
from app.services.cluster.content_distributor import ContentDistributor, get_content_distributor
from app.services.cluster.config_manager import ConfigManager, get_config_manager
from app.services.cluster import disaster_recovery as disaster_recovery_module
from app.services.cluster.disaster_recovery import DisasterRecoveryManager, get_disaster_recovery
from app.services.cluster.enhanced_node_identity import EnhancedNodeIdentity, get_enhanced_node_identity
from app.services.cluster.failover_monitor import FailoverMonitor, get_failover_monitor
from app.services.cluster.fedora_package_manager import FedoraDNFManager, PackageVersionSnapshot, get_dnf_manager
from app.services.cluster.hardware_inventory import ClusterHardwareInventory, NodeHardware, get_cluster_hardware_inventory
from app.services.cluster.health_aggregator import HealthAggregator, NodeMetrics, get_health_aggregator
from app.services.cluster.heartbeat_monitor import HeartbeatMonitor, get_heartbeat_monitor
from app.services.cluster.mdns_discovery_enhanced import EnhancedMDNSDiscovery, get_enhanced_mdns_discovery
from app.services.cluster.network_topology import NetworkTopologyMonitor, NetworkLink, get_topology_monitor
from app.services.cluster.node_lifecycle import (
    ClusterNodeLifecycleManager,
    DiagnosticsReport,
    DiagnosticsCheck,
    LifecycleTransition,
    NodeLifecycleEvent,
    NodeLifecycleManager,
    NodeState,
    get_node_lifecycle_manager,
)
from app.services.cluster.plugin_inventory_sync import ClusterPluginInventory, get_cluster_plugin_inventory
from app.services.cluster.prometheus_exporter import MetricsManager, get_prometheus_exporter
from app.services.cluster.post_update_health import HealthCheckPhase, HealthCheckResult
from app.services.cluster.map2_git_updater import MAP2GitUpdater, get_git_updater
from app.services.cluster.deployment_manager import DeploymentManager, get_deployment_manager
from app.services.cluster.distributed_event_bus import DistributedEventBus, get_event_bus as get_distributed_event_bus
from app.services.cluster.hybrid_update_manager import HybridUpdateConfig, HybridUpdateManager, get_hybrid_update_manager
from app.services.cluster.management_orchestrator import ManagementOrchestrator
from app.services.cluster.onboarding_portal import NodeOnboardingPortal, OnboardingStep
from app.services.cluster.registry import ClusterRegistry, get_cluster_registry
from app.services.cluster.raft_consensus import RaftConsensus, get_raft_consensus, initialize_raft_consensus
from app.services.cluster.state_replicator_impl import LogEntry as LegacyReplicatedLogEntry, StateReplicator as LegacyStateReplicator
from app.services.cluster.state_replicator import StateReplicator, get_state_replicator
from app.services.cluster.update_orchestrator import UpdateScheduler, UpdateReport
from app.services.cluster.audio_path_discovery import AudioPathService, get_audio_path_service
from app.services.cluster.adoption_bootstrap import (
    AdoptionBootstrapService,
    get_adoption_bootstrap_service,
    set_adoption_bootstrap_service,
)
from app.services.cluster.config_pusher import ConfigSync, ConfigVersion, get_config_sync
from app.services.cluster.version_manifest import VersionManifest, get_version_manifest, set_version_manifest
from app.services.cluster.update_validator import ValidationLevel, ValidationReport, ValidationResult
from app.services.cluster.ztp import ZTPBootstrap, get_ztp_bootstrap
from app.services.node_discovery_service import (
    NodeDiscoveryService,
    _parse_datetime,
    get_node_discovery_service,
)


def test_node_discovery_singleton_and_datetime_fallback_are_utc_aware():
    NodeDiscoveryService.reset_instance()
    try:
        first = NodeDiscoveryService.get_instance()
        second = get_node_discovery_service()

        assert first is second
        assert _parse_datetime(None).tzinfo == timezone.utc
    finally:
        NodeDiscoveryService.reset_instance()


def test_disaster_recovery_getter_uses_singleton_with_temp_storage(monkeypatch, tmp_path):
    original_init = DisasterRecoveryManager.__init__

    def _init_with_temp_dir(self, backup_dir="/var/lib/map2/backups", retention_days=30):
        original_init(self, backup_dir=str(tmp_path), retention_days=retention_days)

    monkeypatch.setattr(disaster_recovery_module.DisasterRecoveryManager, "__init__", _init_with_temp_dir)
    DisasterRecoveryManager.reset_instance()
    try:
        first = get_disaster_recovery()
        second = get_disaster_recovery()

        assert first is second
        assert first.backup_dir == tmp_path
    finally:
        DisasterRecoveryManager.reset_instance()
        monkeypatch.setattr(disaster_recovery_module.DisasterRecoveryManager, "__init__", original_init)


def test_update_report_and_schedule_emit_utc_aware_timestamps():
    report = UpdateReport()
    assert report.start_time.tzinfo == timezone.utc

    class _FakeRegistry:
        def get_all_nodes(self):
            return [{"node_id": "a"}, {"node_id": "b"}]

        def get_nodes_by_role(self, role: str):
            if role == "AUDIO-NODE":
                return [{"node_id": "a"}]
            if role == "MANAGEMENT-NODE":
                return [{"node_id": "b"}]
            return []

    scheduler = UpdateScheduler.__new__(UpdateScheduler)
    scheduler.registry = _FakeRegistry()
    scheduler.nodes_per_hour = 2
    scheduler.test_node_id = None

    schedule = UpdateScheduler.get_update_schedule(scheduler)
    estimated_completion = datetime.fromisoformat(schedule["estimated_completion"])

    assert estimated_completion.tzinfo == timezone.utc


def test_cluster_config_manager_singleton_and_version_timestamps_are_utc_aware(monkeypatch, tmp_path):
    original_init = ConfigManager.__init__

    def _init_with_temp_history(self):
        self._history_path = tmp_path / "config-manager-history.json"
        self._history_path.parent.mkdir(parents=True, exist_ok=True)
        self._config = {
            "cluster_name": "map2-cluster",
            "management_ip": None,
            "network_interface": None,
            "api_port": 8080,
            "enable_mdns": True,
            "enable_tls": False,
        }
        self._history = self._load_history()
        if self._history:
            latest = self._history[-1]
            self._config = dict(latest.get("config", self._config))
        else:
            self._record_version("Initial configuration")

    monkeypatch.setattr(ConfigManager, "__init__", _init_with_temp_history)
    ConfigManager.reset_instance()
    try:
        first = get_config_manager()
        second = get_config_manager()

        assert first is second
        assert first._history
        assert datetime.fromisoformat(first._history[-1]["timestamp"]).tzinfo == timezone.utc
    finally:
        ConfigManager.reset_instance()
        monkeypatch.setattr(ConfigManager, "__init__", original_init)


def test_config_distributor_requires_initialization_and_tracks_utc_sync_time(monkeypatch, tmp_path):
    ConfigDistributor.reset_instance()
    try:
        try:
            get_config_distributor()
        except RuntimeError as exc:
            assert "not initialized" in str(exc)
        else:
            raise AssertionError("Expected get_config_distributor() to require initialization")

        distributor = initialize_config_distributor("https://example.invalid/repo.git")
        distributor.local_path = tmp_path
        distributor.current_commit = "old"
        distributor.is_running = True

        async def _fake_git_pull():
            return None

        commits = iter(["new", "new"])

        async def _fake_get_current_commit():
            return next(commits)

        async def _fake_validate_config():
            return True

        async def _fake_distribute_config():
            distributor.is_running = False
            return True

        monkeypatch.setattr(distributor, "_git_pull", _fake_git_pull)
        monkeypatch.setattr(distributor, "_get_current_commit", _fake_get_current_commit)
        monkeypatch.setattr(distributor, "_validate_config", _fake_validate_config)
        monkeypatch.setattr(distributor, "_distribute_config", _fake_distribute_config)
        monkeypatch.setattr(config_distributor_module.asyncio, "sleep", lambda _seconds: _fake_git_pull())

        import asyncio

        asyncio.run(distributor._sync_loop())

        assert get_config_distributor() is distributor
        assert datetime.fromisoformat(distributor.last_sync).tzinfo == timezone.utc
    finally:
        ConfigDistributor.reset_instance()


def test_state_replicator_singleton_and_failover_payload_timestamp_are_utc_aware():
    StateReplicator.reset_instance()
    try:
        first = get_state_replicator(standby_host="standby.local", primary_host="primary.local")
        second = get_state_replicator()

        assert first is second
        assert first.last_primary_heartbeat.tzinfo == timezone.utc

        published_payloads: list[dict] = []

        class _FakeBus:
            async def emit(self, event):
                published_payloads.append(event.context)

        import sys
        import types
        import asyncio

        fake_platform_event_bus_module = types.SimpleNamespace(
            get_platform_event_bus=lambda: _FakeBus(),
        )
        sys.modules["app.services.platform_event.bus"] = fake_platform_event_bus_module
        try:
            asyncio.run(first._publish_failover_event())
        finally:
            sys.modules.pop("app.services.platform_event.bus", None)

        assert published_payloads
        assert datetime.fromisoformat(published_payloads[0]["timestamp"]).tzinfo == timezone.utc
    finally:
        StateReplicator.reset_instance()


def test_enhanced_node_identity_singleton_and_config_timestamps_are_utc_aware(monkeypatch):
    EnhancedNodeIdentity.reset_instance()
    original_loader = EnhancedNodeIdentity._load_or_create_config

    def _fake_loader(self):
        self.config = type(
            "_Config",
            (),
            {
                "node_id": "node-1",
                "role": "AUDIO-NODE",
                "capabilities": object(),
                "updated_at": None,
                "to_dict": lambda _self: {},
            },
        )()

    monkeypatch.setattr(EnhancedNodeIdentity, "_load_or_create_config", _fake_loader)
    try:
        first = get_enhanced_node_identity()
        second = get_enhanced_node_identity()

        assert first is second

        first.promote_to_management()
        assert datetime.fromisoformat(first.config.updated_at).tzinfo == timezone.utc
    finally:
        EnhancedNodeIdentity.reset_instance()
        monkeypatch.setattr(EnhancedNodeIdentity, "_load_or_create_config", original_loader)


def test_content_distributor_singleton_getter_is_stable(monkeypatch):
    ContentDistributor.reset_instance()
    original_init = ContentDistributor.__init__

    def _fake_init(self, **_kwargs):
        self._client = None
        self._discovery = None
        self._local_node_id = "local-node"
        self._backend_port = 8080
        self._local_base_url = "http://127.0.0.1:8080"

    monkeypatch.setattr(ContentDistributor, "__init__", _fake_init)
    try:
        first = get_content_distributor()
        second = get_content_distributor()
        assert first is second
    finally:
        ContentDistributor.reset_instance()
        monkeypatch.setattr(ContentDistributor, "__init__", original_init)


def test_clone_reset_resets_enhanced_identity_singleton():
    from app.services.cluster.clone_reset import _reset_identity_singletons

    EnhancedNodeIdentity.reset_instance()
    try:
        get_enhanced_node_identity()
        assert EnhancedNodeIdentity.has_instance() is True

        _reset_identity_singletons()

        assert EnhancedNodeIdentity.has_instance() is False
    finally:
        EnhancedNodeIdentity.reset_instance()


def test_failover_monitor_singleton_getter_is_stable(monkeypatch):
    FailoverMonitor.reset_instance()
    original_init = FailoverMonitor.__init__

    def _fake_init(self):
        self.registry = object()
        self.heartbeat_monitor = object()
        self.event_bus = object()
        self.is_running = False

    monkeypatch.setattr(FailoverMonitor, "__init__", _fake_init)
    try:
        first = get_failover_monitor()
        second = get_failover_monitor()
        assert first is second
    finally:
        FailoverMonitor.reset_instance()
        monkeypatch.setattr(FailoverMonitor, "__init__", original_init)


def test_fedora_dnf_manager_singleton_and_snapshot_timestamps_are_utc_aware():
    FedoraDNFManager.reset_instance()
    try:
        first = get_dnf_manager()
        second = get_dnf_manager()

        assert first is second
        assert PackageVersionSnapshot(node_id="node-a").timestamp.tzinfo == timezone.utc
        assert datetime.fromisoformat(first.get_update_info()["timestamp"]).tzinfo == timezone.utc
    finally:
        FedoraDNFManager.reset_instance()


def test_audio_path_service_singleton_and_payload_timestamp_are_utc_aware(monkeypatch):
    AudioPathService.reset_instance()
    original_node_id = AudioPathService._get_node_id
    original_hostname = AudioPathService._get_hostname
    original_pipewire = AudioPathService._get_pipewire_info
    original_juce = AudioPathService._get_juce_info
    original_alsa = AudioPathService._get_alsa_info
    original_services = AudioPathService._build_service_list
    original_health = AudioPathService._compute_overall_health
    original_latency = AudioPathService._compute_latency_breakdown
    original_dependencies = AudioPathService._build_dependency_graph
    original_alerts = AudioPathService._collect_alerts

    monkeypatch.setattr(AudioPathService, "_get_node_id", lambda self: "node-a")
    monkeypatch.setattr(AudioPathService, "_get_hostname", lambda self: "alpha")
    monkeypatch.setattr(AudioPathService, "_get_pipewire_info", lambda self: __import__("asyncio").sleep(0, result=None))
    monkeypatch.setattr(AudioPathService, "_get_juce_info", lambda self: __import__("asyncio").sleep(0, result=None))
    monkeypatch.setattr(AudioPathService, "_get_alsa_info", lambda self: __import__("asyncio").sleep(0, result=None))
    monkeypatch.setattr(AudioPathService, "_build_service_list", lambda self, *_args: [])
    monkeypatch.setattr(AudioPathService, "_compute_overall_health", lambda self, _services: __import__("app.services.cluster.audio_path_discovery", fromlist=["ServiceHealth"]).ServiceHealth.HEALTHY)
    monkeypatch.setattr(AudioPathService, "_compute_latency_breakdown", lambda self, *_args: __import__("app.services.cluster.audio_path_discovery", fromlist=["AudioPathLatencyBreakdown"]).AudioPathLatencyBreakdown())
    monkeypatch.setattr(AudioPathService, "_build_dependency_graph", lambda self, _services: {})
    monkeypatch.setattr(AudioPathService, "_collect_alerts", lambda self, *_args: [])

    import asyncio

    try:
        first = get_audio_path_service()
        second = get_audio_path_service()
        assert first is second

        payload = asyncio.run(first.get_node_audio_path())
        assert datetime.fromisoformat(payload.timestamp).tzinfo == timezone.utc
    finally:
        AudioPathService.reset_instance()
        monkeypatch.setattr(AudioPathService, "_get_node_id", original_node_id)
        monkeypatch.setattr(AudioPathService, "_get_hostname", original_hostname)
        monkeypatch.setattr(AudioPathService, "_get_pipewire_info", original_pipewire)
        monkeypatch.setattr(AudioPathService, "_get_juce_info", original_juce)
        monkeypatch.setattr(AudioPathService, "_get_alsa_info", original_alsa)
        monkeypatch.setattr(AudioPathService, "_build_service_list", original_services)
        monkeypatch.setattr(AudioPathService, "_compute_overall_health", original_health)
        monkeypatch.setattr(AudioPathService, "_compute_latency_breakdown", original_latency)
        monkeypatch.setattr(AudioPathService, "_build_dependency_graph", original_dependencies)
        monkeypatch.setattr(AudioPathService, "_collect_alerts", original_alerts)


def test_network_topology_monitor_singleton_and_link_timestamps_are_utc_aware():
    NetworkTopologyMonitor.reset_instance()
    try:
        first = get_topology_monitor()
        second = get_topology_monitor()
        assert first is second
        assert NetworkLink(
            source_node="a",
            target_node="b",
            latency_ms=0.1,
            packet_loss_percent=0.0,
            jitter_ms=0.0,
            last_updated=utc_now(),
            status="healthy",
        ).last_updated.tzinfo == timezone.utc
    finally:
        NetworkTopologyMonitor.reset_instance()


def test_cluster_node_lifecycle_manager_singleton_and_transition_timestamps_are_utc_aware(monkeypatch):
    ClusterNodeLifecycleManager.reset_instance()

    class _FakeRegistry:
        def get_node(self, node_id: str):
            return {"id": node_id}

    original_init = ClusterNodeLifecycleManager.__init__
    monkeypatch.setattr(ClusterNodeLifecycleManager, "__init__", lambda self: setattr(self, "registry", _FakeRegistry()))

    try:
        first = get_node_lifecycle_manager()
        second = get_node_lifecycle_manager()
        assert first is second

        transition = LifecycleTransition(
            from_state=NodeState.DISCOVERED,
            to_state=NodeState.ONLINE,
            event=NodeLifecycleEvent.JOIN_COMPLETE,
            timestamp=utc_now(),
            message="joined",
            details={},
        )
        assert transition.timestamp.tzinfo == timezone.utc

        report = DiagnosticsReport(
            node_id="node-a",
            timestamp=utc_now(),
            overall_health=100,
            checks=[DiagnosticsCheck(name="ok", status="passed", message="ok", severity=0)],
            services_status={"map2-audio": "active"},
            recommendations=["none"],
        )
        assert report.timestamp.tzinfo == timezone.utc
    finally:
        ClusterNodeLifecycleManager.reset_instance()
        monkeypatch.setattr(ClusterNodeLifecycleManager, "__init__", original_init)


def test_heartbeat_monitor_singleton_getter_is_stable(monkeypatch):
    HeartbeatMonitor.reset_instance()
    original_init = HeartbeatMonitor.__init__

    def _fake_init(self):
        self.registry = object()
        self.event_bus = object()
        self.node_health = {}
        self.is_running = False
        self._monitor_task = None
        self._client = None
        self._local_node_id = "local-node"
        self.poll_interval_seconds = 1.0
        self.failure_threshold = 3
        self.timeout_seconds = 2.0

    monkeypatch.setattr(HeartbeatMonitor, "__init__", _fake_init)
    try:
        first = get_heartbeat_monitor()
        second = get_heartbeat_monitor()
        assert first is second
    finally:
        HeartbeatMonitor.reset_instance()
        monkeypatch.setattr(HeartbeatMonitor, "__init__", original_init)


def test_health_aggregator_singleton_and_metrics_timestamps_are_utc_aware(monkeypatch):
    HealthAggregator.reset_instance()
    original_init = HealthAggregator.__init__

    def _fake_init(self):
        self.logger = None
        self.registry = object()
        self.metrics_cache = {}
        self.running = False

    monkeypatch.setattr(HealthAggregator, "__init__", _fake_init)
    try:
        first = get_health_aggregator()
        second = get_health_aggregator()
        assert first is second
        assert NodeMetrics(node_id="node-a").timestamp.tzinfo == timezone.utc
    finally:
        HealthAggregator.reset_instance()
        monkeypatch.setattr(HealthAggregator, "__init__", original_init)


def test_cluster_hardware_inventory_singleton_getter_is_stable(monkeypatch):
    ClusterHardwareInventory.reset_instance()
    original_init = ClusterHardwareInventory.__init__

    def _fake_init(self, **_kwargs):
        self._base_url = "http://127.0.0.1:8080"
        self._client = None
        self._registry = object()
        self._discovery = object()
        self._local_node_id = "local-node"
        self._local_hostname = "local"
        self._ttl = 60.0
        self._lock = None
        self._cache = {}
        self._cached_at = 0.0
        self._event_bus = object()

    monkeypatch.setattr(ClusterHardwareInventory, "__init__", _fake_init)
    try:
        first = get_cluster_hardware_inventory()
        second = get_cluster_hardware_inventory()
        assert first is second
        assert datetime.fromisoformat(NodeHardware(node_id="a", hostname="h").last_updated).tzinfo == timezone.utc
    finally:
        ClusterHardwareInventory.reset_instance()
        monkeypatch.setattr(ClusterHardwareInventory, "__init__", original_init)


def test_cluster_registry_singleton_getter_is_stable(monkeypatch, tmp_path):
    ClusterRegistry.reset_instance()
    original_init = ClusterRegistry.__init__

    def _fake_init(self, db_path=None):
        self.db_path = db_path or (tmp_path / "cluster.db")
        self.logger = None

    monkeypatch.setattr(ClusterRegistry, "__init__", _fake_init)
    try:
        first = get_cluster_registry()
        second = get_cluster_registry()
        assert first is second
    finally:
        ClusterRegistry.reset_instance()
        monkeypatch.setattr(ClusterRegistry, "__init__", original_init)


def test_version_manifest_singleton_override_and_reset(monkeypatch, tmp_path):
    VersionManifest.reset_instance()
    original_init = VersionManifest.__init__

    def _fake_init(self, manifest_path="/tmp/version_manifest.json"):
        self.manifest_path = tmp_path / "version_manifest.json"
        self.history_dir = tmp_path / "history"
        self.registry = object()

    monkeypatch.setattr(VersionManifest, "__init__", _fake_init)
    try:
        first = get_version_manifest()
        second = get_version_manifest()
        assert first is second

        override = VersionManifest.__new__(VersionManifest)
        set_version_manifest(override)
        assert get_version_manifest() is override

        set_version_manifest(None)
        recreated = get_version_manifest()
        assert recreated is not override
    finally:
        VersionManifest.reset_instance()
        monkeypatch.setattr(VersionManifest, "__init__", original_init)


def test_deployment_manager_singleton_getter_is_stable():
    DeploymentManager.reset_instance()
    try:
        first = get_deployment_manager()
        second = get_deployment_manager()
        assert first is second
    finally:
        DeploymentManager.reset_instance()


def test_cluster_plugin_inventory_singleton_getter_is_stable(monkeypatch):
    ClusterPluginInventory.reset_instance()
    original_init = ClusterPluginInventory.__init__

    def _fake_init(self):
        self._cache = []
        self._by_node = {}
        self._cached_at = 0.0
        self._ttl = 300.0
        self._lock = None
        self._client = None

    monkeypatch.setattr(ClusterPluginInventory, "__init__", _fake_init)
    try:
        first = get_cluster_plugin_inventory()
        second = get_cluster_plugin_inventory()
        assert first is second
    finally:
        ClusterPluginInventory.reset_instance()
        monkeypatch.setattr(ClusterPluginInventory, "__init__", original_init)


def test_enhanced_mdns_discovery_singleton_getter_is_stable():
    EnhancedMDNSDiscovery.reset_instance()
    try:
        first = get_enhanced_mdns_discovery()
        second = get_enhanced_mdns_discovery()
        assert first is second
    finally:
        EnhancedMDNSDiscovery.reset_instance()


def test_prometheus_exporter_singleton_getter_is_stable(monkeypatch):
    MetricsManager.reset_instance()
    original_init = MetricsManager.__init__

    def _fake_init(self):
        self.exporter = object()

    monkeypatch.setattr(MetricsManager, "__init__", _fake_init)
    try:
        first = get_prometheus_exporter()
        second = get_prometheus_exporter()
        assert first is second
    finally:
        MetricsManager.reset_instance()
        monkeypatch.setattr(MetricsManager, "__init__", original_init)


def test_update_validation_models_use_utc_timestamps():
    result = ValidationResult(
        name="check",
        level=ValidationLevel.INFO,
        passed=True,
        message="ok",
    )
    assert datetime.fromisoformat(result.timestamp).tzinfo == timezone.utc

    report = ValidationReport(
        check_type="post-update",
        timestamp=utc_now().isoformat(),
        total_checks=1,
        passed_checks=1,
        failed_critical=0,
        failed_warning=0,
        results=[result],
        can_proceed=True,
    )
    assert datetime.fromisoformat(report.timestamp).tzinfo == timezone.utc

    health_result = HealthCheckResult(
        phase=HealthCheckPhase.IMMEDIATE,
        timestamp=utc_now().isoformat(),
        node_id="node-a",
        passed=True,
        health_score=100.0,
        validation_report=report,
        recommendations=[],
        should_rollback=False,
    )
    assert datetime.fromisoformat(health_result.timestamp).tzinfo == timezone.utc


def test_git_updater_singleton_getter_is_stable(monkeypatch, tmp_path):
    MAP2GitUpdater.reset_instance()
    original_init = MAP2GitUpdater.__init__

    def _fake_init(self, app_path=str(tmp_path)):
        self.app_path = Path(app_path)
        self.git_url = "https://example.invalid/repo.git"
        self.timeout = 300

    monkeypatch.setattr(MAP2GitUpdater, "__init__", _fake_init)
    try:
        first = get_git_updater(str(tmp_path / "one"))
        second = get_git_updater(str(tmp_path / "two"))
        assert first is second
        assert first.app_path == tmp_path / "one"
    finally:
        MAP2GitUpdater.reset_instance()
        monkeypatch.setattr(MAP2GitUpdater, "__init__", original_init)


def test_ztp_bootstrap_singleton_and_utc_registration_metadata(monkeypatch, tmp_path):
    ZTPBootstrap.reset_instance()
    original_init = ZTPBootstrap.__init__

    def _fake_init(self):
        self.node_identity = None
        self.config_file = tmp_path / "node.conf"
        self.marker_file = tmp_path / ".ztp-complete"
        self.logger = type(
            "_Logger",
            (),
            {
                "info": lambda *args, **kwargs: None,
                "warning": lambda *args, **kwargs: None,
                "error": lambda *args, **kwargs: None,
                "debug": lambda *args, **kwargs: None,
            },
        )()

    monkeypatch.setattr(ZTPBootstrap, "__init__", _fake_init)
    try:
        first = get_ztp_bootstrap()
        second = get_ztp_bootstrap()
        assert first is second

        class _FakeCaps:
            cpu_cores = 8
            total_memory_gb = 16
            audio_interfaces = ["hw:0"]
            midi_input_ports = ["in"]
            midi_output_ports = ["out"]
            storage_gb = 512
            cpu_model = "cpu"
            kernel_version = "kernel"
            has_gpuapu = False

        class _FakeIdentity:
            def __init__(self):
                self.config = type("_Cfg", (), {"hostname": "alpha"})()

            def get_node_id(self):
                return "node-a"

            def get_role(self):
                return "MANAGEMENT-NODE"

            def get_capabilities(self):
                return _FakeCaps()

        first.node_identity = _FakeIdentity()
        recorded = {}

        class _FakeRegistry:
            def add_or_update_node(self, **kwargs):
                recorded.update(kwargs)

        class _FakeCA:
            def has_root_ca(self):
                return True

            def generate_root_ca(self):
                return None

            def issue_node_certificate(self, **_kwargs):
                return None

        class _FakeMdns:
            def add_discovered_node(self, **_kwargs):
                return None

        monkeypatch.setattr("app.services.cluster.registry.get_cluster_registry", lambda: _FakeRegistry())
        monkeypatch.setattr("app.services.cluster.certificate_authority.get_cluster_ca", lambda: _FakeCA())
        monkeypatch.setattr(
            "app.services.cluster.mdns_discovery_enhanced.get_enhanced_mdns_discovery",
            lambda: _FakeMdns(),
        )
        monkeypatch.setattr(
            "app.services.cluster.prometheus_exporter.get_prometheus_exporter",
            lambda: None,
        )

        import asyncio

        assert asyncio.run(first.register_with_cluster("10.0.0.10")) is True
        assert datetime.fromisoformat(recorded["metadata"]["ztp_registered_at"]).tzinfo == timezone.utc
    finally:
        ZTPBootstrap.reset_instance()
        monkeypatch.setattr(ZTPBootstrap, "__init__", original_init)


def test_config_sync_singleton_and_history_fallback_timestamp_are_utc_aware(monkeypatch, tmp_path):
    ConfigSync.reset_instance()
    original_init = ConfigSync.__init__

    def _fake_init(self, config_repo_path="/var/lib/map2/config-repo"):
        self.repo_path = Path(config_repo_path)
        self.logger = None

    monkeypatch.setattr(ConfigSync, "__init__", _fake_init)
    try:
        first = get_config_sync()
        second = get_config_sync()
        assert first is second

        def _fake_run_git(args, check=True):
            joined = " ".join(args)
            if joined.startswith("log "):
                return type("_Result", (), {"returncode": 0, "stdout": "abc|not-a-date|MAP2|initial", "stderr": ""})()
            if joined.startswith("show "):
                return type("_Result", (), {"returncode": 0, "stdout": "", "stderr": ""})()
            raise AssertionError(f"Unexpected git args: {args}")

        monkeypatch.setattr(first, "_run_git", _fake_run_git)

        history = first.get_config_history(limit=1)
        assert len(history) == 1
        assert isinstance(history[0], ConfigVersion)
        assert history[0].timestamp.tzinfo == timezone.utc
    finally:
        ConfigSync.reset_instance()
        monkeypatch.setattr(ConfigSync, "__init__", original_init)


def test_adoption_bootstrap_override_uses_shared_singleton_registry(tmp_path):
    AdoptionBootstrapService.reset_instance()
    try:
        first = get_adoption_bootstrap_service()
        second = get_adoption_bootstrap_service()
        assert first is second

        override = AdoptionBootstrapService(secret_path=tmp_path / "bootstrap-secret")
        set_adoption_bootstrap_service(override)
        assert get_adoption_bootstrap_service() is override

        set_adoption_bootstrap_service(None)
        recreated = get_adoption_bootstrap_service()
        assert recreated is not override
    finally:
        AdoptionBootstrapService.reset_instance()


def test_distributed_event_bus_singleton_getter_is_stable(monkeypatch, tmp_path):
    DistributedEventBus.reset_instance()
    original_init = DistributedEventBus.__init__

    def _fake_init(self, db_path="/var/lib/map2/cluster-events.db"):
        self.db_path = tmp_path / "cluster-events.db"
        self.logger = None
        self.event_queue = None
        self._subscribers = {}
        self._subscribers_lock = None

    monkeypatch.setattr(DistributedEventBus, "__init__", _fake_init)
    try:
        first = get_distributed_event_bus()
        second = get_distributed_event_bus()
        assert first is second
    finally:
        DistributedEventBus.reset_instance()
        monkeypatch.setattr(DistributedEventBus, "__init__", original_init)


def test_hybrid_update_manager_preserves_first_config_under_shared_singleton(monkeypatch, tmp_path):
    HybridUpdateManager.reset_instance()
    original_init = HybridUpdateManager.__init__

    def _fake_init(self, config=None):
        self.config = config or HybridUpdateConfig()
        self.git_updater = object()
        self.rpm_updater = object()
        self.mode = "git"
        self.application_progress = None

    monkeypatch.setattr(HybridUpdateManager, "__init__", _fake_init)
    try:
        first = get_hybrid_update_manager(HybridUpdateConfig(app_path=str(tmp_path / "one")))
        second = get_hybrid_update_manager(HybridUpdateConfig(app_path=str(tmp_path / "two")))

        assert first is second
        assert first.config.app_path == str(tmp_path / "one")
    finally:
        HybridUpdateManager.reset_instance()
        monkeypatch.setattr(HybridUpdateManager, "__init__", original_init)


def test_raft_consensus_initialize_and_getter_share_registry(tmp_path):
    RaftConsensus.reset_instance()
    original_default_state_path = RaftConsensus._default_state_path

    try:
        try:
            get_raft_consensus()
        except RuntimeError as exc:
            assert "not initialized" in str(exc)
        else:
            raise AssertionError("Expected get_raft_consensus() to require initialization")

        RaftConsensus._default_state_path = staticmethod(lambda node_id: tmp_path / f"{node_id}.sqlite3")
        first = initialize_raft_consensus("node-a", {"node-a": "http://node-a"})
        second = get_raft_consensus()

        assert first is second
        assert first._state_path == tmp_path / "node-a.sqlite3"
    finally:
        RaftConsensus._default_state_path = original_default_state_path
        RaftConsensus.reset_instance()


def test_clone_reset_resets_ztp_singleton(monkeypatch, tmp_path):
    from app.services.cluster.clone_reset import _reset_identity_singletons

    ZTPBootstrap.reset_instance()
    original_init = ZTPBootstrap.__init__

    def _fake_init(self):
        self.node_identity = None
        self.config_file = tmp_path / "node.conf"
        self.marker_file = tmp_path / ".ztp-complete"
        self.logger = type(
            "_Logger",
            (),
            {
                "info": lambda *args, **kwargs: None,
                "warning": lambda *args, **kwargs: None,
                "error": lambda *args, **kwargs: None,
                "debug": lambda *args, **kwargs: None,
            },
        )()

    monkeypatch.setattr(ZTPBootstrap, "__init__", _fake_init)
    try:
        get_ztp_bootstrap()
        assert ZTPBootstrap.has_instance() is True

        _reset_identity_singletons()

        assert ZTPBootstrap.has_instance() is False
    finally:
        ZTPBootstrap.reset_instance()
        monkeypatch.setattr(ZTPBootstrap, "__init__", original_init)


def test_management_orchestrator_records_utc_aware_run_timestamps():
    orchestrator = ManagementOrchestrator()

    import asyncio

    async def _noop():
        return None

    asyncio.run(orchestrator._run_if_due("health_checks", utc_now(), _noop))

    assert orchestrator._last_run["health_checks"].tzinfo == timezone.utc


def test_onboarding_portal_session_timestamps_are_utc_aware():
    portal = NodeOnboardingPortal()
    session = portal.create_session("node-a", "audio")
    created = datetime.fromisoformat(session["created_at"])

    assert created.tzinfo == timezone.utc

    import asyncio

    success, _message = asyncio.run(
        portal.submit_step_data(session["session_id"], OnboardingStep.WELCOME, {"acknowledged": True})
    )

    assert success is True
    updated = datetime.fromisoformat(portal.get_session(session["session_id"]).updated_at)
    assert updated.tzinfo == timezone.utc


def test_legacy_state_replicator_impl_uses_utc_aware_timestamps():
    replicator = LegacyStateReplicator(node_id="node-a", registry=object())

    assert replicator.last_heartbeat.tzinfo == timezone.utc
    assert datetime.fromisoformat(LegacyReplicatedLogEntry(term=1, index=1, command="set", data={}).timestamp).tzinfo == timezone.utc
