"""
installer/ui/screens/storage.py
================================
Stage 03 — Storage and Path Configuration.

Anaconda analogy:
  Like Anaconda's Storage spoke (which validates mount points, checks for
  existing data, and simulates the partition layout before formatting),
  this screen validates all path choices and shows live disk space meters
  so the user can see whether the build will fit before any writes occur.

Educational note on disk space:
  The MAP2 build requires significant disk space due to:
  • JUCE 8.0.0 FetchContent download (~500 MB)
  • C++ build artifacts (~2 GB with debug symbols)
  • Node.js dependencies (~500 MB in node_modules)
  • LV2 plugin binaries (~200 MB)
  Total: ~3-5 GB for a full build.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import ScrollableContainer, Vertical
from textual.widgets import Footer, Header, Input, Label, ProgressBar, Static, Rule

from installer.ui.screens._base import BaseInstallerScreen

# Minimum recommended free space in GB per path
MIN_FREE_GB = {
    "install": 10.0,  # Repo + build artifacts
    "venv":     2.0,  # Python venv + packages
    "log":      1.0,  # Log files
}


class StorageScreen(BaseInstallerScreen):

    SCREEN_TITLE    = "Storage & Paths"
    SCREEN_SUBTITLE = "Configure installation directories and verify disk space"

    BINDINGS = BaseInstallerScreen.BINDINGS + [
        Binding("ctrl+n", "go_next", "Continue ▶", show=True),
    ]

    CSS = """
    StorageScreen { background: $surface; }
    .field-group {
        margin: 1 4;
        border: round $primary;
        padding: 1;
        height: auto;
    }
    .field-label { color: $primary; text-style: bold; }
    .field-hint  { color: $text-muted; }
    .error-text  { color: $error; }
    .space-row   { height: 2; margin: 0 0 1 0; }
    .space-label { width: 20; }
    .space-bar   { width: 1fr; }
    .space-info  { width: 20; text-align: right; }
    """

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with ScrollableContainer():
            with Vertical(classes="field-group"):
                yield Label("Installation Directory", classes="field-label")
                yield Static(
                    "Root directory for the MAP2 repository and build artifacts.\n"
                    "Must have ≥10 GB free.  Existing installations are preserved.",
                    classes="field-hint",
                )
                yield Input(
                    value=str(self.config.storage.install_dir),
                    id="install-input",
                )
                yield Static("", id="install-error", classes="error-text")
                yield self._make_space_bar("install")

            with Vertical(classes="field-group"):
                yield Label("Python Virtual Environment", classes="field-label")
                yield Static(
                    "Directory for the Python venv.  Must have ≥2 GB free.\n"
                    "Usually inside the install directory.",
                    classes="field-hint",
                )
                yield Input(
                    value=str(self.config.storage.venv_dir),
                    id="venv-input",
                )
                yield Static("", id="venv-error", classes="error-text")
                yield self._make_space_bar("venv")

            with Vertical(classes="field-group"):
                yield Label("Log Directory", classes="field-label")
                yield Static(
                    "Runtime logs.  /var/log/map2 is standard; requires root.",
                    classes="field-hint",
                )
                yield Input(
                    value=str(self.config.storage.log_dir),
                    id="log-input",
                )
                yield Static("", id="log-error", classes="error-text")

        yield Footer()

    def _make_space_bar(self, key: str) -> Vertical:
        """Create a live disk-space progress widget for the given path key."""
        return Vertical(
            Static("Disk space:", classes="space-label"),
            ProgressBar(total=100, id=f"space-bar-{key}", show_eta=False),
            Static("checking…", id=f"space-info-{key}"),
            classes="space-row",
        )

    def on_mount(self) -> None:
        super().on_mount()
        # Initial space check
        self._refresh_all_space_bars()

    def on_input_changed(self, event: Input.Changed) -> None:
        """Validate path and refresh disk space meter on every keystroke."""
        field_map = {
            "install-input": ("install_dir", "install"),
            "venv-input":    ("venv_dir",    "venv"),
            "log-input":     ("log_dir",     "log"),
        }
        if event.input.id in field_map:
            attr, key = field_map[event.input.id]
            try:
                p = Path(event.value)
                setattr(self.config.storage, attr, p)
                self._refresh_space_bar(key, p)
                self.query_one(f"#{event.input.id.replace('-input', '-error')}", Static).update("")
            except Exception as e:
                self.query_one(f"#{event.input.id.replace('-input', '-error')}", Static).update(str(e))

    def _refresh_all_space_bars(self) -> None:
        self._refresh_space_bar("install", self.config.storage.install_dir)
        self._refresh_space_bar("venv",    self.config.storage.venv_dir)
        self._refresh_space_bar("log",     self.config.storage.log_dir)

    def _refresh_space_bar(self, key: str, path: Path) -> None:
        """Update the progress bar and text for the nearest existing parent."""
        # Find the nearest existing ancestor to get disk usage
        check_path = path
        for _ in range(10):  # Max 10 levels up
            if check_path.exists():
                break
            check_path = check_path.parent

        try:
            usage  = shutil.disk_usage(check_path)
            free_gb  = usage.free  / 1e9
            total_gb = usage.total / 1e9
            used_pct = int((usage.used / usage.total) * 100)
            min_gb   = MIN_FREE_GB.get(key, 1.0)
            ok       = free_gb >= min_gb
            color    = "green" if ok else "red"

            bar  = self.query_one(f"#space-bar-{key}", ProgressBar)
            info = self.query_one(f"#space-info-{key}", Static)
            bar.advance(used_pct - (bar.progress or 0))
            info.update(
                f"[{color}]{free_gb:.1f} GB free[/{color}] of {total_gb:.1f} GB"
                + (f" (need {min_gb:.0f} GB)" if not ok else "")
            )
        except Exception:
            pass  # Path doesn't exist yet — ignore

    def validate(self) -> list[str]:
        errors = []
        for attr, key, label in [
            ("install_dir", "install", "Installation directory"),
            ("venv_dir",    "venv",    "Python venv directory"),
        ]:
            path = getattr(self.config.storage, attr)
            check_path = path
            for _ in range(10):
                if check_path.exists():
                    break
                check_path = check_path.parent
            try:
                usage  = shutil.disk_usage(check_path)
                free_gb = usage.free / 1e9
                if free_gb < MIN_FREE_GB.get(key, 1.0):
                    errors.append(
                        f"{label}: only {free_gb:.1f} GB free, "
                        f"need {MIN_FREE_GB[key]:.0f} GB."
                    )
            except Exception as e:
                errors.append(f"{label}: cannot check disk space — {e}")
        return errors

    @property
    def help_text(self) -> str:
        return """\
