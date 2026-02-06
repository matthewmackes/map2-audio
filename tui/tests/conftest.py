"""
pytest configuration and shared fixtures for cluster tests
Provides mock clients, async support, and reusable test data.
"""

import pytest
import asyncio
from typing import List, Dict, Any, AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

# Try to import dependencies
try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False

try:
    from tui.cluster_api_client import ClusterAPIClient
    from tui.cluster_types import (
        NodeStatus, NodeMetrics, NodeCapabilities, FlowAssignment,
        FailoverEvent, ClusterHealthReport, ClusterAPIResult, NodeState
    )
    API_AVAILABLE = True
except ImportError:
    API_AVAILABLE = False


# ============================================================================
# Pytest Configuration
# ============================================================================

def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "asyncio: mark test as async (deselect with '-m \"not asyncio\"')"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )


@pytest.fixture(scope="session")
def event_loop() -> asyncio.AbstractEventLoop:
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# ============================================================================
# API Client Fixtures
# ============================================================================

@pytest.fixture
def mock_http_client() -> AsyncMock:
    """Create mock HTTP client."""
    mock = AsyncMock(spec=httpx.AsyncClient)
    return mock


@pytest.fixture
def cluster_api_client() -> ClusterAPIClient:
    """Create real API client (will fail without server)."""
    return ClusterAPIClient(base_url="http://localhost:8080")


@pytest.fixture
def mock_api_client(mock_http_client: AsyncMock) -> ClusterAPIClient:
    """Create API client with mocked HTTP."""
    client = ClusterAPIClient(base_url="http://localhost:8080")
    client.session = mock_http_client
    return client


# ============================================================================
# Test Data Fixtures - Nodes
# ============================================================================

@pytest.fixture
def sample_node_metrics() -> NodeMetrics:
    """Sample node metrics."""
    return NodeMetrics(
        cpu_percent=45.0,
        memory_percent=62.1,
        memory_mb=16384,
        memory_max_mb=32000,
        disk_percent=75.0,
        gpu_percent=30.5,
        gpu_memory_percent=50.0,
        temperature_c=62.3,
        uptime_seconds=345600,
        last_update="2026-02-05T10:30:00Z"
    )


@pytest.fixture
def sample_node_capabilities() -> NodeCapabilities:
    """Sample node capabilities."""
    return NodeCapabilities(
        supports_gpu=True,
        gpu_memory_gb=8.0,
        max_chains=10,
        audio_inputs=2,
        audio_outputs=2,
        sample_rates=[44100, 48000, 96000],
        buffer_sizes=[64, 128, 256, 512]
    )


@pytest.fixture
def sample_node_status(
    sample_node_metrics: NodeMetrics,
    sample_node_capabilities: NodeCapabilities
) -> NodeStatus:
    """Sample full node status."""
    return NodeStatus(
        node_id="node-1",
        hostname="audio-node-1",
        status=NodeState.ONLINE,
        ip_address="192.168.1.100",
        port=8080,
        is_responsive=True,
        response_time_ms=5.2,
        metrics=sample_node_metrics,
        capabilities=sample_node_capabilities,
        active_flow_ids=["flow-123", "flow-124"],
        active_flow_count=2,
        last_seen="2026-02-05T10:29:55Z",
        connected_since="2026-02-05T08:00:00Z",
        warning_level=0,
        last_error=None
    )


@pytest.fixture
def sample_nodes_list(sample_node_status: NodeStatus) -> List[Dict[str, Any]]:
    """List of sample nodes for API responses."""
    return [
        {
            "node_id": "node-1",
            "hostname": "audio-node-1",
            "status": "ONLINE",
            "ip_address": "192.168.1.100",
            "port": 8080,
            "is_responsive": True,
            "response_time_ms": 5.2,
            "active_flow_ids": ["flow-1", "flow-2"],
            "active_flow_count": 2,
            "last_seen": "2026-02-05T10:29:55Z",
            "connected_since": "2026-02-05T08:00:00Z",
            "warning_level": 0,
        },
        {
            "node_id": "node-2",
            "hostname": "audio-node-2",
            "status": "ONLINE",
            "ip_address": "192.168.1.101",
            "port": 8080,
            "is_responsive": True,
            "response_time_ms": 4.8,
            "active_flow_ids": ["flow-3"],
            "active_flow_count": 1,
            "last_seen": "2026-02-05T10:29:55Z",
            "connected_since": "2026-02-05T07:00:00Z",
            "warning_level": 0,
        },
        {
            "node_id": "node-3",
            "hostname": "audio-node-3",
            "status": "OFFLINE",
            "ip_address": "192.168.1.102",
            "port": 8080,
            "is_responsive": False,
            "response_time_ms": 0.0,
            "active_flow_ids": [],
            "active_flow_count": 0,
            "last_seen": "2026-02-05T09:30:00Z",
            "connected_since": None,
            "warning_level": 2,
        },
    ]


# ============================================================================
# Test Data Fixtures - Flows & Assignments
# ============================================================================

@pytest.fixture
def sample_flow_assignment() -> FlowAssignment:
    """Sample flow assignment."""
    return FlowAssignment(
        flow_id="flow-123",
        chain_id=1,
        primary_node_id="node-1",
        standby_node_ids=["node-2"],
        redundancy_enabled=True,
        redundancy_mode="hot-standby",
        is_active=True,
        is_healthy=True,
        cpu_usage_percent=25.0,
        memory_usage_mb=256.5,
        latency_ms=2.3,
        assigned_at="2026-02-05T09:00:00Z",
        last_verified="2026-02-05T10:29:55Z"
    )


