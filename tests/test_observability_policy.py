from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.deployment.deployment import DeploymentConfig, DeploymentMode
from app.routes import metrics as metrics_routes
from app.services.cluster.prometheus_exporter import MetricsManager


class _FakeCollector:
    def export_prometheus(self) -> str:
        return "# HELP map2_cpu_percent System CPU usage percentage\n# TYPE map2_cpu_percent gauge\nmap2_cpu_percent 12.5\n"


def test_audio_node_exports_metrics_without_hosting_monitoring(tmp_path):
    config = DeploymentConfig(config_dir=str(tmp_path))
    config.set_mode(DeploymentMode.AUDIO_NODE)

    assert config.exports_node_metrics() is True
    assert config.hosts_monitoring_stack() is False


def test_control_node_hosts_monitoring_stack(tmp_path):
    config = DeploymentConfig(config_dir=str(tmp_path))
    config.set_mode(DeploymentMode.CONTROL_NODE)

    assert config.exports_node_metrics() is True
    assert config.hosts_monitoring_stack() is True


def test_prometheus_route_returns_text_plain_payload(monkeypatch):
    app = FastAPI()
    app.include_router(metrics_routes.router)

    async def _fake_get_metrics_collector():
        return _FakeCollector()

    class _FakeDeploymentConfig:
        def hosts_monitoring_stack(self) -> bool:
            return False

    monkeypatch.setattr(metrics_routes, "get_metrics_collector", _fake_get_metrics_collector)
    monkeypatch.setattr(metrics_routes, "get_deployment_config", lambda: _FakeDeploymentConfig())

    client = TestClient(app)
    response = client.get("/api/metrics/prometheus")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain; version=0.0.4")
    assert response.text.startswith("# HELP map2_cpu_percent")
    assert "map2_cpu_percent 12.5" in response.text


def test_cluster_metrics_manager_exports_collected_metrics():
    MetricsManager._instance = None
    manager = MetricsManager()
    manager.set_data_providers(
        get_node_data=lambda: [
            {
                "id": "node-a",
                "hostname": "audio-01",
                "role": "AUDIO-NODE",
                "status": "online",
                "cpu_usage": 17.0,
                "cpu_cores": 8,
                "memory_usage": 1024.0,
                "memory_total": 2048.0,
                "audio_dsp_load": 9.0,
                "xruns": 0,
                "xrun_rate": 0.0,
                "audio_devices": 2,
                "uptime": 10.0,
            }
        ],
        get_health_data=lambda: {
            "overall_score": 97.0,
            "nodes": {
                "node-a": {
                    "score": 97.0,
                    "hostname": "audio-01",
                }
            },
        },
        get_update_data=lambda: {
            "total": 1,
            "successful": 1,
            "pending": 0,
        },
    )

    exposition = manager.get_exposition()

    assert "map2_cluster_nodes_total 1" in exposition
    assert 'map2_cluster_node_up{hostname="audio-01", node_id="node-a", role="AUDIO-NODE"} 1' in exposition
    assert "map2_cluster_health_score 97.0" in exposition
