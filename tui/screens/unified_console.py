"""Unified route widgets for the Carbon-aligned Textual host shell."""

from __future__ import annotations

import asyncio
import getpass
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from textual import on
from textual.app import ComposeResult
from textual.widgets import DataTable, Label, Static

from ..base_screen import BaseScreen, ScreenAction
from ..modals import FormDialog, InputDialog, MessageDialog
from ..session_state import SessionState
from ..table_sync import ensure_columns, sync_table_rows
from ..versioning import get_product_name, get_version
from ..workflows import WorkflowDefinition, WorkflowRunSpec, get_workflow_definitions
from ..node_console.models import NodeSnapshot
from ..status_indicators import render_status_text


def _as_dict(payload: object) -> dict[str, Any]:
    return payload if isinstance(payload, dict) else {}


def _as_list(payload: object, *keys: str) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if isinstance(value, list):
                return value
    return []


def _value(value: object) -> str:
    if value is None or value == "":
        return "N/A"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


def _panel_message(title: str, description: str, action: str | None = None) -> str:
    lines = [title, description]
    if action:
        lines.append(action)
    return "\n".join(lines)


def _first_ip(snapshot: NodeSnapshot) -> str:
    for interface in snapshot.network_interfaces:
        if interface.ipv4:
            return interface.ipv4
    return "N/A"


