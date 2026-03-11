import json
import subprocess

from app.config import CONFIG_SCHEMA
from app.services.cluster.distributed_event_bus import EventType
from app.services.cluster.enhanced_node_identity import NodeHardwareDetector
from app.services.cluster.mdns_discovery_enhanced import EnhancedMDNSDiscovery
from app.services.cluster.registry import ClusterRegistry


def test_cluster_midi_config_schema_contains_foundation_keys():
    expected = {
        "midi.cluster.enabled": "MAP2_MIDI_CLUSTER_ENABLED",
        "midi.cluster.auto_connect": "MAP2_MIDI_CLUSTER_AUTO_CONNECT",
        "midi.cluster.transport": "MAP2_MIDI_CLUSTER_TRANSPORT",
        "midi.cluster.discovery_interval_s": "MAP2_MIDI_CLUSTER_DISCOVERY_INTERVAL_S",
        "midi.cluster.discovery_timeout_s": "MAP2_MIDI_CLUSTER_DISCOVERY_TIMEOUT_S",
        "midi.cluster.max_remote_connections": "MAP2_MIDI_CLUSTER_MAX_REMOTE_CONNECTIONS",
        "midi.cluster.clock_sync_enabled": "MAP2_MIDI_CLUSTER_CLOCK_SYNC_ENABLED",
        "midi.cluster.clock_master_strategy": "MAP2_MIDI_CLUSTER_CLOCK_MASTER_STRATEGY",
        "midi.cluster.failover_enabled": "MAP2_MIDI_CLUSTER_FAILOVER_ENABLED",
        "midi.cluster.failover_timeout_ms": "MAP2_MIDI_CLUSTER_FAILOVER_TIMEOUT_MS",
        "midi.cluster.rtp_midi_port": "MAP2_MIDI_CLUSTER_RTP_MIDI_PORT",
        "midi.cluster.latency_budget_ms": "MAP2_MIDI_CLUSTER_LATENCY_BUDGET_MS",
    }

    for key, env_var in expected.items():
        assert key in CONFIG_SCHEMA
        assert CONFIG_SCHEMA[key].env_var == env_var


def test_cluster_event_bus_exposes_midi_event_types():
    expected_values = {
        "MIDI_PORT_DISCOVERED": "midi.port.discovered",
        "MIDI_PORT_LOST": "midi.port.lost",
        "MIDI_NODE_DISCOVERED": "midi.node.discovered",
        "MIDI_NODE_LOST": "midi.node.lost",
        "MIDI_CONNECTION_REQUESTED": "midi.connection.requested",
        "MIDI_CONNECTION_ESTABLISHED": "midi.connection.established",
        "MIDI_CONNECTION_FAILED": "midi.connection.failed",
        "MIDI_CONNECTION_LOST": "midi.connection.lost",
        "MIDI_FAILOVER_TRIGGERED": "midi.failover.triggered",
        "MIDI_FAILOVER_COMPLETED": "midi.failover.completed",
        "MIDI_CLOCK_MASTER_ELECTED": "midi.clock.master_elected",
        "MIDI_CLOCK_DRIFT_DETECTED": "midi.clock.drift_detected",
        "MIDI_PROFILE_SHARED": "midi.profile.shared",
    }

    for member_name, value in expected_values.items():
        assert getattr(EventType, member_name).value == value


def test_detect_midi_ports_parses_aconnect_output(monkeypatch):
    input_stdout = """
client 14: 'Midi Through' [type=kernel]
    0 'Midi Through Port-0'
client 20: 'Lexicon MPX1' [type=kernel]
    0 'Lexicon MPX1 MIDI 1'
"""
    output_stdout = """
client 24: 'Controller' [type=user]
    0 'Controller Out'
"""

    def _run(cmd, **kwargs):
        if cmd == ["aconnect", "-i"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=input_stdout, stderr="")
        if cmd == ["aconnect", "-o"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=output_stdout, stderr="")
        raise AssertionError(f"unexpected command: {cmd}")

    monkeypatch.setattr("app.services.cluster.enhanced_node_identity.subprocess.run", _run)

    midi_inputs, midi_outputs = NodeHardwareDetector.detect_midi_ports()

    assert midi_inputs == ["Lexicon MPX1:Lexicon MPX1 MIDI 1"]
    assert midi_outputs == ["Controller:Controller Out"]


def test_enhanced_mdns_capabilities_accepts_port_lists_for_counts():
    discovery = EnhancedMDNSDiscovery(service_type="_map2-midi._tcp.local.", cache_timeout=120)

    node = discovery.add_discovered_node(
        node_id="node-a",
        hostname="node-a",
        addresses=["10.0.0.2"],
        txt_records={
            "cpu_cores": "8",
            "memory_gb": "16",
            "midi_in": "Controller In,Keys In",
            "midi_out": "Rack Out",
        },
        port=8080,
    )

    assert node.capabilities is not None
    assert node.capabilities.midi_inputs == 2
    assert node.capabilities.midi_outputs == 1


def test_cluster_registry_persists_midi_fields(tmp_path):
    registry = ClusterRegistry(db_path=tmp_path / "cluster.db")

    ok = registry.add_or_update_node(
        node_id="node-a",
        hostname="host-a",
        role="AUDIO-NODE",
        midi_input_count=2,
        midi_output_count=1,
        midi_devices=["Lexicon MPX1", "USB Controller"],
    )

    assert ok is True
    node = registry.get_node("node-a")
    assert node is not None
    assert node["midi_input_count"] == 2
    assert node["midi_output_count"] == 1
    assert json.loads(node["midi_devices"]) == ["Lexicon MPX1", "USB Controller"]
