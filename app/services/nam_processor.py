"""
Neural Amp Modeler Integration
Provides high-quality guitar amp and pedal simulation using trained neural networks.

⚠️  CRITICAL: NOT REAL-TIME SAFE IN PYTHON ⚠️

This Python-based NAM processor should NOT be used in real-time audio callbacks.

PROBLEMS:
- PyTorch inference has variable latency (5-15ms CPU, 2-5ms GPU)
- Python GIL causes non-deterministic delays
- Memory allocations during inference
- NOT suitable for live guitar processing

RECOMMENDED ALTERNATIVES:
1. Use JUCE C++ with libtorch (real-time safe)
2. Use this module for offline processing only
3. Pre-render NAM models to IRs for convolution

Features:
- GPU/CUDA acceleration detection and optimization
- CPU inference fallback with thread optimization
- RT-safe buffer management with pre-allocation (but Python GIL still causes issues!)
- Latency reporting for compensation

USE CASES:
- Offline audio file processing
- Testing and development
- Non-real-time applications
- NOT for live performance
"""

import json
import logging
import numpy as np
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path
import threading

from app.paths import StoragePaths
from app.utils.dependencies import DependencyChecker
from app.utils.logging_utils import get_logger

logger = get_logger(__name__)

# Check PyTorch availability
TORCH_AVAILABLE, torch = DependencyChecker.check('torch')

if TORCH_AVAILABLE and torch:
    # Detect CUDA/GPU availability
    CUDA_AVAILABLE = torch.cuda.is_available()
    if CUDA_AVAILABLE:
        GPU_NAME = torch.cuda.get_device_name(0)
        GPU_MEMORY = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        logger.info(f"CUDA available: {GPU_NAME} ({GPU_MEMORY:.1f}GB)")
    else:
        GPU_NAME = None
        GPU_MEMORY = 0
        logger.info("CUDA not available, using CPU inference")
    
    # Check for MPS (Apple Silicon)
    MPS_AVAILABLE = hasattr(torch.backends, 'mps') and torch.backends.mps.is_available()
    if MPS_AVAILABLE:
        logger.info("Apple MPS (Metal) available for GPU acceleration")
else:
    CUDA_AVAILABLE = False
    MPS_AVAILABLE = False
    GPU_NAME = None
    GPU_MEMORY = 0
    logger.warning("PyTorch not available - NAM models will not load")

# Check NAM availability
NAM_AVAILABLE, nam_module = DependencyChecker.check('nam.models')
init_from_nam = nam_module.init_from_nam if NAM_AVAILABLE and nam_module else None

if NAM_AVAILABLE:
    logger.info("NAM (Neural Amp Modeler) loaded successfully")
else:
    logger.warning("NAM not available - install with: pip install neural-amp-modeler")


