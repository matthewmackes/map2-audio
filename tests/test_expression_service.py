import threading
import time

import pytest

from app.services import expression_service as expression_module


@pytest.fixture
def expression_service(monkeypatch):
    monkeypatch.setattr(expression_module.ExpressionService, "_load_assignments_from_db", lambda self: None)
    monkeypatch.setattr(expression_module.ExpressionService, "_import_legacy_json_if_needed", lambda self: None)
    monkeypatch.setattr(expression_module.ExpressionService, "_ensure_default_performance_mappings", lambda self: None)
    monkeypatch.setattr(expression_module.ExpressionService, "_subscribe_to_midi_hub", lambda self: None)
    monkeypatch.setattr(expression_module.ExpressionService, "_save_assignment_to_db", lambda self, record: None)
    monkeypatch.setattr(expression_module.ExpressionService, "_delete_assignment_from_db", lambda self, assignment_id: None)
    monkeypatch.setattr(expression_module.ExpressionService, "_apply_parameter", lambda self, item: True)

    service = expression_module.ExpressionService()
    try:
        yield service
    finally:
        service.shutdown()


def test_assignment_crud_and_sort_order(expression_service):
    expression_service.create_assignment(
        {
            "id": "perf_page_next",
            "cc": 80,
            "channel": 16,
            "cc_min": 64,
            "cc_max": 127,
            "param_id": "perform.page_next",
            "param_label": "Next",
            "source": "performance_mode",
        }
    )
    expression_service.create_assignment(
        {
            "id": "user_wah",
            "cc": 11,
            "channel": 1,
            "cc_min": 0,
            "cc_max": 127,
            "param_id": "engine.wah_freq",
            "param_label": "Wah",
            "source": "user",
        }
    )

    rows = expression_service.list_assignments()
    assert [row["id"] for row in rows] == ["user_wah", "perf_page_next"]

    assert expression_service.delete_assignment("user_wah") is True
    assert expression_service.delete_assignment("missing") is False


def test_listen_for_cc_detects_delta(expression_service):
    result_holder: dict[str, dict] = {}

    def _listen():
        result_holder["value"] = expression_service.listen_for_cc(timeout_seconds=1.0, listener_id="listener-1")

    thread = threading.Thread(target=_listen, daemon=True)
    thread.start()
    time.sleep(0.05)

    expression_service.process_midi_cc(cc=7, value=10, channel=2)
    expression_service.process_midi_cc(cc=7, value=95, channel=2)
    thread.join(timeout=2.0)

    payload = result_holder["value"]
    assert payload["status"] == "detected"
    assert payload["cc"] == 7
    assert payload["channel"] == 2
    assert payload["max_observed"] - payload["min_observed"] > 10


def test_live_state_and_retime_stats_accumulate(expression_service):
    expression_service.create_assignment(
        {
            "id": "expr_reverb",
            "cc": 11,
            "channel": 1,
            "cc_min": 0,
            "cc_max": 127,
            "param_id": "engine.reverb_mix",
            "param_label": "Reverb Mix",
            "out_min": 0.0,
            "out_max": 1.0,
            "curve": "linear",
            "source": "user",
        }
    )

    for value in (0, 16, 32, 64, 96, 127):
        expression_service.process_midi_cc(cc=11, value=value, channel=1)

    expression_service._apply_queue.join()

    live = expression_service.get_live_state()
    assert "expr_reverb" in live
    assert live["expr_reverb"]["raw_value"] == 127
    assert live["expr_reverb"]["mapped_value"] == pytest.approx(1.0, abs=1e-3)

    stats = expression_service.get_retime_stats()
    assert stats["status"] == "ok"
    assert stats["sample_count"] >= 3
    assert stats["p95_ms"] >= 0.0


def test_custom_curve_affects_output(expression_service):
    expression_service.create_assignment(
        {
            "id": "expr_custom",
            "cc": 12,
            "channel": 1,
            "cc_min": 0,
            "cc_max": 127,
            "param_id": "engine.delay_mix",
            "param_label": "Delay Mix",
            "out_min": 0.0,
            "out_max": 1.0,
            "curve": "custom",
            "custom_curve": [{"x": 0.25, "y": 0.0}, {"x": 0.75, "y": 0.0}],
            "source": "user",
        }
    )

    expression_service.process_midi_cc(cc=12, value=64, channel=1)
    expression_service._apply_queue.join()

    live = expression_service.get_live_state()["expr_custom"]
    assert live["normalized"] == pytest.approx(64 / 127, abs=1e-3)
    # Two low-Y control points should keep the curve below linear midpoint.
    assert live["curved"] < live["normalized"]


