"""T2521-7 Q12: Recorder + Audio Artifacts must reject SonoBus interface IDs.

This is the forward-compatibility regression that locks in the Q12
decision. It documents the contract `assert_not_sonobus_id()` enforces
and acts as a tripwire — if a future commit removes or weakens the
exclusion helper, this test breaks and CI catches the regression
before the Recorder service ships a SonoBus path that operators
explicitly rejected.

The full integration (the recorder + artifact services calling
`assert_not_sonobus_id()` at every interface-ID entry point) lands
once T2518 ships the unified `AudioInterfaceRegistry` and the
recorder side is wired through it — at that point the existing
recorder routes/services will gain the gate. Until then, this test
verifies the gate exists and behaves correctly.
"""

from __future__ import annotations

import pytest

from app.services.sonobus import (
    SonoBusInterfaceForbiddenError,
    assert_not_sonobus_id,
    is_sonobus_interface_id,
    make_sonobus_interface_id,
)


# Recorder code paths that must call assert_not_sonobus_id() once
# T2518 routes interface IDs through them. The list is duplicated
# from the architecture doc deliberately — if someone moves these
# entry points, this test fails and surfaces the audit obligation.
RECORDER_ADJACENT_SERVICES = (
    "Recorder",
    "Audio Artifacts",
    "Recorder ingest",
    "Recorder export",
    "Audio Artifacts replay",
)


@pytest.mark.parametrize("service_name", RECORDER_ADJACENT_SERVICES)
def test_recorder_rejects_sonobus_id(service_name: str):
    sonobus_id = make_sonobus_interface_id(
        peer_id="peer-test", group_id="group-test", stream_id="stream-test"
    )
    with pytest.raises(SonoBusInterfaceForbiddenError) as ctx:
        assert_not_sonobus_id(sonobus_id, service_name=service_name)
    assert ctx.value.service_name == service_name
    assert ctx.value.interface_id == sonobus_id


@pytest.mark.parametrize("service_name", RECORDER_ADJACENT_SERVICES)
def test_recorder_accepts_avb_id(service_name: str):
    """AVB IDs are first-class for the Recorder; only SonoBus is excluded."""
    assert_not_sonobus_id("avb:0x91E0F000FE000001:0", service_name=service_name)


@pytest.mark.parametrize("service_name", RECORDER_ADJACENT_SERVICES)
def test_recorder_accepts_pipewire_id(service_name: str):
    """Local PipeWire interfaces are first-class for the Recorder."""
    assert_not_sonobus_id(
        "pipewire:edirol:ua1000:abc-123", service_name=service_name
    )


def test_q12_exclusion_message_cites_locked_decision():
    """Error message must surface 'T2521 Q12' so operators recognise the
    locked-decision rationale in logs."""
    with pytest.raises(SonoBusInterfaceForbiddenError) as ctx:
        assert_not_sonobus_id("sonobus:p:g:s", service_name="Recorder")
    message = str(ctx.value)
    assert "T2521 Q12" in message
    assert "no recorder/artifact integration" in message


def test_is_sonobus_id_recognises_real_binding_ids():
    """The detector matches the canonical ID shape the
    `AudioInterfaceRegistry` will emit for SonoBus bindings."""
    real_id = make_sonobus_interface_id(
        peer_id="peer-alpha", group_id="g-default", stream_id="s-0001"
    )
    assert is_sonobus_interface_id(real_id) is True
