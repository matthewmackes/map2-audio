import asyncio

import app.main as app_main


class _FakeHub:
    def __init__(self):
        self.cluster_router = None


class _FakeDiscovery:
    def __init__(self, order):
        self.order = order
        self.broadcast_calls = []
        self.stopped = 0

    def broadcast_local_node(self, node_id, hostname, port):
        self.broadcast_calls.append((node_id, hostname, port))
        self.order.append("broadcast")
        return True

    def stop(self):
        self.stopped += 1
        self.order.append("discovery.stop")


class _FakeTransport:
    def __init__(self, order):
        self.order = order

    async def start(self):
        self.order.append("rtp.start")

    async def stop(self):
        self.order.append("rtp.stop")


class _FakeClusterRouter:
    def __init__(self, order):
        self.order = order
        self.discovery = None
        self.transport = None
        self.hub = None

    def set_discovery(self, discovery):
        self.discovery = discovery
        self.order.append("router.set_discovery")

    def set_transport(self, transport):
        self.transport = transport
        self.order.append("router.set_transport")

    def set_hub(self, hub):
        self.hub = hub
        self.order.append("router.set_hub")

    async def start(self):
        self.order.append("router.start")

    async def stop(self):
        self.order.append("router.stop")


class _FakeClusterClock:
    def __init__(self, order):
        self.order = order

    async def start(self):
        self.order.append("clock.start")

    async def stop(self):
        self.order.append("clock.stop")


def test_start_and_stop_cluster_midi_services(monkeypatch):
    order = []
    hub = _FakeHub()
    discovery = _FakeDiscovery(order)
    transport = _FakeTransport(order)
    router = _FakeClusterRouter(order)
    clock = _FakeClusterClock(order)

    monkeypatch.setattr(app_main, "_midi_cluster_enabled", lambda: True)
    monkeypatch.setattr("app.services.midi_hub.hub.get_midi_hub", lambda: hub)
    monkeypatch.setattr("app.services.midi_hub.midi_discovery.get_midi_discovery_service", lambda: discovery)
    monkeypatch.setattr("app.services.midi_hub.rtp_transport.get_rtp_transport", lambda: transport)
    monkeypatch.setattr("app.services.midi_hub.cluster_router.get_midi_cluster_router", lambda: router)
    monkeypatch.setattr("app.services.midi_hub.cluster_clock.get_midi_cluster_clock", lambda: clock)

    async def _run():
        services = await app_main.start_cluster_midi_services(
            app_main.logger,
            node_id="node-a",
            hostname="host-a",
            api_port=8080,
        )
        await app_main.stop_cluster_midi_services(app_main.logger, services)
        return services

    services = asyncio.run(_run())

    assert services["midi_hub"] is hub
    assert discovery.broadcast_calls == [("node-a", "host-a", 8080)]
    assert hub.cluster_router is None
    assert discovery.stopped == 1
    assert order == [
        "broadcast",
        "rtp.start",
        "router.set_discovery",
        "router.set_transport",
        "router.set_hub",
        "router.start",
        "clock.start",
        "clock.stop",
        "router.stop",
        "rtp.stop",
        "discovery.stop",
    ]


def test_start_cluster_midi_services_skips_when_cluster_config_is_absent(monkeypatch):
    monkeypatch.setattr("app.config.config_get", lambda key, default=None: default)

    async def _run():
        return await app_main.start_cluster_midi_services(
            app_main.logger,
            node_id="node-a",
            hostname="host-a",
            api_port=8080,
        )

    assert asyncio.run(_run()) is None
