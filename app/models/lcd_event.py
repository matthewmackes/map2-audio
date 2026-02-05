"""
LCD Event Data Model

Defines the structure for distributed LCD events that can be
broadcast across the cluster and displayed on node LCDs.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Any, Optional
from enum import Enum


class EventType(str, Enum):
    """Types of LCD events"""
    AUDIO = "audio"
    SYSTEM = "system"
    NETWORK = "network"
    SERVICE = "service"
    USER = "user"
    ALERT = "alert"


class EventSeverity(str, Enum):
    """Severity levels for events"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class LCDEvent:
    """
    Distributed LCD event that can be shown on any node's display.
    
    Events contain all information needed to display them on the LCD,
    route them to other nodes, and persist them in the database.
    """
    
    # Core identifiers
    event_id: str                           # Unique ID (UUID)
    timestamp: datetime                     # When event occurred
    source_node: str                        # AUDIO-NODE-<ID4> or CONTROL-NODE-<ID4>
    event_type: EventType                   # Category of event
    severity: EventSeverity                 # Importance level
    
    # Display content
    title: str                              # Short title (max 40 chars)
    message: str                            # Full message (max 200 chars)
    icon: str = "•"                         # ASCII/emoji icon
    
    # Routing
    broadcast: bool = True                  # Send to all nodes?
    target_nodes: List[str] = field(default_factory=list)  # Specific nodes
    ttl: int = 300                          # Time-to-live (seconds)
    
    # UI hints
    color: str = "white"                    # Display color
    sound: bool = False                     # Play alert sound?
    dismiss_auto: bool = True               # Auto-dismiss after TTL?
    
    # Metadata
    context: Dict[str, Any] = field(default_factory=dict)  # Extra data
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "event_id": self.event_id,
            "timestamp": self.timestamp.isoformat(),
            "source_node": self.source_node,
            "event_type": self.event_type.value,
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
    def from_dict(cls, data: Dict[str, Any]) -> "LCDEvent":
        """Create event from dictionary"""
        data["timestamp"] = datetime.fromisoformat(data["timestamp"])
        data["event_type"] = EventType(data["event_type"])
        data["severity"] = EventSeverity(data["severity"])
        return cls(**data)
    
    def is_expired(self) -> bool:
        """Check if event has exceeded its TTL"""
        age_seconds = (datetime.now() - self.timestamp).total_seconds()
        return age_seconds > self.ttl
    
    def should_display_on_node(self, node_id: str) -> bool:
        """Check if event should be displayed on given node"""
        if not self.broadcast and node_id not in self.target_nodes:
            return False
        return not self.is_expired()
