"""
Tesira Text Protocol (TTP) async TCP client.

Connects to a Biamp Tesira Forte AVB unit via raw Telnet (TCP port 23).
Handles command send/receive, push-notification subscriptions, and
auto-reconnection with exponential backoff.

TTP command format:  '<instance_tag> <service> <attribute> [index] [value]\\n'
Response format:     '+OK value=<token>'  or  '-ERR <code> <detail>'
Subscription push:   '! <instance_tag> <attribute> <value>'

References:
  Biamp Tesira Text Protocol v4.2 (Jan 2022)
  https://downloads.biamp.com/assets/docs/default-source/control/tesira_text_protocol_v4-2_jan22.pdf
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

# Regex patterns for TTP response parsing
_OK_RE = re.compile(r'^\+OK(?:\s+value=(.+))?$')
_ERR_RE = re.compile(r'^-ERR\s+(\S+)(?:\s+(.*))?$')
_PUSH_RE = re.compile(r'^!\s+(\S+)\s+(\S+)\s+(.+)$')

# Telnet negotiation bytes to swallow on connect (IAC sequences)
_IAC = b'\xff'


@dataclass
class TTPResponse:
    """Result of a single TTP command."""
    ok: bool
    value: Any = None               # Parsed value from '+OK value=...'
    raw: str = ''                   # Full response line
    error_code: Optional[str] = None
    error_detail: Optional[str] = None


class TTPClient:
    """
    Single asyncio TCP connection to one Tesira unit on port 23.

    Thread-safety: all methods must be called from the same asyncio event loop.
    """

    def __init__(
        self,
        host: str,
        port: int = 23,
        connect_timeout: float = 5.0,
        read_timeout: float = 2.0,
        reconnect_min_s: float = 1.0,
        reconnect_max_s: float = 30.0,
        max_reconnect_attempts: int = 0,    # 0 = unlimited
    ) -> None:
        self.host = host
        self.port = port
        self.connect_timeout = connect_timeout
        self.read_timeout = read_timeout
        self.reconnect_min_s = reconnect_min_s
        self.reconnect_max_s = reconnect_max_s
        self.max_reconnect_attempts = max_reconnect_attempts

        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._lock = asyncio.Lock()             # Serialise send/recv pairs
        self._connected = False
        self._stopping = False
        self._read_task: Optional[asyncio.Task] = None

        # Push-notification callbacks: List[Callable[[instance_tag, attribute, value], None]]
        self._push_callbacks: list[Callable[[str, str, Any], None]] = []

        # Active subscriptions: set of (instance_tag, attribute) tuples
        self._subscriptions: set[tuple[str, str]] = set()

    # ──────────────────────────────────────────────────────────────────────────
    # Connection lifecycle
    # ──────────────────────────────────────────────────────────────────────────

    @property
    def connected(self) -> bool:
        return self._connected

    async def connect(self) -> None:
        """Open the TCP connection and start the read loop."""
        if self._connected:
            return
        self._stopping = False
        await self._do_connect()

    async def disconnect(self) -> None:
        """Cleanly close the TCP connection."""
        self._stopping = True
        self._connected = False
        if self._read_task and not self._read_task.done():
            self._read_task.cancel()
            try:
                await self._read_task
            except (asyncio.CancelledError, Exception):
                pass
        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
        self._reader = None
        self._writer = None
        logger.info("TTPClient[%s:%d] disconnected", self.host, self.port)

    async def _do_connect(self) -> None:
        """Attempt a single TCP connection, swallowing Telnet IAC negotiation bytes."""
        logger.info("TTPClient connecting to %s:%d …", self.host, self.port)
        self._reader, self._writer = await asyncio.wait_for(
            asyncio.open_connection(self.host, self.port),
            timeout=self.connect_timeout,
        )
        # Drain any Telnet negotiation bytes (IAC sequences) the server sends
        await self._drain_telnet_negotiation()
        self._connected = True
        logger.info("TTPClient[%s:%d] connected", self.host, self.port)

        # Re-subscribe to any active subscriptions after reconnect
        for instance_tag, attribute in list(self._subscriptions):
            try:
                await self._raw_send(f"{instance_tag} subscribe {attribute}")
            except Exception as exc:
                logger.warning("Re-subscribe %s.%s failed: %s", instance_tag, attribute, exc)

        # Start background read loop
        self._read_task = asyncio.create_task(
            self._read_loop(), name=f"ttp_read_{self.host}"
        )

    async def _drain_telnet_negotiation(self) -> None:
        """
        Consume any initial Telnet IAC option negotiation bytes.
        Tesira sends an IS ALIVE prompt; we discard it until we see a newline.
        Timeout-guarded so we do not block indefinitely.
        """
        try:
            await asyncio.wait_for(
                self._reader.readuntil(b'\n'),  # type: ignore[union-attr]
                timeout=2.0,
            )
        except (asyncio.TimeoutError, asyncio.IncompleteReadError):
            pass

    async def _reconnect_loop(self) -> None:
        """Attempt reconnection with exponential backoff."""
        attempt = 0
        delay = self.reconnect_min_s
        while not self._stopping:
            attempt += 1
            if self.max_reconnect_attempts > 0 and attempt > self.max_reconnect_attempts:
                logger.error(
                    "TTPClient[%s:%d] giving up after %d reconnect attempts",
                    self.host, self.port, attempt - 1,
                )
                return
            logger.info(
                "TTPClient[%s:%d] reconnect attempt %d in %.1fs …",
                self.host, self.port, attempt, delay,
            )
            await asyncio.sleep(delay)
            delay = min(delay * 2, self.reconnect_max_s)
            try:
                await self._do_connect()
                logger.info(
                    "TTPClient[%s:%d] reconnected after %d attempt(s)",
                    self.host, self.port, attempt,
                )
                return
            except Exception as exc:
                logger.warning("TTPClient reconnect attempt %d failed: %s", attempt, exc)

    # ──────────────────────────────────────────────────────────────────────────
    # Command send / receive
    # ──────────────────────────────────────────────────────────────────────────

    async def send(
        self,
        instance_tag: str,
        service: str,
        attribute: str,
        *args: Any,
    ) -> TTPResponse:
        """
        Send a TTP command and return the parsed response.

        Example:
            resp = await client.send("LevelControl1", "get", "level", 0)
            if resp.ok:
                level_db = float(resp.value)
        """
        parts = [instance_tag, service, attribute]
        for a in args:
            parts.append(str(a).lower() if isinstance(a, bool) else str(a))
        command = ' '.join(parts)

        async with self._lock:
            if not self._connected:
                return TTPResponse(ok=False, error_code="NOT_CONNECTED", raw='')
            try:
                await self._raw_send(command)
                raw = await asyncio.wait_for(
                    self._read_response_line(), timeout=self.read_timeout
                )
                return self._parse_response(raw)
            except asyncio.TimeoutError:
                logger.warning("TTPClient[%s] timeout waiting for response to: %s", self.host, command)
                return TTPResponse(ok=False, error_code="TIMEOUT", raw='')
            except Exception as exc:
                logger.error("TTPClient[%s] send error: %s", self.host, exc)
                return TTPResponse(ok=False, error_code="IO_ERROR", raw=str(exc))

    async def _raw_send(self, command: str) -> None:
        """Write a command line to the TCP stream."""
        line = (command + '\n').encode('ascii', errors='replace')
        self._writer.write(line)  # type: ignore[union-attr]
        await self._writer.drain()  # type: ignore[union-attr]

    async def _read_response_line(self) -> str:
        """Read until a '+OK' or '-ERR' line, skipping push notifications."""
        while True:
            raw = await self._reader.readline()  # type: ignore[union-attr]
            line = raw.decode('ascii', errors='replace').strip()
            if not line:
                continue
            if line.startswith('!'):
                # Push notification arrived mid-command — dispatch and keep waiting
                self._dispatch_push_line(line)
                continue
            return line

    @staticmethod
    def _parse_response(raw: str) -> TTPResponse:
        """Parse a TTP response line into a TTPResponse."""
        m = _OK_RE.match(raw)
        if m:
            value_str = m.group(1)
            value = _parse_value(value_str) if value_str is not None else None
            return TTPResponse(ok=True, value=value, raw=raw)

        m = _ERR_RE.match(raw)
        if m:
            return TTPResponse(
                ok=False,
                raw=raw,
                error_code=m.group(1),
                error_detail=m.group(2),
            )

        # Unexpected format — treat as error
        return TTPResponse(ok=False, raw=raw, error_code='PARSE_ERROR')

    # ──────────────────────────────────────────────────────────────────────────
    # Subscriptions
    # ──────────────────────────────────────────────────────────────────────────

    async def subscribe(
        self,
        instance_tag: str,
        attribute: str,
        interval_ms: int = 100,
    ) -> None:
        """
        Subscribe to push notifications for a DSP block attribute.

        TTP command: '<instance_tag> subscribe <attribute> <interval_ms>'
        Server pushes: '! <instance_tag> <attribute> <value>' at the given interval.
        """
        key = (instance_tag, attribute)
        self._subscriptions.add(key)
        if not self._connected:
            return  # Will be re-sent on reconnect via _do_connect()
        command = f"{instance_tag} subscribe {attribute} {interval_ms}"
        try:
            self._writer.write((command + '\n').encode('ascii', errors='replace'))  # type: ignore[union-attr]
            await self._writer.drain()  # type: ignore[union-attr]
            logger.debug("Subscribed: %s.%s @ %dms", instance_tag, attribute, interval_ms)
        except Exception as exc:
            logger.warning("Subscribe %s.%s failed: %s", instance_tag, attribute, exc)

    async def unsubscribe(self, instance_tag: str, attribute: str) -> None:
        """Cancel a push subscription."""
        key = (instance_tag, attribute)
        self._subscriptions.discard(key)
        if not self._connected:
            return
        command = f"{instance_tag} unsubscribe {attribute}"
        try:
            self._writer.write((command + '\n').encode('ascii', errors='replace'))  # type: ignore[union-attr]
            await self._writer.drain()  # type: ignore[union-attr]
        except Exception as exc:
            logger.warning("Unsubscribe %s.%s failed: %s", instance_tag, attribute, exc)

    def on_push(self, callback: Callable[[str, str, Any], None]) -> None:
        """Register a callback for push notifications: callback(instance_tag, attribute, value)."""
        self._push_callbacks.append(callback)

    def _dispatch_push_line(self, line: str) -> None:
        """Parse and dispatch a '! <tag> <attr> <value>' push line."""
        m = _PUSH_RE.match(line)
        if not m:
            logger.debug("Unrecognised push line: %r", line)
            return
        instance_tag, attribute, value_str = m.group(1), m.group(2), m.group(3)
        value = _parse_value(value_str)
        for cb in self._push_callbacks:
            try:
                cb(instance_tag, attribute, value)
            except Exception as exc:
                logger.error("Push callback error: %s", exc)

    # ──────────────────────────────────────────────────────────────────────────
    # Background read loop
    # ──────────────────────────────────────────────────────────────────────────

    async def _read_loop(self) -> None:
        """
        Background task: reads unsolicited push lines from the server.
        Exits on EOF or cancellation; triggers reconnect on unexpected disconnect.
        """
        try:
            while not self._stopping:
                raw = await self._reader.readline()  # type: ignore[union-attr]
                if not raw:
                    # EOF — server closed connection
                    break
                line = raw.decode('ascii', errors='replace').strip()
                if line.startswith('!'):
                    self._dispatch_push_line(line)
                # '+OK'/'-ERR' lines while not in a send() call are logged and dropped
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            if not self._stopping:
                logger.warning("TTPClient[%s:%d] read loop error: %s", self.host, self.port, exc)
        finally:
            if not self._stopping:
                self._connected = False
                logger.info("TTPClient[%s:%d] disconnected; scheduling reconnect", self.host, self.port)
                asyncio.create_task(self._reconnect_loop(), name=f"ttp_reconnect_{self.host}")


# ──────────────────────────────────────────────────────────────────────────────
# Value parsing helpers
# ──────────────────────────────────────────────────────────────────────────────

def _parse_value(s: str) -> Any:
    """
    Attempt to parse a TTP value token into a Python native type.
    Handles: true/false, integers, floats, quoted strings, arrays, raw strings.
    """
    if s is None:
        return None
    s = s.strip()
    if s.lower() == 'true':
        return True
    if s.lower() == 'false':
        return False
    # Array: [v1 v2 v3 ...]
    if s.startswith('[') and s.endswith(']'):
        inner = s[1:-1].strip()
        return [_parse_value(tok) for tok in inner.split()] if inner else []
    # Quoted string
    if s.startswith('"') and s.endswith('"'):
        return s[1:-1]
    # Integer
    try:
        return int(s)
    except ValueError:
        pass
    # Float
    try:
        return float(s)
    except ValueError:
        pass
    # Raw string
    return s
