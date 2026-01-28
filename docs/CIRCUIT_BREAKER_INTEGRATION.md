"""
Example Circuit Breaker Integration for MAP2 Routes

This file demonstrates how to integrate circuit breakers into existing routes.
Use this as a template for updating other route files.

Phase 1 Implementation: Start with critical routes that call external services.
"""

# BEFORE: app/routes/chains.py (current implementation)
"""
@router.get("/api/chains")
async def get_chains():
    try:
        chains = await chain_service.get_all_chains()
        return {"chains": chains}
    except Exception as e:
        logger.error(f"Failed to get chains: {e}")
        raise HTTPException(status_code=500, detail=str(e))
"""

# AFTER: With circuit breaker protection

from fastapi import APIRouter, HTTPException
import logging
from typing import Optional

from app.services.circuit_breaker import (
    CircuitBreakerException, get_breaker_manager, CircuitState
)
from app.services.resilience_logging import get_resilience_logger

logger = logging.getLogger(__name__)
resilience_logger = get_resilience_logger("chains_routes")

router = APIRouter(prefix="/api", tags=["chains"])


# ============================================================================
# PATTERN 1: Simple route with circuit breaker
# ============================================================================

@router.get("/chains")
async def get_chains():
    """
    Get all chains with circuit breaker protection.
    
    Falls back to 503 when chain service is unavailable.
    """
    manager = get_breaker_manager()
    breaker = await manager.get_breaker(
        "chain_service",
        failure_threshold=5,
        success_threshold=2,
        timeout_seconds=30
    )
    
    try:
        # Call the service through circuit breaker
        async def fetch_chains():
            from app.services.chain_service import get_all_chains
            chains = await get_all_chains()
            return {"chains": chains}
        
        result = await breaker.call(fetch_chains)
        return result
        
    except CircuitBreakerException as e:
        resilience_logger.circuit_opened("chain_service", str(e))
        raise HTTPException(
            status_code=503,
            detail="Chain service temporarily unavailable. Retrying..."
        )


# ============================================================================
# PATTERN 2: Using decorator (cleaner)
# ============================================================================

from app.services.fastapi_integration import with_circuit_breaker

@router.post("/chains")
@with_circuit_breaker("chain_service", failure_threshold=5)
async def create_chain(name: str, description: str = ""):
    """Create a new chain with circuit breaker protection."""
    from app.services.chain_service import create_chain as create_chain_impl
    
    chain = await create_chain_impl(name, description)
    resilience_logger.service_healthy("chain_service")
    return {"chain": chain, "status": "created"}


# ============================================================================
# PATTERN 3: Route with fallback behavior
# ============================================================================

@router.get("/chains/{chain_id}")
async def get_chain(chain_id: str):
    """
    Get specific chain with fallback to cached data.
    
    If circuit opens, return cached chain data instead of error.
    """
    manager = get_breaker_manager()
    breaker = await manager.get_breaker("chain_service")
    
    try:
        async def fetch_chain():
            from app.services.chain_service import get_chain_by_id
            return await get_chain_by_id(chain_id)
        
        chain = await breaker.call(fetch_chain)
        return {"chain": chain}
        
    except CircuitBreakerException:
        # Service is down, try cache
        resilience_logger.fallback_activated("get_chain", "Circuit open")
        
        # Try to return cached data
        from app.services.chain_cache import get_cached_chain
        cached = await get_cached_chain(chain_id)
        
        if cached:
            return {
                "chain": cached,
                "status": "degraded",
                "note": "Returned from cache - service unavailable"
            }
        else:
            raise HTTPException(
                status_code=503,
                detail="Chain service unavailable and no cached data"
            )


# ============================================================================
# PATTERN 4: Route with graceful degradation
# ============================================================================

