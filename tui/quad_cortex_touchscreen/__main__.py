"""CLI entrypoint for the Quad Cortex touchscreen Textual app."""

from __future__ import annotations

import argparse
import os

from . import __app_name__, __version__
from .app import QuadCortexTouchscreenApp


def main() -> None:
    default_api_url = os.environ.get("MAP2_API_URL", "http://localhost:8080")
    parser = argparse.ArgumentParser(
        prog=__app_name__,
        description="Quad Cortex touchscreen clone for Textual, styled with Carbon.",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"{__app_name__} {__version__}",
    )
    parser.add_argument(
        "--no-color",
        action="store_true",
        help="Disable terminal color output.",
    )
    parser.add_argument(
        "--no-animation",
        action="store_true",
        help="Disable signal and MIDI animation.",
    )
    parser.add_argument(
        "--api-url",
        default=default_api_url,
        help=f"MAP2 backend base URL (default: {default_api_url}).",
    )
    args = parser.parse_args()

    if args.no_color:
        os.environ["NO_COLOR"] = "1"

    app = QuadCortexTouchscreenApp(api_url=args.api_url, animate=not args.no_animation)
    app.run()


if __name__ == "__main__":
    main()
