"""
End-to-end workflow tests for cluster management TUI.
Validates navigation flows, reconnection logic, and state persistence.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

try:
    from tui.apps.cluster_management_app import ClusterManagementApp
    from tui.apps.nav_controller import NavigationController, ScreenName
    from tui.cluster_api_client import ClusterAPIClient
    from tui.cluster_websocket import ClusterWebSocketManager
    APPS_AVAILABLE = True
except ImportError:
    APPS_AVAILABLE = False


@pytest.mark.skipif(not APPS_AVAILABLE, reason="Apps not available")
class TestE2EWorkflows:
    """End-to-end workflow tests."""

    @pytest.mark.asyncio
    async def test_navigation_dashboard_to_matrix_and_back(self):
        """Navigate Dashboard → Matrix → Back and verify state."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        nav = NavigationController(api_client, ws_manager)

        # Start on dashboard
        assert nav.get_current_screen() == ScreenName.DASHBOARD

        # Navigate to matrix
        result = await nav.navigate_to(ScreenName.MATRIX)
        assert result is True
        assert nav.get_current_screen() == ScreenName.MATRIX

        # Navigate back
        result = await nav.navigate_back()
        assert result is True
        assert nav.get_current_screen() == ScreenName.DASHBOARD

    @pytest.mark.asyncio
    async def test_navigation_with_context_persistence(self):
        """Ensure context persists across screen transitions."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        nav = NavigationController(api_client, ws_manager)

        nav.update_context(selected_node_id="node-1", selected_flow_id="flow-9")

        await nav.navigate_to(ScreenName.MATRIX)
        ctx = nav.get_context()
        assert ctx.selected_node_id == "node-1"
        assert ctx.selected_flow_id == "flow-9"

        await nav.navigate_to(ScreenName.SETTINGS)
        ctx = nav.get_context()
        assert ctx.selected_node_id == "node-1"
        assert ctx.selected_flow_id == "flow-9"

    @pytest.mark.asyncio
    async def test_reconnect_workflow(self):
        """Simulate reconnect workflow without real network calls."""
        app = ClusterManagementApp(api_url="http://test:8080", ws_url="ws://test:8080")

        # Mock connect/disconnect
        app.api_client.connect = AsyncMock(return_value=True)
        app.api_client.disconnect = AsyncMock()
        app.ws_manager.disconnect = AsyncMock()

        # Action should not raise
        await app.action_reconnect()

        app.api_client.disconnect.assert_called_once()
        app.ws_manager.disconnect.assert_called_once()
        app.api_client.connect.assert_called_once()

    @pytest.mark.asyncio
    async def test_navigation_error_handling(self):
        """Ensure navigation errors are handled and state reverts."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        nav = NavigationController(api_client, ws_manager)

        # Inject a failing callback
        async def failing_callback(_from, _to):
            raise RuntimeError("navigation error")

        nav.register_callback("before_navigate", failing_callback)

        result = await nav.navigate_to(ScreenName.MATRIX)
        assert result is False
        assert nav.get_current_screen() == ScreenName.DASHBOARD


@pytest.mark.skipif(not APPS_AVAILABLE, reason="Apps not available")
class TestAppLifecycle:
    """App lifecycle behavior tests."""

    @pytest.mark.asyncio
    async def test_app_mount_connects(self):
        """Ensure on_mount attempts to connect."""
        app = ClusterManagementApp()
        app.api_client.connect = AsyncMock(return_value=True)

        await app.on_mount()

        app.api_client.connect.assert_called_once()

    @pytest.mark.asyncio
    async def test_app_unmount_disconnects(self):
        """Ensure on_unmount disconnects clients."""
        app = ClusterManagementApp()
        app.api_client.disconnect = AsyncMock()
        app.ws_manager.disconnect = AsyncMock()

        await app.on_unmount()

        app.api_client.disconnect.assert_called_once()
        app.ws_manager.disconnect.assert_called_once()
