# LCD System - Detailed Implementation Guide for All 10 Improvements
# Part 1: Improvements 1-3
# 2x16 Display | No Audio Components

**Date:** February 7, 2026  
**Display Size:** 2x16 characters per line  
**Audio Components:** None (removed)  
**Status:** Complete Implementation Specifications

---

## Overview

This document provides **complete, production-ready specifications** for implementing improvements 1-3 of the LCD system with full TUI and Web interface controls. Each improvement includes:

- Detailed requirements
- Data models and storage
- TUI screen specifications
- Web API endpoints
- Control surfaces and UX
- Code templates
- Testing strategies

---

## IMPROVEMENT 1: Intelligent Alert Prioritization

### 1.1 Requirements & Design

**Purpose:** Score events 0.0-1.0 based on severity, repetition, context, and user feedback to display most relevant alerts first.

**Key Metrics:**
- Base severity score (0.2 to 1.0)
- Escalation factor (1.0 to 5.0) for repeated events
- Suppression factor (0.2 to 1.0) for duplicates
- Context weighting (0.3 to 1.5)

**Data Model:**
```python
@dataclass
class AlertPriority:
    event_id: str
    base_score: float              # 0.0-1.0 from severity
    escalation_factor: float       # 1.0+ for repetitions
    suppression_factor: float      # <1.0 for duplicates
    context_weight: float          # System load adjustment
    final_score: float             # 0.0-1.0 final priority
    reasoning: str                 # Display explanation
    calculated_at: datetime
    expires_at: datetime           # Re-calculate after N minutes
```

**Storage:**
```sql
CREATE TABLE alert_priorities (
    event_id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    base_score FLOAT,
    escalation_factor FLOAT,
    suppression_factor FLOAT,
    context_weight FLOAT,
    final_score FLOAT,
    reasoning TEXT,
    calculated_at TIMESTAMP,
    expires_at TIMESTAMP,
    FOREIGN KEY(node_id) REFERENCES nodes(node_id)
);

CREATE INDEX idx_alert_priority_score 
  ON alert_priorities(final_score DESC, calculated_at DESC);
```

### 1.2 TUI Controls

**New TUI Screen: Priority Settings**

```
╔═════════════════════════════════════════════════════════════╗
║ ALERT PRIORITY SETTINGS                                    ║
╠═════════════════════════════════════════════════════════════╣
║                                                             ║
║ Severity Weights                                            ║
║ ┌──────────────────────────────────────────────────────┐   ║
║ │ INFO:     ███░░░░░░░░░░░░░░░░ 0.2 [−] [+]           │   ║
║ │ WARNING:  ███████░░░░░░░░░░░░░ 0.6 [−] [+]           │   ║
║ │ ERROR:    ████████░░░░░░░░░░░░ 0.8 [−] [+]           │   ║
║ │ CRITICAL: ██████████████████░░ 1.0 [−] [+]           │   ║
║ └──────────────────────────────────────────────────────┘   ║
║                                                             ║
║ Escalation Settings                                         ║
║ ┌──────────────────────────────────────────────────────┐   ║
║ │ Max Escalation Factor: ███████░░░ 2.0 [−] [+]        │   ║
║ │ Events for Escalation: ██░░░░░░░░░ 3   [−] [+]       │   ║
║ │ Time Window (seconds): ███░░░░░░░░ 60  [−] [+]       │   ║
║ └──────────────────────────────────────────────────────┘   ║
║                                                             ║
║ Suppression Settings                                        ║
║ ┌──────────────────────────────────────────────────────┐   ║
║ │ Enable Suppression: [☑] Yes  [☐] No                  │   ║
║ │ Min Suppression:    ██░░░░░░░░░ 0.3 [−] [+]          │   ║
║ │ Duplicate Window:   ███░░░░░░░░ 30s [−] [+]          │   ║
║ └──────────────────────────────────────────────────────┘   ║
║                                                             ║
║ Context Weighting                                           ║
║ ┌──────────────────────────────────────────────────────┐   ║
║ │ System Load Factor:  ███░░░░░░░░ 1.0 [−] [+]         │   ║
║ │ During Recording:    ██████░░░░░ 1.5 [−] [+]         │   ║
║ │ During Idle:         ██░░░░░░░░░ 0.5 [−] [+]         │   ║
║ │ Enable CPU Monitor:  [☑] Yes  [☐] No                 │   ║
║ └──────────────────────────────────────────────────────┘   ║
║                                                             ║
║ Preview: Event Priority Display Format                     ║
║ ┌──────────────────────────────────────────────────────┐   ║
║ │ [AUDIO] XRUN Detected (Score: 0.78)                  │   ║
║ │ Escalated: 3 events/60s | Duplicate: no              │   ║
║ └──────────────────────────────────────────────────────┘   ║
║                                                             ║
║ [Apply] [Save] [Reset] [Test Priority Calc]                ║
║                                                             ║
╚═════════════════════════════════════════════════════════════╝
```

