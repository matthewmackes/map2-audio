"""ControllerHostService — supervises the map2-controller-host binary.

Lifespan-friendly async service that:

1. Launches ``juce-engine/build/map2-controller-host`` as a child
   process at backend startup.
2. Manages a Unix-domain-socket connection at
   ``/run/map2/controller-host.sock`` for IPC.
3. Restarts the child on crash with exponential backoff.
4. Captures last-crash diagnostic to
   ``/var/lib/map2/controller-host/last-crash.log``.
5. Implements a restart-storm guard: after 5 crashes in 60 seconds,
   marks the service ``degraded`` and stops auto-restarting until an
   operator reset.

Hard contract: missing binary or repeated crash MUST NOT block backend
boot. The supervisor surfaces the failure via :meth:`status_payload`
which the GUI / `/api/health` consumes to display ``degraded``.

The actual ``map2-controller-host`` C++ binary lands in T2459-B2. Until
then the supervisor logs the missing binary and stays in
``waiting-for-binary`` mode — backend keeps booting normally.

Worklist: T2459-A6.
Architecture: docs/architecture/CONTROLLER_LAYER.md §3.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import signal
import time
from collections import deque
from collections.abc import Iterable
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


# Default paths — overridable via constructor for tests.
DEFAULT_BINARY_PATH = Path(__file__).resolve().parents[2] / "juce-engine" / "build" / "map2-controller-host"
DEFAULT_SOCKET_PATH = Path("/run/map2/controller-host.sock")
DEFAULT_CRASH_LOG_DIR = Path("/var/lib/map2/controller-host")
DEFAULT_CRASH_LOG_PATH = DEFAULT_CRASH_LOG_DIR / "last-crash.log"

# Restart-storm guard: ≤ MAX_CRASHES within WINDOW_SECONDS, then degrade.
MAX_CRASHES_IN_WINDOW = 5
CRASH_WINDOW_SECONDS = 60.0

# Exponential backoff: 0.5s → 1s → 2s → 4s → 8s, capped.
INITIAL_BACKOFF_SECONDS = 0.5
MAX_BACKOFF_SECONDS = 8.0

# CPU affinity — controller-host runs on cores 0-3 (off the isolated
# audio cores 4,5 per CLAUDE.md §5).
DEFAULT_CPU_AFFINITY: tuple[int, ...] = (0, 1, 2, 3)


class ControllerHostStatus:
    STOPPED = "stopped"             # supervisor not started yet
    WAITING_FOR_BINARY = "waiting-for-binary"   # binary doesn't exist
    STARTING = "starting"
    RUNNING = "running"
    RESTARTING = "restarting"
    DEGRADED = "degraded"           # crash storm; auto-restart suspended
    SHUTDOWN = "shutdown"


class ControllerHostService:
    """Supervises one ``map2-controller-host`` process.

    Designed to run inside the ``map2-backend`` async event loop. The
    public lifecycle is :meth:`start` / :meth:`stop`; the supervisor
    handles everything else (spawn, monitor, restart, crash log,
    storm guard).
    """

    def __init__(
        self,
        binary_path: Path | None = None,
        socket_path: Path | None = None,
        crash_log_path: Path | None = None,
        cpu_affinity: Iterable[int] | None = None,
        env_overrides: dict[str, str] | None = None,
        initial_backoff_seconds: float | None = None,
        max_backoff_seconds: float | None = None,
    ) -> None:
        self.binary_path = Path(binary_path or DEFAULT_BINARY_PATH)
        self.socket_path = Path(socket_path or DEFAULT_SOCKET_PATH)
        self.crash_log_path = Path(crash_log_path or DEFAULT_CRASH_LOG_PATH)
        self.cpu_affinity: tuple[int, ...] = tuple(
            cpu_affinity if cpu_affinity is not None else DEFAULT_CPU_AFFINITY
        )
        self.env_overrides: dict[str, str] = dict(env_overrides or {})
        self.initial_backoff_seconds: float = (
            initial_backoff_seconds
            if initial_backoff_seconds is not None
            else INITIAL_BACKOFF_SECONDS
        )
        self.max_backoff_seconds: float = (
            max_backoff_seconds
            if max_backoff_seconds is not None
            else MAX_BACKOFF_SECONDS
        )

        self._status: str = ControllerHostStatus.STOPPED
        self._process: asyncio.subprocess.Process | None = None
        self._supervisor_task: asyncio.Task[None] | None = None
        self._crash_times: deque[float] = deque(maxlen=MAX_CRASHES_IN_WINDOW + 1)
        self._restart_count: int = 0
        self._last_error: str | None = None
        self._stop_event = asyncio.Event()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the supervisor task. Returns immediately after the
        first launch attempt.

        If the binary doesn't exist, the supervisor enters
        ``WAITING_FOR_BINARY`` and the backend continues to boot.
        """
        if self._supervisor_task is not None and not self._supervisor_task.done():
            logger.debug("ControllerHostService.start: already running")
            return
        self._stop_event.clear()
        self._supervisor_task = asyncio.create_task(
            self._supervisor_loop(),
            name="ControllerHostService.supervisor",
        )
        logger.info("ControllerHostService: supervisor task started")

    async def stop(self) -> None:
        """Stop the supervisor and the child process gracefully."""
        self._stop_event.set()
        if self._process is not None and self._process.returncode is None:
            try:
                self._process.send_signal(signal.SIGTERM)
                try:
                    await asyncio.wait_for(self._process.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    logger.warning(
                        "ControllerHostService: child %s did not exit on "
                        "SIGTERM within 5s; sending SIGKILL.",
                        self._process.pid,
                    )
                    self._process.kill()
                    await self._process.wait()
            except ProcessLookupError:
                pass
        if self._supervisor_task is not None:
            try:
                await asyncio.wait_for(self._supervisor_task, timeout=5.0)
            except asyncio.TimeoutError:
                self._supervisor_task.cancel()
        self._status = ControllerHostStatus.SHUTDOWN
        logger.info("ControllerHostService: stopped")

    # ------------------------------------------------------------------
    # Status surface — consumed by /api/health and the GUI degraded card
    # ------------------------------------------------------------------

    @property
    def status(self) -> str:
        return self._status

    def status_payload(self) -> dict[str, Any]:
        return {
            "status": self._status,
            "binary_path": str(self.binary_path),
            "binary_exists": self.binary_path.exists(),
            "socket_path": str(self.socket_path),
            "pid": self._process.pid if self._process and self._process.returncode is None else None,
            "restart_count": self._restart_count,
            "crashes_in_window": len(self._crash_times),
            "last_error": self._last_error,
        }

    def reset_storm_guard(self) -> None:
        """Clear the crash-storm history and re-enable auto-restart.

        Called by the GUI's "Reset controller-host" button after an
        operator has fixed the underlying issue.
        """
        self._crash_times.clear()
        if self._status == ControllerHostStatus.DEGRADED:
            self._status = ControllerHostStatus.STOPPED
            logger.info(
                "ControllerHostService: storm guard reset; supervisor "
                "will retry on next iteration."
            )

    # ------------------------------------------------------------------
    # Supervisor loop
    # ------------------------------------------------------------------

    async def _supervisor_loop(self) -> None:
        backoff = self.initial_backoff_seconds
        try:
            while not self._stop_event.is_set():
                # 1. Pre-flight: does the binary exist?
                if not self.binary_path.exists():
                    self._status = ControllerHostStatus.WAITING_FOR_BINARY
                    self._last_error = (
                        f"Binary not found at {self.binary_path}. "
                        "Will be available after T2459-B2 ships the "
                        "map2-controller-host C++ build."
                    )
                    logger.info(
                        "ControllerHostService: binary missing (%s); "
                        "supervisor idle until T2459-B2 builds it.",
                        self.binary_path,
                    )
                    # Idle wait — re-check every 30s so a fresh build is
                    # picked up automatically.
                    try:
                        await asyncio.wait_for(self._stop_event.wait(), timeout=30.0)
                    except asyncio.TimeoutError:
                        continue
                    else:
                        return

                # 2. Storm guard.
                if self._is_in_crash_storm():
                    self._status = ControllerHostStatus.DEGRADED
                    self._last_error = (
                        f"Restart-storm guard tripped: {len(self._crash_times)} "
                        f"crashes in last {CRASH_WINDOW_SECONDS}s. "
                        "Auto-restart suspended; reset via GUI to retry."
                    )
                    logger.error(self._last_error)
                    # Wait until either stop or storm-guard reset clears
                    # the crash list.
                    while (not self._stop_event.is_set()
                           and self._status == ControllerHostStatus.DEGRADED):
                        try:
                            await asyncio.wait_for(self._stop_event.wait(), timeout=2.0)
                        except asyncio.TimeoutError:
                            pass
                    if self._stop_event.is_set():
                        return
                    backoff = self.initial_backoff_seconds
                    continue

                # 3. Spawn.
                self._status = ControllerHostStatus.STARTING
                exit_code, stderr_tail = await self._spawn_and_wait()

                if self._stop_event.is_set():
                    return

                # 4. Crash → log + backoff + retry.
                self._record_crash(exit_code, stderr_tail)
                self._status = ControllerHostStatus.RESTARTING
                self._restart_count += 1
                logger.warning(
                    "ControllerHostService: child exited with code=%s; "
                    "backing off %.1fs before restart.",
                    exit_code, backoff,
                )
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=backoff)
                except asyncio.TimeoutError:
                    pass
                else:
                    return
                backoff = min(backoff * 2.0, self.max_backoff_seconds)
        except asyncio.CancelledError:
            logger.info("ControllerHostService: supervisor cancelled")
            raise
        except Exception as exc:  # pragma: no cover — defensive
            logger.error(
                "ControllerHostService: supervisor loop crashed: %s. "
                "Backend continues without controller-host.", exc,
            )
            self._status = ControllerHostStatus.DEGRADED
            self._last_error = f"Supervisor loop crashed: {exc}"

    async def _spawn_and_wait(self) -> tuple[int, str]:
        """Spawn the child + wait for it to exit. Returns
        ``(exit_code, last_stderr_lines)``.
        """
        env = dict(os.environ)
        env.update(self.env_overrides)

        # taskset to pin CPU affinity — keep controller-host off cores 4,5.
        cmd: list[str] = []
        taskset = shutil.which("taskset")
        if taskset and self.cpu_affinity:
            mask = ",".join(str(c) for c in self.cpu_affinity)
            cmd += [taskset, "-c", mask]
        cmd += [str(self.binary_path), "--socket", str(self.socket_path)]

        try:
            self.socket_path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            self._last_error = f"Cannot create socket dir {self.socket_path.parent}: {exc}"
            logger.error(self._last_error)
            return -1, ""

        try:
            self._process = await asyncio.create_subprocess_exec(
                *cmd,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except (FileNotFoundError, PermissionError, OSError) as exc:
            self._last_error = f"Failed to spawn {cmd}: {exc}"
            logger.error(self._last_error)
            return -1, ""

        self._status = ControllerHostStatus.RUNNING
        logger.info(
            "ControllerHostService: spawned pid=%d cmd=%s",
            self._process.pid, " ".join(cmd),
        )

        # Drain stdout to log + remember last stderr lines for crash dump.
        stdout_task = asyncio.create_task(
            self._drain_stream(self._process.stdout, prefix="stdout")
        )
        stderr_lines: list[str] = []
        stderr_task = asyncio.create_task(
            self._drain_stream(self._process.stderr, prefix="stderr",
                                tail=stderr_lines)
        )

        exit_code = await self._process.wait()
        await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)
        return exit_code, "\n".join(stderr_lines[-50:])

    async def _drain_stream(
        self,
        stream: asyncio.StreamReader | None,
        prefix: str,
        tail: list[str] | None = None,
    ) -> None:
        if stream is None:
            return
        while True:
            try:
                line = await stream.readline()
            except (ValueError, asyncio.IncompleteReadError):
                break
            if not line:
                break
            text = line.decode(errors="replace").rstrip()
            logger.debug("controller-host[%s]: %s", prefix, text)
            if tail is not None:
                tail.append(text)
                if len(tail) > 500:
                    del tail[: len(tail) - 200]

    def _record_crash(self, exit_code: int, stderr_tail: str) -> None:
        now = time.monotonic()
        self._crash_times.append(now)

        # Persist last-crash diagnostic. Best-effort — failures here
        # must not raise.
        try:
            self.crash_log_path.parent.mkdir(parents=True, exist_ok=True)
            self.crash_log_path.write_text(
                f"timestamp_monotonic_s: {now}\n"
                f"exit_code: {exit_code}\n"
                f"binary: {self.binary_path}\n"
                f"restart_count: {self._restart_count}\n"
                f"--- stderr tail ---\n{stderr_tail}\n",
                encoding="utf-8",
            )
        except OSError as exc:
            logger.warning(
                "ControllerHostService: could not write crash log to %s: %s",
                self.crash_log_path, exc,
            )

    def _is_in_crash_storm(self) -> bool:
        if len(self._crash_times) < MAX_CRASHES_IN_WINDOW:
            return False
        # Count crashes in the last CRASH_WINDOW_SECONDS.
        now = time.monotonic()
        recent = sum(1 for t in self._crash_times if now - t <= CRASH_WINDOW_SECONDS)
        return recent >= MAX_CRASHES_IN_WINDOW


# ---------------------------------------------------------------------------
# Module-level singleton helper for app.main lifespan integration.
# ---------------------------------------------------------------------------

_service_singleton: ControllerHostService | None = None


def get_controller_host_service() -> ControllerHostService:
    global _service_singleton
    if _service_singleton is None:
        _service_singleton = ControllerHostService()
    return _service_singleton


def reset_controller_host_service_for_tests() -> None:
    global _service_singleton
    _service_singleton = None
