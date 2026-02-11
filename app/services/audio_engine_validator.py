"""
Audio Engine Configuration Validator

Ensures only one audio engine is active at a time and prevents resource conflicts.
Validates system configuration before audio processing starts.
"""

import logging
from typing import Tuple, List
from app.config import get_config

logger = logging.getLogger(__name__)


class AudioEngineConflict(Exception):
    """Raised when multiple audio engines attempt to run simultaneously."""
    pass


class AudioEngineValidator:
    """Validates audio engine configuration and prevents conflicts."""
    
    @staticmethod
    def validate_configuration() -> Tuple[bool, List[str]]:
        """Validate audio engine configuration.
        
        Returns:
            Tuple of (is_valid, list of error messages)
        """
        errors = []
        config = get_config()
        
        # Check audio engine setting
        audio_engine = config.get("audio.engine", "juce")
        allow_python_io = config.get("audio.allow_python_io", False)
        
        # CRITICAL: Python audio I/O should never be used in production
        if audio_engine == "python":
            errors.append(
                "❌ CRITICAL: audio.engine is set to 'python' - NOT RECOMMENDED!\n"
                "   Python audio I/O has severe limitations:\n"
                "   - Python GIL causes non-deterministic latency\n"
                "   - NOT real-time safe for live performance\n"
                "   - Will cause audio dropouts (XRuns)\n"
                "\n"
                "   SOLUTION: Set audio.engine='juce' in configuration"
            )
        
        if allow_python_io and audio_engine == "juce":
            errors.append(
                "⚠️  WARNING: audio.allow_python_io is enabled while using JUCE engine.\n"
                "   This may cause resource conflicts on the audio interface.\n"
                "   Recommended: Set audio.allow_python_io=false"
            )
        
        # Check if JUCE is available
        try:
            from app.services.juce_engine_service import JUCE_AVAILABLE
            if not JUCE_AVAILABLE and audio_engine == "juce":
                errors.append(
                    "❌ CRITICAL: JUCE engine is not available but is set as audio.engine.\n"
                    "   Install JUCE dependencies or build juce-engine module.\n"
                    "   See: juce-engine/README.md"
                )
        except ImportError:
            errors.append(
                "❌ CRITICAL: Cannot import juce_engine_service.\n"
                "   JUCE engine is required for production use."
            )
        
        is_valid = len(errors) == 0
        
        if is_valid:
            logger.info("✅ Audio engine configuration validated successfully")
            logger.info(f"   Using audio engine: {audio_engine}")
        else:
            logger.error("❌ Audio engine configuration validation FAILED")
            for error in errors:
                logger.error(error)
        
        return is_valid, errors
    
    @staticmethod
    def check_device_availability(device_name: str = "Jogg USB Audio") -> bool:
        """Check if Hotone Jogg audio interface is available.
        
        Args:
            device_name: Device name to search for
            
        Returns:
            True if device is available
        """
        try:
            import sounddevice as sd
            devices = sd.query_devices()
            
            for device in devices:
                if isinstance(device, dict) and device_name.lower() in device.get('name', '').lower():
                    logger.info(f"✅ Found audio device: {device['name']}")
                    return True
            
            logger.warning(f"⚠️  Audio device '{device_name}' not found")
            return False
            
        except Exception as e:
            logger.error(f"❌ Error checking audio devices: {e}")
            return False
    
    @staticmethod
    def prevent_dual_engine_startup() -> None:
        """Prevent both JUCE and Python audio engines from running simultaneously.
        
        Raises:
            AudioEngineConflict: If conflict is detected
        """
        config = get_config()
        audio_engine = config.get("audio.engine", "juce")
        allow_python_io = config.get("audio.allow_python_io", False)
        
        if audio_engine == "python" and allow_python_io:
            raise AudioEngineConflict(
                "Cannot start Python audio I/O: Deprecated and not recommended.\n"
                "Set audio.engine='juce' for production use."
            )
        
        # Check if any audio stream is already active
        try:
            import sounddevice as sd
            if hasattr(sd, '_last_callback'):
                logger.warning(
                    "⚠️  Audio callback already registered - possible conflict!\n"
                    "   Ensure only JUCE engine is handling audio I/O."
                )
        except Exception:
            pass


def validate_audio_engine() -> bool:
    """Quick validation helper.
    
    Returns:
        True if configuration is valid
    """
    validator = AudioEngineValidator()
    is_valid, errors = validator.validate_configuration()
    
    if not is_valid:
        logger.critical("="*80)
        logger.critical("AUDIO ENGINE CONFIGURATION ERRORS")
        logger.critical("="*80)
        for error in errors:
            logger.critical(error)
        logger.critical("="*80)
        logger.critical("Fix these errors before starting the audio system!")
        logger.critical("="*80)
    
    return is_valid
