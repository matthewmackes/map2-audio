"""
Diagnostic Dashboard System
===========================
Real-time health monitoring and problem detection for troubleshooting.
"""

import logging
import time
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import asyncio

logger = logging.getLogger(__name__)


class SeverityLevel(Enum):
    """Alert severity levels."""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class SystemAlert:
    """A system alert."""
    id: str
    severity: SeverityLevel
    title: str
    description: str
    component: str
    timestamp: float
    auto_fix_available: bool = False
    quick_fix: Optional[str] = None
    related_metrics: Dict[str, float] = None
    
    def __post_init__(self):
        if self.related_metrics is None:
            self.related_metrics = {}


class DiagnosticDashboard:
    """Real-time health monitoring and anomaly detection."""
    
    def __init__(self):
        """Initialize diagnostic dashboard."""
        self._alerts: List[SystemAlert] = []
        self._health_score = 100.0
        self._thresholds = {
            "cpu": 80,
            "ram": 85,
            "latency": 10,
            "error_rate": 5
        }
        self._component_health: Dict[str, float] = {}
        self._failure_history: List[Dict[str, Any]] = []
        self._last_check = time.time()
    
    def detect_anomalies(self, metrics: Dict[str, float]) -> List[SystemAlert]:
        """
        Detect anomalies in metrics and generate alerts.
        
        Args:
            metrics: Current system metrics
            
        Returns:
            List of detected anomalies as alerts
        """
        new_alerts = []
        
        # Check CPU usage
        if metrics.get("cpu", 0) > self._thresholds["cpu"]:
            alert = SystemAlert(
                id=f"alert_cpu_{int(time.time())}",
                severity=SeverityLevel.WARNING if metrics["cpu"] < 95 else SeverityLevel.CRITICAL,
                title="High CPU Usage",
                description=f"CPU usage is {metrics['cpu']:.1f}% (threshold: {self._thresholds['cpu']}%)",
                component="system",
                timestamp=time.time(),
                auto_fix_available=True,
                quick_fix="Restart non-essential services",
                related_metrics={"cpu": metrics["cpu"]}
            )
            new_alerts.append(alert)
        
        # Check RAM usage
        if metrics.get("ram", 0) > self._thresholds["ram"]:
            alert = SystemAlert(
                id=f"alert_ram_{int(time.time())}",
                severity=SeverityLevel.WARNING if metrics["ram"] < 95 else SeverityLevel.CRITICAL,
                title="High Memory Usage",
                description=f"RAM usage is {metrics['ram']:.1f}% (threshold: {self._thresholds['ram']}%)",
                component="system",
                timestamp=time.time(),
                auto_fix_available=True,
                quick_fix="Clear cache or restart",
                related_metrics={"ram": metrics["ram"]}
            )
            new_alerts.append(alert)
        
        # Check latency
        if metrics.get("latency", 0) > self._thresholds["latency"]:
            alert = SystemAlert(
                id=f"alert_latency_{int(time.time())}",
                severity=SeverityLevel.WARNING,
                title="High Latency Detected",
                description=f"Latency is {metrics['latency']:.1f}ms (threshold: {self._thresholds['latency']}ms)",
                component="network",
                timestamp=time.time(),
                auto_fix_available=False,
                related_metrics={"latency": metrics["latency"]}
            )
            new_alerts.append(alert)
        
        self._alerts.extend(new_alerts)
        return new_alerts
    
    def calculate_health_score(self, metrics: Dict[str, float]) -> float:
        """
        Calculate overall system health score (0-100).
        
        Args:
            metrics: Current system metrics
            
        Returns:
            Health score from 0 (critical) to 100 (perfect)
        """
        score = 100.0
        
        # CPU contribution
        cpu = metrics.get("cpu", 0)
        if cpu > 80:
            score -= (cpu - 80) * 0.5
        
        # RAM contribution
        ram = metrics.get("ram", 0)
        if ram > 80:
            score -= (ram - 80) * 0.5
        
        # Latency contribution
        latency = metrics.get("latency", 0)
        if latency > 10:
            score -= min((latency - 10) * 2, 20)
        
        # Error count contribution
        errors = metrics.get("errors", 0)
        score -= min(errors * 2, 30)
        
        self._health_score = max(0, min(100, score))
        return self._health_score
    
    def get_dependency_graph(self) -> Dict[str, List[str]]:
        """Get system component dependency graph."""
        return {
            "chains": ["plugins", "network"],
            "plugins": ["api", "device"],
            "api": ["network"],
            "device": ["drivers"],
            "drivers": ["system"],
            "network": ["system"],
            "system": []
        }
    
    def identify_root_cause(self, alert: SystemAlert) -> Dict[str, Any]:
        """
        Identify likely root cause of an alert.
        
        Args:
            alert: The alert to analyze
            
        Returns:
            Root cause analysis with probable causes ranked
        """
        probable_causes = []
        
        if alert.component == "system" and "CPU" in alert.title:
            probable_causes = [
                {"cause": "Heavy chain processing", "probability": 0.4, "fix": "Simplify chain"},
                {"cause": "Memory leak in plugins", "probability": 0.3, "fix": "Restart service"},
                {"cause": "Background task overload", "probability": 0.2, "fix": "Check running tasks"},
                {"cause": "Driver issue", "probability": 0.1, "fix": "Update drivers"}
            ]
        elif alert.component == "system" and "Memory" in alert.title:
            probable_causes = [
                {"cause": "Memory leak", "probability": 0.5, "fix": "Restart application"},
                {"cause": "Large buffer accumulation", "probability": 0.3, "fix": "Clear buffers"},
                {"cause": "Too many chains loaded", "probability": 0.2, "fix": "Reduce active chains"}
            ]
        elif alert.component == "network" and "Latency" in alert.title:
            probable_causes = [
                {"cause": "Network congestion", "probability": 0.4, "fix": "Check bandwidth"},
                {"cause": "USB/connection issue", "probability": 0.3, "fix": "Check connection"},
                {"cause": "API server slow", "probability": 0.3, "fix": "Check API status"}
            ]
        
        return {
            "alert_id": alert.id,
            "probable_causes": probable_causes,
            "confidence": sum(c["probability"] for c in probable_causes[:1])
        }
    
    def get_component_health(self, component: str) -> Dict[str, Any]:
        """Get health status of a specific component."""
        return {
            "component": component,
            "health": self._component_health.get(component, 100),
            "status": "healthy" if self._component_health.get(component, 100) > 80 else "degraded",
            "last_check": self._last_check
        }
    
    def get_all_alerts(self, severity: Optional[SeverityLevel] = None) -> List[SystemAlert]:
        """Get all alerts, optionally filtered by severity."""
        if severity:
            return [a for a in self._alerts if a.severity == severity]
        return self._alerts.copy()
    
    def acknowledge_alert(self, alert_id: str) -> bool:
        """Acknowledge an alert."""
        for alert in self._alerts:
            if alert.id == alert_id:
                self._alerts.remove(alert)
                logger.info(f"Acknowledged alert: {alert_id}")
                return True
        return False
    
    def get_dashboard_summary(self) -> Dict[str, Any]:
        """Get complete dashboard summary."""
        critical = [a for a in self._alerts if a.severity == SeverityLevel.CRITICAL]
        warnings = [a for a in self._alerts if a.severity == SeverityLevel.WARNING]
        
        return {
            "health_score": self._health_score,
            "total_alerts": len(self._alerts),
            "critical_alerts": len(critical),
            "warnings": len(warnings),
            "recent_alerts": self._alerts[-5:],
            "components": self._component_health,
            "last_check": self._last_check
        }


# Global instance
diagnostic_dashboard = DiagnosticDashboard()
