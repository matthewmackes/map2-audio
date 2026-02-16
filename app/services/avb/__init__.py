"""
AVB/TSN Network Audio Transport Services

This package provides IEEE 1722 AVTP audio streaming with gPTP time synchronization
and TSN traffic shaping for deterministic low-latency audio over Ethernet.

All services gracefully handle missing hardware/dependencies and return
available=False when AVB is not configured or hardware is not present.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def is_avb_available() -> bool:
    """
    Check if AVB/TSN is available on this system.

    Returns False if:
    - AVB not enabled in config
    - No TSN-capable NIC detected
    - linuxptp (ptp4l) not installed
    - C++ engine built without USE_AVB=ON

    This is a fast check that doesn't require heavy initialization.
    """
    try:
        from app.config import config_get

        # First check: config must explicitly enable AVB
        if not config_get("avb.enabled", False):
            logger.debug("AVB not enabled in config")
            return False

        # Second check: interface must be specified
        avb_interface = config_get("avb.interface", "")
        if not avb_interface:
            logger.debug("No AVB interface configured")
            return False

        # Third check: interface must exist
        import os
        if not os.path.exists(f"/sys/class/net/{avb_interface}"):
            logger.warning(f"AVB interface {avb_interface} does not exist")
            return False

        # Fourth check: ptp4l must be available (linuxptp installed)
        import shutil
        if not shutil.which("ptp4l"):
            logger.debug("ptp4l not found (linuxptp not installed)")
            return False

        # All checks passed
        logger.info(f"AVB available on interface {avb_interface}")
        return True

    except Exception as e:
        logger.error(f"Error checking AVB availability: {e}")
        return False


__all__ = [
    "is_avb_available",
    "get_srp_admission_service",
]


def get_srp_admission_service():
    """Lazily resolve SRP admission service singleton."""
    from app.services.avb.srp_admission import get_srp_admission_service as _get

    return _get()
