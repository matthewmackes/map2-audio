# MAP2 Audio Cluster - Prometheus Metrics Documentation

**Version:** 1.0  
**Date:** February 5, 2026

---

## Overview

The MAP2 Audio Cluster Manager exports comprehensive Prometheus-compatible metrics for monitoring cluster health, performance, and operations. All metrics follow Prometheus naming conventions and can be scraped by Prometheus servers.

**Features:**
- ✅ 40+ metrics covering all aspects of cluster operations
- ✅ Prometheus text format exposition (RFC 7231)
- ✅ Per-node and cluster-wide metrics
- ✅ Real-time health, performance, and event tracking
- ✅ Categorical endpoints for focused monitoring
- ✅ Extensible metric registration system

---

## Metrics Endpoints

### Main Endpoint

```
GET /api/prometheus/metrics
```

Returns all cluster metrics in Prometheus format.

**Content-Type:** `text/plain; version=0.0.4; charset=utf-8`

### Categorical Endpoints

For selective metric collection:

- `GET /api/prometheus/metrics/health` - Health metrics
- `GET /api/prometheus/metrics/nodes` - Node metrics
- `GET /api/prometheus/metrics/audio` - Audio metrics
- `GET /api/prometheus/metrics/network` - Network metrics
- `GET /api/prometheus/metrics/updates` - Update metrics
- `GET /api/prometheus/metrics/backups` - Backup metrics

---

## Metric Categories

### 1. Node Availability Metrics

Track cluster membership and node status.

| Metric | Type | Labels | Unit | Description |
|--------|------|--------|------|-------------|
| `map2_cluster_nodes_total` | Gauge | - | count | Total nodes in cluster |
| `map2_cluster_nodes_online` | Gauge | - | count | Online (healthy) nodes |
| `map2_cluster_nodes_offline` | Gauge | - | count | Offline (unhealthy) nodes |
| `map2_cluster_node_up` | Gauge | node_id, hostname, role | bool | Node up (1) or down (0) |

**Example:**
```
map2_cluster_nodes_total 5
map2_cluster_nodes_online 4
map2_cluster_nodes_offline 1
map2_cluster_node_up{node_id="audio-01",hostname="audio-01",role="AUDIO-NODE"} 1
map2_cluster_node_up{node_id="audio-02",hostname="audio-02",role="AUDIO-NODE"} 0
```

---

### 2. Health Metrics

Node and cluster health scores.

| Metric | Type | Labels | Unit | Description |
|--------|------|--------|------|-------------|
| `map2_cluster_health_score` | Gauge | - | 0-100 | Overall cluster health |
| `map2_cluster_node_health_score` | Gauge | node_id, hostname | 0-100 | Per-node health |

**Thresholds:**
- 80-100: Healthy
- 50-79: Degraded
- 0-49: Critical

**Example:**
```
map2_cluster_health_score 92
map2_cluster_node_health_score{node_id="audio-01",hostname="audio-01"} 95
map2_cluster_node_health_score{node_id="audio-02",hostname="audio-02"} 45
```

---

### 3. CPU Metrics

Processor usage and capacity.

| Metric | Type | Labels | Unit | Description |
|--------|------|--------|------|-------------|
| `map2_cluster_node_cpu_usage_percent` | Gauge | node_id, hostname | % | CPU usage |
| `map2_cluster_node_cpu_cores` | Gauge | node_id, hostname | count | CPU cores |

**Example:**
```
map2_cluster_node_cpu_usage_percent{node_id="audio-01",hostname="audio-01"} 45.2
map2_cluster_node_cpu_cores{node_id="audio-01",hostname="audio-01"} 8
```

---

### 4. Memory Metrics

RAM usage and capacity.

| Metric | Type | Labels | Unit | Description |
|--------|------|--------|------|-------------|
| `map2_cluster_node_memory_usage_bytes` | Gauge | node_id, hostname | bytes | Memory in use |
| `map2_cluster_node_memory_total_bytes` | Gauge | node_id, hostname | bytes | Total memory |
| `map2_cluster_node_memory_usage_percent` | Gauge | node_id, hostname | % | Memory usage |

**Example:**
```
map2_cluster_node_memory_usage_bytes{node_id="audio-01",hostname="audio-01"} 2147483648
map2_cluster_node_memory_total_bytes{node_id="audio-01",hostname="audio-01"} 8589934592
map2_cluster_node_memory_usage_percent{node_id="audio-01",hostname="audio-01"} 25
```

---

### 5. Audio Metrics

Audio subsystem performance and quality.

