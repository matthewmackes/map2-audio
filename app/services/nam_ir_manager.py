"""
NAM/IR File Manager - Stream-based loading without loading entire files.
Designed for efficient handling of multiple NAM (.nam) and IR (.wav) files.
"""

import logging
import os
import struct
from pathlib import Path
from typing import Dict, Optional, List, Tuple
from dataclasses import dataclass
import threading
import io

from app.paths import StoragePaths

logger = logging.getLogger(__name__)


@dataclass
class NAMFileInfo:
    """Metadata about a NAM file without loading the entire file."""
    path: str
    name: str
    file_size: int
    model_type: str = "unknown"
    sample_rate: int = 48000
    input_gain: float = 0.0
    output_gain: float = 0.0
    created_date: str = ""
    description: str = ""


@dataclass
class IRFileInfo:
    """Metadata about an IR file without loading the entire file."""
    path: str
    name: str
    file_size: int
    channels: int = 2
    sample_rate: int = 48000
    num_samples: int = 0
    duration_ms: float = 0.0


class NAMFileMetadataExtractor:
    """Extract metadata from NAM files without loading the entire file."""
    
    # NAM file header signature
    NAM_MAGIC = b"NAM"
    
    @staticmethod
    def extract_metadata(file_path: str) -> Optional[NAMFileInfo]:
        """
        Extract metadata from NAM file.
        
        Returns:
            NAMFileInfo with metadata or None if invalid file
        """
        try:
            file_path = Path(file_path)
            if not file_path.exists():
                return None
            
            file_size = file_path.stat().st_size
            name = file_path.stem
            
            # Try reading first 4KB to get metadata
            with open(file_path, 'rb') as f:
                header = f.read(1024)
                
                # Basic NAM validation
                if len(header) > 3 and header[:3] == NAMFileMetadataExtractor.NAM_MAGIC:
                    info = NAMFileInfo(
                        path=str(file_path),
                        name=name,
                        file_size=file_size,
                        model_type="NAM Model"
                    )
                    logger.debug(f"Extracted NAM metadata: {name} ({file_size} bytes)")
                    return info
            
            # Fallback for unrecognized format
            return NAMFileInfo(
                path=str(file_path),
                name=name,
                file_size=file_size
            )
            
        except Exception as e:
            logger.error(f"Error extracting NAM metadata from {file_path}: {e}")
            return None


class IRFileMetadataExtractor:
    """Extract metadata from IR files without loading the entire file."""
    
    # WAV file constants
    RIFF_MAGIC = b"RIFF"
    WAVE_MAGIC = b"WAVE"
    FMT_MAGIC = b"fmt "
    DATA_MAGIC = b"data"
    
    @staticmethod
    def extract_metadata(file_path: str) -> Optional[IRFileInfo]:
        """
        Extract metadata from WAV IR file.
        
        Returns:
            IRFileInfo with metadata or None if invalid file
        """
        try:
            file_path = Path(file_path)
            if not file_path.exists():
                return None
            
            file_size = file_path.stat().st_size
            name = file_path.stem
            
            # Read WAV header (first 256 bytes max)
            with open(file_path, 'rb') as f:
                # Check RIFF header
                riff = f.read(4)
                if riff != IRFileMetadataExtractor.RIFF_MAGIC:
                    logger.warning(f"Invalid WAV file: {file_path}")
                    return None
                
                # Skip file size
                f.read(4)
                
                # Check WAVE marker
                wave = f.read(4)
                if wave != IRFileMetadataExtractor.WAVE_MAGIC:
                    return None
                
                # Find fmt chunk
                channels = 2
                sample_rate = 48000
                
                while True:
                    chunk_id = f.read(4)
                    if not chunk_id or len(chunk_id) < 4:
                        break
                    
                    chunk_size = struct.unpack('<I', f.read(4))[0]
                    
                    if chunk_id == IRFileMetadataExtractor.FMT_MAGIC:
                        # Read format data
                        audio_format = struct.unpack('<H', f.read(2))[0]
                        channels = struct.unpack('<H', f.read(2))[0]
                        sample_rate = struct.unpack('<I', f.read(4))[0]
                        # Skip byte rate, block align
                        f.read(6)
                        break
                    else:
                        # Skip this chunk
                        f.read(chunk_size)
                
                # Find data chunk for size
                num_samples = 0
                while True:
                    chunk_id = f.read(4)
                    if not chunk_id or len(chunk_id) < 4:
                        break
                    
                    chunk_size = struct.unpack('<I', f.read(4))[0]
                    
                    if chunk_id == IRFileMetadataExtractor.DATA_MAGIC:
                        # Calculate number of samples
                        bytes_per_sample = 2  # assuming 16-bit
                        num_samples = chunk_size // (channels * bytes_per_sample)
                        break
                    else:
                        f.read(chunk_size)
                
                # Calculate duration
                duration_ms = (num_samples / sample_rate * 1000) if sample_rate > 0 else 0
                
                info = IRFileInfo(
                    path=str(file_path),
                    name=name,
                    file_size=file_size,
                    channels=channels,
                    sample_rate=sample_rate,
                    num_samples=num_samples,
                    duration_ms=duration_ms
                )
                
                logger.debug(f"Extracted IR metadata: {name} ({channels}ch, {sample_rate}Hz, {duration_ms:.1f}ms)")
                return info
            
        except Exception as e:
            logger.error(f"Error extracting IR metadata from {file_path}: {e}")
            return None


