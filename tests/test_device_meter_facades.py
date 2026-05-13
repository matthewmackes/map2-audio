"""Coverage for the per-device meter-source facade modules.

Asserts that every audio-interface facade module:
  - registers itself with the global registry at import time,
  - exposes the canonical channel layout from its device-pack constants,
  - exposes the install / read / reset one-liners,
  - and forwards through the same shared singleton registry (no
    parallel state).

The Tascam facade has its own dedicated test file
(`test_tascam_us144mkii_meters.py`) for full behavior coverage; this
file proves the *facade pattern* generalizes across devices.
"""

from __future__ import annotations

import importlib

import pytest

from app.services.devices._meter_source import (
    MeterSnapshot,
    PlaceholderMeterSource,
    SILENCE_DBFS,
    get_registry,
)


FACADE_MODULES = [
    ("app.services.devices.tascam_us144mkii_meters", "tascam-us144mkii", 4, 4),
    ("app.services.devices.edirol_ua1000_meters", "edirol-ua-1000", 10, 10),
    ("app.services.devices.hotone_jogg_meters", "hotone-jogg", 2, 2),
]


@pytest.mark.parametrize("module_name,device_id,inp,out", FACADE_MODULES)
def test_facade_registers_with_canonical_layout(module_name, device_id, inp, out):
    facade = importlib.import_module(module_name)
    assert facade.DEVICE_ID == device_id

    # The registry must know about this device with the canonical
    # channel counts (or higher — re-registration preserves the
    # current counts on the most recent register call).
    facade.reset_active_meter_source()
    try:
        source = facade.get_active_meter_source()
        assert isinstance(source, PlaceholderMeterSource)
        snap = source.snapshot()
        assert snap.source == "placeholder"
        assert len(snap.input_peak_db) == inp
        assert len(snap.output_peak_db) == out
        for v in snap.input_peak_db + snap.output_peak_db:
            assert v == SILENCE_DBFS
    finally:
        facade.reset_active_meter_source()


@pytest.mark.parametrize("module_name,device_id,_inp,_out", FACADE_MODULES)
def test_facade_install_engine_source_round_trip(module_name, device_id, _inp, _out):
    facade = importlib.import_module(module_name)

    class EngineSource:
        def snapshot(self):
            return MeterSnapshot(
                input_peak_db=[-6.0, -6.0],
                output_peak_db=[-3.0, -3.0],
                source="engine",
            )

    facade.reset_active_meter_source()
    try:
        facade.set_active_meter_source(EngineSource())
        snap = facade.get_active_meter_source().snapshot()
        assert snap.source == "engine"
        # The global registry must agree — proves the facade is bound
        # to the shared singleton, not a parallel instance.
        registry_snap = get_registry().get_active_source(device_id).snapshot()
        assert registry_snap.source == "engine"
    finally:
        facade.reset_active_meter_source()


@pytest.mark.asyncio
@pytest.mark.parametrize("module_name,_device_id,_inp,_out", FACADE_MODULES)
async def test_facade_read_snapshot_awaitable_round_trip(
    module_name, _device_id, _inp, _out
):
    facade = importlib.import_module(module_name)

    class AsyncEngineSource:
        async def snapshot(self):
            return MeterSnapshot(
                input_peak_db=[-1.0],
                output_peak_db=[-1.0],
                source="engine",
            )

    facade.reset_active_meter_source()
    try:
        facade.set_active_meter_source(AsyncEngineSource())
        snap = await facade.read_snapshot()
        assert snap.source == "engine"
    finally:
        facade.reset_active_meter_source()


def test_facades_have_independent_sources():
    """Installing a source on one facade must NOT affect the others —
    the registry's per-device isolation is exercised end-to-end through
    the public facade API.
    """
    from app.services.devices import tascam_us144mkii_meters as t
    from app.services.devices import edirol_ua1000_meters as u
    from app.services.devices import hotone_jogg_meters as h

    class EngineSource:
        def snapshot(self):
            return MeterSnapshot(source="engine")

    t.reset_active_meter_source()
    u.reset_active_meter_source()
    h.reset_active_meter_source()
    try:
        t.set_active_meter_source(EngineSource())
        # Tascam is engine, UA-1000 + JoGG are still placeholder.
        assert t.get_active_meter_source().snapshot().source == "engine"
        assert u.get_active_meter_source().snapshot().source == "placeholder"
        assert h.get_active_meter_source().snapshot().source == "placeholder"
    finally:
        t.reset_active_meter_source()
        u.reset_active_meter_source()
        h.reset_active_meter_source()
