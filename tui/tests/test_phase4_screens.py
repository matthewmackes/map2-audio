"""Tests for Phase 4 screens."""
import pytest
from unittest.mock import MagicMock, AsyncMock

try:
    from tui.screens.help_screen import HelpScreen
    from tui.screens.batch_operations_screen import BatchOperationsScreen
    from tui.cluster_api_client import ClusterAPIClient
    SCREENS_AVAILABLE = True
except ImportError:
    SCREENS_AVAILABLE = False


@pytest.mark.skipif(not SCREENS_AVAILABLE, reason="Screens not available")
class TestPhase4Screens:
    """Tests for Phase 4 screens."""

    def test_help_screen_instantiate(self):
        """Test HelpScreen instantiation."""
        screen = HelpScreen()
        assert screen is not None

    def test_batch_operations_init(self):
        """Test BatchOperationsScreen initialization."""
        api_client = ClusterAPIClient()
        screen = BatchOperationsScreen(api_client=api_client)
        assert screen.api_client == api_client
        assert screen.flows == {}

    @pytest.mark.asyncio
    async def test_batch_operations_load(self):
        """Test batch operations flow loading."""
        api_client = ClusterAPIClient()
        api_client.get_flow_assignments = AsyncMock(
            return_value=MagicMock(success=True, data={"flow-1": MagicMock()})
        )

        screen = BatchOperationsScreen(api_client=api_client)
        screen.query_one = MagicMock(return_value=MagicMock())

        await screen.on_mount()
        assert api_client.get_flow_assignments.called