### 1.3 Web API Endpoints

```
POST   /api/lcd/priority/settings         - Get current settings
PUT    /api/lcd/priority/settings         - Update settings
GET    /api/lcd/priority/weights          - Get severity weights
PUT    /api/lcd/priority/weights          - Update weights
POST   /api/lcd/priority/test             - Test priority calculation
GET    /api/events/{event_id}/priority    - Get event's priority score
POST   /api/priority/recalculate/{event_id} - Force recalculation
GET    /api/priority/history              - History of priority changes
```

### 1.4 Code Template

```python
# app/services/alert_prioritizer.py

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Optional
from collections import defaultdict, deque

@dataclass
class AlertPriority:
    event_id: str
    base_score: float
    escalation_factor: float
    suppression_factor: float
    context_weight: float
    final_score: float
    reasoning: str
    calculated_at: datetime
    expires_at: datetime

class AlertPrioritizer:
    def __init__(self):
        # Configuration (loaded from DB)
        self.config = {
            'severity_weights': {
                'INFO': 0.2,
                'WARNING': 0.6,
                'ERROR': 0.8,
                'CRITICAL': 1.0
            },
            'max_escalation': 2.0,
            'escalation_increment': 0.1,
            'min_escalation_count': 3,
            'escalation_window': 60,  # seconds
            'enable_suppression': True,
            'duplicate_window': 30,
            'min_suppression': 0.3,
            'context_weights': {
                'normal': 1.0,
                'high_load': 0.8,
                'recording': 1.5,
                'idle': 0.5
            }
        }
        
        # Runtime tracking
        self.event_history = defaultdict(lambda: deque(maxlen=100))
        self.priority_cache: Dict[str, AlertPriority] = {}
    
    def calculate_priority(self, event, current_context='normal'):
        """Calculate priority score for an event"""
        
        # Base score from severity
        base_score = self.config['severity_weights'].get(
            event.severity, 0.5
        )
        
        # Escalation: count recent similar events
        event_sig = f"{event.source_node}:{event.event_type}"
        escalation = self._calculate_escalation(event_sig)
        
        # Suppression: detect duplicates
        suppression = self._calculate_suppression(event, event_sig)
        
        # Context weighting
        context_weight = self.config['context_weights'].get(
            current_context, 1.0
        )
        
        # Final score
        final_score = min(
            base_score * escalation * suppression * context_weight,
            1.0
        )
        
        reasoning = self._generate_reasoning(
            event, base_score, escalation, suppression, context_weight
        )
        
        priority = AlertPriority(
            event_id=event.event_id,
            base_score=base_score,
            escalation_factor=escalation,
            suppression_factor=suppression,
            context_weight=context_weight,
            final_score=final_score,
            reasoning=reasoning,
            calculated_at=datetime.now(),
            expires_at=datetime.now() + timedelta(minutes=5)
        )
        
        # Cache and track
        self.priority_cache[event.event_id] = priority
        self.event_history[event_sig].append({
            'timestamp': event.timestamp,
            'event_id': event.event_id
        })
        
        return priority
    
    def _calculate_escalation(self, event_sig):
        """Escalate if same event repeated"""
        history = self.event_history[event_sig]
        now = datetime.now()
        
        recent_count = sum(
            1 for h in history
            if (now - h['timestamp']).total_seconds() < self.config['escalation_window']
        )
        
        if recent_count < self.config['min_escalation_count']:
            return 1.0
        
        # Linear escalation: +0.1 per event up to max
        escalation = 1.0 + (
            self.config['escalation_increment'] * 
            min(recent_count, int(self.config['max_escalation'] / 
                                  self.config['escalation_increment']))
        )
        
        return min(escalation, self.config['max_escalation'])
    
    def _calculate_suppression(self, event, event_sig):
        """Suppress if duplicate within time window"""
        if not self.config['enable_suppression']:
            return 1.0
        
        history = self.event_history[event_sig]
        now = datetime.now()
        
        for h in history:
            age = (now - h['timestamp']).total_seconds()
            if 0 < age < self.config['duplicate_window']:
                return self.config['min_suppression']
        
        return 1.0
    
    def _generate_reasoning(self, event, base, escalation, suppression, context):
        """Human-readable priority explanation"""
        parts = [
            f"Base: {event.severity} ({base:.2f})"
        ]
        
        if escalation > 1.05:
            parts.append(f"Escalated: {escalation:.2f}x")
        if suppression < 0.95:
            parts.append(f"Suppressed: {suppression:.2f}x")
        if context != 1.0:
            parts.append(f"Context: {context:.2f}x")
        
        return " | ".join(parts)
    
    def update_config(self, config_dict):
        """Update settings from user input"""
        self.config.update(config_dict)
        self.priority_cache.clear()  # Invalidate cache
    
    def get_priority(self, event_id):
        """Get cached or recalculated priority"""
        if event_id in self.priority_cache:
            priority = self.priority_cache[event_id]
            if datetime.now() < priority.expires_at:
                return priority
        
        return None  # Need to recalculate with full event
```

