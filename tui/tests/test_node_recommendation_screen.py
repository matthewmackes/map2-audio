"""
Tests for NodeRecommendationScreen.
"""

import pytest
from unittest.mock import MagicMock, AsyncMock

try:
    from tui.screens.node_recommendation_screen import NodeRecommendationScreen
    from tui.cluster_api_client import ClusterAPIClient
    from tui.cluster_types import AssignmentRecommendation, FlowAssignment
    SCREEN_AVAILABLE = True
except ImportError:
    SCREEN_AVAILABLE = False


@pytest.mark.skipif(not SCREEN_AVAILABLE, reason="Screen not available")
class TestNodeRecommendationScreen:
    """Unit tests for NodeRecommendationScreen."""

    def test_init(self):
        """Test initialization."""
        api_client = ClusterAPIClient()
        screen = NodeRecommendationScreen(api_client=api_client)
        assert screen.api_client == api_client
        assert screen.assignments == {}
        assert screen.recommendations == []

    def test_render_flow_list(self):
        """Test flow list rendering with mock list widget."""
        api_client = ClusterAPIClient()
        screen = NodeRecommendationScreen(api_client=api_client)

        assignment = MagicMock(spec=FlowAssignment)
        assignment.flow_id = "flow-1"
        assignment.chain_id = 1
        assignment.primary_node_id = "node-1"
        screen.assignments = {"flow-1": assignment}

        list_widget = MagicMock()
        screen.query_one = MagicMock(return_value=list_widget)

        screen._render_flow_list()
        list_widget.set_items.assert_called_once()

    def test_render_recommendations(self):
        """Test recommendation rendering."""
        api_client = ClusterAPIClient()
        screen = NodeRecommendationScreen(api_client=api_client)

        rec = MagicMock(spec=AssignmentRecommendation)
        rec.recommended_node_id = "node-2"
        rec.confidence = 0.95
        rec.reason = "Low latency"
        rec.estimated_cpu = 12.5
        rec.estimated_memory_mb = 256.0
        screen.recommendations = [rec]

        grid = MagicMock()
        screen.query_one = MagicMock(return_value=grid)

        screen._render_recommendations()
        grid.set_data.assert_called_once()

    @pytest.mark.asyncio
    async def test_fetch_recommendations_requires_selection(self):
        """Ensure selection required before fetching recommendations."""
        api_client = ClusterAPIClient()
        screen = NodeRecommendationScreen(api_client=api_client)

        notif = MagicMock()
        screen.query_one = MagicMock(return_value=notif)

        await screen._fetch_recommendations()
        notif.show.assert_called()

    @pytest.mark.asyncio
    async def test_fetch_recommendations_success(self):
        """Test successful recommendation fetch."""
        api_client = ClusterAPIClient()
        api_client.get_assignment_recommendations = AsyncMock(
            return_value=MagicMock(success=True, data=[])
        )

        screen = NodeRecommendationScreen(api_client=api_client)
        screen.selected_flow_id = "flow-1"
        screen.selected_chain_id = 1

        notif = MagicMock()
        grid = MagicMock()
        screen.query_one = MagicMock(side_effect=[notif, grid])

        await screen._fetch_recommendations()
        api_client.get_assignment_recommendations.assert_called_once()

    @pytest.mark.asyncio
    async def test_apply_top_recommendation_success(self):
        """Apply top recommendation assigns flow."""
        api_client = ClusterAPIClient()
        api_client.assign_flow = AsyncMock(return_value=MagicMock(success=True))

        screen = NodeRecommendationScreen(api_client=api_client)
        screen.selected_flow_id = "flow-1"
        screen.selected_chain_id = 1

        rec = MagicMock(spec=AssignmentRecommendation)
        rec.recommended_node_id = "node-2"
        screen.recommendations = [rec]

        notif = MagicMock()
        screen.query_one = MagicMock(return_value=notif)

        await screen._apply_top_recommendation()
        api_client.assign_flow.assert_called_once()
