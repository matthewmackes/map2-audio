from __future__ import annotations

import json
import subprocess

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import network as network_routes


def _completed(*, stdout: str = "", stderr: str = "", returncode: int = 0):
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(network_routes.router)
    return TestClient(app)


def test_network_status_aggregates_interfaces_services_routes_and_firewall(monkeypatch):
    async def _fake_get_interface_details(iface: str):
        if iface == "eth0":
            return {
                "name": "eth0",
                "enabled": True,
                "connected": True,
                "ip_address": "10.0.0.10",
                "netmask": "255.255.255.0",
                "gateway": "10.0.0.1",
                "mac_address": "aa:bb:cc:dd:ee:ff",
                "speed": "1000Mb/s",
                "dhcp": False,
            }
        return {
            "name": "wlan0",
            "enabled": True,
            "connected": True,
            "ip_address": "192.168.1.20",
            "netmask": "255.255.255.0",
            "gateway": "192.168.1.1",
            "mac_address": "11:22:33:44:55:66",
            "speed": None,
            "dhcp": True,
        }

    async def _fake_run_command(cmd, check=True):
        key = tuple(cmd)
        if key == ("hostname",):
            return _completed(stdout="map2-node\n")
        if key == ("hostname", "-d"):
            return _completed(stdout="\n")
        if key == ("ip", "-j", "link", "show"):
            return _completed(stdout=json.dumps([{"ifname": "eth0"}, {"ifname": "wlan0"}, {"ifname": "lo"}]))
        if key == ("nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY", "device", "wifi", "list", "ifname", "wlan0"):
            return _completed(stdout="StudioNet:82:WPA2\n")
        if key == ("cat", "/etc/resolv.conf"):
            return _completed(stdout="nameserver 1.1.1.1\nnameserver 8.8.8.8\n")
        if key == ("ping", "-c", "1", "-W", "2", "8.8.8.8"):
            return _completed(returncode=0)
        if key == ("ip", "-j", "route", "show"):
            return _completed(stdout=json.dumps([{"dst": "default", "gateway": "10.0.0.1", "dev": "eth0", "metric": 100}]))
        if key[:2] == ("systemctl", "is-active"):
            return _completed(stdout="active\n" if key[2] != "firewalld" else "inactive\n")
        if key[:2] == ("systemctl", "is-enabled"):
            return _completed(stdout="enabled\n")
        if key == ("firewall-cmd", "--list-all-zones"):
            return _completed(stdout="public (active)\n  services: ssh mdns\n")
        raise AssertionError(f"Unexpected command: {cmd}")

    client = _build_client()
    monkeypatch.setattr(network_routes, "get_interface_details", _fake_get_interface_details)
    monkeypatch.setattr(network_routes, "run_command", _fake_run_command)

    response = client.get("/api/network/status")

    assert response.status_code == 200
    assert response.json() == {
        "ethernet": [
            {
                "name": "eth0",
                "enabled": True,
                "connected": True,
                "ip_address": "10.0.0.10",
                "netmask": "255.255.255.0",
                "gateway": "10.0.0.1",
                "mac_address": "aa:bb:cc:dd:ee:ff",
                "speed": "1000Mb/s",
                "dhcp": False,
            }
        ],
        "wifi": [
            {
                "name": "wlan0",
                "enabled": True,
                "connected": True,
                "ip_address": "192.168.1.20",
                "netmask": "255.255.255.0",
                "gateway": "192.168.1.1",
                "mac_address": "11:22:33:44:55:66",
                "speed": None,
                "dhcp": True,
                "ssid": "StudioNet",
                "signal_strength": 82,
                "security": "WPA2",
            }
        ],
        "dns_servers": ["1.1.1.1", "8.8.8.8"],
        "hostname": "map2-node",
        "domain": "local",
        "internet_connected": True,
        "routes": [
            {
                "destination": "default",
                "gateway": "10.0.0.1",
                "interface": "eth0",
                "metric": 100,
            }
        ],
        "services": [
            {"name": "NetworkManager", "display_name": "NetworkManager", "running": True, "enabled": True, "description": ""},
            {"name": "firewalld", "display_name": "Firewall", "running": False, "enabled": True, "description": ""},
            {"name": "sshd", "display_name": "SSH Server", "running": True, "enabled": True, "description": ""},
            {"name": "avahi-daemon", "display_name": "mDNS/DNS-SD", "running": True, "enabled": True, "description": ""},
        ],
        "firewall_zones": [
            {
                "name": "public",
                "default": True,
                "description": "",
                "services": ["ssh", "mdns"],
            }
        ],
    }


def test_wifi_scan_deduplicates_and_sorts_visible_networks(monkeypatch):
    async def _fake_wifi_interface():
        return "wlan0"

    async def _fake_run_command(cmd, check=True):
        key = tuple(cmd)
        if key == ("nmcli", "device", "wifi", "rescan", "ifname", "wlan0"):
            return _completed()
        if key == ("nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY,BSSID,CHAN", "device", "wifi", "list", "ifname", "wlan0"):
            return _completed(
                stdout=(
                    "StudioNet:68:WPA2:aa:bb:cc:dd:ee:01:11\n"
                    "CafeWiFi:55::aa:bb:cc:dd:ee:02:6\n"
                    "StudioNet:42:WPA2:aa:bb:cc:dd:ee:03:1\n"
                )
            )
        raise AssertionError(f"Unexpected command: {cmd}")

    client = _build_client()
    monkeypatch.setattr(network_routes, "get_wifi_interface", _fake_wifi_interface)
    monkeypatch.setattr(network_routes, "run_command", _fake_run_command)

    response = client.get("/api/network/wifi/scan")

    assert response.status_code == 200
    assert response.json() == {
        "networks": [
            {
                "ssid": "StudioNet",
                "signal_strength": 68,
                "security": "WPA2",
                "bssid": "aa",
                "channel": 0,
            },
            {
                "ssid": "CafeWiFi",
                "signal_strength": 55,
                "security": "open",
                "bssid": "aa",
                "channel": 0,
            },
        ]
    }


def test_network_control_routes_surface_missing_wifi_and_invalid_service_requests(monkeypatch):
    async def _no_wifi_interface():
        return None

    client = _build_client()
    monkeypatch.setattr(network_routes, "get_wifi_interface", _no_wifi_interface)

    wifi_response = client.post("/api/network/wifi/connect", json={"ssid": "StudioNet", "password": "secret"})
    service_response = client.post("/api/network/service", json={"service": "cups", "action": "restart"})

    assert wifi_response.status_code == 404
    assert wifi_response.json() == {"detail": "No WiFi interface found"}
    assert service_response.status_code == 400
    assert service_response.json() == {"detail": "Service not allowed: cups"}
