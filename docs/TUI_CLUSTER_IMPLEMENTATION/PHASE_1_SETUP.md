# PHASE 1: Foundation & Setup - Detailed Checkpoints

**MAP2 Audio Platform - TUI Cluster Integration**

**Phase Duration**: Week 1  
**Target Completion**: [After Phase 1.4]  
**Current Status**: Not Started

---

## 📋 Phase Overview

Phase 1 establishes the foundation for all cluster features by:
1. Documenting the existing TUI architecture
2. Extending the API client with cluster endpoints
3. Creating reusable widget components
4. Setting up testing framework

**Success Criteria**: 
- ✅ TUI architecture fully documented
- ✅ API client can call all cluster endpoints
- ✅ Base widgets tested and working
- ✅ Test suite operational and passing

---

## ✅ Checkpoint 1.1: Infrastructure Review

### Status: ⬜ Not Started

### Description
Document the existing TUI architecture, patterns, and structure so all subsequent work follows established conventions.

### Acceptance Criteria
- [ ] `tui/app.py` thoroughly reviewed and documented
- [ ] All 13 tabs and screens catalogued
- [ ] Widget patterns documented (structure, styling, state)
- [ ] API client current structure documented
- [ ] Async patterns documented
- [ ] `docs/TUI_CLUSTER_ARCHITECTURE.md` created

### Files to Create
- `docs/TUI_CLUSTER_ARCHITECTURE.md` (2000+ words)

### Files to Review
- `tui/app.py` (main app, lines 1-1406)
- `tui/api_client.py` (API interaction)
- `tui/screens/dashboard_screen.py` (sample screen pattern)
- `tui/widgets/landing_dashboard_widget.py` (sample widget pattern)
- `tui/config.py` (configuration system)

### Implementation Steps

1. **Review Main Application Structure**
   ```python
   # In tui/app.py
   - Analyze CSS structure and layout patterns
   - Document all BINDINGS and keybindings
   - List all 13 tabs and their screens
   - Understand state management approach
   - Document LRUScreenCache mechanism
   ```

2. **Review Widget Patterns**
   ```python
   # In tui/widgets/landing_dashboard_widget.py
   - Analyze composition pattern (compose() method)
   - Document CSS-in-Python approach
   - Understand reactive properties
   - Review message passing
   ```

3. **Review Screen Patterns**
   ```python
   # In tui/screens/dashboard_screen.py
   - Analyze how screens are structured
   - Document action binding pattern
   - Review async/await usage
   - Understand data fetching pattern
   ```

4. **Create Architecture Document**
   - Directory structure (with descriptions)
   - Widget hierarchy
   - Data flow (API → State → Display)
   - Event/Message patterns
   - CSS styling system
   - Async patterns and patterns to follow

5. **Document Current Tabs**
   ```
   Tab 1: Dashboard
   Tab 2: Chains
   ... (all 13 tabs)
   Tab 13: Cluster Mode
   ```

### Testing Checklist
- [ ] Architecture doc can be understood by fresh developer
- [ ] Code examples are correct and runnable
- [ ] Diagrams are clear and accurate
- [ ] All file paths are correct

### Deliverable Document Structure
```markdown
# TUI Cluster Architecture

## 1. Overview
- Purpose of TUI
- Current capabilities
- Integration approach

## 2. Directory Structure
- /tui structure
- Purpose of each directory

## 3. Widget Architecture
- Widget hierarchy diagram
- Widget patterns (compose, CSS, state)
- Widget communication (messages)
- Sample widget analysis

## 4. Screen Architecture
- Screen patterns
- How screens use widgets
- Screen lifecycle
- Sample screen analysis

## 5. Data Flow
- API Client structure
- State management
- WebSocket handling
- Async patterns

## 6. Current Tabs (13)
- Each tab listed with purpose
- Screen class used
- Key features

## 7. Style & Theming
- CSS-in-Python patterns
- Theme system
- Color/sizing conventions

## 8. Key Design Patterns
- How to build widgets
- How to build screens
- How to integrate with API
- How to handle async

## 9. File Naming Conventions
- Screen files
- Widget files
- Helper files

## 10. Common Patterns to Follow
- Error handling
- State updates
- Async operations
- Widget composition
```

### Blockers
- [ ] None identified

