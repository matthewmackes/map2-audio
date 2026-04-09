from __future__ import annotations

from pathlib import Path
import re
from unittest.mock import AsyncMock, Mock

import pytest

from tui.app import MAP2ConsoleApp
from tui.api.base import APIResult
from tui.commands.providers import RouteCommandProvider
from tui.modals import ConfirmDialog, FormDialog, InputDialog, MessageDialog, NumberInputDialog, SelectDialog
from tui.node_console.models import NodeSnapshot
from tui.poll_manager import PollManager
from tui.status_indicators import render_status_text, status_tone

HEX_COLOR_PATTERN = re.compile(r"(?<![A-Za-z0-9_])#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?(?![A-Za-z0-9_-])")


def _build_fake_poll_manager(app: MAP2ConsoleApp) -> PollManager:
    async def fake_payload(name: str):
        if name == "snapshot":
            return NodeSnapshot(api_reachable=True, api_version="test-version")
        return {}

    return PollManager(
        {name: (lambda subscription=name: fake_payload(subscription)) for name in app._poll_manager._fetchers},
        cadence={name: 1 for name in app._poll_manager._fetchers},
    )


def test_carbon_themes_registered(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    app = MAP2ConsoleApp()
    assert "carbon-dark" in app.available_themes
    assert "carbon-light" in app.available_themes
    assert app.available_themes["carbon-dark"].background == "#000000"
    assert app.available_themes["carbon-light"].variables["carbon-runtime-panel"] == "#e8e8e8"


def test_unified_shell_uses_shared_carbon_stylesheet() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    tcss_files = sorted(path.relative_to(repo_root).as_posix() for path in (repo_root / "tui").rglob("*.tcss"))
    assert MAP2ConsoleApp.CSS_PATH == "styles/carbon.tcss"
    assert (repo_root / "tui" / "styles" / "carbon.tcss").exists()
    assert tcss_files == ["tui/styles/carbon.tcss"]
    assert not (repo_root / "tui" / "styles" / "monitoring.tcss").exists()
    assert not (repo_root / "tui" / "node_console" / "theme.tcss").exists()


def test_theme_tokens_are_the_only_remaining_raw_hex_colors() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    allowed_paths = {"tui/theme/carbon.py"}
    actual_paths: set[str] = set()

    for path in (repo_root / "tui").rglob("*.py"):
        if "__pycache__" in path.parts or "tests" in path.parts:
            continue
        content = path.read_text()
        if HEX_COLOR_PATTERN.search(content):
            actual_paths.add(path.relative_to(repo_root).as_posix())

    assert actual_paths == allowed_paths


def test_no_legacy_inline_screen_css_remains_in_python_modules() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    offenders: list[str] = []

    for path in (repo_root / "tui").rglob("*.py"):
        if "__pycache__" in path.parts or "tests" in path.parts:
            continue
        content = path.read_text()
        if "DEFAULT_CSS =" in content or "\nCSS =" in content:
            offenders.append(path.relative_to(repo_root).as_posix())

    assert offenders == []


def test_only_central_poll_tick_and_loading_animation_use_set_interval() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    allowed_paths = {"tui/app.py", "tui/widgets/__init__.py"}
    actual_paths: set[str] = set()

    for path in (repo_root / "tui").rglob("*.py"):
        if "__pycache__" in path.parts or "tests" in path.parts:
            continue
        if "set_interval(" in path.read_text():
            actual_paths.add(path.relative_to(repo_root).as_posix())

    assert actual_paths == allowed_paths


def test_dead_legacy_inline_styled_modules_are_removed() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    removed_paths = [
        "tui/widgets/landing_dashboard_widget.py",
        "tui/widgets/api_log_widget.py",
        "tui/widgets/avb_status_widget.py",
        "tui/widgets/breadcrumb_widget.py",
        "tui/widgets/cluster_widgets_init.py",
        "tui/widgets/context_panel_widget.py",
        "tui/widgets/data_grid_widget.py",
        "tui/widgets/dialog_widget.py",
        "tui/widgets/dynamic_footer_widget.py",
        "tui/widgets/enhanced_status_bar_widget.py",
        "tui/widgets/metrics_display_widget.py",
        "tui/widgets/mode_indicator_widget.py",
        "tui/widgets/notification_widget.py",
        "tui/widgets/searchable_list_widget.py",
        "tui/widgets/sidebar_widget.py",
        "tui/widgets/stats_panel_widget.py",
        "tui/widgets/status_indicator_widget.py",
        "tui/widgets/system_stats_footer.py",
        "tui/widgets/monitoring/__init__.py",
        "tui/widgets/monitoring/alert_list_widget.py",
        "tui/widgets/monitoring/circuit_breaker_widget.py",
        "tui/widgets/monitoring/dependency_graph_widget.py",
        "tui/widgets/monitoring/log_stream_widget.py",
        "tui/widgets/monitoring/metrics_gauge_widget.py",
        "tui/widgets/monitoring/service_card_widget.py",
        "tui/widgets/monitoring/services_grid_widget.py",
        "tui/widgets/monitoring/sparkline_widget.py",
        "tui/components/backup_restore.py",
        "tui/apps/nav_controller.py",
        "tui/screens/about_tab.py",
        "tui/screens/automation_tab.py",
        "tui/screens/avb_tab.py",
        "tui/screens/backup_tab.py",
        "tui/screens/backend_monitor_screen.py",
        "tui/screens/batch_operations_screen.py",
        "tui/screens/cluster_diagnostics_screen.py",
        "tui/screens/cluster_node_dashboard.py",
        "tui/screens/cluster_mode_screen.py",
        "tui/screens/control_panel.py",
        "tui/screens/developer_mode_screen.py",
        "tui/screens/diagnostics_screen.py",
        "tui/screens/failover_controller_screen.py",
        "tui/screens/favorites_tab.py",
        "tui/screens/flow_assignment_matrix.py",
        "tui/screens/guitar.py",
        "tui/screens/health_tab.py",
        "tui/screens/help_screen.py",
        "tui/screens/lcd_management_screen.py",
        "tui/screens/lcd_services_screen.py",
        "tui/screens/metrics_tab.py",
        "tui/screens/midi_sessions_screen.py",
        "tui/screens/network_tab.py",
        "tui/screens/node_recommendation_screen.py",
        "tui/screens/onboarding_wizard_screen.py",
        "tui/screens/parameter_automation.py",
        "tui/screens/plugin_loader.py",
        "tui/screens/plugins.py",
        "tui/screens/sessions.py",
        "tui/screens/settings_screen.py",
        "tui/screens/stage_view_screen.py",
        "tui/screens/system_update_screen.py",
        "tui/screens/test_screen.py",
        "tui/screens/update_progress_screen.py",
        "tui/screens/cluster_admin_screen.py",
        "tui/screens/cluster_lcd_monitoring_screen.py",
        "tui/screens/workflow_tab.py",
        "tui/screens/workflow_settings_screen.py",
        "tui/screens/www_tab.py",
        "tui/chain_overview.py",
        "tui/status_bar.py",
        "tui/test_all.py",
        "tui/tests/test_cluster_diagnostics_screen.py",
        "tui/tests/test_cluster_integration.py",
        "tui/tests/test_cluster_screens.py",
        "tui/tests/test_cluster_widgets.py",
        "tui/tests/test_app_performance.py",
        "tui/tests/test_e2e_workflows.py",
        "tui/tests/test_e2e_final.py",
        "tui/tests/test_failover_controller_screen.py",
        "tui/tests/test_node_recommendation_screen.py",
        "tui/tests/test_performance.py",
        "tui/tests/test_phase3_integration.py",
        "tui/tests/test_phase4_integration.py",
        "tui/tests/test_phase4_screens.py",
        "tui/tests/test_user_interactions.py",
        "tui/widgets/ssh_setup_dialog.py",
        "tui/widgets.py",
        "tui/verify_improvements.sh",
    ]
    for relative_path in removed_paths:
        assert not (repo_root / relative_path).exists()


def test_legacy_screen_exports_are_removed_from_package_surface() -> None:
    from tui import screens

    for name in (
        "AboutTab",
        "AutomationTab",
        "BackupTab",
        "BatchOperationsScreen",
        "ChainsScreen",
        "ChainsScreenRefactored",
        "ClusterDiagnosticsScreen",
        "ClusterNodeDashboard",
        "ControlPanelScreen",
        "FailoverControllerScreen",
        "FlowAssignmentMatrix",
        "GuitarChainScreen",
        "HealthTabScreen",
        "HelpScreen",
        "MetricsTab",
        "MIDIV2Screen",
        "NetworkTab",
        "NodeRecommendationScreen",
        "PluginLoaderScreen",
        "PluginsScreen",
        "SessionsScreen",
        "StageViewScreen",
        "WorkflowTab",
        "WWWTab",
    ):
        assert name not in screens.__all__
        assert name not in getattr(screens, "_LAZY_IMPORTS")


def test_legacy_app_navigation_exports_are_removed_from_package_surface() -> None:
    from tui import apps

    for name in (
        "NavigationController",
        "NavigationContext",
        "ScreenName",
        "ScreenTransition",
        "ScreenStack",
    ):
        assert name not in apps.__all__
        assert not hasattr(apps, name)

def test_active_modals_do_not_embed_per_class_css() -> None:
    for modal in (ConfirmDialog, InputDialog, NumberInputDialog, MessageDialog, FormDialog, SelectDialog):
        assert "CSS" not in modal.__dict__


def test_status_indicator_helpers_render_colored_dot_labels() -> None:
    assert status_tone("running") == "ok"
    assert status_tone("degraded") == "warn"
    assert status_tone("offline") == "error"
    assert render_status_text("starting").plain == "● Starting"


@pytest.mark.asyncio
async def test_first_run_opens_onboarding(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)

    async with app.run_test() as pilot:
        await pilot.pause()
        assert app._active_route_key == "onboarding"


@pytest.mark.asyncio
async def test_returning_user_lands_on_dashboard(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "tui_state.json").write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "cluster", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)

    async with app.run_test() as pilot:
        await pilot.pause()
        assert app._active_route_key == "dashboard"
        shell_connection = str(app.query_one("#shell-connection").content)
        assert "●" in shell_connection
        assert "Connected" in shell_connection


