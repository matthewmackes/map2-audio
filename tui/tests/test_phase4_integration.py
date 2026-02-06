"""Phase 4 Integration Tests - Medium-priority features."""
import pytest
from unittest.mock import AsyncMock, MagicMock

try:
    from tui.screens.help_screen import HelpScreen
    from tui.screens.batch_operations_screen import BatchOperationsScreen
    from tui.cluster_api_client import ClusterAPIClient
    SCREENS_AVAILABLE = True
except ImportError:
    SCREENS_AVAILABLE = False


@pytest.mark.skipif(not SCREENS_AVAILABLE, reason="Screens not available")
class TestPhase4Integration:
    """Integration tests for Phase 4 features."""

    def test_all_phase4_screens_exist(self):
        """Ensure all Phase 4 screens can instantiate."""
        help_screen = HelpScreen()
        assert help_screen is not None

        api_client = ClusterAPIClient()
        batch_screen = BatchOperationsScreen(api_client=api_client)
        assert batch_screen is not None

    @pytest.mark.asyncio
    async def test_batch_workflow(self):
        """Test complete batch operations workflow."""
        api_client = ClusterAPIClient()
        api_client.get_flow_assignments = AsyncMock(
            return_value=MagicMock(success=True, data={})
        )

        screen = BatchOperationsScreen(api_client=api_client)
        screen.query_one = MagicMock(return_value=MagicMock())

        await screen.on_mount()
        assert api_client.get_flow_assignments.called
