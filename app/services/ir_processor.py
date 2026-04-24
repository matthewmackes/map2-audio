"""
Impulse Response (IR) Processor
Handles cabinet IR and reverb IR loading and convolution.

Features:
- WAV file loading (16/24/32-bit)
- RT-safe partitioned convolution for long IRs
- Overlap-add method for low latency
- Wet/dry mix control
"""

import logging
import numpy as np
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path
import wave
from collections import deque

from app.paths import Map2Paths, StoragePaths

logger = logging.getLogger(__name__)

# Try to import scipy for efficient FFT convolution
try:
    from scipy import signal
    from scipy.fft import fft, ifft, next_fast_len
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False
    logger.warning("scipy not available - using basic convolution. Install with: pip install scipy")


class ImpulseResponse:
    """Represents a loaded impulse response with RT-safe processing.
    
    Uses partitioned convolution for long IRs to maintain low latency:
    - Short IRs (<= 4096 samples): Direct FFT convolution
    - Long IRs (> 4096 samples): Overlap-add partitioned convolution
    """
    
    # Partition size for long IRs (power of 2 for FFT efficiency)
    PARTITION_SIZE = 1024
    
    def __init__(self, ir_path: str, name: str, ir_type: str = "cabinet"):
        self.ir_path = ir_path
        self.name = name
        self.ir_type = ir_type  # 'cabinet' or 'reverb'
        self.ir_data: Optional[np.ndarray] = None
        self.sample_rate = 48000
        self.is_loaded = False
        self.wet_mix = 1.0  # Wet/dry mix (0.0 = dry, 1.0 = wet)
        self.bypass = False  # Bypass state
        
        # Partitioned convolution state
        self._partitions: List[np.ndarray] = []
        self._fft_size = 0
        self._input_buffer: Optional[np.ndarray] = None
        self._output_buffer: Optional[np.ndarray] = None
        self._fdl: Optional[deque] = None  # Frequency delay line
        self._use_partitioned = False
        
    def load(self) -> bool:
        """Load IR from WAV file."""
        try:
            with wave.open(self.ir_path, 'rb') as wav_file:
                self.sample_rate = wav_file.getframerate()
                frames = wav_file.readframes(wav_file.getnframes())
                
                # Convert to numpy array
                if wav_file.getsampwidth() == 2:  # 16-bit
                    self.ir_data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
                elif wav_file.getsampwidth() == 3:  # 24-bit
                    # Handle 24-bit conversion
                    self.ir_data = self._convert_24bit(frames)
                else:  # 32-bit float
                    self.ir_data = np.frombuffer(frames, dtype=np.float32)
                
                # If stereo, take left channel only
                if wav_file.getnchannels() == 2:
                    self.ir_data = self.ir_data[::2]
                
                self.is_loaded = True
                logger.info(f"Loaded IR: {self.name} ({len(self.ir_data)} samples @ {self.sample_rate}Hz)")
                
                # Setup partitioned convolution for long IRs
                self._setup_partitioned_convolution()
                
                return True
                
        except Exception as e:
            logger.error(f"Failed to load IR {self.name}: {e}")
            return False
    
    def _setup_partitioned_convolution(self) -> None:
        """Setup partitioned convolution for long IRs (RT-safe preparation).
        
        Uses overlap-add method with pre-computed FFT partitions.
        """
        if self.ir_data is None:
            return
        
        ir_length = len(self.ir_data)
        
        # Use partitioned convolution for IRs longer than 4096 samples (~85ms @ 48kHz)
        if ir_length > 4096 and SCIPY_AVAILABLE:
            self._use_partitioned = True
            
            # FFT size is 2x partition size for overlap-add
            self._fft_size = next_fast_len(self.PARTITION_SIZE * 2)
            
            # Pad IR to multiple of partition size
            num_partitions = (ir_length + self.PARTITION_SIZE - 1) // self.PARTITION_SIZE
            padded_length = num_partitions * self.PARTITION_SIZE
            padded_ir = np.zeros(padded_length, dtype=np.float32)
            padded_ir[:ir_length] = self.ir_data
            
            # Pre-compute FFT of each IR partition
            self._partitions = []
            for i in range(num_partitions):
                start = i * self.PARTITION_SIZE
                partition = np.zeros(self._fft_size, dtype=np.float32)
                partition[:self.PARTITION_SIZE] = padded_ir[start:start + self.PARTITION_SIZE]
                self._partitions.append(fft(partition))
            
            # Initialize frequency delay line
            self._fdl = deque([np.zeros(self._fft_size, dtype=np.complex128) 
                              for _ in range(num_partitions)], maxlen=num_partitions)
            
            # Initialize buffers
            self._input_buffer = np.zeros(self.PARTITION_SIZE, dtype=np.float32)
            self._output_buffer = np.zeros(self._fft_size, dtype=np.float32)
            self._buffer_pos = 0
            
            logger.info(f"Partitioned convolution setup: {num_partitions} partitions, "
                       f"FFT size {self._fft_size}")
        else:
            self._use_partitioned = False
            logger.debug(f"Using direct convolution for short IR ({ir_length} samples)")
    
    def _convert_24bit(self, data: bytes) -> np.ndarray:
        """Convert 24-bit WAV data to float32.

        24-bit audio is stored as 3 bytes per sample in little-endian format.
        We convert each sample to a 32-bit signed integer, then normalize to [-1.0, 1.0].
        """
        num_samples = len(data) // 3
        samples = np.zeros(num_samples, dtype=np.float32)

        for i in range(num_samples):
            # Read 3 bytes and combine into 24-bit value (little-endian)
            b0 = data[i * 3]
            b1 = data[i * 3 + 1]
            b2 = data[i * 3 + 2]

            # Combine bytes into 24-bit signed integer
            value = b0 | (b1 << 8) | (b2 << 16)

            # Sign extend if negative (bit 23 is set)
            if value & 0x800000:
                value -= 0x1000000

            # Normalize to [-1.0, 1.0]
            samples[i] = value / 8388608.0  # 2^23

        return samples
    
    def process(self, input_buffer: np.ndarray) -> np.ndarray:
        """Apply IR convolution to input (RT-safe).

        Uses partitioned convolution for long IRs to maintain low latency.

        Args:
            input_buffer: Input audio samples

        Returns:
            Convolved audio samples
        """
        if not self.is_loaded or self.ir_data is None or self.bypass:
            return input_buffer
        
        try:
            # Apply dry/wet mix
            if self.wet_mix <= 0.0:
                return input_buffer
            
            if self._use_partitioned:
                wet = self._process_partitioned(input_buffer)
            elif SCIPY_AVAILABLE:
                # Use scipy's efficient FFT convolution for short IRs
                wet = signal.fftconvolve(input_buffer, self.ir_data, mode='same')
            else:
                # Fallback to basic numpy convolution (slower)
                wet = np.convolve(input_buffer, self.ir_data, mode='same')
            
            # Normalize to prevent clipping
            max_val = np.max(np.abs(wet))
            if max_val > 1.0:
                wet = wet / max_val
            
            # Apply wet/dry mix
            if self.wet_mix >= 1.0:
                return wet.astype(np.float32)
            else:
                dry = input_buffer
                return (dry * (1.0 - self.wet_mix) + wet * self.wet_mix).astype(np.float32)
            
        except Exception as e:
            logger.error(f"IR processing error: {e}")
            return input_buffer
    
    def _process_partitioned(self, input_buffer: np.ndarray) -> np.ndarray:
        """Process audio using partitioned overlap-add convolution (RT-safe).
        
        This method processes audio in blocks for constant low latency,
        regardless of IR length. Uses pre-computed FFT partitions.
        
        Args:
            input_buffer: Input audio samples (any length)
            
        Returns:
            Convolved audio samples
        """
        if self._fdl is None or not self._partitions:
            return input_buffer
        
        output = np.zeros(len(input_buffer), dtype=np.float32)
        input_pos = 0
        output_pos = 0
        
        while input_pos < len(input_buffer):
            # Fill input buffer
            remaining_input = len(input_buffer) - input_pos
            space_in_buffer = self.PARTITION_SIZE - self._buffer_pos
            copy_count = min(remaining_input, space_in_buffer)
            
            self._input_buffer[self._buffer_pos:self._buffer_pos + copy_count] = \
                input_buffer[input_pos:input_pos + copy_count]
            
            self._buffer_pos += copy_count
            input_pos += copy_count
            
            # Process when buffer is full
            if self._buffer_pos >= self.PARTITION_SIZE:
                # FFT of input block (zero-padded to fft_size)
                input_fft = np.zeros(self._fft_size, dtype=np.float32)
                input_fft[:self.PARTITION_SIZE] = self._input_buffer
                input_freq = fft(input_fft)
                
                # Shift frequency delay line
                self._fdl.appendleft(input_freq)
                
                # Accumulate products of input blocks with IR partitions
                accumulated = np.zeros(self._fft_size, dtype=np.complex128)
                for i, partition_fft in enumerate(self._partitions):
                    if i < len(self._fdl):
                        accumulated += self._fdl[i] * partition_fft
                
                # Inverse FFT and overlap-add
                time_domain = np.real(ifft(accumulated))
                
                # Add overlap from previous block
                time_domain[:self.PARTITION_SIZE] += self._output_buffer[self.PARTITION_SIZE:]
                
                # Copy output and save overlap
                output_remaining = len(output) - output_pos
                copy_out = min(self.PARTITION_SIZE, output_remaining)
                output[output_pos:output_pos + copy_out] = time_domain[:copy_out]
                output_pos += copy_out
                
                # Save overlap for next block
                self._output_buffer[:] = 0
                self._output_buffer[self.PARTITION_SIZE:] = time_domain[self.PARTITION_SIZE:]
                
                # Reset input buffer
                self._input_buffer[:] = 0
                self._buffer_pos = 0
        
        return output
    
    def set_wet_mix(self, mix: float) -> None:
        """Set wet/dry mix.
        
        Args:
            mix: 0.0 = fully dry, 1.0 = fully wet
        """
        self.wet_mix = max(0.0, min(1.0, mix))
    
    def get_latency_samples(self) -> int:
        """Get processing latency in samples.
        
        Returns:
            Latency in samples
        """
        if self._use_partitioned:
            return self.PARTITION_SIZE
        return 0  # Direct convolution has minimal latency


