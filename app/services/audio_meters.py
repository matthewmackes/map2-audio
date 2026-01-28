"""
Audio Level Metering - Real-time RMS and peak level calculation
Provides thread-safe metering with WebSocket broadcasting
"""

import numpy as np
import logging
import asyncio
from typing import Dict, Optional, List, Tuple
from datetime import datetime
from threading import Lock
from collections import deque

logger = logging.getLogger(__name__)


class AudioMeter:
    """
    Single-channel audio meter with RMS and peak calculation
    
    Features:
    - RMS (Root Mean Square) level calculation
    - True peak detection with configurable hold time
    - dBFS scaling
    - Thread-safe buffer access
    """
    
    def __init__(
        self, 
        sample_rate: int = 48000,
        rms_window_ms: int = 300,
        peak_hold_ms: int = 1500
    ):
        """
        Initialize audio meter
        
        Args:
            sample_rate: Audio sample rate
            rms_window_ms: RMS averaging window in milliseconds
            peak_hold_ms: Peak hold time in milliseconds
        """
        self.sample_rate = sample_rate
        self.rms_window_samples = int(sample_rate * rms_window_ms / 1000)
        self.peak_hold_samples = int(sample_rate * peak_hold_ms / 1000)
        
        # Circular buffer for RMS calculation
        self.rms_buffer = deque(maxlen=self.rms_window_samples)
        
        # Peak tracking
        self.current_peak = 0.0
        self.peak_hold_counter = 0
        
        # Thread safety
        self._lock = Lock()
        
    def process(self, audio_data: np.ndarray) -> Tuple[float, float]:
        """
        Process audio buffer and calculate levels
        
        Args:
            audio_data: Audio samples as numpy array (mono channel)
            
        Returns:
            Tuple of (rms_db, peak_db)
        """
        with self._lock:
            # Add to RMS buffer
            self.rms_buffer.extend(audio_data)
            
            # Calculate RMS
            if len(self.rms_buffer) > 0:
                rms_squared = np.mean(np.square(list(self.rms_buffer)))
                rms = np.sqrt(rms_squared)
                rms_db = self._linear_to_db(rms)
            else:
                rms_db = -np.inf
            
            # Calculate peak
            current_max = np.max(np.abs(audio_data))
            
            # Update peak hold
            if current_max > self.current_peak:
                self.current_peak = current_max
                self.peak_hold_counter = self.peak_hold_samples
            else:
                self.peak_hold_counter -= len(audio_data)
                if self.peak_hold_counter <= 0:
                    self.current_peak = current_max
                    self.peak_hold_counter = 0
            
            peak_db = self._linear_to_db(self.current_peak)
            
            return rms_db, peak_db
    
    def reset(self) -> None:
        """Reset meter state"""
        with self._lock:
            self.rms_buffer.clear()
            self.current_peak = 0.0
            self.peak_hold_counter = 0
    
    @staticmethod
    def _linear_to_db(linear: float, min_db: float = -60.0) -> float:
        """
        Convert linear amplitude to dB
        
        Args:
            linear: Linear amplitude value (0.0 to 1.0)
            min_db: Minimum dB value for silence
            
        Returns:
            dB value
        """
        if linear <= 0.0:
            return min_db
        db = 20.0 * np.log10(linear)
        return max(db, min_db)


class StereoMeter:
    """
    Stereo audio meter with left/right channels
    """
    
    def __init__(
        self,
        sample_rate: int = 48000,
        rms_window_ms: int = 300,
        peak_hold_ms: int = 1500
    ):
        self.left = AudioMeter(sample_rate, rms_window_ms, peak_hold_ms)
        self.right = AudioMeter(sample_rate, rms_window_ms, peak_hold_ms)
        
    def process(self, audio_data: np.ndarray) -> Dict[str, Tuple[float, float]]:
        """
        Process stereo audio buffer
        
        Args:
            audio_data: Audio samples shaped (channels, samples) or (samples, channels)
            
        Returns:
            Dictionary with 'left' and 'right' (rms_db, peak_db) tuples
        """
        # Handle different shapes
        if audio_data.ndim == 1:
            # Mono - duplicate to both channels
            left_rms, left_peak = self.left.process(audio_data)
            right_rms, right_peak = self.right.process(audio_data)
        elif audio_data.shape[0] == 2:
            # Shape: (2, samples)
            left_rms, left_peak = self.left.process(audio_data[0])
            right_rms, right_peak = self.right.process(audio_data[1])
        else:
            # Shape: (samples, 2)
            left_rms, left_peak = self.left.process(audio_data[:, 0])
            right_rms, right_peak = self.right.process(audio_data[:, 1])
        
        return {
            "left": (left_rms, left_peak),
            "right": (right_rms, right_peak)
        }
    
    def reset(self) -> None:
        """Reset both channels"""
        self.left.reset()
        self.right.reset()


