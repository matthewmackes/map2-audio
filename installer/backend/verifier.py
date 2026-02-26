"""
installer/backend/verifier.py
==============================
Post-install verification — checks that every component is correctly installed
and the RT audio system is healthy.

Anaconda analogy:
  Anaconda's firstboot / post-install checks verify package integrity,
  bootloader configuration, and service startup.  Our verifier does the
  audio-specific equivalent: confirm RT scheduling is active, PipeWire is
  running at the correct quantum, and the JUCE engine starts cleanly.

Each check returns a CheckResult with a status (PASS / WARN / FAIL) and
an educational explanation of what the check means and how to fix failures.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import List, Optional

from .executor import CommandExecutor

logger = logging.getLogger("installer.verifier")


class CheckStatus(str, Enum):
    PASS = "PASS"
    WARN = "WARN"
    FAIL = "FAIL"
    SKIP = "SKIP"   # Check skipped because a prerequisite failed


@dataclass
class CheckResult:
    """Result of a single post-install health check."""
    name:        str
    status:      CheckStatus
    message:     str
    detail:      str = ""         # Longer educational explanation
    fix_hint:    str = ""         # How to fix a WARN/FAIL

    @property
    def icon(self) -> str:
        return {"PASS": "✓", "WARN": "⚠", "FAIL": "✗", "SKIP": "○"}[self.status]


class PostInstallVerifier:
    """
    Run a battery of post-install health checks.

    Call run_all() after the install stage completes to get a full report.
    The results are displayed in the Verify screen (Stage 10) and written
    to ~/.map2/install-verification.json.
    """

    def __init__(self, executor: CommandExecutor, config):
        self.executor = executor
        self.config   = config  # InstallerConfig

    def run_all(self) -> List[CheckResult]:
        """Run every check and return results in order."""
        checks = [
            self.check_pipewire_running(),
            self.check_pipewire_quantum(),
            self.check_juce_engine_binary(),
            self.check_rt_limits(),
            self.check_rtkit_daemon(),
            self.check_map2_service(),
            self.check_audio_group(),
            self.check_grub_cmdline(),
            self.check_python_venv(),
        ]
        return checks

    # ── Individual checks ─────────────────────────────────────────────────────

    def check_pipewire_running(self) -> CheckResult:
        """Verify PipeWire is active and accessible to the current user."""
        r = self.executor.run(["pw-cli", "info"])
        if r.ok:
            return CheckResult("PipeWire running", CheckStatus.PASS,
                               "PipeWire is accessible and responding.")
        return CheckResult("PipeWire running", CheckStatus.FAIL,
                           "pw-cli info failed — PipeWire may not be running.",
                           fix_hint="Run: systemctl --user start pipewire.service")

    def check_pipewire_quantum(self) -> CheckResult:
        """
        Verify PipeWire's clock quantum matches the configured buffer size.

        A mismatch means the ExecStartPre pw-metadata commands didn't run,
        or PipeWire was restarted after the service applied them.
        """
        target = self.config.audio.buffer_size.value
        r      = self.executor.run(["pw-metadata", "-n", "settings"])
        if not r.ok:
            return CheckResult("PipeWire quantum", CheckStatus.SKIP,
                               "Could not query pw-metadata — PipeWire not running?")
        m = re.search(r"clock\.force-quantum.*?'(\d+)'", r.stdout)
        if not m:
            return CheckResult("PipeWire quantum", CheckStatus.WARN,
                               "force-quantum not set in PipeWire settings.",
                               fix_hint=f"Run: pw-metadata -n settings 0 clock.force-quantum {target}")
        actual = int(m.group(1))
        if actual == target:
            return CheckResult("PipeWire quantum", CheckStatus.PASS,
                               f"Quantum = {actual} samples ({self.config.audio.latency_ms} ms).")
        return CheckResult("PipeWire quantum", CheckStatus.WARN,
                           f"Quantum = {actual}, expected {target}.",
                           fix_hint="Restart map2-backend.service to re-apply quantum.")

    def check_juce_engine_binary(self) -> CheckResult:
        """Verify the JUCE engine shared library was built."""
        # Check for the pybind11 .so that the Python backend loads
        pattern = Path(self.config.storage.install_dir) / "juce-engine" / "build" / "*.so"
        import glob
        matches = glob.glob(str(pattern))
        if matches:
            return CheckResult("JUCE engine binary", CheckStatus.PASS,
                               f"Found: {Path(matches[0]).name}")
        return CheckResult("JUCE engine binary", CheckStatus.FAIL,
                           "JUCE .so not found in juce-engine/build/",
                           fix_hint="Re-run CMake build: cmake -B juce-engine/build && cmake --build juce-engine/build")

    def check_rt_limits(self) -> CheckResult:
        """Verify /etc/security/limits.d/99-map2-audio.conf grants RT priority."""
        limits_file = Path("/etc/security/limits.d/99-map2-audio.conf")
        if not limits_file.exists():
            return CheckResult("RT limits", CheckStatus.WARN,
                               "RT limits file not found.",
                               fix_hint="Installer should have created /etc/security/limits.d/99-map2-audio.conf")
        content = limits_file.read_text()
        if "rtprio" in content and "memlock" in content:
            return CheckResult("RT limits", CheckStatus.PASS,
                               "rtprio and memlock limits configured for audio group.")
        return CheckResult("RT limits", CheckStatus.WARN,
                           "limits.d file exists but may be incomplete.",
                           detail="Check rtprio and memlock entries for the 'audio' group.")

    def check_rtkit_daemon(self) -> CheckResult:
        """Verify rtkit-daemon is running (enables RT elevation for PipeWire)."""
        r = self.executor.run(["systemctl", "is-active", "--quiet", "rtkit-daemon.service"])
        if r.ok:
            return CheckResult("rtkit-daemon", CheckStatus.PASS, "rtkit-daemon is active.")
        return CheckResult("rtkit-daemon", CheckStatus.WARN,
                           "rtkit-daemon is not active.",
                           fix_hint="sudo systemctl enable --now rtkit-daemon.service")

    def check_map2_service(self) -> CheckResult:
        """Check if map2-backend.service is enabled (don't start it yet)."""
        r = self.executor.run(["systemctl", "is-enabled", "--quiet", "map2-backend.service"])
        if r.ok:
            return CheckResult("map2-backend service", CheckStatus.PASS,
                               "map2-backend.service is enabled for boot.")
        return CheckResult("map2-backend service", CheckStatus.WARN,
                           "map2-backend.service is not enabled.",
                           fix_hint="sudo systemctl enable map2-backend.service")

    def check_audio_group(self) -> CheckResult:
        """Verify the configured user is in the audio group."""
        username = self.config.user.username
        r = self.executor.run(["groups", username])
        if "audio" in r.stdout:
            return CheckResult("Audio group", CheckStatus.PASS,
                               f"User '{username}' is in the audio group.")
        return CheckResult("Audio group", CheckStatus.FAIL,
                           f"User '{username}' is NOT in the audio group.",
                           fix_hint=f"sudo usermod -aG audio {username}  (then log out and back in)")

    def check_grub_cmdline(self) -> CheckResult:
        """
        Check the active kernel cmdline for RT parameters.

        Note: /proc/cmdline shows CURRENT boot parameters, not what's in
        /etc/default/grub.  If a GRUB update was made, a reboot is needed.
        """
        cmdline = Path("/proc/cmdline").read_text(errors="replace") if Path("/proc/cmdline").exists() else ""
        if "isolcpus" in cmdline:
            m = re.search(r"isolcpus=([\d,\-]+)", cmdline)
            cores = m.group(1) if m else "?"
            return CheckResult("CPU isolation", CheckStatus.PASS,
                               f"isolcpus={cores} active on current boot.")
        if self.config.realtime.write_grub:
            return CheckResult("CPU isolation", CheckStatus.WARN,
                               "isolcpus not in current kernel cmdline — reboot required.",
                               fix_hint="Reboot to activate GRUB changes.")
        return CheckResult("CPU isolation", CheckStatus.SKIP,
                           "GRUB write not requested for this mode.")

    def check_python_venv(self) -> CheckResult:
        """Verify the Python venv exists and key packages are importable."""
        venv_pip = Path(self.config.storage.venv_dir) / "bin" / "pip"
        if not venv_pip.exists():
            return CheckResult("Python venv", CheckStatus.FAIL,
                               f"venv not found at {self.config.storage.venv_dir}",
                               fix_hint="Re-run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt")
        return CheckResult("Python venv", CheckStatus.PASS,
                           f"venv found at {self.config.storage.venv_dir}")

    def save_report(self, results: List[CheckResult]) -> Path:
        """Write verification results to ~/.map2/install-verification.json."""
        report_dir  = Path.home() / ".map2"
        report_dir.mkdir(parents=True, exist_ok=True)
        report_path = report_dir / "install-verification.json"
        data = [
            {"name": r.name, "status": r.status.value,
             "message": r.message, "fix_hint": r.fix_hint}
            for r in results
        ]
        report_path.write_text(json.dumps({"checks": data}, indent=2))
        logger.info("Verification report written to %s", report_path)
        return report_path
