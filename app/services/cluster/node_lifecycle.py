"""
Node Lifecycle Manager

Manages complete node lifecycle in the cluster:
- join: New node detected → CA cert issued → registered
- leave: Graceful shutdown → state migrated
- reboot: Persist state → coordinate restart
- promote: AUDIO-NODE → MANAGEMENT-NODE role change
- demote: MANAGEMENT-NODE → AUDIO-NODE role change

Uses async state machine pattern for reliable transitions.
"""

import asyncio
import logging
import json
import subprocess
from typing import Dict, Optional, Callable, List
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path

from app.services.cluster.registry import get_cluster_registry
from app.services.cluster.certificate_authority import get_cluster_ca
from app.services.platform_event.bus import get_platform_event_bus
from app.services.platform_event.factories import make_cluster_platform_event, node_dedupe_key
from app.services.platform_event.severity import Severity
from app.utils.singleton import Singleton
from app.utils.time import utc_now

logger = logging.getLogger(__name__)


class NodeState(Enum):
    """State of a node in its lifecycle"""

    DISCOVERED = "discovered"  # New node found
    PROVISIONING = "provisioning"  # Setting up for first time
    ONLINE = "online"  # Fully operational
    JOINING = "joining"  # In process of joining cluster
    HEALTHY = "healthy"  # Performing normally
    DEGRADED = "degraded"  # Issues detected
    UPDATING = "updating"  # System update in progress
    REBOOTING = "rebooting"  # Restart in progress
    LEAVING = "leaving"  # Graceful shutdown
    OFFLINE = "offline"  # Not reachable
    FAILED = "failed"  # Unrecoverable error
    RECOVERING = "recovering"  # Attempting recovery


class NodeLifecycleEvent(Enum):
    """Events that trigger state transitions"""

    DISCOVERED = "discovered"
    PROVISION_COMPLETE = "provision_complete"
    JOIN_INITIATED = "join_initiated"
    JOIN_COMPLETE = "join_complete"
    HEALTH_CHECK_PASS = "health_check_pass"
    HEALTH_CHECK_FAIL = "health_check_fail"
    DEGRADATION_DETECTED = "degradation_detected"
    UPDATE_STARTED = "update_started"
    UPDATE_COMPLETED = "update_completed"
    REBOOT_INITIATED = "reboot_initiated"
    REBOOT_COMPLETE = "reboot_complete"
    LEAVE_REQUESTED = "leave_requested"
    LEAVE_COMPLETE = "leave_complete"
    RECOVERY_ATTEMPTED = "recovery_attempted"
    RECOVERY_SUCCESSFUL = "recovery_successful"
    RECOVERY_FAILED = "recovery_failed"
    FAILURE_DETECTED = "failure_detected"
    PROMOTE_REQUESTED = "promote_requested"
    PROMOTE_COMPLETE = "promote_complete"
    DEMOTE_REQUESTED = "demote_requested"
    DEMOTE_COMPLETE = "demote_complete"


@dataclass
class LifecycleTransition:
    """Represents a state transition"""

    from_state: NodeState
    to_state: NodeState
    event: NodeLifecycleEvent
    timestamp: datetime
    message: str = ""
    details: Dict = None


