"""
Metering Broadcast Service
Periodically broadcasts spectrum, LUFS, CPU, and phase data via WebSocket
"""

import asyncio
import logging
import json
from datetime import datetime
from typing import Optional

from app.services.websocket_manager import ws_manager
from app.services.juce_engine_service import get_audio_engine

logger = logging.getLogger(__name__)


class MeteringBroadcastService:
    """
    Service that periodically fetches metering data from the audio engine
    and broadcasts it to subscribed WebSocket clients.

    Broadcast rates:
    - spectrum: 30 fps (33ms)
    - lufs: 10 fps (100ms)
    - cpu: 2 fps (500ms)
    - phase: 10 fps (100ms)
    - meters (VU): 30 fps (33ms)
    """

    def __init__(self):
        self._running = False
        self._tasks: list = []

        # Broadcast intervals in seconds
        self._intervals = {
            "spectrum": 1.0 / 30,  # 30 fps
            "lufs": 1.0 / 10,      # 10 fps
            "cpu": 1.0 / 2,        # 2 fps
            "phase": 1.0 / 10,     # 10 fps
            "meters": 1.0 / 30,    # 30 fps
            "latency": 1.0 / 1,    # 1 fps (latency doesn't change often)
        }

    async def start(self):
        """Start all broadcast tasks"""
        if self._running:
            logger.warning("Metering broadcast already running")
            return

        self._running = True

        # Start broadcast tasks
        self._tasks = [
            asyncio.create_task(self._broadcast_loop("spectrum", self._get_spectrum)),
            asyncio.create_task(self._broadcast_loop("lufs", self._get_lufs)),
            asyncio.create_task(self._broadcast_loop("cpu", self._get_cpu)),
            asyncio.create_task(self._broadcast_loop("phase", self._get_phase)),
            asyncio.create_task(self._broadcast_loop("meters", self._get_meters)),
            asyncio.create_task(self._broadcast_loop("latency", self._get_latency)),
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
                        message = {
                            "type": f"{topic}_update",
                            "data": data,
                            "timestamp": datetime.now().isoformat()
                        }
                        await ws_manager.broadcast_json(message, topic)

            except Exception as e:
                logger.error(f"Error in {topic} broadcast: {e}")

            await asyncio.sleep(interval)

    async def _get_spectrum(self) -> Optional[dict]:
        """Get spectrum data from audio engine"""
        service = get_audio_engine()
        if not service.is_running:
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
        if not service.is_running:
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
        if not service.is_running:
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
        if not service.is_running:
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
        if not service.is_running:
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
        if not service.is_running:
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
