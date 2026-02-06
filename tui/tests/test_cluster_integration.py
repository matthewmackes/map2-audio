"""
Integration tests for cluster management app and navigation
Tests the main application, screen switching, and state management.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
import asyncio

try:
    from tui.apps.cluster_management_app import (
        ClusterManagementApp, StatusBar
    )
    from tui.apps.nav_controller import (
        NavigationController, NavigationContext, ScreenName,
        ScreenTransition, ScreenStack
    )
    from tui.cluster_api_client import ClusterAPIClient
    from tui.cluster_websocket import ClusterWebSocketManager
    APPS_AVAILABLE = True
except ImportError:
    APPS_AVAILABLE = False


@pytest.mark.skipif(not APPS_AVAILABLE, reason="Apps not available")
class TestStatusBar:
    """Tests for StatusBar widget."""
    
    def test_init(self):
        """Test status bar initialization."""
        bar = StatusBar()
        
        assert bar.current_screen == "Dashboard"
        assert bar.connection_status == "Connecting..."
    
    def test_update_screen_name(self):
        """Test updating screen name."""
        bar = StatusBar()
        bar.update_screen_name("Matrix")
        
        assert bar.current_screen == "Matrix"
    
    def test_update_connection_status(self):
        """Test updating connection status."""
        bar = StatusBar()
        bar.update_connection_status("Connected ✓")
        
        assert bar.connection_status == "Connected ✓"


@pytest.mark.skipif(not APPS_AVAILABLE, reason="Apps not available")
class TestClusterManagementApp:
    """Tests for ClusterManagementApp."""
    
    def test_init(self):
        """Test app initialization."""
        app = ClusterManagementApp(
            api_url="http://test:8080",
            ws_url="ws://test:8080"
        )
        
        assert app.api_url == "http://test:8080"
        assert app.ws_url == "ws://test:8080"
        assert app.current_screen_name == "Dashboard"
        assert isinstance(app.api_client, ClusterAPIClient)
        assert isinstance(app.ws_manager, ClusterWebSocketManager)
    
    def test_default_urls(self):
        """Test default URL initialization."""
        app = ClusterManagementApp()
        
        assert app.api_url == "http://localhost:8080"
        assert app.ws_url == "ws://localhost:8080"
    
    def test_api_client_initialization(self):
        """Test API client initialization."""
        app = ClusterManagementApp(
            api_url="http://custom:9000",
            ws_url="ws://custom:9000"
        )
        
        assert app.api_client.base_url == "http://custom:9000"
        assert app.ws_manager.base_url == "ws://custom:9000"
    
    def test_bindings(self):
        """Test keyboard bindings."""
        app = ClusterManagementApp()
        
        # Check key bindings exist
        binding_keys = [b.key for b in app.BINDINGS]
        assert "1" in binding_keys
        assert "2" in binding_keys
        assert "3" in binding_keys
        assert "4" in binding_keys
        assert "5" in binding_keys
        assert "6" in binding_keys
        assert "7" in binding_keys
        assert "ctrl+q" in binding_keys


@pytest.mark.skipif(not APPS_AVAILABLE, reason="Apps not available")
class TestNavigationContext:
    """Tests for NavigationContext."""
    
    def test_creation(self):
        """Test context creation."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        
        context = NavigationContext(
            api_client=api_client,
            ws_manager=ws_manager
        )
        
        assert context.api_client == api_client
        assert context.ws_manager == ws_manager
        assert context.selected_node_id is None
        assert context.metadata == {}
    
    def test_with_selection(self):
        """Test context with selection."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        
        context = NavigationContext(
            api_client=api_client,
            ws_manager=ws_manager,
            selected_node_id="node-1",
            selected_flow_id="flow-1"
        )
        
        assert context.selected_node_id == "node-1"
        assert context.selected_flow_id == "flow-1"


@pytest.mark.skipif(not APPS_AVAILABLE, reason="Apps not available")
class TestScreenTransition:
    """Tests for ScreenTransition."""
    
    def test_creation(self):
        """Test transition creation."""
        trans = ScreenTransition(
            ScreenName.DASHBOARD,
            ScreenName.MATRIX,
            animation_duration=0.2
        )
        
        assert trans.from_screen == ScreenName.DASHBOARD
        assert trans.to_screen == ScreenName.MATRIX
        assert trans.animation_duration == 0.2
        assert not trans.is_complete
    
    @pytest.mark.asyncio
    async def test_execute(self):
        """Test transition execution."""
        trans = ScreenTransition(
            ScreenName.DASHBOARD,
            ScreenName.MATRIX,
            animation_duration=0.05
        )
        
        await trans.execute()
        
        assert trans.is_complete


@pytest.mark.skipif(not APPS_AVAILABLE, reason="Apps not available")
class TestNavigationController:
    """Tests for NavigationController."""
    
    def test_init(self):
        """Test controller initialization."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        
        nav = NavigationController(api_client, ws_manager)
        
        assert nav.api_client == api_client
        assert nav.ws_manager == ws_manager
        assert nav.current_screen == ScreenName.DASHBOARD
        assert nav.screen_history == [ScreenName.DASHBOARD]
    
    def test_get_current_screen(self):
        """Test getting current screen."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        nav = NavigationController(api_client, ws_manager)
        
        assert nav.get_current_screen() == ScreenName.DASHBOARD
    
    def test_can_navigate_back_initial(self):
        """Test can't navigate back from initial screen."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        nav = NavigationController(api_client, ws_manager)
        
        assert not nav.can_navigate_back()
    
    @pytest.mark.asyncio
    async def test_navigate_to(self):
        """Test navigating to screen."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        nav = NavigationController(api_client, ws_manager)
        
        result = await nav.navigate_to(ScreenName.MATRIX)
        
        assert result
        assert nav.current_screen == ScreenName.MATRIX
        assert ScreenName.MATRIX in nav.screen_history
    
    @pytest.mark.asyncio
    async def test_navigate_back(self):
        """Test navigating back."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        nav = NavigationController(api_client, ws_manager)
        
        # Navigate forward
        await nav.navigate_to(ScreenName.MATRIX)
        assert nav.current_screen == ScreenName.MATRIX
        
        # Navigate back
        result = await nav.navigate_back()
        assert result
        assert nav.current_screen == ScreenName.DASHBOARD
    
    def test_update_context(self):
        """Test updating navigation context."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        nav = NavigationController(api_client, ws_manager)
        
        nav.update_context(
            selected_node_id="node-1",
            custom_key="custom_value"
        )
        
        assert nav.context.selected_node_id == "node-1"
        assert nav.context.metadata["custom_key"] == "custom_value"
    
    def test_register_callback(self):
        """Test registering callback."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        nav = NavigationController(api_client, ws_manager)
        
        callback = AsyncMock()
        nav.register_callback("before_navigate", callback)
        
        assert callback in nav.on_before_navigate


