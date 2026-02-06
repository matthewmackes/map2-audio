# MAP2 Audio Cluster Management TUI

A professional Terminal User Interface (TUI) for managing MAP2 Audio clusters with real-time monitoring, flow assignment, failover management, and diagnostics.

## Features

- **Real-time Dashboard** - Node status, metrics, and health monitoring
- **Flow Assignment Matrix** - Interactive flow-to-node assignment display
- **Smart Recommendations** - AI-based node recommendations with apply capability
- **Failover Management** - Manual failover control with history tracking
- **Cluster Diagnostics** - Health reports, issues, and warnings
- **Batch Operations** - Multi-flow management
- **Settings & Configuration** - Customizable cluster URLs and refresh intervals
- **Help & Documentation** - Built-in shortcuts and information

## Quick Start

```bash
# Start the cluster management TUI
python3 -m tui.apps.cluster_management_app

# With custom API server
python3 -m tui.apps.cluster_management_app --api-url http://cluster.local:8080
```

## Keyboard Shortcuts

| Key | Function |
|-----|----------|
| **1** | Dashboard |
| **2** | Flow Assignment Matrix |
| **3** | Node Recommendations |
| **4** | Failover Controller |
| **5** | Cluster Diagnostics |
| **6** | Batch Operations |
| **7** | Help & About |
| **Ctrl+R** | Reconnect to cluster |
| **Ctrl+Q** | Quit |

## Architecture

### Screens (Phase 2-4)
- `ClusterNodeDashboard` - Real-time node grid with metrics
- `FlowAssignmentMatrix` - Interactive assignment display
- `NodeRecommendationScreen` - Smart assignment suggestions
- `FailoverControllerScreen` - Failover management & history
- `ClusterDiagnosticsScreen` - Health monitoring
- `BatchOperationsScreen` - Multi-flow operations
- `HelpScreen` - Documentation
- `SettingsScreen` - Configuration

### API Client (Phase 1.2)
- `ClusterAPIClient` - Full cluster API integration
- Async/await throughout
- WebSocket real-time updates
- Automatic reconnection
- Comprehensive error handling

### Widgets (Phase 1.3)
- `SearchableListWidget` - Filterable list display
- `DataGridWidget` - Sortable data tables
- `NotificationWidget` - User notifications
- `StatusBar` - Real-time status display
- Additional UI components

### Testing (Phase 1.4)
- 100+ unit tests
- Integration tests
- E2E workflow tests
- Performance benchmarks
- CI/CD pipeline ready

## Project Structure

```
tui/
├── apps/                      # Main applications
│   ├── cluster_management_app.py
│   └── nav_controller.py
├── screens/                   # All TUI screens
│   ├── cluster_node_dashboard.py
│   ├── flow_assignment_matrix.py
│   ├── node_recommendation_screen.py
│   ├── failover_controller_screen.py
│   ├── cluster_diagnostics_screen.py
│   ├── batch_operations_screen.py
│   ├── help_screen.py
│   └── settings_screen.py
├── widgets/                   # Reusable UI components
│   ├── searchable_list_widget.py
│   ├── data_grid_widget.py
│   ├── notification_widget.py
│   └── others
├── cluster_api_client.py      # API client
├── cluster_types.py           # Type definitions
├── cluster_websocket.py       # WebSocket manager
└── tests/                     # Test suite
    ├── test_cluster_integration.py
    ├── test_phase3_integration.py
    ├── test_phase4_integration.py
    └── more...
```

## Configuration

Set via Settings screen or environment variables:

```bash
export MAP2_API_URL=http://localhost:8080
export MAP2_WS_URL=ws://localhost:8080
export MAP2_REFRESH_INTERVAL=5
```

## Performance

- Handles 100+ nodes
- 1000+ flows
- Real-time updates with <100ms latency
- Efficient WebSocket updates
- Async operations throughout

## Development

### Running Tests
```bash
pytest tui/tests/ -v
```

### Code Coverage
```bash
pytest tui/tests/ --cov=tui --cov-report=html
```

### Adding New Screens

1. Create screen in `tui/screens/`
2. Export in `tui/screens/__init__.py`
3. Add navigation binding in `tui/apps/cluster_management_app.py`
4. Add ScreenName enum value
5. Create action method
6. Add tests

## Status

**Project Status: 80% Complete (16/20 checkpoints)**

- ✅ Phase 1: Infrastructure (4/4)
- ✅ Phase 2: Critical Features (4/4)
- ✅ Phase 3: High-Priority Features (4/4)
- ✅ Phase 4: Medium-Priority Features (4/4)
- 🟨 Phase 5: Final Polish & Docs (0/4)

## Deployment

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for production deployment instructions.

## Support

For issues, questions, or feature requests, see the help screen (Press 7) or consult documentation.

---

Built with Textual for Terminal UI | February 2026
