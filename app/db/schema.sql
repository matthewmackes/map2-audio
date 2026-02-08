-- MAP2 Audio LCD Event System - Complete Database Schema
-- Created: February 7, 2026
-- All 10 improvements included

-- ============================================================================
-- TABLE: node_roles
-- Purpose: Store node role assignments (AUDIO, CONTROL, INTERFACE, UTILITY)
-- ============================================================================
CREATE TABLE IF NOT EXISTS node_roles (
    node_id TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'UTILITY-NODE',
    role_assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    auto_detected BOOLEAN DEFAULT 1,
    last_verified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TABLE: event_subscriptions
-- Purpose: Role-based event subscriptions (Improvement 2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_subscriptions (
    node_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    priority REAL NOT NULL DEFAULT 0.5,
    show_all BOOLEAN NOT NULL DEFAULT 0,
    show_critical BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (node_id, event_type),
    FOREIGN KEY (node_id) REFERENCES node_roles(node_id)
);

-- ============================================================================
-- TABLE: lcd_events
-- Purpose: Core event records
-- ============================================================================
CREATE TABLE IF NOT EXISTS lcd_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    source_node TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_node) REFERENCES node_roles(node_id)
);

CREATE INDEX IF NOT EXISTS idx_lcd_events_timestamp ON lcd_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_lcd_events_severity ON lcd_events(severity);
CREATE INDEX IF NOT EXISTS idx_lcd_events_type ON lcd_events(event_type);
CREATE INDEX IF NOT EXISTS idx_lcd_events_source ON lcd_events(source_node);

