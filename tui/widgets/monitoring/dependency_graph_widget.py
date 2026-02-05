"""
Dependency Graph Widget for Backend Services Monitoring TUI
===========================================================
Interactive Tree widget for service dependencies.

Features:
- Textual Tree widget for expand/collapse navigation
- Color-coded by health status
- Click to select nodes
- Show affected services on failures
- Impact analysis
- Auto-refresh from API

Layout:
+------------------------------------------+
| SERVICE DEPENDENCIES      [Expand All]   |
+------------------------------------------+
| ▼ database (HEALTHY)                     |
|   ├── plugin_loader (HEALTHY)            |
|   │   └── juce_engine (HEALTHY)          |
|   │       ├── midi_engine (DEGRADED)     |
|   │       └── meter_broadcaster (HEALTHY)|
|   ├── command_queue (HEALTHY)            |
|   │   └── event_publisher (HEALTHY)      |
|   └── websocket_manager (HEALTHY)        |
| ▶ folder_scanner (HEALTHY)               |
| ▶ rt_monitor (HEALTHY)                   |
+------------------------------------------+
| Selected: midi_engine | Affects: 0       |
+------------------------------------------+
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any, Set
import asyncio
import logging

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical, Horizontal, Container
    from textual.widgets import Static, Label, Button, Tree, Rule
    from textual.widgets.tree import TreeNode
    from textual.reactive import reactive
    from textual.message import Message
    from textual.binding import Binding
    from rich.text import Text
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False
    Static = object

logger = logging.getLogger(__name__)


# Status colors
STATUS_COLORS = {
    "HEALTHY": "#10B981",
    "DEGRADED": "#F59E0B",
    "CRITICAL": "#EF4444",
    "OFFLINE": "#6B7280",
    "UNKNOWN": "#6B7280",
}

STATUS_ICONS = {
    "HEALTHY": "●",
    "DEGRADED": "◐",
    "CRITICAL": "✗",
    "OFFLINE": "○",
    "UNKNOWN": "?",
}


@dataclass
class ServiceNode:
    """Service node in dependency graph."""
    name: str
    status: str = "HEALTHY"
    dependencies: List[str] = field(default_factory=list)
    dependents: List[str] = field(default_factory=list)
    latency_ms: float = 0.0
    error_count: int = 0
    uptime_percent: float = 100.0

    @property
    def status_color(self) -> str:
        """Get color for status."""
        return STATUS_COLORS.get(self.status.upper(), "#6B7280")

    @property
    def status_icon(self) -> str:
        """Get icon for status."""
        return STATUS_ICONS.get(self.status.upper(), "?")

    def to_label(self, selected: bool = False) -> Text:
        """Create rich text label for tree node."""
        text = Text()

        icon = self.status_icon
        color = self.status_color

        if selected:
            text.append("▶ ", style="bold")

        text.append(f"{icon} ", style=color)
        text.append(self.name, style=f"bold {color}" if self.status != "HEALTHY" else "")

        # Show status if not healthy
        if self.status != "HEALTHY":
            text.append(f" ({self.status})", style=f"dim {color}")

        # Show latency if significant
        if self.latency_ms > 10:
            lat_color = "#EF4444" if self.latency_ms > 100 else "#F59E0B" if self.latency_ms > 50 else "#6B7280"
            text.append(f" {self.latency_ms:.0f}ms", style=lat_color)

        return text


class ServiceTree(Tree):
    """Custom Tree widget for service dependencies."""

    DEFAULT_CSS = """
    ServiceTree {
        width: 100%;
        height: 1fr;
        background: $surface;
        border: solid $primary-darken-2;
        scrollbar-gutter: stable;
    }

    ServiceTree:focus {
        border: solid $accent;
    }

    ServiceTree > .tree--cursor {
        background: $accent 30%;
    }

    ServiceTree > .tree--guides {
        color: $primary-darken-1;
    }

    ServiceTree > .tree--guides-hover {
        color: $accent;
    }
    """

    class ServiceSelected(Message):
        """Emitted when a service is selected."""
        def __init__(self, service_name: str, node: Optional[ServiceNode] = None):
            super().__init__()
            self.service_name = service_name
            self.node = node


class DependencyGraphWidget(Static):
    """
    Interactive service dependency tree visualization.

    Features:
    - Textual Tree widget for expandable navigation
    - Color-coded by health status
    - Click to select and show details
    - Impact analysis (what fails if this service fails)
    - Keyboard navigation
    - Auto-refresh from API
    """

    DEFAULT_CSS = """
    DependencyGraphWidget {
        width: 100%;
        height: 100%;
        background: $background;
        layout: vertical;
    }

    DependencyGraphWidget .graph-header {
        width: 100%;
        height: 3;
        background: $surface;
        padding: 1;
        layout: horizontal;
    }

    DependencyGraphWidget .graph-title {
        width: 1fr;
        text-style: bold;
    }

    DependencyGraphWidget .graph-actions {
        width: auto;
    }

    DependencyGraphWidget .graph-actions Button {
        min-width: 10;
        height: 1;
    }

    DependencyGraphWidget .graph-footer {
        width: 100%;
        height: 3;
        background: $surface;
        padding: 1;
        border-top: solid $primary-darken-2;
    }

    DependencyGraphWidget .impact-label {
        color: $warning;
    }
    """

    BINDINGS = [
        Binding("e", "expand_all", "Expand All", show=False),
        Binding("c", "collapse_all", "Collapse All", show=False),
        Binding("r", "refresh", "Refresh", show=False),
        Binding("i", "show_impact", "Impact", show=False),
    ]

    # Messages
    class NodeSelected(Message):
        """Emitted when a node is selected."""
        def __init__(self, service_name: str, node: Optional[ServiceNode] = None):
            super().__init__()
            self.service_name = service_name
            self.node = node

    def __init__(
        self,
        api_client: Optional[Any] = None,
        refresh_interval: float = 5.0,
        id: Optional[str] = None,
        classes: Optional[str] = None,
    ):
        """Initialize dependency graph widget."""
        super().__init__(id=id, classes=classes)
        self._api_client = api_client
        self._refresh_interval = refresh_interval
        self._nodes: Dict[str, ServiceNode] = {}
        self._selected_node: Optional[str] = None
        self._refresh_task: Optional[asyncio.Task] = None
        self._tree_nodes: Dict[str, TreeNode] = {}
        self._initialize_default_graph()

    def _initialize_default_graph(self) -> None:
        """Initialize with default MAP2 service dependencies."""
        default_deps = {
            "database": {
                "dependencies": [],
                "dependents": ["plugin_loader", "juce_engine", "command_queue", "websocket_manager"],
            },
            "plugin_loader": {
                "dependencies": ["database"],
                "dependents": ["juce_engine"],
            },
            "juce_engine": {
                "dependencies": ["database", "plugin_loader"],
                "dependents": ["midi_engine", "meter_broadcaster"],
            },
            "midi_engine": {
                "dependencies": ["juce_engine"],
                "dependents": [],
            },
            "command_queue": {
                "dependencies": ["database"],
                "dependents": ["event_publisher"],
            },
            "event_publisher": {
                "dependencies": ["command_queue"],
                "dependents": [],
            },
            "websocket_manager": {
                "dependencies": ["database"],
                "dependents": [],
            },
            "meter_broadcaster": {
                "dependencies": ["juce_engine"],
                "dependents": [],
            },
            "folder_scanner": {
                "dependencies": [],
                "dependents": [],
            },
            "rt_monitor": {
                "dependencies": [],
                "dependents": [],
            },
            "plugin_profiler": {
                "dependencies": [],
                "dependents": [],
            },
            "lcd_display": {
                "dependencies": [],
                "dependents": [],
            },
            "metrics_collector": {
                "dependencies": [],
                "dependents": [],
            },
        }

        for name, deps in default_deps.items():
            self._nodes[name] = ServiceNode(
                name=name,
                dependencies=deps["dependencies"],
                dependents=deps["dependents"],
            )

    def compose(self) -> ComposeResult:
        """Compose the widget with Tree."""
        with Horizontal(classes="graph-header"):
            yield Label("🔗 SERVICE DEPENDENCIES", classes="graph-title")
            with Horizontal(classes="graph-actions"):
                yield Button("Expand", id="btn-expand", variant="default")
                yield Button("Collapse", id="btn-collapse", variant="default")

        yield ServiceTree("Services", id="dep-tree")

        with Vertical(classes="graph-footer"):
            yield Label("", id="selected-label")
            yield Label("", id="impact-label", classes="impact-label")

    async def on_mount(self) -> None:
        """Build tree and start refresh loop."""
        self._build_tree()
        self._refresh_task = asyncio.create_task(self._refresh_loop())

    async def on_unmount(self) -> None:
        """Stop refresh loop."""
        if self._refresh_task:
            self._refresh_task.cancel()
            try:
                await self._refresh_task
            except asyncio.CancelledError:
                pass

    def _build_tree(self) -> None:
        """Build the tree structure from nodes."""
        try:
            tree = self.query_one("#dep-tree", ServiceTree)
            tree.clear()
            self._tree_nodes.clear()

            # Find root services (no dependencies)
            roots = [n for n in self._nodes.values() if not n.dependencies]

            # Sort by name for consistent display
            roots.sort(key=lambda n: n.name)

            # Build tree recursively
            for root in roots:
                self._add_tree_node(tree.root, root)

            # Expand root level by default
            tree.root.expand()

        except Exception as e:
            logger.error(f"Error building dependency tree: {e}")

    def _add_tree_node(
        self,
        parent: TreeNode,
        node: ServiceNode,
        visited: Optional[Set[str]] = None
    ) -> None:
        """Recursively add a service node to the tree."""
        if visited is None:
            visited = set()

        # Prevent cycles
        if node.name in visited:
            return
        visited.add(node.name)

        # Create tree node with rich label
        label = node.to_label(selected=(node.name == self._selected_node))
        tree_node = parent.add(label, data=node.name, expand=False)
        self._tree_nodes[node.name] = tree_node

        # Add dependents as children
        for dep_name in node.dependents:
            if dep_name in self._nodes:
                dep_node = self._nodes[dep_name]
                self._add_tree_node(tree_node, dep_node, visited.copy())

    def _update_tree_labels(self) -> None:
        """Update all tree node labels with current status."""
        try:
            for name, tree_node in self._tree_nodes.items():
                if name in self._nodes:
                    node = self._nodes[name]
                    tree_node.set_label(node.to_label(selected=(name == self._selected_node)))
        except Exception as e:
            logger.debug(f"Error updating tree labels: {e}")

    async def _refresh_loop(self) -> None:
        """Periodically refresh service status."""
        while True:
            try:
                await self._refresh_status()
                await asyncio.sleep(self._refresh_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error refreshing dependencies: {e}")
                await asyncio.sleep(self._refresh_interval)

    async def _refresh_status(self) -> None:
        """Fetch service status from API."""
        if not self._api_client:
            return

        try:
            result = await self._api_client.get_monitored_services()
            if result.success and result.data:
                services = result.data if isinstance(result.data, list) else result.data.get("services", [])
                self._update_service_status(services)
        except Exception as e:
            logger.debug(f"Failed to fetch service status: {e}")

    def _update_service_status(self, services: List[Dict[str, Any]]) -> None:
        """Update node status from API response."""
        for service_data in services:
            name = service_data.get("name", "")
            if name in self._nodes:
                self._nodes[name].status = service_data.get("status", "UNKNOWN")
                self._nodes[name].latency_ms = service_data.get("latency_ms", 0.0)
                self._nodes[name].error_count = service_data.get("error_count", 0)
                self._nodes[name].uptime_percent = service_data.get("uptime_percent", 100.0)

        self._update_tree_labels()

    # Event handlers
    async def on_tree_node_selected(self, event: Tree.NodeSelected) -> None:
        """Handle tree node selection."""
        if not event.node.data:
            return
        
        # Handle string data (service name)
        if not isinstance(event.node.data, str):
            logger.debug(f"Unexpected node data type: {type(event.node.data)}")
            return
        
        service_name = event.node.data
        if service_name and service_name in self._nodes:
            self._selected_node = service_name
            self._update_tree_labels()
            self._update_footer()
            self.post_message(self.NodeSelected(
                service_name,
                self._nodes.get(service_name)

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses."""
        if event.button.id == "btn-expand":
            self.action_expand_all()
        elif event.button.id == "btn-collapse":
            self.action_collapse_all()

    def _update_footer(self) -> None:
        """Update footer with selection info."""
        try:
            selected_label = self.query_one("#selected-label", Label)
            impact_label = self.query_one("#impact-label", Label)

            if (self._selected_node and 
                isinstance(self._selected_node, str) and 
                self._selected_node in self._nodes):
                node = self._nodes[self._selected_node]

                # Selected service info
                selected_label.update(
                    f"Selected: [bold]{node.name}[/bold] | "
                    f"Status: [{node.status_color}]{node.status}[/] | "
                    f"Latency: {node.latency_ms:.1f}ms"
                )

                # Impact analysis
                affected = self.get_affected_services(self._selected_node)
                if affected:
                    impact_label.update(
                        f"⚠ If this fails, affects {len(affected)} services: "
                        f"{', '.join(affected[:3])}{'...' if len(affected) > 3 else ''}"
                    )
                else:
                    impact_label.update("No downstream services affected")
            else:
                selected_label.update("Click a service to see details")
                impact_label.update("")

        except Exception:
            pass

    # Actions
    def action_expand_all(self) -> None:
        """Expand all tree nodes."""
        try:
            tree = self.query_one("#dep-tree", ServiceTree)
            tree.root.expand_all()
        except Exception:
            pass

    def action_collapse_all(self) -> None:
        """Collapse all tree nodes."""
        try:
            tree = self.query_one("#dep-tree", ServiceTree)
            tree.root.collapse_all()
            tree.root.expand()  # Keep root expanded
        except Exception:
            pass

    async def action_refresh(self) -> None:
        """Force refresh service status."""
        await self._refresh_status()

    def action_show_impact(self) -> None:
        """Show impact analysis for selected service."""
        if self._selected_node:
            affected = self.get_affected_services(self._selected_node)
            if affected:
                self.app.notify(
                    f"If {self._selected_node} fails:\n"
                    f"Affected: {', '.join(affected)}",
                    severity="warning",
                    timeout=5
                )

    # Public API
    def update_dependencies(self, data: Dict[str, Any]) -> None:
        """Update dependencies from API response."""
        if "dependencies" in data:
            deps_data = data["dependencies"]
        else:
            deps_data = data

        for name, deps in deps_data.items():
            if name in self._nodes:
                if isinstance(deps, list):
                    self._nodes[name].dependencies = deps
                elif isinstance(deps, dict):
                    self._nodes[name].dependencies = deps.get("dependencies", [])
                    self._nodes[name].dependents = deps.get("dependents", [])

        # Rebuild tree with new structure
        self._build_tree()

    def update_service_status(self, service: str, status: str) -> None:
        """Update a service's status."""
        if service in self._nodes:
            self._nodes[service].status = status
            self._update_tree_labels()
            if service == self._selected_node:
                self._update_footer()

    def select_node(self, service: str) -> None:
        """Select a node programmatically."""
        self._selected_node = service
        self._update_tree_labels()
        self._update_footer()

        # Focus the tree node
        if service in self._tree_nodes:
            try:
                tree = self.query_one("#dep-tree", ServiceTree)
                tree.select_node(self._tree_nodes[service])
            except Exception:
                pass

        self.post_message(self.NodeSelected(service, self._nodes.get(service)))

    def get_affected_services(self, failing_service: str) -> List[str]:
        """
        Get services affected by a failing service.

        Returns list of services that depend (directly or transitively) on the failing service.
        """
        affected = []
        visited = set()

        def collect_dependents(name: str) -> None:
            if name in visited:
                return
            visited.add(name)

            node = self._nodes.get(name)
            if node:
                for dep in node.dependents:
                    if dep not in affected:
                        affected.append(dep)
                    collect_dependents(dep)

        collect_dependents(failing_service)
        return affected

    def get_dependencies(self, service: str) -> List[str]:
        """Get services that this service depends on."""
        node = self._nodes.get(service)
        if node:
            return list(node.dependencies)
        return []

    def get_all_services(self) -> List[str]:
        """Get all service names."""
        return list(self._nodes.keys())

    def get_healthy_count(self) -> int:
        """Get count of healthy services."""
        return sum(1 for n in self._nodes.values() if n.status == "HEALTHY")

    def get_unhealthy_services(self) -> List[str]:
        """Get list of unhealthy service names."""
        return [n.name for n in self._nodes.values() if n.status != "HEALTHY"]

    @property
    def selected_service(self) -> Optional[str]:
        """Get currently selected service name."""
        return self._selected_node

    @property
    def selected_node(self) -> Optional[ServiceNode]:
        """Get currently selected service node."""
        if self._selected_node:
            return self._nodes.get(self._selected_node)
        return None
