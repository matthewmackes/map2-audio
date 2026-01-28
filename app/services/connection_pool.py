"""
Connection Pool Management System for MAP2 Audio Platform

Implements HTTP connection pooling with:
- Connection reuse and lifecycle management
- Keep-alive connection support
- Connection health checking
- Proactive connection warming
- Dynamic pool sizing
- Connection affinity for stateful services
"""

import asyncio
import logging
import time
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum
import httpx
from datetime import datetime, timedelta
import weakref

logger = logging.getLogger(__name__)


class ConnectionState(Enum):
    """Connection lifecycle states."""
    AVAILABLE = "available"          # Ready to use
    IN_USE = "in_use"               # Currently in use
    WARMING = "warming"             # Proactive health check
    UNHEALTHY = "unhealthy"         # Failed health check
    CLOSED = "closed"               # Connection closed/removed


@dataclass
class PoolMetrics:
    """Metrics for a connection pool."""
    host: str
    total_connections: int = 0
    available_connections: int = 0
    in_use_connections: int = 0
    unhealthy_connections: int = 0
    total_requests: int = 0
    total_errors: int = 0
    total_reuses: int = 0
    avg_response_time_ms: float = 0.0
    last_request_time: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.now)
    
    @property
    def connection_reuse_rate(self) -> float:
        """Percentage of requests that reused connections."""
        if self.total_requests == 0:
            return 0.0
        return (self.total_reuses / self.total_requests) * 100
    
    @property
    def error_rate(self) -> float:
        """Percentage of failed requests."""
        if self.total_requests == 0:
            return 0.0
        return (self.total_errors / self.total_requests) * 100
    
    @property
    def uptime_seconds(self) -> float:
        """Pool uptime in seconds."""
        return (datetime.now() - self.created_at).total_seconds()


@dataclass
class PoolConnection:
    """Wrapped HTTP connection with lifecycle tracking."""
    host: str
    client: httpx.AsyncClient
    state: ConnectionState = ConnectionState.AVAILABLE
    created_at: datetime = field(default_factory=datetime.now)
    last_used_at: Optional[datetime] = None
    request_count: int = 0
    error_count: int = 0
    last_error: Optional[str] = None
    consecutive_failures: int = 0
    
    @property
    def age_seconds(self) -> float:
        """Connection age in seconds."""
        return (datetime.now() - self.created_at).total_seconds()
    
    @property
    def idle_seconds(self) -> float:
        """Time since last use in seconds."""
        if self.last_used_at is None:
            return self.age_seconds
        return (datetime.now() - self.last_used_at).total_seconds()
    
    def mark_used(self) -> None:
        """Mark connection as just used."""
        self.last_used_at = datetime.now()
        self.request_count += 1
    
    def record_error(self, error: str) -> None:
        """Record an error on this connection."""
        self.error_count += 1
        self.last_error = error
        self.consecutive_failures += 1
    
    def clear_errors(self) -> None:
        """Clear error state after successful use."""
        self.consecutive_failures = 0
        self.last_error = None