# Storage & Paths

## Installation Directory
The root of the MAP2 codebase and all build artifacts.  Default:
  /home/mm/map2-audio

What lives here after installation:
  • app/        — Python FastAPI backend
  • juce-engine/build/  — Compiled C++ audio engine (~2 GB)
  • node_modules/       — React frontend dependencies (~500 MB)
  • .venv/              — Python virtual environment

## Disk Space Requirements
  Component               Minimum     Recommended
  ─────────────────────── ─────────── ───────────
  JUCE download + build   3 GB        5 GB
  Node.js frontend        0.5 GB      1 GB
  Python venv             0.3 GB      0.5 GB
  LV2 plugins             0.2 GB      0.5 GB
  Log files               0.1 GB      1 GB
  ─────────────────────── ─────────── ───────────
  Total                   4 GB        8 GB

## Python Virtual Environment
A Python venv isolates MAP2's dependencies from the system Python.
This is enterprise best practice — it means `pip install` changes
inside the venv cannot affect system Python packages or other projects.

Anaconda analogy: Similar to how Anaconda installs packages into the
target system root rather than the installer's own Python environment.

## Pro Tip
Use an SSD for the install directory.  The JUCE build process performs
millions of small file reads and writes.  An HDD can make the build
take 10x longer than an NVMe SSD.

## Common Pitfall
Don't use a network filesystem (NFS, SMB) for the install directory
during the build phase.  File locking and latency will cause CMake
to fail intermittently.

Navigate: Tab / Shift-Tab │ Help: F1 │ Next: Ctrl+N │ Back: Escape
"""
