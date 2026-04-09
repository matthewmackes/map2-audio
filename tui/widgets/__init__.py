"""
TUI Widgets Package
"""
import asyncio
import inspect
from typing import Callable, Optional

from textual.app import ComposeResult
from textual.containers import Horizontal
from textual.reactive import reactive
from textual.widgets import Button, Input, Label, Static

__all__ = [
    'ActionButton',
    'StatusIndicator',
    'LoadingIndicator',
    'InlineNotification',
    'MixControl',
    'BypassToggle',
]


def _invoke_maybe_async(callback: Optional[Callable], *args) -> None:
    """Invoke callback and schedule coroutine results on the running loop."""
    if callback is None:
        return
    result = callback(*args)
    if inspect.isawaitable(result):
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(result)
        except RuntimeError:
            # No running event loop; close coroutine to avoid unawaited warnings.
            close = getattr(result, "close", None)
            if callable(close):
                close()
            return

class ActionButton(Button):
    """Action button with optional loading-state helper."""

    def __init__(
        self,
        label: str,
        variant: str = "default",
        requires_confirm: bool = False,
        confirm_message: str = "Are you sure?",
        id: Optional[str] = None,
        disabled: bool = False,
    ):
        super().__init__(label, variant=variant, id=id, disabled=disabled)
        self.original_label = label
        self.requires_confirm = requires_confirm
        self.confirm_message = confirm_message
        self.is_loading = False

    def set_loading(self, loading: bool, loading_text: str = "Working...") -> None:
        self.is_loading = loading
        if loading:
            self.label = f"⏳ {loading_text}"
            self.disabled = True
        else:
            self.label = self.original_label
            self.disabled = False


class StatusIndicator(Static):
    """Simple status indicator label with running/stopped state."""

    status: reactive[bool] = reactive(False)

    def __init__(self, label: str, id: Optional[str] = None):
        super().__init__(id=id)
        self.label_text = label

    def compose(self) -> ComposeResult:
        yield Label(self._format_status(), id=f"{self.id}-label")

    def _format_status(self) -> str:
        indicator = "🟢" if self.status else "⚫"
        status_text = "Running" if self.status else "Stopped"
        return f"{indicator} {self.label_text}: {status_text}"

    def set_status(self, running: bool) -> None:
        self.status = running
        self.query_one(f"#{self.id}-label", Label).update(self._format_status())

    def set_error(self, error_msg: str) -> None:
        self.query_one(f"#{self.id}-label", Label).update(f"❌ {self.label_text}: {error_msg}")


class LoadingIndicator(Static):
    """Loading indicator with `show()` / `hide()` convenience methods."""

    visible: reactive[bool] = reactive(False)

    def __init__(self, message: str = "Loading...", id: Optional[str] = None, classes: Optional[str] = None):
        super().__init__(id=id, classes=classes)
        self.message = message
        self.frame = 0
        self.frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

    def compose(self) -> ComposeResult:
        yield Label(self._format_message(), id=f"{self.id}-label")

    def _format_message(self) -> str:
        return f"{self.frames[self.frame]} {self.message}"

    def on_mount(self) -> None:
        self.display = False
        self.set_interval(0.1, self._animate)

    def _animate(self) -> None:
        if self.visible:
            self.frame = (self.frame + 1) % len(self.frames)
            self.query_one(f"#{self.id}-label", Label).update(self._format_message())

    def show(self, message: Optional[str] = None) -> None:
        if message:
            self.message = message
        self.visible = True
        self.display = True

    def hide(self) -> None:
        self.visible = False
        self.display = False


class InlineNotification(Static):
    """Carbon-style inline notification surface for contextual route feedback."""

    def __init__(self, id: Optional[str] = None, classes: Optional[str] = None):
        super().__init__("", id=id, classes=classes)
        self.display = False
        self._tone = "info"

    def show_notification(
        self,
        *,
        title: str,
        message: str,
        tone: str = "info",
        action_hint: str | None = None,
    ) -> None:
        self._tone = tone
        parts = [f"{title}: {message}".strip(": ")]
        if action_hint:
            parts.append(action_hint)
        self.update("\n".join(part for part in parts if part))
        self.display = True
        self.set_class(True, "-visible")
        for token in ("-info", "-success", "-warning", "-error"):
            self.set_class(token == f"-{tone}", token)

    def clear_notification(self) -> None:
        self.update("")
        self.display = False
        self.set_class(False, "-visible")
        for token in ("-info", "-success", "-warning", "-error"):
            self.set_class(False, token)