class IRProcessor:
    """Service for managing impulse responses."""

    def __init__(self, ir_directory: Optional[str] = None):
        # Use centralized paths from StoragePaths
        if ir_directory:
            self.ir_directory = Path(ir_directory).expanduser()
        else:
            self.ir_directory = StoragePaths.get_ir_user_dir()

        self.loaded_irs: Dict[str, ImpulseResponse] = {}
        self.active_cabinet_ir: Optional[ImpulseResponse] = None
        self.active_reverb_ir: Optional[ImpulseResponse] = None

        # Create IR directory structure using centralized paths
        StoragePaths.get_ir_cabinet_dir().mkdir(parents=True, exist_ok=True)
        StoragePaths.get_ir_reverb_dir().mkdir(parents=True, exist_ok=True)

    def _append_scanned_ir(
        self,
        irs: List[Dict[str, Any]],
        ir_file: Path,
        type_name: str,
    ) -> None:
        """Append a scanned IR entry while tolerating broken filesystem entries."""
        try:
            stats = ir_file.stat()
        except (FileNotFoundError, PermissionError, OSError) as exc:
            logger.warning("Skipping unreadable %s IR asset %s: %s", type_name, ir_file, exc)
            return

        irs.append({
            "name": ir_file.stem,
            "path": str(ir_file),
            "type": type_name,
            "size": stats.st_size,
            "size_mb": stats.st_size / (1024 * 1024),
        })

    def _scan_ir_pattern(
        self,
        irs: List[Dict[str, Any]],
        search_dir: Path,
        pattern: str,
        type_name: str,
    ) -> None:
        try:
            matches = search_dir.glob(pattern)
        except (PermissionError, OSError) as exc:
            logger.warning("Skipping %s IR directory %s for pattern %s: %s", type_name, search_dir, pattern, exc)
            return

        for ir_file in matches:
            self._append_scanned_ir(irs, ir_file, type_name)
    
    def scan_irs(self, ir_type: str = "all") -> List[Dict[str, Any]]:
        """Scan directories for IR files (.wav format).

        Scans user directories, system directories, and downloaded library directories.
        """
        irs = []

        # User directories
        search_dirs = []
        if ir_type in ["all", "cabinet"]:
            search_dirs.append((StoragePaths.get_ir_cabinet_dir(), "cabinet"))
            # Also check system cabinet directory (legacy location with 's')
            search_dirs.append((Map2Paths.ir_cabinets_library_dir(), "cabinet"))
        if ir_type in ["all", "reverb"]:
            search_dirs.append((StoragePaths.get_ir_reverb_dir(), "reverb"))
            # Also check system reverb directory (legacy location with 's')
            search_dirs.append((Map2Paths.ir_reverbs_library_dir(), "reverb"))

        # Downloaded library directories - categorize by subdirectory name
        download_dir = StoragePaths.get_ir_download_dir()
        if download_dir.exists():
            # Cabinet sources (directories containing cabinet IRs)
            cabinet_sources = ['djammincabs', 'overdriven', 'signaltonoize']
            # Reverb sources
            reverb_sources = ['conners', 'voxengo', 'samplicity', 'echothief', 'lexicon']

            if ir_type in ["all", "cabinet"]:
                for source in cabinet_sources:
                    source_dir = download_dir / source
                    if source_dir.exists():
                        search_dirs.append((source_dir, "cabinet"))

            if ir_type in ["all", "reverb"]:
                for source in reverb_sources:
                    source_dir = download_dir / source
                    if source_dir.exists():
                        search_dirs.append((source_dir, "reverb"))

        for search_dir, type_name in search_dirs:
            if not search_dir.exists():
                continue
            self._scan_ir_pattern(irs, search_dir, "**/*.wav", type_name)
            # Also scan for .aif and .flac files
            for ext in ["*.aif", "*.aiff", "*.flac"]:
                self._scan_ir_pattern(irs, search_dir, f"**/{ext}", type_name)

        logger.info(f"Found {len(irs)} IR files (type: {ir_type})")
        return irs
    
    def load_ir(self, ir_name: str, ir_type: str) -> bool:
        """Load an IR file."""
        irs = self.scan_irs(ir_type)
        ir_info = next((ir for ir in irs if ir['name'] == ir_name), None)
        
        if not ir_info:
            logger.error(f"IR not found: {ir_name}")
            return False
        
        ir = ImpulseResponse(ir_info['path'], ir_name, ir_type)
        if ir.load():
            self.loaded_irs[ir_name] = ir
            
            # Set as active based on type
            if ir_type == "cabinet":
                self.active_cabinet_ir = ir
            elif ir_type == "reverb":
                self.active_reverb_ir = ir
            
            return True
        return False
    
    def process_cabinet(self, input_buffer: np.ndarray) -> np.ndarray:
        """Process audio through active cabinet IR."""
        if self.active_cabinet_ir is None:
            return input_buffer
        return self.active_cabinet_ir.process(input_buffer)
    
    def process_reverb(self, input_buffer: np.ndarray) -> np.ndarray:
        """Process audio through active reverb IR."""
        if self.active_reverb_ir is None:
            return input_buffer
        return self.active_reverb_ir.process(input_buffer)
    
    def set_cabinet_mix(self, mix: float) -> None:
        """Set cabinet IR wet/dry mix (0-100)."""
        if self.active_cabinet_ir:
            self.active_cabinet_ir.set_wet_mix(mix / 100.0)

    def set_reverb_mix(self, mix: float) -> None:
        """Set reverb IR wet/dry mix (0-100)."""
        if self.active_reverb_ir:
            self.active_reverb_ir.set_wet_mix(mix / 100.0)

    def set_cabinet_bypass(self, bypass: bool) -> None:
        """Set cabinet IR bypass state."""
        if self.active_cabinet_ir:
            # Store bypass state on the IR object
            self.active_cabinet_ir.bypass = bypass

    def set_reverb_bypass(self, bypass: bool) -> None:
        """Set reverb IR bypass state."""
        if self.active_reverb_ir:
            # Store bypass state on the IR object
            self.active_reverb_ir.bypass = bypass

    def navigate_ir(self, ir_type: str, direction: str) -> Optional[str]:
        """Navigate to next/previous IR in the list.

        Args:
            ir_type: 'cabinet' or 'reverb'
            direction: 'next' or 'prev'

        Returns:
            Name of the newly loaded IR, or None if no IRs available
        """
        irs = self.scan_irs(ir_type)
        if not irs:
            return None

        # Get current IR name
        if ir_type == "cabinet":
            current = self.active_cabinet_ir.name if self.active_cabinet_ir else None
        else:
            current = self.active_reverb_ir.name if self.active_reverb_ir else None

        # Find current index
        ir_names = [ir['name'] for ir in irs]
        if current and current in ir_names:
            current_idx = ir_names.index(current)
        else:
            current_idx = -1

        # Calculate new index
        if direction == "next":
            new_idx = (current_idx + 1) % len(ir_names)
        else:  # prev
            new_idx = (current_idx - 1) % len(ir_names)

        # Load the new IR
        new_ir_name = ir_names[new_idx]
        if self.load_ir(new_ir_name, ir_type):
            return new_ir_name
        return None

    def get_status(self) -> Dict[str, Any]:
        """Get IR processor status."""
        return {
            "ir_directory": str(self.ir_directory),
            "loaded_irs": list(self.loaded_irs.keys()),
            "active_cabinet": self.active_cabinet_ir.name if self.active_cabinet_ir else None,
            "active_reverb": self.active_reverb_ir.name if self.active_reverb_ir else None,
            "total_cabinets": len(self.scan_irs("cabinet")),
            "total_reverbs": len(self.scan_irs("reverb")),
            "scipy_available": SCIPY_AVAILABLE
        }
