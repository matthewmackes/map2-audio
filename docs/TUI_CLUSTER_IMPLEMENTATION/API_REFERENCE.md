# Cluster API Reference

**MAP2 Audio Platform - Cluster Management API**

**Date**: February 5, 2026  
**Version**: 1.0  
**Status**: Implemented

---

## Overview

The Cluster API provides comprehensive endpoints for managing distributed audio processing across multiple nodes. All endpoints are RESTful and return JSON responses.

### Base URL
```
http://localhost:8080/api/cluster
```

### Authentication
Currently uses no authentication. Production deployments should add API key or token-based auth.

### Response Format
All responses follow this format:
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "error": null,
  "timestamp": "2026-02-05T10:30:00Z"
}
```

---

## Node Management

### Get All Nodes
**Endpoint**: `GET /api/cluster/nodes`

**Description**: Retrieve all nodes in the cluster

**Response**:
```json
{
  "success": true,
  "data": {
    "nodes": [
      {
        "node_id": "node-1",
        "hostname": "audio-node-1",
        "status": "ONLINE",
        "ip_address": "192.168.1.100",
        "port": 8080,
        "is_responsive": true,
        "response_time_ms": 5.2,
        "metrics": { /* see NodeMetrics */ },
        "capabilities": { /* see NodeCapabilities */ },
        "active_flow_ids": ["flow-123", "flow-124"],
        "active_flow_count": 2,
        "last_seen": "2026-02-05T10:29:55Z",
        "connected_since": "2026-02-05T08:00:00Z",
        "warning_level": 0,
        "last_error": null
      }
    ]
  }
}
```

**Status Codes**:
- 200: Success
- 500: Server error

---

### Get Node Details
**Endpoint**: `GET /api/cluster/nodes/{node_id}`

**Description**: Get detailed information about a specific node

**Parameters**:
- `node_id` (path): ID of the node

**Response**: Single NodeStatus object (see Get All Nodes response format)

**Status Codes**:
- 200: Success
- 404: Node not found
- 500: Server error

---

### Get Node Metrics
**Endpoint**: `GET /api/cluster/nodes/{node_id}/metrics`

**Description**: Get real-time performance metrics for a node

**Parameters**:
- `node_id` (path): ID of the node

**Response**:
```json
{
  "success": true,
  "data": {
    "cpu_percent": 45.2,
    "memory_percent": 62.1,
    "memory_mb": 16384,
    "memory_max_mb": 32000,
    "disk_percent": 75.0,
    "gpu_percent": 30.5,
    "gpu_memory_percent": 50.0,
    "temperature_c": 62.3,
    "uptime_seconds": 345600,
    "last_update": "2026-02-05T10:29:55Z"
  }
}
```

**Status Codes**:
- 200: Success
- 404: Node not found
- 500: Server error

---

### Set Node Maintenance Mode
**Endpoint**: `POST /api/cluster/nodes/{node_id}/maintenance`

**Description**: Enable or disable maintenance mode on a node

**Parameters**:
- `node_id` (path): ID of the node

**Request Body**:
```json
{
  "maintenance_enabled": true
}
```

**Response**: Updated NodeStatus object

**Status Codes**:
- 200: Success
- 404: Node not found
- 400: Invalid request
- 500: Server error

---

## Flow Assignment Management

### Get All Assignments
**Endpoint**: `GET /api/cluster/flows/assignments`

**Description**: Get all flow assignments in the cluster

**Response**:
```json
{
  "success": true,
  "data": {
    "assignments": {
      "flow-123": {
        "flow_id": "flow-123",
        "chain_id": 1,
        "primary_node_id": "node-1",
        "standby_node_ids": ["node-2"],
        "redundancy_enabled": true,
        "redundancy_mode": "hot-standby",
        "is_active": true,
        "is_healthy": true,
        "cpu_usage_percent": 25.0,
        "memory_usage_mb": 256.5,
        "latency_ms": 2.3,
        "assigned_at": "2026-02-05T09:00:00Z",
        "last_verified": "2026-02-05T10:29:55Z"
      }
    }
  }
}
```

**Status Codes**:
- 200: Success
- 500: Server error

---

### Get Assignment Matrix
**Endpoint**: `GET /api/cluster/flows/assignment-matrix`

**Description**: Get 2D matrix of flows × nodes showing assignments

**Response**:
```json
{
  "success": true,
  "data": {
    "timestamp": "2026-02-05T10:30:00Z",
    "flows": ["flow-123", "flow-124"],
    "nodes": ["node-1", "node-2", "node-3"],
    "assignments": {
      "flow-123": {
        "node-1": "primary",
        "node-2": "standby",
        "node-3": "unassigned"
      },
      "flow-124": {
        "node-1": "unassigned",
        "node-2": "primary",
        "node-3": "standby"
      }
    }
  }
}
```

**Status Codes**:
- 200: Success
- 500: Server error

---

### Assign Flow
**Endpoint**: `POST /api/cluster/flows/assign`

**Description**: Assign a flow to node(s)

**Request Body**:
```json
{
  "flow_id": "flow-123",
  "chain_id": 1,
  "primary_node_id": "node-1",
  "standby_node_ids": ["node-2"],
  "redundancy_enabled": true
}
```

**Response**: FlowAssignment object

**Status Codes**:
- 201: Created
- 400: Invalid request
- 409: Conflict (node unavailable)
- 500: Server error

---

### Get Assignment Recommendations
**Endpoint**: `GET /api/cluster/flows/recommendations`

**Description**: Get AI-powered recommendations for flow assignment

**Parameters**:
- `flow_id` (query): ID of the flow
- `chain_id` (query): Chain ID

**Response**:
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "flow_id": "flow-123",
        "chain_id": 1,
        "recommended_node_id": "node-1",
        "confidence": 0.95,
        "reason": "Lowest latency and highest available resources",
        "alternatives": ["node-2", "node-3"],
        "matches_requirements": true,
        "available_resources": {
          "cpu_percent": 45.0,
          "memory_percent": 62.0
        },
        "estimated_cpu": 12.5,
        "estimated_memory_mb": 128.0
      }
    ]
  }
}
```

