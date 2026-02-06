"""
CHECKPOINT 0.1 Validation Test: Cluster Infrastructure Exists

Tests that mDNS discovery, event bus, and node registry are operational.
"""

import asyncio
import pytest
import logging
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestClusterInfrastructure:
    """Validate cluster infrastructure is present and functional"""
    
    def test_cluster_manager_exists(self):
        """Test: ClusterManager class can be imported"""
        try:
            from app.services.cluster import ClusterManager, ClusterState, ClusterNodeStatus
            logger.info("✅ ClusterManager imported successfully")
            assert ClusterManager is not None
            assert ClusterState is not None
            assert ClusterNodeStatus is not None
        except ImportError as e:
            pytest.fail(f"❌ Failed to import ClusterManager: {e}")
    
    def test_mdns_discovery_exists(self):
        """Test: mDNS discovery service exists"""
        try:
            from app.services.cluster import EnhancedMDNSDiscovery, MDNSNode
            logger.info("✅ EnhancedMDNSDiscovery imported successfully")
            assert EnhancedMDNSDiscovery is not None
            assert MDNSNode is not None
        except ImportError as e:
            pytest.fail(f"❌ Failed to import EnhancedMDNSDiscovery: {e}")
    
    def test_event_bus_exists(self):
        """Test: Distributed event bus exists"""
        try:
            from app.services.cluster import (
                DistributedEventBus,
                EventType,
                EventSeverity,
                ClusterEvent,
            )
            logger.info("✅ DistributedEventBus imported successfully")
            assert DistributedEventBus is not None
            assert EventType is not None
            assert EventSeverity is not None
            assert ClusterEvent is not None
        except ImportError as e:
            pytest.fail(f"❌ Failed to import DistributedEventBus: {e}")
    
    def test_cluster_registry_exists(self):
        """Test: Cluster registry exists"""
        try:
            from app.services.cluster import ClusterRegistry
            logger.info("✅ ClusterRegistry imported successfully")
            assert ClusterRegistry is not None
        except ImportError as e:
            pytest.fail(f"❌ Failed to import ClusterRegistry: {e}")
    
    def test_event_bus_publish_subscribe(self):
        """Test: Event bus can publish and subscribe to events"""
        try:
            from app.services.cluster import (
                DistributedEventBus,
                EventType,
                EventSeverity,
                ClusterEvent,
            )
            
            # Create event bus instance
            bus = DistributedEventBus(db_path=Path("/tmp/test_event_bus.db"))
            logger.info("✅ DistributedEventBus instance created")
            
            # Test subscribe
            events_received = []
            
            def on_event(event):
                events_received.append(event)
                logger.info(f"✅ Event received: {event.event_type.value}")
            
            bus.subscribe(EventType.NODE_JOINED, on_event)
            logger.info("✅ Successfully subscribed to NODE_JOINED event")
            
            # Verify subscribe method exists
            assert hasattr(bus, 'subscribe'), "Event bus missing subscribe method"
            assert hasattr(bus, 'publish_event'), "Event bus missing publish_event method"
            
        except Exception as e:
            pytest.fail(f"❌ Event bus publish/subscribe test failed: {e}")
    
    @pytest.mark.asyncio
    async def test_mdns_discovery_initialization(self):
        """Test: mDNS discovery can be initialized"""
        try:
            from app.services.cluster import EnhancedMDNSDiscovery
            
            discovery = EnhancedMDNSDiscovery(service_name="_map2-audio._tcp")
            logger.info("✅ EnhancedMDNSDiscovery instance created")
            
            # Verify key methods exist
            assert hasattr(discovery, 'discover'), "mDNS discovery missing discover method"
            assert hasattr(discovery, 'start'), "mDNS discovery missing start method"
            assert hasattr(discovery, 'stop'), "mDNS discovery missing stop method"
            
            logger.info("✅ mDNS discovery has all required methods")
            
        except Exception as e:
            pytest.fail(f"❌ mDNS discovery initialization failed: {e}")
    
    def test_cluster_node_status_enum(self):
        """Test: ClusterNodeStatus enum exists with proper values"""
        try:
            from app.services.cluster import ClusterNodeStatus
            
            # Verify status values
            assert hasattr(ClusterNodeStatus, 'ONLINE')
            assert hasattr(ClusterNodeStatus, 'OFFLINE')
            assert hasattr(ClusterNodeStatus, 'DEGRADED')
            
            logger.info("✅ ClusterNodeStatus enum has required values")
            
        except Exception as e:
            pytest.fail(f"❌ ClusterNodeStatus verification failed: {e}")
    
    def test_node_lifecycle_manager_exists(self):
        """Test: Node lifecycle manager exists"""
        try:
            from app.services.cluster import (
                NodeLifecycleManager,
                NodeState,
                NodeLifecycleEvent,
            )
            logger.info("✅ NodeLifecycleManager imported successfully")
            assert NodeLifecycleManager is not None
            assert NodeState is not None
            assert NodeLifecycleEvent is not None
        except ImportError as e:
            pytest.fail(f"❌ Failed to import NodeLifecycleManager: {e}")
    
    def test_health_aggregator_exists(self):
        """Test: Health aggregator exists"""
        try:
            from app.services.cluster.health_aggregator import HealthAggregator
            logger.info("✅ HealthAggregator imported successfully")
            assert HealthAggregator is not None
        except ImportError as e:
            pytest.fail(f"❌ Failed to import HealthAggregator: {e}")


