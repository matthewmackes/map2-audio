"""Compatibility entrypoint for the absorbed node console."""

from __future__ import annotations

from ..app import MAP2ConsoleApp


NodeConsoleApp = MAP2ConsoleApp


def main() -> None:
    app = MAP2ConsoleApp(initial_route="dashboard")
    app.run()


if __name__ == "__main__":
    main()