**Status Codes**:
- 200: Success
- 400: Missing parameters
- 500: Server error

---

## Failover Management

### Trigger Failover
**Endpoint**: `POST /api/cluster/flows/failover`

**Description**: Manually trigger failover for a flow

**Request Body**:
```json
{
  "flow_id": "flow-123",
  "target_node_id": "node-2",
  "reason": "user_request"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "event_id": "failover-456",
    "flow_id": "flow-123",
    "chain_id": 1,
    "from_node_id": "node-1",
    "to_node_id": "node-2",
    "triggered_at": "2026-02-05T10:30:00Z",
    "completed_at": "2026-02-05T10:30:05Z",
    "state": "completed",
    "is_successful": true,
    "error_message": null,
    "trigger_reason": "user_request",
    "duration_ms": 5000
  }
}
```

**Status Codes**:
- 200: Success
- 400: Invalid request
- 409: Failover not possible
- 500: Server error

---

### Get Failover History
**Endpoint**: `GET /api/cluster/flows/{flow_id}/failover-history`

**Description**: Get failover history for a specific flow

**Parameters**:
- `flow_id` (path): ID of the flow

**Response**:
```json
{
  "success": true,
  "data": {
    "flow_id": "flow-123",
    "events": [ /* list of FailoverEvent objects */ ],
    "total_failovers": 3,
    "last_failover": { /* FailoverEvent object */ },
    "mtbf_hours": 120.5
  }
}
```

**Status Codes**:
- 200: Success
- 404: Flow not found
- 500: Server error

---

## Cluster Diagnostics

### Get Cluster Health
**Endpoint**: `GET /api/cluster/health`

**Description**: Get overall cluster health status

**Response**:
```json
{
  "success": true,
  "data": {
    "timestamp": "2026-02-05T10:30:00Z",
    "overall_health": 92,
    "nodes_online": 3,
    "nodes_offline": 0,
    "nodes_degraded": 1,
    "nodes_maintenance": 0,
    "avg_cpu_percent": 35.2,
    "avg_memory_percent": 55.0,
    "avg_latency_ms": 2.5,
    "critical_issues": [],
    "warnings": [
      "Node node-3 degraded: High temperature (78°C)"
    ],
    "total_cpu_capacity": 400.0,
    "used_cpu_percent": 35.2,
    "total_memory_gb": 128.0,
    "used_memory_gb": 70.4
  }
}
```

**Status Codes**:
- 200: Success
- 500: Server error

---

### Get Cluster Events
**Endpoint**: `GET /api/cluster/events`

**Description**: Get event log with pagination

**Parameters**:
- `limit` (query): Max events to return (default: 100)
- `offset` (query): Pagination offset (default: 0)
- `event_type` (query, optional): Filter by event type

