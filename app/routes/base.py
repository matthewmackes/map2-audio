"""
Base Route Utilities

Provides common decorators and utilities for FastAPI route handlers.
Eliminates duplicate error handling across 43+ route files.

Usage:
    from app.routes.base import api_route, BaseRouter
    from fastapi import APIRouter

    router = APIRouter(prefix="/api/example", tags=["example"])

    @router.get("/data")
    @api_route()
    async def get_data():
        # Just write business logic
        # Error handling is automatic
        return {"data": "value"}
"""

from functools import wraps
from fastapi import HTTPException, status
from typing import Callable, Any, Optional, Dict
import logging
import asyncio

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
        
    Usage:
        @router.post("/endpoint")
        @api_route(log_errors=True)
        async def handler():
            return {"success": True}
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            func_name = f"{func.__module__}.{func.__name__}"
            
            try:
                result = await func(*args, **kwargs)
                
                if log_success:
                    logger.info(f"✅ {func_name} completed successfully")
                
                return result
                
            except HTTPException:
                # Re-raise FastAPI HTTPExceptions without modification
                raise
                
            except Exception as e:
                if log_errors:
                    logger.error(
                        f"❌ {func_name} failed: {str(e)}",
                        exc_info=True
                    )
                
                if catch_exceptions:
                    # Convert to HTTPException
                    raise HTTPException(
                        status_code=default_status,
                        detail=str(e)
                    )
                else:
                    # Re-raise original exception
                    raise
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            func_name = f"{func.__module__}.{func.__name__}"
            
            try:
                result = func(*args, **kwargs)
                
                if log_success:
                    logger.info(f"✅ {func_name} completed successfully")
                
                return result
                
            except HTTPException:
                raise
                
            except Exception as e:
                if log_errors:
                    logger.error(
                        f"❌ {func_name} failed: {str(e)}",
                        exc_info=True
                    )
                
                if catch_exceptions:
                    raise HTTPException(
                        status_code=default_status,
                        detail=str(e)
                    )
                else:
                    raise
        
        # Return appropriate wrapper based on function type
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


def require_service(service_name: str, error_message: Optional[str] = None):
    """
    Decorator to check if a required service is available.
    
    Args:
        service_name: Name of the service to check
        error_message: Custom error message if service unavailable
        
    Usage:
        @router.get("/audio/status")
        @require_service("juce_engine", "Audio engine not available")
        async def get_status():
            return {"status": "ok"}
    """
    def decorator(func: Callable) -> Callable:
        def _service_available(name: str) -> bool:
            """Check service availability using orchestrator, then legacy manager fallback."""
            # Preferred: service orchestrator
            try:
                from app.services.service_orchestrator import get_orchestrator
                orchestrator = get_orchestrator()
                service = orchestrator.get_service_status(name)
                if service:
                    state = (service.get("state") or "").lower()
                    return state in {"running", "degraded"}
            except Exception as e:
                logger.debug(f"Orchestrator lookup failed for '{name}': {e}")

            # Fallback: legacy service manager aggregated status
            try:
                from app.services.service_manager import get_service_manager
                svc_mgr = get_service_manager()
                status = svc_mgr.get_service_status()
                if name in status and isinstance(status[name], bool):
                    return bool(status[name])
            except Exception as e:
                logger.debug(f"ServiceManager lookup failed for '{name}': {e}")

            # Unknown service state should be treated as unavailable for strictness.
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
        
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


class StandardResponses:
    """Standard API response formats."""
    
    @staticmethod
    def success(data: Any = None, message: str = "Operation successful") -> Dict:
        """Standard success response."""
        response = {
            "success": True,
            "message": message
        }
        if data is not None:
            response["data"] = data
        return response
    
    @staticmethod
    def error(message: str, code: Optional[str] = None) -> Dict:
        """Standard error response."""
        response = {
            "success": False,
            "error": message
        }
        if code:
            response["code"] = code
        return response
    
    @staticmethod
    def not_found(resource: str, identifier: Any) -> Dict:
        """Standard not found response."""
        return {
            "success": False,
            "error": f"{resource} not found",
            "identifier": identifier
        }
