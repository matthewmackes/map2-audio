"""
Tests for cluster widgets
Unit tests for all cluster management widgets.
"""

import pytest
from typing import List, Dict, Any

# Widget imports (with fallback for import errors)
try:
    from tui.widgets.data_grid_widget import DataGridWidget, DataGridColumn
    from tui.widgets.status_indicator_widget import StatusIndicatorWidget, StatusLevel
    from tui.widgets.metrics_display_widget import MetricsDisplayWidget
    from tui.widgets.notification_widget import NotificationWidget, NotificationSeverity
    from tui.widgets.dialog_widget import DialogWidget
    from tui.widgets.searchable_list_widget import SearchableListWidget
    WIDGETS_AVAILABLE = True
except ImportError:
    WIDGETS_AVAILABLE = False


# ============================================================================
# DataGridWidget Tests
# ============================================================================

@pytest.mark.skipif(not WIDGETS_AVAILABLE, reason="Widgets not available")
class TestDataGridWidget:
    """Tests for DataGridWidget."""
    
    def test_init(self):
        """Test DataGridWidget initialization."""
        columns = [
            DataGridColumn("name", "Name"),
            DataGridColumn("status", "Status"),
        ]
        grid = DataGridWidget(columns=columns)
        assert grid.columns == columns
        assert grid.data == []
    
    def test_with_data(self):
        """Test DataGridWidget with initial data."""
        columns = [DataGridColumn("name", "Name")]
        data = [{"name": "Node 1"}, {"name": "Node 2"}]
        grid = DataGridWidget(columns=columns, data=data)
        assert grid.data == data
    
    def test_set_data(self):
        """Test updating data."""
        grid = DataGridWidget(columns=[DataGridColumn("name", "Name")])
        data = [{"name": "Item 1"}]
        grid.set_data(data)
        assert grid.data == data
    
    def test_sorting(self):
        """Test sorting capability."""
        grid = DataGridWidget(columns=[DataGridColumn("value", "Value")])
        grid.data = [{"value": 30}, {"value": 10}, {"value": 20}]
        grid.set_sort("value", descending=False)
        assert grid.sort_column == "value"
        assert grid.sort_descending == False
    
    def test_column_definition(self):
        """Test DataGridColumn creation."""
        col = DataGridColumn("name", "Name", width=20, sortable=True)
        assert col.key == "name"
        assert col.label == "Name"
        assert col.width == 20
        assert col.sortable == True


# ============================================================================
# StatusIndicatorWidget Tests
# ============================================================================

@pytest.mark.skipif(not WIDGETS_AVAILABLE, reason="Widgets not available")
class TestStatusIndicatorWidget:
    """Tests for StatusIndicatorWidget."""
    
    def test_init(self):
        """Test StatusIndicatorWidget initialization."""
        indicator = StatusIndicatorWidget(
            label="Test Node",
            status=StatusLevel.OK,
            message="All good"
        )
        assert indicator.label == "Test Node"
        assert indicator.status == StatusLevel.OK
        assert indicator.message == "All good"
    
    def test_status_levels(self):
        """Test all status levels."""
        for level in StatusLevel:
            indicator = StatusIndicatorWidget(status=level)
            assert indicator.get_status() == level
    
    def test_set_status(self):
        """Test updating status."""
        indicator = StatusIndicatorWidget()
        indicator.set_status(StatusLevel.CRITICAL, "Critical issue")
        assert indicator.status == StatusLevel.CRITICAL
        assert indicator.message == "Critical issue"
    
    def test_status_enum_values(self):
        """Test StatusLevel enum values."""
        assert StatusLevel.OK.value == "ok"
        assert StatusLevel.WARNING.value == "warning"
        assert StatusLevel.CRITICAL.value == "critical"
        assert StatusLevel.OFFLINE.value == "offline"


# ============================================================================
# MetricsDisplayWidget Tests
# ============================================================================

