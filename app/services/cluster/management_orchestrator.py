"""
Management Node Service Orchestrator

Central service that coordinates all cluster management tasks on the Management Node:
- Health checks (30-second interval)
- Metrics aggregation (60-second interval)
- Update scheduling
- Configuration distribution
- Failover monitoring
- Event log rotation

Runs as systemd service on Management Node only.
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta
from typing import Awaitable, Callable, Dict

logger = logging.getLogger(__name__)


class ManagementOrchestrator:
    """Coordinates periodic management-node tasks with isolated failures."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._running = False
        self._last_run: Dict[str, datetime] = {}
        self._failover_started = False
        self._auto_update_enabled = os.getenv("MAP2_AUTO_UPDATE", "0").strip() in {
            "1",
            "true",
            "yes",
        }

        # Per-task cadence.
        self._intervals = {
            "health_checks": timedelta(seconds=30),
            "metrics_aggregation": timedelta(seconds=60),
            "update_scheduling": timedelta(minutes=15),
            "config_distribution": timedelta(seconds=30),
            "failover_monitoring": timedelta(seconds=5),
            "event_log_rotation": timedelta(hours=1),
        }

    async def start(self):
        """Run orchestrator loop until cancelled."""
        self._running = True
        self.logger.info(
            "MAP2 Management Node Orchestrator starting (auto_update=%s)",
            self._auto_update_enabled,
        )

        while self._running:
            try:
                await self._run_due_tasks()
            except Exception as e:
                self.logger.error(f"Orchestrator iteration error: {e}", exc_info=True)

            await asyncio.sleep(5)

    async def stop(self):
        self._running = False
        self.logger.info("MAP2 Management Node Orchestrator stopping")
        await self._stop_failover_monitor()

    async def _run_due_tasks(self):
        now = datetime.utcnow()
        await self._run_if_due("health_checks", now, self._run_health_checks)
        await self._run_if_due("metrics_aggregation", now, self._run_metrics_aggregation)
        await self._run_if_due("update_scheduling", now, self._run_update_scheduling)
        await self._run_if_due("config_distribution", now, self._run_config_distribution)
        await self._run_if_due("failover_monitoring", now, self._run_failover_monitoring)
        await self._run_if_due("event_log_rotation", now, self._run_event_log_rotation)

    async def _run_if_due(
        self,
        task_name: str,
        now: datetime,
        task_cb: Callable[[], Awaitable[None]],
    ):
        last = self._last_run.get(task_name)
        if last and now - last < self._intervals[task_name]:
            return

        try:
            await task_cb()
            self._last_run[task_name] = now
        except Exception as e:
            self.logger.error("Task '%s' failed: %s", task_name, e, exc_info=True)

    async def _run_health_checks(self):
        from app.services.cluster.health_aggregator import get_health_aggregator

        aggregator = get_health_aggregator()
        await aggregator.aggregate_metrics()

    async def _run_metrics_aggregation(self):
        from app.services.cluster.distributed_event_bus import (
            ClusterEvent,
            EventType,
            EventSeverity,
            get_event_bus as get_distributed_event_bus,
        )
        from app.services.cluster.registry import get_cluster_registry

        registry = get_cluster_registry()
        summary = registry.get_cluster_summary()

        event_bus = get_distributed_event_bus()
        await event_bus.publish_event(
            ClusterEvent(
                event_type=EventType.METRICS_COLLECTED,
                severity=EventSeverity.INFO,
                source_node_id="management-orchestrator",
                message="Cluster metrics summary refreshed",
                details=summary,
            )
        )

    async def _run_update_scheduling(self):
        from app.services.cluster.update_orchestrator import get_update_scheduler

        scheduler = get_update_scheduler()
        if self._auto_update_enabled and not scheduler.running:
            self.logger.info("Auto-update window triggered; running update cycle")
            await scheduler.execute_update_cycle()
            return

        self.logger.debug(
            "Update scheduler status: running=%s phase=%s",
            scheduler.running,
            scheduler.current_report.phase.value,
        )

    async def _run_config_distribution(self):
        from app.services.cluster.config_distributor import get_config_distributor

        try:
            distributor = get_config_distributor()
        except RuntimeError:
            return

        if distributor.is_running:
            return

        await distributor.start()

    async def _run_failover_monitoring(self):
        if self._failover_started:
            return

        from app.services.cluster.failover_monitor import get_failover_monitor
        from app.services.cluster.heartbeat_monitor import get_heartbeat_monitor

        heartbeat = get_heartbeat_monitor()
        failover = get_failover_monitor()
        await heartbeat.start()
        await failover.start()
        self._failover_started = True

    async def _run_event_log_rotation(self):
        from app.services.cluster.distributed_event_bus import get_event_bus as get_distributed_event_bus

        event_bus = get_distributed_event_bus()
        deleted = await event_bus.cleanup_old_events(days=7)
        if deleted:
            self.logger.info("Rotated cluster event log entries: %s", deleted)

    async def _stop_failover_monitor(self):
        if not self._failover_started:
            return

        from app.services.cluster.failover_monitor import get_failover_monitor
        from app.services.cluster.heartbeat_monitor import get_heartbeat_monitor

        await get_failover_monitor().stop()
        await get_heartbeat_monitor().stop()
        self._failover_started = False


async def main():
    """Main orchestrator loop"""
    orchestrator = ManagementOrchestrator()
    try:
        await orchestrator.start()
    except KeyboardInterrupt:
        logger.info("Orchestrator shutting down...")
        await orchestrator.stop()
    except asyncio.CancelledError:
        await orchestrator.stop()
        raise
    except Exception as e:
        logger.error(f"Orchestrator error: {e}", exc_info=True)
        await orchestrator.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
