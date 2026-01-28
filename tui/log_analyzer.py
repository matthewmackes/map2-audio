"""
Log Analysis System
===================
Advanced log searching, pattern detection, and anomaly identification.
"""

import logging
import re
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


@dataclass
class LogEntry:
    """A single log entry."""
    timestamp: float
    level: str
    component: str
    message: str
    details: Dict[str, Any] = None


@dataclass
class PatternMatch:
    """Detected log pattern."""
    pattern: str
    count: int
    first_seen: float
    last_seen: float
    severity: str
    entries: List[LogEntry]


class LogAnalyzer:
    """Advanced log analysis and pattern detection."""
    
    def __init__(self):
        """Initialize log analyzer."""
        self._logs: List[LogEntry] = []
        self._patterns: Dict[str, PatternMatch] = {}
        self._anomalies: List[Dict[str, Any]] = []
        self._common_errors = {
            "ECONNREFUSED": "Connection refused - API server may be down",
            "ETIMEDOUT": "Connection timeout - network issue or high latency",
            "OOM": "Out of memory - memory leak or insufficient RAM",
            "SEGFAULT": "Segmentation fault - plugin crash or memory issue",
            "ENODEV": "Device not found - audio device disconnected",
            "EPERM": "Permission denied - file access issue",
        }
    
    def search_logs(self, query: str, filters: Optional[Dict[str, Any]] = None) -> List[LogEntry]:
        """
        Search logs with full-text search.
        
        Args:
            query: Search query
            filters: Optional filters (level, component, time_range)
            
        Returns:
            Matching log entries
        """
        results = []
        query_lower = query.lower()
        
        for entry in self._logs:
            # Text match
            if query_lower not in entry.message.lower():
                continue
            
            # Apply filters
            if filters:
                if "level" in filters and entry.level != filters["level"]:
                    continue
                if "component" in filters and entry.component != filters["component"]:
                    continue
                if "time_range" in filters:
                    start, end = filters["time_range"]
                    if not (start <= entry.timestamp <= end):
                        continue
            
            results.append(entry)
        
        logger.debug(f"Log search '{query}' found {len(results)} matches")
        return results
    
    def detect_patterns(self) -> Dict[str, PatternMatch]:
        """
        Detect recurring error patterns in logs.
        
        Returns:
            Dictionary of detected patterns
        """
        patterns = {}
        
        # Group by error type
        error_groups = {}
        for entry in self._logs:
            if entry.level in ["ERROR", "CRITICAL"]:
                # Extract error type
                error_type = self._extract_error_type(entry.message)
                if error_type not in error_groups:
                    error_groups[error_type] = []
                error_groups[error_type].append(entry)
        
        # Create patterns for frequent errors
        for error_type, entries in error_groups.items():
            if len(entries) > 2:  # Pattern if occurs 3+ times
                timestamps = [e.timestamp for e in entries]
                patterns[error_type] = PatternMatch(
                    pattern=error_type,
                    count=len(entries),
                    first_seen=min(timestamps),
                    last_seen=max(timestamps),
                    severity="HIGH" if len(entries) > 10 else "MEDIUM",
                    entries=entries
                )
        
        self._patterns = patterns
        return patterns
    
    def _extract_error_type(self, message: str) -> str:
        """Extract error type from log message."""
        for error_code, description in self._common_errors.items():
            if error_code in message:
                return error_code
        
        # Try to extract common patterns
        if "Error:" in message:
            return message.split("Error:")[1].split("\n")[0].strip()[:50]
        if "Exception:" in message:
            return message.split("Exception:")[1].split("\n")[0].strip()[:50]
        
        return "Unknown"
    
    def correlate_with_metrics(self, error_time: float, 
                              metrics_history: List[Dict[str, float]]) -> Dict[str, Any]:
        """
        Correlate error with system metrics.
        
        Args:
            error_time: Timestamp of error
            metrics_history: Historical metric data
            
        Returns:
            Correlation analysis
        """
        # Find metrics around error time (±60 seconds)
        relevant_metrics = [
            m for m in metrics_history 
            if abs(m.get("timestamp", 0) - error_time) < 60
        ]
        
        if not relevant_metrics:
            return {"correlation": "No metrics available"}
        
        # Analyze correlations
        avg_cpu = sum(m.get("cpu", 0) for m in relevant_metrics) / len(relevant_metrics)
        avg_ram = sum(m.get("ram", 0) for m in relevant_metrics) / len(relevant_metrics)
        avg_latency = sum(m.get("latency", 0) for m in relevant_metrics) / len(relevant_metrics)
        
        correlations = []
        if avg_cpu > 80:
            correlations.append(f"High CPU ({avg_cpu:.0f}%)")
        if avg_ram > 80:
            correlations.append(f"High RAM ({avg_ram:.0f}%)")
        if avg_latency > 10:
            correlations.append(f"High latency ({avg_latency:.1f}ms)")
        
        return {
            "error_time": error_time,
            "correlation": " + ".join(correlations) if correlations else "No correlation",
            "metrics_snapshot": {
                "avg_cpu": avg_cpu,
                "avg_ram": avg_ram,
                "avg_latency": avg_latency
            }
        }
    
    def detect_anomalies(self) -> List[Dict[str, Any]]:
        """
        Detect anomalous log patterns.
        
        Returns:
            List of detected anomalies
        """
        anomalies = []
        
        # Check for sudden increase in errors
        if len(self._logs) > 100:
            recent = self._logs[-50:]
            older = self._logs[-100:-50]
            
            recent_errors = len([l for l in recent if l.level == "ERROR"])
            older_errors = len([l for l in older if l.level == "ERROR"])
            
            if recent_errors > older_errors * 2:
                anomalies.append({
                    "type": "Error rate spike",
                    "severity": "HIGH",
                    "description": f"Error rate doubled ({older_errors} -> {recent_errors} in last 50 logs)",
                    "timestamp": datetime.now().isoformat()
                })
        
        # Check for repeated failures
        patterns = self.detect_patterns()
        for pattern_name, pattern in patterns.items():
            if pattern.count > 20:
                anomalies.append({
                    "type": "Repeated failure pattern",
                    "severity": "CRITICAL",
                    "pattern": pattern_name,
                    "count": pattern.count,
                    "description": f"Error '{pattern_name}' occurred {pattern.count} times"
                })
        
        self._anomalies = anomalies
        return anomalies
    
    def export_diagnostic_bundle(self, time_range: Tuple[float, float] = None) -> Dict[str, Any]:
        """
        Export logs and analysis for debugging.
        
        Args:
            time_range: Optional (start_time, end_time)
            
        Returns:
            Diagnostic bundle with logs, patterns, anomalies
        """
        if time_range:
            start, end = time_range
            logs = [l for l in self._logs if start <= l.timestamp <= end]
        else:
            logs = self._logs
        
        return {
            "export_time": datetime.now().isoformat(),
            "log_count": len(logs),
            "time_range": time_range,
            "logs": [
                {
                    "timestamp": l.timestamp,
                    "level": l.level,
                    "component": l.component,
                    "message": l.message
                }
                for l in logs
            ],
            "patterns": {
                k: {
                    "pattern": v.pattern,
                    "count": v.count,
                    "severity": v.severity
                }
                for k, v in self._patterns.items()
            },
            "anomalies": self._anomalies
        }
    
    def add_log_entry(self, level: str, component: str, message: str, 
                     details: Optional[Dict[str, Any]] = None) -> None:
        """Add a log entry for analysis."""
        entry = LogEntry(
            timestamp=datetime.now().timestamp(),
            level=level,
            component=component,
            message=message,
            details=details or {}
        )
        self._logs.append(entry)
    
    def get_summary(self) -> Dict[str, Any]:
        """Get log analysis summary."""
        error_count = len([l for l in self._logs if l.level in ["ERROR", "CRITICAL"]])
        warning_count = len([l for l in self._logs if l.level == "WARNING"])
        
        return {
            "total_entries": len(self._logs),
            "errors": error_count,
            "warnings": warning_count,
            "patterns_detected": len(self._patterns),
            "anomalies_detected": len(self._anomalies)
        }


# Global instance
log_analyzer = LogAnalyzer()
