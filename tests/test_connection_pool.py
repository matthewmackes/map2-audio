"""
Tests for Connection Pool Management System

Tests for connection pool creation, reuse, health checking, and metrics.
"""

import pytest
import asyncio
from datetime import datetime, timedelta

from app.services.connection_pool import (
    ConnectionPool, ConnectionPoolManager, PoolConnection, 
    ConnectionState, PoolMetrics, get_pool_manager
)


class TestPoolMetrics:
    """Test metrics calculation."""
    
    def test_metrics_initialization(self):
        """Test metrics initializes correctly."""
        metrics = PoolMetrics(host="http://example.com")
        
        assert metrics.host == "http://example.com"
        assert metrics.total_connections == 0
        assert metrics.connection_reuse_rate == 0.0
        assert metrics.error_rate == 0.0
    
    def test_connection_reuse_rate(self):
        """Test connection reuse rate calculation."""
        metrics = PoolMetrics(host="http://example.com")
        
        metrics.total_requests = 100
        metrics.total_reuses = 80
        
        assert metrics.connection_reuse_rate == 80.0
    
    def test_error_rate(self):
        """Test error rate calculation."""
        metrics = PoolMetrics(host="http://example.com")
        
        metrics.total_requests = 100
        metrics.total_errors = 5
        
        assert metrics.error_rate == 5.0
    
    def test_uptime_seconds(self):
        """Test uptime calculation."""
        metrics = PoolMetrics(
            host="http://example.com",
            created_at=datetime.now() - timedelta(hours=1)
        )
        
        uptime = metrics.uptime_seconds
        assert 3500 < uptime < 3700  # Approximately 1 hour


class TestPoolConnection:
    """Test pool connection lifecycle."""
    
    def test_connection_initialization(self):
        """Test connection initializes correctly."""
        # Note: This is a simplified test without actual httpx.AsyncClient
        # In real tests, you would mock the client
        pass
    
    def test_connection_age(self):
        """Test connection age calculation."""
        conn = PoolConnection(
            host="http://example.com",
            client=None,  # Mock
            created_at=datetime.now() - timedelta(minutes=5)
        )
        
        age = conn.age_seconds
        assert 290 < age < 310  # Approximately 5 minutes
    
    def test_connection_idle_time(self):
        """Test idle time calculation."""
        now = datetime.now()
        conn = PoolConnection(
            host="http://example.com",
            client=None,
            created_at=now - timedelta(minutes=10),
            last_used_at=now - timedelta(minutes=2)
        )
        
        idle = conn.idle_seconds
        assert 110 < idle < 130  # Approximately 2 minutes
    
    def test_mark_used(self):
        """Test marking connection as used."""
        conn = PoolConnection(
            host="http://example.com",
            client=None
        )
        
        initial_count = conn.request_count
        conn.mark_used()
        
        assert conn.request_count == initial_count + 1
        assert conn.last_used_at is not None
    
    def test_record_error(self):
        """Test recording errors."""
        conn = PoolConnection(
            host="http://example.com",
            client=None
        )
        
        assert conn.consecutive_failures == 0
        
        conn.record_error("Connection timeout")
        
        assert conn.error_count == 1
        assert conn.consecutive_failures == 1
        assert conn.last_error == "Connection timeout"
    
    def test_clear_errors(self):
        """Test clearing error state."""
        conn = PoolConnection(
            host="http://example.com",
            client=None,
            consecutive_failures=3,
            error_count=5
        )
        
        conn.clear_errors()
        
        assert conn.consecutive_failures == 0
        assert conn.error_count == 5  # Not reset, just consecutive count
        assert conn.last_error is None


class TestConnectionPool:
    """Test connection pool functionality."""
    
    @pytest.mark.asyncio
    async def test_pool_initialization(self):
        """Test pool initializes correctly."""
        pool = ConnectionPool(
            host="http://example.com",
            min_pool_size=2,
            max_pool_size=10
        )
        
        assert pool.host == "http://example.com"
        assert pool.min_pool_size == 2
        assert pool.max_pool_size == 10
        assert len(pool.connections) == 0
    
    @pytest.mark.asyncio
    async def test_metrics_collection(self):
        """Test that pool collects metrics."""
        pool = ConnectionPool(
            host="http://example.com",
            min_pool_size=1,
            max_pool_size=5
        )
        
        metrics = pool.get_metrics()
        
        assert metrics.host == "http://example.com"
        assert metrics.total_connections >= 0
    
    @pytest.mark.asyncio
    async def test_pool_configuration_values(self):
        """Test pool configuration parameters."""
        pool = ConnectionPool(
            host="http://example.com",
            min_pool_size=3,
            max_pool_size=15,
            connection_timeout_seconds=45.0,
            max_connection_age_seconds=7200.0,
            health_check_interval_seconds=120,
            max_consecutive_failures=5
        )
        
        assert pool.min_pool_size == 3
        assert pool.max_pool_size == 15
        assert pool.connection_timeout_seconds == 45.0
        assert pool.max_connection_age_seconds == 7200.0
        assert pool.health_check_interval_seconds == 120
        assert pool.max_consecutive_failures == 5
    
    @pytest.mark.asyncio
    async def test_shutdown(self):
        """Test pool shutdown."""
        pool = ConnectionPool(
            host="http://example.com",
            min_pool_size=1,
            max_pool_size=5
        )
        
        # Should not raise
        await pool.shutdown()


