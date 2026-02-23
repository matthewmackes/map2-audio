"""
AVB/TSN Network Audio Transport Services

This package provides IEEE 1722 AVTP audio streaming with gPTP time synchronization
and TSN traffic shaping for deterministic low-latency audio over Ethernet.

All services gracefully handle missing hardware/dependencies and return
available=False when AVB is not configured or hardware is not present.
"""

import logging
from typing import Any, Dict, Optional

from app.services.avb.readiness import get_avb_readiness as _get_avb_readiness

logger = logging.getLogger(__name__)


def get_avb_readiness(engine: Optional[Any] = None) -> Dict[str, Any]:
    """Return canonical AVB readiness across config/runtime/engine checks."""
    return _get_avb_readiness(engine=engine)


def is_avb_available() -> bool:
    """
    Check if AVB/TSN is available on this system.

    Availability is derived from canonical readiness:
    enabled + configured + operational.
    """
    try:
        readiness = get_avb_readiness()
        return bool(readiness.get("available", False))
    except Exception as e:
        logger.error(f"Error checking AVB availability: {e}")
        return False


__all__ = [
    "is_avb_available",
    "get_avb_readiness",
    "get_srp_admission_service",
]


def get_srp_admission_service():
    """Lazily resolve SRP admission service singleton."""
    from app.services.avb.srp_admission import get_srp_admission_service as _get

    return _get()
