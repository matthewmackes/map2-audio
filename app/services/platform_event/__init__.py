"""Canonical PlatformEvent control-plane foundations."""

from .envelope import PlatformEvent
from .kind import ALL_KINDS, normalize_platform_event_kind
from .policy import PresentationHints, hints_for
from .presenter import Presenter, SurfaceAction
from .runtime import PlatformEventPresenterRuntime, get_platform_event_presenter_runtime
from .severity import FILTERED_SEVERITY, Severity

__all__ = [
    "ALL_KINDS",
    "FILTERED_SEVERITY",
    "PlatformEventPresenterRuntime",
    "PlatformEvent",
    "Presenter",
    "PresentationHints",
    "Severity",
    "SurfaceAction",
    "get_platform_event_presenter_runtime",
    "hints_for",
    "normalize_platform_event_kind",
]