### Completion Date
[To be filled in]

### Notes
This is foundational work - take time to understand the architecture thoroughly. Quality of this doc impacts all subsequent phases.

---

## ✅ Checkpoint 1.2: API Client Extension

### Status: ⬜ Not Started

### Description
Extend `tui/api_client.py` with cluster-specific endpoints and WebSocket support for real-time updates.

### Acceptance Criteria
- [ ] All cluster REST endpoints added to API client
- [ ] WebSocket client implemented for real-time updates
- [ ] Error handling for cluster API calls
- [ ] Automatic retry logic with exponential backoff
- [ ] Connection pooling for efficiency
- [ ] `docs/TUI_CLUSTER_API_GUIDE.md` created
- [ ] All tests passing

### Files to Create
- `tui/cluster_api_client.py` (400+ lines) - OR extend existing `api_client.py`
- `docs/TUI_CLUSTER_API_GUIDE.md` (1000+ words)

### Files to Modify
- `tui/api_client.py` - Add cluster methods

### API Endpoints Required

**REST Endpoints**
```python
# Node Management
GET /api/cluster/nodes
GET /api/cluster/nodes/{node_id}
GET /api/cluster/nodes/{node_id}/metrics
GET /api/cluster/nodes/{node_id}/capabilities
POST /api/cluster/nodes/{node_id}/maintenance

# Flow Assignments
GET /api/cluster/flows/assignments
POST /api/cluster/flows/assign
GET /api/cluster/flows/{flow_id}/assignment

# Failover
POST /api/cluster/flows/failover
GET /api/cluster/flows/{flow_id}/failover-history

# Diagnostics
GET /api/cluster/health
GET /api/cluster/events?limit=100&offset=0
GET /api/cluster/nodes/{node_id}/capabilities
POST /api/cluster/validate
```

**WebSocket Endpoints**
```python
# Real-time Updates
WS /ws/cluster/assignments          # Flow assignment changes
WS /ws/cluster/nodes                # Node status changes
WS /ws/cluster/metrics              # Metrics updates (every 5s)
WS /ws/cluster/events               # Event stream
```

### Implementation Steps

1. **Create ClusterAPIClient Class**
   ```python
   # tui/cluster_api_client.py
   class ClusterAPIClient:
       def __init__(self, base_url, timeout=10):
           self.base_url = base_url
           self.timeout = timeout
           self.session = None
           
       async def get_nodes(self) -> List[NodeStatus]:
           """Get all cluster nodes"""
           
       async def get_assignments(self) -> Dict[str, Assignment]:
           """Get all flow assignments"""
           
       # ... more methods
   ```

2. **Implement WebSocket Manager**
   ```python
   # tui/cluster_websocket.py
   class ClusterWebSocketManager:
       def __init__(self, base_url):
           self.base_url = base_url
           self.connections = {}
           
       async def connect_assignments(self, callback):
           """Connect to assignment updates"""
           
       async def connect_metrics(self, callback):
           """Connect to metrics updates"""
           
       # ... more connections
   ```

3. **Add to API Client**
   ```python
   # In tui/api_client.py
   class MAP2APIClient:
       def __init__(self, base_url):
           # ... existing code
           self.cluster = ClusterAPIClient(base_url)
           self.ws_manager = ClusterWebSocketManager(base_url)
   ```

4. **Create Type Definitions**
   ```python
   # tui/cluster_types.py
   from dataclasses import dataclass
   
   @dataclass
   class NodeStatus:
       node_id: str
       hostname: str
       status: str  # ONLINE, OFFLINE, DEGRADED, maintenance
       cpu_percent: float
       memory_percent: float
       gpu_available: bool
       
   @dataclass
   class Assignment:
       flow_id: str
       chain_id: int
       node_id: str
       role: str  # primary, standby
       redundancy_enabled: bool
       
   # ... more types
   ```

5. **Add Error Handling**
   ```python
   # Handle timeouts with exponential backoff
   # Handle connection failures with retries
   # Provide meaningful error messages
   ```

6. **Create API Guide Document**
   - All endpoints listed
   - Request/response examples
   - WebSocket message formats
   - Error codes and meanings
   - Rate limiting (if any)
   - Authentication (if any)

