"""
installer/backend/services.py
==============================
Idempotent systemd service management for the MAP2 installer.

All operations check current state before acting — running `enable_service`
on an already-enabled service is a no-op.  This is the "idempotency" principle
central to enterprise installers and Ansible/Salt-style config management.
"""

from __future__ import annotations

import logging
from typing import List, Optional
from .executor import CommandExecutor, CommandResult

logger = logging.getLogger("installer.services")

# Services that MAP2 requires in all modes
REQUIRED_SERVICES = [
    "pipewire.service",
    "pipewire-pulse.service",
    "wireplumber.service",
    "rtkit-daemon.service",
]

# Services specific to MAP2 backend
MAP2_SERVICES = [
    "map2-backend.service",
    "map2-irq-affinity.service",
]


class ServiceManager:
    """Manage systemd units for the MAP2 installer."""

    def __init__(self, executor: CommandExecutor):
        self.executor = executor

    def is_active(self, unit: str) -> bool:
        """Return True if the unit is currently active (running)."""
        r = self.executor.run(["systemctl", "is-active", "--quiet", unit])
        return r.ok

    def is_enabled(self, unit: str) -> bool:
        """Return True if the unit is enabled (will start on boot)."""
        r = self.executor.run(["systemctl", "is-enabled", "--quiet", unit])
        return r.ok

    def enable_and_start(self, unit: str) -> CommandResult:
        """Enable a unit to start on boot and start it immediately."""
        if not self.is_enabled(unit):
            self.executor.run(["systemctl", "enable", unit])
        if not self.is_active(unit):
            return self.executor.run(["systemctl", "start", unit])
        logger.info("Service %s already active — skipping start", unit)
        return CommandResult(0, "already active", "", self.executor.dry_run, [])

    def reload_daemon(self) -> CommandResult:
        """Reload systemd manager configuration (after installing new unit files)."""
        return self.executor.run(["systemctl", "daemon-reload"])

    def install_unit_file(self, src_path: str, dest_dir: str = "/etc/systemd/system") -> CommandResult:
        """Copy a unit file from the repo to the system directory."""
        return self.executor.run(["install", "-m", "644", src_path, dest_dir])

    def install_map2_services(self, install_dir: str) -> List[CommandResult]:
        """
        Install and enable all MAP2 systemd unit files from the repo.

        Unit files live in {install_dir}/systemd/*.service.
        This mirrors what Anaconda's %post section would do when configuring
        post-reboot services.
        """
        import glob
        results = []
        unit_files = glob.glob(f"{install_dir}/systemd/*.service")
        for f in unit_files:
            results.append(self.install_unit_file(f))
        results.append(self.reload_daemon())
        for svc in MAP2_SERVICES:
            results.append(self.enable_and_start(svc))
        return results
