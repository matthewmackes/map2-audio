"""
Connection Pool FastAPI Integration for MAP2 Audio Platform

Provides decorators and utilities for using connection pooling in FastAPI routes
and service-to-service communication.
"""

import functools
import logging
import time
from typing import Callable, Optional, Any
import httpx

from app.services.connection_pool import get_pool_manager

logger = logging.getLogger(__name__)


def with_connection_pool(host: str, 
                        min_size: Optional[int] = None,
                        max_size: Optional[int] = None):
    """
    Decorator for using connection pooling with an HTTP endpoint.
    
    Usage:
        @with_connection_pool("https://api.example.com")
        async def get_data():
            response = await pool_manager.get_pool(host).execute_request(...)
            return response.json()
    
    Args:
        host: Target host URL
        min_size: Minimum pool size
        max_size: Maximum pool size
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            pool_manager = get_pool_manager()
            pool = pool_manager.get_pool(host, min_size, max_size)
            
            # Store pool in request context or function scope
            kwargs['_pool'] = pool
            
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                logger.error(f"Error in {func.__name__}: {e}")
                raise
        
        return wrapper
    return decorator


class PooledHTTPClient:
    """
    HTTP client that uses connection pooling for efficient connections.
    
    Automatically manages connection reuse and keep-alive.
    """
    
    def __init__(self, host: str,
                 min_pool_size: int = 2,
                 max_pool_size: int = 10):
        """
        Initialize pooled HTTP client.
        
        Args:
            host: Target host
            min_pool_size: Minimum connections to maintain
            max_pool_size: Maximum connections allowed
        """
        self.host = host
        self.pool_manager = get_pool_manager()
        self.pool = self.pool_manager.get_pool(
            host, 
            min_size=min_pool_size, 
            max_size=max_pool_size
        )
    
    async def get(self, url: str, **kwargs) -> httpx.Response:
        """Execute GET request."""
        start_time = time.time()
        try:
            response = await self.pool.execute_request("GET", url, **kwargs)
            elapsed_ms = (time.time() - start_time) * 1000
            logger.debug(f"GET {url} - {response.status_code} ({elapsed_ms:.1f}ms)")
            return response
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(f"GET {url} failed after {elapsed_ms:.1f}ms: {e}")
            raise
    
    async def post(self, url: str, **kwargs) -> httpx.Response:
        """Execute POST request."""
        start_time = time.time()
        try:
            response = await self.pool.execute_request("POST", url, **kwargs)
            elapsed_ms = (time.time() - start_time) * 1000
            logger.debug(f"POST {url} - {response.status_code} ({elapsed_ms:.1f}ms)")
            return response
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(f"POST {url} failed after {elapsed_ms:.1f}ms: {e}")
            raise
    
    async def put(self, url: str, **kwargs) -> httpx.Response:
        """Execute PUT request."""
        start_time = time.time()
        try:
            response = await self.pool.execute_request("PUT", url, **kwargs)
            elapsed_ms = (time.time() - start_time) * 1000
            logger.debug(f"PUT {url} - {response.status_code} ({elapsed_ms:.1f}ms)")
            return response
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(f"PUT {url} failed after {elapsed_ms:.1f}ms: {e}")
            raise
    
    async def delete(self, url: str, **kwargs) -> httpx.Response:
        """Execute DELETE request."""
        start_time = time.time()
        try:
            response = await self.pool.execute_request("DELETE", url, **kwargs)
            elapsed_ms = (time.time() - start_time) * 1000
            logger.debug(f"DELETE {url} - {response.status_code} ({elapsed_ms:.1f}ms)")
            return response
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(f"DELETE {url} failed after {elapsed_ms:.1f}ms: {e}")
            raise
    
    async def request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Execute arbitrary HTTP request."""
        start_time = time.time()
        try:
            response = await self.pool.execute_request(method, url, **kwargs)
            elapsed_ms = (time.time() - start_time) * 1000
            logger.debug(f"{method} {url} - {response.status_code} ({elapsed_ms:.1f}ms)")
            return response
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(f"{method} {url} failed after {elapsed_ms:.1f}ms: {e}")
            raise
    
    def get_metrics(self):
        """Get pool metrics."""
        return self.pool.get_metrics()


# Example usage in routes:
"""
from app.services.connection_pool import PooledHTTPClient
from fastapi import APIRouter

router = APIRouter()

# Create pooled client for external API
external_api_client = PooledHTTPClient("https://api.example.com")

@router.get("/data")
async def get_data():
    '''Fetch data using connection pooling.'''
    response = await external_api_client.get("/endpoint")
    return response.json()

@router.post("/create")
async def create_item(data: dict):
    '''Create item using connection pooling.'''
    response = await external_api_client.post("/items", json=data)
    return response.json()
"""
