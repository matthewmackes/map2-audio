from __future__ import annotations

import time

from app.services.maschine.long_op_feedback import (
    MaschineLongOperationFeedback,
    MaschineLongOperationSnapshot,
)
from app.services.maschine.maschine_mk1_daemon import (
    DaemonConfig,
    MaschineMK1Daemon,
    build_long_operation_frames,
)
from app.services.maschine.mk1_protocol import Button, Led


def test_startup_progress_transitions_to_completion_receipt() -> None:
    feedback = MaschineLongOperationFeedback(receipt_hold_seconds=2.0)

    feedback.observe_startup_progress(
        {
            "completed_services": 2,
            "total_services": 5,
            "completed_levels": 1,
            "total_levels": 3,
        },
        now=10.0,
    )
    running = feedback.snapshot(now=10.1)

    assert running is not None
    assert running.title == "SYSTEM STARTUP"
    assert running.status == "running"
    assert running.progress == 0.4

    feedback.observe_startup_progress(
        {
            "completed_services": 5,
            "total_services": 5,
            "completed_levels": 3,
            "total_levels": 3,
        },
        now=12.0,
    )
    receipt = feedback.snapshot(now=12.1)

    assert receipt is not None
    assert receipt.title == "SYSTEM READY"
    assert receipt.status == "completed"

    assert feedback.snapshot(now=14.2) is None


def test_cluster_update_cancel_request_becomes_cancelled_receipt() -> None:
    feedback = MaschineLongOperationFeedback(receipt_hold_seconds=2.0, cancel_notice_seconds=1.0)

    feedback.observe_update_status(
        {
            "status": "running",
            "message": "Phase: updating",
            "current_node": "node-b",
            "progress": {"total": 4, "completed": 1, "failed": 0, "remaining": 3},
        },
        now=20.0,
    )
    feedback.mark_cancel_requested("cluster_update", now=20.2)

    cancel_requested = feedback.snapshot(now=20.3)
    assert cancel_requested is not None
    assert cancel_requested.status == "cancel_requested"
    assert cancel_requested.can_cancel is False

    feedback.observe_update_status({"status": "idle", "message": "No update in progress"}, now=20.8)
    receipt = feedback.snapshot(now=20.9)

    assert receipt is not None
    assert receipt.status == "cancelled"
    assert receipt.subtitle == "CANCELLED"


def test_plugin_scan_completion_receipt_is_emitted_after_running_state() -> None:
    feedback = MaschineLongOperationFeedback(receipt_hold_seconds=2.0)

    feedback.observe_plugin_scan_status(
        {
            "isScanning": True,
            "progress": 0.5,
            "currentPath": "/plugins/example.vst3",
            "totalFound": 12,
            "errors": [],
        },
        now=30.0,
    )
    running = feedback.snapshot(now=30.1)

    assert running is not None
    assert running.title == "PLUGIN SCAN"
    assert running.detail == "/plugins/example.vst3"

    feedback.observe_plugin_scan_status(
        {
            "isScanning": False,
            "progress": 1.0,
            "currentPath": "",
            "totalFound": 24,
            "errors": [],
        },
        now=31.0,
    )
    receipt = feedback.snapshot(now=31.1)

    assert receipt is not None
    assert receipt.status == "completed"
    assert receipt.detail == "24 PLUGINS READY"


def test_build_long_operation_frames_produce_valid_bitmaps() -> None:
    frames = build_long_operation_frames(
        MaschineLongOperationSnapshot(
            source="cluster_update",
            operation_id="cluster_update",
            title="CLUSTER UPDATE",
            subtitle="2/4 NODES",
            detail="Phase: updating • node-b",
            progress=0.5,
            status="running",
            can_cancel=True,
            cancel_path="/api/cluster/update/abort",
            started_at=5.0,
            updated_at=5.0,
        )
    )

    assert frames["left"]["format"] == "xbm"
    assert frames["right"]["format"] == "xbm"
    assert len(frames["left"]["framebuffer"]) == 21760
    assert len(frames["right"]["framebuffer"]) == 21760


def test_daemon_build_led_array_applies_long_operation_progress_bar() -> None:
    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._long_operation_feedback.begin_manual_operation(
        operation_id="manual-update",
        title="CLUSTER UPDATE",
        subtitle="2/5 NODES",
        detail="Phase: updating",
        progress=0.45,
        can_cancel=True,
        cancel_path="/api/cluster/update/abort",
        now=10.0,
    )

    led = daemon._build_led_array({"pads": [{"index": index, "state": "off"} for index in range(16)]})

    assert led[int(Led.TransportLeft)] > 0
    assert led[int(Led.Play)] > 0
    assert led[int(Led.Erase)] > 0
    assert led[int(Led.DisplayBacklight)] > 0


def test_shift_erase_cancels_active_long_operation_without_transport_side_effects() -> None:
    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._long_operation_feedback.begin_manual_operation(
        operation_id="manual-update",
        title="CLUSTER UPDATE",
        subtitle="1/4 NODES",
        detail="Phase: updating",
        progress=0.25,
        can_cancel=True,
        cancel_path="/api/cluster/update/abort",
        now=time.monotonic(),
    )
    sent_messages: list[bytes] = []
    daemon._midi.send_messages = lambda messages: sent_messages.extend(messages)
    daemon._enqueue_backend_message = lambda payload: None

    class _Response:
        def raise_for_status(self) -> None:
            return None

    class _FakeClient:
        def __init__(self) -> None:
            self.calls: list[str] = []

        def post(self, path: str, *_args, **_kwargs):
            self.calls.append(path)
            return _Response()

    client = _FakeClient()

    daemon._dispatch_button(
        client,
        type("Change", (), {"button": int(Button.Erase), "pressed": True})(),
        set(),
        True,
    )

    snapshot = daemon._long_operation_feedback.snapshot(now=time.monotonic())
    assert client.calls == ["/api/cluster/update/abort"]
    assert sent_messages == []
    assert snapshot is not None
    assert snapshot.status == "cancel_requested"
