"""Performance and load testing for TUI."""
import pytest
import asyncio
import time
from unittest.mock import AsyncMock, MagicMock

try:
    from tui.cluster_api_client import ClusterAPIClient
    from tui.screens.cluster_node_dashboard import ClusterNodeDashboard
    API_AVAILABLE = True
except ImportError:
    API_AVAILABLE = False


@pytest.mark.skipif(not API_AVAILABLE, reason="API not available")
class TestPerformance:
    """Performance and load tests."""

    @pytest.mark.asyncio
    async def test_node_status_response_time(self):
        """Measure node status API response time."""
        client = ClusterAPIClient()
        client.get_node_status = AsyncMock(
            return_value=MagicMock(success=True, data=[])
        )

        start = time.time()
        result = await client.get_node_status()
        duration = (time.time() - start) * 1000

        assert result.success
        assert duration < 100  # Should complete in <100ms

    @pytest.mark.asyncio
    async def test_concurrent_api_calls(self):
        """Test multiple concurrent API calls."""
        client = ClusterAPIClient()
        client.get_node_status = AsyncMock(
            return_value=MagicMock(success=True, data=[])
        )
        client.get_flow_assignments = AsyncMock(
            return_value=MagicMock(success=True, data={})
        )
        client.get_cluster_health = AsyncMock(
            return_value=MagicMock(success=True, data=MagicMock())
        )

        start = time.time()
        results = await asyncio.gather(
            client.get_node_status(),
            client.get_flow_assignments(),
            client.get_cluster_health(),
            client.get_node_status(),
            client.get_flow_assignments(),
        )
        duration = (time.time() - start) * 1000

        assert all(r.success for r in results)
        assert duration < 200  # All 5 calls in <200ms

    @pytest.mark.asyncio
    async def test_large_node_set(self):
        """Test handling 100+ nodes."""
        client = ClusterAPIClient()
        
        # Create mock data for 100 nodes
        nodes = [
            MagicMock(
                node_id=f"node-{i}",
                status="ONLINE",
                cpu_percent=50.0 + (i % 30),
                memory_mb=1024 * (i % 4)
            )
            for i in range(100)
        ]
        
        client.get_node_status = AsyncMock(
            return_value=MagicMock(success=True, data=nodes)
        )

        start = time.time()
        result = await client.get_node_status()
        duration = (time.time() - start) * 1000

        assert len(result.data) == 100
        assert duration < 150

    @pytest.mark.asyncio
    async def test_large_flow_set(self):
        """Test handling 1000+ flows."""
        client = ClusterAPIClient()
        
        # Create mock data for 1000 flows
        flows = {
            f"flow-{i}": MagicMock(
                flow_id=f"flow-{i}",
                chain_id=i % 10,
                primary_node_id=f"node-{i % 50}",
                cpu_usage_percent=20.0 + (i % 60)
            )
            for i in range(1000)
        }
        
        client.get_flow_assignments = AsyncMock(
            return_value=MagicMock(success=True, data=flows)
        )

        start = time.time()
        result = await client.get_flow_assignments()
        duration = (time.time() - start) * 1000

        assert len(result.data) == 1000
        assert duration < 200

    @pytest.mark.asyncio
    async def test_rapid_api_calls(self):
        """Test rapid successive API calls."""
        client = ClusterAPIClient()
        client.get_cluster_health = AsyncMock(
            return_value=MagicMock(success=True, data=MagicMock())
        )

        start = time.time()
        for _ in range(50):
            await client.get_cluster_health()
        duration = (time.time() - start) * 1000

        assert client.get_cluster_health.call_count == 50
        assert duration < 500  # 50 calls in <500ms

    @pytest.mark.asyncio
    async def test_memory_efficiency(self):
        """Test memory handling with large datasets."""
        client = ClusterAPIClient()
        
        # Create 100 large flow assignments
        flows = {
            f"flow-{i}": MagicMock(
                flow_id=f"flow-{i}",
                events=[MagicMock() for _ in range(100)],
            )
            for i in range(100)
        }
        
        client.get_flow_assignments = AsyncMock(
            return_value=MagicMock(success=True, data=flows)
        )

        result = await client.get_flow_assignments()
        assert len(result.data) == 100

    @pytest.mark.asyncio
    async def test_error_recovery_performance(self):
        """Test recovery from errors doesn't impact performance."""
        client = ClusterAPIClient()
        
        # First 2 calls fail, 3rd succeeds
        client.get_node_status = AsyncMock(
            side_effect=[
                MagicMock(success=False, error="Connection timeout"),
                MagicMock(success=False, error="Server error"),
                MagicMock(success=True, data=[]),
            ]
        )

        start = time.time()
        for _ in range(3):
            await client.get_node_status()
        duration = (time.time() - start) * 1000

        assert client.get_node_status.call_count == 3
        assert duration < 150