### Testing Checklist
- [ ] All endpoints callable without errors
- [ ] WebSocket connects and receives updates
- [ ] Error handling works correctly
- [ ] Timeout handling works
- [ ] Connection pooling effective
- [ ] No memory leaks
- [ ] Unit tests pass (90%+ coverage)

### Integration Dependencies
- None - This can be done independently

### Blockers
- [ ] Backend cluster APIs must be running
- [ ] WebSocket support must be enabled in backend

### Completion Date
[To be filled in]

### Notes
- Design for extensibility (new endpoints can be added easily)
- Consider rate limiting to avoid overwhelming backend
- WebSocket reconnection strategy is critical

---

## ✅ Checkpoint 1.3: Widget Library Expansion

### Status: ⬜ Not Started

### Description
Create base widget classes and utilities that will be reused across all cluster features.

### Acceptance Criteria
- [ ] `DataGridWidget` for tabular displays (nodes, assignments)
- [ ] `StatusIndicatorWidget` for online/offline status
- [ ] `MetricsDisplayWidget` for showing performance data
- [ ] `NotificationWidget` for alerts and messages
- [ ] `DialogWidget` for confirmations
- [ ] `SearchableListWidget` for searchable lists
- [ ] All widgets have tests
- [ ] Widget documentation complete

### Files to Create
- `tui/widgets/data_grid_widget.py` (300+ lines)
- `tui/widgets/status_indicator_widget.py` (150+ lines)
- `tui/widgets/metrics_display_widget.py` (200+ lines)
- `tui/widgets/notification_widget.py` (150+ lines)
- `tui/widgets/dialog_widget.py` (200+ lines)
- `tui/widgets/searchable_list_widget.py` (250+ lines)
- `tui/widgets/__init__.py` (export all widgets)
- `docs/TUI_CLUSTER_IMPLEMENTATION/WIDGET_DEVELOPMENT_GUIDE.md`

### Widget Specifications

**1. DataGridWidget**
```python
# Purpose: Display tabular data (nodes, assignments, events)
# Features:
# - Sortable columns
# - Selectable rows
# - Keyboard navigation
# - Color coding by column/value
# - Pagination support

class DataGridWidget(Static):
    def __init__(self, columns: List[str], data: List[Dict]):
        # Initialize with column names and data
        
    def add_row(self, row_data: Dict):
        # Add a row dynamically
        
    def update_row(self, index: int, row_data: Dict):
        # Update specific row
        
    def get_selected_row(self) -> Optional[Dict]:
        # Get currently selected row
```

**2. StatusIndicatorWidget**
```python
# Purpose: Show status with color/icon
# Features:
# - Online: 🟢 Green
# - Offline: 🔴 Red
# - Degraded: 🟡 Yellow
# - Maintenance: 🔧 Gray
# - Animated pulse for warnings

class StatusIndicatorWidget(Static):
    def __init__(self, status: str, tooltip: str = ""):
        self.status = status  # ONLINE, OFFLINE, DEGRADED, maintenance
        self.tooltip = tooltip
        
    def set_status(self, status: str):
        # Update status and color dynamically
```

**3. MetricsDisplayWidget**
```python
# Purpose: Show CPU/Memory/GPU as bars or values
# Features:
# - Horizontal bar graphs
# - Color coding (green <50%, yellow 50-80%, red >80%)
# - Threshold indicators
# - Real-time updates

class MetricsDisplayWidget(Static):
    def __init__(self, metrics_name: str, value: float, max_value: float):
        self.name = metrics_name
        self.value = value
        self.max_value = max_value
        
    def update_metrics(self, value: float):
        # Update value and redraw
```

**4. NotificationWidget**
```python
# Purpose: Show alerts, errors, success messages
# Features:
# - Auto-dismiss after timeout
# - Multiple severity levels
# - Stacking support

class NotificationWidget(Static):
    def show_info(self, message: str, timeout: int = 3):
        # Show info notification
        
    def show_error(self, message: str, timeout: int = 5):
        # Show error notification
        
    def show_warning(self, message: str, timeout: int = 4):
        # Show warning notification
```

**5. DialogWidget**
```python
# Purpose: Confirmation and input dialogs
# Features:
# - Yes/No confirmations
# - Text input
# - Multi-choice selection
# - Modal display

class DialogWidget(Static):
    async def show_confirmation(self, title: str, message: str) -> bool:
        # Show yes/no dialog, return choice
        
    async def show_input(self, prompt: str, default: str = "") -> str:
        # Show input dialog, return input
```

