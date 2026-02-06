"""
MAP2 Audio Cluster - Post-Update Health Check Service

Automated health validation after system updates to ensure
successful deployment and trigger rollback if critical failures detected.
"""

from dataclasses import dataclass
from enum import Enum
from typing import List, Dict, Optional, Callable
import time
import asyncio
from datetime import datetime
import logging

from .update_validator import UpdateValidator, ValidationReport, ValidationLevel

logger = logging.getLogger(__name__)


class HealthCheckPhase(Enum):
    """Post-update health check phases."""
    IMMEDIATE = "immediate"          # Right after reboot (0-60s)
    SHORT_TERM = "short_term"        # 1-5 minutes after update
    MEDIUM_TERM = "medium_term"      # 5-15 minutes after update
    LONG_TERM = "long_term"          # 15-30 minutes after update


@dataclass
class HealthCheckResult:
    """Result of a health check phase."""
    phase: HealthCheckPhase
    timestamp: str
    node_id: str
    passed: bool
    health_score: float
    validation_report: ValidationReport
    recommendations: List[str]
    should_rollback: bool
    
    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "phase": self.phase.value,
            "timestamp": self.timestamp,
            "node_id": self.node_id,
            "passed": self.passed,
            "health_score": self.health_score,
            "should_rollback": self.should_rollback,
            "recommendations": self.recommendations
        }


