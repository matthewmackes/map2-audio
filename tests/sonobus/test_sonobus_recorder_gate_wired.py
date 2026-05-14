"""T2521-7 Q12 — Recorder service exposes the SonoBus exclusion gate.

The recorder service today operates on snapshot-bound tap_matrix rather
than raw interface IDs, but the gate is wired into the recorder module
now so any future ingestion point uses it from the start. These tests
lock in that contract.
"""

from __future__ import annotations

import pytest

from app.services.recorder_service import (
    RecorderServiceError,
    assert_no_sonobus_interface_ids,
)
from app.services.sonobus import make_sonobus_interface_id


def test_helper_is_exported_from_recorder_service():
    """The gate must live in recorder_service so the contract is
    co-located with the surface it protects."""
    assert callable(assert_no_sonobus_interface_ids)


def test_empty_input_falls_through():
    assert_no_sonobus_interface_ids(None)
    assert_no_sonobus_interface_ids([])


def test_non_sonobus_ids_fall_through():
    # AVB, PipeWire, and cluster IDs are first-class for the Recorder.
    assert_no_sonobus_interface_ids(
        ["avb:0x91E0F000FE000001:0", "pipewire:edirol:ua1000:abc"]
    )


def test_sonobus_id_raises_recorder_service_error():
    sonobus_id = make_sonobus_interface_id(
        peer_id="peer-test", group_id="g-test", stream_id="s-test"
    )
    with pytest.raises(RecorderServiceError) as ctx:
        assert_no_sonobus_interface_ids([sonobus_id])
    assert ctx.value.code == "sonobus_excluded"
    assert "T2521 Q12" in str(ctx.value)
    # Default service_name should appear in the error message.
    assert "Recorder" in str(ctx.value)


def test_service_name_propagates_to_error_message():
    sonobus_id = make_sonobus_interface_id(
        peer_id="p", group_id="g", stream_id="s"
    )
    with pytest.raises(RecorderServiceError) as ctx:
        assert_no_sonobus_interface_ids(
            [sonobus_id], service_name="Audio Artifacts"
        )
    assert "Audio Artifacts" in str(ctx.value)


def test_mixed_list_with_one_sonobus_id_still_raises():
    sonobus_id = make_sonobus_interface_id(
        peer_id="p", group_id="g", stream_id="s"
    )
    with pytest.raises(RecorderServiceError):
        assert_no_sonobus_interface_ids(
            ["avb:0x91E0F000FE000001:0", sonobus_id, "pipewire:foo"]
        )
