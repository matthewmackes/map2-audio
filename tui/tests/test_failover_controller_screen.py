"""
Tests for FailoverControllerScreen.
"""

import pytest
from unittest.mock import MagicMock, AsyncMock

try:
    from tui.screens.failover_controller_screen import FailoverControllerScreen
    from tui.cluster_api_client import ClusterAPIClient
    from tui.cluster_types import FlowAssignment, FailoverEvent, FailoverHistory, FailoverState
    SCREEN_AVAILABLE = True
except ImportError:
    SCREEN_AVAILABLE = False


@pytest.mark.skipif(not SCREEN_AVAILABLE, reason="Screen not available")
class TestFailoverControllerScreen:
    """Unit tests for FailoverControllerScreen."""

    def test_init(self):
        """Test initialization."""
        api_client = ClusterAPIClient()
        screen = FailoverControllerScreen(api_client=api_client)
        assert screen.api_client == api_client
        assert screen.assignments == {}
        assert screen.failover_history is None

    def test_render_assignment_list(self):
        """Test assignment list rendering."""
        api_client = ClusterAPIClient()
        screen = FailoverControllerScreen(api_client=api_client)

        assignment = MagicMock(spec=FlowAssignment)
        assignment.flow_id = "flow-1"
        assignment.chain_id = 1
        assignment.primary_node_id = "node-1"
        assignment.standby_node_ids = ["node-2"]
        screen.assignments = {"flow-1": assignment}

        list_widget = MagicMock()
        screen.query_one = MagicMock(return_value=list_widget)

        screen._render_assignment_list()
        list_widget.set_items.assert_called_once()

    def test_render_failover_history_empty(self):
        """Test empty failover history rendering."""
        api_client = ClusterAPIClient()
        screen = FailoverControllerScreen(api_client=api_client)
        screen.failover_history = MagicMock(events=[])

        grid = MagicMock()
        screen.query_one = MagicMock(return_value=grid)

        screen._render_failover_history()
        grid.set_data.assert_called_once_with([])

    def test_render_failover_history_with_events(self):
        """Test failover history rendering with events."""
        api_client = ClusterAPIClient()
        screen = FailoverControllerScreen(api_client=api_client)

        event = MagicMock(spec=FailoverEvent)
        event.event_id = "evt-12345678"
        event.from_node_id = "node-1"
        event.to_node_id = "node-2"
        event.state = FailoverState.COMPLETED
        event.triggered_at = "2026-02-06T10:00:00Z"

        screen.failover_history = MagicMock(events=[event])

        grid = MagicMock()
        screen.query_one = MagicMock(return_value=grid)

        screen._render_failover_history()
        grid.set_data.assert_called_once()

    @pytest.mark.asyncio
    async def test_trigger_failover_success(self):
        """Test successful failover trigger."""
        api_client = ClusterAPIClient()
        api_client.trigger_failover = AsyncMock(return_value=MagicMock(success=True))
        api_client.get_failover_history = AsyncMock(return_value=MagicMock(success=True, data=None))

        screen = FailoverControllerScreen(api_client=api_client)
        screen.selected_flow_id = "flow-1"
        screen.selected_chain_id = 1

        assignment = MagicMock(spec=FlowAssignment)
        assignment.standby_node_ids = ["node-2"]
        screen.assignments = {"flow-1": assignment}

        notif = MagicMock()
        screen.query_one = MagicMock(return_value=notif)

        await screen._trigger_failover()
        api_client.trigger_failover.assert_called_once()

    @pytest.mark.asyncio
    async def test_trigger_failover_no_assignment(self):
        """Failover requires selection."""
        api_client = ClusterAPIClient()
        screen = FailoverControllerScreen(api_client=api_client)

        notif = MagicMock()
        screen.query_one = MagicMock(return_value=notif)

        await screen._trigger_failover()
        notif.show.assert_called()
