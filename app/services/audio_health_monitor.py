"""
Audio Health Monitoring Integration

Integrates audio I/O health metrics with the main health monitoring system:
- XRun alerting
- Audio thread state monitoring
- Signal presence tracking
- Buffer health
- WebSocket notifications for real-time UI updates
"""

import logging
import asyncio
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime
from dataclasses import dataclass
from enum import Enum

from app.services.health_monitor import (
    HealthMonitor, HealthStatus, ServiceMetrics, AlertRule, Alert, get_health_monitor
)
from app.services.audio_io import (
    RealAudioIOManager, AudioHealthMetrics, AudioThreadState, SignalState, XRunEvent
)
from app.utils.singleton import Singleton
from app.utils.time import utc_now

logger = logging.getLogger(__name__)


class AudioAlertType(Enum):
    """Types of audio-specific alerts."""
    XRUN = "xrun"
    HIGH_XRUN_RATE = "high_xrun_rate"
    THREAD_STALL = "thread_stall"
    THREAD_WARNING = "thread_warning"
    SIGNAL_LOST = "signal_lost"
    AUTO_MUTED = "auto_muted"
    BUFFER_LOW = "buffer_low"
    HIGH_LATENCY = "high_latency"


@dataclass
class AudioAlert:
    """Audio-specific alert."""
    alert_type: AudioAlertType
    severity: str  # 'info', 'warning', 'critical'
    message: str
    timestamp: datetime
    details: Dict[str, Any]


