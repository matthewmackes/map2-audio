"""
Cluster API Client - Async HTTP client for cluster management operations
Extends the main MAP2APIClient with cluster-specific endpoints.
"""

import asyncio
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime

try:
    import httpx
except ImportError:
    httpx = None

from .cluster_types import (
    NodeState,
    AssignmentRole,
    ClusterAPIResult,
    NodeStatus,
    NodeMetrics,
    NodeCapabilities,
    FlowAssignment,
    AssignmentRecommendation,
    AssignmentMatrix,
    FailoverEvent,
    FailoverHistory,
    FailoverState,
    ClusterHealthReport,
    ClusterEvent,
    EventType,
)

logger = logging.getLogger(__name__)


class ClusterAPIClient:
    """Async HTTP client for cluster management APIs."""
    
    def __init__(self, base_url: str = "http://localhost:8080", timeout: float = 10.0):
        """
        Initialize cluster API client.
        
        Args:
            base_url: Base URL of the backend API (default: localhost:8080)
            timeout: HTTP request timeout in seconds
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.session: Optional[httpx.AsyncClient] = None
    
    async def __aenter__(self):
        """Context manager entry."""
        await self.connect()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        await self.disconnect()
    
    async def connect(self) -> bool:
        """
        Establish HTTP session.
        
        Returns:
            True if connection successful, False otherwise
        """
        try:
            self.session = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                follow_redirects=True
            )
            return True
        except Exception as e:
            logger.error(f"Failed to create HTTP session: {e}")
            return False
    
    async def disconnect(self):
        """Close HTTP session."""
        if self.session:
            try:
                await self.session.aclose()
            except Exception as e:
                logger.error(f"Error closing HTTP session: {e}")
            finally:
                self.session = None
    
    def _ensure_session(self):
        """Ensure session is initialized."""
        if not self.session:
            raise RuntimeError("Not connected. Call connect() first.")
    
    # ========================================================================
    # NODE MANAGEMENT ENDPOINTS
    # ========================================================================
    
    async def get_nodes(self) -> ClusterAPIResult:
        """
        Get all cluster nodes.
        
        Returns:
            ClusterAPIResult with list of NodeStatus objects
        """
        try:
            self._ensure_session()
            response = await self.session.get("/api/cluster/nodes")
            
            if response.status_code == 200:
                data = response.json()
                nodes = [self._parse_node_status(n) for n in data.get("nodes", [])]
                return ClusterAPIResult(
                    success=True,
                    data=nodes,
                    timestamp=datetime.utcnow().isoformat()
                )
            else:
                return ClusterAPIResult(
                    success=False,
                    error=f"HTTP {response.status_code}: {response.text}",
                    timestamp=datetime.utcnow().isoformat()
                )
        except Exception as e:
            logger.error(f"Error fetching nodes: {e}")
            return ClusterAPIResult(
                success=False,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )
    
    async def get_node(self, node_id: str) -> ClusterAPIResult:
        """
        Get specific node details.
        
        Args:
            node_id: ID of the node to fetch
            
        Returns:
            ClusterAPIResult with NodeStatus object
        """
        try:
            self._ensure_session()
            response = await self.session.get(f"/api/cluster/nodes/{node_id}")
            
            if response.status_code == 200:
                node = self._parse_node_status(response.json())
                return ClusterAPIResult(
                    success=True,
                    data=node,
                    timestamp=datetime.utcnow().isoformat()
                )
            elif response.status_code == 404:
                return ClusterAPIResult(
                    success=False,
                    error=f"Node {node_id} not found",
                    error_code="NOT_FOUND",
                    timestamp=datetime.utcnow().isoformat()
                )
            else:
                return ClusterAPIResult(
                    success=False,
                    error=f"HTTP {response.status_code}: {response.text}",
                    timestamp=datetime.utcnow().isoformat()
                )
        except Exception as e:
            logger.error(f"Error fetching node {node_id}: {e}")
            return ClusterAPIResult(
                success=False,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )
    
    async def get_node_metrics(self, node_id: str) -> ClusterAPIResult:
        """
        Get real-time metrics for a node.
        
        Args:
            node_id: ID of the node
            
        Returns:
            ClusterAPIResult with NodeMetrics object
        """
        try:
            self._ensure_session()
            response = await self.session.get(f"/api/cluster/nodes/{node_id}/metrics")
            
            if response.status_code == 200:
                data = response.json()
                metrics = self._parse_metrics(data)
                return ClusterAPIResult(
                    success=True,
                    data=metrics,
                    timestamp=datetime.utcnow().isoformat()
                )
            else:
                return ClusterAPIResult(
                    success=False,
                    error=f"HTTP {response.status_code}: {response.text}",
                    timestamp=datetime.utcnow().isoformat()
                )
        except Exception as e:
            logger.error(f"Error fetching metrics for node {node_id}: {e}")
            return ClusterAPIResult(
                success=False,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )
    
    async def set_node_maintenance(self, node_id: str, enabled: bool) -> ClusterAPIResult:
        """
        Enable or disable maintenance mode on a node.
        
        Args:
            node_id: ID of the node
            enabled: True to enable maintenance, False to disable
            
        Returns:
            ClusterAPIResult with updated node status
        """
        try:
            self._ensure_session()
            payload = {"maintenance_enabled": enabled}
            response = await self.session.post(
                f"/api/cluster/nodes/{node_id}/maintenance",
                json=payload
            )
            
            if response.status_code == 200:
                node = self._parse_node_status(response.json())
                return ClusterAPIResult(
                    success=True,
                    data=node,
                    timestamp=datetime.utcnow().isoformat()
                )
            else:
                return ClusterAPIResult(
                    success=False,
                    error=f"HTTP {response.status_code}: {response.text}",
                    timestamp=datetime.utcnow().isoformat()
                )
        except Exception as e:
            logger.error(f"Error setting maintenance for node {node_id}: {e}")
            return ClusterAPIResult(
                success=False,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )
    
    # ========================================================================
    # FLOW ASSIGNMENT ENDPOINTS
    # ========================================================================
    
    async def get_flow_assignments(self) -> ClusterAPIResult:
        """
        Get all flow assignments.
        
        Returns:
            ClusterAPIResult with dict of flow_id -> FlowAssignment
        """
        try:
            self._ensure_session()
            response = await self.session.get("/api/cluster/flows/assignments")
            
            if response.status_code == 200:
                data = response.json()
                assignments = {
                    fid: self._parse_assignment(a)
                    for fid, a in data.get("assignments", {}).items()
                }
                return ClusterAPIResult(
                    success=True,
                    data=assignments,
                    timestamp=datetime.utcnow().isoformat()
                )
            else:
                return ClusterAPIResult(
                    success=False,
                    error=f"HTTP {response.status_code}: {response.text}",
                    timestamp=datetime.utcnow().isoformat()
                )
        except Exception as e:
            logger.error(f"Error fetching assignments: {e}")
            return ClusterAPIResult(
                success=False,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )
    
    async def get_assignment_matrix(self) -> ClusterAPIResult:
        """
        Get 2D assignment matrix (flows × nodes).
        
        Returns:
            ClusterAPIResult with AssignmentMatrix object
        """
        try:
            self._ensure_session()
            response = await self.session.get("/api/cluster/flows/assignment-matrix")
            
            if response.status_code == 200:
                data = response.json()
                matrix = AssignmentMatrix(
                    timestamp=data.get("timestamp", ""),
                    flows=data.get("flows", []),
                    nodes=data.get("nodes", []),
                    assignments=data.get("assignments", {})
                )
                return ClusterAPIResult(
                    success=True,
                    data=matrix,
                    timestamp=datetime.utcnow().isoformat()
                )
            else:
                return ClusterAPIResult(
                    success=False,
                    error=f"HTTP {response.status_code}: {response.text}",
                    timestamp=datetime.utcnow().isoformat()
                )
        except Exception as e:
            logger.error(f"Error fetching assignment matrix: {e}")
            return ClusterAPIResult(
                success=False,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )
    
    async def assign_flow(
        self,
        flow_id: str,
        chain_id: int,
        primary_node_id: str,
        standby_node_ids: Optional[List[str]] = None,
        redundancy_enabled: bool = False
    ) -> ClusterAPIResult:
        """
        Assign a flow to node(s).
        
        Args:
            flow_id: ID of the flow
            chain_id: Chain ID
            primary_node_id: Primary node for the flow
            standby_node_ids: Optional list of standby nodes
            redundancy_enabled: Enable redundancy
            
        Returns:
            ClusterAPIResult with FlowAssignment object
        """
        try:
            self._ensure_session()
            payload = {
                "flow_id": flow_id,
                "chain_id": chain_id,
                "primary_node_id": primary_node_id,
                "standby_node_ids": standby_node_ids or [],
                "redundancy_enabled": redundancy_enabled
            }
            response = await self.session.post(
                "/api/cluster/flows/assign",
                json=payload
            )
            
            if response.status_code in (200, 201):
                assignment = self._parse_assignment(response.json())
                return ClusterAPIResult(
                    success=True,
                    data=assignment,
                    timestamp=datetime.utcnow().isoformat()
                )
            else:
                return ClusterAPIResult(
                    success=False,
                    error=f"HTTP {response.status_code}: {response.text}",
                    timestamp=datetime.utcnow().isoformat()
                )
        except Exception as e:
            logger.error(f"Error assigning flow {flow_id}: {e}")
            return ClusterAPIResult(
                success=False,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )
    
    async def get_assignment_recommendations(
        self,
        flow_id: str,
        chain_id: int
    ) -> ClusterAPIResult:
        """
        Get AI recommendations for flow assignment.
        
        Args:
            flow_id: ID of the flow
            chain_id: Chain ID
            
        Returns:
            ClusterAPIResult with list of AssignmentRecommendation objects
        """
        try:
            self._ensure_session()
            params = {"flow_id": flow_id, "chain_id": chain_id}
            response = await self.session.get(
                "/api/cluster/flows/recommendations",
                params=params
            )
            
            if response.status_code == 200:
                data = response.json()
                recommendations = [
                    self._parse_recommendation(r)
                    for r in data.get("recommendations", [])
                ]
                return ClusterAPIResult(
                    success=True,
                    data=recommendations,
                    timestamp=datetime.utcnow().isoformat()
                )
            else:
                return ClusterAPIResult(
                    success=False,
                    error=f"HTTP {response.status_code}: {response.text}",
                    timestamp=datetime.utcnow().isoformat()
                )
        except Exception as e:
            logger.error(f"Error fetching recommendations: {e}")
            return ClusterAPIResult(
                success=False,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )
    
    # ========================================================================
    # FAILOVER MANAGEMENT
    # ========================================================================
    
    async def trigger_failover(
        self,
        flow_id: str,
        target_node_id: str,
        reason: str = "user_request"
    ) -> ClusterAPIResult:
        """
        Manually trigger failover for a flow.
        
        Args:
            flow_id: ID of the flow
            target_node_id: Target node to failover to
            reason: Reason for failover
            
        Returns:
            ClusterAPIResult with FailoverEvent object
        """
        try:
            self._ensure_session()
            payload = {
                "flow_id": flow_id,
                "target_node_id": target_node_id,
                "reason": reason
            }
            response = await self.session.post(
                "/api/cluster/flows/failover",
                json=payload
            )
            
            if response.status_code in (200, 201):
                event = self._parse_failover_event(response.json())
                return ClusterAPIResult(
                    success=True,
                    data=event,
                    timestamp=datetime.utcnow().isoformat()
                )
            else:
                return ClusterAPIResult(
                    success=False,
                    error=f"HTTP {response.status_code}: {response.text}",
                    timestamp=datetime.utcnow().isoformat()
                )
        except Exception as e:
            logger.error(f"Error triggering failover for flow {flow_id}: {e}")
            return ClusterAPIResult(
                success=False,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )
    
    async def get_failover_history(self, flow_id: str) -> ClusterAPIResult:
        """
        Get failover history for a flow.
        
        Args:
            flow_id: ID of the flow
            
        Returns:
            ClusterAPIResult with FailoverHistory object
        """
        try:
            self._ensure_session()
            response = await self.session.get(f"/api/cluster/flows/{flow_id}/failover-history")
            
            if response.status_code == 200:
                data = response.json()
                history = FailoverHistory(
                    flow_id=flow_id,
                    events=[
                        self._parse_failover_event(e)
                        for e in data.get("events", [])
                    ],
                    total_failovers=data.get("total_failovers", 0),
                    last_failover=self._parse_failover_event(data["last_failover"])
                    if data.get("last_failover") else None,
                    mtbf_hours=data.get("mtbf_hours")
                )
                return ClusterAPIResult(
                    success=True,
                    data=history,
                    timestamp=datetime.utcnow().isoformat()
                )
            else:
                return ClusterAPIResult(
                    success=False,
                    error=f"HTTP {response.status_code}: {response.text}",
                    timestamp=datetime.utcnow().isoformat()
                )
        except Exception as e:
            logger.error(f"Error fetching failover history for {flow_id}: {e}")
            return ClusterAPIResult(
                success=False,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )
    
    # ========================================================================
    # CLUSTER DIAGNOSTICS
    # ========================================================================
    
    async def get_cluster_health(self) -> ClusterAPIResult:
        """
        Get overall cluster health report.
        
        Returns:
            ClusterAPIResult with ClusterHealthReport object
        """
        try:
            self._ensure_session()
            response = await self.session.get("/api/cluster/health")
            
            if response.status_code == 200:
                data = response.json()
                health = self._parse_health_report(data)
                return ClusterAPIResult(
                    success=True,
                    data=health,
                    timestamp=datetime.utcnow().isoformat()
                )
            else:
                return ClusterAPIResult(
                    success=False,
                    error=f"HTTP {response.status_code}: {response.text}",
                    timestamp=datetime.utcnow().isoformat()
                )
        except Exception as e:
            logger.error(f"Error fetching cluster health: {e}")
            return ClusterAPIResult(
                success=False,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )
    
    async def get_cluster_events(
        self,
        limit: int = 100,
        offset: int = 0,
        event_type: Optional[str] = None
    ) -> ClusterAPIResult:
        """
        Get cluster events.
        
        Args:
            limit: Maximum number of events to return
            offset: Offset for pagination
            event_type: Optional filter by event type
            
        Returns:
            ClusterAPIResult with list of ClusterEvent objects
        """
        try:
            self._ensure_session()
            params = {"limit": limit, "offset": offset}
            if event_type:
                params["event_type"] = event_type
            
            response = await self.session.get("/api/cluster/events", params=params)
            
            if response.status_code == 200:
                data = response.json()
                events = [
                    self._parse_event(e)
                    for e in data.get("events", [])
                ]
                return ClusterAPIResult(
                    success=True,
                    data=events,
                    timestamp=datetime.utcnow().isoformat()
                )
            else:
                return ClusterAPIResult(
                    success=False,
                    error=f"HTTP {response.status_code}: {response.text}",
                    timestamp=datetime.utcnow().isoformat()
                )
        except Exception as e:
            logger.error(f"Error fetching cluster events: {e}")
            return ClusterAPIResult(
                success=False,
                error=str(e),
                timestamp=datetime.utcnow().isoformat()
            )
    
    # ========================================================================
    # Parsing Helpers
    # ========================================================================
    
    @staticmethod
    def _parse_node_status(data: Dict) -> NodeStatus:
        """Parse NodeStatus from API response."""
        return NodeStatus(
            node_id=data.get("node_id", ""),
            hostname=data.get("hostname", ""),
            status=NodeState(data.get("status", "OFFLINE")),
            ip_address=data.get("ip_address", ""),
            port=data.get("port", 8080),
            is_responsive=data.get("is_responsive", False),
            response_time_ms=data.get("response_time_ms", 0.0),
            metrics=ClusterAPIClient._parse_metrics(data.get("metrics", {})),
            capabilities=ClusterAPIClient._parse_capabilities(data.get("capabilities", {})),
            active_flow_ids=data.get("active_flow_ids", []),
            active_flow_count=data.get("active_flow_count", 0),
            last_seen=data.get("last_seen", ""),
            connected_since=data.get("connected_since", ""),
            warning_level=data.get("warning_level", 0),
            last_error=data.get("last_error")
        )
    
    @staticmethod
    def _parse_metrics(data: Dict) -> NodeMetrics:
        """Parse NodeMetrics from API response."""
        return NodeMetrics(
            cpu_percent=data.get("cpu_percent", 0.0),
            memory_percent=data.get("memory_percent", 0.0),
            memory_mb=data.get("memory_mb", 0.0),
            memory_max_mb=data.get("memory_max_mb", 0.0),
            disk_percent=data.get("disk_percent", 0.0),
            gpu_percent=data.get("gpu_percent"),
            gpu_memory_percent=data.get("gpu_memory_percent"),
            temperature_c=data.get("temperature_c"),
            uptime_seconds=data.get("uptime_seconds", 0),
            last_update=data.get("last_update", "")
        )
    
    @staticmethod
    def _parse_capabilities(data: Dict) -> NodeCapabilities:
        """Parse NodeCapabilities from API response."""
        return NodeCapabilities(
            supports_gpu=data.get("supports_gpu", False),
            gpu_memory_gb=data.get("gpu_memory_gb"),
            max_chains=data.get("max_chains", 10),
            audio_inputs=data.get("audio_inputs", 2),
            audio_outputs=data.get("audio_outputs", 2),
            sample_rates=data.get("sample_rates", [44100, 48000, 96000]),
            buffer_sizes=data.get("buffer_sizes", [64, 128, 256, 512])
        )
    
    @staticmethod
    def _parse_assignment(data: Dict) -> FlowAssignment:
        """Parse FlowAssignment from API response."""
        return FlowAssignment(
            flow_id=data.get("flow_id", ""),
            chain_id=data.get("chain_id", 0),
            primary_node_id=data.get("primary_node_id", ""),
            standby_node_ids=data.get("standby_node_ids", []),
            redundancy_enabled=data.get("redundancy_enabled", False),
            redundancy_mode=data.get("redundancy_mode", "hot-standby"),
            is_active=data.get("is_active", False),
            is_healthy=data.get("is_healthy", True),
            cpu_usage_percent=data.get("cpu_usage_percent", 0.0),
            memory_usage_mb=data.get("memory_usage_mb", 0.0),
            latency_ms=data.get("latency_ms", 0.0),
            assigned_at=data.get("assigned_at", ""),
            last_verified=data.get("last_verified", "")
        )
    
    @staticmethod
    def _parse_recommendation(data: Dict) -> AssignmentRecommendation:
        """Parse AssignmentRecommendation from API response."""
        return AssignmentRecommendation(
            flow_id=data.get("flow_id", ""),
            chain_id=data.get("chain_id", 0),
            recommended_node_id=data.get("recommended_node_id", ""),
            confidence=data.get("confidence", 0.0),
            reason=data.get("reason", ""),
            alternatives=data.get("alternatives", []),
            matches_requirements=data.get("matches_requirements", False),
            available_resources=data.get("available_resources", {}),
            estimated_cpu=data.get("estimated_cpu", 0.0),
            estimated_memory_mb=data.get("estimated_memory_mb", 0.0)
        )
    
    @staticmethod
    def _parse_failover_event(data: Dict) -> FailoverEvent:
        """Parse FailoverEvent from API response."""
        return FailoverEvent(
            event_id=data.get("event_id", ""),
            flow_id=data.get("flow_id", ""),
            chain_id=data.get("chain_id", 0),
            from_node_id=data.get("from_node_id", ""),
            to_node_id=data.get("to_node_id", ""),
            triggered_at=data.get("triggered_at", ""),
            completed_at=data.get("completed_at"),
            state=FailoverState(data.get("state", "triggered")),
            is_successful=data.get("is_successful", False),
            error_message=data.get("error_message"),
            trigger_reason=data.get("trigger_reason", ""),
            duration_ms=data.get("duration_ms")
        )
    
    @staticmethod
    def _parse_health_report(data: Dict) -> ClusterHealthReport:
        """Parse ClusterHealthReport from API response."""
        return ClusterHealthReport(
            timestamp=data.get("timestamp", ""),
            overall_health=data.get("overall_health", 100),
            nodes_online=data.get("nodes_online", 0),
            nodes_offline=data.get("nodes_offline", 0),
            nodes_degraded=data.get("nodes_degraded", 0),
            nodes_maintenance=data.get("nodes_maintenance", 0),
            avg_cpu_percent=data.get("avg_cpu_percent", 0.0),
            avg_memory_percent=data.get("avg_memory_percent", 0.0),
            avg_latency_ms=data.get("avg_latency_ms", 0.0),
            critical_issues=data.get("critical_issues", []),
            warnings=data.get("warnings", []),
            total_cpu_capacity=data.get("total_cpu_capacity", 100.0),
            used_cpu_percent=data.get("used_cpu_percent", 0.0),
            total_memory_gb=data.get("total_memory_gb", 0.0),
            used_memory_gb=data.get("used_memory_gb", 0.0)
        )
    
    @staticmethod
    def _parse_event(data: Dict) -> ClusterEvent:
        """Parse ClusterEvent from API response."""
        return ClusterEvent(
            event_id=data.get("event_id", ""),
            event_type=EventType(data.get("event_type", "error")),
            timestamp=data.get("timestamp", ""),
            node_id=data.get("node_id"),
            flow_id=data.get("flow_id"),
            chain_id=data.get("chain_id"),
            message=data.get("message", ""),
            severity=data.get("severity", "info"),
            metadata=data.get("metadata", {})
        )