@pytest.mark.asyncio
async def test_route_navigation_updates_active_route(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "tui_state.json").write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "dashboard", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)

    async with app.run_test() as pilot:
        await pilot.pause()
        app.open_route("cluster")
        await pilot.pause()
        assert app._active_route_key == "cluster"
        assert any(hit["display"] == "Platform ▸ Cluster" for hit in app.iter_route_hits())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("route_key", "expected_title", "widget_id"),
    [
        ("dashboard", "Dashboard", "#dashboard-node-grid"),
        ("audio", "Audio", "#audio-summary"),
        ("platform", "Platform", "#platform-services"),
        ("settings", "Settings", "#settings-summary"),
    ],
)
async def test_primary_group_landing_routes_mount_expected_surfaces(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    route_key: str,
    expected_title: str,
    widget_id: str,
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "tui_state.json").write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "dashboard", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)

    async with app.run_test() as pilot:
        await pilot.pause()
        app.open_route(route_key)
        await pilot.pause()

        active_route = app.active_route
        assert active_route is not None
        assert app._active_route_key == route_key
        assert active_route.route_title == expected_title
        assert active_route.query_one(widget_id) is not None


@pytest.mark.asyncio
async def test_route_cache_is_centrally_limited_to_eight_screens(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "tui_state.json").write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "dashboard", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)

    async with app.run_test() as pilot:
        await pilot.pause()

        for route_key in ("audio", "chains", "effects", "midi", "guitar", "stage", "platform", "cluster"):
            app.open_route(route_key)
            await pilot.pause()

        assert len(app._route_cache) == 8
        assert "dashboard" not in app._route_cache
        assert app._active_route_key == "cluster"
        assert "cluster" in app._route_cache


