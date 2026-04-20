import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.models.node import NodeHealth, NodeServices
from app.routes import cluster_health
from app.services import system_health_summary
from app.services.audio_health_monitor import AudioHealthMonitor, get_audio_health_monitor
from app.services.audio_io import AudioHealthMetrics, AudioThreadState, SignalState
from app.services.cluster.heartbeat_monitor import NodeHealthStatus
from app.services.deployment_health import CheckStatus, DeploymentModeHealthChecker, HealthCheckResult, get_deployment_health_checker
from app.services.deployment_remediation import DeploymentRemediationService, get_remediation_service
from app.services.pipewire_recovery import PipeWireRecoveryService, get_pipewire_recovery_service


class _FakeMetricsCollector:
    def __init__(self) -> None:
        self.cpu_history = [{"timestamp": "2026-03-25T00:00:00Z", "value": 22.0}]
        self.buffer_underruns = 2
        self.max_history = 180

    def get_alerts(self):
        return [{"message": "xrun"}]


class _FakeAudioManager:
    def __init__(self) -> None:
        self._metrics = AudioHealthMetrics(
            thread_state=AudioThreadState.WARNING,
            signal_state=SignalState.PRESENT,
            total_blocks=2048,
            total_xruns=6,
            xrun_rate_per_minute=2.5,
            input_level_db=-14.2,
            buffer_health_pct=92.0,
            is_auto_muted=False,
        )
        self._stats = {
            "is_running": True,
            "sample_rate": 48000,
            "block_size": 128,
            "latency_ms": 5.33,
            "watchdog_enabled": True,
            "rt_priority_set": True,
        }

    def register_xrun_callback(self, callback):
        self._xrun_callback = callback

    def register_stall_callback(self, callback):
        self._stall_callback = callback

    def get_health_metrics(self):
        return self._metrics

    def get_stats(self):
        return dict(self._stats)


class _FakeHealthMonitor:
    def __init__(self) -> None:
        self.alert_rules = []
        self.registered = {}

    def register_health_check(self, service_name, check_func):
        self.registered[service_name] = check_func

    def get_system_health_summary(self):
        return {
            "overall_status": "healthy",
            "service_count": 4,
            "active_alerts_count": 1,
            "services": {"audio": {"status": "healthy"}},
        }


class _FakeOrchestrator:
    def get_all_status(self):
        return {
            "services": {
                "juce_engine": {"state": "running"},
                "plugin_loader": {"state": "running", "health": {"metrics": {"plugin_count": 9}}},
                "pipewire": {"state": "stopped", "is_optional": True},
            }
        }

    def get_service_status(self, name: str):
        return self.get_all_status()["services"].get(name)


async def _fake_get_metrics_collector():
    return _FakeMetricsCollector()


def _patch_summary_psutil(monkeypatch):
    class _Process:
        def memory_info(self):
            return SimpleNamespace(rss=300 * 1024 * 1024)

    monkeypatch.setattr(system_health_summary.os, "getpid", lambda: 4321)
    monkeypatch.setattr(system_health_summary.psutil, "Process", lambda pid: _Process())
    monkeypatch.setattr(system_health_summary.psutil, "virtual_memory", lambda: SimpleNamespace(percent=41.0))
    monkeypatch.setattr(system_health_summary.psutil, "cpu_percent", lambda interval=None: 22.0)


