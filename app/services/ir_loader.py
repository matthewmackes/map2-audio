"""
IR Loader and Validator
Load, validate, and prepare impulse response files.
"""

import logging
import os
from typing import Optional, Tuple, Dict
import numpy as np
try:
    import soundfile as sf
    SOUNDFILE_AVAILABLE = True
except ImportError:
    SOUNDFILE_AVAILABLE = False
    sf = None
import hashlib

logger = logging.getLogger(__name__)


class IRLoader:
    """Load and validate impulse response files."""
    
    SUPPORTED_FORMATS = ['.wav', '.flac', '.aiff', '.aif']
    MAX_IR_LENGTH_SECONDS = 30.0  # Maximum IR length
    MIN_IR_LENGTH_SAMPLES = 100    # Minimum IR length
    
    def __init__(self):
        """Initialize IR loader."""
        self.loaded_irs: Dict[str, dict] = {}
    
    def load_ir_file(self, file_path: str) -> Optional[Tuple[np.ndarray, int, dict]]:
        """Load IR from file and extract metadata.
        
        Args:
            file_path: Path to IR file
            
        Returns:
            Tuple of (audio_data, sample_rate, metadata) or None
        """
        if not os.path.exists(file_path):
            logger.error(f"IR file not found: {file_path}")
            return None
        
        # Check file extension
        ext = os.path.splitext(file_path)[1].lower()
        if ext not in self.SUPPORTED_FORMATS:
            logger.error(f"Unsupported IR format: {ext}")
            return None
        
        try:
            # Load audio
            audio_data, sample_rate = sf.read(file_path, dtype='float32')
            
            # Validate
            if not self._validate_ir(audio_data, sample_rate):
                return None
            
            # Extract metadata
            metadata = self._extract_metadata(file_path, audio_data, sample_rate)
            
            # Cache
            self.loaded_irs[file_path] = {
                'audio': audio_data,
                'sample_rate': sample_rate,
                'metadata': metadata
            }
            
            logger.info(f"Loaded IR: {os.path.basename(file_path)} "
                       f"({len(audio_data)} samples @ {sample_rate}Hz)")
            
            return (audio_data, sample_rate, metadata)
            
        except Exception as e:
            logger.error(f"Error loading IR {file_path}: {e}")
            return None
    
    def _validate_ir(self, audio_data: np.ndarray, sample_rate: int) -> bool:
        """Validate IR audio data.
        
        Args:
            audio_data: Audio samples
            sample_rate: Sample rate
            
        Returns:
            True if valid
        """
        # Check length
        if len(audio_data) < self.MIN_IR_LENGTH_SAMPLES:
            logger.error(f"IR too short: {len(audio_data)} samples")
            return False
        
        max_samples = int(self.MAX_IR_LENGTH_SECONDS * sample_rate)
        if len(audio_data) > max_samples:
            logger.warning(f"IR very long: {len(audio_data)} samples, truncating to {max_samples}")
            # Could truncate here if needed
        
        # Check for silence
        if np.max(np.abs(audio_data)) < 0.001:
            logger.error("IR appears to be silent")
            return False
        
        # Check for clipping
        if np.max(np.abs(audio_data)) > 0.99:
            logger.warning("IR may be clipped")
        
        # Check for DC offset
        dc_offset = np.mean(audio_data)
        if abs(dc_offset) > 0.1:
            logger.warning(f"IR has DC offset: {dc_offset:.3f}")
        
        return True
    
    def _extract_metadata(self, file_path: str, audio_data: np.ndarray, sample_rate: int) -> dict:
        """Extract metadata from IR.
        
        Args:
            file_path: File path
            audio_data: Audio data
            sample_rate: Sample rate
            
        Returns:
            Metadata dict
        """
        # Basic info
        metadata = {
            'file_path': file_path,
            'file_name': os.path.basename(file_path),
            'file_size_bytes': os.path.getsize(file_path),
            'file_hash': self._calculate_hash(file_path),
            'sample_rate': sample_rate,
            'length_samples': len(audio_data),
            'duration_seconds': len(audio_data) / sample_rate,
            'channels': 1 if audio_data.ndim == 1 else audio_data.shape[1],
            'peak_amplitude': float(np.max(np.abs(audio_data))),
            'rms_level': float(np.sqrt(np.mean(audio_data ** 2))),
        }
        
        # Analyze IR characteristics
        try:
            metadata.update(self._analyze_ir_characteristics(audio_data, sample_rate))
        except Exception as e:
            logger.warning(f"Could not analyze IR characteristics: {e}")
        
        return metadata
    
    def _calculate_hash(self, file_path: str) -> str:
        """Calculate SHA256 hash of file.
        
        Args:
            file_path: File path
            
        Returns:
            Hash string
        """
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                sha256.update(chunk)
        return sha256.hexdigest()
    
    def _analyze_ir_characteristics(self, audio_data: np.ndarray, sample_rate: int) -> dict:
        """Analyze acoustic characteristics of IR.
        
        Estimates:
        - RT60 (reverberation time)
        - Early decay time
        - Peak location
        
        Args:
            audio_data: Audio data
            sample_rate: Sample rate
            
        Returns:
            Characteristics dict
        """
        # Work with mono
        if audio_data.ndim > 1:
            mono = np.mean(audio_data, axis=1)
        else:
            mono = audio_data
        
        # Energy decay curve
        energy = mono ** 2
        
        # Smooth energy
        window_size = int(sample_rate * 0.01)  # 10ms window
        if window_size > 0:
            energy_smooth = np.convolve(energy, np.ones(window_size) / window_size, mode='same')
        else:
            energy_smooth = energy
        
        # Find peak
        peak_idx = np.argmax(np.abs(mono))
        peak_time_ms = (peak_idx / sample_rate) * 1000.0
        
        # Estimate RT60 (simplified)
        # Find where energy drops to -60dB from peak
        peak_energy = energy_smooth[peak_idx]
        target_energy = peak_energy * 10 ** (-60 / 10)  # -60dB
        
        rt60_samples = len(energy_smooth) - peak_idx  # Default to full length
        for i in range(peak_idx, len(energy_smooth)):
            if energy_smooth[i] < target_energy:
                rt60_samples = i - peak_idx
                break
        
        rt60_seconds = rt60_samples / sample_rate
        
        # Early decay time (EDT) - first 10dB drop
        target_edt = peak_energy * 10 ** (-10 / 10)
        edt_samples = rt60_samples
        for i in range(peak_idx, len(energy_smooth)):
            if energy_smooth[i] < target_edt:
                edt_samples = i - peak_idx
                break
        edt_seconds = edt_samples / sample_rate
        
        return {
            'peak_location_ms': float(peak_time_ms),
            'rt60_seconds': float(rt60_seconds),
            'early_decay_time_seconds': float(edt_seconds),
            'estimated': True  # Mark as estimated (not measured)
        }
    
    def validate_ir_directory(self, directory: str) -> Tuple[int, int]:
        """Validate all IRs in a directory.
        
        Args:
            directory: Directory path
            
        Returns:
            Tuple of (valid_count, invalid_count)
        """
        if not os.path.isdir(directory):
            logger.error(f"Directory not found: {directory}")
            return (0, 0)
        
        valid = 0
        invalid = 0
        
        for root, dirs, files in os.walk(directory):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in self.SUPPORTED_FORMATS:
                    file_path = os.path.join(root, file)
                    result = self.load_ir_file(file_path)
                    if result is not None:
                        valid += 1
                    else:
                        invalid += 1
        
        logger.info(f"Validated {valid} valid, {invalid} invalid IRs in {directory}")
        return (valid, invalid)
    
    def get_cached_ir(self, file_path: str) -> Optional[dict]:
        """Get cached IR data.
        
        Args:
            file_path: File path
            
        Returns:
            Cached IR dict or None
        """
        return self.loaded_irs.get(file_path)
    
    def clear_cache(self) -> None:
        """Clear IR cache."""
        self.loaded_irs.clear()
        logger.debug("IR cache cleared")


# Global instance
_ir_loader: Optional[IRLoader] = None


def get_ir_loader() -> IRLoader:
    """Get or create global IR loader instance."""
    global _ir_loader
    if _ir_loader is None:
        _ir_loader = IRLoader()
    return _ir_loader