@pytest.mark.asyncio
async def test_command_provider_exposes_route_local_and_system_hits(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "tui_state.json").write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "dashboard", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)

    async with app.run_test() as pilot:
        await pilot.pause()
        provider = RouteCommandProvider(app.screen)

        discovery_hits = [hit async for hit in provider.discover()]
        displays = {str(hit.display) for hit in discovery_hits}
        assert "Dashboard ▸ Dashboard" in displays
        assert "Dashboard ▸ Refresh" in displays
        assert "System ▸ Switch theme" in displays

        search_hits = [hit async for hit in provider.search("cluster")]
        search_displays = [str(hit.match_display) for hit in search_hits]
        assert any("Platform" in display and "Cluster" in display for display in search_displays)


@pytest.mark.asyncio
async def test_command_provider_search_finds_system_undo_action(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "tui_state.json").write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "dashboard", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)

    async with app.run_test() as pilot:
        await pilot.pause()
        provider = RouteCommandProvider(app.screen)

        search_hits = [hit async for hit in provider.search("undo")]
        assert any("System" in str(hit.match_display) and "Undo" in str(hit.match_display) for hit in search_hits)


@pytest.mark.asyncio
async def test_cycle_theme_persists_selected_carbon_theme(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    state_file = state_dir / "tui_state.json"
    state_file.write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "dashboard", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)

    async with app.run_test() as pilot:
        await pilot.pause()
        app.cycle_theme()
        await pilot.pause()

        assert app.theme == "carbon-light"
        assert app.session_state.theme_name == "carbon-light"
        assert '"theme_name": "carbon-light"' in state_file.read_text()


