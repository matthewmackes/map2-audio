"""
Network Configuration API Routes
Comprehensive network management for Fedora-based systems using NetworkManager
"""

import asyncio
import logging
import subprocess
import re
import json
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/network", tags=["network"])


# ==================== Models ====================

class IPConfiguration(BaseModel):
    ip_address: str
    netmask: str = "255.255.255.0"
    gateway: str
    dhcp: bool = True


class WiFiConnectRequest(BaseModel):
    ssid: str
    password: Optional[str] = None


class DNSConfiguration(BaseModel):
    servers: List[str]


class InterfaceToggle(BaseModel):
    interface: str
    enabled: bool


class ServiceAction(BaseModel):
    service: str
    action: str  # start, stop, restart, enable, disable


# ==================== Helper Functions ====================

async def run_command(cmd: List[str], check: bool = True) -> subprocess.CompletedProcess:
    """Run a shell command safely."""
    try:
        result = await asyncio.to_thread(subprocess.run,
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            check=check
        )
        return result
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail=f"Command timed out: {' '.join(cmd)}")
    except subprocess.CalledProcessError as e:
        logger.error(f"Command failed: {' '.join(cmd)}: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"Command failed: {e.stderr}")


async def get_nmcli_connections() -> List[Dict[str, str]]:
    """Get all NetworkManager connections."""
    try:
        result = await run_command(["nmcli", "-t", "-f", "NAME,UUID,TYPE,DEVICE", "connection", "show"], check=False)
        connections = []
        for line in result.stdout.strip().split('\n'):
            if line:
                parts = line.split(':')
                if len(parts) >= 4:
                    connections.append({
                        "name": parts[0],
                        "uuid": parts[1],
                        "type": parts[2],
                        "device": parts[3]
                    })
        return connections
    except Exception as e:
        logger.error(f"Failed to get connections: {e}")
        return []


async def get_interface_details(iface: str) -> Dict[str, Any]:
    """Get detailed information about a network interface."""
    details = {
        "name": iface,
        "enabled": False,
        "connected": False,
        "ip_address": None,
        "netmask": None,
        "gateway": None,
        "mac_address": None,
        "speed": None,
        "dhcp": True,
    }

    try:
        # Get interface state
        result = await run_command(["ip", "-j", "addr", "show", iface], check=False)
        if result.returncode == 0 and result.stdout.strip():
            data = json.loads(result.stdout)
            if data:
                iface_data = data[0]
                details["enabled"] = iface_data.get("operstate", "DOWN") != "DOWN"
                details["connected"] = iface_data.get("operstate") == "UP"
                details["mac_address"] = iface_data.get("address")

                # Get IP addresses
                for addr_info in iface_data.get("addr_info", []):
                    if addr_info.get("family") == "inet":
                        details["ip_address"] = addr_info.get("local")
                        prefix_len = addr_info.get("prefixlen", 24)
                        # Convert prefix to netmask
                        details["netmask"] = prefix_to_netmask(prefix_len)

        # Get gateway
        result = await run_command(["ip", "-j", "route", "show", "default"], check=False)
        if result.returncode == 0 and result.stdout.strip():
            routes = json.loads(result.stdout)
            for route in routes:
                if route.get("dev") == iface:
                    details["gateway"] = route.get("gateway")
                    break

        # Get speed for ethernet
        if iface.startswith("e"):
            try:
                result = await run_command(["ethtool", iface], check=False)
                for line in result.stdout.split('\n'):
                    if "Speed:" in line:
                        details["speed"] = line.split(':')[1].strip()
                        break
            except Exception:
                pass

        # Check if DHCP
        result = await run_command(["nmcli", "-t", "-f", "ipv4.method", "connection", "show", iface], check=False)
        if result.returncode == 0:
            details["dhcp"] = "auto" in result.stdout

    except Exception as e:
        logger.error(f"Failed to get interface details for {iface}: {e}")

    return details


def prefix_to_netmask(prefix: int) -> str:
    """Convert CIDR prefix to netmask."""
    mask = (0xffffffff >> (32 - prefix)) << (32 - prefix)
    return f"{(mask >> 24) & 0xff}.{(mask >> 16) & 0xff}.{(mask >> 8) & 0xff}.{mask & 0xff}"


async def get_wifi_interface() -> Optional[str]:
    """Get the primary WiFi interface name."""
    try:
        result = await run_command(["nmcli", "-t", "-f", "DEVICE,TYPE", "device"], check=False)
        for line in result.stdout.strip().split('\n'):
            if ':wifi' in line:
                return line.split(':')[0]
    except Exception:
        pass
    return None


# ==================== Routes ====================

@router.get("/status")
async def get_network_status() -> Dict[str, Any]:
    """Get comprehensive network status."""
    status = {
        "ethernet": [],
        "wifi": [],
        "dns_servers": [],
        "hostname": None,
        "domain": None,
        "internet_connected": False,
        "routes": [],
        "services": [],
        "firewall_zones": [],
    }

    try:
        # Get hostname
        result = await run_command(["hostname"], check=False)
        status["hostname"] = result.stdout.strip()

        # Get domain
        result = await run_command(["hostname", "-d"], check=False)
        status["domain"] = result.stdout.strip() or "local"

        # Get all interfaces
        result = await run_command(["ip", "-j", "link", "show"], check=False)
        if result.returncode == 0:
            interfaces = json.loads(result.stdout)
            for iface in interfaces:
                name = iface.get("ifname", "")
                if name.startswith("e") and name != "lo":  # Ethernet
                    details = await get_interface_details(name)
                    status["ethernet"].append(details)
                elif name.startswith("w"):  # WiFi
                    details = await get_interface_details(name)
                    # Get WiFi-specific info
                    wifi_result = await run_command(["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY", "device", "wifi", "list", "ifname", name], check=False)
                    if wifi_result.returncode == 0:
                        for line in wifi_result.stdout.strip().split('\n')[:1]:  # Current connection
                            parts = line.split(':')
                            if len(parts) >= 3 and parts[0]:
                                details["ssid"] = parts[0]
                                details["signal_strength"] = int(parts[1]) if parts[1].isdigit() else 0
                                details["security"] = parts[2]
                    status["wifi"].append(details)

        # Get DNS servers
        result = await run_command(["cat", "/etc/resolv.conf"], check=False)
        for line in result.stdout.split('\n'):
            if line.startswith("nameserver"):
                dns = line.split()[1]
                status["dns_servers"].append(dns)

        # Check internet connectivity
        result = await run_command(["ping", "-c", "1", "-W", "2", "8.8.8.8"], check=False)
        status["internet_connected"] = result.returncode == 0

        # Get routes
        result = await run_command(["ip", "-j", "route", "show"], check=False)
        if result.returncode == 0:
            routes = json.loads(result.stdout)
            for route in routes:
                status["routes"].append({
                    "destination": route.get("dst", "default"),
                    "gateway": route.get("gateway", "direct"),
                    "interface": route.get("dev"),
                    "metric": route.get("metric", 0)
                })

        # Get network services status
        services = [
            ("NetworkManager", "NetworkManager"),
            ("firewalld", "Firewall"),
            ("sshd", "SSH Server"),
            ("avahi-daemon", "mDNS/DNS-SD"),
        ]

        for service_name, display_name in services:
            service_info = {
                "name": service_name,
                "display_name": display_name,
                "running": False,
                "enabled": False,
                "description": ""
            }

            result = await run_command(["systemctl", "is-active", service_name], check=False)
            service_info["running"] = result.stdout.strip() == "active"

            result = await run_command(["systemctl", "is-enabled", service_name], check=False)
            service_info["enabled"] = result.stdout.strip() == "enabled"

            status["services"].append(service_info)

        # Get firewall zones
        result = await run_command(["firewall-cmd", "--list-all-zones"], check=False)
        if result.returncode == 0:
            current_zone = None
            for line in result.stdout.split('\n'):
                if line and not line.startswith(' ') and not line.startswith('\t'):
                    zone_name = line.split()[0]
                    is_default = "(active)" in line or "(default)" in line
                    current_zone = {
                        "name": zone_name,
                        "default": is_default,
                        "description": "",
                        "services": []
                    }
                    status["firewall_zones"].append(current_zone)
                elif current_zone and "services:" in line:
                    services_str = line.split(':')[1].strip()
                    current_zone["services"] = services_str.split() if services_str else []

    except Exception as e:
        logger.error(f"Failed to get network status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return status


@router.get("/wifi/scan")
async def scan_wifi_networks() -> Dict[str, List[Dict[str, Any]]]:
    """Scan for available WiFi networks."""
    wifi_iface = await get_wifi_interface()
    if not wifi_iface:
        return {"networks": []}

    try:
        # Trigger a rescan
        await run_command(["nmcli", "device", "wifi", "rescan", "ifname", wifi_iface], check=False)

        # Get networks
        result = await run_command(["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY,BSSID,CHAN", "device", "wifi", "list", "ifname", wifi_iface], check=False)

        networks = []
        seen_ssids = set()

        for line in result.stdout.strip().split('\n'):
            if line:
                parts = line.split(':')
                if len(parts) >= 4:
                    ssid = parts[0]
                    if ssid and ssid not in seen_ssids:
                        seen_ssids.add(ssid)
                        networks.append({
                            "ssid": ssid,
                            "signal_strength": int(parts[1]) if parts[1].isdigit() else 0,
                            "security": parts[2] or "open",
                            "bssid": parts[3] if len(parts) > 3 else "",
                            "channel": int(parts[4]) if len(parts) > 4 and parts[4].isdigit() else 0
                        })

        # Sort by signal strength
        networks.sort(key=lambda x: x["signal_strength"], reverse=True)
        return {"networks": networks}

    except Exception as e:
        logger.error(f"Failed to scan WiFi: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/wifi/connect")
async def connect_wifi(request: WiFiConnectRequest) -> Dict[str, str]:
    """Connect to a WiFi network."""
    wifi_iface = await get_wifi_interface()
    if not wifi_iface:
        raise HTTPException(status_code=404, detail="No WiFi interface found")

    try:
        cmd = ["nmcli", "device", "wifi", "connect", request.ssid]
        if request.password:
            cmd.extend(["password", request.password])
        cmd.extend(["ifname", wifi_iface])

        result = await run_command(cmd, check=False)

        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"Failed to connect: {result.stderr}")

        return {"status": "connected", "ssid": request.ssid}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to connect to WiFi: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/wifi/disconnect/{interface}")
async def disconnect_wifi(interface: str) -> Dict[str, str]:
    """Disconnect from WiFi."""
    try:
        result = await run_command(["nmcli", "device", "disconnect", interface], check=False)

        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"Failed to disconnect: {result.stderr}")

        return {"status": "disconnected", "interface": interface}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to disconnect WiFi: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/interface/{interface}/toggle")
