import asyncio

from app.services.cluster.content_distributor import ContentDistributor


class _FakeNode:
    def __init__(self, node_id: str, address: str):
        self.node_id = node_id
        self.addresses = [address]
        self.port = 8080


class _FakeDiscovery:
    def __init__(self):
        self._nodes = {"remote-node": _FakeNode("remote-node", "10.0.0.44")}

    def get_discovered_nodes(self, online_only: bool = True):
        return list(self._nodes.values())

    def get_discovered_node(self, node_id: str):
        return self._nodes.get(node_id)


class _FakeResponse:
    def __init__(self, payload=None, content: bytes = b""):
        self._payload = payload or {}
        self.content = content

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self):
        self.posts = []

    async def get(self, url, headers=None, params=None):
        if url.endswith("/cluster/presets/11"):
            return _FakeResponse(
                {
                    "preset_id": 11,
                    "name": "Wide Lead",
                    "plugin_uri": "map2://chorus",
                    "plugin_name": "Chorus",
                    "parameters": {"mix": 0.3},
                    "checksum": "abc123",
                }
            )
        if url.endswith("/cluster/library") and params == {"content_type": "preset", "node_id": "all"}:
            return _FakeResponse(
                {
                    "nodes": {
                        "local-node": {"body": {"items": [{"checksum": "abc123"}]}},
                        "remote-node": {"body": {"items": []}},
                    }
                }
            )
        if url.endswith("/cluster/library") and params == {"content_type": "ir"}:
            return _FakeResponse(
                {
                    "items": [
                        {
                            "path_token": "ir_0:cabs/Deluxe.wav",
                            "filename": "Deluxe.wav",
                            "asset_type": "cabinet_ir",
                            "checksum": "irhash",
                        }
                    ]
                }
            )
        if url.endswith("/cluster/files/ir") and params == {"path_token": "ir_0:cabs/Deluxe.wav"}:
            return _FakeResponse(content=b"wave-data")
        raise AssertionError(f"Unexpected GET: {url} params={params}")

    async def post(self, url, headers=None, json=None, data=None, files=None):
        self.posts.append({"url": url, "json": json, "data": data, "files": files, "headers": headers})
        if files:
            return _FakeResponse({"success": True, "file_hash": "irhash"})
        return _FakeResponse({"success": True})


def test_content_distributor_deploys_presets_and_reports_availability():
    client = _FakeClient()
    distributor = ContentDistributor(
        client=client,
        discovery=_FakeDiscovery(),
        local_node_id="local-node",
    )

    availability = asyncio.run(distributor.get_preset_availability(11))
    deploy_result = asyncio.run(distributor.deploy_preset(11, ["remote-node"]))

    assert availability == {
        "preset_id": 11,
        "checksum": "abc123",
        "source_node_id": "local-node",
        "available_on": ["local-node"],
        "missing_on": ["remote-node"],
    }
    assert deploy_result == {"remote-node": True}
    assert client.posts == [
        {
            "url": "http://10.0.0.44:8080/api/preset-exchange/import-cluster",
            "json": {
                "preset_id": 11,
                "name": "Wide Lead",
                "plugin_uri": "map2://chorus",
                "plugin_name": "Chorus",
                "parameters": {"mix": 0.3},
                "checksum": "abc123",
            },
            "data": None,
            "files": None,
            "headers": {"X-MAP2-Proxy-Origin": "local-node"},
        }
    ]


def test_content_distributor_deploys_library_items_from_remote_source():
    client = _FakeClient()
    distributor = ContentDistributor(
        client=client,
        discovery=_FakeDiscovery(),
        local_node_id="local-node",
    )

    deploy_result = asyncio.run(
        distributor.deploy_library_item(
            "ir",
            "ir_0:cabs/Deluxe.wav",
            ["local-node"],
            source_node_id="remote-node",
        )
    )

    assert deploy_result == {"local-node": True}
    assert client.posts == [
        {
            "url": "http://127.0.0.1:8080/api/upload/",
            "json": None,
            "data": {"asset_type": "cabinet_ir"},
            "files": {"file": ("Deluxe.wav", b"wave-data", "application/octet-stream")},
            "headers": {"X-MAP2-Proxy-Origin": "local-node"},
        }
    ]