@pytest.mark.asyncio
async def test_resume_from_shell_resets_polling_and_refreshes_active_route(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "tui_state.json").write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "dashboard", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)

    async with app.run_test() as pilot:
        await pilot.pause()

        route = app.active_route
        assert route is not None
        route.on_resume_from_shell = Mock()
        app.force_refresh_active_route = Mock()
        app._poll_manager._last_fetch["snapshot"] = 1.0
        app._poll_manager._inflight.add("snapshot")

        app._on_app_resumed(app)
        await pilot.pause()

        route.on_resume_from_shell.assert_called_once()
        app.force_refresh_active_route.assert_called_once()
        assert app._poll_manager._last_fetch == {}
        assert app._poll_manager._inflight == set()
        assert any("Returned from shell suspend." in line for line in app._runtime_lines)


def test_notification_dedup_suppresses_repeats(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    app = MAP2ConsoleApp()
    app.notify = Mock()
    app.refresh_context_panel = Mock()

    app.toast("Backend unavailable", level="error")
    app.toast("Backend unavailable", level="error")

    assert app.notify.call_count == 1
    assert any("Backend unavailable (x2)" in line for line in app._runtime_lines)


def test_suspend_action_delegates_to_textual_suspend(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    app = MAP2ConsoleApp()
    app.action_suspend_process = Mock()
    app.refresh_context_panel = Mock()

    app.action_suspend_to_shell()

    app.action_suspend_process.assert_called_once()


@pytest.mark.asyncio
async def test_undo_uses_global_history_endpoint(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "tui_state.json").write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "dashboard", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)
    undo_mock = Mock()

    async def fake_undo():
        class Result:
            success = True
            error = None

        undo_mock()
        return Result()

    app.api_client.system.undo = fake_undo

    async with app.run_test() as pilot:
        await pilot.pause()
        app.action_undo()
        await pilot.pause()
        assert undo_mock.called


@pytest.mark.asyncio
async def test_workflow_mode_set_executes_via_native_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "tui_state.json").write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "workflow", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)
    app.confirm = AsyncMock(return_value=True)
    app.api_client.set_deployment_mode = AsyncMock(return_value=APIResult(True, data={"mode": "management"}))
    app.api_client.get_deployment_mode = AsyncMock(return_value=APIResult(True, data={"mode": "management"}))

    async with app.run_test() as pilot:
        await pilot.pause()
        app.open_route("workflow")
        await pilot.pause()
        workflow = app.active_route
        assert workflow is not None
        workflow._selected_workflow_id = "mode-set"
        workflow._workflow_state["mode-set"] = {"mode": "management"}

        await workflow._execute_selected_workflow()
        await pilot.pause()

        app.confirm.assert_awaited_once()
        app.api_client.set_deployment_mode.assert_awaited_once_with("management")
        app.api_client.get_deployment_mode.assert_awaited_once()
        assert any("POST /api/deployment/mode" in line for line in app._runtime_lines)
        assert any("Deployment mode reported by backend: management." in line for line in app._runtime_lines)


