"""
installer/backend/grub.py
==========================
GRUB2 bootloader configuration for RT/low-latency kernel parameters.

Educational note on kernel cmdline parameters for audio:
  These parameters are written to /etc/default/grub and applied at the
  NEXT REBOOT.  They cannot be applied to the currently running kernel
  without a reboot — this is by design in the Linux kernel.

  Key parameters (taught in the RT Config screen):
    isolcpus=4,5      — Remove cores 4,5 from the CFS scheduler.  Processes
                        won't be scheduled there unless explicitly affined.
    nohz_full=4,5     — Disable the periodic timer tick on cores 4,5.
                        Each tick is a 10µs interrupt that adds jitter.
    rcu_nocbs=4,5     — Offload RCU callbacks off the isolated cores.
    threadirqs        — Force hardware IRQ handlers into kernel threads,
                        allowing their priority and affinity to be set.
    intel_idle.max_cstate=1  — Prevent deep CPU sleep states (C2-C10).
                        Deep C-states add 100-500µs wakeup latency.
    preempt=full      — Enable full kernel preemption: any kernel path
                        can be interrupted by a higher-priority task.

  See: MEMORY.md — RT/Latency Configuration
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Optional

from .executor import CommandExecutor, CommandResult

logger = logging.getLogger("installer.grub")

GRUB_DEFAULT_PATH = Path("/etc/default/grub")
GRUB_CFG_PATHS    = [
    Path("/boot/grub2/grub.cfg"),
    Path("/boot/grub/grub.cfg"),
]


class GRUBConfig:
    """
    Safe, idempotent GRUB2 /etc/default/grub editor.

    Strategy:
      1. Read current GRUB_CMDLINE_LINUX value.
      2. Remove any MAP2-owned parameters that conflict.
      3. Append the new MAP2 parameters.
      4. Write the file (with backup).
      5. Run grub2-mkconfig to regenerate /boot/grub2/grub.cfg.
    """

    # Parameters we own — only touch these, leave everything else alone
    MAP2_OWNED_PARAMS = {
        "isolcpus", "nohz_full", "rcu_nocbs", "threadirqs",
        "intel_idle.max_cstate", "processor.max_cstate", "preempt",
    }

    def __init__(self, executor: CommandExecutor):
        self.executor = executor

    def current_cmdline(self) -> str:
        """Return the current GRUB_CMDLINE_LINUX value (without quotes)."""
        if not GRUB_DEFAULT_PATH.exists():
            return ""
        text = GRUB_DEFAULT_PATH.read_text()
        m = re.search(r'^GRUB_CMDLINE_LINUX="([^"]*)"', text, re.MULTILINE)
        return m.group(1) if m else ""

    def preview_cmdline(self, additions: str) -> str:
        """
        Return what GRUB_CMDLINE_LINUX would look like after applying additions.

        Used by the Review and RT Config screens to show users exactly what
        will be written — analogous to Anaconda's pre-install summary.
        """
        current = self.current_cmdline()
        cleaned = self._strip_map2_params(current)
        merged  = f"{cleaned} {additions}".strip()
        return merged

    def apply_cmdline(self, additions: str) -> list[CommandResult]:
        """
        Write the new GRUB_CMDLINE_LINUX and regenerate grub.cfg.

        IMPORTANT: Changes only take effect after reboot.
        The installer marks reboot_required=True after calling this.

        Args:
            additions: Space-separated kernel parameters to add.

        Returns:
            List of CommandResults: [write_result, mkconfig_result].
        """
        results = []
        new_cmdline = self.preview_cmdline(additions)
        results.append(self._write_grub_file(new_cmdline))
        results.append(self._run_mkconfig())
        return results

    def _strip_map2_params(self, cmdline: str) -> str:
        """Remove any previously-set MAP2-owned parameters from cmdline."""
        tokens = cmdline.split()
        cleaned = []
        for tok in tokens:
            key = tok.split("=")[0]
            if key not in self.MAP2_OWNED_PARAMS:
                cleaned.append(tok)
        return " ".join(cleaned)

    def _write_grub_file(self, new_cmdline: str) -> CommandResult:
        """Write the updated GRUB_CMDLINE_LINUX to /etc/default/grub."""
        if self.executor.dry_run:
            logger.info("[DRY-RUN] Would set GRUB_CMDLINE_LINUX=\"%s\"", new_cmdline)
            return CommandResult(0, f"GRUB_CMDLINE_LINUX=\"{new_cmdline}\"", "",
                                 True, ["write", str(GRUB_DEFAULT_PATH)])

        if not GRUB_DEFAULT_PATH.exists():
            return CommandResult(1, "", f"{GRUB_DEFAULT_PATH} not found", False,
                                 ["check", str(GRUB_DEFAULT_PATH)])

        text = GRUB_DEFAULT_PATH.read_text()
        # Back up the original before modifying
        backup = GRUB_DEFAULT_PATH.with_suffix(".grub.bak")
        backup.write_text(text)
        logger.info("Backed up GRUB config to %s", backup)

        # Replace or append GRUB_CMDLINE_LINUX
        if re.search(r'^GRUB_CMDLINE_LINUX=', text, re.MULTILINE):
            new_text = re.sub(
                r'^GRUB_CMDLINE_LINUX="[^"]*"',
                f'GRUB_CMDLINE_LINUX="{new_cmdline}"',
                text,
                flags=re.MULTILINE,
            )
        else:
            new_text = text + f'\nGRUB_CMDLINE_LINUX="{new_cmdline}"\n'

        GRUB_DEFAULT_PATH.write_text(new_text)
        logger.info("Updated GRUB_CMDLINE_LINUX to: %s", new_cmdline)
        return CommandResult(0, new_cmdline, "", False, ["write", str(GRUB_DEFAULT_PATH)])

    def _run_mkconfig(self) -> CommandResult:
        """Regenerate /boot/grub2/grub.cfg from /etc/default/grub."""
        # Detect which grub.cfg path exists
        cfg_path = next((p for p in GRUB_CFG_PATHS if p.parent.exists()), GRUB_CFG_PATHS[0])
        return self.executor.run(
            ["grub2-mkconfig", "-o", str(cfg_path)],
            timeout=60,
        )
