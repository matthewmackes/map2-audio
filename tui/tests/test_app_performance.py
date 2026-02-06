"""
Performance-focused tests for the cluster management TUI.
Uses coarse timing checks to validate reasonable responsiveness.
"""

import time
import pytest
from unittest.mock import AsyncMock

try:
    from tui.apps.nav_controller import NavigationController, ScreenName
    from tui.cluster_api_client import ClusterAPIClient
    from tui.cluster_websocket import ClusterWebSocketManager
    APPS_AVAILABLE = True
except ImportError:
    APPS_AVAILABLE = False


@pytest.mark.skipif(not APPS_AVAILABLE, reason="Apps not available")
class TestNavigationPerformance:
    """Navigation performance tests."""

    @pytest.mark.asyncio
    async def test_navigation_latency_under_threshold(self):
        """Ensure navigation completes within a reasonable threshold."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        nav = NavigationController(api_client, ws_manager)

        start = time.perf_counter()
        await nav.navigate_to(ScreenName.MATRIX)
        end = time.perf_counter()

        # Allow generous threshold for CI environments
        assert (end - start) < 1.0

    @pytest.mark.asyncio
    async def test_multiple_navigation_cycles(self):
        """Ensure repeated navigation cycles stay responsive."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        nav = NavigationController(api_client, ws_manager)

        start = time.perf_counter()
        for _ in range(5):
            await nav.navigate_to(ScreenName.MATRIX)
            await nav.navigate_to(ScreenName.DASHBOARD)
        end = time.perf_counter()

        assert (end - start) < 5.0


@pytest.mark.skipif(not APPS_AVAILABLE, reason="Apps not available")
class TestContextPerformance:
    """Context update performance tests."""

    def test_context_update_speed(self):
        """Ensure context updates are fast."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        nav = NavigationController(api_client, ws_manager)

        start = time.perf_counter()
        for i in range(1000):
            nav.update_context(selected_node_id=f"node-{i}")
        end = time.perf_counter()

        assert (end - start) < 0.5