@pytest.mark.asyncio
async def test_workflow_node_install_executes_via_native_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "tui_state.json").write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "workflow", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)
    app.confirm = AsyncMock(return_value=True)
    app.api_client.apply_node_install = AsyncMock(
        return_value=APIResult(True, data={"ok": True, "returncode": 0, "stdout": "MAP2 Node Installation Started", "stderr": ""})
    )

    async with app.run_test() as pilot:
        await pilot.pause()
        app.open_route("workflow")
        await pilot.pause()
        workflow = app.active_route
        assert workflow is not None
        workflow._selected_workflow_id = "node-install"
        workflow._workflow_state["node-install"] = {
            "install_mode": "rpm",
            "node_id": "node-a",
            "node_name": "Node A",
            "node_role": "audio",
            "cluster_join_method": "mdns",
            "cluster_master_ip": "",
            "cluster_join_token": "",
            "configure_network": False,
            "network_interface": "",
            "network_ip": "",
            "network_netmask": "255.255.255.0",
            "network_gateway": "",
            "network_dns": "8.8.8.8",
            "enable_audio": True,
            "audio_device": "default",
            "audio_sample_rate": "48000",
            "audio_buffer_size": "256",
            "enable_firewall": True,
        }

        await workflow._execute_selected_workflow()
        await pilot.pause()

        app.confirm.assert_awaited_once()
        app.api_client.apply_node_install.assert_awaited_once()
        called_config = app.api_client.apply_node_install.await_args.args[0]
        assert called_config["node_id"] == "node-a"
        assert called_config["node_name"] == "Node A"
        assert called_config["enable_audio"] is True
        assert any("/api/system/node-install" in line for line in app._runtime_lines)
        assert any("Node install complete." in line for line in app._runtime_lines)


@pytest.mark.asyncio
async def test_workflow_cpu_pinning_executes_via_native_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "tui_state.json").write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "workflow", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)
    app.confirm = AsyncMock(return_value=True)
    app.api_client.get_cpu_isolation_status = AsyncMock(
        return_value=APIResult(
            True,
            data={"mode": "audio", "expected_latency_ms": "2.5-3.5 ms", "warnings": ["CPU isolation NOT active; latency will be >5ms"]},
        )
    )
    app.api_client.reset_cpu_isolation_to_mode = AsyncMock(
        return_value=APIResult(
            True,
            data={"status": "success", "changes_applied": ["systemd daemon reloaded"], "warnings": []},
        )
    )
    app.api_client.verify_cpu_isolation = AsyncMock(
        return_value=APIResult(
            True,
            data={"message": "Live CPU pinning matches configured settings", "mismatches": []},
        )
    )

    async with app.run_test() as pilot:
        await pilot.pause()
        app.open_route("workflow")
        await pilot.pause()
        workflow = app.active_route
        assert workflow is not None
        workflow._selected_workflow_id = "cpu-pinning"

        await workflow._execute_selected_workflow()
        await pilot.pause()

        app.confirm.assert_awaited_once()
        app.api_client.get_cpu_isolation_status.assert_awaited_once()
        app.api_client.reset_cpu_isolation_to_mode.assert_awaited_once()
        app.api_client.verify_cpu_isolation.assert_awaited_once()
        assert any("POST /api/system/cpu-isolation/reset-to-mode" in line for line in app._runtime_lines)
        assert any("Live CPU pinning matches configured settings" in line for line in app._runtime_lines)


