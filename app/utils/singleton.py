"""
Singleton Pattern Base Class

Eliminates duplicate singleton implementations across the codebase.
Thread-safe singleton pattern with lazy initialization.

Usage:
    from app.utils.singleton import Singleton

    class MyService(Singleton):
        def __init__(self):
            super().__init__()
            self.data = []

    # Access singleton instance
    service = MyService.get_instance()
"""

from typing import TypeVar, Type, Dict
import threading

T = TypeVar('T', bound='Singleton')


class Singleton:
    """
    Thread-safe singleton base class.
    
    Subclasses automatically get singleton behavior via get_instance() method.
    Each class gets its own instance, stored in a shared registry.
    """
    
    _instances: Dict[Type, 'Singleton'] = {}
    _lock = threading.RLock()
    
    @classmethod
    def get_instance(cls: Type[T]) -> T:
        """
        Get or create the singleton instance for this class.
        
        Thread-safe using double-checked locking pattern.
        
        Returns:
            Singleton instance of the class
        """
        # Fast path: instance already exists
        if cls in cls._instances:
            return cls._instances[cls]
        
        # Slow path: create new instance (thread-safe)
        with cls._lock:
            # Double-check after acquiring lock
            if cls not in cls._instances:
                cls._instances[cls] = cls()
            return cls._instances[cls]
    
    @classmethod
    def reset_instance(cls: Type[T]) -> None:
        """
        Reset the singleton instance (primarily for testing).
        
        This should only be called in test scenarios.
        """
        with cls._lock:
            if cls in cls._instances:
                del cls._instances[cls]
    
    @classmethod
    def has_instance(cls: Type[T]) -> bool:
        """
        Check if an instance exists without creating one.
        
        Returns:
            True if instance exists, False otherwise
        """
        return cls in cls._instances