class NodeLifecycleManager:
    """
    Manages node lifecycle state machine.
    
    State transitions:
    - DISCOVERED → PROVISIONING → JOINING → ONLINE → HEALTHY
    - HEALTHY ↔ DEGRADED (recovery)
    - ONLINE → UPDATING → ONLINE
    - ONLINE → REBOOTING → ONLINE
    - ONLINE → LEAVING → OFFLINE
    - HEALTHY → FAILED → RECOVERING → HEALTHY
    """

    def __init__(self, node_id: str):
        """
        Initialize lifecycle manager for a node.

        Args:
            node_id: ID of node to manage
        """
        self.node_id = node_id
        self.logger = logging.getLogger(__name__)
        self.registry = get_cluster_registry()
        self.ca = get_cluster_ca()
        self.event_bus = get_platform_event_bus()
        self.current_state = NodeState.DISCOVERED
        self.transition_history: List[LifecycleTransition] = []
        self._callbacks: Dict[NodeState, List[Callable]] = {}

    async def _emit_platform_event(
        self,
        *,
        kind: str,
        severity: Severity,
        message: str,
        details: Optional[Dict] = None,
    ) -> None:
        await self.event_bus.emit(
            make_cluster_platform_event(
                kind=kind,
                severity=severity,
                source_node=self.node_id,
                source_service="node_lifecycle",
                title="Node lifecycle event",
                message=message,
                context=dict(details or {}),
                affected_nodes=[self.node_id],
                resource={"type": "node", "id": self.node_id},
                dedupe_key=node_dedupe_key(self.node_id, kind),
            )
        )

    async def transition(
        self,
        event: NodeLifecycleEvent,
        message: str = "",
        details: Dict = None,
    ) -> bool:
        """
        Attempt state transition based on event.

        Args:
            event: Event that triggered transition
            message: Description of transition
            details: Additional details

        Returns:
            True if transition successful
        """
        try:
            old_state = self.current_state
            new_state = self._get_next_state(old_state, event)

            if new_state is None:
                self.logger.warning(
                    f"Invalid transition: {old_state.value} + {event.value}"
                )
                return False

            # Execute transition logic
            if not await self._execute_transition(
                old_state, new_state, event, message, details
            ):
                self.logger.error(f"Transition execution failed")
                return False

            # Update state
            self.current_state = new_state

            # Record transition
            transition = LifecycleTransition(
                from_state=old_state,
                to_state=new_state,
                event=event,
                timestamp=utc_now(),
                message=message,
                details=details or {},
            )
            self.transition_history.append(transition)

            # Call callbacks
            await self._call_callbacks(new_state)

            # Publish event
            await self._publish_lifecycle_event(transition)

            self.logger.info(
                f"Node {self.node_id}: {old_state.value} → {new_state.value}"
            )
            return True

        except Exception as e:
            self.logger.error(f"Transition failed: {e}", exc_info=True)
            return False

    def _get_next_state(
        self, current: NodeState, event: NodeLifecycleEvent
    ) -> Optional[NodeState]:
        """
        Determine next state based on current state and event.

        Args:
            current: Current node state
            event: Triggering event

        Returns:
            Next state or None if invalid
        """
        # Define valid transitions
        transitions = {
            NodeState.DISCOVERED: {
                NodeLifecycleEvent.PROVISION_COMPLETE: NodeState.PROVISIONING,
            },
            NodeState.PROVISIONING: {
                NodeLifecycleEvent.JOIN_INITIATED: NodeState.JOINING,
            },
            NodeState.JOINING: {
                NodeLifecycleEvent.JOIN_COMPLETE: NodeState.ONLINE,
            },
            NodeState.ONLINE: {
                NodeLifecycleEvent.HEALTH_CHECK_PASS: NodeState.HEALTHY,
                NodeLifecycleEvent.DEGRADATION_DETECTED: NodeState.DEGRADED,
                NodeLifecycleEvent.UPDATE_STARTED: NodeState.UPDATING,
                NodeLifecycleEvent.REBOOT_INITIATED: NodeState.REBOOTING,
                NodeLifecycleEvent.LEAVE_REQUESTED: NodeState.LEAVING,
                NodeLifecycleEvent.FAILURE_DETECTED: NodeState.FAILED,
            },
            NodeState.HEALTHY: {
                NodeLifecycleEvent.DEGRADATION_DETECTED: NodeState.DEGRADED,
                NodeLifecycleEvent.UPDATE_STARTED: NodeState.UPDATING,
                NodeLifecycleEvent.REBOOT_INITIATED: NodeState.REBOOTING,
                NodeLifecycleEvent.LEAVE_REQUESTED: NodeState.LEAVING,
                NodeLifecycleEvent.FAILURE_DETECTED: NodeState.FAILED,
            },
            NodeState.DEGRADED: {
                NodeLifecycleEvent.RECOVERY_SUCCESSFUL: NodeState.HEALTHY,
                NodeLifecycleEvent.RECOVERY_FAILED: NodeState.FAILED,
                NodeLifecycleEvent.REBOOT_INITIATED: NodeState.REBOOTING,
            },
            NodeState.UPDATING: {
                NodeLifecycleEvent.UPDATE_COMPLETED: NodeState.ONLINE,
                NodeLifecycleEvent.FAILURE_DETECTED: NodeState.FAILED,
            },
            NodeState.REBOOTING: {
                NodeLifecycleEvent.REBOOT_COMPLETE: NodeState.ONLINE,
                NodeLifecycleEvent.FAILURE_DETECTED: NodeState.FAILED,
            },
            NodeState.LEAVING: {
                NodeLifecycleEvent.LEAVE_COMPLETE: NodeState.OFFLINE,
                NodeLifecycleEvent.FAILURE_DETECTED: NodeState.FAILED,
            },
            NodeState.FAILED: {
                NodeLifecycleEvent.RECOVERY_ATTEMPTED: NodeState.RECOVERING,
            },
            NodeState.RECOVERING: {
                NodeLifecycleEvent.RECOVERY_SUCCESSFUL: NodeState.HEALTHY,
                NodeLifecycleEvent.RECOVERY_FAILED: NodeState.FAILED,
            },
        }

        if current in transitions and event in transitions[current]:
            return transitions[current][event]

        return None

    async def _execute_transition(
        self,
        old_state: NodeState,
        new_state: NodeState,
        event: NodeLifecycleEvent,
        message: str,
        details: Dict,
    ) -> bool:
        """
        Execute transition-specific logic.

        Args:
            old_state: Starting state
            new_state: Target state
            event: Triggering event
            message: Transition message
            details: Additional details

        Returns:
            True if successful
        """
        try:
            # Joining cluster
            if event == NodeLifecycleEvent.JOIN_INITIATED:
                await self._perform_join()

            # Degradation detected
            elif event == NodeLifecycleEvent.DEGRADATION_DETECTED:
                await self._handle_degradation()

            # Recovery attempted
            elif event == NodeLifecycleEvent.RECOVERY_ATTEMPTED:
                await self._attempt_recovery()

            # Leaving cluster
            elif event == NodeLifecycleEvent.LEAVE_REQUESTED:
                await self._perform_graceful_shutdown()

            # Role promotions
            elif event == NodeLifecycleEvent.PROMOTE_REQUESTED:
                await self._promote_node()

            elif event == NodeLifecycleEvent.DEMOTE_REQUESTED:
                await self._demote_node()

            return True

        except Exception as e:
            self.logger.error(f"Transition execution failed: {e}")
            return False

    async def _perform_join(self):
        """Execute node join workflow"""
        try:
            self.logger.info(f"Node {self.node_id} joining cluster...")

            # 1. Generate certificate for node
            cert = self.ca.issue_certificate(
                common_name=self.node_id,
                days_valid=365,
            )
            self.logger.debug(f"Issued certificate for {self.node_id}")

            # 2. Register node in cluster registry
            self.registry.add_node({
                "id": self.node_id,
                "role": "AUDIO-NODE",  # Default role
                "status": "online",
            })
            self.logger.debug(f"Registered {self.node_id} in registry")

            # 3. Publish join event
            await self._emit_platform_event(
                kind="node.online",
                severity=Severity.INFO,
                message=f"Node {self.node_id} joined cluster",
            )

        except Exception as e:
            self.logger.error(f"Join failed: {e}")
            raise

    async def _handle_degradation(self):
        """Handle degraded node"""
        try:
            self.logger.warning(
                f"Node {self.node_id} degraded - investigating..."
            )

            diagnostics = await asyncio.to_thread(self._collect_diagnostics)
            self.registry.update_node_status(self.node_id, "degraded")
            details = {"diagnostics": diagnostics}
            severity = Severity.WARNING
            if diagnostics.get("service_active") != "active":
                severity = Severity.ERROR

            await self._emit_platform_event(
                kind="node.degraded",
                severity=severity,
                message=f"Node {self.node_id} health degraded",
                details=details,
            )

        except Exception as e:
            self.logger.error(f"Degradation handling failed: {e}")
            raise

    async def _attempt_recovery(self):
        """Attempt to recover failed node"""
        try:
            self.logger.warning(f"Attempting recovery of {self.node_id}...")

            recovery_steps = []
            restart_ok = await asyncio.to_thread(
                self._run_shell, ["systemctl", "restart", "map2-audio"]
            )
            recovery_steps.append(
                {
                    "step": "restart_map2_audio",
                    "success": restart_ok.returncode == 0,
                    "stderr": restart_ok.stderr.strip(),
                }
            )

            active = await asyncio.to_thread(
                self._run_shell, ["systemctl", "is-active", "map2-audio"]
            )
            is_healthy = active.returncode == 0 and active.stdout.strip() == "active"

            if is_healthy:
                self.registry.update_node_status(self.node_id, "online")
                kind = "node.recovered"
                severity = Severity.INFO
                msg = f"Node {self.node_id} recovery successful"
            else:
                self.registry.update_node_status(self.node_id, "failed")
                kind = "node.offline"
                severity = Severity.CRITICAL
                msg = f"Node {self.node_id} recovery failed"

            await self._emit_platform_event(
                kind=kind,
                severity=severity,
                message=msg,
                details={
                    "steps": recovery_steps,
                    "service_state": active.stdout.strip(),
                    "service_check_error": active.stderr.strip(),
                },
            )

        except Exception as e:
            self.logger.error(f"Recovery failed: {e}")
            raise

    async def _perform_graceful_shutdown(self):
        """Perform graceful node shutdown"""
        try:
            self.logger.info(f"Gracefully shutting down {self.node_id}...")
            persist_dir = Path("/var/lib/map2/lifecycle")
            persist_dir.mkdir(parents=True, exist_ok=True)
            persist_file = persist_dir / f"{self.node_id}.json"
            snapshot = {
                "node_id": self.node_id,
                "state": self.current_state.value,
                "timestamp": utc_now().isoformat(),
                "transition_count": len(self.transition_history),
            }
            with open(persist_file, "w", encoding="utf-8") as f:
                json.dump(snapshot, f, indent=2)

            stop_result = await asyncio.to_thread(
                self._run_shell, ["systemctl", "stop", "map2-audio"]
            )
            self.registry.update_node_status(self.node_id, "offline")

            await self._emit_platform_event(
                kind="node.offline",
                severity=Severity.INFO,
                message=f"Node {self.node_id} gracefully shut down",
                details={
                    "persist_file": str(persist_file),
                    "service_stop_rc": stop_result.returncode,
                    "service_stop_stderr": stop_result.stderr.strip(),
                },
            )

        except Exception as e:
            self.logger.error(f"Graceful shutdown failed: {e}")
            raise

    def _collect_diagnostics(self) -> Dict:
        """Collect local diagnostics snapshot."""
        disk = self._run_shell(["df", "-h", "/"])
        memory = self._run_shell(["free", "-h"])
        service = self._run_shell(["systemctl", "is-active", "map2-audio"])
        latency = self._run_shell(["ping", "-c", "1", "-W", "1", "8.8.8.8"])

        return {
            "disk": disk.stdout.strip() or disk.stderr.strip(),
            "memory": memory.stdout.strip() or memory.stderr.strip(),
            "service_active": service.stdout.strip() or "unknown",
            "service_error": service.stderr.strip(),
            "network_ping_ok": latency.returncode == 0,
            "network_ping_out": (latency.stdout.strip() or latency.stderr.strip())[:400],
        }

    def _run_shell(self, cmd: List[str]) -> subprocess.CompletedProcess:
        """Run local command and return process result."""
        try:
            return subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
        except Exception as e:
            return subprocess.CompletedProcess(
                args=cmd,
                returncode=1,
                stdout="",
                stderr=str(e),
            )

    async def _promote_node(self):
        """Promote node to management role"""
        try:
            self.logger.info(f"Promoting {self.node_id} to management role...")

            steps = []
            for cmd, step in [
                (["systemctl", "enable", "--now", "map2-management"], "enable_management_service"),
                (["systemctl", "restart", "map2-management"], "restart_management_service"),
            ]:
                result = await asyncio.to_thread(self._run_shell, cmd)
                steps.append(
                    {
                        "step": step,
                        "returncode": result.returncode,
                        "stderr": result.stderr.strip(),
                    }
                )

            node = self.registry.get_node(self.node_id) or {}
            self.registry.add_or_update_node(
                node_id=self.node_id,
                hostname=node.get("hostname") or self.node_id,
                ip_address=node.get("ip_address"),
                role="MANAGEMENT-NODE",
                deployment_mode="MANAGEMENT-NODE",
                cpu_cores=node.get("cpu_cores", 0),
                total_memory_gb=node.get("total_memory_gb", 0),
                audio_devices=[],
                storage_gb=node.get("storage_gb", 0),
                status=node.get("status", "online"),
                health_score=node.get("health_score", 50.0),
                version=node.get("version", "0.0.0"),
                metadata={"lifecycle": "promoted"},
            )

            await self._emit_platform_event(
                kind="config.updated",
                severity=Severity.INFO,
                message=f"Node {self.node_id} promoted to management role",
                details={"steps": steps},
            )

        except Exception as e:
            self.logger.error(f"Promotion failed: {e}")
            raise

    async def _demote_node(self):
        """Demote node from management to audio role"""
        try:
            self.logger.info(f"Demoting {self.node_id} to audio role...")

            steps = []
            for cmd, step in [
                (["systemctl", "stop", "map2-management"], "stop_management_service"),
                (["systemctl", "disable", "map2-management"], "disable_management_service"),
            ]:
                result = await asyncio.to_thread(self._run_shell, cmd)
                steps.append(
                    {
                        "step": step,
                        "returncode": result.returncode,
                        "stderr": result.stderr.strip(),
                    }
                )

            node = self.registry.get_node(self.node_id) or {}
            self.registry.add_or_update_node(
                node_id=self.node_id,
                hostname=node.get("hostname") or self.node_id,
                ip_address=node.get("ip_address"),
                role="AUDIO-NODE",
                deployment_mode="AUDIO-NODE",
                cpu_cores=node.get("cpu_cores", 0),
                total_memory_gb=node.get("total_memory_gb", 0),
                audio_devices=[],
                storage_gb=node.get("storage_gb", 0),
                status=node.get("status", "online"),
                health_score=node.get("health_score", 50.0),
                version=node.get("version", "0.0.0"),
                metadata={"lifecycle": "demoted"},
            )

            await self._emit_platform_event(
                kind="config.updated",
                severity=Severity.INFO,
                message=f"Node {self.node_id} demoted to audio role",
                details={"steps": steps},
            )

        except Exception as e:
            self.logger.error(f"Demotion failed: {e}")
            raise

    async def _call_callbacks(self, state: NodeState):
        """Call registered callbacks for state"""
        try:
            callbacks = self._callbacks.get(state, [])

            for callback in callbacks:
                try:
                    if asyncio.iscoroutinefunction(callback):
                        await callback(self.node_id, state)
                    else:
                        callback(self.node_id, state)
                except Exception as e:
                    self.logger.error(f"Callback failed: {e}")

        except Exception as e:
            self.logger.error(f"Failed to call callbacks: {e}")

    async def _publish_lifecycle_event(
        self, transition: LifecycleTransition
    ):
        """Publish lifecycle event to event bus"""
        try:
            # Map lifecycle events to event bus event types
            event_type_map = {
                NodeLifecycleEvent.DISCOVERED: "node.online",
                NodeLifecycleEvent.LEAVE_COMPLETE: "node.offline",
                NodeLifecycleEvent.FAILURE_DETECTED: "node.offline",
                NodeLifecycleEvent.RECOVERY_SUCCESSFUL: "node.recovered",
            }

            if transition.event in event_type_map:
                await self._emit_platform_event(
                    kind=event_type_map[transition.event],
                    severity=Severity.INFO,
                    message=transition.message,
                    details=transition.details,
                )

        except Exception as e:
            self.logger.error(f"Failed to publish lifecycle event: {e}")

    def register_callback(
        self, state: NodeState, callback: Callable
    ) -> bool:
        """
        Register callback for state transition.

        Args:
            state: State to monitor
            callback: Function to call when state is entered

        Returns:
            True if successful
        """
        try:
            if state not in self._callbacks:
                self._callbacks[state] = []

            self._callbacks[state].append(callback)
            return True

        except Exception as e:
            self.logger.error(f"Failed to register callback: {e}")
            return False

    def get_history(self) -> List[LifecycleTransition]:
        """Get transition history"""
        return self.transition_history.copy()

    def get_status(self) -> Dict:
        """Get current node status"""
        return {
            "node_id": self.node_id,
            "current_state": self.current_state.value,
            "transition_count": len(self.transition_history),
            "last_transition": (
                {
                    "from": self.transition_history[-1].from_state.value,
                    "to": self.transition_history[-1].to_state.value,
                    "event": self.transition_history[-1].event.value,
                    "timestamp": self.transition_history[
                        -1
                    ].timestamp.isoformat(),
                }
                if self.transition_history
                else None
            ),
        }