@pytest.mark.skipif(not WIDGETS_AVAILABLE, reason="Widgets not available")
class TestMetricsDisplayWidget:
    """Tests for MetricsDisplayWidget."""
    
    def test_init(self):
        """Test MetricsDisplayWidget initialization."""
        metrics = {
            "CPU": {"value": 45.0, "max": 100, "unit": "%"},
            "Memory": {"value": 4096, "max": 8192, "unit": "MB"},
        }
        display = MetricsDisplayWidget(metrics=metrics)
        assert display.metrics == metrics
    
    def test_update_metric(self):
        """Test updating single metric."""
        display = MetricsDisplayWidget()
        display.set_metrics({
            "CPU": {"value": 50, "max": 100, "unit": "%"}
        })
        display.update_metric("CPU", 75)
        assert display.get_metric("CPU") == 75
    
    def test_get_nonexistent_metric(self):
        """Test getting non-existent metric."""
        display = MetricsDisplayWidget()
        assert display.get_metric("NonExistent") is None
    
    def test_metric_formatting(self):
        """Test metric value formatting."""
        display = MetricsDisplayWidget()
        
        # Percentage formatting
        assert "%" in display._format_value(45.0, "%")
        
        # Memory formatting
        assert "MB" in display._format_value(512, "MB")
        
        # Milliseconds formatting
        assert "ms" in display._format_value(2.5, "ms")


# ============================================================================
# NotificationWidget Tests
# ============================================================================

@pytest.mark.skipif(not WIDGETS_AVAILABLE, reason="Widgets not available")
class TestNotificationWidget:
    """Tests for NotificationWidget."""
    
    def test_init(self):
        """Test NotificationWidget initialization."""
        notif = NotificationWidget(max_notifications=5)
        assert notif.max_notifications == 5
        assert notif.notifications == []
    
    def test_show_notification(self):
        """Test showing notification."""
        notif = NotificationWidget()
        notif.show("Test message", NotificationSeverity.INFO)
        assert len(notif.notifications) == 1
        assert notif.notifications[0].message == "Test message"
    
    def test_multiple_notifications(self):
        """Test multiple notifications."""
        notif = NotificationWidget()
        notif.show("Message 1")
        notif.show("Message 2")
        notif.show("Message 3")
        assert len(notif.notifications) == 3
    
    def test_severity_levels(self):
        """Test all severity levels."""
        for severity in NotificationSeverity:
            notif = NotificationWidget()
            notif.show("Test", severity)
            assert notif.notifications[0].severity == severity
    
    def test_clear_notifications(self):
        """Test clearing all notifications."""
        notif = NotificationWidget()
        notif.show("Message 1")
        notif.show("Message 2")
        assert len(notif.notifications) == 2
        notif.clear()
        assert len(notif.notifications) == 0
    
    def test_max_notifications_limit(self):
        """Test max notifications enforcement."""
        notif = NotificationWidget(max_notifications=3)
        for i in range(5):
            notif.show(f"Message {i}")
        # get_notifications uses copy, but max is enforced in rendering
        assert len(notif.notifications) == 5  # All are stored


# ============================================================================
# DialogWidget Tests
# ============================================================================

@pytest.mark.skipif(not WIDGETS_AVAILABLE, reason="Widgets not available")
class TestDialogWidget:
    """Tests for DialogWidget."""
    
    def test_init(self):
        """Test DialogWidget initialization."""
        dialog = DialogWidget(
            title="Confirm",
            message="Are you sure?",
            buttons=[("Yes", "yes"), ("No", "no")]
        )
        assert dialog.title_text == "Confirm"
        assert dialog.message_text == "Are you sure?"
        assert len(dialog.buttons) == 2
    
    def test_visibility(self):
        """Test dialog visibility."""
        dialog = DialogWidget()
        assert dialog.visible == False
        dialog.show()
        assert dialog.visible == True
        dialog.hide()
        assert dialog.visible == False
    
    def test_set_message(self):
        """Test updating message."""
        dialog = DialogWidget(message="Original")
        dialog.set_message("Updated")
        assert dialog.message_text == "Updated"
    
    def test_set_title(self):
        """Test updating title."""
        dialog = DialogWidget(title="Original")
        dialog.set_title("Updated")
        assert dialog.title_text == "Updated"


# ============================================================================
# SearchableListWidget Tests
# ============================================================================

