from __future__ import annotations

import asyncio

from app.services.maschine.incident_log import (
    get_maschine_incident_log_service,
    reset_maschine_incident_log_service,
)
from app.services.maschine.maschine_mk1_daemon import DaemonConfig, MaschineMK1Daemon
from app.services.maschine_service import get_maschine_service, reset_maschine_service


def test_incident_log_service_appends_and_reads_recent_entries(tmp_path) -> None:
    reset_maschine_incident_log_service()
    service = get_maschine_incident_log_service()
    service.set_path(tmp_path / "maschine_incident_log.jsonl")

    service.append(severity="warn", source="test", message="First event", event="first")
    service.append(severity="INFO", source="test", message="Second event", event="second")

    entries = service.list_entries(limit=2)

    assert [entry["event"] for entry in entries] == ["second", "first"]
    assert entries[0]["severity"] == "info"


async def _collect_lifecycle_entries(tmp_path) -> list[dict]:
    reset_maschine_incident_log_service()
    reset_maschine_service()
    incident_log = get_maschine_incident_log_service()
    incident_log.set_path(tmp_path / "maschine_incident_log.jsonl")

    service = get_maschine_service()
    await service.register_daemon(daemon_version="1.0.0", virtual_port_name="MAP2:Maschine-MK1")
    await service.set_websocket_connected(True)
    await service.disconnect_daemon(reason="backend_lost")
    return incident_log.list_entries(limit=5)


def test_maschine_service_lifecycle_appends_incident_entries(tmp_path) -> None:
    entries = asyncio.run(_collect_lifecycle_entries(tmp_path))

    assert entries[0]["event"] == "daemon_disconnected"
    assert any(entry["event"] == "daemon_connected" for entry in entries)
    assert any(entry["event"] == "ws_connect" for entry in entries)


def test_daemon_device_connectivity_appends_incident_entries(tmp_path) -> None:
    reset_maschine_incident_log_service()
    service = get_maschine_incident_log_service()
    service.set_path(tmp_path / "maschine_incident_log.jsonl")

    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._set_device_connected(True)
    daemon._set_device_connected(False)

    entries = service.list_entries(limit=2)
    assert [entry["event"] for entry in entries] == ["device_disconnected", "device_connected"]
