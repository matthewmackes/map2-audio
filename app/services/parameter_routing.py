"""
Parameter Routing - Connects MIDI, Automation, and UI to Audio Engine

This module wires together:
- MIDI Engine (CC messages from controllers)
- Automation Engine (LFO, envelope follower)
- Real-Time Parameter Bridge (WebSocket UI updates)
- Audio Engine (final parameter destination)

All parameter changes flow through the RT bridge for <10ms latency and
broadcast to all connected clients.
"""

import logging
from typing import Optional, Callable, Any

logger = logging.getLogger(__name__)


async def connect_parameter_routing():
    """
    Wire up all parameter routing connections.

    Call this during application startup after all services are initialized.
    """
    from app.services.realtime_parameter_bridge import rt_parameter_bridge

    # Connect MIDI Engine -> RT Bridge
    try:
        from app.services.midi_engine import MIDIEngineService

        # Try to get existing instance or create new one
        midi_engine = MIDIEngineService._instance if hasattr(MIDIEngineService, '_instance') else None
        if midi_engine is None:
            # Create singleton instance
            midi_engine = MIDIEngineService()
            MIDIEngineService._instance = midi_engine

        async def midi_to_rt(plugin_uri: str, param_index: int, value: float):
            await rt_parameter_bridge.update_from_midi(plugin_uri, param_index, value)

        midi_engine.set_parameter_callback(midi_to_rt)
        logger.info("MIDI Engine -> RT Parameter Bridge connected")
    except ImportError as e:
        logger.debug(f"MIDI engine not available for routing: {e}")
    except Exception as e:
        logger.warning(f"Failed to connect MIDI engine to RT bridge: {e}")

    # Connect Automation Engine -> RT Bridge
    try:
        from app.services.automation_engine import automation_engine

        if automation_engine:
            async def automation_to_rt(plugin_uri: str, param_index: int, value: float):
                await rt_parameter_bridge.update_from_automation(plugin_uri, param_index, value)

            automation_engine.set_parameter_callback(automation_to_rt)
            logger.info("Automation Engine -> RT Parameter Bridge connected")
    except ImportError as e:
        logger.debug(f"Automation engine not available for routing: {e}")
    except Exception as e:
        logger.warning(f"Failed to connect automation engine to RT bridge: {e}")

    # Connect RT Bridge -> Audio Engine via JUCE RT Dispatcher
    try:
        from app.services.juce_engine_service import get_audio_engine
        from app.services.juce_rt_dispatcher import juce_rt_dispatcher

        engine = get_audio_engine()
        if engine:
            # Load parameter definitions and wire up dispatcher
            juce_rt_dispatcher.load()
            juce_rt_dispatcher.set_engine(engine)

            def rt_to_engine(plugin_uri: str, param_index: int, value: float):
                """
                Non-blocking callback to audio engine.
                Routes through JUCE RT dispatcher for native plugins,
                falls back to generic set_parameter for LV2 plugins.
                """
                try:
                    # Try JUCE native dispatch first
                    if plugin_uri.startswith("map2://juce/"):
                        juce_rt_dispatcher.dispatch(plugin_uri, param_index, value)
                    else:
                        # Generic LV2 plugin path
                        instance_id = engine._get_instance_id_for_uri(plugin_uri)
                        if instance_id:
                            engine._engine.set_parameter(instance_id, param_index, value)
                except Exception as e:
                    logger.debug(f"Engine parameter set error: {e}")

            rt_parameter_bridge.set_engine_callback(rt_to_engine)
            logger.info("RT Parameter Bridge -> Audio Engine connected (JUCE dispatcher)")
    except ImportError as e:
        logger.debug(f"Audio engine not available for routing: {e}")
    except Exception as e:
        logger.warning(f"Failed to connect RT bridge to audio engine: {e}")

    logger.info("Parameter routing initialized")


async def disconnect_parameter_routing():
    """
    Clean up parameter routing connections.

    Call this during application shutdown.
    """
    from app.services.realtime_parameter_bridge import rt_parameter_bridge

    rt_parameter_bridge.set_engine_callback(None)

    try:
        from app.services.midi_engine import MIDIEngineService
        midi_engine = MIDIEngineService._instance if hasattr(MIDIEngineService, '_instance') else None
        if midi_engine:
            midi_engine.set_parameter_callback(None)
            logger.debug("MIDI engine parameter callback cleared")
    except ImportError:
        logger.debug("MIDI engine not available for disconnect")
    except Exception as e:
        logger.debug(f"MIDI engine disconnect error: {e}")

    try:
        from app.services.automation_engine import automation_engine
        if automation_engine:
            automation_engine.set_parameter_callback(None)
            logger.debug("Automation engine parameter callback cleared")
    except ImportError:
        logger.debug("Automation engine not available for disconnect")
    except Exception as e:
        logger.debug(f"Automation engine disconnect error: {e}")

    logger.info("Parameter routing disconnected")
