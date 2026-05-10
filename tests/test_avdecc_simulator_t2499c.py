"""
T2499-C — AVDECC simulator tests.

Validates:
- Preset benches produce the documented entity counts + roles.
- Simulator entities round-trip through the existing live-path
  formatter at app/routes/avb/common.py::_format_avdecc_entity_payload
  byte-identical to the live shape so the wizard cannot accidentally
  observe a divergent payload.
- find_entity / add_entity / remove_entity behave under the same
  16-char hex contract the route handler enforces.
- Substrate state report has the exact keys the wizard's diagnostic
  panel reads (no schema drift between simulator and live).
"""

from __future__ import annotations

import pytest

from app.services.avb.avdecc_simulator import (
    MockAvdeccController,
    SimulatedAvdeccEntity,
    SimulatedSubstrateState,
    empty_bench,
    large_bench,
    offline_bench,
    single_entity_bench,
    small_bench,
)


# ---------------------------------------------------------------------------
# Preset bench shapes
# ---------------------------------------------------------------------------


def test_single_entity_bench_has_one_entity() -> None:
    ctl = single_entity_bench()
    entities = ctl.get_avdecc_entities()
    assert len(entities) == 1
    assert entities[0].vendor_name == "MOTU"
    assert entities[0].talker_stream_sources == 16
    assert entities[0].listener_stream_sinks == 16
    assert entities[0].isAudioTalker() is True
    assert entities[0].isAudioListener() is True


def test_small_bench_has_four_mixed_role_entities() -> None:
    ctl = small_bench()
    entities = ctl.get_avdecc_entities()
    assert len(entities) == 4
    # Q2 acceptance — auto-suggest needs role variety.
    talker_only = [e for e in entities if e.isAudioTalker() and not e.isAudioListener()]
    listener_only = [e for e in entities if e.isAudioListener() and not e.isAudioTalker()]
    bidir = [e for e in entities if e.isAudioTalker() and e.isAudioListener()]
    assert talker_only, "small bench must include at least one talker-only entity"
    assert listener_only, "small bench must include at least one listener-only entity"
    assert bidir, "small bench must include at least one bidirectional entity"


def test_large_bench_has_sixteen_entities_for_filter_bar_path() -> None:
    ctl = large_bench()
    entities = ctl.get_avdecc_entities()
    assert len(entities) == 16
    # Vendor-grouping useful only if vendors actually vary.
    vendors = {e.vendor_name for e in entities}
    assert len(vendors) >= 3


def test_empty_bench_reports_locked_substrate_with_zero_entities() -> None:
    ctl = empty_bench()
    assert ctl.get_avdecc_entities() == []
    state = ctl.substrate_state()
    assert state["interface"]["up"] is True
    assert state["ptp"]["locked"] is True
    assert state["entity_count"] == 0


def test_offline_bench_reports_interface_down() -> None:
    ctl = offline_bench()
    state = ctl.substrate_state()
    assert state["interface"]["up"] is False
    assert state["ptp"]["locked"] is False
    assert state["entity_count"] == 0


# ---------------------------------------------------------------------------
# Round-trip through the live route formatter
# ---------------------------------------------------------------------------


def test_simulator_entity_round_trips_through_live_route_formatter() -> None:
    """
    The wizard renders entities by calling the same /api/avb/avdecc/entities
    route that lights up under live AVDECC. The formatter at
    app/routes/avb/common.py::_format_avdecc_entity_payload is
    duck-typed against la_avdecc; the simulator MUST hand the formatter
    a payload it accepts unchanged.
    """
    from app.routes.avb.common import _format_avdecc_entity_payload

    ctl = small_bench()
    entities = ctl.get_avdecc_entities()
    payloads = [_format_avdecc_entity_payload(e, source_node_id="sim-host") for e in entities]
    assert len(payloads) == 4

    sample = payloads[0]
    # Schema invariants the wizard relies on.
    expected_keys = {
        "entity_id",
        "entity_model_id",
        "entity_name",
        "firmware_version",
        "mac_address",
        "capabilities",
        "ptp",
        "available",
        "last_seen",
        "source_node_id",
    }
    assert expected_keys.issubset(sample.keys())

    # 16-char hex normalization (entity_id) — formatter strips colons / 0x.
    assert len(sample["entity_id"]) == 16
    assert all(c in "0123456789abcdef" for c in sample["entity_id"])

    # Capabilities block populated with both flat counts + role booleans.
    caps = sample["capabilities"]
    assert {"talker_streams", "listener_streams", "is_audio_talker",
            "is_audio_listener", "gptp_supported"}.issubset(caps.keys())

    # PTP block populated with grandmaster_id + domain.
    assert {"grandmaster_id", "domain"}.issubset(sample["ptp"].keys())
    assert len(sample["ptp"]["grandmaster_id"]) == 16

    # Source-node provenance preserved.
    assert sample["source_node_id"] == "sim-host"


