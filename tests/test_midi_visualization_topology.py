"""T2500-MV-A2 — topology assembler unit tests."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.midi_visualization_topology import build_topology


# ---------------------------------------------------------------------
# Test fixtures (minimal, structural shapes)
# ---------------------------------------------------------------------


@dataclass
class _FakePort:
    name: str
    id: str
    is_input: bool
    is_virtual: bool = False


@dataclass
class _FakeControl:
    target: str | None


@dataclass
class _FakeDescriptor:
    pack_id: str
    model: str
    kind: str
    controls: tuple[_FakeControl, ...]


@dataclass
class _FakeActiveMapping:
    controller_key: str
    descriptor: _FakeDescriptor


# ---------------------------------------------------------------------
# Tests — empty + each tier alone
# ---------------------------------------------------------------------


def test_empty_topology_returns_empty_arrays() -> None:
    topo = build_topology(
        ports_provider=lambda: [],
        mappings_provider=lambda: [],
        targets_provider=lambda: [],
    )
    assert topo == {"nodes": [], "edges": []}


def test_ports_only_renders_device_tier() -> None:
    ports = [
        _FakePort(name="UA-1000 In", id="alsa:24:0", is_input=True),
        _FakePort(name="UA-1000 Out", id="alsa:24:1", is_input=False),
    ]
    topo = build_topology(
        ports_provider=lambda: ports,
        mappings_provider=lambda: [],
        targets_provider=lambda: [],
    )
    nodes = topo["nodes"]
    # Output ports are intentionally hidden (we visualize input flow).
    assert len(nodes) == 1
    assert nodes[0]["id"] == "device:alsa:24:0"
    assert nodes[0]["kind"] == "device"
    assert nodes[0]["label"] == "UA-1000 In"
    assert nodes[0]["raw"]["is_input"] is True
    assert topo["edges"] == []


# ---------------------------------------------------------------------
# Tests — full three-tier
# ---------------------------------------------------------------------


def test_full_topology_renders_all_three_tiers_with_edges() -> None:
    ports = [
        _FakePort(name="Commander", id="alsa:32:0", is_input=True),
    ]
    mapping = _FakeActiveMapping(
        controller_key="alsa:32:0",
        descriptor=_FakeDescriptor(
            pack_id="meloaudio",
            model="midi-commander",
            kind="midi_controller",
            controls=(
                _FakeControl(target="audio.snapshot.recall"),
                _FakeControl(target="audio.chain.5.bypass"),  # pattern match
                _FakeControl(target="audio.unknown.target"),  # no match (no edge)
                _FakeControl(target=None),  # skipped
            ),
        ),
    )
    targets = [
        ("audio.snapshot.recall", False),
        ("audio.master.volume", False),
        ("audio.chain.*.bypass", True),
    ]
    topo = build_topology(
        ports_provider=lambda: ports,
        mappings_provider=lambda: [mapping],
        targets_provider=lambda: targets,
    )

    by_id = {n["id"]: n for n in topo["nodes"]}
    # 1 device + 1 mapping + 3 targets = 5 nodes
    assert set(by_id.keys()) == {
        "device:alsa:32:0",
        "mapping:alsa:32:0",
        "target:audio.snapshot.recall",
        "target:audio.master.volume",
        "target:audio.chain.*.bypass",
    }
    assert by_id["mapping:alsa:32:0"]["raw"]["control_count"] == 4
    assert by_id["target:audio.chain.*.bypass"]["raw"]["is_pattern"] is True
    assert by_id["target:audio.master.volume"]["raw"]["is_pattern"] is False

    edges = {(e["source"], e["target"]) for e in topo["edges"]}
    # Device → mapping edge from controller_key match.
    assert ("device:alsa:32:0", "mapping:alsa:32:0") in edges
    # Mapping → exact target edge.
    assert ("mapping:alsa:32:0", "target:audio.snapshot.recall") in edges
    # Mapping → pattern target edge (control matched the pattern).
    assert ("mapping:alsa:32:0", "target:audio.chain.*.bypass") in edges
    # No edge for the unmatched / null targets.
    assert ("mapping:alsa:32:0", "target:audio.unknown.target") not in edges
    # No edge for the volume target (no control referenced it).
    assert ("mapping:alsa:32:0", "target:audio.master.volume") not in edges


# ---------------------------------------------------------------------
# Tests — defensive behavior
# ---------------------------------------------------------------------


def test_provider_exception_falls_back_to_empty_list() -> None:
    def _boom() -> list[Any]:
        raise RuntimeError("provider down")

    topo = build_topology(
        ports_provider=_boom,
        mappings_provider=lambda: [],
        targets_provider=lambda: [],
    )
    assert topo == {"nodes": [], "edges": []}


def test_unmatched_controller_key_does_not_create_device_edge() -> None:
    """A mapping whose controller_key is not a known port id should
    still produce a mapping node (it's loaded), just no inbound edge."""
    ports = [_FakePort(name="UA-1000", id="alsa:24:0", is_input=True)]
    mapping = _FakeActiveMapping(
        controller_key="unknown-host-id",
        descriptor=_FakeDescriptor(
            pack_id="x",
            model="y",
            kind="midi_controller",
            controls=(_FakeControl(target="audio.snapshot.recall"),),
        ),
    )
    topo = build_topology(
        ports_provider=lambda: ports,
        mappings_provider=lambda: [mapping],
        targets_provider=lambda: [("audio.snapshot.recall", False)],
    )
    edges = {(e["source"], e["target"]) for e in topo["edges"]}
    assert ("device:alsa:24:0", "mapping:unknown-host-id") not in edges
    # The mapping → target edge still wires up.
    assert ("mapping:unknown-host-id", "target:audio.snapshot.recall") in edges


def test_duplicate_target_references_collapse_to_single_edge() -> None:
    mapping = _FakeActiveMapping(
        controller_key="k",
        descriptor=_FakeDescriptor(
            pack_id="x",
            model="y",
            kind="midi_controller",
            controls=(
                _FakeControl(target="audio.snapshot.recall"),
                _FakeControl(target="audio.snapshot.recall"),
                _FakeControl(target="audio.snapshot.recall"),
            ),
        ),
    )
    topo = build_topology(
        ports_provider=lambda: [],
        mappings_provider=lambda: [mapping],
        targets_provider=lambda: [("audio.snapshot.recall", False)],
    )
    mapping_to_target = [
        e for e in topo["edges"] if e["source"].startswith("mapping:")
    ]
    assert len(mapping_to_target) == 1