class MeterBroadcaster:
    """
    Manages metering for all active chains and broadcasts updates via WebSocket
    
    Thread-safe integration with audio processing pipeline
    """
    
    def __init__(self, sample_rate: int = 48000, broadcast_rate_hz: int = 15):
        """
        Initialize meter broadcaster

        Args:
            sample_rate: Audio sample rate
            broadcast_rate_hz: Update broadcast frequency (15 Hz = ~67ms updates, RT-safe)
        """
        self.sample_rate = sample_rate
        self.broadcast_interval = 1.0 / broadcast_rate_hz
        
        # Meters per chain: chain_id -> StereoMeter
        self.chain_meters: Dict[int, StereoMeter] = {}
        
        # Input/output meters
        self.input_meter = StereoMeter(sample_rate)
        self.output_meter = StereoMeter(sample_rate)
        
        # Thread safety
        self._lock = Lock()
        
        # Broadcasting state
        self._broadcasting = False
        self._broadcast_task: Optional[asyncio.Task] = None

    @property
    def is_broadcasting(self) -> bool:
        """Check if meter broadcasting is active."""
        return self._broadcasting

    def add_chain(self, chain_id: int) -> None:
        """
        Add metering for a chain
        
        Args:
            chain_id: Chain to meter
        """
        with self._lock:
            if chain_id not in self.chain_meters:
                self.chain_meters[chain_id] = StereoMeter(self.sample_rate)
                logger.info(f"Added metering for chain {chain_id}")
    
    def remove_chain(self, chain_id: int) -> None:
        """
        Remove metering for a chain
        
        Args:
            chain_id: Chain to remove
        """
        with self._lock:
            if chain_id in self.chain_meters:
                del self.chain_meters[chain_id]
                logger.info(f"Removed metering for chain {chain_id}")
    
    def process_input(self, audio_data: np.ndarray) -> None:
        """
        Process input audio for metering
        
        Args:
            audio_data: Input audio buffer
        """
        self.input_meter.process(audio_data)
    
    def process_output(self, audio_data: np.ndarray) -> None:
        """
        Process output audio for metering
        
        Args:
            audio_data: Output audio buffer
        """
        self.output_meter.process(audio_data)
    
    def process_chain(self, chain_id: int, audio_data: np.ndarray) -> None:
        """
        Process chain audio for metering
        
        Args:
            chain_id: Chain ID
            audio_data: Chain output audio buffer
        """
        with self._lock:
            if chain_id in self.chain_meters:
                self.chain_meters[chain_id].process(audio_data)
    
    def get_levels(self) -> Dict[str, any]:
        """
        Get current meter levels for all meters
        
        Returns:
            Dictionary with input, output, and per-chain levels
        """
        with self._lock:
            # Get input levels
            input_levels = self.input_meter.process(np.zeros(1))  # Query without processing
            
            # Get output levels
            output_levels = self.output_meter.process(np.zeros(1))
            
            # Get chain levels
            chain_levels = {}
            for chain_id, meter in self.chain_meters.items():
                chain_levels[chain_id] = meter.process(np.zeros(1))
        
        return {
            "input": {
                "left_rms": input_levels["left"][0],
                "left_peak": input_levels["left"][1],
                "right_rms": input_levels["right"][0],
                "right_peak": input_levels["right"][1]
            },
            "output": {
                "left_rms": output_levels["left"][0],
                "left_peak": output_levels["left"][1],
                "right_rms": output_levels["right"][0],
                "right_peak": output_levels["right"][1]
            },
            "chains": {
                chain_id: {
                    "left_rms": levels["left"][0],
                    "left_peak": levels["left"][1],
                    "right_rms": levels["right"][0],
                    "right_peak": levels["right"][1]
                }
                for chain_id, levels in chain_levels.items()
            },
            "timestamp": datetime.now().isoformat()
        }
    
    async def start_broadcasting(self, ws_manager) -> None:
        """
        Start broadcasting meter updates via WebSocket
        
        Args:
            ws_manager: WebSocketManager instance
        """
        if self._broadcasting:
            return
        
        self._broadcasting = True
        self._broadcast_task = asyncio.create_task(
            self._broadcast_loop(ws_manager)
        )
        logger.info("Started meter broadcasting")
    
    async def stop_broadcasting(self) -> None:
        """Stop broadcasting meter updates"""
        self._broadcasting = False
        if self._broadcast_task:
            self._broadcast_task.cancel()
            try:
                await self._broadcast_task
            except asyncio.CancelledError:
                pass
        logger.info("Stopped meter broadcasting")
    
    async def _broadcast_loop(self, ws_manager) -> None:
        """
        Broadcasting loop - sends meter updates at fixed rate
        
        Args:
            ws_manager: WebSocketManager instance
        """
        while self._broadcasting:
            try:
                # Get current levels
                levels = self.get_levels()
                
                # Broadcast to subscribers
                await ws_manager.broadcast_json(
                    {
                        "type": "meter_update",
                        "data": levels
                    },
                    topic="meters"
                )
                
                # Wait for next update
                await asyncio.sleep(self.broadcast_interval)
                
            except Exception as e:
                logger.error(f"Error in meter broadcast loop: {e}")
                await asyncio.sleep(1.0)  # Back off on error


# Global meter broadcaster instance
meter_broadcaster = MeterBroadcaster()
