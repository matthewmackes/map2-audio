"""
Shared utilities for the /api/audio route package.
"""

import asyncio
import json
import logging
import os
import subprocess
import sys
import threading
import time
from dataclasses import asdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.services.api_readiness import ensure_audio_route_ready
from app.services.clock_sync import get_clock_sync_profile
from app.services.engine_runtime_facade import get_engine_service as _default_get_engine_service
from app.services.juce_engine_service import get_audio_engine as _default_get_audio_engine
from app.utils.time import utc_now as _default_utc_now

logger = logging.getLogger(__name__)

try:
    from app.services.audio_health_monitor import get_audio_health_monitor
    from app.services.audio_io import BUFFER_PRESETS
    AUDIO_HEALTH_AVAILABLE = True
except ImportError:
    AUDIO_HEALTH_AVAILABLE = False
    BUFFER_PRESETS: Dict[str, int] = {}

    def get_audio_health_monitor():
        raise RuntimeError("Audio health monitoring not available")

try:
    from app.services.plugin_health import get_plugin_health_tracker
    PLUGIN_HEALTH_AVAILABLE = True
except ImportError:
    PLUGIN_HEALTH_AVAILABLE = False

    def get_plugin_health_tracker():
        raise RuntimeError("Plugin health tracking not available")


def _audio_package_override(name: str, local: Any) -> Any:
    package = sys.modules.get("app.routes.audio")
    override = getattr(package, name, None) if package is not None else None
    if override is not None and override is not local:
        return override
    return None


def get_engine_service():
    override = _audio_package_override("get_engine_service", get_engine_service)
    if override is not None:
        return override()
    return _default_get_engine_service()


def get_audio_engine():
    override = _audio_package_override("get_audio_engine", get_audio_engine)
    if override is not None:
        return override()
    try:
        return _default_get_audio_engine()
    except Exception:
        return get_engine_service()


def utc_now():
    override = _audio_package_override("utc_now", utc_now)
    if override is not None:
        return override()
    return _default_utc_now()


def _coerce_int(raw_value: Any, default: int) -> int:
    try:
        return int(raw_value)
    except Exception:
        return default


def _coerce_float(raw_value: Any, default: float) -> float:
    try:
        return float(raw_value)
    except Exception:
        return default


def _normalize_rate_list(raw_value: Any, fallback: List[int]) -> List[int]:
    if not isinstance(raw_value, list):
        return list(fallback)

    normalized: List[int] = []
    seen: set[int] = set()
    for item in raw_value:
        try:
            rate = int(item)
        except Exception:
            continue
        if rate <= 0 or rate in seen:
            continue
        normalized.append(rate)
        seen.add(rate)

    return normalized or list(fallback)


def _append_issue(
    issues: List[Dict[str, Any]],
    *,
    issue_id: str,
    severity: str,
    message: str,
    expected: Any = None,
    actual: Any = None,
) -> None:
    payload: Dict[str, Any] = {
        "id": issue_id,
        "severity": severity,
        "message": message,
    }
    if expected is not None:
        payload["expected"] = expected
    if actual is not None:
        payload["actual"] = actual
    issues.append(payload)


def _elapsed_ms(start_time: float) -> float:
    return (time.perf_counter() - start_time) * 1000.0


__all__ = [name for name in globals() if not name.startswith("__")]