**Response**:
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "event_id": "evt-789",
        "event_type": "assignment_created",
        "timestamp": "2026-02-05T10:30:00Z",
        "node_id": "node-1",
        "flow_id": "flow-123",
        "chain_id": 1,
        "message": "Flow assigned to node-1",
        "severity": "info",
        "metadata": {}
      }
    ],
    "total_count": 250,
    "limit": 100,
    "offset": 0
  }
}
```

**Status Codes**:
- 200: Success
- 400: Invalid parameters
- 500: Server error

---

## WebSocket Endpoints

### Real-Time Updates
WebSocket connections for streaming updates:

```
ws://localhost:8080/ws/cluster
```

#### Message Types

**Subscribe to assignments**:
```json
{
  "type": "subscribe",
  "channel": "assignments"
}
```

**Assignment update (from server)**:
```json
{
  "type": "assignment_update",
  "payload": {
    "flow_id": "flow-123",
    "primary_node_id": "node-1",
    "timestamp": "2026-02-05T10:30:00Z"
  }
}
```

**Node status change (from server)**:
```json
{
  "type": "node_status_change",
  "payload": {
    "node_id": "node-1",
    "status": "ONLINE",
    "timestamp": "2026-02-05T10:30:00Z"
  }
}
```

**Metrics update (from server)**:
```json
{
  "type": "metrics_update",
  "payload": {
    "node_id": "node-1",
    "cpu_percent": 45.2,
    "memory_percent": 62.1,
    "timestamp": "2026-02-05T10:30:00Z"
  }
}
```

**Cluster event (from server)**:
```json
{
  "type": "event",
  "payload": {
    "event_id": "evt-789",
    "event_type": "assignment_created",
    "message": "Flow assigned to node-1",
    "timestamp": "2026-02-05T10:30:00Z"
  }
}
```

**Keep-alive ping** (client):
```json
{
  "type": "ping",
  "timestamp": "2026-02-05T10:30:00Z"
}
```

**Keep-alive pong** (server):
```json
{
  "type": "pong",
  "timestamp": "2026-02-05T10:30:00Z"
}
```

---

## Data Structures

### NodeMetrics
```json
{
  "cpu_percent": 0.0,
  "memory_percent": 0.0,
  "memory_mb": 0.0,
  "memory_max_mb": 0.0,
  "disk_percent": 0.0,
  "gpu_percent": null,
  "gpu_memory_percent": null,
  "temperature_c": null,
  "uptime_seconds": 0,
  "last_update": "2026-02-05T10:30:00Z"
}
```

### NodeCapabilities
```json
{
  "supports_gpu": false,
  "gpu_memory_gb": null,
  "max_chains": 10,
  "audio_inputs": 2,
  "audio_outputs": 2,
  "sample_rates": [44100, 48000, 96000],
  "buffer_sizes": [64, 128, 256, 512]
}
```

### FlowAssignment
```json
{
  "flow_id": "flow-123",
  "chain_id": 1,
  "primary_node_id": "node-1",
  "standby_node_ids": ["node-2"],
  "redundancy_enabled": true,
  "redundancy_mode": "hot-standby",
  "is_active": true,
  "is_healthy": true,
  "cpu_usage_percent": 25.0,
  "memory_usage_mb": 256.5,
  "latency_ms": 2.3,
  "assigned_at": "2026-02-05T09:00:00Z",
  "last_verified": "2026-02-05T10:30:00Z"
}
```

---

## Error Handling

### Error Response Format
```json
{
  "success": false,
  "data": null,
  "error": "Descriptive error message",
  "error_code": "ERROR_CODE",
  "timestamp": "2026-02-05T10:30:00Z"
}
```

### Common Error Codes
- `NOT_FOUND`: Resource not found (404)
- `INVALID_REQUEST`: Bad request data (400)
- `CONFLICT`: Resource conflict (409)
- `SERVER_ERROR`: Internal server error (500)
- `UNAUTHORIZED`: Authentication failed (401)
- `FORBIDDEN`: Access denied (403)

---

## Rate Limiting

Currently no rate limiting is implemented. Production deployments should add:
- X-RateLimit-Limit
- X-RateLimit-Remaining
- X-RateLimit-Reset

---

## Client Implementation

### Python (TUI)
See `tui/cluster_api_client.py` for complete implementation:

```python
from tui.cluster_api_client import ClusterAPIClient

# Initialize client
client = ClusterAPIClient(base_url="http://localhost:8080")
await client.connect()

# Get all nodes
result = await client.get_nodes()
if result.success:
    nodes = result.data
    for node in nodes:
        print(f"{node.hostname}: {node.status}")

# Assign a flow
result = await client.assign_flow(
    flow_id="flow-123",
    chain_id=1,
    primary_node_id="node-1",
    standby_node_ids=["node-2"],
    redundancy_enabled=True
)

# Get recommendations
result = await client.get_assignment_recommendations("flow-123", 1)
if result.success:
    for rec in result.data:
        print(f"Recommended: {rec.recommended_node_id} ({rec.confidence*100:.0f}%)")

await client.disconnect()
```

### WebSocket Client
See `tui/cluster_websocket.py`:

```python
from tui.cluster_websocket import get_ws_manager

manager = await get_ws_manager(base_url="ws://localhost:8080")

async def on_assignment_update(data):
    print(f"Assignment updated: {data}")

await manager.subscribe("assignments", on_assignment_update)

# Run the manager (blocks until disconnected)
await manager.run()
```

---

## Changelog

### Version 1.0 (2026-02-05)
- Initial API design
- 8 REST endpoints
- WebSocket real-time updates
- Complete type definitions
- Python async client implementation

---

**Status**: Complete & Ready  
**Next**: Implement test suite (Phase 1.4)
