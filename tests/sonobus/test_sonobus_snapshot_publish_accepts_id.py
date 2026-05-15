"""T2521-7 cycle 28 — snapshot publish accepts SonoBus interface IDs.

The Q10 lock makes SonoBus first-class for snapshot routing. Snapshot
publish must therefore accept ``sonobus:<peer>:<group>:<stream>`` as a
valid value for ``requested_input_interface_id`` /
``requested_output_interface_id`` without dropping it on the floor or
blocking the publish.

These tests run against the pydantic model + the audio-state compiler
projection — both are pure functions, so they exercise the contract
without bringing up the full FastAPI app.
"""

from __future__ import annotations

import pytest

from app.models.audio_state import AudioStateDesiredIO
from app.services.audio_state_snapshot_compiler import (
    compile_snapshot_detail_to_intent,
)
from app.services.sonobus import (
    SonoBusInterfaceForbiddenError,
    assert_not_sonobus_id,
    make_sonobus_interface_id,
)


def _make_detail(**io_bindings) -> dict:
    """Minimal snapshot-detail payload the compiler accepts."""
    return {
        "id": 1,
        "io_bindings": {
            "input_device": "stub",
            "output_device": "stub",
            **io_bindings,
        },
    }


def test_audio_state_desired_io_accepts_sonobus_id():
    """Pydantic model passes the sonobus ID through verbatim."""
    sonobus_id = make_sonobus_interface_id(
        peer_id="peer-1", group_id="grp-1", stream_id="s-1"
    )
    io = AudioStateDesiredIO(
        requested_input_interface_id=sonobus_id,
        requested_output_interface_id=sonobus_id,
    )
    assert io.requested_input_interface_id == sonobus_id
    assert io.requested_output_interface_id == sonobus_id


def test_compiler_threads_sonobus_id_from_io_bindings():
    """``CompiledSnapshotIntent`` carries the operator-chosen SonoBus
    ID through the publish path so the engine + cluster sync see it
    unchanged."""
    sonobus_input = make_sonobus_interface_id(
        peer_id="peer-A", group_id="grp-mix", stream_id="in-1"
    )
    sonobus_output = make_sonobus_interface_id(
        peer_id="peer-A", group_id="grp-mix", stream_id="out-1"
    )
    detail = _make_detail(
        input_interface_id=sonobus_input,
        output_interface_id=sonobus_output,
    )
    intent = compile_snapshot_detail_to_intent(detail)
    assert intent.io.requested_input_interface_id == sonobus_input
    assert intent.io.requested_output_interface_id == sonobus_output


def test_q12_gate_still_rejects_sonobus_in_recorder_context():
    """Snapshot publish accepts SonoBus IDs (Q10) but the Recorder
    surface MUST still refuse them (Q12). The two contracts coexist:
    same ID, different acceptance posture per service."""
    sonobus_id = make_sonobus_interface_id(
        peer_id="peer-X", group_id="grp-X", stream_id="s-X"
    )
    # Snapshot publish accepts.
    io = AudioStateDesiredIO(requested_input_interface_id=sonobus_id)
    assert io.requested_input_interface_id == sonobus_id
    # Recorder rejects.
    with pytest.raises(SonoBusInterfaceForbiddenError) as exc:
        assert_not_sonobus_id(sonobus_id, service_name="Recorder")
    assert exc.value.service_name == "Recorder"


def test_pipewire_id_still_threads_through_io_bindings():
    """Regression backstop: adding SonoBus support must not break the
    existing PipeWire / AVB / cluster ID flow."""
    detail = _make_detail(
        input_interface_id="pipewire:usb:0x582:0x0007:edirol",
        output_interface_id="avb:endpoint-001",
    )
    intent = compile_snapshot_detail_to_intent(detail)
    assert intent.io.requested_input_interface_id == "pipewire:usb:0x582:0x0007:edirol"
    assert intent.io.requested_output_interface_id == "avb:endpoint-001"
