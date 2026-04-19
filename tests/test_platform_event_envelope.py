from __future__ import annotations

import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.services.platform_event.envelope import PlatformEvent
from app.services.platform_event.kind import PLATFORM_EVENT_KINDS
from app.services.platform_event.policy import hints_for
from app.services.platform_event.severity import Severity


TS_PLATFORM_EVENT_PATH = Path("web/src/map2/platformEvent.ts")


def _extract_ts_const(name: str) -> list[str]:
    content = TS_PLATFORM_EVENT_PATH.read_text(encoding="utf-8")
    match = re.search(rf"export const {name} = \[(.*?)\] as const", content, re.S)
    assert match, f"Could not find {name} in {TS_PLATFORM_EVENT_PATH}"
    return re.findall(r"'([^']+)'", match.group(1))


def test_platform_event_defaults_and_expiry() -> None:
    event = PlatformEvent(
        kind="system.cpu.critical",
        severity=Severity.CRITICAL,
        source_node="AUDIO-NODE-0001",
        source_service="health_monitor",
        title="CPU critical",
        message="CPU sustained at 95%",
    )

    assert event.event_id
    assert event.occurred_at.tzinfo is not None
    assert event.expires_at is not None
    assert event.expires_at > event.occurred_at
    assert event.monotonic_ns is not None


def test_platform_event_ttl_zero_stays_persistent() -> None:
    event = PlatformEvent(
        kind="snapshot.live.pinned",
        severity=Severity.INFO,
        source_node="CONTROL-NODE-0001",
        source_service="snapshot_runtime_state_service",
        title="Live snapshot",
        message="Current live snapshot remains pinned",
        ttl_seconds=0,
    )

    assert event.expires_at is None


def test_platform_event_rejects_title_over_40_chars() -> None:
    with pytest.raises(ValidationError):
        PlatformEvent(
            kind="system.cpu.critical",
            severity=Severity.CRITICAL,
            source_node="AUDIO-NODE-0001",
            source_service="health_monitor",
            title="X" * 41,
            message="CPU sustained at 95%",
        )


def test_platform_event_rejects_unknown_kind() -> None:
    with pytest.raises(ValidationError):
        PlatformEvent(
            kind="not.a.real.kind",
            severity=Severity.INFO,
            source_node="AUDIO-NODE-0001",
            source_service="test",
            title="Invalid kind",
            message="Should fail validation",
        )


def test_platform_event_typescript_manifest_matches_python() -> None:
    ts_kinds = _extract_ts_const("PLATFORM_EVENT_KINDS")
    ts_fields = _extract_ts_const("PLATFORM_EVENT_FIELDS")
    ts_severities = _extract_ts_const("PLATFORM_EVENT_SEVERITIES")

    assert ts_kinds == list(PLATFORM_EVENT_KINDS)
    assert ts_severities == [severity.value for severity in Severity]
    assert ts_fields == list(PlatformEvent.model_fields.keys())


def test_platform_event_json_payload_matches_typescript_fields() -> None:
    event = PlatformEvent(
        kind="workflow.progress",
        severity=Severity.INFO,
        source_node="CONTROL-NODE-0001",
        source_service="workflow_service",
        title="Workflow progress",
        message="Deploying scene 2 of 4",
        workflow={"stage": "deploy", "progress": 0.5},
        target_surfaces=["web", "mk1"],
    )

    dumped = event.model_dump(mode="json")
    assert sorted(dumped.keys()) == sorted(_extract_ts_const("PLATFORM_EVENT_FIELDS"))


def test_policy_hints_cover_critical_and_snapshot_profiles() -> None:
    critical = PlatformEvent(
        kind="system.cpu.critical",
        severity=Severity.CRITICAL,
        source_node="AUDIO-NODE-0001",
        source_service="health_monitor",
        title="CPU critical",
        message="CPU sustained at 95%",
    )
    live_snapshot = PlatformEvent(
        kind="snapshot.live.pinned",
        severity=Severity.INFO,
        source_node="CONTROL-NODE-0001",
        source_service="snapshot_runtime_state_service",
        title="Live snapshot",
        message="Snapshot 42 is active",
        ttl_seconds=0,
    )

    critical_hints = hints_for(critical)
    snapshot_hints = hints_for(live_snapshot)

    assert critical_hints.led_color == "red"
    assert critical_hints.urgent is True
    assert snapshot_hints.web_stage_class == "snapshot"
    assert snapshot_hints.mcu_prefix == "LIVE "
