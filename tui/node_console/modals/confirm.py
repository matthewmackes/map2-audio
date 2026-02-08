"""
Confirmation modal dialogs.

Used before any destructive / irreversible action:
  - Mode change
  - Reboot / Shutdown
  - Service restart
"""

from __future__ import annotations

from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen
from textual.widgets import Button, Label, Static


class ConfirmModal(ModalScreen[bool]):
    """A modal confirmation dialog.

    Returns True if the user confirms, False (or dismisses) otherwise.
    """

    BINDINGS = [
        ("escape", "cancel", "Cancel"),
    ]

    def __init__(
        self,
        title: str = "Confirm Action",
        body: str = "Are you sure?",
        confirm_label: str = "Confirm",
        cancel_label: str = "Cancel",
        danger: bool = False,
    ) -> None:
        super().__init__()
        self._title_text = title
        self._body_text = body
        self._confirm_label = confirm_label
        self._cancel_label = cancel_label
        self._danger = danger

    def compose(self) -> ComposeResult:
        with Vertical(classes="modal-dialog"):
            yield Label(self._title_text, classes="modal-title")
            yield Static(self._body_text, classes="modal-body")
            with Horizontal(classes="modal-buttons"):
                btn_class = "btn-danger" if self._danger else "btn-warning"
                yield Button(
                    self._confirm_label,
                    id="confirm-yes",
                    variant="warning" if not self._danger else "error",
                    classes=btn_class,
                )
                yield Button(
                    self._cancel_label,
                    id="confirm-no",
                    variant="default",
                )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "confirm-yes":
            self.dismiss(True)
        else:
            self.dismiss(False)

    def action_cancel(self) -> None:
        self.dismiss(False)


class ProgressModal(ModalScreen[None]):
    """A non-interactive progress modal shown during long operations."""

    def __init__(self, title: str = "Working…", message: str = "Please wait…") -> None:
        super().__init__()
        self._title_text = title
        self._message = message

    def compose(self) -> ComposeResult:
        with Vertical(classes="modal-dialog"):
            yield Label(self._title_text, classes="modal-title")
            yield Static(self._message, classes="progress-label")
