"""
Centralized polling configuration for Textual TUI services.

All polling intervals standardized to 7 seconds to ensure:
- Non-disruptive audio stream monitoring
- Consistent system-wide refresh rates
- Balanced responsiveness and resource efficiency
"""

from typing import Optional, Callable

# Core polling interval (7 seconds)
POLLING_INTERVAL_SECONDS = 7.0

# Service-specific intervals (all normalized to 7s)
POLLING_INTERVALS = {
    'audio_status': 7.0,
    'audio_health': 7.0,
    'audio_latency': 7.0,
    
    'midi_status': 7.0,
    
    'cluster_status': 7.0,
    'deployment_mode': 7.0,
    'node_metrics': 7.0,
    
    'backend_health': 7.0,
    'usb_devices': 7.0,
    
    'general': 7.0,
}

def get_polling_interval(service: str) -> float:
    """Get polling interval for a specific service.
    
    Args:
        service: Service name (e.g. 'audio_status', 'cluster_status')
        
    Returns:
        Polling interval in seconds (defaults to 7.0)
    """
    return POLLING_INTERVALS.get(service, POLLING_INTERVAL_SECONDS)
