"""
JUCE Audio Engine Service
MAP2 Audio Engine - JUCE-based LV2 host

Public compatibility wrapper for the split JUCE service implementation.
"""

from app.services.juce.common import *
from app.services.juce.juce_audio_io import JuceAudioIOMixin
from app.services.juce.juce_plugin_host import JucePluginHostMixin
from app.services.juce.juce_process import JuceProcessMixin
from app.services.juce.juce_snapshot_bridge import JuceSnapshotBridgeMixin


class JuceEngineService(
    JuceProcessMixin,
    JucePluginHostMixin,
    JuceSnapshotBridgeMixin,
    JuceAudioIOMixin,
    Singleton,
):
    """JUCE Audio Engine Service - MAP2 audio processing engine."""


# Singleton accessor using base class
def get_audio_engine() -> JuceEngineService:
    """Get or create JUCE audio engine service instance."""
    return JuceEngineService.get_instance()


def get_engine_service() -> JuceEngineService:
    """Legacy alias retained for older callsites."""
    return get_audio_engine()


__all__ = [
    "AudioEngineConfig",
    "EDIROL_UA1000",
    "HOTONE_JOGG",
    "JUCE_AVAILABLE",
    "JuceEngineService",
    "get_audio_engine",
    "get_engine_service",
]