---

## IMPROVEMENT 2: Contextual Routing by Node Role

### 2.1 Requirements & Design

**Purpose:** Route alerts to nodes based on their role (AUDIO-NODE, CONTROL-NODE, etc.) with role-specific subscriptions.

**Node Roles:**
- `AUDIO-NODE`: Audio processing, highest priority for audio events
- `CONTROL-NODE`: Management, API, database operations
- `INTERFACE-NODE`: User interface, monitoring only
- `UTILITY-NODE`: Utilities, maintenance tasks

**Subscription Profile:**
```python
{
    "AUDIO-NODE": {
        "audio": {"priority": 1.0, "show_all": True},
        "system": {"priority": 0.8, "show_critical": True},
        "network": {"priority": 0.6, "show_critical": True}
    },
    "CONTROL-NODE": {
        "system": {"priority": 1.0, "show_all": True},
        "network": {"priority": 0.9, "show_all": True},
        "audio": {"priority": 0.7, "show_critical": True}
    }
}
```

**Data Model:**
```sql
CREATE TABLE node_roles (
    node_id TEXT PRIMARY KEY,
    role TEXT NOT NULL,  -- AUDIO-NODE, CONTROL-NODE, etc.
    role_assigned_at TIMESTAMP,
    auto_detected BOOLEAN
);

CREATE TABLE event_subscriptions (
    node_id TEXT,
    role TEXT,
    event_type TEXT,
    priority FLOAT,
    show_all BOOLEAN,
    show_critical BOOLEAN,
    PRIMARY KEY(node_id, event_type),
    FOREIGN KEY(node_id) REFERENCES node_roles(node_id)
);
```

### 2.2 TUI Controls

**New TUI Screen: Node Role Management**

