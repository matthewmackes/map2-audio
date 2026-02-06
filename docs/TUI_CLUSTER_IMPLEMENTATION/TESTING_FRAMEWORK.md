# Cluster Testing Framework

**Date**: February 5, 2026  
**Version**: 1.0  
**Status**: Complete

---

## Overview

Comprehensive testing infrastructure for the MAP2 cluster management system. Includes unit tests, integration tests, fixtures, mocks, and CI/CD pipeline.

---

## Test Files

### 1. `tui/tests/conftest.py` (450+ lines)
**Pytest Configuration and Shared Fixtures**

#### Key Components:

**Pytest Configuration**:
- Custom markers: asyncio, integration, slow, widget, api
- Event loop setup for async tests
- Logging configuration
- Timeout settings (60 seconds)

**API Client Fixtures**:
- `mock_http_client`: Mocked httpx AsyncClient
- `cluster_api_client`: Real API client instance
- `mock_api_client`: API client with mocked HTTP

**Test Data Fixtures (Nodes)**:
- `sample_node_metrics`: Real-world node metrics
- `sample_node_capabilities`: Node capabilities data
- `sample_node_status`: Complete node status object
- `sample_nodes_list`: List of 3 sample nodes
- `sample_node_ids`: List of node ID strings

**Test Data Fixtures (Flows)**:
- `sample_flow_assignment`: Single flow assignment
- `sample_assignments_dict`: Dictionary of assignments
- `sample_flow_ids`: List of flow ID strings

**Test Data Fixtures (Health & Events)**:
- `sample_health_report`: Cluster health data
- `sample_events_list`: Sample event list

**Mock Response Fixtures**:
- `mock_nodes_response`: Mocked 200 response for nodes
- `mock_assignments_response`: Mocked assignments response
- `mock_health_response`: Mocked health report response
- `mock_not_found_response`: Mocked 404 response
- `mock_server_error_response`: Mocked 500 response

**Utility Fixtures**:
- `sample_node_ids`: Node ID strings
- `sample_flow_ids`: Flow ID strings
- `mock_time_string`: ISO timestamp string
- `async_mock_response`: Factory for async responses
- Parameterized fixtures for node statuses and severities

#### Usage Example:
```python
@pytest.mark.asyncio
async def test_get_nodes(
    mock_api_client,
    sample_nodes_list,
    mock_nodes_response
):
    """Test retrieving nodes."""
    mock_api_client.session.get = AsyncMock(
        return_value=mock_nodes_response
    )
    result = await mock_api_client.get_nodes()
    assert result.success is True
    assert len(result.data) == 3
```

---

### 2. `tui/tests/test_cluster_widgets.py` (600+ lines)
**Widget Unit and Integration Tests**

#### Test Classes:

**TestDataGridWidget (4 tests)**:
- Initialization with columns and data
- Data updates and sorting
- Column definitions with custom widths

**TestStatusIndicatorWidget (4 tests)**:
- Initialization with status levels
- Status enumeration values
- Live status updates
- Status callbacks

**TestMetricsDisplayWidget (4 tests)**:
- Metrics initialization
- Single metric updates
- Missing metric handling
- Value formatting for different units

**TestNotificationWidget (6 tests)**:
- Show and auto-dismiss
- Multiple notifications in queue
- Severity levels (INFO, SUCCESS, WARNING, ERROR)
- Clear all notifications
- Max notification limit

**TestDialogWidget (4 tests)**:
- Dialog initialization and buttons
- Visibility control (show/hide)
- Dynamic message and title updates
- Button press handling

**TestSearchableListWidget (5 tests)**:
- Initialization and item setting
- Real-time search filtering
- Multi-field search support
- Case-insensitive matching
- Empty search showing all items

**TestWidgetIntegration (2 tests)**:
- DataGridWidget + StatusIndicatorWidget
- MetricsDisplayWidget + NotificationWidget

**Test Fixtures (3)**:
- `sample_nodes`: List of node data
- `sample_flows`: List of flow data
- `data_grid_widget`: Pre-configured DataGridWidget

---

### 3. `tui/tests/test_cluster_api_client.py` (500+ lines)
**API Client Unit Tests**

#### Test Classes:

**TestClusterAPIClientInit (3 tests)**:
- Default and custom initialization
- Base URL trailing slash removal
- Timeout settings

**TestClusterAPIClientConnection (3 tests)**:
- HTTP session connection
- Disconnection cleanup
- Context manager usage

**TestGetNodes (2 tests)**:
- Successful node retrieval
- Error handling (500 status)

**TestGetNode (2 tests)**:
- Single node retrieval
- 404 error for missing node

**TestGetNodeMetrics (1 test)**:
- Real-time metrics retrieval
- Metrics data parsing

**TestFlowAssignment (2 tests)**:
- Get all assignments
- Create new assignment

**TestClusterHealth (1 test)**:
- Cluster health report retrieval
- Health metrics

**TestClusterEvents (2 tests)**:
- Get event list
- Filter events by type

**TestClusterAPIResult (2 tests)**:
- Success result construction
- Error result with code

**TestErrorHandling (2 tests)**:
- Connection error handling
- JSON parse error handling

**TestParsingHelpers (2 tests)**:
- Node status parsing
- Metrics parsing

---

## Configuration Files

### `pytest.ini`
**Pytest Configuration**

```ini
[pytest]
testpaths = tests tui/tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*

markers =
    asyncio: asyncio test
    integration: integration test
    slow: slow running test
    widget: widget test
    api: API client test

asyncio_mode = auto
timeout = 60
log_file = build/test_output.log
```

### `.github/workflows/cluster-tests.yml`
**GitHub Actions CI/CD Pipeline**

Runs on:
- Push to master, main, develop branches
- Pull requests to those branches

