"""
Predictive Analytics Extension
==============================
Extension to analytics_system.py for predictive failure detection and health scoring.
"""

import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
import time

logger = logging.getLogger(__name__)


class PredictiveAnalytics:
    """Predictive analytics and failure forecasting."""
    
    def __init__(self, analytics_system: Any):
        """
        Initialize predictive analytics.
        
        Args:
            analytics_system: Reference to AdvancedAnalytics instance
        """
        self.analytics = analytics_system
        self._failure_history: List[Dict[str, Any]] = []
        self._health_score = 100.0
        self._predictions: Dict[str, Dict[str, Any]] = {}
    
    def calculate_health_score(self) -> float:
        """
        Calculate overall system health score (0-100).
        
        Returns:
            Health score from 0 (critical) to 100 (perfect)
        """
        if not self.analytics._snapshots:
            return 100.0
        
        stats = self.analytics.get_statistics(seconds_back=3600)
        if not stats:
            return 100.0
        
        score = 100.0
        
        # CPU impact
        cpu_avg = stats.get("cpu", {}).get("average", 0)
        if cpu_avg > 80:
            score -= (cpu_avg - 80) * 0.8
        elif cpu_avg > 60:
            score -= (cpu_avg - 60) * 0.3
        
        # RAM impact
        ram_avg = stats.get("ram", {}).get("average", 0)
        if ram_avg > 80:
            score -= (ram_avg - 80) * 0.8
        elif ram_avg > 60:
            score -= (ram_avg - 60) * 0.3
        
        # Latency impact
        latency_avg = stats.get("latency", {}).get("average", 0)
        if latency_avg > 10:
            score -= min((latency_avg - 10) * 2, 15)
        
        # Error impact
        error_count = self.analytics._snapshots[-1].active_plugins if hasattr(self.analytics._snapshots[-1], 'active_plugins') else 0
        if error_count > 20:
            score -= min((error_count - 20) * 0.5, 20)
        
        self._health_score = max(0, min(100, score))
        return self._health_score
    
    def predict_failures(self, lookahead_minutes: int = 60) -> List[Dict[str, Any]]:
        """
        Predict potential failures based on trends.
        
        Args:
            lookahead_minutes: How far ahead to predict
            
        Returns:
            List of predicted failures with confidence scores
        """
        predictions = []
        
        # Analyze trends
        cpu_trend, cpu_change = self.analytics.get_trend("cpu", seconds_back=1800)
        ram_trend, ram_change = self.analytics.get_trend("ram", seconds_back=1800)
        latency_trend, latency_change = self.analytics.get_trend("latency", seconds_back=1800)
        
        # CPU prediction
        if cpu_trend == "increasing" and cpu_change > 10:
            # Extrapolate
            stats = self.analytics.get_statistics(3600)
            current_cpu = stats.get("cpu", {}).get("current", 0)
            rate = cpu_change / 30  # Per minute
            predicted_cpu = current_cpu + (rate * lookahead_minutes)
            
            if predicted_cpu > 90:
                predictions.append({
                    "type": "CPU Overload",
                    "confidence": min(0.95, 0.5 + (predicted_cpu - 90) / 100),
                    "estimated_time_minutes": int((90 - current_cpu) / rate) if rate > 0 else None,
                    "predicted_value": predicted_cpu,
                    "recommended_action": "Reduce chain complexity or restart services"
                })
        
        # RAM prediction
        if ram_trend == "increasing" and ram_change > 10:
            stats = self.analytics.get_statistics(3600)
            current_ram = stats.get("ram", {}).get("current", 0)
            rate = ram_change / 30
            predicted_ram = current_ram + (rate * lookahead_minutes)
            
            if predicted_ram > 95:
                predictions.append({
                    "type": "Memory Exhaustion",
                    "confidence": min(0.95, 0.5 + (predicted_ram - 95) / 100),
                    "estimated_time_minutes": int((95 - current_ram) / rate) if rate > 0 else None,
                    "predicted_value": predicted_ram,
                    "recommended_action": "Clear caches or restart application"
                })
        
        # Latency prediction
        if latency_trend == "increasing" and latency_change > 15:
            stats = self.analytics.get_statistics(3600)
            current_latency = stats.get("latency", {}).get("current", 0)
            rate = latency_change / 30
            predicted_latency = current_latency + (rate * lookahead_minutes)
            
            if predicted_latency > 20:
                predictions.append({
                    "type": "Network Degradation",
                    "confidence": 0.7,
                    "estimated_time_minutes": int((20 - current_latency) / rate) if rate > 0 else None,
                    "predicted_value": predicted_latency,
                    "recommended_action": "Check network connection and API server"
                })
        
        self._predictions = {p["type"]: p for p in predictions}
        return predictions
    
    def detect_degradation_trends(self) -> Dict[str, Dict[str, Any]]:
        """
        Detect performance degradation trends.
        
        Returns:
            Dictionary of degradation trends by component
        """
        trends = {}
        
        # Short-term (last hour)
        stats_1h = self.analytics.get_statistics(seconds_back=3600)
        stats_24h = self.analytics.get_statistics(seconds_back=86400)
        
        if stats_1h and stats_24h:
            for metric in ["cpu", "ram", "latency"]:
                if metric in stats_1h and metric in stats_24h:
                    current_avg = stats_1h[metric].get("average", 0)
                    past_avg = stats_24h[metric].get("average", 0)
                    
                    if past_avg > 0:
                        change_percent = ((current_avg - past_avg) / past_avg) * 100
                    else:
                        change_percent = 0
                    
                    if abs(change_percent) > 10:
                        trends[metric] = {
                            "change_percent": change_percent,
                            "current_avg": current_avg,
                            "past_avg": past_avg,
                            "direction": "increasing" if change_percent > 0 else "decreasing",
                            "severity": "HIGH" if abs(change_percent) > 30 else "MEDIUM"
                        }
        
        return trends
    
    def recommend_preventive_actions(self) -> List[Dict[str, Any]]:
        """
        Recommend preventive maintenance actions.
        
        Returns:
            List of recommended actions prioritized by impact
        """
        recommendations = []
        
        # Check for high memory usage
        stats = self.analytics.get_statistics(3600)
        if stats and stats.get("ram", {}).get("average", 0) > 75:
            recommendations.append({
                "priority": "HIGH",
                "action": "Clear memory buffers",
                "reason": "RAM usage consistently high",
                "estimated_impact": "20-30% reduction",
                "steps": ["Go to System menu", "Select 'Clear Buffers'", "Monitor memory"]
            })
        
        # Check for high CPU
        if stats and stats.get("cpu", {}).get("average", 0) > 70:
            recommendations.append({
                "priority": "HIGH",
                "action": "Optimize chain",
                "reason": "CPU usage trending upward",
                "estimated_impact": "CPU reduction by 15-25%",
                "steps": ["Review active chain", "Remove non-essential plugins", "Test performance"]
            })
        
        # Check for latency issues
        if stats and stats.get("latency", {}).get("average", 0) > 8:
            recommendations.append({
                "priority": "MEDIUM",
                "action": "Check network connection",
                "reason": "Latency above optimal threshold",
                "estimated_impact": "Improved responsiveness",
                "steps": ["Check network status", "Ping API server", "Restart connection if needed"]
            })
        
        # Check degradation trends
        trends = self.detect_degradation_trends()
        for metric, trend_data in trends.items():
            if trend_data["severity"] == "HIGH":
                recommendations.append({
                    "priority": "CRITICAL",
                    "action": f"Address {metric} degradation",
                    "reason": f"{metric.upper()} degraded by {trend_data['change_percent']:.0f}%",
                    "estimated_impact": "System performance recovery",
                    "steps": ["Investigate root cause", "Apply fix", "Monitor recovery"]
                })
        
        return sorted(recommendations, key=lambda x: {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}.get(x["priority"], 3))
    
    def learn_from_failure_history(self) -> Dict[str, Any]:
        """
        Learn patterns from failure history.
        
        Returns:
            Patterns and insights learned from past failures
        """
        if not self._failure_history:
            return {"status": "No failure history available"}
        
        patterns = {}
        
        # Analyze failure types
        failure_types = {}
        for failure in self._failure_history:
            ftype = failure.get("type", "unknown")
            if ftype not in failure_types:
                failure_types[ftype] = []
            failure_types[ftype].append(failure)
        
        # Find common preconditions
        for ftype, failures in failure_types.items():
            if len(failures) > 2:
                # Analyze preconditions
                common_cpu = sum(f.get("cpu_before", 0) for f in failures) / len(failures)
                common_ram = sum(f.get("ram_before", 0) for f in failures) / len(failures)
                
                patterns[ftype] = {
                    "count": len(failures),
                    "average_cpu_before": common_cpu,
                    "average_ram_before": common_ram,
                    "time_between_failures": self._calculate_time_between_failures(failures),
                    "recommended_threshold": {
                        "cpu": int(common_cpu * 0.8),  # 80% of failure condition
                        "ram": int(common_ram * 0.8)
                    }
                }
        
        return {
            "total_failures": len(self._failure_history),
            "patterns": patterns,
            "insights": self._generate_insights(patterns)
        }
    
    def _calculate_time_between_failures(self, failures: List[Dict[str, Any]]) -> float:
        """Calculate average time between failures."""
        if len(failures) < 2:
            return 0
        
        timestamps = sorted([f.get("timestamp", 0) for f in failures])
        intervals = [timestamps[i+1] - timestamps[i] for i in range(len(timestamps)-1)]
        
        return sum(intervals) / len(intervals) / 3600 if intervals else 0  # Convert to hours
    
    def _generate_insights(self, patterns: Dict[str, Any]) -> List[str]:
        """Generate insights from patterns."""
        insights = []
        
        for ftype, data in patterns.items():
            count = data.get("count", 0)
            time_between = data.get("time_between_failures", 0)
            
            if count > 5:
                insights.append(f"Critical: {ftype} occurs frequently ({count} times)")
            
            if time_between > 0 and time_between < 2:
                insights.append(f"Warning: {ftype} occurs every ~{time_between:.1f} hours - likely systemic issue")
            
            insights.append(f"{ftype} typically occurs when CPU > {data['recommended_threshold']['cpu']}%")
        
        return insights
    
    def record_failure(self, failure_type: str, timestamp: float, 
                      cpu: float, ram: float, details: str = "") -> None:
        """Record a failure for learning."""
        self._failure_history.append({
            "type": failure_type,
            "timestamp": timestamp,
            "cpu_before": cpu,
            "ram_before": ram,
            "details": details
        })
        logger.info(f"Recorded failure: {failure_type}")


# Helper function to extend AdvancedAnalytics
def add_predictive_analytics(analytics_system: Any) -> PredictiveAnalytics:
    """Add predictive analytics to analytics system."""
    return PredictiveAnalytics(analytics_system)
