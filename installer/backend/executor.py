"""
installer/backend/executor.py
==============================
Safe, dry-run-aware subprocess wrapper — the foundation of all backend drivers.

Anaconda analogy:
  Anaconda uses an 'execWithCapture' abstraction throughout its backend so that
  every command goes through one path: logging, error handling, and dry-run
  awareness all live in one place.  We do the same with CommandExecutor.

Design principles:
  1. DRY-RUN FIRST: If dry_run=True, we print/log the command but never execute
     it.  Every backend driver checks the executor's dry_run flag; nothing
     except explicit file reads ever touches the system in dry-run mode.

  2. SHLEX SAFETY: All commands are built with shlex.split() or passed as
     argument lists, never with shell=True string interpolation.  This prevents
     shell injection vulnerabilities — a critical constraint for an installer
     that runs as root.

  3. STRUCTURED LOGGING: Every command, its exit code, stdout, and stderr are
     logged to the installer log file.  This gives operators a full audit trail.

  4. RETRY: Optional automatic retry with exponential backoff for transient
     failures (e.g., network timeouts during dnf install).

  5. CALLBACK: Optional progress callback so the TUI can update a live log
     widget while a long command runs.
"""

from __future__ import annotations

import logging
import shlex
import subprocess
import time
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Union

logger = logging.getLogger("installer.executor")


@dataclass
class CommandResult:
    """
    Structured result from a command execution.

    Attributes:
        returncode: Exit code (0 = success; non-zero = failure).
        stdout:     Captured standard output (stripped).
        stderr:     Captured standard error (stripped).
        dry_run:    True if the command was simulated, not actually run.
        command:    The command as a list of strings (for display/logging).
        duration_s: Wall-clock time in seconds the command took.
    """
    returncode: int
    stdout:     str
    stderr:     str
    dry_run:    bool
    command:    List[str]
    duration_s: float = 0.0

    @property
    def ok(self) -> bool:
        """True if the command succeeded (returncode == 0)."""
        return self.returncode == 0

    @property
    def command_str(self) -> str:
        """Shell-quoted representation for display."""
        return " ".join(shlex.quote(a) for a in self.command)

    def __str__(self) -> str:
        status = "DRY-RUN" if self.dry_run else f"rc={self.returncode}"
        return f"[{status}] {self.command_str}"


class ExecutorError(Exception):
    """Raised when a command fails and check=True."""
    def __init__(self, message: str, result: CommandResult):
        super().__init__(message)
        self.result = result


