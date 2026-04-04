"""
installer/backend/cluster_manager.py
====================================
Cluster-manager and observability installation wrapper for the Textual installer.

This module intentionally reuses the repository's shell installer rather than
re-implementing its provisioning logic in Python. That keeps the Textual flow
aligned with the repo-managed management-plane install path added in T732.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import List

from installer.config.schema import InstallerConfig

from .executor import CommandExecutor, CommandResult


DEFAULT_CLUSTER_NAME = "map2-cluster"
REPO_ROOT = Path(__file__).resolve().parents[2]
INSTALL_SCRIPT = REPO_ROOT / "scripts" / "install_cluster_manager.sh"


def resolve_cluster_manager_role(config: InstallerConfig) -> str:
    """
    Resolve the shell installer's node-role argument from the installer config.

    Installing the cluster manager on a host that also runs the JUCE engine is
    treated as an all-in-one node. Otherwise it is treated as a management node.
    """
    if config.software.install_juce_engine:
        return "ALL-IN-ONE"
    return "MANAGEMENT-NODE"


class ClusterManagerInstaller:
    """Run the repo-managed cluster-manager installer from the Textual flow."""

    def __init__(self, executor: CommandExecutor):
        self.executor = executor

    def build_environment(self, config: InstallerConfig) -> dict[str, str]:
        env = dict(os.environ)
        env.update({
            "APP_DIR": str(config.storage.install_dir),
            "VENV_DIR": str(config.storage.venv_dir),
            "LOG_DIR": str(config.storage.log_dir),
        })
        return env

    def build_command(self, config: InstallerConfig) -> list[str]:
        return [
            "bash",
            str(INSTALL_SCRIPT),
            "--node-role",
            resolve_cluster_manager_role(config),
            "--cluster-name",
            DEFAULT_CLUSTER_NAME,
        ]

    def install(self, config: InstallerConfig) -> List[CommandResult]:
        if not config.software.install_cluster_mgr:
            return []

        result = self.executor.run(
            self.build_command(config),
            cwd=str(REPO_ROOT),
            env=self.build_environment(config),
            timeout=3600,
            retries=1,
        )
        return [result]
