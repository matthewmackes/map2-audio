"""
Tests for cluster screens
Unit and integration tests for dashboard and matrix screens.
"""

import pytest
from typing import Dict, Any
from unittest.mock import AsyncMock, MagicMock

# Try to import screens
try:
    from tui.screens.cluster_node_dashboard import (
        ClusterNodeDashboard, NodeMetricsPanel
    )
    from tui.screens.flow_assignment_matrix import (
        FlowAssignmentMatrix, MatrixCell, CellData
    )
    from tui.cluster_api_client import ClusterAPIClient
    from tui.cluster_types import NodeStatus, FlowAssignment
    SCREENS_AVAILABLE = True
except ImportError:
    SCREENS_AVAILABLE = False


@pytest.mark.skipif(not SCREENS_AVAILABLE, reason="Screens not available")
class TestClusterNodeDashboard:
    """Tests for ClusterNodeDashboard."""
    
    def test_init(self):
        """Test dashboard initialization."""
        client = ClusterAPIClient()
        dashboard = ClusterNodeDashboard(api_client=client)
        
        assert dashboard.api_client == client
        assert dashboard.nodes == {}
        assert dashboard.node_count == 0
        assert dashboard.online_count == 0
    
    def test_init_with_websocket(self):
        """Test initialization with WebSocket manager."""
        client = ClusterAPIClient()
        ws_manager = MagicMock()
        
        dashboard = ClusterNodeDashboard(
            api_client=client,
            websocket_manager=ws_manager
        )
        
        assert dashboard.websocket_manager == ws_manager
    
    def test_reactive_properties(self):
        """Test reactive properties."""
        client = ClusterAPIClient()
        dashboard = ClusterNodeDashboard(api_client=client)
        
        dashboard.node_count = 5
        dashboard.online_count = 4
        
        assert dashboard.node_count == 5
        assert dashboard.online_count == 4
    
    def test_nodes_storage(self):
        """Test node storage."""
        client = ClusterAPIClient()
        dashboard = ClusterNodeDashboard(api_client=client)
        
        # Add sample nodes
        node1 = MagicMock()
        node1.node_id = "node-1"
        node1.hostname = "audio-1"
        
        dashboard.nodes["node-1"] = node1
        
        assert "node-1" in dashboard.nodes
        assert dashboard.nodes["node-1"].hostname == "audio-1"


@pytest.mark.skipif(not SCREENS_AVAILABLE, reason="Screens not available")
class TestNodeMetricsPanel:
    """Tests for NodeMetricsPanel."""
    
    def test_init(self):
        """Test metrics panel initialization."""
        panel = NodeMetricsPanel(node_id="node-1")
        
        assert panel.node_id == "node-1"
        assert panel.node_data is None
    
    def test_update_metrics(self):
        """Test metrics update."""
        panel = NodeMetricsPanel(node_id="node-1")
        
        # Create mock node with metrics
        node = MagicMock()
        node.node_id = "node-1"
        node.hostname = "audio-1"
        node.metrics = MagicMock()
        node.metrics.cpu_percent = 45.0
        node.metrics.memory_percent = 62.1
        node.metrics.memory_mb = 16384
        node.metrics.memory_max_mb = 32000
        node.metrics.uptime_seconds = 3600
        node.response_time_ms = 5.2
        
        panel.update_metrics(node)
        
        assert panel.node_data == node
        assert panel.node_data.metrics.cpu_percent == 45.0


@pytest.mark.skipif(not SCREENS_AVAILABLE, reason="Screens not available")
class TestFlowAssignmentMatrix:
    """Tests for FlowAssignmentMatrix."""
    
    def test_init(self):
        """Test matrix initialization."""
        client = ClusterAPIClient()
        matrix = FlowAssignmentMatrix(api_client=client)
        
        assert matrix.api_client == client
        assert matrix.assignments == {}
        assert matrix.flow_count == 0
        assert matrix.assignment_count == 0
    
    def test_assignments_storage(self):
        """Test assignment storage."""
        client = ClusterAPIClient()
        matrix = FlowAssignmentMatrix(api_client=client)
        
        # Add sample assignment
        assignment = MagicMock()
        assignment.flow_id = "flow-1"
        assignment.primary_node_id = "node-1"
        
        matrix.assignments["flow-1"] = assignment
        
        assert "flow-1" in matrix.assignments
        assert matrix.assignments["flow-1"].primary_node_id == "node-1"
    
    def test_reactive_properties(self):
        """Test reactive properties."""
        client = ClusterAPIClient()
        matrix = FlowAssignmentMatrix(api_client=client)
        
        matrix.flow_count = 10
        matrix.assignment_count = 8
        
        assert matrix.flow_count == 10
        assert matrix.assignment_count == 8


