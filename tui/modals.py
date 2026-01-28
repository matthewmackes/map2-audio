"""
Modal Dialog Screens for MAP2 Audio Platform TUI
Reusable modal screens for user input, confirmation, and information display.
"""

from typing import Optional, List, Callable
from textual.app import ComposeResult
from textual.screen import ModalScreen
from textual.widgets import Button, Input, Label, TextArea, Select
from textual.containers import Container, Horizontal, Vertical, Grid
from textual.binding import Binding


class ConfirmDialog(ModalScreen[bool]):
    """
    Confirmation dialog with message and Confirm/Cancel buttons.

    Usage:
        result = await self.app.push_screen_wait(
            ConfirmDialog("Delete this chain?", title="Confirm Delete")
        )
        if result:
            # User confirmed
    """

    CSS = """
    ConfirmDialog {
        align: center middle;
    }

    #dialog-container {
        width: 60;
        height: auto;
        background: $panel;
        border: thick $primary;
        padding: 1 2;
    }

    #dialog-title {
        text-align: center;
        text-style: bold;
        color: $warning;
        margin-bottom: 1;
    }

    #dialog-message {
        text-align: center;
        margin-bottom: 2;
    }

    #dialog-buttons {
        width: 100%;
        height: auto;
        align: center middle;
    }
    """

    BINDINGS = [
        Binding("escape", "cancel", "Cancel", show=False),
    ]

    def __init__(self, message: str, title: str = "Confirm"):
        """
        Initialize confirmation dialog.

        Args:
            message: Confirmation message to display
            title: Dialog title
        """
        self.message = message
        self.title_text = title
        super().__init__()

    def compose(self) -> ComposeResult:
        """Compose dialog widgets."""
        yield Container(
            Label(self.title_text, id="dialog-title"),
            Label(self.message, id="dialog-message"),
            Horizontal(
                Button("Confirm", variant="error", id="btn-confirm"),
                Button("Cancel", variant="default", id="btn-cancel"),
                id="dialog-buttons"
            ),
            id="dialog-container"
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        if event.button.id == "btn-confirm":
            self.dismiss(True)
        else:
            self.dismiss(False)

    def action_cancel(self) -> None:
        """Cancel action (Escape key)."""
        self.dismiss(False)


class InputDialog(ModalScreen[Optional[str]]):
    """
    Input dialog for single text input with validation.

    Usage:
        result = await self.app.push_screen_wait(
            InputDialog("Enter chain name:", title="Create Chain",
                       placeholder="My Chain", max_length=256)
        )
        if result:
            # User entered: result
    """

    CSS = """
    InputDialog {
        align: center middle;
    }

    #dialog-container {
        width: 60;
        height: auto;
        background: $panel;
        border: thick $primary;
        padding: 1 2;
    }

    #dialog-title {
        text-align: center;
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    #dialog-label {
        margin-bottom: 1;
    }

    #dialog-input {
        margin-bottom: 1;
    }

    #validation-error {
        color: $error;
        text-align: center;
        margin-bottom: 1;
    }

    #dialog-buttons {
        width: 100%;
        height: auto;
        align: center middle;
    }
    """

    BINDINGS = [
        Binding("escape", "cancel", "Cancel", show=False),
    ]

    def __init__(self, label: str, title: str = "Input",
                 placeholder: str = "", default_value: str = "",
                 max_length: Optional[int] = None,
                 validator: Optional[Callable[[str], Optional[str]]] = None):
        """
        Initialize input dialog.

        Args:
            label: Input field label
            title: Dialog title
            placeholder: Placeholder text
            default_value: Default input value
            max_length: Maximum input length
            validator: Optional validation function returning error message or None
        """
        self.label_text = label
        self.title_text = title
        self.placeholder = placeholder
        self.default_value = default_value
        self.max_length = max_length
        self.validator = validator
        super().__init__()

    def compose(self) -> ComposeResult:
        """Compose dialog widgets."""
        yield Container(
            Label(self.title_text, id="dialog-title"),
            Label(self.label_text, id="dialog-label"),
            Input(placeholder=self.placeholder, value=self.default_value,
                 max_length=self.max_length or 0, id="dialog-input"),
            Label("", id="validation-error"),
            Horizontal(
                Button("OK", variant="primary", id="btn-ok"),
                Button("Cancel", variant="default", id="btn-cancel"),
                id="dialog-buttons"
            ),
            id="dialog-container"
        )

    def on_mount(self) -> None:
        """Focus input on mount."""
        self.query_one("#dialog-input", Input).focus()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        if event.button.id == "btn-ok":
            self.submit_input()
        else:
            self.dismiss(None)

    def on_input_submitted(self, event: Input.Submitted) -> None:
        """Handle Enter key in input."""
        self.submit_input()

    def submit_input(self) -> None:
        """Validate and submit input."""
        input_widget = self.query_one("#dialog-input", Input)
        value = input_widget.value.strip()

        # Validate
        if self.validator:
            error = self.validator(value)
            if error:
                error_label = self.query_one("#validation-error", Label)
                error_label.update(error)
                return

        self.dismiss(value if value else None)

    def action_cancel(self) -> None:
        """Cancel action (Escape key)."""
        self.dismiss(None)


class NumberInputDialog(ModalScreen[Optional[float]]):
    """
    Number input dialog with min/max validation.

    Usage:
        result = await self.app.push_screen_wait(
            NumberInputDialog("Enter mix level:", title="Set Mix",
                            min_value=0.0, max_value=1.0, default=1.0, step=0.01)
        )
        if result is not None:
            # User entered: result (float)
    """

    CSS = """
    NumberInputDialog {
        align: center middle;
    }

    #dialog-container {
        width: 50;
        height: auto;
        background: $panel;
        border: thick $primary;
        padding: 1 2;
    }

    #dialog-title {
        text-align: center;
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    #dialog-label {
        margin-bottom: 1;
    }

    #input-container {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    #number-input {
        width: 1fr;
    }

    #validation-error {
        color: $error;
        text-align: center;
        margin-bottom: 1;
    }

    #dialog-buttons {
        width: 100%;
        height: auto;
        align: center middle;
    }
    """

    BINDINGS = [
        Binding("escape", "cancel", "Cancel", show=False),
    ]

    def __init__(self, label: str, title: str = "Enter Number",
                 min_value: Optional[float] = None,
                 max_value: Optional[float] = None,
                 default: Optional[float] = None,
                 step: float = 1.0):
        """
        Initialize number input dialog.

        Args:
            label: Input field label
            title: Dialog title
            min_value: Minimum allowed value
            max_value: Maximum allowed value
            default: Default value
            step: Increment/decrement step
        """
        self.label_text = label
        self.title_text = title
        self.min_value = min_value
        self.max_value = max_value
        self.default = default
        self.step = step
        super().__init__()

    def compose(self) -> ComposeResult:
        """Compose dialog widgets."""
        default_str = str(self.default) if self.default is not None else ""
        range_str = ""
        if self.min_value is not None and self.max_value is not None:
            range_str = f" ({self.min_value} - {self.max_value})"

        yield Container(
            Label(self.title_text, id="dialog-title"),
            Label(f"{self.label_text}{range_str}", id="dialog-label"),
            Horizontal(
                Input(placeholder="0.0", value=default_str, id="number-input", type="number"),
                id="input-container"
            ),
            Label("", id="validation-error"),
            Horizontal(
                Button("OK", variant="primary", id="btn-ok"),
                Button("Cancel", variant="default", id="btn-cancel"),
                id="dialog-buttons"
            ),
            id="dialog-container"
        )

    def on_mount(self) -> None:
        """Focus input on mount."""
        self.query_one("#number-input", Input).focus()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        if event.button.id == "btn-ok":
            self.submit_input()
        else:
            self.dismiss(None)

    def on_input_submitted(self, event: Input.Submitted) -> None:
        """Handle Enter key in input."""
        self.submit_input()

    def submit_input(self) -> None:
        """Validate and submit number input."""
        input_widget = self.query_one("#number-input", Input)
        value_str = input_widget.value.strip()

        if not value_str:
            self.dismiss(None)
            return

        try:
            value = float(value_str)

            # Validate range
            if self.min_value is not None and value < self.min_value:
                error_label = self.query_one("#validation-error", Label)
                error_label.update(f"Value must be >= {self.min_value}")
                return

            if self.max_value is not None and value > self.max_value:
                error_label = self.query_one("#validation-error", Label)
                error_label.update(f"Value must be <= {self.max_value}")
                return

            self.dismiss(value)

        except ValueError:
            error_label = self.query_one("#validation-error", Label)
            error_label.update("Invalid number format")

    def action_cancel(self) -> None:
        """Cancel action (Escape key)."""
        self.dismiss(None)


class MessageDialog(ModalScreen[None]):
    """
    Information message dialog with OK button.

    Usage:
        await self.app.push_screen_wait(
            MessageDialog("Operation completed successfully!", title="Success")
        )
    """

    CSS = """
    MessageDialog {
        align: center middle;
    }

    #dialog-container {
        width: 60;
        height: auto;
        background: $panel;
        border: thick $primary;
        padding: 1 2;
    }

    #dialog-title {
        text-align: center;
        text-style: bold;
        margin-bottom: 1;
    }

    #dialog-message {
        text-align: center;
        margin-bottom: 2;
    }

    #dialog-buttons {
        width: 100%;
        height: auto;
        align: center middle;
    }
    """

    BINDINGS = [
        Binding("escape", "close", "Close", show=False),
        Binding("enter", "close", "Close", show=False),
    ]

    def __init__(self, message: str, title: str = "Information"):
        """
        Initialize message dialog.

        Args:
            message: Message to display
            title: Dialog title
        """
        self.message = message
        self.title_text = title
        super().__init__()

    def compose(self) -> ComposeResult:
        """Compose dialog widgets."""
        yield Container(
            Label(self.title_text, id="dialog-title"),
            Label(self.message, id="dialog-message"),
            Horizontal(
                Button("OK", variant="primary", id="btn-ok"),
                id="dialog-buttons"
            ),
            id="dialog-container"
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button click."""
        self.dismiss()

    def action_close(self) -> None:
        """Close action (Escape/Enter key)."""
        self.dismiss()


class FormDialog(ModalScreen[Optional[dict]]):
    """
    Generic form dialog with multiple fields.

    Usage:
        fields = [
            {"name": "name", "label": "Name:", "type": "text", "required": True},
            {"name": "description", "label": "Description:", "type": "textarea"},
            {"name": "tags", "label": "Tags:", "type": "text", "placeholder": "tag1, tag2"}
        ]
        result = await self.app.push_screen_wait(
            FormDialog(fields, title="Create Session")
        )
        if result:
            # result is dict: {"name": "...", "description": "...", "tags": "..."}
    """

    CSS = """
    FormDialog {
        align: center middle;
    }

    #dialog-container {
        width: 70;
        height: auto;
        background: $panel;
        border: thick $primary;
        padding: 1 2;
    }

    #dialog-title {
        text-align: center;
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    #form-fields {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    .field-label {
        margin-bottom: 0;
    }

    .field-input {
        margin-bottom: 1;
    }

    #validation-error {
        color: $error;
        text-align: center;
        margin-bottom: 1;
    }

    #dialog-buttons {
        width: 100%;
        height: auto;
        align: center middle;
    }
    """

    BINDINGS = [
        Binding("escape", "cancel", "Cancel", show=False),
    ]

    def __init__(self, fields: List[dict], title: str = "Form"):
        """
        Initialize form dialog.

        Args:
            fields: List of field definitions with keys:
                   - name: Field name (key in result dict)
                   - label: Display label
                   - type: "text" or "textarea"
                   - required: Optional bool
                   - placeholder: Optional placeholder text
                   - default: Optional default value
            title: Dialog title
        """
        self.fields_def = fields
        self.title_text = title
        super().__init__()

    def compose(self) -> ComposeResult:
        """Compose dialog widgets."""
        container = Container(id="dialog-container")
        container.mount(Label(self.title_text, id="dialog-title"))

        fields_container = Vertical(id="form-fields")
        for field in self.fields_def:
            field_name = field["name"]
            field_label = field.get("label", field_name)
            field_type = field.get("type", "text")
            placeholder = field.get("placeholder", "")
            default = field.get("default", "")

            fields_container.mount(Label(field_label, classes="field-label"))

            if field_type == "textarea":
                # TextArea widget for multi-line
                fields_container.mount(
                    TextArea(text=default, id=f"field-{field_name}", classes="field-input")
                )
            else:
                # Regular Input for text
                fields_container.mount(
                    Input(placeholder=placeholder, value=default,
                         id=f"field-{field_name}", classes="field-input")
                )

        container.mount(fields_container)
        container.mount(Label("", id="validation-error"))
        container.mount(
            Horizontal(
                Button("Submit", variant="primary", id="btn-submit"),
                Button("Cancel", variant="default", id="btn-cancel"),
                id="dialog-buttons"
            )
        )

        yield container

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        if event.button.id == "btn-submit":
            self.submit_form()
        else:
            self.dismiss(None)

    def submit_form(self) -> None:
        """Validate and submit form."""
        result = {}

        for field in self.fields_def:
            field_name = field["name"]
            field_id = f"field-{field_name}"
            required = field.get("required", False)

            try:
                widget = self.query_one(f"#{field_id}")
                if isinstance(widget, TextArea):
                    value = widget.text.strip()
                else:
                    value = widget.value.strip()

                # Check required
                if required and not value:
                    error_label = self.query_one("#validation-error", Label)
                    error_label.update(f"{field.get('label', field_name)} is required")
                    return

                result[field_name] = value
            except Exception as e:
                error_label = self.query_one("#validation-error", Label)
                error_label.update(f"Error reading field {field_name}: {str(e)}")
                return

        self.dismiss(result)

    def action_cancel(self) -> None:
        """Cancel action (Escape key)."""
        self.dismiss(None)


class SelectDialog(ModalScreen[Optional[str]]):
    """
    Selection dialog with a list of options.

    Usage:
        options = [
            ("option_value_1", "Display Label 1"),
            ("option_value_2", "Display Label 2"),
        ]
        result = await self.app.push_screen_wait(
            SelectDialog(options, title="Select Option", message="Choose one:")
        )
        if result:
            # result is the selected option value (first element of tuple)
    """

    CSS = """
    SelectDialog {
        align: center middle;
    }

    #dialog-container {
        width: 70;
        height: auto;
        max-height: 80%;
        background: $panel;
        border: thick $primary;
        padding: 1 2;
    }

    #dialog-title {
        text-align: center;
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    #dialog-message {
        margin-bottom: 1;
    }

    #option-list {
        width: 100%;
        height: auto;
        max-height: 20;
        margin-bottom: 1;
    }

    #dialog-buttons {
        width: 100%;
        height: auto;
        align: center middle;
    }
    """

    BINDINGS = [
        Binding("escape", "cancel", "Cancel", show=False),
    ]

    def __init__(self, options: List[tuple], title: str = "Select",
                 message: str = "Select an option:"):
        """
        Initialize selection dialog.

        Args:
            options: List of (value, label) tuples
            title: Dialog title
            message: Message displayed above the list
        """
        self.options = options
        self.title_text = title
        self.message_text = message
        self.selected_value = None
        super().__init__()

    def compose(self) -> ComposeResult:
        """Compose dialog widgets."""
        from textual.widgets import OptionList

        yield Container(
            Label(self.title_text, id="dialog-title"),
            Label(self.message_text, id="dialog-message"),
            OptionList(id="option-list"),
            Horizontal(
                Button("Select", variant="primary", id="btn-select"),
                Button("Cancel", variant="default", id="btn-cancel"),
                id="dialog-buttons"
            ),
            id="dialog-container"
        )

    def on_mount(self) -> None:
        """Populate options on mount."""
        from textual.widgets import OptionList
        from textual.widgets.option_list import Option
        option_list = self.query_one("#option-list", OptionList)
        # Store value mapping for later retrieval
        self._value_map = {}
        for i, (value, label) in enumerate(self.options):
            option_list.add_option(Option(str(label), id=str(i)))
            self._value_map[str(i)] = value
        option_list.focus()

    def on_option_list_option_selected(self, event) -> None:
        """Handle option selection (double-click or Enter)."""
        option_id = event.option_id
        self.selected_value = self._value_map.get(option_id, option_id)
        self.dismiss(self.selected_value)

    def on_option_list_option_highlighted(self, event) -> None:
        """Track highlighted option."""
        option_id = event.option_id
        self.selected_value = self._value_map.get(option_id, option_id)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        if event.button.id == "btn-select":
            if self.selected_value:
                self.dismiss(self.selected_value)
            else:
                # Try to get selected option from list
                from textual.widgets import OptionList
                option_list = self.query_one("#option-list", OptionList)
                if option_list.highlighted is not None:
                    option_id = option_list.get_option_at_index(option_list.highlighted).id
                    self.dismiss(self._value_map.get(option_id, option_id))
        else:
            self.dismiss(None)

    def action_cancel(self) -> None:
        """Cancel action (Escape key)."""
        self.dismiss(None)
