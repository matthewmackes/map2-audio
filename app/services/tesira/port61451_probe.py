"""
Port 61451 probe — experimental attempt to enable TTP/Telnet on a configured
Biamp Tesira device via the proprietary discovery port.

Background
----------
Port 61451 (TCP/UDP) is Biamp's proprietary "device discovery & communication"
port.  It is open on ALL configured Tesira units regardless of whether TTP/SSH
is enabled.  Probe experiments show the device accepts input and returns exactly
8 bytes of binary data.  The protocol is undocumented.

Strategy
--------
1. Attempt TTP commands on port 61451 — same text format as port 23.  Try
   known attribute names for enabling Telnet.
2. Inspect the 8-byte response for success patterns:
   - First byte 0x00 is tentatively treated as "OK" (no error code).
   - Any non-zero first byte is tentatively treated as "error/unknown".
3. Try SSH port 22 — if open, the device has SSH-TTP available.
4. Never raise — always return a ProbeResult so callers can log and move on.

This module is intentionally conservative: it does not know the correct
command to enable Telnet and may never succeed.  Its value is:
  a) It may accidentally trigger Telnet enable on some firmware versions.
  b) It tells us the device IS alive so we know to keep retrying port 23.
  c) If Biamp ever documents the protocol, this is the hook to add real support.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

_PROBE_TIMEOUT  = 3.0   # seconds per connection attempt
_PORT_DISCOVERY = 61451
_PORT_SSH       = 22
_PORT_TTP       = 23

# TTP-format command candidates to try on port 61451
_TTP_ENABLE_CANDIDATES = [
    b"DEVICE set enableTelnet true\n",
    b"DEVICE set telnetEnabled true\n",
    b"DEVICE set ttpEnabled true\n",
    b"DEVICE set enableTTP true\n",
    b"DEVICE set telnet enable\n",
    b"DEVICE get version\n",        # identity probe to see if TTP works at all
]


@dataclass
class ProbeResult:
    host: str
    port61451_open: bool       = False
    ttp_on_61451_possible: bool = False   # first-byte-0x00 heuristic
    ssh_open: bool             = False
    ttp_now_open: bool         = False    # port 23 opened during/after probe
    error: Optional[str]       = None


async def probe_and_enable_ttp(host: str) -> ProbeResult:
    """
    Attempt to enable Telnet on *host* via port 61451 and SSH.
    Returns a ProbeResult describing what was found; never raises.
    """
    result = ProbeResult(host=host)
    try:
        await _run_probe(host, result)
    except Exception as exc:
        logger.debug("port61451_probe[%s]: unexpected error: %s", host, exc)
        result.error = str(exc)
    return result


async def _run_probe(host: str, result: ProbeResult) -> None:
    # Step 1: Verify port 61451 is open
    if not await _port_open(host, _PORT_DISCOVERY, _PROBE_TIMEOUT):
        logger.debug("port61451_probe[%s]: port 61451 not open", host)
        return
    result.port61451_open = True
    logger.debug("port61451_probe[%s]: port 61451 open — trying TTP commands", host)

    # Step 2: Try TTP commands on port 61451
    for cmd in _TTP_ENABLE_CANDIDATES:
        response = await _send_recv_61451(host, cmd)
        if response is not None:
            # 8-byte binary response — first byte 0x00 is tentatively "OK"
            first_byte = response[0] if response else 0xFF
            if first_byte == 0x00:
                result.ttp_on_61451_possible = True
                logger.info(
                    "port61451_probe[%s]: cmd %r → 0x00 first byte (possible success)",
                    host, cmd[:40],
                )
            else:
                logger.debug(
                    "port61451_probe[%s]: cmd %r → first byte 0x%02x",
                    host, cmd[:40], first_byte,
                )

    # Step 3: Check SSH (port 22) — if open, TTP via SSH is available
    if await _port_open(host, _PORT_SSH, _PROBE_TIMEOUT):
        result.ssh_open = True
        logger.info("port61451_probe[%s]: SSH port 22 is open", host)

    # Step 4: Check if port 23 (TTP) opened as a result of our commands
    if await _port_open(host, _PORT_TTP, 1.0):
        result.ttp_now_open = True
        logger.info("port61451_probe[%s]: port 23 is now open after probing", host)


async def _port_open(host: str, port: int, timeout: float) -> bool:
    """Return True if TCP port is open."""
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout
        )
        writer.close()
        try:
            await asyncio.wait_for(writer.wait_closed(), timeout=0.5)
        except Exception:
            pass
        return True
    except Exception:
        return False


async def _send_recv_61451(host: str, command: bytes) -> Optional[bytes]:
    """
    Open port 61451, send *command*, read up to 64 bytes response.
    Returns None on any error.
    """
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, _PORT_DISCOVERY),
            timeout=_PROBE_TIMEOUT,
        )
    except Exception as exc:
        logger.debug("port61451_probe[%s]: connect failed: %s", host, exc)
        return None

    try:
        writer.write(command)
        await asyncio.wait_for(writer.drain(), timeout=2.0)
        try:
            data = await asyncio.wait_for(reader.read(64), timeout=2.0)
            return data if data else None
        except asyncio.TimeoutError:
            return None
    except Exception as exc:
        logger.debug("port61451_probe[%s]: send/recv error: %s", host, exc)
        return None
    finally:
        try:
            writer.close()
            await asyncio.wait_for(writer.wait_closed(), timeout=0.5)
        except Exception:
            pass
