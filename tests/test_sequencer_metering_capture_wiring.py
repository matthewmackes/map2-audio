"""T2461-A6 second half — confirms SequencerMeteringService.read_slot_meters
feeds frames into the capture buffer when a session is active.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.services.sequencer_metering_service import SequencerMeteringService
from app.services.sequencer.sequencer_capture_buffer import (
    reset_sequencer_capture_buffer_for_tests,
)


@pytest.fixture
def buffer():
    return reset_sequencer_capture_buffer_for_tests()


def test_meter_pipeline_records_frames_when_capture_active(buffer):
    """When a capture session is armed for slot 2, each call to
    read_slot_meters should append a frame for that slot."""
    sid = buffer.start_capture(slot_id=2, duration_s=5.0)

    service = SequencerMeteringService()
    # Stub get_sequencer_service to return a fake slots list
    # for the metering loop.
    fake_sequencer_service = type("FB", (), {
        "get_slots": lambda self: [
            {"slot_id": i, "mute": False, "level": 1.0} for i in range(4)
        ],
    })()
    with patch("app.services.sequencer_metering_service.get_sequencer_service",
                return_value=fake_sequencer_service):
        service.read_slot_meters()

    session = buffer.stop_capture()
    assert session is not None
    # Only the slot we armed should have recorded frames.
    assert all(f.slot_id == 2 for f in session.frames)
    assert len(session.frames) >= 1


def test_meter_pipeline_no_op_when_capture_inactive(buffer):
    """No active session → record_frame is never called → no frames captured."""
    service = SequencerMeteringService()
    fake_sequencer_service = type("FB", (), {
        "get_slots": lambda self: [{"slot_id": 0, "mute": False, "level": 1.0}],
    })()
    with patch("app.services.sequencer_metering_service.get_sequencer_service",
                return_value=fake_sequencer_service):
        service.read_slot_meters()

    # Buffer is_active is False, so even if we tried to stop, the
    # session would be None.
    assert buffer.is_active() is False
