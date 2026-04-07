"""
Tesira Text Protocol (TTP) client over SSH.

Used as a transport fallback when Telnet (port 23) is disabled on a Tesira unit
but SSH (port 22) is available.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Callable, Optional

from app.services.tesira.ttp_client import TTPResponse, _parse_value

try:
    import asyncssh  # type: ignore
except Exception:  # pragma: no cover - exercised indirectly when dependency missing
    asyncssh = None  # type: ignore

logger = logging.getLogger(__name__)

_OK_RE = re.compile(r"^\+OK(?:\s+value=(.+))?$")
_ERR_RE = re.compile(r"^-ERR\s+(\S+)(?:\s+(.*))?$")
_PUSH_RE = re.compile(r"^!\s+(\S+)\s+(\S+)\s+(.+)$")


class TTPSSHClient:
    """
    Single SSH channel to one Tesira unit.

    Exposes the same send/subscribe/on_push shape as TTPClient so TesiraDevice
    can switch transports without changing call sites.
    """

    def __init__(
        self,
        host: str,
        port: int = 22,
        username: str = "default",
        password: str = "default",
        connect_timeout: float = 5.0,
        read_timeout: float = 2.0,
        reconnect_min_s: float = 1.0,
        reconnect_max_s: float = 30.0,
        max_reconnect_attempts: int = 0,
    ) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.connect_timeout = connect_timeout
        self.read_timeout = read_timeout
        self.reconnect_min_s = reconnect_min_s
        self.reconnect_max_s = reconnect_max_s
        self.max_reconnect_attempts = max_reconnect_attempts

        self._conn: Optional[Any] = None
        self._proc: Optional[Any] = None
        self._connected = False
        self._stopping = False
        self._read_task: Optional[asyncio.Task] = None
        self._reconnect_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

        self._response_queue: asyncio.Queue[str] = asyncio.Queue()
        self._push_callbacks: list[Callable[[str, str, Any], None]] = []
        self._subscriptions: set[tuple[str, str]] = set()

    @property
    def connected(self) -> bool:
        return self._connected

    async def connect(self) -> None:
        if self._connected:
            return
        if asyncssh is None:
            raise RuntimeError("asyncssh is not installed; cannot use SSH TTP transport")
        self._stopping = False
        await self._do_connect()

    async def disconnect(self) -> None:
        self._stopping = True
        self._connected = False
        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
            try:
                await self._reconnect_task
            except (asyncio.CancelledError, Exception):
                pass
        if self._read_task and not self._read_task.done():
            self._read_task.cancel()
            try:
                await self._read_task
            except (asyncio.CancelledError, Exception):
                pass
        if self._proc is not None:
            try:
                self._proc.stdin.close()
            except Exception:
                pass
        if self._conn is not None:
            try:
                self._conn.close()
                await self._conn.wait_closed()
            except Exception:
                pass
        self._proc = None
        self._conn = None
        self._reconnect_task = None
        logger.info("TTPSSHClient[%s:%d] disconnected", self.host, self.port)

    async def _do_connect(self) -> None:
        logger.info("TTPSSHClient connecting to %s:%d …", self.host, self.port)
        self._conn = await asyncio.wait_for(
            asyncssh.connect(
                self.host,
                port=self.port,
                username=self.username,
                password=self.password,
                known_hosts=None,
            ),
            timeout=self.connect_timeout,
        )
        self._proc = await asyncio.wait_for(
            self._conn.create_process(term_type=None),
            timeout=self.connect_timeout,
        )
        self._connected = True
        logger.info("TTPSSHClient[%s:%d] connected", self.host, self.port)

        for instance_tag, attribute in list(self._subscriptions):
            try:
                await self._raw_send(f"{instance_tag} subscribe {attribute}")
            except Exception as exc:
                logger.warning("SSH re-subscribe %s.%s failed: %s", instance_tag, attribute, exc)

        self._read_task = asyncio.create_task(
            self._read_loop(), name=f"ttp_ssh_read_{self.host}"
        )

    async def _reconnect_loop(self) -> None:
        attempt = 0
        delay = self.reconnect_min_s
        while not self._stopping:
            attempt += 1
            if self.max_reconnect_attempts > 0 and attempt > self.max_reconnect_attempts:
                logger.error(
                    "TTPSSHClient[%s:%d] giving up after %d reconnect attempts",
                    self.host,
                    self.port,
                    attempt - 1,
                )
                return
            logger.info(
                "TTPSSHClient[%s:%d] reconnect attempt %d in %.1fs …",
                self.host,
                self.port,
                attempt,
                delay,
            )
            await asyncio.sleep(delay)
            delay = min(delay * 2, self.reconnect_max_s)
            try:
                await self._do_connect()
                logger.info(
                    "TTPSSHClient[%s:%d] reconnected after %d attempt(s)",
                    self.host,
                    self.port,
                    attempt,
                )
                return
            except Exception as exc:
                logger.warning("SSH reconnect attempt %d failed: %s", attempt, exc)

    def _ensure_reconnect_task(self) -> None:
        if self._stopping:
            return
        if self._reconnect_task and not self._reconnect_task.done():
            return
        self._reconnect_task = asyncio.create_task(
            self._reconnect_loop(),
            name=f"ttp_ssh_reconnect_{self.host}",
        )

    async def send(self, instance_tag: str, service: str, attribute: str, *args: Any) -> TTPResponse:
        parts = [instance_tag, service]
        if attribute:
            parts.append(attribute)
        for arg in args:
            parts.append(str(arg).lower() if isinstance(arg, bool) else str(arg))
        command = " ".join(parts)

        async with self._lock:
            if not self._connected:
                return TTPResponse(ok=False, error_code="NOT_CONNECTED", raw="")
            try:
                await self._raw_send(command)
                raw = await asyncio.wait_for(self._response_queue.get(), timeout=self.read_timeout)
                return self._parse_response(raw)
            except asyncio.TimeoutError:
                logger.warning("TTPSSHClient[%s] timeout waiting for response to: %s", self.host, command)
                return TTPResponse(ok=False, error_code="TIMEOUT", raw="")
            except Exception as exc:
                logger.error("TTPSSHClient[%s] send error: %s", self.host, exc)
                return TTPResponse(ok=False, error_code="IO_ERROR", raw=str(exc))

    async def subscribe(self, instance_tag: str, attribute: str, interval_ms: int = 100) -> None:
        self._subscriptions.add((instance_tag, attribute))
        if not self._connected:
            return
        await self._raw_send(f"{instance_tag} subscribe {attribute} {interval_ms}")

    async def unsubscribe(self, instance_tag: str, attribute: str) -> None:
        self._subscriptions.discard((instance_tag, attribute))
        if not self._connected:
            return
        await self._raw_send(f"{instance_tag} unsubscribe {attribute}")

    def on_push(self, callback: Callable[[str, str, Any], None]) -> None:
        self._push_callbacks.append(callback)

    async def _raw_send(self, command: str) -> None:
        if self._proc is None:
            raise RuntimeError("SSH process not connected")
        self._proc.stdin.write(command + "\n")
        await self._proc.stdin.drain()

    async def _read_loop(self) -> None:
        try:
            while not self._stopping:
                if self._proc is None:
                    break
                raw = await self._proc.stdout.readline()
                if raw is None or raw == "":
                    break
                line = str(raw).strip()
                if not line:
                    continue
                if line.startswith("!"):
                    self._dispatch_push(line)
                    continue
                if line.startswith("+OK") or line.startswith("-ERR"):
                    self._response_queue.put_nowait(line)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            if not self._stopping:
                logger.warning("TTPSSHClient[%s:%d] read loop error: %s", self.host, self.port, exc)
        finally:
            if not self._stopping:
                self._connected = False
                logger.info("TTPSSHClient[%s:%d] disconnected; scheduling reconnect", self.host, self.port)
                self._ensure_reconnect_task()

    @staticmethod
    def _parse_response(raw: str) -> TTPResponse:
        ok_match = _OK_RE.match(raw)
        if ok_match:
            value = ok_match.group(1)
            return TTPResponse(ok=True, value=_parse_value(value) if value is not None else None, raw=raw)
        err_match = _ERR_RE.match(raw)
        if err_match:
            return TTPResponse(
                ok=False,
                raw=raw,
                error_code=err_match.group(1),
                error_detail=err_match.group(2),
            )
        return TTPResponse(ok=False, raw=raw, error_code="PARSE_ERROR")

    def _dispatch_push(self, line: str) -> None:
        match = _PUSH_RE.match(line)
        if not match:
            return
        instance_tag, attribute, value_str = match.group(1), match.group(2), match.group(3)
        value = _parse_value(value_str)
        for cb in self._push_callbacks:
            try:
                cb(instance_tag, attribute, value)
            except Exception as exc:
                logger.error("TTPSSHClient push callback error: %s", exc)