@pytest.mark.skipif(not APPS_AVAILABLE, reason="Apps not available")
class TestScreenStack:
    """Tests for ScreenStack."""
    
    def test_init(self):
        """Test stack initialization."""
        stack = ScreenStack()
        
        assert stack.peek() == ScreenName.DASHBOARD
        assert stack.size() == 1
        assert not stack.can_pop()
    
    def test_push(self):
        """Test pushing to stack."""
        stack = ScreenStack()
        stack.push(ScreenName.MATRIX)
        
        assert stack.peek() == ScreenName.MATRIX
        assert stack.size() == 2
        assert stack.can_pop()
    
    def test_pop(self):
        """Test popping from stack."""
        stack = ScreenStack()
        stack.push(ScreenName.MATRIX)
        
        screen = stack.pop()
        
        assert screen == ScreenName.MATRIX
        assert stack.peek() == ScreenName.DASHBOARD
        assert not stack.can_pop()
    
    def test_clear(self):
        """Test clearing stack."""
        stack = ScreenStack()
        stack.push(ScreenName.MATRIX)
        stack.push(ScreenName.SETTINGS)
        
        stack.clear()
        
        assert stack.size() == 1
        assert stack.peek() == ScreenName.DASHBOARD


@pytest.mark.skipif(not APPS_AVAILABLE, reason="Apps not available")
class TestScreenName:
    """Tests for ScreenName enum."""
    
    def test_enum_values(self):
        """Test enum values."""
        assert ScreenName.DASHBOARD.value == "Dashboard"
        assert ScreenName.MATRIX.value == "Assignment Matrix"
        assert ScreenName.RECOMMENDATIONS.value == "Recommendations"
        assert ScreenName.FAILOVER.value == "Failover"
        assert ScreenName.DIAGNOSTICS.value == "Diagnostics"
        assert ScreenName.BATCH.value == "Batch Operations"
        assert ScreenName.HELP.value == "Help"
        assert ScreenName.SETTINGS.value == "Settings"
    
    def test_enum_comparison(self):
        """Test enum comparison."""
        screen1 = ScreenName.DASHBOARD
        screen2 = ScreenName.DASHBOARD
        screen3 = ScreenName.MATRIX
        
        assert screen1 == screen2
        assert screen1 != screen3


@pytest.mark.skipif(not APPS_AVAILABLE, reason="Apps not available")
class TestIntegration:
    """Integration tests for app and navigation."""
    
    def test_app_with_navigation(self):
        """Test app with navigation controller."""
        app = ClusterManagementApp()
        nav = NavigationController(
            app.api_client,
            app.ws_manager
        )
        
        assert nav.api_client == app.api_client
        assert nav.ws_manager == app.ws_manager
    
    @pytest.mark.asyncio
    async def test_navigation_workflow(self):
        """Test complete navigation workflow."""
        api_client = ClusterAPIClient()
        ws_manager = ClusterWebSocketManager()
        nav = NavigationController(api_client, ws_manager)
        
        # Start on dashboard
        assert nav.current_screen == ScreenName.DASHBOARD
        
        # Navigate to matrix
        await nav.navigate_to(ScreenName.MATRIX)
        assert nav.current_screen == ScreenName.MATRIX
        
        # Navigate to settings
        await nav.navigate_to(ScreenName.SETTINGS)
        assert nav.current_screen == ScreenName.SETTINGS
        
        # Go back twice
        await nav.navigate_back()
        assert nav.current_screen == ScreenName.MATRIX
        
        await nav.navigate_back()
        assert nav.current_screen == ScreenName.DASHBOARD


# Fixtures

@pytest.fixture
def cluster_app():
    """Create cluster app."""
    return ClusterManagementApp()


@pytest.fixture
def nav_controller():
    """Create navigation controller."""
    api_client = ClusterAPIClient()
    ws_manager = ClusterWebSocketManager()
    return NavigationController(api_client, ws_manager)


@pytest.fixture
def screen_stack():
    """Create screen stack."""
    return ScreenStack()