async def toggle_interface(interface: str, enabled: bool) -> Dict[str, Any]:
    """Enable or disable a network interface."""
    try:
        action = "connect" if enabled else "disconnect"
        result = await run_command(["nmcli", "device", action, interface], check=False)

        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"Failed to {action} interface: {result.stderr}")

        return {"status": "success", "interface": interface, "enabled": enabled}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to toggle interface: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/interface/{interface}/dhcp")
async def set_dhcp(interface: str, enabled: bool) -> Dict[str, Any]:
    """Enable or disable DHCP on an interface."""
    try:
        if enabled:
            result = await run_command([
                "nmcli", "connection", "modify", interface,
                "ipv4.method", "auto"
            ], check=False)
        else:
            # Keep current IP as static
            details = await get_interface_details(interface)
            if not details.get("ip_address"):
                raise HTTPException(status_code=400, detail="Cannot disable DHCP without an IP address")

            result = await run_command([
                "nmcli", "connection", "modify", interface,
                "ipv4.method", "manual"
            ], check=False)

        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"Failed to configure DHCP: {result.stderr}")

        # Restart the connection
        await run_command(["nmcli", "connection", "down", interface], check=False)
        await run_command(["nmcli", "connection", "up", interface], check=False)

        return {"status": "success", "interface": interface, "dhcp": enabled}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to set DHCP: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/interface/{interface}/static")
