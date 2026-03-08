import asyncio
from types import SimpleNamespace

import app.routes.avb as avb_routes


class _FakeEndpoint:
    def __init__(self, endpoint_id: str, direction: str):
        self._endpoint_id = endpoint_id
        self.entity_id = endpoint_id.split(":", 1)[0] if ":" in endpoint_id else endpoint_id
        self.unique_id = 0
        self.direction = direction
        self.device_type = "map2"
        self.device_name = endpoint_id
        self.channels = 2
        self.sample_rate = 48000
        self.format = "24-bit PCM"
        self.mac_address = "00:11:22:33:44:55"
        self.node_id = "node-a"
        self.node_address = "http://node-a:8080"
        self.host = "node-a"
        self.available = True
        self.last_seen = None

    def endpoint_id(self):
        return self._endpoint_id


class _FakeConnection:
    def __init__(self, talker, listener):
        self.talker = talker
        self.listener = listener
        self.state = SimpleNamespace(value="connected")
        self.established_time = None
        self.error_message = None
        self.srp_reservation_id = None
        self.srp_admission_id = None
        self.connection_role = "effects_loop_send"
        self.loop_id = "loop-test"

    def connection_id(self):
        return f"{self.talker.endpoint_id()}→{self.listener.endpoint_id()}"


class _FakeRouter:
    def __init__(self):
        self.talker = _FakeEndpoint("talker-a:1", "talker")
        self.listener = _FakeEndpoint("listener-b:2", "listener")
        self.endpoints = {
            self.talker.endpoint_id(): self.talker,
            self.listener.endpoint_id(): self.listener,
        }
        self.connect_kwargs = None

    def get_connections(self):
        return [_FakeConnection(self.talker, self.listener)]

    async def connect(self, talker_id, listener_id, **kwargs):
        self.connect_kwargs = kwargs
        return {
            "success": True,
            "connection_id": f"{talker_id}→{listener_id}",
            "connection_role": kwargs.get("connection_role", "general_route"),
            "loop_id": kwargs.get("loop_id"),
        }

    async def disconnect(self, _talker_id, _listener_id, **_kwargs):
        return {"success": True}



def test_get_router_connections_includes_loop_metadata(monkeypatch):
    router = _FakeRouter()
    monkeypatch.setattr("app.services.avb.avb_router.get_avb_router", lambda: router)

    payload = asyncio.run(avb_routes.get_router_connections())

    assert payload["count"] == 1
    conn = payload["connections"][0]
    assert conn["connection_role"] == "effects_loop_send"
    assert conn["loop_id"] == "loop-test"


def test_connect_streams_accepts_connection_role_and_loop_id(monkeypatch):
    router = _FakeRouter()

    monkeypatch.setattr("app.services.avb.avb_router.get_avb_router", lambda: router)
    monkeypatch.setattr(avb_routes, "config_get", lambda key, default=None: False if "avb.srp" in key else default)

    result = asyncio.run(
        avb_routes.connect_streams(
            {
                "talker_id": router.talker.endpoint_id(),
                "listener_id": router.listener.endpoint_id(),
                "connection_role": "effects_loop_send",
                "loop_id": "loop-test",
            }
        )
    )

    assert result["success"] is True
    assert result["connection_role"] == "effects_loop_send"
    assert result["loop_id"] == "loop-test"
    assert router.connect_kwargs is not None
    assert router.connect_kwargs["connection_role"] == "effects_loop_send"
    assert router.connect_kwargs["loop_id"] == "loop-test"
