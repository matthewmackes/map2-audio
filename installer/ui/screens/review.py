"""
installer/ui/screens/review.py
================================
Stage 08 — Review / Dry-Run Summary.

Anaconda analogy:
  Before Anaconda formats disks and installs packages, it shows an
  "Installation Summary" hub screen listing all pending changes.
  The user must click "Begin Installation" to confirm.

  Our Review screen goes further: it renders the full InstallerConfig
  as a Kickstart-like YAML block so users can see exactly what will
  happen, and it computes a staged change summary (packages to install,
  files to write, services to enable, GRUB changes, etc.).

  The user can also save the config to a KS file from this screen
  for later replay.
"""

from __future__ import annotations

import json

from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import ScrollableContainer, Vertical, Horizontal
from textual.widgets import (
    Button, Footer, Header, Label, RichLog, Rule, Static,
)

from installer.ui.screens._base import BaseInstallerScreen


def _build_change_summary(config) -> list[tuple[str, str]]:
    """
    Build a human-readable list of changes that will be made.

    Returns a list of (category, description) pairs for display.
    This is the 'diff preview' of the install — equivalent to running
    `ksvalidator --summary` on a Kickstart file.
    """
    changes = []
    sw = config.software
    rt = config.realtime
    au = config.audio
    nw = config.network

    # Packages
    pkgs = ["pipewire", "rtkit", "alsa-utils"]
    if sw.install_juce_engine: pkgs += ["gcc-c++", "cmake", "freetype-devel"]
    if sw.install_lv2_plugins: pkgs += ["lv2", "lilv"]
    if sw.install_frontend:    pkgs += ["nodejs", "npm"]
    if sw.install_avb:         pkgs += ["ethtool", "iproute"]
    changes.append(("Packages", f"Install: {', '.join(pkgs)}"))

    # PipeWire config
    changes.append(("PipeWire", (
        f"Write ~/.config/pipewire/pipewire.conf.d/99-map2-audio-latency.conf\n"
        f"  buffer_size={au.buffer_size.value}  sample_rate={au.sample_rate.value}\n"
        f"  latency={au.latency_ms} ms  env=PIPEWIRE_LATENCY={au.pipewire_latency_env}"
    )))

    # Systemd
    changes.append(("Systemd", (
        "Install: map2-backend.service, map2-irq-affinity.service\n"
        "Enable: pipewire.service, wireplumber.service, rtkit-daemon.service"
    )))

    # GRUB
    if rt.write_grub and rt.isolated_cores:
        changes.append(("GRUB (reboot required)", (
            f"isolcpus={rt.isolated_cores}  nohz_full={rt.isolated_cores}\n"
            f"rcu_nocbs={rt.isolated_cores}  threadirqs\n"
            f"intel_idle.max_cstate={rt.max_cstate}  preempt={rt.preempt_model}"
        )))

    # RT limits
    changes.append(("RT Limits", (
        "Write /etc/security/limits.d/99-map2-audio.conf\n"
        f"  @audio rtprio {rt.audio_rtprio}  memlock unlimited"
    )))

    # User
    u = config.user
    groups = []
    if u.add_audio_group: groups += ["audio", "jackuser"]
    if u.add_sudo:        groups += ["sudo"]
    changes.append(("User", (
        f"User: {u.username}\n"
        f"Groups: {', '.join(groups)}"
        + ("\n  Password: will be set" if u.password_hash else "\n  Password: unchanged")
    )))

    # Hostname
    changes.append(("Network", f"hostname: {nw.hostname}"))

    # Build
    if sw.install_juce_engine:
        changes.append(("Build (JUCE)", "cmake -B juce-engine/build && cmake --build juce-engine/build"))
    if sw.install_frontend:
        changes.append(("Build (Frontend)", "npm install && npm run build"))

    return changes


