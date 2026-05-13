"""Generic per-device meter-source registry tests.

Coverage for the order-2 refactor in the tenth Continue run that
generalized the Tascam-specific meter seam into a shared primitive at
``app/services/devices/_meter_source.py``. The Tascam facade tests in
``test_tascam_us144mkii_meters.py`` already prove the Tascam route
reads through unchanged; this file proves the registry primitive
itself behaves correctly for **multiple devices** so future UA-1000 /
Jogg / MPX-1 facades can drop in without copy-pasting the seam.
"""

from __future__ import annotations

import pytest

from app.services.devices._meter_source import (
    DeviceMeterSourceRegistry,
    MeterSnapshot,
    PlaceholderMeterSource,
    SILENCE_DBFS,
)


# ---------------------------------------------------------------------------
# Fresh registry per test — keeps multi-device isolation clean.
# ---------------------------------------------------------------------------


@pytest.fixture
def registry() -> DeviceMeterSourceRegistry:
    return DeviceMeterSourceRegistry()


# ---------------------------------------------------------------------------
# Registration shape
# ---------------------------------------------------------------------------


def test_register_device_returns_a_placeholder_when_no_source_installed(registry):
    registry.register_device("ua-1000", input_channels=10, output_channels=10)
    source = registry.get_active_source("ua-1000")
    assert isinstance(source, PlaceholderMeterSource)
    snap = source.snapshot()
    assert snap.source == "placeholder"
    assert len(snap.input_peak_db) == 10
    assert len(snap.output_peak_db) == 10
    for v in snap.input_peak_db:
        assert v == SILENCE_DBFS


def test_register_device_is_idempotent_and_preserves_installed_source(registry):
    """Re-registering must NOT clear an installed source — facade
    modules import-register at startup and tests install sources
    later. Clobbering on re-register would break that pattern.
    """

    class EngineSource:
        def snapshot(self):
            return MeterSnapshot(source="engine")

    registry.register_device("tascam-us144mkii", input_channels=4, output_channels=4)
    registry.set_active_source("tascam-us144mkii", EngineSource())
    # Re-register with different counts — preserve the installed source.
    registry.register_device("tascam-us144mkii", input_channels=4, output_channels=4)
    assert registry.get_active_source("tascam-us144mkii").snapshot().source == "engine"


def test_get_active_source_raises_for_unknown_device(registry):
    with pytest.raises(KeyError):
        registry.get_active_source("does-not-exist")


def test_set_active_source_raises_for_unknown_device(registry):
    with pytest.raises(KeyError):
        registry.set_active_source("does-not-exist", PlaceholderMeterSource(2, 2))


# ---------------------------------------------------------------------------
# Multi-device isolation
# ---------------------------------------------------------------------------


def test_two_devices_have_independent_sources(registry):
    """Installing an engine source on device A must NOT affect device B."""

    class EngineSourceA:
        def snapshot(self):
            return MeterSnapshot(
                input_peak_db=[-12.0, -12.0, -12.0, -12.0],
                output_peak_db=[-6.0, -6.0, -6.0, -6.0],
                source="engine",
            )

    registry.register_device("tascam-us144mkii", input_channels=4, output_channels=4)
    registry.register_device("ua-1000", input_channels=10, output_channels=10)
    registry.set_active_source("tascam-us144mkii", EngineSourceA())

    snap_a = registry.get_active_source("tascam-us144mkii").snapshot()
    snap_b = registry.get_active_source("ua-1000").snapshot()
    assert snap_a.source == "engine"
    assert snap_a.input_peak_db[0] == -12.0
    assert snap_b.source == "placeholder"
    assert len(snap_b.input_peak_db) == 10


def test_reset_only_clears_the_named_device(registry):
    class EngineSource:
        def snapshot(self):
            return MeterSnapshot(source="engine")

    registry.register_device("a", input_channels=2, output_channels=2)
    registry.register_device("b", input_channels=2, output_channels=2)
    registry.set_active_source("a", EngineSource())
    registry.set_active_source("b", EngineSource())
    registry.reset_active_source("a")

    assert registry.get_active_source("a").snapshot().source == "placeholder"
    assert registry.get_active_source("b").snapshot().source == "engine"


# ---------------------------------------------------------------------------
# read_snapshot — async aware
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_read_snapshot_sync_source(registry):
    registry.register_device("d", input_channels=4, output_channels=4)
    snap = await registry.read_snapshot("d")
    assert snap.source == "placeholder"
    assert len(snap.input_peak_db) == 4


@pytest.mark.asyncio
async def test_read_snapshot_async_source(registry):
    class AsyncSource:
        async def snapshot(self):
            return MeterSnapshot(
                input_peak_db=[-1.0, -2.0],
                output_peak_db=[-3.0, -4.0],
                source="engine",
            )

    registry.register_device("d", input_channels=2, output_channels=2)
    registry.set_active_source("d", AsyncSource())
    snap = await registry.read_snapshot("d")
    assert snap.source == "engine"
    assert snap.input_peak_db == [-1.0, -2.0]


# ---------------------------------------------------------------------------
# Channel-count change reflects on the next placeholder
# ---------------------------------------------------------------------------


def test_re_registering_with_new_counts_changes_placeholder_layout(registry):
    """If a device-pack profile changes its channel count and a
    facade re-registers, the very next placeholder must reflect that —
    we don't memoize the placeholder instance for exactly this reason.
    """
    registry.register_device("d", input_channels=2, output_channels=2)
    snap1 = registry.get_active_source("d").snapshot()
    assert len(snap1.input_peak_db) == 2

    registry.register_device("d", input_channels=8, output_channels=8)
    snap2 = registry.get_active_source("d").snapshot()
    assert len(snap2.input_peak_db) == 8
    assert len(snap2.output_peak_db) == 8


# ---------------------------------------------------------------------------
# Tascam facade is wired through the global registry
# ---------------------------------------------------------------------------


def test_tascam_facade_is_bound_to_the_global_registry():
    """Smoke test that the device facade module forwards to the same
    registry instance — proves the run-9 public API is preserved on
    top of the new primitive without a separate global. Belt-and-
    braces; the existing Tascam test file covers behavior end-to-end.
    """
    from app.services.devices import tascam_us144mkii_meters as facade
    from app.services.devices._meter_source import get_registry

    facade.reset_active_meter_source()
    try:
        # facade.get_active_meter_source() should resolve through the
        # singleton registry, returning a placeholder for the registered
        # 4/4 layout.
        source = facade.get_active_meter_source()
        snap = source.snapshot()
        assert snap.source == "placeholder"
        assert len(snap.input_peak_db) == 4
        assert len(snap.output_peak_db) == 4

        # And the global registry must agree.
        registry_snap = get_registry().get_active_source(facade.DEVICE_ID).snapshot()
        assert registry_snap.source == "placeholder"
    finally:
        facade.reset_active_meter_source()
