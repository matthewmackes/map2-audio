"""
Tests for ClusterAPIClient
Unit and integration tests for API client endpoints.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import List, Dict, Any

# Try to import API client
try:
    from tui.cluster_api_client import ClusterAPIClient
    from tui.cluster_types import ClusterAPIResult, NodeStatus, FlowAssignment
    API_AVAILABLE = True
except ImportError:
    API_AVAILABLE = False


@pytest.mark.skipif(not API_AVAILABLE, reason="API client not available")
class TestClusterAPIClientInit:
    """Tests for ClusterAPIClient initialization."""
    
    def test_init_default(self):
        """Test default initialization."""
        client = ClusterAPIClient()
        assert client.base_url == "http://localhost:8080"
        assert client.timeout == 10.0
        assert client.session is None
    
    def test_init_custom(self):
        """Test custom initialization."""
        client = ClusterAPIClient(
            base_url="http://192.168.1.100:9000",
            timeout=30.0
        )
        assert client.base_url == "http://192.168.1.100:9000"
        assert client.timeout == 30.0
    
    def test_base_url_trailing_slash_stripped(self):
        """Test that trailing slash is removed from base URL."""
        client = ClusterAPIClient(base_url="http://localhost:8080/")
        assert client.base_url == "http://localhost:8080"


@pytest.mark.skipif(not API_AVAILABLE, reason="API client not available")
@pytest.mark.asyncio
class TestClusterAPIClientConnection:
    """Tests for connection management."""
    
    async def test_connect(self, mock_http_client: AsyncMock):
        """Test connecting to server."""
        client = ClusterAPIClient()
        
        # Mock httpx.AsyncClient
        with patch("tui.cluster_api_client.httpx.AsyncClient") as mock_async_client:
            mock_async_client.return_value = mock_http_client
            result = await client.connect()
            assert result is True
            assert client.session is not None
    
    async def test_disconnect(self, mock_api_client: ClusterAPIClient):
        """Test disconnecting."""
        await mock_api_client.disconnect()
        assert mock_api_client.session is None
    
    async def test_context_manager(self, mock_http_client: AsyncMock):
        """Test context manager usage."""
        client = ClusterAPIClient()
        
        # Mock httpx.AsyncClient
        with patch("tui.cluster_api_client.httpx.AsyncClient") as mock_async_client:
            mock_async_client.return_value = mock_http_client
            
            async with client as ctx:
                assert ctx.session is not None
            
            assert client.session is None


@pytest.mark.skipif(not API_AVAILABLE, reason="API client not available")
@pytest.mark.asyncio
class TestGetNodes:
    """Tests for get_nodes endpoint."""
    
    async def test_get_nodes_success(
        self,
        mock_api_client: ClusterAPIClient,
        sample_nodes_list: List[Dict]
    ):
        """Test successful node retrieval."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"nodes": sample_nodes_list}
        
        mock_api_client.session.get = AsyncMock(return_value=mock_response)
        
        result = await mock_api_client.get_nodes()
        
        assert result.success is True
        assert result.data is not None
        assert len(result.data) == 3
        assert isinstance(result.data[0], NodeStatus)
    
    async def test_get_nodes_error(self, mock_api_client: ClusterAPIClient):
        """Test error handling for get_nodes."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        
        mock_api_client.session.get = AsyncMock(return_value=mock_response)
        
        result = await mock_api_client.get_nodes()
        
        assert result.success is False
        assert result.error is not None


@pytest.mark.skipif(not API_AVAILABLE, reason="API client not available")
@pytest.mark.asyncio
class TestGetNode:
    """Tests for get_node endpoint."""
    
    async def test_get_node_success(
        self,
        mock_api_client: ClusterAPIClient,
        sample_nodes_list: List[Dict]
    ):
        """Test retrieving specific node."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = sample_nodes_list[0]
        
        mock_api_client.session.get = AsyncMock(return_value=mock_response)
        
        result = await mock_api_client.get_node("node-1")
        
        assert result.success is True
        assert result.data is not None
        assert isinstance(result.data, NodeStatus)
        assert result.data.node_id == "node-1"
    
    async def test_get_node_not_found(self, mock_api_client: ClusterAPIClient):
        """Test 404 for missing node."""
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.text = "Not Found"
        
        mock_api_client.session.get = AsyncMock(return_value=mock_response)
        
        result = await mock_api_client.get_node("missing-node")
        
        assert result.success is False
        assert result.error_code == "NOT_FOUND"


@pytest.mark.skipif(not API_AVAILABLE, reason="API client not available")
@pytest.mark.asyncio
class TestGetNodeMetrics:
    """Tests for get_node_metrics endpoint."""
    
    async def test_get_node_metrics_success(
        self,
        mock_api_client: ClusterAPIClient,
        sample_node_metrics
    ):
        """Test retrieving node metrics."""
        metrics_dict = {
            "cpu_percent": 45.0,
            "memory_percent": 62.1,
            "memory_mb": 16384,
            "memory_max_mb": 32000,
            "disk_percent": 75.0,
            "gpu_percent": 30.5,
            "gpu_memory_percent": 50.0,
            "temperature_c": 62.3,
            "uptime_seconds": 345600,
            "last_update": "2026-02-05T10:30:00Z",
        }
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = metrics_dict
        
        mock_api_client.session.get = AsyncMock(return_value=mock_response)
        
        result = await mock_api_client.get_node_metrics("node-1")
        
        assert result.success is True
        assert result.data is not None
        assert result.data.cpu_percent == 45.0
        assert result.data.memory_percent == 62.1