def test_build_system_health_snapshot_aggregates_canonical_subsystems(monkeypatch):
    _patch_summary_psutil(monkeypatch)
    fake_health_monitor = _FakeHealthMonitor()

    async def _fake_get_local_health():
        return NodeHealth(
            status="warn",
            cpu_percent=18.0,
            memory_percent=41.0,
            xrun_count=6,
            audio_latency_ms=5.33,
            services=NodeServices(backend=True, juce_engine=True, pipewire=True),
        )

    async def _fake_get_deployment_status():
        return {
            "overall_status": "healthy",
            "checks_passed": 3,
            "checks_warned": 0,
            "checks_failed": 0,
            "total_checks": 3,
        }

    monkeypatch.setattr("app.services.service_orchestrator.get_orchestrator", lambda: _FakeOrchestrator())
    monkeypatch.setattr("app.services.performance_metrics.get_metrics_collector", _fake_get_metrics_collector)
    monkeypatch.setattr("app.services.health_monitor.get_health_monitor", lambda: fake_health_monitor)
    monkeypatch.setattr(
        "app.services.audio_health_monitor.get_audio_health_monitor",
        lambda: SimpleNamespace(
            get_audio_health_summary=lambda: {
                "status": "warning",
                "is_running": True,
                "total_xruns": 6,
                "latency_ms": 5.33,
                "recent_alerts": [{"type": "xrun"}],
            }
        ),
    )
    monkeypatch.setattr(
        "app.services.node_health_service.get_node_health_service",
        lambda: SimpleNamespace(get_local_health=_fake_get_local_health),
    )
    monkeypatch.setattr(
        "app.services.deployment_health.get_deployment_health_checker",
        lambda: SimpleNamespace(get_overall_status=_fake_get_deployment_status),
    )
    monkeypatch.setattr("app.config.config_get", lambda key, default=None: {"midi.cluster.enabled": True}.get(key, default))
    monkeypatch.setattr(
        "app.services.midi_hub.midi_discovery.get_midi_discovery_service",
        lambda: SimpleNamespace(get_discovery_summary=lambda: {"total_nodes": 3}),
    )
    monkeypatch.setattr(
        "app.services.midi_hub.cluster_clock.get_midi_cluster_clock",
        lambda: SimpleNamespace(
            get_state=lambda: SimpleNamespace(
                master_node_id="node-master",
                strategy=SimpleNamespace(value="leader-node"),
                is_master=False,
                drift_ms=0.4,
                sync_offset_ms=0.1,
            )
        ),
    )
    monkeypatch.setattr(
        "app.services.midi_hub.cluster_router.get_midi_cluster_router",
        lambda: SimpleNamespace(get_connections=lambda: [object(), object()]),
    )

    payload = asyncio.run(system_health_summary.build_system_health_snapshot(started_at=100.0))

    assert payload["status"] == "healthy"
    assert payload["plugins_loaded"] == 9
    assert payload["services_required_total"] == 2
    assert payload["services_optional_total"] == 1
    assert payload["subsystems"]["audio"]["status"] == "warning"
    assert payload["subsystems"]["node"]["status"] == "warn"
    assert payload["subsystems"]["deployment"]["overall_status"] == "healthy"
    assert payload["subsystems"]["health_monitor"]["service_count"] == 4
    assert payload["subsystems"]["cluster"]["midi_cluster"]["clock_status"] == "synced"
    assert payload["dependency_errors"] == []


def test_audio_health_monitor_summary_reports_warning_state(monkeypatch):
    fake_health_monitor = _FakeHealthMonitor()
    monkeypatch.setattr("app.services.audio_health_monitor.get_health_monitor", lambda: fake_health_monitor)

    monitor = AudioHealthMonitor(audio_manager=_FakeAudioManager())
    summary = monitor.get_audio_health_summary()

    assert "audio" in fake_health_monitor.registered
    assert summary["status"] == "warning"
    assert summary["status_message"] == "Audio thread warning"
    assert summary["thread_state"] == "warning"
    assert summary["signal_state"] == "present"
    assert summary["sample_rate"] == 48000
    assert summary["latency_ms"] == 5.33


def test_deployment_health_checker_overall_status_summarizes_failures(monkeypatch):
    checker = DeploymentModeHealthChecker()
    checker.last_check_time = datetime.now(UTC) - timedelta(seconds=30)

    async def _fake_run_all_checks():
        return [
            HealthCheckResult("network_connectivity", CheckStatus.PASS, "ok"),
            HealthCheckResult("database_connectivity", CheckStatus.WARN, "slow"),
            HealthCheckResult("ssh_keys", CheckStatus.FAIL, "missing", remediation="generate"),
        ]

    monkeypatch.setattr(checker, "run_all_checks", _fake_run_all_checks)

    payload = asyncio.run(checker.get_overall_status())

    assert payload["overall_status"] == "unhealthy"
    assert payload["checks_passed"] == 1
    assert payload["checks_warned"] == 1
    assert payload["checks_failed"] == 1
    assert payload["failed_checks"] == [{"name": "ssh_keys", "message": "missing", "remediation": "generate", "command": None}]
    assert payload["all_checks"][1]["status"] == "warn"


