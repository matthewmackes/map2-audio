"""Shared route/widget base class for the unified console."""

from __future__ import annotations

import inspect
import logging
from dataclasses import dataclass
from typing import Any, Callable

from textual import on, work
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import Button, Label, Static

from .poll_manager import SubscriptionUpdated
from .screen_state import screen_state
from .widgets import InlineNotification

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ScreenAction:
    """A visible and palette-discoverable action exposed by a route."""

    action_id: str
    label: str
    category: str
    description: str
    handler: Callable[[], Any]
    variant: str = "default"


class ActionBar(Horizontal):
    """Common route action bar with visible buttons."""

    def __init__(self, actions: list[ScreenAction], **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._actions = actions

    def update_actions(self, actions: list[ScreenAction]) -> None:
        self._actions = actions
        self.refresh(recompose=True)

    def compose(self) -> ComposeResult:
        for action in self._actions:
            yield Button(
                action.label,
                id=f"action-{action.action_id}",
                variant=action.variant,
            )


class BaseScreen(Vertical):
    """Base widget used by all unified console routes."""

    route_key: str = "base"
    route_title: str = "Base"
    route_summary: str = ""
    show_context_panel: bool = False

    def __init__(self, api_client=None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.api_client = api_client
        self._actions: dict[str, ScreenAction] = {}
        self._context_lines: list[str] = []
        self._loading = False
        self._error_message: str | None = None

    def compose(self) -> ComposeResult:
        yield Label(self.route_title, classes="route-title")
        if self.route_summary:
            yield Static(self.route_summary, classes="route-summary")
        yield InlineNotification(id=f"{self.route_key}-inline-notification", classes="inline-notification")
        actions = self.get_actions()
        if actions:
            self._actions = {action.action_id: action for action in actions}
            yield ActionBar(actions, id=f"{self.route_key}-actions")
        yield from self.compose_body()

    def compose_body(self) -> ComposeResult:
        """Compose the route-specific content."""

        yield Static("", id=f"{self.route_key}-body")

    def get_actions(self) -> list[ScreenAction]:
        """Return visible and palette-discoverable route actions."""

        return []

    def refresh_actions(self) -> None:
        actions = self.get_actions()
        self._actions = {action.action_id: action for action in actions}
        for bar in self.query(ActionBar):
            bar.update_actions(actions)

    def get_subscriptions(self) -> list[str]:
        """Return subscription names for active-route polling."""

        return []

    def get_context_lines(self) -> list[str]:
        """Return secondary-panel content."""

        return list(self._context_lines)

    def update_context(self, *lines: str) -> None:
        self._context_lines = [line for line in lines if line]
        if self.app is not None and hasattr(self.app, "refresh_context_panel"):
            self.app.refresh_context_panel()

    def get_state(self) -> dict[str, Any]:
        return {}

    def restore_state(self, state: dict[str, Any]) -> None:
        del state

    def on_mount(self) -> None:
        saved_state = screen_state.load_screen_state(self.route_key)
        if saved_state:
            self.restore_state(saved_state)
        for panel in self.query(".section-panel"):
            if isinstance(panel, Static) and not str(panel.content or "").strip():
                panel.update("Loading\nWaiting for the first subscription payload.")

    def on_unmount(self) -> None:
        state = self.get_state()
        if state:
            screen_state.save_screen_state(self.route_key, state)

    def handle_subscription(self, subscription: str, payload: object) -> None:
        """Handle a poll-manager payload."""

    def handle_subscription_error(self, subscription: str, error: str) -> None:
        """Handle a poll-manager failure."""

        self._error_message = error
        self.show_inline_notification(
            title=f"{self.route_title} issue",
            message=error,
            tone="error",
            action_hint=f"Subscription: {subscription}",
        )
        logger.warning("%s subscription %s failed: %s", self.route_key, subscription, error)

    def _inline_notification(self) -> InlineNotification:
        return self.query_one(f"#{self.route_key}-inline-notification", InlineNotification)

    def show_inline_notification(
        self,
        *,
        title: str,
        message: str,
        tone: str = "info",
        action_hint: str | None = None,
    ) -> None:
        self._inline_notification().show_notification(
            title=title,
            message=message,
            tone=tone,
            action_hint=action_hint,
        )

    def clear_inline_notification(self) -> None:
        self._inline_notification().clear_notification()

    def on_resume_from_shell(self) -> None:
        """Refresh route state after the app resumes from a shell suspend."""

    @on(SubscriptionUpdated)
    def _on_subscription_updated(self, message: SubscriptionUpdated) -> None:
        if message.result.error:
            self.handle_subscription_error(message.result.name, message.result.error)
            return
        self._error_message = None
        self.clear_inline_notification()
        self.handle_subscription(message.result.name, message.result.data)

    @on(Button.Pressed)
    def _on_action_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id or ""
        if not button_id.startswith("action-"):
            return
        action_id = button_id.removeprefix("action-")
        action = self._actions.get(action_id)
        if action is None:
            return
        self.run_action(action)

    @work(exclusive=False, thread=False)
    async def run_action(self, action: ScreenAction) -> None:
        """Run a route action without blocking the UI."""

        app = getattr(self, "app", None)
        try:
            if app is not None and hasattr(app, "background_job_started"):
                app.background_job_started(action.label)
            result = action.handler()
            if inspect.isawaitable(result):
                await result
        except Exception as exc:
            if app is not None and hasattr(app, "toast"):
                app.toast(str(exc), level="error", title=self.route_title)
            logger.exception("Route action %s failed", action.action_id)
        finally:
            if app is not None and hasattr(app, "background_job_finished"):
                app.background_job_finished(action.label)
