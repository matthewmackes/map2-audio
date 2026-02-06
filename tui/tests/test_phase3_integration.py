"""Phase 3 Integration Tests: High-priority features."""
import pytest
from unittest.mock import AsyncMock, MagicMock

try:
    from tui.screens.node_recommendation_screen import NodeRecommendationScreen
    from tui.screens.failover_controller_screen import FailoverControllerScreen
    from tui.screens.cluster_diagnostics_screen import ClusterDiagnosticsScreen
    from tui.cluster_api_client import ClusterAPIClient
    SCREENS_AVAILABLE = True
except ImportError:
    SCREENS_AVAILABLE = False


@pytest.mark.skipif(not SCREENS_AVAILABLE, reason="Screens not available")
class TestPhase3Integration:
    """Integration tests for Phase 3 screens."""

    def test_all_phase3_screens_instantiate(self):
        """Ensure all Phase 3 screens can be instantiated."""
        api_client = ClusterAPIClient()

        rec_screen = NodeRecommendationScreen(api_client=api_client)
        assert rec_screen.api_client == api_client

        failover_screen = FailoverControllerScreen(api_client=api_client)
        assert failover_screen.api_client == api_client

        diag_screen = ClusterDiagnosticsScreen(api_client=api_client)
        assert diag_screen.api_client == api_client

    @pytest.mark.asyncio
    async def test_recommendation_workflow(self):
        """Test full recommendation workflow."""
        api_client = ClusterAPIClient()
        api_client.get_flow_assignments = AsyncMock(
            return_value=MagicMock(success=True, data={})
        )
        api_client.get_assignment_recommendations = AsyncMock(
            return_value=MagicMock(success=True, data=[])
        )

        screen = NodeRecommendationScreen(api_client=api_client)
        screen.query_one = MagicMock(return_value=MagicMock())

        await screen._load_flows()
        assert api_client.get_flow_assignments.called

    @pytest.mark.asyncio
    async def test_failover_workflow(self):
        """Test full failover workflow."""
        api_client = ClusterAPIClient()
        api_client.get_flow_assignments = AsyncMock(
            return_value=MagicMock(success=True, data={})
        )
        api_client.get_failover_history = AsyncMock(
            return_value=MagicMock(success=True, data=MagicMock(events=[]))
        )

        screen = FailoverControllerScreen(api_client=api_client)
        screen.query_one = MagicMock(return_value=MagicMock())

        await screen._load_flows()
        assert api_client.get_flow_assignments.called

    @pytest.mark.asyncio
    async def test_diagnostics_workflow(self):
        """Test diagnostics workflow."""
        api_client = ClusterAPIClient()
        api_client.get_cluster_health = AsyncMock(
            return_value=MagicMock(success=True, data=MagicMock())
        )

        screen = ClusterDiagnosticsScreen(api_client=api_client)
        screen.query_one = MagicMock(return_value=MagicMock())

        await screen._load_health()
        assert api_client.get_cluster_health.called

    @pytest.mark.asyncio
    async def test_phase3_error_handling(self):
        """Ensure Phase 3 screens handle errors gracefully."""
        api_client = ClusterAPIClient()
        api_client.get_flow_assignments = AsyncMock(
            return_value=MagicMock(success=False, error="Connection failed")
        )

        screen = NodeRecommendationScreen(api_client=api_client)
        notif = MagicMock()
        screen.query_one = MagicMock(return_value=notif)

        await screen._load_flows()
        notif.show.assert_called()
