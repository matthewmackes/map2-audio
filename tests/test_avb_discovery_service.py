import types

from app.services.avb import avb_discovery


class _FakeEnhancedMDNSDiscovery:
    def __init__(self, service_type: str, cache_timeout: int):
        self.service_type = service_type
        self.cache_timeout = cache_timeout
        self.added = []

    def get_local_addresses(self):
        return ["192.168.1.42"]

    def add_discovered_node(self, **kwargs):
        self.added.append(kwargs)

    def cleanup_offline_nodes(self):
        return 0


class _FakeServiceInfo:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs


class _FakeZeroconf:
    def __init__(self):
        self.registered = []
        self.updated = []
        self.unregistered = []
        self.closed = False

    def register_service(self, service_info):
        self.registered.append(service_info)

    def update_service(self, service_info):
        self.updated.append(service_info)

    def unregister_service(self, service_info):
        self.unregistered.append(service_info)

    def close(self):
        self.closed = True


def _enable_avb_config(key, default=None):
    if key == "avb.enabled":
        return True
    return default


def test_broadcast_local_node_updates_discovery_cache(monkeypatch):
    monkeypatch.setattr(avb_discovery, "config_get", _enable_avb_config)
    monkeypatch.setattr(avb_discovery, "EnhancedMDNSDiscovery", _FakeEnhancedMDNSDiscovery)
    monkeypatch.setattr(avb_discovery, "is_avb_available", lambda: True)

    service = avb_discovery.AvbDiscoveryService()
    monkeypatch.setattr(
        service,
        "get_local_capabilities",
        lambda: avb_discovery.AvbCapabilities(interface="enp3s0", stream_id="abc123"),
    )
    monkeypatch.setattr(service, "_register_local_advertisement", lambda **_: False)

    ok = service.broadcast_local_node("AVB-NODE-1", "node-a", 8000)
    assert ok is True
    assert "AVB-NODE-1" in service.discovered_avb_nodes

    node = service.discovered_avb_nodes["AVB-NODE-1"]
    assert node.hostname == "node-a"
    assert node.addresses == ["192.168.1.42"]
    assert service.mdns_discovery.added[0]["node_id"] == "AVB-NODE-1"


def test_register_local_advertisement_registers_then_updates(monkeypatch):
    monkeypatch.setattr(avb_discovery, "config_get", _enable_avb_config)
    monkeypatch.setattr(avb_discovery, "EnhancedMDNSDiscovery", _FakeEnhancedMDNSDiscovery)
    monkeypatch.setattr(avb_discovery, "is_avb_available", lambda: True)

    service = avb_discovery.AvbDiscoveryService()
    fake_zc = _FakeZeroconf()
    service._zeroconf = fake_zc
    service._zeroconf_mod = types.SimpleNamespace(ServiceInfo=_FakeServiceInfo)

    first_ok = service._register_local_advertisement(
        node_id="AVB-NODE-1",
        hostname="node-a",
        port=8000,
        addresses=["192.168.1.42"],
        txt_records={"node_id": "AVB-NODE-1", "ptp_sync": "yes"},
    )
    second_ok = service._register_local_advertisement(
        node_id="AVB-NODE-1",
        hostname="node-a",
        port=8000,
        addresses=["192.168.1.42"],
        txt_records={"node_id": "AVB-NODE-1", "ptp_sync": "no"},
    )

    assert first_ok is True
    assert second_ok is True
    assert len(fake_zc.registered) == 1
    assert len(fake_zc.updated) == 1


def test_shutdown_unregisters_and_closes_zeroconf(monkeypatch):
    monkeypatch.setattr(avb_discovery, "config_get", _enable_avb_config)
    monkeypatch.setattr(avb_discovery, "EnhancedMDNSDiscovery", _FakeEnhancedMDNSDiscovery)
    monkeypatch.setattr(avb_discovery, "is_avb_available", lambda: True)

    service = avb_discovery.AvbDiscoveryService()
    fake_zc = _FakeZeroconf()
    fake_info = object()
    service._zeroconf = fake_zc
    service._service_info = fake_info
    service._service_name = "AVB-NODE-1._map2-avb._tcp.local."

    service.shutdown()

    assert fake_zc.unregistered == [fake_info]
    assert fake_zc.closed is True
    assert service._zeroconf is None
    assert service._service_info is None
    assert service._service_name is None