@pytest.mark.skipif(not API_AVAILABLE, reason="API client not available")
@pytest.mark.asyncio
class TestFlowAssignment:
    """Tests for flow assignment endpoints."""
    
    async def test_get_flow_assignments_success(
        self,
        mock_api_client: ClusterAPIClient,
        sample_assignments_dict: Dict
    ):
        """Test retrieving flow assignments."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"assignments": sample_assignments_dict}
        
        mock_api_client.session.get = AsyncMock(return_value=mock_response)
        
        result = await mock_api_client.get_flow_assignments()
        
        assert result.success is True
        assert isinstance(result.data, dict)
        assert "flow-123" in result.data
        assert isinstance(result.data["flow-123"], FlowAssignment)
    
    async def test_assign_flow_success(
        self,
        mock_api_client: ClusterAPIClient,
        sample_assignments_dict: Dict
    ):
        """Test assigning a flow."""
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = sample_assignments_dict["flow-123"]
        
        mock_api_client.session.post = AsyncMock(return_value=mock_response)
        
        result = await mock_api_client.assign_flow(
            flow_id="flow-123",
            chain_id=1,
            primary_node_id="node-1",
            standby_node_ids=["node-2"],
            redundancy_enabled=True
        )
        
        assert result.success is True
        assert isinstance(result.data, FlowAssignment)
        assert result.data.flow_id == "flow-123"
        assert result.data.primary_node_id == "node-1"
        
        # Verify POST was called with correct data
        call_args = mock_api_client.session.post.call_args
        assert "flow-123" in str(call_args)


@pytest.mark.skipif(not API_AVAILABLE, reason="API client not available")
@pytest.mark.asyncio
class TestClusterHealth:
    """Tests for cluster health endpoint."""
    
    async def test_get_cluster_health_success(
        self,
        mock_api_client: ClusterAPIClient,
        sample_health_report: Dict
    ):
        """Test retrieving cluster health."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = sample_health_report
        
        mock_api_client.session.get = AsyncMock(return_value=mock_response)
        
        result = await mock_api_client.get_cluster_health()
        
        assert result.success is True
        assert result.data is not None
        assert result.data.overall_health == 92
        assert result.data.nodes_online == 2
        assert result.data.nodes_offline == 1


@pytest.mark.skipif(not API_AVAILABLE, reason="API client not available")
@pytest.mark.asyncio
class TestClusterEvents:
    """Tests for cluster events endpoint."""
    
    async def test_get_cluster_events_success(
        self,
        mock_api_client: ClusterAPIClient,
        sample_events_list: List[Dict]
    ):
        """Test retrieving cluster events."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"events": sample_events_list}
        
        mock_api_client.session.get = AsyncMock(return_value=mock_response)
        
        result = await mock_api_client.get_cluster_events(limit=100, offset=0)
        
        assert result.success is True
        assert isinstance(result.data, list)
        assert len(result.data) == 2
    
    async def test_get_cluster_events_with_filter(self, mock_api_client: ClusterAPIClient):
        """Test filtering events by type."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"events": []}
        
        mock_api_client.session.get = AsyncMock(return_value=mock_response)
        
        result = await mock_api_client.get_cluster_events(
            limit=50,
            offset=0,
            event_type="node_online"
        )
        
        assert result.success is True
        
        # Verify filter was passed
        call_args = mock_api_client.session.get.call_args
        assert "event_type" in str(call_args)


@pytest.mark.skipif(not API_AVAILABLE, reason="API client not available")
class TestClusterAPIResult:
    """Tests for ClusterAPIResult wrapper."""
    
    def test_success_result(self):
        """Test successful result."""
        data = {"key": "value"}
        result = ClusterAPIResult(success=True, data=data)
        
        assert result.success is True
        assert result.data == data
        assert result.error is None
        assert result.is_error() is False
    
    def test_error_result(self):
        """Test error result."""
        result = ClusterAPIResult(
            success=False,
            error="Something went wrong",
            error_code="ERROR"
        )
        
        assert result.success is False
        assert result.is_error() is True
        assert result.get_error_message() == "Something went wrong"


@pytest.mark.skipif(not API_AVAILABLE, reason="API client not available")
@pytest.mark.asyncio
class TestErrorHandling:
    """Tests for error handling."""
    
    async def test_connection_error(self, mock_api_client: ClusterAPIClient):
        """Test handling connection errors."""
        mock_api_client.session.get = AsyncMock(side_effect=Exception("Connection failed"))
        
        result = await mock_api_client.get_nodes()
        
        assert result.success is False
        assert "Connection failed" in result.error or result.error is not None
    
    async def test_json_parse_error(self, mock_api_client: ClusterAPIClient):
        """Test handling JSON parse errors."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.side_effect = ValueError("Invalid JSON")
        
        mock_api_client.session.get = AsyncMock(return_value=mock_response)
        
        result = await mock_api_client.get_nodes()
        
        assert result.success is False


@pytest.mark.skipif(not API_AVAILABLE, reason="API client not available")
class TestParsingHelpers:
    """Tests for data parsing helpers."""
    
    def test_parse_node_status(self):
        """Test parsing node status."""
        data = {
            "node_id": "node-1",
            "hostname": "audio-1",
            "status": "ONLINE",
            "ip_address": "192.168.1.100",
            "port": 8080,
        }
        
        node = ClusterAPIClient._parse_node_status(data)
        
        assert node.node_id == "node-1"
        assert node.hostname == "audio-1"
        assert str(node.status) == "NodeState.ONLINE"
    
    def test_parse_metrics(self):
        """Test parsing metrics."""
        data = {
            "cpu_percent": 45.0,
            "memory_percent": 62.1,
            "uptime_seconds": 3600,
        }
        
        metrics = ClusterAPIClient._parse_metrics(data)
        
        assert metrics.cpu_percent == 45.0
        assert metrics.memory_percent == 62.1
        assert metrics.uptime_seconds == 3600
