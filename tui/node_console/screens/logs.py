"""
Logs screen.

Live-tailing of systemd journal for MAP2-related units with
filter controls (severity, unit).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import Label, RichLog, Select, Static, Input

logger = logging.getLogger(__name__)

# Journal units we can tail
_UNITS = [
    ("All MAP2", "map2-*"),
    ("Backend", "map2-backend"),
    ("Pipewire", "pipewire"),
    ("WirePlumber", "wireplumber"),
    ("System", ""),
]

_PRIORITIES = [
    ("All", ""),
    ("Error+", "-p err"),
    ("Warning+", "-p warning"),
    ("Info+", "-p info"),
    ("Debug", "-p debug"),
]


class LogsPane(Static):
    """Live log viewer tab content."""

    _tail_task: Optional[asyncio.Task] = None
    _current_unit: str = "map2-*"
    _current_priority: str = ""
    _running: bool = False

    def compose(self) -> ComposeResult:
        # ── Filter bar ───────────────────────────────────────────────
        with Horizontal(classes="filter-bar"):
            yield Label("Unit: ", id="log-unit-label")
            yield Select(
                [(label, val) for label, val in _UNITS],
                id="log-unit-select",
                value="map2-*",
            )
            yield Label("  Level: ", id="log-level-label")
            yield Select(
                [(label, val) for label, val in _PRIORITIES],
                id="log-level-select",
                value="",
            )

        # ── Log output ───────────────────────────────────────────────
        yield RichLog(
            id="log-output",
            highlight=True,
            markup=True,
            wrap=True,
            max_lines=2000,
        )

    def on_mount(self) -> None:
        self._start_tail()

    def on_select_changed(self, event: Select.Changed) -> None:
        if event.select.id == "log-unit-select":
            self._current_unit = str(event.value) if event.value is not None else "map2-*"
            self._restart_tail()
        elif event.select.id == "log-level-select":
            self._current_priority = str(event.value) if event.value is not None else ""
            self._restart_tail()

    def _restart_tail(self) -> None:
        self._stop_tail()
        log_w = self.query_one("#log-output", RichLog)
        log_w.clear()
        log_w.write("[dim]Restarting log stream…[/dim]")
        self._start_tail()

    def _start_tail(self) -> None:
        self._running = True
        self._tail_task = asyncio.create_task(self._tail_journal())

    def _stop_tail(self) -> None:
        self._running = False
        if self._tail_task and not self._tail_task.done():
            self._tail_task.cancel()
        self._tail_task = None

    async def _tail_journal(self) -> None:
        """Tail journalctl in the background, writing lines to RichLog."""
        log_w = self.query_one("#log-output", RichLog)

        cmd = ["journalctl", "--no-pager", "-f", "-n", "80", "--output=short-iso"]
        if self._current_unit:
            cmd.extend(["--unit", self._current_unit])
        if self._current_priority:
            cmd.extend(self._current_priority.split())

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            assert proc.stdout is not None
            while self._running:
                try:
                    line = await asyncio.wait_for(proc.stdout.readline(), timeout=5.0)
                except asyncio.TimeoutError:
                    continue
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").rstrip()
                # Color-code by severity keywords
                if any(kw in decoded.lower() for kw in ("error", "fail", "critical")):
                    log_w.write(f"[red]{decoded}[/red]")
                elif "warning" in decoded.lower():
                    log_w.write(f"[yellow]{decoded}[/yellow]")
                else:
                    log_w.write(decoded)
        except asyncio.CancelledError:
            pass
        except FileNotFoundError:
            log_w.write("[red]journalctl not found — logs unavailable.[/red]")
        except Exception as exc:
            log_w.write(f"[red]Log error: {exc}[/red]")

    def on_unmount(self) -> None:
        self._stop_tail()

    def refresh_snapshot(self, snap) -> None:
        """Logs pane doesn't need snapshot refresh — it's live-tailed."""
        pass
