"""
NAM (Neural Amp Modeler) File Processing Service

Handles parsing, validation, and conversion of NAM model files.
Supports .nam binary format and .json text format.

NOTE: This module handles FILE processing only.
Actual NAM audio processing is done by the JUCE C++ engine (in real-time safe context).
"""

import json
import logging
import struct
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Any, Optional, List
import hashlib

logger = logging.getLogger(__name__)


@dataclass
class NAMModel:
    """NAM model metadata and information."""
    name: str
    author: str
    version: int
    architecture: str
    sample_rate: int
    file_path: Optional[str] = None
    metadata: Dict[str, Any] = None
    file_hash: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)


class NAMProcessor:
    """
    Neural Amp Modeler file processor.
    
    Parses .nam and .json NAM model files.
    Extracts metadata and validates model structure.
    
    Real-time audio processing is handled by JUCE C++ engine.
    This service is for file management and metadata extraction.
    """

    def __init__(self):
        self.logger = logging.getLogger("NAMProcessor")

    def parse_nam_file(self, file_path: Path) -> NAMModel:
        """
        Parse NAM model file (.nam or .json format).
        
        Args:
            file_path: Path to NAM model file
            
        Returns:
            NAMModel with extracted metadata
            
        Raises:
            ValueError: If file format is invalid
        """
        file_path = Path(file_path)
        
        if not file_path.exists():
            raise ValueError(f"File not found: {file_path}")
        
        if file_path.suffix.lower() == '.nam':
            return self._parse_binary_nam(file_path)
        elif file_path.suffix.lower() == '.json':
            return self._parse_json_nam(file_path)
        else:
            raise ValueError(f"Unsupported NAM file format: {file_path.suffix}")

    def _parse_binary_nam(self, file_path: Path) -> NAMModel:
        """
        Parse binary .nam file format.
        
        Format:
        - Magic: 4 bytes ("NAM\x00")
        - Version: 4 bytes (uint32)
        - Metadata size: 4 bytes (uint32)
        - Metadata: JSON bytes
        - Model weights: remaining bytes
        """
        try:
            with open(file_path, 'rb') as f:
                # Read and validate magic
                magic = f.read(4)
                if magic != b'NAM\x00':
                    raise ValueError(f"Invalid NAM file header: {magic.hex()}")
                
                # Read version
                version_bytes = f.read(4)
                if len(version_bytes) < 4:
                    raise ValueError("NAM file truncated (version missing)")
                version = struct.unpack('<I', version_bytes)[0]
                
                # Read metadata size
                size_bytes = f.read(4)
                if len(size_bytes) < 4:
                    raise ValueError("NAM file truncated (metadata size missing)")
                metadata_size = struct.unpack('<I', size_bytes)[0]
                
                # Read metadata JSON
                if metadata_size == 0 or metadata_size > 10_000_000:  # 10MB max
                    raise ValueError(f"Invalid metadata size: {metadata_size}")
                
                metadata_bytes = f.read(metadata_size)
                if len(metadata_bytes) < metadata_size:
                    raise ValueError("NAM file truncated (metadata incomplete)")
                
                try:
                    metadata = json.loads(metadata_bytes.decode('utf-8'))
                except json.JSONDecodeError as e:
                    raise ValueError(f"Invalid metadata JSON: {e}")
            
            # Calculate file hash
            file_hash = self._calculate_file_hash(file_path)
            
            # Extract model information
            return NAMModel(
                name=metadata.get('name', file_path.stem),
                author=metadata.get('author', 'Unknown'),
                version=version,
                architecture=metadata.get('architecture', 'unknown'),
                sample_rate=metadata.get('sample_rate', 48000),
                file_path=str(file_path),
                metadata=metadata,
                file_hash=file_hash
            )
            
        except struct.error as e:
            raise ValueError(f"NAM file parse error: {e}")
        except Exception as e:
            self.logger.error(f"Failed to parse NAM file {file_path}: {e}")
            raise

    def _parse_json_nam(self, file_path: Path) -> NAMModel:
        """
        Parse JSON NAM file format.
        
        Expected structure:
        {
            "name": "model name",
            "author": "author name",
            "version": 1,
            "architecture": "model architecture",
            "sample_rate": 48000,
            ...
        }
        """
        try:
            with open(file_path, 'r') as f:
                metadata = json.load(f)
            
            # Validate required fields
            required = ['name', 'author', 'version']
            missing = [f for f in required if f not in metadata]
            if missing:
                raise ValueError(f"Missing required fields: {', '.join(missing)}")
            
            # Calculate file hash
            file_hash = self._calculate_file_hash(file_path)
            
            return NAMModel(
                name=metadata.get('name'),
                author=metadata.get('author'),
                version=int(metadata.get('version', 1)),
                architecture=metadata.get('architecture', 'unknown'),
                sample_rate=int(metadata.get('sample_rate', 48000)),
                file_path=str(file_path),
                metadata=metadata,
                file_hash=file_hash
            )
            
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON NAM file: {e}")
        except Exception as e:
            self.logger.error(f"Failed to parse JSON NAM file {file_path}: {e}")
            raise

    def _calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA256 hash of file."""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def validate_nam_model(self, nam_model: NAMModel) -> bool:
        """
        Validate NAM model structure.
        
        Args:
            nam_model: NAM model to validate
            
        Returns:
            True if valid, False otherwise
        """
        try:
            # Validate metadata
            if not nam_model.name or not nam_model.author:
                self.logger.error("NAM model missing name or author")
                return False
            
            # Validate sample rate
            if nam_model.sample_rate < 8000 or nam_model.sample_rate > 192000:
                self.logger.error(f"Invalid sample rate: {nam_model.sample_rate}")
                return False
            
            # Validate architecture
            valid_architectures = ['unknown', 'lstm', 'cnn', 'rnn', 'dnn', 'hybrid']
            if nam_model.architecture.lower() not in valid_architectures:
                self.logger.warning(f"Unknown architecture: {nam_model.architecture}")
            
            # Validate file exists if specified
            if nam_model.file_path:
                if not Path(nam_model.file_path).exists():
                    self.logger.error(f"Model file not found: {nam_model.file_path}")
                    return False
            
            self.logger.info(f"NAM model validated: {nam_model.name}")
            return True
            
        except Exception as e:
            self.logger.error(f"Model validation error: {e}")
            return False

    def get_model_info(self, nam_model: NAMModel) -> Dict[str, Any]:
        """Get comprehensive model information."""
        info = {
            'name': nam_model.name,
            'author': nam_model.author,
            'version': nam_model.version,
            'architecture': nam_model.architecture,
            'sample_rate': nam_model.sample_rate,
            'file_path': nam_model.file_path,
            'file_hash': nam_model.file_hash,
            'metadata': nam_model.metadata or {}
        }
        
        # Add file size if available
        if nam_model.file_path and Path(nam_model.file_path).exists():
            info['file_size_mb'] = Path(nam_model.file_path).stat().st_size / (1024 * 1024)
        
        return info


# Singleton instance
_nam_processor: Optional[NAMProcessor] = None


def get_nam_processor() -> NAMProcessor:
    """Get or create NAM processor instance."""
    global _nam_processor
    if _nam_processor is None:
        _nam_processor = NAMProcessor()
    return _nam_processor
