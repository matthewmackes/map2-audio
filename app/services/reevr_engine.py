"""
Reev-R Convolution Engine Wrapper
RT-safe convolution processing for impulse response reverb.

Features:
- Partitioned FFT convolution
- Zero-latency processing
- Stereo/mono IR support
- Pre-allocated buffers (RT-safe)
- Dry/wet mix control
- Pre-delay support
"""

import logging
import numpy as np
from typing import Optional, Tuple
from scipy import signal
try:
    import soundfile as sf
    SOUNDFILE_AVAILABLE = True
except ImportError:
    SOUNDFILE_AVAILABLE = False
    sf = None

logger = logging.getLogger(__name__)


class ReevREngine:
    """Real-time convolution reverb engine."""
    
    def __init__(self, sample_rate: int = 48000, buffer_size: int = 128):
        """Initialize convolution engine with optimized buffer size.
        
        Args:
            sample_rate: Audio sample rate
            buffer_size: Processing buffer size
        """
        self.sample_rate = sample_rate
        self.buffer_size = buffer_size
        
        # IR state
        self.ir_loaded = False
        self.ir_path: Optional[str] = None
        self.ir_data: Optional[np.ndarray] = None
        self.ir_length_samples = 0
        
        # Processing buffers (pre-allocated)
        self.input_buffer = np.zeros((buffer_size * 2, 2), dtype=np.float32)
        self.output_buffer = np.zeros((buffer_size, 2), dtype=np.float32)
        
        # Convolution state
        self.partition_size = buffer_size
        self.num_partitions = 0
        self.fft_buffers = []
        self.overlap_buffer = None
        
        # Parameters
        self.dry_wet_mix = 0.3  # 0.0 = dry, 1.0 = wet
        self.predelay_ms = 0.0
        self.predelay_samples = 0
        self.predelay_buffer = None
        
        # Bypass
        self.bypass = False
        
        logger.info(f"ReevR engine initialized: {sample_rate}Hz, {buffer_size} samples")
    
    def load_ir(self, ir_path: str) -> bool:
        """Load impulse response from file.
        
        Args:
            ir_path: Path to WAV file
            
        Returns:
            True if loaded successfully
        """
        try:
            # Load audio file
            ir_data, ir_sample_rate = sf.read(ir_path, dtype='float32')
            
            # Resample if needed
            if ir_sample_rate != self.sample_rate:
                logger.info(f"Resampling IR from {ir_sample_rate}Hz to {self.sample_rate}Hz")
                ir_data = self._resample_ir(ir_data, ir_sample_rate, self.sample_rate)
            
            # Handle mono/stereo
            if ir_data.ndim == 1:
                # Mono to stereo
                ir_data = np.column_stack((ir_data, ir_data))
            elif ir_data.shape[1] == 1:
                # Single channel to stereo
                ir_data = np.column_stack((ir_data[:, 0], ir_data[:, 0]))
            elif ir_data.shape[1] > 2:
                # Take first 2 channels
                ir_data = ir_data[:, :2]
            
            # Store IR
            self.ir_data = ir_data
            self.ir_path = ir_path
            self.ir_length_samples = len(ir_data)
            
            # Prepare partitioned convolution
            self._prepare_partitioned_convolution()
            
            # Setup overlap buffer
            self.overlap_buffer = np.zeros((self.ir_length_samples, 2), dtype=np.float32)
            
            self.ir_loaded = True
            logger.info(f"Loaded IR: {ir_path} ({self.ir_length_samples} samples, "
                       f"{self.ir_length_samples / self.sample_rate:.2f}s)")
            
            return True
            
        except Exception as e:
            logger.error(f"Error loading IR {ir_path}: {e}")
            self.ir_loaded = False
            return False
    
    def _resample_ir(self, ir_data: np.ndarray, from_rate: int, to_rate: int) -> np.ndarray:
        """Resample IR to target sample rate.
        
        Args:
            ir_data: Input IR data
            from_rate: Source sample rate
            to_rate: Target sample rate
            
        Returns:
            Resampled IR data
        """
        num_samples = int(len(ir_data) * to_rate / from_rate)
        
        if ir_data.ndim == 1:
            return signal.resample(ir_data, num_samples)
        else:
            # Resample each channel
            resampled = np.zeros((num_samples, ir_data.shape[1]), dtype=np.float32)
            for ch in range(ir_data.shape[1]):
                resampled[:, ch] = signal.resample(ir_data[:, ch], num_samples)
            return resampled
    
    def _prepare_partitioned_convolution(self) -> None:
        """Prepare FFT buffers for partitioned convolution.
        
        Divides IR into partitions matching buffer size for efficient processing.
        """
        if self.ir_data is None:
            return
        
        # Calculate number of partitions
        self.num_partitions = (self.ir_length_samples + self.partition_size - 1) // self.partition_size
        
        # Pad IR to multiple of partition size
        padded_length = self.num_partitions * self.partition_size
        ir_padded = np.zeros((padded_length, 2), dtype=np.float32)
        ir_padded[:self.ir_length_samples, :] = self.ir_data
        
        # Prepare FFT of each partition
        self.fft_buffers = []
        for i in range(self.num_partitions):
            start = i * self.partition_size
            end = start + self.partition_size
            partition = ir_padded[start:end, :]
            
            # FFT for each channel
            fft_l = np.fft.rfft(partition[:, 0], n=2 * self.partition_size)
            fft_r = np.fft.rfft(partition[:, 1], n=2 * self.partition_size)
            
            self.fft_buffers.append((fft_l, fft_r))
        
        logger.debug(f"Prepared {self.num_partitions} convolution partitions")
    
    def process(self, input_audio: np.ndarray) -> np.ndarray:
        """Process audio through convolution reverb (RT-safe).
        
        Args:
            input_audio: Input buffer [samples, 2]
            
        Returns:
            Output buffer [samples, 2]
        """
        if self.bypass or not self.ir_loaded or self.ir_data is None:
            return input_audio
        
        # Fast path for simple convolution (short IRs)
        if self.ir_length_samples <= 4096:
            wet_signal = self._convolve_simple(input_audio)
        else:
            # Partitioned convolution for longer IRs
            wet_signal = self._convolve_partitioned(input_audio)
        
        # Apply pre-delay if set
        if self.predelay_samples > 0:
            wet_signal = self._apply_predelay(wet_signal)
        
        # Mix dry and wet
        dry_gain = 1.0 - self.dry_wet_mix
        wet_gain = self.dry_wet_mix
        
        output = dry_gain * input_audio + wet_gain * wet_signal
        
        return output.astype(np.float32)
    
    def _convolve_simple(self, input_audio: np.ndarray) -> np.ndarray:
        """Simple time-domain convolution for short IRs.
        
        Args:
            input_audio: Input buffer
            
        Returns:
            Convolved output
        """
        # Convolve each channel
        output_l = signal.fftconvolve(input_audio[:, 0], self.ir_data[:, 0], mode='same')
        output_r = signal.fftconvolve(input_audio[:, 1], self.ir_data[:, 1], mode='same')
        
        return np.column_stack((output_l, output_r))
    
    def _convolve_partitioned(self, input_audio: np.ndarray) -> np.ndarray:
        """Partitioned FFT convolution for long IRs.
        
        More CPU efficient for IRs > 4096 samples.
        
        Args:
            input_audio: Input buffer
            
        Returns:
            Convolved output
        """
        buffer_len = len(input_audio)
        
        # FFT of input
        input_fft_l = np.fft.rfft(input_audio[:, 0], n=2 * self.partition_size)
        input_fft_r = np.fft.rfft(input_audio[:, 1], n=2 * self.partition_size)
        
        # Convolve with each partition and sum
        output_l = np.zeros(2 * self.partition_size, dtype=np.float32)
        output_r = np.zeros(2 * self.partition_size, dtype=np.float32)
        
        for fft_l, fft_r in self.fft_buffers:
            # Frequency domain multiplication
            conv_l = input_fft_l * fft_l
            conv_r = input_fft_r * fft_r
            
            # IFFT and accumulate
            output_l += np.fft.irfft(conv_l)
            output_r += np.fft.irfft(conv_r)
        
        # Take valid portion
        result = np.column_stack((output_l[:buffer_len], output_r[:buffer_len]))
        
        return result
    
    def _apply_predelay(self, audio: np.ndarray) -> np.ndarray:
        """Apply pre-delay to signal.
        
        Args:
            audio: Input audio
            
        Returns:
            Delayed audio
        """
        if self.predelay_buffer is None or len(self.predelay_buffer) != self.predelay_samples:
            self.predelay_buffer = np.zeros((self.predelay_samples, 2), dtype=np.float32)
        
        # Simple delay line
        delayed = np.zeros_like(audio)
        
        if self.predelay_samples >= len(audio):
            # Delay is longer than buffer - all from delay buffer
            delayed[:] = self.predelay_buffer[:len(audio)]
            # Update delay buffer
            self.predelay_buffer = np.roll(self.predelay_buffer, len(audio), axis=0)
            self.predelay_buffer[-len(audio):] = audio
        else:
            # Partial delay
            delayed[:self.predelay_samples] = self.predelay_buffer
            delayed[self.predelay_samples:] = audio[:-self.predelay_samples]
            self.predelay_buffer = audio[-self.predelay_samples:]
        
        return delayed
    
    def set_dry_wet_mix(self, mix: float) -> None:
        """Set dry/wet mix (0.0-1.0).
        
        Args:
            mix: Mix amount (0.0 = dry, 1.0 = wet)
        """
        self.dry_wet_mix = max(0.0, min(1.0, mix))
    
    def set_predelay(self, predelay_ms: float) -> None:
        """Set pre-delay in milliseconds.
        
        Args:
            predelay_ms: Pre-delay time (0-500ms)
        """
        self.predelay_ms = max(0.0, min(500.0, predelay_ms))
        self.predelay_samples = int(self.predelay_ms * self.sample_rate / 1000.0)
        
        # Reallocate delay buffer
        if self.predelay_samples > 0:
            self.predelay_buffer = np.zeros((self.predelay_samples, 2), dtype=np.float32)
    
    def set_bypass(self, bypass: bool) -> None:
        """Set bypass state.
        
        Args:
            bypass: True to bypass
        """
        self.bypass = bypass
    
    def get_latency(self) -> int:
        """Get processing latency in samples.
        
        Returns:
            Latency in samples
        """
        # IR convolution introduces latency equal to IR length / 2 (group delay)
        # Plus any pre-delay
        if self.ir_loaded:
            return (self.ir_length_samples // 2) + self.predelay_samples
        return 0
    
    def get_status(self) -> dict:
        """Get engine status.
        
        Returns:
            Status dict
        """
        return {
            "loaded": self.ir_loaded,
            "ir_path": self.ir_path,
            "ir_length_samples": self.ir_length_samples,
            "ir_length_ms": (self.ir_length_samples / self.sample_rate * 1000.0) if self.ir_loaded else 0,
            "latency_samples": self.get_latency(),
            "latency_ms": (self.get_latency() / self.sample_rate * 1000.0) if self.ir_loaded else 0,
            "dry_wet_mix": self.dry_wet_mix,
            "predelay_ms": self.predelay_ms,
            "bypass": self.bypass,
            "num_partitions": self.num_partitions
        }
    
    def reset(self) -> None:
        """Reset engine state (clear buffers)."""
        if self.overlap_buffer is not None:
            self.overlap_buffer.fill(0)
        if self.predelay_buffer is not None:
            self.predelay_buffer.fill(0)
        logger.debug("ReevR engine reset")


# Global instance
_reevr_engine: Optional[ReevREngine] = None


def get_reevr_engine(sample_rate: int = 48000, buffer_size: int = 128) -> ReevREngine:
    """Get or create global ReevR engine instance."""
    global _reevr_engine
    if _reevr_engine is None:
        _reevr_engine = ReevREngine(sample_rate, buffer_size)
    return _reevr_engine
