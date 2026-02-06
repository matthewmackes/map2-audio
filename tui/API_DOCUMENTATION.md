# Cluster Management TUI - API Documentation

Complete API reference for the MAP2 Audio Cluster Management Terminal User Interface.

## ClusterAPIClient

The main API client for cluster communication.

### Initialization

```python
from tui.cluster_api_client import ClusterAPIClient

client = ClusterAPIClient(
    api_url="http://localhost:8080",
    ws_url="ws://localhost:8080"
)
```

### Connection Management

```python
# Connect to cluster
connected = await client.connect()

# Disconnect
await client.disconnect()
```

### Node Management

#### Get All Node Status
```python
result = await client.get_node_status()
if result.success:
    nodes = result.data  # List[NodeStatus]
```

#### Get Node Metrics
```python
result = await client.get_node_metrics(node_id="node-1")
if result.success:
    metrics = result.data  # NodeMetrics
```

#### Monitor Node Health
```python
result = await client.get_cluster_health()
if result.success:
    report = result.data  # ClusterHealthReport
    print(f"Health: {report.overall_health}%")
```

### Flow Management

#### Get Flow Assignments
```python
result = await client.get_flow_assignments()
if result.success:
    assignments = result.data  # Dict[flow_id, FlowAssignment]
```

#### Assign Flow to Node
```python
result = await client.assign_flow(
    flow_id="flow-1",
    chain_id=1,
    primary_node_id="node-2",
    standby_node_ids=["node-3"],
    redundancy_enabled=True
)
```

#### Get Assignment Recommendations
```python
result = await client.get_assignment_recommendations(
    flow_id="flow-1",
    chain_id=1
)
if result.success:
    recommendations = result.data  # List[AssignmentRecommendation]
```

### Failover Management

#### Trigger Failover
```python
result = await client.trigger_failover(
    flow_id="flow-1",
    target_node_id="node-2",
    reason="manual_trigger"
)
```

#### Get Failover History
```python
result = await client.get_failover_history(flow_id="flow-1")
if result.success:
    history = result.data  # FailoverHistory
    for event in history.events:
        print(f"Failover from {event.from_node_id} to {event.to_node_id}")
```

### Events & Monitoring

#### Get Cluster Events
```python
result = await client.get_cluster_events(
    limit=100,
    offset=0,
    event_type="failover"  # Optional filter
)
```

### WebSocket Integration

```python
from tui.cluster_websocket import ClusterWebSocketManager

ws_manager = ClusterWebSocketManager(
    url="ws://localhost:8080",
    on_event=lambda event: print(f"Event: {event}")
)

await ws_manager.connect()
# Subscribe to events
await ws_manager.subscribe_to_node_events()
await ws_manager.subscribe_to_flow_events()
```

## Data Types

### NodeStatus
```python
@dataclass
class NodeStatus:
    node_id: str
    hostname: str
    status: NodeState  # ONLINE, OFFLINE, DEGRADED
    ip_address: str
    port: int
    is_responsive: bool
    response_time_ms: float
    metrics: NodeMetrics
    capabilities: NodeCapabilities
    active_flow_ids: List[str]
    active_flow_count: int
    last_seen: str  # ISO datetime
    connected_since: str
    warning_level: int
    last_error: Optional[str]
```

### FlowAssignment
```python
@dataclass
class FlowAssignment:
    flow_id: str
    chain_id: int
    primary_node_id: str
    standby_node_ids: List[str]
    redundancy_enabled: bool
    redundancy_mode: str  # "hot-standby", "warm-standby"
    is_active: bool
    is_healthy: bool
    cpu_usage_percent: float
    memory_usage_mb: float
    latency_ms: float
    assigned_at: str
    last_verified: str
```

### AssignmentRecommendation
```python
@dataclass
class AssignmentRecommendation:
    flow_id: str
    chain_id: int
    recommended_node_id: str
    confidence: float  # 0.0-1.0
    reason: str
    alternatives: List[str]
    matches_requirements: bool
    available_resources: Dict[str, Any]
    estimated_cpu: float
    estimated_memory_mb: float
```

### ClusterHealthReport
```python
@dataclass
class ClusterHealthReport:
    timestamp: str
    overall_health: int  # 0-100
    nodes_online: int
    nodes_offline: int
    nodes_degraded: int
    nodes_maintenance: int
    avg_cpu_percent: float
    avg_memory_percent: float
    avg_latency_ms: float
    critical_issues: List[str]
    warnings: List[str]
    total_cpu_capacity: float
    total_memory_capacity_mb: float
    total_disk_capacity_gb: float
```

### FailoverEvent
```python
@dataclass
class FailoverEvent:
    event_id: str
    flow_id: str
    chain_id: int
    from_node_id: str
    to_node_id: str
    triggered_at: str
    completed_at: Optional[str]
    state: FailoverState  # triggered, in_progress, completed, failed
    is_successful: bool
    error_message: Optional[str]
    trigger_reason: str
    duration_ms: Optional[int]
```

## Error Handling

All API methods return `ClusterAPIResult`:

```python
@dataclass
class ClusterAPIResult:
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    timestamp: str = ""

# Usage
result = await client.get_node_status()
if result.success:
    print(f"Got {len(result.data)} nodes")
else:
    print(f"Error: {result.error}")
```

## Async Patterns

All operations are async:

```python
# Single operation
result = await client.get_cluster_health()

# Multiple concurrent operations
results = await asyncio.gather(
    client.get_node_status(),
    client.get_flow_assignments(),
    client.get_cluster_health()
)

# With timeout
result = await asyncio.wait_for(
    client.get_node_status(),
    timeout=5.0
)
```

## Rate Limiting & Timeouts

- Default timeout: 10 seconds
- WebSocket heartbeat: 30 seconds
- Auto-reconnect: enabled
- Max retries: 3

Configure via:
```python
client.timeout = 15.0
client.max_retries = 5
```

---

Complete API Documentation | February 2026
