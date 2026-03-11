import types
from datetime import timedelta

from app.services.midi_hub import midi_discovery
from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.ports import VirtualMidiPort


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


def _config_get(key, default=None):
    overrides = {
        "midi.enabled": True,
        "midi.cluster.enabled": True,
        "midi.cluster.discovery_timeout_s": 120,
        "midi.cluster.discovery_interval_s": 60,
        "backend.port": 8080,
    }
    return overrides.get(key, default)


def test_midi_capabilities_txt_roundtrip_and_truncation():
    long_names = [f"Very Long MIDI Device Name {index:02d} With Extra Detail" for index in range(12)]
    capabilities = midi_discovery.MidiCapabilities(
        input_ports=long_names,
        output_ports=long_names,
        virtual_ports=["Virtual Matrix", "Virtual Patchbay"],
        hub_running=True,
        clock_source="external",
        clock_bpm=123.45,
        protocol_version="2.0",
        supports_midi2=True,
        sysex_enabled=True,
    )

    txt_records = capabilities.to_txt_records()
    assert len(txt_records["midi_in"]) <= 240
    assert len(txt_records["midi_out"]) <= 240
    assert txt_records["proto"] == "2.0"

    parsed = midi_discovery.MidiCapabilities.from_txt_records(txt_records)
    assert parsed.input_ports
    assert parsed.output_ports
    assert parsed.virtual_ports == ["Virtual Matrix", "Virtual Patchbay"]
    assert parsed.clock_source == "external"
    assert parsed.supports_midi2 is True
    assert parsed.sysex_enabled is True


def test_get_local_capabilities_prefers_registry_profile_names(monkeypatch):
    hub = MidiHub(auto_discover_alsa=False)
    hub.register_port(VirtualMidiPort(port_id="in1", name="USB Port A", direction="input"))
    hub.register_port(VirtualMidiPort(port_id="out1", name="USB Port B", direction="output"))
    hub.register_port(VirtualMidiPort(port_id="virt1", name="Internal Loop", direction="duplex"))

    class _FakeRegistry:
        def snapshot(self):
            return {
                "devices": [
                    {
                        "profile_id": "lexicon_mpx1",
                        "profile_name": "Lexicon MPX1",
                        "port_names": ["USB Port A", "USB Port B"],
                    }
                ],
                "profiles": [
                    {"profile_id": "lexicon_mpx1", "supports_sysex": True},
                ],
            }

    monkeypatch.setattr(midi_discovery, "get_midi_hub", lambda: hub)
    monkeypatch.setattr(midi_discovery, "get_midi_device_registry", lambda: _FakeRegistry())
    monkeypatch.setattr(midi_discovery, "get_midi_clock_engine", lambda: types.SimpleNamespace(status=lambda: {"source_mode": "external", "detected_bpm": 98.0, "bpm": 120.0}))
    monkeypatch.setattr(midi_discovery, "get_midi2_manager", lambda: types.SimpleNamespace(status=lambda: {"enabled": True}))

    capabilities = midi_discovery.MidiDiscoveryService().get_local_capabilities()

    assert capabilities.input_ports == ["Lexicon MPX1", "Internal Loop"]
    assert capabilities.output_ports == ["Lexicon MPX1", "Internal Loop"]
    assert capabilities.virtual_ports == ["Lexicon MPX1", "Internal Loop"]
    assert capabilities.clock_source == "external"
    assert capabilities.clock_bpm == 98.0
    assert capabilities.supports_midi2 is True
    assert capabilities.sysex_enabled is True


def test_broadcast_local_node_updates_discovery_cache(monkeypatch):
    monkeypatch.setattr(midi_discovery, "config_get", _config_get)
    monkeypatch.setattr(midi_discovery, "EnhancedMDNSDiscovery", _FakeEnhancedMDNSDiscovery)

    service = midi_discovery.MidiDiscoveryService()
    monkeypatch.setattr(
        service,
        "get_local_capabilities",
        lambda: midi_discovery.MidiCapabilities(
            input_ports=["Controller In"],
            output_ports=["Rack Out"],
            virtual_ports=["Virtual Patchbay"],
            hub_running=True,
        ),
    )
    monkeypatch.setattr(service, "_register_local_advertisement", lambda **_: False)

    ok = service.broadcast_local_node("MIDI-NODE-1", "node-a", 8080)
    assert ok is True
    assert "MIDI-NODE-1" in service.discovered_midi_nodes
    assert service.discovered_midi_nodes["MIDI-NODE-1"].addresses == ["192.168.1.42"]
    assert service.mdns_discovery.added[0]["node_id"] == "MIDI-NODE-1"


def test_register_local_advertisement_registers_then_updates(monkeypatch):
    monkeypatch.setattr(midi_discovery, "config_get", _config_get)
    monkeypatch.setattr(midi_discovery, "EnhancedMDNSDiscovery", _FakeEnhancedMDNSDiscovery)

    service = midi_discovery.MidiDiscoveryService()
    fake_zc = _FakeZeroconf()
    service._zeroconf = fake_zc
    service._zeroconf_mod = types.SimpleNamespace(ServiceInfo=_FakeServiceInfo)

    first_ok = service._register_local_advertisement(
        node_id="MIDI-NODE-1",
        hostname="node-a",
        port=8080,
        addresses=["192.168.1.42"],
        txt_records={"node_id": "MIDI-NODE-1", "midi_in": "Controller In"},
    )
    second_ok = service._register_local_advertisement(
        node_id="MIDI-NODE-1",
        hostname="node-a",
        port=8080,
        addresses=["192.168.1.42"],
        txt_records={"node_id": "MIDI-NODE-1", "midi_in": "Controller In,Keys"},
    )

    assert first_ok is True
    assert second_ok is True
    assert len(fake_zc.registered) == 1
    assert len(fake_zc.updated) == 1


def test_cleanup_offline_nodes_and_filter_helpers(monkeypatch):
    monkeypatch.setattr(midi_discovery, "config_get", _config_get)
    monkeypatch.setattr(midi_discovery, "EnhancedMDNSDiscovery", _FakeEnhancedMDNSDiscovery)

    service = midi_discovery.MidiDiscoveryService()
    service.add_discovered_node(
        "node-live",
        "live-host",
        ["10.0.0.2"],
        {
            "midi_in": "Controller In",
            "midi_out": "Rack Out",
            "midi_virt": "Patchbay",
        },
        8080,
    )
    service.add_discovered_node(
        "node-stale",
        "stale-host",
        ["10.0.0.3"],
        {
            "midi_in": "",
            "midi_out": "Drum Machine",
            "midi_virt": "",
        },
        8080,
    )
    service.discovered_midi_nodes["node-stale"].last_seen -= timedelta(seconds=121)

    removed = service.cleanup_offline_nodes()

    assert removed == 1
    assert [node.node_id for node in service.get_nodes_with_inputs()] == ["node-live"]
    assert [node.node_id for node in service.get_nodes_with_outputs()] == ["node-live"]
