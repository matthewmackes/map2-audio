"""
Metering Broadcast Service
Periodically broadcasts spectrum, LUFS, CPU, and phase data via WebSocket
"""

import asyncio
import logging
import json
from typing import Optional

from app.config import config_get
from app.services.websocket_manager import ws_manager
from app.services.juce_engine_service import get_audio_engine
from app.services.timing_jitter_collector import get_timing_jitter_collector
from app.utils.time import utc_now

logger = logging.getLogger(__name__)

DEFAULT_BROADCAST_FPS = {
    "spectrum": 15.0,
    "lufs": 10.0,
    "cpu": 2.0,
    "phase": 10.0,
    "meters": 30.0,
    "latency": 1.0,
    "dynamics": 15.0,
    "timing_jitter": 10.0,
    "brain_metering": 30.0,
}


class MeteringBroadcastService:
    """
    Service that periodically fetches metering data from the audio engine
    and broadcasts it to subscribed WebSocket clients.

    Broadcast rates:
    - spectrum: 15 fps (67ms)
    - lufs: 10 fps (100ms)
    - cpu: 2 fps (500ms)
    - phase: 10 fps (100ms)
    - meters (VU): 30 fps (33ms)
    - dynamics: 15 fps (67ms)
    """

    def __init__(self):
        self._running = False
        self._tasks: list = []

        self._intervals: dict[str, float] = {}
        self.refresh_intervals_from_config()

    def refresh_intervals_from_config(self) -> None:
        """Reload per-topic FPS settings from config with RT-safe defaults."""
        intervals: dict[str, float] = {}
        for topic, default_fps in DEFAULT_BROADCAST_FPS.items():
            fps = config_get(f"metering.broadcast_fps.{topic}", default_fps)
            try:
                fps_value = float(fps)
            except (TypeError, ValueError):
                fps_value = default_fps
            if fps_value <= 0:
                fps_value = default_fps
            intervals[topic] = 1.0 / fps_value
        self._intervals = intervals

    async def start(self):
        """Start all broadcast tasks"""
        if self._running:
            logger.warning("Metering broadcast already running")
            return

        self._running = True
        self.refresh_intervals_from_config()

        # Start broadcast tasks
        self._tasks = [
            asyncio.create_task(self._broadcast_loop("spectrum", self._get_spectrum)),
            asyncio.create_task(self._broadcast_loop("lufs", self._get_lufs)),
            asyncio.create_task(self._broadcast_loop("cpu", self._get_cpu)),
            asyncio.create_task(self._broadcast_loop("phase", self._get_phase)),
            asyncio.create_task(self._broadcast_loop("meters", self._get_meters)),
            asyncio.create_task(self._broadcast_loop("latency", self._get_latency)),
            asyncio.create_task(self._broadcast_loop("dynamics", self._get_dynamics)),
            asyncio.create_task(self._broadcast_loop("timing_jitter", self._get_timing_jitter)),
            asyncio.create_task(self._broadcast_loop("brain_metering", self._get_brain_metering)),
        ]

        logger.info("Metering broadcast service started")

    async def stop(self):
        """Stop all broadcast tasks"""
        self._running = False

        for task in self._tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        self._tasks.clear()
        logger.info("Metering broadcast service stopped")

    async def _broadcast_loop(self, topic: str, data_getter):
        """
        Generic broadcast loop for a topic

        Args:
            topic: WebSocket topic name
            data_getter: Async function that returns the data to broadcast
        """
        interval = self._intervals.get(topic, 0.1)

        while self._running:
            try:
                # Check if anyone is subscribed to this topic
                subscribers = ws_manager.get_subscribers(topic)

                if subscribers:
                    # Get data from engine
                    data = await data_getter()

                    if data:
                        # Broadcast to subscribers
                        message_type = "timing_jitter" if topic == "timing_jitter" else f"{topic}_update"
                        message = {
                            "type": message_type,
                            "data": data,
                            "timestamp": utc_now().isoformat()
                        }
                        await ws_manager.broadcast_json(message, topic)

            except Exception as e:
                logger.error(f"Error in {topic} broadcast: {e}")

            await asyncio.sleep(interval)

    async def _get_spectrum(self) -> Optional[dict]:
        """Get spectrum data from audio engine"""
        service = get_audio_engine()
        audio_active = service.is_running and service.is_audio_running()
        if not audio_active:
            # Return empty spectrum with running=false
            return {
                "magnitudes": [],
                "frequencies": [],
                "peak_frequency": 0.0,
                "peak_magnitude": -100.0,
                "spectral_centroid": 0.0,
                "running": False
            }
        data = await service.get_spectrum()
        data["running"] = True
        return data

    async def _get_lufs(self) -> Optional[dict]:
        """Get LUFS loudness data from audio engine"""
        service = get_audio_engine()
        audio_active = service.is_running and service.is_audio_running()
        if not audio_active:
            # Return default values with running=false so frontend knows engine state
            return {
                "momentary": -100.0,
                "short_term": -100.0,
                "integrated": -100.0,
                "range": 0.0,
                "true_peak": -100.0,
                "true_peak_left": -100.0,
                "true_peak_right": -100.0,
                "running": False
            }
        data = await service.get_lufs_levels()
        data["running"] = True
        return data

    async def _get_cpu(self) -> Optional[dict]:
        """Get CPU metrics from audio engine"""
        service = get_audio_engine()
        audio_active = service.is_running and service.is_audio_running()
        if not audio_active:
            # Return default values with running=false so frontend knows engine state
            return {
                "total_cpu_percent": 0,
                "audio_callback_percent": 0,
                "peak_cpu_percent": 0,
                "average_cpu_percent": 0,
                "xrun_count": 0,
                "budget_ms": 0,
                "current_callback_ms": 0,
                "headroom_percent": 100,
                "per_plugin_percent": {},
                "running": False
            }
        data = await service.get_cpu_metrics()
        data["running"] = True
        return data

    async def _get_phase(self) -> Optional[dict]:
        """Get phase correlation data from audio engine"""
        service = get_audio_engine()
        audio_active = service.is_running and service.is_audio_running()
        if not audio_active:
            # Return default values with running=false so frontend knows engine state
            return {
                "phase_correlation": 0.0,
                "balance": 0.0,
                "width": 0.0,
                "running": False
            }
        data = await service.get_stereo_info()
        data["running"] = True
        return data

    async def _get_meters(self) -> Optional[dict]:
        """Get VU meter data from audio engine"""
        service = get_audio_engine()
        audio_active = service.is_running and service.is_audio_running()
        if not audio_active:
            # Return silence levels with running=false
            return {
                "input_left": -60.0,
                "input_right": -60.0,
                "output_left": -60.0,
                "output_right": -60.0,
                "running": False
            }
        data = await service.get_vu_levels()
        data["running"] = True
        return data

    async def _get_latency(self) -> Optional[dict]:
        """Get latency info from audio engine"""
        service = get_audio_engine()
        audio_active = service.is_running and service.is_audio_running()
        if not audio_active:
            return {
                "total_samples": 0,
                "total_ms": 0.0,
                "breakdown": {},
                "running": False
            }
        return {
            "total_samples": await service.get_total_latency_samples(),
            "total_ms": await service.get_total_latency_ms(),
            "breakdown": await service.get_latency_breakdown(),
            "running": True
        }

    async def _get_dynamics(self) -> Optional[dict]:
        """Get dynamics processor metering from audio engine"""
        service = get_audio_engine()
        audio_active = service.is_running and service.is_audio_running()
        if not audio_active:
            empty_metering = {
                "input_level": -100.0,
                "output_level": -100.0,
                "gain_reduction": 0.0,
                "input_rms": -100.0,
                "output_rms": -100.0
            }
            return {
                "compressor": empty_metering.copy(),
                "limiter": empty_metering.copy(),
                "gate": empty_metering.copy(),
                "running": False
            }
        data = await service.get_dynamics_metering()
        data["running"] = True
        return data

    async def _get_timing_jitter(self) -> Optional[dict]:
        """Get callback timing jitter and publish to rolling collector."""
        service = get_audio_engine()
        audio_active = service.is_running and service.is_audio_running()
        collector = get_timing_jitter_collector()

        if not audio_active:
            payload = {
                "delta_ms": 0.0,
                "deviation_ms": 0.0,
                "callback_count": 0,
                "xrun_count": 0,
                "running": False,
            }
            collector.record(
                delta_ms=0.0,
                deviation_ms=0.0,
                callback_count=0,
                xrun_count=0,
                rtl_ms=0.0,
                running=False,
            )
            return payload

        stats = await service.get_audio_io_stats()
        callback_budget_ms = float(stats.get("callback_budget_ms", 0.0) or 0.0)
        deviation_ms = max(0.0, float(stats.get("callback_jitter_ms", 0.0) or 0.0))
        delta_ms = max(0.0, callback_budget_ms + deviation_ms)
        xrun_count = int(stats.get("xrun_count", 0) or 0)

        configured_buffer = int(getattr(service.config, "buffer_size", 64) or 64)
        if configured_buffer <= 0:
            configured_buffer = 64
        samples_processed = int(stats.get("samples_processed", 0) or 0)
        callback_count = max(0, int(samples_processed / configured_buffer))
        rtl_ms = float(stats.get("measured_round_trip_ms", 0.0) or 0.0)

        collector.record(
            delta_ms=delta_ms,
            deviation_ms=deviation_ms,
            callback_count=callback_count,
            xrun_count=xrun_count,
            rtl_ms=rtl_ms,
            running=True,
        )

        return {
            "delta_ms": round(delta_ms, 4),
            "deviation_ms": round(deviation_ms, 4),
            "callback_count": callback_count,
            "xrun_count": xrun_count,
            "running": True,
        }

    async def _get_brain_metering(self) -> Optional[dict]:
        """Per-slot ConsoleView meter snapshot.

        Lazy-imported to avoid circular imports during module load (the
        brain metering service depends on performance_brain_service which
        imports app.config which we already have in this module).
        """
        from app.services.brain_metering_service import get_brain_metering_service
        try:
            return get_brain_metering_service().read_payload()
        except Exception as exc:
            logger.error("Brain metering broadcast failed: %s", exc)
            return None

    def set_interval(self, topic: str, fps: float):
        """
        Set the broadcast interval for a topic

        Args:
            topic: Topic name
            fps: Frames per second
        """
        if fps > 0:
            self._intervals[topic] = 1.0 / fps
            logger.info(f"Set {topic} broadcast rate to {fps} fps")


# Global instance
metering_broadcast = MeteringBroadcastService()


async def start_metering_broadcast():
    """Start the metering broadcast service"""
    await metering_broadcast.start()


async def stop_metering_broadcast():
    """Stop the metering broadcast service"""
    await metering_broadcast.stop()
