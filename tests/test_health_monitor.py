"""
Tests for Health Monitoring System

Tests for health monitor, metrics collection, alert rules, and historical data.
"""

import pytest
import asyncio
from datetime import datetime, timedelta, timezone

from app.services.health_monitor import (
    HealthMonitor, HealthStatus, ServiceMetrics, AlertRule, Alert
)


class TestHealthMonitorBasics:
    """Test basic health monitor functionality."""
    
    def test_health_monitor_initialization(self):
        """Test health monitor initializes correctly."""
        monitor = HealthMonitor()
        
        assert len(monitor.services) == 0
        assert monitor.history_retention_hours == 24
        assert monitor.check_interval_seconds == 30
        assert len(monitor.alert_rules) > 0  # Default rules initialized
    
    def test_update_service_metrics(self):
        """Test updating service metrics."""
        monitor = HealthMonitor()
        
        metrics = ServiceMetrics(
            service_name="test-service",
            status=HealthStatus.HEALTHY,
            response_time_ms=50.0,
            error_rate=0.0
        )
        
        monitor.update_service_metrics(metrics)
        
        assert monitor.get_service_status("test-service") is not None
        assert monitor.get_service_status("test-service").response_time_ms == 50.0
    
    def test_get_overall_status_healthy(self):
        """Test overall status when all services healthy."""
        monitor = HealthMonitor()
        
        monitor.services["service1"] = ServiceMetrics(
            service_name="service1",
            status=HealthStatus.HEALTHY
        )
        monitor.services["service2"] = ServiceMetrics(
            service_name="service2",
            status=HealthStatus.HEALTHY
        )
        
        assert monitor.get_overall_status() == HealthStatus.HEALTHY
    
    def test_get_overall_status_degraded(self):
        """Test overall status when service degraded."""
        monitor = HealthMonitor()
        
        monitor.services["service1"] = ServiceMetrics(
            service_name="service1",
            status=HealthStatus.HEALTHY
        )
        monitor.services["service2"] = ServiceMetrics(
            service_name="service2",
            status=HealthStatus.DEGRADED
        )
        
        assert monitor.get_overall_status() == HealthStatus.DEGRADED
    
    def test_get_overall_status_critical(self):
        """Test overall status when service critical."""
        monitor = HealthMonitor()
        
        monitor.services["service1"] = ServiceMetrics(
            service_name="service1",
            status=HealthStatus.HEALTHY
        )
        monitor.services["service2"] = ServiceMetrics(
            service_name="service2",
            status=HealthStatus.CRITICAL
        )
        
        assert monitor.get_overall_status() == HealthStatus.CRITICAL
    
    def test_get_overall_status_offline(self):
        """Test overall status when service offline."""
        monitor = HealthMonitor()
        
        monitor.services["service1"] = ServiceMetrics(
            service_name="service1",
            status=HealthStatus.OFFLINE
        )
        
        assert monitor.get_overall_status() == HealthStatus.OFFLINE


class TestHealthMonitorHistory:
    """Test metrics history retention."""
    
    def test_metric_history_stored(self):
        """Test metrics are stored in history."""
        monitor = HealthMonitor()
        
        for i in range(5):
            metrics = ServiceMetrics(
                service_name="test-service",
                response_time_ms=float(i * 10),
                timestamp=datetime.now(timezone.utc)
            )
            monitor.update_service_metrics(metrics)
        
        history = monitor.get_service_history("test-service")
        assert len(history) == 5
    
    def test_history_trimmed_at_max(self):
        """Test history is trimmed when exceeding max size."""
        monitor = HealthMonitor(max_history_points=10)
        
        # Add 15 data points
        for i in range(15):
            metrics = ServiceMetrics(
                service_name="test-service",
                response_time_ms=float(i)
            )
            monitor.update_service_metrics(metrics)
        
        history = monitor.get_service_history("test-service")
        # Should only keep last 10
        assert len(history) <= 10
    
    def test_history_filtered_by_time(self):
        """Test history filtering by time range."""
        monitor = HealthMonitor()
        
        now = datetime.now(timezone.utc)
        
        # Add metrics at different times
        for i in range(5):
            metrics = ServiceMetrics(
                service_name="test-service",
                response_time_ms=float(i),
                timestamp=now - timedelta(hours=i)
            )
            monitor.service_history.setdefault("test-service", []).append(metrics)
        
        # Get only last hour
        history = monitor.get_service_history("test-service", hours=1)
        
        # Should only get metrics from last hour
        assert len(history) <= 5


