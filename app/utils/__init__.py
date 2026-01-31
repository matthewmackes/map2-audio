"""
Utility Modules for MAP2 Audio Platform

Common utilities for eliminating code duplication:
- singleton: Thread-safe singleton pattern base class
- dependencies: Centralized dependency checking
- logging_utils: Structured logging with consistent formatting

Usage:
    from app.utils.singleton import Singleton
    from app.utils.dependencies import DependencyChecker
    from app.utils.logging_utils import get_logger
"""

from .singleton import Singleton
from .dependencies import DependencyChecker
from .logging_utils import get_logger, StructuredLogger, log_execution_time

__all__ = [
    'Singleton',
    'DependencyChecker',
    'get_logger',
    'StructuredLogger',
    'log_execution_time',
]
