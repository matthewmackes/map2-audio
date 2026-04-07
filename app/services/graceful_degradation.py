"""
Graceful Degradation System for MAP2 Audio Platform

Implements feature availability management with:
- Feature dependency tracking
- Automatic fallback strategies
- Core feature prioritization
- Graceful service degradation
- Feature availability levels
- Degradation metrics and analytics
"""

import asyncio
import inspect
import logging
import time
import threading
from typing import Dict, List, Optional, Any, Callable, Coroutine
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime, timedelta, timezone
import json

from app.utils.time import utc_now

logger = logging.getLogger(__name__)


class FeatureLevel(Enum):
    """Feature criticality levels."""
    CORE = 4              # Always must work (critical)
    ESSENTIAL = 3        # Should work (important)
    STANDARD = 2         # Nice to have
    OPTIONAL = 1         # Can degrade


class FeatureStatus(Enum):
    """Feature operational status."""
    AVAILABLE = "available"           # Fully operational
    DEGRADED = "degraded"            # Working with reduced functionality
    LIMITED = "limited"              # Minimal functionality
    UNAVAILABLE = "unavailable"      # Not operational


@dataclass
class Feature:
    """Represents a system feature with dependencies and fallbacks."""
    name: str
    level: FeatureLevel
    status: FeatureStatus = FeatureStatus.AVAILABLE
    
    # Dependencies on other features
    dependencies: List[str] = field(default_factory=list)
    
    # Fallback functions for degradation
    full_handler: Optional[Callable] = None           # Full functionality
    degraded_handler: Optional[Callable] = None       # Reduced functionality
    limited_handler: Optional[Callable] = None        # Minimal functionality
    
    # Health check function
    health_check: Optional[Callable] = None
    
    # Metadata
    created_at: datetime = field(default_factory=utc_now)
    last_check_at: Optional[datetime] = None
    last_error: Optional[str] = None
    last_failure_at: Optional[datetime] = None
    consecutive_failures: int = 0
    
    @property
    def is_operational(self) -> bool:
        """Check if feature is operational."""
        return self.status in (FeatureStatus.AVAILABLE, FeatureStatus.DEGRADED)
    
    @property
    def is_core(self) -> bool:
        """Check if this is a core feature."""
        return self.level == FeatureLevel.CORE


@dataclass
class FeatureMetrics:
    """Metrics for a feature."""
    name: str
    level: FeatureLevel
    status: FeatureStatus
    availability_percentage: float = 0.0
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    degradation_events: int = 0
    recovery_events: int = 0
    uptime_seconds: float = 0.0
    created_at: datetime = field(default_factory=utc_now)
    
    @property
    def success_rate(self) -> float:
        """Success rate percentage."""
        if self.total_requests == 0:
            return 0.0
        return (self.successful_requests / self.total_requests) * 100


class DegradationStrategy:
    """Strategy for graceful degradation."""
    
    def __init__(self, 
                 failure_threshold: int = 3,
                 recovery_timeout_seconds: int = 60):
        """
        Initialize degradation strategy.
        
        Args:
            failure_threshold: Failures before degradation
            recovery_timeout_seconds: Time before recovery attempt
        """
        self.failure_threshold = failure_threshold
        self.recovery_timeout_seconds = recovery_timeout_seconds
    
    def should_degrade(self, consecutive_failures: int) -> bool:
        """Determine if feature should degrade."""
        return consecutive_failures >= self.failure_threshold
    
    def should_attempt_recovery(self, 
                               last_failure_time: Optional[datetime]) -> bool:
        """Determine if recovery should be attempted."""
        if not last_failure_time:
            return True

        normalized_last_failure = (
            last_failure_time.astimezone(timezone.utc)
            if last_failure_time.tzinfo
            else last_failure_time.astimezone().astimezone(timezone.utc)
        )
        elapsed = (utc_now() - normalized_last_failure).total_seconds()
        return elapsed >= self.recovery_timeout_seconds