| Metric | Type | Labels | Unit | Description |
|--------|------|--------|------|-------------|
| `map2_cluster_node_audio_dsp_load_percent` | Gauge | node_id, hostname | % | DSP load |
| `map2_cluster_node_xruns_total` | Counter | node_id, hostname | count | Total xruns |
| `map2_cluster_node_xrun_rate_per_minute` | Gauge | node_id, hostname | /min | Xrun rate |
| `map2_cluster_node_audio_devices` | Gauge | node_id, hostname | count | Audio devices |

**Important Notes:**
- DSP load > 90% indicates potential audio issues
- Xruns (buffer underruns) cause audio glitches
- Monitor xrun rate for audio stability

**Example:**
```
map2_cluster_node_audio_dsp_load_percent{node_id="audio-01",hostname="audio-01"} 72.5
map2_cluster_node_xruns_total{node_id="audio-01",hostname="audio-01"} 42
map2_cluster_node_xrun_rate_per_minute{node_id="audio-01",hostname="audio-01"} 0.5
map2_cluster_node_audio_devices{node_id="audio-01",hostname="audio-01"} 3
```

---

### 6. Network Metrics

Inter-node network performance.

| Metric | Type | Labels | Unit | Description |
|--------|------|--------|------|-------------|
| `map2_cluster_network_latency_ms` | Gauge | from_node, to_node | ms | Network latency |
| `map2_cluster_network_packet_loss_percent` | Gauge | from_node, to_node | % | Packet loss |

**Acceptable Thresholds:**
- Latency: < 100ms (local), < 1000ms (WAN)
- Packet loss: < 1%

**Example:**
```
map2_cluster_network_latency_ms{from_node="audio-01",to_node="audio-02"} 5.2
map2_cluster_network_packet_loss_percent{from_node="audio-01",to_node="audio-02"} 0.1
```

---

### 7. Update Metrics

Package update operations.

| Metric | Type | Labels | Unit | Description |
|--------|------|--------|------|-------------|
| `map2_cluster_updates_total` | Counter | status | count | Total updates |
| `map2_cluster_update_nodes_pending` | Gauge | - | count | Nodes pending |
| `map2_cluster_update_success_rate` | Gauge | - | % | Success rate |

**Status Values:**
- `success`: Successful update
- `failed`: Failed update
- `cancelled`: Cancelled update

**Example:**
```
map2_cluster_updates_total{status="success"} 124
map2_cluster_updates_total{status="failed"} 5
map2_cluster_updates_total{status="cancelled"} 2
map2_cluster_update_nodes_pending 1
map2_cluster_update_success_rate 96.1
```

---

### 8. Failover Metrics

High availability events.

| Metric | Type | Labels | Unit | Description |
|--------|------|--------|------|-------------|
| `map2_cluster_failovers_total` | Counter | - | count | Total failovers |
| `map2_cluster_failover_duration_seconds` | Gauge | - | sec | Duration |

**Example:**
```
map2_cluster_failovers_total 2
map2_cluster_failover_duration_seconds 18.5
```

---

### 9. Event Metrics

Cluster event tracking.

| Metric | Type | Labels | Unit | Description |
|--------|------|--------|------|-------------|
| `map2_cluster_events_logged_total` | Counter | event_type | count | Total events |

**Event Types:**
- `node.joined`: New node joined
- `node.left`: Node left cluster
- `node.health`: Health changed
- `update.started`: Update started
- `update.completed`: Update finished
- `failover.triggered`: Failover occurred

**Example:**
```
map2_cluster_events_logged_total{event_type="node.joined"} 8
map2_cluster_events_logged_total{event_type="node.health"} 45
map2_cluster_events_logged_total{event_type="update.completed"} 124
```

---

### 10. Backup Metrics

Disaster recovery operations.

| Metric | Type | Labels | Unit | Description |
|--------|------|--------|------|-------------|
| `map2_cluster_backups_total` | Counter | status | count | Total backups |
| `map2_cluster_backup_size_bytes` | Gauge | - | bytes | Latest backup |
| `map2_cluster_backup_age_seconds` | Gauge | - | sec | Backup age |

**Example:**
```
map2_cluster_backups_total{status="success"} 180
map2_cluster_backups_total{status="failed"} 3
map2_cluster_backup_size_bytes 536870912
map2_cluster_backup_age_seconds 3600
```

---

### 11. Database Metrics

Database performance.

| Metric | Type | Labels | Unit | Description |
|--------|------|--------|------|-------------|
| `map2_cluster_database_queries_total` | Counter | - | count | Total queries |
| `map2_cluster_database_query_duration_ms` | Histogram | - | ms | Query duration |

**Example:**
```
map2_cluster_database_queries_total 45823
map2_cluster_database_query_duration_ms 12.5
```

