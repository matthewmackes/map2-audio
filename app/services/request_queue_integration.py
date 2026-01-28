"""
Request Queue FastAPI Integration for MAP2 Audio Platform

Provides decorators and utilities for using request queuing in FastAPI routes
and handling request failures with automatic retry logic.
"""

import functools
import logging
from typing import Callable, Optional, Any, Dict
import asyncio

from app.services.request_queue import (
    get_request_queue, QueuedRequest, RequestPriority, RequestStatus
)

logger = logging.getLogger(__name__)


def queued_request(service_name: str,
                   priority: RequestPriority = RequestPriority.MEDIUM,
                   max_attempts: int = 5):
    """
    Decorator for queuing requests with automatic retry logic.
    
    When a request fails, it's automatically queued for retry with exponential backoff.
    
    Usage:
        @queued_request("user_service", priority=RequestPriority.HIGH)
        async def create_user(data: dict):
            return await user_api.create(data)
    
    Args:
        service_name: Name of the service
        priority: Request priority level
        max_attempts: Maximum retry attempts
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            queue = get_request_queue()
            
            # Create queued request
            request = QueuedRequest(
                service_name=service_name,
                method="POST",
                endpoint=func.__name__,
                payload=kwargs if kwargs else {"args": str(args)},
                priority=priority,
                max_attempts=max_attempts
            )
            
            # Enqueue for processing
            request_id = await queue.enqueue(request)
            
            try:
                # Try immediate execution first
                result = await func(*args, **kwargs)
                await queue.mark_success(request_id, result)
                return result
            
            except Exception as e:
                logger.error(f"Request {request_id} failed: {e}")
                await queue.mark_failure(request_id, str(e))
                raise
        
        return wrapper
    return decorator


class QueuedHTTPClient:
    """
    HTTP client that automatically queues failed requests for retry.
    
    Ensures no data loss through persistent queueing and exponential backoff.
    """
    
    def __init__(self, service_name: str,
                 priority: RequestPriority = RequestPriority.MEDIUM,
                 max_attempts: int = 5):
        """
        Initialize queued HTTP client.
        
        Args:
            service_name: Service name for logging
            priority: Default priority for queued requests
            max_attempts: Default max retry attempts
        """
        self.service_name = service_name
        self.priority = priority
        self.max_attempts = max_attempts
        self.queue = get_request_queue()
    
    async def execute_with_queue(self,
                                 method: str,
                                 endpoint: str,
                                 payload: Dict[str, Any],
                                 headers: Optional[Dict[str, str]] = None,
                                 execute_func: Optional[Callable] = None) -> Dict[str, Any]:
        """
        Execute request with automatic queuing on failure.
        
        Args:
            method: HTTP method
            endpoint: API endpoint
            payload: Request payload
            headers: Optional headers
            execute_func: Function to execute the actual request
            
        Returns:
            Response data
        """
        request = QueuedRequest(
            service_name=self.service_name,
            method=method,
            endpoint=endpoint,
            payload=payload,
            headers=headers or {},
            priority=self.priority,
            max_attempts=self.max_attempts
        )
        
        request_id = await self.queue.enqueue(request)
        
        try:
            if execute_func:
                result = await execute_func(request)
            else:
                result = {"status": "queued", "request_id": request_id}
            
            await self.queue.mark_success(request_id, result)
            return result
        
        except Exception as e:
            logger.error(f"Request {request_id} failed: {e}")
            await self.queue.mark_failure(request_id, str(e))
            raise
    
    def get_queue_metrics(self):
        """Get current queue metrics."""
        return self.queue.get_metrics()
    
    def get_request_status(self, request_id: str) -> Optional[QueuedRequest]:
        """Get status of specific request."""
        return self.queue.get_request_status(request_id)


class RequestQueueManager:
    """Manager for request queue lifecycle."""
    
    def __init__(self):
        self.queue = get_request_queue()
    
    async def initialize(self) -> None:
        """Initialize queue from persistent storage."""
        await self.queue.load_from_disk()
        await self.queue.start_processor()
        logger.info("Request queue manager initialized")
    
    async def shutdown(self) -> None:
        """Shutdown queue."""
        await self.queue.shutdown()
        logger.info("Request queue manager shutdown")
    
    def get_metrics(self):
        """Get queue metrics."""
        return self.queue.get_metrics()


# Example usage in routes:
"""
from fastapi import FastAPI, HTTPException
import httpx
from app.services.request_queue_integration import QueuedHTTPClient, RequestPriority

app = FastAPI()

# Create queued client for user service
user_client = QueuedHTTPClient("user_service", priority=RequestPriority.HIGH)

# Service base URL (configure from environment)
USER_SERVICE_URL = "http://user-service:8000"


async def call_user_api(request) -> dict:
    '''Execute the actual HTTP call to user service.
    
    Args:
        request: QueuedRequest containing method, endpoint, and payload
        
    Returns:
        Response data as dictionary
        
    Raises:
        httpx.HTTPError: On HTTP errors (will trigger retry)
    '''
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(
            method=request.method,
            url=f"{USER_SERVICE_URL}{request.endpoint}",
            json=request.payload,
            headers=request.headers
        )
        response.raise_for_status()
        return response.json()


@app.post("/users")
async def create_user(data: dict):
    '''Create user with automatic retry queueing.'''
    try:
        result = await user_client.execute_with_queue(
            method="POST",
            endpoint="/users",
            payload=data,
            execute_func=call_user_api
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
"""