class ConnectionPool:
    """
    Managed pool of HTTP connections for a specific host.
    
    Features:
    - Connection reuse and keep-alive
    - Connection health checking
    - Proactive connection warming
    - Dynamic pool sizing
    - Metrics collection
    """
    
    def __init__(self, 
                 host: str,
                 min_pool_size: int = 2,
                 max_pool_size: int = 10,
                 connection_timeout_seconds: float = 30.0,
                 max_connection_age_seconds: float = 3600.0,
                 health_check_interval_seconds: int = 60,
                 max_consecutive_failures: int = 3):
        """
        Initialize connection pool.
        
        Args:
            host: Target host/URL
            min_pool_size: Minimum connections to maintain
            max_pool_size: Maximum connections allowed
            connection_timeout_seconds: Timeout for individual connections
            max_connection_age_seconds: Max age before recycling connection
            health_check_interval_seconds: How often to check connection health
            max_consecutive_failures: Mark connection unhealthy after this many failures
        """
        self.host = host
        self.min_pool_size = min_pool_size
        self.max_pool_size = max_pool_size
        self.connection_timeout_seconds = connection_timeout_seconds
        self.max_connection_age_seconds = max_connection_age_seconds
        self.health_check_interval_seconds = health_check_interval_seconds
        self.max_consecutive_failures = max_consecutive_failures
        
        self.connections: List[PoolConnection] = []
        self._lock = asyncio.Lock()
        self._metrics = PoolMetrics(host=host)
        self._health_check_task: Optional[asyncio.Task] = None
        
    async def get_connection(self) -> PoolConnection:
        """
        Get an available connection from the pool.
        
        Creates new connection if needed, or reuses existing one.
        """
        async with self._lock:
            # Try to find an available healthy connection
            for conn in self.connections:
                if (conn.state == ConnectionState.AVAILABLE and 
                    conn.consecutive_failures < self.max_consecutive_failures):
                    conn.state = ConnectionState.IN_USE
                    return conn
            
            # Create new connection if below max size
            if len(self.connections) < self.max_pool_size:
                conn = await self._create_connection()
                conn.state = ConnectionState.IN_USE
                return conn
            
            # Wait for a connection to become available
            logger.warning(f"Connection pool for {self.host} at max capacity, waiting...")
            await asyncio.sleep(0.1)
            return await self.get_connection()
    
    async def release_connection(self, conn: PoolConnection, success: bool = True) -> None:
        """
        Release a connection back to the pool.
        
        Args:
            conn: Connection to release
            success: Whether the request succeeded
        """
        async with self._lock:
            conn.mark_used()
            
            if success:
                conn.clear_errors()
                conn.state = ConnectionState.AVAILABLE
                self._metrics.total_reuses += 1
            else:
                conn.record_error("Request failed")
                if conn.consecutive_failures >= self.max_consecutive_failures:
                    conn.state = ConnectionState.UNHEALTHY
                else:
                    conn.state = ConnectionState.AVAILABLE
            
            self._metrics.total_requests += 1
            self._metrics.last_request_time = datetime.now()
    
    async def _create_connection(self) -> PoolConnection:
        """Create a new HTTP connection."""
        try:
            client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.connection_timeout_seconds),
                http2=True,
                limits=httpx.Limits(max_connections=1)
            )
            
            conn = PoolConnection(host=self.host, client=client)
            self.connections.append(conn)
            
            self._metrics.total_connections = len(self.connections)
            logger.debug(f"Created connection to {self.host}, total: {len(self.connections)}")
            
            return conn
        except Exception as e:
            logger.error(f"Failed to create connection to {self.host}: {e}")
            raise
    
    async def _close_connection(self, conn: PoolConnection) -> None:
        """Close and remove a connection."""
        try:
            await conn.client.aclose()
            self.connections.remove(conn)
            self._metrics.total_connections = len(self.connections)
            logger.debug(f"Closed connection to {self.host}")
        except Exception as e:
            logger.error(f"Error closing connection: {e}")
    
    async def start_health_checks(self) -> None:
        """Start background health check task."""
        if self._health_check_task is None or self._health_check_task.done():
            self._health_check_task = asyncio.create_task(self._health_check_loop())
            logger.info(f"Started health checks for pool: {self.host}")
    
    async def stop_health_checks(self) -> None:
        """Stop background health check task."""
        if self._health_check_task and not self._health_check_task.done():
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass
            logger.info(f"Stopped health checks for pool: {self.host}")
    
    async def _health_check_loop(self) -> None:
        """Background task that periodically checks connection health."""
        try:
            while True:
                await asyncio.sleep(self.health_check_interval_seconds)
                await self._perform_health_checks()
        except asyncio.CancelledError:
            pass
    
    async def _perform_health_checks(self) -> None:
        """Perform health checks on all connections."""
        async with self._lock:
            # Recycle old connections
            now = datetime.now()
            to_close = []
            
            for conn in self.connections:
                if conn.age_seconds > self.max_connection_age_seconds:
                    to_close.append(conn)
                elif conn.state == ConnectionState.UNHEALTHY and conn.idle_seconds > 300:
                    # Try to recover unhealthy connections after 5 minutes idle
                    conn.state = ConnectionState.WARMING
            
            # Close old connections
            for conn in to_close:
                await self._close_connection(conn)
            
            # Ensure minimum pool size
            while len(self.connections) < self.min_pool_size:
                conn = await self._create_connection()
        
        # Warm connections (outside lock to avoid blocking)
        await self._warm_connections()
    
    async def _warm_connections(self) -> None:
        """Perform proactive health checks on warming connections."""
        warming_conns = []
        
        async with self._lock:
            warming_conns = [c for c in self.connections 
                           if c.state == ConnectionState.WARMING]
        
        for conn in warming_conns:
            try:
                # Simple HEAD request to check health
                response = await conn.client.head(self.host, timeout=5)
                
                async with self._lock:
                    if response.status_code < 500:
                        conn.state = ConnectionState.AVAILABLE
                        conn.clear_errors()
                        logger.debug(f"Connection to {self.host} recovered")
                    else:
                        conn.record_error(f"Health check returned {response.status_code}")
            except Exception as e:
                async with self._lock:
                    conn.record_error(str(e))
                    if conn.consecutive_failures >= self.max_consecutive_failures:
                        conn.state = ConnectionState.UNHEALTHY
    
    async def execute_request(self, 
                            method: str, 
                            url: str,
                            **kwargs) -> httpx.Response:
        """
        Execute HTTP request using pooled connection.
        
        Args:
            method: HTTP method
            url: Request URL
            **kwargs: Additional arguments for the request
            
        Returns:
            HTTP response
        """
        conn = await self.get_connection()
        
        try:
            response = await conn.client.request(method, url, **kwargs)
            await self.release_connection(conn, success=response.status_code < 500)
            return response
        except Exception as e:
            await self.release_connection(conn, success=False)
            logger.error(f"Request failed: {e}")
            raise
    
    def get_metrics(self) -> PoolMetrics:
        """Get current pool metrics."""
        self._metrics.available_connections = sum(
            1 for c in self.connections if c.state == ConnectionState.AVAILABLE
        )
        self._metrics.in_use_connections = sum(
            1 for c in self.connections if c.state == ConnectionState.IN_USE
        )
        self._metrics.unhealthy_connections = sum(
            1 for c in self.connections if c.state == ConnectionState.UNHEALTHY
        )
        return self._metrics
    
    async def shutdown(self) -> None:
        """Shutdown pool and close all connections."""
        await self.stop_health_checks()
        
        async with self._lock:
            for conn in self.connections:
                try:
                    await conn.client.aclose()
                except Exception as e:
                    logger.error(f"Error closing connection during shutdown: {e}")
            
            self.connections.clear()
        
        logger.info(f"Shutdown connection pool for {self.host}")


