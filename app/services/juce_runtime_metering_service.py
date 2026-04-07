from __future__ import annotations

from typing import Any, Dict, List, TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.juce_engine_service import JuceEngineService


class JuceRuntimeMeteringService:
    """Focused JUCE runtime metering and analysis helpers."""

    def __init__(self, owner: "JuceEngineService") -> None:
        self._owner = owner

    @property
    def _engine(self):
        return self._owner.engine

    async def get_spectrum(self) -> Dict[str, Any]:
        return await self._owner._run_engine_call("get_spectrum", default={
            "magnitudes": [],
            "frequencies": [],
            "peak_frequency": 0.0,
            "peak_magnitude": -100.0,
            "spectral_centroid": 0.0,
        })

    async def get_spectrum_magnitudes(self) -> List[float]:
        return await self._owner._run_engine_call("get_spectrum_magnitudes", default=[])

    async def get_spectrum_frequencies(self) -> List[float]:
        return await self._owner._run_engine_call("get_spectrum_frequencies", default=[])

    async def get_lufs_levels(self) -> Dict[str, float]:
        return await self._owner._run_engine_call("get_lufs_levels", default={
            "momentary": -100.0,
            "short_term": -100.0,
            "integrated": -100.0,
            "range": 0.0,
            "true_peak": -100.0,
            "true_peak_left": -100.0,
            "true_peak_right": -100.0,
        })

    async def reset_integrated_loudness(self) -> None:
        await self._owner._run_engine_call("reset_integrated_loudness")

    async def get_phase_correlation(self) -> float:
        return float(await self._owner._run_engine_call("get_phase_correlation", default=0.0) or 0.0)

    async def get_stereo_balance(self) -> float:
        return float(await self._owner._run_engine_call("get_stereo_balance", default=0.0) or 0.0)

    async def get_stereo_width(self) -> float:
        return float(await self._owner._run_engine_call("get_stereo_width", default=0.0) or 0.0)

    async def get_stereo_info(self) -> Dict[str, float]:
        return {
            "phase_correlation": await self.get_phase_correlation(),
            "balance": await self.get_stereo_balance(),
            "width": await self.get_stereo_width(),
        }

    async def get_cpu_metrics(self) -> Dict[str, Any]:
        return await self._owner._run_engine_call("get_cpu_metrics", default={
            "total_cpu_percent": 0.0,
            "audio_callback_percent": 0.0,
            "peak_cpu_percent": 0.0,
            "average_cpu_percent": 0.0,
            "xrun_count": 0,
            "budget_ms": 0.0,
            "current_callback_ms": 0.0,
            "headroom_percent": 100.0,
            "per_plugin_percent": {},
        })

    async def get_total_cpu(self) -> float:
        return float(await self._owner._run_engine_call("get_total_cpu", default=0.0) or 0.0)

    async def get_plugin_cpu(self, instance_id: int) -> float:
        return float(await self._owner._run_engine_call("get_plugin_cpu", instance_id, default=0.0) or 0.0)

    async def get_xrun_count(self) -> int:
        return int(await self._owner._run_engine_call("get_xrun_count", default=0) or 0)

    async def get_total_latency_samples(self) -> int:
        return int(await self._owner._run_engine_call("get_total_latency_samples", default=0) or 0)

    async def get_total_latency_ms(self) -> float:
        return float(await self._owner._run_engine_call("get_total_latency_ms", default=0.0) or 0.0)

    async def get_latency_breakdown(self) -> List[Dict[str, Any]]:
        return await self._owner._run_engine_call("get_latency_breakdown", default=[])

    async def connect_sidechain(self, source: int, dest: int, dest_bus: int = 1) -> bool:
        return bool(await self._owner._run_engine_call("connect_sidechain", source, dest, dest_bus, default=False))

    async def disconnect_sidechain(self, dest: int, dest_bus: int = 1) -> bool:
        return bool(await self._owner._run_engine_call("disconnect_sidechain", dest, dest_bus, default=False))

    async def get_sidechain_connections(self) -> List[Dict[str, Any]]:
        return await self._owner._run_engine_call("get_sidechain_connections", default=[])
