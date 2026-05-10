"""
T2499-C Slice 2 — entity-provider tests.

Validates:
- set/get/clear override
- env-driven simulator install + bench-name resolution
- resolver fallback to live_lookup when no override is installed
- the /api/avb/avdecc/entities route round-trips through the override
  end-to-end (no live la_avdecc + no AVDECC config required)
"""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from app.services.avb import avdecc_simulator
from app.services.avb.avdecc_entity_provider import (
    clear_avdecc_entity_override,
    get_avdecc_entity_override,
    get_avdecc_entity_override_origin,
    install_simulator_from_env,
    resolve_avdecc_entity,
    set_avdecc_entity_override,
)


# ---------------------------------------------------------------------------
# Fixtures — every test starts from a clean override slot
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_override():
    clear_avdecc_entity_override()
    yield
    clear_avdecc_entity_override()


# ---------------------------------------------------------------------------
# Override set / get / clear
# ---------------------------------------------------------------------------


def test_override_starts_unset() -> None:
    assert get_avdecc_entity_override() is None
    assert get_avdecc_entity_override_origin() is None


def test_set_then_get_round_trip() -> None:
    sentinel = object()
    set_avdecc_entity_override(sentinel, origin="test:set")
    assert get_avdecc_entity_override() is sentinel
    assert get_avdecc_entity_override_origin() == "test:set"


def test_clear_removes_override() -> None:
    set_avdecc_entity_override(object(), origin="test:clear-me")
    clear_avdecc_entity_override()
    assert get_avdecc_entity_override() is None
    assert get_avdecc_entity_override_origin() is None


def test_set_with_none_clears() -> None:
    set_avdecc_entity_override(object(), origin="test:replaceable")
    set_avdecc_entity_override(None, origin="test:explicit-clear")
    assert get_avdecc_entity_override() is None


# ---------------------------------------------------------------------------
# Resolver — override wins over live; falls back when override absent
# ---------------------------------------------------------------------------


def test_resolver_returns_override_when_set() -> None:
    sim = avdecc_simulator.small_bench()
    set_avdecc_entity_override(sim, origin="test:resolver-1")
    live_calls = []

    def _live():
        live_calls.append(1)
        return object()

    resolved = resolve_avdecc_entity(live_lookup=_live)
    assert resolved is sim
    # Live was never consulted because the override short-circuited.
    assert live_calls == []


def test_resolver_falls_back_to_live_when_no_override() -> None:
    live_obj = object()
    resolved = resolve_avdecc_entity(live_lookup=lambda: live_obj)
    assert resolved is live_obj


def test_resolver_swallows_live_lookup_exceptions() -> None:
    def _boom():
        raise RuntimeError("la_avdecc disconnected mid-resolve")

    # Falls back to None — the route handler then renders its
    # "AVDECC entity not initialized" path.
    assert resolve_avdecc_entity(live_lookup=_boom) is None


# ---------------------------------------------------------------------------
# Env probe — install_simulator_from_env
# ---------------------------------------------------------------------------


def test_env_probe_returns_none_when_var_unset(monkeypatch) -> None:
    monkeypatch.delenv("MAP2_AVDECC_SIMULATOR", raising=False)
    assert install_simulator_from_env() is None
    assert get_avdecc_entity_override() is None


@pytest.mark.parametrize(
    "bench_name,expected_count",
    [
        ("single", 1),
        ("small", 4),
        ("large", 16),
        ("empty", 0),
    ],
)
def test_env_probe_installs_named_bench(
    monkeypatch, bench_name: str, expected_count: int
) -> None:
    monkeypatch.setenv("MAP2_AVDECC_SIMULATOR", bench_name)
    result = install_simulator_from_env()
    assert result == bench_name
    override = get_avdecc_entity_override()
    assert override is not None
    assert len(override.get_avdecc_entities()) == expected_count
    assert get_avdecc_entity_override_origin() == f"env:{bench_name}"


def test_env_probe_accepts_uppercase_and_whitespace(monkeypatch) -> None:
    monkeypatch.setenv("MAP2_AVDECC_SIMULATOR", "  Small  ")
    assert install_simulator_from_env() == "small"
    assert get_avdecc_entity_override_origin() == "env:small"


def test_env_probe_ignores_unknown_bench(monkeypatch) -> None:
    monkeypatch.setenv("MAP2_AVDECC_SIMULATOR", "no-such-bench")
    assert install_simulator_from_env() is None
    assert get_avdecc_entity_override() is None


def test_env_probe_with_offline_bench(monkeypatch) -> None:
    monkeypatch.setenv("MAP2_AVDECC_SIMULATOR", "offline")
    assert install_simulator_from_env() == "offline"
    override = get_avdecc_entity_override()
    assert override is not None
    state = override.substrate_state()
    assert state["interface"]["up"] is False


# ---------------------------------------------------------------------------
# /api/avb/avdecc/entities route — end-to-end with override
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_substrate_state_route_returns_simulator_state_when_override_installed():
    """T2499-C Slice 5 — substrate-state route mirrors simulator state."""
    from app.routes.avb.discovery import get_avdecc_substrate_state

    set_avdecc_entity_override(
        avdecc_simulator.offline_bench(),
        origin="test:substrate-route",
    )
    state = await get_avdecc_substrate_state()
    assert state["source"] == "avdecc_simulator"
    assert state["origin"] == "test:substrate-route"
    assert state["interface"]["up"] is False
    assert state["ptp"]["locked"] is False
    assert state["entity_count"] == 0


@pytest.mark.asyncio
async def test_substrate_state_route_returns_healthy_simulator_state():
    from app.routes.avb.discovery import get_avdecc_substrate_state

    set_avdecc_entity_override(
        avdecc_simulator.small_bench(),
        origin="test:substrate-route-healthy",
    )
    state = await get_avdecc_substrate_state()
    assert state["interface"]["up"] is True
    assert state["ptp"]["locked"] is True
    assert state["entity_count"] == 4
    # Schema keys the wizard's panel reads.
    assert set(state["interface"].keys()) == {"name", "up"}
    assert {"locked", "offset_ns", "grandmaster_id"} == set(state["ptp"].keys())


@pytest.mark.asyncio
async def test_entities_route_returns_simulator_payload_when_override_installed():
    """
    Full route round-trip with no live AVDECC and no AVB config.

    The override hot-paths past `_is_avdecc_enabled()` because the
    wizard ships against the simulator on hosts where AVDECC isn't
    even in /etc/map2 yet.
    """
    from app.routes.avb.discovery import get_avdecc_entities

    set_avdecc_entity_override(
        avdecc_simulator.small_bench(),
        origin="test:route-roundtrip",
    )
    response = await get_avdecc_entities()
    assert response["enabled"] is True
    assert response.get("error") is None
    assert isinstance(response["entities"], list)
    assert len(response["entities"]) == 4
    # Every entity carries the canonical formatter shape.
    sample = response["entities"][0]
    assert {"entity_id", "entity_model_id", "capabilities", "ptp"}.issubset(sample.keys())
    # Source-node provenance preserved by the route.
    assert "source_node_id" in response
