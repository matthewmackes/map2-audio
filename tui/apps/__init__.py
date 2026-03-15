"""Compatibility exports for absorbed TUI app entrypoints."""

from .cluster_management_app import ClusterManagementApp, run_cluster_app

__all__ = [
    "ClusterManagementApp",
    "run_cluster_app",
]
