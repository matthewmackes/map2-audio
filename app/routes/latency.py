"""
Latency Management API Routes
Endpoints for latency measurement, compensation, and monitoring.
"""

import logging
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.latency_compensation import get_latency_analyzer, get_latency_compensator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/latency", tags=["latency"])


class LatencyMeasureRequest(BaseModel):
    """Request to measure plugin latency."""
    plugin_uri: str
    method: str = "impulse"  # "impulse" or "reported"


class LatencyCompensationRequest(BaseModel):
    """Request to enable/disable compensation."""
    enabled: bool


class ChainLatencyRequest(BaseModel):
    """Request to calculate chain compensation."""
    chain_id: int
    plugin_latencies: Dict[str, int]  # plugin_uri -> latency_samples


@router.get("/status")
async def get_latency_status() -> Dict:
    """Get latency compensation status.
    
    Returns:
        {
            "enabled": bool,
            "max_latency_samples": int,
            "max_latency_ms": float,
            "chain_latency_samples": int,
            "chain_latency_ms": float,
            "active_delay_lines": int,
            "compensated_plugins": [...]
        }
    """
    try:
        compensator = get_latency_compensator()
        return compensator.get_status()
    except Exception as e:
        logger.error(f"Error getting latency status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compensate")
async def set_compensation(request: LatencyCompensationRequest) -> Dict:
    """Enable or disable latency compensation.
    
    Args:
        request: Compensation enable/disable request
        
    Returns:
        Status message
    """
    try:
        compensator = get_latency_compensator()
        compensator.enable_compensation(request.enabled)
        
        return {
            "status": "ok",
            "enabled": request.enabled,
            "message": f"Latency compensation {'enabled' if request.enabled else 'disabled'}"
        }
    except Exception as e:
        logger.error(f"Error setting compensation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/measure")
async def measure_plugin_latency(request: LatencyMeasureRequest) -> Dict:
    """Measure plugin latency.
    
    Args:
        request: Measurement request with plugin_uri and method
        
    Returns:
        {
            "plugin_uri": str,
            "latency_samples": int,
            "latency_ms": float,
            "method": str
        }
    """
    try:
        analyzer = get_latency_analyzer()

        if request.method == "impulse":
            # Try to get plugin process function from JUCE engine
            from app.services.juce_engine_service import get_audio_engine

            latency_samples = 0
            engine = get_audio_engine()

            # Try JUCE audio engine
            if engine.is_available and engine.is_running:
                # Get plugin instance from JUCE engine
                plugin_instance = None  # JUCE engine uses instance IDs, not direct instances
                if plugin_instance:
                    def process_func(audio):
                        return plugin_instance.process(audio)
                    latency_samples = analyzer.measure_plugin_latency_impulse(
                        request.plugin_uri, process_func
                    )
                else:
                    logger.warning(f"Plugin instance not found for {request.plugin_uri}")
            else:
                logger.warning(f"Audio engine not available for impulse measurement")

        elif request.method == "reported":
            # Read latency from LV2 plugin data or database
            from app.database import get_session, Plugin

            latency_samples = 0
            session = get_session()
            try:
                plugin = session.query(Plugin).filter_by(uri=request.plugin_uri).first()
                if plugin and plugin.reported_latency_samples:
                    latency_samples = plugin.reported_latency_samples
                    analyzer.measured_latencies[request.plugin_uri] = latency_samples
                elif plugin and plugin.has_latency_port:
                    # Try to read from running instance
                    from app.services.juce_engine_service import get_audio_engine
                    engine = get_audio_engine()
                    if engine.is_available and engine.is_running:
                        # JUCE engine doesn't expose direct instances, use reported value
                        if plugin.reported_latency_samples:
                            latency_samples = plugin.reported_latency_samples
                            analyzer.measured_latencies[request.plugin_uri] = latency_samples
            finally:
                session.close()

            if latency_samples == 0:
                logger.warning(f"No latency information available for {request.plugin_uri}")
        else:
            raise HTTPException(status_code=400, detail=f"Unknown method: {request.method}")
        
        latency_ms = analyzer.samples_to_ms(latency_samples)
        
        return {
            "plugin_uri": request.plugin_uri,
            "latency_samples": latency_samples,
            "latency_ms": latency_ms,
            "method": request.method
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error measuring latency: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plugins/{plugin_uri:path}")
async def get_plugin_latency(plugin_uri: str) -> Dict:
    """Get measured latency for specific plugin.
    
    Args:
        plugin_uri: Plugin URI (URL-encoded)
        
    Returns:
        {
            "plugin_uri": str,
            "latency_samples": int,
            "latency_ms": float,
            "has_measurement": bool
        }
    """
    try:
        analyzer = get_latency_analyzer()
        latency_samples = analyzer.get_latency(plugin_uri)
        latency_ms = analyzer.samples_to_ms(latency_samples)
        
        return {
            "plugin_uri": plugin_uri,
            "latency_samples": latency_samples,
            "latency_ms": latency_ms,
            "has_measurement": latency_samples > 0
        }
    except Exception as e:
        logger.error(f"Error getting plugin latency: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chains/{chain_id}/calculate")
async def calculate_chain_compensation(chain_id: int, request: ChainLatencyRequest) -> Dict:
    """Calculate latency compensation for entire chain.
    
    Args:
        chain_id: Chain ID
        request: Plugin latencies dict
        
    Returns:
        {
            "chain_id": int,
            "max_latency_samples": int,
            "max_latency_ms": float,
            "compensations": {plugin_uri: compensation_samples, ...}
        }
    """
    try:
        compensator = get_latency_compensator()
        analyzer = get_latency_analyzer()
        
        # Calculate compensations
        compensations = compensator.calculate_chain_compensation(request.plugin_latencies)
        
        max_latency = max(request.plugin_latencies.values()) if request.plugin_latencies else 0
        max_latency_ms = analyzer.samples_to_ms(max_latency)
        
        return {
            "chain_id": chain_id,
            "max_latency_samples": max_latency,
            "max_latency_ms": max_latency_ms,
            "compensations": compensations
        }
    except Exception as e:
        logger.error(f"Error calculating chain compensation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset")
async def reset_delay_lines() -> Dict:
    """Reset all delay line buffers (clear audio).
    
    Returns:
        Status message
    """
    try:
        compensator = get_latency_compensator()
        compensator.reset_delay_lines()
        
        return {
            "status": "ok",
            "message": "Delay lines reset"
        }
    except Exception as e:
        logger.error(f"Error resetting delay lines: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chains/{chain_id}")
async def get_chain_latency(chain_id: int) -> Dict:
    """Get total latency for a chain.
    
    Args:
        chain_id: Chain ID
        
    Returns:
        {
            "chain_id": int,
            "total_latency_samples": int,
            "total_latency_ms": float,
            "compensation_enabled": bool
        }
    """
    try:
        compensator = get_latency_compensator()
        analyzer = get_latency_analyzer()
        
        total_latency = compensator.get_total_chain_latency()
        total_latency_ms = analyzer.samples_to_ms(total_latency)
        
        return {
            "chain_id": chain_id,
            "total_latency_samples": total_latency,
            "total_latency_ms": total_latency_ms,
            "compensation_enabled": compensator.compensation_enabled
        }
    except Exception as e:
        logger.error(f"Error getting chain latency: {e}")
        raise HTTPException(status_code=500, detail=str(e))
