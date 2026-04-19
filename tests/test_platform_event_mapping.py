from __future__ import annotations

import pytest

from app.lcd_models.lcd_event import EventSeverity as LCDSeverity
from app.lcd_models.lcd_event import EventType as LCDType
from app.services.event_publisher import EventType as PublisherEventType
from app.services.health_monitor import HealthStatus
from app.services.platform_event.kind import (
    ALL_KINDS,
    kind_for_cluster_event_value,
    kind_for_event_bus_value,
    kind_for_event_publisher_value,
    kind_for_lcd_event_value,
)
from app.services.platform_event.severity import (
    FILTERED_SEVERITY,
    Severity,
    WEB_TONES,
    severity_from_health_status,
    severity_from_lcd,
    severity_from_web_tone,
)

LEGACY_CLUSTER_SEVERITY_VALUES = ("info", "warning", "error", "critical")
LEGACY_CLUSTER_EVENT_VALUES = (
    "NODE_ONLINE",
    "NODE_OFFLINE",
    "NODE_FAILOVER",
    "MIDI_NODE_DISCOVERED",
    "MIDI_NODE_LOST",
    "MIDI_PORT_DISCOVERED",
    "MIDI_PORT_LOST",
    "MIDI_CONNECTION_REQUESTED",
    "MIDI_CONNECTION_ESTABLISHED",
    "MIDI_CONNECTION_FAILED",
    "MIDI_CONNECTION_LOST",
    "MIDI_CLOCK_MASTER_ELECTED",
    "MIDI_CLOCK_DRIFT_DETECTED",
    "MIDI_PROFILE_SHARED",
    "MIDI_FAILOVER_TRIGGERED",
    "MIDI_FAILOVER_COMPLETED",
    "CONFIG_CHANGED",
    "CONFIG_UPDATED",
    "CONFIG_SYNC_REQUESTED",
    "CONFIG_SYNC_COMPLETED",
    "CONFIG_PUSHED",
    "CONFIG_ROLLED_BACK",
    "CONFIG_SYNCED",
    "UPDATE_STARTED",
    "UPDATE_COMPLETED",
    "UPDATE_FAILED",
    "UPDATE_ROLLED_BACK",
    "FAILOVER_INITIATED",
    "FAILOVER_COMPLETED",
    "FAILOVER_FAILED",
    "MAINTENANCE_STARTED",
    "MAINTENANCE_COMPLETED",
    "METRICS_COLLECTED",
    "PERFORMANCE_ALERT",
    "SYSTEM_STATUS",
    "HEALTH_DEGRADED",
    "HEALTH_RECOVERED",
    "HEALTH_CRITICAL",
)

LEGACY_EVENT_BUS_VALUES = (
    "node.online",
    "node.offline",
    "node.failover",
    "flow.assigned",
    "flow.unassigned",
    "config.updated",
    "audio_path.changed",
)


@pytest.mark.parametrize(("value", "expected"), [(member, Severity(member.value)) for member in LCDSeverity])
def test_lcd_severity_mapping_is_total(value: LCDSeverity, expected: Severity) -> None:
    assert severity_from_lcd(value) == expected


@pytest.mark.parametrize("value", LEGACY_CLUSTER_SEVERITY_VALUES)
def test_legacy_cluster_severity_values_match_canonical_severity_names(value: str) -> None:
    assert value in {member.value for member in Severity}


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (HealthStatus.HEALTHY, FILTERED_SEVERITY),
        (HealthStatus.DEGRADED, Severity.WARNING),
        (HealthStatus.CRITICAL, Severity.CRITICAL),
        (HealthStatus.OFFLINE, Severity.ERROR),
    ],
)
def test_health_status_mapping_is_total(value: HealthStatus, expected: str | Severity) -> None:
    assert severity_from_health_status(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("info", Severity.INFO),
        ("success", Severity.INFO),
        ("warn", Severity.WARNING),
        ("warning", Severity.WARNING),
        ("error", Severity.ERROR),
        ("critical", Severity.CRITICAL),
    ],
)
def test_web_tone_mapping_is_total(value: str, expected: Severity) -> None:
    assert value in WEB_TONES
    assert severity_from_web_tone(value) == expected


@pytest.mark.parametrize("value", LEGACY_EVENT_BUS_VALUES)
def test_event_bus_kind_mapping_is_total(value: str) -> None:
    mapped = kind_for_event_bus_value(value)
    assert mapped in ALL_KINDS


@pytest.mark.parametrize("value", LEGACY_CLUSTER_EVENT_VALUES)
def test_cluster_kind_mapping_is_total(value: str) -> None:
    mapped = kind_for_cluster_event_value(value)
    assert mapped in ALL_KINDS


@pytest.mark.parametrize("value", list(PublisherEventType))
def test_event_publisher_kind_mapping_is_total(value: PublisherEventType) -> None:
    mapped = kind_for_event_publisher_value(value.value)
    assert mapped in ALL_KINDS


@pytest.mark.parametrize("value", list(LCDType))
def test_lcd_kind_mapping_is_total(value: LCDType) -> None:
    mapped = kind_for_lcd_event_value(value.value)
    assert mapped in ALL_KINDS
