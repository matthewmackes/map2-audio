import asyncio

import pytest
from fastapi import HTTPException

from app.routes import expression as expression_routes


class _FakeExpressionService:
    def __init__(self) -> None:
        self.created_payload = None
        self.deleted_id = None
        self.listen_args = None
        self.cancel_listener_id = None
        self.inject_cc = None
        self.inject_pc = None

    def list_assignments(self):
        return [{"id": "a1"}]

    def create_assignment(self, payload):
        self.created_payload = payload
        return {"id": payload["id"], "cc": payload["cc"]}

    def delete_assignment(self, assignment_id: str):
        self.deleted_id = assignment_id
        return assignment_id != "missing"

    def listen_for_cc(self, timeout_seconds: float, listener_id: str | None):
        self.listen_args = (timeout_seconds, listener_id)
        return {
            "listener_id": listener_id or "generated",
            "cc": 11,
            "channel": 1,
            "min_observed": 12,
            "max_observed": 127,
            "status": "detected",
        }

    def cancel_listen(self, listener_id: str | None):
        self.cancel_listener_id = listener_id
        return 1

    def get_live_state(self):
        return {"a1": {"mapped_value": 0.5}}

    def get_retime_stats(self):
        return {
            "mean_ms": 1.2,
            "p95_ms": 4.6,
            "max_ms": 5.0,
            "sample_count": 12,
            "status": "ok",
        }

    def clear_retime_stats(self):
        return None

    def get_performance_events(self, after_seq: int, limit: int):
        return {"events": [{"seq": 1, "action": "perform.page_next"}], "last_seq": 1}

    def process_midi_cc(self, **kwargs):
        self.inject_cc = kwargs

    def process_midi_program_change(self, **kwargs):
        self.inject_pc = kwargs


def test_assignment_list_and_create(monkeypatch):
    fake = _FakeExpressionService()
    monkeypatch.setattr(expression_routes, "get_expression_service", lambda: fake)

    listing = asyncio.run(expression_routes.list_assignments())
    created = asyncio.run(
        expression_routes.create_assignment(
            expression_routes.AssignmentCreate(
                id="unit-a1",
                cc=7,
                channel=1,
                cc_min=0,
                cc_max=127,
                param_id="engine.reverb_mix",
                param_label="Reverb Mix",
            )
        )
    )

    assert listing == [{"id": "a1"}]
    assert fake.created_payload is not None
    assert fake.created_payload["id"] == "unit-a1"
    assert created["id"] == "unit-a1"


def test_delete_assignment_404(monkeypatch):
    fake = _FakeExpressionService()
    monkeypatch.setattr(expression_routes, "get_expression_service", lambda: fake)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(expression_routes.delete_assignment("missing"))

    assert exc_info.value.status_code == 404


def test_listen_cancel_and_live_state(monkeypatch):
    fake = _FakeExpressionService()
    monkeypatch.setattr(expression_routes, "get_expression_service", lambda: fake)

    detected = asyncio.run(
        expression_routes.listen_for_cc(
            expression_routes.ListenRequest(timeout_seconds=3.5, listener_id="listener-abc")
        )
    )
    cancelled = asyncio.run(
        expression_routes.cancel_listen_for_cc(
            expression_routes.ListenCancelRequest(listener_id="listener-abc")
        )
    )
    live_state = asyncio.run(expression_routes.get_live_state())

    assert detected["status"] == "detected"
    assert fake.listen_args == (3.5, "listener-abc")
    assert cancelled["cancelled"] == 1
    assert live_state["a1"]["mapped_value"] == 0.5


def test_retime_gate_fail_when_no_samples(monkeypatch):
    fake = _FakeExpressionService()
    fake.get_retime_stats = lambda: {
        "mean_ms": 0.0,
        "p95_ms": 0.0,
        "max_ms": 0.0,
        "sample_count": 0,
        "status": "insufficient_data",
    }
    monkeypatch.setattr(expression_routes, "get_expression_service", lambda: fake)

    payload = asyncio.run(expression_routes.get_retime_stats())
    assert payload["gate"] == "FAIL"
    assert payload["sample_count"] == 0


def test_performance_events_and_debug_inject(monkeypatch):
    fake = _FakeExpressionService()
    monkeypatch.setattr(expression_routes, "get_expression_service", lambda: fake)

    events = asyncio.run(expression_routes.get_performance_events(after_seq=0, limit=8))
    cc_resp = asyncio.run(
        expression_routes.debug_inject_cc(
            expression_routes.InjectCcRequest(cc=80, channel=16, value=127)
        )
    )
    pc_resp = asyncio.run(
        expression_routes.debug_inject_pc(
            expression_routes.InjectPcRequest(program=4, channel=16)
        )
    )

    assert events["last_seq"] == 1
    assert cc_resp["status"] == "ok"
    assert pc_resp["status"] == "ok"
    assert fake.inject_cc["cc"] == 80
    assert fake.inject_pc["program"] == 4
