"""SonoBus daemon UDS client.

Speaks the line-delimited JSON protocol the C++ daemon exposes at
``/run/map2/sonobus-transport.sock``. Connects, performs the ``hello``
handshake, dispatches commands, reads async events.

The client is async-first (uses ``asyncio.open_unix_connection``) so it
can run inside the same backend event loop that hosts FastAPI. The
public API is intentionally narrow:

  - ``await client.connect()``      → opens the UDS, returns hello data
  - ``await client.call(cmd, …)``   → request/response with timeout
  - ``async for ev in client.events()`` → drain async events
  - ``await client.disconnect()``   → close cleanly

Errors are surfaced as typed exceptions so the supervisor can decide
whether to log + continue (DaemonNotConnected) vs trigger a restart
(DaemonProtocolError, DaemonHandshakeError).

Reference: ``juce-engine/SonoBusDaemon/Source/UdsProtocol.cpp`` is the
authoritative server side.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections import deque
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


# Default UDS path — matches the systemd unit at
# packaging/systemd/map2-sonobus-transport.service and the daemon's
# DaemonConfig.h DEFAULT_UDS_SOCKET_PATH.
DEFAULT_SOCKET_PATH = Path("/run/map2/sonobus-transport.sock")

# Default call timeout. The daemon's poll interval is 50ms so any
# command should round-trip in <100ms under normal load; 5s gives
# plenty of headroom for CI under contention.
DEFAULT_CALL_TIMEOUT_SECONDS = 5.0

# Connect retry: short backoff, the supervisor restarts the daemon if
# the socket stays missing for too long.
CONNECT_RETRY_DELAYS = (0.05, 0.1, 0.25, 0.5, 1.0)


# ---------------------------------------------------------------------------
# Exception hierarchy
# ---------------------------------------------------------------------------


class DaemonClientError(Exception):
    """Base for all daemon-client errors."""


class DaemonNotConnected(DaemonClientError):
    """A call was made before the client successfully connected."""


class DaemonProtocolError(DaemonClientError):
    """The daemon returned a malformed frame or unexpected response shape."""


class DaemonHandshakeError(DaemonClientError):
    """The ``hello`` handshake failed (daemon version mismatch, bad
    payload, or daemon refused the connection)."""


class DaemonCommandError(DaemonClientError):
    """A command came back with ``ok=false``. ``error_code`` is the
    canonical string (e.g. ``transport_unavailable``); supervisor +
    callers branch on it."""

    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.error_code = code
        self.error_message = message


class DaemonCallTimeout(DaemonClientError):
    """No response within the call timeout."""


# ---------------------------------------------------------------------------
# Capability info from the `hello` handshake
# ---------------------------------------------------------------------------


class DaemonCapabilities:
    """Snapshot of what the daemon reported on connect. Used by the
    supervisor's ``status_payload`` so the GUI can show a clear
    ``stub_mode`` / ``full_mode`` indicator without re-pinging."""

    def __init__(self, data: dict[str, Any]):
        self.version: str = data.get("version", "unknown")
        self.build_mode: str = data.get("build_mode", "unknown")
        self.has_aoo: bool = bool(data.get("has_aoo", False))
        self.has_jack: bool = bool(data.get("has_jack", False))
        self.sample_rate_hz: int = int(data.get("sample_rate_hz", 0))
        self.buffer_size: int = int(data.get("buffer_size", 0))
        self.port_base: int = int(data.get("port_base", 0))
        self.port_count: int = int(data.get("port_count", 0))

    def as_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "build_mode": self.build_mode,
            "has_aoo": self.has_aoo,
            "has_jack": self.has_jack,
            "sample_rate_hz": self.sample_rate_hz,
            "buffer_size": self.buffer_size,
            "port_base": self.port_base,
            "port_count": self.port_count,
        }


# ---------------------------------------------------------------------------
# Async client
# ---------------------------------------------------------------------------


class SonoBusDaemonClient:
    """Async UDS client for the map2-sonobus-transport daemon.

    Thread safety: a single instance is owned by the supervisor and
    accessed only from the asyncio event loop. ``call()`` serializes
    requests via an asyncio.Lock so multiple await call() invocations
    from different coroutines don't interleave frames.
    """

    def __init__(
        self,
        socket_path: Path | None = None,
        call_timeout_seconds: float | None = None,
    ):
        self.socket_path = Path(socket_path or DEFAULT_SOCKET_PATH)
        self.call_timeout_seconds = (
            call_timeout_seconds
            if call_timeout_seconds is not None
            else DEFAULT_CALL_TIMEOUT_SECONDS
        )

        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._capabilities: Optional[DaemonCapabilities] = None
        self._connected_at: Optional[float] = None
        self._call_lock = asyncio.Lock()
        # Pending request-id → future map.
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}
        # Async event buffer (no consumer if events() isn't being iterated).
        self._event_buffer: deque[dict[str, Any]] = deque(maxlen=1024)
        self._event_waiters: deque[asyncio.Future[dict[str, Any]]] = deque()
        # Reader task; cancelled on disconnect.
        self._reader_task: Optional[asyncio.Task[None]] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    @property
    def is_connected(self) -> bool:
        return (
            self._writer is not None
            and not self._writer.is_closing()
            and self._reader_task is not None
            and not self._reader_task.done()
        )

    @property
    def capabilities(self) -> Optional[DaemonCapabilities]:
        return self._capabilities

    async def connect(self) -> DaemonCapabilities:
        """Open the UDS, start the reader task, perform the hello
        handshake. Returns the daemon's capability report on success;
        raises ``DaemonHandshakeError`` if the daemon refuses or
        returns an unexpected reply."""
        if self.is_connected:
            return self._capabilities  # type: ignore[return-value]

        last_error: Optional[Exception] = None
        for delay in CONNECT_RETRY_DELAYS:
            try:
                self._reader, self._writer = await asyncio.open_unix_connection(
                    path=str(self.socket_path)
                )
                break
            except (FileNotFoundError, ConnectionRefusedError, OSError) as exc:
                last_error = exc
                await asyncio.sleep(delay)
        else:
            raise DaemonNotConnected(
                f"could not connect to {self.socket_path}: {last_error}"
            )

        # Start the reader BEFORE sending hello so the handshake response
        # is dispatched through the same pipeline.
        self._reader_task = asyncio.create_task(self._reader_loop())

        try:
            hello_data = await self.call("hello", payload=None)
        except DaemonClientError as exc:
            await self._teardown()
            raise DaemonHandshakeError(f"hello handshake failed: {exc}") from exc

        try:
            self._capabilities = DaemonCapabilities(hello_data)
        except (TypeError, ValueError, KeyError) as exc:
            await self._teardown()
            raise DaemonHandshakeError(f"malformed hello response: {hello_data!r}") from exc

        self._connected_at = time.monotonic()
        logger.info(
            "SonoBusDaemonClient: connected to %s (version=%s build=%s has_aoo=%s)",
            self.socket_path,
            self._capabilities.version,
            self._capabilities.build_mode,
            self._capabilities.has_aoo,
        )
        return self._capabilities

    async def disconnect(self) -> None:
        await self._teardown()

    async def _teardown(self) -> None:
        # Cancel reader task first so it doesn't read garbage during close.
        if self._reader_task is not None and not self._reader_task.done():
            self._reader_task.cancel()
            try:
                await self._reader_task
            except (asyncio.CancelledError, Exception):
                pass
        self._reader_task = None

        if self._writer is not None:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
        self._writer = None
        self._reader = None
        self._capabilities = None
        self._connected_at = None

        # Fail any pending calls so the awaiters unblock.
        for fut in list(self._pending.values()):
            if not fut.done():
                fut.set_exception(DaemonNotConnected("disconnect"))
        self._pending.clear()
        # Fail any event waiters too.
        for waiter in list(self._event_waiters):
            if not waiter.done():
                waiter.set_exception(DaemonNotConnected("disconnect"))
        self._event_waiters.clear()

    # ------------------------------------------------------------------
    # Reader loop
    # ------------------------------------------------------------------

    async def _reader_loop(self) -> None:
        """Decode '\\n'-delimited JSON frames from the daemon, route
        responses to pending futures, queue events for events()."""
        assert self._reader is not None
        try:
            while True:
                line = await self._reader.readline()
                if not line:
                    logger.info("SonoBusDaemonClient: daemon closed connection")
                    return
                try:
                    frame = json.loads(line.decode())
                except json.JSONDecodeError:
                    logger.warning("SonoBusDaemonClient: garbage frame %r", line)
                    continue
                self._dispatch_frame(frame)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("SonoBusDaemonClient: reader loop crashed")
        finally:
            # Reader exit → close the writer so the supervisor notices.
            if self._writer is not None and not self._writer.is_closing():
                try:
                    self._writer.close()
                except Exception:
                    pass

    def _dispatch_frame(self, frame: dict[str, Any]) -> None:
        # Events have ``event: true``; responses echo the request `id`.
        if frame.get("event"):
            self._deliver_event(frame)
            return
        request_id = frame.get("id", "")
        fut = self._pending.pop(request_id, None)
        if fut is None or fut.done():
            # Unsolicited response — likely a delayed reply after a
            # timeout. Log + ignore.
            logger.debug(
                "SonoBusDaemonClient: orphan response id=%r type=%s",
                request_id, frame.get("type"),
            )
            return
        fut.set_result(frame)

    def _deliver_event(self, frame: dict[str, Any]) -> None:
        # Wake any event waiter first; queue otherwise.
        while self._event_waiters and self._event_waiters[0].done():
            self._event_waiters.popleft()
        if self._event_waiters:
            waiter = self._event_waiters.popleft()
            waiter.set_result(frame)
        else:
            self._event_buffer.append(frame)

    # ------------------------------------------------------------------
    # Command path
    # ------------------------------------------------------------------

    async def call(
        self,
        command_type: str,
        payload: Optional[dict[str, Any]] = None,
        timeout: Optional[float] = None,
    ) -> dict[str, Any]:
        """Send one command + await its response. Returns the response
        ``data`` field on success; raises ``DaemonCommandError`` with
        the canonical error code on ok=false; raises ``DaemonCallTimeout``
        if the daemon doesn't reply."""
        if self._writer is None or self._writer.is_closing():
            raise DaemonNotConnected("call() before connect() or after disconnect()")

        request_id = uuid.uuid4().hex
        frame: dict[str, Any] = {"v": 1, "type": command_type, "id": request_id}
        if payload is not None:
            frame["payload"] = payload
        serialized = (json.dumps(frame) + "\n").encode()

        loop = asyncio.get_running_loop()
        future: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._pending[request_id] = future

        async with self._call_lock:
            try:
                self._writer.write(serialized)
                await self._writer.drain()
            except (BrokenPipeError, ConnectionResetError) as exc:
                self._pending.pop(request_id, None)
                raise DaemonNotConnected(f"write failed: {exc}") from exc

        try:
            response = await asyncio.wait_for(
                future,
                timeout=(timeout if timeout is not None else self.call_timeout_seconds),
            )
        except asyncio.TimeoutError as exc:
            self._pending.pop(request_id, None)
            raise DaemonCallTimeout(
                f"no response within {self.call_timeout_seconds}s for {command_type}"
            ) from exc

        if not isinstance(response, dict):
            raise DaemonProtocolError(f"non-dict response: {response!r}")

        if response.get("ok") is False:
            err = response.get("error") or {}
            raise DaemonCommandError(
                code=err.get("code", "unknown_error"),
                message=err.get("message", "(no message)"),
            )

        data = response.get("data")
        if data is None:
            return {}
        if not isinstance(data, dict):
            raise DaemonProtocolError(f"response.data is not a dict: {data!r}")
        return data

    # ------------------------------------------------------------------
    # Event stream
    # ------------------------------------------------------------------

    async def events(self) -> AsyncIterator[dict[str, Any]]:
        """Async iterator over daemon-pushed events (``peer_up``,
        ``peer_down``, ``session_start``, ``session_stop``,
        ``metrics_snapshot``, ``transport_error``). Cancellation-safe.

        Buffered events drain first; then waits for new arrivals.
        """
        while True:
            if self._event_buffer:
                yield self._event_buffer.popleft()
                continue
            if not self.is_connected:
                return
            loop = asyncio.get_running_loop()
            waiter: asyncio.Future[dict[str, Any]] = loop.create_future()
            self._event_waiters.append(waiter)
            try:
                event = await waiter
            except DaemonNotConnected:
                return
            yield event

    # ------------------------------------------------------------------
    # High-level command helpers (typed convenience wrappers)
    # ------------------------------------------------------------------

    async def ping(self) -> bool:
        """Returns True if the daemon replied with pong."""
        try:
            data = await self.call("ping")
        except DaemonClientError:
            return False
        return bool(data.get("pong"))

    async def create_source(self, stream_id: str) -> None:
        """Create an AOO source. Raises ``DaemonCommandError`` with
        code=``transport_unavailable`` in stub mode."""
        await self.call("create_source", payload={"stream_id": stream_id})

    async def destroy_source(self, stream_id: str) -> None:
        await self.call("destroy_source", payload={"stream_id": stream_id})

    async def create_sink(self, stream_id: str) -> None:
        await self.call("create_sink", payload={"stream_id": stream_id})

    async def destroy_sink(self, stream_id: str) -> None:
        await self.call("destroy_sink", payload={"stream_id": stream_id})

    async def request_shutdown(self) -> None:
        """Ask the daemon to exit gracefully. The supervisor closes
        its own loop after seeing the daemon's ack."""
        try:
            await self.call("shutdown", timeout=2.0)
        except DaemonClientError:
            # If the daemon dies before acking, that's actually success.
            pass
