from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_prometheus_uses_file_sd_targets_for_cluster_nodes():
    config_text = (REPO_ROOT / "config" / "prometheus.yml").read_text(encoding="utf-8")

    assert "file_sd_configs:" in config_text
    assert "/etc/map2/prometheus/targets/*.json" in config_text
    assert "/api/metrics/prometheus" in config_text


def test_grafana_provisioning_targets_local_prometheus_and_dashboards():
    datasource_text = (
        REPO_ROOT
        / "config"
        / "grafana"
        / "provisioning"
        / "datasources"
        / "prometheus.yml"
    ).read_text(encoding="utf-8")
    dashboards_text = (
        REPO_ROOT
        / "config"
        / "grafana"
        / "provisioning"
        / "dashboards"
        / "map2.yml"
    ).read_text(encoding="utf-8")

    assert "http://127.0.0.1:9090" in datasource_text
    assert "/etc/map2/grafana/dashboards" in dashboards_text


def test_packaging_and_mode_script_reference_monitoring_units():
    spec_text = (REPO_ROOT / "packaging" / "map2-audio.spec").read_text(encoding="utf-8")
    mode_script_text = (REPO_ROOT / "scripts" / "map2-mode.sh").read_text(encoding="utf-8")

    assert "map2-prometheus.service" in spec_text
    assert "map2-grafana.service" in spec_text
    assert "apply_observability_policy" in mode_script_text
    assert "map2-prometheus.service map2-grafana.service" in mode_script_text