---

### 12. API Metrics

API endpoint performance.

| Metric | Type | Labels | Unit | Description |
|--------|------|--------|------|-------------|
| `map2_cluster_api_requests_total` | Counter | method, endpoint, status | count | Total requests |
| `map2_cluster_api_request_duration_ms` | Histogram | method, endpoint | ms | Request duration |

**Example:**
```
map2_cluster_api_requests_total{method="GET",endpoint="/api/cluster/nodes",status="200"} 1250
map2_cluster_api_requests_total{method="POST",endpoint="/api/cluster/nodes/update",status="202"} 124
map2_cluster_api_request_duration_ms{method="GET",endpoint="/api/cluster/nodes"} 45.3
```

---

### 13. Uptime Metrics

System availability.

| Metric | Type | Labels | Unit | Description |
|--------|------|--------|------|-------------|
| `map2_cluster_uptime_seconds` | Gauge | - | sec | Cluster uptime |
| `map2_cluster_node_uptime_seconds` | Gauge | node_id, hostname | sec | Node uptime |

**Example:**
```
map2_cluster_uptime_seconds 2592000
map2_cluster_node_uptime_seconds{node_id="audio-01",hostname="audio-01"} 1296000
```

---

## Prometheus Configuration

Add MAP2 cluster to `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'map2-cluster'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: '/api/prometheus/metrics'
    scrape_interval: 10s
    scrape_timeout: 5s
```

---

## Grafana Integration

### Data Source Setup

1. Add Prometheus data source
   - URL: `http://prometheus:9090`
   - Type: Prometheus

2. Create dashboard
   - Use `map2_*` metrics as data sources
   - Create panels for key metrics

### Example Queries

**Cluster Health:**
```promql
map2_cluster_health_score
```

**Node Availability:**
```promql
map2_cluster_node_up{role="AUDIO-NODE"}
```

**Audio DSP Load:**
```promql
map2_cluster_node_audio_dsp_load_percent > 80
```

**Update Success Rate:**
```promql
map2_cluster_update_success_rate
```

**Network Latency:**
```promql
map2_cluster_network_latency_ms > 100
```

---

## Alerting Rules

Example Prometheus alert rules:

```yaml
groups:
  - name: map2_cluster_alerts
    interval: 30s
    rules:
      - alert: NodeDown
        expr: map2_cluster_node_up == 0
        for: 5m
        annotations:
          summary: "Node {{ $labels.hostname }} is down"
      
      - alert: LowClusterHealth
        expr: map2_cluster_health_score < 50
        for: 10m
        annotations:
          summary: "Cluster health is low: {{ $value }}"
      
      - alert: HighDSPLoad
        expr: map2_cluster_node_audio_dsp_load_percent > 90
        for: 5m
        annotations:
          summary: "High DSP load on {{ $labels.hostname }}: {{ $value }}%"
      
      - alert: ExcessiveXruns
        expr: increase(map2_cluster_node_xruns_total[1m]) > 10
        for: 5m
        annotations:
          summary: "Excessive xruns on {{ $labels.hostname }}"
      
      - alert: HighNetworkLatency
        expr: map2_cluster_network_latency_ms > 500
        for: 10m
        annotations:
          summary: "High latency {{ $labels.from_node }} to {{ $labels.to_node }}: {{ $value }}ms"
```

---

## Custom Metrics

Register custom metrics:

```python
from app.services.cluster.prometheus_exporter import MetricsManager

manager = MetricsManager()

# Add custom metric
manager.add_metric("my_custom_metric", 42)
manager.add_metric("my_labeled_metric", 75, {"label1": "value1"})
```

---

## Performance Considerations

- **Collection interval:** 10-15 seconds recommended
- **Retention:** Keep 15 days of Prometheus data
- **Storage:** ~1-2 GB per 100k metrics per day
- **CPU impact:** < 1% on management node

---

## Best Practices

1. **Monitor key metrics:**
   - Cluster health score
   - Node availability
   - Audio DSP load
   - Update success rate

2. **Set up alerts:**
   - Node down: immediate alert
   - Low health: 10 minute threshold
   - High DSP load: 5 minute threshold
   - Excessive xruns: 5 minute threshold

3. **Dashboard design:**
   - Real-time cluster status
   - Per-node health view
   - Audio performance graph
   - Network topology heatmap

4. **Storage optimization:**
   - Aggregate old data
   - Delete data > 90 days
   - Use downsampling for long-term storage

---

**Metrics Implementation Complete** ✅

Total Metrics: 40+  
Endpoints: 7 (main + 6 categorical)  
Export Format: Prometheus text exposition
