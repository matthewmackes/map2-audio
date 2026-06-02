"""T2521-4 step 5: SonoBus → JUCE-engine name-exchange dispatch.

Drives `apply_sonobus_io_binding` against a fake engine-IO seam that records
`set_sonobus_*_id` calls, plus a round-trip on the fake's get/set. The engine
stores the stream id as a *name* for the map2-sonobus-transport daemon to
discover its JACK ports — it is never read on the audio callback — so these
tests cover the pure dispatch/translation seam (the real RT/JACK port wiring is
daemon-side, post-release).
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.sonobus.engine_dispatch import apply_sonobus_io_binding
from app.services.sonobus.interface_ids import make_sonobus_interface_id


class FakeEngineIO:
    """Records the SonoBus binding calls + supports a set→get round-trip,
    mirroring the juce_process seam (`set_sonobus_*_id` / `get_sonobus_*_id`).
    """

    def __init__(self) -> None:
        self.input_calls: list[str] = []
        self.output_calls: list[str] = []
        self._input_id: str = ""
        self._output_id: str = ""

    async def set_sonobus_input_id(self, stream_id):
        normalized = "" if stream_id is None else str(stream_id)
        self.input_calls.append(normalized)
        self._input_id = normalized
        return True

    async def set_sonobus_output_id(self, stream_id):
        normalized = "" if stream_id is None else str(stream_id)
        self.output_calls.append(normalized)
        self._output_id = normalized
        return True

    def get_sonobus_input_id(self) -> str:
        return self._input_id

    def get_sonobus_output_id(self) -> str:
        return self._output_id


def _desired_io(input_id=None, output_id=None) -> SimpleNamespace:
    return SimpleNamespace(
        requested_input_interface_id=input_id,
        requested_output_interface_id=output_id,
    )


@pytest.mark.asyncio
async def test_sonobus_input_id_binds_parsed_stream():
    engine = FakeEngineIO()
    interface_id = make_sonobus_interface_id(
        peer_id="peer-a", group_id="group-1", stream_id="stream-0001"
    )

    summary = await apply_sonobus_io_binding(engine, _desired_io(input_id=interface_id))

    # The engine is bound with the parsed *stream name*, not the full interface id.
    assert engine.input_calls == ["stream-0001"]
    assert summary["input_bound"] is True
    assert summary["input_stream_id"] == "stream-0001"
    # Output had no sonobus id → cleared (unbound), not a real id.
    assert engine.output_calls == [""]
    assert summary["output_bound"] is False
    assert summary["output_stream_id"] is None


@pytest.mark.asyncio
async def test_sonobus_output_id_binds_parsed_stream():
    engine = FakeEngineIO()
    interface_id = make_sonobus_interface_id(
        peer_id="peer-b", group_id="grp", stream_id="out-77"
    )

    summary = await apply_sonobus_io_binding(engine, _desired_io(output_id=interface_id))

    assert engine.output_calls == ["out-77"]
    assert summary["output_bound"] is True
    assert summary["output_stream_id"] == "out-77"
    assert engine.input_calls == [""]
    assert summary["input_bound"] is False
    assert summary["input_stream_id"] is None


@pytest.mark.asyncio
async def test_both_directions_bind_independently():
    engine = FakeEngineIO()
    in_id = make_sonobus_interface_id(peer_id="p", group_id="g", stream_id="in-1")
    out_id = make_sonobus_interface_id(peer_id="p", group_id="g", stream_id="out-2")

    summary = await apply_sonobus_io_binding(
        engine, _desired_io(input_id=in_id, output_id=out_id)
    )

    assert engine.input_calls == ["in-1"]
    assert engine.output_calls == ["out-2"]
    assert summary == {
        "input_bound": True,
        "output_bound": True,
        "input_stream_id": "in-1",
        "output_stream_id": "out-2",
    }


@pytest.mark.asyncio
async def test_non_sonobus_id_unbinds_not_binds():
    engine = FakeEngineIO()

    summary = await apply_sonobus_io_binding(
        engine,
        _desired_io(
            input_id="pipewire:alsa:UA-1000:capture",
            output_id="pipewire:alsa:UA-1000:playback",
        ),
    )

    # A non-sonobus id must clear (""), never call the setter with a real id.
    assert engine.input_calls == [""]
    assert engine.output_calls == [""]
    assert summary["input_bound"] is False
    assert summary["output_bound"] is False
    assert summary["input_stream_id"] is None
    assert summary["output_stream_id"] is None


@pytest.mark.asyncio
async def test_none_ids_unbind():
    engine = FakeEngineIO()

    summary = await apply_sonobus_io_binding(engine, _desired_io())

    assert engine.input_calls == [""]
    assert engine.output_calls == [""]
    assert summary["input_bound"] is False
    assert summary["output_bound"] is False
    assert summary["input_stream_id"] is None
    assert summary["output_stream_id"] is None


@pytest.mark.asyncio
async def test_switch_away_from_sonobus_clears_previous_binding():
    engine = FakeEngineIO()
    in_id = make_sonobus_interface_id(peer_id="p", group_id="g", stream_id="live")

    # First activation binds a sonobus stream.
    await apply_sonobus_io_binding(engine, _desired_io(input_id=in_id))
    assert engine.get_sonobus_input_id() == "live"

    # Switching to a non-sonobus interface clears the engine binding.
    await apply_sonobus_io_binding(
        engine, _desired_io(input_id="pipewire:alsa:UA-1000:capture")
    )
    assert engine.get_sonobus_input_id() == ""
    assert engine.input_calls == ["live", ""]


@pytest.mark.asyncio
async def test_fake_engine_set_get_round_trip():
    engine = FakeEngineIO()

    assert engine.get_sonobus_input_id() == ""
    assert engine.get_sonobus_output_id() == ""

    await engine.set_sonobus_input_id("rt-in")
    await engine.set_sonobus_output_id("rt-out")

    assert engine.get_sonobus_input_id() == "rt-in"
    assert engine.get_sonobus_output_id() == "rt-out"

    # Empty clears.
    await engine.set_sonobus_input_id("")
    assert engine.get_sonobus_input_id() == ""