@router.get("/chains/{chain_id}/status")
async def get_chain_status(chain_id: str):
    """
    Get chain status with graceful degradation.
    
    Returns basic info even if detailed status unavailable.
    """
    manager = get_breaker_manager()
    breaker = await manager.get_breaker("chain_status_service")
    
    try:
        async def fetch_full_status():
            from app.services.chain_service import get_chain_full_status
            return await get_chain_full_status(chain_id)
        
        return await breaker.call(fetch_full_status)
        
    except CircuitBreakerException:
        resilience_logger.service_degraded("chain_status_service", "Circuit open")
        
        # Return basic info without detailed metrics
        from app.services.chain_service import get_chain_basic_info
        basic = await get_chain_basic_info(chain_id)
        
        return {
            "status": basic["status"],
            "degraded": True,
            "metrics_unavailable": True,
            "note": "Some status information unavailable"
        }


# ============================================================================
# PATTERN 5: Monitoring endpoint - shows circuit breaker status
# ============================================================================

@router.get("/health/circuit-breakers")
async def get_circuit_breaker_health():
    """
    Get status of all circuit breakers.
    
    Useful for monitoring and debugging.
    """
    from app.services.fastapi_integration import get_circuit_breaker_status
    
    return await get_circuit_breaker_status()


@router.get("/health/circuit-breakers/{service_name}")
async def get_service_circuit_breaker(service_name: str):
    """Get status of specific service's circuit breaker."""
    from app.services.fastapi_integration import get_circuit_breaker_status
    
    return await get_circuit_breaker_status(service_name)


@router.post("/health/circuit-breakers/{service_name}/reset")
async def reset_service_circuit_breaker(service_name: str):
    """
    Manually reset a circuit breaker (admin endpoint).
    
    Use with caution - only when you know service has recovered.
    """
    from app.services.fastapi_integration import reset_circuit_breaker
    
    return await reset_circuit_breaker(service_name)


# ============================================================================
# IMPLEMENTATION CHECKLIST FOR ROUTE UPDATES
# ============================================================================

"""
When updating a route, follow this checklist:

[ ] 1. Identify all external service calls in the route
      - Calls to database
      - HTTP calls to other services
      - File I/O operations
      - Any operation that can fail

[ ] 2. Determine which calls should have circuit breaker
      - Priority 1: API calls to PiPedal service
      - Priority 2: Database queries for critical data
      - Priority 3: Plugin loader calls
      - Priority 4: Less critical operations

[ ] 3. Choose integration pattern (1-4 above)
      - Simple routes: Use decorator @with_circuit_breaker
      - Complex logic: Use manager pattern in try/except
      - Need fallback: Use pattern 3 or 4

[ ] 4. Create circuit breaker with appropriate thresholds
      - Start with defaults: failure_threshold=5, timeout=30s
      - Adjust based on expected traffic and reliability

[ ] 5. Add resilience logging
      - Log circuit state changes
      - Log fallback activations
      - Log errors for monitoring

[ ] 6. Handle CircuitBreakerException
      - Return 503 Service Unavailable
      - Provide fallback data if available
      - Log the failure

[ ] 7. Test the integration
      - Test normal operation
      - Simulate service failure (inject errors)
      - Verify circuit opens
      - Verify circuit recovers
      - Verify fallback works

[ ] 8. Monitor in production
      - Watch circuit state changes
      - Watch error rates
      - Adjust thresholds if needed
"""

# ============================================================================
# ROUTES TO UPDATE (Priority Order for Phase 1)
# ============================================================================

"""
Critical (Top Priority):
  1. app/routes/plugins.py - list_plugins, add_plugin, remove_plugin
  2. app/routes/audio.py - Any PiPedal engine calls
  3. app/routes/chains.py - All chain operations
  4. app/routes/midi.py - MIDI mapping operations

High Priority:
  5. app/routes/presets.py - Preset load/save
  6. app/routes/sessions.py - Session operations
  7. app/routes/parameters.py - Parameter updates

Medium Priority:
  8. app/routes/impulse_response.py - IR operations
  9. app/routes/performance.py - Metrics collection
  10. app/routes/system.py - System calls

Can wait (Phase 2+):
  - app/routes/health.py - Already has basic health
  - app/routes/metrics.py - Metrics are non-critical
  - app/routes/lcd.py - LCD is auxiliary
"""