class CommandExecutor:
    """
    Central command-execution engine for the MAP2 installer.

    All backend drivers hold a reference to one shared CommandExecutor instance.
    Dry-run mode, logging, and retry logic are configured once here.

    Usage:
        executor = CommandExecutor(dry_run=True)
        result   = executor.run(["dnf", "install", "-y", "pipewire"])
        if not result.ok:
            raise ExecutorError("dnf failed", result)
    """

    def __init__(
        self,
        dry_run:  bool = False,
        log_file: Optional[str] = None,
        progress_cb: Optional[Callable[[str], None]] = None,
    ):
        """
        Args:
            dry_run:     If True, commands are logged but never executed.
            log_file:    Path to append all command output (installer log).
            progress_cb: Called with each line of output for live TUI display.
        """
        self.dry_run     = dry_run
        self.progress_cb = progress_cb
        self._log_file   = log_file

        if log_file:
            # File handler for the installer log — separate from Python logging
            self._log_fh = open(log_file, "a", buffering=1)  # line-buffered
        else:
            self._log_fh = None

    def run(
        self,
        cmd: Union[str, List[str]],
        *,
        cwd:      Optional[str] = None,
        env:      Optional[dict] = None,
        check:    bool = False,
        timeout:  Optional[int] = None,
        retries:  int = 0,
        retry_delay: float = 2.0,
        input:    Optional[str] = None,
        capture:  bool = True,
    ) -> CommandResult:
        """
        Execute a command safely.

        Args:
            cmd:         Command as a list (preferred) or shell string (split with shlex).
            cwd:         Working directory.
            env:         Environment variables (merged with current env if partial).
            check:       Raise ExecutorError on non-zero exit code.
            timeout:     Seconds before killing the process (None = no limit).
            retries:     Number of automatic retries on failure.
            retry_delay: Seconds between retries (doubles each attempt).
            input:       String to pipe to stdin.
            capture:     If True, capture stdout/stderr.  If False, stream to terminal.

        Returns:
            CommandResult with exit code, stdout, stderr, and timing.
        """
        # Normalise to list for safety and display
        if isinstance(cmd, str):
            cmd_list = shlex.split(cmd)
        else:
            cmd_list = list(cmd)

        self._log(f"$ {' '.join(shlex.quote(a) for a in cmd_list)}")

        # ── DRY-RUN: never execute, just pretend ─────────────────────────────
        if self.dry_run:
            msg = f"[DRY-RUN] Would run: {' '.join(shlex.quote(a) for a in cmd_list)}"
            self._log(msg)
            if self.progress_cb:
                self.progress_cb(msg)
            return CommandResult(
                returncode=0,
                stdout="(dry-run — not executed)",
                stderr="",
                dry_run=True,
                command=cmd_list,
            )

        # ── LIVE EXECUTION with retry ─────────────────────────────────────────
        attempt  = 0
        delay    = retry_delay
        last_result: Optional[CommandResult] = None

        while attempt <= retries:
            if attempt > 0:
                self._log(f"  Retry {attempt}/{retries} after {delay:.1f}s …")
                time.sleep(delay)
                delay *= 2  # Exponential backoff

            t0     = time.monotonic()
            result = self._execute_once(cmd_list, cwd=cwd, env=env, timeout=timeout,
                                        input=input, capture=capture)
            result.duration_s = time.monotonic() - t0
            last_result = result

            self._log(
                f"  → rc={result.returncode} in {result.duration_s:.2f}s\n"
                f"  stdout: {result.stdout[:200]}\n"
                f"  stderr: {result.stderr[:200]}"
            )

            if result.ok or attempt >= retries:
                break
            attempt += 1

        if check and not last_result.ok:
            raise ExecutorError(
                f"Command failed (rc={last_result.returncode}): {last_result.command_str}",
                last_result,
            )
        return last_result

    def _execute_once(
        self,
        cmd_list:  List[str],
        cwd:       Optional[str],
        env:       Optional[dict],
        timeout:   Optional[int],
        input:     Optional[str],
        capture:   bool,
    ) -> CommandResult:
        """Single-attempt execution of `cmd_list`."""
        try:
            proc = subprocess.Popen(
                cmd_list,
                cwd=cwd,
                env=env,
                stdin=subprocess.PIPE  if input   else None,
                stdout=subprocess.PIPE if capture else None,
                stderr=subprocess.PIPE if capture else None,
                text=True,
            )

            if capture:
                # Stream output line-by-line so progress_cb gets live updates
                stdout_lines: List[str] = []
                stderr_lines: List[str] = []

                # Read stdout + stderr concurrently using threads would be ideal
                # for long-running commands; for simplicity we use communicate()
                # which buffers everything.  Future: replace with asyncio streams.
                try:
                    out, err = proc.communicate(input=input, timeout=timeout)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    out, err = proc.communicate()
                    return CommandResult(
                        returncode=124,  # Standard timeout exit code
                        stdout=out or "",
                        stderr=f"TIMEOUT after {timeout}s\n{err or ''}",
                        dry_run=False,
                        command=cmd_list,
                    )

                if out and self.progress_cb:
                    for line in out.splitlines():
                        self.progress_cb(line)
                        if self._log_fh:
                            self._log_fh.write(line + "\n")

                return CommandResult(
                    returncode=proc.returncode,
                    stdout=(out or "").strip(),
                    stderr=(err or "").strip(),
                    dry_run=False,
                    command=cmd_list,
                )
            else:
                # No capture — output goes straight to the terminal
                try:
                    proc.wait(timeout=timeout)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
                return CommandResult(
                    returncode=proc.returncode,
                    stdout="",
                    stderr="",
                    dry_run=False,
                    command=cmd_list,
                )
        except FileNotFoundError:
            return CommandResult(
                returncode=127,  # POSIX "command not found"
                stdout="",
                stderr=f"Command not found: {cmd_list[0]}",
                dry_run=False,
                command=cmd_list,
            )

    def _log(self, message: str) -> None:
        """Write to both the Python logger and the installer log file."""
        logger.debug(message)
        if self._log_fh:
            self._log_fh.write(message + "\n")
            self._log_fh.flush()

    def close(self) -> None:
        """Close the log file handle."""
        if self._log_fh:
            self._log_fh.close()
            self._log_fh = None

    def __del__(self):
        self.close()
