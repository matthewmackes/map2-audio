"""
Audio Service - Handles audio input/output operations for the LCD system.
Real-time audio capture, processing, and playback with multi-threaded operation.
"""

import threading
import queue
import numpy as np
from typing import Optional, Callable, Dict, Any
import logging
from enum import Enum
from dataclasses import dataclass
from datetime import datetime
import json

logger = logging.getLogger(__name__)


class AudioFormat(Enum):
    """Audio format specifications."""
    PCM_16BIT = "pcm_16bit"
    PCM_32BIT = "pcm_32bit"
    FLOAT_32 = "float_32"


@dataclass
class AudioConfig:
    """Audio configuration."""
    sample_rate: int = 48000
    channels: int = 2
    buffer_size: int = 256
    format: AudioFormat = AudioFormat.PCM_32BIT


class AudioService:
    """
    Manages real-time audio I/O operations.
    Thread-safe implementation with queue-based communication.
    """
    
    def __init__(self, config: Optional[AudioConfig] = None):
        """Initialize audio service."""
        self.config = config or AudioConfig()
        self.is_running = False
        self.input_queue = queue.Queue(maxsize=10)
        self.output_queue = queue.Queue(maxsize=10)
        self.callback_handlers: Dict[str, Callable] = {}
        self.audio_thread: Optional[threading.Thread] = None
        self.stats = {
            "frames_processed": 0,
            "underruns": 0,
            "overruns": 0,
            "last_update": datetime.now().isoformat()
        }
        self._lock = threading.RLock()
        logger.info(f"AudioService initialized: {self.config}")
    
    def register_callback(self, event: str, handler: Callable) -> None:
        """Register callback handler for audio events."""
        with self._lock:
            self.callback_handlers[event] = handler
            logger.debug(f"Registered callback for event: {event}")
    
    def start(self) -> bool:
        """Start audio processing thread."""
        with self._lock:
            if self.is_running:
                logger.warning("Audio service already running")
                return False
            
            self.is_running = True
            self.audio_thread = threading.Thread(target=self._audio_loop, daemon=True)
            self.audio_thread.start()
            logger.info("Audio service started")
            return True
    
    def stop(self) -> bool:
        """Stop audio processing."""
        with self._lock:
            if not self.is_running:
                return False
            
            self.is_running = False
            if self.audio_thread:
                self.audio_thread.join(timeout=2.0)
            logger.info("Audio service stopped")
            return True
    
    def _audio_loop(self) -> None:
        """Main audio processing loop."""
        while self.is_running:
            try:
                # Simulate audio capture
                audio_data = self._capture_audio()
                if audio_data is not None:
                    self.input_queue.put(audio_data, block=False)
                    self._invoke_callback("audio_captured", audio_data)
                    self.stats["frames_processed"] += len(audio_data)
            except queue.Full:
                self.stats["overruns"] += 1
                logger.warning("Input queue full - overrun detected")
            except Exception as e:
                logger.error(f"Audio loop error: {e}")
    
    def _capture_audio(self) -> Optional[np.ndarray]:
        """Capture audio data (simulated)."""
        return np.random.randn(self.config.buffer_size, self.config.channels).astype(np.float32)
    
    def _invoke_callback(self, event: str, data: Any) -> None:
        """Invoke registered callback handler."""
        with self._lock:
            handler = self.callback_handlers.get(event)
        
        if handler:
            try:
                handler(data)
            except Exception as e:
                logger.error(f"Callback error for {event}: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get audio statistics."""
        with self._lock:
            return self.stats.copy()
    
    def set_input_device(self, device_id: int) -> bool:
        """Set input device."""
        with self._lock:
            logger.info(f"Input device set to: {device_id}")
            return True
    
    def set_output_device(self, device_id: int) -> bool:
        """Set output device."""
        with self._lock:
            logger.info(f"Output device set to: {device_id}")
            return True
    
    def get_devices(self) -> list:
        """Get available audio devices."""
        return [
            {"id": 0, "name": "Default Input", "channels": 2},
            {"id": 1, "name": "Default Output", "channels": 2},
            {"id": 2, "name": "USB Audio", "channels": 4}
        ]
    
    def process_audio(self, audio_data: np.ndarray) -> np.ndarray:
        """Process audio data."""
        return audio_data * 0.8  # Simple gain reduction


class AudioManager:
    """Manages multiple audio services."""
    
    def __init__(self):
        self.services: Dict[str, AudioService] = {}
        self._lock = threading.RLock()
    
    def create_service(self, name: str, config: Optional[AudioConfig] = None) -> AudioService:
        """Create new audio service."""
        with self._lock:
            service = AudioService(config)
            self.services[name] = service
            logger.info(f"Created audio service: {name}")
            return service
    
    def get_service(self, name: str) -> Optional[AudioService]:
        """Get audio service by name."""
        with self._lock:
            return self.services.get(name)
    
    def start_all(self) -> int:
        """Start all audio services."""
        count = 0
        with self._lock:
            for service in self.services.values():
                if service.start():
                    count += 1
        return count
    
    def stop_all(self) -> None:
        """Stop all audio services."""
        with self._lock:
            for service in self.services.values():
                service.stop()


# Global instance
audio_manager = AudioManager()
