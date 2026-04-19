"""Projection helpers from canonical PlatformEvents to the LCD feed model."""

from __future__ import annotations

from .envelope import PlatformEvent
from .lcd_feed import LCDFeedCategory, LCDFeedEntry, LCDFeedSeverity
from .policy import hints_for

_CATEGORY_VALUES = {category.value for category in LCDFeedCategory}
_KIND_PREFIX_CATEGORIES: tuple[tuple[str, LCDFeedCategory], ...] = (
    ("audio.", LCDFeedCategory.AUDIO),
    ("plugin.", LCDFeedCategory.AUDIO),
    ("chain.", LCDFeedCategory.AUDIO),
    ("node.", LCDFeedCategory.NETWORK),
    ("cluster.", LCDFeedCategory.NETWORK),
    ("midi.", LCDFeedCategory.NETWORK),
    ("config.", LCDFeedCategory.SYSTEM),
    ("workflow.", LCDFeedCategory.SERVICE),
    ("snapshot.", LCDFeedCategory.USER),
)


def lcd_feed_category_for_platform_event(event: PlatformEvent) -> LCDFeedCategory:
    explicit = str(event.context.get("lcd_event_type") or "").strip().lower()
    if explicit in _CATEGORY_VALUES:
        return LCDFeedCategory(explicit)

    if event.kind.startswith("lcd."):
        suffix = event.kind.split(".", 1)[1].strip().lower()
        if suffix in _CATEGORY_VALUES:
            return LCDFeedCategory(suffix)

    for prefix, category in _KIND_PREFIX_CATEGORIES:
        if event.kind.startswith(prefix):
            return category

    return LCDFeedCategory.ALERT if hints_for(event).urgent else LCDFeedCategory.SYSTEM


def lcd_feed_entry_from_platform_event(event: PlatformEvent) -> LCDFeedEntry:
    hints = hints_for(event)
    dismiss_auto = event.context.get("lcd_dismiss_auto")
    if dismiss_auto is None:
        dismiss_auto = not event.sticky

    severity = (
        LCDFeedSeverity.CRITICAL
        if event.severity.value == "critical"
        else LCDFeedSeverity.ERROR
        if event.severity.value == "error"
        else LCDFeedSeverity.WARNING
        if event.severity.value == "warning"
        else LCDFeedSeverity.INFO
    )

    return LCDFeedEntry(
        event_id=event.event_id,
        timestamp=event.occurred_at,
        source_node=event.source_node,
        category=lcd_feed_category_for_platform_event(event),
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