def test_offline_bench_substrate_state_keys_are_what_wizard_reads() -> None:
    """
    T2499-C Q3 wires the diagnostic panel against substrate_state(). If
    the schema drifts the wizard renders blanks. Pin the keys here so
    a renaming forces a wizard test update too.
    """
    ctl = offline_bench()
    state = ctl.substrate_state()
    assert set(state.keys()) == {"interface", "ptp", "entity_count", "source"}
    assert set(state["interface"].keys()) == {"name", "up"}
    assert set(state["ptp"].keys()) == {"locked", "offset_ns", "grandmaster_id"}
    assert state["source"] == "avdecc_simulator"


# ---------------------------------------------------------------------------
# find_entity contract — matches the route handler's int-id lookup
# ---------------------------------------------------------------------------


def test_find_entity_resolves_by_int_id() -> None:
    ctl = single_entity_bench()
    entity = ctl.get_avdecc_entities()[0]
    found = ctl.find_entity(int(entity.entity_id, 16))
    assert found is entity


def test_find_entity_returns_none_for_unknown_id() -> None:
    ctl = single_entity_bench()
    assert ctl.find_entity(0xDEADBEEFCAFEBABE) is None


def test_camel_case_aliases_match_snake_case() -> None:
    """The route handler tries multiple casings via _resolve_avdecc_callable."""
    ctl = small_bench()
    assert ctl.getDiscoveredEntities() == ctl.get_avdecc_entities()
    assert ctl.get_discovered_entities() == ctl.get_avdecc_entities()
    assert ctl.findEntity(0xDEADBEEFCAFEBABE) is None


# ---------------------------------------------------------------------------
# add_entity / remove_entity update the substrate count
# ---------------------------------------------------------------------------


def test_add_entity_increments_substrate_entity_count() -> None:
    ctl = empty_bench()
    assert ctl.substrate_state()["entity_count"] == 0
    ctl.add_entity(
        SimulatedAvdeccEntity(
            entity_id="0010fa00000000ff",
            entity_model_id="fa00000000000000",
            entity_name="hot-add",
            talker_stream_sources=2,
        )
    )
    assert ctl.substrate_state()["entity_count"] == 1


def test_remove_entity_decrements_substrate_entity_count() -> None:
    ctl = single_entity_bench()
    target = ctl.get_avdecc_entities()[0].entity_id
    assert ctl.remove_entity(target) is True
    assert ctl.substrate_state()["entity_count"] == 0
    # Idempotent — second remove is a no-op.
    assert ctl.remove_entity(target) is False


def test_active_connections_is_empty_by_default() -> None:
    ctl = small_bench()
    assert ctl.get_active_connections() == []
    assert ctl.getActiveConnections() == []


# ---------------------------------------------------------------------------
# SimulatedSubstrateState defaults
# ---------------------------------------------------------------------------


def test_substrate_state_dict_round_trip() -> None:
    state = SimulatedSubstrateState(
        interface_name="ethX",
        interface_up=True,
        ptp_locked=True,
        ptp_offset_ns=12.5,
        grandmaster_id="000a35feedface00",
        entity_count=3,
    )
    rendered = state.to_dict()
    assert rendered == {
        "interface": {"name": "ethX", "up": True},
        "ptp": {
            "locked": True,
            "offset_ns": 12.5,
            "grandmaster_id": "000a35feedface00",
        },
        "entity_count": 3,
        "source": "avdecc_simulator",
    }


# ---------------------------------------------------------------------------
# pytest entry-point fence — ensures the module imports clean
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "factory",
    [single_entity_bench, small_bench, large_bench, empty_bench, offline_bench],
)
def test_every_preset_bench_imports_and_constructs(factory) -> None:
    ctl = factory()
    assert isinstance(ctl, MockAvdeccController)
    # Substrate state always serializable.
    assert isinstance(ctl.substrate_state(), dict)
