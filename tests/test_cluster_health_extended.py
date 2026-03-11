import asyncio

import pytest
from fastapi import HTTPException

from app.routes import cluster_health_extended
from app.services.cluster import hardware_inventory


class _FakeHardwareNode:
    def __init__(self, node_id: str, usb: int, midi: int, pipewire: int) -> None:
        self.node_id = node_id
        self.hostname = f"{node_id}.local"
        self.usb_audio_devices = [{"name": f"usb-{idx}"} for idx in range(usb)]
        self.midi_devices = [{"name": f"midi-{idx}"} for idx in range(midi)]
        self.pipewire_devices = [{"name": f"pw-{idx}"} for idx in range(pipewire)]

    def to_dict(self):
        return {
            "node_id": self.node_id,
            "hostname": self.hostname,
            "usb_audio_devices": list(self.usb_audio_devices),
            "midi_devices": list(self.midi_devices),
            "pipewire_devices": list(self.pipewire_devices),
        }


class _FakeHardwareInventory:
    def __init__(self) -> None:
        self.nodes = {
            "node-a": _FakeHardwareNode("node-a", usb=1, midi=2, pipewire=3),
            "node-b": _FakeHardwareNode("node-b", usb=2, midi=1, pipewire=1),
        }

    async def get_inventory(self):
        return self.nodes

    async def get_node_hardware(self, node_id: str):
        return self.nodes.get(node_id)

    async def find_device(self, search: str):
        return [{"node_id": "node-b", "hostname": "node-b.local", "matched": search}]


def test_get_audio_health_merges_status_and_health(monkeypatch):
    responses = {
        "/api/audio/status": {
            "node-a": {"body": {"running": True, "sample_rate": 48000}},
            "node-b": {"body": {"running": False, "sample_rate": 44100}},
        },
        "/api/audio/health": {
            "node-a": {"body": {"xruns": 0}},
            "node-b": {"body": {"xruns": 3}},
        },
    }

    async def _fake_fanout(path: str):
        return responses[path]

    monkeypatch.setattr(cluster_health_extended, "_fanout_get", _fake_fanout)

    payload = asyncio.run(cluster_health_extended.get_audio_health())

    assert payload == {
        "nodes": {
            "node-a": {
                "status": {"running": True, "sample_rate": 48000},
                "health": {"xruns": 0},
            },
            "node-b": {
                "status": {"running": False, "sample_rate": 44100},
                "health": {"xruns": 3},
            },
        }
    }


def test_get_audio_xruns_sorts_and_tags_cluster_timeline(monkeypatch):
    async def _fake_fanout(path: str):
        assert path == "/api/audio/health"
        return {
            "node-a": {"body": {"xrun_history": [{"timestamp": 30, "count": 1}]}},
            "node-b": {
                "body": {
                    "xrun_history": [
                        {"timestamp": 10, "count": 2},
                        {"timestamp": 20, "count": 1},
                    ]
                }
            },
        }

    monkeypatch.setattr(cluster_health_extended, "_fanout_get", _fake_fanout)

    payload = asyncio.run(cluster_health_extended.get_audio_xruns())

    assert payload["count"] == 3
    assert payload["events"] == [
        {"timestamp": 10, "count": 2, "node_id": "node-b"},
        {"timestamp": 20, "count": 1, "node_id": "node-b"},
        {"timestamp": 30, "count": 1, "node_id": "node-a"},
    ]


def test_get_devices_returns_cluster_inventory_summary(monkeypatch):
    inventory = _FakeHardwareInventory()
    monkeypatch.setattr(hardware_inventory, "get_cluster_hardware_inventory", lambda: inventory)

    payload = asyncio.run(cluster_health_extended.get_devices())

    assert payload["summary"] == {
        "node_count": 2,
        "usb_audio_device_count": 3,
        "midi_device_count": 3,
        "pipewire_device_count": 4,
    }
    assert payload["nodes"]["node-a"]["hostname"] == "node-a.local"


def test_get_devices_supports_search_and_missing_node(monkeypatch):
    inventory = _FakeHardwareInventory()
    monkeypatch.setattr(hardware_inventory, "get_cluster_hardware_inventory", lambda: inventory)

    search_payload = asyncio.run(cluster_health_extended.get_devices(search="edirol"))
    assert search_payload == {
        "query": "edirol",
        "count": 1,
        "matches": [{"node_id": "node-b", "hostname": "node-b.local", "matched": "edirol"}],
    }

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(cluster_health_extended.get_devices(node_id="missing-node"))

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Node missing-node not found"


def test_get_overview_aggregates_online_nodes_cpu_and_plugin_totals(monkeypatch):
    responses = {
        "/api/audio/status": {
            "node-a": {
                "status_code": 200,
                "body": {"plugins": ["amp", "cab"]},
            },
            "node-b": {
                "status_code": 503,
                "body": {"plugins": ["delay"]},
            },
        },
        "/api/metrics/summary": {
            "node-a": {"body": {"cpu_percent": 25.0}},
            "node-b": {"body": {"cpu_percent": 35.0}},
        },
    }

    async def _fake_fanout(path: str):
        return responses[path]

    monkeypatch.setattr(cluster_health_extended, "_fanout_get", _fake_fanout)

    payload = asyncio.run(cluster_health_extended.get_overview())

    assert payload == {
        "total_nodes": 2,
        "online_nodes": 1,
        "avg_cpu_percent": 30.0,
        "total_plugins": 3,
    }
