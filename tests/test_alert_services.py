from __future__ import annotations

from app.services.alert_services import AlertGrouper, AlertPrioritizer


def test_alert_prioritizer_calculates_score() -> None:
    prioritizer = AlertPrioritizer()
    priority = prioritizer.calculate_priority(
        {
            "event_id": "evt-1",
            "severity": "CRITICAL",
            "source_node": "AUDIO-NODE-0001",
            "event_type": "system.cpu.critical",
        }
    )

    assert priority.event_id == "evt-1"
    assert 0.0 < priority.final_score <= 1.0


def test_alert_grouper_groups_same_type_and_severity() -> None:
    grouper = AlertGrouper(window_seconds=60)
    first = grouper.add_event(
        {
            "event_id": "evt-1",
            "event_type": "system.cpu.critical",
            "severity": "CRITICAL",
            "source_node": "AUDIO-NODE-0001",
        }
    )
    second = grouper.add_event(
        {
            "event_id": "evt-2",
            "event_type": "system.cpu.critical",
            "severity": "CRITICAL",
            "source_node": "AUDIO-NODE-0001",
        }
    )

    assert first is not None
    assert second is not None
    assert first.group_id == second.group_id
    assert second.event_count == 2
