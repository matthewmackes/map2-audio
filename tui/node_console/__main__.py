"""
CLI entry point for MAP2 Node Console.

Usage:
    python -m tui.node_console                  # Launch TUI
    python -m tui.node_console --help           # Show help
    python -m tui.node_console --version        # Show version
    python -m tui.node_console --no-color       # Disable color
    python -m tui.node_console --api-url URL    # Custom API URL
"""

from __future__ import annotations

import argparse
import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from . import __app_name__, __version__


def _setup_logging(debug: bool = False) -> None:
    """Configure file-only logging (no console output — TUI owns the terminal)."""
    log_file = Path("/tmp/map2_node_console.log")
    handler = RotatingFileHandler(
        str(log_file), maxBytes=2 * 1024 * 1024, backupCount=3,
    )
    handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.DEBUG if debug else logging.INFO)


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="map2-console",
        description=f"{__app_name__} — Professional TUI for MAP2 audio nodes.",
    )
    parser.add_argument(
        "--version", action="version", version=f"{__app_name__} {__version__}",
    )
    parser.add_argument(
        "--no-color", action="store_true",
        help="Disable color output (monochrome mode).",
    )
    parser.add_argument(
        "--api-url", type=str, default=None,
        help="MAP2 backend API URL (default: http://localhost:8080).",
    )
    parser.add_argument(
        "--debug", action="store_true",
        help="Enable debug logging to /tmp/map2_node_console.log.",
    )
    parser.add_argument(
        "--refresh", type=float, default=5.0,
        help="Auto-refresh interval in seconds (default: 5).",
    )

    args = parser.parse_args()

    _setup_logging(debug=args.debug)

    # Import app here to avoid heavy imports if just --help/--version
    from .app import NodeConsoleApp

    app = NodeConsoleApp(
        api_url=args.api_url or "http://localhost:8080",
        initial_route="dashboard",
        no_color=args.no_color,
    )
    app.REFRESH_INTERVAL = args.refresh

    if args.no_color:
        import os
        os.environ["NO_COLOR"] = "1"

    app.run()


if __name__ == "__main__":
    main()
