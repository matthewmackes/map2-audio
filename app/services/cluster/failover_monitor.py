"""
Cluster Failover Monitor & Automatic Flow Reassignment

Listens to NODE_OFFLINE events from HeartbeatMonitor and automatically:
1. Promotes standby flows to primary
2. Reassigns flows to healthy nodes
3. Updates cluster registry
4. Notifies UI via WebSocket
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional, List

from app.services.cluster.registry import get_cluster_registry
from app.services.cluster.heartbeat_monitor import get_heartbeat_monitor
from app.services.event_bus import get_event_bus, EventType

logger = logging.getLogger(__name__)


class FailoverMonitor:
    """
    Automatic failover for cluster nodes.
    Promotes standby flows or reassigns to healthy nodes.
    """
    
    def __init__(self):
        self.registry = get_cluster_registry()
        self.heartbeat_monitor = get_heartbeat_monitor()
        # Delayed import to avoid circular dependency
        from app.services.flow_orchestrator import get_flow_orchestrator
        self.flow_orchestrator = get_flow_orchestrator()
        self.event_bus = get_event_bus()
        self.is_running = False
        
    async def start(self):
        """Start failover monitoring."""
        if self.is_running:
            return
        
        logger.info("Starting failover monitor")
        self.is_running = True
        
        # Subscribe to NODE_OFFLINE events
        await self.event_bus.subscribe(EventType.NODE_OFFLINE, self.on_node_offline)
    
    async def stop(self):
        """Stop failover monitoring."""
        if not self.is_running:
            return
        
        logger.info("Stopping failover monitor")
        self.is_running = False
        
        await self.event_bus.unsubscribe(EventType.NODE_OFFLINE, self.on_node_offline)
    
    async def on_node_offline(self, event_data: dict):
        """Called when a node goes offline."""
        node_id = event_data['node_id']
        timestamp = event_data['timestamp']
        
        logger.warning(f"Node {node_id} offline at {timestamp}, triggering failover")
        
        try:
            # Get all flows assigned to failed node
            flows = await self.flow_orchestrator.get_flows_on_node(node_id)
            
            if not flows:
                logger.info(f"No flows on failed node {node_id}")
                return
            
            logger.info(f"Failing over {len(flows)} flows from node {node_id}")
            
            # Failover each flow
            failover_results = []
            for flow in flows:
                result = await self._failover_flow(flow, node_id)
                failover_results.append(result)
            
            # Publish failover completion event
            successful = sum(1 for r in failover_results if r['status'] == 'success')
            failed = len(failover_results) - successful
            
            await self.event_bus.publish(EventType.NODE_FAILOVER, {
                'failed_node': node_id,
                'timestamp': datetime.utcnow().isoformat(),
                'flows_total': len(flows),
                'flows_succeeded': successful,
                'flows_failed': failed,
                'results': failover_results
            })
            
            logger.info(f"Failover complete: {successful} succeeded, {failed} failed")
            
        except Exception as e:
            logger.error(f"Error during failover for node {node_id}: {e}", exc_info=True)
    
    async def _failover_flow(self, flow: dict, failed_node_id: str) -> dict:
        """Failover a single flow."""
        flow_id = flow['id']
        
        try:
            # Check if flow has standby assignment
            if flow.get('standby_node_id'):
                # Promote standby to primary
                result = await self._promote_standby(flow)
            else:
                # Reassign to new node
                result = await self._reassign_flow(flow)
            
            return {
                'flow_id': flow_id,
                'status': 'success',
                'action': result['action'],
                'new_node': result.get('new_node_id')
            }
            
        except Exception as e:
            logger.error(f"Failed to failover flow {flow_id}: {e}")
            return {
                'flow_id': flow_id,
                'status': 'failed',
                'error': str(e)
            }
    
    async def _promote_standby(self, flow: dict) -> dict:
        """Promote standby assignment to primary."""
        flow_id = flow['id']
        standby_node_id = flow['standby_node_id']
        
        logger.info(f"Promoting standby node {standby_node_id} to primary for flow {flow_id}")
        
        # Update flow in registry
        promoted = await self.flow_orchestrator.promote_standby_to_primary(flow_id, standby_node_id)
        if not promoted:
            raise Exception(f"Failed to promote standby assignment for flow {flow_id}")
        
        # Send activation command to new primary node
        activated = await self.flow_orchestrator.activate_flow_on_node(flow_id, standby_node_id)
        if not activated:
            raise Exception(f"Failed to activate promoted standby node {standby_node_id} for flow {flow_id}")
        
        return {
            'action': 'promote_standby',
            'new_node_id': standby_node_id
        }
    
    async def _reassign_flow(self, flow: dict) -> dict:
        """Reassign flow to a new healthy node."""
        flow_id = flow['id']
        
        logger.info(f"Reassigning flow {flow_id} to new node (no standby available)")
        
        # Find best available node
        online_nodes = self.heartbeat_monitor.get_online_nodes()
        
        if not online_nodes:
            raise Exception("No online nodes available for reassignment")
        
        # Use flow orchestrator to pick best node
        best_node = await self.flow_orchestrator.select_best_node(flow, online_nodes)
        
        # Deploy flow to new node and update primary assignment.
        reassigned = await self.flow_orchestrator.assign_flow(flow_id, best_node)
        if not reassigned:
            raise Exception(f"Failed to reassign flow {flow_id} to node {best_node}")
        
        return {
            'action': 'reassign',
            'new_node_id': best_node
        }


# Singleton instance
_failover_monitor: Optional[FailoverMonitor] = None


def get_failover_monitor() -> FailoverMonitor:
    """Get or create the singleton failover monitor instance."""
    global _failover_monitor
    if _failover_monitor is None:
        _failover_monitor = FailoverMonitor()
    return _failover_monitor


async def main():
    """Main failover monitor entry point"""
    logger.info("MAP2 Failover Monitor starting...")
    
    monitor = get_failover_monitor()
    heartbeat = get_heartbeat_monitor()
    
    try:
        # Start heartbeat monitoring first
        await heartbeat.start()
        
        # Start failover monitoring
        await monitor.start()
        
        # Keep running
        while True:
            await asyncio.sleep(1)
            
    except KeyboardInterrupt:
        logger.info("Failover monitor shutting down...")
        await monitor.stop()
        await heartbeat.stop()
    except Exception as e:
        logger.error(f"Failover monitor error: {e}", exc_info=True)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