@pytest.mark.asyncio
async def test_workflow_realtime_setup_executes_via_native_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "tui_state.json").write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "workflow", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)
    app.confirm = AsyncMock(return_value=True)
    app.api_client.verify_rt_hardening = AsyncMock(return_value=APIResult(True, data={"ok": True, "grade": "A", "stderr": ""}))
    app.api_client.apply_rt_hardening = AsyncMock(
        return_value=APIResult(True, data={"ok": True, "returncode": 0, "stdout": "Phase 1 complete\nPhase 2 complete", "stderr": ""})
    )
    app.api_client.switch_runtime_profile = AsyncMock(
        return_value=APIResult(True, data={"status": "applied", "target_profile": "Performance"})
    )
    app.api_client.get_runtime_profile_status = AsyncMock(
        return_value=APIResult(True, data={"current_profile": "Performance", "audio_capable": True})
    )

    async with app.run_test() as pilot:
        await pilot.pause()
        app.open_route("workflow")
        await pilot.pause()
        workflow = app.active_route
        assert workflow is not None
        workflow._selected_workflow_id = "realtime-setup"
        workflow._workflow_state["realtime-setup"] = {"profile": "Performance", "force_preflight": False}

        await workflow._execute_selected_workflow()
        await pilot.pause()

        app.confirm.assert_awaited_once()
        app.api_client.verify_rt_hardening.assert_awaited_once()
        app.api_client.apply_rt_hardening.assert_awaited_once_with(dry_run=False, auto_yes=True)
        app.api_client.switch_runtime_profile.assert_awaited_once_with("Performance", dry_run=False, force=False)
        app.api_client.get_runtime_profile_status.assert_awaited_once()
        assert any("rt-harden/apply" in line for line in app._runtime_lines)
        assert any("Runtime profile active: Performance." in line for line in app._runtime_lines)


@pytest.mark.asyncio
async def test_workflow_avb_setup_executes_via_native_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "tui_state.json").write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "workflow", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)
    app.confirm = AsyncMock(return_value=True)
    app.api_client.get_avb_status = AsyncMock(
        return_value=APIResult(True, data={"state": "degraded", "interface": "enp2s0"})
    )
    app.api_client.apply_avb_setup = AsyncMock(
        return_value=APIResult(True, data={"ok": True, "returncode": 0, "stdout": "AVB setup verification passed!", "stderr": ""})
    )

    async with app.run_test() as pilot:
        await pilot.pause()
        app.open_route("workflow")
        await pilot.pause()
        workflow = app.active_route
        assert workflow is not None
        workflow._selected_workflow_id = "avb-setup"
        workflow._workflow_state["avb-setup"] = {"interface": "enp2s0"}

        await workflow._execute_selected_workflow()
        await pilot.pause()

        app.confirm.assert_awaited_once()
        app.api_client.get_avb_status.assert_awaited_once()
        app.api_client.apply_avb_setup.assert_awaited_once_with(interface="enp2s0", dry_run=False, auto_yes=True)
        assert any("POST /api/avb/setup" in line for line in app._runtime_lines)
        assert any("AVB setup complete." in line for line in app._runtime_lines)


@pytest.mark.asyncio
async def test_workflow_avb_ptp_setup_executes_via_native_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    state_dir = tmp_path / ".config" / "map2"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "tui_state.json").write_text(
        '{"onboarding_completed": true, "theme_name": "carbon-dark", "last_route": "workflow", "environment": "local", "workspace": "map2-audio"}'
    )

    app = MAP2ConsoleApp()
    app._poll_manager = _build_fake_poll_manager(app)
    app.confirm = AsyncMock(return_value=True)
    app.api_client.get_ptp_status = AsyncMock(return_value=APIResult(True, data={"available": False}))
    app.api_client.apply_avb_ptp_setup = AsyncMock(
        return_value=APIResult(True, data={"ok": True, "returncode": 0, "stdout": "AVB/TSN gPTP setup complete!", "stderr": ""})
    )

    async with app.run_test() as pilot:
        await pilot.pause()
        app.open_route("workflow")
        await pilot.pause()
        workflow = app.active_route
        assert workflow is not None
        workflow._selected_workflow_id = "avb-ptp-setup"
        workflow._workflow_state["avb-ptp-setup"] = {"interface": "enp3s0", "domain": "5", "priority": "64"}

        await workflow._execute_selected_workflow()
        await pilot.pause()

        app.confirm.assert_awaited_once()
        app.api_client.get_ptp_status.assert_awaited_once()
        app.api_client.apply_avb_ptp_setup.assert_awaited_once_with(
            interface="enp3s0",
            domain=5,
            priority=64,
            dry_run=False,
            auto_yes=True,
        )
        assert any("POST /api/avb/ptp/setup" in line for line in app._runtime_lines)
        assert any("AVB/PTP setup complete." in line for line in app._runtime_lines)
