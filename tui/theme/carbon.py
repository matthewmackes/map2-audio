"""Carbon-aligned Textual themes for the unified console."""

from __future__ import annotations

from textual.app import App
from textual.theme import Theme


DEFAULT_THEME_NAME = "carbon-dark"


CARBON_DARK = Theme(
    name="carbon-dark",
    primary="#0f62fe",
    secondary="#525252",
    warning="#f1c21b",
    error="#fa4d56",
    success="#24a148",
    accent="#78a9ff",
    foreground="#ffffff",
    background="#000000",
    surface="#1a1a1a",
    panel="#2a2a2a",
    dark=True,
    variables={
        "carbon-canvas": "#000000",
        "carbon-panel": "#2a2a2a",
        "carbon-primary-action": "#0f62fe",
        "carbon-secondary-action": "#525252",
        "carbon-accent": "#78a9ff",
        "carbon-success": "#24a148",
        "carbon-warning": "#f1c21b",
        "carbon-error": "#fa4d56",
        "carbon-border-subtle": "#525252",
        "carbon-border-strong": "#8d8d8d",
        "carbon-focus": "#ffffff",
        "carbon-selected": "#0f62fe",
        "carbon-disabled": "#6f6f6f",
        "carbon-text-secondary": "#c6c6c6",
        "carbon-runtime-panel": "#161616",
        "qc-canvas": "#000000",
        "qc-surface-0": "#161616",
        "qc-surface-1": "#262626",
        "qc-surface-2": "#393939",
        "qc-border-subtle": "#525252",
        "qc-border-strong": "#a8a8a8",
        "qc-text-secondary": "#c6c6c6",
        "qc-text-muted": "#8d8d8d",
        "qc-inactive": "#1f1f1f",
        "qc-signal-io": "#8d8d8d",
        "qc-dynamics": "#f1c21b",
        "qc-drive": "#ffb000",
        "qc-amp": "#fa4d56",
        "qc-modulation": "#33b1ff",
        "qc-delay": "#42be65",
        "qc-reverb": "#ff832b",
        "qc-pitch-filter": "#be95ff",
    },
)


CARBON_LIGHT = Theme(
    name="carbon-light",
    primary="#0f62fe",
    secondary="#8d8d8d",
    warning="#8e6a00",
    error="#da1e28",
    success="#198038",
    accent="#0043ce",
    foreground="#161616",
    background="#f4f4f4",
    surface="#ffffff",
    panel="#ffffff",
    dark=False,
    variables={
        "carbon-canvas": "#f4f4f4",
        "carbon-panel": "#ffffff",
        "carbon-primary-action": "#0f62fe",
        "carbon-secondary-action": "#8d8d8d",
        "carbon-accent": "#0043ce",
        "carbon-success": "#198038",
        "carbon-warning": "#8e6a00",
        "carbon-error": "#da1e28",
        "carbon-border-subtle": "#c6c6c6",
        "carbon-border-strong": "#8d8d8d",
        "carbon-focus": "#0f62fe",
        "carbon-selected": "#0f62fe",
        "carbon-disabled": "#c6c6c6",
        "carbon-text-secondary": "#525252",
        "carbon-runtime-panel": "#e8e8e8",
        "qc-canvas": "#f4f4f4",
        "qc-surface-0": "#ffffff",
        "qc-surface-1": "#f4f4f4",
        "qc-surface-2": "#e8e8e8",
        "qc-border-subtle": "#c6c6c6",
        "qc-border-strong": "#8d8d8d",
        "qc-text-secondary": "#525252",
        "qc-text-muted": "#6f6f6f",
        "qc-inactive": "#e8e8e8",
        "qc-signal-io": "#6f6f6f",
        "qc-dynamics": "#8e6a00",
        "qc-drive": "#b28600",
        "qc-amp": "#da1e28",
        "qc-modulation": "#0043ce",
        "qc-delay": "#198038",
        "qc-reverb": "#b05d00",
        "qc-pitch-filter": "#6929c4",
    },
)


def register_carbon_themes(app: App[object]) -> None:
    """Register the Carbon themes with the running Textual app."""

    app.register_theme(CARBON_DARK)
    app.register_theme(CARBON_LIGHT)
