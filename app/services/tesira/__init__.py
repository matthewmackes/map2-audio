"""
Biamp Tesira Forte AVB integration service package.

Provides TTP (Tesira Text Protocol) control, metering, AVB stream registration,
PTP coordination, preset interlock, and auto-discovery for up to 5 Tesira Forte
AVB units.

Usage:
    from app.services.tesira import get_tesira_fleet, get_tesira_discovery
    fleet = get_tesira_fleet()
    await fleet.start()
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.tesira.tesira_fleet import TesiraFleet
    from app.services.tesira.discovery import TesiraDiscoveryService

_tesira_fleet: "TesiraFleet | None" = None
_tesira_discovery: "TesiraDiscoveryService | None" = None


def get_tesira_fleet() -> "TesiraFleet":
    """Return the singleton TesiraFleet instance, creating it if needed."""
    global _tesira_fleet
    if _tesira_fleet is None:
        from app.services.tesira.tesira_fleet import TesiraFleet
        _tesira_fleet = TesiraFleet()
    return _tesira_fleet


def get_tesira_discovery() -> "TesiraDiscoveryService":
    """Return the singleton TesiraDiscoveryService instance."""
    global _tesira_discovery
    if _tesira_discovery is None:
        from app.services.tesira.discovery import TesiraDiscoveryService
        _tesira_discovery = TesiraDiscoveryService()
    return _tesira_discovery