def test_process_wide_service_getters_use_shared_singleton_pattern(monkeypatch):
    fake_health_monitor = _FakeHealthMonitor()
    fake_config = SimpleNamespace(mode=SimpleNamespace(value="audio-node"))

    monkeypatch.setattr("app.services.audio_health_monitor.get_health_monitor", lambda: fake_health_monitor)
    monkeypatch.setattr("app.services.deployment_health.get_deployment_config", lambda: fake_config)

    AudioHealthMonitor.reset_instance()
    DeploymentModeHealthChecker.reset_instance()
    DeploymentRemediationService.reset_instance()
    PipeWireRecoveryService.reset_instance()

    try:
        assert get_audio_health_monitor() is get_audio_health_monitor()
        assert get_deployment_health_checker() is get_deployment_health_checker()
        assert get_remediation_service() is get_remediation_service()
        assert get_pipewire_recovery_service() is get_pipewire_recovery_service()
    finally:
        AudioHealthMonitor.reset_instance()
        DeploymentModeHealthChecker.reset_instance()
        DeploymentRemediationService.reset_instance()
        PipeWireRecoveryService.reset_instance()


@dataclass
class _FakeVisibleNode:
    is_online: bool
    last_seen: datetime
    sources: set[str]
    registered: bool
    registry_status: str
    heartbeat_online: bool
    visible: bool
    visibility_state: str
    registration_required: bool
    routing_ready: bool
    visibility_reason: str
    api_url: str
    host: str
    hostname: str
    trust_state: str
    adoption_state: str
    activation_state: str
    readiness_status: str
    adoption_candidate_id: str | None
    discovered_via_mdns: bool
    discovered_via_peer_mdns: bool
    discovered_via_cluster_mdns: bool


class _FakeHeartbeatMonitor:
    def __init__(self, health_by_node):
        self._health_by_node = dict(health_by_node)

    def get_all_health(self):
        return dict(self._health_by_node)

    def get_node_health(self, node_id):
        return self._health_by_node.get(node_id)


def test_cluster_health_route_includes_visibility_metadata(monkeypatch):
    heartbeat = _FakeHeartbeatMonitor(
        {
            "node-offline": NodeHealthStatus(
                node_id="node-offline",
                is_online=False,
                last_seen=datetime.now(UTC) - timedelta(seconds=45),
                consecutive_failures=4,
                response_time_ms=12.5,
                metadata={"source": "heartbeat"},
            )
        }
    )
    visible_nodes = {
        "node-offline": _FakeVisibleNode(
            is_online=False,
            last_seen=datetime.now(UTC) - timedelta(seconds=40),
            sources={"registry", "heartbeat"},
            registered=True,
            registry_status="offline",
            heartbeat_online=False,
            visible=True,
            visibility_state="managed-offline",
            registration_required=False,
            routing_ready=False,
            visibility_reason="missed heartbeats",
            api_url="http://10.0.0.32:8080",
            host="10.0.0.32",
            hostname="rack-offline",
            trust_state="trusted",
            adoption_state="adopted",
            activation_state="active",
            readiness_status="degraded",
            adoption_candidate_id=None,
            discovered_via_mdns=False,
            discovered_via_peer_mdns=False,
            discovered_via_cluster_mdns=False,
        )
    }

    monkeypatch.setattr(cluster_health, "get_heartbeat_monitor", lambda: heartbeat)
    monkeypatch.setattr(cluster_health, "get_visible_remote_nodes", lambda: ("local-node", visible_nodes))

    payload = asyncio.run(cluster_health.get_cluster_health())

    assert payload["status"] == "degraded"
    assert payload["offline_nodes"] == 1
    assert payload["nodes"]["node-offline"]["consecutive_failures"] == 4
    assert payload["nodes"]["node-offline"]["response_time_ms"] == 12.5
    assert payload["nodes"]["node-offline"]["metadata"]["visibility_state"] == "managed-offline"
    assert payload["nodes"]["node-offline"]["metadata"]["sources"] == ["heartbeat", "registry"]