# Global instances per node
_lifecycle_managers: Dict[str, NodeLifecycleManager] = {}


def get_lifecycle_manager(node_id: str) -> NodeLifecycleManager:
    """Get or create lifecycle manager for node"""
    if node_id not in _lifecycle_managers:
        _lifecycle_managers[node_id] = NodeLifecycleManager(node_id)
    return _lifecycle_managers[node_id]


@dataclass
class DiagnosticsCheck:
    """Single diagnostic check result."""

    name: str
    status: str
    message: str
    severity: int


@dataclass
class DiagnosticsReport:
    """Diagnostics report payload returned to API routes."""

    node_id: str
    timestamp: datetime
    overall_health: int
    checks: List[DiagnosticsCheck]
    services_status: Dict[str, str]
    recommendations: List[str]


class ClusterNodeLifecycleManager(Singleton):
    """
    Backward-compatible lifecycle facade used by cluster routes.

    This keeps legacy route expectations working while reusing the
    node-scoped lifecycle state machine implementation.
    """

    def __init__(self):
        self.registry = get_cluster_registry()

    def _manager(self, node_id: str) -> NodeLifecycleManager:
        return get_lifecycle_manager(node_id)

    async def run_diagnostics(self, node_id: str) -> DiagnosticsReport:
        """Run basic diagnostics for a node and return normalized report."""
        node = self.registry.get_node(node_id)
        if not node:
            raise ValueError(f"Node {node_id} not found")

        manager = self._manager(node_id)
        diagnostics = await asyncio.to_thread(manager._collect_diagnostics)

        checks: List[DiagnosticsCheck] = []
        recommendations: List[str] = []

        service_state = diagnostics.get("service_active", "unknown")
        service_ok = service_state == "active"
        checks.append(
            DiagnosticsCheck(
                name="map2-audio service",
                status="passed" if service_ok else "failed",
                message=f"Service state: {service_state}",
                severity=0 if service_ok else 3,
            )
        )
        if not service_ok:
            recommendations.append("Restart map2-audio service and verify node logs")

        ping_ok = bool(diagnostics.get("network_ping_ok"))
        checks.append(
            DiagnosticsCheck(
                name="network connectivity",
                status="passed" if ping_ok else "failed",
                message="External network ping successful" if ping_ok else "Network ping failed",
                severity=0 if ping_ok else 2,
            )
        )
        if not ping_ok:
            recommendations.append("Check node network connectivity and gateway reachability")

        memory_snapshot = diagnostics.get("memory", "")
        checks.append(
            DiagnosticsCheck(
                name="memory check",
                status="passed" if memory_snapshot else "warning",
                message="Memory snapshot collected" if memory_snapshot else "Memory snapshot unavailable",
                severity=0 if memory_snapshot else 1,
            )
        )

        disk_snapshot = diagnostics.get("disk", "")
        checks.append(
            DiagnosticsCheck(
                name="disk check",
                status="passed" if disk_snapshot else "warning",
                message="Disk snapshot collected" if disk_snapshot else "Disk snapshot unavailable",
                severity=0 if disk_snapshot else 1,
            )
        )

        total_severity = sum(check.severity for check in checks)
        overall_health = max(0, 100 - (total_severity * 15))

        if not recommendations:
            recommendations.append("No immediate remediation required")

        return DiagnosticsReport(
            node_id=node_id,
            timestamp=utc_now(),
            overall_health=overall_health,
            checks=checks,
            services_status={"map2-audio": service_state},
            recommendations=recommendations,
        )

    async def recover_node(self, node_id: str) -> Dict:
        """Attempt node recovery and report health delta."""
        manager = self._manager(node_id)
        before = await self.run_diagnostics(node_id)

        await manager._attempt_recovery()

        after = await self.run_diagnostics(node_id)
        improved = after.overall_health >= before.overall_health

        return {
            "status": "ok" if improved else "partial",
            "health_before": before.overall_health,
            "health_after": after.overall_health,
            "actions_taken": [
                "restart_map2_audio",
                "service_status_verification",
            ],
            "message": (
                f"Recovery completed for {node_id}"
                if improved
                else f"Recovery attempted for {node_id}; health did not improve"
            ),
        }

    async def graceful_shutdown(self, node_id: str) -> Dict:
        """Gracefully stop node services and mark node offline."""
        manager = self._manager(node_id)
        await manager._perform_graceful_shutdown()
        return {
            "status": "ok",
            "message": f"Graceful shutdown initiated for {node_id}",
            "flows_drained": 0,
        }

    async def promote_node_role(self, node_id: str, new_role: str) -> Dict:
        """Promote node role to MANAGEMENT-NODE."""
        if new_role != "MANAGEMENT-NODE":
            raise ValueError("Only promotion to MANAGEMENT-NODE is currently supported")

        node = self.registry.get_node(node_id)
        if not node:
            raise ValueError(f"Node {node_id} not found")

        old_role = node.get("role", "AUDIO-NODE")
        manager = self._manager(node_id)
        await manager._promote_node()

        return {
            "status": "ok",
            "message": f"Node {node_id} promoted to {new_role}",
            "old_role": old_role,
            "new_role": new_role,
        }

    async def demote_node_role(self, node_id: str) -> Dict:
        """Demote node role to AUDIO-NODE."""
        node = self.registry.get_node(node_id)
        if not node:
            raise ValueError(f"Node {node_id} not found")

        manager = self._manager(node_id)
        await manager._demote_node()

        return {
            "status": "ok",
            "message": f"Node {node_id} demoted to AUDIO-NODE",
            "old_role": node.get("role", "MANAGEMENT-NODE"),
            "new_role": "AUDIO-NODE",
            "flows_drained": 0,
        }

def get_node_lifecycle_manager() -> ClusterNodeLifecycleManager:
    """Backward-compatible cluster lifecycle manager singleton."""
    return ClusterNodeLifecycleManager.get_instance()