class NAMModel:
    """Represents a loaded NAM model (amp or pedal) with GPU optimization.

    Features:
    - Automatic GPU/CPU device selection
    - Pre-allocated buffers for RT-safe processing
    - Latency reporting for compensation
    - Thread-safe inference
    - Error recovery with automatic bypass
    """

    # Default buffer size for pre-allocation (samples)
    DEFAULT_BUFFER_SIZE = 2048

    # Error recovery thresholds
    MAX_CONSECUTIVE_ERRORS = 5
    ERROR_COOLDOWN_SEC = 10.0

    def __init__(self, model_path: str, name: str, device: Optional[str] = None):
        """Initialize NAM model.

        Args:
            model_path: Path to .nam model file
            name: Model display name
            device: Target device ('cuda', 'mps', 'cpu', or None for auto)
        """
        # ⚠️  WARNING: NOT REAL-TIME SAFE ⚠️
        logger.warning(
            f"NAM Model '{name}': Python PyTorch inference is NOT real-time safe. "
            "Use JUCE C++ engine with libtorch for live performance."
        )
        
        self.model_path = model_path
        self.name = name
        self.model = None
        self.sample_rate = 48000
        self.is_loaded = False

        # Device selection (auto-detect if not specified)
        if device is None:
            if CUDA_AVAILABLE:
                self.device = 'cuda'
            elif MPS_AVAILABLE:
                self.device = 'mps'
            else:
                self.device = 'cpu'
        else:
            self.device = device

        # Pre-allocated buffers for RT-safe processing
        self._input_buffer: Optional[torch.Tensor] = None
        self._output_buffer: Optional[np.ndarray] = None
        self._buffer_size = self.DEFAULT_BUFFER_SIZE

        # Thread safety
        self._inference_lock = threading.Lock()

        # Performance stats
        self._total_samples_processed = 0
        self._total_inference_time_ms = 0

        # Error recovery
        self._consecutive_errors = 0
        self._is_bypassed = False
        self._bypass_reason: Optional[str] = None
        self._last_error_time = 0.0
        self._total_errors = 0
        
    def load(self) -> bool:
        """Load NAM model from .nam file (JSON format).
        
        Returns:
            True if loaded successfully
        """
        try:
            if not NAM_AVAILABLE:
                logger.error("NAM library not available")
                return False

            # .nam files are JSON - load config and initialize model
            with open(self.model_path, 'r') as f:
                config = json.load(f)

            self.model = init_from_nam(config)
            self.model.eval()
            
            # Move model to target device
            if TORCH_AVAILABLE and self.device != 'cpu':
                try:
                    self.model = self.model.to(self.device)
                    logger.info(f"NAM model '{self.name}' loaded on {self.device}")
                except Exception as e:
                    logger.warning(f"Failed to move model to {self.device}, using CPU: {e}")
                    self.device = 'cpu'
            else:
                logger.info(f"NAM model '{self.name}' loaded on CPU")
            
            # Pre-allocate buffers
            self._allocate_buffers(self._buffer_size)
            
            self.is_loaded = True
            return True
            
        except Exception as e:
            logger.error(f"Failed to load NAM model {self.name}: {e}")
            return False
    
    def _allocate_buffers(self, buffer_size: int) -> None:
        """Pre-allocate processing buffers for RT-safe operation.
        
        Args:
            buffer_size: Buffer size in samples
        """
        if not TORCH_AVAILABLE:
            return
        
        self._buffer_size = buffer_size
        
        # Pre-allocate input tensor on target device
        self._input_buffer = torch.zeros(
            (1, 1, buffer_size),
            dtype=torch.float32,
            device=self.device
        )
        
        # Pre-allocate output buffer
        self._output_buffer = np.zeros(buffer_size, dtype=np.float32)
        
        logger.debug(f"Pre-allocated NAM buffers: {buffer_size} samples on {self.device}")
    
    def process(self, input_buffer: np.ndarray) -> np.ndarray:
        """Process audio through NAM model (RT-safe).

        Uses pre-allocated buffers and torch.no_grad() for efficiency.
        Thread-safe via inference lock.
        Includes automatic bypass on consecutive errors.

        Args:
            input_buffer: Input audio samples (mono)

        Returns:
            Processed audio samples
        """
        if not self.is_loaded or self.model is None:
            return input_buffer

        # Check if bypassed due to errors
        if self._is_bypassed:
            # Check if cooldown has passed for re-enable attempt
            import time as time_module
            if time_module.perf_counter() - self._last_error_time > self.ERROR_COOLDOWN_SEC:
                self._try_re_enable()
            if self._is_bypassed:
                return input_buffer

        try:
            import time
            start_time = time.perf_counter()

            with self._inference_lock:
                with torch.no_grad():
                    # Handle buffer size changes
                    if len(input_buffer) != self._buffer_size:
                        self._allocate_buffers(len(input_buffer))

                    # Copy input to pre-allocated tensor (minimizes allocations)
                    if self.device == 'cpu':
                        input_tensor = torch.from_numpy(input_buffer.astype(np.float32))
                    else:
                        # For GPU, use pinned memory for faster transfer
                        self._input_buffer[0, 0, :len(input_buffer)] = torch.from_numpy(
                            input_buffer.astype(np.float32)
                        )
                        input_tensor = self._input_buffer[:, :, :len(input_buffer)]

                    # Ensure correct shape (batch, channels, samples)
                    if input_tensor.dim() == 1:
                        input_tensor = input_tensor.unsqueeze(0).unsqueeze(0)
                    elif input_tensor.dim() == 2:
                        input_tensor = input_tensor.unsqueeze(0)

                    # Move to device if needed
                    if input_tensor.device.type != self.device:
                        input_tensor = input_tensor.to(self.device)

                    # NAM forward pass
                    output_tensor = self.model(input_tensor)

                    # Move back to CPU and convert to numpy
                    if output_tensor.device.type != 'cpu':
                        output_tensor = output_tensor.cpu()

                    output = output_tensor.squeeze().numpy()

            # Update stats - success
            inference_time = (time.perf_counter() - start_time) * 1000
            self._total_samples_processed += len(input_buffer)
            self._total_inference_time_ms += inference_time
            self._consecutive_errors = 0  # Reset on success

            return output

        except Exception as e:
            import time as time_module
            self._total_errors += 1
            self._consecutive_errors += 1
            self._last_error_time = time_module.perf_counter()

            logger.error(f"NAM processing error ({self._consecutive_errors}/{self.MAX_CONSECUTIVE_ERRORS}): {e}")

            # Auto-bypass after too many consecutive errors
            if self._consecutive_errors >= self.MAX_CONSECUTIVE_ERRORS:
                self._auto_bypass(str(e))

            return input_buffer

    def _auto_bypass(self, error_reason: str) -> None:
        """Automatically bypass model due to errors."""
        self._is_bypassed = True
        self._bypass_reason = f"Auto-bypassed after {self._consecutive_errors} errors: {error_reason}"
        logger.warning(f"NAM model '{self.name}' auto-bypassed: {self._bypass_reason}")

    def _try_re_enable(self) -> None:
        """Attempt to re-enable after cooldown."""
        logger.info(f"Attempting to re-enable NAM model '{self.name}'")
        self._is_bypassed = False
        self._bypass_reason = None
        self._consecutive_errors = 0

    def force_bypass(self, reason: str = "Manual bypass") -> None:
        """Manually bypass this model."""
        self._is_bypassed = True
        self._bypass_reason = reason
        logger.info(f"NAM model '{self.name}' manually bypassed: {reason}")

    def force_enable(self) -> None:
        """Manually re-enable this model."""
        self._is_bypassed = False
        self._bypass_reason = None
        self._consecutive_errors = 0
        logger.info(f"NAM model '{self.name}' manually re-enabled")

    @property
    def is_bypassed(self) -> bool:
        """Check if model is currently bypassed."""
        return self._is_bypassed

    @property
    def bypass_reason(self) -> Optional[str]:
        """Get reason for bypass if bypassed."""
        return self._bypass_reason
    
    def get_latency_samples(self) -> int:
        """Get model processing latency in samples.
        
        NAM models have inherent latency based on their architecture.
        
        Returns:
            Estimated latency in samples
        """
        # NAM models typically have ~32-64 samples of latency
        # This is architecture-dependent
        return 64
    
    def get_stats(self) -> Dict[str, Any]:
        """Get model performance statistics.

        Returns:
            Performance statistics dictionary
        """
        avg_time = 0.0
        if self._total_samples_processed > 0:
            avg_time = self._total_inference_time_ms / (self._total_samples_processed / self._buffer_size)

        return {
            "name": self.name,
            "device": self.device,
            "buffer_size": self._buffer_size,
            "total_samples": self._total_samples_processed,
            "avg_inference_ms": avg_time,
            "latency_samples": self.get_latency_samples(),
            "total_errors": self._total_errors,
            "consecutive_errors": self._consecutive_errors,
            "is_bypassed": self._is_bypassed,
            "bypass_reason": self._bypass_reason,
        }


