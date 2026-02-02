"""
NAM (Neural Amp Modeler) Availability Check

This module provides NAM availability information.
All actual NAM audio processing is handled by the JUCE C++ engine.

IMPORTANT: Do NOT use this module for audio processing.
Use the JuceEngineService NAM methods instead.
"""

import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

from app.utils.logging_utils import get_logger

logger = get_logger(__name__)

# ============================================================
# NAM Availability
# ============================================================
# NAM is available if the JUCE engine is compiled with HAS_NAM
# We check this by trying to import the engine and calling is_nam_available()

NAM_AVAILABLE = False
CUDA_AVAILABLE = False  # JUCE NAM uses CPU-based NeuralAmpModelerCore, not CUDA
MPS_AVAILABLE = False
GPU_NAME = None
GPU_MEMORY = 0
TORCH_AVAILABLE = False  # PyTorch is NOT used for real-time NAM

def _check_juce_nam_available() -> bool:
    """Check if JUCE engine has NAM support compiled in."""
    try:
        import sys
        sys.path.insert(0, '/home/mm/map2-audio/juce-engine/build')
        import map2_audio_engine

        # Create a temporary engine to check NAM availability
        engine = map2_audio_engine.create_engine()
        available = engine.is_nam_available()
        del engine
        return available
    except Exception as e:
        logger.debug(f"JUCE NAM check failed: {e}")
        return False

# Check NAM availability on module load
try:
    NAM_AVAILABLE = _check_juce_nam_available()
    if NAM_AVAILABLE:
        logger.info("NAM available via JUCE C++ engine (RT-safe)")
    else:
        logger.warning("NAM not available (JUCE engine not compiled with HAS_NAM)")
except Exception as e:
    logger.warning(f"Could not check NAM availability: {e}")
    NAM_AVAILABLE = False


# ============================================================
# Deprecated: NAMModel and NAMProcessor classes
# ============================================================
# These are kept as stubs for backwards compatibility but should NOT be used.
# All NAM operations should go through JuceEngineService.

class NAMModel:
    """DEPRECATED: Use JuceEngineService.load_nam_model() instead.

    This class exists only for backwards compatibility.
    It does NOT provide real-time safe audio processing.
    """

    def __init__(self, model_path: str, name: str, device: Optional[str] = None):
        raise NotImplementedError(
            "NAMModel is deprecated. Use JuceEngineService.load_nam_model() for "
            "real-time safe NAM processing via the JUCE C++ engine."
        )


class NAMProcessor:
    """DEPRECATED: Use JuceEngineService NAM methods instead.

    This class exists only for backwards compatibility.
    It does NOT provide real-time safe audio processing.
    """

    def __init__(self, model_directory: Optional[str] = None, prefer_gpu: bool = True):
        raise NotImplementedError(
            "NAMProcessor is deprecated. Use JuceEngineService NAM methods for "
            "real-time safe NAM processing via the JUCE C++ engine.\n\n"
            "Available methods:\n"
            "  - await engine.load_nam_model(path)\n"
            "  - await engine.unload_nam_model()\n"
            "  - await engine.is_nam_model_loaded()\n"
            "  - await engine.get_nam_status()\n"
            "  - etc."
        )


def is_nam_available() -> bool:
    """Check if NAM is available in the current environment.

    NAM is provided by the JUCE C++ engine, not Python.
    """
    return NAM_AVAILABLE


def get_nam_processor(*args, **kwargs):
    """DEPRECATED: Use JuceEngineService instead."""
    raise NotImplementedError(
        "get_nam_processor() is deprecated. Use JuceEngineService for NAM operations."
    )