class FeatureAvailabilityManager:
    """
    Manages system features with graceful degradation.
    
    Ensures core features always work through intelligent fallbacks
    and feature dependencies.
    """
    
    def __init__(self, degradation_strategy: Optional[DegradationStrategy] = None):
        """
        Initialize feature manager.
        
        Args:
            degradation_strategy: Strategy for degradation decisions
        """
        self.features: Dict[str, Feature] = {}
        self.strategy = degradation_strategy or DegradationStrategy()
        self._lock = asyncio.Lock()
        self._state_lock = threading.RLock()
        self._health_check_task: Optional[asyncio.Task] = None
        
        self._request_counts: Dict[str, int] = {}
        self._success_counts: Dict[str, int] = {}
        self._failure_counts: Dict[str, int] = {}
        self._degradation_events: Dict[str, int] = {}
        self._recovery_events: Dict[str, int] = {}
    
    def register_feature(self, feature: Feature) -> None:
        """Register a system feature."""
        with self._state_lock:
            self.features[feature.name] = feature
            self._request_counts[feature.name] = 0
            self._success_counts[feature.name] = 0
            self._failure_counts[feature.name] = 0
            self._degradation_events[feature.name] = 0
            self._recovery_events[feature.name] = 0
        
        logger.info(f"Registered feature: {feature.name} (level: {feature.level.name})")
    
    async def execute_feature(self, 
                             feature_name: str,
                             *args,
                             **kwargs) -> Dict[str, Any]:
        """
        Execute a feature with graceful degradation.
        
        Args:
            feature_name: Name of feature to execute
            *args: Arguments for handler
            **kwargs: Keyword arguments for handler
            
        Returns:
            Result or fallback result
        """
        with self._state_lock:
            feature = self.features.get(feature_name)
        if not feature:
            raise ValueError(f"Unknown feature: {feature_name}")

        with self._state_lock:
            self._request_counts[feature_name] += 1
        
        try:
            # Check dependencies
            if not await self._check_dependencies(feature):
                return await self._execute_with_fallback(
                    feature, "DEGRADED", *args, **kwargs
                )

            if (
                feature.status != FeatureStatus.AVAILABLE
                and not self.strategy.should_attempt_recovery(feature.last_failure_at)
            ):
                fallback_level = (
                    "LIMITED" if feature.status == FeatureStatus.LIMITED else "DEGRADED"
                )
                return await self._execute_with_fallback(
                    feature, fallback_level, *args, **kwargs
                )
            
            # Try full execution
            if feature.full_handler:
                result = await self._execute_handler(
                    feature.full_handler, *args, **kwargs
                )
                await self._mark_success(feature_name)
                return {"status": "success", "data": result}
            
            return {"status": "error", "message": "No handler for feature"}
        
        except Exception as e:
            logger.error(f"Feature {feature_name} failed: {e}")
            await self._mark_failure(feature_name, str(e))
            
            # Try degraded execution
            return await self._execute_with_fallback(
                feature, "DEGRADED", *args, **kwargs
            )
    
    async def _check_dependencies(self, feature: Feature) -> bool:
        """Check if all dependencies are available."""
        for dep_name in feature.dependencies:
            dep = self.features.get(dep_name)
            if not dep or not dep.is_operational:
                logger.warning(
                    f"Feature {feature.name} dependency {dep_name} unavailable"
                )
                return False
        return True
    
    async def _execute_with_fallback(self, 
                                    feature: Feature,
                                    level: str,
                                    *args,
                                    **kwargs) -> Dict[str, Any]:
        """Execute with fallback handler."""
        try:
            if level == "DEGRADED" and feature.degraded_handler:
                feature.status = FeatureStatus.DEGRADED
                self._degradation_events[feature.name] += 1
                
                result = await self._execute_handler(
                    feature.degraded_handler, *args, **kwargs
                )
                return {
                    "status": "degraded",
                    "data": result,
                    "message": "Using degraded functionality"
                }
            
            elif level == "LIMITED" and feature.limited_handler:
                feature.status = FeatureStatus.LIMITED
                
                result = await self._execute_handler(
                    feature.limited_handler, *args, **kwargs
                )
                return {
                    "status": "limited",
                    "data": result,
                    "message": "Using limited functionality"
                }
            
            else:
                feature.status = FeatureStatus.UNAVAILABLE
                return {
                    "status": "unavailable",
                    "message": f"Feature {feature.name} unavailable"
                }
        
        except Exception as e:
            logger.error(f"Fallback execution failed: {e}")
            feature.status = FeatureStatus.UNAVAILABLE
            return {"status": "unavailable", "message": str(e)}
    
    async def _execute_handler(self, 
                              handler: Callable,
                              *args,
                              **kwargs) -> Any:
        """Execute a handler function (sync or async)."""
        if inspect.iscoroutinefunction(handler):
            return await handler(*args, **kwargs)
        else:
            return handler(*args, **kwargs)
    
    async def _mark_success(self, feature_name: str) -> None:
        """Mark feature execution as successful."""
        async with self._lock:
            self._success_counts[feature_name] += 1
            
            feature = self.features[feature_name]
            if feature.consecutive_failures > 0:
                self._recovery_events[feature_name] += 1
                feature.consecutive_failures = 0
                feature.status = FeatureStatus.AVAILABLE
                feature.last_failure_at = None
                logger.info(f"Feature {feature_name} recovered")
    
    async def _mark_failure(self, feature_name: str, error: str) -> None:
        """Mark feature execution as failed."""
        async with self._lock:
            self._failure_counts[feature_name] += 1
            
            feature = self.features[feature_name]
            feature.consecutive_failures += 1
            feature.last_error = error
            feature.last_failure_at = utc_now()
            
            # Check if should degrade
            if self.strategy.should_degrade(feature.consecutive_failures):
                if feature.status == FeatureStatus.AVAILABLE:
                    feature.status = FeatureStatus.DEGRADED
                    self._degradation_events[feature_name] += 1
                    logger.warning(
                        f"Feature {feature_name} degraded after "
                        f"{feature.consecutive_failures} failures"
                    )
    
    async def start_health_checks(self, interval_seconds: int = 30) -> None:
        """Start background health checks."""
        if self._health_check_task is None or self._health_check_task.done():
            self._health_check_task = asyncio.create_task(
                self._health_check_loop(interval_seconds)
            )
            logger.info("Feature health checks started")
    
    async def stop_health_checks(self) -> None:
        """Stop background health checks."""
        if self._health_check_task and not self._health_check_task.done():
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass
            logger.info("Feature health checks stopped")
    
    async def _health_check_loop(self, interval_seconds: int) -> None:
        """Background task for periodic health checks."""
        try:
            while True:
                await asyncio.sleep(interval_seconds)
                await self._perform_health_checks()
        except asyncio.CancelledError:
            pass
    
    async def _perform_health_checks(self) -> None:
        """Check health of all features."""
        for feature in self.features.values():
            if not feature.health_check:
                continue

            if (
                feature.status != FeatureStatus.AVAILABLE
                and not self.strategy.should_attempt_recovery(feature.last_failure_at)
            ):
                feature.last_check_at = utc_now()
                continue
            
            try:
                healthy = await self._execute_handler(feature.health_check)
                
                if healthy:
                    await self._mark_success(feature.name)
                else:
                    await self._mark_failure(feature.name, "Health check failed")
            
            except Exception as e:
                await self._mark_failure(feature.name, str(e))
            
            finally:
                feature.last_check_at = utc_now()
    
    def get_feature_status(self, feature_name: str) -> Optional[FeatureStatus]:
        """Get current status of feature."""
        with self._state_lock:
            feature = self.features.get(feature_name)
        return feature.status if feature else None
    
    def get_feature_is_available(self, feature_name: str) -> bool:
        """Check if feature is available."""
        with self._state_lock:
            feature = self.features.get(feature_name)
        return feature.is_operational if feature else False
    
    def get_system_health(self) -> Dict[str, Any]:
        """Get overall system health."""
        with self._state_lock:
            features = list(self.features.values())

        core_features = [
            f for f in features if f.is_core
        ]
        
        core_available = sum(
            1 for f in core_features if f.is_operational
        )
        
        all_operational = sum(
            1 for f in features if f.is_operational
        )
        
        return {
            "total_features": len(self.features),
            "core_features": len(core_features),
            "core_available": core_available,
            "total_operational": all_operational,
            "system_healthy": core_available == len(core_features),
            "degraded_features": sum(
                1 for f in features
                if f.status == FeatureStatus.DEGRADED
            ),
            "unavailable_features": sum(
                1 for f in features
                if f.status == FeatureStatus.UNAVAILABLE
            )
        }
    
    def get_metrics(self) -> Dict[str, FeatureMetrics]:
        """Get metrics for all features."""
        metrics = {}
        
        with self._state_lock:
            features = list(self.features.items())
            request_counts = dict(self._request_counts)
            success_counts = dict(self._success_counts)
            failure_counts = dict(self._failure_counts)
            degradation_events = dict(self._degradation_events)
            recovery_events = dict(self._recovery_events)

        for name, feature in features:
            total = request_counts[name]
            successful = success_counts[name]
            
            metrics[name] = FeatureMetrics(
                name=name,
                level=feature.level,
                status=feature.status,
                total_requests=total,
                successful_requests=successful,
                failed_requests=failure_counts[name],
                degradation_events=degradation_events[name],
                recovery_events=recovery_events[name],
                availability_percentage=(
                    (successful / total * 100) if total > 0 else 0.0
                ),
                uptime_seconds=(
                    (utc_now() - feature.created_at).total_seconds()
                )
            )
        
        return metrics
    
    async def shutdown(self) -> None:
        """Shutdown feature manager."""
        await self.stop_health_checks()
        logger.info("Feature manager shutdown complete")


# Global feature manager instance
_feature_manager: Optional[FeatureAvailabilityManager] = None
_feature_manager_lock = threading.Lock()


def get_feature_manager() -> FeatureAvailabilityManager:
    """Get global feature manager (singleton)."""
    global _feature_manager
    if _feature_manager is None:
        with _feature_manager_lock:
            if _feature_manager is None:
                _feature_manager = FeatureAvailabilityManager()
    return _feature_manager