class NAMProcessor:
    """Service for managing NAM models and processing.
    
    Features:
    - Model discovery and management
    - GPU/CPU device optimization
    - Multiple simultaneous model loading
    - Performance monitoring
    """
    
    def __init__(self, model_directory: Optional[str] = None,
                 prefer_gpu: bool = True):
        """Initialize NAM processor.

        Args:
            model_directory: Directory containing NAM model files (uses config default if None)
            prefer_gpu: Prefer GPU acceleration if available
        """
        # Use centralized paths from StoragePaths
        if model_directory:
            self.model_directory = Path(model_directory).expanduser()
        else:
            self.model_directory = StoragePaths.get_nam_user_dir()

        self.loaded_models: Dict[str, NAMModel] = {}
        self.active_model: Optional[NAMModel] = None
        self.prefer_gpu = prefer_gpu

        # Determine target device
        if prefer_gpu and CUDA_AVAILABLE:
            self.device = 'cuda'
        elif prefer_gpu and MPS_AVAILABLE:
            self.device = 'mps'
        else:
            self.device = 'cpu'

        # Create model directory if it doesn't exist
        self.model_directory.mkdir(parents=True, exist_ok=True)
        
        # Optimize PyTorch settings
        if TORCH_AVAILABLE:
            self._optimize_torch_settings()
    
    def _optimize_torch_settings(self) -> None:
        """Optimize PyTorch for real-time inference."""
        if not TORCH_AVAILABLE:
            return
        
        # Set number of threads for CPU inference
        import os
        cpu_threads = min(4, os.cpu_count() or 4)  # Limit threads for RT
        torch.set_num_threads(cpu_threads)
        
        # Enable TF32 for faster GPU inference on Ampere+ GPUs
        if CUDA_AVAILABLE:
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
            torch.backends.cudnn.benchmark = True
        
        logger.info(f"PyTorch optimized: {cpu_threads} CPU threads, device={self.device}")
    
    def scan_models(self) -> List[Dict[str, Any]]:
        """Scan directories for NAM model files (.nam format).

        Scans all configured NAM paths including:
        - User directory (~/.local/share/map2/nam)
        - System directory (/var/lib/map2/nam)
        - Extra paths from config (~/NAM, ~/NAM/models, etc.)
        - Legacy config location
        """
        models = []
        seen_names = set()

        # Get all NAM paths from centralized config (includes user, system, and extra paths)
        scan_dirs = StoragePaths.get_all_nam_paths(include_nonexistent=False)

        # Also add legacy config location
        legacy_dir = Path.home() / ".config" / "map2" / "nam_models"
        if legacy_dir.exists() and legacy_dir not in scan_dirs:
            scan_dirs.append(legacy_dir)

        logger.debug(f"Scanning NAM directories: {[str(d) for d in scan_dirs]}")

        for scan_dir in scan_dirs:
            if not scan_dir.exists():
                continue
            for model_file in scan_dir.glob("**/*.nam"):
                # Avoid duplicates by name
                if model_file.stem in seen_names:
                    continue
                seen_names.add(model_file.stem)

                models.append({
                    "name": model_file.stem,
                    "path": str(model_file),
                    "type": self._detect_model_type(model_file),
                    "size_mb": model_file.stat().st_size / (1024 * 1024)
                })

        logger.info(f"Found {len(models)} NAM models in {len(scan_dirs)} directories")
        return models
    
    def _detect_model_type(self, model_path: Path) -> str:
        """Detect if model is amp, pedal, or preamp."""
        name_lower = model_path.stem.lower()
        
        if any(x in name_lower for x in ['amp', 'amplifier', 'head']):
            return 'amp'
        elif any(x in name_lower for x in ['pedal', 'drive', 'dist', 'fuzz', 'boost']):
            return 'pedal'
        elif 'preamp' in name_lower:
            return 'preamp'
        else:
            return 'unknown'
    
    def load_model(self, model_name: str) -> bool:
        """Load a NAM model by name.
        
        Args:
            model_name: Model name to load
            
        Returns:
            True if loaded successfully
        """
        models = self.scan_models()
        model_info = next((m for m in models if m['name'] == model_name), None)
        
        if not model_info:
            logger.error(f"NAM model not found: {model_name}")
            return False
        
        model = NAMModel(model_info['path'], model_name, device=self.device)
        if model.load():
            self.loaded_models[model_name] = model
            self.active_model = model
            return True
        return False
    
    def unload_model(self, model_name: str) -> bool:
        """Unload a model to free memory.
        
        Args:
            model_name: Model name to unload
            
        Returns:
            True if unloaded
        """
        if model_name in self.loaded_models:
            model = self.loaded_models.pop(model_name)
            
            # Clear active if this was active
            if self.active_model is model:
                self.active_model = None
            
            # Free GPU memory
            if TORCH_AVAILABLE and CUDA_AVAILABLE:
                torch.cuda.empty_cache()
            
            del model
            logger.info(f"Unloaded NAM model: {model_name}")
            return True
        return False
    
    def set_active_model(self, model_name: str) -> bool:
        """Set the active NAM model for processing."""
        if model_name in self.loaded_models:
            self.active_model = self.loaded_models[model_name]
            return True
        else:
            # Try to load it
            return self.load_model(model_name)
    
    def process_audio(self, input_buffer: np.ndarray) -> np.ndarray:
        """Process audio through active NAM model (RT-safe)."""
        if self.active_model is None:
            return input_buffer
        
        return self.active_model.process(input_buffer)
    
    def get_status(self) -> Dict[str, Any]:
        """Get NAM processor status including GPU info.
        
        Returns:
            Status dictionary with device and model information
        """
        gpu_info = None
        if CUDA_AVAILABLE:
            gpu_info = {
                "name": GPU_NAME,
                "memory_gb": GPU_MEMORY,
                "memory_used_mb": torch.cuda.memory_allocated() / (1024**2) if TORCH_AVAILABLE else 0,
                "memory_cached_mb": torch.cuda.memory_reserved() / (1024**2) if TORCH_AVAILABLE else 0,
            }
        elif MPS_AVAILABLE:
            gpu_info = {
                "name": "Apple MPS (Metal)",
                "memory_gb": 0,  # MPS doesn't expose memory info
            }
        
        return {
            "available": NAM_AVAILABLE,
            "torch_available": TORCH_AVAILABLE,
            "cuda_available": CUDA_AVAILABLE,
            "mps_available": MPS_AVAILABLE,
            "device": self.device,
            "gpu_info": gpu_info,
            "model_directory": str(self.model_directory),
            "loaded_models": list(self.loaded_models.keys()),
            "active_model": self.active_model.name if self.active_model else None,
            "active_model_stats": self.active_model.get_stats() if self.active_model else None,
            "total_models_found": len(self.scan_models()),
        }
    
    def get_gpu_info(self) -> Dict[str, Any]:
        """Get detailed GPU information for diagnostics.
        
        Returns:
            GPU information dictionary
        """
        if not TORCH_AVAILABLE:
            return {"available": False, "reason": "PyTorch not installed"}
        
        if CUDA_AVAILABLE:
            props = torch.cuda.get_device_properties(0)
            return {
                "available": True,
                "type": "cuda",
                "name": props.name,
                "compute_capability": f"{props.major}.{props.minor}",
                "total_memory_gb": props.total_memory / (1024**3),
                "multi_processor_count": props.multi_processor_count,
                "cuda_version": torch.version.cuda,
                "cudnn_version": torch.backends.cudnn.version() if torch.backends.cudnn.is_available() else None,
            }
        elif MPS_AVAILABLE:
            return {
                "available": True,
                "type": "mps",
                "name": "Apple Metal Performance Shaders",
            }
        else:
            return {
                "available": False,
                "reason": "No GPU acceleration available",
                "cpu_threads": torch.get_num_threads(),
            }


# Global singleton instance
_nam_processor: Optional[NAMProcessor] = None


def get_nam_processor(model_directory: str = None) -> NAMProcessor:
    """Get or create global NAM processor instance.

    Args:
        model_directory: Directory containing NAM model files (uses StoragePaths default if None)

    Returns:
        Global NAMProcessor instance
    """
    global _nam_processor
    if _nam_processor is None:
        # Use centralized path from StoragePaths if not specified
        _nam_processor = NAMProcessor(model_directory)
    return _nam_processor


def is_nam_available() -> bool:
    """Check if NAM is available in the current environment."""
    return NAM_AVAILABLE