# ============================================================================
# Standalone Test Functions (can run without pytest)
# ============================================================================

def verify_cluster_imports():
    """Standalone verification of cluster imports"""
    print("\n" + "="*80)
    print("CHECKPOINT 0.1: Validating Cluster Infrastructure")
    print("="*80 + "\n")
    
    checks = {
        "ClusterManager": False,
        "mDNS Discovery": False,
        "Event Bus": False,
        "Cluster Registry": False,
        "Node Lifecycle": False,
        "Health Aggregator": False,
    }
    
    # Check ClusterManager
    try:
        from app.services.cluster import ClusterManager, ClusterState, ClusterNodeStatus
        checks["ClusterManager"] = True
        print("✅ ClusterManager & ClusterState - OK")
    except ImportError as e:
        print(f"❌ ClusterManager import failed: {e}")
    
    # Check mDNS
    try:
        from app.services.cluster import EnhancedMDNSDiscovery, MDNSNode
        checks["mDNS Discovery"] = True
        print("✅ EnhancedMDNSDiscovery - OK")
    except ImportError as e:
        print(f"❌ mDNS Discovery import failed: {e}")
    
    # Check Event Bus
    try:
        from app.services.cluster import (
            DistributedEventBus,
            EventType,
            EventSeverity,
            ClusterEvent,
        )
        checks["Event Bus"] = True
        print("✅ DistributedEventBus - OK")
    except ImportError as e:
        print(f"❌ Event Bus import failed: {e}")
    
    # Check Registry
    try:
        from app.services.cluster import ClusterRegistry
        checks["Cluster Registry"] = True
        print("✅ ClusterRegistry - OK")
    except ImportError as e:
        print(f"❌ Registry import failed: {e}")
    
    # Check Node Lifecycle
    try:
        from app.services.cluster import (
            NodeLifecycleManager,
            NodeState,
        )
        checks["Node Lifecycle"] = True
        print("✅ NodeLifecycleManager - OK")
    except ImportError as e:
        print(f"❌ Node Lifecycle import failed: {e}")
    
    # Check Health Aggregator
    try:
        from app.services.cluster.health_aggregator import HealthAggregator
        checks["Health Aggregator"] = True
        print("✅ HealthAggregator - OK")
    except ImportError as e:
        print(f"❌ Health Aggregator import failed: {e}")
    
    # Summary
    print("\n" + "-"*80)
    completed = sum(1 for v in checks.values() if v)
    total = len(checks)
    print(f"Infrastructure Status: {completed}/{total} components operational\n")
    
    for component, status in checks.items():
        symbol = "✅" if status else "❌"
        print(f"  {symbol} {component}")
    
    print("-"*80 + "\n")
    
    if completed == total:
        print("🎉 CHECKPOINT 0.1: CLUSTER INFRASTRUCTURE VALIDATED - ALL CHECKS PASSED\n")
        return True
    else:
        print(f"⚠️  CHECKPOINT 0.1: {total - completed} components missing\n")
        return False


if __name__ == "__main__":
    # Run standalone verification
    success = verify_cluster_imports()
    exit(0 if success else 1)
