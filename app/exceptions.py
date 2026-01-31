"""
MAP2 Audio Platform Exception Hierarchy

Provides structured, domain-specific exceptions for better error handling,
debugging, and API responses.
"""

from typing import Optional, Dict, Any


class MAP2Exception(Exception):
    """Base exception for all MAP2 Audio Platform errors."""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for API responses."""
        return {
            "error": self.__class__.__name__,
            "message": self.message,
            "details": self.details,
        }


# ==================== Audio Engine Exceptions ====================

class AudioEngineException(MAP2Exception):
    """Base exception for audio engine errors."""
    pass


class AudioEngineNotInitialized(AudioEngineException):
    """Audio engine is not initialized."""
    def __init__(self):
        super().__init__("Audio engine is not initialized")


class AudioEngineAlreadyRunning(AudioEngineException):
    """Audio engine is already running."""
    def __init__(self):
        super().__init__("Audio engine is already running")


class AudioDeviceException(AudioEngineException):
    """Audio device configuration or access error."""
    pass


class AudioBufferException(AudioEngineException):
    """Audio buffer underrun, overrun, or allocation error."""
    pass


class AudioLatencyException(AudioEngineException):
    """Audio latency constraint violation."""
    pass


# ==================== Plugin Exceptions ====================

class PluginException(MAP2Exception):
    """Base exception for plugin-related errors."""
    pass


class PluginNotFoundException(PluginException):
    """Plugin URI not found in available plugins."""
    def __init__(self, uri: str):
        super().__init__(f"Plugin not found: {uri}", {"uri": uri})


class PluginLoadException(PluginException):
    """Plugin failed to load."""
    def __init__(self, uri: str, reason: str):
        super().__init__(f"Failed to load plugin {uri}: {reason}", 
                        {"uri": uri, "reason": reason})


class PluginInstantiationException(PluginException):
    """Plugin failed to instantiate."""
    pass


class PluginValidationException(PluginException):
    """Plugin failed validation checks."""
    pass


class PluginTimeoutException(PluginException):
    """Plugin processing exceeded time limit."""
    def __init__(self, uri: str, timeout_ms: float):
        super().__init__(f"Plugin {uri} timed out after {timeout_ms}ms",
                        {"uri": uri, "timeout_ms": timeout_ms})


class PluginResourceException(PluginException):
    """Plugin exceeded resource limits (CPU, memory)."""
    def __init__(self, uri: str, resource: str, limit: Any):
        super().__init__(f"Plugin {uri} exceeded {resource} limit: {limit}",
                        {"uri": uri, "resource": resource, "limit": limit})


# ==================== Chain Exceptions ====================

class ChainException(MAP2Exception):
    """Base exception for plugin chain errors."""
    pass


class ChainNotFoundException(ChainException):
    """Chain ID not found."""
    def __init__(self, chain_id: int):
        super().__init__(f"Chain not found: {chain_id}", {"chain_id": chain_id})


class ChainValidationException(ChainException):
    """Chain configuration is invalid."""
    pass


class ChainCycleException(ChainException):
    """Chain contains a cycle (circular dependency)."""
    pass


# ==================== Database Exceptions ====================

class DatabaseException(MAP2Exception):
    """Base exception for database errors."""
    pass


class DatabaseConnectionException(DatabaseException):
    """Database connection failed."""
    pass


class DatabaseTransactionException(DatabaseException):
    """Database transaction failed."""
    pass


class DatabaseConstraintException(DatabaseException):
    """Database constraint violation."""
    pass


# ==================== MIDI Exceptions ====================

class MIDIException(MAP2Exception):
    """Base exception for MIDI errors."""
    pass


class MIDIDeviceNotFoundException(MIDIException):
    """MIDI device not found."""
    def __init__(self, device_id: Any):
        super().__init__(f"MIDI device not found: {device_id}", 
                        {"device_id": device_id})


class MIDIDeviceException(MIDIException):
    """MIDI device access or configuration error."""
    pass


# ==================== Configuration Exceptions ====================

class ConfigurationException(MAP2Exception):
    """Base exception for configuration errors."""
    pass


class ConfigurationValidationException(ConfigurationException):
    """Configuration failed validation."""
    pass


class ConfigurationNotFoundException(ConfigurationException):
    """Configuration key not found."""
    def __init__(self, key: str):
        super().__init__(f"Configuration not found: {key}", {"key": key})


# ==================== Resource Exceptions ====================

class ResourceException(MAP2Exception):
    """Base exception for resource errors."""
    pass


class ResourceNotFoundException(ResourceException):
    """Resource not found (file, device, etc)."""
    def __init__(self, resource_type: str, identifier: str):
        super().__init__(f"{resource_type} not found: {identifier}",
                        {"resource_type": resource_type, "identifier": identifier})


class ResourceExhaustedException(ResourceException):
    """System resources exhausted."""
    def __init__(self, resource: str):
        super().__init__(f"Resource exhausted: {resource}", {"resource": resource})


class ResourceLockException(ResourceException):
    """Failed to acquire resource lock."""
    pass


# ==================== Rate Limiting Exceptions ====================

class RateLimitException(MAP2Exception):
    """Rate limit exceeded."""
    def __init__(self, limit: int, window: str, retry_after: Optional[float] = None):
        super().__init__(f"Rate limit exceeded: {limit} requests per {window}",
                        {"limit": limit, "window": window, "retry_after": retry_after})


# ==================== Validation Exceptions ====================

class ValidationException(MAP2Exception):
    """Base exception for validation errors."""
    pass


class ParameterValidationException(ValidationException):
    """Parameter validation failed."""
    def __init__(self, parameter: str, reason: str):
        super().__init__(f"Invalid parameter '{parameter}': {reason}",
                        {"parameter": parameter, "reason": reason})


# ==================== Service Exceptions ====================

class ServiceException(MAP2Exception):
    """Base exception for service errors."""
    pass


class ServiceNotAvailableException(ServiceException):
    """Service is not available."""
    def __init__(self, service: str):
        super().__init__(f"Service not available: {service}", {"service": service})


class ServiceTimeoutException(ServiceException):
    """Service operation timed out."""
    pass