@pytest.fixture
def sample_assignments_dict() -> Dict[str, Dict[str, Any]]:
    """Sample assignments for API response."""
    return {
        "flow-123": {
            "flow_id": "flow-123",
            "chain_id": 1,
            "primary_node_id": "node-1",
            "standby_node_ids": ["node-2"],
            "redundancy_enabled": True,
            "redundancy_mode": "hot-standby",
            "is_active": True,
            "is_healthy": True,
            "cpu_usage_percent": 25.0,
            "memory_usage_mb": 256.5,
            "latency_ms": 2.3,
            "assigned_at": "2026-02-05T09:00:00Z",
            "last_verified": "2026-02-05T10:29:55Z",
        },
        "flow-124": {
            "flow_id": "flow-124",
            "chain_id": 2,
            "primary_node_id": "node-2",
            "standby_node_ids": [],
            "redundancy_enabled": False,
            "redundancy_mode": "none",
            "is_active": True,
            "is_healthy": True,
            "cpu_usage_percent": 18.5,
            "memory_usage_mb": 192.0,
            "latency_ms": 3.1,
            "assigned_at": "2026-02-05T09:15:00Z",
            "last_verified": "2026-02-05T10:29:55Z",
        },
    }


# ============================================================================
# Test Data Fixtures - Health & Events
# ============================================================================

@pytest.fixture
def sample_health_report() -> Dict[str, Any]:
    """Sample cluster health report."""
    return {
        "timestamp": "2026-02-05T10:30:00Z",
        "overall_health": 92,
        "nodes_online": 2,
        "nodes_offline": 1,
        "nodes_degraded": 0,
        "nodes_maintenance": 0,
        "avg_cpu_percent": 35.2,
        "avg_memory_percent": 55.0,
        "avg_latency_ms": 2.5,
        "critical_issues": [],
        "warnings": ["Node node-3 offline"],
        "total_cpu_capacity": 400.0,
        "used_cpu_percent": 35.2,
        "total_memory_gb": 128.0,
        "used_memory_gb": 70.4,
    }


@pytest.fixture
def sample_events_list() -> List[Dict[str, Any]]:
    """Sample cluster events."""
    return [
        {
            "event_id": "evt-1",
            "event_type": "node_online",
            "timestamp": "2026-02-05T10:30:00Z",
            "node_id": "node-1",
            "flow_id": None,
            "chain_id": None,
            "message": "Node node-1 came online",
            "severity": "info",
            "metadata": {},
        },
        {
            "event_id": "evt-2",
            "event_type": "assignment_created",
            "timestamp": "2026-02-05T10:31:00Z",
            "node_id": "node-1",
            "flow_id": "flow-123",
            "chain_id": 1,
            "message": "Flow flow-123 assigned to node-1",
            "severity": "info",
            "metadata": {},
        },
    ]


# ============================================================================
# Mock Response Fixtures
# ============================================================================

@pytest.fixture
def mock_nodes_response(sample_nodes_list: List[Dict]) -> MagicMock:
    """Mock response for get_nodes."""
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"nodes": sample_nodes_list}
    return response


@pytest.fixture
def mock_assignments_response(sample_assignments_dict: Dict) -> MagicMock:
    """Mock response for get_flow_assignments."""
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"assignments": sample_assignments_dict}
    return response


@pytest.fixture
def mock_health_response(sample_health_report: Dict) -> MagicMock:
    """Mock response for get_cluster_health."""
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = sample_health_report
    return response


# ============================================================================
# API Error Response Fixtures
# ============================================================================

@pytest.fixture
def mock_not_found_response() -> MagicMock:
    """Mock 404 response."""
    response = MagicMock()
    response.status_code = 404
    response.text = "Not Found"
    return response


@pytest.fixture
def mock_server_error_response() -> MagicMock:
    """Mock 500 response."""
    response = MagicMock()
    response.status_code = 500
    response.text = "Internal Server Error"
    return response


# ============================================================================
# Utility Fixtures
# ============================================================================

@pytest.fixture
def sample_node_ids() -> List[str]:
    """List of sample node IDs."""
    return ["node-1", "node-2", "node-3", "node-4", "node-5"]


@pytest.fixture
def sample_flow_ids() -> List[str]:
    """List of sample flow IDs."""
    return ["flow-1", "flow-2", "flow-3", "flow-4", "flow-5"]


@pytest.fixture
def mock_time_string() -> str:
    """Sample ISO timestamp."""
    return "2026-02-05T10:30:00Z"


# ============================================================================
# Async Test Helpers
# ============================================================================

@pytest.fixture
def async_mock_response():
    """Create async mock response."""
    async def make_response(status: int = 200, data: Dict = None):
        response = AsyncMock()
        response.status_code = status
        response.json = AsyncMock(return_value=data or {})
        return response
    return make_response


# ============================================================================
# Parameterized Test Data
# ============================================================================

@pytest.fixture(
    params=["ONLINE", "OFFLINE", "DEGRADED", "MAINTENANCE"]
)
def node_status_values(request):
    """Parameterized node status values."""
    return request.param


@pytest.fixture(
    params=["info", "success", "warning", "error"]
)
def notification_severities(request):
    """Parameterized notification severities."""
    return request.param
