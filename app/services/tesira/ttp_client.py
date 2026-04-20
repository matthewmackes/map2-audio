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
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from app.services.tesira.telnet_protocol import _DO, _DONT, _IAC, _IAC_BYTE, _SB, _SE, _WILL, _WONT

logger = logging.getLogger(__name__)


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
        read_timeout: float = 5.0,
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
        self._reconnect_task: Optional[asyncio.Task] = None
        self._response_queue: asyncio.Queue[str] = asyncio.Queue()
        self._telnet_pending = bytearray()
        self._line_buffer = bytearray()

        # Push-notification callbacks: List[Callable[[instance_tag, attribute, value], None]]
        self._push_callbacks: list[Callable[[str, str, Any], None]] = []

        # Active subscriptions: (instance_tag, attribute) -> interval_ms
        self._subscriptions: dict[tuple[str, str], int] = {}

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
        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
        self._reader = None
        self._writer = None
        self._reconnect_task = None
        self._telnet_pending.clear()
        self._line_buffer.clear()
        while not self._response_queue.empty():
            try:
                self._response_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        logger.info("TTPClient[%s:%d] disconnected", self.host, self.port)

    def _clear_response_queue(self) -> None:
        while not self._response_queue.empty():
            try:
                self._response_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

    async def _do_connect(self) -> None:
        """Attempt a single TCP connection, swallowing Telnet IAC negotiation bytes."""
        self._clear_response_queue()
        logger.info("TTPClient connecting to %s:%d …", self.host, self.port)
        self._reader, self._writer = await asyncio.wait_for(
            asyncio.open_connection(self.host, self.port),
            timeout=self.connect_timeout,
        )
        await self._drain_telnet_negotiation()
        self._connected = True
        logger.info("TTPClient[%s:%d] connected", self.host, self.port)

        # Start background read loop
        self._read_task = asyncio.create_task(
            self._read_loop(), name=f"ttp_read_{self.host}"
        )

        # Re-subscribe to any active subscriptions after reconnect
        for (instance_tag, attribute), interval_ms in list(self._subscriptions.items()):
            try:
                await self.send(instance_tag, "subscribe", attribute, interval_ms)
            except Exception as exc:
                logger.warning("Re-subscribe %s.%s failed: %s", instance_tag, attribute, exc)

    async def _drain_telnet_negotiation(self) -> None:
        """
        Handle initial Telnet option negotiation and discard any banner text.
        Tesira sends IAC DO/WILL bytes that require client replies before it
        processes TTP commands. We respond with conservative WONT/DONT replies.
        """
        deadline = time.monotonic() + 2.0
        while time.monotonic() < deadline:
            try:
                chunk = await asyncio.wait_for(
                    self._reader.read(1024),  # type: ignore[union-attr]
                    timeout=0.2,
                )
            except asyncio.TimeoutError:
                break
            if not chunk:
                break
            plain = await self._extract_plain_text(chunk)
            if plain:
                self._consume_plain_bytes(plain)

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

    def _ensure_reconnect_task(self) -> None:
        if self._stopping:
            return
        if self._reconnect_task and not self._reconnect_task.done():
            return
        self._reconnect_task = asyncio.create_task(
            self._reconnect_loop(),
            name=f"ttp_reconnect_{self.host}",
        )

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
        parts = [instance_tag, service]
        if instance_tag.lower() == "device":
            parts[0] = "DEVICE"
        if attribute:
            parts.append(attribute)
        for a in args:
            parts.append(str(a).lower() if isinstance(a, bool) else str(a))
        command = ' '.join(parts)

        async with self._lock:
            if not self._connected:
                return TTPResponse(ok=False, error_code="NOT_CONNECTED", raw='')
            try:
                await self._raw_send(command)
                raw = await asyncio.wait_for(self._response_queue.get(), timeout=self.read_timeout)
                return self._parse_response(raw)
            except asyncio.TimeoutError:
                logger.warning("TTPClient[%s] timeout waiting for response to: %s", self.host, command)
                return TTPResponse(ok=False, error_code="TIMEOUT", raw='')
            except Exception as exc:
                logger.error("TTPClient[%s] send error: %s", self.host, exc)
                return TTPResponse(ok=False, error_code="IO_ERROR", raw=str(exc))

    async def _raw_send(self, command: str) -> None:
        """Write a command line to the TCP stream."""
        line = (command + '\r\n').encode('ascii', errors='replace')
        self._writer.write(line)  # type: ignore[union-attr]
        await self._writer.drain()  # type: ignore[union-attr]

    @staticmethod
    def _parse_response(raw: str) -> TTPResponse:
        """Parse a TTP response line into a TTPResponse."""
        if raw.startswith("+OK"):
            payload = raw[3:].strip()
            value_str: Optional[str] = None
            if payload:
                if payload.startswith("value="):
                    value_str = payload[len("value="):]
                elif payload.startswith('"value":'):
                    value_str = payload[len('"value":'):]
                elif '"value":' in payload:
                    value_str = payload.split('"value":', 1)[1].strip()
                else:
                    value_str = payload
            value = _parse_value(value_str) if value_str is not None else None
            return TTPResponse(ok=True, value=value, raw=raw)

        if raw.startswith("-ERR"):
            payload = raw[4:].strip()
            if ":" in payload:
                code_part, detail_part = payload.split(":", 1)
                code = code_part.strip().split()[0] if code_part.strip() else "ERR"
                detail = detail_part.strip() or None
            else:
                parts = payload.split(None, 1)
                code = parts[0] if parts else "ERR"
                detail = parts[1] if len(parts) > 1 else None
            return TTPResponse(
                ok=False,
                raw=raw,
                error_code=code,
                error_detail=detail,
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
        self._subscriptions[key] = interval_ms
        if not self._connected:
            return  # Will be re-sent on reconnect via _do_connect()
        resp = await self.send(instance_tag, 'subscribe', attribute, interval_ms)
        if not resp.ok:
            logger.warning("Subscribe %s.%s failed: %s", instance_tag, attribute, resp.error_code)

    async def unsubscribe(self, instance_tag: str, attribute: str) -> None:
        """Cancel a push subscription."""
        key = (instance_tag, attribute)
        self._subscriptions.pop(key, None)
        if not self._connected:
            return
        resp = await self.send(instance_tag, 'unsubscribe', attribute)
        if not resp.ok:
            logger.warning("Unsubscribe %s.%s failed: %s", instance_tag, attribute, resp.error_code)

    def on_push(self, callback: Callable[[str, str, Any], None]) -> None:
        """Register a callback for push notifications: callback(instance_tag, attribute, value)."""
        self._push_callbacks.append(callback)

    def _dispatch_push_line(self, line: str) -> None:
        """Parse and dispatch a '! <tag> <attr> <value>' push line."""
        parts = line.split(maxsplit=3)
        if len(parts) < 4 or parts[0] != "!":
            logger.debug("Unrecognised push line: %r", line)
            return
        instance_tag, attribute, value_str = parts[1], parts[2], parts[3]
        value = _parse_value(value_str)
        for cb in self._push_callbacks:
            try:
                cb(instance_tag, attribute, value)
            except Exception as exc:
                logger.error("Push callback error: %s", exc)

    async def _extract_plain_text(self, chunk: bytes) -> bytes:
        """
        Strip Telnet IAC control sequences and send protocol-level replies.
        Returns only plain ASCII payload bytes.
        """
        self._telnet_pending.extend(chunk)
        plain = bytearray()
        replies = bytearray()

        i = 0
        while i < len(self._telnet_pending):
            b = self._telnet_pending[i]
            if b != _IAC_BYTE:
                plain.append(b)
                i += 1
                continue

            if i + 1 >= len(self._telnet_pending):
                break
            cmd = self._telnet_pending[i + 1]

            if cmd == _IAC_BYTE:
                plain.append(_IAC_BYTE)
                i += 2
                continue

            if cmd in (_DO, _DONT, _WILL, _WONT):
                if i + 2 >= len(self._telnet_pending):
                    break
                opt = self._telnet_pending[i + 2]
                if cmd == _DO:
                    replies.extend((_IAC_BYTE, _WONT, opt))
                elif cmd == _WILL:
                    replies.extend((_IAC_BYTE, _DONT, opt))
                i += 3
                continue

            if cmd == _SB:
                end = i + 2
                while end + 1 < len(self._telnet_pending):
                    if self._telnet_pending[end] == _IAC_BYTE and self._telnet_pending[end + 1] == _SE:
                        break
                    end += 1
                if end + 1 >= len(self._telnet_pending):
                    break
                i = end + 2
                continue

            # Unsupported Telnet command: skip IAC <cmd>.
            i += 2

        if i:
            del self._telnet_pending[:i]

        if replies and self._writer is not None:
            self._writer.write(bytes(replies))
            await self._writer.drain()

        return bytes(plain)

    def _consume_plain_bytes(self, plain: bytes) -> None:
        """Parse plain ASCII bytes into line-based TTP messages."""
        self._line_buffer.extend(plain)

        while True:
            nl = self._line_buffer.find(b'\n')
            if nl < 0:
                break
            line_bytes = self._line_buffer[:nl + 1]
            del self._line_buffer[:nl + 1]

            line = line_bytes.decode('ascii', errors='replace').strip()
            if not line:
                continue
            if line.startswith('!'):
                self._dispatch_push_line(line)
                continue
            if line.startswith('+OK') or line.startswith('-ERR'):
                self._response_queue.put_nowait(line)
                continue

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
                chunk = await self._reader.read(4096)  # type: ignore[union-attr]
                if not chunk:
                    break
                plain = await self._extract_plain_text(chunk)
                if not plain:
                    continue
                self._consume_plain_bytes(plain)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            if not self._stopping:
                logger.warning("TTPClient[%s:%d] read loop error: %s", self.host, self.port, exc)
        finally:
            if not self._stopping:
                self._connected = False
                logger.info("TTPClient[%s:%d] disconnected; scheduling reconnect", self.host, self.port)
                self._ensure_reconnect_task()


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