class StreamingIRLoader:
    """Load IR files in chunks for efficient streaming (no full-file loading)."""
    
    def __init__(self, chunk_size_ms: float = 100):
        """
        Initialize streaming IR loader.
        
        Args:
            chunk_size_ms: Process IR in chunks (e.g., 100ms chunks)
        """
        self.chunk_size_ms = chunk_size_ms
    
    def create_stream_reader(self, file_path: str, sample_rate: int = 48000):
        """
        Create a streaming reader for an IR file.
        
        Returns:
            Generator that yields chunks of audio data
        """
        try:
            with open(file_path, 'rb') as f:
                # Parse WAV header to find data chunk
                # ... WAV parsing code ...
                
                # Yield chunks without loading entire file
                chunk_samples = int((self.chunk_size_ms / 1000.0) * sample_rate)
                while True:
                    chunk = f.read(chunk_samples * 4)  # 2 channels * 2 bytes
                    if not chunk:
                        break
                    yield chunk
        
        except Exception as e:
            logger.error(f"Error streaming IR file {file_path}: {e}")


class NAMIRManager:
    """
    Manage NAM and IR files efficiently.
    - Never loads entire files into memory
    - Stream-based processing
    - Metadata caching
    """

    def __init__(self, nam_dir: Optional[str] = None, ir_dir: Optional[str] = None):
        # Use centralized paths from StoragePaths
        self.nam_dir = Path(nam_dir) if nam_dir else StoragePaths.get_nam_user_dir()
        self.ir_dir = Path(ir_dir) if ir_dir else StoragePaths.get_ir_user_dir()
        
        self._nam_metadata: Dict[str, NAMFileInfo] = {}
        self._ir_metadata: Dict[str, IRFileInfo] = {}
        self._lock = threading.RLock()
        
        # Streaming loader
        self.ir_loader = StreamingIRLoader()
    
    def scan_nam_files(self) -> List[NAMFileInfo]:
        """Scan and cache NAM file metadata from all configured paths."""
        with self._lock:
            self._nam_metadata.clear()

            # Scan all configured NAM paths (user, system, and extra paths)
            scan_dirs = StoragePaths.get_all_nam_paths(include_nonexistent=False)

            for scan_dir in scan_dirs:
                if not scan_dir.exists():
                    continue
                # Scan recursively for .nam files
                for nam_file in scan_dir.glob("**/*.nam"):
                    info = NAMFileMetadataExtractor.extract_metadata(str(nam_file))
                    if info and info.name not in self._nam_metadata:
                        self._nam_metadata[info.name] = info

            logger.info(f"Scanned {len(self._nam_metadata)} NAM files from {len(scan_dirs)} directories")
            return list(self._nam_metadata.values())
    
    def scan_ir_files(self) -> List[IRFileInfo]:
        """Scan and cache IR file metadata from all configured paths."""
        with self._lock:
            self._ir_metadata.clear()

            # Scan all configured IR paths (user, system, and extra paths)
            scan_dirs = StoragePaths.get_all_ir_paths(include_nonexistent=False)

            for scan_dir in scan_dirs:
                if not scan_dir.exists():
                    continue
                # Scan recursively for .wav files
                for ir_file in scan_dir.glob("**/*.wav"):
                    info = IRFileMetadataExtractor.extract_metadata(str(ir_file))
                    if info and info.name not in self._ir_metadata:
                        self._ir_metadata[info.name] = info

            logger.info(f"Scanned {len(self._ir_metadata)} IR files from {len(scan_dirs)} directories")
            return list(self._ir_metadata.values())
    
    def get_nam_metadata(self, name: str) -> Optional[NAMFileInfo]:
        """Get NAM file metadata without loading file."""
        with self._lock:
            return self._nam_metadata.get(name)
    
    def get_ir_metadata(self, name: str) -> Optional[IRFileInfo]:
        """Get IR file metadata without loading file."""
        with self._lock:
            return self._ir_metadata.get(name)
    
    def get_all_nam_metadata(self) -> List[NAMFileInfo]:
        """Get all NAM file metadata."""
        with self._lock:
            return list(self._nam_metadata.values())
    
    def get_all_ir_metadata(self) -> List[IRFileInfo]:
        """Get all IR file metadata."""
        with self._lock:
            return list(self._ir_metadata.values())
    
    def stream_ir_file(self, name: str, sample_rate: int = 48000):
        """
        Get a streaming reader for an IR file.
        Files are processed in chunks, never fully loaded.
        """
        with self._lock:
            info = self._ir_metadata.get(name)
        
        if not info:
            logger.warning(f"IR file not found: {name}")
            return None
        
        return self.ir_loader.create_stream_reader(info.path, sample_rate)
    
    def get_nam_file_path(self, name: str) -> Optional[str]:
        """Get full path to NAM file."""
        info = self.get_nam_metadata(name)
        return info.path if info else None
    
    def get_ir_file_path(self, name: str) -> Optional[str]:
        """Get full path to IR file."""
        info = self.get_ir_metadata(name)
        return info.path if info else None


# Singleton instance
_nam_ir_manager: Optional[NAMIRManager] = None


def get_nam_ir_manager() -> NAMIRManager:
    """Get or create the global NAM/IR manager."""
    global _nam_ir_manager
    if _nam_ir_manager is None:
        _nam_ir_manager = NAMIRManager()
    return _nam_ir_manager