@pytest.mark.skipif(not SCREENS_AVAILABLE, reason="Screens not available")
class TestMatrixCell:
    """Tests for MatrixCell."""
    
    def test_init(self):
        """Test cell initialization."""
        cell_data = CellData(
            flow_id="flow-1",
            node_id="node-1",
            is_assigned=True,
            is_primary=True,
            is_healthy=True,
            cpu_usage=45.0,
            latency_ms=2.5
        )
        
        cell = MatrixCell(cell_data=cell_data)
        
        assert cell.cell_data.flow_id == "flow-1"
        assert cell.cell_data.is_primary is True
        assert cell.cell_data.cpu_usage == 45.0
    
    def test_unassigned_cell(self):
        """Test unassigned cell."""
        cell_data = CellData(
            flow_id="flow-1",
            node_id="node-2",
            is_assigned=False,
            is_primary=False,
            is_healthy=True,
            cpu_usage=0.0,
            latency_ms=0.0
        )
        
        cell = MatrixCell(cell_data=cell_data)
        
        assert cell.cell_data.is_assigned is False
        assert cell.cell_data.is_primary is False
    
    def test_unhealthy_cell(self):
        """Test unhealthy cell."""
        cell_data = CellData(
            flow_id="flow-1",
            node_id="node-1",
            is_assigned=True,
            is_primary=True,
            is_healthy=False,
            cpu_usage=95.0,
            latency_ms=150.0
        )
        
        cell = MatrixCell(cell_data=cell_data)
        
        assert cell.cell_data.is_healthy is False
        assert cell.cell_data.cpu_usage == 95.0


@pytest.mark.skipif(not SCREENS_AVAILABLE, reason="Screens not available")
class TestCellData:
    """Tests for CellData dataclass."""
    
    def test_creation(self):
        """Test CellData creation."""
        cell = CellData(
            flow_id="flow-1",
            node_id="node-1",
            is_assigned=True,
            is_primary=True,
            is_healthy=True,
            cpu_usage=50.0,
            latency_ms=5.0
        )
        
        assert cell.flow_id == "flow-1"
        assert cell.node_id == "node-1"
        assert cell.is_assigned is True
        assert cell.is_primary is True
        assert cell.is_healthy is True
    
    def test_defaults(self):
        """Test CellData with different values."""
        cell1 = CellData(
            flow_id="flow-1",
            node_id="node-1",
            is_assigned=True,
            is_primary=True,
            is_healthy=True,
            cpu_usage=25.0,
            latency_ms=3.0
        )
        
        cell2 = CellData(
            flow_id="flow-2",
            node_id="node-2",
            is_assigned=False,
            is_primary=False,
            is_healthy=True,
            cpu_usage=0.0,
            latency_ms=0.0
        )
        
        assert cell1.flow_id != cell2.flow_id
        assert cell1.is_assigned != cell2.is_assigned


@pytest.mark.skipif(not SCREENS_AVAILABLE, reason="Screens not available")
class TestScreenIntegration:
    """Integration tests for screens."""
    
    def test_dashboard_with_api_client(self):
        """Test dashboard with API client integration."""
        client = ClusterAPIClient()
        dashboard = ClusterNodeDashboard(api_client=client)
        
        # Verify client is set
        assert dashboard.api_client == client
        assert dashboard.api_client.base_url == "http://localhost:8080"
    
    def test_matrix_with_api_client(self):
        """Test matrix with API client integration."""
        client = ClusterAPIClient(base_url="http://192.168.1.100:8080")
        matrix = FlowAssignmentMatrix(api_client=client)
        
        # Verify client is set with custom base URL
        assert matrix.api_client.base_url == "http://192.168.1.100:8080"
    
    def test_dashboard_node_management(self):
        """Test dashboard node management."""
        client = ClusterAPIClient()
        dashboard = ClusterNodeDashboard(api_client=client)
        
        # Add nodes
        node1 = MagicMock()
        node1.node_id = "node-1"
        node1.is_responsive = True
        
        node2 = MagicMock()
        node2.node_id = "node-2"
        node2.is_responsive = False
        
        dashboard.nodes = {"node-1": node1, "node-2": node2}
        
        # Verify nodes are stored
        assert len(dashboard.nodes) == 2
        assert dashboard.nodes["node-1"].is_responsive is True
        assert dashboard.nodes["node-2"].is_responsive is False


@pytest.mark.skipif(not SCREENS_AVAILABLE, reason="Screens not available")
@pytest.mark.asyncio
class TestScreenAsyncBehavior:
    """Test async behavior of screens."""
    
    async def test_dashboard_tasks_created(self):
        """Test that dashboard creates async tasks."""
        client = ClusterAPIClient()
        dashboard = ClusterNodeDashboard(api_client=client)
        
        # Verify no tasks running initially
        assert dashboard.update_task is None
        assert dashboard.ws_task is None
    
    async def test_matrix_tasks_created(self):
        """Test that matrix creates async tasks."""
        client = ClusterAPIClient()
        matrix = FlowAssignmentMatrix(api_client=client)
        
        # Verify no tasks running initially
        assert matrix.update_task is None
        assert matrix.ws_task is None


# Fixtures for screen testing

@pytest.fixture
def sample_dashboard(mock_api_client):
    """Create sample dashboard."""
    return ClusterNodeDashboard(api_client=mock_api_client)


@pytest.fixture
def sample_matrix(mock_api_client):
    """Create sample matrix."""
    return FlowAssignmentMatrix(api_client=mock_api_client)


@pytest.fixture
def sample_cell_data():
    """Create sample cell data."""
    return CellData(
        flow_id="flow-1",
        node_id="node-1",
        is_assigned=True,
        is_primary=True,
        is_healthy=True,
        cpu_usage=45.0,
        latency_ms=5.0
    )
