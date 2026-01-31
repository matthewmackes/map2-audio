"""
Centralized Dependency Checker

Eliminates duplicate import availability checks across the codebase.
Provides cached, consistent dependency checking.

Usage:
    from app.utils.dependencies import DependencyChecker

    # Check if module is available
    TORCH_AVAILABLE, torch = DependencyChecker.check('torch')
    
    if TORCH_AVAILABLE:
        model = torch.load('model.pth')
"""

import importlib
import logging
from typing import Dict, Tuple, Any, Optional

logger = logging.getLogger(__name__)


class DependencyChecker:
    """
    Centralized dependency availability checker with caching.
    
    Checks if Python modules are available and caches results
    to avoid repeated import attempts.
    """
    
    _cache: Dict[str, Tuple[bool, Optional[Any]]] = {}
    
    @classmethod
    def check(cls, module_name: str, log_missing: bool = False) -> Tuple[bool, Optional[Any]]:
        """
        Check if a module is available.
        
        Args:
            module_name: Name of module to check (e.g., 'torch', 'scipy.signal')
            log_missing: Whether to log if module is missing
            
        Returns:
            Tuple of (is_available, module_object)
            If not available, module_object is None
        """
        if module_name not in cls._cache:
            try:
                mod = importlib.import_module(module_name)
                cls._cache[module_name] = (True, mod)
            except ImportError as e:
                if log_missing:
                    logger.debug(f"Module '{module_name}' not available: {e}")
                cls._cache[module_name] = (False, None)
        
        return cls._cache[module_name]
    
    @classmethod
    def check_attribute(cls, module_name: str, attribute: str) -> Tuple[bool, Optional[Any]]:
        """
        Check if a module has a specific attribute.
        
        Args:
            module_name: Name of module to check
            attribute: Attribute name to check for
            
        Returns:
            Tuple of (is_available, attribute_object)
        """
        is_available, mod = cls.check(module_name)
        
        if not is_available or mod is None:
            return (False, None)
        
        if hasattr(mod, attribute):
            return (True, getattr(mod, attribute))
        else:
            return (False, None)
    
    @classmethod
    def get_version(cls, module_name: str) -> Optional[str]:
        """
        Get version of a module if available.
        
        Args:
            module_name: Name of module
            
        Returns:
            Version string or None if not available
        """
        is_available, mod = cls.check(module_name)
        
        if not is_available or mod is None:
            return None
        
        # Try common version attributes
        for attr in ['__version__', 'VERSION', 'version']:
            if hasattr(mod, attr):
                version = getattr(mod, attr)
                return str(version) if version else None
        
        return None
    
    @classmethod
    def clear_cache(cls) -> None:
        """Clear the dependency cache (primarily for testing)."""
        cls._cache.clear()
    
    @classmethod
    def get_status(cls) -> Dict[str, bool]:
        """
        Get availability status of all checked dependencies.
        
        Returns:
            Dict mapping module names to availability status
        """
        return {module: is_available for module, (is_available, _) in cls._cache.items()}


# Pre-check common dependencies for convenience
def init_common_dependencies():
    """Initialize checks for commonly used dependencies."""
    common_deps = [
        'torch',
        'scipy',
        'numpy',
        'sounddevice',
        'soundfile',
        'fastapi',
        'sqlalchemy',
        'pydantic',
    ]
    
    for dep in common_deps:
        DependencyChecker.check(dep, log_missing=False)


# Initialize on module import
init_common_dependencies()
