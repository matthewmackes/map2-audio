"""
Platform-level checks and validations for MAP2 Audio System.

Performs critical system-level validations that must pass before
the application can run properly.
"""

import subprocess
import logging
from typing import Tuple, Optional

logger = logging.getLogger(__name__)


class PlatformValidationError(Exception):
    """Raised when a platform validation fails."""
    pass


def check_selinux_status() -> Tuple[bool, str]:
    """
    Check SELinux status and ensure it's disabled.
    
    Returns:
        Tuple of (is_valid, status_message)
        - is_valid: True if SELinux is disabled or not installed
        - status_message: Description of current SELinux state
    """
    try:
        # Check if getenforce command exists
        result = subprocess.run(
            ['which', 'getenforce'],
            capture_output=True,
            timeout=5
        )
        
        if result.returncode != 0:
            return True, "SELinux not installed"
        
        # Get current SELinux status
        result = subprocess.run(
            ['getenforce'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        status = result.stdout.strip()
        
        if status == "Disabled":
            return True, "SELinux disabled"
        elif status == "Permissive":
            return False, "SELinux in permissive mode (should be disabled)"
        elif status == "Enforcing":
            return False, "SELinux enforcing (must be disabled)"
        else:
            return False, f"Unknown SELinux status: {status}"
            
    except subprocess.TimeoutExpired:
        logger.warning("SELinux check timed out")
        return False, "SELinux check timeout"
    except FileNotFoundError:
        logger.warning("getenforce command not found")
        return True, "SELinux check command not available"
    except Exception as e:
        logger.error(f"Error checking SELinux: {e}")
        return False, f"SELinux check error: {e}"


def validate_platform() -> Tuple[bool, str]:
    """
    Perform all platform-level validations.
    
    Returns:
        Tuple of (is_valid, error_message)
        - is_valid: True if all validations pass
        - error_message: Description of first validation that failed
    """
    # Check SELinux
    selinux_valid, selinux_msg = check_selinux_status()
    if not selinux_valid:
        logger.error(f"Platform validation failed: {selinux_msg}")
        return False, selinux_msg
    
    logger.info(f"Platform check passed: {selinux_msg}")
    return True, "All platform checks passed"


def get_platform_status() -> dict:
    """
    Get detailed platform status information.
    
    Returns:
        Dictionary with platform status details
    """
    selinux_valid, selinux_msg = check_selinux_status()
    
    return {
        "selinux": {
            "valid": selinux_valid,
            "status": selinux_msg
        }
    }