**6. SearchableListWidget**
```python
# Purpose: List with search/filter capability
# Features:
# - Real-time search
# - Case-insensitive matching
# - Keyboard navigation
# - Multi-select support

class SearchableListWidget(Static):
    def __init__(self, items: List[str]):
        self.items = items
        
    def filter(self, query: str):
        # Filter items by search query
        
    def get_selected(self) -> Optional[List[str]]:
        # Get selected items
```

### Implementation Steps

1. **Create Widget Base**
   - Review Textual's Static widget
   - Understand compose() pattern
   - Understand CSS patterns
   - Create consistent structure for all widgets

2. **Implement Each Widget**
   - Write widget class
   - Add CSS styling
   - Implement methods
   - Add docstrings

3. **Create Widget Tests**
   ```python
   # tui/tests/test_cluster_widgets.py
   @pytest.mark.asyncio
   async def test_data_grid_widget():
       widget = DataGridWidget(
           columns=["Name", "Value"],
           data=[{"Name": "Test", "Value": "Value"}]
       )
       # ... test rendering, updates, etc
   ```

4. **Create Widget Guide**
   - How to use each widget
   - Code examples
   - Styling options
   - Common patterns

### Testing Checklist
- [ ] Each widget renders without errors
- [ ] Keyboard navigation works
- [ ] Mouse interaction works (if supported)
- [ ] Styling is consistent
- [ ] Color coding is correct
- [ ] State updates properly
- [ ] No memory leaks
- [ ] Tests pass (>90% coverage)

### Blockers
- [ ] None identified

### Completion Date
[To be filled in]

### Notes
- Make widgets generic and reusable
- Follow existing TUI widget patterns
- Keep CSS modular and maintainable

---

## ✅ Checkpoint 1.4: Testing Framework Setup

### Status: ⬜ Not Started

### Description
Create a comprehensive testing framework for cluster TUI features.

### Acceptance Criteria
- [ ] Test structure created with clear organization
- [ ] Fixtures for mock API client
- [ ] Fixtures for test data (nodes, assignments, etc)
- [ ] Example tests for each component type
- [ ] Conftest.py with shared setup
- [ ] Test utilities (assertions, helpers)
- [ ] CI integration ready
- [ ] Coverage target >90%

### Files to Create
- `tui/tests/__init__.py`
- `tui/tests/conftest.py` (fixtures and setup)
- `tui/tests/test_cluster_api_client.py` (API tests)
- `tui/tests/test_cluster_widgets.py` (widget tests)
- `tui/tests/test_cluster_screens.py` (screen tests)
- `tui/tests/test_cluster_integration.py` (integration tests)
- `tui/tests/fixtures/` (test data)
- `tui/tests/mocks/` (mock objects)

### Test Structure

**conftest.py**
```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from tui.cluster_api_client import ClusterAPIClient
from tui.cluster_types import NodeStatus, Assignment

@pytest.fixture
async def mock_api_client():
    """Provide mock API client"""
    client = AsyncMock(spec=ClusterAPIClient)
    client.get_nodes = AsyncMock(return_value=[...])
    client.get_assignments = AsyncMock(return_value={...})
    return client

@pytest.fixture
def sample_nodes():
    """Provide sample node data"""
    return [
        NodeStatus(
            node_id="node-a",
            hostname="node-a.local",
            status="ONLINE",
            cpu_percent=45.0,
            memory_percent=62.0,
            gpu_available=False
        ),
        # ... more nodes
    ]

@pytest.fixture
def sample_assignments():
    """Provide sample assignment data"""
    return {
        "flow-0": Assignment(
            flow_id="flow-0",
            chain_id=1,
            node_id="node-a",
            role="primary",
            redundancy_enabled=True
        ),
        # ... more assignments
    }
```