class TestConnectionPoolManager:
    """Test pool manager functionality."""
    
    def test_manager_initialization(self):
        """Test pool manager initializes correctly."""
        manager = ConnectionPoolManager(
            default_min_size=2,
            default_max_size=10
        )
        
        assert manager.default_min_size == 2
        assert manager.default_max_size == 10
        assert len(manager.pools) == 0
    
    def test_get_or_create_pool(self):
        """Test getting or creating a pool."""
        manager = ConnectionPoolManager()
        
        pool1 = manager.get_pool("http://api1.example.com")
        pool2 = manager.get_pool("http://api1.example.com")
        
        # Should be same instance
        assert pool1 is pool2
        
        pool3 = manager.get_pool("http://api2.example.com")
        
        # Should be different instance
        assert pool1 is not pool3
        assert len(manager.pools) == 2
    
    def test_pool_with_custom_sizes(self):
        """Test creating pool with custom sizes."""
        manager = ConnectionPoolManager(
            default_min_size=2,
            default_max_size=10
        )
        
        pool = manager.get_pool(
            "http://example.com",
            min_size=5,
            max_size=20
        )
        
        assert pool.min_pool_size == 5
        assert pool.max_pool_size == 20
    
    @pytest.mark.asyncio
    async def test_start_stop_pools(self):
        """Test starting and stopping all pools."""
        manager = ConnectionPoolManager()
        
        # Create some pools
        manager.get_pool("http://api1.example.com")
        manager.get_pool("http://api2.example.com")
        
        # Should not raise
        await manager.start_all_pools()
        await manager.stop_all_pools()
    
    @pytest.mark.asyncio
    async def test_shutdown(self):
        """Test manager shutdown."""
        manager = ConnectionPoolManager()
        
        manager.get_pool("http://api1.example.com")
        manager.get_pool("http://api2.example.com")
        
        await manager.shutdown()
        
        assert len(manager.pools) == 0
    
    def test_get_all_metrics(self):
        """Test getting metrics for all pools."""
        manager = ConnectionPoolManager()
        
        manager.get_pool("http://api1.example.com")
        manager.get_pool("http://api2.example.com")
        
        metrics = manager.get_all_metrics()
        
        assert len(metrics) == 2
        assert "http://api1.example.com" in metrics
        assert "http://api2.example.com" in metrics
    
    def test_get_pool_metrics(self):
        """Test getting metrics for specific pool."""
        manager = ConnectionPoolManager()
        
        manager.get_pool("http://api1.example.com")
        
        metrics = manager.get_pool_metrics("http://api1.example.com")
        
        assert metrics is not None
        assert metrics.host == "http://api1.example.com"
    
    def test_get_nonexistent_pool_metrics(self):
        """Test getting metrics for non-existent pool."""
        manager = ConnectionPoolManager()
        
        metrics = manager.get_pool_metrics("http://nonexistent.example.com")
        
        assert metrics is None


class TestConnectionPoolStates:
    """Test connection state transitions."""
    
    def test_connection_state_enum(self):
        """Test connection state enum values."""
        assert ConnectionState.AVAILABLE.value == "available"
        assert ConnectionState.IN_USE.value == "in_use"
        assert ConnectionState.WARMING.value == "warming"
        assert ConnectionState.UNHEALTHY.value == "unhealthy"
        assert ConnectionState.CLOSED.value == "closed"


class TestPoolMetricsCalculation:
    """Test metrics calculations."""
    
    def test_connection_reuse_rate_zero(self):
        """Test reuse rate with no requests."""
        metrics = PoolMetrics(host="http://example.com")
        assert metrics.connection_reuse_rate == 0.0
    
    def test_error_rate_zero(self):
        """Test error rate with no errors."""
        metrics = PoolMetrics(host="http://example.com")
        metrics.total_requests = 100
        metrics.total_errors = 0
        
        assert metrics.error_rate == 0.0
    
    def test_error_rate_full(self):
        """Test error rate with all failed requests."""
        metrics = PoolMetrics(host="http://example.com")
        metrics.total_requests = 50
        metrics.total_errors = 50
        
        assert metrics.error_rate == 100.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
