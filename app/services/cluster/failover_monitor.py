"""
Cluster failover monitor for snapshot deployments.

Listens to NODE_OFFLINE events and either:
1. promotes a standby snapshot deployment to primary, or
2. reassigns the snapshot to the best healthy node.
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional

from app.database import get_session
from app.services.cluster.heartbeat_monitor import get_heartbeat_monitor
from app.services.cluster.registry import get_cluster_registry
from app.services.event_bus import EventType, get_event_bus
from app.services.snapshot_deployment_service import SnapshotDeploymentService

logger = logging.getLogger(__name__)


class FailoverMonitor:
    """Automatic failover for cluster snapshot deployments."""

    def __init__(self):
        self.registry = get_cluster_registry()
        self.heartbeat_monitor = get_heartbeat_monitor()
        self.event_bus = get_event_bus()
        self.is_running = False

    async def start(self):
        """Start failover monitoring."""
        if self.is_running:
            return

        logger.info("Starting failover monitor")
        self.is_running = True
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
        node_id = event_data["node_id"]
        timestamp = event_data["timestamp"]

        logger.warning("Node %s offline at %s, triggering snapshot failover", node_id, timestamp)

        try:
            async with get_session() as session:
                deployment_service = SnapshotDeploymentService(session)
                deployments = await deployment_service.list_deployments(primary_node_id=node_id)

            if not deployments:
                logger.info("No snapshot deployments on failed node %s", node_id)
                return

            logger.info("Failing over %s snapshot deployments from node %s", len(deployments), node_id)

            failover_results = []
            for deployment in deployments:
                result = await self._failover_snapshot(deployment, node_id)
                failover_results.append(result)

            successful = sum(1 for item in failover_results if item["status"] == "success")
            failed = len(failover_results) - successful

            payload = {
                "failed_node": node_id,
                "timestamp": datetime.utcnow().isoformat(),
                "snapshots_total": len(deployments),
                "snapshots_succeeded": successful,
                "snapshots_failed": failed,
                "results": failover_results,
            }
            # Retain legacy keys while internal consumers transition.
            payload["flows_total"] = payload["snapshots_total"]
            payload["flows_succeeded"] = payload["snapshots_succeeded"]
            payload["flows_failed"] = payload["snapshots_failed"]

            await self.event_bus.publish(EventType.NODE_FAILOVER, payload)
            logger.info("Snapshot failover complete: %s succeeded, %s failed", successful, failed)
        except Exception as exc:
            logger.error("Error during failover for node %s: %s", node_id, exc, exc_info=True)

    async def _failover_snapshot(self, deployment: dict, failed_node_id: str) -> dict:
        """Fail over a single snapshot deployment."""
        snapshot_id = deployment["snapshot_id"]

        try:
            standby_ids = list(deployment.get("standby_node_ids") or [])
            if standby_ids:
                result = await self._promote_standby(deployment)
            else:
                result = await self._reassign_snapshot(deployment, failed_node_id)

            return {
                "snapshot_id": snapshot_id,
                "status": "success",
                "action": result["action"],
                "new_node": result.get("new_node_id"),
            }
        except Exception as exc:
            logger.error("Failed to fail over snapshot %s: %s", snapshot_id, exc)
            return {
                "snapshot_id": snapshot_id,
                "status": "failed",
                "error": str(exc),
            }

    async def _promote_standby(self, deployment: dict) -> dict:
        """Promote the first standby assignment to primary."""
        snapshot_id = deployment["snapshot_id"]
        standby_node_ids = list(deployment.get("standby_node_ids") or [])
        standby_node_id = standby_node_ids[0]

        logger.info(
            "Promoting standby node %s to primary for snapshot %s",
            standby_node_id,
            snapshot_id,
        )

        async with get_session() as session:
            deployment_service = SnapshotDeploymentService(session)
            promoted = await deployment_service.failover_snapshot(
                snapshot_id,
                retain_previous_primary=False,
            )

        if promoted is None:
            raise Exception(f"Failed to promote standby deployment for snapshot {snapshot_id}")

        return {
            "action": "promote_standby",
            "new_node_id": standby_node_id,
        }

    async def _reassign_snapshot(self, deployment: dict, failed_node_id: str) -> dict:
        """Reassign snapshot deployment to a healthy node when no standby exists."""
        snapshot_id = deployment["snapshot_id"]

        logger.info("Reassigning snapshot %s to a new node (no standby available)", snapshot_id)

        online_nodes = self.heartbeat_monitor.get_online_nodes()
        if not online_nodes:
            raise Exception("No online nodes available for reassignment")

        async with get_session() as session:
            deployment_service = SnapshotDeploymentService(session)
            best_node = deployment_service.select_best_node(
                candidates=online_nodes,
                excluded_node_ids={failed_node_id},
            )
            if best_node is None:
                raise Exception("No eligible nodes available for snapshot reassignment")

            reassigned = await deployment_service.reassign_snapshot(
                snapshot_id,
                node_id=best_node,
                failed_node_ids={failed_node_id},
                assignment_strategy="automatic-failover",
            )

        if reassigned is None:
            raise Exception(f"Failed to reassign snapshot {snapshot_id} to node {best_node}")

        return {
            "action": "reassign",
            "new_node_id": best_node,
        }


_failover_monitor: Optional[FailoverMonitor] = None


def get_failover_monitor() -> FailoverMonitor:
    """Get or create the singleton failover monitor instance."""
    global _failover_monitor
    if _failover_monitor is None:
        _failover_monitor = FailoverMonitor()
    return _failover_monitor


async def main():
    """Main failover monitor entry point."""
    logger.info("MAP2 snapshot failover monitor starting...")

    monitor = get_failover_monitor()
    heartbeat = get_heartbeat_monitor()

    try:
        await heartbeat.start()
        await monitor.start()

        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        logger.info("Failover monitor shutting down...")
        await monitor.stop()
        await heartbeat.stop()
    except Exception as exc:
        logger.error("Failover monitor error: %s", exc, exc_info=True)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
