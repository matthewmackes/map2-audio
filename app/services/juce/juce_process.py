"""JUCE Process methods for JuceEngineService."""

from .common import *


class JuceProcessMixin:
    """Focused JUCE engine service behavior mixed into the public service."""

    def __init__(self, config: Optional[AudioEngineConfig] = None) -> None:
        super().__init__()
        self.config = config or AudioEngineConfig()
        self._engine = None
        self._initialized = False
        self._midi_runtime = JuceRuntimeMidiService(self)
        self._metering_runtime = JuceRuntimeMeteringService(self)
        self._platform_event_drain_task: asyncio.Task | None = None
        self._platform_event_drain_interval_seconds = 1.0

    @property
    def engine(self):
        """Legacy compatibility accessor for the low-level C++ engine object."""
        return self._engine

    async def _run_engine_call(self, method_name: str, *args, default=None):
        """Run a low-level JUCE engine call off the event loop thread."""
        if not self._engine:
            return default
        handler = getattr(self._engine, method_name, None)
        if not callable(handler):
            return default
        return await asyncio.to_thread(handler, *args)

    @staticmethod
    def _normalize_input_channel_mode(mode: str | None) -> str:
        normalized = str(mode or "").strip().lower()
        if normalized in {"mono_left", "mono-left", "left", "mono_left_only"}:
            return "mono_left"
        if normalized in {"mono_right", "mono-right", "right", "mono_right_only"}:
            return "mono_right"
        return "stereo"

    @staticmethod
    def _input_channel_mode_value(mode: str) -> int:
        normalized = JuceProcessMixin._normalize_input_channel_mode(mode)
        if normalized == "mono_left":
            return 0
        if normalized == "mono_right":
            return 1
        return 2

    @staticmethod
    def _normalize_io_gain_db(value: float | int | str | None) -> float:
        try:
            normalized = float(value)
        except (TypeError, ValueError):
            normalized = 0.0
        return max(-24.0, min(24.0, normalized))

    async def initialize(self) -> bool:
        """Initialize engine with full configuration"""
        if not JUCE_AVAILABLE:
            logger.error("JUCE Audio Engine not available")
            return False

        try:
            # Create engine instance
            self._engine = juce_engine.create_engine()

            # Configure (sync, immediate)
            await asyncio.to_thread(self._engine.set_sample_rate, self.config.sample_rate)
            await asyncio.to_thread(self._engine.set_buffer_size, self.config.buffer_size)
            await asyncio.to_thread(self._engine.set_audio_device, self.config.audio_device)
            await asyncio.to_thread(self._engine.set_lv2_path, self.config.lv2_path)
            handler = getattr(self._engine, "set_input_channel_mode", None)
            if callable(handler):
                await asyncio.to_thread(
                    handler,
                    self._input_channel_mode_value(self.config.input_channel_mode),
                )
            input_gain_handler = getattr(self._engine, "set_input_gain_db", None)
            if callable(input_gain_handler):
                await asyncio.to_thread(input_gain_handler, self.config.input_gain_db)
            output_gain_handler = getattr(self._engine, "set_output_gain_db", None)
            if callable(output_gain_handler):
                await asyncio.to_thread(output_gain_handler, self.config.output_gain_db)

            # Configure channel counts (for multi-channel interfaces like UA-1000)
            await asyncio.to_thread(self._engine.set_num_input_channels, self.config.input_channels)
            await asyncio.to_thread(self._engine.set_num_output_channels, self.config.output_channels)
            logger.info(f"Configuring audio: {self.config.input_channels} inputs, "
                       f"{self.config.output_channels} outputs")

            # FIX #7: Wrap blocking C++ initialization call in asyncio.to_thread()
            # This prevents the entire event loop from freezing during engine init
            result = await asyncio.to_thread(
                self._engine.initialize,
                self.config.config_file
            )

            if result:
                # Enable MIDI if configured
                if self.config.enable_midi:
                    await asyncio.to_thread(self._engine.enable_midi, True)

                self._initialized = True
                self._start_platform_event_drain_loop()
                version = await asyncio.to_thread(self._engine.get_version)
                system_info = await asyncio.to_thread(self._engine.get_system_info)
                logger.info(f"JUCE Audio Engine initialized: {version}")
                logger.info(f"Config: {system_info}")
            else:
                logger.error("JUCE Audio Engine initialization failed")

            return result
        except Exception as e:
            logger.error(f"Failed to initialize JUCE: {e}")
            import traceback
            traceback.print_exc()
            return False

    def _start_platform_event_drain_loop(self) -> None:
        """Start the control-plane PlatformEvent FIFO drain when an event loop is running."""
        if (
            self._platform_event_drain_task is not None
            and not self._platform_event_drain_task.done()
        ):
            return
        if not self._engine or not hasattr(self._engine, "drain_platform_events"):
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._platform_event_drain_task = loop.create_task(self._platform_event_drain_loop())

    async def _platform_event_drain_loop(self) -> None:
        """Drain native engine events off the realtime path and publish them to PlatformEventBus."""
        while True:
            try:
                await self.publish_engine_platform_events()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Failed to publish JUCE engine PlatformEvents: %s", exc)
            await asyncio.sleep(self._platform_event_drain_interval_seconds)

    async def _stop_platform_event_drain_loop(self) -> None:
        task = self._platform_event_drain_task
        self._platform_event_drain_task = None
        if task is None:
            return
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def shutdown(self) -> None:
        """Shutdown engine"""
        await self._stop_platform_event_drain_loop()
        try:
            await self.publish_engine_platform_events()
        except Exception as e:
            logger.warning("Failed to flush JUCE engine PlatformEvents during shutdown: %s", e)

        if self._engine:
            try:
                await asyncio.to_thread(self._engine.stop_audio)
                await asyncio.to_thread(self._engine.shutdown)
            except Exception as e:
                logger.error(f"Error during shutdown: {e}")

        self._engine = None
        self._initialized = False
        logger.info("JUCE Audio Engine shutdown")

    # Audio Control

    async def start_audio(self) -> bool:
        """Start audio processing"""
        if not self._engine or not self._initialized:
            return False
        # FIX #7: Wrap blocking audio start in asyncio.to_thread()
        return await asyncio.to_thread(self._engine.start_audio)

    async def stop_audio(self) -> bool:
        """Stop audio processing"""
        if not self._engine:
            return False
        # FIX #7: Wrap blocking audio stop in asyncio.to_thread()
        return await asyncio.to_thread(self._engine.stop_audio)

    async def set_audio_device(self, device_name: str) -> bool:
        """Switch the engine to a different audio device name."""
        normalized_device = str(device_name or "").strip()
        if not normalized_device:
            return False

        self.config.audio_device = normalized_device
        if not self._engine:
            return True

        def _apply() -> bool:
            result = self._engine.set_audio_device(normalized_device)
            return True if result is None else bool(result)

        try:
            success = await asyncio.to_thread(_apply)
        except Exception as exc:
            logger.error("Failed to set audio device %s: %s", normalized_device, exc)
            return False

        if success:
            logger.info("JUCE audio device set to %s", normalized_device)
        else:
            logger.warning("JUCE engine rejected audio device %s", normalized_device)
        return success

    async def set_input_channel_mode(self, mode: str) -> bool:
        """Switch how hardware input channels are copied into the graph."""
        normalized_mode = self._normalize_input_channel_mode(mode)
        self.config.input_channel_mode = normalized_mode
        if not self._engine:
            return True

        handler = getattr(self._engine, "set_input_channel_mode", None)
        if not callable(handler):
            logger.warning("JUCE engine does not expose input channel mode control")
            return False

        try:
            result = await asyncio.to_thread(
                handler,
                self._input_channel_mode_value(normalized_mode),
            )
        except Exception as exc:
            logger.error("Failed to set input channel mode %s: %s", normalized_mode, exc)
            return False

        success = True if result is None else bool(result)
        if success:
            logger.info("JUCE input channel mode set to %s", normalized_mode)
        return success

    async def set_input_gain_db(self, gain_db: float) -> bool:
        """Set the engine input gain in dB."""
        normalized_gain = self._normalize_io_gain_db(gain_db)
        self.config.input_gain_db = normalized_gain
        if not self._engine:
            return True

        handler = getattr(self._engine, "set_input_gain_db", None)
        if not callable(handler):
            logger.warning("JUCE engine does not expose input gain control")
            return False

        try:
            result = await asyncio.to_thread(handler, normalized_gain)
        except Exception as exc:
            logger.error("Failed to set input gain %.2f dB: %s", normalized_gain, exc)
            return False

        success = True if result is None else bool(result)
        if success:
            logger.info("JUCE input gain set to %.2f dB", normalized_gain)
        return success

    async def set_output_gain_db(self, gain_db: float) -> bool:
        """Set the engine output gain in dB."""
        normalized_gain = self._normalize_io_gain_db(gain_db)
        self.config.output_gain_db = normalized_gain
        if not self._engine:
            return True

        handler = getattr(self._engine, "set_output_gain_db", None)
        if not callable(handler):
            logger.warning("JUCE engine does not expose output gain control")
            return False

        try:
            result = await asyncio.to_thread(handler, normalized_gain)
        except Exception as exc:
            logger.error("Failed to set output gain %.2f dB: %s", normalized_gain, exc)
            return False

        success = True if result is None else bool(result)
        if success:
            logger.info("JUCE output gain set to %.2f dB", normalized_gain)
        return success

    async def set_monitoring_output_index(self, index: int) -> bool:
        """Route the live mix to a specific hardware output pair start index."""
        normalized_index = max(0, int(index))
        if not self._engine:
            return False

        handler = getattr(self._engine, "set_monitoring_output_index", None)
        if not callable(handler):
            logger.warning("JUCE engine does not support monitoring output selection")
            return False

        try:
            result = await asyncio.to_thread(handler, normalized_index)
        except Exception as exc:
            logger.error(
                "Failed to set monitoring output index %s: %s",
                normalized_index,
                exc,
            )
            return False

        return True if result is None else bool(result)

    def is_audio_running(self) -> bool:
        """Check if audio is running.

        Returns True when the engine is initialized and the audio device
        is open. On PipeWire/JACK systems, the audio graph is active as
        soon as the JACK client connects during initialize(), even before
        the explicit start_audio() call registers the callback.

        Note: The C++ audioRunning_ flag only tracks addAudioCallback,
        but PipeWire routes audio through the graph regardless. We report
        based on the actual state: initialized + device open = running.
        """
        if not self._engine or not self._initialized:
            return False
        # Check C++ flag first
        try:
            if self._engine.is_audio_running():
                return True
        except Exception:
            pass
        # Fallback: if engine is initialized, the JACK/PipeWire audio device
        # is open and audio is flowing through the graph
        return self._initialized

    # Plugin Management


    def get_system_info(self) -> Dict[str, Any]:
        """Get comprehensive system information"""
        if not self._engine:
            return {
                "version": "unavailable",
                "running": False,
                "available": False
            }

        info = self._engine.get_system_info()
        info["available"] = JUCE_AVAILABLE
        info["initialized"] = self._initialized
        info.setdefault("input_channel_mode", self.config.input_channel_mode)
        info.setdefault("input_gain_db", self.config.input_gain_db)
        info.setdefault("output_gain_db", self.config.output_gain_db)
        # Override audio_running to reflect actual PipeWire/JACK state
        # The C++ flag only tracks addAudioCallback, but audio flows
        # through PipeWire as soon as the JACK client connects
        info["audio_running"] = self.is_audio_running()
        return info

    # Properties

    @property
    def is_running(self) -> bool:
        return self._initialized and self._engine is not None

    @property
    def is_available(self) -> bool:
        return JUCE_AVAILABLE

    def get_version(self) -> str:
        """Get engine version"""
        if self._engine:
            return self._engine.get_version()
        elif JUCE_AVAILABLE:
            return juce_engine.get_version()
        return "unavailable"



__all__ = ["JuceProcessMixin"]
