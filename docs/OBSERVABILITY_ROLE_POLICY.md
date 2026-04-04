# Observability Role Policy

## Purpose

This document defines where MAP2 observability components belong in a multi-node deployment.

The rule is simple:

- Dedicated audio nodes export lightweight metrics only.
- Management nodes host the heavy observability stack.
- All-in-one nodes may host the observability stack because they already accept mixed workload trade-offs.

## Node Role Rules

### Audio Nodes

- Run the MAP2 backend and audio engine.
- Expose Prometheus-formatted metrics at `http://<node>:8080/api/metrics/prometheus`.
- Do not host local Prometheus.
- Do not host Grafana.
- Stay optimized for real-time work: minimal background services, minimal disk churn, minimal extra memory pressure.

### Management Nodes

- Run the control-plane UI and cluster-management services.
- Host Prometheus on port `9090`.
- Host Grafana on port `3001`.
- Scrape every node's backend exporter at `/api/metrics/prometheus`.
- Serve as the default home for dashboard provisioning from [`config/grafana-dashboards/`](/home/mm/map2-audio/config/grafana-dashboards).

### All-In-One Nodes

- May host Prometheus and Grafana locally when a single-host deployment needs integrated observability.
- Should be treated as an explicit trade-off: more convenience, more mixed load.

## Recommended Scrape Topology

1. Run Prometheus on a management or all-in-one node.
2. Scrape the local backend exporter on `127.0.0.1:8080/api/metrics/prometheus`.
3. Scrape every remote audio node on `http://<audio-node>:8080/api/metrics/prometheus`.
4. Import the repo dashboards from [`config/grafana-dashboards/`](/home/mm/map2-audio/config/grafana-dashboards).

## Why This Split Exists

- Prometheus adds background scraping, storage, and retention work.
- Grafana adds UI, database, plugins, and session overhead.
- Dedicated audio nodes should spend CPU and memory budget on audio and transport, not on control-plane tooling.
- Remote scraping still preserves full-cluster visibility without paying that cost on every audio node.

## Current Repo Contract

- Deployment policy marks Prometheus and Grafana as management-plane services only.
- Every node can expose the lightweight backend exporter.
- Management/all-in-one nodes also expose cluster-level `map2_cluster_*` metric families for the existing Grafana dashboards.
- `scripts/install_cluster_manager.sh` stages Prometheus under `/etc/map2/prometheus/` and Grafana under `/etc/map2/grafana/`, including repo-owned dashboard provisioning and an initial `audio-nodes.json` file-based scrape target list.
- `scripts/map2-mode.sh` now enforces the same runtime rule: switching a host into `audio` mode disables `map2-prometheus` and `map2-grafana`, while `management` or `all-in-one` mode re-enables them when those units are installed.
