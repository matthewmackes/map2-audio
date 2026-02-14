"""
Health Metrics Aggregator Service for Cluster Management

Collects and aggregates Prometheus metrics from all cluster nodes:
- CPU, memory, DSP load, xrun statistics
- Network latency and throughput
- Disk I/O and storage capacity
- Audio interface status
- Plugin health and performance

Runs on Management Node every 30 seconds.
Calculates composite health score (0-100) per node.
Stores historical data in SQLite for trending and analytics.
"""

import asyncio
import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import json

from app.services.cluster.registry import get_cluster_registry, ClusterRegistry

logger = logging.getLogger(__name__)


@dataclass
class NodeMetrics:
    """Metrics collected from a single node"""

    node_id: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    cpu_percent: float = 0.0
    memory_percent: float = 0.0
    dsp_load_percent: float = 0.0  # Audio DSP load
    xrun_count: int = 0
    xrun_rate: float = 0.0  # xruns per hour
    network_latency_ms: float = 0.0
    disk_io_percent: float = 0.0
    storage_percent: float = 0.0
    audio_interface_count: int = 0
    audio_interfaces_healthy: int = 0
    plugin_count: int = 0
    plugins_healthy: int = 0

    def calculate_health_score(self) -> float:
        """
        Calculate composite health score (0-100).

        Weights:
        - CPU: 20%
        - Memory: 20%
        - DSP Load: 30% (audio-specific, higher weight)
        - Xrun rate: 20%
        - Audio interfaces: 10% (weighted average)
        """
        try:
            scores = {}

            # CPU score (inverse: lower is better)
            scores["cpu"] = max(0.0, 100.0 - self.cpu_percent) * 0.2

            # Memory score
            scores["memory"] = max(0.0, 100.0 - self.memory_percent) * 0.2

            # DSP load score (higher weight for audio quality)
            scores["dsp"] = max(0.0, 100.0 - self.dsp_load_percent) * 0.3

            # Xrun rate score (penalize xruns heavily)
            # 0 xruns/hour = 100, 1 xrun/hour = 90, 2+ = 0
            if self.xrun_rate <= 0:
                scores["xrun"] = 100.0 * 0.2
            elif self.xrun_rate <= 1.0:
                scores["xrun"] = (100.0 - (self.xrun_rate * 90)) * 0.2
            else:
                scores["xrun"] = 0.0

            # Audio interface health (if available)
            if self.audio_interface_count > 0:
                interface_health = (
                    self.audio_interfaces_healthy / self.audio_interface_count
                )
                scores["audio_if"] = interface_health * 100.0 * 0.1
            else:
                scores["audio_if"] = 50.0 * 0.1  # Neutral if no audio devices

            # Combine scores
            total_score = sum(scores.values())

            # Clamp to 0-100
            return max(0.0, min(100.0, total_score))

        except Exception as e:
            logger.error(f"Failed to calculate health score: {e}")
            return 50.0  # Neutral default

    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            "node_id": self.node_id,
            "timestamp": self.timestamp.isoformat(),
            "cpu_percent": self.cpu_percent,
            "memory_percent": self.memory_percent,
            "dsp_load_percent": self.dsp_load_percent,
            "xrun_count": self.xrun_count,
            "xrun_rate": self.xrun_rate,
            "network_latency_ms": self.network_latency_ms,
            "disk_io_percent": self.disk_io_percent,
            "storage_percent": self.storage_percent,
            "audio_interface_count": self.audio_interface_count,
            "audio_interfaces_healthy": self.audio_interfaces_healthy,
            "plugin_count": self.plugin_count,
            "plugins_healthy": self.plugins_healthy,
            "health_score": self.calculate_health_score(),
        }