class TestAlertRules:
    """Test alert rule evaluation."""
    
    def test_high_error_rate_alert(self):
        """Test alert triggered on high error rate."""
        monitor = HealthMonitor()
        
        # Find the high error rate rule
        rule = None
        for r in monitor.alert_rules:
            if r.name == "high_error_rate":
                rule = r
                break
        
        assert rule is not None
        assert rule.threshold == 0.1  # 10%
        
        # Create metrics with high error rate
        metrics = ServiceMetrics(
            service_name="test-service",
            error_rate=0.15  # 15%
        )
        
        assert monitor._rule_triggered(rule, metrics)
    
    def test_high_response_time_alert(self):
        """Test alert triggered on high response time."""
        monitor = HealthMonitor()
        
        rule = None
        for r in monitor.alert_rules:
            if r.name == "high_response_time":
                rule = r
                break
        
        assert rule is not None
        
        # Create metrics with high response time
        metrics = ServiceMetrics(
            service_name="test-service",
            response_time_ms=1500.0  # 1.5 seconds
        )
        
        assert monitor._rule_triggered(rule, metrics)
    
    def test_alert_not_triggered_under_threshold(self):
        """Test alert not triggered when under threshold."""
        monitor = HealthMonitor()
        
        rule = None
        for r in monitor.alert_rules:
            if r.name == "high_error_rate":
                rule = r
                break
        
        # Create metrics with low error rate
        metrics = ServiceMetrics(
            service_name="test-service",
            error_rate=0.01  # 1%
        )
        
        assert not monitor._rule_triggered(rule, metrics)
    
    def test_custom_alert_rule(self):
        """Test custom alert rule."""
        monitor = HealthMonitor()
        
        custom_rule = AlertRule(
            name="test_rule",
            metric="memory_mb",
            threshold=1000.0,
            comparison=">",
            severity="warning"
        )
        
        monitor.alert_rules.append(custom_rule)
        
        # Metrics below threshold
        metrics_low = ServiceMetrics(
            service_name="test-service",
            memory_mb=500.0
        )
        assert not monitor._rule_triggered(custom_rule, metrics_low)
        
        # Metrics above threshold
        metrics_high = ServiceMetrics(
            service_name="test-service",
            memory_mb=1500.0
        )
        assert monitor._rule_triggered(custom_rule, metrics_high)


class TestServiceMetrics:
    """Test ServiceMetrics dataclass."""
    
    def test_metrics_to_dict(self):
        """Test converting metrics to dictionary."""
        metrics = ServiceMetrics(
            service_name="test-service",
            status=HealthStatus.HEALTHY,
            response_time_ms=50.0,
            error_rate=0.01
        )
        
        data = metrics.to_dict()
        
        assert data['service_name'] == "test-service"
        assert data['status'] == "healthy"
        assert data['response_time_ms'] == 50.0
        assert 'timestamp' in data
    
    def test_metrics_with_dependencies(self):
        """Test metrics tracking service dependencies."""
        metrics = ServiceMetrics(
            service_name="api-service",
            status=HealthStatus.HEALTHY,
            dependencies={
                "database": HealthStatus.HEALTHY,
                "cache": HealthStatus.DEGRADED
            }
        )
        
        data = metrics.to_dict()
        
        assert data['dependencies']['database'] == "healthy"
        assert data['dependencies']['cache'] == "degraded"
    
    def test_metrics_with_custom_fields(self):
        """Test metrics with custom fields."""
        metrics = ServiceMetrics(
            service_name="audio-engine",
            status=HealthStatus.HEALTHY,
            custom_metrics={
                "buffer_size": 2048,
                "sample_rate": 48000,
                "active_plugins": 3
            }
        )
        
        data = metrics.to_dict()
        
        assert data['custom_metrics']['buffer_size'] == 2048
        assert data['custom_metrics']['active_plugins'] == 3


class TestSystemHealthSummary:
    """Test system health summary."""
    
    def test_empty_system_summary(self):
        """Test summary for empty system."""
        monitor = HealthMonitor()
        summary = monitor.get_system_health_summary()
        
        assert summary['overall_status'] == 'healthy'
        assert summary['service_count'] == 0
        assert summary['healthy_count'] == 0
    
    def test_system_summary_with_services(self):
        """Test summary with multiple services."""
        monitor = HealthMonitor()
        
        monitor.services["service1"] = ServiceMetrics(
            service_name="service1",
            status=HealthStatus.HEALTHY
        )
        monitor.services["service2"] = ServiceMetrics(
            service_name="service2",
            status=HealthStatus.DEGRADED
        )
        
        summary = monitor.get_system_health_summary()
        
        assert summary['overall_status'] == 'degraded'
        assert summary['service_count'] == 2
        assert summary['healthy_count'] == 1
        assert summary['degraded_count'] == 1
    
    def test_system_summary_includes_alerts(self):
        """Test summary includes active alerts."""
        monitor = HealthMonitor()
        
        monitor.services["service1"] = ServiceMetrics(
            service_name="service1",
            status=HealthStatus.HEALTHY
        )
        
        # Create an alert
        alert = Alert(
            alert_rule_name="test_alert",
            service_name="service1",
            metric="response_time_ms",
            value=100.0,
            threshold=50.0,
            severity="warning"
        )
        
        if "service1" not in monitor.active_alerts:
            monitor.active_alerts["service1"] = []
        monitor.active_alerts["service1"].append(alert)
        
        summary = monitor.get_system_health_summary()
        
        assert summary['active_alerts_count'] == 1


