"""JUCE AudioIO methods for JuceEngineService."""

from .common import *


class JuceAudioIOMixin:
    """Focused JUCE engine service behavior mixed into the public service."""

    async def get_vu_levels(self) -> Dict[str, float]:
        """Get master input/output VU levels"""
        if not self._engine:
            return {
                "input_left": 0.0,
                "input_right": 0.0,
                "output_left": 0.0,
                "output_right": 0.0
            }
        return await asyncio.to_thread(self._engine.get_vu_levels)

    async def get_plugin_vu_levels(self) -> List[Dict[str, Any]]:
        """Get per-plugin VU levels"""
        if not self._engine:
            return []
        raw_levels = await asyncio.to_thread(self._engine.get_plugin_vu_levels)
        if not isinstance(raw_levels, list):
            return []
        runtime_items = self._get_current_pedalboard_items()
        return self._attach_runtime_identity_to_plugin_payloads(raw_levels, runtime_items)

    @staticmethod
    def _lookup_runtime_cpu_percent(per_plugin_percent: Any, instance_id: Optional[int]) -> Optional[float]:
        if not isinstance(instance_id, int) or instance_id <= 0:
            return None
        if isinstance(per_plugin_percent, dict):
            for key in (instance_id, str(instance_id)):
                raw_value = per_plugin_percent.get(key)
                if raw_value is None:
                    continue
                try:
                    return float(raw_value)
                except (TypeError, ValueError):
                    return None
        return None

    async def get_runtime_plugin_cpu_telemetry(self) -> List[Dict[str, Any]]:
        """Get per-instance plugin CPU telemetry for the active pedalboard."""
        if not self._engine:
            return []

        runtime_items = self._get_current_pedalboard_items()
        if not runtime_items:
            return []

        try:
            cpu_metrics = await asyncio.to_thread(self._engine.get_cpu_metrics)
        except Exception:
            cpu_metrics = {}
        per_plugin_percent = cpu_metrics.get("per_plugin_percent", {}) if isinstance(cpu_metrics, dict) else {}

        telemetry: List[Dict[str, Any]] = []
        for fallback_index, item in enumerate(runtime_items):
            uri = item.get("uri")
            if not isinstance(uri, str) or not uri:
                continue

            payload: Dict[str, Any] = {
                "uri": uri,
                "name": item.get("name") or uri,
                "cpu_percent": 0.0,
            }

            instance_id = item.get("instance_id")
            if isinstance(instance_id, int) and instance_id > 0:
                payload["instance_id"] = instance_id

            position = self._pedalboard_item_position(item, fallback_index)
            if position is not None:
                payload["position"] = position
                payload["plugin_position"] = position

            latency = self._runtime_item_latency_samples(item)
            if latency is not None:
                payload["latency_samples"] = latency

            cpu_percent = self._lookup_runtime_cpu_percent(per_plugin_percent, instance_id)
            if cpu_percent is None and isinstance(instance_id, int) and instance_id > 0:
                try:
                    cpu_percent = float(await asyncio.to_thread(self._engine.get_plugin_cpu, instance_id))
                except Exception:
                    cpu_percent = None
            if cpu_percent is not None:
                payload["cpu_percent"] = round(cpu_percent, 2)

            telemetry.append(payload)

        return telemetry

    # ========================================
    # Spectrum Analysis (NEW)
    # ========================================

    async def get_spectrum(self) -> Dict[str, Any]:
        """Get FFT spectrum data"""
        return await self._metering_runtime.get_spectrum()

    async def get_spectrum_magnitudes(self) -> List[float]:
        """Get spectrum magnitude array"""
        return await self._metering_runtime.get_spectrum_magnitudes()

    async def get_spectrum_frequencies(self) -> List[float]:
        """Get spectrum frequency array"""
        return await self._metering_runtime.get_spectrum_frequencies()

    # ========================================
    # LUFS Loudness Metering (NEW)
    # ========================================

    async def get_lufs_levels(self) -> Dict[str, float]:
        """Get LUFS loudness levels"""
        return await self._metering_runtime.get_lufs_levels()

    async def reset_integrated_loudness(self) -> None:
        """Reset integrated loudness measurement"""
        await self._metering_runtime.reset_integrated_loudness()

    # ========================================
    # Phase Correlation (NEW)
    # ========================================

    async def get_phase_correlation(self) -> float:
        """Get stereo phase correlation (-1 to +1)"""
        return await self._metering_runtime.get_phase_correlation()

    async def get_stereo_balance(self) -> float:
        """Get stereo balance (-1=left, 0=center, +1=right)"""
        return await self._metering_runtime.get_stereo_balance()

    async def get_stereo_width(self) -> float:
        """Get stereo width (0=mono, 1=full stereo)"""
        return await self._metering_runtime.get_stereo_width()

    async def get_stereo_info(self) -> Dict[str, float]:
        """Get combined stereo analysis info"""
        return await self._metering_runtime.get_stereo_info()

    # ========================================
    # CPU Monitoring (NEW)
    # ========================================

    async def get_cpu_metrics(self) -> Dict[str, Any]:
        """Get detailed CPU metrics"""
        return await self._metering_runtime.get_cpu_metrics()

    async def get_total_cpu(self) -> float:
        """Get total CPU usage percentage"""
        return await self._metering_runtime.get_total_cpu()

    async def get_plugin_cpu(self, instance_id: int) -> float:
        """Get CPU usage for a specific plugin"""
        return await self._metering_runtime.get_plugin_cpu(instance_id)

    async def get_xrun_count(self) -> int:
        """Get number of audio dropouts (xruns)"""
        return await self._metering_runtime.get_xrun_count()

    async def get_audio_io_stats(self) -> Dict[str, Any]:
        """Get runtime audio I/O diagnostics (xrun/jitter/budget metrics)."""
        if not self._engine or not hasattr(self._engine, "get_audio_io_stats"):
            return {
                "cpu_usage": 0.0,
                "xrun_count": 0,
                "xruns_since_reset": 0,
                "latency_ms": 0.0,
                "samples_processed": 0,
                "callback_jitter_ms": 0.0,
                "peak_callback_jitter_ms": 0.0,
                "avg_callback_duration_ms": 0.0,
                "peak_callback_duration_ms": 0.0,
                "callback_budget_ms": 0.0,
                "budget_utilization": 0.0,
                "device_connected": False,
                "recovery_count": 0,
                "uptime_seconds": 0.0,
                "last_xrun_timestamp": 0,
                "measured_round_trip_ms": 0.0,
                "measured_input_latency_ms": 0.0,
                "measured_output_latency_ms": 0.0,
                "topology_mutation_count": 0,
                "topology_no_op_skip_count": 0,
                "topology_last_mutation_duration_ms": 0.0,
                "topology_peak_mutation_duration_ms": 0.0,
                "topology_avg_mutation_duration_ms": 0.0,
                "topology_last_removed_connection_count": 0,
                "topology_last_added_connection_count": 0,
                "topology_last_chain_size": 0,
                "topology_last_parallel_group_count": 0,
            }
        return await asyncio.to_thread(self._engine.get_audio_io_stats)

    async def drain_platform_events(self, max_events: int = 128) -> List[Dict[str, Any]]:
        """Drain engine-originated PlatformEvent records from the native FIFO."""
        if not self._engine or not hasattr(self._engine, "drain_platform_events"):
            return []
        raw_events = await asyncio.to_thread(self._engine.drain_platform_events, int(max_events))
        if not isinstance(raw_events, list):
            return []
        return [dict(event) for event in raw_events if isinstance(event, dict)]

    async def get_dropped_platform_event_count(self) -> int:
        """Return engine PlatformEvent records dropped because the native FIFO was full."""
        if not self._engine or not hasattr(self._engine, "get_dropped_platform_event_count"):
            return 0
        try:
            return int(await asyncio.to_thread(self._engine.get_dropped_platform_event_count))
        except (TypeError, ValueError):
            return 0

    async def publish_engine_platform_events(self, max_events: int = 128) -> List[str]:
        """Publish drained engine-native records through the canonical PlatformEvent bus."""
        records = await self.drain_platform_events(max_events)
        if not records:
            return []

        from app.config import config_get
        from app.services.platform_event.bus import get_platform_event_bus

        source_node = str(config_get("node.id", "local") or "local")
        bus = get_platform_event_bus()
        emitted_ids: List[str] = []
        for record in records:
            context = {
                "engine_sequence": record.get("sequence", 0),
                "engine_timestamp_ms": record.get("timestamp_ms", 0),
                "engine_dropped_count": record.get("dropped_count", 0),
            }
            event_id = await bus.emit(
                {
                    "kind": str(record.get("kind") or "audio.engine.status"),
                    "severity": str(record.get("severity") or "info"),
                    "source_node": source_node,
                    "source_service": "juce_engine",
                    "title": str(record.get("title") or "Audio engine")[:40],
                    "message": str(record.get("message") or "Engine event")[:200],
                    "context": context,
                    "target_surfaces": ["lcd", "toast"],
                }
            )
            emitted_ids.append(event_id)
        return emitted_ids

    async def get_topology_mutation_stats(self) -> Dict[str, Any]:
        """Get cumulative JUCE graph topology-mutation diagnostics when supported."""
        if not self._engine or not hasattr(self._engine, "get_topology_mutation_stats"):
            return {
                "mutation_count": 0,
                "no_op_skip_count": 0,
                "last_mutation_duration_ms": 0.0,
                "peak_mutation_duration_ms": 0.0,
                "avg_mutation_duration_ms": 0.0,
                "last_removed_connection_count": 0,
                "last_added_connection_count": 0,
                "last_chain_size": 0,
                "last_parallel_group_count": 0,
            }
        return await asyncio.to_thread(self._engine.get_topology_mutation_stats)

    async def reset_xrun_counter(self) -> bool:
        """Reset xrun counter if supported by the engine runtime."""
        if not self._engine or not hasattr(self._engine, "reset_xrun_counter"):
            return False
        await asyncio.to_thread(self._engine.reset_xrun_counter)
        return True

    # ========================================
    # Latency (NEW)
    # ========================================

    async def get_total_latency_samples(self) -> int:
        """Get total chain latency in samples"""
        return await self._metering_runtime.get_total_latency_samples()

    async def get_total_latency_ms(self) -> float:
        """Get total chain latency in milliseconds"""
        return await self._metering_runtime.get_total_latency_ms()

    async def get_latency_breakdown(self) -> List[Dict[str, Any]]:
        """Get per-plugin latency breakdown"""
        return await self._metering_runtime.get_latency_breakdown()

    # ========================================
    # Sidechain Routing (NEW)
    # ========================================

    async def connect_sidechain(self, source: int, dest: int, dest_bus: int = 1) -> bool:
        """Connect sidechain from source to dest plugin"""
        return await self._metering_runtime.connect_sidechain(source, dest, dest_bus)

    async def disconnect_sidechain(self, dest: int, dest_bus: int = 1) -> bool:
        """Disconnect sidechain from dest plugin"""
        return await self._metering_runtime.disconnect_sidechain(dest, dest_bus)

    async def get_sidechain_connections(self) -> List[Dict[str, Any]]:
        """Get all sidechain connections"""
        return await self._metering_runtime.get_sidechain_connections()

    # ========================================
    # Convolution / IR Processing (NEW)
    # ========================================

    async def load_cabinet_ir(self, path: str) -> bool:
        """Load cabinet impulse response"""
        if not self._engine:
            return False
        return await asyncio.to_thread(self._engine.load_cabinet_ir, path)

    async def load_reverb_ir(self, path: str) -> bool:
        """Load reverb impulse response"""
        if not self._engine:
            return False
        return await asyncio.to_thread(self._engine.load_reverb_ir, path)

    async def unload_cabinet_ir(self) -> None:
        """Unload cabinet IR"""
        if self._engine:
            await asyncio.to_thread(self._engine.unload_cabinet_ir)

    async def unload_reverb_ir(self) -> None:
        """Unload reverb IR"""
        if self._engine:
            await asyncio.to_thread(self._engine.unload_reverb_ir)

    async def set_cabinet_mix(self, mix: float) -> None:
        """Set cabinet dry/wet mix (0.0-1.0)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_cabinet_mix, mix)

    async def set_reverb_mix(self, mix: float) -> None:
        """Set reverb dry/wet mix (0.0-1.0)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_reverb_mix, mix)

    async def set_cabinet_bypass(self, bypass: bool) -> None:
        """Bypass cabinet IR"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_cabinet_bypass, bypass)

    async def set_reverb_bypass(self, bypass: bool) -> None:
        """Bypass reverb IR"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_reverb_bypass, bypass)

    async def get_cabinet_ir_info(self) -> Dict[str, Any]:
        """Get cabinet IR info"""
        if not self._engine:
            return {
                "name": "",
                "path": "",
                "channels": 0,
                "length_samples": 0,
                "length_ms": 0.0,
                "sample_rate": 0.0,
                "loaded": False
            }
        return await asyncio.to_thread(self._engine.get_cabinet_ir_info)

    async def get_reverb_ir_info(self) -> Dict[str, Any]:
        """Get reverb IR info"""
        if not self._engine:
            return {
                "name": "",
                "path": "",
                "channels": 0,
                "length_samples": 0,
                "length_ms": 0.0,
                "sample_rate": 0.0,
                "loaded": False
            }
        return await asyncio.to_thread(self._engine.get_reverb_ir_info)

    async def load_cabinet_ir_instance(self, instance_id: int, path: str) -> bool:
        if not self._engine:
            return False
        try:
            return bool(await asyncio.to_thread(self._engine.load_cabinet_ir_instance, instance_id, path))
        except AttributeError:
            return False

    async def load_reverb_ir_instance(self, instance_id: int, path: str) -> bool:
        if not self._engine:
            return False
        try:
            return bool(await asyncio.to_thread(self._engine.load_reverb_ir_instance, instance_id, path))
        except AttributeError:
            return False

    async def unload_ir_instance(self, instance_id: int) -> bool:
        if not self._engine:
            return False
        try:
            return bool(await asyncio.to_thread(self._engine.unload_ir_instance, instance_id))
        except AttributeError:
            return False

    async def set_ir_mix_instance(self, instance_id: int, mix_percent: float) -> bool:
        if not self._engine:
            return False
        try:
            return bool(await asyncio.to_thread(self._engine.set_ir_mix_instance, instance_id, mix_percent))
        except AttributeError:
            return False

    async def set_ir_bypass_instance(self, instance_id: int, bypass: bool) -> bool:
        if not self._engine:
            return False
        try:
            return bool(await asyncio.to_thread(self._engine.set_ir_bypass_instance, instance_id, bypass))
        except AttributeError:
            return False

    async def get_ir_info_instance(self, instance_id: int) -> Dict[str, Any]:
        if not self._engine:
            return {
                "path": "",
                "name": "",
                "length_samples": 0,
                "length_ms": 0.0,
                "sample_rate": 0.0,
                "channels": 0,
                "loaded": False,
                "mix": 0.0,
                "bypass": False,
            }
        try:
            return await asyncio.to_thread(self._engine.get_ir_info_instance, instance_id)
        except AttributeError:
            return {
                "path": "",
                "name": "",
                "length_samples": 0,
                "length_ms": 0.0,
                "sample_rate": 0.0,
                "channels": 0,
                "loaded": False,
                "mix": 0.0,
                "bypass": False,
            }

    # ========================================
    # Dynamics - Compressor (NEW)
    # ========================================

    async def set_compressor_threshold(self, db: float) -> None:
        """Set compressor threshold in dB (-60 to 0)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_compressor_threshold, db)

    async def set_compressor_ratio(self, ratio: float) -> None:
        """Set compressor ratio (1 to 20)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_compressor_ratio, ratio)

    async def set_compressor_attack(self, ms: float) -> None:
        """Set compressor attack time in ms (0.1 to 500)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_compressor_attack, ms)

    async def set_compressor_release(self, ms: float) -> None:
        """Set compressor release time in ms (10 to 5000)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_compressor_release, ms)

    async def set_compressor_knee(self, db: float) -> None:
        """Set compressor knee width in dB (0 to 24)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_compressor_knee, db)

    async def set_compressor_makeup_gain(self, db: float) -> None:
        """Set compressor makeup gain in dB (-12 to 24)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_compressor_makeup_gain, db)

    async def set_compressor_auto_makeup(self, enabled: bool) -> None:
        """Enable/disable auto makeup gain"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_compressor_auto_makeup, enabled)

    async def set_compressor_bypass(self, bypass: bool) -> None:
        """Bypass compressor"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_compressor_bypass, bypass)

    async def get_compressor_parameters(self) -> Dict[str, Any]:
        """Get all compressor parameters"""
        if not self._engine:
            return {
                "threshold": -12.0,
                "ratio": 4.0,
                "attack": 10.0,
                "release": 100.0,
                "knee": 6.0,
                "makeup_gain": 0.0,
                "auto_makeup": False,
                "bypass": False
            }
        return await asyncio.to_thread(self._engine.get_compressor_parameters)

    async def set_compressor_parameters(self, params: Dict[str, Any]) -> None:
        """Set all compressor parameters at once"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_compressor_parameters, params)

    async def get_compressor_metering(self) -> Dict[str, float]:
        """Get compressor metering (input, output, gain reduction)"""
        if not self._engine:
            return {
                "input_level": -100.0,
                "output_level": -100.0,
                "gain_reduction": 0.0,
                "input_rms": -100.0,
                "output_rms": -100.0
            }
        return await asyncio.to_thread(self._engine.get_compressor_metering)

    # ========================================
    # Dynamics - Limiter (NEW)
    # ========================================

    async def set_limiter_threshold(self, db: float) -> None:
        """Set limiter ceiling/threshold in dB"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_limiter_threshold, db)

    async def set_limiter_release(self, ms: float) -> None:
        """Set limiter release time in ms"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_limiter_release, ms)

    async def set_limiter_bypass(self, bypass: bool) -> None:
        """Bypass limiter"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_limiter_bypass, bypass)

    async def get_limiter_parameters(self) -> Dict[str, Any]:
        """Get all limiter parameters"""
        if not self._engine:
            return {
                "threshold": -1.0,
                "release": 100.0,
                "bypass": False
            }
        return await asyncio.to_thread(self._engine.get_limiter_parameters)

    async def get_limiter_metering(self) -> Dict[str, float]:
        """Get limiter metering (input, output, gain reduction)"""
        if not self._engine:
            return {
                "input_level": -100.0,
                "output_level": -100.0,
                "gain_reduction": 0.0,
                "input_rms": -100.0,
                "output_rms": -100.0
            }
        return await asyncio.to_thread(self._engine.get_limiter_metering)

    # ========================================
    # Dynamics - Noise Gate (NEW)
    # ========================================

    async def set_gate_threshold(self, db: float) -> None:
        """Set noise gate threshold in dB"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_gate_threshold, db)

    async def set_gate_ratio(self, ratio: float) -> None:
        """Set noise gate ratio"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_gate_ratio, ratio)

    async def set_gate_attack(self, ms: float) -> None:
        """Set noise gate attack time in ms"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_gate_attack, ms)

    async def set_gate_release(self, ms: float) -> None:
        """Set noise gate release time in ms"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_gate_release, ms)

    async def set_gate_bypass(self, bypass: bool) -> None:
        """Bypass noise gate"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_gate_bypass, bypass)

    async def get_gate_parameters(self) -> Dict[str, Any]:
        """Get all noise gate parameters"""
        if not self._engine:
            return {
                "threshold": -40.0,
                "ratio": 10.0,
                "attack": 1.0,
                "release": 100.0,
                "bypass": False
            }
        return await asyncio.to_thread(self._engine.get_gate_parameters)

    async def get_gate_metering(self) -> Dict[str, float]:
        """Get noise gate metering"""
        if not self._engine:
            return {
                "input_level": -100.0,
                "output_level": -100.0,
                "gain_reduction": 0.0,
                "input_rms": -100.0,
                "output_rms": -100.0
            }
        return await asyncio.to_thread(self._engine.get_gate_metering)

    # ========================================
    # Dynamics - Combined Access (NEW)
    # ========================================

    async def get_dynamics_metering(self) -> Dict[str, Dict[str, float]]:
        """Get all dynamics processor metering"""
        if not self._engine:
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
                "gate": empty_metering.copy()
            }
        return await asyncio.to_thread(self._engine.get_dynamics_metering)

    # ========================================
    # EQ / Filter Processing (NEW)
    # ========================================

    async def set_eq_band(self, index: int, params: Dict[str, Any]) -> None:
        """Set EQ band parameters"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_eq_band, index, params)

    async def set_eq_band_frequency(self, index: int, hz: float) -> None:
        """Set EQ band frequency"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_eq_band_frequency, index, hz)

    async def set_eq_band_gain(self, index: int, db: float) -> None:
        """Set EQ band gain"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_eq_band_gain, index, db)

    async def set_eq_band_q(self, index: int, q: float) -> None:
        """Set EQ band Q factor"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_eq_band_q, index, q)

    async def set_eq_band_type(self, index: int, filter_type: str) -> None:
        """Set EQ band filter type"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_eq_band_type, index, filter_type)

    async def set_eq_band_enabled(self, index: int, enabled: bool) -> None:
        """Enable/disable EQ band"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_eq_band_enabled, index, enabled)

    async def get_eq_band(self, index: int) -> Dict[str, Any]:
        """Get EQ band parameters"""
        if not self._engine:
            return {
                "type": "peak",
                "frequency": 1000.0,
                "gain": 0.0,
                "q": 1.0,
                "enabled": True
            }
        return await asyncio.to_thread(self._engine.get_eq_band, index)

    async def set_eq_output_gain(self, db: float) -> None:
        """Set EQ output gain"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_eq_output_gain, db)

    async def get_eq_output_gain(self) -> float:
        """Get EQ output gain"""
        if not self._engine:
            return 0.0
        return await asyncio.to_thread(self._engine.get_eq_output_gain)

    async def set_eq_bypass(self, bypass: bool) -> None:
        """Bypass EQ"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_eq_bypass, bypass)

    async def is_eq_bypassed(self) -> bool:
        """Check if EQ is bypassed"""
        if not self._engine:
            return False
        return await asyncio.to_thread(self._engine.is_eq_bypassed)

    async def get_eq_parameters(self) -> Dict[str, Any]:
        """Get all EQ parameters"""
        if not self._engine:
            default_band = {
                "type": "peak",
                "frequency": 1000.0,
                "gain": 0.0,
                "q": 1.0,
                "enabled": True
            }
            return {
                "bands": [default_band.copy() for _ in range(8)],
                "output_gain": 0.0,
                "bypass": False
            }
        return await asyncio.to_thread(self._engine.get_eq_parameters)

    async def set_eq_parameters(self, params: Dict[str, Any]) -> None:
        """Set all EQ parameters"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_eq_parameters, params)

    async def get_eq_frequency_response(self, frequencies: List[float]) -> List[float]:
        """Get EQ frequency response at given frequencies"""
        if not self._engine:
            return [0.0] * len(frequencies)
        return await asyncio.to_thread(self._engine.get_eq_frequency_response, frequencies)

    # ========================================
    # Parallel Processing Chains (NEW)
    # ========================================

    async def create_parallel_group(self, position: int = -1, num_branches: int = 2) -> int:
        """Create a parallel processing group at given position"""
        if not self._engine:
            return -1
        return await asyncio.to_thread(self._engine.create_parallel_group, position, num_branches)

    async def remove_parallel_group(self, group_id: int) -> bool:
        """Remove a parallel processing group"""
        if not self._engine:
            return False
        return await asyncio.to_thread(self._engine.remove_parallel_group, group_id)

    async def add_to_parallel_branch(self, group_id: int, branch_index: int,
                                      plugin_id: int, position: int = -1) -> bool:
        """Add a plugin to a parallel branch"""
        if not self._engine:
            return False
        return await asyncio.to_thread(self._engine.add_to_parallel_branch, group_id, branch_index, plugin_id, position)

    async def remove_from_parallel_branch(self, group_id: int, branch_index: int,
                                           plugin_id: int) -> bool:
        """Remove a plugin from a parallel branch"""
        if not self._engine:
            return False
        return await asyncio.to_thread(self._engine.remove_from_parallel_branch, group_id, branch_index, plugin_id)

    async def set_parallel_ab_blend(self, group_id: int, blend: float) -> None:
        """Set A/B blend for a parallel group (0.0 = all A, 1.0 = all B)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_parallel_ab_blend, group_id, blend)

    async def trigger_parallel_ab_switch(self, group_id: int, branch_index: int) -> bool:
        """Hard-switch an A/B group to branch 0 or 1 at the next zero crossing."""
        if not self._engine:
            return False
        method = getattr(self._engine, "trigger_parallel_ab_switch", None)
        if not callable(method):
            return False
        return bool(await asyncio.to_thread(method, group_id, branch_index))

    async def get_parallel_ab_blend(self, group_id: int) -> float:
        """Get A/B blend for a parallel group"""
        if not self._engine:
            return 0.5
        return await asyncio.to_thread(self._engine.get_parallel_ab_blend, group_id)

    async def set_parallel_branch_level(self, group_id: int, branch_index: int,
                                         level: float) -> None:
        """Set individual branch level (0.0 to 2.0)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_parallel_branch_level, group_id, branch_index, level)

    async def set_parallel_branch_chain_id(self, group_id: int, branch_index: int, chain_id: int) -> bool:
        """Associate a runtime chain ID with one branch of a parallel group."""
        if not self._engine:
            return False
        method = getattr(self._engine, "set_parallel_branch_chain_id", None)
        if not callable(method):
            return False
        return bool(await asyncio.to_thread(method, group_id, branch_index, chain_id))

    async def set_parallel_bypass(self, group_id: int, bypass: bool) -> None:
        """Set bypass for a parallel group"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_parallel_bypass, group_id, bypass)

    async def get_parallel_groups(self) -> List[Dict[str, Any]]:
        """Get all parallel processing groups"""
        if not self._engine:
            return []
        return await asyncio.to_thread(self._engine.get_parallel_groups)

    # ========================================
    # Neural Amp Modeler (RT-safe via JUCE C++)
    # ========================================

    async def is_nam_available(self) -> bool:
        """Check if NAM support is compiled into the JUCE engine"""
        if not self._engine:
            return False
        try:
            return await asyncio.to_thread(self._engine.is_nam_available)
        except AttributeError:
            return False

    async def load_nam_model(self, path: str) -> bool:
        """Load a NAM model (.nam file) via RT-safe JUCE engine

        This is the ONLY way to load NAM models for real-time audio.
        Loading happens on a background thread to avoid blocking audio.

        Args:
            path: Full path to .nam model file

        Returns:
            True if loading started successfully
        """
        if not self._engine:
            logger.error("Cannot load NAM model: engine not initialized")
            return False
        try:
            result = await asyncio.to_thread(self._engine.load_nam_model, path)
            if result:
                logger.info(f"NAM model loading started: {path}")
            else:
                logger.error(f"NAM model load failed to start: {path}")
            return result
        except AttributeError:
            logger.error("JUCE engine does not have NAM support compiled in")
            return False
        except Exception as e:
            logger.error(f"Error loading NAM model: {e}")
            return False

    async def unload_nam_model(self) -> None:
        """Unload the current NAM model"""
        if self._engine:
            try:
                await asyncio.to_thread(self._engine.unload_nam_model)
                logger.info("NAM model unloaded")
            except AttributeError:
                pass

    async def is_nam_model_loaded(self) -> bool:
        """Check if a NAM model is loaded and ready"""
        if not self._engine:
            return False
        try:
            return await asyncio.to_thread(self._engine.is_nam_model_loaded)
        except AttributeError:
            return False

    async def is_nam_loading(self) -> bool:
        """Check if a NAM model is currently loading"""
        if not self._engine:
            return False
        try:
            return await asyncio.to_thread(self._engine.is_nam_loading)
        except AttributeError:
            return False

    async def get_nam_model_info(self) -> Dict[str, Any]:
        """Get information about the currently loaded NAM model"""
        if not self._engine:
            return {
                "path": "",
                "name": "",
                "expected_sample_rate": 48000.0,
                "input_channels": 1,
                "output_channels": 1,
                "has_input_level": False,
                "has_output_level": False,
                "input_level": 0.0,
                "output_level": 0.0,
                "loaded": False
            }
        try:
            return await asyncio.to_thread(self._engine.get_nam_model_info)
        except AttributeError:
            return {
                "path": "",
                "name": "",
                "expected_sample_rate": 48000.0,
                "input_channels": 1,
                "output_channels": 1,
                "has_input_level": False,
                "has_output_level": False,
                "input_level": 0.0,
                "output_level": 0.0,
                "loaded": False
            }

    async def load_nam_model_instance(self, instance_id: int, path: str) -> bool:
        if not self._engine:
            return False
        try:
            return bool(await asyncio.to_thread(self._engine.load_nam_model_instance, instance_id, path))
        except AttributeError:
            return False

    async def unload_nam_model_instance(self, instance_id: int) -> bool:
        if not self._engine:
            return False
        try:
            return bool(await asyncio.to_thread(self._engine.unload_nam_model_instance, instance_id))
        except AttributeError:
            return False

    async def get_nam_model_info_instance(self, instance_id: int) -> Dict[str, Any]:
        if not self._engine:
            return {
                "path": "",
                "name": "",
                "expected_sample_rate": 48000.0,
                "input_channels": 1,
                "output_channels": 1,
                "has_input_level": False,
                "has_output_level": False,
                "input_level": -100.0,
                "output_level": -100.0,
                "loaded": False,
                "input_gain": 0.0,
                "output_gain": 0.0,
                "normalize": True,
                "bypass": False,
            }
        try:
            return await asyncio.to_thread(self._engine.get_nam_model_info_instance, instance_id)
        except AttributeError:
            return {
                "path": "",
                "name": "",
                "expected_sample_rate": 48000.0,
                "input_channels": 1,
                "output_channels": 1,
                "has_input_level": False,
                "has_output_level": False,
                "input_level": -100.0,
                "output_level": -100.0,
                "loaded": False,
                "input_gain": 0.0,
                "output_gain": 0.0,
                "normalize": True,
                "bypass": False,
            }

    async def is_nam_model_loaded_instance(self, instance_id: int) -> bool:
        info = await self.get_nam_model_info_instance(instance_id)
        return bool(info.get("loaded", False))

    async def is_nam_loading_instance(self, instance_id: int) -> bool:
        info = await self.get_nam_model_info_instance(instance_id)
        return bool(info.get("loading", False))

    async def set_nam_input_gain(self, db: float) -> None:
        """Set NAM input gain in dB"""
        if self._engine:
            try:
                await asyncio.to_thread(self._engine.set_nam_input_gain, db)
            except AttributeError:
                pass

    async def set_nam_input_gain_instance(self, instance_id: int, db: float) -> bool:
        if not self._engine:
            return False
        try:
            return bool(await asyncio.to_thread(self._engine.set_nam_input_gain_instance, instance_id, db))
        except AttributeError:
            return False

    async def get_nam_input_gain(self) -> float:
        """Get NAM input gain in dB"""
        if not self._engine:
            return 0.0
        try:
            return await asyncio.to_thread(self._engine.get_nam_input_gain)
        except AttributeError:
            return 0.0

    async def get_nam_input_gain_instance(self, instance_id: int) -> float:
        info = await self.get_nam_model_info_instance(instance_id)
        try:
            return float(info.get("input_gain", 0.0))
        except (TypeError, ValueError):
            return 0.0

    async def set_nam_output_gain(self, db: float) -> None:
        """Set NAM output gain in dB"""
        if self._engine:
            try:
                await asyncio.to_thread(self._engine.set_nam_output_gain, db)
            except AttributeError:
                pass

    async def set_nam_output_gain_instance(self, instance_id: int, db: float) -> bool:
        if not self._engine:
            return False
        try:
            return bool(await asyncio.to_thread(self._engine.set_nam_output_gain_instance, instance_id, db))
        except AttributeError:
            return False

    async def get_nam_output_gain(self) -> float:
        """Get NAM output gain in dB"""
        if not self._engine:
            return 0.0
        try:
            return await asyncio.to_thread(self._engine.get_nam_output_gain)
        except AttributeError:
            return 0.0

    async def get_nam_output_gain_instance(self, instance_id: int) -> float:
        info = await self.get_nam_model_info_instance(instance_id)
        try:
            return float(info.get("output_gain", 0.0))
        except (TypeError, ValueError):
            return 0.0

    async def set_nam_bypass(self, bypass: bool) -> None:
        """Set NAM bypass state"""
        if self._engine:
            try:
                await asyncio.to_thread(self._engine.set_nam_bypass, bypass)
            except AttributeError:
                pass

    async def set_nam_bypass_instance(self, instance_id: int, bypass: bool) -> bool:
        if not self._engine:
            return False
        try:
            return bool(await asyncio.to_thread(self._engine.set_nam_bypass_instance, instance_id, bypass))
        except AttributeError:
            return False

    async def is_nam_bypassed(self) -> bool:
        """Check if NAM is bypassed"""
        if not self._engine:
            return False
        try:
            return await asyncio.to_thread(self._engine.is_nam_bypassed)
        except AttributeError:
            return False

    async def is_nam_bypassed_instance(self, instance_id: int) -> bool:
        info = await self.get_nam_model_info_instance(instance_id)
        return bool(info.get("bypass", False))

    async def set_nam_normalize(self, normalize: bool) -> None:
        """Enable/disable NAM output normalization"""
        if self._engine:
            try:
                await asyncio.to_thread(self._engine.set_nam_normalize, normalize)
            except AttributeError:
                pass

    async def set_nam_normalize_instance(self, instance_id: int, normalize: bool) -> bool:
        if not self._engine:
            return False
        try:
            return bool(await asyncio.to_thread(self._engine.set_nam_normalize_instance, instance_id, normalize))
        except AttributeError:
            return False

    async def is_nam_normalized(self) -> bool:
        """Check if NAM normalization is enabled"""
        if not self._engine:
            return True
        try:
            return await asyncio.to_thread(self._engine.is_nam_normalized)
        except AttributeError:
            return True

    async def is_nam_normalized_instance(self, instance_id: int) -> bool:
        info = await self.get_nam_model_info_instance(instance_id)
        return bool(info.get("normalize", True))

    async def get_nam_input_level(self) -> float:
        """Get NAM input metering level in dB"""
        if not self._engine:
            return -100.0
        try:
            return await asyncio.to_thread(self._engine.get_nam_input_level)
        except AttributeError:
            return -100.0

    async def get_nam_input_level_instance(self, instance_id: int) -> float:
        info = await self.get_nam_model_info_instance(instance_id)
        try:
            return float(info.get("input_level", -100.0))
        except (TypeError, ValueError):
            return -100.0

    async def get_nam_output_level(self) -> float:
        """Get NAM output metering level in dB"""
        if not self._engine:
            return -100.0
        try:
            return await asyncio.to_thread(self._engine.get_nam_output_level)
        except AttributeError:
            return -100.0

    async def get_nam_output_level_instance(self, instance_id: int) -> float:
        info = await self.get_nam_model_info_instance(instance_id)
        try:
            return float(info.get("output_level", -100.0))
        except (TypeError, ValueError):
            return -100.0

    async def get_nam_status_instance(self, instance_id: int) -> Dict[str, Any]:
        model_info = await self.get_nam_model_info_instance(instance_id)
        return {
            "available": await self.is_nam_available(),
            "model_loaded": await self.is_nam_model_loaded_instance(instance_id),
            "loading": await self.is_nam_loading_instance(instance_id),
            "bypassed": await self.is_nam_bypassed_instance(instance_id),
            "normalized": await self.is_nam_normalized_instance(instance_id),
            "input_gain": await self.get_nam_input_gain_instance(instance_id),
            "output_gain": await self.get_nam_output_gain_instance(instance_id),
            "input_level": await self.get_nam_input_level_instance(instance_id),
            "output_level": await self.get_nam_output_level_instance(instance_id),
            "model_info": model_info,
        }

    async def get_nam_status(self) -> Dict[str, Any]:
        """Get comprehensive NAM status"""
        return {
            "available": await self.is_nam_available(),
            "model_loaded": await self.is_nam_model_loaded(),
            "loading": await self.is_nam_loading(),
            "bypassed": await self.is_nam_bypassed(),
            "normalized": await self.is_nam_normalized(),
            "input_gain": await self.get_nam_input_gain(),
            "output_gain": await self.get_nam_output_gain(),
            "input_level": await self.get_nam_input_level(),
            "output_level": await self.get_nam_output_level(),
            "model_info": await self.get_nam_model_info()
        }

    # ========================================
    # Multi-Format Plugin Support (NEW)
    # ========================================


    async def get_h3000_metering(self) -> Dict[str, float]:
        """Get H3000 metering data"""
        if not self._engine:
            return {
                "input_level_l": -100.0, "input_level_r": -100.0,
                "output_level_l": -100.0, "output_level_r": -100.0,
                "pitch_l_actual": 0.0, "pitch_r_actual": 0.0,
                "delay_l_actual": 0.0, "delay_r_actual": 0.0,
                "mod_phase": 0.0
            }
        metering = await asyncio.to_thread(self._engine.get_h3000_metering)
        return {
            "input_level_l": metering.get("input_level_l", -100.0),
            "input_level_r": metering.get("input_level_r", -100.0),
            "output_level_l": metering.get("output_level_l", -100.0),
            "output_level_r": metering.get("output_level_r", -100.0),
            "pitch_l_actual": metering.get("pitch_l_actual", 0.0),
            "pitch_r_actual": metering.get("pitch_r_actual", 0.0),
            "delay_l_actual": metering.get("delay_l_actual", 0.0),
            "delay_r_actual": metering.get("delay_r_actual", 0.0),
            "mod_phase": metering.get("mod_phase", 0.0)
        }

    async def get_h3000_algorithms(self) -> List[Dict[str, Any]]:
        """Get all H3000 algorithm presets"""
        return [
            {"index": 0, "id": "micropitch", "name": "MicroPitch", "short_name": "MICRO", "description": "Subtle pitch detune for stereo widening and ADT effects"},
            {"index": 1, "id": "dual_shift", "name": "Dual Shift", "short_name": "DUAL", "description": "Independent left/right pitch shifters with modulation"},
            {"index": 2, "id": "crystal_echoes", "name": "Crystal Echoes", "short_name": "CRYST", "description": "Shimmering delays with pitch-shifted feedback"},
            {"index": 3, "id": "stereo_shift", "name": "Stereo Shift", "short_name": "STERE", "description": "Wide stereo field with complementary pitch offsets"},
            {"index": 4, "id": "layered_shift", "name": "Layered Shift", "short_name": "LAYER", "description": "Multiple harmonized voices stacked in unison"},
            {"index": 5, "id": "swept_combs", "name": "Swept Combs", "short_name": "COMB", "description": "Modulated comb filters for flanging and metallic effects"},
            {"index": 6, "id": "stutter_shift", "name": "Stutter Shift", "short_name": "STUTT", "description": "Glitch-style retriggering with pitch bending"},
            {"index": 7, "id": "reverse_pitch", "name": "Reverse Pitch", "short_name": "REVRS", "description": "Reversed grains with pitch manipulation"},
            {"index": 8, "id": "band_delays", "name": "Band Delays", "short_name": "BAND", "description": "Multi-band delay with per-band pitch shifting"},
            {"index": 9, "id": "patch_factory", "name": "Patch Factory", "short_name": "PATCH", "description": "Complex multi-effect combinations"}
        ]

    # ============================================================
    # Lexi Love PCM 70 Reverb
    # ============================================================

    async def set_lexilove_algorithm(self, algorithm_index: int) -> None:
        """Set Lexi Love algorithm by index (0-8)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_algorithm, algorithm_index)

    async def set_lexilove_algorithm_by_name(self, name: str) -> None:
        """Set Lexi Love algorithm by name"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_algorithm_by_name, name)

    async def set_lexilove_pre_delay(self, ms: float) -> None:
        """Set Lexi Love pre-delay in milliseconds"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_pre_delay, ms)

    async def set_lexilove_decay_time(self, seconds: float) -> None:
        """Set Lexi Love decay time (RT60) in seconds"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_decay_time, seconds)

    async def set_lexilove_diffusion(self, percent: float) -> None:
        """Set Lexi Love diffusion amount"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_diffusion, percent)

    async def set_lexilove_mix(self, percent: float) -> None:
        """Set Lexi Love wet/dry mix"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_mix, percent)

    async def set_lexilove_high_cut(self, hz: float) -> None:
        """Set Lexi Love high cut frequency"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_high_cut, hz)

    async def set_lexilove_low_cut(self, hz: float) -> None:
        """Set Lexi Love low cut frequency"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_low_cut, hz)

    async def set_lexilove_low_decay_mult(self, mult: float) -> None:
        """Set Lexi Love low frequency decay multiplier"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_low_decay_mult, mult)

    async def set_lexilove_high_decay_mult(self, mult: float) -> None:
        """Set Lexi Love high frequency decay multiplier"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_high_decay_mult, mult)

    async def set_lexilove_low_crossover(self, hz: float) -> None:
        """Set Lexi Love low crossover frequency"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_low_crossover, hz)

    async def set_lexilove_high_crossover(self, hz: float) -> None:
        """Set Lexi Love high crossover frequency"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_high_crossover, hz)

    async def set_lexilove_early_level(self, percent: float) -> None:
        """Set Lexi Love early reflections level"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_early_level, percent)

    async def set_lexilove_early_pattern(self, percent: float) -> None:
        """Set Lexi Love early reflections pattern density"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_early_pattern, percent)

    async def set_lexilove_mod_depth(self, percent: float) -> None:
        """Set Lexi Love modulation depth (sparkle)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_mod_depth, percent)

    async def set_lexilove_mod_rate(self, hz: float) -> None:
        """Set Lexi Love modulation rate"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_mod_rate, hz)

    async def set_lexilove_bypass(self, bypass: bool) -> None:
        """Set Lexi Love bypass state"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_bypass, bypass)

    async def set_lexilove_spillover(self, enabled: bool) -> None:
        """Set Lexi Love spillover (tail continues on bypass)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_lexilove_spillover, enabled)

    async def stage_lexilove_spillover(self) -> bool:
        if not self._engine or not hasattr(self._engine, "stage_lexilove_spillover"):
            return False
        return bool(await asyncio.to_thread(self._engine.stage_lexilove_spillover))

    async def get_lexilove_parameters(self) -> Dict[str, Any]:
        """Get all Lexi Love parameters"""
        if not self._engine:
            return {
                "algorithm": 1, "algorithm_name": "rich_plate",
                "pre_delay": 40.0, "decay_time": 2.5, "diffusion": 85.0,
                "low_decay_mult": 1.0, "high_decay_mult": 0.8,
                "low_crossover": 500.0, "high_crossover": 9000.0,
                "early_level": 70.0, "early_pattern": 50.0,
                "mod_depth": 15.0, "mod_rate": 0.8,
                "mix": 35.0, "high_cut": 12000.0, "low_cut": 40.0,
                "bypass": False, "spillover": True
            }
        params = await asyncio.to_thread(self._engine.get_lexilove_parameters)
        return {
            "algorithm_index": params.get("algorithm_index", 1),
            "algorithm": params.get("algorithm", "rich_plate"),
            "pre_delay": params.get("pre_delay", 40.0),
            "decay_time": params.get("decay_time", 2.5),
            "diffusion": params.get("diffusion", 85.0),
            "low_decay_mult": params.get("low_decay_mult", 1.0),
            "high_decay_mult": params.get("high_decay_mult", 0.8),
            "low_crossover": params.get("low_crossover", 500.0),
            "high_crossover": params.get("high_crossover", 9000.0),
            "early_level": params.get("early_level", 70.0),
            "early_pattern": params.get("early_pattern", 50.0),
            "mod_depth": params.get("mod_depth", 15.0),
            "mod_rate": params.get("mod_rate", 0.8),
            "mix": params.get("mix", 35.0),
            "high_cut": params.get("high_cut", 12000.0),
            "low_cut": params.get("low_cut", 40.0),
            "bypass": params.get("bypass", False),
            "spillover": params.get("spillover", True)
        }

    async def get_lexilove_metering(self) -> Dict[str, float]:
        """Get Lexi Love metering data"""
        if not self._engine:
            return {
                "input_level_l": -100.0, "input_level_r": -100.0,
                "output_level_l": -100.0, "output_level_r": -100.0,
                "reverb_level_l": -100.0, "reverb_level_r": -100.0,
                "early_level": -100.0, "late_level": -100.0,
                "mod_lfo_phase": 0.0, "current_decay": 2.5
            }
        metering = await asyncio.to_thread(self._engine.get_lexilove_metering)
        return {
            "input_level_l": metering.get("input_level_l", -100.0),
            "input_level_r": metering.get("input_level_r", -100.0),
            "output_level_l": metering.get("output_level_l", -100.0),
            "output_level_r": metering.get("output_level_r", -100.0),
            "reverb_level_l": metering.get("reverb_level_l", -100.0),
            "reverb_level_r": metering.get("reverb_level_r", -100.0),
            "early_level": metering.get("early_level", -100.0),
            "late_level": metering.get("late_level", -100.0),
            "mod_lfo_phase": metering.get("mod_lfo_phase", 0.0),
            "current_decay": metering.get("current_decay", 2.5)
        }

    async def get_lexilove_algorithms(self) -> List[Dict[str, Any]]:
        """Get all Lexi Love algorithm presets"""
        return [
            {"index": 0, "id": "tiled_room", "name": "Tiled Room V2.0", "short_name": "TILED", "description": "Legendary preset with 'spitty' early reflections - lively on drums"},
            {"index": 1, "id": "rich_plate", "name": "Rich Plate", "short_name": "PLATE", "description": "Warm vocals - the studio standard for countless recordings"},
            {"index": 2, "id": "concert_hall", "name": "Concert Hall", "short_name": "HALL", "description": "Classic 80s reverb with time variation and sparkle"},
            {"index": 3, "id": "small_room", "name": "Small Room", "short_name": "SMALL", "description": "Tight, customizable space for close-mic sounds"},
            {"index": 4, "id": "rich_chamber", "name": "Rich Chamber", "short_name": "CHAMB", "description": "Warm thick chamber with prominent early reflections"},
            {"index": 5, "id": "gymnasium", "name": "Gymnasium", "short_name": "GYM", "description": "Large acoustic space simulation with long decay"},
            {"index": 6, "id": "long_hall", "name": "Long Hall", "short_name": "LONG", "description": "Extended decay concert hall for ambient textures"},
            {"index": 7, "id": "gated_plate", "name": "Gated Plate", "short_name": "GATED", "description": "Compressed/gated reverb for drums and dramatic effects"},
            {"index": 8, "id": "infinite", "name": "Infinite", "short_name": "INF", "description": "Special effects and atmospheric textures - near-infinite decay"}
        ]

    # ============================================================
    # Peavey 5150 Block Letter Amp Simulator
    # ============================================================

    async def set_peavey5150_bypass(self, bypass: bool) -> None:
        """Set Peavey 5150 bypass state"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_peavey5150_bypass, bypass)

    async def set_peavey5150_pre_gain(self, value: float) -> None:
        """Set Peavey 5150 preamp gain (0-10)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_peavey5150_pre_gain, value)

    async def set_peavey5150_post_gain(self, value: float) -> None:
        """Set Peavey 5150 master volume (0-10)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_peavey5150_post_gain, value)

    async def set_peavey5150_low(self, value: float) -> None:
        """Set Peavey 5150 bass tone (0-10)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_peavey5150_low, value)

    async def set_peavey5150_mid(self, value: float) -> None:
        """Set Peavey 5150 mid tone (0-10)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_peavey5150_mid, value)

    async def set_peavey5150_high(self, value: float) -> None:
        """Set Peavey 5150 treble tone (0-10)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_peavey5150_high, value)

    async def set_peavey5150_presence(self, value: float) -> None:
        """Set Peavey 5150 presence (0-10)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_peavey5150_presence, value)

    async def set_peavey5150_resonance(self, value: float) -> None:
        """Set Peavey 5150 resonance (0-10)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_peavey5150_resonance, value)

    async def set_peavey5150_bright(self, on: bool) -> None:
        """Set Peavey 5150 bright switch"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_peavey5150_bright, on)

    async def set_peavey5150_bias(self, value: float) -> None:
        """Set Peavey 5150 power tube bias (0-10, 0=cold stock)"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_peavey5150_bias, value)

    async def set_peavey5150_preset(self, preset_name: str) -> None:
        """Set Peavey 5150 preset by name"""
        if self._engine:
            await asyncio.to_thread(self._engine.set_peavey5150_preset, preset_name)

    async def get_peavey5150_parameters(self) -> Dict[str, Any]:
        """Get all Peavey 5150 parameters"""
        if not self._engine:
            return {
                "pre_gain": 5.0, "post_gain": 3.0,
                "low": 5.0, "mid": 5.0, "high": 5.0,
                "presence": 5.0, "resonance": 5.0,
                "bright": False, "bias": 3.0,
                "preset": 0, "preset_name": "manual",
                "bypass": False
            }
        params = await asyncio.to_thread(self._engine.get_peavey5150_parameters)
        return {
            "pre_gain": params.get("pre_gain", 5.0),
            "post_gain": params.get("post_gain", 3.0),
            "low": params.get("low", 5.0),
            "mid": params.get("mid", 5.0),
            "high": params.get("high", 5.0),
            "presence": params.get("presence", 5.0),
            "resonance": params.get("resonance", 5.0),
            "bright": params.get("bright", False),
            "bias": params.get("bias", 3.0),
            "preset": params.get("preset", 0),
            "preset_name": params.get("preset_name", "manual"),
            "bypass": params.get("bypass", False)
        }

    async def get_peavey5150_metering(self) -> Dict[str, float]:
        """Get Peavey 5150 metering data"""
        if not self._engine:
            return {
                "input_level": -100.0, "output_level": -100.0,
                "preamp_level": -100.0, "power_level": -100.0,
                "supply_sag": 1.0, "cpu_load": 0.0
            }
        metering = await asyncio.to_thread(self._engine.get_peavey5150_metering)
        return {
            "input_level": metering.get("input_level", -100.0),
            "output_level": metering.get("output_level", -100.0),
            "preamp_level": metering.get("preamp_level", -100.0),
            "power_level": metering.get("power_level", -100.0),
            "supply_sag": metering.get("supply_sag", 1.0),
            "cpu_load": metering.get("cpu_load", 0.0)
        }

    async def get_peavey5150_presets(self) -> List[Dict[str, str]]:
        """Get all available Peavey 5150 presets"""
        return [
            {"id": "manual", "name": "Manual", "description": "User-defined settings"},
            {"id": "brown_sound", "name": "Brown Sound", "description": "Classic Van Halen studio tone"},
            {"id": "pantera_scoop", "name": "Pantera Scoop", "description": "Scooped mids, high gain, cold bias"},
            {"id": "modern_metal", "name": "Modern Metal", "description": "Maximum gain, cold bias, high presence"},
            {"id": "hard_rock", "name": "Hard Rock", "description": "Medium gain, bumped mids, warm power"},
            {"id": "crunch", "name": "Crunch", "description": "Low gain, bright switch, touch sensitive"}
        ]

    # ============================================================
    # Tweed Bassman 5F6-A Amplifier Simulator
    # ============================================================

    async def set_tweedbassman_bypass(self, bypass: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_bypass, bypass)

    async def set_tweedbassman_channel_mode(self, mode: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_channel_mode, mode)

    async def set_tweedbassman_normal_volume(self, value: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_normal_volume, value)

    async def set_tweedbassman_bright_volume(self, value: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_bright_volume, value)

    async def set_tweedbassman_bright_cap(self, on: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_bright_cap, on)

    async def set_tweedbassman_v1_tube_type(self, type: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_v1_tube_type, type)

    async def set_tweedbassman_cathode_bypass(self, on: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_cathode_bypass, on)

    async def set_tweedbassman_cathode_bias(self, mode: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_cathode_bias, mode)

    async def set_tweedbassman_treble(self, value: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_treble, value)

    async def set_tweedbassman_mid(self, value: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_mid, value)

    async def set_tweedbassman_bass(self, value: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_bass, value)

    async def set_tweedbassman_raw_switch(self, on: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_raw_switch, on)

    async def set_tweedbassman_master_volume(self, value: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_master_volume, value)

    async def set_tweedbassman_presence(self, value: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_presence, value)

    async def set_tweedbassman_nfb_mode(self, mode: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_nfb_mode, mode)

    async def set_tweedbassman_power_tube_type(self, type: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_power_tube_type, type)

    async def set_tweedbassman_bias_mode(self, mode: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_bias_mode, mode)

    async def set_tweedbassman_rectifier_type(self, type: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_rectifier_type, type)

    async def set_tweedbassman_output_level(self, dB: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_output_level, dB)

    async def set_tweedbassman_cabinet_enabled(self, on: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_cabinet_enabled, on)

    async def set_tweedbassman_cabinet_ir(self, index: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_cabinet_ir, index)

    async def set_tweedbassman_preset(self, preset_name: str) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_tweedbassman_preset, preset_name)

    async def get_tweedbassman_parameters(self) -> Dict[str, Any]:
        if not self._engine:
            return {
                "channel_mode": 0, "normal_volume": 5.0, "bright_volume": 5.0, "bright_cap": True,
                "v1_tube_type": 0, "cathode_bypass": False, "cathode_bias": 0,
                "treble": 5.0, "mid": 5.0, "bass": 5.0, "raw_switch": False,
                "master_volume": 5.0, "presence": 5.0, "nfb_mode": 0,
                "power_tube_type": 0, "bias_mode": 0, "rectifier_type": 0,
                "output_level": 0.0, "cabinet_enabled": True, "cabinet_ir": 0,
                "preset": 0, "preset_name": "manual", "bypass": False
            }
        params = await asyncio.to_thread(self._engine.get_tweedbassman_parameters)
        return {
            "channel_mode": params.get("channel_mode", 0),
            "normal_volume": params.get("normal_volume", 5.0),
            "bright_volume": params.get("bright_volume", 5.0),
            "bright_cap": params.get("bright_cap", True),
            "v1_tube_type": params.get("v1_tube_type", 0),
            "cathode_bypass": params.get("cathode_bypass", False),
            "cathode_bias": params.get("cathode_bias", 0),
            "treble": params.get("treble", 5.0),
            "mid": params.get("mid", 5.0),
            "bass": params.get("bass", 5.0),
            "raw_switch": params.get("raw_switch", False),
            "master_volume": params.get("master_volume", 5.0),
            "presence": params.get("presence", 5.0),
            "nfb_mode": params.get("nfb_mode", 0),
            "power_tube_type": params.get("power_tube_type", 0),
            "bias_mode": params.get("bias_mode", 0),
            "rectifier_type": params.get("rectifier_type", 0),
            "output_level": params.get("output_level", 0.0),
            "cabinet_enabled": params.get("cabinet_enabled", True),
            "cabinet_ir": params.get("cabinet_ir", 0),
            "preset": params.get("preset", 0),
            "preset_name": params.get("preset_name", "manual"),
            "bypass": params.get("bypass", False)
        }

    async def get_tweedbassman_metering(self) -> Dict[str, float]:
        if not self._engine:
            return {
                "input_level": -100.0, "output_level": -100.0,
                "preamp_level": -100.0, "power_level": -100.0,
                "supply_sag": 1.0, "cpu_load": 0.0
            }
        metering = await asyncio.to_thread(self._engine.get_tweedbassman_metering)
        return {
            "input_level": metering.get("input_level", -100.0),
            "output_level": metering.get("output_level", -100.0),
            "preamp_level": metering.get("preamp_level", -100.0),
            "power_level": metering.get("power_level", -100.0),
            "supply_sag": metering.get("supply_sag", 1.0),
            "cpu_load": metering.get("cpu_load", 0.0)
        }

    async def get_tweedbassman_presets(self) -> List[Dict[str, str]]:
        return [
            {"id": "manual", "name": "Manual", "description": "User-defined settings"},
            {"id": "stock_5f6a", "name": "Stock 5F6-A", "description": "All stock, clean to edge of breakup"},
            {"id": "cranked_tweed", "name": "Cranked Tweed", "description": "Classic pushed Bassman"},
            {"id": "blues_breakup", "name": "Blues Breakup", "description": "Warm, touch-sensitive"},
            {"id": "country_clean", "name": "Country Clean", "description": "Sparkly headroom"},
            {"id": "jumped_dirty", "name": "Jumped & Dirty", "description": "Fat overdriven tone"},
            {"id": "high_gain_mod", "name": "High Gain Mod", "description": "Hot-rodded preamp"},
            {"id": "neil_young", "name": "Neil Young", "description": "Ragged, searing leads"},
            {"id": "tweed_deluxe", "name": "Tweed Deluxe", "description": "Simulates 5E3 character"},
            {"id": "jtm45_flavor", "name": "JTM45 Flavor", "description": "Marshall-esque"},
            {"id": "sag_monster", "name": "Sag Monster", "description": "Maximum compression/bloom"},
            {"id": "pedal_platform", "name": "Pedal Platform", "description": "Maximum clean headroom"},
            {"id": "bright_chimey", "name": "Bright & Chimey", "description": "Fender sparkle"},
            {"id": "srv_tone", "name": "SRV Tone", "description": "Thick Texas blues"},
            {"id": "recording_di", "name": "Recording DI", "description": "Balanced, mix-ready"},
        ]

    # ============================================================
    # PassionFX Multi-Effect (Steve Vai Passion & Warfare)
    # ============================================================

    async def set_passionfx_bypass(self, bypass: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_bypass, bypass)

    async def set_passionfx_gate_enabled(self, enabled: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_gate_enabled, enabled)

    async def set_passionfx_gate_threshold(self, dB: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_gate_threshold, dB)

    async def set_passionfx_gate_release(self, ms: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_gate_release, ms)

    async def set_passionfx_comp_enabled(self, enabled: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_comp_enabled, enabled)

    async def set_passionfx_comp_threshold(self, dB: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_comp_threshold, dB)

    async def set_passionfx_comp_ratio(self, ratio: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_comp_ratio, ratio)

    async def set_passionfx_comp_attack(self, ms: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_comp_attack, ms)

    async def set_passionfx_comp_release(self, ms: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_comp_release, ms)

    async def set_passionfx_comp_glassy(self, glassy: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_comp_glassy, glassy)

    async def set_passionfx_wah_enabled(self, enabled: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_wah_enabled, enabled)

    async def set_passionfx_wah_mode(self, mode: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_wah_mode, mode)

    async def set_passionfx_wah_position(self, position: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_wah_position, position)

    async def set_passionfx_wah_q(self, q: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_wah_q, q)

    async def set_passionfx_phaser_enabled(self, enabled: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_phaser_enabled, enabled)

    async def set_passionfx_phaser_rate(self, hz: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_phaser_rate, hz)

    async def set_passionfx_phaser_depth(self, depth: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_phaser_depth, depth)

    async def set_passionfx_phaser_stages(self, stages: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_phaser_stages, stages)

    async def set_passionfx_phaser_feedback(self, feedback: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_phaser_feedback, feedback)

    async def set_passionfx_chorus_enabled(self, enabled: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_chorus_enabled, enabled)

    async def set_passionfx_chorus_rate(self, hz: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_chorus_rate, hz)

    async def set_passionfx_chorus_depth(self, depth: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_chorus_depth, depth)

    async def set_passionfx_chorus_voices(self, voices: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_chorus_voices, voices)

    async def set_passionfx_chorus_mix(self, mix: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_chorus_mix, mix)

    async def set_passionfx_pitch_enabled(self, enabled: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_pitch_enabled, enabled)

    async def set_passionfx_pitch_semitones(self, semitones: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_pitch_semitones, semitones)

    async def set_passionfx_pitch_mix(self, mix: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_pitch_mix, mix)

    async def set_passionfx_harm_enabled(self, enabled: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_harm_enabled, enabled)

    async def set_passionfx_harm_voice1_interval(self, semitones: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_harm_voice1_interval, semitones)

    async def set_passionfx_harm_voice2_interval(self, semitones: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_harm_voice2_interval, semitones)

    async def set_passionfx_harm_detune_cents(self, cents: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_harm_detune_cents, cents)

    async def set_passionfx_harm_mix(self, mix: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_harm_mix, mix)

    async def set_passionfx_delay_enabled(self, enabled: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_delay_enabled, enabled)

    async def set_passionfx_delay_time_l(self, ms: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_delay_time_l, ms)

    async def set_passionfx_delay_time_r(self, ms: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_delay_time_r, ms)

    async def set_passionfx_delay_feedback(self, feedback: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_delay_feedback, feedback)

    async def set_passionfx_delay_mix(self, mix: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_delay_mix, mix)

    async def set_passionfx_delay_freeze(self, freeze: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_delay_freeze, freeze)

    async def set_passionfx_delay_pitch_shift_l(self, semitones: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_delay_pitch_shift_l, semitones)

    async def set_passionfx_delay_pitch_shift_r(self, semitones: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_delay_pitch_shift_r, semitones)

    async def set_passionfx_reverb_enabled(self, enabled: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_reverb_enabled, enabled)

    async def set_passionfx_reverb_type(self, rtype: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_reverb_type, rtype)

    async def set_passionfx_reverb_decay(self, seconds: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_reverb_decay, seconds)

    async def set_passionfx_reverb_shimmer_amount(self, amount: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_reverb_shimmer_amount, amount)

    async def set_passionfx_reverb_shimmer_interval(self, semitones: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_reverb_shimmer_interval, semitones)

    async def set_passionfx_reverb_mix(self, mix: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_reverb_mix, mix)

    async def set_passionfx_reverb_freeze(self, freeze: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_reverb_freeze, freeze)

    async def set_passionfx_eq_enabled(self, enabled: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_eq_enabled, enabled)

    async def set_passionfx_eq_low_gain(self, dB: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_eq_low_gain, dB)

    async def set_passionfx_eq_mid_gain(self, dB: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_eq_mid_gain, dB)

    async def set_passionfx_eq_high_gain(self, dB: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_eq_high_gain, dB)

    async def set_passionfx_eq_tilt(self, tilt: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_eq_tilt, tilt)

    async def set_passionfx_exciter_enabled(self, enabled: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_exciter_enabled, enabled)

    async def set_passionfx_exciter_warmth(self, warmth: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_exciter_warmth, warmth)

    async def set_passionfx_exciter_presence(self, presence: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_exciter_presence, presence)

    async def set_passionfx_exciter_air(self, air: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_exciter_air, air)

    async def set_passionfx_trem_enabled(self, enabled: bool) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_trem_enabled, enabled)

    async def set_passionfx_trem_rate(self, hz: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_trem_rate, hz)

    async def set_passionfx_trem_depth(self, depth: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_trem_depth, depth)

    async def set_passionfx_trem_waveform(self, waveform: int) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_trem_waveform, waveform)

    async def set_passionfx_mix(self, mix: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_mix, mix)

    async def set_passionfx_output_level(self, dB: float) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_output_level, dB)

    async def set_passionfx_preset(self, preset_name: str) -> None:
        if self._engine:
            await asyncio.to_thread(self._engine.set_passionfx_preset, preset_name)

    async def get_passionfx_parameters(self) -> Dict[str, Any]:
        if not self._engine:
            return {
                "gate_enabled": False, "gate_threshold": -40.0, "gate_release": 100.0,
                "comp_enabled": False, "comp_threshold": -20.0, "comp_ratio": 4.0,
                "comp_attack": 10.0, "comp_release": 100.0, "comp_glassy": False,
                "wah_enabled": False, "wah_mode": 0, "wah_position": 0.5, "wah_q": 5.0,
                "phaser_enabled": False, "phaser_rate": 0.5, "phaser_depth": 0.5,
                "phaser_stages": 4, "phaser_feedback": 0.3,
                "chorus_enabled": False, "chorus_rate": 0.8, "chorus_depth": 0.5,
                "chorus_voices": 3, "chorus_mix": 0.5,
                "pitch_enabled": False, "pitch_semitones": 0.0, "pitch_mix": 0.5,
                "harm_enabled": False, "harm_voice1_interval": 4.0, "harm_voice2_interval": 7.0,
                "harm_detune_cents": 5.0, "harm_mix": 0.5,
                "delay_enabled": False, "delay_time_l": 375.0, "delay_time_r": 500.0,
                "delay_feedback": 0.35, "delay_mix": 0.4, "delay_freeze": False,
                "delay_pitch_shift_l": 0.0, "delay_pitch_shift_r": 0.0,
                "reverb_enabled": False, "reverb_type": 0, "reverb_decay": 2.5,
                "reverb_shimmer_amount": 0.0, "reverb_shimmer_interval": 12.0,
                "reverb_mix": 0.3, "reverb_freeze": False,
                "eq_enabled": False, "eq_low_gain": 0.0, "eq_mid_gain": 0.0,
                "eq_high_gain": 0.0, "eq_tilt": 0.0,
                "exciter_enabled": False, "exciter_warmth": 0.0,
                "exciter_presence": 0.0, "exciter_air": 0.0,
                "trem_enabled": False, "trem_rate": 5.0, "trem_depth": 0.5, "trem_waveform": 0,
                "mix": 1.0, "output_level": 0.0,
                "preset": 0, "preset_name": "manual", "bypass": False
            }
        return dict(await asyncio.to_thread(self._engine.get_passionfx_parameters))

    async def get_passionfx_metering(self) -> Dict[str, float]:
        if not self._engine:
            return {
                "input_level_l": -100.0, "input_level_r": -100.0,
                "output_level_l": -100.0, "output_level_r": -100.0,
                "gate_gain": 1.0, "comp_gain_reduction": 0.0,
                "reverb_level_l": -100.0, "reverb_level_r": -100.0,
                "delay_level_l": -100.0, "delay_level_r": -100.0,
                "phaser_lfo_phase": 0.0, "tremolo_lfo_phase": 0.0,
                "wah_position": 0.5
            }
        return dict(await asyncio.to_thread(self._engine.get_passionfx_metering))

    async def get_passionfx_presets(self) -> List[Dict[str, str]]:
        if self._engine:
            return [dict(p) for p in await asyncio.to_thread(self._engine.get_passionfx_presets)]
        return [
            {"id": "manual", "name": "Manual", "track": "", "description": "User-defined settings"},
            {"id": "liberty", "name": "Liberty", "track": "Track 1", "description": "Soaring clean lead"},
            {"id": "erotic_nightmares", "name": "Erotic Nightmares", "track": "Track 2", "description": "Aggressive dark"},
            {"id": "the_animal", "name": "The Animal", "track": "Track 3", "description": "Raw primal overdrive"},
            {"id": "answers", "name": "Answers", "track": "Track 4", "description": "Emotional ballad shimmer"},
            {"id": "the_riddle", "name": "The Riddle", "track": "Track 5", "description": "Mysterious phased"},
            {"id": "ballerina_12_24", "name": "Ballerina 12/24", "track": "Track 6", "description": "Delicate harmonics"},
            {"id": "for_the_love_of_god", "name": "For the Love of God", "track": "Track 7", "description": "Epic sustain & reverb"},
            {"id": "the_audience_is_listening", "name": "The Audience Is Listening", "track": "Track 8", "description": "Wah-heavy funk"},
            {"id": "i_would_love_to", "name": "I Would Love To", "track": "Track 9", "description": "Lush chorus & delay"},
            {"id": "blue_powder", "name": "Blue Powder", "track": "Track 10", "description": "Jazzy clean warm"},
            {"id": "greasy_kids_stuff", "name": "Greasy Kid's Stuff", "track": "Track 11", "description": "Funky wah tremolo"},
            {"id": "alien_water_kiss", "name": "Alien Water Kiss", "track": "Track 12", "description": "Pitch-shifted ambient"},
            {"id": "sisters", "name": "Sisters", "track": "Track 13", "description": "Harmonized lead"},
            {"id": "love_secrets", "name": "Love Secrets", "track": "Track 14", "description": "Shredding with tight delay"}
        ]

    # ========================================
    # SynthForge (Phase 1 scaffold)
    # ========================================

    async def get_synthforge_parts_config(self) -> List[Dict[str, Any]]:
        if not self._engine:
            return [
                {
                    "part_index": index,
                    "midi_channel": index + 1,
                    "output_bus": "main",
                    "level": 1.0,
                    "pan": 0.0,
                    "mute": False,
                    "solo": False,
                }
                for index in range(16)
            ]
        return [dict(part) for part in await asyncio.to_thread(self._engine.get_synthforge_parts_config)]

    async def set_synthforge_part_config(self, part_index: int, config: Dict[str, Any]) -> bool:
        if not self._engine:
            return False
        payload = dict(config)
        payload["part_index"] = part_index
        return bool(await asyncio.to_thread(self._engine.set_synthforge_part_config, part_index, payload))

    async def set_synthforge_part_channel(self, part_index: int, midi_channel: int) -> bool:
        if not self._engine:
            return False
        return bool(await asyncio.to_thread(self._engine.set_synthforge_part_channel, part_index, midi_channel))

    async def get_synthforge_part_channel(self, part_index: int) -> int:
        if not self._engine:
            return -1
        return int(await asyncio.to_thread(self._engine.get_synthforge_part_channel, part_index))

    async def get_synthforge_part_parameters(self, part_index: int) -> Dict[str, float]:
        if not self._engine:
            return {}
        return dict(await asyncio.to_thread(self._engine.get_synthforge_part_parameters, part_index))

    async def set_synthforge_parameter(self, part_index: int, param: str, value: float) -> bool:
        if not self._engine:
            return False
        return bool(await asyncio.to_thread(self._engine.set_synthforge_parameter, part_index, param, value))

    async def load_synthforge_sfz(self, part_index: int, sfz_path: str) -> bool:
        if not self._engine:
            return False
        return bool(await asyncio.to_thread(self._engine.load_synthforge_sfz, part_index, sfz_path))

    async def load_synthforge_soundfont(
        self,
        part_index: int,
        soundfont_path: str,
        bank: int,
        program: int,
        preset_name: str = "",
    ) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "load_synthforge_soundfont", None)
        if not callable(method):
            return False
        return bool(method(part_index, soundfont_path, bank, program, preset_name))

    async def reload_synthforge_sfz_if_changed(self, part_index: int) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "reload_synthforge_part_sfz_if_changed", None)
        if not callable(method):
            return False
        return bool(method(part_index))

    async def get_synthforge_part_sample_status(self, part_index: int) -> Dict[str, Any]:
        if not self._engine:
            return {
                "loaded": False,
                "sampler_mode": False,
                "part_index": part_index,
                "region_count": 0,
                "loaded_sample_count": 0,
                "sfz_path": "",
                "soundfont_path": "",
                "soundfont_format": "",
                "active_bank": 0,
                "active_program": 0,
                "active_preset_name": "",
                "engine": "none",
                "engine_available": False,
                "last_error": "Engine not initialized",
                "warnings": [],
            }
        return dict(await asyncio.to_thread(self._engine.get_synthforge_part_sample_status, part_index))

    async def set_synthforge_part_sampler_backend(self, part_index: int, backend: str) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "set_synthforge_part_sampler_backend", None)
        if not callable(method):
            return False
        return bool(method(part_index, backend))

    async def get_synthforge_part_sampler_backend(self, part_index: int) -> str:
        if not self._engine:
            return "native"
        method = getattr(self._engine, "get_synthforge_part_sampler_backend", None)
        if not callable(method):
            return "native"
        return str(method(part_index))

    async def set_synthforge_part_streaming_config(self, part_index: int, config: Dict[str, Any]) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "set_synthforge_part_streaming_config", None)
        if not callable(method):
            return False
        return bool(method(part_index, dict(config)))

    async def get_synthforge_part_streaming_config(self, part_index: int) -> Dict[str, Any]:
        if not self._engine:
            return {
                "enabled": True,
                "preload_size": 131072,
                "max_voices": 64,
                "interpolation": "hermite",
                "quality_live": 5,
                "quality_freewheeling": 8,
                "memory_limit_mb": 256,
            }
        method = getattr(self._engine, "get_synthforge_part_streaming_config", None)
        if not callable(method):
            return {
                "enabled": True,
                "preload_size": 131072,
                "max_voices": 64,
                "interpolation": "hermite",
                "quality_live": 5,
                "quality_freewheeling": 8,
                "memory_limit_mb": 256,
            }
        return dict(method(part_index))

    async def set_synthforge_part_hot_reload(self, part_index: int, enabled: bool, interval_ms: int = 1000) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "set_synthforge_part_hot_reload", None)
        if not callable(method):
            return False
        return bool(method(part_index, bool(enabled), int(interval_ms)))

    async def get_synthforge_part_hot_reload_status(self, part_index: int) -> Dict[str, Any]:
        if not self._engine:
            return {
                "enabled": False,
                "interval_ms": 1000,
                "pending_reload": False,
                "reloaded": False,
                "generation": 0,
                "last_reload_iso": "",
                "last_error": "Engine not initialized",
            }
        method = getattr(self._engine, "get_synthforge_part_hot_reload_status", None)
        if not callable(method):
            return {
                "enabled": False,
                "interval_ms": 1000,
                "pending_reload": False,
                "reloaded": False,
                "generation": 0,
                "last_reload_iso": "",
                "last_error": "Hot reload not supported by this engine build",
            }
        return dict(method(part_index))

    async def load_synthforge_part_scala_tuning(
        self,
        part_index: int,
        scala_path: str,
        root_key: int = 60,
        reference_hz: float = 440.0,
    ) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "load_synthforge_part_scala_tuning", None)
        if not callable(method):
            return False
        return bool(method(part_index, scala_path, int(root_key), float(reference_hz)))

    async def get_synthforge_part_scala_tuning(self, part_index: int) -> Dict[str, Any]:
        if not self._engine:
            return {
                "enabled": False,
                "scala_path": "",
                "root_key": 60,
                "reference_hz": 440.0,
            }
        method = getattr(self._engine, "get_synthforge_part_scala_tuning", None)
        if not callable(method):
            return {
                "enabled": False,
                "scala_path": "",
                "root_key": 60,
                "reference_hz": 440.0,
            }
        return dict(method(part_index))

    async def set_synthforge_part_mpe_config(self, part_index: int, config: Dict[str, Any]) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "set_synthforge_part_mpe_config", None)
        if not callable(method):
            return False
        return bool(method(part_index, dict(config)))

    async def get_synthforge_part_mpe_config(self, part_index: int) -> Dict[str, Any]:
        if not self._engine:
            return {
                "enabled": False,
                "lower_zone_channels": 0,
                "upper_zone_channels": 0,
                "pitch_bend_range_semitones": 48,
            }
        method = getattr(self._engine, "get_synthforge_part_mpe_config", None)
        if not callable(method):
            return {
                "enabled": False,
                "lower_zone_channels": 0,
                "upper_zone_channels": 0,
                "pitch_bend_range_semitones": 48,
            }
        return dict(method(part_index))

    async def set_synthforge_part_mod_matrix_routes(self, part_index: int, routes: List[Dict[str, Any]]) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "set_synthforge_part_mod_matrix_routes", None)
        if not callable(method):
            return False
        return bool(method(part_index, [dict(route) for route in routes]))

    async def get_synthforge_part_mod_matrix_routes(self, part_index: int) -> List[Dict[str, Any]]:
        if not self._engine:
            return []
        method = getattr(self._engine, "get_synthforge_part_mod_matrix_routes", None)
        if not callable(method):
            return []
        return [dict(route) for route in method(part_index)]

    async def set_synthforge_part_freeze(self, part_index: int, enabled: bool) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "set_synthforge_part_freeze", None)
        if not callable(method):
            return False
        return bool(method(part_index, bool(enabled)))

    async def get_synthforge_part_freeze_status(self, part_index: int) -> Dict[str, Any]:
        if not self._engine:
            return {
                "freeze_enabled": False,
                "frozen_signal_ready": False,
                "freeze_samples": 0,
                "render_path": "",
                "last_error": "Engine not initialized",
            }
        method = getattr(self._engine, "get_synthforge_part_freeze_status", None)
        if not callable(method):
            return {
                "freeze_enabled": False,
                "frozen_signal_ready": False,
                "freeze_samples": 0,
                "render_path": "",
                "last_error": "Freeze mode not supported by this engine build",
            }
        return dict(method(part_index))

    async def render_synthforge_part_to_file(self, part_index: int, output_path: str, duration_ms: int = 2000) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "render_synthforge_part_to_file", None)
        if not callable(method):
            return False
        return bool(method(part_index, output_path, int(duration_ms)))

    async def get_synthforge_part_analyzer_frame(self, part_index: int) -> Dict[str, Any]:
        if not self._engine:
            return {
                "peak_left": 0.0,
                "peak_right": 0.0,
                "rms_left": 0.0,
                "rms_right": 0.0,
                "midi_events": 0,
                "active_voices": 0,
            }
        method = getattr(self._engine, "get_synthforge_part_analyzer_frame", None)
        if not callable(method):
            return {
                "peak_left": 0.0,
                "peak_right": 0.0,
                "rms_left": 0.0,
                "rms_right": 0.0,
                "midi_events": 0,
                "active_voices": 0,
            }
        return dict(method(part_index))

    async def get_synthforge_analyzer_frames(self) -> List[Dict[str, Any]]:
        if not self._engine:
            return []
        method = getattr(self._engine, "get_synthforge_analyzer_frames", None)
        if not callable(method):
            return []
        return [dict(frame) for frame in method()]

    async def get_synthforge_part_backend_status(self, part_index: int) -> Dict[str, Any]:
        if not self._engine:
            return {
                "backend": "native",
                "sfizz_available": False,
                "sfizz_loaded": False,
                "region_count": 0,
                "group_count": 0,
                "preloaded_samples": 0,
                "unknown_opcodes": [],
                "unsupported_opcodes": [],
            }
        method = getattr(self._engine, "get_synthforge_part_backend_status", None)
        if not callable(method):
            return {
                "backend": "native",
                "sfizz_available": False,
                "sfizz_loaded": False,
                "region_count": 0,
                "group_count": 0,
                "preloaded_samples": 0,
                "unknown_opcodes": [],
                "unsupported_opcodes": [],
            }
        return dict(method(part_index))

    async def get_synthforge_backend_status(self) -> List[Dict[str, Any]]:
        if not self._engine:
            return []
        method = getattr(self._engine, "get_synthforge_backend_status", None)
        if not callable(method):
            return []
        return [dict(status) for status in method()]

    async def get_synthforge_patches(self, category: Optional[str] = None) -> List[Dict[str, Any]]:
        if not self._engine:
            return []
        category_filter = category or ""
        return [dict(patch) for patch in await asyncio.to_thread(self._engine.get_synthforge_patches, category_filter)]

    async def load_synthforge_patch(self, part_index: int, bank: int, program: int) -> bool:
        if not self._engine:
            return False
        return bool(await asyncio.to_thread(self._engine.load_synthforge_patch, part_index, bank, program))

    async def save_synthforge_patch(
        self,
        part_index: int,
        bank: int,
        program: int,
        name: str,
    ) -> bool:
        if not self._engine:
            return False
        return bool(await asyncio.to_thread(self._engine.save_synthforge_patch, part_index, bank, program, name))

    async def get_synthforge_voice_metrics(self) -> Dict[str, Any]:
        if not self._engine:
            return {
                "active_voices": 0,
                "peak_voices": 0,
                "voices_per_part": [0] * 16,
                "cpu_percent": 0.0,
            }
        return dict(await asyncio.to_thread(self._engine.get_synthforge_voice_metrics))

    async def get_synthforge_metering(self) -> Dict[str, Any]:
        if not self._engine:
            return {
                "voice_metrics": {
                    "active_voices": 0,
                    "peak_voices": 0,
                    "voices_per_part": [0] * 16,
                    "cpu_percent": 0.0,
                },
                "part_levels": [0.0] * 16,
            }
        return dict(await asyncio.to_thread(self._engine.get_synthforge_metering))

    # ========================================
    # External Effects Loops (Tesira AVB)
    # ========================================

    async def set_external_loop_definitions(self, definitions: List[Dict[str, Any]]) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "set_external_loop_definitions", None)
        if callable(method):
            return bool(method(definitions))
        return False

    async def set_chain_loop_insertions(self, chain_id: int, insertions: List[Dict[str, Any]]) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "set_chain_loop_insertions", None)
        if callable(method):
            return bool(method(chain_id, insertions))
        return False

    async def set_chain_dry_wet_mix(self, chain_id: int, dry_wet_mix: float) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "set_chain_dry_wet_mix", None)
        if callable(method):
            return bool(method(chain_id, dry_wet_mix))
        return False

    async def set_chain_gain(self, chain_id: int, gain_linear: float) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "set_chain_gain", None)
        if callable(method):
            return bool(method(chain_id, gain_linear))
        return False

    async def set_chain_mute(self, chain_id: int, muted: bool) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "set_chain_mute", None)
        if callable(method):
            return bool(method(chain_id, muted))
        return False

    async def set_chain_solo(self, chain_id: int, solo: bool) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "set_chain_solo", None)
        if callable(method):
            return bool(method(chain_id, solo))
        return False

    async def set_loop_bypass(self, loop_id: str, bypass: bool) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "set_loop_bypass", None)
        if callable(method):
            return bool(method(loop_id, bypass))
        return False

    async def calibrate_loop(self, loop_id: str, options: Optional[Dict[str, Any]] = None) -> bool:
        if not self._engine:
            return False
        method = getattr(self._engine, "calibrate_loop", None)
        if callable(method):
            payload = dict(options or {})
            return bool(method(loop_id, payload))
        return False

    async def get_loop_metrics(self, loop_id: Optional[str] = None) -> Any:
        if not self._engine:
            return []
        method = getattr(self._engine, "get_loop_metrics", None)
        if callable(method):
            return method(loop_id or "")
        return []




__all__ = ["JuceAudioIOMixin"]