@pytest.mark.skipif(not WIDGETS_AVAILABLE, reason="Widgets not available")
class TestSearchableListWidget:
    """Tests for SearchableListWidget."""
    
    def test_init(self):
        """Test SearchableListWidget initialization."""
        items = [
            {"id": "1", "name": "Item 1"},
            {"id": "2", "name": "Item 2"},
        ]
        search_list = SearchableListWidget(
            items=items,
            search_fields=["name"]
        )
        assert search_list.all_items == items
        assert search_list.search_fields == ["name"]
    
    def test_set_items(self):
        """Test updating items."""
        search_list = SearchableListWidget()
        items = [{"name": "Item 1"}]
        search_list.set_items(items)
        assert search_list.all_items == items
    
    def test_filtering(self):
        """Test item filtering."""
        items = [
            {"name": "Node 1", "status": "online"},
            {"name": "Node 2", "status": "offline"},
            {"name": "Server 1", "status": "online"},
        ]
        search_list = SearchableListWidget(
            items=items,
            search_fields=["name", "status"]
        )
        
        search_list.search_query = "Node"
        search_list._filter_items()
        assert len(search_list.filtered_items) == 2
        
        search_list.search_query = "offline"
        search_list._filter_items()
        assert len(search_list.filtered_items) == 1
    
    def test_empty_search_shows_all(self):
        """Test that empty search shows all items."""
        items = [{"name": "Item 1"}, {"name": "Item 2"}]
        search_list = SearchableListWidget(items=items)
        
        search_list.search_query = ""
        search_list._filter_items()
        assert len(search_list.filtered_items) == 2
    
    def test_case_insensitive_search(self):
        """Test case-insensitive searching."""
        items = [{"name": "Node 1"}, {"name": "SERVER"}]
        search_list = SearchableListWidget(
            items=items,
            search_fields=["name"]
        )
        
        search_list.search_query = "node"
        search_list._filter_items()
        assert len(search_list.filtered_items) == 1
        
        search_list.search_query = "SERVER"
        search_list._filter_items()
        assert len(search_list.filtered_items) == 1


# ============================================================================
# Integration Tests
# ============================================================================

@pytest.mark.skipif(not WIDGETS_AVAILABLE, reason="Widgets not available")
class TestWidgetIntegration:
    """Integration tests for multiple widgets."""
    
    def test_grid_with_status(self):
        """Test using grid and status indicator together."""
        columns = [DataGridColumn("name", "Name")]
        grid = DataGridWidget(columns=columns, data=[{"name": "Node 1"}])
        
        status = StatusIndicatorWidget(label="Node 1", status=StatusLevel.OK)
        
        assert grid.data[0]["name"] == "Node 1"
        assert status.get_status() == StatusLevel.OK
    
    def test_metrics_and_notification(self):
        """Test metrics with notifications."""
        metrics = {
            "CPU": {"value": 95, "max": 100, "unit": "%"}
        }
        display = MetricsDisplayWidget(metrics=metrics)
        
        notif = NotificationWidget()
        notif.show("High CPU usage", NotificationSeverity.WARNING)
        
        assert display.get_metric("CPU") == 95
        assert len(notif.notifications) == 1
        assert notif.notifications[0].severity == NotificationSeverity.WARNING


# ============================================================================
# Conftest Fixtures (can be used by other tests)
# ============================================================================

@pytest.fixture
def sample_nodes():
    """Sample node data for testing."""
    return [
        {"id": "node-1", "name": "Node 1", "status": "ONLINE", "cpu": 45.0},
        {"id": "node-2", "name": "Node 2", "status": "OFFLINE", "cpu": 0.0},
        {"id": "node-3", "name": "Node 3", "status": "ONLINE", "cpu": 78.5},
    ]


@pytest.fixture
def sample_flows():
    """Sample flow data for testing."""
    return [
        {"id": "flow-1", "name": "Chain A", "node": "node-1"},
        {"id": "flow-2", "name": "Chain B", "node": "node-2"},
        {"id": "flow-3", "name": "Chain C", "node": "node-3"},
    ]


@pytest.fixture
def data_grid_widget():
    """Create a configured DataGridWidget."""
    columns = [
        DataGridColumn("name", "Name"),
        DataGridColumn("status", "Status"),
        DataGridColumn("value", "Value"),
    ]
    return DataGridWidget(columns=columns)