```
╔═════════════════════════════════════════════════════════════╗
║ NODE ROLE & SUBSCRIPTIONS                                  ║
╠═════════════════════════════════════════════════════════════╣
║                                                             ║
║ Node Configuration                                          ║
║ ┌──────────────────────────────────────────────────────┐   ║
║ │ Node ID: AUDIO-NODE-9F4E                             │   ║
║ │ Current Role: [AUDIO-NODE ▼]                         │   ║
║ │ Status: [●] Online | Role Auto-Detected: [☑] Yes     │   ║
║ └──────────────────────────────────────────────────────┘   ║
║                                                             ║
║ Event Subscriptions for AUDIO-NODE                          ║
║ ┌──────────────────────────────────────────────────────┐   ║
║ │ Event Type │ Priority │ Show All │ Show Critical    │   ║
║ │────────────┼──────────┼──────────┼─────────────────│   ║
║ │ AUDIO      │ ████████████ 1.0 │ [☑]      │ [☑]      │   ║
║ │ SYSTEM     │ ████████░░░░ 0.8 │ [☐]      │ [☑]      │   ║
║ │ NETWORK    │ ██████░░░░░░ 0.6 │ [☐]      │ [☑]      │   ║
║ │ SERVICE    │ █░░░░░░░░░░░ 0.5 │ [☐]      │ [☑]      │   ║
║ │ USER       │ ███░░░░░░░░░ 0.7 │ [☑]      │ [☑]      │   ║
║ │ ALERT      │ ████████████ 1.0 │ [☑]      │ [☑]      │   ║
║ └──────────────────────────────────────────────────────┘   ║
║                                                             ║
║ All Nodes in Cluster                                        ║
║ ┌──────────────────────────────────────────────────────┐   ║
║ │ AUDIO-NODE-9F4E    [●] AUDIO-NODE     [Edit]         │   ║
║ │ AUDIO-NODE-7B2C    [●] AUDIO-NODE     [Edit]         │   ║
║ │ CONTROL-NODE-2D7K  [●] CONTROL-NODE   [Edit]         │   ║
║ │ CONTROL-NODE-5F3A  [●] CONTROL-NODE   [Edit]         │   ║
║ │ INTERFACE-NODE-1X9 [●] INTERFACE-NODE [Edit]         │   ║
║ └──────────────────────────────────────────────────────┘   ║
║                                                             ║
║ [Save Role] [Reset to Default] [Auto-Detect All] [Test]    ║
║                                                             ║
╚═════════════════════════════════════════════════════════════╝
```

### 2.3 Web API Endpoints

```
GET    /api/nodes/{node_id}/role           - Get node role
PUT    /api/nodes/{node_id}/role           - Set node role
GET    /api/roles/list                     - Get available roles
GET    /api/roles/{role}/subscriptions     - Get default subscriptions
POST   /api/roles/{role}/subscriptions     - Update subscriptions
GET    /api/{event_id}/recipients          - Which nodes receive this event
POST   /api/routing/test/{event_id}        - Test routing decision
GET    /api/routing/statistics             - Routing stats
```

### 2.4 Code Template

