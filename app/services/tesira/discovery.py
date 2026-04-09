"""
TesiraDiscoveryService — auto-discover Biamp Tesira Forte AVB units via mDNS.

Factory-reset Tesira units advertise via mDNS as _tesira._tcp.local. and accept
TTP on port 23 with no password. This service:
  1. Browses _tesira._tcp.local. using the zeroconf library (already a MAP2 dep)
  2. For each found host, opens a TTP connection and fetches identity attributes
     (hostname, serialNumber, version, macAddress, model, partNumber)
  3. Exposes scan results and an adopt() method that persists the new device into
     tesira.devices config and hot-reloads it into the running TesiraFleet

Broadcasts the tesira:discovery WebSocket topic during scanning so the frontend
dialog can show devices as they are found (without waiting for the full timeout).
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import re
import socket
import subprocess
import threading
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# mDNS service type that Tesira units announce at factory reset
_TESIRA_SERVICE_TYPE = "_tesira._tcp.local."
_TTP_TIMEOUT = 3.0        # seconds per connection attempt
_DEFAULT_SCAN_TIMEOUT = 8.0
# Biamp proprietary discovery port — open on all configured Tesira units
# (used by Tesira Software to locate devices regardless of TTP state)
_BIAMP_DISCOVERY_PORT = 61451
_SUBNET_SCAN_CONCURRENCY = 100
_SUBNET_SCAN_TIMEOUT = 1.5   # seconds per host TCP probe


@dataclass
class DiscoveredTesiraDevice:
    host: str
    port: int
    mdns_name: str          # raw mDNS service name
    hostname: Optional[str]
    serial_number: Optional[str]
    firmware_version: Optional[str]
    model: Optional[str]    # "TesiraFORTE CI" | "TesiraFORTE VI" | ...
    part_number: Optional[str]
    mac_address: Optional[str]
    already_configured: bool = False
    # True  → TTP port 23 is open (factory-reset or TTP explicitly enabled)
    # False → found via port 61451 (configured unit; TTP/SSH may be disabled)
    ttp_enabled: bool = True


class TesiraDiscoveryService:
    """
    Stateless between scans. Call start_scan() to begin; get_status() to poll;
    adopt_device() to persist and hot-load a discovered unit.
    """

    def __init__(self) -> None:
        self._scan_result: List[DiscoveredTesiraDevice] = []
        self._is_scanning: bool = False
        self._scan_error: Optional[str] = None
        self._scan_task: Optional[asyncio.Task] = None

    # ──────────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────────

    async def start_scan(self, timeout_s: float = _DEFAULT_SCAN_TIMEOUT) -> None:
        """Start an async mDNS scan. Returns immediately; check get_status() to poll."""
        if self._is_scanning:
            logger.debug("TesiraDiscovery: scan already in progress")
            return
        self._scan_result = []
        self._scan_error = None
        self._is_scanning = True
        self._scan_task = asyncio.create_task(
            self._run_scan(timeout_s), name="tesira_discovery_scan"
        )

    def get_status(self) -> Dict[str, Any]:
        """Return current scan state for the polling GET endpoint."""
        return {
            "is_scanning": self._is_scanning,
            "devices": [asdict(d) for d in self._scan_result],
            "error": self._scan_error,
        }

    async def adopt_device(self, host: str, name: Optional[str] = None) -> Dict[str, Any]:
        """
        Persist a discovered device into tesira.devices config and connect it.

        Returns {"ok": True, "device_id": "tesira_<serial>"} on success,
        or {"ok": False, "error": "<message>"} on failure.
        """
        # Find the device in scan results (or re-probe if not found)
        found = next((d for d in self._scan_result if d.host == host), None)
        if found is None:
            # Re-probe the host directly
            found = await self._probe_host(host, _TTP_TIMEOUT)
            if found is None:
                return {"ok": False, "error": f"Could not connect to {host}:23"}

        device_name = name or found.hostname or found.mdns_name or host

        # Persist into config
        try:
            from app.config import config_get, config_set
            existing: List[Dict[str, Any]] = config_get("tesira.devices", []) or []
            # Avoid duplicates
            if not any(d.get("host") == host for d in existing):
                existing.append({"host": host, "port": found.port, "name": device_name, "enabled": True})
                config_set("tesira.devices", existing)
                logger.info("TesiraDiscovery: persisted %s (%s) to config", host, device_name)
        except Exception as exc:
            logger.warning("TesiraDiscovery: config_set failed: %s", exc)
            return {"ok": False, "error": f"Config persistence failed: {exc}"}

        # Hot-reload into the fleet
        device_id: str = f"tesira_{found.serial_number or host.replace('.', '_')}"
        try:
            from app.services.tesira import get_tesira_fleet
            from app.services.tesira.tesira_fleet import TesiraDeviceConfig
            fleet = get_tesira_fleet()
            cfg = TesiraDeviceConfig(host=host, port=found.port, name=device_name)
            # Only connect if not already in the fleet
            if device_id not in fleet._devices:
                await fleet._connect_device(cfg)
                # Update configs list so list_devices() shows the new unit
                if not any(c.host == host for c in fleet._configs):
                    fleet._configs.append(cfg)
            logger.info("TesiraDiscovery: adopted %s as %s", host, device_id)
        except Exception as exc:
            logger.error("TesiraDiscovery: fleet hot-reload failed for %s: %s", host, exc)
            return {"ok": False, "error": f"Fleet connect failed: {exc}"}

        # Broadcast device state event
        await self._broadcast("tesira:device_state", {
            "device_id": device_id,
            "event": "adopted",
            "host": host,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        return {"ok": True, "device_id": device_id}

    # ──────────────────────────────────────────────────────────────────────────
    # Internal: mDNS scan
    # ──────────────────────────────────────────────────────────────────────────

    async def _run_scan(self, timeout_s: float) -> None:
        """
        Main scan coroutine.

        Runs two discovery strategies concurrently:
          1. mDNS  (_tesira._tcp.local.) — finds factory-reset units with TTP open
          2. Port-61451 subnet scan      — finds ALL configured Tesira units
             (port 61451 is Biamp's proprietary discovery port, always open)

        For each found host we then try a TTP probe on port 23:
          - If TTP responds → DiscoveredTesiraDevice(ttp_enabled=True, full identity)
          - If TTP is closed → DiscoveredTesiraDevice(ttp_enabled=False, no identity)
        """
        try:
            # Launch both strategies concurrently; cap subnet scan at timeout_s
            mdns_task = asyncio.create_task(
                asyncio.wait_for(self._mdns_browse(timeout_s * 0.75), timeout=timeout_s)
            )
            subnet_task = asyncio.create_task(
                asyncio.wait_for(self._scan_subnet_port61451(), timeout=timeout_s)
            )

            mdns_hosts: List[tuple[str, int, str]] = []
            subnet_hosts: List[tuple[str, int, str]] = []

            try:
                mdns_hosts = await mdns_task
            except Exception as exc:
                logger.info("TesiraDiscovery: mDNS browse failed (%s)", exc)

            try:
                subnet_hosts = await subnet_task
            except Exception as exc:
                logger.info("TesiraDiscovery: subnet scan failed (%s)", exc)

            # De-duplicate: exclude subnet hosts already found via mDNS
            mdns_host_set = {h for h, _, _ in mdns_hosts}
            new_subnet = [(h, p, n) for h, p, n in subnet_hosts if h not in mdns_host_set]

            if not mdns_hosts and not new_subnet:
                logger.info("TesiraDiscovery: no Tesira units found (mDNS + port-61451)")
                await self._broadcast("tesira:discovery", {
                    "event": "scan_complete",
                    "total_found": 0,
                })
                return

            # Probe concurrently
            probe_tasks = [
                self._probe_and_record(host, port, mdns_name)
                for host, port, mdns_name in mdns_hosts
            ] + [
                self._probe_and_record_subnet(host, port)
                for host, port, _ in new_subnet
            ]
            await asyncio.gather(*probe_tasks, return_exceptions=True)

            await self._broadcast("tesira:discovery", {
                "event": "scan_complete",
                "total_found": len(self._scan_result),
            })

        except Exception as exc:
            self._scan_error = str(exc)
            logger.error("TesiraDiscovery: scan error: %s", exc)
            await self._broadcast("tesira:discovery", {
                "event": "scan_error",
                "error": str(exc),
            })
        finally:
            self._is_scanning = False

    async def _mdns_browse(self, timeout_s: float) -> List[tuple[str, int, str]]:
        """Browse _tesira._tcp.local. and return list of (host, port, service_name)."""
        try:
            from zeroconf import Zeroconf, ServiceBrowser
            from zeroconf._utils.ipaddress import cached_ip_addresses
        except ImportError:
            logger.warning("TesiraDiscovery: zeroconf not available")
            return []

        found: List[tuple[str, int, str]] = []
        zc = Zeroconf()

        class Listener:
            def add_service(self, zeroconf_inst: Any, svc_type: str, name: str) -> None:
                try:
                    info = zeroconf_inst.get_service_info(svc_type, name)
                    if info is None:
                        return
                    addresses = info.parsed_addresses()
                    if not addresses:
                        return
                    host = addresses[0]
                    port = int(info.port or 23)
                    found.append((host, port, name))
                    logger.debug("TesiraDiscovery: mDNS found %s at %s:%d", name, host, port)
                except Exception as e:
                    logger.debug("TesiraDiscovery: mDNS add_service error: %s", e)

            def remove_service(self, *_: Any) -> None:
                pass

            def update_service(self, *_: Any) -> None:
                pass

        listener = Listener()
        browser = ServiceBrowser(zc, _TESIRA_SERVICE_TYPE, listener)
        try:
            await asyncio.sleep(timeout_s)
        finally:
            browser.cancel()
            zc.close()

        return found

    async def _scan_subnet_port61451(self) -> List[tuple[str, int, str]]:
        """
        TCP-connect scan of local /24 subnets on port 61451 (Biamp proprietary
        discovery port).  Every configured Tesira unit keeps this port open
        regardless of whether TTP/SSH is enabled — it is how Biamp's own
        Tesira Software locates devices on the LAN.

        Returns list of (host, 23, '') for each responding host.
        Excludes the local machine's own addresses to avoid self-hits.
        """
        hosts: List[str] = []
        local_ips: set[str] = set()
        try:
            out = subprocess.check_output(
                ["ip", "-4", "addr", "show"], text=True, timeout=3
            )
            for m in re.finditer(r"inet (\d+\.\d+\.\d+\.\d+)/(\d+)", out):
                ip_str, prefix_str = m.group(1), m.group(2)
                local_ips.add(ip_str)
                if ip_str.startswith("127.") or ip_str.startswith("169.254."):
                    continue
                prefix = int(prefix_str)
                # Expand to /24 — don't scan wider than that
                scan_prefix = max(prefix, 24)
                network = ipaddress.ip_network(f"{ip_str}/{scan_prefix}", strict=False)
                hosts.extend(str(h) for h in network.hosts())
        except Exception as exc:
            logger.debug("TesiraDiscovery: could not enumerate local subnets: %s", exc)
            return []

        # De-duplicate and exclude own addresses
        hosts = list({h for h in hosts if h not in local_ips})

        if not hosts:
            return []

        logger.debug(
            "TesiraDiscovery: port-61451 scan — %d hosts across local /24 subnets", len(hosts)
        )

        results: List[tuple[str, int, str]] = []
        sem = asyncio.Semaphore(_SUBNET_SCAN_CONCURRENCY)

        async def _probe_61451(host: str) -> None:
            async with sem:
                try:
                    _, writer = await asyncio.wait_for(
                        asyncio.open_connection(host, _BIAMP_DISCOVERY_PORT),
                        timeout=_SUBNET_SCAN_TIMEOUT,
                    )
                    writer.close()
                    try:
                        await asyncio.wait_for(writer.wait_closed(), timeout=0.5)
                    except Exception:
                        pass
                    results.append((host, 23, ""))
                    logger.debug("TesiraDiscovery: port-61451 open on %s", host)
                except Exception:
                    pass

        await asyncio.gather(*[_probe_61451(h) for h in hosts], return_exceptions=True)
        logger.info(
            "TesiraDiscovery: port-61451 scan complete — %d possible Tesira unit(s)", len(results)
        )
        return results

    async def _probe_and_record_subnet(self, host: str, port: int) -> None:
        """
        Handle a host found via port-61451 scan.

        Tries TTP port 23 first — if it responds we get full identity and
        ttp_enabled=True (i.e., this is a configured device with TTP on).
        If port 23 is closed we record a minimal device with ttp_enabled=False.
        """
        # Try TTP probe
        dev = await self._probe_host(host, _TTP_TIMEOUT, port=port)
        if dev is not None:
            dev.ttp_enabled = True
        else:
            # TTP disabled — record with what we know
            dev = DiscoveredTesiraDevice(
                host=host,
                port=port,
                mdns_name=host,
                hostname=None,
                serial_number=None,
                firmware_version=None,
                model=None,
                part_number=None,
                mac_address=None,
                ttp_enabled=False,
            )

        # Mark already_configured
        try:
            from app.config import config_get
            devices: List[Dict[str, Any]] = config_get("tesira.devices", []) or []
            dev.already_configured = any(d.get("host") == host for d in devices)
        except Exception:
            pass

        self._scan_result.append(dev)
        await self._broadcast("tesira:discovery", {
            "event": "device_found",
            "device": asdict(dev),
            "total_found": len(self._scan_result),
        })

    async def _probe_and_record(
        self, host: str, port: int, mdns_name: str
    ) -> None:
        """Probe a host via TTP, build DiscoveredTesiraDevice, and add to results."""
        dev = await self._probe_host(host, _TTP_TIMEOUT, port=port, mdns_name=mdns_name)
        if dev is None:
            return

        # Mark as already_configured if the host appears in current config
        try:
            from app.config import config_get
            devices: List[Dict[str, Any]] = config_get("tesira.devices", []) or []
            dev.already_configured = any(d.get("host") == host for d in devices)
        except Exception:
            pass

        self._scan_result.append(dev)

        await self._broadcast("tesira:discovery", {
            "event": "device_found",
            "device": asdict(dev),
            "total_found": len(self._scan_result),
        })

    async def _probe_host(
        self,
        host: str,
        timeout: float,
        port: int = 23,
        mdns_name: str = "",
    ) -> Optional[DiscoveredTesiraDevice]:
        """
        Open a TTP connection to host:port, send identity GET commands,
        return a populated DiscoveredTesiraDevice or None on failure.
        """
        reader: Any = None
        writer: Any = None
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port),
                timeout=timeout,
            )
        except Exception as exc:
            logger.debug("TesiraDiscovery: cannot reach %s:%d: %s", host, port, exc)
            return None

        try:
            identity = await self._fetch_identity(reader, writer)
        except Exception as exc:
            logger.debug("TesiraDiscovery: identity fetch failed for %s: %s", host, exc)
            identity = {}
        finally:
            try:
                writer.close()
                await asyncio.wait_for(writer.wait_closed(), timeout=1.0)
            except Exception:
                pass

        return DiscoveredTesiraDevice(
            host=host,
            port=port,
            mdns_name=mdns_name or host,
            hostname=identity.get("hostname"),
            serial_number=identity.get("serialNumber"),
            firmware_version=identity.get("version"),
            model=identity.get("model"),
            part_number=identity.get("partNumber"),
            mac_address=identity.get("macAddress"),
        )

    async def _fetch_identity(
        self, reader: Any, writer: Any
    ) -> Dict[str, Optional[str]]:
        """
        Send a series of TTP GET commands and collect values.
        TTP format:  device get <attribute>\n
        Response:    +OK value="<value>"  or  -ERR ...
        """
        attributes = [
            "hostname", "serialNumber", "version",
            "model", "partNumber", "macAddress",
        ]
        result: Dict[str, Optional[str]] = {}

        for attr in attributes:
            cmd = f"device get {attr}\n"
            writer.write(cmd.encode())
            await asyncio.wait_for(writer.drain(), timeout=2.0)
            try:
                raw_line = await asyncio.wait_for(reader.readline(), timeout=2.0)
                line = raw_line.decode(errors="replace").strip()
                value = _parse_ttp_value(line)
                result[attr] = value
            except asyncio.TimeoutError:
                result[attr] = None

        return result

    # ──────────────────────────────────────────────────────────────────────────
    # WebSocket helper (mirrors TesiraFleet._broadcast pattern)
    # ──────────────────────────────────────────────────────────────────────────

    async def _broadcast(self, topic: str, data: Dict[str, Any]) -> None:
        try:
            from app.services.websocket_manager import get_websocket_manager
            ws_manager = get_websocket_manager()
            await ws_manager.broadcast_json({"type": topic, "data": data}, topic=topic)
        except Exception as exc:
            logger.debug("TesiraDiscovery: WS broadcast error on %s: %s", topic, exc)


# ──────────────────────────────────────────────────────────────────────────────
# Helper: parse a TTP "+OK value=..." or "+OK value="..." line
# ──────────────────────────────────────────────────────────────────────────────

def _parse_ttp_value(line: str) -> Optional[str]:
    """
    Extract value from TTP response lines:
      +OK value="TesiraFORTE CI"   → "TesiraFORTE CI"
      +OK value=3.9.0.1            → "3.9.0.1"
      -ERR ...                     → None
    """
    if not line.startswith("+OK"):
        return None
    if "value=" not in line:
        return None
    raw = line.split("value=", 1)[1].strip()
    # Strip surrounding quotes if present
    if raw.startswith('"') and raw.endswith('"'):
        raw = raw[1:-1]
    return raw or None


# ──────────────────────────────────────────────────────────────────────────────
# Singleton accessor
# ──────────────────────────────────────────────────────────────────────────────

_discovery_service: Optional[TesiraDiscoveryService] = None
_discovery_service_lock = threading.Lock()


def get_tesira_discovery() -> TesiraDiscoveryService:
    """Return the singleton TesiraDiscoveryService."""
    global _discovery_service
    if _discovery_service is None:
        with _discovery_service_lock:
            if _discovery_service is None:
                _discovery_service = TesiraDiscoveryService()
    return _discovery_service
