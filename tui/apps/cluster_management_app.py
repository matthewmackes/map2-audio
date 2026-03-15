"""Compatibility wrapper for the absorbed cluster management console."""

from __future__ import annotations

from ..app import MAP2ConsoleApp


ClusterManagementApp = MAP2ConsoleApp


def run_cluster_app(
    api_url: str = "http://localhost:8080",
    ws_url: str = "ws://localhost:8080",
) -> None:
    app = MAP2ConsoleApp(
        api_url=api_url,
        ws_url=ws_url,
        initial_route="cluster",
    )
    app.run()


def main() -> None:
    run_cluster_app()


if __name__ == "__main__":
    main()
