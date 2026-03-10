from __future__ import annotations

from typing import Any, Tuple

from fastapi import HTTPException

from app.services.juce_engine_service import get_audio_engine


def get_engine_service():
    """Stable facade entrypoint for route modules that need audio-engine access."""
    return get_audio_engine()


def require_engine_service():
    """Return the engine service or raise if the JUCE runtime is unavailable."""
    service = get_engine_service()
    if not service.is_available:
        raise HTTPException(status_code=503, detail="JUCE audio engine not available")
    return service


def require_initialized_engine() -> Tuple[Any, Any]:
    """Return `(service, engine)` once the underlying engine handle exists."""
    service = require_engine_service()
    engine = service.engine
    if engine is None:
        raise HTTPException(status_code=503, detail="Engine not initialized")
    return service, engine