**test_cluster_api_client.py**
```python
@pytest.mark.asyncio
async def test_get_nodes_success(mock_api_client):
    """Test getting nodes succeeds"""
    nodes = await mock_api_client.get_nodes()
    assert len(nodes) > 0
    assert nodes[0].node_id == "node-a"

@pytest.mark.asyncio
async def test_get_nodes_timeout(mock_api_client):
    """Test timeout handling"""
    mock_api_client.get_nodes.side_effect = asyncio.TimeoutError()
    with pytest.raises(asyncio.TimeoutError):
        await mock_api_client.get_nodes()
```

**test_cluster_widgets.py**
```python
@pytest.mark.asyncio
async def test_data_grid_widget_renders(app):
    """Test DataGrid widget renders"""
    widget = DataGridWidget(
        columns=["Name", "Status"],
        data=[{"Name": "test", "Status": "ok"}]
    )
    async with app.run_test() as pilot:
        # Test rendering and updates
```

**test_cluster_integration.py**
```python
@pytest.mark.asyncio
async def test_cluster_dashboard_full_flow(mock_api_client):
    """Test full dashboard flow"""
    # Initialize components
    # Simulate API calls
    # Verify state updates
    # Verify UI renders correctly
```

### Testing Utilities

**tui/tests/utils.py**
```python
def assert_widget_visible(app, widget_id):
    """Assert widget is visible"""
    
def wait_for_update(app, widget_id, timeout=5):
    """Wait for widget to update"""
    
def get_rendered_text(app, widget_id):
    """Get rendered text of widget"""
    
async def simulate_api_failure(mock_client, endpoint, error):
    """Simulate API failure"""
```

### Implementation Steps

1. **Create Test Directory Structure**
   ```bash
   mkdir -p tui/tests/{fixtures,mocks}
   touch tui/tests/__init__.py
   touch tui/tests/conftest.py
   ```

2. **Create Fixtures**
   - Mock API client
   - Sample node data
   - Sample assignment data
   - Sample event data

3. **Create Test Files**
   - API client tests
   - Widget tests
   - Screen tests
   - Integration tests

4. **Create Test Utilities**
   - Helper functions
   - Custom assertions
   - Simulation helpers

5. **Set Up CI Integration**
   - GitHub Actions workflow
   - Pre-commit hooks
   - Coverage reporting

### Testing Checklist
- [ ] All fixtures work correctly
- [ ] Sample tests pass
- [ ] Coverage >90%
- [ ] Tests run in CI
- [ ] CI reports coverage

### Sample Test Command
```bash
# Run all cluster tests
python3 -m pytest tui/tests/ -v --cov=tui --cov-report=html

# Run specific test
python3 -m pytest tui/tests/test_cluster_api_client.py::test_get_nodes_success -v

# Run with coverage
python3 -m pytest tui/tests/ --cov=tui --cov-report=term-missing
```

### Blockers
- [ ] pytest-asyncio must be installed
- [ ] Textual testing utilities must be available

### Completion Date
[To be filled in]

### Notes
- Start with simple tests, build to complex
- Mock external dependencies thoroughly
- Test both success and failure paths
- Keep tests maintainable and readable

---

## 📊 Phase 1 Summary

### Files to Create (8)
```
tui/cluster_api_client.py
tui/cluster_types.py
tui/cluster_websocket.py
tui/widgets/data_grid_widget.py
tui/widgets/status_indicator_widget.py
tui/widgets/metrics_display_widget.py
tui/widgets/notification_widget.py
tui/widgets/dialog_widget.py
tui/widgets/searchable_list_widget.py
tui/tests/conftest.py
tui/tests/test_cluster_api_client.py
tui/tests/test_cluster_widgets.py
tui/tests/utils.py
docs/TUI_CLUSTER_ARCHITECTURE.md
docs/TUI_CLUSTER_API_GUIDE.md
docs/TUI_CLUSTER_IMPLEMENTATION/WIDGET_DEVELOPMENT_GUIDE.md
```

### Files to Modify (2)
```
tui/api_client.py (add cluster client)
tui/config.py (add cluster config)
```

### Estimated Time
- 1.1: 8 hours (research + documentation)
- 1.2: 6 hours (API client + WebSocket)
- 1.3: 10 hours (6 widgets + tests)
- 1.4: 8 hours (testing framework)

**Total**: ~32 hours (1 week)

---

**Phase 1 Status**: Ready for 1.1 - Infrastructure Review  
**Next Phase**: Phase 2 - Critical Features  
**Estimated Start**: After Phase 1 completion
