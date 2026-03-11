import asyncio

from app.services.cluster.hardware_inventory import ClusterHardwareInventory


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, responses):
        self._responses = responses

    async def get(self, url, params=None):
        path = url.split("8080", 1)[-1]
        return _FakeResponse(self._responses[path])


class _FakeRegistry:
    def get_all_nodes(self):
        return [
            {"id": "local-node", "hostname": "manager", "status": "online", "audio_devices": '["ALSA"]'},
            {"id": "remote-node", "hostname": "stagebox", "status": "online", "audio_devices": '["PipeWire"]'},
            {"id": "offline-node", "hostname": "spare", "status": "offline", "audio_devices": "[]"},
        ]


class _FakeCapabilities:
    def __init__(self):
        self.audio_interfaces = ["ALSA", "JACK"]


class _FakeIdentity:
    def __init__(self):
        self.config = type("Config", (), {"hostname": "manager"})()

    def get_node_id(self):
        return "local-node"

    def get_capabilities(self):
        return _FakeCapabilities()


class _FakeNode:
    def __init__(self, node_id, hostname, audio_interfaces):
        self.node_id = node_id
        self.hostname = hostname
        self.capabilities = type("Caps", (), {"audio_interfaces": audio_interfaces})()

    def is_online(self, cache_timeout):
        return True


class _FakeDiscovery:
    cache_timeout = 120

    def get_discovered_nodes(self, online_only=False):
        return [_FakeNode("remote-node", "stagebox", ["PipeWire"])]


class _FakeEventBus:
    def subscribe(self, event_type, callback):
        return True


def test_cluster_hardware_inventory_aggregates_nodes(monkeypatch):
    responses = {
        "/api/usb/devices/list": {
            "nodes": {
                "local-node": {
                    "status_code": 200,
                    "body": [
                        {
                            "vendor_id": "0582",
                            "product_id": "0074",
                            "product": "EDIROL UA-1000",
                            "is_audio": True,
                        }
                    ],
                },
                "remote-node": {
                    "status_code": 200,
                    "body": [
                        {
                            "vendor_id": "84ef",
                            "product_id": "0014",
                            "product": "HotoneAudio Jogg USB Audio",
                            "is_audio": True,
                        }
                    ],
                },
            }
        },
        "/api/midi/devices": {
            "nodes": {
                "local-node": {
                    "status_code": 200,
                    "body": {
                        "inputs": [{"name": "Launchpad", "type": "input"}],
                        "outputs": [{"name": "UA-1000 MIDI", "type": "output"}],
                    },
                },
                "remote-node": {
                    "status_code": 200,
                    "body": {
                        "inputs": [{"name": "Morningstar MC6", "type": "input"}],
                        "outputs": [],
                    },
                },
            }
        },
        "/api/pipewire/devices": {
            "nodes": {
                "local-node": {
                    "status_code": 200,
                    "body": {
                        "devices": [{"name": "UA-1000", "description": "Edirol UA-1000"}]
                    },
                },
                "remote-node": {
                    "status_code": 200,
                    "body": {
                        "devices": [{"name": "Jogg", "description": "Hotone Jogg USB Audio"}]
                    },
                },
            }
        },
    }

    monkeypatch.setattr(
        "app.services.cluster.hardware_inventory.get_enhanced_node_identity",
        lambda: _FakeIdentity(),
    )

    inventory_service = ClusterHardwareInventory(
        client=_FakeClient(responses),
        registry=_FakeRegistry(),
        discovery=_FakeDiscovery(),
        event_bus=_FakeEventBus(),
        local_node_id="local-node",
        local_hostname="manager",
    )

    inventory = asyncio.run(inventory_service.get_inventory())

    assert set(inventory) == {"local-node", "remote-node", "offline-node"}
    assert inventory["local-node"].usb_audio_devices[0]["vid_pid"] == "0582:0074"
    assert inventory["local-node"].audio_interfaces[0] == "ALSA"
    assert inventory["remote-node"].hostname == "stagebox"
    assert inventory["remote-node"].midi_devices[0]["direction"] == "input"
    assert inventory["offline-node"].status == "offline"
    assert inventory["offline-node"].usb_audio_devices == []

    matches = asyncio.run(inventory_service.find_device("0582:0074"))
    assert matches == [
        {
            "node_id": "local-node",
            "hostname": "manager",
            "kind": "usb_audio",
            "device_info": inventory["local-node"].usb_audio_devices[0],
        }
    ]
