"""Final E2E Tests - Complete application workflows."""
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock

try:
    from tui.apps.cluster_management_app import ClusterManagementApp
    from tui.cluster_api_client import ClusterAPIClient
    from tui.screens.cluster_node_dashboard import ClusterNodeDashboard
    from tui.screens.flow_assignment_matrix import FlowAssignmentMatrix
    from tui.screens.node_recommendation_screen import NodeRecommendationScreen
    from tui.screens.failover_controller_screen import FailoverControllerScreen
    from tui.screens.cluster_diagnostics_screen import ClusterDiagnosticsScreen
    from tui.screens.batch_operations_screen import BatchOperationsScreen
    from tui.screens.help_screen import HelpScreen
    FULL_STACK_AVAILABLE = True
except ImportError:
    FULL_STACK_AVAILABLE = False


@pytest.mark.skipif(not FULL_STACK_AVAILABLE, reason="Full stack not available")
class TestEndToEndWorkflows:
    """Complete end-to-end workflow tests."""

    @pytest.mark.asyncio
    async def test_full_dashboard_to_recommendations_workflow(self):
        """Test: Dashboard → Select Node → Get Recommendations → Apply."""
        api_client = ClusterAPIClient()
        
        # Mock API responses
        api_client.get_node_status = AsyncMock(
            return_value=MagicMock(success=True, data=[
                MagicMock(node_id="node-1", status="ONLINE")
            ])
        )
        api_client.get_flow_assignments = AsyncMock(
            return_value=MagicMock(success=True, data={
                "flow-1": MagicMock(flow_id="flow-1", chain_id=1)
            })
        )
        api_client.get_assignment_recommendations = AsyncMock(
            return_value=MagicMock(success=True, data=[
                MagicMock(recommended_node_id="node-2", confidence=0.95)
            ])
        )
        api_client.assign_flow = AsyncMock(
            return_value=MagicMock(success=True)
        )

        # Load and render dashboard
        dashboard = ClusterNodeDashboard(api_client=api_client)
        dashboard.query_one = MagicMock(return_value=MagicMock())
        await dashboard._load_nodes()
        assert api_client.get_node_status.called

        # Switch to recommendations
        rec_screen = NodeRecommendationScreen(api_client=api_client)
        rec_screen.query_one = MagicMock(return_value=MagicMock())
        await rec_screen._load_flows()
        assert api_client.get_flow_assignments.called

        # Get recommendations
        rec_screen.selected_flow_id = "flow-1"
        rec_screen.selected_chain_id = 1
        await rec_screen._fetch_recommendations()
        assert api_client.get_assignment_recommendations.called

        # Apply recommendation
        await rec_screen._apply_top_recommendation()
        assert api_client.assign_flow.called

    @pytest.mark.asyncio
    async def test_failover_recovery_workflow(self):
        """Test: Monitor Health → Detect Issue → Trigger Failover → Verify."""
        api_client = ClusterAPIClient()
        
        # Health check shows degradation
        api_client.get_cluster_health = AsyncMock(
            return_value=MagicMock(
                success=True,
                data=MagicMock(
                    overall_health=45,
                    critical_issues=["node-1 offline"]
                )
            )
        )
        
        # Diagnostics detects issue
        diag = ClusterDiagnosticsScreen(api_client=api_client)
        diag.query_one = MagicMock(return_value=MagicMock())
        await diag._load_health()
        assert api_client.get_cluster_health.called
        assert diag.health_report.overall_health == 45

        # Failover available
        api_client.get_flow_assignments = AsyncMock(
            return_value=MagicMock(success=True, data={
                "flow-1": MagicMock(
                    standby_node_ids=["node-2"],
                    primary_node_id="node-1"
                )
            })
        )
        
        api_client.trigger_failover = AsyncMock(
            return_value=MagicMock(success=True)
        )
        
        api_client.get_failover_history = AsyncMock(
            return_value=MagicMock(
                success=True,
                data=MagicMock(events=[])
            )
        )

        # Trigger failover
        failover = FailoverControllerScreen(api_client=api_client)
        failover.query_one = MagicMock(return_value=MagicMock())
        failover.selected_flow_id = "flow-1"
        failover.assignments = {
            "flow-1": MagicMock(standby_node_ids=["node-2"])
        }
        await failover._trigger_failover()
        assert api_client.trigger_failover.called

    @pytest.mark.asyncio
    async def test_batch_operations_workflow(self):
        """Test: Select Multiple Flows → Apply Batch Operation."""
        api_client = ClusterAPIClient()
        
        api_client.get_flow_assignments = AsyncMock(
            return_value=MagicMock(
                success=True,
                data={
                    "flow-1": MagicMock(),
                    "flow-2": MagicMock(),
                    "flow-3": MagicMock(),
                }
            )
        )

        batch = BatchOperationsScreen(api_client=api_client)
        batch.query_one = MagicMock(return_value=MagicMock())
        await batch.on_mount()
        
        assert len(batch.flows) == 3
        assert api_client.get_flow_assignments.called

    @pytest.mark.asyncio
    async def test_navigation_workflow(self):
        """Test: Navigate through all screens seamlessly."""
        app = ClusterManagementApp()
        container = MagicMock()
        container.children = []
        app.query_one = MagicMock(return_value=container)

        # Dashboard
        await app.action_switch_to_dashboard()
        assert app.current_screen_name == "Dashboard"

        # Matrix
        await app.action_switch_to_matrix()
        assert app.current_screen_name == "Assignment Matrix"

        # Recommendations
        await app.action_switch_to_recommendations()
        assert app.current_screen_name == "Recommendations"

        # Failover
        await app.action_switch_to_failover()
        assert app.current_screen_name == "Failover"

        # Diagnostics
        await app.action_switch_to_diagnostics()
        assert app.current_screen_name == "Diagnostics"

        # Batch
        await app.action_switch_to_batch()
        assert app.current_screen_name == "Batch Operations"

        # Help
        await app.action_switch_to_help()
        assert app.current_screen_name == "Help"

    @pytest.mark.asyncio
    async def test_error_recovery_full_workflow(self):
        """Test: Handle errors gracefully and recover."""
        api_client = ClusterAPIClient()
        
        # First call fails
        api_client.get_node_status = AsyncMock(
            side_effect=[
                MagicMock(success=False, error="Connection timeout"),
                MagicMock(success=True, data=[])
            ]
        )

        dashboard = ClusterNodeDashboard(api_client=api_client)
        dashboard.query_one = MagicMock(return_value=MagicMock())
        
        # First attempt fails
        await dashboard._load_nodes()
        
        # Second attempt succeeds
        await dashboard._load_nodes()
        assert api_client.get_node_status.call_count == 2

    @pytest.mark.asyncio
    async def test_concurrent_screen_operations(self):
        """Test: Multiple screens operating concurrently."""
        api_client = ClusterAPIClient()
        
        api_client.get_node_status = AsyncMock(
            return_value=MagicMock(success=True, data=[])
        )
        api_client.get_flow_assignments = AsyncMock(
            return_value=MagicMock(success=True, data={})
        )
        api_client.get_cluster_health = AsyncMock(
            return_value=MagicMock(success=True, data=MagicMock())
        )

        dashboard = ClusterNodeDashboard(api_client=api_client)
        dashboard.query_one = MagicMock(return_value=MagicMock())
        
        matrix = FlowAssignmentMatrix(api_client=api_client)
        matrix.query_one = MagicMock(return_value=MagicMock())
        
        diag = ClusterDiagnosticsScreen(api_client=api_client)
        diag.query_one = MagicMock(return_value=MagicMock())

        # Run all concurrently
        await asyncio.gather(
            dashboard._load_nodes(),
            matrix._load_assignments(),
            diag._load_health()
        )

        assert api_client.get_node_status.called
        assert api_client.get_flow_assignments.called
        assert api_client.get_cluster_health.called

    @pytest.mark.asyncio
    async def test_stress_test_rapid_switching(self):
        """Test: Rapid screen switching under load."""
        app = ClusterManagementApp()
        container = MagicMock()
        container.children = []
        app.query_one = MagicMock(return_value=container)

        screens = [
            ("action_switch_to_dashboard", "Dashboard"),
            ("action_switch_to_matrix", "Assignment Matrix"),
            ("action_switch_to_recommendations", "Recommendations"),
            ("action_switch_to_failover", "Failover"),
            ("action_switch_to_diagnostics", "Diagnostics"),
        ]

        # Rapid switching cycle
        for _ in range(3):
            for action_name, expected_name in screens:
                action = getattr(app, action_name)
                await action()
                assert app.current_screen_name == expected_name
