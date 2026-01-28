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

    # Connect RT Bridge -> Audio Engine
    try:
        from app.services.service_manager import ServiceManager

        sm = ServiceManager.get_instance()
        if sm and hasattr(sm, 'set_plugin_parameter'):
            def rt_to_engine(plugin_uri: str, param_index: int, value: float):
                """
                Non-blocking callback to audio engine.
                This is called from the RT bridge's processing loop.
                """
                try:
                    sm.set_plugin_parameter(plugin_uri, param_index, value)
                except Exception as e:
                    logger.debug(f"Engine parameter set error: {e}")

            rt_parameter_bridge.set_engine_callback(rt_to_engine)
            logger.info("RT Parameter Bridge -> Audio Engine connected")
    except ImportError as e:
        logger.debug(f"Service manager not available for routing: {e}")
    except Exception as e:
        logger.warning(f"Failed to connect RT bridge to audio engine: {e}")

    # Try connecting to JUCE audio engine as alternative
    try:
        from app.services.juce_engine_service import get_audio_engine, JUCE_AVAILABLE

        if JUCE_AVAILABLE:
            engine = get_audio_engine()
            if engine:
                def rt_to_juce(plugin_uri: str, param_index: int, value: float):
                    """Route to JUCE audio engine."""
                    try:
                        # JUCE engine uses instance IDs, need to look up from URI
                        instance_id = engine._get_instance_id_for_uri(plugin_uri)
                        if instance_id:
                            engine.set_parameter_direct(instance_id, str(param_index), value)
                    except Exception as e:
                        logger.debug(f"JUCE engine parameter set error: {e}")

                rt_parameter_bridge.set_engine_callback(rt_to_juce)
                logger.info("RT Parameter Bridge -> JUCE Audio Engine connected")
    except ImportError:
        logger.debug("JUCE audio engine not available for routing")
    except Exception as e:
        logger.debug(f"JUCE engine routing not available: {e}")

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
