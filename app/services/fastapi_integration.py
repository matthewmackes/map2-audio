"""
FastAPI Integration for Circuit Breaker

Middleware and utilities for integrating circuit breaker into FastAPI routes.
"""

import logging
from typing import Callable, Any, Optional
from functools import wraps

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from app.services.circuit_breaker import (
    CircuitBreakerException, get_breaker_manager
)
from app.services.resilience_logging import get_resilience_logger

logger = logging.getLogger(__name__)
resilience_logger = get_resilience_logger("fastapi")


def with_circuit_breaker(service_name: str, 
                        failure_threshold: int = 5,
                        success_threshold: int = 2,
                        timeout_seconds: int = 30):
    """
    Decorator for FastAPI route handlers to apply circuit breaker.
    
    When circuit is OPEN, returns 503 Service Unavailable.
    
    Args:
        service_name: Name of the service being protected
        failure_threshold: Failures before opening circuit
        success_threshold: Successes before closing from half-open
        timeout_seconds: Seconds before attempting recovery
    
    Example:
        @router.get("/api/chains")
        @with_circuit_breaker("chain-service", failure_threshold=5)
        async def get_chains():
            # Make external call
            response = await external_api.get_chains()
            return response
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            manager = get_breaker_manager()
            breaker = await manager.get_breaker(
                service_name,
                failure_threshold=failure_threshold,
                success_threshold=success_threshold,
                timeout_seconds=timeout_seconds
            )
            
            try:
                # Call the route handler with circuit breaker
                async def call_handler():
                    return await func(*args, **kwargs)
                
                result = await breaker.call(call_handler)
                return result
                
            except CircuitBreakerException as e:
                resilience_logger.circuit_opened(service_name, str(e))
                raise HTTPException(
                    status_code=503,
                    detail=f"Service temporarily unavailable: {str(e)}"
                )
            except Exception as e:
                # Other exceptions propagate normally
                logger.error(f"Error in {service_name}: {str(e)}")
                raise
        
        return wrapper
    
    return decorator


async def get_circuit_breaker_status(service_name: Optional[str] = None) -> dict:
    """
    Get circuit breaker status for monitoring.
    
    Args:
        service_name: If provided, get status for specific service
                     If None, get status for all services
    
    Returns:
        Status dictionary
    """
    manager = get_breaker_manager()
    
    if service_name:
        # Single service
        states = await manager.get_all_states()
        metrics = await manager.get_all_metrics()
        
        if service_name not in states:
            return {"error": f"Service {service_name} not found"}
        
        return {
            "service": service_name,
            "state": states[service_name],
            "metrics": {
                "successful_calls": metrics[service_name].successful_calls,
                "failed_calls": metrics[service_name].failed_calls,
                "rejected_calls": metrics[service_name].rejected_calls,
                "state_changes": metrics[service_name].state_changes
            }
        }
    else:
        # All services
        states = await manager.get_all_states()
        metrics = await manager.get_all_metrics()
        
        return {
            "services": {
                svc: {
                    "state": states[svc],
                    "metrics": {
                        "successful_calls": metrics[svc].successful_calls,
                        "failed_calls": metrics[svc].failed_calls,
                        "rejected_calls": metrics[svc].rejected_calls,
                        "state_changes": metrics[svc].state_changes
                    }
                }
                for svc in states
            }
        }


async def reset_circuit_breaker(service_name: str) -> dict:
    """
    Manually reset a circuit breaker (admin endpoint).
    
    Args:
        service_name: Service to reset
    
    Returns:
        Operation status
    """
    manager = get_breaker_manager()
    success = await manager.reset_breaker(service_name)
    
    if success:
        resilience_logger.circuit_closed(service_name)
        return {"status": "success", "message": f"Circuit breaker reset for {service_name}"}
    else:
        return {"status": "error", "message": f"Service {service_name} not found"}


# Example integration into existing routes

"""
# In app/routes/health.py or new monitoring route:

from fastapi import APIRouter, Query
from app.services.fastapi_integration import (
    get_circuit_breaker_status,
    reset_circuit_breaker
)

router = APIRouter(prefix="/api", tags=["monitoring"])

@router.get("/circuit-breaker/status")
async def get_cb_status(service: Optional[str] = Query(None)):
    '''Get circuit breaker status.'''
    return await get_circuit_breaker_status(service)

@router.post("/circuit-breaker/reset/{service_name}")
async def reset_cb(service_name: str):
    '''Manually reset circuit breaker (admin only).'''
    return await reset_circuit_breaker(service_name)
"""