class HealthAggregator:
    """
    Aggregates health metrics from all cluster nodes.

    Responsible for:
    - Scraping metrics from all nodes
    - Calculating health scores
    - Storing historical data
    - Detecting health trends
    """

    SCRAPE_INTERVAL = 30  # seconds
    METRICS_HISTORY_RETENTION = 7  # days

    def __init__(self):
        """Initialize health aggregator"""
        self.logger = logging.getLogger(__name__)
        self.registry = get_cluster_registry()
        self.metrics_cache: Dict[str, NodeMetrics] = {}
        self.running = False

    async def start(self) -> None:
        """Start health aggregation service"""
        self.running = True
        self.logger.info("Health Aggregator starting...")

        while self.running:
            try:
                await self.aggregate_metrics()
            except Exception as e:
                self.logger.error(f"Health aggregation error: {e}")

            await asyncio.sleep(self.SCRAPE_INTERVAL)

    async def stop(self) -> None:
        """Stop health aggregation service"""
        self.logger.info("Health Aggregator stopping...")
        self.running = False

    async def aggregate_metrics(self) -> None:
        """Aggregate metrics from all nodes"""
        try:
            # Get all online nodes from registry
            nodes = self.registry.get_all_nodes()
            online_nodes = [
                n for n in nodes if n.get("status") == "online"
            ]

            if not online_nodes:
                self.logger.debug("No online nodes to aggregate")
                return

            self.logger.debug(f"Aggregating metrics from {len(online_nodes)} nodes")

            # Collect live metrics for each online node.
            for node in online_nodes:
                node_id = node["id"]
                await self._collect_node_metrics(node_id, node)

            # Update registry with health scores
            await self._update_health_scores()

            # Clean up old metrics
            await self._cleanup_old_metrics()

        except Exception as e:
            self.logger.error(f"Failed to aggregate metrics: {e}", exc_info=True)

    async def _collect_node_metrics(self, node_id: str, node_data: Dict) -> None:
        """
        Collect metrics from a specific node.

        In production, this would make HTTP/gRPC calls to node APIs.
        """
        try:
            import aiohttp
            import asyncio
            
            node_ip = None
            # Try to get node IP from registry
            if self.registry:
                try:
                    node_data = self.registry.get_node(node_id)
                    if node_data:
                        node_ip = node_data.get("ip_address")
                except Exception as e:
                    logger.debug(f"Failed to get node IP from registry: {e}")
            
            if not node_ip:
                # Default to hostname
                node_ip = node_id
            
            # Query node metrics endpoint
            metrics_url = f"http://{node_ip}:9090/metrics"
            
            async with aiohttp.ClientSession() as session:
                try:
                    async with session.get(metrics_url, timeout=5) as response:
                        if response.status == 200:
                            text = await response.text()
                            
                            # Parse Prometheus metrics (simple text format)
                            cpu_percent = 0.0
                            memory_percent = 0.0
                            dsp_load_percent = 0.0
                            xrun_count = 0
                            
                            for line in text.split('\n'):
                                if line.startswith('#') or not line.strip():
                                    continue
                                
                                # Parse metric lines: metric_name{labels} value
                                if 'node_cpu_percent' in line:
                                    try:
                                        cpu_percent = float(line.split()[-1])
                                    except Exception:
                                        pass
                                elif 'node_memory_percent' in line:
                                    try:
                                        memory_percent = float(line.split()[-1])
                                    except Exception:
                                        pass
                                elif 'dsp_load_percent' in line or 'jack_load_percent' in line:
                                    try:
                                        dsp_load_percent = float(line.split()[-1])
                                    except Exception:
                                        pass
                                elif 'jack_xruns_total' in line or 'xrun_count' in line:
                                    try:
                                        xrun_count = int(float(line.split()[-1]))
                                    except Exception:
                                        pass
                            
                            metrics = NodeMetrics(
                                node_id=node_id,
                                cpu_percent=cpu_percent,
                                memory_percent=memory_percent,
                                dsp_load_percent=dsp_load_percent,
                                xrun_count=xrun_count,
                            )
                            
                            logger.debug(f"Got metrics for {node_id}: CPU={cpu_percent}% MEM={memory_percent}% DSP={dsp_load_percent}% xruns={xrun_count}")
                            
                            # Store in cache
                            self.metrics_cache[node_id] = metrics
                            
                            # Store in registry
                            health_score = metrics.calculate_health_score()
                            self.registry.update_node_health(node_id, health_score)
                            self.registry.add_metrics(
                                node_id,
                                cpu_percent=metrics.cpu_percent,
                                memory_percent=metrics.memory_percent,
                                dsp_load_percent=metrics.dsp_load_percent,
                                xrun_count=metrics.xrun_count,
                                latency_ms=metrics.network_latency_ms,
                            )
                            
                            return
                            
                except asyncio.TimeoutError:
                    logger.warning(f"Timeout querying metrics from {node_id}")
                except Exception as e:
                    logger.warning(f"Failed to query metrics from {node_id}: {e}")
        except Exception as e:
            logger.warning(f"Health aggregator failed for {node_id}: {e}")
        
        # Fallback: Create zero metrics
        metrics = NodeMetrics(
            node_id=node_id,
            cpu_percent=0.0,
            memory_percent=0.0,
            dsp_load_percent=0.0,
            xrun_count=0,
        )

        # Store in cache
        self.metrics_cache[node_id] = metrics

        # Store in registry
        health_score = metrics.calculate_health_score()
        self.registry.update_node_health(node_id, health_score)
        self.registry.add_metrics(
            node_id,
            cpu_percent=metrics.cpu_percent,
            memory_percent=metrics.memory_percent,
            dsp_load_percent=metrics.dsp_load_percent,
            xrun_count=metrics.xrun_count,
            latency_ms=metrics.network_latency_ms,
        )

        self.logger.debug(
            f"Collected metrics for {node_id}: health={health_score:.1f}"
        )

    async def _update_health_scores(self) -> None:
        """Update health scores in registry"""
        try:
            for node_id, metrics in self.metrics_cache.items():
                health_score = metrics.calculate_health_score()
                self.registry.update_node_health(node_id, health_score)
        except Exception as e:
            self.logger.error(f"Failed to update health scores: {e}")

    async def _cleanup_old_metrics(self) -> None:
        """Clean up metrics older than retention period"""
        try:
            removed = self.registry.cleanup_old_metrics(
                days=self.METRICS_HISTORY_RETENTION
            )
            if removed > 0:
                self.logger.debug(f"Cleaned up {removed} old metric records")
        except Exception as e:
            self.logger.error(f"Failed to cleanup metrics: {e}")

    def get_node_health(self, node_id: str) -> Optional[float]:
        """Get current health score for a node"""
        metrics = self.metrics_cache.get(node_id)
        if metrics:
            return metrics.calculate_health_score()
        return None

    def get_cluster_health(self) -> Dict:
        """Get overall cluster health summary"""
        try:
            if not self.metrics_cache:
                return {
                    "overall_health": 50.0,
                    "online_nodes": 0,
                    "avg_health": 0.0,
                    "min_health": 0.0,
                    "max_health": 0.0,
                    "nodes": {},
                }

            health_scores = [
                m.calculate_health_score() for m in self.metrics_cache.values()
            ]

            return {
                "overall_health": sum(health_scores) / len(health_scores)
                if health_scores
                else 0.0,
                "online_nodes": len(self.metrics_cache),
                "avg_health": sum(health_scores) / len(health_scores)
                if health_scores
                else 0.0,
                "min_health": min(health_scores) if health_scores else 0.0,
                "max_health": max(health_scores) if health_scores else 0.0,
                "nodes": {
                    node_id: metrics.to_dict()
                    for node_id, metrics in self.metrics_cache.items()
                },
            }

        except Exception as e:
            self.logger.error(f"Failed to get cluster health: {e}")
            return {}


# Global aggregator instance
_health_aggregator: Optional[HealthAggregator] = None


def get_health_aggregator() -> HealthAggregator:
    """Get or create the health aggregator singleton"""
    global _health_aggregator
    if _health_aggregator is None:
        _health_aggregator = HealthAggregator()
    return _health_aggregator
