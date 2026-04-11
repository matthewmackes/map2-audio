"""
Route helper utilities shared by FastAPI route modules.

Provides common decorators and response helpers without living under
`app/routes`, which keeps the route-registration policy unambiguous.
"""

from __future__ import annotations

import inspect
import logging
from functools import wraps
from typing import Any, Callable, Optional

from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


def api_route(
    log_errors: bool = True,
    log_success: bool = False,
    default_status: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
    catch_exceptions: bool = True
):
    """
    Decorator for API route handlers with automatic error handling.

    Args:
        log_errors: Whether to log errors automatically
        log_success: Whether to log successful executions
        default_status: Default HTTP status code for uncaught exceptions
        catch_exceptions: Whether to catch and convert exceptions to HTTPException
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            func_name = f"{func.__module__}.{func.__name__}"

            try:
                result = await func(*args, **kwargs)

                if log_success:
                    logger.info("%s completed successfully", func_name)

                return result

            except HTTPException:
                raise

            except Exception as e:
                if log_errors:
                    logger.error(
                        "%s failed: %s",
                        func_name,
                        str(e),
                        exc_info=True,
                    )

                if catch_exceptions:
                    raise HTTPException(
                        status_code=default_status,
                        detail=str(e)
                    )
                raise

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            func_name = f"{func.__module__}.{func.__name__}"

            try:
                result = func(*args, **kwargs)

                if log_success:
                    logger.info("%s completed successfully", func_name)

                return result

            except HTTPException:
                raise

            except Exception as e:
                if log_errors:
                    logger.error(
                        "%s failed: %s",
                        func_name,
                        str(e),
                        exc_info=True,
                    )

                if catch_exceptions:
                    raise HTTPException(
                        status_code=default_status,
                        detail=str(e)
                    )
                raise

        if inspect.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


def require_service(service_name: str, error_message: Optional[str] = None):
    """
    Decorator to check if a required service is available.

    Args:
        service_name: Name of the service to check
        error_message: Custom error message if service unavailable
    """
    def decorator(func: Callable) -> Callable:
        def _service_available(name: str) -> bool:
            """Check service availability using the orchestrator and JUCE runtime helpers."""
            try:
                from app.services.service_orchestrator import get_orchestrator
                orchestrator = get_orchestrator()
                service = orchestrator.get_service_status(name)
                if service:
                    state = (service.get("state") or "").lower()
                    return state in {"running", "degraded"}
            except Exception as e:
                logger.debug(f"Orchestrator lookup failed for '{name}': {e}")

            try:
                if name in {"juce_engine", "audio", "audio_io"}:
                    from app.services.juce_engine_service import get_audio_engine

                    engine = get_audio_engine()
                    return bool(engine and engine.is_available)
            except Exception as e:
                logger.debug(f"JUCE runtime lookup failed for '{name}': {e}")

            return False

        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            error_msg = error_message or f"Required service '{service_name}' not available"
            if not _service_available(service_name):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=error_msg
                )

            return await func(*args, **kwargs)

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            error_msg = error_message or f"Required service '{service_name}' not available"

            if not _service_available(service_name):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=error_msg
                )

            return func(*args, **kwargs)

        if inspect.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


class StandardResponses:
    """Standard API response formats."""

    @staticmethod
    def success(data: Any = None, message: str = "Operation successful") -> dict[str, Any]:
        response = {
            "success": True,
            "message": message,
        }
        if data is not None:
            response["data"] = data
        return response

    @staticmethod
    def error(message: str, code: Optional[str] = None) -> dict[str, Any]:
        response = {
            "success": False,
            "error": message,
        }
        if code:
            response["code"] = code
        return response

    @staticmethod
    def not_found(resource: str, identifier: Any) -> dict[str, Any]:
        return {
            "success": False,
            "error": f"{resource} not found",
            "identifier": identifier,
        }