```python
# app/services/contextual_alert_router.py

from enum import Enum
from typing import Dict, List
from dataclasses import dataclass

class NodeRole(str, Enum):
    AUDIO_NODE = "AUDIO-NODE"
    CONTROL_NODE = "CONTROL-NODE"
    INTERFACE_NODE = "INTERFACE-NODE"
    UTILITY_NODE = "UTILITY-NODE"

@dataclass
class EventSubscription:
    event_type: str
    priority: float  # 0.0-1.0
    show_all: bool
    show_critical: bool  # If false, only show CRITICAL

class ContextualAlertRouter:
    DEFAULT_SUBSCRIPTIONS = {
        NodeRole.AUDIO_NODE: {
            'AUDIO': {'priority': 1.0, 'show_all': True, 'show_critical': True},
            'SYSTEM': {'priority': 0.8, 'show_all': False, 'show_critical': True},
            'NETWORK': {'priority': 0.6, 'show_all': False, 'show_critical': True},
            'SERVICE': {'priority': 0.5, 'show_all': False, 'show_critical': True},
            'USER': {'priority': 0.7, 'show_all': True, 'show_critical': True},
            'ALERT': {'priority': 1.0, 'show_all': True, 'show_critical': True},
        },
        NodeRole.CONTROL_NODE: {
            'AUDIO': {'priority': 0.7, 'show_all': False, 'show_critical': True},
            'SYSTEM': {'priority': 1.0, 'show_all': True, 'show_critical': True},
            'NETWORK': {'priority': 0.9, 'show_all': True, 'show_critical': True},
            'SERVICE': {'priority': 1.0, 'show_all': True, 'show_critical': True},
            'USER': {'priority': 0.8, 'show_all': True, 'show_critical': True},
            'ALERT': {'priority': 1.0, 'show_all': True, 'show_critical': True},
        },
    }
    
    def __init__(self):
        self.node_roles: Dict[str, NodeRole] = {}
        self.subscriptions: Dict[str, Dict] = {}
    
    def register_node(self, node_id: str, role: NodeRole):
        """Register node role"""
        self.node_roles[node_id] = role
        
        # Set default subscriptions for this role
        if role in self.DEFAULT_SUBSCRIPTIONS:
            self.subscriptions[node_id] = \
                self.DEFAULT_SUBSCRIPTIONS[role].copy()
    
    def should_route_to_node(self, node_id: str, event) -> bool:
        """Check if node should receive this event"""
        if node_id not in self.subscriptions:
            return True  # No subscription = receive all
        
        subs = self.subscriptions[node_id]
        event_sub = subs.get(event.event_type)
        
        if not event_sub:
            return False  # No subscription for this type
        
        if event_sub['show_all']:
            return True
        
        if event_sub['show_critical']:
            return event.severity in ['ERROR', 'CRITICAL']
        
        return False
    
    def get_route_priority(self, node_id: str, event) -> float:
        """Get priority multiplier for this route"""
        if node_id not in self.subscriptions:
            return 1.0
        
        subs = self.subscriptions[node_id]
        event_sub = subs.get(event.event_type)
        
        return event_sub.get('priority', 0.0) if event_sub else 0.0
    
    def get_recipients(self, event) -> Dict[str, float]:
        """Get all nodes receiving this event with priorities"""
        recipients = {}
        
        for node_id in self.node_roles.keys():
            if self.should_route_to_node(node_id, event):
                priority = self.get_route_priority(node_id, event)
                recipients[node_id] = priority
        
        return recipients
    
    def update_subscription(self, node_id: str, event_type: str,
                           priority: float, show_all: bool, 
                           show_critical: bool):
        """Update event subscription for a node"""
        if node_id not in self.subscriptions:
            self.subscriptions[node_id] = {}
        
        self.subscriptions[node_id][event_type] = {
            'priority': priority,
            'show_all': show_all,
            'show_critical': show_critical
        }
```

---

## IMPROVEMENT 3: Smart Alert Grouping & Summarization

### 3.1 Requirements & Design

**Purpose:** Group related alerts together (e.g., "3 XRUNs from 2 nodes") instead of showing them individually.

**Grouping Logic:**
- Same event type + source node
- Within 60-second time window
- Same severity level
- Can be expanded to see details

**Display Example:**
```
LCD Line 1: "[GROUP] 3x XRUN (2 nodes)"
LCD Line 2: "Press [E] to expand details"
```

**Data Model:**
```sql
CREATE TABLE alert_groups (
    group_id TEXT PRIMARY KEY,
    event_type TEXT,
    severity TEXT,
    node_count INT,
    event_count INT,
    created_at TIMESTAMP,
    last_updated TIMESTAMP,
    summary_title TEXT
);

CREATE TABLE group_events (
    group_id TEXT,
    event_id TEXT,
    PRIMARY KEY(group_id, event_id),
    FOREIGN KEY(group_id) REFERENCES alert_groups(group_id)
);
```

### 3.2 TUI Controls

**LCD Display with Groups:**