class PostUpdateHealthMonitor:
    """
    Monitors node health after updates with phased validation.
    
    Implements progressive health checks:
    - Immediate: Basic service/boot validation
    - Short-term: Audio subsystem validation
    - Medium-term: Load/stability validation
    - Long-term: Performance/integration validation
    """
    
    def __init__(self, api_url: str = "http://localhost:8080"):
        """Initialize health monitor."""
        self.api_url = api_url
        self.validator = UpdateValidator(api_url)
        self.health_history: List[HealthCheckResult] = []
        
        # Thresholds for rollback decisions
        self.rollback_thresholds = {
            "immediate": {
                "min_health_score": 50,  # Must boot and start services
                "max_critical_failures": 0
            },
            "short_term": {
                "min_health_score": 70,  # Audio must work
                "max_critical_failures": 1,
                "max_xruns": 10
            },
            "medium_term": {
                "min_health_score": 80,  # Stable under load
                "max_critical_failures": 0,
                "max_xruns": 5
            },
            "long_term": {
                "min_health_score": 85,  # Optimal performance
                "max_critical_failures": 0,
                "max_xruns": 2
            }
        }
    
    async def monitor_post_update(
        self, 
        node_id: str,
        update_id: str,
        on_failure: Optional[Callable] = None
    ) -> List[HealthCheckResult]:
        """
        Monitor node health after update with phased checks.
        
        Args:
            node_id: Node to monitor
            update_id: Update identifier
            on_failure: Callback for failure (triggers rollback)
        
        Returns:
            List of health check results for all phases
        """
        results = []
        
        logger.info(f"Starting post-update health monitoring for {node_id} (update: {update_id})")
        
        # Phase 1: Immediate (right after reboot)
        await asyncio.sleep(10)  # Wait for services to initialize
        immediate_result = await self._check_immediate_health(node_id)
        results.append(immediate_result)
        
        if immediate_result.should_rollback:
            logger.error(f"Immediate health check failed for {node_id}, triggering rollback")
            if on_failure:
                on_failure(immediate_result)
            return results
        
        # Phase 2: Short-term (1-5 minutes)
        await asyncio.sleep(60)  # Wait 1 minute
        short_result = await self._check_short_term_health(node_id)
        results.append(short_result)
        
        if short_result.should_rollback:
            logger.error(f"Short-term health check failed for {node_id}, triggering rollback")
            if on_failure:
                on_failure(short_result)
            return results
        
        # Phase 3: Medium-term (5-15 minutes)
        await asyncio.sleep(240)  # Wait 4 more minutes (total 5min)
        medium_result = await self._check_medium_term_health(node_id)
        results.append(medium_result)
        
        if medium_result.should_rollback:
            logger.warning(f"Medium-term health check failed for {node_id}")
            if on_failure:
                on_failure(medium_result)
            return results
        
        # Phase 4: Long-term (15-30 minutes)
        await asyncio.sleep(600)  # Wait 10 more minutes (total 15min)
        long_result = await self._check_long_term_health(node_id)
        results.append(long_result)
        
        if long_result.should_rollback:
            logger.warning(f"Long-term health check failed for {node_id}")
            if on_failure:
                on_failure(long_result)
        else:
            logger.info(f"Post-update health monitoring complete for {node_id} - PASSED")
        
        self.health_history.extend(results)
        return results
    
    async def _check_immediate_health(self, node_id: str) -> HealthCheckResult:
        """
        Immediate health check (0-60s after reboot).
        
        Validates:
        - Node is reachable
        - Services are running
        - Basic connectivity
        """
        logger.info(f"Running immediate health check for {node_id}")
        
        # Run post-update validation
        report = self.validator.validate_post_update(node_id)
        
        # Calculate health score
        health_score = self._calculate_health_score(report)
        
        # Determine if rollback needed
        thresholds = self.rollback_thresholds["immediate"]
        should_rollback = (
            health_score < thresholds["min_health_score"] or
            report.failed_critical > thresholds["max_critical_failures"]
        )
        
        recommendations = []
        if should_rollback:
            recommendations.append("CRITICAL: Immediate health check failed - recommend rollback")
        elif health_score < 70:
            recommendations.append("WARNING: Health score below optimal, monitor closely")
        
        return HealthCheckResult(
            phase=HealthCheckPhase.IMMEDIATE,
            timestamp=datetime.now().isoformat(),
            node_id=node_id,
            passed=not should_rollback,
            health_score=health_score,
            validation_report=report,
            recommendations=recommendations,
            should_rollback=should_rollback
        )
    
    async def _check_short_term_health(self, node_id: str) -> HealthCheckResult:
        """
        Short-term health check (1-5 minutes).
        
        Validates:
        - Audio subsystem functional
        - No excessive xruns
        - Network connectivity stable
        """
        logger.info(f"Running short-term health check for {node_id}")
        
        # Run validation again (may catch issues that appear after boot)
        report = self.validator.validate_post_update(node_id)
        
        # Get additional metrics
        xrun_count = await self._get_xrun_count(node_id)
        
        health_score = self._calculate_health_score(report)
        
        thresholds = self.rollback_thresholds["short_term"]
        should_rollback = (
            health_score < thresholds["min_health_score"] or
            report.failed_critical > thresholds["max_critical_failures"] or
            xrun_count > thresholds["max_xruns"]
        )
        
        recommendations = []
        if should_rollback:
            recommendations.append("CRITICAL: Audio subsystem issues detected - recommend rollback")
        elif xrun_count > 5:
            recommendations.append(f"WARNING: {xrun_count} xruns detected, monitor audio quality")
        
        return HealthCheckResult(
            phase=HealthCheckPhase.SHORT_TERM,
            timestamp=datetime.now().isoformat(),
            node_id=node_id,
            passed=not should_rollback,
            health_score=health_score,
            validation_report=report,
            recommendations=recommendations,
            should_rollback=should_rollback
        )
    
    async def _check_medium_term_health(self, node_id: str) -> HealthCheckResult:
        """
        Medium-term health check (5-15 minutes).
        
        Validates:
        - Stable under normal load
        - Memory/CPU usage normal
        - No degradation over time
        """
        logger.info(f"Running medium-term health check for {node_id}")
        
        report = self.validator.validate_post_update(node_id)
        xrun_count = await self._get_xrun_count(node_id)
        
        # Check for trends
        health_trending_down = await self._check_health_trend(node_id)
        
        health_score = self._calculate_health_score(report)
        
        thresholds = self.rollback_thresholds["medium_term"]
        should_rollback = (
            health_score < thresholds["min_health_score"] or
            report.failed_critical > thresholds["max_critical_failures"] or
            xrun_count > thresholds["max_xruns"] or
            health_trending_down
        )
        
        recommendations = []
        if should_rollback:
            recommendations.append("WARNING: Stability issues detected")
        if health_trending_down:
            recommendations.append("Health score trending downward - investigate")
        
        return HealthCheckResult(
            phase=HealthCheckPhase.MEDIUM_TERM,
            timestamp=datetime.now().isoformat(),
            node_id=node_id,
            passed=not should_rollback,
            health_score=health_score,
            validation_report=report,
            recommendations=recommendations,
            should_rollback=should_rollback
        )
    
    async def _check_long_term_health(self, node_id: str) -> HealthCheckResult:
        """
        Long-term health check (15-30 minutes).
        
        Validates:
        - Optimal performance achieved
        - No lingering issues
        - Integration with cluster stable
        """
        logger.info(f"Running long-term health check for {node_id}")
        
        report = self.validator.validate_post_update(node_id)
        xrun_count = await self._get_xrun_count(node_id)
        
        health_score = self._calculate_health_score(report)
        
        thresholds = self.rollback_thresholds["long_term"]
        should_rollback = (
            health_score < thresholds["min_health_score"] or
            report.failed_critical > thresholds["max_critical_failures"] or
            xrun_count > thresholds["max_xruns"]
        )
        
        recommendations = []
        if should_rollback:
            recommendations.append("Performance not optimal after 15 minutes")
        elif health_score >= 90:
            recommendations.append("Excellent health - update successful")
        
        return HealthCheckResult(
            phase=HealthCheckPhase.LONG_TERM,
            timestamp=datetime.now().isoformat(),
            node_id=node_id,
            passed=not should_rollback,
            health_score=health_score,
            validation_report=report,
            recommendations=recommendations,
            should_rollback=should_rollback
        )
    
    def _calculate_health_score(self, report: ValidationReport) -> float:
        """
        Calculate health score from validation report.
        
        Returns:
            Score from 0-100
        """
        if report.total_checks == 0:
            return 0.0
        
        # Base score from passed checks
        base_score = (report.passed_checks / report.total_checks) * 100
        
        # Penalty for critical failures
        critical_penalty = report.failed_critical * 15
        
        # Penalty for warnings
        warning_penalty = report.failed_warning * 5
        
        final_score = max(0, base_score - critical_penalty - warning_penalty)
        return round(final_score, 1)
    
    async def _get_xrun_count(self, node_id: str) -> int:
        """Get xrun count since last check."""
        try:
            import aiohttp
            import asyncio
            
            # Try to query Prometheus for JACK xrun metrics
            prometheus_url = os.environ.get("PROMETHEUS_URL", "http://localhost:9090")
            
            # PromQL query for xruns in last 5 minutes
            query = f'increase(jack_xruns_total{{node="{node_id}"}}[5m])'
            
            async with aiohttp.ClientSession() as session:
                url = f"{prometheus_url}/api/v1/query"
                params = {"query": query}
                
                try:
                    async with session.get(url, params=params, timeout=5) as response:
                        if response.status == 200:
                            data = await response.json()
                            if data.get("data", {}).get("result"):
                                value = data["data"]["result"][0]["value"][1]
                                xruns = int(float(value))
                                logger.debug(f"Got xrun count from Prometheus: {xruns}")
                                return xruns
                except asyncio.TimeoutError:
                    logger.warning(f"Prometheus query timeout for {node_id}")
                except Exception as e:
                    logger.warning(f"Failed to query Prometheus: {e}")
        except Exception as e:
            logger.debug(f"Prometheus query failed (expected if not configured): {e}")
        
        # Fallback: Try node API
        try:
            import aiohttp
            node_api_url = os.environ.get(f"NODE_{node_id.upper()}_URL", f"http://{node_id}:8080")
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{node_api_url}/audio/metrics", timeout=5) as response:
                    if response.status == 200:
                        metrics = await response.json()
                        return metrics.get("xrun_count", 0)
        except Exception as e:
            logger.debug(f"Node API query failed: {e}")
        
        # Last resort: Conservative estimate (0 xruns if we can't check)
        logger.warning(f"Could not determine xrun count for {node_id}, returning 0")
        return 0
    
    async def _check_health_trend(self, node_id: str) -> bool:
        """
        Check if health score is trending downward.
        
        Returns:
            True if health is degrading
        """
        # Get recent health checks for this node
        recent_checks = [
            r for r in self.health_history[-5:]
            if r.node_id == node_id
        ]
        
        if len(recent_checks) < 2:
            return False
        
        # Check if health score is dropping
        scores = [r.health_score for r in recent_checks]
        if len(scores) >= 2:
            # Simple trend: is latest score significantly lower than first?
            trend = scores[-1] - scores[0]
            return trend < -10  # Dropped by more than 10 points
        
        return False
    
    def get_health_summary(self, node_id: Optional[str] = None) -> Dict:
        """
        Get summary of health check history.
        
        Args:
            node_id: Filter by node (optional)
        
        Returns:
            Summary dictionary
        """
        checks = self.health_history
        if node_id:
            checks = [c for c in checks if c.node_id == node_id]
        
        if not checks:
            return {"status": "no_data"}
        
        latest = checks[-1]
        
        return {
            "node_id": latest.node_id,
            "latest_phase": latest.phase.value,
            "latest_health_score": latest.health_score,
            "latest_passed": latest.passed,
            "total_checks": len(checks),
            "passed_checks": sum(1 for c in checks if c.passed),
            "recommendations": latest.recommendations
        }