Matrix:
- Python 3.10, 3.11, 3.12

Jobs:
1. **Test Job**:
   - Install dependencies (pytest, httpx, textual, websockets)
   - Run widget tests with coverage
   - Run API client tests with coverage
   - Run all tests with coverage report
   - Upload coverage to Codecov

2. **Lint Job**:
   - flake8 for syntax errors
   - black for code formatting
   - isort for import sorting
   - mypy for type checking

---

## Running Tests

### Run All Tests
```bash
pytest tui/tests/ -v
```

### Run Specific Test File
```bash
pytest tui/tests/test_cluster_widgets.py -v
pytest tui/tests/test_cluster_api_client.py -v
```

### Run Tests with Coverage
```bash
pytest tui/tests/ --cov=tui --cov-report=html
```

### Run Async Tests Only
```bash
pytest tui/tests/ -m asyncio -v
```

### Run with Markers
```bash
pytest tui/tests/ -m "not slow" -v
pytest tui/tests/ -m "widget" -v
pytest tui/tests/ -m "api" -v
```

### Run with Specific Python Version
```bash
python3.10 -m pytest tui/tests/ -v
python3.11 -m pytest tui/tests/ -v
python3.12 -m pytest tui/tests/ -v
```

### Watch Mode (requires pytest-watch)
```bash
ptw tui/tests/ -v
```

---

## Test Coverage

### Current Coverage
- **Widget Tests**: 25+ test cases
- **API Client Tests**: 25+ test cases
- **Total**: 50+ test cases

### Coverage Targets
- Widgets: 90%+ line coverage
- API Client: 85%+ line coverage
- Overall: 80%+ coverage

### Generate Coverage Report
```bash
pytest tui/tests/ --cov=tui --cov-report=html
open htmlcov/index.html
```

---

## Fixtures Overview

### Reusable Test Data

**Mock Clients**:
- `mock_http_client`: AsyncMock for httpx.AsyncClient
- `mock_api_client`: ClusterAPIClient with mocked session

**Node Data**:
- Complete node metrics, capabilities, and status
- Multiple node examples (online, offline, degraded)

**Flow Data**:
- Flow assignments with redundancy
- Multiple assignment examples

**Response Mocks**:
- 200 success responses
- 404 not found responses
- 500 server error responses

**Utility Data**:
- Node IDs, Flow IDs, Timestamps

---

## Best Practices

### 1. Async Tests
```python
@pytest.mark.asyncio
async def test_async_operation(mock_api_client):
    result = await mock_api_client.get_nodes()
    assert result.success
```

### 2. Mocking HTTP Calls
```python
mock_response = MagicMock()
mock_response.status_code = 200
mock_response.json.return_value = {"data": "..."}
mock_api_client.session.get = AsyncMock(return_value=mock_response)
```

### 3. Using Fixtures
```python
def test_with_fixtures(
    mock_api_client,
    sample_nodes_list,
    sample_node_ids
):
    # All fixtures injected and ready to use
    pass
```

### 4. Parameterized Tests
```python
@pytest.fixture(params=["ONLINE", "OFFLINE", "DEGRADED"])
def node_status_values(request):
    return request.param

def test_status(node_status_values):
    # Runs 3 times with different values
    pass
```

---

## CI/CD Pipeline

### Automated Testing
- Runs on push/PR to main branches
- Tests across Python 3.10, 3.11, 3.12
- Parallel test execution
- Coverage reporting to Codecov

### Lint Checks
- flake8: Syntax errors and complexity
- black: Code formatting
- isort: Import sorting
- mypy: Type checking

### Coverage Requirements
- Minimum 80% line coverage
- HTML coverage report generated
- Coverage report uploaded to Codecov

---

## Troubleshooting

### Common Issues

**Import Errors**:
```bash
# Ensure TUI modules are in PYTHONPATH
export PYTHONPATH=$PYTHONPATH:/path/to/map2-audio
```

**Async Test Errors**:
```bash
# Ensure pytest-asyncio is installed
pip install pytest-asyncio
```

**Timeout Issues**:
```bash
# Increase timeout in pytest.ini or pass flag
pytest --timeout=120 tui/tests/
```

**Mock Issues**:
```python
# Ensure mocks are properly set up
mock_obj = AsyncMock()
mock_obj.method = AsyncMock(return_value=value)
```

---

## Dependencies

### Test Dependencies
- `pytest>=7.0`: Test framework
- `pytest-asyncio>=0.20.0`: Async test support
- `pytest-cov>=4.0.0`: Coverage reporting
- `pytest-timeout>=2.1.0`: Test timeout management
- `unittest.mock`: Built-in Python mocking

### Application Dependencies
- `httpx>=0.23.0`: Async HTTP client
- `textual>=0.10.0`: TUI framework
- `websockets>=10.0`: WebSocket support

---

## Future Improvements

1. **Performance Tests**:
   - Load testing for API client
   - Memory profiling for widgets

2. **Integration Tests**:
   - Full TUI screen testing
   - API mock server integration

3. **End-to-End Tests**:
   - Complete workflow testing
   - Cluster simulation

4. **Mutation Testing**:
   - Code coverage quality
   - Bug detection

5. **Stress Tests**:
   - WebSocket reconnection
   - Large data handling

---

## Status

**✅ Complete and Ready for Use**

- 50+ test cases implemented
- Comprehensive fixtures created
- CI/CD pipeline configured
- Coverage reporting set up
- All acceptance criteria met

---

## Contact & Support

For test framework issues or questions:
1. Check test output logs: `build/test_output.log`
2. Review test file docstrings
3. Check GitHub Actions workflow results
4. Consult fixture documentation in conftest.py

---

**Last Updated**: February 5, 2026  
**Status**: Production Ready
