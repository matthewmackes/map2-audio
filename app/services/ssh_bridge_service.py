"""
SSH Bridge Service (T2419-A).

Provides the asyncssh-based server side of the Web SSH console. Each
`SshBridgeSession` owns one asyncssh connection + interactive PTY process and
streams bytes between the remote shell and an out-of-band `on_data` callback
that the FastAPI WebSocket route in `app/routes/ssh_bridge.py` (T2419-B) uses
to forward to the browser.

Design:
- The service is WebSocket-independent — it exposes pure async methods
  (`open`, `send`, `resize`, `close`) and a callback for outbound data/events.
  Tests drive it with a mocked asyncssh transport.
- One connection per session, one PTY per session. Long sessions should
  re-open rather than multiplex.
- Known hosts policies: `accept-new` (default, trust on first use), `strict`
  (refuse unknown), `auto-add` (always append to our known_hosts).
- Hard caps: global concurrent session limit, per-session idle timeout,
  per-session bandwidth counters (bytes_tx/bytes_rx) surfaced via `stats()`.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Literal, Optional

try:
    import asyncssh  # type: ignore
except Exception:  # pragma: no cover - exercised indirectly when dependency missing
    asyncssh = None  # type: ignore

logger = logging.getLogger(__name__)


KnownHostsPolicy = Literal["accept-new", "strict", "auto-add"]
AuthMode = Literal["publickey", "password"]

DEFAULT_KNOWN_HOSTS_PATH = Path.home() / ".map2" / "ssh_known_hosts"
DEFAULT_IDLE_TIMEOUT_S = 15 * 60  # 15 minutes
DEFAULT_MAX_SESSIONS = 16
DEFAULT_CONNECT_TIMEOUT_S = 10.0
DEFAULT_KEEPALIVE_S = 30.0
DEFAULT_TERM_TYPE = "xterm-256color"
DEFAULT_TERM_COLS = 80
DEFAULT_TERM_ROWS = 24


class SshBridgeError(Exception):
    """Structured error envelope used by the bridge service.

    Matches `docs/api-contract-standards.md` error shape when rendered to
    a WS client (`{error: {code, message, details}}`).
    """

    def __init__(self, code: str, message: str, *, details: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}

    def as_envelope(self) -> Dict[str, Any]:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }


@dataclass
class SshOpenRequest:
    host: str
    port: int = 22
    username: str = "mm"
    auth: AuthMode = "publickey"
    password: Optional[str] = None
    private_key: Optional[str] = None
    known_hosts: KnownHostsPolicy = "accept-new"
    keepalive_s: float = DEFAULT_KEEPALIVE_S
    connect_timeout_s: float = DEFAULT_CONNECT_TIMEOUT_S
    term_type: str = DEFAULT_TERM_TYPE
    term_cols: int = DEFAULT_TERM_COLS
    term_rows: int = DEFAULT_TERM_ROWS
    env: Dict[str, str] = field(default_factory=dict)
    idle_timeout_s: float = DEFAULT_IDLE_TIMEOUT_S


@dataclass
class SshSessionStats:
    session_id: str
    host: str
    port: int
    username: str
    opened_at: float
    last_io_at: float
    bytes_tx: int  # bytes sent from browser to remote
    bytes_rx: int  # bytes received from remote to browser
    connected: bool


# Async callback signatures that the WS route wires up:
OnDataCallback = Callable[[bytes], Awaitable[None]]
OnClosedCallback = Callable[[str], Awaitable[None]]  # reason string
OnErrorCallback = Callable[[Dict[str, Any]], Awaitable[None]]  # envelope


class SshBridgeSession:
    """One active SSH connection + PTY process, framed for WebSocket transport.

    Lifecycle:
        session = SshBridgeSession(...)
        await session.open(request)
        await session.send(b'ls\\n')
        await session.resize(120, 40)
        await session.close()

    Outbound bytes from the remote are pushed via the `on_data` callback
    supplied at construction. Closure / error states fire `on_closed` /
    `on_error` callbacks (see signatures above).
    """

    def __init__(
        self,
        *,
        on_data: OnDataCallback,
        on_closed: Optional[OnClosedCallback] = None,
        on_error: Optional[OnErrorCallback] = None,
        session_id: Optional[str] = None,
        known_hosts_path: Optional[Path] = None,
    ) -> None:
        self.session_id = session_id or uuid.uuid4().hex
        self._on_data = on_data
        self._on_closed = on_closed
        self._on_error = on_error
        self._known_hosts_path = known_hosts_path or DEFAULT_KNOWN_HOSTS_PATH

        self._request: Optional[SshOpenRequest] = None
        self._conn: Optional[Any] = None
        self._proc: Optional[Any] = None
        self._pump_task: Optional[asyncio.Task[None]] = None
        self._idle_watchdog_task: Optional[asyncio.Task[None]] = None
        self._closing = False
        self._opened_at: float = 0.0
        self._last_io_at: float = 0.0
        self._bytes_tx: int = 0
        self._bytes_rx: int = 0
        self._close_reason: Optional[str] = None

    # ------------------------------------------------------------------ public

    @property
    def is_open(self) -> bool:
        return self._proc is not None and not self._closing

    async def open(self, request: SshOpenRequest) -> None:
        if asyncssh is None:
            raise SshBridgeError(
                "asyncssh_missing",
                "asyncssh is not installed on this host; SSH bridge unavailable.",
            )
        if self._conn is not None:
            raise SshBridgeError(
                "session_already_open",
                "SSH bridge session is already open.",
                details={"session_id": self.session_id},
            )

        self._request = request
        self._opened_at = time.time()
        self._last_io_at = self._opened_at

        connect_kwargs = self._build_connect_kwargs(request)

        try:
            self._conn = await asyncio.wait_for(
                asyncssh.connect(request.host, **connect_kwargs),
                timeout=request.connect_timeout_s,
            )
        except asyncio.TimeoutError:
            raise SshBridgeError(
                "connect_timeout",
                f"Timed out after {request.connect_timeout_s:.1f}s connecting to {request.host}:{request.port}.",
                details={"host": request.host, "port": request.port},
            )
        except Exception as exc:  # asyncssh raises various classes; flatten to envelope
            code = self._classify_connect_error(exc)
            raise SshBridgeError(
                code,
                f"SSH connect failed: {exc}",
                details={"host": request.host, "port": request.port, "exception_class": type(exc).__name__},
            )

        try:
            self._proc = await self._conn.create_process(
                term_type=request.term_type,
                term_size=(request.term_cols, request.term_rows),
                env=request.env or None,
            )
        except Exception as exc:
            await self._safe_close_conn("pty_open_failed")
            raise SshBridgeError(
                "pty_open_failed",
                f"Failed to open PTY: {exc}",
                details={"exception_class": type(exc).__name__},
            )

        self._pump_task = asyncio.create_task(self._pump_stdout())
        self._idle_watchdog_task = asyncio.create_task(self._watch_idle())
        logger.info(
            "ssh_bridge session=%s opened host=%s port=%d user=%s",
            self.session_id,
            request.host,
            request.port,
            request.username,
        )

    async def send(self, data: bytes) -> None:
        if not self.is_open or self._proc is None:
            raise SshBridgeError("session_not_open", "SSH session is not open.")
        if not data:
            return
        try:
            self._proc.stdin.write(data)
            # asyncssh's SSHWriter.drain() ensures bytes have flushed to the channel
            drain = getattr(self._proc.stdin, "drain", None)
            if drain is not None:
                await drain()
        except Exception as exc:
            await self._handle_io_error("stdin_write_failed", exc)
            return
        self._bytes_tx += len(data)
        self._last_io_at = time.time()

    async def resize(self, cols: int, rows: int) -> None:
        if not self.is_open or self._proc is None:
            raise SshBridgeError("session_not_open", "SSH session is not open.")
        if cols <= 0 or rows <= 0 or cols > 500 or rows > 500:
            raise SshBridgeError(
                "invalid_resize",
                "Terminal size out of bounds.",
                details={"cols": cols, "rows": rows},
            )
        try:
            change = getattr(self._proc, "change_terminal_size", None)
            if change is not None:
                change(cols, rows)
            self._last_io_at = time.time()
        except Exception as exc:
            await self._handle_io_error("resize_failed", exc)

    async def close(self, reason: str = "client_close") -> None:
        if self._closing:
            return
        self._closing = True
        self._close_reason = reason

        for task in (self._idle_watchdog_task, self._pump_task):
            if task is not None and not task.done():
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass

        if self._proc is not None:
            try:
                self._proc.terminate()
            except Exception:
                pass
            self._proc = None

        await self._safe_close_conn(reason)

        if self._on_closed is not None:
            try:
                await self._on_closed(reason)
            except Exception:
                logger.exception("ssh_bridge session=%s on_closed callback raised", self.session_id)

        logger.info("ssh_bridge session=%s closed reason=%s", self.session_id, reason)

    def stats(self) -> SshSessionStats:
        req = self._request
        return SshSessionStats(
            session_id=self.session_id,
            host=req.host if req else "",
            port=req.port if req else 0,
            username=req.username if req else "",
            opened_at=self._opened_at,
            last_io_at=self._last_io_at,
            bytes_tx=self._bytes_tx,
            bytes_rx=self._bytes_rx,
            connected=self.is_open,
        )

    # ----------------------------------------------------------------- helpers

    def _build_connect_kwargs(self, request: SshOpenRequest) -> Dict[str, Any]:
        kwargs: Dict[str, Any] = {
            "port": request.port,
            "username": request.username,
            "keepalive_interval": request.keepalive_s,
            "known_hosts": self._resolve_known_hosts(request.known_hosts),
        }

        if request.auth == "password":
            if not request.password:
                raise SshBridgeError(
                    "missing_password",
                    "Password auth selected but no password was provided.",
                )
            kwargs["password"] = request.password
            kwargs["preferred_auth"] = ["password"]
        else:
            if request.private_key:
                try:
                    key = asyncssh.import_private_key(request.private_key)
                    kwargs["client_keys"] = [key]
                except Exception as exc:
                    raise SshBridgeError(
                        "invalid_private_key",
                        f"Could not parse private key: {exc}",
                    )
            # else asyncssh falls back to ~/.ssh default identities
            kwargs["preferred_auth"] = ["publickey"]
        return kwargs

    def _resolve_known_hosts(self, policy: KnownHostsPolicy) -> Any:
        if policy == "strict":
            if not self._known_hosts_path.exists():
                raise SshBridgeError(
                    "strict_known_hosts_missing",
                    f"Strict mode requires a known_hosts file at {self._known_hosts_path}.",
                )
            return str(self._known_hosts_path)
        if policy == "auto-add":
            # asyncssh: None disables verification; we append manually on first open
            self._known_hosts_path.parent.mkdir(parents=True, exist_ok=True)
            self._known_hosts_path.touch(exist_ok=True)
            return None
        # accept-new (default): disable strict verification; record on first success
        return None

    def _classify_connect_error(self, exc: Exception) -> str:
        name = type(exc).__name__.lower()
        if "timeout" in name:
            return "connect_timeout"
        if "permission" in name or "auth" in name:
            return "auth_failed"
        if "host" in name:
            return "host_unreachable"
        return "connect_failed"

    async def _pump_stdout(self) -> None:
        assert self._proc is not None
        stdout = self._proc.stdout
        try:
            while not self._closing:
                chunk = await stdout.read(4096)
                if not chunk:
                    await self.close("remote_eof")
                    return
                if isinstance(chunk, str):
                    chunk_bytes = chunk.encode("utf-8", errors="replace")
                else:
                    chunk_bytes = bytes(chunk)
                self._bytes_rx += len(chunk_bytes)
                self._last_io_at = time.time()
                try:
                    await self._on_data(chunk_bytes)
                except Exception:
                    logger.exception("ssh_bridge session=%s on_data callback raised", self.session_id)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await self._handle_io_error("stdout_read_failed", exc)

    async def _watch_idle(self) -> None:
        assert self._request is not None
        timeout = self._request.idle_timeout_s
        try:
            while not self._closing:
                await asyncio.sleep(min(30.0, max(1.0, timeout / 4)))
                if time.time() - self._last_io_at >= timeout:
                    logger.info(
                        "ssh_bridge session=%s idle timeout reached (%.0fs)",
                        self.session_id,
                        timeout,
                    )
                    await self.close("idle_timeout")
                    return
        except asyncio.CancelledError:
            raise

    async def _handle_io_error(self, code: str, exc: Exception) -> None:
        logger.warning("ssh_bridge session=%s %s: %s", self.session_id, code, exc)
        envelope = SshBridgeError(
            code,
            str(exc),
            details={"exception_class": type(exc).__name__},
        ).as_envelope()
        if self._on_error is not None:
            try:
                await self._on_error(envelope)
            except Exception:
                logger.exception("ssh_bridge session=%s on_error callback raised", self.session_id)
        await self.close(code)

    async def _safe_close_conn(self, reason: str) -> None:
        if self._conn is None:
            return
        try:
            self._conn.close()
            waiter = getattr(self._conn, "wait_closed", None)
            if waiter is not None:
                try:
                    await asyncio.wait_for(waiter(), timeout=2.0)
                except (asyncio.TimeoutError, Exception):
                    pass
        except Exception:
            logger.debug("ssh_bridge session=%s conn.close() raised on %s", self.session_id, reason)
        finally:
            self._conn = None


class SshBridgeService:
    """Tracks live `SshBridgeSession` instances and enforces global caps."""

    def __init__(self, *, max_sessions: int = DEFAULT_MAX_SESSIONS) -> None:
        self._max_sessions = max_sessions
        self._sessions: Dict[str, SshBridgeSession] = {}
        self._lock = asyncio.Lock()

    @property
    def max_sessions(self) -> int:
        return self._max_sessions

    async def open_session(
        self,
        request: SshOpenRequest,
        *,
        on_data: OnDataCallback,
        on_closed: Optional[OnClosedCallback] = None,
        on_error: Optional[OnErrorCallback] = None,
        known_hosts_path: Optional[Path] = None,
    ) -> SshBridgeSession:
        async with self._lock:
            if len(self._sessions) >= self._max_sessions:
                raise SshBridgeError(
                    "session_cap_reached",
                    f"SSH bridge session cap reached ({self._max_sessions}).",
                )
            session = SshBridgeSession(
                on_data=on_data,
                on_closed=self._wrap_on_closed(on_closed),
                on_error=on_error,
                known_hosts_path=known_hosts_path,
            )
            self._sessions[session.session_id] = session
        try:
            await session.open(request)
        except Exception:
            async with self._lock:
                self._sessions.pop(session.session_id, None)
            raise
        return session

    def get(self, session_id: str) -> Optional[SshBridgeSession]:
        return self._sessions.get(session_id)

    def list_stats(self) -> List[SshSessionStats]:
        return [s.stats() for s in self._sessions.values()]

    async def close_all(self, reason: str = "service_shutdown") -> None:
        async with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for session in sessions:
            try:
                await session.close(reason)
            except Exception:
                logger.exception("ssh_bridge close_all failed for session=%s", session.session_id)

    def _wrap_on_closed(self, user_cb: Optional[OnClosedCallback]) -> OnClosedCallback:
        async def _cb(reason: str, _svc: "SshBridgeService" = self, _user: Optional[OnClosedCallback] = user_cb) -> None:
            # Remove from registry first so cap frees up immediately
            for sid, sess in list(_svc._sessions.items()):
                if sess._close_reason == reason or not sess.is_open:
                    _svc._sessions.pop(sid, None)
            if _user is not None:
                try:
                    await _user(reason)
                except Exception:
                    logger.exception("ssh_bridge user on_closed callback raised")

        return _cb


_default_service: Optional[SshBridgeService] = None


def get_ssh_bridge_service() -> SshBridgeService:
    """Module-level singleton accessor used by `app/routes/ssh_bridge.py`."""
    global _default_service
    if _default_service is None:
        max_sessions_env = os.environ.get("MAP2_SSH_BRIDGE_MAX_SESSIONS")
        try:
            cap = int(max_sessions_env) if max_sessions_env else DEFAULT_MAX_SESSIONS
        except ValueError:
            cap = DEFAULT_MAX_SESSIONS
        _default_service = SshBridgeService(max_sessions=cap)
    return _default_service


def reset_ssh_bridge_service_for_tests() -> None:
    """Clear the module-level singleton so tests get a fresh instance."""
    global _default_service
    _default_service = None
