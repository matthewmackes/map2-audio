"""
Audio Engine Configuration Validator

Ensures the mandatory JUCE audio engine is available before audio processing starts.
"""

import logging
from typing import Tuple, List
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

        # Check if JUCE is available
        try:
            from app.services.juce_engine_service import JUCE_AVAILABLE
            if not JUCE_AVAILABLE:
                errors.append(
                    "❌ CRITICAL: JUCE engine is not available.\n"
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
            logger.info("   Using mandatory JUCE audio engine")
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
        """Detect already-registered Python audio callbacks before JUCE startup."""
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