-- ============================================================================
-- TABLE: alert_priorities
-- Purpose: Alert priority scoring (Improvement 1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS alert_priorities (
    event_id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    base_score REAL NOT NULL DEFAULT 0.5,
    escalation_factor REAL NOT NULL DEFAULT 1.0,
    suppression_factor REAL NOT NULL DEFAULT 1.0,
    context_weight REAL NOT NULL DEFAULT 1.0,
    final_score REAL NOT NULL DEFAULT 0.5,
    reasoning TEXT,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES lcd_events(event_id),
    FOREIGN KEY (node_id) REFERENCES node_roles(node_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_priorities_score ON alert_priorities(final_score DESC, calculated_at DESC);

-- ============================================================================
-- TABLE: alert_groups
-- Purpose: Grouped alerts (Improvement 3)
-- ============================================================================
CREATE TABLE IF NOT EXISTS alert_groups (
    group_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    node_count INT NOT NULL DEFAULT 1,
    event_count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    summary_title TEXT,
    expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alert_groups_active ON alert_groups(last_updated DESC, expires_at);

-- ============================================================================
-- TABLE: group_events
-- Purpose: Mapping of events to groups
-- ============================================================================
CREATE TABLE IF NOT EXISTS group_events (
    group_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, event_id),
    FOREIGN KEY (group_id) REFERENCES alert_groups(group_id),
    FOREIGN KEY (event_id) REFERENCES lcd_events(event_id)
);

-- ============================================================================
-- TABLE: acknowledgments
-- Purpose: Alert acknowledgments and interactions (Improvement 4)
-- ============================================================================
CREATE TABLE IF NOT EXISTS acknowledgments (
    acknowledgment_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    ack_type TEXT NOT NULL,
    ack_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id TEXT,
    notes TEXT,
    reactivate_seconds INT DEFAULT 300,
    reactivate_if_repeated BOOLEAN DEFAULT 1,
    suppress_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES lcd_events(event_id),
    FOREIGN KEY (node_id) REFERENCES node_roles(node_id)
);

CREATE INDEX IF NOT EXISTS idx_acknowledgments_event ON acknowledgments(event_id);
CREATE INDEX IF NOT EXISTS idx_acknowledgments_suppress ON acknowledgments(suppress_until);

-- ============================================================================
-- TABLE: remediation_actions
-- Purpose: Suggested and available remediation actions (Improvement 4)
-- ============================================================================
CREATE TABLE IF NOT EXISTS remediation_actions (
    action_id TEXT PRIMARY KEY,
    event_id TEXT,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    priority INT NOT NULL DEFAULT 5,
    estimated_duration_seconds INT,
    recommended BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES lcd_events(event_id)
);

-- ============================================================================
-- TABLE: event_correlations
-- Purpose: Event relationships and causality (Improvement 5)
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_correlations (
    correlation_id TEXT PRIMARY KEY,
    source_event_id TEXT NOT NULL,
    target_event_id TEXT NOT NULL,
    correlation_type TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    root_cause TEXT,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_event_id) REFERENCES lcd_events(event_id),
    FOREIGN KEY (target_event_id) REFERENCES lcd_events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_correlations_source ON event_correlations(source_event_id);
CREATE INDEX IF NOT EXISTS idx_event_correlations_target ON event_correlations(target_event_id);

-- ============================================================================
-- TABLE: root_causes
-- Purpose: Root cause analysis results (Improvement 5)
-- ============================================================================
CREATE TABLE IF NOT EXISTS root_causes (
    cause_id TEXT PRIMARY KEY,
    primary_event_id TEXT NOT NULL,
    cause_description TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    recommendation TEXT,
    estimated_impact TEXT,
    causal_chain TEXT,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (primary_event_id) REFERENCES lcd_events(event_id)
);

-- ============================================================================
-- TABLE: alert_rules
-- Purpose: Custom alert handling rules (Improvement 6)
-- ============================================================================
CREATE TABLE IF NOT EXISTS alert_rules (
    rule_id TEXT PRIMARY KEY,
    rule_name TEXT NOT NULL UNIQUE,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT 1,
    priority INT NOT NULL DEFAULT 50,
    condition_type TEXT,
    condition_value TEXT,
    condition_json TEXT,
    action_type TEXT,
    action_config TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT DEFAULT 'system',
    execution_count INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled, priority DESC);

-- ============================================================================
-- TABLE: rule_execution_log
-- Purpose: Log rule executions and matches
-- ============================================================================
CREATE TABLE IF NOT EXISTS rule_execution_log (
    log_id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    matched BOOLEAN NOT NULL,
    actions_taken TEXT,
    execution_time_ms INT,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rule_id) REFERENCES alert_rules(rule_id),
    FOREIGN KEY (event_id) REFERENCES lcd_events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_rule_execution_log_rule ON rule_execution_log(rule_id, executed_at DESC);

-- ============================================================================
-- TABLE: alert_analytics
-- Purpose: Aggregated alert analytics (Improvement 7)
-- ============================================================================
CREATE TABLE IF NOT EXISTS alert_analytics (
    analytics_id TEXT PRIMARY KEY,
    time_bucket TEXT NOT NULL,
    node_id TEXT,
    event_type TEXT,
    severity TEXT,
    alert_count INT NOT NULL DEFAULT 0,
    bucket_start TIMESTAMP NOT NULL,
    bucket_end TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alert_analytics_bucket ON alert_analytics(bucket_start DESC, bucket_end DESC);
CREATE INDEX IF NOT EXISTS idx_alert_analytics_node ON alert_analytics(node_id);

-- ============================================================================
-- TABLE: node_stability_scores
-- Purpose: Node health tracking (Improvement 7)
-- ============================================================================
CREATE TABLE IF NOT EXISTS node_stability_scores (
    score_id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    score_date DATE NOT NULL,
    stability_score REAL NOT NULL DEFAULT 95.0,
    event_count INT NOT NULL DEFAULT 0,
    critical_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    warning_count INT NOT NULL DEFAULT 0,
    info_count INT NOT NULL DEFAULT 0,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES node_roles(node_id),
    UNIQUE(node_id, score_date)
);

CREATE INDEX IF NOT EXISTS idx_node_stability_scores_date ON node_stability_scores(score_date DESC);

-- ============================================================================
-- TABLE: alert_trends
-- Purpose: Trend analysis (Improvement 7)
-- ============================================================================
CREATE TABLE IF NOT EXISTS alert_trends (
    trend_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    time_period TEXT NOT NULL,
    trend_direction TEXT NOT NULL,
    change_percent REAL NOT NULL,
    from_count INT NOT NULL,
    to_count INT NOT NULL,
    confidence REAL DEFAULT 0.5,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TABLE: alert_dismissals
-- Purpose: Track dismissed alerts (Improvement 8)
-- ============================================================================
CREATE TABLE IF NOT EXISTS alert_dismissals (
    dismissal_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    dismissal_type TEXT NOT NULL,
    dismissed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dismissed_by TEXT,
    suppress_until TIMESTAMP,
    auto_reactivate BOOLEAN DEFAULT 1,
    reactivate_threshold INT DEFAULT 5,
    reason TEXT,
    FOREIGN KEY (event_id) REFERENCES lcd_events(event_id),
    FOREIGN KEY (node_id) REFERENCES node_roles(node_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_dismissals_suppress ON alert_dismissals(suppress_until);

-- ============================================================================
-- TABLE: event_patterns
-- Purpose: Historical patterns for learning (Improvement 10)
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_patterns (
    pattern_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    source_node TEXT,
    occurrence_hour INT,
    occurrence_dow INT,
    frequency_per_day REAL NOT NULL DEFAULT 0.0,
    last_seen TIMESTAMP,
    pattern_strength REAL DEFAULT 0.5,
    typical_duration_seconds INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TABLE: system_context
-- Purpose: Real-time system health snapshot (Improvement 9)
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_context (
    context_id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cpu_percent REAL,
    memory_percent REAL,
    disk_percent REAL,
    temperature_c REAL,
    network_latency_ms INT,
    service_status TEXT,
    recording_state TEXT,
    FOREIGN KEY (node_id) REFERENCES node_roles(node_id)
);

CREATE INDEX IF NOT EXISTS idx_system_context_timestamp ON system_context(timestamp DESC);

-- ============================================================================
-- TABLE: configuration
-- Purpose: Global and per-feature configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS configuration (
    config_key TEXT PRIMARY KEY,
    config_value TEXT NOT NULL,
    data_type TEXT DEFAULT 'string',
    category TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TABLE: audit_log
-- Purpose: Track all system changes for compliance
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    log_id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    user_id TEXT,
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);

-- ============================================================================
-- Create Views for Common Queries
-- ============================================================================

-- View: Active alerts with priority
CREATE VIEW IF NOT EXISTS v_active_alerts AS
SELECT
    e.event_id,
    e.event_type,
    e.source_node,
    e.severity,
    e.title,
    e.timestamp,
    ap.final_score as priority_score,
    CASE
        WHEN ap.final_score >= 0.8 THEN 'CRITICAL'
        WHEN ap.final_score >= 0.6 THEN 'HIGH'
        WHEN ap.final_score >= 0.3 THEN 'MEDIUM'
        ELSE 'LOW'
    END as priority_level,
    CASE WHEN ag.group_id IS NOT NULL THEN ag.group_id ELSE NULL END as group_id
FROM lcd_events e
LEFT JOIN alert_priorities ap ON e.event_id = ap.event_id
LEFT JOIN group_events ge ON e.event_id = ge.event_id
LEFT JOIN alert_groups ag ON ge.group_id = ag.group_id
WHERE e.expires_at IS NULL OR e.expires_at > CURRENT_TIMESTAMP
ORDER BY ap.final_score DESC, e.timestamp DESC;

-- View: Node health summary
CREATE VIEW IF NOT EXISTS v_node_health_summary AS
SELECT
    nr.node_id,
    nr.role,
    (SELECT COUNT(*) FROM lcd_events WHERE source_node = nr.node_id AND timestamp > datetime('now', '-24 hours')) as events_24h,
    (SELECT COUNT(*) FROM lcd_events WHERE source_node = nr.node_id AND severity = 'CRITICAL' AND timestamp > datetime('now', '-24 hours')) as critical_24h,
    (SELECT stability_score FROM node_stability_scores WHERE node_id = nr.node_id ORDER BY score_date DESC LIMIT 1) as latest_stability,
    (SELECT timestamp FROM system_context WHERE node_id = nr.node_id ORDER BY timestamp DESC LIMIT 1) as last_health_check
FROM node_roles nr;

-- ============================================================================
-- Initialize Default Configuration
-- ============================================================================

INSERT OR IGNORE INTO configuration (config_key, config_value, data_type, category, description) VALUES
('priority_enabled', '1', 'boolean', 'Improvement 1', 'Enable alert prioritization'),
('priority_info_weight', '0.2', 'float', 'Improvement 1', 'Weight for INFO severity'),
('priority_warning_weight', '0.6', 'float', 'Improvement 1', 'Weight for WARNING severity'),
('priority_error_weight', '0.8', 'float', 'Improvement 1', 'Weight for ERROR severity'),
('priority_critical_weight', '1.0', 'float', 'Improvement 1', 'Weight for CRITICAL severity'),
('priority_max_escalation', '2.0', 'float', 'Improvement 1', 'Maximum escalation multiplier'),
('priority_escalation_increment', '0.1', 'float', 'Improvement 1', 'Escalation increment per event'),
('routing_enabled', '1', 'boolean', 'Improvement 2', 'Enable contextual routing'),
('grouping_enabled', '1', 'boolean', 'Improvement 3', 'Enable alert grouping'),
('grouping_window_seconds', '60', 'int', 'Improvement 3', 'Time window for grouping'),
('acknowledgment_enabled', '1', 'boolean', 'Improvement 4', 'Enable acknowledgment'),
('acknowledgment_temp_duration', '300', 'int', 'Improvement 4', 'Temporary acknowledgment duration (seconds)'),
('correlation_enabled', '1', 'boolean', 'Improvement 5', 'Enable correlation analysis'),
('rules_enabled', '1', 'boolean', 'Improvement 6', 'Enable rules engine'),
('analytics_enabled', '1', 'boolean', 'Improvement 7', 'Enable analytics'),
('dismissal_enabled', '1', 'boolean', 'Improvement 8', 'Enable smart dismissal'),
('context_enabled', '1', 'boolean', 'Improvement 9', 'Enable contextual display'),
('pattern_detection_enabled', '1', 'boolean', 'Improvement 10', 'Enable pattern detection');
