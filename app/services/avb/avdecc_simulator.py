"""
T2499-C — AVDECC simulator scaffold.

A self-contained AVDECC entity simulator that emits the same shape of
entity records the live la_avdecc observer API produces. The route
formatter at app/routes/avb/common.py::_format_avdecc_entity_payload
reads entities through duck-typed attribute lookup
(_read_avdecc_field), so the simulator only needs to provide the
canonical attributes — no la_avdecc dependency, no libpcap.

Used by the binding wizard (T2499-C) to ship the operator flow against
synthetic entities while T004 (real-hardware lab gate) remains blocked.

Design choices
==============

- **Pure Python, zero deps**. The simulator runs in any environment
  the FastAPI backend runs in.
- **Mirrors the la_avdecc observer pattern** as it surfaces in
  app/services/avb/avb_router.py + app/routes/avb/discovery.py. The
  simulator exposes `get_avdecc_entities()` and `find_entity()` so the
  existing route handlers can swap it in by replacing
  `router.avdecc_entity` with a `MockAvdeccController` instance.
- **Three preset benches** (single / 4-entity / 16-entity) for the
  three tiered-UX paths in T2499-C Q2: 1 = one-click; 2-9 = DataTable
  + auto-suggest; 10+ = bulk-import + filter.
- **Substrate-state reporting** (PTP / interface / entity-count) ships
  with the simulator so the wizard's diagnostic panel has a payload
  even with no hardware.

Not in scope for this slice
===========================

- ADP/AECP/ACMP packet emission. The simulator returns formed entity
  records; it does not emit raw IEEE 1722.1 frames. If a future bench
  uses la_avdecc itself to consume the simulator, that's a separate
  AVTP transport adapter — out of scope here.
- Connection orchestration (`connect_stream`, `disconnect_stream`).
  The wizard's binding writer (T2499-C Q3) will call the existing
  routing-matrix authority, not the simulator, so the simulator only
  needs to surface the entity catalog. A no-op connection counter is
  provided so `get_active_connections()` returns a coherent answer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Entity model
# ---------------------------------------------------------------------------


@dataclass
class SimulatedAvdeccEntity:
    """
    A single synthetic AVDECC entity. Attribute names match the lookup
    keys used by `app/routes/avb/common.py::_read_avdecc_field`, so the
    existing route formatter consumes simulator entities byte-identical
    to live ones.
    """

    entity_id: str  # 16-char hex — `_normalize_avdecc_entity_id` accepts hex
    entity_model_id: str
    entity_name: str
    firmware_version: str = "1.0.0-sim"
    mac_address: str = "00:11:22:33:44:55"

    # Capability surface — both flat and nested forms are read by the
    # formatter; we ship the flat form because it's the more direct path.
    talker_stream_sources: int = 0
    listener_stream_sinks: int = 0

    # gPTP — both required for the formatter's `ptp` block.
    gptp_grandmaster_id: str = "0000000000000000"
    gptp_domain_number: int = 0
    gptp_supported: bool = True

    available: bool = True
    last_seen: Optional[datetime] = None

    # Vendor + model labels are read by the wizard's auto-suggest heuristic.
    vendor_name: str = "MAP2 AVDECC Simulator"
    model_name: str = "Synthetic Entity"

    def __post_init__(self) -> None:
        if self.last_seen is None:
            self.last_seen = datetime.now(timezone.utc)

    @property
    def capabilities(self) -> Dict[str, Any]:
        """Nested cap dict — matches the la_avdecc surface fallback path."""
        return {
            "talker_streams": self.talker_stream_sources,
            "listener_streams": self.listener_stream_sinks,
            "is_audio_talker": self.talker_stream_sources > 0,
            "is_audio_listener": self.listener_stream_sinks > 0,
            "gptp_supported": self.gptp_supported,
        }

    def isAudioTalker(self) -> bool:  # noqa: N802 — la_avdecc casing
        return self.talker_stream_sources > 0

    def isAudioListener(self) -> bool:  # noqa: N802 — la_avdecc casing
        return self.listener_stream_sinks > 0


# ---------------------------------------------------------------------------
# Substrate-state report (PTP / interface / entity-count)
# ---------------------------------------------------------------------------


@dataclass
class SimulatedSubstrateState:
    """
    What the wizard's diagnostic panel renders. Mirrors the live
    substrate-state report shape from `app/services/avb/readiness.py`
    + `ptp_monitor.py`.
    """

    interface_name: str = "sim0"
    interface_up: bool = True
    ptp_locked: bool = True
    ptp_offset_ns: float = 0.0
    grandmaster_id: str = "0000000000000000"
    entity_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "interface": {
                "name": self.interface_name,
                "up": self.interface_up,
            },
            "ptp": {
                "locked": self.ptp_locked,
                "offset_ns": self.ptp_offset_ns,
                "grandmaster_id": self.grandmaster_id,
            },
            "entity_count": self.entity_count,
            "source": "avdecc_simulator",
        }


# ---------------------------------------------------------------------------
# Mock controller (the public face)
# ---------------------------------------------------------------------------


class MockAvdeccController:
    """
    Drop-in replacement for the live la_avdecc controller object that
    the AVB router holds at `router.avdecc_entity`. The route handlers
    duck-type against this surface, so methods are named to match
    `_resolve_avdecc_callable()`'s lookup table:

    - `get_avdecc_entities` / `getDiscoveredEntities`
    - `find_entity` / `findEntity`
    - `get_active_connections`

    Active-connection bookkeeping is in-memory and per-instance — the
    wizard binding writer drives the routing-matrix authority, not the
    simulator, so this counter is kept only so `get_active_connections`
    returns a coherent shape.
    """

    def __init__(
        self,
        entities: Optional[List[SimulatedAvdeccEntity]] = None,
        substrate: Optional[SimulatedSubstrateState] = None,
    ) -> None:
        self._entities: List[SimulatedAvdeccEntity] = list(entities or [])
        self._substrate = substrate or SimulatedSubstrateState(
            entity_count=len(self._entities)
        )
        self._connections: List[Dict[str, Any]] = []

    # -- entity surface -----------------------------------------------------

    def get_avdecc_entities(self) -> List[SimulatedAvdeccEntity]:
        return list(self._entities)

    # snake-case + camelCase aliases — the route handler tries both.
    getDiscoveredEntities = get_avdecc_entities  # noqa: N815
    get_discovered_entities = get_avdecc_entities

    def find_entity(self, entity_id_int: int) -> Optional[SimulatedAvdeccEntity]:
        target = f"{entity_id_int:016x}".lower()
        for entity in self._entities:
            if entity.entity_id.lower() == target:
                return entity
        return None

    findEntity = find_entity  # noqa: N815

    def add_entity(self, entity: SimulatedAvdeccEntity) -> None:
        self._entities.append(entity)
        self._substrate.entity_count = len(self._entities)

    def remove_entity(self, entity_id: str) -> bool:
        normalized = entity_id.lower()
        before = len(self._entities)
        self._entities = [
            e for e in self._entities if e.entity_id.lower() != normalized
        ]
        removed = len(self._entities) != before
        if removed:
            self._substrate.entity_count = len(self._entities)
        return removed

    # -- connection bookkeeping --------------------------------------------

    def get_active_connections(self) -> List[Dict[str, Any]]:
        return list(self._connections)

    getActiveConnections = get_active_connections  # noqa: N815

    # -- substrate report --------------------------------------------------

    def substrate_state(self) -> Dict[str, Any]:
        return self._substrate.to_dict()


# ---------------------------------------------------------------------------
# Preset benches
# ---------------------------------------------------------------------------


def _entity(
    *,
    suffix: str,
    name: str,
    talkers: int,
    listeners: int,
    vendor: str = "MAP2 AVDECC Simulator",
    model: str = "Synthetic Entity",
) -> SimulatedAvdeccEntity:
    """Helper — builds a deterministic-id entity from a short suffix."""
    base = "0010fa000000"
    full = (base + suffix).rjust(16, "0")[:16]
    model_id = "fa00000000000000"
    return SimulatedAvdeccEntity(
        entity_id=full,
        entity_model_id=model_id,
        entity_name=name,
        talker_stream_sources=talkers,
        listener_stream_sinks=listeners,
        vendor_name=vendor,
        model_name=model,
    )


def single_entity_bench() -> MockAvdeccController:
    """
    Tier-1 UX: 1 entity → one-click bind. Wizard renders a single
    Carbon Tile that the operator clicks to land the binding.
    """
    return MockAvdeccController(
        entities=[
            _entity(
                suffix="01",
                name="MOTU 16A AVB (sim)",
                talkers=16,
                listeners=16,
                vendor="MOTU",
                model="16A AVB",
            ),
        ],
        substrate=SimulatedSubstrateState(
            interface_name="sim0",
            interface_up=True,
            ptp_locked=True,
            entity_count=1,
        ),
    )


def small_bench() -> MockAvdeccController:
    """
    Tier-2 UX: 4 entities → Carbon DataTable + auto-suggest. Mixes
    talker-only, listener-only, and bidirectional roles so the
    auto-suggest heuristic has something to discriminate.
    """
    entities = [
        _entity(suffix="01", name="MOTU 16A (talker)", talkers=16, listeners=0,
                vendor="MOTU", model="16A AVB"),
        _entity(suffix="02", name="Biamp Tesira (listener)", talkers=0, listeners=8,
                vendor="Biamp", model="Tesira FORTÉ AVB"),
        _entity(suffix="03", name="QSC Q-SYS (bidir)", talkers=8, listeners=8,
                vendor="QSC", model="Core 110f"),
        _entity(suffix="04", name="Avid S6 (talker)", talkers=2, listeners=0,
                vendor="Avid", model="S6"),
    ]
    return MockAvdeccController(
        entities=entities,
        substrate=SimulatedSubstrateState(
            interface_name="sim0",
            ptp_locked=True,
            entity_count=len(entities),
        ),
    )


def large_bench() -> MockAvdeccController:
    """
    Tier-3 UX: 16 entities → bulk-import + filter. Big enough to force
    the filter bar; mixes vendors so vendor-grouping is useful.
    """
    entities: List[SimulatedAvdeccEntity] = []
    bank = [
        ("MOTU", "16A AVB", 16, 16),
        ("Biamp", "Tesira FORTÉ", 0, 8),
        ("QSC", "Core 110f", 8, 8),
        ("Avid", "S6", 2, 0),
        ("L-Acoustics", "P1", 0, 16),
    ]
    for i in range(16):
        vendor, model, talkers, listeners = bank[i % len(bank)]
        entities.append(
            _entity(
                suffix=f"{0x10 + i:02x}",
                name=f"{vendor} {model} #{i + 1} (sim)",
                talkers=talkers,
                listeners=listeners,
                vendor=vendor,
                model=model,
            )
        )
    return MockAvdeccController(
        entities=entities,
        substrate=SimulatedSubstrateState(
            interface_name="sim0",
            ptp_locked=True,
            entity_count=len(entities),
        ),
    )


def empty_bench() -> MockAvdeccController:
    """
    No-entity case — exercises the wizard's empty-state UI when the
    interface is up + PTP-locked but nothing is on the bus.
    """
    return MockAvdeccController(
        entities=[],
        substrate=SimulatedSubstrateState(
            interface_name="sim0",
            interface_up=True,
            ptp_locked=True,
            entity_count=0,
        ),
    )


def offline_bench() -> MockAvdeccController:
    """
    Substrate-down case — interface down. Exercises the wizard's
    diagnostic-panel "Fix it" link path.
    """
    return MockAvdeccController(
        entities=[],
        substrate=SimulatedSubstrateState(
            interface_name="sim0",
            interface_up=False,
            ptp_locked=False,
            entity_count=0,
        ),
    )