async def set_static_ip(interface: str, config: IPConfiguration) -> Dict[str, Any]:
    """Set static IP configuration on an interface."""
    try:
        # Convert netmask to prefix
        netmask_parts = [int(x) for x in config.netmask.split('.')]
        prefix = sum([bin(x).count('1') for x in netmask_parts])

        result = await run_command([
            "nmcli", "connection", "modify", interface,
            "ipv4.method", "manual",
            "ipv4.addresses", f"{config.ip_address}/{prefix}",
            "ipv4.gateway", config.gateway
        ], check=False)

        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"Failed to set static IP: {result.stderr}")

        # Restart the connection
        await run_command(["nmcli", "connection", "down", interface], check=False)
        await run_command(["nmcli", "connection", "up", interface], check=False)

        return {"status": "success", "interface": interface, "config": config.dict()}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to set static IP: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/dns")
async def set_dns_servers(config: DNSConfiguration) -> Dict[str, Any]:
    """Set DNS servers system-wide."""
    try:
        # Get the active connection
        result = await run_command(["nmcli", "-t", "-f", "NAME,DEVICE", "connection", "show", "--active"], check=False)

        active_conn = None
        for line in result.stdout.strip().split('\n'):
            if line:
                parts = line.split(':')
                if len(parts) >= 2 and parts[1]:
                    active_conn = parts[0]
                    break

        if not active_conn:
            raise HTTPException(status_code=400, detail="No active network connection found")

        dns_string = ",".join(config.servers)
        result = await run_command([
            "nmcli", "connection", "modify", active_conn,
            "ipv4.dns", dns_string,
            "ipv4.ignore-auto-dns", "yes"
        ], check=False)

        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"Failed to set DNS: {result.stderr}")

        # Restart the connection to apply
        await run_command(["nmcli", "connection", "down", active_conn], check=False)
        await run_command(["nmcli", "connection", "up", active_conn], check=False)

        return {"status": "success", "dns_servers": config.servers}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to set DNS: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/service")
async def manage_service(request: ServiceAction) -> Dict[str, Any]:
    """Manage a network-related systemd service."""
    allowed_services = ["NetworkManager", "firewalld", "sshd", "avahi-daemon"]

    if request.service not in allowed_services:
        raise HTTPException(status_code=400, detail=f"Service not allowed: {request.service}")

    allowed_actions = ["start", "stop", "restart", "enable", "disable"]
    if request.action not in allowed_actions:
        raise HTTPException(status_code=400, detail=f"Action not allowed: {request.action}")

    try:
        result = await run_command(["systemctl", request.action, request.service], check=False)

        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"Failed to {request.action} {request.service}: {result.stderr}")

        return {"status": "success", "service": request.service, "action": request.action}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to manage service: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/hostname")
async def get_hostname() -> Dict[str, str]:
    """Get the system hostname."""
    try:
        result = await run_command(["hostname"], check=False)
        return {"hostname": result.stdout.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/hostname")
async def set_hostname(hostname: str) -> Dict[str, str]:
    """Set the system hostname."""
    try:
        result = await run_command(["hostnamectl", "set-hostname", hostname], check=False)
        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"Failed to set hostname: {result.stderr}")
        return {"status": "success", "hostname": hostname}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