class MixControl(Static):
    """Mix level control widget (0-100%)."""

    value: reactive[float] = reactive(100.0)

    def __init__(
        self,
        label: str,
        default_value: float = 100.0,
        min_value: float = 0.0,
        max_value: float = 100.0,
        step: float = 5.0,
        on_change: Optional[Callable[[float], None]] = None,
        id: Optional[str] = None,
    ):
        super().__init__(id=id)
        self.label_text = label
        self.value = default_value
        self.min_value = min_value
        self.max_value = max_value
        self.step = step
        self.on_change_callback = on_change

    def compose(self) -> ComposeResult:
        yield Label(f"{self.label_text}: {self.value:.1f}%")
        yield Horizontal(
            Button("-", id=f"{self.id}-dec", variant="default"),
            Input(value=str(self.value), type="number", id=f"{self.id}-input"),
            Button("+", id=f"{self.id}-inc", variant="default"),
            Button("Set", id=f"{self.id}-set", variant="primary"),
        )

    def watch_value(self, value: float) -> None:
        if not self.is_mounted:
            return
        label = self.query_one(Label)
        label.update(f"{self.label_text}: {value:.1f}%")
        input_widget = self.query_one(f"#{self.id}-input", Input)
        input_widget.value = f"{value:.1f}"

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == f"{self.id}-dec":
            self._update_value(max(self.value - self.step, self.min_value))
        elif event.button.id == f"{self.id}-inc":
            self._update_value(min(self.value + self.step, self.max_value))
        elif event.button.id == f"{self.id}-set":
            self._set_value_from_input()

    def _set_value_from_input(self) -> None:
        input_widget = self.query_one(f"#{self.id}-input", Input)
        try:
            raw = float(input_widget.value)
            self._update_value(max(self.min_value, min(raw, self.max_value)))
        except ValueError:
            if self.app:
                self.app.notify("Invalid number", severity="error")

    def _update_value(self, new_value: float) -> None:
        self.value = new_value
        _invoke_maybe_async(self.on_change_callback, self.value)


class BypassToggle(Static):
    """Bypass toggle with callback hook."""

    bypassed: reactive[bool] = reactive(False)

    def __init__(
        self,
        item_label: str,
        initial_state: bool = False,
        on_toggle: Optional[Callable[[bool], None]] = None,
        id: Optional[str] = None,
    ):
        super().__init__(id=id)
        self.item_label = item_label
        self.bypassed = initial_state
        self.on_toggle_callback = on_toggle

    def compose(self) -> ComposeResult:
        yield Horizontal(
            Label(self._format_label(), id=f"{self.id}-label"),
            Button(self._button_label(), id=f"{self.id}-btn", variant=self._button_variant()),
        )

    def _format_label(self) -> str:
        return f"🔇 {self.item_label}" if self.bypassed else f"🔊 {self.item_label}"

    def _button_label(self) -> str:
        return "Unmute" if self.bypassed else "Mute"

    def _button_variant(self) -> str:
        return "default" if self.bypassed else "warning"

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == f"{self.id}-btn":
            self.toggle()

    def set_state(self, bypassed: bool) -> None:
        self.bypassed = bypassed
        self._update_display()

    def toggle(self) -> None:
        self.bypassed = not self.bypassed
        self._update_display()
        _invoke_maybe_async(self.on_toggle_callback, self.bypassed)

    def _update_display(self) -> None:
        if not self.is_mounted:
            return
        label = self.query_one(f"#{self.id}-label", Label)
        button = self.query_one(f"#{self.id}-btn", Button)
        label.update(self._format_label())
        button.label = self._button_label()
        button.variant = self._button_variant()
