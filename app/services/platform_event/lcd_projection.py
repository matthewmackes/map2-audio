"""Projection helpers from canonical PlatformEvents to the legacy LCD view model."""

from __future__ import annotations

from app.lcd_models.lcd_event import EventSeverity, EventType, LCDEvent

from .envelope import PlatformEvent
from .policy import hints_for

_EVENT_TYPE_VALUES = {event_type.value for event_type in EventType}
_KIND_PREFIX_EVENT_TYPES: tuple[tuple[str, EventType], ...] = (
    ("audio.", EventType.AUDIO),
    ("plugin.", EventType.AUDIO),
    ("chain.", EventType.AUDIO),
    ("node.", EventType.NETWORK),
    ("cluster.", EventType.NETWORK),
    ("midi.", EventType.NETWORK),
    ("config.", EventType.SYSTEM),
    ("workflow.", EventType.SERVICE),
    ("snapshot.", EventType.USER),
)


def lcd_event_type_for_platform_event(event: PlatformEvent) -> EventType:
    explicit = str(event.context.get("lcd_event_type") or "").strip().lower()
    if explicit in _EVENT_TYPE_VALUES:
        return EventType(explicit)

    if event.kind.startswith("lcd."):
        suffix = event.kind.split(".", 1)[1].strip().lower()
        if suffix in _EVENT_TYPE_VALUES:
            return EventType(suffix)

    for prefix, event_type in _KIND_PREFIX_EVENT_TYPES:
        if event.kind.startswith(prefix):
            return event_type

    return EventType.ALERT if hints_for(event).urgent else EventType.SYSTEM


def lcd_event_from_platform_event(event: PlatformEvent) -> LCDEvent:
    hints = hints_for(event)
    dismiss_auto = event.context.get("lcd_dismiss_auto")
    if dismiss_auto is None:
        dismiss_auto = not event.sticky

    severity = (
        EventSeverity.CRITICAL
        if event.severity.value == "critical"
        else EventSeverity.ERROR
        if event.severity.value == "error"
        else EventSeverity.WARNING
        if event.severity.value == "warning"
        else EventSeverity.INFO
    )

    return LCDEvent(
        event_id=event.event_id,
        timestamp=event.occurred_at,
        source_node=event.source_node,
        event_type=lcd_event_type_for_platform_event(event),
        severity=severity,
        title=event.title,
        message=event.message,
        icon=str(event.icon or hints.lcd_icon or "•"),
        broadcast=bool(event.broadcast),
        target_nodes=list(event.target_nodes or []),
        ttl=max(0, int(event.ttl_seconds)),
        color=str(event.color or hints.led_color or "white"),
        sound=bool(hints.sound if event.sound is None else event.sound),
        dismiss_auto=bool(dismiss_auto),
        context={
            **dict(event.context or {}),
            "platform_event_kind": event.kind,
            "platform_event_source_service": event.source_service,
            "platform_event_priority": event.priority,
            "platform_event_supersedes": event.supersedes,
            "platform_event_resource": event.resource,
            "platform_event_workflow": event.workflow,
        },
    )
