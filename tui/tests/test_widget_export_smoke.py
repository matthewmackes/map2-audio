"""Smoke tests for package-exported TUI widgets used by major screens."""

from __future__ import annotations

import asyncio
import gc
from dataclasses import dataclass
from typing import Callable, Iterable
import warnings

import pytest
from textual._context import active_app

from tui.api_client import MAP2APIClient
from tui.widgets import (
    ActionButton,
    BypassToggle,
    LoadingIndicator,
    MixControl,
    StatusIndicator,
    _invoke_maybe_async,
)

try:
    from tui.screens.automation_tab import AutomationTab
    from tui.screens.guitar import GuitarChainScreen
    from tui.screens.midi import MIDIScreen
    from tui.screens.midi_v2 import MIDIV2Screen
    from tui.screens.network_tab import NetworkTab
    from tui.screens.plugin_loader import PluginLoaderScreen
    from tui.screens.plugins import PluginsScreen
    from tui.screens.sessions import SessionsScreen
    from tui.screens.www_tab import WWWTab

    SCREENS_AVAILABLE = True
except ImportError:
    SCREENS_AVAILABLE = False


class _ComposeDummyApp:
    """Minimal app context to let Textual compose trees outside run loop."""

    def __init__(self) -> None:
        self._compose_stacks = [[]]
        self._composed = [[]]

    def update_styles(self, *_args, **_kwargs) -> None:
        # Widget reactive watchers call this during compose.
        return


def _compose_nodes(screen) -> list:
    app = _ComposeDummyApp()
    token = active_app.set(app)
    try:
        return list(screen.compose())
    finally:
        active_app.reset(token)


def _compose_tree(screen) -> list:
    """Compose screen and recursively compose nested widgets/components."""
    collected: list = []
    visited: set[int] = set()
    stack = list(_compose_nodes(screen))

    while stack:
        node = stack.pop()
        node_id = id(node)
        if node_id in visited:
            continue
        visited.add(node_id)
        collected.append(node)

        if not hasattr(node, "compose"):
            continue
        try:
            children = _compose_nodes(node)
        except Exception:
            children = []
        if children:
            stack.extend(children)

    return collected


@dataclass(frozen=True)
class _ScreenExpectation:
    name: str
    build: Callable[[], object]
    required_widget_types: tuple[type, ...]


def _expectations() -> Iterable[_ScreenExpectation]:
    client = MAP2APIClient()
    return (
        _ScreenExpectation(
            name="MIDIScreen",
            build=lambda: MIDIScreen(client),
            required_widget_types=(ActionButton, StatusIndicator, LoadingIndicator),
        ),
        _ScreenExpectation(
            name="MIDIV2Screen",
            build=lambda: MIDIV2Screen(client),
            required_widget_types=(ActionButton, StatusIndicator, LoadingIndicator),
        ),
        _ScreenExpectation(
            name="NetworkTab",
            build=lambda: NetworkTab(client),
            required_widget_types=(ActionButton, StatusIndicator, LoadingIndicator),
        ),
        _ScreenExpectation(
            name="PluginLoaderScreen",
            build=lambda: PluginLoaderScreen(client),
            required_widget_types=(),
        ),
        _ScreenExpectation(
            name="PluginsScreen",
            build=lambda: PluginsScreen(client),
            required_widget_types=(ActionButton, LoadingIndicator),
        ),
        _ScreenExpectation(
            name="SessionsScreen",
            build=lambda: SessionsScreen(client),
            required_widget_types=(ActionButton, LoadingIndicator),
        ),
        _ScreenExpectation(
            name="AutomationTab",
            build=lambda: AutomationTab(client),
            required_widget_types=(LoadingIndicator,),
        ),
        _ScreenExpectation(
            name="WWWTab",
            build=lambda: WWWTab(client),
            required_widget_types=(ActionButton, LoadingIndicator),
        ),
        _ScreenExpectation(
            name="GuitarChainScreen",
            build=lambda: GuitarChainScreen(client),
            required_widget_types=(ActionButton, LoadingIndicator, MixControl, BypassToggle),
        ),
    )


@pytest.mark.skipif(not SCREENS_AVAILABLE, reason="Widget-dependent screens not available")
@pytest.mark.parametrize("expectation", list(_expectations()), ids=lambda e: e.name)
def test_screen_compose_uses_package_widgets(expectation: _ScreenExpectation) -> None:
    """Compose each screen and assert package-exported widgets are present."""
    nodes = _compose_tree(expectation.build())
    assert nodes, f"{expectation.name} compose returned no nodes"

    for widget_type in expectation.required_widget_types:
        assert any(isinstance(node, widget_type) for node in nodes), (
            f"{expectation.name} did not compose {widget_type.__name__}"
        )


def test_mix_control_sync_callback_invoked() -> None:
    values: list[float] = []
    widget = MixControl("Mix", on_change=lambda v: values.append(v), id="mix-test")
    widget._update_value(42.0)  # intentional direct call for callback contract
    assert values == [42.0]


def test_bypass_toggle_sync_callback_invoked() -> None:
    states: list[bool] = []
    widget = BypassToggle("Stage", on_toggle=lambda s: states.append(s), id="toggle-test")
    widget.toggle()
    assert states == [True]


def test_mix_control_async_callback_scheduled() -> None:
    values: list[float] = []

    async def on_change(v: float) -> None:
        values.append(v)

    async def run() -> None:
        widget = MixControl("Mix", on_change=on_change, id="mix-async")
        widget._update_value(55.0)  # intentional direct call for callback contract
        await asyncio.sleep(0)

    asyncio.run(run())
    assert values == [55.0]


def test_bypass_toggle_async_callback_scheduled() -> None:
    states: list[bool] = []

    async def on_toggle(state: bool) -> None:
        states.append(state)

    async def run() -> None:
        widget = BypassToggle("Stage", on_toggle=on_toggle, id="toggle-async")
        widget.toggle()
        await asyncio.sleep(0)

    asyncio.run(run())
    assert states == [True]


def test_invoke_maybe_async_without_loop_closes_coroutine() -> None:
    called: list[bool] = []

    async def cb() -> None:
        called.append(True)

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        _invoke_maybe_async(cb)
        gc.collect()

    # Callback should not run without a loop, but should also not emit unawaited warnings.
    assert called == []
    assert not [w for w in caught if issubclass(w.category, RuntimeWarning)]
