"""
User interaction tests for cluster management app.
Validates keyboard actions and screen switching logic.
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
class TestKeyboardActions:
    """Keyboard interaction tests."""

    @pytest.mark.asyncio
    async def test_switch_to_dashboard_action(self):
        """Switch to dashboard via action."""
        app = ClusterManagementApp()

        # Mock container and notification
        container = MagicMock()
        container.children = []
        app.query_one = MagicMock(return_value=container)

        await app.action_switch_to_dashboard()
        assert app.current_screen_name == "Dashboard"

    @pytest.mark.asyncio
    async def test_switch_to_matrix_action(self):
        """Switch to matrix via action."""
        app = ClusterManagementApp()

        # Mock container and notification
        container = MagicMock()
        container.children = []
        app.query_one = MagicMock(return_value=container)

        await app.action_switch_to_matrix()
        assert app.current_screen_name == "Assignment Matrix"

    @pytest.mark.asyncio
    async def test_switch_to_recommendations_action(self):
        """Switch to recommendations via action."""
        app = ClusterManagementApp()

        container = MagicMock()
        container.children = []
        app.query_one = MagicMock(return_value=container)

        await app.action_switch_to_recommendations()
        assert app.current_screen_name == "Recommendations"

    @pytest.mark.asyncio
    async def test_switch_to_failover_action(self):
        """Switch to failover via action."""
        app = ClusterManagementApp()

        container = MagicMock()
        container.children = []
        app.query_one = MagicMock(return_value=container)

        await app.action_switch_to_failover()
        assert app.current_screen_name == "Failover"

    @pytest.mark.asyncio
    async def test_switch_to_diagnostics_action(self):
        """Switch to diagnostics via action."""
        app = ClusterManagementApp()

        container = MagicMock()
        container.children = []
        app.query_one = MagicMock(return_value=container)

        await app.action_switch_to_diagnostics()
        assert app.current_screen_name == "Diagnostics"

    @pytest.mark.asyncio
    async def test_switch_to_batch_action(self):
        """Switch to batch operations via action."""
        app = ClusterManagementApp()

        container = MagicMock()
        container.children = []
        app.query_one = MagicMock(return_value=container)

        await app.action_switch_to_batch()
        assert app.current_screen_name == "Batch Operations"

    @pytest.mark.asyncio
    async def test_switch_to_help_action(self):
        """Switch to help via action."""
        app = ClusterManagementApp()

        container = MagicMock()
        container.children = []
        app.query_one = MagicMock(return_value=container)

        await app.action_switch_to_help()
        assert app.current_screen_name == "Help"

    @pytest.mark.asyncio
    async def test_switch_to_settings_action(self):
        """Switch to settings action should not crash."""
        app = ClusterManagementApp()

        # Mock notifications
        notif = MagicMock()
        app.query_one = MagicMock(return_value=notif)

        await app.action_switch_to_settings()

    @pytest.mark.asyncio
    async def test_toggle_logs_action(self):
        """Toggle logs state."""
        app = ClusterManagementApp()

        # Mock notifications
        notif = MagicMock()
        app.query_one = MagicMock(return_value=notif)

        await app.action_toggle_logs()
        assert app.log_enabled is True

        await app.action_toggle_logs()
        assert app.log_enabled is False


@pytest.mark.skipif(not APPS_AVAILABLE, reason="Apps not available")
class TestNavigationControllerInteractions:
    """Navigation controller interaction tests."""

    @pytest.mark.asyncio
    async def test_navigation_sequence(self):
        """Test navigation sequence through multiple screens."""
        nav = NavigationController(ClusterAPIClient(), ClusterWebSocketManager())

        await nav.navigate_to(ScreenName.MATRIX)
        assert nav.get_current_screen() == ScreenName.MATRIX

        await nav.navigate_to(ScreenName.SETTINGS)
        assert nav.get_current_screen() == ScreenName.SETTINGS

        await nav.navigate_back()
        assert nav.get_current_screen() == ScreenName.MATRIX

        await nav.navigate_back()
        assert nav.get_current_screen() == ScreenName.DASHBOARD

    def test_navigation_history(self):
        """Test navigation history tracking."""
        nav = NavigationController(ClusterAPIClient(), ClusterWebSocketManager())

        assert nav.get_screen_history() == [ScreenName.DASHBOARD]

    def test_context_metadata_updates(self):
        """Test updating metadata in context."""
        nav = NavigationController(ClusterAPIClient(), ClusterWebSocketManager())
        nav.update_context(custom_key="custom_value")

        assert nav.get_context().metadata["custom_key"] == "custom_value"