class ReviewScreen(BaseInstallerScreen):

    SCREEN_TITLE    = "Review & Confirm"
    SCREEN_SUBTITLE = "Preview all pending changes before installation begins"

    BINDINGS = BaseInstallerScreen.BINDINGS + [
        Binding("ctrl+n", "confirm_install", "Begin Install ▶", show=True),
        Binding("ctrl+s", "save_ks",         "Save KS YAML",    show=True),
    ]

    CSS = """
    ReviewScreen { background: $surface; }
    #review-header {
        margin: 1 4;
        color: $text-muted;
        border-left: thick $accent;
        padding-left: 2;
    }
    .change-category {
        color: $accent;
        text-style: bold;
        margin: 1 0 0 0;
    }
    .change-detail { color: $text; margin-left: 2; }
    #review-log    { margin: 0 4; height: 1fr; }
    #dry-run-badge {
        margin: 0 4 1 4;
        border: double $warning;
        padding: 0 1;
        color: $warning;
        text-align: center;
    }
    #confirm-bar {
        dock: bottom;
        height: 5;
        padding: 1 4;
        background: $surface;
        border-top: thin $primary;
    }
    """

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with ScrollableContainer():
            if self.config.dry_run:
                yield Static(
                    "DRY-RUN MODE — No changes will be made to your system.",
                    id="dry-run-badge",
                )
            yield Static(
                f"Installation mode: [bold]{self.config.mode.value}[/bold]\n"
                "Review the changes below.  Press [bold]Ctrl+N[/bold] to begin "
                "installation or [bold]Escape[/bold] to go back and change settings.",
                id="review-header",
            )
            yield RichLog(id="review-log", highlight=True, markup=True)
        with Horizontal(id="confirm-bar"):
            yield Button(
                "◀ Back to Edit",
                variant="default",
                id="back-btn",
            )
            yield Button(
                "Save Kickstart YAML",
                variant="default",
                id="save-ks-btn",
            )
            yield Button(
                "Begin Installation ▶" if not self.config.dry_run else "Dry-Run Preview ▶",
                variant="success",
                id="install-btn",
            )
        yield Footer()

    def on_mount(self) -> None:
        super().on_mount()
        self._render_review()

    def _render_review(self) -> None:
        """Populate the review log with the change summary."""
        log = self.query_one("#review-log", RichLog)
        log.clear()

        log.write("[bold cyan]══ INSTALLATION PLAN ══[/bold cyan]")
        log.write(f"Mode:     [bold]{self.config.mode.value}[/bold]")
        log.write(f"Host:     {self.config.network.hostname}")
        log.write(f"Install:  {self.config.storage.install_dir}")
        log.write(f"Dry-run:  {'YES — no changes will be made' if self.config.dry_run else 'NO — system will be modified'}")
        log.write("")

        changes = _build_change_summary(self.config)
        for category, detail in changes:
            log.write(f"[bold yellow]▸ {category}[/bold yellow]")
            for line in detail.splitlines():
                log.write(f"  {line}")
            log.write("")

        log.write("[bold cyan]══ KICKSTART YAML PREVIEW ══[/bold cyan]")
        # Render config as YAML-like block
        import yaml as _yaml
        data = json.loads(self.config.model_dump_json())
        # Remove sensitive fields from display
        if "user" in data and "password_hash" in data["user"]:
            data["user"]["password_hash"] = "**REDACTED**"
        yaml_str = _yaml.dump(data, default_flow_style=False, sort_keys=False)
        for line in yaml_str.splitlines()[:60]:  # First 60 lines
            log.write(f"[dim]{line}[/dim]")
        if len(yaml_str.splitlines()) > 60:
            log.write("[dim]… (use Ctrl+S to save full YAML)[/dim]")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "back-btn":
            self.action_go_back()
        elif event.button.id == "save-ks-btn":
            self.action_save_ks()
        elif event.button.id == "install-btn":
            self.action_confirm_install()

    def action_confirm_install(self) -> None:
        """Validate one final time then advance to the install screen."""
        errors = self.validate()
        if errors:
            self.app.notify("\n".join(errors), severity="error")
            return
        self.app.action_next_screen()

    def action_save_ks(self) -> None:
        """Save the current config to a Kickstart YAML file."""
        from installer.config.kickstart import save_kickstart
        from pathlib import Path
        ks_path = Path("/tmp/map2-ks.yaml")
        save_kickstart(self.config, ks_path)
        self.app.notify(f"Kickstart saved to {ks_path}", severity="information")

    @property
    def help_text(self) -> str:
        return """\
# Review & Confirm

## Purpose
This screen shows you EXACTLY what the installer will do before it
does anything.  No system changes have been made yet.

This is the MAP2 equivalent of:
  • Anaconda's "Installation Summary" confirmation step
  • Kickstart's `%pre` section that validates config before install

## Understanding the Change Summary
Each section shows one category of changes:

  Packages     — dnf install commands that will be run
  PipeWire     — config files that will be written
  Systemd      — services that will be enabled/started
  GRUB         — kernel parameters added to /etc/default/grub
  RT Limits    — /etc/security/limits.d entries
  User         — group memberships and password changes
  Build        — cmake/npm build commands

## Dry-Run Mode
If you launched with --dry-run, the installer will simulate every
step and show you the output without touching your system.  This is
safe to run multiple times.

## Save Kickstart YAML (Ctrl+S)
Saves the complete configuration to /tmp/map2-ks.yaml.  You can use
this file for unattended installs on other machines:

  python -m installer --unattended /tmp/map2-ks.yaml

Or for validation:
  python -m installer --validate-ks /tmp/map2-ks.yaml

## Pro Tip
Review the GRUB section carefully.  If isolated_cores is wrong (e.g.,
refers to cores that don't exist on your CPU), the kernel will silently
ignore the isolcpus= parameter and audio will run on non-isolated cores.

## Common Pitfall
The GRUB changes REQUIRE A REBOOT to take effect.  The installer will
remind you at the end.  After the first boot with new parameters, run:
  cat /proc/cmdline
to verify isolcpus appears.

Navigate: Tab / Shift-Tab │ Help: F1 │ Save KS: Ctrl+S │ Begin: Ctrl+N
"""
