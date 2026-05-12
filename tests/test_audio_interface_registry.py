"""Tests for `app.services.audio_interface_registry`.

T2518: ensures the registry merges PipeWire, AVB, and cluster sources into a
single canonical list with stable IDs, and degrades gracefully when any
source is unavailable.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List

import pytest

from app.services.audio_interface_registry import (
    AudioInterfaceRegistry,
    derive_avb_interface_id,
    derive_cluster_interface_id,
    derive_pipewire_interface_id,
)


def _make_pw_dump(*, vendor_id: str = "0x582", product_id: str = "0x0007", serial: str = "edirol-0001") -> List[Dict[str, Any]]:
    return [
        {
            "type": "PipeWire:Interface:Node",
            "id": 42,
            "info": {
                "props": {
                    "media.class": "Audio/Source",
                    "device.vendor.id": vendor_id,
                    "device.product.id": product_id,
                    "device.serial": serial,
                    "device.vendor.name": "Roland",
                    "device.product.name": "Edirol UA-1000",
                    "node.description": "Edirol UA-1000",
                    "audio.channels": 8,
                    "audio.rate": 48000,
                },
            },
        },
        {
            "type": "PipeWire:Interface:Node",
            "id": 43,
            "info": {
                "props": {
                    "media.class": "Audio/Sink",
                    "device.vendor.id": vendor_id,
                    "device.product.id": product_id,
                    "device.serial": serial,
                    "device.vendor.name": "Roland",
                    "device.product.name": "Edirol UA-1000",
                    "node.description": "Edirol UA-1000",
                    "audio.channels": 10,
                    "audio.rate": 48000,
                },
            },
        },
        {
            "type": "PipeWire:Interface:Node",
            "id": 51,
            "info": {
                "props": {
                    "media.class": "Audio/Sink",
                    "api.alsa.card.name": "HDA Intel PCH",
                    "node.description": "Built-in audio",
                    "audio.channels": 2,
                },
            },
        },
        {
            "type": "PipeWire:Interface:Node",
            "id": 99,
            "info": {
                "props": {
                    "media.class": "Stream/Output/Audio",  # ← should be ignored
                    "node.description": "Firefox",
                },
            },
        },
    ]


def _make_avb_capabilities() -> Dict[str, Any]:
    return {
        "avb_talkers": [
            {
                "endpoint_id": "AVB-STREAM-0001",
                "device_name": "MOTU 24Ai",
                "host": "10.0.0.42",
                "channels": 24,
                "sample_rate": 48000,
                "available": True,
            },
        ],
        "avb_listeners": [
            {
                "endpoint_id": "AVB-STREAM-0002",
                "device_name": "QSC TouchMix",
                "host": "10.0.0.55",
                "channels": 16,
                "sample_rate": 48000,
                "available": False,
            },
        ],
    }


def _make_cluster_inventory() -> Dict[str, Any]:
    return {
        "peer-node-7": {
            "pipewire_devices": [
                {
                    "identifier": "tascam-us144mkii",
                    "name": "TASCAM US-144MKII",
                    "vendor": "TASCAM",
                    "product": "US-144MKII",
                    "input_count": 4,
                    "output_count": 4,
                    "available": True,
                },
            ],
        },
        "local-node-1": {
            # Should be elided — local-node devices come via PipeWire source.
            "pipewire_devices": [
                {
                    "identifier": "ua-1000-local",
                    "name": "Edirol UA-1000",
                    "input_count": 8,
                    "output_count": 10,
                },
            ],
        },
    }


def test_pipewire_interface_id_prefers_usb_identity() -> None:
    interface_id, transport = derive_pipewire_interface_id(
        {
            "device.vendor.id": "0x582",
            "device.product.id": "0x0007",
            "device.serial": "edirol-0001",
        }
    )
    assert interface_id == "pipewire:usb:0x582:0x0007:edirol-0001"
    assert transport == "pipewire_usb"


def test_pipewire_interface_id_falls_back_to_alsa_card() -> None:
    interface_id, transport = derive_pipewire_interface_id(
        {"api.alsa.card.name": "HDA Intel PCH"}
    )
    assert interface_id == "pipewire:alsa:hda-intel-pch"
    assert transport == "pipewire_alsa"


def test_avb_interface_id_sanitizes_endpoint() -> None:
    assert derive_avb_interface_id("AVB STREAM/0001") == "avb:avb-stream-0001"


def test_cluster_interface_id_requires_both_fragments() -> None:
    assert derive_cluster_interface_id("node-1", "ua-1000") == "cluster:node-1:ua-1000"
    assert derive_cluster_interface_id("", "ua-1000") == ""
    assert derive_cluster_interface_id("node-1", "") == ""


@pytest.mark.asyncio
async def test_registry_merges_all_sources_with_stable_ids() -> None:
    registry = AudioInterfaceRegistry(
        pipewire_dump_loader=lambda: _async_value(_make_pw_dump()),
        avb_capabilities_loader=lambda: _async_value(_make_avb_capabilities()),
        cluster_inventory_loader=lambda: _async_value(_make_cluster_inventory()),
        local_node_id_loader=lambda: _async_value("local-node-1"),
    )

    payload = await registry.list_interfaces()
    interfaces = payload["interfaces"]
    ids = [iface["interface_id"] for iface in interfaces]

    # Source/Sink for the same USB box collapse into a single record.
    assert "pipewire:usb:0x582:0x0007:edirol-0001" in ids
    assert "pipewire:alsa:hda-intel-pch" in ids
    assert "avb:avb-stream-0001" in ids
    assert "avb:avb-stream-0002" in ids
    assert "cluster:peer-node-7:tascam-us144mkii" in ids
    # Local node devices must not be projected as cluster records.
    assert not any(iface.startswith("cluster:local-node-1:") for iface in ids)
    # Streams (non-Audio/Source/Sink) must not appear.
    assert all(not iface["display_name"].startswith("Firefox") for iface in interfaces)

    usb_record = next(iface for iface in interfaces if iface["interface_id"] == "pipewire:usb:0x582:0x0007:edirol-0001")
    assert usb_record["transport"] == "pipewire_usb"
    assert usb_record["input_port_count"] == 8
    assert usb_record["output_port_count"] == 10
    assert usb_record["vendor"] == "Roland"
    assert usb_record["sample_rate"] == 48000
    assert usb_record["is_default"] is True

    talker_record = next(iface for iface in interfaces if iface["interface_id"] == "avb:avb-stream-0001")
    assert talker_record["direction"] == "talker"
    assert talker_record["input_port_count"] == 24
    assert talker_record["output_port_count"] == 0

    listener_record = next(iface for iface in interfaces if iface["interface_id"] == "avb:avb-stream-0002")
    assert listener_record["direction"] == "listener"
    assert listener_record["output_port_count"] == 16
    assert listener_record["available"] is False

    assert payload["default_interface_id"] == "pipewire:usb:0x582:0x0007:edirol-0001"


@pytest.mark.asyncio
async def test_registry_degrades_when_pipewire_unavailable() -> None:
    async def boom() -> Any:
        raise RuntimeError("pw-dump missing")

    registry = AudioInterfaceRegistry(
        pipewire_dump_loader=boom,
        avb_capabilities_loader=lambda: _async_value(_make_avb_capabilities()),
        cluster_inventory_loader=lambda: _async_value({}),
        local_node_id_loader=lambda: _async_value(None),
    )

    payload = await registry.list_interfaces()
    ids = [iface["interface_id"] for iface in payload["interfaces"]]
    assert ids == ["avb:avb-stream-0001", "avb:avb-stream-0002"]
    # Default falls back to the first available record once no PipeWire-USB exists.
    assert payload["default_interface_id"] == "avb:avb-stream-0001"


@pytest.mark.asyncio
async def test_registry_returns_empty_when_all_sources_fail() -> None:
    async def boom() -> Any:
        raise RuntimeError("nope")

    registry = AudioInterfaceRegistry(
        pipewire_dump_loader=boom,
        avb_capabilities_loader=boom,
        cluster_inventory_loader=boom,
        local_node_id_loader=boom,
    )

    payload = await registry.list_interfaces()
    assert payload["interfaces"] == []
    assert payload["default_interface_id"] is None


async def _async_value(value: Any) -> Any:
    await asyncio.sleep(0)
    return value
