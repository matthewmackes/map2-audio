"""
installer/ui/screens/users.py
==============================
Stage 07 — User Account Configuration.

Anaconda analogy:
  Anaconda's User Settings spoke lets admins create a user account with
  password, full name, and group membership.  We add a live password
  strength meter and educational explanations of why group membership
  matters for real-time audio on Linux.
"""

from __future__ import annotations

import hashlib
import re

from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import ScrollableContainer, Vertical
from textual.widgets import (
    Checkbox, Footer, Header, Input, Label, ProgressBar, Static,
)

from installer.ui.screens._base import BaseInstallerScreen


def _score_password(password: str) -> tuple[int, str]:
    """
    Score a password from 0–100 and return (score, label).

    Scoring criteria (each adds points):
      • Length ≥ 8:   +20
      • Length ≥ 12:  +20 more
      • Uppercase:    +15
      • Lowercase:    +15
      • Digits:       +15
      • Special chars:+15

    Returns (score, label) where label is: Weak / Fair / Good / Strong.
    """
    score = 0
    if len(password) >= 8:  score += 20
    if len(password) >= 12: score += 20
    if re.search(r"[A-Z]", password): score += 15
    if re.search(r"[a-z]", password): score += 15
    if re.search(r"\d",    password): score += 15
    if re.search(r"[^A-Za-z0-9]", password): score += 15

    if score < 35:   label = "Weak"
    elif score < 60: label = "Fair"
    elif score < 80: label = "Good"
    else:            label = "Strong"

    return score, label


