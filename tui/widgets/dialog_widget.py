"""
Dialog Widget - Modal dialogs for confirmations and user input
Simple modal dialog system for confirmations, forms, etc.
"""

from typing import Optional, Callable, Any

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical, Horizontal
    from textual.widgets import Static, Label, Button
    from textual.reactive import reactive
except ImportError:
    pass


class DialogWidget(Static):
    """
    Modal dialog widget for confirmations and messages.
    
    Creates a centered dialog box that can display messages,
    confirmations, or simple forms.
    
    Example:
        dialog = DialogWidget(
            title="Confirm Action",
            message="Are you sure?",
            buttons=[("Yes", "yes"), ("Cancel", "cancel")]
        )
        yield dialog
    """
    
    DEFAULT_CSS = """
    DialogWidget {
        width: 60;
        height: auto;
        background: $surface;
        border: solid $primary;
        align: center middle;
        padding: 2 2;
        margin: 0 0;
    }
    
    #dialog-title {
        width: 100%;
        height: auto;
        text-style: bold;
        color: $text;
        margin: 0 0 1 0;
    }
    
    #dialog-message {
        width: 100%;
        height: auto;
        color: $text;
        margin: 0 0 2 0;
    }
    
    #dialog-buttons {
        width: 100%;
        height: auto;
        justify: center;
    }
    
    .dialog-button {
        margin: 0 1;
    }
    """
    
    # Reactive properties
    visible: reactive[bool] = reactive(False)
    
    def __init__(
        self,
        title: str = "",
        message: str = "",
        buttons: Optional[list] = None,
        on_response: Optional[Callable[[str], None]] = None,
        id: Optional[str] = None,
        **kwargs
    ):
        """
        Initialize dialog.
        
        Args:
            title: Dialog title
            message: Dialog message
            buttons: List of (label, id) tuples for buttons
            on_response: Callback when button clicked (id passed)
            id: Widget ID
        """
        super().__init__(id=id, **kwargs)
        self.title_text = title
        self.message_text = message
        self.buttons = buttons or [("OK", "ok")]
        self.on_response_callback = on_response
        self.visible = False
    
    def compose(self) -> ComposeResult:
        """Compose dialog."""
        with Vertical():
            if self.title_text:
                yield Label(self.title_text, id="dialog-title")
            yield Label(self.message_text, id="dialog-message")
            
            with Horizontal(id="dialog-buttons"):
                for label, button_id in self.buttons:
                    yield Button(
                        label,
                        id=f"dialog-btn-{button_id}",
                        classes="dialog-button"
                    )
    
    def show(self) -> None:
        """Show the dialog."""
        self.visible = True
        self.display = True
    
    def hide(self) -> None:
        """Hide the dialog."""
        self.visible = False
        self.display = False
    
    async def on_button_pressed(self, event: "Button.Pressed") -> None:
        """Handle button press."""
        button_id = event.button.id
        
        # Extract response ID from button ID
        if button_id and button_id.startswith("dialog-btn-"):
            response = button_id.replace("dialog-btn-", "")
            
            # Call callback
            if self.on_response_callback:
                self.on_response_callback(response)
            
            # Hide dialog
            self.hide()
    
    def set_message(self, message: str) -> None:
        """Update dialog message."""
        self.message_text = message
        try:
            msg_label = self.query_one("#dialog-message", Label)
            msg_label.update(message)
        except:
            pass
    
    def set_title(self, title: str) -> None:
        """Update dialog title."""
        self.title_text = title
        try:
            title_label = self.query_one("#dialog-title", Label)
            title_label.update(title)
        except:
            pass