class AudioHealthMonitor(Singleton):
    """Monitors audio system health and generates alerts.

    Integrates with the main health monitoring system and provides
    real-time audio-specific health tracking.
    """

    # Alert thresholds
    XRUN_RATE_WARNING = 1.0  # XRuns per minute for warning
    XRUN_RATE_CRITICAL = 5.0  # XRuns per minute for critical
    BUFFER_LOW_THRESHOLD = 25.0  # % buffer fill for warning
    LATENCY_WARNING_MS = 20.0  # Latency threshold for warning

    def __init__(self, audio_manager: Optional[RealAudioIOManager] = None):
        self._audio_manager = audio_manager
        self._health_monitor = get_health_monitor()

        # Alert tracking
        self._recent_alerts: List[AudioAlert] = []
        self._max_alerts = 100
        self._alert_callbacks: List[Callable[[AudioAlert], None]] = []

        # State tracking
        self._last_xrun_count = 0
        self._last_alert_time: Dict[AudioAlertType, float] = {}
        self._alert_cooldown_sec = 5.0  # Minimum time between same alert types

        # Register with health monitor
        self._register_audio_health_check()
        self._add_audio_alert_rules()

    def set_audio_manager(self, audio_manager: RealAudioIOManager) -> None:
        """Set or update the audio manager reference."""
        self._audio_manager = audio_manager

        # Register callbacks with audio manager
        audio_manager.register_xrun_callback(self._on_xrun)
        audio_manager.register_stall_callback(self._on_stall)

    def register_alert_callback(self, callback: Callable[[AudioAlert], None]) -> None:
        """Register callback for audio alerts."""
        self._alert_callbacks.append(callback)

    def _register_audio_health_check(self) -> None:
        """Register audio health check with main health monitor."""

        async def audio_health_check() -> ServiceMetrics:
            """Collect audio health metrics."""
            if not self._audio_manager:
                return ServiceMetrics(
                    service_name="audio",
                    status=HealthStatus.OFFLINE,
                    last_error="Audio manager not initialized"
                )

            health = self._audio_manager.get_health_metrics()
            stats = self._audio_manager.get_stats()

            # Determine status
            status = HealthStatus.HEALTHY

            if health.thread_state == AudioThreadState.STALLED:
                status = HealthStatus.CRITICAL
            elif health.thread_state == AudioThreadState.WARNING:
                status = HealthStatus.DEGRADED
            elif health.xrun_rate_per_minute >= self.XRUN_RATE_CRITICAL:
                status = HealthStatus.CRITICAL
            elif health.xrun_rate_per_minute >= self.XRUN_RATE_WARNING:
                status = HealthStatus.DEGRADED
            elif health.buffer_health_pct < self.BUFFER_LOW_THRESHOLD:
                status = HealthStatus.DEGRADED

            return ServiceMetrics(
                service_name="audio",
                status=status,
                response_time_ms=stats.get('latency_ms', 0.0),
                error_rate=health.xrun_rate_per_minute / 60.0,  # Normalize to 0-1
                custom_metrics={
                    "thread_state": health.thread_state.value,
                    "signal_state": health.signal_state.value,
                    "total_blocks": health.total_blocks,
                    "total_xruns": health.total_xruns,
                    "xrun_rate_per_minute": health.xrun_rate_per_minute,
                    "input_level_db": health.input_level_db,
                    "buffer_health_pct": health.buffer_health_pct,
                    "is_auto_muted": health.is_auto_muted,
                    "sample_rate": stats.get('sample_rate', 0),
                    "block_size": stats.get('block_size', 0),
                    "latency_ms": stats.get('latency_ms', 0.0),
                    "watchdog_enabled": stats.get('watchdog_enabled', False),
                    "rt_priority_set": stats.get('rt_priority_set', False),
                }
            )

        self._health_monitor.register_health_check("audio", audio_health_check)

    def _add_audio_alert_rules(self) -> None:
        """Add audio-specific alert rules to health monitor."""
        # XRun rate warning
        self._health_monitor.alert_rules.append(AlertRule(
            name="audio_xrun_rate_warning",
            metric="xrun_rate_per_minute",
            threshold=self.XRUN_RATE_WARNING,
            comparison=">",
            duration_seconds=30,
            severity="warning"
        ))

        # XRun rate critical
        self._health_monitor.alert_rules.append(AlertRule(
            name="audio_xrun_rate_critical",
            metric="xrun_rate_per_minute",
            threshold=self.XRUN_RATE_CRITICAL,
            comparison=">",
            duration_seconds=10,
            severity="critical"
        ))

        # Buffer low
        self._health_monitor.alert_rules.append(AlertRule(
            name="audio_buffer_low",
            metric="buffer_health_pct",
            threshold=self.BUFFER_LOW_THRESHOLD,
            comparison="<",
            duration_seconds=5,
            severity="warning"
        ))

    def _on_xrun(self, event: XRunEvent) -> None:
        """Handle XRun event from audio manager."""
        self._create_alert(
            AudioAlertType.XRUN,
            "warning",
            f"Audio {event.xrun_type} detected",
            {
                "xrun_type": event.xrun_type,
                "buffer_fill_pct": event.buffer_fill_pct,
                "timestamp": event.timestamp,
            }
        )

        # Check for high rate
        if self._audio_manager:
            health = self._audio_manager.get_health_metrics()
            if health.xrun_rate_per_minute >= self.XRUN_RATE_CRITICAL:
                self._create_alert(
                    AudioAlertType.HIGH_XRUN_RATE,
                    "critical",
                    f"High XRun rate: {health.xrun_rate_per_minute:.1f}/min",
                    {"rate": health.xrun_rate_per_minute}
                )
            elif health.xrun_rate_per_minute >= self.XRUN_RATE_WARNING:
                self._create_alert(
                    AudioAlertType.HIGH_XRUN_RATE,
                    "warning",
                    f"Elevated XRun rate: {health.xrun_rate_per_minute:.1f}/min",
                    {"rate": health.xrun_rate_per_minute}
                )

    def _on_stall(self, health: AudioHealthMetrics) -> None:
        """Handle audio thread stall event."""
        self._create_alert(
            AudioAlertType.THREAD_STALL,
            "critical",
            "Audio thread stall detected! Automatic recovery attempted.",
            {
                "thread_state": health.thread_state.value,
                "total_blocks": health.total_blocks,
                "last_heartbeat": health.watchdog_last_heartbeat,
            }
        )

    def _create_alert(self, alert_type: AudioAlertType, severity: str,
                     message: str, details: Dict[str, Any]) -> None:
        """Create and dispatch an audio alert."""
        # Check cooldown
        now = utc_now().timestamp()
        last_time = self._last_alert_time.get(alert_type, 0)
        if now - last_time < self._alert_cooldown_sec:
            return

        self._last_alert_time[alert_type] = now

        alert = AudioAlert(
            alert_type=alert_type,
            severity=severity,
            message=message,
            timestamp=utc_now(),
            details=details,
        )

        # Store alert
        self._recent_alerts.append(alert)
        if len(self._recent_alerts) > self._max_alerts:
            self._recent_alerts = self._recent_alerts[-self._max_alerts:]

        # Log
        if severity == "critical":
            logger.critical(f"Audio Alert: {message}")
        elif severity == "warning":
            logger.warning(f"Audio Alert: {message}")
        else:
            logger.info(f"Audio Alert: {message}")

        # Notify callbacks
        for callback in self._alert_callbacks:
            try:
                callback(alert)
            except Exception as e:
                logger.error(f"Alert callback error: {e}")

    def check_signal_state(self) -> None:
        """Check signal state and create alerts if needed."""
        if not self._audio_manager:
            return

        health = self._audio_manager.get_health_metrics()

        if health.signal_state == SignalState.ABSENT:
            self._create_alert(
                AudioAlertType.SIGNAL_LOST,
                "info",
                "Input signal lost",
                {"signal_state": health.signal_state.value}
            )

        if health.is_auto_muted:
            self._create_alert(
                AudioAlertType.AUTO_MUTED,
                "info",
                "Output auto-muted due to signal loss",
                {"signal_state": health.signal_state.value}
            )

    def get_recent_alerts(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get recent audio alerts."""
        alerts = self._recent_alerts[-limit:]
        return [
            {
                "type": a.alert_type.value,
                "severity": a.severity,
                "message": a.message,
                "timestamp": a.timestamp.isoformat(),
                "details": a.details,
            }
            for a in alerts
        ]

    def get_audio_health_summary(self) -> Dict[str, Any]:
        """Get comprehensive audio health summary."""
        if not self._audio_manager:
            return {
                "status": "offline",
                "message": "Audio manager not initialized"
            }

        health = self._audio_manager.get_health_metrics()
        stats = self._audio_manager.get_stats()

        # Determine overall status
        if health.thread_state == AudioThreadState.STALLED:
            status = "critical"
            status_message = "Audio thread stalled"
        elif health.thread_state == AudioThreadState.WARNING:
            status = "warning"
            status_message = "Audio thread warning"
        elif health.xrun_rate_per_minute >= self.XRUN_RATE_CRITICAL:
            status = "critical"
            status_message = f"High XRun rate: {health.xrun_rate_per_minute:.1f}/min"
        elif health.xrun_rate_per_minute >= self.XRUN_RATE_WARNING:
            status = "warning"
            status_message = f"Elevated XRun rate: {health.xrun_rate_per_minute:.1f}/min"
        elif health.buffer_health_pct < self.BUFFER_LOW_THRESHOLD:
            status = "warning"
            status_message = f"Low buffer: {health.buffer_health_pct:.1f}%"
        else:
            status = "healthy"
            status_message = "Audio system healthy"

        return {
            "status": status,
            "status_message": status_message,
            "thread_state": health.thread_state.value,
            "signal_state": health.signal_state.value,
            "is_running": stats.get('is_running', False),
            "sample_rate": stats.get('sample_rate', 0),
            "block_size": stats.get('block_size', 0),
            "latency_ms": round(stats.get('latency_ms', 0.0), 2),
            "total_blocks": health.total_blocks,
            "total_xruns": health.total_xruns,
            "xrun_rate_per_minute": round(health.xrun_rate_per_minute, 2),
            "input_level_db": round(health.input_level_db, 1),
            "buffer_health_pct": round(health.buffer_health_pct, 1),
            "is_auto_muted": health.is_auto_muted,
            "watchdog_enabled": stats.get('watchdog_enabled', False),
            "rt_priority_set": stats.get('rt_priority_set', False),
            "recent_alerts": self.get_recent_alerts(5),
        }

    def get_summary(self) -> Dict[str, Any]:
        """Lightweight snapshot for cluster polling."""
        if not self._audio_manager:
            return {
                "thread_state": "offline",
                "signal_state": "unknown",
                "total_xruns": 0,
                "xrun_rate_per_minute": 0.0,
                "buffer_health_pct": 0.0,
                "latency_ms": None,
                "sample_rate": None,
                "block_size": None,
            }

        health = self._audio_manager.get_health_metrics()
        stats = self._audio_manager.get_stats()
        return {
            "thread_state": health.thread_state.value,
            "signal_state": health.signal_state.value,
            "total_xruns": health.total_xruns,
            "xrun_rate_per_minute": health.xrun_rate_per_minute,
            "buffer_health_pct": health.buffer_health_pct,
            "latency_ms": stats.get("latency_ms"),
            "sample_rate": stats.get("sample_rate"),
            "block_size": stats.get("block_size"),
        }

    async def start_monitoring(self, check_interval_sec: float = 1.0) -> None:
        """Start periodic health monitoring."""
        while True:
            try:
                await asyncio.sleep(check_interval_sec)
                self.check_signal_state()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Monitoring error: {e}")

def get_audio_health_monitor() -> AudioHealthMonitor:
    """Get global audio health monitor instance."""
    return AudioHealthMonitor.get_instance()


def init_audio_health_monitor(audio_manager: RealAudioIOManager) -> AudioHealthMonitor:
    """Initialize audio health monitor with audio manager."""
    monitor = get_audio_health_monitor()
    monitor.set_audio_manager(audio_manager)
    return monitor
