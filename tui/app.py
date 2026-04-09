"""Unified Carbon-aligned Textual console host for MAP2 Audio."""

from __future__ import annotations

import argparse
import getpass
import logging
import os
import time
from collections import OrderedDict, defaultdict, deque
from pathlib import Path
from typing import Any

from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container, Horizontal, Vertical, VerticalScroll
from textual import on
from textual.events import Key
from textual.widgets import Button, ContentSwitcher, Footer, Label, Static

from .api import MAP2APIClient
from .base_screen import BaseScreen, ScreenAction
from .commands.providers import RouteCommandProvider
from .modals import ConfirmDialog, MessageDialog
from .node_console.api_client import NodeAPIClient
from .node_console.collectors import collect_snapshot
from .poll_manager import PollManager, SubscriptionUpdated
from .screens.unified_console import UnifiedRoute, build_unified_routes
from .session_state import SessionState, SessionStateStore
from .status_indicators import render_status_text, status_tone
from .theme.carbon import DEFAULT_THEME_NAME, register_carbon_themes
from .versioning import get_product_name, get_version

logger = logging.getLogger(__name__)


def _empty_state(title: str, description: str, action: str | None = None) -> str:
    lines = [title, description]
    if action:
        lines.append(action)
    return "\n".join(lines)


class MAP2ConsoleApp(App[None]):
    """Single host shell for the MAP2 local console experience."""

    REFRESH_INTERVAL: float = 5.0
    CSS_PATH = "styles/carbon.tcss"

    ENABLE_COMMAND_PALETTE = True
    COMMAND_PALETTE_BINDING = "ctrl+k"
    COMMAND_PALETTE_DISPLAY = "Ctrl+K"
    COMMANDS = App.COMMANDS | {RouteCommandProvider}
    BINDINGS = [
        Binding("ctrl+k", "command_palette", "Commands", show=True, priority=True),
        Binding("tab", "focus_next", "Next", show=True),
        Binding("shift+tab", "focus_previous", "Previous", show=True),
        Binding("f1", "help", "Help", show=True),
        Binding("escape", "back", "Back", show=True),
        Binding("ctrl+u", "undo", "Undo", show=True, priority=True),
        Binding("ctrl+z", "suspend_to_shell", "Shell", show=True, priority=True),
        Binding("ctrl+q", "quit", "Quit", show=True, priority=True),
    ]

    def __init__(
        self,
        *,
        api_url: str = "http://localhost:8080",
        ws_url: str | None = None,
        initial_route: str | None = None,
        environment: str | None = None,
        workspace: str | None = None,
        no_color: bool = False,
        daemon_mode: bool = False,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self.title = get_product_name()
        self.sub_title = get_version()
        self._api_url = api_url
        self.api_url = api_url
        self.ws_url = ws_url or api_url.replace("http://", "ws://").replace("https://", "wss://")
        self._no_color = no_color
        self.daemon_mode = daemon_mode
        self._session_store = SessionStateStore()
        self.session_state = self._load_session_state(environment=environment, workspace=workspace)
        self.api_client = MAP2APIClient(base_url=api_url)
        self._snapshot_client = NodeAPIClient(base_url=api_url)
        self._routes = build_unified_routes(self.api_client, self.session_state)
        self._route_map = {route.key: route for route in self._routes}
        self._route_cache: OrderedDict[str, BaseScreen] = OrderedDict()
        self._route_history: list[str] = []
        self._route_cache_capacity = 8
        self._active_route_key = ""
        self._background_jobs = 0
        self._runtime_lines: deque[str] = deque(maxlen=80)
        self._error_counts: dict[str, dict[str, float | int]] = {}
        self._poll_manager = PollManager(self._build_fetchers(), cadence=self._build_cadence())
        self._initial_route = initial_route or ""
        self._connection_status = "Connecting"
        self._tick_timer = None
        self._user = getpass.getuser()
        register_carbon_themes(self)
        self.theme = self.session_state.theme_name if self.session_state.theme_name in {"carbon-dark", "carbon-light"} else DEFAULT_THEME_NAME
        self._nav_groups = self._build_nav_groups()
        self._collapsed_nav_groups = set(self.session_state.nav_collapsed_groups)

    def _load_session_state(self, *, environment: str | None, workspace: str | None) -> SessionState:
        state = self._session_store.load()
        if environment:
            state.environment = environment
        elif not state.environment:
            state.environment = os.environ.get("MAP2_ENVIRONMENT", "local")
        if workspace:
            state.workspace = workspace
        elif not state.workspace:
            state.workspace = Path.cwd().name
        if not state.theme_name:
            state.theme_name = DEFAULT_THEME_NAME
        return state

    def _build_nav_groups(self) -> list[tuple[str, list[UnifiedRoute]]]:
        groups: dict[str, list[UnifiedRoute]] = defaultdict(list)
        for route in self._routes:
            if route.nav_visible:
                groups[route.group].append(route)
        ordered_groups: list[tuple[str, list[UnifiedRoute]]] = []
        for group in ("Dashboard", "Audio", "Platform", "Settings"):
            if groups.get(group):
                ordered_groups.append((group, groups[group]))
        return ordered_groups

    def _group_root_route(self, group: str) -> UnifiedRoute | None:
        for current_group, routes in self._nav_groups:
            if current_group == group and routes:
                return routes[0]
        return None

    def _build_cadence(self) -> dict[str, int]:
        return {
            "snapshot": 1,
            "audio.status": 2,
            "audio.latency": 3,
            "audio.levels": 1,
            "audio.metrics": 3,
            "midi.activity": 2,
            "system.health": 3,
            "system.logs": 5,
            "system.services": 5,
            "system.services_summary": 5,
            "cluster.online_nodes": 3,
            "cluster.health": 3,
            "system.network": 5,
            "system.ethernet": 5,
            "system.avb": 5,
            "system.avb_streams": 5,
            "system.ptp": 5,
            "system.tsn": 5,
        }

    def _build_fetchers(self) -> dict[str, Any]:
        async def unwrap(request) -> object:
            result = await request
            if result.success:
                return result.data
            raise RuntimeError(result.error or "Backend request failed")

        return {
            "snapshot": lambda: collect_snapshot(self._snapshot_client),
            "audio.status": lambda: unwrap(self.api_client.get_audio_status()),
            "audio.latency": lambda: unwrap(self.api_client.get_audio_latency()),
            "audio.levels": lambda: unwrap(self.api_client.get_audio_levels()),
            "audio.metrics": lambda: unwrap(self.api_client.get_audio_pipedal_metrics()),
            "chains.list": lambda: unwrap(self.api_client.list_chains()),
            "chains.templates": lambda: unwrap(self.api_client.list_templates()),
            "chains.sessions": lambda: unwrap(self.api_client.list_sessions()),
            "plugins.list": lambda: unwrap(self.api_client.list_plugins()),
            "midi.status": lambda: unwrap(self.api_client.get_midi_status()),
            "midi.devices": lambda: unwrap(self.api_client.get_midi_devices()),
            "midi.activity": lambda: unwrap(self.api_client.get_midi_activity()),
            "guitar.nam_models": lambda: unwrap(self.api_client.get_nam_models()),
            "guitar.cabinet_irs": lambda: unwrap(self.api_client.get_cabinet_irs()),
            "guitar.reverb_irs": lambda: unwrap(self.api_client.get_reverb_irs()),
            "cluster.online_nodes": lambda: unwrap(self.api_client.get_online_nodes()),
            "cluster.health": lambda: unwrap(self.api_client.get_cluster_health()),
            "system.health": lambda: unwrap(self.api_client.get_health()),
            "system.version": lambda: unwrap(self.api_client.get_version()),
            "system.history": lambda: unwrap(self.api_client.get_history_status()),
            "system.services_summary": lambda: unwrap(self.api_client.get_services_summary()),
            "system.services": lambda: unwrap(self.api_client.get_services_status()),
            "system.deployment_mode": lambda: unwrap(self.api_client.get_deployment_mode()),
            "system.deployment_status": lambda: unwrap(self.api_client.get_deployment_status()),
            "system.deployment_health": lambda: unwrap(self.api_client.get_deployment_health_status()),
            "system.logs": lambda: unwrap(self.api_client.get_system_logs(limit=40)),
            "system.network": lambda: unwrap(self.api_client.get_network_status()),
            "system.ethernet": lambda: unwrap(self.api_client.get_ethernet_interfaces()),
            "system.realtime": lambda: unwrap(self.api_client.get_realtime_status()),
            "system.lcd": lambda: unwrap(self.api_client.get_lcd_status()),
            "system.lcd_pages": lambda: unwrap(self.api_client.get_lcd_pages()),
            "system.avb": lambda: unwrap(self.api_client.get_avb_status()),
            "system.avb_streams": lambda: unwrap(self.api_client.get_avb_streams()),
            "system.ptp": lambda: unwrap(self.api_client.get_ptp_status()),
            "system.tsn": lambda: unwrap(self.api_client.get_tsn_status()),
            "system.backups": lambda: unwrap(self.api_client.list_backups()),
            "system.backup_status": lambda: unwrap(self.api_client.get_backup_status()),
            "system.updates": lambda: unwrap(self.api_client.get_updates_status()),
            "system.health_checks": lambda: unwrap(self.api_client.get_health_checks()),
            "system.usb": lambda: unwrap(self.api_client.get_usb_diagnostics()),
        }

    def compose(self) -> ComposeResult:
        with Container(id="shell-header"):
            with Vertical(id="shell-header-left"):
                yield Static("", id="shell-title")
                yield Static("", id="shell-subtitle")
            with Horizontal(id="shell-header-right"):
                yield Static("", id="shell-connection", classes="header-status-chip")
                yield Static("", id="shell-jobs", classes="header-status-chip")
                yield Static("", id="shell-environment", classes="header-status-chip")
                yield Static("", id="shell-workspace", classes="header-status-chip")

        with Horizontal(id="shell-body"):
            with VerticalScroll(id="nav-pane"):
                for group, routes in self._nav_groups:
                    yield Button("", id=f"nav-group-{group}", classes="nav-group")
                    with Vertical(id=f"nav-group-items-{group}", classes="nav-group-items"):
                        for route in routes:
                            yield Button(route.label, id=f"nav-{route.key}", classes="nav-button")

            with VerticalScroll(id="workspace-panel"):
                with Horizontal(id="workspace-breadcrumbs"):
                    yield Button("", id="breadcrumb-root", classes="breadcrumb-segment")
                    yield Static("/", id="breadcrumb-separator", classes="breadcrumb-separator")
                    yield Button("", id="breadcrumb-current", classes="breadcrumb-segment breadcrumb-segment--current")
                yield ContentSwitcher(id="workspace-switcher")

            with VerticalScroll(id="secondary-panel"):
                yield Label("Context", classes="secondary-title")
                yield Static("", id="context-body", classes="secondary-body")
                yield Label("Runtime output", classes="secondary-title")
                yield Static("", id="runtime-body", classes="secondary-body")

        yield Footer()

    async def on_mount(self) -> None:
        self.app_resume_signal.subscribe(self, self._on_app_resumed)
        self.refresh_nav_groups()
        self.refresh_header()
        self.refresh_breadcrumbs()
        self.refresh_context_panel()
        target = "onboarding" if not self.session_state.onboarding_completed else (self._initial_route or "dashboard")
        await self._open_route_internal(target, remember_history=True)
        self._tick_timer = self.set_interval(1.0, self._poll_tick)
        if self._no_color:
            self.log_runtime("info", "Color output disabled via launch configuration.")

    async def on_unmount(self) -> None:
        self.persist_session_state()
        await self.api_client.close()
        await self._snapshot_client.stop()

    def persist_session_state(self) -> None:
        self._session_store.save(self.session_state)

    def background_job_started(self, label: str) -> None:
        del label
        self._background_jobs += 1
        self.refresh_header()

    def background_job_finished(self, label: str) -> None:
        del label
        self._background_jobs = max(0, self._background_jobs - 1)
        self.refresh_header()

    def _pending_jobs(self) -> int:
        return self._background_jobs + self._poll_manager.get_inflight_count()

    def refresh_header(self) -> None:
        title = self.query_one("#shell-title", Static)
        subtitle = self.query_one("#shell-subtitle", Static)
        connection = self.query_one("#shell-connection", Static)
        jobs = self.query_one("#shell-jobs", Static)
        environment = self.query_one("#shell-environment", Static)
        workspace = self.query_one("#shell-workspace", Static)
        title.update(get_product_name())
        subtitle.update(f"{get_version()}  ·  User {self._user}")
        connection.update(render_status_text(self._connection_status))
        jobs.update(f"Jobs {self._pending_jobs()}")
        environment.update(f"Env {self.session_state.environment}")
        workspace.update(f"Workspace {self.session_state.workspace}")
        tone = status_tone(self._connection_status)
        connection.set_class(tone == "ok", "-success")
        connection.set_class(tone == "warn", "-warning")
        connection.set_class(tone == "error", "-error")

    def refresh_context_panel(self) -> None:
        panel = self.query_one("#secondary-panel", VerticalScroll)
        context = self.query_one("#context-body", Static)
        runtime = self.query_one("#runtime-body", Static)
        route = self.active_route
        context_lines = route.get_context_lines() if route is not None else []
        show_panel = bool(self._runtime_lines) or bool(route and route.show_context_panel)
        panel.set_class(show_panel, "-visible")
        context.update(
            "\n".join(context_lines)
            if context_lines
            else _empty_state("No route-specific context", "This route has not published any contextual guidance yet.")
        )
        runtime.update(
            "\n".join(self._runtime_lines)
            if self._runtime_lines
            else _empty_state("No runtime output", "Background jobs and live route actions have not emitted runtime lines yet.")
        )

    @property
    def active_route(self) -> BaseScreen | None:
        if not self._active_route_key:
            return None
        return self._route_cache.get(self._active_route_key)

    def open_route(self, route_key: str) -> None:
        self._open_route_worker(route_key)

    @work(exclusive=True, thread=False)
    async def _open_route_worker(self, route_key: str) -> None:
        await self._open_route_internal(route_key, remember_history=True)

    async def _open_route_internal(self, route_key: str, *, remember_history: bool) -> None:
        route = self._route_map.get(route_key)
        if route is None:
            self.toast(f"Unknown route: {route_key}", level="warning")
            return

        switcher = self.query_one("#workspace-switcher", ContentSwitcher)
        widget = self._route_cache.get(route_key)
        if widget is None:
            widget = route.factory()
            await switcher.mount(widget)
            self._route_cache[route_key] = widget
            await self._enforce_route_cache_limit(active_key=route_key)
        self._route_cache.move_to_end(route_key)

        previous = self._active_route_key
        self._active_route_key = route_key
        switcher.current = route_key
        self._poll_manager.reset()

        if remember_history:
            if not self._route_history or self._route_history[-1] != route_key:
                self._route_history.append(route_key)
        self.session_state.last_route = route_key
        self.persist_session_state()

        if previous and previous != route_key:
            self.refresh_route_actions()
        self.refresh_nav()
        self.refresh_header()
        self.refresh_breadcrumbs()
        self.refresh_context_panel()
        self.force_refresh_active_route()

    async def _enforce_route_cache_limit(self, *, active_key: str) -> None:
        while len(self._route_cache) > self._route_cache_capacity:
            evict_key = next((key for key in self._route_cache if key != active_key), None)
            if evict_key is None:
                return
            widget = self._route_cache.pop(evict_key)
            await widget.remove()

    def refresh_nav(self) -> None:
        for route in self._routes:
            if not route.nav_visible:
                continue
            button = self.query_one(f"#nav-{route.key}", Button)
            button.set_class(route.key == self._active_route_key, "-active")

    def refresh_nav_groups(self) -> None:
        for group, routes in self._nav_groups:
            toggle = self.query_one(f"#nav-group-{group}", Button)
            items = self.query_one(f"#nav-group-items-{group}", Vertical)
            collapsed = group in self._collapsed_nav_groups
            marker = "▸" if collapsed else "▾"
            toggle.label = f"{marker} {group}"
            items.display = not collapsed
            toggle.set_class(collapsed, "-collapsed")
            for route in routes:
                button = self.query_one(f"#nav-{route.key}", Button)
                button.display = not collapsed

    def refresh_breadcrumbs(self) -> None:
        root = self.query_one("#breadcrumb-root", Button)
        separator = self.query_one("#breadcrumb-separator", Static)
        current = self.query_one("#breadcrumb-current", Button)
        route = self._route_map.get(self._active_route_key)
        if route is None:
            root.label = ""
            current.label = ""
            root.display = False
            separator.display = False
            current.display = False
            return

        group_root = self._group_root_route(route.group)
        show_group = group_root is not None and group_root.key != route.key
        root.label = group_root.label if group_root is not None else route.group
        current.label = route.label
        root.display = show_group
        separator.display = show_group
        current.display = True
        current.disabled = True

    def refresh_route_actions(self) -> None:
        route = self.active_route
        if route is not None:
            route.refresh_actions()
            self.refresh_context_panel()

    def force_refresh_active_route(self) -> None:
        route = self.active_route
        if route is None:
            return
        self._poll_manager.reset()
        for subscription in route.get_subscriptions():
            self._poll_subscription(self._active_route_key, subscription)

    def _poll_tick(self) -> None:
        route = self.active_route
        if route is None:
            return
        for subscription in self._poll_manager.due(route.get_subscriptions()):
            self._poll_subscription(self._active_route_key, subscription)

    @work(exclusive=False, thread=False)
    async def _poll_subscription(self, route_key: str, subscription: str) -> None:
        self.background_job_started(f"poll:{subscription}")
        try:
            result = await self._poll_manager.fetch(subscription)
            if route_key != self._active_route_key:
                return
            route = self.active_route
            if route is None or subscription not in route.get_subscriptions():
                return
            route.post_message(SubscriptionUpdated(result))
            self._update_connection_state(subscription, result)
            if result.error:
                self.toast(f"{self._route_map[route_key].label}: {result.error}", level="error")
            self.refresh_header()
            self.refresh_context_panel()
        finally:
            self.background_job_finished(f"poll:{subscription}")

    def _update_connection_state(self, subscription: str, result) -> None:
        if result.error:
            lowered = result.error.lower()
            if "connect" in lowered or "timeout" in lowered:
                self._connection_status = "Offline"
            else:
                self._connection_status = "Degraded"
            return

        if subscription == "snapshot" and getattr(result.data, "api_reachable", False) is False:
            self._connection_status = "Offline"
            return
        self._connection_status = "Connected"

    def log_runtime(self, level: str, message: str) -> None:
        timestamp = time.strftime("%H:%M:%S")
        line = f"{timestamp} · {level.upper():7s} · {message}"
        self._runtime_lines.appendleft(line)
        self.refresh_context_panel()

    def toast(self, message: str, *, level: str = "info", title: str = "") -> None:
        message = " ".join(message.split())
        if not message:
            return

        severity = "information"
        timeout = 3.0
        if level == "warning":
            severity = "warning"
            timeout = 5.0
        elif level == "error":
            severity = "error"
            timeout = 10.0
            now = time.monotonic()
            base_message = message
            record = self._error_counts.get(base_message)
            if record is not None and now - float(record["last_at"]) < 30.0:
                record["last_at"] = now
                record["count"] = int(record["count"]) + 1
                self.log_runtime("error", f"{base_message} (x{record['count']})")
                return
            if record is not None and int(record["count"]) > 1:
                message = f"{base_message} (x{record['count']})"
            self._error_counts[base_message] = {"last_at": now, "count": 1}
        elif level == "success":
            severity = "information"
            timeout = 3.0

        self.log_runtime(level, message)
        route = self.active_route
        if route is not None and level in {"warning", "error"}:
            route.show_inline_notification(
                title=title or route.route_title,
                message=message,
                tone="warning" if level == "warning" else "error",
                action_hint="Action: review the active route and retry when ready.",
            )
            return
        self.notify(message, title=title, severity=severity, timeout=timeout, markup=False)

    async def confirm(self, message: str, *, title: str = "Confirm") -> bool:
        result = await self.push_screen_wait(ConfirmDialog(message, title=title))
        return bool(result)

    def iter_route_hits(self) -> list[dict[str, Any]]:
        hits = []
        for route in self._routes:
            if route.key == "onboarding" and self.session_state.onboarding_completed:
                continue
            hits.append(
                {
                    "display": f"{route.palette_category} ▸ {route.label}",
                    "text": f"{route.label} {route.group} {route.palette_category}",
                    "help": f"Open the {route.label} route.",
                    "route_key": route.key,
                    "command": lambda route_key=route.key: self.open_route(route_key),
                }
            )
        return hits

    def iter_local_action_hits(self) -> list[dict[str, Any]]:
        route = self.active_route
        if route is None:
            return []
        hits = []
        for action in route.get_actions():
            hits.append(
                {
                    "display": f"{action.category} ▸ {action.label}",
                    "text": f"{action.label} {action.description} {route.route_title}",
                    "help": action.description,
                    "action_id": action.action_id,
                    "command": lambda action_id=action.action_id: self.invoke_local_action(action_id),
                }
            )
        return hits

    def iter_system_action_hits(self) -> list[dict[str, Any]]:
        return [
            {
                "display": "System ▸ Refresh active route",
                "text": "refresh current route subscriptions",
                "help": "Refresh the active route immediately.",
                "command": self.force_refresh_active_route,
            },
            {
                "display": "System ▸ Switch theme",
                "text": "theme carbon dark light",
                "help": "Toggle between Carbon dark and light themes.",
                "command": self.cycle_theme,
            },
            {
                "display": "System ▸ Open help",
                "text": "help shortcuts shell fg undo",
                "help": "Open global help for the unified console.",
                "command": self.action_help,
            },
            {
                "display": "System ▸ Suspend to shell",
                "text": "shell suspend fg bash ctrl z",
                "help": "Suspend the console and resume with fg.",
                "command": self.action_suspend_to_shell,
            },
            {
                "display": "System ▸ Undo last change",
                "text": "undo ctrl u history",
                "help": "Send the global undo command.",
                "command": self.action_undo,
            },
        ]

    def invoke_local_action(self, action_id: str) -> None:
        route = self.active_route
        if route is None:
            return
        actions = {action.action_id: action for action in route.get_actions()}
        action = actions.get(action_id)
        if action is not None:
            route.run_action(action)

    def cycle_theme(self) -> None:
        self.theme = "carbon-light" if self.theme == "carbon-dark" else "carbon-dark"
        self.session_state.theme_name = self.theme
        self.persist_session_state()
        self.refresh_header()
        self.toast(f"Theme set to {self.theme}.", level="success")

    def action_help(self) -> None:
        self._show_help_dialog()

    @work(exclusive=True, thread=False)
    async def _show_help_dialog(self) -> None:
        await self.push_screen_wait(
            MessageDialog(
                "\n".join(
                    [
                        "Ctrl+K opens the command palette.",
                        "Ctrl+Z suspends the console; resume with fg.",
                        "Ctrl+U triggers undo.",
                        "Use visible buttons or the palette for local route actions.",
                    ]
                ),
                title="Unified console help",
            )
        )

    def action_back(self) -> None:
        if self._active_route_key == "dashboard":
            self.action_quit()
            return
        if len(self._route_history) <= 1:
            self.open_route("dashboard")
            return
        self._route_history.pop()
        target = self._route_history[-1]
        if target == "onboarding" and self.session_state.onboarding_completed:
            target = "dashboard"
            self._route_history = ["dashboard"]
        self._open_route_back(target)

    def _toggle_nav_group(self, group: str) -> None:
        if group in self._collapsed_nav_groups:
            self._collapsed_nav_groups.remove(group)
        else:
            self._collapsed_nav_groups.add(group)
        self.session_state.nav_collapsed_groups = sorted(self._collapsed_nav_groups)
        self.persist_session_state()
        self.refresh_nav_groups()

    def _visible_nav_focus_order(self) -> list[Button]:
        order: list[Button] = []
        for group, routes in self._nav_groups:
            order.append(self.query_one(f"#nav-group-{group}", Button))
            if group in self._collapsed_nav_groups:
                continue
            for route in routes:
                order.append(self.query_one(f"#nav-{route.key}", Button))
        return order

    def _move_nav_focus(self, step: int) -> None:
        order = self._visible_nav_focus_order()
        if not order:
            return
        focused = self.focused
        try:
            current_index = order.index(focused) if focused in order else -1
        except ValueError:
            current_index = -1
        next_index = 0 if current_index == -1 else max(0, min(len(order) - 1, current_index + step))
        order[next_index].focus()

    @on(Button.Pressed, "#breadcrumb-root")
    def _on_breadcrumb_root_pressed(self) -> None:
        route = self._route_map.get(self._active_route_key)
        if route is None:
            return
        group_root = self._group_root_route(route.group)
        if group_root is None or group_root.key == route.key:
            return
        self.open_route(group_root.key)

    @on(Button.Pressed)
    def _on_nav_group_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id or ""
        if not button_id.startswith("nav-group-"):
            return
        self._toggle_nav_group(button_id.removeprefix("nav-group-"))

    @on(Key)
    def _on_nav_key(self, event: Key) -> None:
        focused = self.focused
        focused_id = getattr(focused, "id", "") or ""
        if not (focused_id.startswith("nav-group-") or focused_id.startswith("nav-")):
            return

        if event.key == "down":
            self._move_nav_focus(1)
            event.stop()
        elif event.key == "up":
            self._move_nav_focus(-1)
            event.stop()
        elif event.key == "right" and focused_id.startswith("nav-group-"):
            group = focused_id.removeprefix("nav-group-")
            if group in self._collapsed_nav_groups:
                self._toggle_nav_group(group)
            else:
                routes = next((routes for current_group, routes in self._nav_groups if current_group == group), [])
                if routes:
                    self.query_one(f"#nav-{routes[0].key}", Button).focus()
            event.stop()
        elif event.key == "left":
            if focused_id.startswith("nav-group-"):
                group = focused_id.removeprefix("nav-group-")
                if group not in self._collapsed_nav_groups:
                    self._toggle_nav_group(group)
                    event.stop()
            elif focused_id.startswith("nav-"):
                route = focused_id.removeprefix("nav-")
                current = self._route_map.get(route)
                if current is not None:
                    self.query_one(f"#nav-group-{current.group}", Button).focus()
                    event.stop()
        elif event.key == "tab":
            self.action_focus_next()
            event.stop()

    @work(exclusive=True, thread=False)
    async def _open_route_back(self, route_key: str) -> None:
        await self._open_route_internal(route_key, remember_history=False)

    def action_suspend_to_shell(self) -> None:
        self.log_runtime("info", "Suspending to the shell. Resume with fg.")
        self.action_suspend_process()

    def action_undo(self) -> None:
        self._perform_undo()

    @work(exclusive=False, thread=False)
    async def _perform_undo(self) -> None:
        self.background_job_started("undo")
        try:
            result = await self.api_client.undo()
            self.toast("Undo applied." if result.success else (result.error or "Undo failed."), level="success" if result.success else "error")
            if result.success:
                self.force_refresh_active_route()
        finally:
            self.background_job_finished("undo")

    def _on_app_resumed(self, _: App[Any]) -> None:
        self.log_runtime("info", "Returned from shell suspend.")
        self._poll_manager.reset()
        route = self.active_route
        if route is not None:
            route.on_resume_from_shell()
        self.refresh(layout=True, repaint=True)
        self.force_refresh_active_route()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id or ""
        if button_id.startswith("nav-"):
            self.open_route(button_id.removeprefix("nav-"))


MAP2AudioTUI = MAP2ConsoleApp


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="map2-tui",
        description="Unified MAP2 Audio Platform console.",
    )
    parser.add_argument("--api-url", default="http://localhost:8080", help="Backend API URL.")
    parser.add_argument("--route", default=None, help="Initial route key, such as dashboard or diagnostics.")
    parser.add_argument("--environment", default=None, help="Explicit target environment label.")
    parser.add_argument("--workspace", default=None, help="Explicit workspace/project label.")
    parser.add_argument("--no-color", action="store_true", help="Disable ANSI color output where possible.")
    parser.add_argument("--version", action="version", version=f"{get_product_name()} {get_version()}")
    return parser


def main() -> None:
    logging.basicConfig(
        filename="/tmp/map2_tui.log",
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    args = build_arg_parser().parse_args()
    if args.no_color:
        os.environ["NO_COLOR"] = "1"
    app = MAP2ConsoleApp(
        api_url=args.api_url,
        initial_route=args.route,
        environment=args.environment,
        workspace=args.workspace,
        no_color=args.no_color,
    )
    app.run()


if __name__ == "__main__":
    main()