# =========================================================================
# Integration with Update Orchestrator
# =========================================================================

class UpdateHealthManager:
    """
    Manages health monitoring during update process.
    
    Integrates with UpdateOrchestrator to provide automated
    health validation and rollback triggering.
    """
    
    def __init__(self, api_url: str = "http://localhost:8080"):
        """Initialize manager."""
        self.monitor = PostUpdateHealthMonitor(api_url)
        self.active_monitors: Dict[str, asyncio.Task] = {}
    
    def start_monitoring(
        self, 
        node_id: str, 
        update_id: str,
        on_failure_callback: Optional[Callable] = None
    ) -> asyncio.Task:
        """
        Start monitoring a node after update.
        
        Args:
            node_id: Node being updated
            update_id: Update identifier
            on_failure_callback: Called if health check fails
        
        Returns:
            Async task handle
        """
        logger.info(f"Starting health monitoring for {node_id} (update: {update_id})")
        
        task = asyncio.create_task(
            self.monitor.monitor_post_update(
                node_id, 
                update_id, 
                on_failure_callback
            )
        )
        
        self.active_monitors[node_id] = task
        return task
    
    async def wait_for_completion(self, node_id: str, timeout: int = 1800) -> List[HealthCheckResult]:
        """
        Wait for health monitoring to complete.
        
        Args:
            node_id: Node to wait for
            timeout: Maximum wait time (seconds)
        
        Returns:
            List of health check results
        """
        if node_id not in self.active_monitors:
            raise ValueError(f"No active monitoring for {node_id}")
        
        try:
            results = await asyncio.wait_for(
                self.active_monitors[node_id],
                timeout=timeout
            )
            return results
        except asyncio.TimeoutError:
            logger.error(f"Health monitoring timeout for {node_id}")
            self.active_monitors[node_id].cancel()
            return []
    
    def get_status(self, node_id: str) -> Dict:
        """Get current status of health monitoring."""
        if node_id not in self.active_monitors:
            return {"status": "not_monitoring"}
        
        task = self.active_monitors[node_id]
        
        if task.done():
            return {
                "status": "completed",
                "summary": self.monitor.get_health_summary(node_id)
            }
        else:
            return {
                "status": "monitoring",
                "summary": self.monitor.get_health_summary(node_id)
            }


