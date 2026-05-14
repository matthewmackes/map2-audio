"""T2521-7b: SonoBus → AudioInterfaceRegistry adapter tests.

Verifies that SonoBus binding rows project into canonical interface
records compatible with the T2518 snapshot picker.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List

from app.services.audio_interface_registry import (
    AudioInterfaceRegistry,
    TRANSPORT_SONOBUS,
    _sonobus_records_from_bindings,
)


def _stream_binding(**overrides: Any) -> Dict[str, Any]:
    base = {
        "binding_id": "11111111-1111-1111-1111-111111111111",
        "consumer_type": "sonobus_stream",
        "consumer_id": "s-1",
        "consumer_label": "Stream 1",
        "binding_kind": "stream",
        "source_type": "aoo_source",
        "source_descriptor": {"aoo_source_id": 1001},
        "target_type": "aoo_sink",
        "target_descriptor": {"listener_peer_endpoint": "10.0.0.10:10001"},
        "stream_format": "pcm_s24_48000",
        "codec_profile": "pcm",
        "jitter_buffer_ms": 4,
        "resend_policy": "burst_loss_only",
        "latency_target_ms": 8,
        "channel_count": 2,
        "group_id": "g-1",
        "session_label": "set A",
        "transport_protocol": "udp",
        "bind_interface": None,
        "bind_port_local": None,
        "server_endpoint": None,
        "talker_node_id": "node-alpha",
        "listener_node_id": "node-beta",
        "listener_capability": "map2",
        "cluster_role": None,
        "transport_priority": "avb_preferred",
        "scope": "global",
        "scope_id": None,
        "enabled": True,
        "source": "test",
        "metadata": {},
        "created_at": "2026-05-13T00:00:00+00:00",
        "created_by": "test",
        "modified_at": "2026-05-13T00:00:00+00:00",
        "modified_by": "test",
    }
    base.update(overrides)
    return base


def test_records_projection_for_stream_binding():
    records = _sonobus_records_from_bindings([_stream_binding()])
    assert len(records) == 1
    rec = records[0]
    assert rec.transport == TRANSPORT_SONOBUS
    assert rec.interface_id == "sonobus:node-beta:g-1:s-1"
    assert rec.output_port_count == 2
    assert rec.sample_rate == 48000
    assert rec.available is True
    assert any("Capability map2" in note for note in rec.notes)
    assert any("Priority avb_preferred" in note for note in rec.notes)


def test_non_stream_bindings_are_skipped():
    peer_binding = _stream_binding(
        binding_kind="peer",
        consumer_type="sonobus_peer",
        consumer_id="p-1",
        target_descriptor={"endpoint": "10.0.0.10:10001"},
    )
    records = _sonobus_records_from_bindings([peer_binding])
    assert records == []


def test_binding_missing_required_keys_is_dropped():
    bad = _stream_binding(group_id=None)
    assert _sonobus_records_from_bindings([bad]) == []
    bad2 = _stream_binding(listener_node_id=None, target_descriptor={})
    assert _sonobus_records_from_bindings([bad2]) == []


def test_disabled_binding_marked_unavailable():
    rec = _sonobus_records_from_bindings([_stream_binding(enabled=False)])[0]
    assert rec.available is False


def test_endpoint_falls_back_to_target_descriptor_endpoint():
    rec = _sonobus_records_from_bindings(
        [
            _stream_binding(
                listener_node_id=None,
                target_descriptor={"endpoint": "192.168.1.10:10001"},
            )
        ]
    )[0]
    assert rec.interface_id == "sonobus:192.168.1.10_10001:g-1:s-1"


def test_registry_includes_sonobus_records_via_injected_loader():
    async def _stub_loader() -> List[Dict[str, Any]]:
        return [_stream_binding(consumer_id="reg-1")]

    registry = AudioInterfaceRegistry(
        pipewire_dump_loader=lambda: asyncio.sleep(0, result={}),
        avb_capabilities_loader=lambda: asyncio.sleep(0, result={}),
        cluster_inventory_loader=lambda: asyncio.sleep(0, result={}),
        local_node_id_loader=lambda: asyncio.sleep(0, result=None),
        sonobus_bindings_loader=_stub_loader,
    )
    payload = asyncio.run(registry.list_interfaces())
    interface_ids = [iface["interface_id"] for iface in payload["interfaces"]]
    assert any(iid.startswith("sonobus:") for iid in interface_ids)
    assert TRANSPORT_SONOBUS in payload["transports"]


def test_registry_tolerates_sonobus_loader_failure():
    async def _broken_loader() -> List[Dict[str, Any]]:
        raise RuntimeError("simulated failure")

    registry = AudioInterfaceRegistry(
        pipewire_dump_loader=lambda: asyncio.sleep(0, result={}),
        avb_capabilities_loader=lambda: asyncio.sleep(0, result={}),
        cluster_inventory_loader=lambda: asyncio.sleep(0, result={}),
        local_node_id_loader=lambda: asyncio.sleep(0, result=None),
        sonobus_bindings_loader=_broken_loader,
    )
    payload = asyncio.run(registry.list_interfaces())
    # No SonoBus records, but the call still succeeds.
    assert all(
        not iface["interface_id"].startswith("sonobus:")
        for iface in payload["interfaces"]
    )