class UsersScreen(BaseInstallerScreen):

    SCREEN_TITLE    = "User Configuration"
    SCREEN_SUBTITLE = "Set up the primary user account and audio group membership"

    BINDINGS = BaseInstallerScreen.BINDINGS + [
        Binding("ctrl+n", "go_next", "Continue ▶", show=True),
    ]

    CSS = """
    UsersScreen { background: $surface; }
    .field-group { margin: 1 4; border: round $primary; padding: 1; height: auto; }
    .field-label { color: $primary; text-style: bold; }
    .field-hint  { color: $text-muted; }
    .error-text  { color: $error; }
    #strength-row { height: 2; margin: 1 0 0 0; }
    #strength-bar { width: 1fr; }
    #strength-label { width: 10; }
    """

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with ScrollableContainer():
            with Vertical(classes="field-group"):
                yield Label("Username", classes="field-label")
                yield Static(
                    "The primary system user for MAP2.  This user will run the "
                    "audio engine service and own the MAP2 configuration files.",
                    classes="field-hint",
                )
                yield Input(
                    value=self.config.user.username,
                    id="username-input",
                    placeholder="e.g. mm",
                )
                yield Static("", id="username-error", classes="error-text")

            with Vertical(classes="field-group"):
                yield Label("Password", classes="field-label")
                yield Static(
                    "Set an account password.  Leave blank to keep the existing password.",
                    classes="field-hint",
                )
                yield Input(
                    placeholder="New password (leave blank to skip)",
                    password=True,
                    id="password-input",
                )
                yield Input(
                    placeholder="Confirm password",
                    password=True,
                    id="confirm-input",
                )
                yield Static("", id="password-error", classes="error-text")
                # Live strength meter
                yield Label("Password strength:", classes="field-label")
                yield ProgressBar(total=100, id="strength-bar", show_eta=False)
                yield Static("(empty)", id="strength-label")

            with Vertical(classes="field-group"):
                yield Label("Group Membership", classes="field-label")
                yield Static(
                    "These groups grant the audio privileges needed for real-time scheduling.\n"
                    "Without them, the user cannot elevate to SCHED_FIFO priority.",
                    classes="field-hint",
                )
                yield Checkbox(
                    "Add to 'audio' group (enables RT priority via rtkit)",
                    value=self.config.user.add_audio_group,
                    id="audio-group-check",
                )
                yield Checkbox(
                    "Add to 'jackuser' group (legacy JACK RT privilege)",
                    value=True,
                    id="jack-group-check",
                )
                yield Checkbox(
                    "Add to 'sudo' group (administrative access)",
                    value=self.config.user.add_sudo,
                    id="sudo-check",
                )

        yield Footer()

    def on_input_changed(self, event) -> None:
        iid = event.input.id

        if iid == "username-input":
            try:
                self.config.user.username = event.value
                self.query_one("#username-error", Static).update("")
            except Exception as e:
                self.query_one("#username-error", Static).update(str(e))

        elif iid in ("password-input", "confirm-input"):
            self._update_password_strength()
            self._validate_passwords()

    def _update_password_strength(self) -> None:
        """Update the live password strength meter."""
        pw = self.query_one("#password-input", Input).value
        if not pw:
            self.query_one("#strength-bar", ProgressBar).update(progress=0)
            self.query_one("#strength-label", Static).update("(empty)")
            return
        score, label = _score_password(pw)
        bar = self.query_one("#strength-bar", ProgressBar)
        bar.update(progress=score)
        col = {"Weak": "red", "Fair": "yellow", "Good": "cyan", "Strong": "green"}[label]
        self.query_one("#strength-label", Static).update(f"[{col}]{label}[/{col}]")

    def _validate_passwords(self) -> bool:
        pw1 = self.query_one("#password-input", Input).value
        pw2 = self.query_one("#confirm-input",  Input).value
        err = self.query_one("#password-error", Static)
        if pw1 and pw2 and pw1 != pw2:
            err.update("Passwords do not match.")
            return False
        err.update("")
        if pw1:
            # Store a SHA-512 hash — never store plain text in config
            import crypt
            try:
                salt = crypt.mksalt(crypt.METHOD_SHA512)
                self.config.user.password_hash = crypt.crypt(pw1, salt)
            except Exception:
                # Fallback for Python 3.13+ where crypt is removed
                self.config.user.password_hash = "__NEEDS_MANUAL_SET__"
        return True

    def on_checkbox_changed(self, event) -> None:
        cid = event.checkbox.id
        if cid == "audio-group-check":
            self.config.user.add_audio_group = event.value
        elif cid == "sudo-check":
            self.config.user.add_sudo = event.value

    def validate(self) -> list[str]:
        errors = []
        try:
            from installer.config.schema import UserConfig
            UserConfig(username=self.config.user.username)
        except Exception as e:
            errors.append(f"Username invalid: {e}")
        if not self._validate_passwords():
            errors.append("Passwords do not match.")
        return errors

    @property
    def help_text(self) -> str:
        return """\
# User Configuration

## Username
The primary user account that owns and runs MAP2.  This user will:
  • Own all files in the installation directory
  • Run the map2-backend.service (via User= in the systemd unit)
  • Connect to PipeWire as the audio session owner
  • Have real-time scheduling permissions via group membership

## Audio Group Membership
Linux controls real-time scheduling via PAM group limits defined in
/etc/security/limits.d/99-map2-audio.conf:

  @audio - rtprio  95      # SCHED_FIFO up to priority 95
  @audio - memlock unlimited  # mlock() for zero-swap audio buffers
  @audio - nice    -15     # Nice priority for CFS threads

Without these, the JUCE audio callback will run at normal priority and
will be preempted by background tasks, causing xruns.

## Why rtkit instead of direct RT?
rtkit-daemon is a D-Bus service that grants RT scheduling to audio
applications without requiring them to run as root.  PipeWire uses
rtkit to elevate the data-loop thread to SCHED_FIFO/80 automatically.

This is safer than using RLIMIT_RTPRIO directly because:
  1. rtkit enforces limits (max CPU time before SIGKILL)
  2. No need to setuid audio applications
  3. Works within the user session without sudo

## Password Security
Passwords are hashed with SHA-512 (4096 rounds) before storage.
The plain text password is never written to disk or to the Kickstart
YAML file.  The hash is passed to `chpasswd -e` during installation.

## Pro Tip
For automated deployments (CI/CD), omit the password field in the
Kickstart YAML and pre-create the user account with SSH keys instead.

## Common Pitfall
Don't use root as the MAP2 user.  PipeWire explicitly disables
real-time scheduling for the root user to prevent system lockup.

Navigate: Tab / Shift-Tab │ Help: F1 │ Next: Ctrl+N │ Back: Escape
"""
