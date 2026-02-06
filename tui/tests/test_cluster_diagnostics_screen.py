"""Tests for ClusterDiagnosticsScreen."""
import pytest
from unittest.mock import MagicMock, AsyncMock

try:
    from tui.screens.cluster_diagnostics_screen import ClusterDiagnosticsScreen
    from tui.cluster_api_client import ClusterAPIClient
    from tui.cluster_types import ClusterHealthReport
    SCREEN_AVAILABLE = True
except ImportError:
    SCREEN_AVAILABLE = False


@pytest.mark.skipif(not SCREEN_AVAILABLE, reason="Screen not available")
class TestClusterDiagnosticsScreen:
    """Unit tests for ClusterDiagnosticsScreen."""

    def test_init(self):
        """Test initialization."""
        api_client = ClusterAPIClient()
        screen = ClusterDiagnosticsScreen(api_client=api_client)
        assert screen.api_client == api_client
        assert screen.health_report is None

    def test_render_health(self):
        """Test health report rendering."""
        api_client = ClusterAPIClient()
        screen = ClusterDiagnosticsScreen(api_client=api_client)

        report = MagicMock(spec=ClusterHealthReport)
        report.overall_health = 85
        report.nodes_online = 3
        report.nodes_offline = 1
        report.avg_cpu_percent = 45.0
        report.avg_latency_ms = 25.5
        report.critical_issues = []
        report.warnings = ["High memory on node-2"]
        screen.health_report = report

        label = MagicMock()
        grid = MagicMock()
        screen.query_one = MagicMock(side_effect=[label, grid])

        screen._render_health()
        label.update.assert_called_once()
        grid.set_data.assert_called_once()

    @pytest.mark.asyncio
    async def test_load_health_success(self):
        """Test successful health load."""
        api_client = ClusterAPIClient()
        health_result = MagicMock(success=True, data=MagicMock(spec=ClusterHealthReport))
        api_client.get_cluster_health = AsyncMock(return_value=health_result)

        screen = ClusterDiagnosticsScreen(api_client=api_client)
        notif = MagicMock()
        screen.query_one = MagicMock(return_value=notif)

        await screen._load_health()
        api_client.get_cluster_health.assert_called_once()
        notif.show.assert_called_once()
