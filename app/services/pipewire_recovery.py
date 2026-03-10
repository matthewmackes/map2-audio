"""
MAP2 Audio - PipeWire Crash Recovery & Watchdog Service

Monitors PipeWire daemon health and JACK connectivity.
Automatically restarts PipeWire if it crashes and reconnects
the JUCE audio engine with exponential backoff.

This is the MISSING piece that turns detection-only monitoring
into active self-healing.
"""

import asyncio
import inspect
import logging
import os
import subprocess
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Dict, List, Optional

logger = logging.getLogger("map2.pipewire_recovery")


class RecoveryState(Enum):
    """Current state of the PipeWire connection."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"       # High xruns or jitter
    DISCONNECTED = "disconnected"  # Device lost
    RECOVERING = "recovering"   # Active recovery in progress
    FAILED = "failed"           # Recovery exhausted


@dataclass
class RecoveryEvent:
    """Record of a recovery attempt."""
    timestamp: float
    trigger: str           # What caused the recovery
    attempt: int
    success: bool
    duration_sec: float
    error: str = ""


@dataclass
class PipeWireHealth:
    """Comprehensive PipeWire health snapshot."""
    daemon_running: bool = False
    jack_server_running: bool = False
    device_connected: bool = False
    state: RecoveryState = RecoveryState.DISCONNECTED
    xrun_count: int = 0
    xruns_per_minute: float = 0.0
    latency_ms: float = 0.0
    jitter_ms: float = 0.0
    cpu_percent: float = 0.0
    uptime_sec: float = 0.0
    recovery_count: int = 0
    last_error: str = ""
    quantum: int = 0
    sample_rate: int = 0


class PipeWireRecoveryService:
    """
    Active watchdog that monitors PipeWire health and performs
    automatic recovery when issues are detected.
    
    Recovery hierarchy:
    1. Soft restart: pw-metadata reset (graph reconfiguration)
    2. JACK reconnect: Close and reopen JUCE audio device  
    3. PipeWire restart: systemctl --user restart pipewire
    4. Full restart: Restart pipewire + wireplumber + audio engine
    """

    # Thresholds
    XRUN_RATE_WARN = 2.0       # xruns/min before warning
    XRUN_RATE_RECOVER = 10.0   # xruns/min before soft recovery
    JITTER_WARN_MS = 3.0       # Jitter threshold for warning
    JITTER_RECOVER_MS = 10.0   # Jitter threshold for recovery
    CPU_WARN_PERCENT = 70.0
    CPU_RECOVER_PERCENT = 95.0

    # Recovery limits
    MAX_RECOVERIES_PER_HOUR = 10
    MAX_SOFT_RETRIES = 3
    BACKOFF_BASE_SEC = 2.0
    BACKOFF_MAX_SEC = 60.0
    STARTUP_GRACE_SEC = 15.0
    RECOVERY_MIN_INTERVAL_SEC = 30.0
    POST_RECOVERY_GRACE_SEC = 10.0
    ALLOW_ENGINE_RESTARTS_ENV = "MAP2_PIPEWIRE_RECOVERY_ENABLE_ENGINE_RESTARTS"

    def __init__(self):
        self._engine = None  # JUCE engine reference (set later)
        self._state = RecoveryState.DISCONNECTED
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._recovery_history: List[RecoveryEvent] = []
        self._callbacks: List[Callable] = []
        self._xrun_window: List[float] = []  # timestamps of recent xruns
        self._last_xrun_count = 0
        self._consecutive_failures = 0
        self._check_interval = 2.0  # seconds
        self._started_at = 0.0
        self._last_recovery_attempt_at = 0.0
        self._last_recovery_completed_at = 0.0
        self._allow_engine_restarts = os.getenv(
            self.ALLOW_ENGINE_RESTARTS_ENV, "false"
        ).lower() in {"1", "true", "yes", "on"}

    def _recovery_cooldown_remaining(self) -> float:
        """Seconds remaining before another automatic recovery is allowed."""
        if self._last_recovery_attempt_at <= 0:
            return 0.0
        return max(
            0.0,
            self.RECOVERY_MIN_INTERVAL_SEC - (time.monotonic() - self._last_recovery_attempt_at),
        )

    def set_engine(self, engine) -> None:
        """Set reference to the JUCE audio engine."""
        self._engine = engine

    async def _call_engine_method(self, method_name: str, *args):
        """Call engine/service method and await if needed."""
        if self._engine is None:
            return None
        method = getattr(self._engine, method_name, None)
        if not callable(method):
            return None
        try:
            result = method(*args)
            if inspect.isawaitable(result):
                result = await result
            return result
        except Exception as e:
            logger.warning(f"Engine call '{method_name}' failed: {e}")
            return None

    def _call_engine_method_sync(self, method_name: str, *args):
        """Call synchronous engine/service method (best effort)."""
        if self._engine is None:
            return None
        method = getattr(self._engine, method_name, None)
        if not callable(method):
            return None
        if inspect.iscoroutinefunction(method):
            return None
        try:
            result = method(*args)
            # Avoid leaking un-awaited coroutine objects if async methods are wired.
            if inspect.isawaitable(result):
                logger.debug(f"Engine sync call '{method_name}' returned awaitable; ignoring in sync context")
                return None
            return result
        except Exception as e:
            logger.debug(f"Engine sync call '{method_name}' failed: {e}")
            return None

    def _engine_audio_running(self) -> Optional[bool]:
        """Best-effort query of engine running state, if available."""
        running = self._call_engine_method_sync("is_audio_running")
        if running is None:
            return None
        return bool(running)

    def register_callback(self, callback: Callable) -> None:
        """Register callback for recovery events."""
        self._callbacks.append(callback)

    @property
    def state(self) -> RecoveryState:
        return self._state

    @property
    def recovery_count(self) -> int:
        return len([e for e in self._recovery_history if e.success])

    # ===========================
    # Health Checking
    # ===========================

    def check_pipewire_daemon(self) -> bool:
        """Check if PipeWire daemon is running."""
        try:
            result = subprocess.run(
                ["pgrep", "-x", "pipewire"],
                capture_output=True, timeout=2
            )
            return result.returncode == 0
        except (subprocess.SubprocessError, FileNotFoundError):
            return False

    def check_wireplumber(self) -> bool:
        """Check if WirePlumber session manager is running."""
        try:
            result = subprocess.run(
                ["pgrep", "-x", "wireplumber"],
                capture_output=True, timeout=2
            )
            return result.returncode == 0
        except (subprocess.SubprocessError, FileNotFoundError):
            return False

    def check_jack_server(self) -> bool:
        """Check if JACK server (via PipeWire) is responding."""
        jack_ok = False
        try:
            result = subprocess.run(
                ["pw-jack", "jack_lsp"],
                capture_output=True, timeout=3
            )
            jack_ok = result.returncode == 0
        except (subprocess.SubprocessError, FileNotFoundError):
            pass

        if not jack_ok:
            # Fallback: try jack_lsp directly
            try:
                result = subprocess.run(
                    ["jack_lsp"],
                    capture_output=True, timeout=3
                )
                jack_ok = result.returncode == 0
            except (subprocess.SubprocessError, FileNotFoundError):
                jack_ok = False

        if jack_ok:
            return True

        # Last-resort fallback: if low-level JACK probe fails but engine reports
        # audio running, treat JACK as effectively available to avoid false
        # recovery loops.
        engine_running = self._engine_audio_running()
        if engine_running:
            logger.debug("JACK probe failed but engine reports running audio")
            return True

        return False

    def get_pipewire_quantum(self) -> tuple:
        """Get current PipeWire quantum and sample rate."""
        try:
            result = subprocess.run(
                ["pw-metadata", "-n", "settings", "0", "clock.force-quantum"],
                capture_output=True, text=True, timeout=3
            )
            quantum = 0
            rate = 0
            if result.returncode == 0 and result.stdout.strip():
                # Parse quantum from output
                for line in result.stdout.strip().split("\n"):
                    if "value" in line:
                        try:
                            quantum = int(line.split("'")[-2]) if "'" in line else 0
                        except (ValueError, IndexError):
                            pass

            # Get sample rate
            result2 = subprocess.run(
                ["pw-metadata", "-n", "settings", "0", "clock.force-rate"],
                capture_output=True, text=True, timeout=3
            )
            if result2.returncode == 0 and result2.stdout.strip():
                for line in result2.stdout.strip().split("\n"):
                    if "value" in line:
                        try:
                            rate = int(line.split("'")[-2]) if "'" in line else 0
                        except (ValueError, IndexError):
                            pass

            return quantum, rate
        except (subprocess.SubprocessError, FileNotFoundError):
            return 0, 0

    def get_health(self) -> PipeWireHealth:
        """Get comprehensive health snapshot."""
        health = PipeWireHealth()
        health.daemon_running = self.check_pipewire_daemon()
        health.jack_server_running = self.check_jack_server()
        health.state = self._state
        health.recovery_count = self.recovery_count
        health.device_connected = bool(self._engine_audio_running())

        # Get engine stats if available
        if self._engine is not None:
            try:
                stats = self._call_engine_method_sync("get_audio_stats")
                if stats:
                    health.device_connected = stats.get("device_connected", health.device_connected)
                    health.xrun_count = stats.get("xrun_count", 0)
                    health.latency_ms = stats.get("latency_ms", 0)
                    health.jitter_ms = stats.get("callback_jitter_ms", 0)
                    health.cpu_percent = stats.get("cpu_usage", 0)
                    health.uptime_sec = stats.get("uptime_seconds", 0)
                    health.last_error = stats.get("last_error", "")
                else:
                    # Compatibility fallback for JuceEngineService wrapper
                    xrun_count = self._call_engine_method_sync("get_xrun_count")
                    if isinstance(xrun_count, (int, float)):
                        health.xrun_count = int(xrun_count)
                    latency_ms = self._call_engine_method_sync("get_total_latency_ms")
                    if isinstance(latency_ms, (int, float)):
                        health.latency_ms = float(latency_ms)
            except Exception as e:
                logger.debug(f"Could not get engine stats: {e}")

        # Calculate xrun rate
        now = time.time()
        self._xrun_window = [t for t in self._xrun_window if now - t < 60]
        health.xruns_per_minute = len(self._xrun_window)

        # PipeWire quantum
        health.quantum, health.sample_rate = self.get_pipewire_quantum()

        return health

    # ===========================
    # Recovery Actions
    # ===========================

    async def _soft_recovery(self) -> bool:
        """
        Level 1: Soft recovery - reset PipeWire graph metadata.
        Fixes most transient graph issues without disrupting audio.
        """
        logger.info("[RECOVERY L1] Attempting PipeWire graph reset...")
        try:
            proc = await asyncio.create_subprocess_exec(
                "pw-metadata", "-n", "settings", "0",
                "clock.force-quantum", "0",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await asyncio.wait_for(proc.wait(), timeout=5)
            await asyncio.sleep(1)
            return self.check_jack_server()
        except Exception as e:
            logger.warning(f"Soft recovery failed: {e}")
            return False

    async def _reconnect_jack(self) -> bool:
        """
        Level 2: Reconnect JUCE audio device to JACK.
        Closes and reopens the audio device without restarting PipeWire.
        """
        logger.info("[RECOVERY L2] Reconnecting JUCE audio to JACK...")
        if self._engine is None:
            return False
        if not self._allow_engine_restarts:
            logger.info("Engine restart recovery disabled; skipping JACK reconnect")
            return False
        try:
            # Stop audio, wait, restart
            await self._call_engine_method("stop_audio")
            await asyncio.sleep(1)

            # Re-initialize audio
            success = await self._call_engine_method("start_audio")
            if success:
                await asyncio.sleep(0.5)
                running = self._engine_audio_running()
                return bool(success) and (bool(running) if running is not None else True)
            return False
        except Exception as e:
            logger.warning(f"JACK reconnect failed: {e}")
            return False

    async def _restart_pipewire(self) -> bool:
        """
        Level 3: Restart PipeWire daemon.
        """
        logger.info("[RECOVERY L3] Restarting PipeWire daemon...")
        try:
            # Stop audio engine first
            if self._engine and self._allow_engine_restarts:
                await self._call_engine_method("stop_audio")

            # Restart PipeWire (user service)
            proc = await asyncio.create_subprocess_exec(
                "systemctl", "--user", "restart", "pipewire.service",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
            if proc.returncode != 0:
                logger.error(f"PipeWire restart failed: {stderr.decode()}")
                return False

            # Wait for PipeWire to come up
            for _ in range(10):
                await asyncio.sleep(1)
                if self.check_pipewire_daemon():
                    break
            else:
                logger.error("PipeWire did not come up after restart")
                return False

            # Wait for JACK server to be ready
            for _ in range(5):
                await asyncio.sleep(1)
                if self.check_jack_server():
                    break
            else:
                logger.warning("JACK server not ready after PipeWire restart")

            # Reconnect audio engine
            if self._engine:
                if not self._allow_engine_restarts:
                    logger.info("Engine restart recovery disabled; skipping audio engine restart")
                    return self.check_jack_server()
                await asyncio.sleep(1)
                started = await self._call_engine_method("start_audio")
                return bool(started) if started is not None else self.check_jack_server()

            return True
        except Exception as e:
            logger.error(f"PipeWire restart failed: {e}")
            return False

    async def _full_restart(self) -> bool:
        """
        Level 4: Full restart of PipeWire + WirePlumber + audio engine.
        Nuclear option when everything else fails.
        """
        logger.info("[RECOVERY L4] Full audio stack restart...")
        try:
            # Stop everything
            if self._engine and self._allow_engine_restarts:
                await self._call_engine_method("stop_audio")

            # Restart both services
            for service in ["pipewire.service", "wireplumber.service"]:
                proc = await asyncio.create_subprocess_exec(
                    "systemctl", "--user", "restart", service,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await asyncio.wait_for(proc.communicate(), timeout=10)

            # Wait for everything to come up
            await asyncio.sleep(3)

            if not self.check_pipewire_daemon():
                logger.error("PipeWire still not running after full restart")
                return False

            # Wait for JACK
            for _ in range(10):
                if self.check_jack_server():
                    break
                await asyncio.sleep(1)

            # Reconnect engine
            if self._engine:
                if not self._allow_engine_restarts:
                    logger.info("Engine restart recovery disabled; skipping audio engine restart")
                    return self.check_jack_server()
                await asyncio.sleep(2)
                success = await self._call_engine_method("start_audio")
                if success:
                    logger.info("Audio engine reconnected after full restart")
                return bool(success) if success is not None else self.check_jack_server()

            return True
        except Exception as e:
            logger.error(f"Full restart failed: {e}")
            return False

    async def _execute_recovery(self, trigger: str) -> bool:
        """
        Execute recovery with escalating levels and backoff.
        """
        if self._state == RecoveryState.RECOVERING:
            logger.debug("Recovery already in progress, skipping")
            return False
        cooldown_remaining = self._recovery_cooldown_remaining()
        if trigger != "manual_trigger" and cooldown_remaining > 0:
            logger.warning(
                "Skipping recovery trigger %s during %.1fs cooldown window",
                trigger,
                cooldown_remaining,
            )
            return False

        # Rate limit: max recoveries per hour
        recent = [e for e in self._recovery_history
                  if time.time() - e.timestamp < 3600]
        if len(recent) >= self.MAX_RECOVERIES_PER_HOUR:
            logger.error("Recovery rate limit exceeded (max %d/hour)",
                        self.MAX_RECOVERIES_PER_HOUR)
            self._state = RecoveryState.FAILED
            return False

        self._state = RecoveryState.RECOVERING
        self._last_recovery_attempt_at = time.monotonic()

        # Escalating recovery levels
        recovery_levels = [
            ("soft_reset", self._soft_recovery),
            ("pipewire_restart", self._restart_pipewire),
        ]
        if self._allow_engine_restarts:
            recovery_levels.insert(1, ("jack_reconnect", self._reconnect_jack))
            recovery_levels.append(("full_restart", self._full_restart))

        for attempt, (level_name, recovery_fn) in enumerate(recovery_levels):
            start = time.time()
            event = RecoveryEvent(
                timestamp=start,
                trigger=trigger,
                attempt=attempt + 1,
                success=False,
                duration_sec=0
            )

            try:
                logger.info(f"Recovery level {attempt+1}/{len(recovery_levels)}: "
                           f"{level_name} (trigger: {trigger})")

                success = await recovery_fn()
                event.duration_sec = time.time() - start
                event.success = success

                if success:
                    self._state = RecoveryState.HEALTHY
                    self._consecutive_failures = 0
                    self._last_recovery_completed_at = time.monotonic()
                    logger.info(f"Recovery successful at level {level_name} "
                              f"({event.duration_sec:.1f}s)")
                    self._recovery_history.append(event)
                    self._notify_callbacks(event)
                    return True
                else:
                    # Backoff before next level
                    backoff = min(
                        self.BACKOFF_BASE_SEC * (2 ** attempt),
                        self.BACKOFF_MAX_SEC
                    )
                    logger.warning(f"Level {level_name} failed, "
                                 f"backing off {backoff:.0f}s...")
                    await asyncio.sleep(backoff)

            except Exception as e:
                event.error = str(e)
                event.duration_sec = time.time() - start
                logger.error(f"Recovery level {level_name} error: {e}")

            self._recovery_history.append(event)

        # All levels exhausted
        self._state = RecoveryState.FAILED
        self._consecutive_failures += 1
        logger.error("All recovery levels exhausted. Manual intervention required.")
        return False

    def _notify_callbacks(self, event: RecoveryEvent):
        """Notify registered callbacks of recovery event."""
        for cb in self._callbacks:
            try:
                cb(event)
            except Exception as e:
                logger.warning(f"Recovery callback error: {e}")

    # ===========================
    # Main Monitoring Loop
    # ===========================

    async def start(self, check_interval: float = 2.0) -> None:
        """Start the PipeWire watchdog monitoring loop."""
        if self._running:
            return
        self._running = True
        self._check_interval = check_interval
        self._started_at = time.monotonic()
        self._task = asyncio.create_task(self._monitor_loop())
        logger.info("PipeWire recovery watchdog started "
                    f"(interval={check_interval}s)")

    async def stop(self) -> None:
        """Stop the watchdog."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("PipeWire recovery watchdog stopped")

    async def _monitor_loop(self):
        """Main monitoring loop - checks health and triggers recovery."""
        while self._running:
            try:
                await self._check_and_recover()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Monitor loop error: {e}")

            await asyncio.sleep(self._check_interval)

    async def _check_and_recover(self):
        """Single health check iteration."""
        health = self.get_health()
        in_startup_grace = (time.monotonic() - self._started_at) < self.STARTUP_GRACE_SEC
        in_recovery_grace = (
            self._last_recovery_completed_at > 0
            and (time.monotonic() - self._last_recovery_completed_at) < self.POST_RECOVERY_GRACE_SEC
        )

        # === Critical: PipeWire daemon down ===
        if not health.daemon_running:
            if in_recovery_grace:
                logger.debug("PipeWire daemon still settling after recovery, skipping automatic retry")
                self._state = RecoveryState.DISCONNECTED
                return
            logger.error("PipeWire daemon not running!")
            self._state = RecoveryState.DISCONNECTED
            await self._execute_recovery("pipewire_daemon_down")
            return

        # === Critical: JACK server down ===
        if not health.jack_server_running:
            if in_startup_grace or in_recovery_grace:
                logger.debug("JACK not ready yet (startup/recovery grace window), skipping recovery")
                self._state = RecoveryState.DEGRADED
                return
            logger.error("JACK server not responding!")
            self._state = RecoveryState.DISCONNECTED
            await self._execute_recovery("jack_server_down")
            return

        # === Critical: Audio device disconnected ===
        if self._engine and not in_startup_grace and not in_recovery_grace and not health.device_connected:
            logger.warning("Audio device disconnected")
            self._state = RecoveryState.DISCONNECTED
            await self._execute_recovery("device_disconnected")
            return

        # === Degraded: High xrun rate ===
        if self._engine:
            current_xruns = health.xrun_count
            if current_xruns > self._last_xrun_count:
                new_xruns = current_xruns - self._last_xrun_count
                now = time.time()
                self._xrun_window.extend([now] * new_xruns)
                self._last_xrun_count = current_xruns

            if health.xruns_per_minute >= self.XRUN_RATE_RECOVER:
                logger.warning(f"High xrun rate: {health.xruns_per_minute:.1f}/min")
                self._state = RecoveryState.DEGRADED
                await self._execute_recovery("high_xrun_rate")
                return

            # === Degraded: Extreme jitter ===
            if health.jitter_ms >= self.JITTER_RECOVER_MS:
                logger.warning(f"Extreme callback jitter: {health.jitter_ms:.1f}ms")
                self._state = RecoveryState.DEGRADED
                await self._execute_recovery("extreme_jitter")
                return

            # === Warning states (don't recover, just update state) ===
            if (health.xruns_per_minute >= self.XRUN_RATE_WARN or
                    health.jitter_ms >= self.JITTER_WARN_MS or
                    health.cpu_percent >= self.CPU_WARN_PERCENT):
                self._state = RecoveryState.DEGRADED
            else:
                self._state = RecoveryState.HEALTHY

    # ===========================
    # Public API
    # ===========================

    def get_status(self) -> Dict:
        """Get full recovery service status for API."""
        health = self.get_health()
        recent_events = self._recovery_history[-20:]

        return {
            "state": self._state.value,
            "health": {
                "daemon_running": health.daemon_running,
                "jack_server_running": health.jack_server_running,
                "device_connected": health.device_connected,
                "xrun_count": health.xrun_count,
                "xruns_per_minute": round(health.xruns_per_minute, 1),
                "latency_ms": round(health.latency_ms, 2),
                "jitter_ms": round(health.jitter_ms, 2),
                "cpu_percent": round(health.cpu_percent, 1),
                "uptime_seconds": round(health.uptime_sec, 1),
                "quantum": health.quantum,
                "sample_rate": health.sample_rate,
            },
            "recovery": {
                "total_recoveries": self.recovery_count,
                "total_attempts": len(self._recovery_history),
                "consecutive_failures": self._consecutive_failures,
                "recent_events": [
                    {
                        "timestamp": e.timestamp,
                        "trigger": e.trigger,
                        "attempt": e.attempt,
                        "success": e.success,
                        "duration_sec": round(e.duration_sec, 2),
                        "error": e.error,
                    }
                    for e in recent_events
                ],
            },
            "thresholds": {
                "xrun_rate_warn": self.XRUN_RATE_WARN,
                "xrun_rate_recover": self.XRUN_RATE_RECOVER,
                "jitter_warn_ms": self.JITTER_WARN_MS,
                "jitter_recover_ms": self.JITTER_RECOVER_MS,
                "max_recoveries_per_hour": self.MAX_RECOVERIES_PER_HOUR,
            },
        }

    async def force_recovery(self, level: str = "auto") -> Dict:
        """Manually trigger recovery at a specific level."""
        if level == "soft":
            success = await self._soft_recovery()
        elif level == "reconnect":
            success = await self._reconnect_jack()
        elif level == "restart":
            success = await self._restart_pipewire()
        elif level == "full":
            success = await self._full_restart()
        else:  # auto
            success = await self._execute_recovery("manual_trigger")

        return {
            "success": success,
            "state": self._state.value,
        }


# Singleton
_recovery_service: Optional[PipeWireRecoveryService] = None


def get_pipewire_recovery_service() -> PipeWireRecoveryService:
    """Get or create the PipeWire recovery service singleton."""
    global _recovery_service
    if _recovery_service is None:
        _recovery_service = PipeWireRecoveryService()
    return _recovery_service
