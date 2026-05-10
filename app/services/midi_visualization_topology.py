"""MIDI Connections Visualization — topology assembler.

T2500-MV-A2.

Builds the static graph that the new ``/midi/connections/visualization``
page renders. Three node tiers, two edge tiers:

  Devices  ─► Mappings  ─►  Engine targets
  (libremidi      (active mapping        (engine_command_dispatcher
   input ports     descriptors keyed      registrations: exact + pattern)
   from the host)  by controller_key)

The frontend treats this topology as static-per-fetch; live activity
arrives over the ``/ws/midi/visualization`` WebSocket and animates
between these nodes. The assembler is intentionally read-only and pure
relative to its inputs so it can be unit-tested without touching the
controller-host UDS or starting a backend process.

Inputs (each pluggable for tests):
  - ``ports_provider()``        → list[MidiPortInfo] from MidiHostClient
  - ``mappings_provider()``     → list[ActiveMapping] from ControllerService
  - ``targets_provider()``      → list[(target_or_pattern, is_pattern)]
                                  from EngineCommandDispatcher

Output schema (matches what the frontend expects):

  {
    "nodes": [
      {"id": "device:<port_id>", "kind": "device",  "label": str, "raw": {...}},
      {"id": "mapping:<key>",    "kind": "mapping", "label": str, "raw": {...}},
      {"id": "target:<name>",    "kind": "target",  "label": str, "raw": {...}},
    ],
    "edges": [
      # device → mapping (only when the mapping's controller_key matches
      # the port id; the controller-host loosely matches via
      # alsa_client_pattern but at this layer we keep it strict so the
      # operator sees the *intended* binding, not the loose one)
      {"source": "device:<id>",  "target": "mapping:<key>"},
      # mapping → target (one edge per distinct target referenced in
      # MappingControl.target; pattern targets are routed to their
      # registered pattern node id)
      {"source": "mapping:<key>", "target": "target:<name>"},
    ],
  }

Notes:
  - Node ids use a ``<kind>:<key>`` namespace so the frontend can
    type-discriminate without parsing the label.
  - Edge keys (``source``/``target``) are node ids, not raw keys, so the
    frontend never has to recompose them.
  - Pattern targets (e.g. ``audio.chain.*.bypass``) are surfaced as one
    node per pattern, not one per matched concrete value. The runtime
    edge layer can fan out to the pattern node when a concrete frame
    matches it.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable, Optional, Protocol


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------
# Provider Protocols — kept tiny so tests can pass plain functions.
# ---------------------------------------------------------------------


class _PortLike(Protocol):
    """Subset of MidiPortInfo that the assembler reads."""

    name: str
    id: str
    is_input: bool
    is_virtual: bool


class _MappingLike(Protocol):
    """Subset of ActiveMapping that the assembler reads."""

    controller_key: str
    descriptor: Any  # MappingDescriptor; we only read pack_id/model/controls.


PortsProvider = Callable[[], list[_PortLike]]
MappingsProvider = Callable[[], list[_MappingLike]]
TargetsProvider = Callable[[], list[tuple[str, bool]]]


# ---------------------------------------------------------------------
# Node + edge dataclasses (kept private; serialized by build_topology)
# ---------------------------------------------------------------------


@dataclass(frozen=True)
class _Node:
    id: str
    kind: str  # "device" | "mapping" | "target"
    label: str
    raw: dict[str, Any]


@dataclass(frozen=True)
class _Edge:
    source: str
    target: str


# ---------------------------------------------------------------------
# Public assembler
# ---------------------------------------------------------------------


def build_topology(
    *,
    ports_provider: Optional[PortsProvider] = None,
    mappings_provider: Optional[MappingsProvider] = None,
    targets_provider: Optional[TargetsProvider] = None,
) -> dict[str, list[dict[str, Any]]]:
    """Materialise the three-tier topology as a JSON-ready dict.

    Each provider is optional; defaults read from the live process
    services so production callers can do ``build_topology()`` with no
    arguments. Tests override the providers with stubs.
    """
    ports = _safe_call(ports_provider, _default_ports_provider, default=[])
    mappings = _safe_call(mappings_provider, _default_mappings_provider, default=[])
    targets = _safe_call(targets_provider, _default_targets_provider, default=[])

    device_nodes = [_device_node(p) for p in ports if p.is_input]
    mapping_nodes = [_mapping_node(m) for m in mappings]
    target_nodes = [_target_node(t, is_pattern) for t, is_pattern in targets]

    edges: list[_Edge] = []
    edges.extend(_device_to_mapping_edges(ports=ports, mappings=mappings))
    edges.extend(_mapping_to_target_edges(mappings=mappings, targets=targets))

    return {
        "nodes": [_serialize_node(n) for n in (*device_nodes, *mapping_nodes, *target_nodes)],
        "edges": [{"source": e.source, "target": e.target} for e in edges],
    }


# ---------------------------------------------------------------------
# Node builders
# ---------------------------------------------------------------------


def _device_node(port: _PortLike) -> _Node:
    return _Node(
        id=f"device:{port.id}",
        kind="device",
        label=port.name,
        raw={
            "port_id": port.id,
            "is_input": bool(port.is_input),
            "is_virtual": bool(port.is_virtual),
        },
    )


def _mapping_node(mapping: _MappingLike) -> _Node:
    desc = mapping.descriptor
    pack_id = getattr(desc, "pack_id", "?")
    model = getattr(desc, "model", "?")
    kind = getattr(desc, "kind", "")
    controls = getattr(desc, "controls", ()) or ()
    return _Node(
        id=f"mapping:{mapping.controller_key}",
        kind="mapping",
        label=f"{pack_id}/{model}",
        raw={
            "controller_key": mapping.controller_key,
            "pack_id": str(pack_id),
            "model": str(model),
            "kind": str(kind),
            "control_count": len(controls),
        },
    )


def _target_node(target: str, is_pattern: bool) -> _Node:
    return _Node(
        id=f"target:{target}",
        kind="target",
        label=target,
        raw={"target": target, "is_pattern": bool(is_pattern)},
    )


def _serialize_node(node: _Node) -> dict[str, Any]:
    return {
        "id": node.id,
        "kind": node.kind,
        "label": node.label,
        "raw": dict(node.raw),
    }


# ---------------------------------------------------------------------
# Edge builders
# ---------------------------------------------------------------------


def _device_to_mapping_edges(
    *,
    ports: list[_PortLike],
    mappings: list[_MappingLike],
) -> list[_Edge]:
    """One edge per (port, mapping) pair where ``mapping.controller_key``
    references the port's id.

    The controller-host's loose match (alsa_client_pattern) is *not*
    considered here. The visualization shows the *intended* binding so
    operators see surprising loose matches as missing edges, not as
    silently-fan-out edges.
    """
    by_port_id = {p.id: p for p in ports if p.is_input}
    out: list[_Edge] = []
    for mapping in mappings:
        port = by_port_id.get(mapping.controller_key)
        if port is None:
            continue
        out.append(
            _Edge(
                source=f"device:{port.id}",
                target=f"mapping:{mapping.controller_key}",
            )
        )
    return out


def _mapping_to_target_edges(
    *,
    mappings: list[_MappingLike],
    targets: list[tuple[str, bool]],
) -> list[_Edge]:
    """One edge per (mapping, target) where the mapping's controls
    reference the target.

    Exact targets are matched by string equality. Pattern targets
    (registered with ``register_pattern``) are matched via
    ``fnmatch.fnmatchcase`` against the control's target string. A
    mapping that references the same target multiple times produces a
    single edge.
    """
    import fnmatch

    exact_set = {t for t, is_pattern in targets if not is_pattern}
    patterns = [t for t, is_pattern in targets if is_pattern]

    out: list[_Edge] = []
    for mapping in mappings:
        controls = getattr(mapping.descriptor, "controls", ()) or ()
        seen_for_mapping: set[str] = set()
        for control in controls:
            ctrl_target = getattr(control, "target", None)
            if not isinstance(ctrl_target, str) or not ctrl_target:
                continue
            matched_target_id = _match_target(ctrl_target, exact_set, patterns)
            if matched_target_id is None or matched_target_id in seen_for_mapping:
                continue
            seen_for_mapping.add(matched_target_id)
            out.append(
                _Edge(
                    source=f"mapping:{mapping.controller_key}",
                    target=f"target:{matched_target_id}",
                )
            )
    return out


def _match_target(
    ctrl_target: str,
    exact: set[str],
    patterns: list[str],
) -> Optional[str]:
    """Resolve a control's target to its registered topology node key.

    Exact match wins over pattern match (mirrors the dispatcher's own
    routing precedence). Returns the registered key or None when no
    handler claims the target — unmatched targets do not get an edge,
    so the operator sees the gap.
    """
    import fnmatch

    if ctrl_target in exact:
        return ctrl_target
    for pattern in patterns:
        if fnmatch.fnmatchcase(ctrl_target, pattern):
            return pattern
    return None


# ---------------------------------------------------------------------
# Default providers (production wiring)
# ---------------------------------------------------------------------


def _default_ports_provider() -> list[_PortLike]:
    """Live MIDI ports via the controller-host UDS.

    Returns an empty list when the host is unreachable; the topology
    endpoint should still respond rather than 500'ing on a degraded
    daemon.
    """
    try:
        from app.services.midi_host_client import MidiHostClient

        client = MidiHostClient()
        if not client.is_daemon_available():
            return []
        _backend, ports = client.list_ports()
        return list(ports)  # type: ignore[return-value]
    except Exception as exc:  # noqa: BLE001
        logger.warning("midi_visualization_topology: ports_provider failed: %s", exc)
        return []


def _default_mappings_provider() -> list[_MappingLike]:
    try:
        from app.services.controllers import get_controller_service

        # ControllerService.active_mappings() returns dicts (UI shape);
        # we want the raw ActiveMapping descriptors so we can inspect
        # the control list. Reach through the registry.
        svc = get_controller_service()
        return list(svc._mappings.all())  # type: ignore[attr-defined]
    except Exception as exc:  # noqa: BLE001
        logger.warning("midi_visualization_topology: mappings_provider failed: %s", exc)
        return []


def _default_targets_provider() -> list[tuple[str, bool]]:
    try:
        from app.services.engine_command_bridge import get_engine_command_bridge

        bridge = get_engine_command_bridge()
        if bridge is None:
            return []
        return bridge.dispatcher.iter_registrations()
    except Exception as exc:  # noqa: BLE001
        logger.warning("midi_visualization_topology: targets_provider failed: %s", exc)
        return []


def _safe_call(
    provider: Optional[Callable[[], list[Any]]],
    default_fn: Callable[[], list[Any]],
    *,
    default: list[Any],
) -> list[Any]:
    """Call ``provider`` if supplied; else fall back to the default
    production provider; on any exception in either, return ``default``.

    Defensive: a degraded subsystem (host not running, dispatcher not
    initialized) must not 500 the topology endpoint.
    """
    fn = provider if provider is not None else default_fn
    try:
        result = fn()
    except Exception as exc:  # noqa: BLE001
        logger.warning("midi_visualization_topology: provider %r raised: %s", fn, exc)
        return list(default)
    return list(result) if result is not None else list(default)