@pytest.mark.parametrize("curve_name", ["logarithmic", "exponential", "s_curve"])
def test_curve_aliases_affect_output(expression_service, curve_name):
    expression_service.create_assignment(
        {
            "id": f"expr-{curve_name}",
            "cc": 13,
            "channel": 1,
            "cc_min": 0,
            "cc_max": 127,
            "param_id": "engine.delay_mix",
            "param_label": "Delay Mix",
            "out_min": 0.0,
            "out_max": 1.0,
            "curve": curve_name,
            "source": "snapshot",
        }
    )

    expression_service.process_midi_cc(cc=13, value=32, channel=1)
    expression_service._apply_queue.join()

    live = expression_service.get_live_state()[f"expr-{curve_name}"]
    assert 0.0 <= live["mapped_value"] <= 1.0
    if curve_name == "logarithmic":
        assert live["curved"] < live["normalized"]
    elif curve_name == "exponential":
        assert live["curved"] > live["normalized"]
    else:
        assert live["curved"] != pytest.approx(live["normalized"], abs=1e-6)


def test_performance_events_emit_for_cc_and_pc(expression_service):
    expression_service.create_assignment(
        {
            "id": "perf_page_next",
            "cc": 80,
            "channel": 16,
            "cc_min": 64,
            "cc_max": 127,
            "param_id": "perform.page_next",
            "param_label": "Next Page",
            "source": "performance_mode",
        }
    )

    expression_service.process_midi_cc(cc=80, value=127, channel=16)
    expression_service.process_midi_cc(cc=80, value=127, channel=16)  # gated repeat
    expression_service.process_midi_cc(cc=80, value=0, channel=16)    # reset gate
    expression_service.process_midi_cc(cc=80, value=127, channel=16)  # second trigger
    expression_service.process_midi_program_change(program=3, channel=16)

    payload = expression_service.get_performance_events(after_seq=0, limit=64)
    actions = [event["action"] for event in payload["events"]]

    assert actions.count("perform.page_next") == 2
    load_slot_events = [event for event in payload["events"] if event["action"] == "perform.load_slot"]
    assert load_slot_events
    assert load_slot_events[-1]["payload"]["slot"] == 3


def test_snapshot_morph_assignment_routes_through_live_snapshot_service(monkeypatch):
    monkeypatch.setattr(expression_module.ExpressionService, "_load_assignments_from_db", lambda self: None)
    monkeypatch.setattr(expression_module.ExpressionService, "_import_legacy_json_if_needed", lambda self: None)
    monkeypatch.setattr(expression_module.ExpressionService, "_ensure_default_performance_mappings", lambda self: None)
    monkeypatch.setattr(expression_module.ExpressionService, "_subscribe_to_midi_hub", lambda self: None)
    monkeypatch.setattr(expression_module.ExpressionService, "_save_assignment_to_db", lambda self, record: None)
    monkeypatch.setattr(expression_module.ExpressionService, "_delete_assignment_from_db", lambda self, assignment_id: None)

    applied_values: list[float] = []

    def _fake_apply_snapshot_morph_position(self, value: float) -> bool:
        applied_values.append(float(value))
        return True

    monkeypatch.setattr(
        expression_module.ExpressionService,
        "_apply_snapshot_morph_position",
        _fake_apply_snapshot_morph_position,
    )

    service = expression_module.ExpressionService()
    try:
        service.create_assignment(
            {
                "id": "snapshot_morph",
                "cc": 11,
                "channel": 1,
                "cc_min": 0,
                "cc_max": 127,
                "param_id": "snapshot.morph_position",
                "param_label": "Morph Position",
                "out_min": 0.0,
                "out_max": 1.0,
                "curve": "linear",
                "source": "snapshot",
            }
        )

        service.process_midi_cc(cc=11, value=96, channel=1)
        service._apply_queue.join()

        assert applied_values
        assert applied_values[-1] == pytest.approx(96 / 127, abs=1e-3)
    finally:
        service.shutdown()
