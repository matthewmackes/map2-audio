"""
PipeWire Audio Server Integration Service

Primary audio server monitoring and control for the MAP2 Audio Platform.
Wraps PipeWire CLI tools (pw-dump, pw-metadata, wpctl) to provide:
- Daemon health monitoring
- Audio graph topology (devices, nodes, streams, links)
- Quantum (buffer) and sample rate control
- Volume/mute control per node
- XRun detection and latency reporting
- Real-time WebSocket broadcasting
- Alerting for audio infrastructure failures
"""

import asyncio
import json
import logging
import os
import re
import shutil
import threading
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

def _pipewire_env() -> Dict[str, str]:
    """Build a PipeWire CLI environment without hardcoded user assumptions."""
    env = dict(os.environ)
    env["PATH"] = env.get("PATH") or "/usr/bin:/usr/local/bin:/bin"
    env["HOME"] = env.get("HOME") or str(Path.home())
    env["XDG_RUNTIME_DIR"] = env.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}"
    return env

# Tool availability flags (checked once at import)
HAS_PW_DUMP = shutil.which("pw-dump") is not None
HAS_PW_METADATA = shutil.which("pw-metadata") is not None
HAS_WPCTL = shutil.which("wpctl") is not None

# Constants for wpctl parsing
_STREAM_SUBPORT_INDENT_THRESHOLD = 10  # Deeper indents are sub-ports, not top-level streams


# ============================================================================
# Data Classes
# ============================================================================

@dataclass
class PipeWireDaemonInfo:
    running: bool = False
    version: str = ""
    name: str = ""
    hostname: str = ""
    cookie: str = ""
    uptime_seconds: float = 0.0


@dataclass
class PipeWireDeviceInfo:
    id: int = 0
    name: str = ""
    nick: str = ""
    driver: str = ""
    bus: str = ""
    media_class: str = ""
    is_default: bool = False
    properties: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PipeWireNodeInfo:
    id: int = 0
    name: str = ""
    nick: str = ""
    description: str = ""
    media_class: str = ""
    device_id: Optional[int] = None
    sample_rate: Optional[int] = None
    channels: int = 0
    format: str = ""
    volume: float = 1.0
    muted: bool = False
    is_driver: bool = False
    is_default: bool = False
    state: str = ""
    properties: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PipeWireStreamInfo:
    id: int = 0
    client_name: str = ""
    client_pid: int = 0
    media_name: str = ""
    direction: str = ""
    state: str = ""
    channels: int = 0
    sample_rate: Optional[int] = None


@dataclass
class PipeWireLinkInfo:
    id: int = 0
    output_node: int = 0
    output_port: str = ""
    input_node: int = 0
    input_port: str = ""
    state: str = ""


@dataclass
class PipeWireSettings:
    clock_rate: int = 48000
    clock_force_rate: int = 0
    clock_quantum: int = 1024
    clock_force_quantum: int = 0
    clock_min_quantum: int = 32
    clock_max_quantum: int = 2048
    clock_allowed_rates: List[int] = field(default_factory=lambda: [48000])


@dataclass
class PipeWireMetrics:
    daemon: PipeWireDaemonInfo = field(default_factory=PipeWireDaemonInfo)
    settings: PipeWireSettings = field(default_factory=PipeWireSettings)
    default_sink: Optional[PipeWireNodeInfo] = None
    default_source: Optional[PipeWireNodeInfo] = None
    devices: List[PipeWireDeviceInfo] = field(default_factory=list)
    nodes: List[PipeWireNodeInfo] = field(default_factory=list)
    streams: List[PipeWireStreamInfo] = field(default_factory=list)
    links: List[PipeWireLinkInfo] = field(default_factory=list)
    client_count: int = 0
    xruns: int = 0
    graph_latency_ms: float = 0.0
    driver_latency_ms: float = 0.0
    total_latency_ms: float = 0.0
    alerts: List[Dict[str, str]] = field(default_factory=list)
    timestamp: str = ""


# ============================================================================
# PipeWire Service
# ============================================================================