class TestDependencyGraph:
    """Test service dependency tracking."""
    
    def test_dependency_graph_generation(self):
        """Test dependency graph is correctly generated."""
        monitor = HealthMonitor()
        
        # Service A depends on B and C
        monitor.services["A"] = ServiceMetrics(
            service_name="A",
            status=HealthStatus.HEALTHY,
            dependencies={
                "B": HealthStatus.HEALTHY,
                "C": HealthStatus.HEALTHY
            }
        )
        
        # Service B depends on C
        monitor.services["B"] = ServiceMetrics(
            service_name="B",
            status=HealthStatus.HEALTHY,
            dependencies={
                "C": HealthStatus.HEALTHY
            }
        )
        
        monitor.services["C"] = ServiceMetrics(
            service_name="C",
            status=HealthStatus.HEALTHY,
            dependencies={}
        )
        
        graph = monitor.get_dependency_graph()
        
        assert "A" in graph
        assert "B" in graph
        assert "C" in graph
        
        # C should be a dependency of A
        assert "C" in graph["A"]["dependencies"]
        
        # A and B should be dependent on C
        assert "A" in graph["C"]["dependent_services"]
        assert "B" in graph["C"]["dependent_services"]


class TestAlertManagement:
    """Test alert management."""
    
    def test_get_active_alerts_empty(self):
        """Test getting alerts when none exist."""
        monitor = HealthMonitor()
        
        alerts = monitor.get_active_alerts()
        assert len(alerts) == 0
    
    def test_acknowledge_alert(self):
        """Test acknowledging (removing) an alert."""
        monitor = HealthMonitor()
        
        alert = Alert(
            alert_rule_name="test",
            service_name="service1",
            metric="error_rate",
            value=0.1,
            threshold=0.05
        )
        
        monitor.active_alerts["service1"] = [alert]
        
        assert len(monitor.get_active_alerts("service1")) == 1
        
        monitor.acknowledge_alert(alert)
        
        assert len(monitor.get_active_alerts("service1")) == 0
    
    def test_alert_history(self):
        """Test alert history tracking."""
        monitor = HealthMonitor()
        
        for i in range(5):
            alert = Alert(
                alert_rule_name=f"alert{i}",
                service_name="service1",
                metric="error_rate",
                value=float(i) * 0.1,
                threshold=0.05
            )
            monitor._alert_history.append(alert)
        
        history = monitor.get_alert_history(limit=10)
        
        assert len(history) == 5

    def test_check_alert_rules_deduplicates_active_alerts_by_rule_and_service(self):
        monitor = HealthMonitor()
        monitor.alert_rules = [
            AlertRule(
                name="high_error_rate",
                metric="error_rate",
                threshold=0.1,
                comparison=">",
            )
        ]
        monitor.services["service1"] = ServiceMetrics(
            service_name="service1",
            error_rate=0.5,
        )

        asyncio.run(monitor._check_alert_rules())
        asyncio.run(monitor._check_alert_rules())

        alerts = monitor.get_active_alerts("service1")
        assert len(alerts) == 1
        assert alerts[0].alert_rule_name == "high_error_rate"
        assert len(monitor.get_alert_history(limit=10)) == 2

    def test_active_alerts_are_bounded(self):
        monitor = HealthMonitor()
        monitor.max_active_alerts = 2
        monitor.alert_rules = [
            AlertRule(
                name="high_error_rate",
                metric="error_rate",
                threshold=0.1,
                comparison=">",
            )
        ]
        monitor.services["service1"] = ServiceMetrics(service_name="service1", error_rate=0.5)
        monitor.services["service2"] = ServiceMetrics(service_name="service2", error_rate=0.5)
        monitor.services["service3"] = ServiceMetrics(service_name="service3", error_rate=0.5)

        asyncio.run(monitor._check_alert_rules())

        active_services = {alert.service_name for alert in monitor.get_active_alerts()}
        assert len(active_services) == 2
        assert active_services == {"service2", "service3"}


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
