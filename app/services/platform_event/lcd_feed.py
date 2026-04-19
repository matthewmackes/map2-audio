"""Platform-native LCD feed projection types."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

from app.utils.time import utc_now


def _coerce_utc_timestamp(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


class LCDFeedCategory(StrEnum):
    AUDIO = "audio"
    SYSTEM = "system"
    NETWORK = "network"
    SERVICE = "service"
    USER = "user"
    ALERT = "alert"


class LCDFeedSeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class LCDFeedEntry:
    """Renderable LCD surface entry derived from a canonical PlatformEvent."""

    event_id: str
    timestamp: datetime
    source_node: str
    category: LCDFeedCategory
    severity: LCDFeedSeverity
    title: str
    message: str
    icon: str = "•"
    broadcast: bool = True
    target_nodes: list[str] = field(default_factory=list)
    ttl: int = 300
    color: str = "white"
    sound: bool = False
    dismiss_auto: bool = True
    context: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "timestamp": self.timestamp.isoformat(),
            "source_node": self.source_node,
            "category": self.category.value,
            "severity": self.severity.value,
            "title": self.title,
            "message": self.message,
            "icon": self.icon,
            "broadcast": self.broadcast,
            "target_nodes": self.target_nodes,
            "ttl": self.ttl,
            "color": self.color,
            "sound": self.sound,
            "dismiss_auto": self.dismiss_auto,
            "context": self.context,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LCDFeedEntry":
        payload = dict(data)
        payload["timestamp"] = _coerce_utc_timestamp(datetime.fromisoformat(payload["timestamp"]))
        payload["category"] = LCDFeedCategory(payload["category"])
        payload["severity"] = LCDFeedSeverity(payload["severity"])
        return cls(**payload)

    def is_expired(self) -> bool:
        age_seconds = (utc_now() - _coerce_utc_timestamp(self.timestamp)).total_seconds()
        return age_seconds > self.ttl

    def should_display_on_node(self, node_id: str) -> bool:
        if not self.broadcast and node_id not in self.target_nodes:
            return False
        return not self.is_expired()