class PipeWireService:
    """Primary PipeWire audio server monitoring and control service."""

    def __init__(self):
        self._start_time = time.monotonic()
        self._daemon_running_since: Optional[float] = None
        self._last_xrun_count = 0
        self._broadcast_task: Optional[asyncio.Task] = None
        self._cached_snapshot: Optional[PipeWireMetrics] = None
        self._cache_time: float = 0.0
        self._cache_ttl: float = 1.0  # seconds

    # ---------------------------------------------------------------
    # Subprocess helpers
    # ---------------------------------------------------------------

    async def _run_cmd_result(self, cmd: List[str], timeout: float = 5.0) -> tuple[str, str, int]:
        """Run a subprocess command and return stdout, stderr, and return code."""
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=_pipewire_env(),
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
            stdout_text = stdout.decode()
            stderr_text = stderr.decode().strip()
            if proc.returncode != 0:
                # Use warning for critical commands, debug for informational
                if cmd[0] in ['wpctl', 'pw-dump', 'pw-metadata']:
                    logger.warning(f"Command {cmd[0]} returned {proc.returncode}: {stderr_text}")
                else:
                    logger.debug(f"Command {cmd[0]} returned {proc.returncode}: {stderr_text}")
            return stdout_text, stderr_text, int(proc.returncode)
        except asyncio.TimeoutError:
            logger.warning(f"Command {cmd[0]} timed out after {timeout}s")
            return "", f"timed out after {timeout}s", 124
        except FileNotFoundError:
            logger.debug(f"Command not found: {cmd[0]}")
            return "", "command not found", 127
        except Exception as e:
            logger.debug(f"Command {cmd[0]} error: {e}")
            return "", str(e), 1

    async def _run_cmd(self, cmd: List[str], timeout: float = 5.0) -> str:
        """Run a subprocess command and return stdout."""
        stdout, _stderr, _returncode = await self._run_cmd_result(cmd, timeout)
        return stdout

    async def _run_cmd_json(self, cmd: List[str], timeout: float = 5.0) -> Any:
        """Run a subprocess command and parse JSON output."""
        output = await self._run_cmd(cmd, timeout)
        if not output.strip():
            return []
        try:
            return json.loads(output)
        except json.JSONDecodeError as e:
            logger.debug(f"JSON parse error from {cmd[0]}: {e}")
            return []

    # ---------------------------------------------------------------
    # Daemon status
    # ---------------------------------------------------------------

    async def check_daemon(self) -> PipeWireDaemonInfo:
        """Check PipeWire daemon status by parsing wpctl status header."""
        info = PipeWireDaemonInfo()

        if not HAS_WPCTL:
            return info

        output = await self._run_cmd(["wpctl", "status"])
        if not output:
            self._daemon_running_since = None
            return info

        # First line: PipeWire 'pipewire-0' [1.4.9, mm@MAP2-TESTBED, cookie:3716221001]
        first_line = output.split("\n")[0].strip()
        m = re.match(
            r"PipeWire\s+'([^']+)'\s+\[([^,]+),\s*([^@]+)@([^,]+),\s*cookie:(\d+)\]",
            first_line,
        )
        if m:
            now = time.monotonic()
            info.running = True
            info.name = m.group(1)
            info.version = m.group(2)
            info.hostname = m.group(4)
            info.cookie = m.group(5)
            if self._daemon_running_since is None:
                self._daemon_running_since = now
            info.uptime_seconds = now - self._daemon_running_since
        else:
            self._daemon_running_since = None

        return info

    # ---------------------------------------------------------------
    # wpctl status parser
    # ---------------------------------------------------------------

    async def _parse_wpctl_status(self) -> Dict[str, Any]:
        """Parse wpctl status into structured sections.

        wpctl uses tree-drawing characters (├─ └─ │) and the format is:
        PipeWire 'pipewire-0' [1.4.9, ...]
         └─ Clients:
                32. WirePlumber    [1.4.9, ...]
        Audio
         ├─ Devices:
         │      47. EDIROL UA-1000    [alsa]
         ├─ Sinks:
         │  *   54. EDIROL UA-1000    [vol: 1.00]
         └─ Streams:
                51. PipeWire ALSA [python3.14]
                     85. monitor_FR   (sub-port, deeper indent)
        """
        output = await self._run_cmd(["wpctl", "status"])
        if not output:
            return {}

        result: Dict[str, Any] = {
            "clients": [],
            "devices": [],
            "sinks": [],
            "sources": [],
            "streams": [],
        }

        current_section = None
        current_top_level = None  # "Audio" or "Video" or None

        # Strip tree chars from a line for cleaner parsing
        def strip_tree(line: str) -> str:
            return re.sub(r"[│├└─┬┼┤┘┐┌┏┗┃┠┣┛┓]", " ", line)

        # Entry pattern: optional *, digits, dot, name, optional [last bracket info]
        # Use a greedy name match anchored to the LAST [...] bracket pair
        # This correctly handles names with brackets like 'WirePlumber [export]'
        entry_re = re.compile(r"(\*?)\s*(\d+)\.\s+(.+?)\s+\[([^\[\]]+)\]\s*$")
        # Fallback for entries without info brackets (name only)
        entry_no_info_re = re.compile(r"(\*?)\s*(\d+)\.\s+(.+?)\s*$")

        for raw_line in output.split("\n"):
            clean = strip_tree(raw_line)
            stripped = clean.strip()

            if not stripped:
                continue

            # Top-level section markers
            if stripped == "Audio":
                current_top_level = "Audio"
                continue
            elif stripped == "Video":
                current_top_level = "Video"
                current_section = None
                continue
            elif stripped == "Settings":
                current_top_level = "Settings"
                current_section = None
                continue

            # Sub-section headers
            if "Clients:" in stripped:
                current_section = "clients"
                continue
            elif "Devices:" in stripped and current_top_level == "Audio":
                current_section = "devices"
                continue
            elif "Sinks:" in stripped:
                current_section = "sinks"
                continue
            elif "Sources:" in stripped:
                current_section = "sources"
                continue
            elif "Filters:" in stripped:
                current_section = None  # skip filters
                continue
            elif "Streams:" in stripped and current_top_level == "Audio":
                current_section = "streams"
                continue

            if current_section is None or current_top_level == "Video":
                continue

            # For streams: only match top-level entries (not sub-ports)
            # Sub-ports have much deeper indentation

            # Determine indentation level from cleaned line
            indent = len(clean) - len(clean.lstrip())

            # In streams section, sub-ports have deeper indentation
            # Skip them to only get top-level stream entries
            if current_section == "streams" and indent > _STREAM_SUBPORT_INDENT_THRESHOLD:
                continue  # skip sub-port entries

            # Try matching with info brackets first, then without
            m = entry_re.search(stripped)
            if m:
                is_default = m.group(1) == "*"
                obj_id = int(m.group(2))
                name = m.group(3).strip()
                info_str = m.group(4) or ""
            else:
                m2 = entry_no_info_re.search(stripped)
                if not m2:
                    continue
                is_default = m2.group(1) == "*"
                obj_id = int(m2.group(2))
                name = m2.group(3).strip()
                info_str = ""

            entry = {
                "id": obj_id,
                "name": name,
                "info": info_str,
                "is_default": is_default,
            }
            result[current_section].append(entry)

        return result

    # ---------------------------------------------------------------
    # Devices and nodes
    # ---------------------------------------------------------------

    async def get_devices(self) -> List[PipeWireDeviceInfo]:
        """Get audio devices from PipeWire."""
        status = await self._parse_wpctl_status()
        devices = []

        for entry in status.get("devices", []):
            dev = PipeWireDeviceInfo(
                id=entry["id"],
                name=entry["name"],
                nick=entry["name"],
                media_class="Audio/Device",
                is_default=entry["is_default"],
            )
            # Extract driver hint from info bracket
            if entry["info"]:
                dev.driver = entry["info"]

            devices.append(dev)

        return devices

    async def _get_pw_dump_nodes(self, dump: Optional[List] = None) -> Dict[int, Dict[str, Any]]:
        """Get a map of node_id -> pw-dump node info for enrichment."""
        if dump is None:
            if not HAS_PW_DUMP:
                return {}
            dump = await self._run_cmd_json(["pw-dump"])
        if not isinstance(dump, list):
            return {}

        node_map: Dict[int, Dict[str, Any]] = {}
        for obj in dump:
            if obj.get("type") != "PipeWire:Interface:Node":
                continue
            nid = obj.get("id", 0)
            info = obj.get("info", {})
            props = info.get("props", {})
            node_map[nid] = {
                "state": info.get("state", ""),
                "is_driver": bool(props.get("node.driver", False)),
                "media_class": props.get("media.class", ""),
                "name": props.get("node.name", ""),
                "nick": props.get("node.nick", props.get("node.description", "")),
                "description": props.get("node.description", ""),
                "sample_rate": props.get("audio.rate") or props.get("object.rate"),
                "channels": props.get("audio.channels", 0),
                "format": props.get("audio.format", ""),
                "device_id": props.get("device.id"),
            }
        return node_map

    async def get_nodes(self, dump: Optional[List] = None) -> List[PipeWireNodeInfo]:
        """Get sink and source nodes from PipeWire.
        
        Combines wpctl status (for defaults/volume) with pw-dump (for state,
        driver flag, channels, sample rate).
        """
        status = await self._parse_wpctl_status()
        pw_nodes = await self._get_pw_dump_nodes(dump)
        nodes = []

        for section, media_class in [("sinks", "Audio/Sink"), ("sources", "Audio/Source")]:
            for entry in status.get(section, []):
                node = PipeWireNodeInfo(
                    id=entry["id"],
                    name=entry["name"],
                    nick=entry["name"],
                    description=entry["name"],
                    media_class=media_class,
                    is_default=entry["is_default"],
                )
                # Parse volume from info: "vol: 1.00" or "vol: 1.00 MUTED"
                info = entry.get("info", "")
                vol_m = re.search(r"vol:\s*([\d.]+)", info)
                if vol_m:
                    try:
                        node.volume = float(vol_m.group(1))
                    except (ValueError, AttributeError):
                        node.volume = 1.0
                if "MUTED" in info:
                    node.muted = True

                # Enrich from pw-dump
                pw_info = pw_nodes.get(entry["id"])
                if pw_info:
                    node.state = pw_info["state"]
                    node.is_driver = pw_info["is_driver"]
                    if pw_info.get("nick"):
                        node.nick = pw_info["nick"]
                    if pw_info.get("description"):
                        node.description = pw_info["description"]
                    if pw_info["sample_rate"]:
                        node.sample_rate = int(pw_info["sample_rate"])
                    if pw_info["channels"]:
                        node.channels = int(pw_info["channels"])
                    if pw_info["format"]:
                        node.format = pw_info["format"]
                    if pw_info.get("device_id") is not None:
                        node.device_id = int(pw_info["device_id"])

                nodes.append(node)

        return nodes

    async def get_streams(self, dump: Optional[List] = None) -> List[PipeWireStreamInfo]:
        """Get active audio streams from PipeWire.
        
        Discovers streams from both wpctl status AND pw-dump.
        Client nodes like JUCEJack/PortAudio that have active links
        are included as streams even if wpctl doesn't list them.
        """
        status = await self._parse_wpctl_status()
        streams = []
        seen_ids = set()

        # 1) Streams from wpctl status
        for entry in status.get("streams", []):
            stream = PipeWireStreamInfo(
                id=entry["id"],
                client_name=entry["name"],
                media_name=entry["name"],
            )
            # Extract PID from name like "PipeWire ALSA [python3.14]"
            pid_m = re.search(r"\[([^\]]+)\]", entry["name"])
            if pid_m:
                stream.media_name = pid_m.group(1)
            streams.append(stream)
            seen_ids.add(entry["id"])

        # 2) Discover client nodes from pw-dump that are connected
        #    but not listed by wpctl (e.g. JUCEJack, PortAudio)
        if not HAS_PW_DUMP:
            return streams

        if dump is None:
            dump = await self._run_cmd_json(["pw-dump"])
        if not isinstance(dump, list):
            return streams

        # Collect IDs of known sinks/sources/devices from wpctl
        sink_source_ids = set()
        for section in ("sinks", "sources", "devices"):
            for entry in status.get(section, []):
                sink_source_ids.add(entry["id"])

        linked_node_ids = set()
        link_output_nodes = set()
        link_input_nodes = set()
        for obj in dump:
            if obj.get("type") != "PipeWire:Interface:Link":
                continue
            info = obj.get("info", {})
            props = info.get("props", {})
            if info.get("state") in ("active", "paused"):
                output_node = props.get("link.output.node", 0)
                input_node = props.get("link.input.node", 0)
                linked_node_ids.add(output_node)
                linked_node_ids.add(input_node)
                link_output_nodes.add(output_node)
                link_input_nodes.add(input_node)

        client_pid_by_client_id: Dict[int, int] = {}
        for obj in dump:
            if obj.get("type") != "PipeWire:Interface:Client":
                continue
            client_id = obj.get("id")
            if not isinstance(client_id, int):
                continue
            client_pid = obj.get("info", {}).get("props", {}).get("application.process.id", 0)
            if isinstance(client_pid, (int, float)):
                client_pid_by_client_id[client_id] = int(client_pid)

        # Find audio client nodes that are linked but not sinks/sources
        for obj in dump:
            if obj.get("type") != "PipeWire:Interface:Node":
                continue
            nid = obj.get("id", 0)
            if nid in seen_ids or nid in sink_source_ids:
                continue
            info = obj.get("info", {})
            props = info.get("props", {})
            state = info.get("state", "")

            # Skip internal driver nodes (Dummy-Driver, Freewheel, etc.)
            media_class = props.get("media.class", "")
            node_name = props.get("node.name", "")
            if props.get("node.driver") and not media_class:
                continue

            # Include if: node is running/idle AND has active links
            if state in ("running", "idle") and nid in linked_node_ids:
                nick = props.get("node.nick", props.get("node.description", node_name))
                client_pid = 0
                client_id = props.get("client.id")
                if isinstance(client_id, int):
                    client_pid = client_pid_by_client_id.get(client_id, 0)

                direction = ""
                is_output = nid in link_output_nodes
                is_input = nid in link_input_nodes
                if is_output and is_input:
                    direction = "duplex"
                elif is_output:
                    direction = "output"
                elif is_input:
                    direction = "input"

                streams.append(PipeWireStreamInfo(
                    id=nid,
                    client_name=nick or node_name,
                    client_pid=client_pid,
                    media_name=node_name,
                    direction=direction,
                    state=state,
                    channels=int(props.get("audio.channels", 0)),
                    sample_rate=int(props["audio.rate"]) if props.get("audio.rate") else None,
                ))
                seen_ids.add(nid)

        return streams

    async def get_clients(self) -> List[Dict[str, Any]]:
        """Get connected PipeWire clients."""
        status = await self._parse_wpctl_status()
        return [
            {"id": c["id"], "name": c["name"], "info": c["info"]}
            for c in status.get("clients", [])
        ]

    # ---------------------------------------------------------------
    # Links (requires pw-dump)
    # ---------------------------------------------------------------

    async def get_links(self, dump: Optional[List] = None) -> List[PipeWireLinkInfo]:
        """Get port connections from PipeWire graph."""
        if dump is None:
            if not HAS_PW_DUMP:
                return []
            dump = await self._run_cmd_json(["pw-dump"])
        return self._extract_links(dump)

    async def _get_links_from_dump(self, dump: Optional[List]) -> List[PipeWireLinkInfo]:
        """Get links from a pre-fetched pw-dump."""
        if dump is None:
            return []
        return self._extract_links(dump)

    def _extract_links(self, dump: List) -> List[PipeWireLinkInfo]:
        """Extract link info from pw-dump data."""
        if not isinstance(dump, list):
            return []
        links = []
        for obj in dump:
            if obj.get("type") != "PipeWire:Interface:Link":
                continue
            info = obj.get("info", {})
            props = info.get("props", {})
            links.append(PipeWireLinkInfo(
                id=obj.get("id", 0),
                output_node=props.get("link.output.node", 0),
                output_port=str(props.get("link.output.port", "")),
                input_node=props.get("link.input.node", 0),
                input_port=str(props.get("link.input.port", "")),
                state=info.get("state", ""),
            ))
        return links

    # ---------------------------------------------------------------
    # Settings (requires pw-metadata)
    # ---------------------------------------------------------------

    async def get_settings(self) -> PipeWireSettings:
        """Get current PipeWire clock settings."""
        settings = PipeWireSettings()

        if not HAS_PW_METADATA:
            return settings

        output = await self._run_cmd(["pw-metadata", "-n", "settings"])
        if not output:
            return settings

        # Parse lines like: update: id:0 key:'clock.rate' value:'48000' type:''
        for line in output.split("\n"):
            m = re.search(r"key:'([^']+)'\s+value:'([^']*)'", line)
            if not m:
                continue
            key, value = m.group(1), m.group(2)

            if key == "clock.rate":
                settings.clock_rate = int(value) if value else 48000
            elif key == "clock.force-rate":
                settings.clock_force_rate = int(value) if value else 0
            elif key == "clock.quantum":
                settings.clock_quantum = int(value) if value else 1024
            elif key == "clock.force-quantum":
                settings.clock_force_quantum = int(value) if value else 0
            elif key == "clock.min-quantum":
                settings.clock_min_quantum = int(value) if value else 32
            elif key == "clock.max-quantum":
                settings.clock_max_quantum = int(value) if value else 2048
            elif key == "clock.allowed-rates":
                # Value like "[ 48000 ]" or "[ 44100 48000 96000 ]"
                rates_m = re.findall(r"\d+", value)
                if rates_m:
                    settings.clock_allowed_rates = [int(r) for r in rates_m]

        return settings

    async def set_quantum(self, quantum: int) -> bool:
        """Set PipeWire DSP quantum (buffer period size).

        Valid values: powers of 2 between min_quantum and max_quantum.
        Set to 0 to return to automatic/default.
        """
        if not HAS_PW_METADATA:
            logger.error("pw-metadata not available - cannot set quantum")
            return False

        # Validate
        if quantum != 0 and (quantum < 16 or quantum > 8192):
            logger.error(f"Invalid quantum {quantum}: must be 0 or 16-8192")
            return False

        _stdout, _stderr, returncode = await self._run_cmd_result([
            "pw-metadata", "-n", "settings", "0",
            "clock.force-quantum", str(quantum),
        ])
        if returncode != 0:
            logger.error("Failed to set PipeWire quantum to %s", quantum)
            return False
        logger.info(f"Set PipeWire quantum to {quantum}")
        return True

    async def set_rate(self, rate: int) -> bool:
        """Set PipeWire forced sample rate.

        Set to 0 to return to automatic.
        """
        if not HAS_PW_METADATA:
            logger.error("pw-metadata not available - cannot set rate")
            return False

        # Get current allowed rates from PipeWire settings
        settings = await self.get_settings()
        valid_rates = [0] + settings.clock_allowed_rates
        if rate not in valid_rates:
            logger.error(f"Invalid rate {rate}: must be one of {valid_rates}")
            return False

        _stdout, _stderr, returncode = await self._run_cmd_result([
            "pw-metadata", "-n", "settings", "0",
            "clock.force-rate", str(rate),
        ])
        if returncode != 0:
            logger.error("Failed to set PipeWire sample rate to %s", rate)
            return False
        logger.info(f"Set PipeWire sample rate to {rate}")
        return True

    # ---------------------------------------------------------------
    # Volume / mute (wpctl)
    # ---------------------------------------------------------------

    async def get_volume(self, node_id: int) -> Dict[str, Any]:
        """Get volume and mute state for a node."""
        output = await self._run_cmd(["wpctl", "get-volume", str(node_id)])
        # Output: "Volume: 1.000000" or "Volume: 1.000000 [MUTED]"
        result = {"volume": 1.0, "muted": False}
        if output:
            vol_m = re.search(r"Volume:\s*([\d.]+)", output)
            if vol_m:
                result["volume"] = float(vol_m.group(1))
            result["muted"] = "[MUTED]" in output
        return result

    async def set_volume(self, node_id: int, volume: float) -> bool:
        """Set volume for a node (0.0 to 1.5)."""
        volume = max(0.0, min(1.5, volume))
        _stdout, _stderr, returncode = await self._run_cmd_result(
            ["wpctl", "set-volume", str(node_id), f"{volume:.2f}"]
        )
        return returncode == 0

    async def set_mute(self, node_id: int, mute: bool) -> bool:
        """Set mute state for a node."""
        _stdout, _stderr, returncode = await self._run_cmd_result(
            ["wpctl", "set-mute", str(node_id), "1" if mute else "0"]
        )
        return returncode == 0

    # ---------------------------------------------------------------
    # XRun detection (from pw-dump driver stats)
    # ---------------------------------------------------------------

    async def _get_driver_xruns(self, dump: Optional[List] = None) -> int:
        """Get xrun count from PipeWire driver nodes."""
        if dump is None:
            if not HAS_PW_DUMP:
                return 0
            dump = await self._run_cmd_json(["pw-dump"])
        return self._extract_xruns(dump)

    async def _get_xruns_from_dump(self, dump: Optional[List]) -> int:
        """Get xruns from a pre-fetched pw-dump."""
        if dump is None:
            return 0
        return self._extract_xruns(dump)

    def _extract_xruns(self, dump: List) -> int:
        """Extract xrun count from pw-dump data."""
        if not isinstance(dump, list):
            return 0

        total_xruns = 0
        for obj in dump:
            if obj.get("type") != "PipeWire:Interface:Node":
                continue
            info = obj.get("info", {})
            props = info.get("props", {})
            if props.get("node.driver"):
                params = info.get("params", {})
                for p in params.get("ProcessLatency", []):
                    xruns = p.get("xrun", p.get("xrun-count", 0))
                    if isinstance(xruns, (int, float)):
                        total_xruns += int(xruns)
                driver_stats = info.get("driver-stats", {})
                if isinstance(driver_stats, dict):
                    xruns = driver_stats.get("xrun-count", 0)
                    if isinstance(xruns, (int, float)):
                        total_xruns += int(xruns)

        return total_xruns

    # ---------------------------------------------------------------
    # Latency computation
    # ---------------------------------------------------------------

    def _compute_latency(self, settings: PipeWireSettings) -> Dict[str, float]:
        """Compute latency from PipeWire settings."""
        rate = settings.clock_rate if settings.clock_rate > 0 else 48000
        quantum = settings.clock_force_quantum if settings.clock_force_quantum > 0 else settings.clock_quantum

        graph_ms = (quantum / rate) * 1000.0

        # Driver latency is typically 1 additional quantum for USB
        driver_ms = graph_ms

        return {
            "graph_latency_ms": round(graph_ms, 3),
            "driver_latency_ms": round(driver_ms, 3),
            "total_latency_ms": round(graph_ms + driver_ms, 3),
        }

    # ---------------------------------------------------------------
    # Full graph snapshot
    # ---------------------------------------------------------------

    async def get_graph_snapshot(self) -> PipeWireMetrics:
        """Get a complete PipeWire metrics snapshot.

        Results are cached for _cache_ttl seconds to avoid excessive subprocess calls.
        Fetches pw-dump ONCE and shares it across all methods that need it.
        """
        now = time.monotonic()
        if self._cached_snapshot and (now - self._cache_time) < self._cache_ttl:
            return self._cached_snapshot

        daemon = await self.check_daemon()
        if not daemon.running:
            return PipeWireMetrics(
                daemon=daemon,
                timestamp=datetime.now(timezone.utc).isoformat(),
                alerts=[{"type": "pipewire_daemon_down", "severity": "error",
                         "message": "PipeWire daemon is not running"}],
            )

        # Fetch pw-dump ONCE — shared by nodes, streams, links, xruns
        dump = None
        if HAS_PW_DUMP:
            dump = await self._run_cmd_json(["pw-dump"])
            if not isinstance(dump, list):
                dump = None

        # Gather data concurrently (pass shared dump where needed)
        settings_task = self.get_settings()
        nodes_task = self.get_nodes(dump=dump)
        devices_task = self.get_devices()
        streams_task = self.get_streams(dump=dump)
        links_task = self._get_links_from_dump(dump)
        clients_task = self.get_clients()
        xruns_task = self._get_xruns_from_dump(dump)

        settings, nodes, devices, streams, links, clients, xruns = await asyncio.gather(
            settings_task, nodes_task, devices_task, streams_task,
            links_task, clients_task, xruns_task,
        )

        latency = self._compute_latency(settings)

        # Find default sink/source
        default_sink = next((n for n in nodes if n.media_class == "Audio/Sink" and n.is_default), None)
        default_source = next((n for n in nodes if n.media_class == "Audio/Source" and n.is_default), None)

        # Check for alerts (include links to avoid false "no streams" alarm)
        alerts = self._check_alerts(daemon, devices, streams, links, xruns, latency["total_latency_ms"])

        metrics = PipeWireMetrics(
            daemon=daemon,
            settings=settings,
            default_sink=default_sink,
            default_source=default_source,
            devices=devices,
            nodes=nodes,
            streams=streams,
            links=links,
            client_count=len(clients),
            xruns=xruns,
            graph_latency_ms=latency["graph_latency_ms"],
            driver_latency_ms=latency["driver_latency_ms"],
            total_latency_ms=latency["total_latency_ms"],
            alerts=alerts,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

        self._cached_snapshot = metrics
        self._cache_time = now
        return metrics

    # ---------------------------------------------------------------
    # Alerting
    # ---------------------------------------------------------------

    def _check_alerts(
        self,
        daemon: PipeWireDaemonInfo,
        devices: List[PipeWireDeviceInfo],
        streams: List[PipeWireStreamInfo],
        links: List[PipeWireLinkInfo],
        xruns: int,
        total_latency_ms: float,
    ) -> List[Dict[str, str]]:
        """Check for PipeWire alert conditions."""
        alerts = []

        if not daemon.running:
            alerts.append({
                "type": "pipewire_daemon_down",
                "severity": "error",
                "message": "PipeWire daemon is not running",
            })

        if not devices:
            alerts.append({
                "type": "pipewire_device_disconnected",
                "severity": "error",
                "message": "No audio devices detected in PipeWire",
            })

        if total_latency_ms > 20.0:
            alerts.append({
                "type": "pipewire_high_latency",
                "severity": "warning",
                "message": f"Total audio latency is {total_latency_ms:.1f}ms",
            })

        if xruns > self._last_xrun_count:
            new_xruns = xruns - self._last_xrun_count
            alerts.append({
                "type": "pipewire_xrun",
                "severity": "warning",
                "message": f"{new_xruns} new PipeWire XRun(s) detected (total: {xruns})",
            })
            self._last_xrun_count = xruns

        # Only alert if no streams AND no active links
        if not streams and not links:
            alerts.append({
                "type": "pipewire_no_streams",
                "severity": "info",
                "message": "No active audio streams in PipeWire",
            })

        return alerts

    # ---------------------------------------------------------------
    # WebSocket broadcasting
    # ---------------------------------------------------------------

    async def start_broadcast(self, ws_manager, interval: float = 2.0):
        """Start periodic PipeWire metrics broadcast via WebSocket."""
        if self._broadcast_task and not self._broadcast_task.done():
            return
        self._broadcast_task = asyncio.create_task(
            self._broadcast_loop(ws_manager, interval)
        )
        logger.info(f"PipeWire broadcast started (interval={interval}s)")

    async def stop_broadcast(self):
        """Stop the broadcast loop."""
        if self._broadcast_task and not self._broadcast_task.done():
            self._broadcast_task.cancel()
            try:
                await self._broadcast_task
            except asyncio.CancelledError:
                pass
            self._broadcast_task = None
            logger.info("PipeWire broadcast stopped")

    async def _broadcast_loop(self, ws_manager, interval: float):
        """Periodic broadcast of PipeWire metrics."""
        while True:
            try:
                metrics = await self.get_graph_snapshot()
                await ws_manager.broadcast_json({
                    "type": "pipewire_metrics",
                    "data": asdict(metrics),
                }, topic="pipewire")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.debug(f"PipeWire broadcast error: {e}")
            await asyncio.sleep(interval)


# ============================================================================
# Global singleton
# ============================================================================

_pipewire_service: Optional[PipeWireService] = None
_pipewire_service_lock = threading.Lock()


def get_pipewire_service() -> PipeWireService:
    """Get or create the global PipeWire service instance."""
    global _pipewire_service
    if _pipewire_service is None:
        with _pipewire_service_lock:
            if _pipewire_service is None:
                _pipewire_service = PipeWireService()
    return _pipewire_service