def _uptime(seconds: float) -> str:
    total = int(seconds)
    days, remainder = divmod(total, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, _ = divmod(remainder, 60)
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours or parts:
        parts.append(f"{hours}h")
    parts.append(f"{minutes}m")
    return " ".join(parts)


def _extract_mode(data: object) -> str:
    payload = _as_dict(data)
    return str(payload.get("mode", payload.get("current_mode", "unknown"))).replace("_", "-")


def _static_text(widget: Static) -> str:
    return str(widget.content or "")


class DashboardScreen(BaseScreen):
    route_key = "dashboard"
    route_title = "Dashboard"
    route_summary = "Live node identity, platform readiness, and current operating state."
    show_context_panel = True

    def __init__(self, api_client=None, **kwargs: Any) -> None:
        super().__init__(api_client=api_client, **kwargs)
        self.snapshot: NodeSnapshot | None = None

    def compose_body(self) -> ComposeResult:
        yield Label("Node status grid", classes="section-title")
        yield DataTable(id="dashboard-node-grid", classes="section-table")
        yield Label("Runtime summary", classes="section-title")
        yield Static("", id="dashboard-summary", classes="section-panel")
        yield Label("Core services", classes="section-title")
        yield DataTable(id="dashboard-services", classes="section-table")
        yield Label("Recent events", classes="section-title")
        yield Static("", id="dashboard-events", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        ensure_columns(self.query_one("#dashboard-node-grid", DataTable), "Field", "Value")
        ensure_columns(self.query_one("#dashboard-services", DataTable), "Service", "State")
        self.update_context(
            "OS/SSH identity is the active session source.",
            "Use Ctrl+K for commands and Ctrl+Z to suspend to the shell.",
            "Resume the shell-suspended app with fg.",
        )

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("refresh", "Refresh", "Dashboard", "Refresh live dashboard data.", self.app.force_refresh_active_route, "primary"),
            ScreenAction("restart-backend", "Restart backend", "Platform", "Restart the backend service.", self._restart_backend, "warning"),
            ScreenAction("onboarding", "Open onboarding", "Dashboard", "Open the first-run onboarding flow.", lambda: self.app.open_route("onboarding")),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["snapshot"]

    async def _restart_backend(self) -> None:
        if not await self.app.confirm("Restart the backend service?", title="Restart backend"):
            return
        self.app.log_runtime("warning", "Restarting backend service.")
        result = await self.api_client.restart_backend()
        if result.success:
            self.app.toast("Backend restart requested.", level="success")
        else:
            self.app.toast(result.error or "Backend restart failed.", level="error")

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription != "snapshot" or not isinstance(payload, NodeSnapshot):
            return
        self.snapshot = payload
        node_table = self.query_one("#dashboard-node-grid", DataTable)
        sync_table_rows(
            node_table,
            [
                ("Hostname", payload.hostname),
                ("Node mode", payload.mode.value),
                ("IP address", _first_ip(payload)),
                ("Backend API", "Connected" if payload.api_reachable else "Offline"),
                ("Services", f"{payload.services_running}/{payload.services_total} running"),
                ("Connected nodes", str(payload.cluster.peer_count)),
                ("API version", payload.api_version or get_version()),
            ],
            row_keys=["hostname", "mode", "ip", "backend", "services", "connected_nodes", "api_version"],
        )

        summary = self.query_one("#dashboard-summary", Static)
        summary.update(
            "\n".join(
                [
                    f"Health: {payload.health.value}",
                    f"Uptime: {_uptime(payload.uptime_seconds)}",
                    f"CPU: {payload.cpu.percent:.1f}% · Memory: {payload.memory.percent:.1f}%",
                    f"PipeWire latency: {payload.pipewire.latency_ms:.1f} ms",
                    f"Audio latency: {payload.audio.latency_ms:.1f} ms",
                    f"Plugins loaded: {payload.audio.plugins_loaded}",
                ]
            )
        )

        services = self.query_one("#dashboard-services", DataTable)
        sync_table_rows(
            services,
            [(service.name, render_status_text(service.state.value)) for service in payload.services],
            row_keys=[service.name for service in payload.services],
            sort_columns=("Service",),
        )

        events = self.query_one("#dashboard-events", Static)
        if payload.collector_errors:
            events.update("\n".join(payload.collector_errors[-5:]))
        elif payload.recent_events:
            events.update("\n".join(payload.recent_events[-8:]))
        else:
            events.update(_panel_message("No recent events", "The node has not emitted any recent runtime events.", "Action: refresh the route or wait for live activity."))


class AudioScreen(BaseScreen):
    route_key = "audio"
    route_title = "Audio"
    route_summary = "Engine status, latency, signal levels, and recovery controls."
    show_context_panel = True

    def compose_body(self) -> ComposeResult:
        yield Label("Audio engine", classes="section-title")
        yield Static("", id="audio-summary", classes="section-panel")
        yield Label("Signal levels", classes="section-title")
        yield DataTable(id="audio-levels", classes="section-table")
        yield Label("Service summary", classes="section-title")
        yield Static("", id="audio-services", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        ensure_columns(self.query_one("#audio-levels", DataTable), "Path", "Value")
        self.update_context(
            "Common audio recovery actions are native here.",
            "Use the command palette for additional platform actions.",
        )

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("start-audio", "Start audio", "Audio", "Start the audio engine.", self._start_audio, "primary"),
            ScreenAction("stop-audio", "Stop audio", "Audio", "Stop the audio engine.", self._stop_audio, "warning"),
            ScreenAction("restart-audio", "Restart audio", "Audio", "Restart the audio engine.", self._restart_audio),
            ScreenAction("restart-pipewire", "Restart PipeWire", "Platform", "Restart the PipeWire stack.", self._restart_pipewire),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["audio.status", "audio.latency", "audio.levels", "audio.metrics", "system.services_summary"]

    async def _start_audio(self) -> None:
        result = await self.api_client.start_audio()
        self.app.toast("Audio start requested." if result.success else (result.error or "Audio start failed."), level="success" if result.success else "error")

    async def _stop_audio(self) -> None:
        result = await self.api_client.stop_audio()
        self.app.toast("Audio stop requested." if result.success else (result.error or "Audio stop failed."), level="success" if result.success else "error")

    async def _restart_audio(self) -> None:
        result = await self.api_client.restart_audio()
        self.app.toast("Audio restart requested." if result.success else (result.error or "Audio restart failed."), level="success" if result.success else "error")

    async def _restart_pipewire(self) -> None:
        result = await self.api_client.transport.post("/api/pipewire/restart")
        self.app.toast("PipeWire restart requested." if result.success else (result.error or "PipeWire restart failed."), level="success" if result.success else "error")

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription == "audio.status":
            data = _as_dict(payload)
            latency = data.get("latency_ms", "N/A")
            summary = self.query_one("#audio-summary", Static)
            summary.update(
                "\n".join(
                    [
                        f"Running: {_value(data.get('running'))}",
                        f"Backend: {_value(data.get('backend', data.get('engine', 'juce')))}",
                        f"Sample rate: {_value(data.get('sample_rate'))}",
                        f"Buffer size: {_value(data.get('buffer_size'))}",
                        f"Latency: {_value(latency)} ms",
                        f"Device: {_value(data.get('device'))}",
                    ]
                )
            )
        elif subscription == "audio.levels":
            data = _as_dict(payload)
            table = self.query_one("#audio-levels", DataTable)
            level_keys = ("input_left", "input_right", "output_left", "output_right")
            sync_table_rows(
                table,
                [(key.replace("_", " ").title(), _value(data.get(key, 0.0))) for key in level_keys],
                row_keys=list(level_keys),
            )
        elif subscription == "audio.metrics":
            data = _as_dict(payload)
            summary = self.query_one("#audio-services", Static)
            summary.update(
                "\n".join(
                    [
                        f"CPU load: {_value(data.get('cpu_load'))}%",
                        f"XRuns: {_value(data.get('xruns'))}",
                        f"PipeWire state: {_value(data.get('state', 'unknown'))}",
                    ]
                )
            )
        elif subscription == "system.services_summary":
            data = _as_dict(payload)
            existing = _static_text(self.query_one("#audio-services", Static))
            summary = self.query_one("#audio-services", Static)
            summary.update(f"{existing}\nServices healthy: {_value(data.get('healthy', data.get('running')))}")


class ChainsManagerScreen(BaseScreen):
    route_key = "chains"
    route_title = "Chains"
    route_summary = "Signal chains, templates, and session workflow controls."
    show_context_panel = True

    def __init__(self, api_client=None, **kwargs: Any) -> None:
        super().__init__(api_client=api_client, **kwargs)
        self._chains: list[dict[str, Any]] = []
        self._templates: list[dict[str, Any]] = []

    def compose_body(self) -> ComposeResult:
        yield Label("Chains", classes="section-title")
        yield DataTable(id="chains-table", classes="section-table")
        yield Label("Templates", classes="section-title")
        yield DataTable(id="chains-templates", classes="section-table")
        yield Label("Workflow status", classes="section-title")
        yield Static("", id="chains-status", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        ensure_columns(self.query_one("#chains-table", DataTable), "ID", "Name", "Active")
        ensure_columns(self.query_one("#chains-templates", DataTable), "Template", "Plugins")
        self.update_context(
            "Use Create chain to add a new chain without leaving the shell.",
            "Template loading keeps common workflow tasks in the TUI.",
        )

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("create-chain", "Create chain", "Audio", "Create a new chain.", self._create_chain, "primary"),
            ScreenAction("activate-chain", "Activate chain", "Audio", "Activate the selected chain.", self._activate_selected_chain),
            ScreenAction("load-template", "Load template", "Audio", "Load the selected template as a chain.", self._load_selected_template),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["chains.list", "chains.templates", "system.history"]

    async def _create_chain(self) -> None:
        name = await self.app.push_screen_wait(InputDialog("Enter a new chain name:", title="Create chain"))
        if not name:
            return
        result = await self.api_client.create_chain(name)
        if result.success:
            self.app.toast(f"Created chain: {name}", level="success")
            self.app.force_refresh_active_route()
        else:
            self.app.toast(result.error or "Create chain failed.", level="error")

    async def _activate_selected_chain(self) -> None:
        if not self._chains:
            self.app.toast("No chains available.", level="warning")
            return
        table = self.query_one("#chains-table", DataTable)
        index = table.cursor_row if table.cursor_row is not None else 0
        chain = self._chains[min(index, len(self._chains) - 1)]
        chain_id = int(chain.get("id", chain.get("chain_id", 0)))
        result = await self.api_client.activate_chain(chain_id)
        self.app.toast(
            f"Activated chain {chain.get('name', chain_id)}." if result.success else (result.error or "Activate chain failed."),
            level="success" if result.success else "error",
        )

    async def _load_selected_template(self) -> None:
        if not self._templates:
            self.app.toast("No templates available.", level="warning")
            return
        table = self.query_one("#chains-templates", DataTable)
        index = table.cursor_row if table.cursor_row is not None else 0
        template = self._templates[min(index, len(self._templates) - 1)]
        template_name = str(template.get("name", ""))
        result = await self.api_client.load_template(template_name)
        self.app.toast(
            f"Loaded template: {template_name}" if result.success else (result.error or "Template load failed."),
            level="success" if result.success else "error",
        )

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription == "chains.list":
            self._chains = _as_list(payload, "chains", "items")
            table = self.query_one("#chains-table", DataTable)
            sync_table_rows(
                table,
                [
                    (
                        _value(chain.get("id", chain.get("chain_id"))),
                        _value(chain.get("name")),
                        "Yes" if chain.get("active") or chain.get("is_active") else "No",
                    )
                    for chain in self._chains
                ],
                row_keys=[f"chain-{_value(chain.get('id', chain.get('chain_id')))}" for chain in self._chains],
                sort_columns=("Active", "Name"),
                reverse=True,
            )
        elif subscription == "chains.templates":
            self._templates = _as_list(payload, "templates", "items")
            table = self.query_one("#chains-templates", DataTable)
            sync_table_rows(
                table,
                [(_value(template.get("name")), _value(template.get("plugin_count", 0))) for template in self._templates],
                row_keys=[f"template-{_value(template.get('name'))}" for template in self._templates],
                sort_columns=("Template",),
            )
        elif subscription == "system.history":
            data = _as_dict(payload)
            self.query_one("#chains-status", Static).update(
                "\n".join(
                    [
                        f"Undo available: {_value(data.get('can_undo'))}",
                        f"Redo available: {_value(data.get('can_redo'))}",
                        f"History depth: {_value(data.get('history_count', 0))}",
                    ]
                )
            )


class EffectsManagerScreen(BaseScreen):
    route_key = "effects"
    route_title = "Effects"
    route_summary = "Plugin inventory, discovery, and catalog refresh."

    def __init__(self, api_client=None, **kwargs: Any) -> None:
        super().__init__(api_client=api_client, **kwargs)
        self._plugins: list[dict[str, Any]] = []

    def compose_body(self) -> ComposeResult:
        yield Label("Plugin catalog", classes="section-title")
        yield DataTable(id="effects-plugins", classes="section-table")
        yield Static("", id="effects-summary", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        ensure_columns(self.query_one("#effects-plugins", DataTable), "Name", "Category", "Format")

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("discover-plugins", "Discover plugins", "Audio", "Rescan the plugin catalog.", self._discover_plugins, "primary"),
            ScreenAction("refresh-plugins", "Refresh cache", "Audio", "Refresh plugin cache from the backend.", self._refresh_plugins),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["plugins.list"]

    async def _discover_plugins(self) -> None:
        result = await self.api_client.discover_plugins(refresh=True)
        self.app.toast("Plugin discovery requested." if result.success else (result.error or "Plugin discovery failed."), level="success" if result.success else "error")

    async def _refresh_plugins(self) -> None:
        result = await self.api_client.refresh_plugins()
        self.app.toast("Plugin cache refresh requested." if result.success else (result.error or "Plugin refresh failed."), level="success" if result.success else "error")

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription != "plugins.list":
            return
        self._plugins = _as_list(payload, "plugins", "items")
        table = self.query_one("#effects-plugins", DataTable)
        visible_plugins = self._plugins[:200]
        sync_table_rows(
            table,
            [
                (
                    _value(plugin.get("name", plugin.get("display_name"))),
                    _value(plugin.get("category")),
                    _value(plugin.get("format", plugin.get("plugin_format"))),
                )
                for plugin in visible_plugins
            ],
            row_keys=[f"plugin-{index}" for index, _plugin in enumerate(visible_plugins)],
            sort_columns=("Name",),
        )
        self.query_one("#effects-summary", Static).update(f"Available plugins: {len(self._plugins)}")


class MIDIScreen(BaseScreen):
    route_key = "midi"
    route_title = "MIDI"
    route_summary = "Device availability, learning state, and recent activity."

    def compose_body(self) -> ComposeResult:
        yield Label("MIDI devices", classes="section-title")
        yield DataTable(id="midi-devices", classes="section-table")
        yield Label("MIDI state", classes="section-title")
        yield Static("", id="midi-summary", classes="section-panel")
        yield Label("Recent activity", classes="section-title")
        yield Static("", id="midi-activity", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        ensure_columns(self.query_one("#midi-devices", DataTable), "Direction", "Name", "Status")

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("refresh-midi", "Refresh devices", "Audio", "Rescan MIDI devices.", self._refresh_devices, "primary"),
            ScreenAction("start-learn", "Start learn", "Audio", "Start generic MIDI learn mode.", self._start_learn),
            ScreenAction("stop-learn", "Stop learn", "Audio", "Stop MIDI learn mode.", self._stop_learn),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["midi.status", "midi.devices", "midi.activity"]

    async def _refresh_devices(self) -> None:
        result = await self.api_client.refresh_midi_devices()
        self.app.toast("MIDI device refresh requested." if result.success else (result.error or "MIDI refresh failed."), level="success" if result.success else "error")

    async def _start_learn(self) -> None:
        result = await self.api_client.start_midi_learn()
        self.app.toast("MIDI learn started." if result.success else (result.error or "MIDI learn failed."), level="success" if result.success else "error")

    async def _stop_learn(self) -> None:
        result = await self.api_client.stop_midi_learn()
        self.app.toast("MIDI learn stopped." if result.success else (result.error or "Stop MIDI learn failed."), level="success" if result.success else "error")

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription == "midi.devices":
            devices = _as_dict(payload)
            table = self.query_one("#midi-devices", DataTable)
            rows: list[tuple[str, str, str]] = []
            row_keys: list[str] = []
            for direction in ("inputs", "outputs"):
                for index, device in enumerate(_as_list(devices.get(direction, []))):
                    rows.append((direction[:-1].title(), _value(device.get("name", device)), _value(device.get("status", "Available"))))
                    row_keys.append(f"{direction}-{index}-{_value(device.get('name', device))}")
            sync_table_rows(table, rows, row_keys=row_keys, sort_columns=("Direction", "Name"))
        elif subscription == "midi.status":
            data = _as_dict(payload)
            self.query_one("#midi-summary", Static).update(
                "\n".join(
                    [
                        f"Enabled: {_value(data.get('enabled', data.get('running')))}",
                        f"Active input: {_value(data.get('input_device'))}",
                        f"Active output: {_value(data.get('output_device'))}",
                        f"Learn active: {_value(data.get('learn_active', data.get('active')))}",
                    ]
                )
            )
        elif subscription == "midi.activity":
            activity = _as_list(payload, "messages", "events", "items")
            lines = []
            for event in activity[:12]:
                if isinstance(event, dict):
                    lines.append(
                        f"{_value(event.get('timestamp', event.get('time', 'now')))} · {_value(event.get('message', event.get('type', event)))}"
                    )
                else:
                    lines.append(str(event))
            self.query_one("#midi-activity", Static).update("\n".join(lines) if lines else "No recent MIDI activity.")


class GuitarScreen(BaseScreen):
    route_key = "guitar"
    route_title = "Guitar"
    route_summary = "NAM model and IR inventory for guitar-focused workflows."

    def __init__(self, api_client=None, **kwargs: Any) -> None:
        super().__init__(api_client=api_client, **kwargs)
        self._models: list[Any] = []

    def compose_body(self) -> ComposeResult:
        yield Label("NAM models", classes="section-title")
        yield DataTable(id="guitar-models", classes="section-table")
        yield Label("Cabinet and reverb IRs", classes="section-title")
        yield Static("", id="guitar-irs", classes="section-panel")
        yield Static("", id="guitar-summary", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        ensure_columns(self.query_one("#guitar-models", DataTable), "Model")

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("activate-model", "Activate model", "Audio", "Activate the selected NAM model.", self._activate_model, "primary"),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["guitar.nam_models", "guitar.cabinet_irs", "guitar.reverb_irs", "audio.status"]

    async def _activate_model(self) -> None:
        if not self._models:
            self.app.toast("No NAM models available.", level="warning")
            return
        table = self.query_one("#guitar-models", DataTable)
        index = table.cursor_row if table.cursor_row is not None else 0
        selected = self._models[min(index, len(self._models) - 1)]
        model_name = selected["name"] if isinstance(selected, dict) else str(selected)
        result = await self.api_client.activate_nam_model(model_name)
        self.app.toast(
            f"Activated NAM model: {model_name}" if result.success else (result.error or "Model activation failed."),
            level="success" if result.success else "error",
        )

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription == "guitar.nam_models":
            self._models = _as_list(payload, "models", "items")
            table = self.query_one("#guitar-models", DataTable)
            visible_models = self._models[:200]
            sync_table_rows(
                table,
                [(_value(model.get("name") if isinstance(model, dict) else model),) for model in visible_models],
                row_keys=[f"model-{index}" for index, _model in enumerate(visible_models)],
                sort_columns=("Model",),
            )
        elif subscription in {"guitar.cabinet_irs", "guitar.reverb_irs"}:
            cabinets = getattr(self, "_cabinet_irs", [])
            reverbs = getattr(self, "_reverb_irs", [])
            if subscription == "guitar.cabinet_irs":
                self._cabinet_irs = _as_list(payload, "irs", "items")
                cabinets = self._cabinet_irs
            else:
                self._reverb_irs = _as_list(payload, "irs", "items")
                reverbs = self._reverb_irs
            self.query_one("#guitar-irs", Static).update(
                "\n".join(
                    [
                        f"Cabinet IRs: {len(cabinets)}",
                        f"Reverb IRs: {len(reverbs)}",
                    ]
                )
            )
        elif subscription == "audio.status":
            data = _as_dict(payload)
            self.query_one("#guitar-summary", Static).update(
                f"Audio running: {_value(data.get('running'))}\nSample rate: {_value(data.get('sample_rate'))}"
            )


class StageViewScreen(BaseScreen):
    route_key = "stage"
    route_title = "Stage"
    route_summary = "Session-oriented view for performance and quick recall."

    def compose_body(self) -> ComposeResult:
        yield Label("Sessions", classes="section-title")
        yield DataTable(id="stage-sessions", classes="section-table")
        yield Static("", id="stage-summary", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        ensure_columns(self.query_one("#stage-sessions", DataTable), "ID", "Name")

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("save-session", "Save session", "Audio", "Save the current session.", self._save_session, "primary"),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["chains.sessions", "chains.list"]

    async def _save_session(self) -> None:
        name = await self.app.push_screen_wait(InputDialog("Enter a session name:", title="Save session"))
        if not name:
            return
        result = await self.api_client.save_session(name)
        self.app.toast(f"Saved session: {name}" if result.success else (result.error or "Save session failed."), level="success" if result.success else "error")

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription == "chains.sessions":
            sessions = _as_list(payload, "sessions", "items")
            table = self.query_one("#stage-sessions", DataTable)
            sync_table_rows(
                table,
                [(_value(session.get("id", session.get("session_id"))), _value(session.get("name"))) for session in sessions],
                row_keys=[f"session-{_value(session.get('id', session.get('session_id')))}" for session in sessions],
                sort_columns=("Name",),
            )
            self.query_one("#stage-summary", Static).update(f"Available sessions: {len(sessions)}")
        elif subscription == "chains.list":
            chains = _as_list(payload, "chains", "items")
            current = next((chain for chain in chains if chain.get("active") or chain.get("is_active")), None)
            if current:
                self.query_one("#stage-summary", Static).update(
                    f"Available sessions: {_value(len(_as_list(payload, 'sessions')))}\nActive chain: {_value(current.get('name'))}"
                )


class PlatformScreen(BaseScreen):
    route_key = "platform"
    route_title = "Platform"
    route_summary = "Core MAP2 services, runtime status, and host-level operations."
    show_context_panel = True

    def compose_body(self) -> ComposeResult:
        yield Label("Platform services", classes="section-title")
        yield DataTable(id="platform-services", classes="section-table")
        yield Label("Platform summary", classes="section-title")
        yield Static("", id="platform-summary", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        ensure_columns(self.query_one("#platform-services", DataTable), "Service", "State")
        self.update_context(
            "Platform operations are executed in background workers.",
            "Use the runtime panel to inspect progress and failures.",
        )

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("restart-backend", "Restart backend", "Platform", "Restart the backend service.", self._restart_backend, "warning"),
            ScreenAction("restart-system", "Restart system", "System", "Request a full system restart.", self._restart_system),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["system.services", "system.health", "system.version"]

    async def _restart_backend(self) -> None:
        if not await self.app.confirm("Restart the backend service?", title="Restart backend"):
            return
        result = await self.api_client.restart_backend()
        self.app.toast("Backend restart requested." if result.success else (result.error or "Backend restart failed."), level="success" if result.success else "error")

    async def _restart_system(self) -> None:
        if not await self.app.confirm("Request a full system restart?", title="Restart system"):
            return
        result = await self.api_client.restart_system()
        self.app.toast("System restart requested." if result.success else (result.error or "System restart failed."), level="success" if result.success else "error")

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription == "system.services":
            services = _as_dict(payload)
            items = _as_list(services, "services", "items")
            if not items and isinstance(services, dict):
                items = [{"name": key, "state": value} for key, value in services.items()]
            table = self.query_one("#platform-services", DataTable)
            sync_table_rows(
                table,
                [
                    (
                        _value(service.get("name", service.get("service"))),
                        render_status_text(service.get("state", service.get("status"))),
                    )
                    for service in items
                ],
                row_keys=[_value(service.get("name", service.get("service"))) for service in items],
                sort_columns=("Service",),
            )
        elif subscription == "system.health":
            data = _as_dict(payload)
            summary = self.query_one("#platform-summary", Static)
            summary.update(
                "\n".join(
                    [
                        f"Backend reachable: {_value(data.get('api_reachable', True))}",
                        f"Audio running: {_value(data.get('audio_running'))}",
                        f"Services running: {_value(data.get('services_running'))}",
                    ]
                )
            )
        elif subscription == "system.version":
            data = _as_dict(payload)
            current = _static_text(self.query_one("#platform-summary", Static))
            self.query_one("#platform-summary", Static).update(f"{current}\nVersion: {_value(data.get('version', get_version()))}")


class ClusterScreen(BaseScreen):
    route_key = "cluster"
    route_title = "Cluster"
    route_summary = "Cluster peers, deployment mode, and readiness information."
    show_context_panel = True

    def compose_body(self) -> ComposeResult:
        yield Label("Cluster nodes", classes="section-title")
        yield DataTable(id="cluster-nodes", classes="section-table")
        yield Label("Deployment readiness", classes="section-title")
        yield Static("", id="cluster-summary", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        ensure_columns(self.query_one("#cluster-nodes", DataTable), "Host", "Mode", "Latency", "Health")
        self.update_context(
            "Cluster and mode management are unified here.",
            "Use visible controls or Ctrl+K instead of memorizing per-screen keys.",
        )

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("mode-audio", "Set audio mode", "Platform", "Switch deployment mode to audio.", lambda: self._set_mode("audio"), "primary"),
            ScreenAction("mode-all-in-one", "Set all-in-one", "Platform", "Switch deployment mode to all-in-one.", lambda: self._set_mode("all-in-one")),
            ScreenAction("mode-management", "Set management", "Platform", "Switch deployment mode to management.", lambda: self._set_mode("management")),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["cluster.online_nodes", "cluster.health", "system.deployment_mode", "system.deployment_health"]

    async def _set_mode(self, mode: str) -> None:
        if not await self.app.confirm(f"Set deployment mode to {mode}?", title="Change mode"):
            return
        result = await self.api_client.set_deployment_mode(mode)
        self.app.toast(f"Deployment mode set to {mode}." if result.success else (result.error or "Change mode failed."), level="success" if result.success else "error")

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription == "cluster.online_nodes":
            items = _as_list(payload, "nodes", "items")
            table = self.query_one("#cluster-nodes", DataTable)
            sync_table_rows(
                table,
                [
                    (
                        _value(node.get("hostname")),
                        _value(node.get("mode")),
                        f"{_value(node.get('latency_ms', node.get('response_time_ms', 0)))} ms",
                        _value(node.get("health", node.get("status"))),
                    )
                    for node in items
                ],
                row_keys=[f"node-{_value(node.get('hostname'))}" for node in items],
                sort_columns=("Host",),
            )
        elif subscription == "cluster.health":
            data = _as_dict(payload)
            self.query_one("#cluster-summary", Static).update(
                "\n".join(
                    [
                        f"Cluster enabled: {_value(data.get('enabled'))}",
                        f"Peer count: {_value(data.get('peer_count', data.get('nodes_online')))}",
                        f"Clock synced: {_value(data.get('clock_synced'))}",
                        f"Manager latency: {_value(data.get('manager_latency_ms'))} ms",
                    ]
                )
            )
        elif subscription == "system.deployment_mode":
            data = _as_dict(payload)
            current = _static_text(self.query_one("#cluster-summary", Static))
            self.query_one("#cluster-summary", Static).update(f"{current}\nCurrent mode: {_extract_mode(data)}")
        elif subscription == "system.deployment_health":
            data = _as_dict(payload)
            current = _static_text(self.query_one("#cluster-summary", Static))
            self.query_one("#cluster-summary", Static).update(f"{current}\nDeployment health: {_value(data.get('status', data.get('overall_status')))}")


class MonitorScreen(BaseScreen):
    route_key = "monitor"
    route_title = "Monitor"
    route_summary = "Operational transparency for services, health, and runtime logs."
    show_context_panel = True

    def compose_body(self) -> ComposeResult:
        yield Label("Health summary", classes="section-title")
        yield Static("", id="monitor-summary", classes="section-panel")
        yield Label("Recent system logs", classes="section-title")
        yield Static("", id="monitor-logs", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        self.update_context("Repeated polling errors are deduplicated before toast delivery.")

    def get_subscriptions(self) -> list[str]:
        return ["system.health", "system.logs", "system.services_summary"]

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription == "system.health":
            data = _as_dict(payload)
            self.query_one("#monitor-summary", Static).update(
                "\n".join(
                    [
                        f"Status: {_value(data.get('status', data.get('overall_status')))}",
                        f"Audio running: {_value(data.get('audio_running'))}",
                        f"API version: {_value(data.get('version'))}",
                    ]
                )
            )
        elif subscription == "system.logs":
            logs = _as_list(payload, "logs", "items")
            if not logs and isinstance(payload, str):
                self.query_one("#monitor-logs", Static).update(payload)
                return
            lines = []
            for log in logs[:12]:
                if isinstance(log, dict):
                    lines.append(f"{_value(log.get('timestamp', 'now'))} · {_value(log.get('message', log.get('text')))}")
                else:
                    lines.append(str(log))
            self.query_one("#monitor-logs", Static).update("\n".join(lines) if lines else "No recent system logs.")
        elif subscription == "system.services_summary":
            data = _as_dict(payload)
            current = _static_text(self.query_one("#monitor-summary", Static))
            self.query_one("#monitor-summary", Static).update(f"{current}\nHealthy services: {_value(data.get('healthy', data.get('running')))}")


class NetworkScreen(BaseScreen):
    route_key = "network"
    route_title = "Network"
    route_summary = "Interface status, connectivity, and operator diagnostics."

    def compose_body(self) -> ComposeResult:
        yield Label("Interfaces", classes="section-title")
        yield DataTable(id="network-interfaces", classes="section-table")
        yield Static("", id="network-summary", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        ensure_columns(self.query_one("#network-interfaces", DataTable), "Interface", "IP", "State", "Speed")

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("ping-localhost", "Ping localhost", "Platform", "Run a basic connectivity test.", self._ping_localhost, "primary"),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["system.network", "system.ethernet"]

    async def _ping_localhost(self) -> None:
        result = await self.api_client.ping_host("127.0.0.1", count=2)
        self.app.toast("Connectivity test complete." if result.success else (result.error or "Ping failed."), level="success" if result.success else "error")

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription == "system.network":
            data = _as_dict(payload)
            self.query_one("#network-summary", Static).update(
                "\n".join(
                    [
                        f"Hostname: {_value(data.get('hostname'))}",
                        f"Primary IP: {_value(data.get('ip_address'))}",
                        f"Internet connected: {_value(data.get('internet_connected', data.get('connected')))}",
                    ]
                )
            )
        elif subscription == "system.ethernet":
            interfaces = _as_list(payload, "interfaces", "items")
            table = self.query_one("#network-interfaces", DataTable)
            sync_table_rows(
                table,
                [
                    (
                        _value(interface.get("name")),
                        _value(interface.get("ip_address", interface.get("ipv4"))),
                        _value(interface.get("state", interface.get("status"))),
                        _value(interface.get("speed", interface.get("speed_mbps"))),
                    )
                    for interface in interfaces
                ],
                row_keys=[f"iface-{_value(interface.get('name'))}" for interface in interfaces],
                sort_columns=("Interface",),
            )


class AVBScreen(BaseScreen):
    route_key = "avb"
    route_title = "AVB"
    route_summary = "AVB, PTP, TSN, and stream-discovery status."
    show_context_panel = True

    def compose_body(self) -> ComposeResult:
        yield Label("AVB summary", classes="section-title")
        yield Static("", id="avb-summary", classes="section-panel")
        yield Label("Streams", classes="section-title")
        yield DataTable(id="avb-streams", classes="section-table")

    def on_mount(self) -> None:
        super().on_mount()
        ensure_columns(self.query_one("#avb-streams", DataTable), "ID", "State", "Latency")
        self.update_context("AVB data is polled only while this route is visible.")

    def get_subscriptions(self) -> list[str]:
        return ["system.avb", "system.avb_streams", "system.ptp", "system.tsn"]

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription == "system.avb":
            data = _as_dict(payload)
            self.query_one("#avb-summary", Static).update(
                "\n".join(
                    [
                        f"Enabled: {_value(data.get('enabled'))}",
                        f"Available: {_value(data.get('available'))}",
                        f"PTP state: {_value(data.get('ptp_state'))}",
                    ]
                )
            )
        elif subscription == "system.avb_streams":
            streams = _as_list(payload, "streams", "items")
            table = self.query_one("#avb-streams", DataTable)
            sync_table_rows(
                table,
                [
                    (
                        _value(stream.get("id", stream.get("stream_id"))),
                        _value(stream.get("state", stream.get("status"))),
                        f"{_value(stream.get('latency_ms', 0))} ms",
                    )
                    for stream in streams
                ],
                row_keys=[f"stream-{_value(stream.get('id', stream.get('stream_id')))}" for stream in streams],
                sort_columns=("ID",),
            )
        elif subscription in {"system.ptp", "system.tsn"}:
            data = _as_dict(payload)
            current = _static_text(self.query_one("#avb-summary", Static))
            key = "PTP" if subscription == "system.ptp" else "TSN"
            self.query_one("#avb-summary", Static).update(f"{current}\n{key}: {_value(data.get('status', data.get('state')))}")


class LCDScreen(BaseScreen):
    route_key = "lcd"
    route_title = "LCD"
    route_summary = "LCD controller status and page management."

    def __init__(self, api_client=None, **kwargs: Any) -> None:
        super().__init__(api_client=api_client, **kwargs)
        self._pages: list[Any] = []

    def compose_body(self) -> ComposeResult:
        yield Label("LCD status", classes="section-title")
        yield Static("", id="lcd-summary", classes="section-panel")
        yield Label("Pages", classes="section-title")
        yield DataTable(id="lcd-pages", classes="section-table")

    def on_mount(self) -> None:
        super().on_mount()
        ensure_columns(self.query_one("#lcd-pages", DataTable), "Page")

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("set-page", "Set selected page", "Platform", "Apply the selected LCD page.", self._set_page, "primary"),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["system.lcd", "system.lcd_pages"]

    async def _set_page(self) -> None:
        if not self._pages:
            self.app.toast("No LCD pages available.", level="warning")
            return
        table = self.query_one("#lcd-pages", DataTable)
        index = table.cursor_row if table.cursor_row is not None else 0
        selected = self._pages[min(index, len(self._pages) - 1)]
        page = selected["page"] if isinstance(selected, dict) and "page" in selected else selected["name"] if isinstance(selected, dict) else str(selected)
        result = await self.api_client.set_lcd_page(str(page))
        self.app.toast(
            f"LCD page set to {page}." if result.success else (result.error or "Set LCD page failed."),
            level="success" if result.success else "error",
        )

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription == "system.lcd":
            data = _as_dict(payload)
            self.query_one("#lcd-summary", Static).update(
                "\n".join(
                    [
                        f"Connected: {_value(data.get('connected', data.get('enabled')))}",
                        f"Controller: {_value(data.get('controller'))}",
                        f"Current page: {_value(data.get('page', data.get('current_page')))}",
                    ]
                )
            )
        elif subscription == "system.lcd_pages":
            self._pages = _as_list(payload, "pages", "items")
            table = self.query_one("#lcd-pages", DataTable)
            sync_table_rows(
                table,
                [(_value(page.get("page", page.get("name")) if isinstance(page, dict) else page),) for page in self._pages],
                row_keys=[f"page-{index}" for index, _page in enumerate(self._pages)],
                sort_columns=("Page",),
            )


class SettingsScreen(BaseScreen):
    route_key = "settings"
    route_title = "Settings"
    route_summary = "Theme, runtime preferences, and environment visibility."

    def compose_body(self) -> ComposeResult:
        yield Label("Current settings", classes="section-title")
        yield Static("", id="settings-summary", classes="section-panel")

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("switch-theme", "Switch theme", "Settings", "Toggle between Carbon dark and light themes.", self.app.cycle_theme, "primary"),
            ScreenAction("test-audio", "Test audio", "Settings", "Read the current audio latency.", self._test_audio),
            ScreenAction("test-network", "Test network", "Settings", "Read the current network status.", self._test_network),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["system.realtime", "system.network", "system.version"]

    async def _test_audio(self) -> None:
        result = await self.api_client.get_audio_latency()
        data = _as_dict(result.data) if result.success else {}
        self.app.toast(
            f"Audio latency: {_value(data.get('latency_ms', data.get('round_trip_ms')))} ms" if result.success else (result.error or "Audio test failed."),
            level="success" if result.success else "error",
        )

    async def _test_network(self) -> None:
        result = await self.api_client.get_network_status()
        data = _as_dict(result.data) if result.success else {}
        self.app.toast(
            f"Network reachable: {_value(data.get('connected', data.get('internet_connected')))}" if result.success else (result.error or "Network test failed."),
            level="success" if result.success else "error",
        )

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription == "system.realtime":
            data = _as_dict(payload)
            self.query_one("#settings-summary", Static).update(
                "\n".join(
                    [
                        f"Theme: {self.app.session_state.theme_name}",
                        f"Environment: {self.app.session_state.environment}",
                        f"Workspace: {self.app.session_state.workspace}",
                        f"Realtime configured: {_value(data.get('configured', data.get('enabled')))}",
                    ]
                )
            )
        elif subscription == "system.network":
            data = _as_dict(payload)
            current = _static_text(self.query_one("#settings-summary", Static))
            self.query_one("#settings-summary", Static).update(f"{current}\nNetwork IP: {_value(data.get('ip_address'))}")
        elif subscription == "system.version":
            data = _as_dict(payload)
            current = _static_text(self.query_one("#settings-summary", Static))
            self.query_one("#settings-summary", Static).update(f"{current}\nVersion: {_value(data.get('version', get_version()))}")


class ConfigScreen(BaseScreen):
    route_key = "config"
    route_title = "Config"
    route_summary = "Persistent console configuration and file-path visibility."

    def __init__(self, session_state: SessionState, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._session_state = session_state

    def compose_body(self) -> ComposeResult:
        yield Static("", id="config-summary", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        self.query_one("#config-summary", Static).update(
            "\n".join(
                [
                    f"Product: {get_product_name()}",
                    f"Version: {get_version()}",
                    f"User: {getpass.getuser()}",
                    f"Theme: {self._session_state.theme_name}",
                    f"Workspace: {self._session_state.workspace}",
                    f"Project root: {Path(__file__).resolve().parents[2]}",
                ]
            )
        )

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("reset-onboarding", "Reset onboarding", "Settings", "Mark the onboarding flow as incomplete.", self._reset_onboarding),
        ]

    async def _reset_onboarding(self) -> None:
        self.app.session_state.onboarding_completed = False
        self.app.persist_session_state()
        self.app.toast("Onboarding will open on the next launch.", level="success")


class ModeScreen(BaseScreen):
    route_key = "mode"
    route_title = "Mode"
    route_summary = "Deployment mode, readiness, and remediation controls."

    def compose_body(self) -> ComposeResult:
        yield Static("", id="mode-summary", classes="section-panel")

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("set-audio", "Audio mode", "Settings", "Switch to audio deployment mode.", lambda: self._set_mode("audio"), "primary"),
            ScreenAction("set-all-in-one", "All-in-one", "Settings", "Switch to all-in-one deployment mode.", lambda: self._set_mode("all-in-one")),
            ScreenAction("set-management", "Management", "Settings", "Switch to management deployment mode.", lambda: self._set_mode("management")),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["system.deployment_mode", "system.deployment_status", "system.deployment_health"]

    async def _set_mode(self, mode: str) -> None:
        result = await self.api_client.set_deployment_mode(mode)
        self.app.toast(f"Deployment mode set to {mode}." if result.success else (result.error or "Mode change failed."), level="success" if result.success else "error")

    def handle_subscription(self, subscription: str, payload: object) -> None:
        data = _as_dict(payload)
        current = _static_text(self.query_one("#mode-summary", Static))
        if subscription == "system.deployment_mode":
            self.query_one("#mode-summary", Static).update(f"Current mode: {_extract_mode(data)}")
        elif subscription == "system.deployment_status":
            self.query_one("#mode-summary", Static).update(f"{current}\nStatus: {_value(data.get('status'))}")
        elif subscription == "system.deployment_health":
            self.query_one("#mode-summary", Static).update(f"{current}\nHealth: {_value(data.get('status', data.get('overall_status')))}")


class WorkflowScreen(BaseScreen):
    route_key = "workflow"
    route_title = "Workflow"
    route_summary = "Native setup, install, and operational workflow hub."
    show_context_panel = True

    def __init__(self, api_client=None, **kwargs: Any) -> None:
        super().__init__(api_client=api_client, **kwargs)
        self._workflow_defs = get_workflow_definitions()
        self._workflow_map = {workflow.workflow_id: workflow for workflow in self._workflow_defs}
        self._workflow_state: dict[str, dict[str, object]] = {}
        self._selected_workflow_id = self._workflow_defs[0].workflow_id if self._workflow_defs else ""

    def compose_body(self) -> ComposeResult:
        yield Static("", id="workflow-summary", classes="section-panel")
        yield Label("Workflow inventory", classes="section-title")
        yield DataTable(id="workflow-tasks", classes="section-table")
        yield Label("Selected workflow", classes="section-title")
        yield Static("", id="workflow-detail", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        table = self.query_one("#workflow-tasks", DataTable)
        ensure_columns(table, "Task", "Legacy source", "Execution")
        sync_table_rows(table, [])
        for workflow in self._workflow_defs:
            execution = "Native form + worker"
            if workflow.workflow_id == "node-install":
                execution = "Native form + API worker"
            elif workflow.workflow_id in {"mode-set", "cpu-pinning", "realtime-setup", "avb-setup", "avb-ptp-setup"}:
                execution = "Native API + worker"
            table.add_row(workflow.label, workflow.legacy_source, execution, key=workflow.workflow_id)
        self.update_context(
            "Interactive shell entrypoints are routed here first.",
            "Preview runs are available before execution for every workflow.",
            "If passwordless sudo is unavailable, suspend with Ctrl+Z and use the shell fallback only as needed.",
        )
        self._update_workflow_summary()
        self._update_workflow_detail()

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("open-onboarding", "Open onboarding", "Settings", "Open the onboarding flow.", lambda: self.app.open_route("onboarding"), "primary"),
            ScreenAction("configure-workflow", "Configure workflow", "System", "Edit the selected workflow inputs.", self._configure_selected_workflow, "primary"),
            ScreenAction("preview-workflow", "Preview workflow", "System", "Preview the selected workflow command.", self._preview_selected_workflow),
            ScreenAction("execute-workflow", "Execute workflow", "System", "Run the selected workflow in a background worker.", self._execute_selected_workflow, "warning"),
        ]

    def get_subscriptions(self) -> list[str]:
        return []

    def handle_subscription(self, subscription: str, payload: object) -> None:
        del subscription, payload

    @on(DataTable.RowHighlighted)
    def _on_workflow_row_highlighted(self, event: DataTable.RowHighlighted) -> None:
        if event.data_table.id != "workflow-tasks":
            return
        row_key = str(event.row_key.value) if event.row_key is not None else ""
        if row_key:
            self._selected_workflow_id = row_key
            self._update_workflow_detail()
            self._update_workflow_summary()

    def _selected_workflow(self) -> WorkflowDefinition | None:
        if not self._selected_workflow_id and self._workflow_defs:
            self._selected_workflow_id = self._workflow_defs[0].workflow_id
        return self._workflow_map.get(self._selected_workflow_id)

    def _update_workflow_summary(self) -> None:
        workflow = self._selected_workflow()
        state = self._workflow_state.get(self._selected_workflow_id, {})
        self.query_one("#workflow-summary", Static).update(
            "\n".join(
                [
                    f"Selected workflow: {workflow.label if workflow else 'None'}",
                    f"Stored inputs: {len(state)} field(s)",
                    "Execution runs in a worker and streams output to the shared runtime panel.",
                    "Shell fallbacks are retained only for exceptional cases.",
                ]
            )
        )

    def _update_workflow_detail(self) -> None:
        workflow = self._selected_workflow()
        if workflow is None:
            self.query_one("#workflow-detail", Static).update("No workflow selected.")
            return
        state = self._workflow_state.get(workflow.workflow_id, {})
        state_lines = [
            f"{field.replace('_', ' ').title()}: {_value(value)}"
            for field, value in state.items()
        ]
        if not state_lines:
            state_lines = ["No stored inputs yet. Use Configure workflow to set execution values."]
        self.query_one("#workflow-detail", Static).update(
            "\n".join(
                [
                    workflow.summary,
                    f"Legacy source: {workflow.legacy_source}",
                    "",
                    *state_lines,
                ]
            )
        )

    def _dialog_fields_for(self, workflow: WorkflowDefinition) -> list[dict[str, object]]:
        state = self._workflow_state.get(workflow.workflow_id, {})
        fields: list[dict[str, object]] = []
        for field in workflow.fields:
            definition = dict(field)
            if definition["name"] in state:
                definition["default"] = state[definition["name"]]
            fields.append(definition)
        return fields

    async def _configure_selected_workflow(self) -> None:
        workflow = self._selected_workflow()
        if workflow is None:
            self.app.toast("No workflow selected.", level="warning")
            return
        if not workflow.fields:
            self._workflow_state[workflow.workflow_id] = {}
            self.app.toast(f"{workflow.label} does not require additional inputs.", level="information")
            self._update_workflow_summary()
            self._update_workflow_detail()
            return
        result = await self.app.push_screen_wait(FormDialog(self._dialog_fields_for(workflow), title=workflow.label))
        if not result:
            return
        if workflow.validator:
            error = workflow.validator(result)
            if error:
                self.app.toast(error, level="error")
                return
        self._workflow_state[workflow.workflow_id] = result
        self.app.toast(f"Stored inputs for {workflow.label}.", level="success")
        self._update_workflow_summary()
        self._update_workflow_detail()

    async def _preview_selected_workflow(self) -> None:
        workflow = self._selected_workflow()
        if workflow is None:
            self.app.toast("No workflow selected.", level="warning")
            return
        config = await self._ensure_workflow_config(workflow)
        if config is None:
            return
        spec = workflow.builder(config, True)
        try:
            await self.app.push_screen_wait(
                MessageDialog(
                    "\n".join(
                        [
                            workflow.summary,
                            f"Legacy source: {workflow.legacy_source}",
                            "",
                            spec.preview,
                        ]
                    ),
                    title=f"{workflow.label} preview",
                )
            )
        finally:
            self._cleanup_paths(spec.cleanup_paths)

    async def _execute_selected_workflow(self) -> None:
        workflow = self._selected_workflow()
        if workflow is None:
            self.app.toast("No workflow selected.", level="warning")
            return
        config = await self._ensure_workflow_config(workflow)
        if config is None:
            return
        spec = workflow.builder(config, False)
        try:
            if spec.requires_passwordless_sudo and not await self._check_passwordless_sudo():
                self.app.toast("Passwordless sudo is not available. Suspend with Ctrl+Z and run the shell fallback if needed.", level="warning")
                return
            if not await self.app.confirm(f"Run {workflow.label}?", title="Execute workflow"):
                return
            await self._run_workflow_spec(workflow, spec)
        finally:
            self._cleanup_paths(spec.cleanup_paths)

    async def _ensure_workflow_config(self, workflow: WorkflowDefinition) -> dict[str, object] | None:
        config = dict(self._workflow_state.get(workflow.workflow_id, {}))
        if workflow.fields and not config:
            await self._configure_selected_workflow()
            config = dict(self._workflow_state.get(workflow.workflow_id, {}))
        if workflow.validator:
            error = workflow.validator(config)
            if error:
                self.app.toast(error, level="error")
                return None
        return config

    async def _check_passwordless_sudo(self) -> bool:
        process = await asyncio.create_subprocess_exec(
            "sudo",
            "-n",
            "true",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        return await process.wait() == 0

    async def _run_workflow_spec(self, workflow: WorkflowDefinition, spec: WorkflowRunSpec) -> None:
        if spec.native_action:
            await self._run_native_workflow_spec(workflow, spec)
            return
        self.app.log_runtime("info", f"Executing {workflow.label}: {spec.preview}")
        process = await asyncio.create_subprocess_exec(
            *spec.command,
            cwd=str(spec.cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        assert process.stdout is not None
        while True:
            line = await process.stdout.readline()
            if not line:
                break
            self.app.log_runtime("info", line.decode(errors="replace").rstrip())
        return_code = await process.wait()
        if return_code == 0:
            self.app.toast(f"{workflow.label} completed successfully.", level="success")
        else:
            self.app.toast(f"{workflow.label} failed with exit code {return_code}.", level="error")
        self.app.force_refresh_active_route()

    async def _run_native_workflow_spec(self, workflow: WorkflowDefinition, spec: WorkflowRunSpec) -> None:
        self.app.log_runtime("info", f"Executing {workflow.label}: {spec.preview}")
        if spec.native_action == "apply-node-install":
            await self._run_native_node_install(workflow, spec)
            return
        if spec.native_action == "set-deployment-mode":
            await self._run_native_mode_set(workflow, spec)
            return
        if spec.native_action == "apply-rt-hardening":
            await self._run_native_realtime_setup(workflow, spec)
            return
        if spec.native_action == "apply-avb-setup":
            await self._run_native_avb_setup(workflow, spec)
            return
        if spec.native_action == "apply-avb-ptp-setup":
            await self._run_native_avb_ptp_setup(workflow, spec)
            return
        if spec.native_action == "reset-cpu-isolation":
            await self._run_native_cpu_isolation_reset(workflow)
            return
        raise RuntimeError(f"Unsupported native workflow action: {spec.native_action}")

    async def _run_native_mode_set(self, workflow: WorkflowDefinition, spec: WorkflowRunSpec) -> None:
        mode = str(spec.native_payload.get("mode", "all-in-one") or "all-in-one")
        self.app.log_runtime("info", f"Requesting deployment mode change to {mode}.")
        result = await self.api_client.set_deployment_mode(mode)
        if result.success:
            current_mode = await self.api_client.get_deployment_mode()
            if current_mode.success:
                self.app.log_runtime("success", f"Deployment mode reported by backend: {_extract_mode(current_mode.data)}.")
            elif current_mode.error:
                self.app.log_runtime("warning", current_mode.error)
            self.app.toast(f"{workflow.label} completed successfully.", level="success")
        else:
            self.app.toast(result.error or "Deployment mode change failed.", level="error")
        self.app.force_refresh_active_route()

    async def _run_native_node_install(self, workflow: WorkflowDefinition, spec: WorkflowRunSpec) -> None:
        config = spec.native_payload.get("config", {})
        if not isinstance(config, dict):
            raise RuntimeError("Node install workflow payload is invalid.")

        self.app.log_runtime("info", f"Node install target: {_value(config.get('node_name', config.get('node_id', 'unknown')))}.")
        result = await self.api_client.apply_node_install(config, dry_run=False, auto_yes=True)
        await self._handle_native_command_result(workflow, result, success_message="Node install complete.")

    async def _run_native_realtime_setup(self, workflow: WorkflowDefinition, spec: WorkflowRunSpec) -> None:
        profile = str(spec.native_payload.get("profile", "Performance") or "Performance")
        force = bool(spec.native_payload.get("force"))
        self.app.log_runtime("info", f"Checking RT hardening state for {profile} profile.")

        verification = await self.api_client.verify_rt_hardening()
        if verification.success and isinstance(verification.data, dict):
            self.app.log_runtime("info", f"RT hardening grade: {_value(verification.data.get('grade', 'unknown'))}.")
            if verification.data.get("stderr"):
                self.app.log_runtime("warning", str(verification.data["stderr"]).strip())
        elif verification.error:
            self.app.log_runtime("warning", verification.error)

        apply_result = await self.api_client.apply_rt_hardening(dry_run=False, auto_yes=True)
        apply_payload = apply_result.data if isinstance(apply_result.data, dict) else {}
        if not apply_result.success or not bool(apply_payload.get("ok", apply_result.success)):
            message = apply_result.error or _value(apply_payload.get("stderr", "RT hardening apply failed."))
            self.app.toast(message, level="error")
            self.app.force_refresh_active_route()
            return

        self.app.log_runtime("info", f"RT hardening apply return code: {_value(apply_payload.get('returncode', 0))}.")
        if apply_payload.get("stdout"):
            lines = str(apply_payload["stdout"]).splitlines()
            for line in lines[-5:]:
                if line.strip():
                    self.app.log_runtime("info", line.strip())

        switch = await self.api_client.switch_runtime_profile(profile, dry_run=False, force=force)
        if not switch.success:
            self.app.toast(switch.error or "Runtime profile switch failed.", level="error")
            self.app.force_refresh_active_route()
            return

        switch_payload = switch.data if isinstance(switch.data, dict) else {}
        self.app.log_runtime("info", f"Runtime profile switch status: {_value(switch_payload.get('status', 'applied'))}.")
        current_status = await self.api_client.get_runtime_profile_status()
        if current_status.success and isinstance(current_status.data, dict):
            self.app.log_runtime(
                "success",
                f"Runtime profile active: {_value(current_status.data.get('current_profile', profile))}.",
            )
        elif current_status.error:
            self.app.log_runtime("warning", current_status.error)

        self.app.toast(f"{workflow.label} completed successfully.", level="success")
        self.app.force_refresh_active_route()

    async def _run_native_cpu_isolation_reset(self, workflow: WorkflowDefinition) -> None:
        status = await self.api_client.get_cpu_isolation_status()
        if status.success and isinstance(status.data, dict):
            mode = _value(status.data.get("mode"))
            expected = _value(status.data.get("expected_latency_ms"))
            self.app.log_runtime("info", f"Current CPU isolation mode: {mode}. Expected latency target: {expected}.")
            warnings = status.data.get("warnings")
            if isinstance(warnings, list):
                for warning in warnings[:5]:
                    self.app.log_runtime("warning", str(warning))
        elif status.error:
            self.app.log_runtime("warning", status.error)

        result = await self.api_client.reset_cpu_isolation_to_mode()
        if not result.success:
            self.app.toast(result.error or "CPU isolation reset failed.", level="error")
            self.app.force_refresh_active_route()
            return

        payload = result.data if isinstance(result.data, dict) else {}
        self.app.log_runtime("info", f"CPU isolation reset status: {_value(payload.get('status', 'success'))}.")
        changes = payload.get("changes_applied")
        if isinstance(changes, list):
            for change in changes:
                self.app.log_runtime("info", str(change))
        warnings = payload.get("warnings")
        if isinstance(warnings, list):
            for warning in warnings:
                self.app.log_runtime("warning", str(warning))

        verification = await self.api_client.verify_cpu_isolation()
        if verification.success and isinstance(verification.data, dict):
            message = _value(verification.data.get("message", "CPU isolation verification complete."))
            self.app.log_runtime("info", message)
            mismatches = verification.data.get("mismatches")
            if isinstance(mismatches, list):
                for mismatch in mismatches[:5]:
                    self.app.log_runtime("warning", str(mismatch))
        elif verification.error:
            self.app.log_runtime("warning", verification.error)

        self.app.toast(f"{workflow.label} completed successfully.", level="success")
        self.app.force_refresh_active_route()

    async def _run_native_avb_setup(self, workflow: WorkflowDefinition, spec: WorkflowRunSpec) -> None:
        interface = str(spec.native_payload.get("interface", "") or "")
        status = await self.api_client.get_avb_status()
        if status.success and isinstance(status.data, dict):
            self.app.log_runtime("info", f"Current AVB state: {_value(status.data.get('state', 'unknown'))}.")
            self.app.log_runtime("info", f"Configured interface: {_value(status.data.get('interface', interface or 'auto-detect'))}.")
        elif status.error:
            self.app.log_runtime("warning", status.error)

        result = await self.api_client.apply_avb_setup(interface=interface, dry_run=False, auto_yes=True)
        await self._handle_native_command_result(workflow, result, success_message="AVB setup complete.")

    async def _run_native_avb_ptp_setup(self, workflow: WorkflowDefinition, spec: WorkflowRunSpec) -> None:
        interface = str(spec.native_payload.get("interface", "") or "")
        domain = int(spec.native_payload.get("domain", 0) or 0)
        priority = int(spec.native_payload.get("priority", 128) or 128)

        status = await self.api_client.get_ptp_status()
        if status.success and isinstance(status.data, dict):
            self.app.log_runtime("info", f"Current PTP availability: {_value(status.data.get('available', False))}.")
        elif status.error:
            self.app.log_runtime("warning", status.error)

        result = await self.api_client.apply_avb_ptp_setup(
            interface=interface,
            domain=domain,
            priority=priority,
            dry_run=False,
            auto_yes=True,
        )
        await self._handle_native_command_result(workflow, result, success_message="AVB/PTP setup complete.")

    async def _handle_native_command_result(self, workflow: WorkflowDefinition, result, *, success_message: str) -> None:
        payload = result.data if isinstance(result.data, dict) else {}
        if not result.success or not bool(payload.get("ok", result.success)):
            message = result.error or _value(payload.get("stderr", f"{workflow.label} failed."))
            self.app.toast(message, level="error")
            self.app.force_refresh_active_route()
            return

        self.app.log_runtime("info", f"Command return code: {_value(payload.get('returncode', 0))}.")
        for key in ("stdout", "stderr"):
            content = str(payload.get(key, "") or "").strip()
            if not content:
                continue
            level = "warning" if key == "stderr" else "info"
            for line in content.splitlines()[-6:]:
                if line.strip():
                    self.app.log_runtime(level, line.strip())

        self.app.toast(success_message, level="success")
        self.app.force_refresh_active_route()

    def _cleanup_paths(self, paths: tuple[Path, ...]) -> None:
        for path in paths:
            try:
                path.unlink(missing_ok=True)
            except Exception:
                pass


class BackupScreen(BaseScreen):
    route_key = "backup"
    route_title = "Backup"
    route_summary = "Backup inventory and restore controls."

    def __init__(self, api_client=None, **kwargs: Any) -> None:
        super().__init__(api_client=api_client, **kwargs)
        self._backups: list[dict[str, Any]] = []

    def compose_body(self) -> ComposeResult:
        yield Label("Backups", classes="section-title")
        yield DataTable(id="backup-table", classes="section-table")
        yield Static("", id="backup-summary", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        ensure_columns(self.query_one("#backup-table", DataTable), "ID", "Created", "Description")

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("create-backup", "Create backup", "Settings", "Create a new backup.", self._create_backup, "primary"),
            ScreenAction("restore-backup", "Restore selected", "Settings", "Restore the selected backup.", self._restore_selected_backup, "warning"),
            ScreenAction("delete-backup", "Delete selected", "Settings", "Delete the selected backup.", self._delete_selected_backup),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["system.backups", "system.backup_status"]

    async def _create_backup(self) -> None:
        description = await self.app.push_screen_wait(InputDialog("Backup description:", title="Create backup"))
        result = await self.api_client.create_backup(description or "")
        self.app.toast("Backup creation requested." if result.success else (result.error or "Backup creation failed."), level="success" if result.success else "error")

    async def _restore_selected_backup(self) -> None:
        if not self._backups:
            self.app.toast("No backups available.", level="warning")
            return
        table = self.query_one("#backup-table", DataTable)
        index = table.cursor_row if table.cursor_row is not None else 0
        backup = self._backups[min(index, len(self._backups) - 1)]
        backup_id = str(backup.get("id", backup.get("backup_id")))
        if not await self.app.confirm(f"Restore backup {backup_id}?", title="Restore backup"):
            return
        result = await self.api_client.restore_backup(backup_id)
        self.app.toast("Backup restore requested." if result.success else (result.error or "Backup restore failed."), level="success" if result.success else "error")

    async def _delete_selected_backup(self) -> None:
        if not self._backups:
            self.app.toast("No backups available.", level="warning")
            return
        table = self.query_one("#backup-table", DataTable)
        index = table.cursor_row if table.cursor_row is not None else 0
        backup = self._backups[min(index, len(self._backups) - 1)]
        backup_id = str(backup.get("id", backup.get("backup_id")))
        if not await self.app.confirm(f"Delete backup {backup_id}?", title="Delete backup"):
            return
        result = await self.api_client.delete_backup(backup_id)
        self.app.toast("Backup deleted." if result.success else (result.error or "Delete backup failed."), level="success" if result.success else "error")

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription == "system.backups":
            self._backups = _as_list(payload, "backups", "items")
            table = self.query_one("#backup-table", DataTable)
            sync_table_rows(
                table,
                [
                    (
                        _value(backup.get("id", backup.get("backup_id"))),
                        _value(backup.get("created_at", backup.get("timestamp"))),
                        _value(backup.get("description")),
                    )
                    for backup in self._backups
                ],
                row_keys=[f"backup-{_value(backup.get('id', backup.get('backup_id')))}" for backup in self._backups],
                sort_columns=("Created",),
                reverse=True,
            )
        elif subscription == "system.backup_status":
            data = _as_dict(payload)
            self.query_one("#backup-summary", Static).update(
                "\n".join(
                    [
                        f"Total backups: {_value(data.get('total_backups', len(self._backups)))}",
                        f"Valid backups: {_value(data.get('valid_backups'))}",
                        f"Storage used: {_value(data.get('total_size'))}",
                    ]
                )
            )


class UpdatesScreen(BaseScreen):
    route_key = "updates"
    route_title = "Updates"
    route_summary = "Version, update endpoint status, and cutover-readiness signals."

    def compose_body(self) -> ComposeResult:
        yield Static("", id="updates-summary", classes="section-panel")

    def get_subscriptions(self) -> list[str]:
        return ["system.updates", "system.version"]

    def handle_subscription(self, subscription: str, payload: object) -> None:
        data = _as_dict(payload)
        if subscription == "system.updates":
            self.query_one("#updates-summary", Static).update(
                "\n".join(
                    [
                        f"Update status: {_value(data.get('status'))}",
                        f"Current version: {_value(data.get('version', get_version()))}",
                    ]
                )
            )
        elif subscription == "system.version":
            current = _static_text(self.query_one("#updates-summary", Static))
            self.query_one("#updates-summary", Static).update(f"{current}\nConsole version: {_value(data.get('version', get_version()))}")


class DiagnosticsScreen(BaseScreen):
    route_key = "diagnostics"
    route_title = "Diagnostics"
    route_summary = "Health checks, diagnostics evidence, and host troubleshooting."
    show_context_panel = True

    def compose_body(self) -> ComposeResult:
        yield Label("Diagnostics summary", classes="section-title")
        yield Static("", id="diagnostics-summary", classes="section-panel")
        yield Label("Readiness checks", classes="section-title")
        yield DataTable(id="diagnostics-checks", classes="section-table")

    def on_mount(self) -> None:
        super().on_mount()
        ensure_columns(self.query_one("#diagnostics-checks", DataTable), "Check", "Status", "Message")
        self.update_context("Diagnostics is the recommended route after resuming from a suspended shell.")

    def get_actions(self) -> list[ScreenAction]:
        return [
            ScreenAction("run-health", "Run health check", "System", "Refresh the current health check state.", self.app.force_refresh_active_route, "primary"),
            ScreenAction("ping-localhost", "Ping localhost", "System", "Run a quick network check.", self._ping_localhost),
        ]

    def get_subscriptions(self) -> list[str]:
        return ["system.health", "system.health_checks", "system.usb"]

    async def _ping_localhost(self) -> None:
        result = await self.api_client.ping_host("127.0.0.1", count=2)
        self.app.toast("Network check complete." if result.success else (result.error or "Network check failed."), level="success" if result.success else "error")

    def handle_subscription(self, subscription: str, payload: object) -> None:
        if subscription == "system.health":
            data = _as_dict(payload)
            self.query_one("#diagnostics-summary", Static).update(
                "\n".join(
                    [
                        f"Overall status: {_value(data.get('status', data.get('overall_status')))}",
                        f"Audio running: {_value(data.get('audio_running'))}",
                        f"Services running: {_value(data.get('services_running'))}",
                    ]
                )
            )
        elif subscription == "system.health_checks":
            checks = _as_list(payload, "checks", "items")
            table = self.query_one("#diagnostics-checks", DataTable)
            sync_table_rows(
                table,
                [(_value(check.get("name")), _value(check.get("status")), _value(check.get("message"))) for check in checks],
                row_keys=[f"check-{_value(check.get('name'))}" for check in checks],
                sort_columns=("Check",),
            )
        elif subscription == "system.usb":
            data = _as_dict(payload)
            current = _static_text(self.query_one("#diagnostics-summary", Static))
            self.query_one("#diagnostics-summary", Static).update(f"{current}\nUSB diagnostics: {_value(data.get('status', data.get('summary')))}")


class OnboardingWizardScreen(BaseScreen):
    route_key = "onboarding"
    route_title = "Onboarding"
    route_summary = "Intentional first-run setup for environment, mode, and workspace readiness."
    show_context_panel = True

    def __init__(self, session_state: SessionState, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._session_state = session_state
        self._selected_mode = "all-in-one"
        self._steps = [
            "Review environment",
            "Choose deployment mode",
            "Confirm workspace readiness",
        ]
        self._step_index = 0

    def compose_body(self) -> ComposeResult:
        yield Static("", id="onboarding-step", classes="section-panel")
        yield Static("", id="onboarding-summary", classes="section-panel")

    def on_mount(self) -> None:
        super().on_mount()
        self.update_context("First run routes here automatically until onboarding is completed.")
        self._render_step()

    def get_actions(self) -> list[ScreenAction]:
        actions = []
        if self._step_index > 0:
            actions.append(ScreenAction("back", "Back", "Settings", "Return to the previous step.", self._back))
        if self._step_index < len(self._steps) - 1:
            actions.append(ScreenAction("next", "Next", "Settings", "Advance to the next onboarding step.", self._next, "primary"))
        else:
            actions.append(ScreenAction("finish", "Finish", "Settings", "Complete onboarding and enter the dashboard.", self._finish, "primary"))
        actions.extend(
            [
                ScreenAction("mode-audio", "Audio", "Settings", "Select audio mode.", lambda: self._set_mode("audio")),
                ScreenAction("mode-all-in-one", "All-in-one", "Settings", "Select all-in-one mode.", lambda: self._set_mode("all-in-one")),
                ScreenAction("mode-management", "Management", "Settings", "Select management mode.", lambda: self._set_mode("management")),
            ]
        )
        return actions

    def _set_mode(self, mode: str) -> None:
        self._selected_mode = mode
        self._render_step()

    def _back(self) -> None:
        self._step_index = max(0, self._step_index - 1)
        self._render_step()
        self.app.refresh_route_actions()

    def _next(self) -> None:
        self._step_index = min(len(self._steps) - 1, self._step_index + 1)
        self._render_step()
        self.app.refresh_route_actions()

    def _finish(self) -> None:
        self._session_state.onboarding_completed = True
        self.app.persist_session_state()
        self.app.toast("Onboarding complete.", level="success")
        self.app.open_route("dashboard")

    def _render_step(self) -> None:
        step = self.query_one("#onboarding-step", Static)
        summary = self.query_one("#onboarding-summary", Static)
        step.update(
            "\n".join(
                [
                    f"Step {self._step_index + 1} of {len(self._steps)}",
                    self._steps[self._step_index],
                    "",
                    f"Target environment: {self._session_state.environment}",
                    f"Workspace: {self._session_state.workspace}",
                    f"Selected mode: {self._selected_mode}",
                ]
            )
        )
        summary.update(
            "\n".join(
                [
                    f"User identity: {getpass.getuser()}",
                    f"Product: {get_product_name()}",
                    f"Version: {get_version()}",
                    "Use Finish to persist onboarding and land on Dashboard.",
                ]
            )
        )


@dataclass(frozen=True)
class UnifiedRoute:
    """Route metadata consumed by the host app."""

    key: str
    label: str
    group: str
    palette_category: str
    factory: Callable[[], BaseScreen]
    nav_visible: bool = True


def build_unified_routes(api_client, session_state: SessionState) -> list[UnifiedRoute]:
    """Build the canonical route registry for the unified host shell."""

    return [
        UnifiedRoute("dashboard", "Dashboard", "Dashboard", "Dashboard", lambda: DashboardScreen(api_client=api_client, id="dashboard")),
        UnifiedRoute("audio", "Audio", "Audio", "Audio", lambda: AudioScreen(api_client=api_client, id="audio")),
        UnifiedRoute("chains", "Chains", "Audio", "Audio", lambda: ChainsManagerScreen(api_client=api_client, id="chains")),
        UnifiedRoute("effects", "Effects", "Audio", "Audio", lambda: EffectsManagerScreen(api_client=api_client, id="effects")),
        UnifiedRoute("midi", "MIDI", "Audio", "Audio", lambda: MIDIScreen(api_client=api_client, id="midi")),
        UnifiedRoute("guitar", "Guitar", "Audio", "Audio", lambda: GuitarScreen(api_client=api_client, id="guitar")),
        UnifiedRoute("stage", "Stage", "Audio", "Audio", lambda: StageViewScreen(api_client=api_client, id="stage")),
        UnifiedRoute("platform", "Platform", "Platform", "Platform", lambda: PlatformScreen(api_client=api_client, id="platform")),
        UnifiedRoute("cluster", "Cluster", "Platform", "Platform", lambda: ClusterScreen(api_client=api_client, id="cluster")),
        UnifiedRoute("monitor", "Monitor", "Platform", "Platform", lambda: MonitorScreen(api_client=api_client, id="monitor")),
        UnifiedRoute("network", "Network", "Platform", "Platform", lambda: NetworkScreen(api_client=api_client, id="network")),
        UnifiedRoute("avb", "AVB", "Platform", "Platform", lambda: AVBScreen(api_client=api_client, id="avb")),
        UnifiedRoute("lcd", "LCD", "Platform", "Platform", lambda: LCDScreen(api_client=api_client, id="lcd")),
        UnifiedRoute("settings", "Settings", "Settings", "Settings", lambda: SettingsScreen(api_client=api_client, id="settings")),
        UnifiedRoute("config", "Config", "Settings", "Settings", lambda: ConfigScreen(session_state=session_state, id="config")),
        UnifiedRoute("mode", "Mode", "Settings", "Settings", lambda: ModeScreen(api_client=api_client, id="mode")),
        UnifiedRoute("workflow", "Workflow", "Settings", "Settings", lambda: WorkflowScreen(api_client=api_client, id="workflow")),
        UnifiedRoute("backup", "Backup", "Settings", "Settings", lambda: BackupScreen(api_client=api_client, id="backup")),
        UnifiedRoute("updates", "Updates", "Settings", "Settings", lambda: UpdatesScreen(api_client=api_client, id="updates")),
        UnifiedRoute("diagnostics", "Diagnostics", "Settings", "Settings", lambda: DiagnosticsScreen(api_client=api_client, id="diagnostics")),
        UnifiedRoute(
            "onboarding",
            "Onboarding",
            "Settings",
            "Settings",
            lambda: OnboardingWizardScreen(session_state=session_state, id="onboarding"),
            nav_visible=False,
        ),
    ]
