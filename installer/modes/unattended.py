"""
installer/modes/unattended.py
==============================
Unattended / headless installer — runs without any TUI.

Anaconda analogy:
  When Fedora Anaconda is launched with `inst.ks=<url>`, it reads the
  Kickstart file and performs the entire installation without any user
  interaction.  We do exactly the same:
    python -m installer --unattended map2-ks.yaml

This mode is designed for:
  • CI/CD pipelines that deploy MAP2 to bare-metal hosts automatically
  • Reproducible deployments: same KS file = same result every time
  • Remote provisioning: ssh host "python -m installer --unattended map2-ks.yaml"

Exit codes (POSIX-standard, friendly for shell scripts and CI):
  0 — all stages completed successfully
  1 — validation error (bad KS file, invalid config)
  2 — install error (at least one stage failed)
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Optional

from installer.config.kickstart import load_kickstart, validate_kickstart_file
from installer.config.schema import InstallerConfig

logger = logging.getLogger("installer.unattended")


class UnattendedRunner:
    """
    Execute a full MAP2 installation without any TUI.

    All output goes to stdout (progress) and the installer log file.
    Progress is displayed as plain-text stage markers compatible with
    any terminal or CI log viewer (no ANSI escapes).
    """

    def __init__(
        self,
        ks_path:  str,
        dry_run:  bool = False,
        log_file: str  = "/var/log/map2-installer.log",
    ):
        self.ks_path  = ks_path
        self.dry_run  = dry_run
        self.log_file = log_file
        self._failed_stages: list[str] = []

    def run(self) -> int:
        """
        Load KS, validate, then execute all stages.

        Returns the exit code (0, 1, or 2).
        """
        self._setup_logging()

        # ── Validate KS file first — no changes before this passes ───────────
        print(f"[MAP2 Installer] Loading kickstart: {self.ks_path}")
        errors = validate_kickstart_file(self.ks_path)
        if errors:
            print(f"[MAP2 Installer] VALIDATION FAILED ({len(errors)} errors):")
            for err in errors:
                print(f"  • {err}")
            return 1

        config = load_kickstart(self.ks_path)
        config.dry_run = self.dry_run

        if self.dry_run:
            print("[MAP2 Installer] DRY-RUN MODE — no system changes will be made.")

        print(f"[MAP2 Installer] Mode: {config.mode.value}")
        print(f"[MAP2 Installer] Install dir: {config.storage.install_dir}")
        print(f"[MAP2 Installer] Log file: {self.log_file}")
        print()

        # ── Run each stage ────────────────────────────────────────────────────
        from installer.backend.executor import CommandExecutor
        executor = CommandExecutor(
            dry_run=self.dry_run,
            log_file=self.log_file,
            progress_cb=lambda line: print(f"  | {line}"),
        )

        from installer.ui.screens.install_progress import INSTALL_STAGES
        from installer.backend.packages import PackageManager
        from installer.backend.pipewire import PipeWireConfig
        from installer.backend.grub     import GRUBConfig
        from installer.backend.services import ServiceManager
        from installer.backend.build    import JUCEBuilder, FrontendBuilder, PythonEnvBuilder
        from installer.backend.cluster_manager import ClusterManagerInstaller

        install_dir = str(config.storage.install_dir)
        success_all = True

        for stage in INSTALL_STAGES:
            print(f"[MAP2 Installer] ▸ Stage: {stage.label}")
            try:
                results = self._run_stage(stage.key, executor, config, install_dir)
                failed = [r for r in results if not r.ok]
                if failed:
                    print(f"[MAP2 Installer] ✗ Stage '{stage.key}' FAILED:")
                    for r in failed:
                        print(f"    rc={r.returncode}: {r.command_str}")
                        print(f"    stderr: {r.stderr[:300]}")
                    self._failed_stages.append(stage.key)
                    success_all = False
                    # Continue with remaining stages (skip, don't abort)
                    print(f"[MAP2 Installer]   Continuing with next stage…")
                else:
                    print(f"[MAP2 Installer] ✓ Stage '{stage.key}' complete.")

            except Exception as e:
                print(f"[MAP2 Installer] ✗ Stage '{stage.key}' EXCEPTION: {e}")
                self._failed_stages.append(stage.key)
                success_all = False

        # ── Summary ───────────────────────────────────────────────────────────
        print()
        if success_all:
            print("[MAP2 Installer] ══ Installation successful! ══")
        else:
            print(f"[MAP2 Installer] ══ Installation completed with {len(self._failed_stages)} failed stage(s): "
                  f"{', '.join(self._failed_stages)} ══")

        # ── Post-install verification ─────────────────────────────────────────
        print("[MAP2 Installer] Running post-install verification…")
        self._run_verification(executor, config)

        return 0 if success_all else 2

    def _run_stage(self, key: str, executor, config: InstallerConfig, install_dir: str):
        """Dispatch to the appropriate stage runner. Returns list[CommandResult]."""
        from installer.backend.packages import PackageManager
        from installer.backend.pipewire import PipeWireConfig
        from installer.backend.grub     import GRUBConfig
        from installer.backend.services import ServiceManager
        from installer.backend.build    import JUCEBuilder, FrontendBuilder, PythonEnvBuilder
        from installer.backend.cluster_manager import ClusterManagerInstaller

        sw = config.software
        au = config.audio
        rt = config.realtime

        if key == "packages":
            pm = PackageManager(executor)
            results = pm.install_component("core") + pm.install_component("rt_audio")
            if sw.install_juce_engine: results += pm.install_component("juce")
            if sw.install_frontend:    results += pm.install_component("node")
            if sw.install_lv2_plugins: results += pm.install_component("lv2")
            if sw.install_avb:         results += pm.install_component("avb")
            return results

        elif key == "python_env":
            b = PythonEnvBuilder(executor, install_dir, str(config.storage.venv_dir))
            return [b.create_venv(), b.install_deps()]

        elif key == "pipewire":
            pw = PipeWireConfig(executor)
            return [pw.write_config(au.buffer_size.value, au.sample_rate.value)]

        elif key == "rt_limits":
            if not executor.dry_run:
                from pathlib import Path
                p = Path("/etc/security/limits.d/99-map2-audio.conf")
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(
                    "# MAP2 Audio Platform RT limits\n"
                    f"@audio - rtprio  {rt.audio_rtprio}\n"
                    "@audio - memlock unlimited\n"
                    "@audio - nice    -15\n"
                )
            return [executor.run(["true"])]

        elif key == "grub":
            if not rt.write_grub or not rt.isolated_cores:
                return []
            grub = GRUBConfig(executor)
            return grub.apply_cmdline(rt.grub_cmdline_additions)

        elif key == "services":
            sm = ServiceManager(executor)
            return sm.install_map2_services(install_dir)

        elif key == "juce_build":
            if not sw.install_juce_engine:
                return []
            jb = JUCEBuilder(executor, install_dir)
            return [jb.configure(), jb.build()]

        elif key == "frontend":
            if not sw.install_frontend:
                return []
            fb = FrontendBuilder(executor, install_dir)
            return [fb.install_deps(), fb.build()]

        elif key == "cluster_mgr":
            installer = ClusterManagerInstaller(executor)
            return installer.install(config)

        elif key == "user":
            user = config.user
            results = []
            groups = []
            if user.add_audio_group: groups += ["audio", "jackuser"]
            if user.add_sudo:        groups += ["wheel"]
            for grp in groups:
                results.append(executor.run(["usermod", "-aG", grp, user.username]))
            return results

        elif key == "post":
            return [executor.run(["hostnamectl", "set-hostname", config.network.hostname])]

        return []

    def _run_verification(self, executor, config: InstallerConfig) -> None:
        """Run and print post-install verification results."""
        from installer.backend.verifier import PostInstallVerifier, CheckStatus
        verifier = PostInstallVerifier(executor, config)
        results  = verifier.run_all()
        for r in results:
            print(f"  {r.icon} {r.name}: {r.message}")
            if r.fix_hint and r.status in (CheckStatus.WARN, CheckStatus.FAIL):
                print(f"    Fix: {r.fix_hint}")
        try:
            path = verifier.save_report(results)
            print(f"\n[MAP2 Installer] Report saved to {path}")
        except Exception:
            pass

    def _setup_logging(self) -> None:
        logging.basicConfig(
            level=logging.DEBUG,
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            handlers=[logging.StreamHandler(sys.stdout)],
        )