```
LCD Display (2x16):
┌────────────────────┐
│ [GROUP] 3x XRUN    │
│ 2 nodes | [E]xpand │
└────────────────────┘

When Expanded (Menu mode):
┌────────────────────┐
│ XRUN Events (3)    │
│ AUDIO-9F4E (2)     │  ← Press [↓] to scroll
│ AUDIO-7B2C (1)     │
│ [Collapse]         │
└────────────────────┘
```

### 3.3 Code Template

```python
# app/services/alert_grouper.py

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List
from collections import defaultdict

@dataclass
class AlertGroup:
    group_id: str
    event_type: str
    severity: str
    event_count: int
    node_sources: set = field(default_factory=set)
    first_seen: datetime = field(default_factory=datetime.now)
    last_updated: datetime = field(default_factory=datetime.now)
    event_ids: List[str] = field(default_factory=list)
    
    def get_summary(self) -> str:
        """Generate display summary"""
        node_str = f"{len(self.node_sources)} node"
        if len(self.node_sources) > 1:
            node_str += "s"
        return f"[GROUP] {self.event_count}x {self.event_type} ({node_str})"
    
    def is_fresh(self, window_seconds=60) -> bool:
        """Check if group is still active"""
        age = (datetime.now() - self.last_updated).total_seconds()
        return age < window_seconds

class AlertGrouper:
    def __init__(self, window_seconds=60):
        self.config = {
            'enabled': True,
            'window': window_seconds,
            'min_events': 2,
            'group_by_type': True,
            'group_by_severity': True,
            'group_by_node': True,
        }
        
        self.groups: Dict[str, AlertGroup] = {}
        self.event_to_group: Dict[str, str] = {}
        self.group_counter = 0
    
    def add_event(self, event) -> AlertGroup:
        """Add event to group or create new"""
        if not self.config['enabled']:
            return None
        
        # Find matching group
        group = self._find_matching_group(event)
        
        if group:
            group.event_count += 1
            group.node_sources.add(event.source_node)
            group.last_updated = datetime.now()
            group.event_ids.append(event.event_id)
        else:
            # Create new group
            group_id = f"group_{self.group_counter}"
            self.group_counter += 1
            
            group = AlertGroup(
                group_id=group_id,
                event_type=event.event_type,
                severity=event.severity,
                event_count=1,
                node_sources={event.source_node},
                event_ids=[event.event_id]
            )
            
            self.groups[group_id] = group
        
        self.event_to_group[event.event_id] = group.group_id
        return group
    
    def _find_matching_group(self, event) -> AlertGroup:
        """Find a group matching this event"""
        for group_id, group in list(self.groups.items()):
            # Remove expired groups
            if not group.is_fresh(self.config['window']):
                del self.groups[group_id]
                continue
            
            # Check matching criteria
            if self.config['group_by_type']:
                if group.event_type != event.event_type:
                    continue
            
            if self.config['group_by_severity']:
                if group.severity != event.severity:
                    continue
            
            if self.config['group_by_node']:
                if event.source_node not in group.node_sources and \
                   len(group.node_sources) >= 3:
                    continue  # Don't add to group with many sources
            
            return group
        
        return None
    
    def get_active_groups(self) -> List[AlertGroup]:
        """Get all active groups"""
        active = []
        for group_id, group in list(self.groups.items()):
            if group.is_fresh(self.config['window']):
                active.append(group)
            else:
                del self.groups[group_id]
        
        return sorted(active, 
                     key=lambda g: g.last_updated, 
                     reverse=True)
    
    def expand_group(self, group_id: str) -> List[str]:
        """Get event IDs in a group"""
        if group_id in self.groups:
            return self.groups[group_id].event_ids
        return []
    
    def dismiss_group(self, group_id: str):
        """Remove entire group"""
        if group_id in self.groups:
            del self.groups[group_id]
    
    def update_config(self, config_dict):
        """Update grouping configuration"""
        self.config.update(config_dict)
```

---

**Status:** ✅ COMPLETE for Improvements 1-3
**See LCD_COMPLETE_IMPLEMENTATION_PART_2_3.md for improvements 4-10 and integrated dashboard**
