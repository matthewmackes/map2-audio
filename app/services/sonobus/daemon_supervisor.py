"""SonoBus daemon supervisor.

Supervises the ``map2-sonobus-transport`` binary the same way
``ControllerHostService`` supervises ``map2-controller-host``:

1. At backend startup, attempt to **connect** to a running daemon. Two
   deployment models are supported:

     (a) **systemd-managed** (production): the daemon is started by
         ``map2-sonobus-transport.service``; the supervisor only attaches
         to its UDS. No subprocess spawning.

     (b) **supervised** (dev / fallback): if no daemon is reachable AND
         the binary exists at ``/opt/map2-audio/juce-engine/build/
         map2-sonobus-transport``, the supervisor spawns it as a child
         and restarts on crash. Used when systemd isn't managing audio
         services (e.g. dev host without the unit installed yet).

2. Periodic liveness ping. If the daemon stops responding, the
   supervisor disconnects + reconnects (or restarts the subprocess in
   supervised mode).

3. Capability snapshot from ``hello`` is surfaced via
   :meth:`status_payload` so the GUI shows ``stub_mode`` /
   ``full_mode`` without re-pinging.

4. Storm guard: ≤ MAX_CRASHES in WINDOW_SECONDS, then mark ``degraded``
   and stop auto-restart until the operator runs
   :meth:`reset_storm_guard`.

The supervisor does NOT block backend boot: missing binary, daemon
crash, AOO stub mode — all keep the backend running. ``status_payload``
surfaces every failure mode the GUI needs.

Worklist: T2521-4 cycle 5.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import time
from collections import deque
from collections.abc import Iterable
from pathlib import Path
from typing import Any, Optional

from .daemon_client import (
    DEFAULT_SOCKET_PATH,
    DaemonCapabilities,
    DaemonClientError,
    DaemonHandshakeError,
    DaemonNotConnected,
    SonoBusDaemonClient,
)

logger = logging.getLogger(__name__)


# Default binary path. Production install lands here per packaging/rpm/
# map2.spec (T2529-A2). Dev hosts point MAP2_APP_INSTALL_DIR elsewhere;
# Map2Paths.sonobus_transport_binary_path() resolves correctly in both.
DEFAULT_BINARY_PATH = Path("/opt/map2-audio/juce-engine/build/map2-sonobus-transport")

# Liveness ping interval. The daemon's poll loop is 50ms so 2s gives
# plenty of headroom and produces sparse logs.
DEFAULT_PING_INTERVAL_SECONDS = 2.0

# Storm-guard parameters (mirrors controller-host).
MAX_CRASHES_IN_WINDOW = 5
CRASH_WINDOW_SECONDS = 60.0

# Backoff between reconnect attempts when the daemon is unreachable.
INITIAL_BACKOFF_SECONDS = 0.5
MAX_BACKOFF_SECONDS = 8.0

# CPU affinity — same as the controller-host (cores 0-3, off the
# isolated audio cores 4-5). Used only in supervised mode.
DEFAULT_CPU_AFFINITY: tuple[int, ...] = (0, 1, 2, 3)


class SonoBusDaemonStatus:
    """Canonical status strings the GUI / `/api/sonobus/status` matches on."""

    STOPPED = "stopped"
    WAITING_FOR_BINARY = "waiting-for-binary"
    WAITING_FOR_DAEMON = "waiting-for-daemon"  # binary exists but no UDS reachable
    CONNECTING = "connecting"
    RUNNING = "running"
    RECONNECTING = "reconnecting"
    DEGRADED = "degraded"
    SHUTDOWN = "shutdown"


class SonoBusDaemonSupervisor:
    """Owns the lifecycle of one ``map2-sonobus-transport`` instance.

    Designed to live inside the ``map2-backend`` async event loop. The
    public lifecycle is :meth:`start` / :meth:`stop`; the supervisor
    handles connect, ping, reconnect, optional subprocess spawn.
    """

    def __init__(
        self,
        binary_path: Path | None = None,
        socket_path: Path | None = None,
        cpu_affinity: Iterable[int] | None = None,
        env_overrides: dict[str, str] | None = None,
        ping_interval_seconds: float | None = None,
        initial_backoff_seconds: float | None = None,
        max_backoff_seconds: float | None = None,
        spawn_subprocess: bool = False,
        client: SonoBusDaemonClient | None = None,
        event_buffer_size: int = 512,
    ) -> None:
        self.binary_path = Path(binary_path or DEFAULT_BINARY_PATH)
        self.socket_path = Path(socket_path or DEFAULT_SOCKET_PATH)
        self.cpu_affinity: tuple[int, ...] = tuple(
            cpu_affinity if cpu_affinity is not None else DEFAULT_CPU_AFFINITY
        )
        self.env_overrides: dict[str, str] = dict(env_overrides or {})
        self.ping_interval_seconds: float = (
            ping_interval_seconds
            if ping_interval_seconds is not None
            else DEFAULT_PING_INTERVAL_SECONDS
        )
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
        self.spawn_subprocess = spawn_subprocess
        # Allow injecting a mock client for tests.
        self._client: SonoBusDaemonClient = client or SonoBusDaemonClient(
            socket_path=self.socket_path
        )

        self._status: str = SonoBusDaemonStatus.STOPPED
        self._capabilities: Optional[DaemonCapabilities] = None
        self._process: Optional[asyncio.subprocess.Process] = None
        self._supervisor_task: Optional[asyncio.Task[None]] = None
        self._event_relay_task: Optional[asyncio.Task[None]] = None
        self._stop_event = asyncio.Event()
        self._crash_times: deque[float] = deque(maxlen=MAX_CRASHES_IN_WINDOW + 1)
        self._restart_count: int = 0
        self._last_error: Optional[str] = None
        self._connected_at: Optional[float] = None

        # Cycle 7 — daemon event handling.
        # Cache of the latest per-stream metrics (keyed by stream_id).
        # Updated as `metrics_snapshot` events stream in from the daemon;
        # the /api/sonobus/diagnostics route reads from here.
        self._latest_metrics: dict[str, dict[str, Any]] = {}
        self._latest_metrics_taken_at_ms: Optional[int] = None
        # Bounded buffer of recent events for late-joining WS subscribers.
        self._event_buffer: deque[dict[str, Any]] = deque(maxlen=event_buffer_size)
        # Active WS-relay subscriptions. Each subscriber gets its own
        # asyncio.Queue so a slow consumer can't backpressure the others.
        self._event_subscribers: list[asyncio.Queue[dict[str, Any]]] = []

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        if self._supervisor_task is not None and not self._supervisor_task.done():
            return
        self._stop_event.clear()
        self._supervisor_task = asyncio.create_task(self._supervisor_loop())
        logger.info("SonoBusDaemonSupervisor: started")

    async def stop(self, timeout: float = 5.0) -> None:
        self._stop_event.set()
        # Disconnect the client first so the supervisor's ping loop unblocks.
        try:
            await self._client.disconnect()
        except Exception:
            logger.exception("SonoBusDaemonSupervisor: client disconnect failed")

        if self._event_relay_task is not None and not self._event_relay_task.done():
            self._event_relay_task.cancel()
            try:
                await self._event_relay_task
            except (asyncio.CancelledError, Exception):
                pass
        self._event_relay_task = None

        if self._supervisor_task is not None:
            try:
                await asyncio.wait_for(self._supervisor_task, timeout=timeout)
            except asyncio.TimeoutError:
                self._supervisor_task.cancel()
        self._supervisor_task = None

        # Reap the subprocess if we spawned it.
        if self._process is not None and self._process.returncode is None:
            try:
                self._process.terminate()
                await asyncio.wait_for(self._process.wait(), timeout=3.0)
            except asyncio.TimeoutError:
                self._process.kill()
                await self._process.wait()
            except ProcessLookupError:
                pass
        self._process = None
        self._status = SonoBusDaemonStatus.SHUTDOWN
        logger.info("SonoBusDaemonSupervisor: stopped")

    # ------------------------------------------------------------------
    # Status surface — consumed by /api/sonobus/status + GUI
    # ------------------------------------------------------------------

    @property
    def status(self) -> str:
        return self._status

    @property
    def client(self) -> SonoBusDaemonClient:
        """Expose the underlying client so binding-authority code can
        send commands directly. Callers must check is_connected first."""
        return self._client

    @property
    def is_connected(self) -> bool:
        return self._client.is_connected

    def status_payload(self) -> dict[str, Any]:
        caps = self._capabilities or self._client.capabilities
        return {
            "status": self._status,
            "binary_path": str(self.binary_path),
            "binary_exists": self.binary_path.exists(),
            "socket_path": str(self.socket_path),
            "socket_exists": self.socket_path.exists(),
            "connected": self._client.is_connected,
            "spawned_subprocess": self.spawn_subprocess,
            "subprocess_pid": (
                self._process.pid
                if self._process is not None and self._process.returncode is None
                else None
            ),
            "connected_at": self._connected_at,
            "uptime_seconds": (
                time.monotonic() - self._connected_at
                if self._connected_at is not None
                else None
            ),
            "restart_count": self._restart_count,
            "crashes_in_window": len(self._crash_times),
            "last_error": self._last_error,
            "capabilities": caps.as_dict() if caps is not None else None,
        }

    def reset_storm_guard(self) -> None:
        """Clear the crash-storm history. Called by the GUI's "Reset"
        button after the operator fixed the underlying issue."""
        self._crash_times.clear()
        if self._status == SonoBusDaemonStatus.DEGRADED:
            self._status = SonoBusDaemonStatus.STOPPED
            logger.info("SonoBusDaemonSupervisor: storm guard reset")

    # ------------------------------------------------------------------
    # Cycle 7 — daemon event/metrics surface
    # ------------------------------------------------------------------

    def latest_metrics(self) -> dict[str, Any]:
        """Snapshot of the most recent metrics_snapshot event keyed by
        stream_id. The /api/sonobus/diagnostics route consumes this.

        Returns:
            {
              "streams": {stream_id: {rtt_ms, loss_pct, jitter_ms,
                                       resend_count, observed_latency_ms,
                                       last_update_unix_ms}},
              "taken_at_unix_ms": <int or None>,
              "fresh": <bool>,
            }
        Fresh=True iff a snapshot has been received in the last 30s.
        """
        # Take a shallow copy so the caller can iterate without lock.
        streams = dict(self._latest_metrics)
        taken_at = self._latest_metrics_taken_at_ms
        fresh = False
        if taken_at is not None:
            age_ms = int(time.time() * 1000) - taken_at
            fresh = age_ms < 30_000
        return {
            "streams": streams,
            "taken_at_unix_ms": taken_at,
            "fresh": fresh,
        }

    def subscribe_events(self, replay_buffer: bool = True) -> asyncio.Queue[dict[str, Any]]:
        """Register a new WS subscriber. Returns an asyncio.Queue that
        receives every future daemon event. If `replay_buffer=True`,
        the queue is pre-loaded with the bounded recent-event buffer
        so a late-joining subscriber sees recent peer-up / metrics
        events without missing the boat.

        Caller must call :meth:`unsubscribe_events` when done.
        """
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=256)
        if replay_buffer:
            for event in list(self._event_buffer):
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    break
        self._event_subscribers.append(queue)
        return queue

    def unsubscribe_events(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        try:
            self._event_subscribers.remove(queue)
        except ValueError:
            pass

    # ------------------------------------------------------------------
    # Supervisor loop
    # ------------------------------------------------------------------

    async def _supervisor_loop(self) -> None:
        backoff = self.initial_backoff_seconds
        try:
            while not self._stop_event.is_set():
                # 1. Storm guard.
                self._prune_crash_history()
                if len(self._crash_times) >= MAX_CRASHES_IN_WINDOW:
                    self._status = SonoBusDaemonStatus.DEGRADED
                    self._last_error = (
                        f"crash storm: {MAX_CRASHES_IN_WINDOW} crashes within "
                        f"{CRASH_WINDOW_SECONDS}s. Run reset_storm_guard() "
                        "after fixing the underlying issue."
                    )
                    logger.error(
                        "SonoBusDaemonSupervisor: %s", self._last_error
                    )
                    await self._sleep_or_stop(self.max_backoff_seconds)
                    continue

                # 2. Optional: spawn the subprocess if requested + binary exists.
                if self.spawn_subprocess:
                    if not self.binary_path.exists():
                        self._status = SonoBusDaemonStatus.WAITING_FOR_BINARY
                        self._last_error = (
                            f"Binary not found at {self.binary_path}. "
                            "Either install the RPM (production) or run "
                            "`cmake --build juce-engine/build --target "
                            "map2-sonobus-transport` (dev)."
                        )
                        await self._sleep_or_stop(backoff)
                        backoff = min(backoff * 2, self.max_backoff_seconds)
                        continue
                    if self._process is None or self._process.returncode is not None:
                        await self._spawn_subprocess()

                # 3. Try to connect.
                self._status = SonoBusDaemonStatus.CONNECTING
                try:
                    caps = await self._client.connect()
                except DaemonHandshakeError as exc:
                    self._last_error = f"hello handshake failed: {exc}"
                    self._record_crash()
                    self._status = SonoBusDaemonStatus.RECONNECTING
                    await self._sleep_or_stop(backoff)
                    backoff = min(backoff * 2, self.max_backoff_seconds)
                    continue
                except DaemonNotConnected as exc:
                    self._last_error = f"UDS not reachable: {exc}"
                    self._status = (
                        SonoBusDaemonStatus.WAITING_FOR_DAEMON
                        if not self.spawn_subprocess
                        else SonoBusDaemonStatus.RECONNECTING
                    )
                    await self._sleep_or_stop(backoff)
                    backoff = min(backoff * 2, self.max_backoff_seconds)
                    continue
                except Exception as exc:
                    self._last_error = f"connect failed: {type(exc).__name__}: {exc}"
                    logger.exception("SonoBusDaemonSupervisor: unexpected connect error")
                    self._record_crash()
                    await self._sleep_or_stop(backoff)
                    backoff = min(backoff * 2, self.max_backoff_seconds)
                    continue

                # 4. Connected. Reset backoff + spawn event relay + run ping loop.
                self._capabilities = caps
                self._connected_at = time.monotonic()
                self._status = SonoBusDaemonStatus.RUNNING
                self._last_error = None
                backoff = self.initial_backoff_seconds
                logger.info(
                    "SonoBusDaemonSupervisor: connected (version=%s build=%s has_aoo=%s)",
                    caps.version, caps.build_mode, caps.has_aoo,
                )

                self._event_relay_task = asyncio.create_task(self._event_relay_loop())
                try:
                    await self._run_ping_loop()
                finally:
                    # Ping loop returned → daemon disconnected. Cancel
                    # the event relay before reconnecting.
                    if self._event_relay_task is not None:
                        self._event_relay_task.cancel()
                        try:
                            await self._event_relay_task
                        except (asyncio.CancelledError, Exception):
                            pass
                        self._event_relay_task = None

                # Ping loop returned → daemon disconnected.
                self._connected_at = None
                self._capabilities = None
                self._status = SonoBusDaemonStatus.RECONNECTING
                try:
                    await self._client.disconnect()
                except Exception:
                    pass

                self._record_crash()
                await self._sleep_or_stop(backoff)
                backoff = min(backoff * 2, self.max_backoff_seconds)

        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("SonoBusDaemonSupervisor: loop crashed")
        finally:
            self._status = SonoBusDaemonStatus.SHUTDOWN

    async def _event_relay_loop(self) -> None:
        """Drain daemon events while connected. Updates the live metrics
        cache from metrics_snapshot events; appends every event to the
        ring buffer + fans out to WS subscribers."""
        try:
            async for event in self._client.events():
                self._handle_daemon_event(event)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("SonoBusDaemonSupervisor: event relay crashed")

    def _handle_daemon_event(self, event: dict[str, Any]) -> None:
        """Process one daemon event. Public-ish — exposed so tests can
        feed synthetic events without spinning up a real client."""
        event_type = event.get("type", "")

        # Capture metrics_snapshot into the live cache.
        if event_type == "metrics_snapshot":
            payload = event.get("payload") or {}
            streams_list = payload.get("streams") if isinstance(payload, dict) else None
            if isinstance(streams_list, list):
                new_cache: dict[str, dict[str, Any]] = {}
                for entry in streams_list:
                    if not isinstance(entry, dict):
                        continue
                    sid = entry.get("stream_id")
                    if isinstance(sid, str):
                        new_cache[sid] = dict(entry)
                self._latest_metrics = new_cache
                taken = payload.get("taken_at_unix_ms") if isinstance(payload, dict) else None
                if isinstance(taken, (int, float)):
                    self._latest_metrics_taken_at_ms = int(taken)
                else:
                    self._latest_metrics_taken_at_ms = int(time.time() * 1000)

        # Always buffer + fan out (lets subscribers see metrics_snapshot
        # as a structured event, in addition to the cache update).
        self._event_buffer.append(event)
        for queue in list(self._event_subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # Slow subscriber — drop the oldest item to keep
                # backpressure off the supervisor loop.
                try:
                    queue.get_nowait()
                    queue.put_nowait(event)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    pass

    async def _run_ping_loop(self) -> None:
        """Periodic ping until disconnect or stop. Returns when the
        ping fails (so the supervisor reconnects)."""
        while not self._stop_event.is_set():
            try:
                await asyncio.wait_for(
                    asyncio.sleep(self.ping_interval_seconds),
                    timeout=self.ping_interval_seconds + 1.0,
                )
            except asyncio.TimeoutError:
                pass

            if self._stop_event.is_set():
                return

            try:
                ok = await self._client.ping()
            except DaemonClientError:
                self._last_error = "ping failed; daemon disconnected"
                return
            if not ok:
                self._last_error = "ping returned non-true; daemon unresponsive"
                return

    async def _spawn_subprocess(self) -> None:
        env = self._build_subprocess_env()
        # Use taskset to pin CPU affinity if available; fall back to
        # plain exec if not.
        cmd: list[str] = []
        if shutil.which("taskset"):
            cmd = ["taskset", "-c", ",".join(str(c) for c in self.cpu_affinity)]
        cmd += [str(self.binary_path), "--socket", str(self.socket_path)]
        logger.info("SonoBusDaemonSupervisor: spawning %s", " ".join(cmd))
        try:
            self._process = await asyncio.create_subprocess_exec(
                *cmd,
                env=env,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
        except OSError as exc:
            self._last_error = f"spawn failed: {exc}"
            logger.exception("SonoBusDaemonSupervisor: subprocess spawn failed")
            return
        self._restart_count += 1
        # Brief grace period for the daemon to bind the UDS.
        await asyncio.sleep(0.2)

    def _build_subprocess_env(self) -> dict[str, str]:
        import os
        env = dict(os.environ)
        env.update(self.env_overrides)
        return env

    def _record_crash(self) -> None:
        now = time.monotonic()
        self._crash_times.append(now)

    def _prune_crash_history(self) -> None:
        cutoff = time.monotonic() - CRASH_WINDOW_SECONDS
        while self._crash_times and self._crash_times[0] < cutoff:
            self._crash_times.popleft()

    async def _sleep_or_stop(self, seconds: float) -> None:
        """Sleep but wake immediately if the stop event fires."""
        try:
            await asyncio.wait_for(self._stop_event.wait(), timeout=seconds)
        except asyncio.TimeoutError:
            pass


# ---------------------------------------------------------------------------
# Module-level singleton (per the ControllerHostService pattern)
# ---------------------------------------------------------------------------


_singleton: Optional[SonoBusDaemonSupervisor] = None


def get_sonobus_daemon_supervisor() -> SonoBusDaemonSupervisor:
    """Process-wide singleton. Created lazily so tests can override
    via :func:`reset_sonobus_daemon_supervisor_for_tests`."""
    global _singleton
    if _singleton is None:
        _singleton = SonoBusDaemonSupervisor()
    return _singleton


def reset_sonobus_daemon_supervisor_for_tests(
    supervisor: SonoBusDaemonSupervisor | None = None,
) -> None:
    """Replace the singleton with a test instance, or clear it entirely."""
    global _singleton
    _singleton = supervisor
