"""
MAP2 TUI Package — MAP2 Node Console

The new default TUI is in tui.node_console.
This package serves as a compatibility layer.
"""

# For backwards compatibility, redirect to the new TUI
from .node_console import __version__, __app_name__

__all__ = ["__version__", "__app_name__"]

