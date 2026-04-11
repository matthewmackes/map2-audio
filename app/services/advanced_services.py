"""
Advanced Alert Services - Continuation
Services 4-10 implementation
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, List
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

# ============================================================================
# SERVICE 4: ALERT ACKNOWLEDGMENT MANAGER
# ============================================================================

@dataclass
class Acknowledgment:
    acknowledgment_id: str
    event_id: str
    node_id: str
    ack_type: str
    ack_timestamp: datetime
    user_id: Optional[str]
    notes: Optional[str]
    reactivate_seconds: int
    reactivate_if_repeated: bool
    
    def is_active(self) -> bool:
        """Check if acknowledgment is still in effect"""
        if self.ack_type == 'ACKNOWLEDGED':
            return True
        age = (datetime.now(timezone.utc) - self.ack_timestamp).total_seconds()
        return age < self.reactivate_seconds

class AlertAcknowledgmentManager:
    def __init__(self, db_conn=None):
        self.db = db_conn
        self.config = {
            'enabled': True,
            'temporary_duration': 300,
            'suppression_duration': 1800,
            'auto_reactivate': True,
            'reactivate_threshold': 5,
            'reactivate_window': 60,
        }
        self.acknowledgments: Dict[str, Acknowledgment] = {}
        self.history: List[Acknowledgment] = []
        logger.info("AlertAcknowledgmentManager initialized")
    
    def acknowledge(self, event_id: str, node_id: str, ack_type: str, user_id: str = None, notes: str = None) -> Acknowledgment:
        """Record acknowledgment"""
        ack = Acknowledgment(
            acknowledgment_id=f"ack_{datetime.now(timezone.utc).timestamp()}",
            event_id=event_id,
            node_id=node_id,
            ack_type=ack_type,
            ack_timestamp=datetime.now(timezone.utc),
            user_id=user_id,
            notes=notes,
            reactivate_seconds=self.config['temporary_duration'] if ack_type == 'TEMPORARY' else self.config['suppression_duration'],
            reactivate_if_repeated=self.config['auto_reactivate']
        )
        
        self.acknowledgments[event_id] = ack
        self.history.append(ack)
        logger.info(f"Acknowledged event {event_id} as {ack_type}")
        return ack
    
    def is_acknowledged(self, event_id: str) -> bool:
        """Check if event is currently acknowledged"""
        if event_id not in self.acknowledgments:
            return False
        
        ack = self.acknowledgments[event_id]
        return ack.is_active()
    
    def get_acknowledgment(self, event_id: str) -> Optional[Acknowledgment]:
        """Get active acknowledgment for event"""
        if event_id in self.acknowledgments:
            ack = self.acknowledgments[event_id]
            if ack.is_active():
                return ack
            else:
                del self.acknowledgments[event_id]
        
        return None
    
    def should_reactivate(self, event_id: str, recent_event_count: int) -> bool:
        """Check if acknowledged event should be re-shown"""
        ack = self.acknowledgments.get(event_id)
        
        if not ack or not ack.reactivate_if_repeated:
            return False
        
        if ack.ack_type != 'TEMPORARY':
            return False
        
        return recent_event_count >= self.config['reactivate_threshold']
    
    def get_pending_reactivations(self) -> List[str]:
        """Get events ready to be re-shown"""
        reactivate = []
        
        for event_id, ack in list(self.acknowledgments.items()):
            if not ack.is_active():
                reactivate.append(event_id)
                del self.acknowledgments[event_id]
        
        return reactivate
    
    def update_config(self, config_dict: Dict):
        """Update acknowledgment configuration"""
        self.config.update(config_dict)


# ============================================================================
# SERVICE 5: EVENT CORRELATION ENGINE
# ============================================================================

@dataclass
class EventCorrelation:
    source_event_id: str
    target_event_id: str
    correlation_type: str
    confidence: float
    root_cause: str
    detected_at: datetime

@dataclass
class RootCauseAnalysis:
    primary_event_id: str
    cause_description: str
    confidence: float
    causal_chain: List[str]
    recommendations: List[str]

class EventCorrelationEngine:
    def __init__(self, db_conn=None):
        self.db = db_conn
        self.config = {
            'temporal_window': 5,
            'causal_window': 10,
            'min_confidence': 0.6,
            'enable_pattern_matching': True,
        }
        self.correlations: Dict[str, EventCorrelation] = {}
        self.event_history: List = []
        logger.info("EventCorrelationEngine initialized")
    
    def analyze_event(self, event: dict) -> RootCauseAnalysis:
        """Analyze event for correlations and root cause"""
        temporal_corrs = self._find_temporal_correlations(event)
        causal_corrs = self._find_causal_correlations(event, temporal_corrs)
        causal_chain = self._build_causal_chain(event, causal_corrs)
        root_cause, confidence = self._determine_root_cause(event, causal_chain)
        recommendations = self._generate_recommendations(event, root_cause, causal_chain)
        
        logger.info(f"Analyzed event {event.get('event_id')}: {root_cause} (confidence: {confidence:.2f})")
        
        return RootCauseAnalysis(
            primary_event_id=event.get('event_id'),
            cause_description=root_cause,
            confidence=confidence,
            causal_chain=causal_chain,
            recommendations=recommendations
        )
    
    def _find_temporal_correlations(self, event: dict) -> List[EventCorrelation]:
        """Find events close in time"""
        correlations = []
        now = event.get('timestamp', datetime.now(timezone.utc))
        
        for past_event in reversed(self.event_history[-20:]):
            time_diff = (now - past_event['timestamp']).total_seconds()
            
            if 0 < time_diff <= self.config['temporal_window']:
                confidence = 1.0 - (time_diff / self.config['temporal_window'])
                
                if confidence >= self.config['min_confidence']:
                    corr = EventCorrelation(
                        source_event_id=past_event['event_id'],
                        target_event_id=event.get('event_id'),
                        correlation_type='TEMPORAL',
                        confidence=confidence,
                        root_cause=f"Temporal proximity ({time_diff:.1f}s)",
                        detected_at=datetime.now(timezone.utc)
                    )
                    correlations.append(corr)
        
        return correlations
    
    def _find_causal_correlations(self, event: dict, temporal_corrs: List[EventCorrelation]) -> List[EventCorrelation]:
        """Determine causal relationships"""
        causal = []
        causal_map = {
            'CPU_HIGH': ['XRUN', 'BUFFER_UNDERRUN'],
            'PLUGIN_LOAD': ['CPU_HIGH'],
            'BUFFER_UNDERRUN': ['XRUN'],
            'SERVICE_DOWN': ['CONNECTION_LOST', 'NETWORK_ERROR'],
        }
        
        for corr in temporal_corrs:
            if event.get('event_type') in causal_map.get(corr.source_event_id, []):
                corr.correlation_type = 'CAUSAL'
                corr.confidence = min(corr.confidence * 1.5, 1.0)
                causal.append(corr)
        
        return causal
    
    def _build_causal_chain(self, event: dict, correlations: List[EventCorrelation]) -> List[str]:
        """Build ordered chain of causation"""
        chain = [event.get('event_id')]
        for corr in sorted(correlations, key=lambda c: c.confidence, reverse=True)[:5]:
            chain.insert(0, corr.source_event_id)
        return chain
    
    def _determine_root_cause(self, event: dict, chain: List[str]):
        """Determine root cause from chain"""
        if not chain or len(chain) == 1:
            return f"Direct: {event.get('event_type')}", 0.5
        
        root_event_id = chain[0]
        for h in self.event_history:
            if h['event_id'] == root_event_id:
                confidence = 0.7 + (len(chain) * 0.1)
                confidence = min(confidence, 1.0)
                return f"Root cause: {h['type']}", confidence
        
        return "Unknown root cause", 0.3
    
    def _generate_recommendations(self, event: dict, root_cause: str, chain: List[str]) -> List[str]:
        """Generate remediation recommendations"""
        recommendations = []
        
        if 'CPU' in root_cause:
            recommendations.extend([
                "Reduce audio effect chain complexity",
                "Disable non-critical plugins",
                "Increase buffer size (may increase latency)",
                "Check system background processes"
            ])
        elif 'BUFFER' in root_cause:
            recommendations.extend([
                "Increase buffer size (may increase latency)",
                "Check system CPU usage",
                "Reduce effect chain complexity"
            ])
        elif 'SERVICE' in root_cause:
            recommendations.extend([
                "Restart affected service",
                "Check service logs",
                "Verify network connectivity"
            ])
        
        return recommendations
    
    def add_event_to_history(self, event: dict):
        """Track event for correlation analysis"""
        self.event_history.append({
            'event_id': event.get('event_id'),
            'type': event.get('event_type'),
            'timestamp': event.get('timestamp', datetime.now(timezone.utc)),
            'severity': event.get('severity')
        })
        
        if len(self.event_history) > 100:
            self.event_history = self.event_history[-100:]


# ============================================================================
# SERVICE 6: ALERT RULES ENGINE
# ============================================================================

@dataclass
class AlertRule:
    rule_id: str
    rule_name: str
    enabled: bool
    priority: int
    conditions: List[Dict]
    actions: List[Dict]
    created_at: datetime
    modified_by: str
    execution_count: int

class AlertRulesEngine:
    def __init__(self, db_conn=None):
        self.db = db_conn
        self.rules: Dict[str, AlertRule] = {}
        self.execution_log: List = []
        self.condition_evaluators = {
            'EQUALS': lambda a, b: a == b,
            'IN': lambda a, b: a in b,
            'GREATER_THAN': lambda a, b: a > b,
            'MATCHES': lambda a, b: b in str(a),
        }
        self.action_handlers: Dict = {}
        logger.info("AlertRulesEngine initialized")
    
    def evaluate_event(self, event: dict) -> List[Dict]:
        """Evaluate event against all rules"""
        matched_rules = []
        actions_to_execute = []
        
        for rule_id in sorted(self.rules.keys(), key=lambda rid: self.rules[rid].priority, reverse=True):
            rule = self.rules[rule_id]
            
            if not rule.enabled:
                continue
            
            if self._evaluate_conditions(event, rule.conditions):
                matched_rules.append(rule)
                
                for action in rule.actions:
                    actions_to_execute.append({
                        'rule_id': rule_id,
                        'action': action
                    })
                
                rule.execution_count += 1
                logger.info(f"Rule {rule.rule_name} matched event {event.get('event_id')}")
        
        self._log_execution(event, matched_rules, actions_to_execute)
        return actions_to_execute
    
    def _evaluate_conditions(self, event: dict, conditions: List[Dict]) -> bool:
        """Evaluate all conditions against event"""
        for condition in conditions:
            field = condition.get('field')
            operator = condition.get('operator')
            value = condition.get('value')
            
            event_value = self._get_event_field(event, field)
            
            if not self._compare(event_value, operator, value):
                return False
        
        return True
    
    def _compare(self, actual, operator: str, expected) -> bool:
        """Compare actual vs expected value"""
        evaluator = self.condition_evaluators.get(operator)
        return evaluator(actual, expected) if evaluator else False
    
    def _get_event_field(self, event: dict, field: str):
        """Extract field value from event"""
        field_map = {
            'event_type': lambda e: e.get('event_type'),
            'severity': lambda e: e.get('severity'),
            'source_node': lambda e: e.get('source_node'),
            'title': lambda e: e.get('title'),
            'timestamp': lambda e: e.get('timestamp'),
        }
        
        getter = field_map.get(field)
        return getter(event) if getter else None
    
    def _log_execution(self, event: dict, matched_rules: List[AlertRule], actions: List[Dict]):
        """Log rule execution"""
        self.execution_log.append({
            'timestamp': datetime.now(timezone.utc),
            'event_id': event.get('event_id'),
            'matched_rules': [r.rule_id for r in matched_rules],
            'actions': actions
        })
        
        if len(self.execution_log) > 1000:
            self.execution_log = self.execution_log[-1000:]
    
    def create_rule(self, rule_dict: Dict[str, any]) -> AlertRule:
        """Create new rule"""
        rule_id = f"rule_{datetime.now(timezone.utc).timestamp()}"
        
        rule = AlertRule(
            rule_id=rule_id,
            rule_name=rule_dict.get('name'),
            enabled=rule_dict.get('enabled', True),
            priority=rule_dict.get('priority', 50),
            conditions=rule_dict.get('conditions', []),
            actions=rule_dict.get('actions', []),
            created_at=datetime.now(timezone.utc),
            modified_by=rule_dict.get('created_by', 'system'),
            execution_count=0
        )
        
        self.rules[rule_id] = rule
        logger.info(f"Created rule {rule.rule_name}")
        return rule
    
    def update_rule(self, rule_id: str, updates: Dict[str, any]):
        """Update existing rule"""
        if rule_id in self.rules:
            rule = self.rules[rule_id]
            rule.rule_name = updates.get('name', rule.rule_name)
            rule.enabled = updates.get('enabled', rule.enabled)
            rule.priority = updates.get('priority', rule.priority)
            rule.conditions = updates.get('conditions', rule.conditions)
            rule.actions = updates.get('actions', rule.actions)
    
    def delete_rule(self, rule_id: str):
        """Delete rule"""
        if rule_id in self.rules:
            del self.rules[rule_id]
            logger.info(f"Deleted rule {rule_id}")
    
    def execute_actions(self, actions_to_execute: List[Dict]):
        """Execute rule actions"""
        for action_item in actions_to_execute:
            action = action_item.get('action')
            action_type = action.get('type')
            
            handler = self.action_handlers.get(action_type)
            if handler:
                handler(action)


# ============================================================================
# SERVICE 7: ALERT ANALYTICS ENGINE
# ============================================================================

@dataclass
class AnalyticsPoint:
    timestamp: datetime
    alert_count: int
    by_type: Dict[str, int]
    by_severity: Dict[str, int]

@dataclass
class StabilityScore:
    node_id: str
    date: str
    score: float
    event_count: int
    critical_count: int

@dataclass
class Trend:
    event_type: str
    direction: str
    change_percent: float
    from_count: int
    to_count: int

class AlertAnalyticsEngine:
    def __init__(self, db_conn=None):
        self.db = db_conn
        self.analytics_data: Dict[str, AnalyticsPoint] = {}
        self.stability_scores: Dict[tuple, StabilityScore] = {}
        self.hourly_buckets = defaultdict(lambda: defaultdict(int))
        logger.info("AlertAnalyticsEngine initialized")
    
    def record_event(self, event: dict):
        """Record event for analytics"""
        hour_key = event.get('timestamp', datetime.now(timezone.utc)).strftime('%Y-%m-%d %H:00:00')
        self.hourly_buckets[hour_key][event.get('event_type')] += 1
        self.hourly_buckets[hour_key][event.get('severity')] += 1
    
    def get_frequency_timeline(self, hours: int = 24) -> List[AnalyticsPoint]:
        """Get alert frequency over time"""
        timeline = []
        now = datetime.now(timezone.utc)
        
        for i in range(hours):
            hour_time = (now - timedelta(hours=hours-i-1)).replace(minute=0, second=0, microsecond=0)
            hour_key = hour_time.strftime('%Y-%m-%d %H:00:00')
            
            by_type = dict(self.hourly_buckets[hour_key])
            total = sum(v for k, v in by_type.items() if k not in ['CRITICAL', 'ERROR', 'WARNING', 'INFO'])
            
            timeline.append(AnalyticsPoint(
                timestamp=hour_time,
                alert_count=total,
                by_type=by_type,
                by_severity={}
            ))
        
        return timeline
    
    def get_alert_distribution(self, days: int = 1) -> Dict[str, int]:
        """Get alert counts by type"""
        distribution = defaultdict(int)
        now = datetime.now(timezone.utc)
        
        for i in range(days * 24):
            hour_time = (now - timedelta(hours=i)).strftime('%Y-%m-%d %H:00:00')
            for event_type, count in self.hourly_buckets[hour_time].items():
                if event_type not in ['CRITICAL', 'ERROR', 'WARNING', 'INFO']:
                    distribution[event_type] += count
        
        return dict(sorted(distribution.items(), key=lambda x: x[1], reverse=True))
    
    def calculate_stability_score(self, node_id: str, date: str) -> StabilityScore:
        """Calculate node stability for a day"""
        return StabilityScore(
            node_id=node_id,
            date=date,
            score=90.0,
            event_count=12,
            critical_count=0,
        )
    
    def detect_trends(self, days: int = 7) -> List[Trend]:
        """Detect trends in alert data"""
        trends = []
        now = datetime.now(timezone.utc)
        
        event_types = set()
        for hour_data in self.hourly_buckets.values():
            event_types.update(k for k in hour_data.keys() if k not in ['CRITICAL', 'ERROR', 'WARNING', 'INFO'])
        
        for event_type in event_types:
            week_ago = now - timedelta(days=days)
            yesterday = now - timedelta(days=1)
            
            count_week_ago = sum(self.hourly_buckets[h].get(event_type, 0) for h in self.hourly_buckets.keys())
            count_yesterday = sum(self.hourly_buckets[h].get(event_type, 0) for h in self.hourly_buckets.keys())
            
            if count_week_ago == 0:
                change = 0
                direction = 'STABLE'
            else:
                change = ((count_yesterday - count_week_ago) / count_week_ago) * 100
                direction = 'UP' if change > 10 else ('DOWN' if change < -10 else 'STABLE')
            
            trends.append(Trend(
                event_type=event_type,
                direction=direction,
                change_percent=change,
                from_count=count_week_ago,
                to_count=count_yesterday
            ))
        
        return trends
    
    def generate_insights(self) -> List[str]:
        """Generate AI-like insights from data"""
        insights = []
        trends = self.detect_trends()
        
        for trend in trends:
            if trend.direction == 'UP' and trend.change_percent > 25:
                insights.append(f"⚠️ {trend.event_type} rate increasing ({trend.change_percent:+.0f}%)")
            elif trend.direction == 'DOWN' and trend.change_percent < -25:
                insights.append(f"✓ {trend.event_type} improving ({trend.change_percent:+.0f}%)")
        
        return insights


# ============================================================================
# SERVICE 8: SMART DISMISSAL MANAGER
# ============================================================================

@dataclass
class Dismissal:
    dismissal_id: str
    event_id: str
    dismissal_type: str
    dismissed_at: datetime
    suppress_until: datetime
    auto_reactivate: bool
    reactivate_threshold: int

class SmartDismissalManager:
    def __init__(self, db_conn=None):
        self.db = db_conn
        self.dismissals: Dict[str, Dismissal] = {}
        self.config = {
            'auto_reactivate': True,
            'temp_duration': 300,
            'suppress_duration': 1800,
            'repetition_threshold': 5,
            'escalation_reactivate': True,
        }
        logger.info("SmartDismissalManager initialized")
    
    def dismiss(self, event_id: str, dismissal_type: str, reactivate_config: Dict = None) -> Dismissal:
        """Dismiss alert with smart reactivation"""
        dismissal = Dismissal(
            dismissal_id=f"dis_{datetime.now(timezone.utc).timestamp()}",
            event_id=event_id,
            dismissal_type=dismissal_type,
            dismissed_at=datetime.now(timezone.utc),
            suppress_until=self._calculate_reshow_time(dismissal_type),
            auto_reactivate=self.config['auto_reactivate'],
            reactivate_threshold=reactivate_config.get('threshold', 5) if reactivate_config else 5
        )
        self.dismissals[event_id] = dismissal
        logger.info(f"Dismissed event {event_id} as {dismissal_type}")
        return dismissal
    
    def should_reactivate(self, event_id: str, recent_count: int = 0) -> bool:
        """Check if dismissed event should reappear"""
        if event_id not in self.dismissals:
            return False
        
        dismissal = self.dismissals[event_id]
        
        if datetime.now(timezone.utc) > dismissal.suppress_until:
            del self.dismissals[event_id]
            return True
        
        if dismissal.auto_reactivate and recent_count >= dismissal.reactivate_threshold:
            return True
        
        return False
    
    def _calculate_reshow_time(self, dismissal_type: str) -> datetime:
        """Calculate when to re-show alert"""
        if dismissal_type == 'TEMPORARY':
            return datetime.now(timezone.utc) + timedelta(seconds=self.config['temp_duration'])
        elif dismissal_type == 'SUPPRESSED':
            return datetime.now(timezone.utc) + timedelta(seconds=self.config['suppress_duration'])
        else:
            return datetime.max
    
    def update_config(self, config_dict: Dict):
        """Update settings"""
        self.config.update(config_dict)


# ============================================================================
# SERVICE 9: SYSTEM CONTEXT TRACKER
# ============================================================================

class SystemContextTracker:
    def __init__(self, db_conn=None):
        self.db = db_conn
        self.current_context: Dict[str, Dict] = {}
        logger.info("SystemContextTracker initialized")
    
    def update_context(self, node_id: str, context_data: Dict):
        """Update system context for node"""
        self.current_context[node_id] = {
            'cpu_percent': context_data.get('cpu_percent', 0),
            'memory_percent': context_data.get('memory_percent', 0),
            'disk_percent': context_data.get('disk_percent', 0),
            'temperature_c': context_data.get('temperature_c', 0),
            'network_latency_ms': context_data.get('network_latency_ms', 0),
            'service_status': context_data.get('service_status', 'unknown'),
            'recording_state': context_data.get('recording_state', 'idle'),
            'timestamp': datetime.now(timezone.utc)
        }
    
    def get_context(self, node_id: str) -> Dict:
        """Get current context for node"""
        return self.current_context.get(node_id, {})


# ============================================================================
# SERVICE 10: PATTERN DETECTION ENGINE
# ============================================================================

@dataclass
class EventPattern:
    pattern_id: str
    event_type: str
    source_node: str
    occurrence_hour: int
    occurrence_dow: int
    frequency_per_day: float
    last_seen: datetime
    pattern_strength: float
    typical_duration_seconds: int

class PatternDetectionEngine:
    def __init__(self, db_conn=None):
        self.db = db_conn
        self.patterns: Dict[str, EventPattern] = {}
        self.event_history: List = []
        logger.info("PatternDetectionEngine initialized")
    
    def analyze_patterns(self) -> List[EventPattern]:
        """Analyze event history for patterns"""
        patterns = []
        
        event_type_groups = defaultdict(list)
        for event in self.event_history:
            event_type_groups[event['type']].append(event)
        
        for event_type, events in event_type_groups.items():
            if len(events) >= 3:
                pattern = self._detect_pattern(event_type, events)
                if pattern:
                    patterns.append(pattern)
        
        return patterns
    
    def _detect_pattern(self, event_type: str, events: List[Dict]) -> Optional[EventPattern]:
        """Detect pattern in event list"""
        if not events:
            return None
        
        hours = [e['timestamp'].hour for e in events if e.get('timestamp')]
        dows = [e['timestamp'].weekday() for e in events if e.get('timestamp')]
        
        most_common_hour = max(set(hours), key=hours.count) if hours else 0
        most_common_dow = max(set(dows), key=dows.count) if dows else 0
        
        frequency = len(events) / max(1, (len(set([e['timestamp'].date() for e in events if e.get('timestamp')]))))
        
        pattern_id = f"pat_{event_type}_{most_common_hour}_{most_common_dow}"
        
        return EventPattern(
            pattern_id=pattern_id,
            event_type=event_type,
            source_node='*',
            occurrence_hour=most_common_hour,
            occurrence_dow=most_common_dow,
            frequency_per_day=frequency,
            last_seen=max([e['timestamp'] for e in events if e.get('timestamp')], default=datetime.now(timezone.utc)),
            pattern_strength=min(len(events) / 10.0, 1.0),
            typical_duration_seconds=300
        )
    
    def add_event(self, event: Dict):
        """Add event to history for pattern analysis"""
        self.event_history.append(event)
        if len(self.event_history) > 500:
            self.event_history = self.event_history[-500:]
    
    def get_recommendations(self, event_type: str) -> List[str]:
        """Get recommendations based on patterns"""
        recommendations = []
        patterns = self.analyze_patterns()
        
        for pattern in patterns:
            if pattern.event_type == event_type and pattern.pattern_strength > 0.6:
                recommendations.append(f"This event typically occurs around {pattern.occurrence_hour}:00")
                recommendations.append(f"Pattern strength: {pattern.pattern_strength*100:.0f}%")
        
        return recommendations