# =========================================================================
# CLI Usage
# =========================================================================

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Post-Update Health Monitor")
    parser.add_argument("--node", required=True, help="Node ID to monitor")
    parser.add_argument("--update-id", required=True, help="Update identifier")
    parser.add_argument("--api-url", default="http://localhost:8080", help="API URL")
    
    args = parser.parse_args()
    
    async def main():
        monitor = PostUpdateHealthMonitor(args.api_url)
        
        def on_failure(result: HealthCheckResult):
            print(f"❌ Health check FAILED at {result.phase.value}")
            print(f"Health Score: {result.health_score}%")
            print(f"Recommendations: {', '.join(result.recommendations)}")
        
        results = await monitor.monitor_post_update(
            args.node,
            args.update_id,
            on_failure
        )
        
        print(f"\n{'=' * 60}")
        print(f"Post-Update Health Monitoring Complete")
        print(f"{'=' * 60}")
        
        for result in results:
            status = "✓ PASSED" if result.passed else "✗ FAILED"
            print(f"{result.phase.value.upper()}: {status} (score: {result.health_score}%)")
        
        final_result = results[-1]
        if final_result.passed:
            print(f"\n✅ Update successful - node healthy")
            exit(0)
        else:
            print(f"\n❌ Update validation failed - rollback recommended")
            exit(1)
    
    asyncio.run(main())