class ConnectionPoolManager:
    """
    Manages multiple connection pools for different hosts.
    
    Provides centralized management of connection pooling across services.
    """
    
    def __init__(self, default_min_size: int = 2, 
                 default_max_size: int = 10):
        """
        Initialize pool manager.
        
        Args:
            default_min_size: Default minimum pool size
            default_max_size: Default maximum pool size
        """
        self.pools: Dict[str, ConnectionPool] = {}
        self.default_min_size = default_min_size
        self.default_max_size = default_max_size
        self._lock = asyncio.Lock()
    
    def get_pool(self, host: str, 
                 min_size: Optional[int] = None,
                 max_size: Optional[int] = None) -> ConnectionPool:
        """
        Get or create a connection pool for a host.
        
        Args:
            host: Target host
            min_size: Minimum pool size (uses default if not specified)
            max_size: Maximum pool size (uses default if not specified)
            
        Returns:
            ConnectionPool instance
        """
        if host not in self.pools:
            pool = ConnectionPool(
                host=host,
                min_pool_size=min_size or self.default_min_size,
                max_pool_size=max_size or self.default_max_size
            )
            self.pools[host] = pool
        
        return self.pools[host]
    
    async def start_all_pools(self) -> None:
        """Start health checks for all pools."""
        for pool in self.pools.values():
            await pool.start_health_checks()
        logger.info(f"Started {len(self.pools)} connection pools")
    
    async def stop_all_pools(self) -> None:
        """Stop all pools."""
        for pool in self.pools.values():
            await pool.stop_health_checks()
        logger.info(f"Stopped {len(self.pools)} connection pools")
    
    async def shutdown(self) -> None:
        """Shutdown all pools."""
        for pool in self.pools.values():
            await pool.shutdown()
        self.pools.clear()
        logger.info("Connection pool manager shutdown complete")
    
    def get_all_metrics(self) -> Dict[str, PoolMetrics]:
        """Get metrics for all pools."""
        return {
            host: pool.get_metrics()
            for host, pool in self.pools.items()
        }
    
    def get_pool_metrics(self, host: str) -> Optional[PoolMetrics]:
        """Get metrics for specific pool."""
        if host in self.pools:
            return self.pools[host].get_metrics()
        return None


# Global pool manager instance
_pool_manager: Optional[ConnectionPoolManager] = None


def get_pool_manager() -> ConnectionPoolManager:
    """Get global connection pool manager (singleton)."""
    global _pool_manager
    if _pool_manager is None:
        _pool_manager = ConnectionPoolManager()
    return _pool_manager
